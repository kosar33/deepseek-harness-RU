import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type {
  CredentialInfo, CredentialKey, CredentialRecord, CredentialRecordEntry, CredentialRecordInfo,
  CredentialRef, ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import type { MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SettingsProvider, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import * as KeyRotation from '../src/index.ts'
import type { Config as RotationConfig } from '../src/config.ts'

const NS = settingsNamespace('llm-key-rotation')

let home: string | undefined
let context: Context | undefined
const servers: MockLlmServer[] = []
const agentErrors: unknown[] = []

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  await Promise.all(servers.splice(0).map(server => server.close()))
  if (home !== undefined) await rm(home, { recursive: true, force: true })
  home = undefined
  agentErrors.length = 0
})

/** In-memory settings provider carrying the user document the editor writes. */
class MemorySettings extends SettingsProvider {
  private readonly doc = new Map<string, Record<string, unknown>>()

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(Object.fromEntries(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc.set(ns, structuredClone(section))
    return Promise.resolve()
  }
}

/**
 * Credential seam whose resolution can be held mid-flight, so a route
 * withdrawal racing a dispatched request can be staged deterministically.
 */
class GatedCredentialProvider extends CredentialProvider {
  private readonly values = new Map<string, string>()
  /** Held while non-null: every resolve waits for its release. */
  private static hold: PromiseWithResolvers<void> | null = null
  private static entered = false
  private static enteredSignal: PromiseWithResolvers<void> = Promise.withResolvers()

  /** Arm one held-resolve window and return its entry promise and release. */
  static arm(): { entered: Promise<void>; release: () => void } {
    GatedCredentialProvider.hold = Promise.withResolvers()
    return {
      entered: GatedCredentialProvider.enteredSignal.promise,
      release: () => { GatedCredentialProvider.hold?.resolve() },
    }
  }

  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    if (!GatedCredentialProvider.entered) {
      GatedCredentialProvider.entered = true
      GatedCredentialProvider.enteredSignal.resolve()
    }
    const hold = GatedCredentialProvider.hold
    const value = this.values.get(ref)
    if (hold === null) return Promise.resolve(value === undefined ? undefined : { value, source: 'file' })
    return hold.promise.then(() => value === undefined ? undefined : { value, source: 'file' })
  }

  describe(ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: this.values.has(ref), ...this.values.has(ref) ? { source: 'file' } : {}, writable: true })
  }

  set(ref: CredentialRef, value: string): Promise<void> {
    this.values.set(ref, value)
    return Promise.resolve()
  }

  unset(ref: CredentialRef): Promise<void> {
    this.values.delete(ref)
    return Promise.resolve()
  }

  readRecord(): Promise<CredentialRecord | undefined> {
    return Promise.resolve(undefined)
  }

  describeRecord(): Promise<CredentialRecordInfo> {
    return Promise.resolve({ configured: false, writable: true })
  }

  listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return Promise.resolve([])
  }

  modifyRecord(
    _key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    return mutate(undefined)
  }

  deleteRecord(): Promise<void> {
    return Promise.resolve()
  }
}

async function writeCredentials(entries: Record<string, string>): Promise<string> {
  home ??= await mkdtemp(join(tmpdir(), 'dsh-key-rotation-settings-'))
  const path = join(home, '.credentials.yaml')
  const refs = Object.entries(entries).map(([name, value]) => `  ${name}: ${value}`)
  await writeFile(path, ['version: 1', 'refs:', ...refs, ''].join('\n'), { mode: 0o600 })
  return path
}

async function boot(options: {
  config: RotationConfig
  credentialPath?: string
  credentialsPlugin?: typeof LocalCredentialProvider | typeof GatedCredentialProvider
}): Promise<Context> {
  home ??= await mkdtemp(join(tmpdir(), 'dsh-key-rotation-settings-'))
  const ctx = new Context()
  context = ctx
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(MemorySettings)
  const credentialPlugin = options.credentialsPlugin ?? LocalCredentialProvider
  await ctx.plugin(credentialPlugin, { path: options.credentialPath ?? join(home, '.credentials.yaml'), watch: false })
  await ctx.plugin(KeyRotation, {
    ...(options.config.providers === undefined ? {} : { providers: options.config.providers }),
    ...(options.config.dshHome === undefined ? {} : { dshHome: options.config.dshHome }),
    parkFile: join(home, '.llm-key-rotation-parks.json'),
  })
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.on('agent/error', ({ error }) => { agentErrors.push(error) })
  return ctx
}

function route(serverURL: string, refs: string[]): NonNullable<RotationConfig['providers']> {
  return {
    openrouter: {
      api: 'openai-completions',
      baseURL: serverURL,
      models: [{ id: 'mock-model', name: 'Mock Model', contextWindow: 8192 }],
      keys: refs.map(apiKeyEnv => ({ apiKeyEnv })),
    },
  }
}

async function sendAndWait(ctx: Context, name: string): Promise<void> {
  const agent = ctx.agentLoop.create(SessionId(name), { provider: 'openrouter', model: 'mock-model' })
  const idle = agent.whenIdle()
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: 'rotate across the pool' }],
    source: { kind: 'user' },
  }))
  await idle
}

describe('settings-section configuration', () => {
  it('activates a route the moment the section commits and serves a request through it', { timeout: 20_000 }, async () => {
    const server = await startMockLlmServer({ sequence: ['success'] })
    servers.push(server)
    const path = await writeCredentials({ OPENROUTER_KEYROTATION_1: 'stored-k1' })
    const ctx = await boot({ credentialPath: path, config: {} })

    expect(ctx.llm.listProviders()).toEqual([])
    // Exactly what the web editor writes: credential values land in the
    // credential store, and the settings section records references only.
    await ctx.settings.update(NS, { providers: route(server.baseURL, ['OPENROUTER_KEYROTATION_1']) })
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(entry => entry.id)).toEqual(['openrouter'])
    })

    const face = ctx.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState
    expect(face.snapshot()).toEqual([{
      provider: 'openrouter',
      activeLabel: 'OPENROUTER_KEYROTATION_1',
      keys: [{
        provider: 'openrouter',
        label: 'OPENROUTER_KEYROTATION_1',
        source: 'reference',
        reference: 'OPENROUTER_KEYROTATION_1',
        status: { state: 'usable' },
      }],
    }])
    await sendAndWait(ctx, 'activated-by-section')
    expect(server.requests.map(request => request.headers.authorization)).toEqual(['Bearer stored-k1'])
  })

  it('reattaches persisted parks across a reorder rebuild and keeps the spare sticky', { timeout: 20_000 }, async () => {
    const server = await startMockLlmServer({ sequence: ['success'] })
    servers.push(server)
    const path = await writeCredentials({ OPENROUTER_A: 'a', OPENROUTER_B: 'b' })
    const ctx = await boot({
      credentialPath: path,
      config: { providers: route(server.baseURL, ['OPENROUTER_A', 'OPENROUTER_B']) },
    })
    // A live park from an earlier session: OPENROUTER_A is out until reset.
    await writeFile(
      join(home!, '.llm-key-rotation-parks.json'),
      `${JSON.stringify({ version: 1, parks: [{
        route: 'openrouter',
        label: 'OPENROUTER_A',
        parkedAt: Date.now(),
        resetAt: Date.now() + 60_000,
      }] }, null, 2)}\n`,
      'utf8',
    )

    // The editor's reorder write: B moves ahead of A. The rebuilt pool keeps
    // A parked, so serving starts past it even though B now sits at index 0.
    await ctx.settings.update(NS, {
      providers: route(server.baseURL, ['OPENROUTER_B', 'OPENROUTER_A']),
    })
    await vi.waitFor(() => {
      const face = ctx.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState
      expect(face.snapshot()[0]?.activeLabel).toBe('OPENROUTER_B')
    })
    const face = ctx.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState
    const statuses = face.snapshot()[0]!.keys.map(key => key.status.state)
    expect(statuses).toEqual(['usable', 'parked'])
  })

  it('refuses an unserviceable section at write time and logs a loud refusal on a route conflict', async () => {
    const ctx = await boot({ config: {} })

    // Schema-valid but unserviceable: the write itself rejects.
    await expect(ctx.settings.update(NS, { providers: { openrouter: { keys: [] } } }))
      .rejects.toThrow(/must list at least one key/)

    // A live route another adapter owns cannot be taken over: the candidate is
    // refused loud and nothing registers.
    class Foreign extends LlmAdapter {
      override async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: 'foreign' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'foreign' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
    ctx.llm.registerAdapter(['taken'], new Foreign())
    const errorSpy = vi.spyOn(ctx.logger, 'error')
    await ctx.settings.update(NS, {
      providers: {
        taken: {
          api: 'openai-completions',
          baseURL: 'https://taken.example/api/v1',
          models: [{ id: 'm', name: 'M', contextWindow: 8192 }],
          keys: [{ value: 'k' }],
        },
      },
    })
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('llm-key-rotation: keeping the previously registered routes after a refused update')
    })
    expect(ctx.llm.listProviders().map(entry => entry.id)).toEqual(['taken'])
    expect((ctx.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState).snapshot()).toEqual([])
  })

  it('fails a request already dispatched across a route-withdrawing rebuild', { timeout: 20_000 }, async () => {
    const server = await startMockLlmServer({ sequence: ['success'] })
    servers.push(server)
    const path = await writeCredentials({ OPENROUTER_KEYROTATION_1: 'k1' })
    // The route lives in the settings user layer, exactly as after a first
    // save from the web editor: only user-layer routes can be withdrawn,
    // because removal restores the composition base.
    const ctx = await boot({
      credentialPath: path,
      config: {},
      credentialsPlugin: GatedCredentialProvider,
    })
    await ctx.settings.update(NS, { providers: route(server.baseURL, ['OPENROUTER_KEYROTATION_1']) })
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(entry => entry.id)).toEqual(['openrouter'])
    })

    // Hold credential resolution mid-request, withdraw the route behind it,
    // then release: the in-flight dispatch finds no pool left and fails loud.
    const { entered, release } = GatedCredentialProvider.arm()
    const pending = sendAndWait(ctx, 'withdrawn-mid-flight')
    await entered
    await ctx.settings.mutate(NS, [{ op: 'unset', path: ['providers', 'openrouter'] }])
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders()).toEqual([])
    })
    release()
    await pending

    expect(agentErrors).toHaveLength(1)
    expect((agentErrors[0] as Error).message).toContain('changed while a request was in flight')
  })

  it('rebuilds a two-route section with names sorted for change detection', async () => {
    const ctx = await boot({ config: {} })
    expect(ctx.llm.listProviders()).toEqual([])

    // Dict order deliberately reversed relative to the names: change
    // detection sorts provider names, so this write exercises the comparator.
    const providers: NonNullable<RotationConfig['providers']> = {
      zulu: {
        api: 'openai-completions',
        baseURL: 'https://zulu.example/api/v1',
        models: [{ id: 'mock-model', name: 'Mock Model', contextWindow: 8192 }],
        keys: [{ value: 'k-z' }],
      },
      alpha: {
        api: 'openai-completions',
        baseURL: 'https://alpha.example/api/v1',
        models: [{ id: 'mock-model', name: 'Mock Model', contextWindow: 8192 }],
        keys: [{ value: 'k-a' }],
      },
    }
    await ctx.settings.update(NS, { providers })
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(entry => entry.id).sort()).toEqual(['alpha', 'zulu'])
    })
    const face = ctx.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState
    expect(face.snapshot().map(routeSnapshot => routeSnapshot.provider).sort()).toEqual(['alpha', 'zulu'])
  })

  it('fails a prepared call dispatched after its route was withdrawn', async () => {
    const path = await writeCredentials({ OPENROUTER_KEYROTATION_1: 'k1' })
    // No mock server: serving must refuse before any credential is resolved.
    const ctx = await boot({ credentialPath: path, config: {} })
    // The route lives in the settings user layer, exactly as after a first
    // save from the web editor.
    await ctx.settings.update(NS, {
      providers: route('https://openrouter.example/api/v1', ['OPENROUTER_KEYROTATION_1']),
    })
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(entry => entry.id)).toEqual(['openrouter'])
    })

    // Bind one dispatch to the pre-withdrawal registration...
    const prepared = await ctx.llm.prepareCall({ provider: 'openrouter', model: 'mock-model' })
    // ...withdraw the route behind the held dispatch...
    await ctx.settings.mutate(NS, [{ op: 'unset', path: ['providers', 'openrouter'] }])
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders()).toEqual([])
    })
    // ...and dispatch: serving refuses loud instead of authenticating against
    // a configuration that no longer exists.
    const chunks: StreamChunk[] = []
    for await (const chunk of prepared.stream({ ...prepared.config, messages: [] })) chunks.push(chunk)
    const finish = chunks.at(-1)
    expect(finish?.type).toBe('finish')
    expect(finish !== undefined && finish.type === 'finish' && finish.reason.kind === 'error'
      && finish.reason.failure.message.includes('was withdrawn while a request was in flight')).toBe(true)
    expect(agentErrors).toEqual([])
  })
})

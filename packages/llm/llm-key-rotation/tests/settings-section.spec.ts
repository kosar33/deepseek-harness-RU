import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmApiKeyOverride, StreamChunk } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type {
  CredentialInfo, CredentialKey, CredentialRecord, CredentialRecordEntry, CredentialRecordInfo,
  CredentialRef, ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SettingsProvider, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import * as KeyRotation from '../src/index.ts'
import type { Config as RotationConfig, LlmKeyRotationState } from '../src/index.ts'
import { PARK_STATE_FILENAME } from '../src/park-store.ts'

const NS = settingsNamespace('llm-key-rotation')

let home: string | undefined
let context: Context | undefined
const agentErrors: unknown[] = []

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (home !== undefined) await rm(home, { recursive: true, force: true })
  home = undefined
  agentErrors.length = 0
  vi.unstubAllEnvs()
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
 * withdrawal racing an override resolve can be staged deterministically.
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

/** Test-registered adapter honoring the consumer half of the override contract. */
class ScriptedAdapter extends LlmAdapter {
  readonly servedKeys: string[] = []

  constructor(
    private readonly ctx: Context,
    private readonly nativeEnv?: string,
  ) {
    super()
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const override = this.ctx.get('llmApiKeyOverride') as LlmApiKeyOverride | undefined
    const rotated = await override?.resolve(options.provider)
    const key = rotated ?? (this.nativeEnv === undefined ? undefined : process.env[this.nativeEnv])
    if (key !== undefined) this.servedKeys.push(key)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'served' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'served' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function boot(options: {
  composition?: RotationConfig['providers']
  credentialEntries?: Record<string, string>
  credentialsPlugin?: typeof LocalCredentialProvider | typeof GatedCredentialProvider
  nativeEnv?: string
}): Promise<{ ctx: Context; adapter: ScriptedAdapter }> {
  home ??= await mkdtemp(join(tmpdir(), 'dsh-key-rotation-settings-'))
  const ctx = new Context()
  context = ctx
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(MemorySettings)
  if (options.credentialEntries !== undefined) {
    const path = join(home, '.credentials.yaml')
    const refs = Object.entries(options.credentialEntries).map(([name, value]) => `  ${name}: ${value}`)
    await writeFile(path, ['version: 1', 'refs:', ...refs, ''].join('\n'), { mode: 0o600 })
  }
  const credentialPlugin = options.credentialsPlugin ?? LocalCredentialProvider
  await ctx.plugin(credentialPlugin, { path: join(home, '.credentials.yaml'), watch: false })
  await ctx.plugin(KeyRotation, {
    ...(options.composition === undefined ? {} : { providers: options.composition }),
    parkFile: join(home, PARK_STATE_FILENAME),
  })
  const adapter = new ScriptedAdapter(ctx, options.nativeEnv)
  ctx.llm.registerAdapter(['openrouter'], adapter)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.on('agent/error', ({ error }) => { agentErrors.push(error) })
  return { ctx, adapter }
}

function keysRoute(refs: string[]): NonNullable<RotationConfig['providers']> {
  return {
    openrouter: {
      keys: refs.map(apiKeyEnv => ({ apiKeyEnv })),
    },
  }
}

function stateFace(ctx: Context): LlmKeyRotationState {
  return ctx.get('llmKeyRotation') as LlmKeyRotationState
}

function overrideFace(ctx: Context): LlmApiKeyOverride {
  return ctx.get('llmApiKeyOverride') as LlmApiKeyOverride
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
  it('activates a pool the moment the section commits and serves requests through it', async () => {
    const { ctx, adapter } = await boot({ credentialEntries: { OPENROUTER_KEYROTATION_1: 'stored-k1' } })

    // Exactly what the web editor writes: credential values land in the
    // credential store, and the settings section records references only.
    await ctx.settings.update(NS, { providers: keysRoute(['OPENROUTER_KEYROTATION_1']) })
    await vi.waitFor(() => {
      expect(stateFace(ctx).snapshot().map(routeSnapshot => routeSnapshot.activeLabel))
        .toEqual(['OPENROUTER_KEYROTATION_1'])
    })
    await expect(overrideFace(ctx).resolve('openrouter')).resolves.toBe('stored-k1')

    await sendAndWait(ctx, 'activated-by-section')
    expect(adapter.servedKeys).toEqual(['stored-k1'])
  })

  it('reattaches persisted parks across a reorder rebuild and keeps the spare sticky', async () => {
    const { ctx } = await boot({
      credentialEntries: { OPENROUTER_A: 'a', OPENROUTER_B: 'b' },
      composition: keysRoute(['OPENROUTER_A', 'OPENROUTER_B']),
    })
    // A live park from an earlier session: OPENROUTER_A is out until reset.
    await writeFile(
      join(home!, PARK_STATE_FILENAME),
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
    await ctx.settings.update(NS, { providers: keysRoute(['OPENROUTER_B', 'OPENROUTER_A']) })
    await vi.waitFor(() => {
      expect(stateFace(ctx).snapshot()[0]?.activeLabel).toBe('OPENROUTER_B')
    })
    const statuses = stateFace(ctx).snapshot()[0]!.keys.map(key => key.status.state)
    expect(statuses).toEqual(['usable', 'parked'])
  })

  it('refuses an unserviceable section at write time and keeps unserved routes inert', async () => {
    const { ctx } = await boot({})

    // Schema-invalid key list: the write itself rejects.
    await expect(ctx.settings.update(NS, { providers: { openrouter: { keys: [] } } }))
      .rejects.toThrow(/must list at least one key/)

    // A pool for a route NO family serves is accepted — rotation registers
    // nothing, so there is no conflict to refuse — but stays inert. The
    // registry keeps exactly the route the test-registered family owns.
    await ctx.settings.update(NS, { providers: { ghost: { keys: [{ value: 'k' }] } } })
    await vi.waitFor(() => {
      expect(stateFace(ctx).snapshot().map(routeSnapshot => routeSnapshot.provider)).toEqual(['ghost'])
    })
    expect(ctx.llm.listProviders().map(entry => entry.id)).toEqual(['openrouter'])
    await expect(overrideFace(ctx).resolve('ghost')).resolves.toBe('k')
    // The served route keeps no pool: its consumer falls through natively.
    await expect(overrideFace(ctx).resolve('openrouter')).resolves.toBeUndefined()
  })

  it('fails a resolve already in flight across a route-withdrawing rebuild', async () => {
    const { ctx } = await boot({
      credentialEntries: { OPENROUTER_KEYROTATION_1: 'k1' },
      credentialsPlugin: GatedCredentialProvider,
    })
    await ctx.settings.update(NS, { providers: keysRoute(['OPENROUTER_KEYROTATION_1']) })
    await vi.waitFor(() => {
      expect(stateFace(ctx).snapshot()).toHaveLength(1)
    })

    // Hold credential resolution mid-resolve, withdraw the route behind it,
    // then release: the in-flight resolve refuses loud instead of serving a
    // configuration that no longer exists.
    const { entered, release } = GatedCredentialProvider.arm()
    const pending = overrideFace(ctx).resolve('openrouter')
    await entered
    await ctx.settings.mutate(NS, [{ op: 'unset', path: ['providers', 'openrouter'] }])
    await vi.waitFor(() => {
      expect(stateFace(ctx).snapshot()).toEqual([])
    })
    release()
    await expect(pending).rejects.toThrow(/changed while a request was in flight/)
  })

  it('commits a two-route section and treats reordered-but-equal writes as no-ops', async () => {
    const { ctx } = await boot({})

    // Dict order deliberately reversed relative to the names: change
    // detection sorts provider names, so this write exercises the comparator.
    const providers: NonNullable<RotationConfig['providers']> = {
      zulu: { keys: [{ value: 'k-z', label: 'zulu-key' }] },
      alpha: { keys: [{ value: 'k-a', label: 'alpha-key' }] },
    }
    await ctx.settings.update(NS, { providers })
    await vi.waitFor(() => {
      expect(stateFace(ctx).snapshot().map(routeSnapshot => routeSnapshot.provider).sort())
        .toEqual(['alpha', 'zulu'])
    })
    await expect(overrideFace(ctx).resolve('alpha')).resolves.toBe('k-a')
    await expect(overrideFace(ctx).resolve('zulu')).resolves.toBe('k-z')

    // The same facts written back in sorted order must not disturb the pools:
    // change detection canonicalizes by sorted name before comparing.
    await ctx.settings.update(NS, { providers: { alpha: providers.alpha!, zulu: providers.zulu! } })
    expect(stateFace(ctx).snapshot().map(routeSnapshot => routeSnapshot.activeLabel).sort())
      .toEqual(['alpha-key', 'zulu-key'])
  })

  it('falls through to the family\'s native resolution once the section withdraws the pool', async () => {
    vi.stubEnv('OPENROUTER_NATIVE', 'native-k')
    const { ctx, adapter } = await boot({
      credentialEntries: { UNUSED: 'x' },
      nativeEnv: 'OPENROUTER_NATIVE',
    })
    await ctx.settings.update(NS, { providers: { openrouter: { keys: [{ value: 'lit-k1' }] } } })
    // The rebuild swaps pools asynchronously; wait until the face reflects it.
    await vi.waitFor(() => {
      expect(stateFace(ctx).snapshot()).toHaveLength(1)
    })
    await sendAndWait(ctx, 'rotated-then-native')
    expect(adapter.servedKeys).toEqual(['lit-k1'])

    await ctx.settings.mutate(NS, [{ op: 'unset', path: ['providers', 'openrouter'] }])
    await vi.waitFor(() => {
      expect(stateFace(ctx).snapshot()).toEqual([])
    })
    await sendAndWait(ctx, 'after-withdrawal')
    expect(adapter.servedKeys).toEqual(['lit-k1', 'native-k'])
  })

  it('keeps the previous pools after a rebuild candidate fails on its park document', async () => {
    const { ctx } = await boot({
      credentialEntries: { OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' },
      composition: keysRoute(['OPENROUTER_KEY_1']),
    })
    const errorSpy = vi.spyOn(ctx.logger, 'error').mockImplementation(() => undefined)
    // A corrupt document passes the section validator (which sees only the
    // providers dict) and fails the rebuild's park restore.
    await writeFile(join(home!, PARK_STATE_FILENAME), '{ not json', 'utf8')
    await ctx.settings.update(NS, { providers: keysRoute(['OPENROUTER_KEY_1', 'OPENROUTER_KEY_2']) })

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('llm-key-rotation: keeping the previous pools after a refused update')
    })
    // The previous single-key pool still serves.
    await expect(overrideFace(ctx).resolve('openrouter')).resolves.toBe('k1')
    expect(stateFace(ctx).snapshot()[0]!.keys).toHaveLength(1)
  })
})

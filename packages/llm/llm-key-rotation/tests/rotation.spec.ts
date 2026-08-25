import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmApiKeyOverride, ResolvedRetryPolicy, StreamChunk } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import * as Retry from '@deepseek-ai/dsh-llm-retry'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as KeyRotation from '../src/index.ts'
import type { LlmKeyRotationState } from '../src/index.ts'
import type { Config as RotationConfig, RotationKeyConfig } from '../src/config.ts'

const MOCK_TEXT = 'mock response recovered'

/** A fast deterministic policy so delegation cases never wait real backoff. */
const FAST_RETRY_POLICY: ResolvedRetryPolicy = Object.freeze({
  mode: 'normal',
  maxRetries: 3,
  retryableCodes: Object.freeze(['RATE_LIMIT', 'SERVER']),
  initialDelayMs: 1,
  maxDelayMs: 1,
  jitterRatio: 0,
})

/**
 * Test-registered adapter standing in for a plain adapter family. It honors
 * the consumer half of the new contract exactly as dsh-llm-pi-ai and
 * dsh-llm-deepseek do: consult `ctx.get('llmApiKeyOverride')` first and use
 * its key when defined; `undefined` falls through to native resolution
 * (emulated here by reading `nativeEnv` from the environment). The plugin
 * itself registers no adapter, so this file owns every registration.
 */
class ScriptedAdapter extends LlmAdapter {
  /** Every key actually used to authenticate an attempt, in order. */
  readonly servedKeys: string[] = []
  private attempts = 0

  constructor(
    private readonly ctx: Context,
    private readonly steps: readonly ('rate_limit' | 'server_error' | 'upstream_limit' | 'provider_returned' | 'success')[],
    private readonly nativeEnv?: string,
  ) {
    super()
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return FAST_RETRY_POLICY
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const step = this.steps[this.attempts] ?? 'success'
    this.attempts += 1
    const override = this.ctx.get('llmApiKeyOverride') as LlmApiKeyOverride | undefined
    const rotated = await override?.resolve(options.provider)
    const key = rotated ?? (this.nativeEnv === undefined ? undefined : process.env[this.nativeEnv])
    if (key !== undefined) this.servedKeys.push(key)
    if (step === 'rate_limit' || step === 'server_error' || step === 'upstream_limit' || step === 'provider_returned') {
      // The upstream_limit step carries OpenRouter's flattened shared-pool 429
      // body verbatim — pi-ai reduces the wire error to exactly this text.
      // The provider_returned step is the bare vendor-relay phrase the same
      // gateway ships when its upstream fails without any shared-pool marker.
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            message: step === 'upstream_limit'
              ? '429: {"message":"Provider returned error","code":429,"metadata":{"raw":"stealth is temporarily'
                + ' rate-limited upstream. Please retry shortly.","provider_name":"Stealth","is_byok":false,'
                + '"limit_source":"upstream_provider_shared_pool","remedy_hint":"Retry shortly"}}'
              : step === 'provider_returned'
                ? '502: {"error":{"message":"Provider returned error","code":502}}'
                : `${step} strike`,
            code: step === 'server_error' || step === 'provider_returned' ? 'SERVER' : 'RATE_LIMIT',
          },
        },
      }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: MOCK_TEXT }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: MOCK_TEXT } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

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

async function writeCredentials(entries: Record<string, string>): Promise<string> {
  home = await mkdtemp(join(tmpdir(), 'dsh-key-rotation-'))
  const path = join(home, '.credentials.yaml')
  const refs = Object.entries(entries).map(([name, value]) => `  ${name}: ${value}`)
  await writeFile(path, ['version: 1', 'refs:', ...refs, ''].join('\n'), { mode: 0o600 })
  return path
}

async function boot(options: {
  providers?: RotationConfig['providers']
  credentialPath?: string
  steps?: readonly ('rate_limit' | 'server_error' | 'upstream_limit' | 'provider_returned' | 'success')[]
  nativeEnv?: string
  route?: string
  registerForeign?: boolean
  registerAdapter?: boolean
  retryMount?: 'before' | 'after'
}): Promise<{ ctx: Context; adapter: ScriptedAdapter }> {
  // Every mount gets its own park-state location so tests never touch the
  // real harness home.
  home ??= await mkdtemp(join(tmpdir(), 'dsh-key-rotation-'))
  const ctx = new Context()
  context = ctx
  await mountAgentLoopTestDependencies(ctx)
  if (options.credentialPath !== undefined) {
    await ctx.plugin(LocalCredentialProvider, { path: options.credentialPath, watch: false })
  }
  if (options.retryMount === 'before') await ctx.plugin(Retry)
  const rotationConfig: RotationConfig = { parkFile: join(home, '.llm-key-rotation-parks.json') }
  if (options.providers !== undefined) rotationConfig.providers = options.providers
  await ctx.plugin(KeyRotation, rotationConfig)
  if (options.retryMount !== 'before') await ctx.plugin(Retry)
  const adapter = new ScriptedAdapter(ctx, options.steps ?? ['success'], options.nativeEnv)
  if (options.registerAdapter !== false) {
    ctx.llm.registerAdapter([options.route ?? 'openrouter'], adapter)
  }
  if (options.registerForeign === true) {
    ctx.llm.registerAdapter(['other'], new ScriptedAdapter(ctx, ['rate_limit', 'success']))
  }
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.on('agent/error', ({ error }) => { agentErrors.push(error) })
  return { ctx, adapter }
}

function keys(...members: RotationKeyConfig[]): NonNullable<RotationConfig['providers']> {
  return { openrouter: { keys: members } }
}

async function sendAndWait(agent: Agent): Promise<void> {
  const idle = agent.whenIdle()
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: 'rotate across the pool' }],
    source: { kind: 'user' },
  }))
  await idle
}

describe('multi-key rotation through the real loop', () => {
  it('retries the same request on the next key after a 429 and keeps the new key sticky', async () => {
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })
    const { ctx, adapter } = await boot({
      credentialPath: path,
      steps: ['rate_limit', 'success', 'success'],
      providers: keys({ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2' }),
    })

    const first = ctx.agentLoop.create(SessionId('rotate-once'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(first)
    const second = ctx.agentLoop.create(SessionId('rotate-sticky'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(second)

    expect(adapter.servedKeys).toEqual(['k1', 'k2', 'k2'])
    expect(first.session.events.some(event => event.type === 'llm/retry')).toBe(false)
    expect(second.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  })

  it('fails loud naming every key and its reset instant once all are parked', async () => {
    const { adapter } = await boot({
      steps: ['rate_limit', 'rate_limit', 'rate_limit'],
      providers: keys(
        { value: 'k1', label: 'key-1' },
        { value: 'k2', label: 'key-2' },
        { value: 'k3', label: 'key-3' },
      ),
    })

    const agent = context!.agentLoop.create(SessionId('rotate-exhausted'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    expect(adapter.servedKeys).toEqual(['k1', 'k2', 'k3'])
    expect(agentErrors).toHaveLength(1)
    const error = agentErrors[0] as Error & { code?: string }
    expect(error.code).toBe('KEY_POOL_EXHAUSTED')
    expect(error.message).toContain('every key for provider route "openrouter" is rate-limited:')
    // The upstream failure text that caused each park rides the listing, so
    // the visible error names the limiter instead of bare reset instants.
    expect(error.message).toMatch(/key-1 parked until \d{4}-\d{2}-\d{2}T00:00:00\.000Z — rate_limit strike,/)
    expect(error.message)
      .toMatch(/key-2 parked until [^,]+Z — rate_limit strike, key-3 parked until [^,]+Z — rate_limit strike/)
  }, 20_000)

  it('parks nothing when the 429 names the upstream shared pool as the limiter', async () => {
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })
    const { ctx, adapter } = await boot({
      credentialPath: path,
      steps: ['upstream_limit', 'success'],
      providers: keys({ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2' }),
    })

    const agent = ctx.agentLoop.create(SessionId('upstream-pool'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    // The same key served both attempts: rotation stood aside and ordinary
    // retry backoff carried the recovery.
    expect(adapter.servedKeys).toEqual(['k1', 'k1'])
    expect(agent.session.events.filter(event => event.type === 'llm/retry')).toHaveLength(1)
    expect((ctx.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState).snapshot())
      .toEqual([expect.objectContaining({
        provider: 'openrouter',
        keys: [
          expect.objectContaining({ label: 'OPENROUTER_KEY_1', status: { state: 'usable' } }),
          expect.objectContaining({ label: 'OPENROUTER_KEY_2', status: { state: 'usable' } }),
        ],
      })])
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  }, 20_000)

  it('serves literal and reference members and resolves references from the launch environment without the seam', async () => {
    vi.stubEnv('OPENROUTER_ENV_2', 'env-k2')
    const { adapter } = await boot({
      steps: ['rate_limit', 'success'],
      providers: keys({ value: 'lit-k1', label: 'literal' }, { apiKeyEnv: 'OPENROUTER_ENV_2' }),
    })

    const agent = context!.agentLoop.create(SessionId('rotate-env'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    expect(adapter.servedKeys).toEqual(['lit-k1', 'env-k2'])
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  })

  it('reports a named-but-unset reference as MISSING_CREDENTIAL naming the pool key', async () => {
    const path = await writeCredentials({ UNRELATED_REF: 'unused' })
    const { adapter } = await boot({
      credentialPath: path,
      steps: ['rate_limit'],
      providers: keys({ value: 'ok-key', label: 'first' }, { apiKeyEnv: 'OPENROUTER_MISSING' }),
    })

    const agent = context!.agentLoop.create(SessionId('rotate-missing'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    // The literal member served and failed first; the retry then refused the
    // route because its next member names an unset reference.
    expect(adapter.servedKeys).toEqual(['ok-key'])
    expect(agentErrors).toHaveLength(1)
    expect((agentErrors[0] as Error).message)
      .toMatch(/pool key "OPENROUTER_MISSING" resolves OPENROUTER_MISSING, which is not set/)
  }, 20_000)

  it('delegates single-key routes untouched so dsh-llm-retry behaves exactly as today', async () => {
    const path = await writeCredentials({ OPENROUTER_ONLY: 'only-k1' })
    const { adapter } = await boot({
      credentialPath: path,
      steps: ['rate_limit', 'success'],
      retryMount: 'after',
      providers: keys({ apiKeyEnv: 'OPENROUTER_ONLY' }),
    })

    const agent = context!.agentLoop.create(SessionId('single-passthrough'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    expect(adapter.servedKeys).toEqual(['only-k1', 'only-k1'])
    expect(agent.session.events.filter(event => event.type === 'llm/retry')).toHaveLength(1)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  })

  it('leaves non-rate-limit failures to downstream recovery on the same key', async () => {
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })
    const { adapter } = await boot({
      credentialPath: path,
      steps: ['server_error', 'success'],
      retryMount: 'after',
      providers: keys({ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2' }),
    })

    const agent = context!.agentLoop.create(SessionId('server-error-delegates'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    expect(adapter.servedKeys).toEqual(['k1', 'k1'])
    expect(agent.session.events.filter(event => event.type === 'llm/retry')).toHaveLength(1)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  })

  it('retries a bare vendor relay on the same key with visible backoff first', async () => {
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })
    const { ctx, adapter } = await boot({
      credentialPath: path,
      steps: ['provider_returned', 'success'],
      providers: keys({ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2' }),
    })

    const agent = context!.agentLoop.create(SessionId('vendor-relay'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    // The retry chain still has budget, so the SAME key retries through the
    // plugin's ordinary exponential backoff — visible as an llm/retry row.
    expect(adapter.servedKeys).toEqual(['k1', 'k1'])
    expect(agent.session.events.filter(event => event.type === 'llm/retry')).toHaveLength(1)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
    // Nothing parked, nothing persisted.
    const face = ctx.get('llmKeyRotation') as LlmKeyRotationState
    expect(face.snapshot()[0]!.keys.every(key => key.status.state === 'usable')).toBe(true)
    expect(existsSync(join(home!, '.llm-key-rotation-parks.json'))).toBe(false)
  })

  it('rotates onto the spare only after the same-key retry chain is spent', async () => {
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })
    const { ctx, adapter } = await boot({
      credentialPath: path,
      steps: ['provider_returned', 'provider_returned', 'provider_returned', 'provider_returned', 'success'],
      providers: keys({ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2' }),
    })

    const agent = context!.agentLoop.create(SessionId('vendor-relay-spent'), { provider: 'openrouter', model: 'mock-model' })
    // Pool-health mutations push the registry refresh so open editors re-read.
    let refreshed = 0
    ctx.on('llm/adapters-updated', () => { refreshed += 1 })
    await sendAndWait(agent)

    // FAST_RETRY_POLICY allows three same-key retries (attempts k1 x4); once
    // that chain is spent, rotation advances the sticky position to k2 for
    // attempt five — without parking anything.
    expect(adapter.servedKeys).toEqual(['k1', 'k1', 'k1', 'k1', 'k2'])
    expect(agent.session.events.filter(event => event.type === 'llm/retry')).toHaveLength(3)
    expect(refreshed).toBeGreaterThanOrEqual(1)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
    const face = ctx.get('llmKeyRotation') as LlmKeyRotationState
    expect(face.snapshot()[0]!.keys.every(key => key.status.state === 'usable')).toBe(true)
    expect(existsSync(join(home!, '.llm-key-rotation-parks.json'))).toBe(false)
  })

  it('rotates even when dsh-llm-retry registered first, because the listener prepends', async () => {
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })
    const { adapter } = await boot({
      credentialPath: path,
      steps: ['rate_limit', 'success'],
      retryMount: 'before',
      providers: keys({ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2' }),
    })

    const agent = context!.agentLoop.create(SessionId('prepend-order'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    expect(adapter.servedKeys).toEqual(['k1', 'k2'])
    expect(agent.session.events.some(event => event.type === 'llm/retry')).toBe(false)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  })

  it('delegates failures of routes the plugin does not own', async () => {
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })
    const { ctx, adapter } = await boot({
      credentialPath: path,
      steps: ['rate_limit', 'success'],
      registerForeign: true,
      providers: keys({ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2' }),
    })

    const agent = ctx.agentLoop.create(SessionId('foreign-route'), { provider: 'other', model: 'any-model' })
    await sendAndWait(agent)

    expect(adapter.servedKeys).toEqual([])
    // The foreign route recovered through ordinary downstream retry on its own
    // terms; the openrouter pool was never touched.
    expect((ctx.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState).snapshot())
      .toEqual([expect.objectContaining({
        provider: 'openrouter',
        keys: [
          expect.objectContaining({ label: 'OPENROUTER_KEY_1', status: { state: 'usable' } }),
          expect.objectContaining({ label: 'OPENROUTER_KEY_2', status: { state: 'usable' } }),
        ],
      })])
    expect(agent.session.events.filter(event => event.type === 'llm/retry')).toHaveLength(1)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  })

  it('registers nothing itself: dormant and configured mounts leave adapter registration to the families', async () => {
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })

    const dormant = await boot({ credentialPath: path, registerAdapter: false })
    expect(dormant.ctx.llm.listProviders()).toEqual([])
    // The faces exist whenever the plugin is composed; a dormant mount
    // snapshots as an empty list.
    expect(dormant.ctx.get('llmKeyRotation')).toBeDefined()
    expect((dormant.ctx.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState).snapshot()).toEqual([])
    await dormant.ctx.fiber.dispose()

    // A pool for a route NO family serves must stay an inert pool: the
    // registry gains nothing even though the configuration is live.
    context = undefined
    home = undefined
    const inertPath = await writeCredentials({ OPENROUTER_KEY_1: 'k1' })
    const inertHome = home
    const inert = new Context()
    context = inert
    await mountAgentLoopTestDependencies(inert)
    await inert.plugin(LocalCredentialProvider, { path: inertPath, watch: false })
    await inert.plugin(KeyRotation, {
      parkFile: join(inertHome!, '.llm-key-rotation-parks.json'),
      providers: keys({ apiKeyEnv: 'OPENROUTER_KEY_1' }),
    })
    expect(inert.llm.listProviders()).toEqual([])
    expect((inert.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState).snapshot()).toHaveLength(1)
    await inert.fiber.dispose()

    // Disposal withdraws both faces with the fiber.
    context = undefined
    home = undefined
    const configured = new Context()
    context = configured
    await mountAgentLoopTestDependencies(configured)
    await configured.plugin(LocalCredentialProvider, { path: inertPath, watch: false })
    await configured.plugin(KeyRotation, {
      parkFile: join(inertHome!, '.llm-key-rotation-parks.json'),
      providers: keys({ apiKeyEnv: 'OPENROUTER_KEY_1' }),
    })
    expect(configured.get('llmApiKeyOverride')).toBeDefined()
    await configured.fiber.dispose()
    expect(configured.get('llmApiKeyOverride')).toBeUndefined()
    expect(configured.get('llmKeyRotation')).toBeUndefined()
  })
})

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import type { MockLlmBehavior, MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import * as Retry from '@deepseek-ai/dsh-llm-retry'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as KeyRotation from '../src/index.ts'
import type { Config as RotationConfig, RotationKeyConfig, RotationProviderConfig } from '../src/config.ts'

const MOCK_TEXT = 'mock response recovered'

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
  config: RotationConfig
  credentialPath?: string
  retryMount?: 'before' | 'after'
}): Promise<Context> {
  // Every mount gets its own park-state location so tests never touch the
  // real harness home; a caller-supplied parkFile wins.
  home ??= await mkdtemp(join(tmpdir(), 'dsh-key-rotation-'))
  const ctx = new Context()
  context = ctx
  await mountAgentLoopTestDependencies(ctx)
  if (options.credentialPath !== undefined) {
    await ctx.plugin(LocalCredentialProvider, { path: options.credentialPath, watch: false })
  }
  if (options.retryMount === 'before') await ctx.plugin(Retry)
  await ctx.plugin(KeyRotation, Object.assign({ parkFile: join(home, '.llm-key-rotation-parks.json') }, options.config))
  if (options.retryMount !== 'before') await ctx.plugin(Retry)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.on('agent/error', ({ error }) => { agentErrors.push(error) })
  return ctx
}

function openrouterRoute(serverURL: string, keys: RotationKeyConfig[], withRetryPolicy = false): RotationProviderConfig {
  return {
    api: 'openai-completions',
    baseURL: serverURL,
    models: [{ id: 'mock-model', name: 'Mock Model', contextWindow: 8192 }],
    ...withRetryPolicy
      ? { retryPolicy: { mode: 'normal' as const, maxRetries: 3, backoff: { initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 } } }
      : {},
    keys,
  }
}

async function startServer(sequence: readonly MockLlmBehavior[]): Promise<MockLlmServer> {
  const server = await startMockLlmServer({ sequence })
  servers.push(server)
  return server
}

async function sendAndWait(agent: Agent): Promise<void> {
  const idle = agent.whenIdle()
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: 'rotate across the pool' }],
    source: { kind: 'user' },
  }))
  await idle
}

function bearerTokens(server: MockLlmServer): Array<string | undefined> {
  return server.requests.map(request => request.headers.authorization)
}

describe('multi-key rotation through the real loop', () => {
  it('retries the same request on the next key after a 429 and keeps the new key sticky', async () => {
    const server = await startServer(['rate_limit', 'success', 'success'])
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })
    const ctx = await boot({
      credentialPath: path,
      config: { providers: { openrouter: openrouterRoute(server.baseURL, [
        { apiKeyEnv: 'OPENROUTER_KEY_1' },
        { apiKeyEnv: 'OPENROUTER_KEY_2' },
      ]) } },
    })

    const first = ctx.agentLoop.create(SessionId('rotate-once'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(first)
    const second = ctx.agentLoop.create(SessionId('rotate-sticky'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(second)

    expect(bearerTokens(server)).toEqual(['Bearer k1', 'Bearer k2', 'Bearer k2'])
    expect(first.session.events.some(event => event.type === 'llm/retry')).toBe(false)
    expect(second.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  })

  it('fails loud naming every key and its reset instant once all are parked', async () => {
    const server = await startServer(['rate_limit', 'rate_limit', 'rate_limit'])
    const ctx = await boot({
      config: { providers: { openrouter: openrouterRoute(server.baseURL, [
        { value: 'k1', label: 'key-1' },
        { value: 'k2', label: 'key-2' },
        { value: 'k3', label: 'key-3' },
      ]) } },
    })

    const agent = ctx.agentLoop.create(SessionId('rotate-exhausted'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    expect(bearerTokens(server)).toEqual(['Bearer k1', 'Bearer k2', 'Bearer k3'])
    expect(agentErrors).toHaveLength(1)
    const error = agentErrors[0] as Error & { code?: string }
    expect(error.code).toBe('KEY_POOL_EXHAUSTED')
    expect(error.message).toContain('every key for provider route "openrouter" is rate-limited:')
    expect(error.message).toMatch(/key-1 parked until \d{4}-\d{2}-\d{2}T00:00:00\.000Z,/)
    expect(error.message).toMatch(/key-2 parked until [^,]+Z, key-3 parked until [^,]+Z/)
  }, 20_000)

  it('serves literal and reference members and falls back to the launch environment without the seam', async () => {
    vi.stubEnv('OPENROUTER_ENV_2', 'env-k2')
    const server = await startServer(['rate_limit', 'success'])
    // No credentials service mounted at all: reference resolution reads the
    // launching environment, which is what a bare composition provides.
    const ctx = await boot({
      config: { providers: { openrouter: openrouterRoute(server.baseURL, [
        { value: 'lit-k1', label: 'literal' },
        { apiKeyEnv: 'OPENROUTER_ENV_2' },
      ]) } },
    })

    const agent = ctx.agentLoop.create(SessionId('rotate-env'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    expect(bearerTokens(server)).toEqual(['Bearer lit-k1', 'Bearer env-k2'])
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  })

  it('reports a named-but-unset reference as MISSING_CREDENTIAL naming the pool key', async () => {
    const server = await startServer(['rate_limit'])
    const path = await writeCredentials({ UNRELATED_REF: 'unused' })
    const ctx = await boot({
      credentialPath: path,
      config: { providers: { openrouter: openrouterRoute(server.baseURL, [
        { value: 'ok-key', label: 'first' },
        { apiKeyEnv: 'OPENROUTER_MISSING' },
      ]) } },
    })

    const agent = ctx.agentLoop.create(SessionId('rotate-missing'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    // The literal member served and failed first; the retry then refused the
    // route because its next member names an unset reference.
    expect(bearerTokens(server)).toEqual(['Bearer ok-key'])
    expect(agentErrors).toHaveLength(1)
    expect((agentErrors[0] as Error).message).toMatch(/pool key "OPENROUTER_MISSING" resolves OPENROUTER_MISSING, which is not set/)
  }, 20_000)

  it('delegates single-key routes untouched so dsh-llm-retry behaves exactly as today', async () => {
    const server = await startServer(['rate_limit', 'success'])
    const path = await writeCredentials({ OPENROUTER_ONLY: 'only-k1' })
    const ctx = await boot({
      credentialPath: path,
      retryMount: 'after',
      config: { providers: { openrouter: openrouterRoute(server.baseURL, [
        { apiKeyEnv: 'OPENROUTER_ONLY' },
      ], true) } },
    })

    const agent = ctx.agentLoop.create(SessionId('single-passthrough'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    expect(bearerTokens(server)).toEqual(['Bearer only-k1', 'Bearer only-k1'])
    expect(agent.session.events.filter(event => event.type === 'llm/retry')).toHaveLength(1)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  })

  it('leaves non-rate-limit failures to downstream recovery on the same key', async () => {
    const server = await startServer(['server_error', 'success'])
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })
    const ctx = await boot({
      credentialPath: path,
      retryMount: 'after',
      config: { providers: { openrouter: openrouterRoute(server.baseURL, [
        { apiKeyEnv: 'OPENROUTER_KEY_1' },
        { apiKeyEnv: 'OPENROUTER_KEY_2' },
      ], true) } },
    })

    const agent = ctx.agentLoop.create(SessionId('server-error-delegates'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    expect(bearerTokens(server)).toEqual(['Bearer k1', 'Bearer k1'])
    expect(agent.session.events.filter(event => event.type === 'llm/retry')).toHaveLength(1)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  })

  it('rotates even when dsh-llm-retry registered first, because the listener prepends', async () => {
    const server = await startServer(['rate_limit', 'success'])
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })
    const ctx = await boot({
      credentialPath: path,
      retryMount: 'before',
      config: { providers: { openrouter: openrouterRoute(server.baseURL, [
        { apiKeyEnv: 'OPENROUTER_KEY_1' },
        { apiKeyEnv: 'OPENROUTER_KEY_2' },
      ], true) } },
    })

    const agent = ctx.agentLoop.create(SessionId('prepend-order'), { provider: 'openrouter', model: 'mock-model' })
    await sendAndWait(agent)

    expect(bearerTokens(server)).toEqual(['Bearer k1', 'Bearer k2'])
    expect(agent.session.events.some(event => event.type === 'llm/retry')).toBe(false)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: MOCK_TEXT }],
    })
  })

  it('delegates failures of routes the plugin does not own', async () => {
    class ForeignRateLimited extends LlmAdapter {
      attempts = 0

      override async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
        this.attempts += 1
        if (this.attempts === 1) {
          yield { type: 'finish', reason: { kind: 'error', failure: { message: 'foreign limited', code: 'RATE_LIMIT' } } }
          return
        }
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: 'foreign recovered' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'foreign recovered' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }

    const server = await startServer(['success'])
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })
    const ctx = await boot({
      credentialPath: path,
      config: { providers: { openrouter: openrouterRoute(server.baseURL, [
        { apiKeyEnv: 'OPENROUTER_KEY_1' },
        { apiKeyEnv: 'OPENROUTER_KEY_2' },
      ]) } },
    })
    const foreign = new ForeignRateLimited()
    ctx.llm.registerAdapter(['other'], foreign)

    const agent = ctx.agentLoop.create(SessionId('foreign-route'), { provider: 'other', model: 'any-model' })
    await sendAndWait(agent)

    expect(foreign.attempts).toBe(2)
    expect(server.requests).toHaveLength(0)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'foreign recovered' }],
    })
  })

  it('mounts dormant with no providers and withdraws its routes on disposal', async () => {
    const server = await startServer(['success'])
    const path = await writeCredentials({ OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' })

    const dormant = await boot({
      credentialPath: path,
      config: {},
    })
    expect(dormant.llm.listProviders()).toEqual([])
    // The face exists whenever the plugin is composed; a dormant mount
    // snapshots as an empty list.
    expect(dormant.get('llmKeyRotation')).toBeDefined()
    expect((dormant.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState).snapshot()).toEqual([])

    let configured: Context | undefined
    let configuredDisposed = false
    try {
      configured = new Context()
      await mountAgentLoopTestDependencies(configured)
      await configured.plugin(LocalCredentialProvider, { path, watch: false })
      await configured.plugin(KeyRotation, {
        parkFile: join(home!, '.llm-key-rotation-parks.json'),
        providers: { openrouter: openrouterRoute(server.baseURL, [
          { apiKeyEnv: 'OPENROUTER_KEY_1' },
          { apiKeyEnv: 'OPENROUTER_KEY_2' },
        ]) },
      })
      // Hold the registry object itself: after disposal the context proxy no
      // longer resolves the service, but the same object must report the
      // routes withdrawn.
      const registry = configured.llm
      expect(registry.listProviders().map(provider => provider.id)).toEqual(['openrouter'])
      expect(configured.get('llmKeyRotation')).toBeDefined()
      await configured.fiber.dispose()
      configuredDisposed = true
      expect(registry.listProviders()).toEqual([])
    } finally {
      if (configured !== undefined && !configuredDisposed) await configured.fiber.dispose()
    }
  })
})

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import type { MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { SessionId } from '@deepseek-ai/dsh-session'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import * as KeyRotation from '../src/index.ts'
import type { LlmKeyRotationState } from '../src/index.ts'
import {
  PARK_STATE_FILENAME,
  parseParkState,
  readParkState,
  renderParkState,
  resolveParkSpec,
} from '../src/park-store.ts'

/**
 * Read the state face through the optional-service seam with its declared
 * type: cordis `ctx.get` is untyped, so the face type is asserted once here.
 */
function stateFace(ctx: Context): LlmKeyRotationState {
  const face = ctx.get('llmKeyRotation') as LlmKeyRotationState | undefined
  expect(face).toBeDefined()
  return face!
}

describe('park-state location', () => {
  it('defaults beside the credentials document under the harness home', () => {
    expect(resolveParkSpec({}).filename).toBe(join(resolveDshHome(undefined), PARK_STATE_FILENAME))
    // resolveDshHome resolves a relative home against the process directory.
    expect(resolveParkSpec({ dshHome: join('custom', 'home') }).filename)
      .toBe(resolve(join('custom', 'home'), PARK_STATE_FILENAME))
    // An explicit location wins over the home derivation.
    expect(resolveParkSpec({ parkFile: join('elsewhere', 'parks.json'), dshHome: join('custom', 'home') }).filename)
      .toContain('parks.json')
  })

  it('renders equivalent states byte-identically regardless of record order', () => {
    const first = { route: 'b', label: 'x', parkedAt: 1, resetAt: 2 }
    const second = { route: 'a', label: 'y', parkedAt: 3, resetAt: 4 }
    expect(renderParkState([first, second])).toBe(renderParkState([second, first]))
    expect(renderParkState([])).toBe(`${JSON.stringify({ version: 1, parks: [] }, null, 2)}\n`)
  })
})

let home: string | undefined
let context: Context | undefined
const servers: MockLlmServer[] = []

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  await Promise.all(servers.splice(0).map(server => server.close()))
  if (home !== undefined) await rm(home, { recursive: true, force: true })
  home = undefined
  vi.restoreAllMocks()
})

const parkPath = (): string => join(home!, PARK_STATE_FILENAME)

async function writeCredentials(): Promise<void> {
  const path = join(home!, '.credentials.yaml')
  await writeFile(
    path,
    ['version: 1', 'refs:', '  OPENROUTER_KEY_1: k1', '  OPENROUTER_KEY_2: k2', ''].join('\n'),
    { mode: 0o600 },
  )
}

async function seedParks(records: unknown[]): Promise<void> {
  await writeFile(parkPath(), `${JSON.stringify({ version: 1, parks: records }, null, 2)}\n`, 'utf8')
}

function twoKeyRoute(serverURL: string): NonNullable<KeyRotation.Config['providers']> {
  return {
    openrouter: {
      api: 'openai-completions',
      baseURL: serverURL,
      models: [{ id: 'mock-model', name: 'Mock Model', contextWindow: 8192 }],
      keys: [{ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2' }],
    },
  }
}

async function boot(config: KeyRotation.Config): Promise<Context> {
  const ctx = new Context()
  context = ctx
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(LocalCredentialProvider, { path: join(home!, '.credentials.yaml'), watch: false })
  await ctx.plugin(KeyRotation, config)
  await ctx.plugin(AgentLoop, { agents: [] })
  return ctx
}

/** Boot with both refs stored and the park document under the temp home. */
async function bootStandard(
  sequence: readonly ('rate_limit' | 'success')[],
): Promise<{ ctx: Context; server: MockLlmServer }> {
  const server = await startMockLlmServer({ sequence })
  servers.push(server)
  return { server, ctx: await boot({ dshHome: home!, providers: twoKeyRoute(server.baseURL) }) }
}

async function sendOne(ctx: Context, session: string): Promise<void> {
  const agent = ctx.agentLoop.create(SessionId(session), { provider: 'openrouter', model: 'mock-model' })
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

describe('park-state document', () => {
  const FILE = join('home', PARK_STATE_FILENAME)

  it('rejects documents that are not mappings or carry unknown top-level keys', () => {
    expect(() => parseParkState('[1]', FILE)).toThrow(`${FILE} must be a mapping`)
    expect(() => parseParkState('null', FILE)).toThrow(`${FILE} must be a mapping`)
    expect(() => parseParkState(JSON.stringify({ version: 1, parks: [], extra: true }), FILE))
      .toThrow('unknown top-level key "extra"')
  })

  it('requires the parks section to be an array of well-formed rows', () => {
    expect(() => parseParkState(JSON.stringify({ version: 1 }), FILE))
      .toThrow('"parks" in home\\.llm-key-rotation-parks.json must be an array')
    expect(() => parseParkState(JSON.stringify({ version: 1, parks: [7] }), FILE))
      .toThrow('parks[0] in home\\.llm-key-rotation-parks.json must be a mapping')
    expect(() => parseParkState(JSON.stringify({
      version: 1,
      parks: [{ route: '', label: 'x', parkedAt: 1, resetAt: 2 }],
    }), FILE)).toThrow('parks[0].route in home\\.llm-key-rotation-parks.json must be a non-empty string')
    expect(() => parseParkState(JSON.stringify({
      version: 1,
      parks: [{ route: 'r', label: 'x', parkedAt: -1, resetAt: 2 }],
    }), FILE)).toThrow('parks[0].parkedAt in home\\.llm-key-rotation-parks.json must be a finite non-negative epoch ms number')
  })

  it('reads absence as the empty state and surfaces every other read failure', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'dsh-key-parks-doc-'))
    try {
      expect(await readParkState(join(scratch, 'absent.json'))).toEqual([])
      const asDirectory = join(scratch, 'occupied')
      await mkdir(asDirectory)
      await expect(readParkState(asDirectory)).rejects.toThrow()
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })

  it('describes thrown values whether or not they are Errors', () => {
    expect(KeyRotation.describeError(new Error('boom'))).toBe('boom')
    expect(KeyRotation.describeError('plain')).toBe('plain')
  })
})

describe('persistent park records', () => {
  it('persists a park beside the credentials store at owner-only mode and leaves that store untouched', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-parks-'))
    await writeCredentials()
    const credentialsBefore = await readFile(join(home, '.credentials.yaml'), 'utf8')
    const { ctx, server } = await bootStandard(['rate_limit', 'success'])
    await sendOne(ctx, 'persist-park')

    expect(bearerTokens(server)).toEqual(['Bearer k1', 'Bearer k2'])
    const persisted = JSON.parse(await readFile(parkPath(), 'utf8')) as {
      version: number
      parks: Array<{ route: string; label: string; parkedAt: number; resetAt: number }>
    }
    expect(persisted.version).toBe(1)
    expect(persisted.parks).toHaveLength(1)
    expect(persisted.parks[0]).toMatchObject({ route: 'openrouter', label: 'OPENROUTER_KEY_1' })
    expect(persisted.parks[0]!.parkedAt).toBeGreaterThan(0)
    expect(persisted.parks[0]!.resetAt).toBeGreaterThan(Date.now())
    // Owner-only bits on POSIX; Windows has no mode to inspect.
    /* v8 ignore next -- POSIX coverage cannot take the Windows peer; native Windows coverage does. */
    if (process.platform !== 'win32') expect((await stat(parkPath())).mode & 0o077).toBe(0)
    expect(await readFile(join(home, '.credentials.yaml'), 'utf8')).toBe(credentialsBefore)
  })

  it('keeps an exhausted key parked across a restart so the next request starts on the spare', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-parks-'))
    await writeCredentials()
    const first = await bootStandard(['rate_limit', 'success'])
    await sendOne(first.ctx, 'restart-before')
    expect(bearerTokens(first.server)).toEqual(['Bearer k1', 'Bearer k2'])
    await context!.fiber.dispose()

    context = undefined
    const second = await bootStandard(['success'])
    await sendOne(second.ctx, 'restart-after')
    // One successful request: it starts directly on the spare key.
    expect(bearerTokens(second.server)).toEqual(['Bearer k2'])
  })

  it('drops expired rows on mount and rewrites the document without them', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-parks-'))
    await writeCredentials()
    await seedParks([
      { route: 'openrouter', label: 'OPENROUTER_KEY_1', parkedAt: Date.now() - 5_000, resetAt: Date.now() - 1_000 },
      { route: 'openrouter', label: 'OPENROUTER_KEY_2', parkedAt: Date.now() - 500, resetAt: Date.now() + 60_000 },
    ])
    const { ctx, server } = await bootStandard(['success'])
    await sendOne(ctx, 'expired-row')

    // The expired park is gone, so the first key serves again...
    expect(bearerTokens(server)).toEqual(['Bearer k1'])
    // ...and the document keeps only the live row for the second key.
    const persisted = JSON.parse(await readFile(parkPath(), 'utf8')) as {
      parks: Array<{ label: string }>
    }
    expect(persisted.parks).toHaveLength(1)
    expect(persisted.parks[0]).toMatchObject({ route: 'openrouter', label: 'OPENROUTER_KEY_2' })
  })

  it('prunes rows naming routes or labels the configuration no longer has', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-parks-'))
    await writeCredentials()
    await seedParks([
      { route: 'ghost-route', label: 'gone-key', parkedAt: Date.now() - 100, resetAt: Date.now() + 60_000 },
      { route: 'openrouter', label: 'renamed-away', parkedAt: Date.now() - 100, resetAt: Date.now() + 60_000 },
    ])
    const { ctx, server } = await bootStandard(['success'])
    await sendOne(ctx, 'stale-rows')

    expect(bearerTokens(server)).toEqual(['Bearer k1'])
    const persisted = JSON.parse(await readFile(parkPath(), 'utf8')) as { parks: unknown[] }
    expect(persisted.parks).toEqual([])
  })

  it('fails loud naming the file when it is not valid JSON or carries a wrong version', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-parks-'))
    await writeCredentials()

    await writeFile(parkPath(), '{ not json', 'utf8')
    await expect(boot({ dshHome: home, providers: twoKeyRoute('https://openrouter.example/api/v1') }))
      .rejects.toThrow(/\.llm-key-rotation-parks\.json is not valid JSON/)

    await writeFile(parkPath(), `${JSON.stringify({ version: 2, parks: [] })}\n`, 'utf8')
    await expect(boot({ dshHome: home, providers: twoKeyRoute('https://openrouter.example/api/v1') }))
      .rejects.toThrow(/declares version 2; this build reads version 1/)
  })

  it('fails loud on malformed rows and duplicate entries', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-parks-'))
    await writeCredentials()
    const mount = (): Promise<Context> =>
      boot({ dshHome: home!, providers: twoKeyRoute('https://openrouter.example/api/v1') })

    await seedParks([{ route: 'openrouter', label: 'OPENROUTER_KEY_1', parkedAt: Date.now() }])
    await expect(mount()).rejects.toThrow(/parks\[0\]\.resetAt in .* must be a finite non-negative epoch ms number/)

    await seedParks([{ route: 'openrouter', label: 'OPENROUTER_KEY_1', parkedAt: Date.now(), resetAt: 'soon' }])
    await expect(mount()).rejects.toThrow(/parks\[0\]\.resetAt in .* must be a finite non-negative epoch ms number/)

    await seedParks([
      { route: 'openrouter', label: 'OPENROUTER_KEY_1', parkedAt: 1, resetAt: Date.now() + 60_000 },
      { route: 'openrouter', label: 'OPENROUTER_KEY_1', parkedAt: 2, resetAt: Date.now() + 60_000 },
    ])
    await expect(mount()).rejects.toThrow(/duplicate park for "OPENROUTER_KEY_1" on route "openrouter"/)
  })

  it('logs loudly and keeps rotating when the park document cannot be written', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-parks-'))
    await writeCredentials()
    const { ctx, server } = await bootStandard(['rate_limit', 'success'])
    const errorSpy = vi.spyOn(ctx.logger, 'error').mockImplementation(() => undefined)
    // A directory where the document belongs makes every atomic replacement fail.
    await mkdir(parkPath())
    await sendOne(ctx, 'write-failure')

    expect(bearerTokens(server)).toEqual(['Bearer k1', 'Bearer k2'])
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not persist park state'),
      parkPath(),
      expect.stringMatching(/./),
    )
  })
})

describe('rotation state face', () => {
  it('exposes per-key status with ISO instants after a rotation, secrets excluded', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-face-'))
    await writeCredentials()
    const { ctx } = await bootStandard(['rate_limit', 'success'])
    await sendOne(ctx, 'face-status')

    const snapshot = stateFace(ctx).snapshot()
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0]).toMatchObject({
      provider: 'openrouter',
      activeLabel: 'OPENROUTER_KEY_2',
      keys: [
        { provider: 'openrouter', label: 'OPENROUTER_KEY_1', source: 'reference', reference: 'OPENROUTER_KEY_1' },
        {
          provider: 'openrouter',
          label: 'OPENROUTER_KEY_2',
          source: 'reference',
          reference: 'OPENROUTER_KEY_2',
          status: { state: 'usable' },
        },
      ],
    })
    const status = snapshot[0]!.keys[0]!.status
    expect(status.state).toBe('parked')
    expect('parkedAt' in status && /^\d{4}-\d{2}-\d{2}T/.test(status.parkedAt)).toBe(true)
    // Daily-limit parks land on coming UTC midnight, renderable as «через Nч Mм».
    expect('resetAt' in status && /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(status.resetAt)).toBe(true)
    expect(JSON.stringify(snapshot)).not.toContain('"k1"')
  })

  it('treats expired parks as usable in snapshots without rewriting the document', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-face-'))
    await writeCredentials()
    await seedParks([{
      route: 'openrouter',
      label: 'OPENROUTER_KEY_1',
      parkedAt: Date.now(),
      resetAt: Date.now() + 150,
    }])
    await bootStandard(['success'])
    await new Promise(resolve => setTimeout(resolve, 300))
    const before = await readFile(parkPath(), 'utf8')
    const snapshot = stateFace(context!).snapshot()

    // View-only usability: the expired stamp still sits in memory, so the
    // sticky position (advanced at mount while the park was live) stays on
    // the spare key until a real serve or park touches the pool.
    expect(snapshot[0]!.keys[0]!.status.state).toBe('usable')
    expect(snapshot[0]!.activeLabel).toBe('OPENROUTER_KEY_2')
    expect(await readFile(parkPath(), 'utf8')).toBe(before)
  })

  it('names the stuck position once every key is parked and reports literal sources without references', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-face-'))
    await writeCredentials()
    await seedParks([
      { route: 'openrouter', label: 'dev-1', parkedAt: Date.now(), resetAt: Date.now() + 60_000 },
      { route: 'openrouter', label: 'dev-2', parkedAt: Date.now(), resetAt: Date.now() + 120_000 },
    ])
    const ctx = await boot({
      dshHome: home,
      providers: {
        openrouter: {
          api: 'openai-completions',
          baseURL: 'https://openrouter.example/api/v1',
          models: [{ id: 'mock-model', name: 'Mock Model', contextWindow: 8192 }],
          keys: [{ value: 'k1', label: 'dev-1' }, { value: 'k2', label: 'dev-2' }],
        },
      },
    })
    const snapshot = stateFace(ctx).snapshot()

    expect(snapshot[0]!.activeLabel).toBe('dev-1')
    const entry = snapshot[0]!.keys[0]
    // Literal entries carry no reference field at all.
    expect(entry).toMatchObject({ provider: 'openrouter', label: 'dev-1', source: 'literal' })
    expect(Object.hasOwn(entry!, 'reference')).toBe(false)
    const literalStatus = entry!.status
    expect(literalStatus.state).toBe('parked')
    expect('parkedAt' in literalStatus && /^\d{4}-\d{2}-\d{2}T/.test(literalStatus.parkedAt)).toBe(true)
    expect('resetAt' in literalStatus && /^\d{4}-\d{2}-\d{2}T/.test(literalStatus.resetAt)).toBe(true)
  })

  it('snapshots an empty list while dormant', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-face-'))
    await writeCredentials()
    const ctx = await boot({ dshHome: home })
    expect(stateFace(ctx).snapshot()).toEqual([])
  })
})

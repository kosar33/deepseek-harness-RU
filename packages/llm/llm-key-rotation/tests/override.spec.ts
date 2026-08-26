import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { LlmApiKeyOverride } from '@deepseek-ai/dsh-llm'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import * as KeyRotation from '../src/index.ts'
import type { Config as RotationConfig } from '../src/config.ts'
import { PARK_STATE_FILENAME } from '../src/park-store.ts'

/**
 * Direct coverage of the `llmApiKeyOverride` face contract, driven through
 * `ctx.get` exactly as an adapter family consumes it — no loop and no
 * registered adapter, because the plugin registers none.
 */

let home: string | undefined
let context: Context | undefined

afterEach(async () => {
  vi.useRealTimers()
  await context?.fiber.dispose()
  context = undefined
  if (home !== undefined) await rm(home, { recursive: true, force: true })
  home = undefined
  vi.unstubAllEnvs()
})

const parkPath = (): string => join(home!, PARK_STATE_FILENAME)

async function writeCredentials(entries: Record<string, string>): Promise<void> {
  const path = join(home!, '.credentials.yaml')
  const refs = Object.entries(entries).map(([name, value]) => `  ${name}: ${value}`)
  await writeFile(path, ['version: 1', 'refs:', ...refs, ''].join('\n'), { mode: 0o600 })
}

async function seedParks(records: unknown[]): Promise<void> {
  await writeFile(parkPath(), `${JSON.stringify({ version: 1, parks: records }, null, 2)}\n`, 'utf8')
}

async function boot(options: {
  providers?: RotationConfig['providers']
  credentialEntries?: Record<string, string>
}): Promise<LlmApiKeyOverride> {
  home ??= await mkdtemp(join(tmpdir(), 'dsh-key-override-'))
  const ctx = new Context()
  context = ctx
  if (options.credentialEntries !== undefined) {
    await writeCredentials(options.credentialEntries)
    await ctx.plugin(LocalCredentialProvider, { path: join(home, '.credentials.yaml'), watch: false })
  }
  await ctx.plugin(KeyRotation, {
    parkFile: join(home, PARK_STATE_FILENAME),
    ...(options.providers === undefined ? {} : { providers: options.providers }),
  })
  return overrideFaceOf(ctx)
}

function overrideFaceOf(ctx: Context): LlmApiKeyOverride {
  const face = ctx.get('llmApiKeyOverride') as LlmApiKeyOverride | undefined
  expect(face).toBeDefined()
  return face!
}

describe('llmApiKeyOverride.resolve', () => {
  it('answers undefined for a route with no pool so the caller falls through', async () => {
    const face = await boot({ providers: { openrouter: { keys: [{ value: 'k1' }] } } })
    await expect(face.resolve('unknown-route')).resolves.toBeUndefined()
  })

  it('keeps one sticky key across repeated resolves', async () => {
    const face = await boot({
      credentialEntries: { OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' },
      providers: {
        openrouter: {
          keys: [{ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2' }],
        },
      },
    })
    // Only the recovery listener moves the sticky position; plain resolves
    // never rotate.
    await expect(face.resolve('openrouter')).resolves.toBe('k1')
    await expect(face.resolve('openrouter')).resolves.toBe('k1')
    await expect(face.resolve('openrouter')).resolves.toBe('k1')
    expect((context!.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState).snapshot()[0]!.activeLabel)
      .toBe('OPENROUTER_KEY_1')
  })

  it('returns a literal value verbatim', async () => {
    const face = await boot({ providers: { openrouter: { keys: [{ value: ' sk-literal ' }] } } })
    // assertUsableApiKey trimmed the value once at load; serving re-reads the
    // stored member without touching any credential plane.
    await expect(face.resolve('openrouter')).resolves.toBe('sk-literal')
  })

  it('resolves a reference through the credentials seam', async () => {
    const face = await boot({
      credentialEntries: { OPENROUTER_STORED: 'stored-value' },
      providers: { openrouter: { keys: [{ apiKeyEnv: 'OPENROUTER_STORED' }] } },
    })
    await expect(face.resolve('openrouter')).resolves.toBe('stored-value')
  })

  it('resolves references from the launching environment when no seam is mounted', async () => {
    vi.stubEnv('OPENROUTER_ENV_ONLY', 'env-value')
    const face = await boot({ providers: { openrouter: { keys: [{ apiKeyEnv: 'OPENROUTER_ENV_ONLY' }] } } })
    await expect(face.resolve('openrouter')).resolves.toBe('env-value')
  })

  it('throws MISSING_CREDENTIAL naming the pool key when a reference resolves to nothing', async () => {
    const face = await boot({
      credentialEntries: { UNRELATED: 'unused' },
      providers: { openrouter: { keys: [{ apiKeyEnv: 'OPENROUTER_MISSING', label: 'gone' }] } },
    })
    await expect(face.resolve('openrouter')).rejects.toThrow(LlmError)
    const caught: unknown = await face.resolve('openrouter').catch((error: unknown) => error)
    expect(caught).toBeInstanceOf(LlmError)
    expect((caught as LlmError).code).toBe('MISSING_CREDENTIAL')
    expect((caught as LlmError).message)
      .toContain('pool key "gone" resolves OPENROUTER_MISSING, which is not set')
  })

  it('serves the spare past a restored park and reports the held key usable once its reset instant passes', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-override-expiry-'))
    await seedParks([{
      route: 'openrouter',
      label: 'OPENROUTER_KEY_1',
      parkedAt: Date.now(),
      resetAt: Date.now() + 5_000,
    }])
    const face = await boot({
      credentialEntries: { OPENROUTER_KEY_1: 'k1', OPENROUTER_KEY_2: 'k2' },
      providers: {
        openrouter: {
          keys: [{ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2' }],
        },
      },
    })
    const keys = (): readonly KeyRotation.KeyRotationKeySnapshot[] =>
      (context!.get('llmKeyRotation') as KeyRotation.LlmKeyRotationState).snapshot()[0]!.keys

    // Mount advanced the sticky position past the restored park.
    await expect(face.resolve('openrouter')).resolves.toBe('k2')
    expect(keys()[0]).toMatchObject({ label: 'OPENROUTER_KEY_1', status: { state: 'parked' } })

    // Lazy expiry: once the reset instant passes, the held key reports usable
    // again on the next read without any timer running — while the sticky
    // position stays on the spare until recovery moves it.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 6_000)
    await expect(face.resolve('openrouter')).resolves.toBe('k2')
    expect(keys()[0]).toMatchObject({ label: 'OPENROUTER_KEY_1', status: { state: 'usable' } })
  })

  it('advances onto the reference member when the sticky literal is parked', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-key-override-mixed-'))
    await seedParks([{
      route: 'openrouter',
      label: 'dev',
      parkedAt: Date.now(),
      resetAt: Date.now() + 60_000,
    }])
    const face = await boot({
      credentialEntries: { OPENROUTER_STORED: 'stored-value' },
      providers: {
        openrouter: {
          keys: [{ value: 'sk-literal', label: 'dev' }, { apiKeyEnv: 'OPENROUTER_STORED' }],
        },
      },
    })
    // Mount advanced past the parked literal, so this resolve exercises the
    // reference arm of the same face.
    await expect(face.resolve('openrouter')).resolves.toBe('stored-value')
  })
})

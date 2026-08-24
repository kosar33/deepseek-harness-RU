import { describe, expect, it } from 'vitest'
import { Config, resolvePools } from '../src/config.ts'
import type { RotationProviderConfig } from '../src/config.ts'

describe('resolvePools', () => {
  it('resolves an absent dict to the dormant posture with no pools or profiles', () => {
    expect(resolvePools(undefined)).toEqual({ profiles: new Map(), pools: new Map() })
    expect(resolvePools({})).toEqual({ profiles: new Map(), pools: new Map() })
  })

  it('builds one pool per route with reference labels defaulting to the ref name', () => {
    const { profiles, pools } = resolvePools({
      openrouter: {
        api: 'openai-completions',
        baseURL: 'https://openrouter.example/api/v1',
        models: [{ id: 'mock-model', name: 'Mock Model', contextWindow: 8192 }],
        keys: [{ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2', label: 'spare' }],
      },
    })
    expect([...pools.get('openrouter')?.members ?? []]).toEqual([
      { label: 'OPENROUTER_KEY_1', ref: 'OPENROUTER_KEY_1' },
      { label: 'spare', ref: 'OPENROUTER_KEY_2' },
    ])
    expect(pools.get('openrouter')?.index).toBe(0)
    expect(pools.get('openrouter')?.parkedUntil.size).toBe(0)
    expect(profiles.get('openrouter')?.provider).toBe('openrouter')
    expect(profiles.get('openrouter')?.baseURL).toBe('https://openrouter.example/api/v1')
  })

  it('labels literal members by position when no explicit label exists', () => {
    const { pools } = resolvePools({
      openrouter: {
        models: [{ id: 'm', name: 'M', contextWindow: 1024 }],
        keys: [{ value: 'sk-dev-1', label: 'dev' }, { value: 'sk-dev-2' }],
      },
    })
    expect([...pools.get('openrouter')?.members ?? []]).toEqual([
      { label: 'dev', value: 'sk-dev-1' },
      { label: 'key-2', value: 'sk-dev-2' },
    ])
  })

  it('rejects duplicate labels within one route', () => {
    expect(() => resolvePools({
      openrouter: {
        keys: [{ apiKeyEnv: 'K_ONE' }, { value: 'sk-x', label: 'K_ONE' }],
      },
    })).toThrow('llm-key-rotation: provider "openrouter" has duplicate key label "K_ONE"')
  })

  it('rejects a route without at least one key', () => {
    expect(() => resolvePools({ openrouter: {} }))
      .toThrow('llm-key-rotation: provider "openrouter" must list at least one key under keys')
  })

  it('rejects an empty provider name', () => {
    expect(() => resolvePools({ '': { keys: [{ value: 'sk-x' }] } }))
      .toThrow('llm-key-rotation: provider names must be non-empty')
  })

  it('refuses the plain-adapter credential field with a pointed replacement message', () => {
    expect(() => resolvePools({
      openrouter: {
        apiKeyEnv: 'OPENROUTER_API_KEY',
        keys: [{ apiKeyEnv: 'OPENROUTER_KEY_1' }],
      } as RotationProviderConfig,
    })).toThrow(
      'llm-key-rotation: provider "openrouter" sets apiKeyEnv, which belongs on a plain dsh-llm-pi-ai row;'
      + ' this plugin rotates keys[], where each key names its own apiKeyEnv or dev-only value',
    )
  })

  it('delegates protocol validation to the pi-ai resolver so unserviceable routes fail at load', () => {
    // A model-less hand-declared route resolves; usability is the request
    // path's concern, not load-time profile validation.
    expect(() => resolvePools({ openrouter: { keys: [{ value: 'sk-dev-1' }] } })).not.toThrow()
    expect(() => resolvePools({
      openrouter: { api: 'sigv4-signed', keys: [{ value: 'sk-dev-1' }] },
    })).toThrow(/names api "sigv4-signed", which this build cannot serve/)
  })
})

describe('Config schema', () => {
  it('passes undeclared profile fields through to resolution untouched', () => {
    const parsed = (Config as unknown as (value: unknown) => Config)({
      providers: {
        openrouter: {
          api: 'openai-completions',
          baseURL: 'https://openrouter.example/api/v1',
          models: [{ id: 'mock-model', name: 'Mock Model', contextWindow: 8192 }],
          retryPolicy: { mode: 'normal', maxRetries: 2 },
          keys: [{ apiKeyEnv: 'OPENROUTER_KEY_1' }],
        },
      },
    })
    const source = parsed.providers?.openrouter as Record<string, unknown>
    expect(source.api).toBe('openai-completions')
    expect(source.baseURL).toBe('https://openrouter.example/api/v1')
    expect(source.retryPolicy).toEqual({ mode: 'normal', maxRetries: 2 })
    expect(resolvePools(parsed.providers).pools.size).toBe(1)
  })

  it('materializes an absent providers dict as the empty dormant set', () => {
    const parsed = (Config as unknown as (value?: unknown) => Config)(undefined)
    expect(resolvePools(parsed.providers).pools.size).toBe(0)
  })

  it('carries the park-location fields through the schema', () => {
    const parsed = (Config as unknown as (value: unknown) => Config)({
      parkFile: '/tmp/parks.json',
      dshHome: '/tmp/dsh',
    })
    expect(parsed.parkFile).toBe('/tmp/parks.json')
    expect(parsed.dshHome).toBe('/tmp/dsh')
  })
})

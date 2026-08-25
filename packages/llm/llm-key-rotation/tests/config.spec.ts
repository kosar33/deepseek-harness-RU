import { describe, expect, it } from 'vitest'
import { Config, resolvePools } from '../src/config.ts'
import type { RotationProviderConfig } from '../src/config.ts'

describe('resolvePools', () => {
  it('resolves an absent dict to the dormant posture with no pools', () => {
    expect(resolvePools(undefined)).toEqual({ pools: new Map() })
    expect(resolvePools({})).toEqual({ pools: new Map() })
  })

  it('builds one pool per route with reference labels defaulting to the ref name', () => {
    const { pools } = resolvePools({
      openrouter: {
        keys: [{ apiKeyEnv: 'OPENROUTER_KEY_1' }, { apiKeyEnv: 'OPENROUTER_KEY_2', label: 'spare' }],
      },
    })
    expect([...pools.get('openrouter')?.members ?? []]).toEqual([
      { label: 'OPENROUTER_KEY_1', ref: 'OPENROUTER_KEY_1' },
      { label: 'spare', ref: 'OPENROUTER_KEY_2' },
    ])
    expect(pools.get('openrouter')?.route).toBe('openrouter')
    expect(pools.get('openrouter')?.index).toBe(0)
    expect(pools.get('openrouter')?.parkedUntil.size).toBe(0)
  })

  it('labels literal members by position when no explicit label exists', () => {
    const { pools } = resolvePools({
      openrouter: {
        keys: [{ value: 'sk-dev-1', label: 'dev' }, { value: 'sk-dev-2' }],
      },
    })
    expect([...pools.get('openrouter')?.members ?? []]).toEqual([
      { label: 'dev', value: 'sk-dev-1' },
      { label: 'key-2', value: 'sk-dev-2' },
    ])
  })

  it('reads only the keys list; identity fields stay owned by the route\'s home section', () => {
    // A hand-written entry that still carries profile facts (or a typo of one)
    // resolves on its keys alone — the pool is inert until a plain adapter
    // family serves the same route id.
    const { pools } = resolvePools({
      openrouter: {
        api: 'openai-completions',
        baseURL: 'https://openrouter.example/api/v1',
        models: [{ id: 'mock-model', name: 'Mock Model', contextWindow: 8192 }],
        keys: [{ value: 'sk-dev-1' }],
      } as RotationProviderConfig,
    })
    expect([...pools.get('openrouter')?.members ?? []]).toEqual([{ label: 'key-1', value: 'sk-dev-1' }])
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
    expect(() => resolvePools({ openrouter: { keys: [] } }))
      .toThrow('llm-key-rotation: provider "openrouter" must list at least one key under keys')
  })

  it('rejects an empty provider name', () => {
    expect(() => resolvePools({ '': { keys: [{ value: 'sk-x' }] } }))
      .toThrow('llm-key-rotation: provider names must be non-empty')
  })

  it('refuses apiKeyEnv on a route entry with the pointed replacement message', () => {
    expect(() => resolvePools({
      openrouter: {
        apiKeyEnv: 'OPENROUTER_API_KEY',
        keys: [{ apiKeyEnv: 'OPENROUTER_KEY_1' }],
      } as unknown as RotationProviderConfig,
    })).toThrow(
      'llm-key-rotation: provider "openrouter" sets apiKeyEnv, which belongs on the route\'s own'
      + ' dsh-llm-pi-ai profile; this plugin rotates keys[], where each key names its own'
      + ' apiKeyEnv or dev-only value',
    )
  })

  it('refuses a key naming both or neither credential source', () => {
    expect(() => resolvePools({ openrouter: { keys: [{ apiKeyEnv: 'A_KEY', value: 'sk-x' }] } }))
      .toThrow('llm-key-rotation: provider "openrouter" keys[0] ("A_KEY") sets both apiKeyEnv and value; each key names exactly one')
    expect(() => resolvePools({ openrouter: { keys: [{}] } }))
      .toThrow('llm-key-rotation: provider "openrouter" keys[0] ("key-1") names neither apiKeyEnv nor value; each key names exactly one')
  })
})

describe('Config schema', () => {
  it('materializes an absent providers dict as the empty dormant set', () => {
    const parsed = (Config as unknown as (value?: unknown) => Config)(undefined)
    expect(parsed.providers).toEqual({})
    expect(resolvePools(parsed.providers).pools.size).toBe(0)
  })

  it('keeps route entries to their keys list through the schema', () => {
    const parsed = (Config as unknown as (value: unknown) => Config)({
      providers: {
        openrouter: {
          keys: [{ apiKeyEnv: 'OPENROUTER_KEY_1' }, { value: 'sk-dev', label: 'dev' }],
        },
      },
    })
    expect(resolvePools(parsed.providers).pools.size).toBe(1)
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

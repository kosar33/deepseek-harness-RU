/**
 * Configuration schema and key-pool resolution for the rotation plugin.
 *
 * A `providers` entry names an EXISTING provider route — one a plain adapter
 * family (dsh-llm-pi-ai, dsh-llm-deepseek) already serves — and carries only
 * the ordered `keys` list that overrides that route's native single-key
 * resolution. Identity fields (endpoint, protocol, models) stay owned by the
 * route's home section; this plugin never registers or duplicates them.
 *
 * @module @deepseek-ai/dsh-llm-key-rotation/config
 */

import z from '@deepseek-ai/schemastery'
import { toPoolMember } from './pool.ts'
import type { KeyPool } from './pool.ts'

/** One rotating key: a credential reference or a literal dev-only value, with an optional log label. */
export interface RotationKeyConfig {
  /** Credential reference (environment-variable name) resolved per request. */
  apiKeyEnv?: string
  /** Literal key; dev-only because it lands verbatim in the composition file. */
  value?: string
  /** Stable name used in rotation logs and exhaustion diagnostics; defaults to the reference or the position. */
  label?: string
}

/** The ordered keys this plugin rotates across for one existing provider route. */
export interface RotationProviderConfig {
  /** The ordered keys to rotate across; at least one is required. */
  keys?: RotationKeyConfig[]
}

/** Plugin configuration: which existing routes rotate their keys, and how. */
export interface Config {
  /**
   * Rotated routes keyed by an existing provider route id. An empty (or
   * omitted) dict keeps the plugin dormant; every listed route must already
   * be served by a plain adapter family, whose credentials this plugin then
   * overrides.
   */
  providers?: Record<string, RotationProviderConfig>
  /**
   * Park-state document path; defaults to `.llm-key-rotation-parks.json`
   * beside `.credentials.yaml` under the harness home.
   */
  parkFile?: string
  /** Harness home used when `parkFile` is omitted; defaults to `$DSH_HOME` or `~/.dsh`. */
  dshHome?: string
}

const rotationKey: z<RotationKeyConfig> = z.object({
  apiKeyEnv: z.string().role('credential-ref'),
  value: z.string(),
  label: z.string(),
})

/**
 * Runtime schema for {@link Config}. Only the rotation-specific fields are
 * declared: a route entry is its ordered keys list alone, because every other
 * profile fact belongs to the route's owning section.
 */
export const Config: z<Config> = z.object({
  providers: z.dict(z.object({ keys: z.array(rotationKey) })).default({}),
  parkFile: z.string(),
  dshHome: z.string(),
})

/** The resolved output of one configuration: rotation state, route-keyed. */
export interface ResolvedPools {
  /** Rotation state for every configured route. */
  readonly pools: ReadonlyMap<string, KeyPool>
}

/**
 * Validate the whole providers dict and build the pools. This is the one
 * explicit resolve step, so a missing dict resolves to the empty dormant
 * posture here rather than through a hidden fallback, and every malformed
 * key source, duplicate label, or empty route fails before anything mounts.
 * A route no plain adapter serves would create a pool nobody consults; the
 * settings editor only ever writes routes picked from live provider cards,
 * and a hand-edited typo surfaces as an inert pool rather than a failure.
 * @param providers - configured rotated routes keyed by existing route id.
 * @returns the detached pools, keyed by route.
 */
export function resolvePools(providers: Record<string, RotationProviderConfig> | undefined): ResolvedPools {
  const entries = Object.entries(providers ?? {})
  const pools = new Map<string, KeyPool>()
  for (const [route, source] of entries) {
    if (route.length === 0) throw new Error('llm-key-rotation: provider names must be non-empty')
    if ('apiKeyEnv' in source) {
      throw new Error(
        `llm-key-rotation: provider "${route}" sets apiKeyEnv, which belongs on the route's own`
        + ' dsh-llm-pi-ai profile; this plugin rotates keys[], where each key names its own'
        + ' apiKeyEnv or dev-only value',
      )
    }
    if (!Array.isArray(source.keys) || source.keys.length === 0) {
      throw new Error(`llm-key-rotation: provider "${route}" must list at least one key under keys`)
    }
    const members = source.keys.map((key, position) => {
      const label = key.label ?? key.apiKeyEnv ?? `key-${position + 1}`
      return toPoolMember(route, position, label, key)
    })
    const seen = new Set<string>()
    for (const member of members) {
      if (seen.has(member.label)) {
        throw new Error(`llm-key-rotation: provider "${route}" has duplicate key label "${member.label}"`)
      }
      seen.add(member.label)
    }
    pools.set(route, {
      route,
      members,
      index: 0,
      parkedUntil: new Map(),
    })
  }
  return { pools }
}

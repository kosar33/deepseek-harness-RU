/**
 * Configuration schema and key-pool resolution for the rotation plugin.
 *
 * A `providers` entry reuses the dsh-llm-pi-ai provider-profile fields — the
 * schema passes unknown profile fields through untouched, and profile
 * validation is delegated wholesale to that package's own resolver — minus
 * `apiKeyEnv`, replaced by an ordered `keys` list. Each key names either a
 * credential reference or a literal dev-only value. Resolution fails loud at
 * plugin load for every malformed route, so a composition never mounts half a
 * pool.
 *
 * @module @deepseek-ai/dsh-llm-key-rotation/config
 */

import z from '@deepseek-ai/schemastery'
import { resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiProviderProfile, ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
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

/** A pi-ai provider profile whose credential comes from the ordered {@link keys} list. */
export type RotationProviderConfig = Omit<PiAiProviderProfile, 'apiKeyEnv'> & {
  /** The ordered keys to rotate across; at least one is required. */
  keys?: RotationKeyConfig[]
}

/** Plugin configuration: the rotated provider routes this instance owns. */
export interface Config {
  /**
   * Rotated routes keyed by provider. An empty (or omitted) dict keeps the
   * plugin dormant; every listed route registers on `ctx.llm`, so its route
   * must not also be declared in a plain dsh-llm-pi-ai section.
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
 * declared: schemastery merges undeclared keys back into the result, so each
 * provider's remaining profile fields reach resolution exactly as written and
 * are validated by dsh-llm-pi-ai's resolver.
 */
export const Config: z<Config> = z.object({
  providers: z.dict(z.object({ keys: z.array(rotationKey) })).default({}),
  parkFile: z.string(),
  dshHome: z.string(),
})

/** The resolved output of one configuration: adapter profiles and their pools, both route-keyed. */
export interface ResolvedPools {
  /** Validated pi-ai profiles for every configured route. */
  readonly profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile>
  /** Rotation state for every configured route. */
  readonly pools: ReadonlyMap<string, KeyPool>
}

function stripKeys(source: RotationProviderConfig): PiAiProviderProfile {
  const { keys: _keys, ...profile } = source
  return profile
}

/**
 * Validate the whole providers dict and build the adapter profiles and pools.
 * This is the one explicit resolve step, so a missing dict resolves to the
 * empty dormant posture here rather than through a hidden fallback, and every
 * malformed route, key source, duplicate label, or unserviceable profile fails
 * before anything mounts.
 * @param providers - configured rotated routes.
 * @returns the detached profiles and pools, both keyed by route.
 */
export function resolvePools(providers: Record<string, RotationProviderConfig> | undefined): ResolvedPools {
  const entries = Object.entries(providers ?? {})
  const pools = new Map<string, KeyPool>()
  const plainProfiles: Record<string, PiAiProviderProfile> = {}
  for (const [route, source] of entries) {
    if (route.length === 0) throw new Error('llm-key-rotation: provider names must be non-empty')
    if ('apiKeyEnv' in source) {
      throw new Error(
        `llm-key-rotation: provider "${route}" sets apiKeyEnv, which belongs on a plain dsh-llm-pi-ai row;`
        + ' this plugin rotates keys[], where each key names its own apiKeyEnv or dev-only value',
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
    plainProfiles[route] = stripKeys(source)
  }
  // Profile validation (route names, models, protocols, retry policies) is the
  // pi-ai resolver's job; running it here surfaces those failures at load too.
  const profiles = resolveProfiles(plainProfiles)
  return { profiles, pools }
}

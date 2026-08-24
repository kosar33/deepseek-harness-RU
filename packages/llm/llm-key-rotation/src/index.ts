/**
 * Multi-key rotation for OpenRouter-style provider routes that rate-limit per
 * API key. The plugin owns the provider routes its configuration lists: it
 * builds each route's pi-ai adapter from dsh-llm-pi-ai's own resolution,
 * registers it on `ctx.llm`, and serves every request's credential from an
 * ordered key pool with one sticky position.
 *
 * On a `RATE_LIMIT` failure of a multi-key route, this plugin's listener —
 * registered ahead of ordinary recovery policies — parks the served key until
 * its reset instant (the failure's `providerRetryAfterMs` when surfaced,
 * otherwise the coming UTC midnight that bounds daily quotas), advances the
 * sticky position onto the first non-parked key, and returns
 * `{ kind: 'retry' }` so the loop re-issues the identical request immediately
 * under the next key. When no key is left, the thrown error names every key
 * and its reset instant. Single-key pools delegate untouched, so they behave
 * exactly like the plain adapter.
 *
 * Parks persist in `.llm-key-rotation-parks.json` beside `.credentials.yaml`
 * under the harness home (configurable through `parkFile`/`dshHome`), so an
 * exhausted key stays parked across restarts. On mount the document loads,
 * expired rows drop, rows naming routes or labels the current configuration
 * no longer has are pruned, and live parks reattach by route and label; every
 * park or expiry change rewrites the file atomically at owner-only mode. A
 * missing file is the empty state; a corrupt or wrong-version file fails the
 * mount loud. A failed persistence write never fails the recovery — it logs
 * loudly and rotation continues on in-memory state.
 *
 * Other plugins read rotation state through `ctx.get('llmKeyRotation')`:
 * `snapshot()` renders every route's keys with their status, secrets excluded.
 * Usability in a snapshot is view-only — an expired park reports usable
 * without touching pool state or the file — so a settings-page widget can
 * render «лимит откатится через Nч Mм» from `status.resetAt` without
 * mutating anything.
 *
 * ```yaml
 * - id: llm-openrouter
 *   name: '@deepseek-ai/dsh-llm-key-rotation'
 *   config:
 *     providers:
 *       openrouter:
 *         displayName: OpenRouter
 *         api: openai-completions
 *         baseURL: https://openrouter.ai/api/v1
 *         models:
 *           - id: anthropic/claude-sonnet-4.5
 *             name: Claude Sonnet 4.5
 *             contextWindow: 200000
 *         keys:
 *           - apiKeyEnv: OPENROUTER_KEY_1
 *           - apiKeyEnv: OPENROUTER_KEY_2
 * ```
 *
 * @module @deepseek-ai/dsh-llm-key-rotation
 */

import type { Context } from '@deepseek-ai/cordis'
import type { RequestErrorAction } from '@deepseek-ai/dsh-agent'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmFailure } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter, authContextFrom, credentialStoreFrom } from '@deepseek-ai/dsh-llm-pi-ai'
import { Config, resolvePools } from './config.ts'
import { readParkState, renderParkState, resolveParkSpec, writeParkState } from './park-store.ts'
import type { ParkRecord } from './park-store.ts'
import {
  RATE_LIMIT,
  advanceAfter,
  currentUsable,
  nextUtcMidnight,
  parkMember,
  parkRecordsOf,
  poolExhaustedError,
  resetFromFailure,
} from './pool.ts'
import type { KeyPool, ParkStamp, PoolMember } from './pool.ts'

export { Config } from './config.ts'
export type { RotationKeyConfig, RotationProviderConfig } from './config.ts'
export { PARK_STATE_FILENAME, PARK_STATE_VERSION, resolveParkSpec } from './park-store.ts'
export type { ParkRecord } from './park-store.ts'
export type { ParkStamp } from './pool.ts'
export {
  KEY_POOL_EXHAUSTED,
  advanceAfter,
  currentUsable,
  nextUtcMidnight,
  parkMember,
  parkRecordsOf,
  parkedListing,
  poolExhaustedError,
  resetFromFailure,
} from './pool.ts'

/** Cordis plugin name. */
export const name = 'llm-key-rotation'

/** The hub must exist before the rotated routes can register. */
export const inject = ['llm']

/** Status of one pool key, for state consumers. */
export type KeyRotationKeyStatus =
  | { readonly state: 'usable' }
  | { readonly state: 'parked'; readonly parkedAt: string; readonly resetAt: string }

/** One key's entry in a route snapshot; key values never appear here. */
export interface KeyRotationKeySnapshot {
  /** The provider route this key belongs to. */
  readonly provider: string
  /** Stable label from configuration; named in logs and diagnostics too. */
  readonly label: string
  /** Whether the key comes from a credential reference or a literal value. */
  readonly source: 'reference' | 'literal'
  /** The credential reference name for `reference` sources; never a value. */
  readonly reference?: string
  /** Current status, with ISO 8601 UTC instants when parked. */
  readonly status: KeyRotationKeyStatus
}

/** One provider route's snapshot. */
export interface KeyRotationRouteSnapshot {
  /** The provider route. */
  readonly provider: string
  /** Label at the sticky position a request would authenticate with. */
  readonly activeLabel: string
  /** Every configured key in configuration order. */
  readonly keys: readonly KeyRotationKeySnapshot[]
}

/**
 * The state face other plugins read through `ctx.get('llmKeyRotation')`.
 * Absent while the plugin is dormant (no configured providers).
 */
export interface LlmKeyRotationState {
  /**
   * Render every configured route's pool. Expired parks report as usable
   * without mutating pool state or the persisted file.
   */
  readonly snapshot: () => readonly KeyRotationRouteSnapshot[]
}

/** Describe any thrown value for a log line, without assuming an Error. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Register one rotated adapter, the recovery listener that rotates its keys, and the state face. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const { profiles, pools } = resolvePools(config.providers)
  if (pools.size === 0) return
  const parkFile = resolveParkSpec(config)

  // Restore persisted parks. Expired rows drop here, rows naming routes or
  // labels the current configuration no longer has are pruned, and live ones
  // reattach by route and label.
  const loaded = await readParkState(parkFile.filename)
  let restoredChanged = false
  for (const record of loaded) {
    if (record.resetAt <= Date.now()) {
      restoredChanged = true
      continue
    }
    const pool = pools.get(record.route)
    const index = pool?.members.findIndex(member => member.label === record.label) ?? -1
    if (pool === undefined || index < 0) {
      restoredChanged = true
      continue
    }
    pool.parkedUntil.set(index, { parkedAtMs: record.parkedAt, resetAtMs: record.resetAt })
  }
  // A multi-key pool whose sticky member came back parked starts on the first
  // usable member instead of failing its first request; an unparked pool keeps
  // its position, and when everything is parked the index stays put so
  // requests fail loud with the listing.
  for (const pool of pools.values()) {
    if (pool.members.length < 2 || !pool.parkedUntil.has(pool.index)) continue
    const usable = advanceAfter(pool, pool.index, Date.now())
    if (usable !== undefined) pool.index = usable.index
  }

  const recordsOf = (): ParkRecord[] =>
    [...pools.values()].flatMap(pool => parkRecordsOf(pool, Date.now()))
  const desired = recordsOf()
  if (restoredChanged || renderParkState(desired) !== renderParkState(loaded)) {
    await writeParkState(parkFile.filename, desired)
  }
  let lastPersisted = renderParkState(desired)

  const reportWriteFailure = (error: unknown): void => {
    ctx.logger.error(
      'llm-key-rotation: could not persist park state to %s: %s;'
      + ' rotation continues on in-memory state until this is fixed',
      parkFile.filename,
      describeError(error),
    )
  }
  const persistParks = async (): Promise<void> => {
    const records = recordsOf()
    const json = renderParkState(records)
    if (json === lastPersisted) return
    await writeParkState(parkFile.filename, records)
    lastPersisted = json
  }

  const servePoolMember = async (pool: KeyPool): Promise<string> => {
    const { member } = currentUsable(pool, Date.now())
    // Serving may lazily expire stamps; prune the file to match. The write is
    // fire-and-forget because memory already holds the authoritative state.
    void persistParks().catch(reportWriteFailure)
    if (member.value !== undefined) return member.value
    const ref = member.ref as NonNullable<typeof member.ref>
    const credentials = ctx.get('credentials')
    const hit = credentials !== undefined
      ? (await credentials.resolve(ref))?.value
      : launchEnvironmentOf(ctx).get(ref)?.value
    if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, 'llm-key-rotation', ref)
    throw new LlmError(
      `llm-key-rotation: no credential for provider route "${pool.route}"; pool key "${member.label}"`
      + ` resolves ${ref}, which is not set — store ${ref} through the credentials service`
      + ' or export it in the launching environment',
      'MISSING_CREDENTIAL',
    )
  }

  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: async provider => servePoolMember(pools.get(provider) as KeyPool),
    auth: { credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) },
  })
  const registration = ctx.llm.registerAdapter([...pools.keys()], adapter)

  async function recover(
    { provider, failure }: { provider: string; failure: LlmFailure },
    next: () => Promise<RequestErrorAction>,
  ): Promise<RequestErrorAction> {
    const pool = pools.get(provider)
    // Single-member pools keep today's behavior exactly: every failure reaches
    // downstream recovery untouched, including its backoff waits.
    if (pool === undefined || pool.members.length < 2) return next()
    if (failure.code !== RATE_LIMIT) return next()

    // Runs before ordinary recovery registrations (`prepend`), so a parked key
    // is advanced past before dsh-llm-retry schedules a same-key backoff wait
    // for the very failure this plugin owns.
    const now = Date.now()
    const served = currentUsable(pool, now)
    const until = resetFromFailure(failure, now) ?? nextUtcMidnight(now)
    parkMember(pool, served.index, { parkedAtMs: now, resetAtMs: until })
    // Persist before handing back the retry: a crash after the wire request
    // but before the write would otherwise resurrect the exhausted key on the
    // next boot. A failed write logs loudly and keeps rotating in memory.
    await persistParks().catch(reportWriteFailure)
    const nextMember = advanceAfter(pool, served.index, now)
    if (nextMember === undefined) throw poolExhaustedError(pool)
    pool.index = nextMember.index

    ctx.logger.warn(
      'llm-key-rotation: provider "%s" hit %s on key "%s"; parked until %s; retrying with "%s"',
      pool.route,
      failure.code,
      served.member.label,
      new Date(until).toISOString(),
      nextMember.member.label,
    )
    return { kind: 'retry' }
  }

  const disposeListener = ctx.on('agent/request-error', recover, { prepend: true })

  const state: LlmKeyRotationState = {
    snapshot: () => {
      const now = Date.now()
      return [...pools.values()].map(pool => ({
        provider: pool.route,
        activeLabel: (pool.members[pool.index] as PoolMember).label,
        keys: pool.members.map((member, index) => {
          const stamp: ParkStamp | undefined = pool.parkedUntil.get(index)
          const status = stamp !== undefined && stamp.resetAtMs > now
            ? {
              state: 'parked' as const,
              parkedAt: new Date(stamp.parkedAtMs).toISOString(),
              resetAt: new Date(stamp.resetAtMs).toISOString(),
            }
            : { state: 'usable' as const }
          return member.ref !== undefined
            ? { provider: pool.route, label: member.label, source: 'reference' as const, reference: member.ref, status }
            : { provider: pool.route, label: member.label, source: 'literal' as const, status }
        }),
      }))
    },
  }
  ctx.provide('llmKeyRotation', state)

  ctx.effect(() => () => {
    disposeListener()
    registration()
  }, 'llm-key-rotation: withdraw rotated routes')
}

/**
 * Multi-key rotation for provider routes that rate-limit per API key. The
 * plugin attaches to EXISTING routes — the ones dsh-llm-pi-ai and
 * dsh-llm-deepseek already register from their own sections — and overrides
 * only their credential resolution: each configured route's requests
 * authenticate from an ordered key pool with one sticky position, while every
 * other profile fact (endpoint, protocol, models, retry policy) stays owned
 * by the route's home section. The override travels through the optional
 * `llmApiKeyOverride` service, so adapter registration is untouched: without
 * this plugin nothing changes, and a route listed here but served by no
 * family is an inert pool rather than a second registration.
 *
 * On a `RATE_LIMIT` failure of a multi-key route, this plugin's listener —
 * registered ahead of ordinary recovery policies — parks the served key until
 * its reset instant (the failure's `providerRetryAfterMs` when surfaced,
 * otherwise the coming UTC midnight that bounds daily quotas), advances the
 * sticky position onto the first non-parked key, and returns
 * `{ kind: 'retry' }` so the loop re-issues the identical request immediately
 * under the next key. When no key is left, the thrown error names every key
 * and its reset instant. A 429 that names the provider's shared upstream pool
 * as the limiter parks nothing: the served credential's own quota is
 * untouched, so the failure delegates to ordinary retry backoff on the same
 * key. Single-key pools delegate untouched, so they behave
 * exactly like the native resolution.
 *
 * Route keys resolve through the optional `llm-key-rotation` user-settings
 * section over the composition entry (the same layering every adapter family
 * uses), so the web Models page can edit a provider's rotating keys without
 * hand-editing `cordis.yml`: a committed section change rebuilds the pools,
 * restores their persisted parks, and swaps the overridden route set in place.
 *
 * Parks persist in `.llm-key-rotation-parks.json` beside `.credentials.yaml`
 * under the harness home (configurable through `parkFile`/`dshHome`), so an
 * exhausted key stays parked across restarts. On mount and on every rebuild
 * the document loads, expired rows drop, rows naming routes or labels the
 * current configuration no longer has are pruned, and live parks reattach by
 * route and label; every park or expiry change rewrites the file atomically at
 * owner-only mode. A missing file is the empty state; a corrupt or
 * wrong-version file fails the mount loud. A failed persistence write never
 * fails the recovery — it logs loudly and rotation continues on in-memory
 * state.
 *
 * Other plugins read rotation state through `ctx.get('llmKeyRotation')`:
 * `snapshot()` renders every route's keys with their status, secrets excluded.
 * Usability in a snapshot is view-only — an expired park reports usable
 * without touching pool state or the file — so a settings-page widget can
 * render «лимит откатится через Nч Mм» from `status.resetAt` without
 * mutating anything. The face exists whenever the plugin is composed; a
 * dormant configuration snapshots as an empty list.
 *
 * ```yaml
 * # The route itself lives in its home section, as any provider does:
 * - id: llm-openrouter
 *   name: '@deepseek-ai/dsh-llm-pi-ai'
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
 * # This plugin adds only the rotating keys for that same route id:
 * - id: llm-openrouter-keys
 *   name: '@deepseek-ai/dsh-llm-key-rotation'
 *   config:
 *     providers:
 *       openrouter:
 *         keys:
 *           - apiKeyEnv: OPENROUTER_KEY_1
 *           - apiKeyEnv: OPENROUTER_KEY_2
 * ```
 *
 * @module @deepseek-ai/dsh-llm-key-rotation
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, RequestErrorAction } from '@deepseek-ai/dsh-agent'
import type { LlmApiKeyOverride } from '@deepseek-ai/dsh-llm'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmFailure, ResolvedRetryPolicy } from '@deepseek-ai/dsh-llm'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Config, resolvePools } from './config.ts'
import type { ResolvedPools, RotationProviderConfig } from './config.ts'
import { readParkState, renderParkState, resolveParkSpec, writeParkState } from './park-store.ts'
import type { ParkRecord } from './park-store.ts'
import {
  RATE_LIMIT,
  advanceAfter,
  currentUsable,
  excerptReason,
  isProviderReturnedError,
  isUpstreamPoolLimit,
  nextUtcMidnight,
  parkMember,
  parkRecordsOf,
  poolExhaustedError,
  resetFromFailure,
} from './pool.ts'
import type { ParkStamp, PoolMember } from './pool.ts'

export { Config } from './config.ts'
export type { RotationKeyConfig, RotationProviderConfig } from './config.ts'
export { PARK_STATE_FILENAME, PARK_STATE_VERSION, resolveParkSpec } from './park-store.ts'
export type { ParkRecord } from './park-store.ts'
export type { ParkStamp } from './pool.ts'
export {
  KEY_POOL_EXHAUSTED,
  advanceAfter,
  currentUsable,
  isUpstreamPoolLimit,
  nextUtcMidnight,
  parkMember,
  parkRecordsOf,
  parkedListing,
  poolExhaustedError,
  resetFromFailure,
} from './pool.ts'

/** Cordis plugin name. */
export const name = 'llm-key-rotation'

/** The user-settings namespace this plugin reads its providers dict from. */
const NS = settingsNamespace('llm-key-rotation')

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
 * Provided whenever the plugin is composed; a dormant configuration
 * (no configured providers) snapshots as an empty list.
 */
export interface LlmKeyRotationState {
  /**
   * Render every configured route's pool. Expired parks report as usable
   * without mutating pool state or the persisted file.
   */
  readonly snapshot: () => readonly KeyRotationRouteSnapshot[]
  /**
   * Clear every live park of one route — the operator's escape hatch for
   * parks that turned out to be false (an upstream shared-pool throttle, a
   * stale persisted document). Clears memory and persists immediately;
   * reports whether anything was actually cleared.
   */
  readonly resetParks: (route: string) => boolean
}

/**
 * Describe any thrown value for a log line, without assuming an Error.
 * @param error - the caught value.
 * @returns its message, or its string form for non-Error values.
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Canonical facts of one providers dict for change detection: provider names
 * sorted (dict order carries no meaning), each profile's fields and key order
 * kept verbatim (key order IS rotation priority).
 * @param providers - the configured rotated routes.
 * @returns stable JSON text equal only for semantically equal dicts.
 */
function providersFacts(providers: Record<string, RotationProviderConfig> | undefined): string {
  /* v8 ignore next -- both callers read a schema-parsed Config, whose
     `providers.default({})` materializes the dict before change detection */
  return JSON.stringify(Object.entries(providers ?? {}).sort(([left], [right]) => left.localeCompare(right)))
}

/**
 * Build one configuration's profiles and pools, then restore its parks: rows
 * naming routes or labels the configuration no longer has prune, expired rows
 * drop, live parks reattach by route and label, and a multi-key pool whose
 * sticky member came back parked starts on its first usable member. A changed
 * document rewrites immediately, so the file matches memory before any request
 * can serve from these pools.
 * @param providers - configured rotated routes.
 * @param spec - resolved park-document location.
 * @returns the detached profiles and pools, both keyed by route.
 * @throws when the configuration is malformed or the park document unreadable —
 * both fail the caller loud rather than mounting half a pool.
 */
async function buildWithParks(
  providers: Record<string, RotationProviderConfig> | undefined,
  spec: { filename: string },
): Promise<ResolvedPools> {
  const built = resolvePools(providers)
  if (built.pools.size === 0) return built
  const loaded = await readParkState(spec.filename)
  let restoredChanged = false
  for (const record of loaded) {
    if (record.resetAt <= Date.now()) {
      restoredChanged = true
      continue
    }
    const pool = built.pools.get(record.route)
    const index = pool?.members.findIndex(member => member.label === record.label) ?? -1
    if (pool === undefined || index < 0) {
      restoredChanged = true
      continue
    }
    pool.parkedUntil.set(index, { parkedAtMs: record.parkedAt, resetAtMs: record.resetAt })
  }
  for (const pool of built.pools.values()) {
    if (pool.members.length < 2 || !pool.parkedUntil.has(pool.index)) continue
    const usable = advanceAfter(pool, pool.index, Date.now())
    if (usable !== undefined) pool.index = usable.index
  }
  const desired = [...built.pools.values()].flatMap(pool => parkRecordsOf(pool, Date.now()))
  if (restoredChanged || renderParkState(desired) !== renderParkState(loaded)) {
    await writeParkState(spec.filename, desired)
  }
  return built
}

/** Register one rotated adapter, the recovery listener that rotates its keys, and the state face. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  // The settings scope installs below and repoints this thunk at the resolved
  // section; until then the composition entry is the whole configuration.
  let current: () => Config = () => config
  let state = await buildWithParks(config.providers, resolveParkSpec(config))
  let appliedFacts = providersFacts(config.providers)

  const reportWriteFailure = (error: unknown): void => {
    ctx.logger.error(
      'llm-key-rotation: could not persist park state to %s: %s;'
      + ' rotation continues on in-memory state until this is fixed',
      resolveParkSpec(current()).filename,
      describeError(error),
    )
  }
  // Every pool-health mutation (park, manual reset, sticky advance) pushes
  // the LLM registry's generic refresh event, so open key editors and model
  // lists re-read the face immediately instead of waiting for their next load.
  const notifyPoolsChanged = (): void => { ctx.emit('llm/adapters-updated') }
  const recordsOf = (): ParkRecord[] =>
    [...state.pools.values()].flatMap(pool => parkRecordsOf(pool, Date.now()))
  let lastPersisted = renderParkState(recordsOf())
  const persistParks = async (): Promise<void> => {
    const records = recordsOf()
    const json = renderParkState(records)
    if (json === lastPersisted) return
    await writeParkState(resolveParkSpec(current()).filename, records)
    lastPersisted = json
  }

  /**
   * The override face's one method: the serving key for a rotated route, or
   * `undefined` when the route has no pool and the calling family falls
   * through to its native resolution. A configured key that fails to resolve
   * throws rather than falling back — silently serving the native single key
   * would quietly stop rotating exactly when a key is misconfigured.
   */
  const resolveOverride = async (provider: string): Promise<string | undefined> => {
    const pool = state.pools.get(provider)
    if (pool === undefined) return undefined
    const { member } = currentUsable(pool, Date.now())
    // Serving may lazily expire stamps; prune the file to match. The write is
    // fire-and-forget because memory already holds the authoritative state.
    void persistParks().catch(reportWriteFailure)
    if (member.value !== undefined) return member.value
    const ref = member.ref as NonNullable<typeof member.ref>
    const credentials = ctx.get('credentials')
    const resolved = credentials !== undefined
      ? await credentials.resolve(ref)
      : launchEnvironmentOf(ctx).get(ref)
    // A committed settings change may withdraw or rebuild this route while
    // the credential read was in flight; serving the stale pool's key would
    // authenticate against a configuration that no longer exists.
    if (state.pools.get(provider) !== pool) {
      throw new LlmError(
        `llm-key-rotation: provider route "${provider}" changed while a request was in flight`,
        'MISSING_CREDENTIAL',
      )
    }
    const hit = resolved?.value
    if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, 'llm-key-rotation', ref)
    throw new LlmError(
      `llm-key-rotation: no credential for provider route "${pool.route}"; pool key "${member.label}"`
      + ` resolves ${ref}, which is not set — store ${ref} through the credentials service`
      + ' or export it in the launching environment',
      'MISSING_CREDENTIAL',
    )
  }

  async function recover(
    { agent, provider, failure, retryPolicy }: {
      agent: Agent
      provider: string
      failure: LlmFailure
      retryPolicy: ResolvedRetryPolicy | undefined
    },
    next: () => Promise<RequestErrorAction>,
  ): Promise<RequestErrorAction> {
    const pool = state.pools.get(provider)
    // Single-member pools keep today's behavior exactly: every failure reaches
    // downstream recovery untouched, including its backoff waits.
    if (pool === undefined || pool.members.length < 2) return next()
    // Shared-pool 429s decide first: their flattened body embeds the vendor
    // phrase checked below, but their remedy is same-key backoff, not
    // key rotation.
    if (failure.code === RATE_LIMIT && isUpstreamPoolLimit(failure)) {
      // The 429 names the provider's shared upstream pool as the limiter, so
      // the served key's own quota is untouched: parking would bench every
      // healthy key in the pool until the fallback horizon while the actual
      // remedy — waiting briefly — is ordinary backoff on this same key.
      ctx.logger.warn(
        'llm-key-rotation: provider "%s" hit an upstream shared-pool rate limit on key "%s";'
          + ' leaving rotation untouched for downstream retry; reason: %s',
        pool.route,
        (pool.members[pool.index] as PoolMember).label,
        excerptReason(failure.message),
      )
      return next()
    }
    if (isProviderReturnedError(failure)) {
      // The upstream vendor behind the route failed — not this credential.
      // Same-key exponential backoff belongs to dsh-llm-retry: delegate while
      // its chain still has budget (those attempts render as ordinary visible
      // retry rows carrying the raw network error). Only once the last
      // scheduled same-key retry has already run does rotation advance onto
      // the next key — without parking, so the benched key stays clean.
      const policy = retryPolicy
      if (
        policy !== undefined && policy.mode === 'normal'
        && policy.retryableCodes.includes(failure.code)
      ) {
        // Structural read of the retry plugin's logged chain (dsh-llm-retry
        // owns the event's type declaration; this face stays decoupled).
        const prior = (
          agent.session.events as unknown as readonly {
            type: string
            data?: { provider: string; retry: number; maxRetries: number }
          }[]
        )
          .filter(event => event.type === 'llm/retry' && event.data?.provider === provider)
          .at(-1)
        if (prior === undefined || prior.data === undefined) return next()
        if (prior.data.retry < prior.data.maxRetries) return next()
      }
      const served = currentUsable(pool, Date.now())
      const nextMember = advanceAfter(pool, served.index, Date.now())
      if (nextMember === undefined) return next()
      pool.index = nextMember.index
      notifyPoolsChanged()
      ctx.logger.warn(
        'llm-key-rotation: provider "%s" relayed an upstream vendor error on key "%s";'
          + ' same-key retries spent, retrying with "%s" without parking; reason: %s',
        pool.route,
        served.member.label,
        nextMember.member.label,
        excerptReason(failure.message),
      )
      return { kind: 'retry' }
    }
    if (failure.code !== RATE_LIMIT) return next()

    // Runs before ordinary recovery registrations (`prepend`), so a parked key
    // is advanced past before dsh-llm-retry schedules a same-key backoff wait
    // for the very failure this plugin owns.
    const now = Date.now()
    const served = currentUsable(pool, now)
    const until = resetFromFailure(failure, now) ?? nextUtcMidnight(now)
    // The trimmed upstream text rides the stamp: it re-surfaces in the
    // exhaustion message and the persisted park document, so a later failure
    // names the limiter instead of hiding it behind reset instants.
    parkMember(pool, served.index, { parkedAtMs: now, resetAtMs: until, reason: excerptReason(failure.message) })
    // Persist before handing back the retry: a crash after the wire request
    // but before the write would otherwise resurrect the exhausted key on the
    // next boot. A failed write logs loudly and keeps rotating in memory.
    await persistParks().catch(reportWriteFailure)
    const nextMember = advanceAfter(pool, served.index, now)
    if (nextMember === undefined) throw poolExhaustedError(pool)
    pool.index = nextMember.index
    notifyPoolsChanged()

    ctx.logger.warn(
      'llm-key-rotation: provider "%s" hit %s on key "%s"; parked until %s; retrying with "%s"; reason: %s',
      pool.route,
      failure.code,
      served.member.label,
      new Date(until).toISOString(),
      nextMember.member.label,
      failure.message,
    )
    return { kind: 'retry' }
  }

  const disposeListener = ctx.on('agent/request-error', recover, { prepend: true })

  let rebuildTail: Promise<void> = Promise.resolve()
  /**
   * Queue one rebuild from the current resolved section. Rebuilds serialize on
   * one tail so two rapid writes apply in commit order; a refused candidate
   * (a malformed keys dict) logs loud and leaves the previous pools serving.
   */
  const scheduleRebuild = (): void => {
    rebuildTail = rebuildTail.then(async () => {
      const entry = current()
      const facts = providersFacts(entry.providers)
      if (facts === appliedFacts) return
      state = await buildWithParks(entry.providers, resolveParkSpec(entry))
      lastPersisted = renderParkState(recordsOf())
      appliedFacts = facts
    }).catch((error: unknown) => {
      ctx.logger.error('llm-key-rotation: keeping the previous pools after a refused update')
      ctx.logger.error(error)
    })
  }

  const overrideFace: LlmApiKeyOverride = { resolve: resolveOverride }
  ctx.provide('llmApiKeyOverride', overrideFace)

  const stateFace: LlmKeyRotationState = {
    snapshot: () => {
      const now = Date.now()
      return [...state.pools.values()].map(pool => ({
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
    resetParks: (route) => {
      const pool = state.pools.get(route)
      if (pool === undefined) return false
      const now = Date.now()
      let cleared = 0
      for (const [index, stamp] of pool.parkedUntil) {
        if (stamp.resetAtMs > now) {
          pool.parkedUntil.delete(index)
          cleared += 1
        }
      }
      if (cleared === 0) return false
      ctx.logger.warn('llm-key-rotation: provider "%s": %d park(s) cleared manually', route, cleared)
      // The cleared state must survive a restart like any other park change.
      void persistParks().catch(reportWriteFailure)
      notifyPoolsChanged()
      return true
    },
  }
  ctx.provide('llmKeyRotation', stateFace)

  ctx.effect(() => () => {
    disposeListener()
  }, 'llm-key-rotation: withdraw rotated routes')

  installSettingsSection<Config>(ctx, NS, Config, config, {
    // Refuse an unserviceable section where it is written: without this a
    // schema-valid keys dict the resolver cannot serve would be stored and
    // then silently disable every rotated route.
    validate: (value) => { resolvePools(value.providers) },
    setSource: (source) => { current = source },
    onChange: scheduleRebuild,
  })
}

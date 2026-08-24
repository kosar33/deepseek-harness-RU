/**
 * Per-route key-pool rotation state. One pool holds an ordered list of API-key
 * members, one sticky index naming the member the next request uses, and a
 * park timestamp per member. Parking is lazy: expired timestamps are dropped on
 * read, so no timers run and a parked key returns to service exactly at its
 * reset instant.
 *
 * @module @deepseek-ai/dsh-llm-key-rotation/pool
 */

import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmFailure } from '@deepseek-ai/dsh-llm'
import type { ParkRecord } from './park-store.ts'

/** One rotating credential; exactly one of {@link ref} and {@link value} is set. */
export interface PoolMember {
  /** Stable name for logs and exhaustion diagnostics. */
  readonly label: string
  /** Credential reference resolved per request through the credentials seam. */
  readonly ref?: CredentialRef
  /** Literal dev-only key validated at load and never re-read. */
  readonly value?: string
}

/** When a member was parked and when it returns to service, epoch milliseconds. */
export interface ParkStamp {
  /** When the member served the rate-limited request. */
  readonly parkedAtMs: number
  /** When the member becomes usable again. */
  readonly resetAtMs: number
}

/** One provider route's ordered keys with its sticky position and park stamps. */
export interface KeyPool {
  /** The providers-dict route this pool serves. */
  readonly route: string
  /** Ordered members; index order is configuration order. */
  readonly members: readonly PoolMember[]
  /** Sticky index of the member the next request authenticates with. */
  index: number
  /** Member position to park stamp; absent entries are usable now. */
  readonly parkedUntil: Map<number, ParkStamp>
}

/** Failure code carried by the exhaustion error thrown when every member is parked. */
export const KEY_POOL_EXHAUSTED = 'KEY_POOL_EXHAUSTED'

/** The stable failure code this plugin rotates on. */
export const RATE_LIMIT = 'RATE_LIMIT'

/**
 * The next UTC midnight strictly after `nowMs`, as epoch milliseconds. This is
 * the fallback park duration for daily quota limits whose reset instant the
 * adapter layer does not surface.
 * @param nowMs - current time in epoch milliseconds.
 * @returns the epoch milliseconds of the coming UTC midnight.
 */
export function nextUtcMidnight(nowMs: number): number {
  return Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate() + 1,
  )
}

/**
 * Read the reset hint a failure carries, if any. Adapters surface a validated
 * positive `providerRetryAfterMs`; through the pi-ai path it is absent today,
 * because pi-ai flattens wire errors to message text before they reach the
 * recovery seam.
 * @param failure - the failed attempt's normalized facts.
 * @param nowMs - current time in epoch milliseconds.
 * @returns the absolute reset epoch milliseconds, or undefined when the failure carries none.
 */
export function resetFromFailure(failure: LlmFailure, nowMs: number): number | undefined {
  if (failure.providerRetryAfterMs !== undefined
    && Number.isFinite(failure.providerRetryAfterMs)
    && failure.providerRetryAfterMs > 0) {
    return nowMs + failure.providerRetryAfterMs
  }
  return undefined
}

/** Drop every expired park stamp; a member whose reset has passed is usable again. */
function expire(pool: KeyPool, nowMs: number): void {
  for (const [index, stamp] of pool.parkedUntil) {
    if (stamp.resetAtMs <= nowMs) pool.parkedUntil.delete(index)
  }
}

/** A usable member position together with its member record. */
export interface UsableMember {
  /** Position inside {@link KeyPool.members}. */
  readonly index: number
  /** The member at that position. */
  readonly member: PoolMember
}

/**
 * The sticky member a request authenticates with, expiring stale parks on the
 * way in. Recovery only ever advances onto a non-parked member, so reaching a
 * parked-and-unexpired sticky index here means concurrent requests exhausted
 * the remaining members after that advance; the scan falls back to any usable
 * member before failing loud.
 * @param pool - the pool serving the request.
 * @param nowMs - current time in epoch milliseconds.
 * @returns the usable position and its member.
 * @throws LlmError code `KEY_POOL_EXHAUSTED` when every member is parked.
 */
export function currentUsable(pool: KeyPool, nowMs: number): UsableMember {
  expire(pool, nowMs)
  if (!pool.parkedUntil.has(pool.index)) return { index: pool.index, member: pool.members[pool.index] as PoolMember }
  for (let offset = 1; offset < pool.members.length; offset += 1) {
    const candidate = (pool.index + offset) % pool.members.length
    if (!pool.parkedUntil.has(candidate)) {
      pool.index = candidate
      return { index: candidate, member: pool.members[candidate] as PoolMember }
    }
  }
  throw poolExhaustedError(pool)
}

/**
 * Park one member until its reset instant.
 * @param pool - the pool owning the member.
 * @param index - the member position that served the rate-limited request.
 * @param stamp - when the park happened and when the member returns.
 */
export function parkMember(pool: KeyPool, index: number, stamp: ParkStamp): void {
  pool.parkedUntil.set(index, stamp)
}

/**
 * The first non-parked member after `fromIndex`, wrapping once through the
 * whole list. Parks are not expired for members other than by this read: an
 * expired stamp makes its member selectable again immediately.
 * @param pool - the pool recovering from a rate-limited request.
 * @param fromIndex - the member position just parked.
 * @param nowMs - current time in epoch milliseconds.
 * @returns the position to advance onto with its member, or undefined when none is usable.
 */
export function advanceAfter(pool: KeyPool, fromIndex: number, nowMs: number): UsableMember | undefined {
  expire(pool, nowMs)
  for (let offset = 1; offset <= pool.members.length; offset += 1) {
    const candidate = (fromIndex + offset) % pool.members.length
    if (!pool.parkedUntil.has(candidate)) return { index: candidate, member: pool.members[candidate] as PoolMember }
  }
  return undefined
}

/**
 * Render every member with its park state, secrets excluded, for loud failures.
 * @param pool - the pool whose availability is being described.
 * @returns one line listing each label and its reset instant.
 */
export function parkedListing(pool: KeyPool): string {
  return pool.members.map((member, index) => {
    const stamp = pool.parkedUntil.get(index)
    return `${member.label} parked until ${stamp === undefined ? 'unknown' : new Date(stamp.resetAtMs).toISOString()}`
  }).join(', ')
}

/**
 * Derive the park records worth persisting for one pool: every member with a
 * live (unexpired) stamp, in member order. Expired stamps are skipped rather
 * than deleted, so a read-only derivation never mutates pool state; the file
 * prunes them the next time any change persists.
 * @param pool - the pool whose parks are being persisted.
 * @param nowMs - current time in epoch milliseconds.
 * @returns one record per still-parked member.
 */
export function parkRecordsOf(pool: KeyPool, nowMs: number): ParkRecord[] {
  const records: ParkRecord[] = []
  for (const [index, stamp] of pool.parkedUntil) {
    if (stamp.resetAtMs <= nowMs) continue
    records.push({
      route: pool.route,
      label: (pool.members[index] as PoolMember).label,
      parkedAt: stamp.parkedAtMs,
      resetAt: stamp.resetAtMs,
    })
  }
  return records
}

/**
 * The loud exhaustion error listing every key and its reset instant. Thrown
 * from the recovery waterfall so the failed step surfaces it verbatim, and
 * from the request path when serving finds no usable member.
 * @param pool - the pool whose members are all parked or otherwise unusable.
 * @returns the error to throw; carries code {@link KEY_POOL_EXHAUSTED}.
 */
export function poolExhaustedError(pool: KeyPool): LlmError {
  return new LlmError(
    `llm-key-rotation: every key for provider route "${pool.route}" is rate-limited: ${parkedListing(pool)}`,
    KEY_POOL_EXHAUSTED,
  )
}

/**
 * Validate one raw member source into its pool form. Exactly one of the
 * credential reference and the literal value must be present; a literal is
 * checked against the shared api-key usability rules immediately so blank or
 * non-header-safe values fail at load.
 * @param route - the owning provider route, named in every diagnostic.
 * @param position - the member's zero-based position, named in diagnostics.
 * @param label - resolved display label for logs and diagnostics.
 * @param source - the configured member fields.
 * @returns the immutable member.
 * @throws TypeError when a reference violates the credential-ref grammar.
 * @throws LlmError when a literal value is blank or cannot ride an HTTP header.
 */
export function toPoolMember(
  route: string,
  position: number,
  label: string,
  source: { apiKeyEnv?: string; value?: string },
): PoolMember {
  const where = `llm-key-rotation: provider "${route}" keys[${position}] ("${label}")`
  if (source.apiKeyEnv !== undefined && source.value !== undefined) {
    throw new Error(`${where} sets both apiKeyEnv and value; each key names exactly one`)
  }
  if (source.apiKeyEnv !== undefined) {
    return Object.freeze({ label, ref: credentialRef(source.apiKeyEnv) })
  }
  if (source.value !== undefined) {
    return Object.freeze({ label, value: assertUsableApiKey(source.value, 'llm-key-rotation', `providers.${route}.keys[${position}]`) })
  }
  throw new Error(`${where} names neither apiKeyEnv nor value; each key names exactly one`)
}

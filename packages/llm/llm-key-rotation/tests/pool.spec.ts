import { describe, expect, it } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import {
  KEY_POOL_EXHAUSTED,
  advanceAfter,
  currentUsable,
  nextUtcMidnight,
  parkRecordsOf,
  parkedListing,
  parkMember,
  poolExhaustedError,
  resetFromFailure,
  toPoolMember,
} from '../src/pool.ts'
import type { KeyPool } from '../src/pool.ts'

function pool(members: readonly string[], route = 'openrouter'): KeyPool {
  return {
    route,
    members: members.map(label => ({ label })),
    index: 0,
    parkedUntil: new Map(),
  }
}

const NOW = Date.UTC(2026, 2, 15, 10, 30, 0)

describe('reset instants', () => {
  it('falls back to the coming UTC midnight for daily quotas', () => {
    expect(nextUtcMidnight(NOW)).toBe(Date.UTC(2026, 2, 16))
  })

  it('rolls over when asked exactly at UTC midnight', () => {
    expect(nextUtcMidnight(Date.UTC(2026, 2, 16))).toBe(Date.UTC(2026, 2, 17))
  })

  it('honors a positive finite provider delay and ignores absent or invalid ones', () => {
    expect(resetFromFailure({ message: 'limited', code: 'RATE_LIMIT', providerRetryAfterMs: 1_500 }, NOW)).toBe(NOW + 1_500)
    expect(resetFromFailure({ message: 'limited', code: 'RATE_LIMIT' }, NOW)).toBeUndefined()
    expect(resetFromFailure({ message: 'limited', code: 'RATE_LIMIT', providerRetryAfterMs: 0 }, NOW)).toBeUndefined()
    expect(resetFromFailure({ message: 'limited', code: 'RATE_LIMIT', providerRetryAfterMs: Number.POSITIVE_INFINITY }, NOW)).toBeUndefined()
  })
})

describe('serving and advancing', () => {
  it('serves the sticky member while nothing is parked', () => {
    const subject = pool(['a', 'b'])
    expect(currentUsable(subject, NOW)).toEqual({ index: 0, member: { label: 'a' } })
    expect(parkedListing(subject)).toBe('a parked until unknown, b parked until unknown')
  })

  it('advances past the just-parked member and wraps around', () => {
    const subject = pool(['a', 'b', 'c'])
    parkMember(subject, 0, { parkedAtMs: NOW, resetAtMs: NOW + 1_000 })
    expect(advanceAfter(subject, 0, NOW)).toEqual({ index: 1, member: { label: 'b' } })
    parkMember(subject, 1, { parkedAtMs: NOW, resetAtMs: NOW + 1_000 })
    expect(advanceAfter(subject, 1, NOW)).toEqual({ index: 2, member: { label: 'c' } })
    parkMember(subject, 2, { parkedAtMs: NOW, resetAtMs: NOW + 1_000 })
    expect(advanceAfter(subject, 2, NOW)).toBeUndefined()
  })

  it('re-selects a member whose park stamp expired at its reset instant', () => {
    const subject = pool(['a', 'b'])
    parkMember(subject, 0, { parkedAtMs: NOW, resetAtMs: NOW + 1_000 })
    // Before a's reset, the only usable member is the caller's own position,
    // so advancing from it stays put rather than parking everything.
    expect(advanceAfter(subject, 1, NOW)).toEqual({ index: 1, member: { label: 'b' } })
    // The read itself expires stamps at or below now, so a becomes selectable
    // again exactly at its reset instant.
    expect(advanceAfter(subject, 1, NOW + 1_001)).toEqual({ index: 0, member: { label: 'a' } })
    expect(subject.parkedUntil.size).toBe(0)
  })

  it('fails loud naming every key and reset instant once all are parked', () => {
    const subject = pool(['alpha', 'beta'], 'openrouter')
    parkMember(subject, 0, { parkedAtMs: NOW, resetAtMs: Date.UTC(2026, 4, 1) })
    parkMember(subject, 1, { parkedAtMs: NOW, resetAtMs: Date.UTC(2026, 4, 2) })
    expect(() => currentUsable(subject, NOW)).toThrow(LlmError)
    try {
      currentUsable(subject, NOW)
      expect.unreachable()
    } catch (error: unknown) {
      expect((error as LlmError).code).toBe(KEY_POOL_EXHAUSTED)
      expect((error as LlmError).failure.code).toBe(KEY_POOL_EXHAUSTED)
      expect((error as LlmError).message).toContain(
        'every key for provider route "openrouter" is rate-limited:'
          + ' alpha parked until 2026-05-01T00:00:00.000Z, beta parked until 2026-05-02T00:00:00.000Z',
      )
    }
  })

  it('recovers serving onto the first usable member when the sticky one parks concurrently', () => {
    const subject = pool(['a', 'b', 'c'])
    subject.index = 2
    parkMember(subject, 2, { parkedAtMs: NOW, resetAtMs: NOW + 1_000 })
    expect(currentUsable(subject, NOW)).toEqual({ index: 0, member: { label: 'a' } })
    expect(subject.index).toBe(0)
  })

  it('renders the exhaustion error for direct throwing from recovery', () => {
    const subject = pool(['only-one'])
    parkMember(subject, 0, { parkedAtMs: NOW, resetAtMs: Date.UTC(2026, 4, 1) })
    const error = poolExhaustedError(subject)
    expect(error).toBeInstanceOf(LlmError)
    expect(error.message).toContain('only-one parked until 2026-05-01T00:00:00.000Z')
  })

  it('derives persistence records for live parks and skips expired ones without mutating state', () => {
    const subject = pool(['alpha', 'beta'])
    parkMember(subject, 0, { parkedAtMs: NOW - 5_000, resetAtMs: Date.UTC(2026, 4, 1) })
    parkMember(subject, 1, { parkedAtMs: NOW - 4_000, resetAtMs: NOW - 1_000 })
    expect(parkRecordsOf(subject, NOW)).toEqual([
      { route: 'openrouter', label: 'alpha', parkedAt: NOW - 5_000, resetAt: Date.UTC(2026, 4, 1) },
    ])
    // The read-only derivation leaves the expired stamp in place; the file
    // prunes it on the next persist while memory expires it lazily.
    expect(subject.parkedUntil.size).toBe(2)
  })
})

describe('member validation', () => {
  it('builds reference and literal members with their labels', () => {
    expect(toPoolMember('route', 0, 'first', { apiKeyEnv: 'OPENROUTER_KEY_1' }))
      .toEqual({ label: 'first', ref: 'OPENROUTER_KEY_1' })
    expect(toPoolMember('route', 1, 'dev', { value: ' sk-literal ' }))
      .toEqual({ label: 'dev', value: 'sk-literal' })
  })

  it('rejects a member naming both sources, neither source, or a malformed reference', () => {
    expect(() => toPoolMember('route', 0, 'x', { apiKeyEnv: 'A_KEY', value: 'sk-x' }))
      .toThrow('llm-key-rotation: provider "route" keys[0] ("x") sets both apiKeyEnv and value; each key names exactly one')
    expect(() => toPoolMember('route', 0, 'x', {}))
      .toThrow('llm-key-rotation: provider "route" keys[0] ("x") names neither apiKeyEnv nor value; each key names exactly one')
    expect(() => toPoolMember('route', 0, 'x', { apiKeyEnv: 'not-a-ref' }))
      .toThrow(/credential ref "not-a-ref" must match/)
  })

  it('rejects a blank or non-header-safe literal at load instead of inside fetch', () => {
    expect(() => toPoolMember('route', 0, 'blank', { value: '   ' }))
      .toThrow(/the API key resolved from providers.route.keys\[0\] is blank/)
    expect(() => toPoolMember('route', 1, 'emoji', { value: 'sk-\u{1F600}' }))
      .toThrow(/contains characters no HTTP header can carry/)
  })
})

/**
 * Pure countdown formatting for parked keys: the section renders
 * «лимит откатится через Nч Mм» from a snapshot's `resetAt` without touching
 * pool state, so this module stays a function of (resetAt, now) only.
 * @module @deepseek-ai/dsh-client-ui-settings-key-rotation/countdown
 */

import { countdownParts, fill } from './store.ts'
import type { en } from './locales.ts'

/** Copy key of the template a remaining duration renders through. */
export type CountdownCopyKey = keyof Pick<typeof en, 'resetCountdownHours' | 'resetCountdownMinutes'>

/**
 * Choose the template and fill its slots for one parked key.
 * @param resetAt - ISO 8601 reset instant from the wire snapshot.
 * @param nowMs - current time in epoch milliseconds.
 * @param copy - the two localized templates (hours / minutes-only).
 * @returns the rendered countdown text.
 */
export function formatResetCountdown(
  resetAt: string,
  nowMs: number,
  copy: Record<CountdownCopyKey, string>,
): string {
  const { hours, minutes } = countdownParts(resetAt, nowMs)
  if (hours > 0) {
    return fill(copy.resetCountdownHours, { h: String(hours), m: String(minutes) })
  }
  return fill(copy.resetCountdownMinutes, { m: String(minutes) })
}

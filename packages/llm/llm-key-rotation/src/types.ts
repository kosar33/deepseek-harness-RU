/**
 * Session-event contract owned by this package: the durable record of one
 * rotating-pool advance onto another credential.
 * @module @deepseek-ai/dsh-llm-key-rotation/types
 */

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Durable record written when the sticky position of one rotating pool
     * advances onto its next credential after a failed request attempt.
     */
    'llm/key-rotated': LlmKeyRotatedEventData
  }
}

/** Why the sticky position left the served credential. */
export type KeyRotatedCause =
  /**
   * The served key drew a rate limit this deployment parks: the record rides
   * the same park decision the recovery listener made.
   */
  | 'rate-limit'
  /**
   * The gateway relayed its upstream vendor's error and the same-key retry
   * chain spent itself; nothing was parked, the position simply moved on.
   */
  | 'vendor-relay'

/** Durable payload recorded when rotation advances a pool onto its next credential. */
export interface LlmKeyRotatedEventData {
  /** Registered provider route whose pool advanced. */
  provider: string
  /** Label of the credential that served the failed attempt. */
  from: string
  /** Label of the credential the next attempt uses. */
  to: string
  /** Why the served credential was left. */
  cause: KeyRotatedCause
  /** ISO reset instant carried by a rate-limit park; absent otherwise. */
  resetAt?: string
  /** Trimmed upstream text naming the failure; absent when the body said nothing usable. */
  reason?: string
}

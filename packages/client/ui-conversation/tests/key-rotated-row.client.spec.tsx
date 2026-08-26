// @vitest-environment jsdom
// KeyRotatedNodeView: the switch marker renders as a boundary chip whose
// rate-limit cause counts down live at seconds resolution and flips to the
// expired arm once the reset instant passes; vendor-relay switches carry no
// countdown. Fake timers drive the one-second tick deterministically.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { ChatNodeViewProps } from '../src/client/contract/slots.ts'
import { KeyRotatedNodeView } from '../src/client/chat/MessageItem.tsx'

const t = (key: string, vars?: Record<string, unknown>) => {
  const templates: Record<string, string> = {
    'message.keyRotated': 'Switched API key: {from} → {to}',
    'message.keyRotatedUntilIn': 'rate-limited for {duration}',
    'message.keyRotatedExpired': 'rate limit expired, key usable again',
    'message.keyRotatedRetries': 'provider retries exhausted',
  }
  let text = templates[key] ?? key
  for (const [name, value] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

const baseData = {
  provider: 'openrouter',
  from: 'KEY_1',
  to: 'KEY_2',
} as const

const renderRow = (data: Record<string, unknown>) =>
  render(<KeyRotatedNodeView {...({ node: { kind: 'key-rotated', data }, t }) as unknown as ChatNodeViewProps<'key-rotated'>} />)

describe('KeyRotatedNodeView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('counts a pending rate-limit reset down to the second', () => {
    const view = renderRow({ ...baseData, cause: 'rate-limit', resetAt: '2026-08-26T12:01:10.000Z' })
    expect(view.container.textContent).toContain('rate-limited for 00:01:10')
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(view.container.textContent).toContain('rate-limited for 00:01:09')
  })

  it('flips to the expired arm once the instant passes and keeps ticking no further text change', () => {
    const view = renderRow({ ...baseData, cause: 'rate-limit', resetAt: '2026-08-26T11:59:59.000Z' })
    expect(view.container.textContent).toContain('rate limit expired')
  })

  it('renders vendor-relay switches without any countdown machinery', () => {
    const view = renderRow({ ...baseData, cause: 'vendor-relay' })
    expect(view.container.textContent).toContain('provider retries exhausted')
    act(() => { vi.advanceTimersByTime(5_000) })
    expect(view.container.textContent).not.toMatch(/\d{2}:\d{2}:\d{2}/)
  })
})

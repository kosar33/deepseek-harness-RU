// @vitest-environment jsdom
/** Provider-card credential seat behavior over a scripted wire face: chips, rows, writes, failures. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  KeyRotationRouteView, RpcResponse, SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { KeysEditor } from '../src/client/KeysEditor.tsx'
import type { KeysEditorInjected, KeysEditorProps } from '../src/client/KeysEditor.tsx'
import { createKeyRotationStore } from '../src/client/store.ts'
import type { KeyRotationStore } from '../src/client/store.ts'
import { en, ru } from '../src/client/locales.ts'

afterEach(cleanup)

let nextRpc = 0
function ok<T>(value: T): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: true, value } }
}
function fail<T>(message: string): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: false, error: { code: 'internal', message, details: {} } } }
}

const RESET_AT = '2026-08-25T00:00:00.000Z'
const NOW = Date.parse('2026-08-24T12:00:00.000Z')

const ROUTES: KeyRotationRouteView[] = [{
  provider: 'openrouter',
  activeLabel: 'OPENROUTER_KEYROTATION_2',
  keys: [
    {
      label: 'OPENROUTER_KEYROTATION_1',
      source: 'reference',
      reference: 'OPENROUTER_KEYROTATION_1',
      status: { state: 'parked', parkedAt: '2026-08-24T10:00:00.000Z', resetAt: RESET_AT },
    },
    { label: 'OPENROUTER_KEYROTATION_2', source: 'reference', reference: 'OPENROUTER_KEYROTATION_2', status: { state: 'usable' } },
  ],
}]

/** A pool where the sticky key, a spare, and a parked key are three distinct rows. */
const THREE_KEYS: KeyRotationRouteView = {
  provider: 'openrouter',
  activeLabel: 'K2',
  keys: [
    {
      label: 'K1', source: 'reference', reference: 'K1',
      status: { state: 'parked', parkedAt: '2026-08-24T10:00:00.000Z', resetAt: RESET_AT },
    },
    { label: 'K2', source: 'reference', reference: 'K2', status: { state: 'usable' } },
    { label: 'K3', source: 'reference', reference: 'K3', status: { state: 'usable' } },
  ],
}

const STORED: Record<string, string[]> = {
  openrouter: ['OPENROUTER_KEYROTATION_1', 'OPENROUTER_KEYROTATION_2'],
  other: ['OTHER_KEY_1'],
}

function namespace(): SettingsNamespaceView {
  return {
    ns: 'llm-key-rotation',
    schema: {},
    value: {
      providers: Object.fromEntries(Object.entries(STORED).map(([route, refs]) => [
        route,
        { keys: refs.map(apiKeyEnv => ({ apiKeyEnv })) },
      ])),
    },
    base: { providers: {} },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  }
}

interface ScriptedOptions {
  routes?: KeyRotationRouteView[]
  namespaces?: SettingsNamespaceView[]
  writable?: boolean
  mutateAnswer?: RpcResponse<SettingsNamespaceView>
  resetAnswer?: RpcResponse<{ configured: boolean; routes: KeyRotationRouteView[] }>
}

function scripted(options: ScriptedOptions = {}): {
  controller: KeyRotationStore
  mutations: Array<{ ns: string; ops: unknown }>
  sets: Array<{ ref: string; value: string }>
  unsets: Array<{ ref: string }>
  resets: string[]
} {
  const mutations: Array<{ ns: string; ops: unknown }> = []
  const sets: Array<{ ref: string; value: string }> = []
  const unsets: Array<{ ref: string }> = []
  const resets: string[] = []
  const face = {
    llm: {
      keyRotation: () => Promise.resolve(ok({ configured: true, routes: options.routes ?? ROUTES })),
      keyRotationResetParks: (payload: { provider: string }) => {
        resets.push(payload.provider)
        return Promise.resolve(options.resetAnswer ?? ok({ configured: true, routes: options.routes ?? ROUTES }))
      },
    },
    settings: {
      describe: () => Promise.resolve(ok({
        writable: options.writable ?? true,
        hasDocument: false,
        namespaces: options.namespaces ?? [namespace()],
      })),
      mutate: (payload: { ns: string; ops: unknown }) => {
        mutations.push(payload)
        return Promise.resolve(options.mutateAnswer ?? ok(namespace()))
      },
    },
    credentials: {
      set: (payload: { ref: string; value: string }) => {
        sets.push(payload)
        return Promise.resolve(ok({}))
      },
      unset: (payload: { ref: string }) => {
        unsets.push(payload)
        return Promise.resolve(ok({}))
      },
    },
  }
  const mirror = new SettingsDescribeMirror(face as never)
  const controller = createKeyRotationStore(face as never, mirror)
  return { controller, mutations, sets, unsets, resets }
}

type SeatT = KeysEditorInjected['t']

/** Framework standard-kit hooks the seat never reads. */
const runtime = {
  useSessions: (() => { throw new Error('unused') }) as never,
  useWorkspaces: (() => { throw new Error('unused') }) as never,
}

interface MountOptions extends ScriptedOptions {
  provider?: string
  t?: SeatT
  /** Skip the pre-mount controller.load(); the seat itself loads from idle. */
  preload?: boolean
}

async function mountSeat(options: MountOptions = {}) {
  const wired = scripted(options)
  if (options.preload !== false) await wired.controller.load()
  const props: KeysEditorProps = {
    ...runtime,
    provider: options.provider ?? 'openrouter',
    controller: wired.controller,
    useSnapshot: bindSnapshotSelector(wired.controller.store),
    t: options.t ?? (key => en[key]),
  }
  const view = render(<KeysEditor {...props} />)
  return { view, props, ...wired }
}

/** The password input of one row, addressed by its displayed position. */
function valueInput(index: number): HTMLInputElement {
  return screen.getByLabelText(`${en.keyValue} ${index + 1}`) as HTMLInputElement
}

/** The reference labels currently shown, in row order. */
function shownRefs(): string[] {
  return [...document.querySelectorAll('span[class*="ref"]')].map(node => node.textContent ?? '')
}

describe('KeysEditor posture', () => {
  it('renders nothing before the slot injects its dependencies', () => {
    render(<KeysEditor {...runtime} provider="openrouter" />)
    expect(document.body.textContent).toBe('')
  })

  it('loads the shared store on first render and reaches the ready seat', async () => {
    const wired = scripted()
    // Idle store: the seat itself enters the first load, with no pre-mount fetch.
    expect(wired.controller.store.getSnapshot().status).toBe('idle')
    render(
      <KeysEditor
        {...runtime}
        provider="openrouter"
        controller={wired.controller}
        useSnapshot={bindSnapshotSelector(wired.controller.store)}
        t={key => en[key]}
      />,
    )
    await screen.findByText(en.keys)
    expect(wired.controller.store.getSnapshot().status).toBe('ready')
    // Stored rows materialize from the namespace once the answer lands.
    expect(shownRefs()).toEqual(['OPENROUTER_KEYROTATION_1', 'OPENROUTER_KEYROTATION_2'])
  })

  it('renders the load failure with a working retry', async () => {
    let reads = 0
    const face = {
      llm: { keyRotation: () => { reads += 1; return Promise.resolve(fail('host exploded')) } },
      settings: { describe: () => Promise.resolve(fail('unused')) },
      credentials: {
        set: () => Promise.resolve(ok({})),
        unset: () => Promise.resolve(ok({})),
      },
    }
    const mirror = new SettingsDescribeMirror(face as never)
    const controller = createKeyRotationStore(face as never, mirror)
    await controller.load()
    render(
      <KeysEditor
        {...runtime}
        provider="openrouter"
        controller={controller}
        useSnapshot={bindSnapshotSelector(controller.store)}
        t={key => en[key]}
      />,
    )
    expect(screen.getByText(`${en.loadFailed}: host exploded`)).toBeTruthy()
    // Retrying re-enters the load through the same controller.
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(reads).toBe(2) })
    expect(screen.getByText(`${en.loadFailed}: host exploded`)).toBeTruthy()
  })

  it('keeps the seat hidden while a stale draft waits out a refresh', async () => {
    const mounted = await mountSeat()
    // A pushed invalidation flips the shared store into a reload while the card
    // is simultaneously re-pointed at another route: no draft can render yet.
    act(() => { mounted.controller.store.update((state) => { state.status = 'loading' }) })
    mounted.view.rerender(<KeysEditor {...mounted.props} provider="other" />)
    expect(document.body.textContent).toBe('')
    // The reload settles and rebuilds the draft for the new route only.
    await act(async () => { await mounted.controller.load() })
    expect(shownRefs()).toEqual(['OTHER_KEY_1'])
  })
})

describe('key pool chips', () => {
  it('highlights the sticky key, marks the parked one, and ages its countdown', async () => {
    vi.useFakeTimers({ now: NOW })
    try {
      await mountSeat({ routes: [THREE_KEYS] })
      // State pills ride each key's own line, so a pill exists only for a
      // rendered row: adding the third row surfaces its usable state.
      fireEvent.click(screen.getByRole('button', { name: `+ ${en.addKey}` }))
      const active = screen.getByText(en.activeChip)
      expect(active.className).toContain('chipActive')
      const parked = screen.getByText(en.parkedChip)
      expect(parked.className).toContain('chipParked')
      expect(parked.className).not.toContain('chipActive')
      const usable = screen.getByText(en.usableChip)
      expect(usable.className).not.toContain('chipActive')
      expect(usable.className).not.toContain('chipParked')
      // «лимит откатится через Nч Mм» — computed from resetAt against now.
      expect(screen.getByText(/Limit resets in/).textContent).toBe('Limit resets in 12 h 0 min')
      // The wall-clock tick re-renders the countdown from the same resetAt.
      act(() => { vi.advanceTimersByTime(30 * 60_000) })
      expect(screen.getByText(/Limit resets in/).textContent).toBe('Limit resets in 11 h 30 min')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reads sub-hour resets in minutes only', async () => {
    vi.useFakeTimers({ now: Date.parse(RESET_AT) - 30 * 60_000 })
    try {
      await mountSeat()
      expect(screen.getByText(/Limit resets in/).textContent).toBe('Limit resets in 30 min')
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders the localized russian copy including the countdown template', async () => {
    vi.useFakeTimers({ now: NOW })
    const russian: SeatT = key => ru[key]
    try {
      await mountSeat({ routes: [THREE_KEYS], t: russian })
      fireEvent.click(screen.getByRole('button', { name: `+ ${russian('addKey')}` }))
      expect(screen.getByText(russian('keys'))).toBeTruthy()
      expect(screen.getByText(russian('activeChip'))).toBeTruthy()
      expect(screen.getByText(russian('parkedChip'))).toBeTruthy()
      expect(screen.getByText(russian('usableChip'))).toBeTruthy()
      const countdown = screen.getByText(/Лимит откатится через/)
      expect(countdown.textContent).toMatch(/^Лимит откатится через \d+ ч \d+ мин$/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders no chips while the route reports no pool', async () => {
    await mountSeat({ routes: [] })
    expect(screen.queryByText(en.activeChip)).toBeNull()
    expect(screen.queryByText(en.parkedChip)).toBeNull()
    // The editor itself still serves the stored references.
    expect(shownRefs()).toHaveLength(2)
  })
})

describe('row editing', () => {
  it('initializes rows from the stored references with stored placeholders', async () => {
    await mountSeat()
    expect(shownRefs()).toEqual(['OPENROUTER_KEYROTATION_1', 'OPENROUTER_KEYROTATION_2'])
    expect(valueInput(0).type).toBe('password')
    expect(valueInput(0).placeholder).toBe(en.keyStored)
    expect(valueInput(1).placeholder).toBe(en.keyStored)
  })

  it('rebuilds the draft when the owner re-points the card at another route', async () => {
    const mounted = await mountSeat()
    fireEvent.change(valueInput(0), { target: { value: 'typed-and-doomed' } })
    mounted.view.rerender(<KeysEditor {...mounted.props} provider="other" />)
    expect(shownRefs()).toEqual(['OTHER_KEY_1'])
    // The typed value belonged to the previous route's draft and is gone.
    expect(valueInput(0).value).toBe('')
  })

  it('derives the next reference when a key row is added', async () => {
    await mountSeat()
    expect(screen.queryByText('OPENROUTER_KEYROTATION_3')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `+ ${en.addKey}` }))
    expect(shownRefs()).toEqual([
      'OPENROUTER_KEYROTATION_1', 'OPENROUTER_KEYROTATION_2', 'OPENROUTER_KEYROTATION_3',
    ])
    // The brand-new row addresses nothing stored yet: its placeholder invites a value.
    const added = valueInput(2)
    expect(added.placeholder).toBe(en.keyValuePlaceholder)
    expect(added.value).toBe('')
  })

  it('derives the first reference on a route with nothing stored', async () => {
    await mountSeat({ routes: [], namespaces: [{ ...namespace(), value: { providers: {} } }] })
    expect(shownRefs()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: `+ ${en.addKey}` }))
    expect(shownRefs()).toEqual(['OPENROUTER_KEYROTATION_1'])
  })

  it('moves rows within the list and keeps the end arrows clamped', async () => {
    await mountSeat()
    // Row 1 sits at the top: its up arrow is clamped; the last row's down arrow too.
    expect(screen.getAllByLabelText(en.moveUp)[0]).toHaveProperty('disabled', true)
    const downs = screen.getAllByLabelText(en.moveDown)
    expect(downs[downs.length - 1]).toHaveProperty('disabled', true)
    // Moving row 1 down flips the reference order without moving secrets.
    fireEvent.click(downs[0]!)
    expect(shownRefs()).toEqual(['OPENROUTER_KEYROTATION_2', 'OPENROUTER_KEYROTATION_1'])
    fireEvent.click(screen.getAllByLabelText(en.moveUp)[1]!)
    expect(shownRefs()).toEqual(['OPENROUTER_KEYROTATION_1', 'OPENROUTER_KEYROTATION_2'])
    // In a longer list a move displaces exactly two rows and leaves the rest.
    fireEvent.click(screen.getByRole('button', { name: `+ ${en.addKey}` }))
    fireEvent.click(screen.getAllByLabelText(en.moveDown)[1]!)
    expect(shownRefs()).toEqual([
      'OPENROUTER_KEYROTATION_1', 'OPENROUTER_KEYROTATION_3', 'OPENROUTER_KEYROTATION_2',
    ])
  })

  it('removes a row from the draft', async () => {
    await mountSeat()
    fireEvent.click(screen.getAllByLabelText(en.removeKey)[1]!)
    expect(shownRefs()).toEqual(['OPENROUTER_KEYROTATION_1'])
  })

  it('blocks saving an added-but-blank row until a value is typed', async () => {
    await mountSeat()
    fireEvent.click(screen.getByRole('button', { name: `+ ${en.addKey}` }))
    // The unstored row has no value yet: save is disabled and the copy says why.
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(screen.getByText(en.keyBlank)).toBeTruthy()
    // Typing the value clears the refusal and re-enables the commit.
    fireEvent.change(valueInput(2), { target: { value: 'third-secret' } })
    expect(screen.queryByText(en.keyBlank)).toBeNull()
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', false)
  })

  it('refuses to save two rows holding the same value, even with different spacing', async () => {
    await mountSeat()
    fireEvent.change(valueInput(0), { target: { value: 'twin-secret' } })
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', false)
    fireEvent.change(valueInput(1), { target: { value: ' twin-secret ' } })
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(screen.getByText(en.duplicateKey)).toBeTruthy()
    // Clearing the twin releases the refusal again.
    fireEvent.change(valueInput(1), { target: { value: 'own-secret' } })
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', false)
    expect(screen.queryByText(en.duplicateKey)).toBeNull()
  })
})

describe('timeout reset', () => {
  it('clears the route parks through the wire and reloads the snapshot', async () => {
    const mounted = await mountSeat()
    const reset = screen.getByRole('button', { name: en.resetTimeouts }) as HTMLButtonElement
    expect(reset.disabled).toBe(false)
    fireEvent.click(reset)
    await waitFor(() => { expect(mounted.resets).toEqual(['openrouter']) })
  })

  it('disables the reset while nothing on the route is parked', async () => {
    await mountSeat({
      routes: [{
        provider: 'openrouter',
        activeLabel: 'OPENROUTER_KEYROTATION_2',
        keys: [
          { label: 'OPENROUTER_KEYROTATION_1', source: 'reference', reference: 'OPENROUTER_KEYROTATION_1', status: { state: 'usable' } },
          { label: 'OPENROUTER_KEYROTATION_2', source: 'reference', reference: 'OPENROUTER_KEYROTATION_2', status: { state: 'usable' } },
        ],
      }],
    })
    expect((screen.getByRole('button', { name: en.resetTimeouts }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('surfaces a refused reset inside the card', async () => {
    await mountSeat({ resetAnswer: fail('host refused') })
    fireEvent.click(screen.getByRole('button', { name: en.resetTimeouts }))
    expect(await screen.findByText('host refused')).toBeTruthy()
  })
})

describe('saving', () => {
  it('writes typed values through the seam and clears them after the committed save', async () => {
    const mounted = await mountSeat()
    fireEvent.change(valueInput(0), { target: { value: 'typed-secret' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => {
      expect(mounted.sets).toEqual([{ ref: 'OPENROUTER_KEYROTATION_1', value: 'typed-secret' }])
    })
    // A pure value change writes NO settings op: the reference list did not move.
    expect(mounted.mutations).toEqual([])
    expect(mounted.unsets).toEqual([])
    // Consumed values clear back to placeholders; the kept row stays in order.
    await waitFor(() => { expect(valueInput(0).value).toBe('') })
    expect(valueInput(0).placeholder).toBe(en.keyStored)
    expect(shownRefs()).toEqual(['OPENROUTER_KEYROTATION_1', 'OPENROUTER_KEYROTATION_2'])
  })

  it('lands a reorder as one whole-array keys write over references only', async () => {
    const mounted = await mountSeat()
    fireEvent.click(screen.getAllByLabelText(en.moveDown)[0]!)
    fireEvent.change(valueInput(0), { target: { value: 'now-second-secret' } })
    fireEvent.change(valueInput(1), { target: { value: 'now-first-secret' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(mounted.mutations).toHaveLength(1) })
    expect(mounted.sets).toEqual([
      { ref: 'OPENROUTER_KEYROTATION_2', value: 'now-second-secret' },
      { ref: 'OPENROUTER_KEYROTATION_1', value: 'now-first-secret' },
    ])
    expect(mounted.mutations[0]).toEqual({
      ns: 'llm-key-rotation',
      ops: [{
        op: 'set',
        path: ['providers', 'openrouter', 'keys'],
        value: [
          { apiKeyEnv: 'OPENROUTER_KEYROTATION_2' },
          { apiKeyEnv: 'OPENROUTER_KEYROTATION_1' },
        ],
      }],
    })
    // Secret material never reaches the settings document.
    expect(JSON.stringify(mounted.mutations[0])).not.toContain('secret')
  })

  it('unsets a dropped reference on save', async () => {
    const mounted = await mountSeat()
    fireEvent.click(screen.getAllByLabelText(en.removeKey)[1]!)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(mounted.unsets).toEqual([{ ref: 'OPENROUTER_KEYROTATION_2' }]) })
    expect(mounted.mutations).toEqual([{
      ns: 'llm-key-rotation',
      ops: [{
        op: 'set',
        path: ['providers', 'openrouter', 'keys'],
        value: [{ apiKeyEnv: 'OPENROUTER_KEYROTATION_1' }],
      }],
    }])
  })

  it('unsets the whole profile when every row was removed', async () => {
    const mounted = await mountSeat()
    fireEvent.click(screen.getAllByLabelText(en.removeKey)[0]!)
    fireEvent.click(screen.getAllByLabelText(en.removeKey)[0]!)
    expect(shownRefs()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => {
      expect(mounted.mutations).toEqual([{
        ns: 'llm-key-rotation',
        ops: [{ op: 'unset', path: ['providers', 'openrouter'] }],
      }])
    })
    expect(mounted.unsets).toEqual([
      { ref: 'OPENROUTER_KEYROTATION_1' },
      { ref: 'OPENROUTER_KEYROTATION_2' },
    ])
  })

  it('surfaces a refused save inside the card and keeps the draft', async () => {
    await mountSeat({ mutateAnswer: fail('settings-conflict') })
    // Dropping the second row makes the save carry a real keys op, which the
    // deployment refuses; the typed value on the kept row is part of the draft.
    fireEvent.click(screen.getAllByLabelText(en.removeKey)[1]!)
    fireEvent.change(valueInput(0), { target: { value: 'kept-secret' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText('settings-conflict')).toBeTruthy()
    // The failed save leaves the card's draft untouched for another attempt.
    expect(valueInput(0).value).toBe('kept-secret')
    expect(shownRefs()).toEqual(['OPENROUTER_KEYROTATION_1'])
  })

  it('performs no writes when the draft already matches the stored section', async () => {
    const mounted = await mountSeat()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(mounted.controller.store.getSnapshot().namespace).toBeDefined() })
    expect(mounted.mutations).toEqual([])
    expect(mounted.sets).toEqual([])
    expect(mounted.unsets).toEqual([])
  })
})

describe('read-only deployments', () => {
  it('disables every write affordance and says so', async () => {
    await mountSeat({ writable: false })
    expect(screen.getByText(en.readOnly)).toBeTruthy()
    expect(valueInput(0)).toHaveProperty('disabled', true)
    expect(screen.getAllByLabelText(en.moveUp)[0]).toHaveProperty('disabled', true)
    expect(screen.getAllByLabelText(en.moveDown)[0]).toHaveProperty('disabled', true)
    expect(screen.getAllByLabelText(en.removeKey)[0]).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: `+ ${en.addKey}` })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    // Pool health stays readable in a read-only deployment.
    expect(screen.getByText(en.activeChip)).toBeTruthy()
  })
})

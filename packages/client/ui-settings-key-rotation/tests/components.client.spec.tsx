// @vitest-environment jsdom
/** Key-rotation section behavior over a scripted wire face: status panel, countdown, editor, deletion. */
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CredentialView, KeyRotationRouteView, RpcResponse, SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { KeyRotationSection } from '../src/client/KeyRotationSection.tsx'
import type { KeyRotationSectionInjected, KeyRotationSectionProps } from '../src/client/KeyRotationSection.tsx'
import { createKeyRotationStore } from '../src/client/store.ts'
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

function namespace(overrides: Partial<SettingsNamespaceView> = {}): SettingsNamespaceView {
  return {
    ns: 'llm-key-rotation',
    schema: {},
    value: {
      providers: {
        openrouter: {
          displayName: 'OpenRouter',
          baseURL: 'https://openrouter.example/api/v1',
          api: 'openai-completions',
          models: [{ id: 'm-1', name: 'Model One', contextWindow: 8192 }],
          keys: [{ apiKeyEnv: 'OPENROUTER_KEYROTATION_1' }, { apiKeyEnv: 'OPENROUTER_KEYROTATION_2' }],
        },
      },
    },
    base: { providers: {} },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
    ...overrides,
  }
}

interface ScriptedOptions {
  configured?: boolean
  routes?: KeyRotationRouteView[]
  namespaces?: SettingsNamespaceView[]
  writable?: boolean
}

function scripted(options: ScriptedOptions = {}) {
  const mutations: Array<{ ns: string; ops: unknown }> = []
  const sets: Array<{ ref: string; value: string }> = []
  const unsets: Array<{ ref: string }> = []
  const face = {
    llm: {
      keyRotation: () => Promise.resolve(ok({
        configured: options.configured ?? true,
        routes: options.routes ?? ROUTES,
      })),
    },
    settings: {
      describe: () => Promise.resolve(ok({
        writable: options.writable ?? true,
        hasDocument: false,
        namespaces: options.namespaces ?? [namespace()],
      })),
      mutate: (payload: { ns: string; ops: unknown }) => {
        mutations.push(payload)
        return Promise.resolve(ok(namespace()))
      },
    },
    credentials: {
      describe: (payload: { refs: string[] }) => Promise.resolve(ok({
        credentials: Object.fromEntries(payload.refs.map((ref): [string, CredentialView] => [ref, {
          configured: ref !== 'OPENROUTER_KEYROTATION_2',
          writable: true,
        }])),
      })),
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
  return { controller, mutations, sets, unsets }
}

type SectionPropsOf = (injected: {
  controller: ReturnType<typeof createKeyRotationStore>
  t: KeyRotationSectionInjected['t']
}) => KeyRotationSectionProps

const propsOf: SectionPropsOf = ({ controller, t }) => ({
  controller,
  useSnapshot: bindSnapshotSelector(controller.store),
  t,
})

async function mountSection(options: ScriptedOptions & { t?: KeyRotationSectionInjected['t'] } = {}) {
  const wired = scripted(options)
  await wired.controller.load()
  const view = render(<KeyRotationSection {...propsOf({ controller: wired.controller, t: options.t ?? (key => en[key]) })} />)
  return { view, ...wired }
}

describe('KeyRotationSection posture', () => {
  it('renders nothing before the slot injects its dependencies', () => {
    render(<KeyRotationSection />)
    expect(document.body.textContent).toBe('')
  })

  it('renders the load failure with a working retry', async () => {
    const face = {
      llm: { keyRotation: () => Promise.resolve(fail('host exploded')) },
      settings: { describe: () => Promise.resolve(fail('unavailable')), mutate: () => Promise.resolve(fail('unused')) },
      credentials: { describe: () => Promise.resolve(fail('unused')), set: () => Promise.resolve(ok({})), unset: () => Promise.resolve(ok({})) },
    }
    const mirror = new SettingsDescribeMirror(face as never)
    const controller = createKeyRotationStore(face as never, mirror)
    await controller.load()
    render(<KeyRotationSection {...propsOf({ controller, t: key => en[key] })} />)
    expect(screen.getByText(`${en.loadFailed}: host exploded`)).toBeTruthy()
    // Retrying re-enters load: the failure view yields to the pending title.
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(screen.queryByText(`${en.loadFailed}: host exploded`)).toBeNull()
    expect(screen.getByText(en.title)).toBeTruthy()
  })

  it('shows the loading title only while the first answer is pending', () => {
    const wired = scripted()
    render(<KeyRotationSection {...propsOf({ controller: wired.controller, t: key => en[key] })} />)
    expect(screen.getByText(en.title)).toBeTruthy()
    expect(screen.queryByText(en.routesTitle)).toBeNull()
  })

  it('renders the not-composed notice when no composition mounts the plugin', async () => {
    await mountSection({ configured: false, routes: [], namespaces: [] })
    expect(screen.getByText(en.notComposed)).toBeTruthy()
    expect(screen.queryByText(en.dormant)).toBeNull()
  })

  it('renders the dormant invitation with the add-route card when composed but empty', async () => {
    await mountSection({ configured: true, routes: [], namespaces: [namespace({
      value: { providers: {} },
    })] })
    expect(screen.getByText(en.dormant)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.addRoute })).toBeTruthy()
    expect(screen.queryByText(en.routesTitle)).toBeNull()
  })

  it('refetches the live status when the header refresh is pressed', async () => {
    let reads = 0
    const face = {
      llm: { keyRotation: () => { reads += 1; return Promise.resolve(ok({ configured: true, routes: ROUTES })) } },
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [namespace()] })),
        mutate: () => Promise.resolve(ok(namespace())),
      },
      credentials: {
        describe: () => Promise.resolve(ok({ credentials: {} })),
        set: () => Promise.resolve(ok({})),
        unset: () => Promise.resolve(ok({})),
      },
    }
    const mirror = new SettingsDescribeMirror(face as never)
    const controller = createKeyRotationStore(face as never, mirror)
    await controller.load()
    render(<KeyRotationSection {...propsOf({ controller, t: key => en[key] })} />)
    expect(reads).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    await waitFor(() => { expect(reads).toBe(2) })
  })

  it('labels a stored card by the route id when no display name is stored', async () => {
    await mountSection({ namespaces: [namespace({
      value: { providers: { openrouter: {
        baseURL: 'https://openrouter.example/api/v1',
        api: 'openai-completions',
        models: [{ id: 'm-1', name: 'Model One', contextWindow: 8192 }],
        keys: [{ apiKeyEnv: 'OPENROUTER_KEYROTATION_1' }],
      } } },
    })] })
    // The heading and the edit affordance fall back to the route id itself.
    expect(screen.getByRole('heading', { name: 'openrouter' })).toBeTruthy()
    expect(screen.getByRole('button', { name: `${en.edit} openrouter` })).toBeTruthy()
  })
})

describe('live key status', () => {
  it('renders per-key chips and the localized reset countdown for parked keys', async () => {
    // Pinned against the fixture's reset instant: the hours template is a
    // function of (resetAt, now), not of the host clock.
    vi.useFakeTimers({ now: Date.parse('2026-08-24T10:00:00.000Z') })
    try {
      const russian: KeyRotationSectionInjected['t'] = key => ru[key]
      await mountSection({ t: russian })
      expect(screen.getByText(russian('routesTitle'))).toBeTruthy()
      // The active key is the usable one at the sticky position.
      expect(screen.getByText(russian('activeChip'))).toBeTruthy()
      expect(screen.getByText(russian('parkedChip'))).toBeTruthy()
      expect(screen.getByText('OPENROUTER_KEYROTATION_1')).toBeTruthy()
      // «лимит откатится через Nч Mм» — computed from resetAt against now.
      const countdown = screen.getByText(/Лимит откатится через/)
      expect(countdown.textContent).toMatch(/^Лимит откатится через \d+ ч \d+ мин$/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ages the countdown as the wall clock advances', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-08-24T12:00:00.000Z') })
    try {
      const wired = scripted()
      await wired.controller.load()
      render(<KeyRotationSection {...propsOf({ controller: wired.controller, t: key => en[key] })} />)
      // 12 h out, the reset reads exactly on the hour.
      expect(screen.getByText(/Limit resets in/).textContent).toBe('Limit resets in 12 h 0 min')
      act(() => { vi.advanceTimersByTime(30 * 60_000) })
      // The component-local tick re-renders the countdown from the same resetAt.
      expect(screen.getByText(/Limit resets in/).textContent).toBe('Limit resets in 11 h 30 min')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps every chip off a fully parked pool', async () => {
    const onlyParked: KeyRotationRouteView = {
      provider: 'openrouter',
      activeLabel: 'OPENROUTER_KEYROTATION_1',
      keys: [ROUTES[0]!.keys[0]!],
    }
    await mountSection({ routes: [onlyParked] })
    // The whole pool is parked: no active or usable chip may render.
    expect(screen.queryByText(en.activeChip)).toBeNull()
    expect(screen.queryByText(en.usableChip)).toBeNull()
    expect(screen.getByText(en.parkedChip)).toBeTruthy()
  })

  it('marks exactly the sticky key active and renders spare keys as usable', async () => {
    const threeKeys: KeyRotationRouteView = {
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
    await mountSection({ routes: [threeKeys] })
    expect(screen.getByText(en.activeChip)).toBeTruthy()
    expect(screen.getByText(en.usableChip)).toBeTruthy()
    expect(screen.getByText(en.parkedChip)).toBeTruthy()
  })

  it('reads sub-hour resets in minutes only', async () => {
    vi.useFakeTimers({ now: Date.parse(RESET_AT) - 30 * 60_000 })
    try {
      const wired = scripted()
      await wired.controller.load()
      render(<KeyRotationSection {...propsOf({ controller: wired.controller, t: key => en[key] })} />)
      expect(screen.getByText(/Limit resets in/).textContent).toBe('Limit resets in 30 min')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('stored-route editor', () => {
  it('opens prefilled, saves typed keys through the seam, and hides secrets from settings writes', async () => {
    const mounted = await mountSection()
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    const keyInput = screen.getAllByLabelText(en.keyValue)[0] as HTMLInputElement
    expect(keyInput.type).toBe('password')
    // Row 1's reference is configured: its hint carries the stored marker
    // once the editor's credential read lands.
    expect(await screen.findByText(new RegExp(en.keyStored))).toBeTruthy()
    fireEvent.change(keyInput, { target: { value: 'typed-secret' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(mounted.sets).toEqual([{ ref: 'OPENROUTER_KEYROTATION_1', value: 'typed-secret' }]) })
    // A pure key-value change writes NO settings op: the stored profile's
    // reference list did not move. Whatever the deployment writes through
    // this card, secret material never appears in any settings payload.
    expect(mounted.unsets).toHaveLength(0)
    for (const mutation of mounted.mutations) {
      expect(JSON.stringify(mutation)).not.toContain('typed-secret')
    }
    // The editor closed after the committed save.
    await waitFor(() => { expect(screen.queryByLabelText(en.keyValue)).toBeNull() })
  })

  it('blocks the save on an invalid draft and names the field', async () => {
    const mounted = await mountSection()
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    fireEvent.click(screen.getByRole('button', { name: en.addModel }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(en.modelIdRequired)
    expect(mounted.mutations).toHaveLength(0)
    expect(mounted.sets).toHaveLength(0)
  })

  it('derives the next reference when a key row is added and reorders without moving refs', async () => {
    const mounted = await mountSection()
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    fireEvent.click(screen.getByRole('button', { name: en.addKey }))
    expect(screen.getByText(`${en.keyReference}: OPENROUTER_KEYROTATION_3`)).toBeTruthy()
    // Move row 2 up: the reference order flips while each ref keeps its input.
    const moveUpButtons = screen.getAllByLabelText(en.moveUp)
    fireEvent.click(moveUpButtons[1]!)
    // Every row needs a value (or stored history) to pass validation.
    const keyInputs = screen.getAllByLabelText(en.keyValue)
    fireEvent.change(keyInputs[0]!, { target: { value: 'reordered-secret' } })
    fireEvent.change(keyInputs[2]!, { target: { value: 'new-secret' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => {
      expect(mounted.sets).toEqual([
        { ref: 'OPENROUTER_KEYROTATION_2', value: 'reordered-secret' },
        { ref: 'OPENROUTER_KEYROTATION_3', value: 'new-secret' },
      ])
    })
    // The reorder landed as one keys-array write over reference names only.
    expect(JSON.stringify(mounted.mutations[0])).toContain('OPENROUTER_KEYROTATION_2')
    expect(JSON.stringify(mounted.mutations[0])).not.toContain('secret')
  })

  it('moves a key row down on request and keeps the order unchanged past either end of the list', async () => {
    const mounted = await mountSection()
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    // Row 1 moves down: the reference order flips.
    fireEvent.click(screen.getAllByLabelText(en.moveDown)[0]!)
    // The end rows refuse to move past the list: their arrows sit clamped.
    expect(screen.getAllByLabelText(en.moveUp)[0]).toHaveProperty('disabled', true)
    const moveDownButtons = screen.getAllByLabelText(en.moveDown)
    expect(moveDownButtons[moveDownButtons.length - 1]).toHaveProperty('disabled', true)
    fireEvent.click(moveDownButtons[moveDownButtons.length - 1]!)
    fireEvent.click(screen.getAllByLabelText(en.moveUp)[0]!)
    // Every row needs a value (or stored history) to pass validation.
    const keyInputs = screen.getAllByLabelText(en.keyValue)
    fireEvent.change(keyInputs[0]!, { target: { value: 'now-second' } })
    fireEvent.change(keyInputs[1]!, { target: { value: 'now-first' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => {
      // The one enabled down-move reordered the references; neither clamped click did.
      expect(mounted.sets).toEqual([
        { ref: 'OPENROUTER_KEYROTATION_2', value: 'now-second' },
        { ref: 'OPENROUTER_KEYROTATION_1', value: 'now-first' },
      ])
    })
    expect(JSON.stringify(mounted.mutations[0])).toContain('"apiKeyEnv":"OPENROUTER_KEYROTATION_2"')
    expect(JSON.stringify(mounted.mutations[0])).not.toContain('secret')
  })

  it('removes a key row and unsets its reference on save', async () => {
    const mounted = await mountSection()
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    fireEvent.click(screen.getAllByLabelText(en.removeKey)[1]!)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(mounted.unsets).toEqual([{ ref: 'OPENROUTER_KEYROTATION_2' }]) })
  })

  it('closes the editor without writing anything', async () => {
    const mounted = await mountSection()
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(screen.queryByLabelText(en.keyValue)).toBeNull()
    expect(mounted.mutations).toHaveLength(0)
    expect(mounted.sets).toHaveLength(0)
  })

  it('closes an open editor from its card header', async () => {
    await mountSection()
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    expect(screen.getAllByLabelText(en.keyValue).length).toBeGreaterThan(0)
    // The same header button toggles into a close affordance while open.
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    expect(screen.queryAllByLabelText(en.keyValue)).toHaveLength(0)
  })

  it('writes one op per edited field and drops model columns that inherit defaults', async () => {
    const mounted = await mountSection()
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    // A second row proves edits rewrite exactly one row of the models column.
    fireEvent.click(screen.getByRole('button', { name: en.addModel }))
    fireEvent.change(screen.getAllByLabelText(en.modelId)[1]!, { target: { value: 'm-9' } })
    fireEvent.change(screen.getAllByLabelText(en.displayName)[0]!, { target: { value: '  Renamed  ' } })
    fireEvent.change(screen.getByLabelText(en.baseUrl), { target: { value: 'https://changed.example/api/v1' } })
    fireEvent.change(screen.getByLabelText(en.api), { target: { value: 'anthropic' } })
    // The profile display name and the model-row name share one label string;
    // DOM order puts the card field first and the model row second.
    fireEvent.change(screen.getAllByLabelText(en.modelId)[0]!, { target: { value: 'm-2' } })
    fireEvent.change(screen.getAllByLabelText(en.displayName)[1]!, { target: { value: 'Model Two' } })
    fireEvent.change(screen.getAllByLabelText(en.contextWindow)[0]!, { target: { value: '4096' } })
    // Key rows kept their stored references with blank values: nothing moves
    // through the credential seam.
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(mounted.mutations).toHaveLength(1) })
    expect(mounted.sets).toHaveLength(0)
    expect(mounted.mutations[0]!.ops).toEqual([
      { op: 'set', path: ['providers', 'openrouter', 'displayName'], value: 'Renamed' },
      { op: 'set', path: ['providers', 'openrouter', 'baseURL'], value: 'https://changed.example/api/v1' },
      { op: 'set', path: ['providers', 'openrouter', 'api'], value: 'anthropic' },
      {
        op: 'set',
        path: ['providers', 'openrouter', 'models'],
        value: [{ id: 'm-2', name: 'Model Two', contextWindow: 4096 }, { id: 'm-9' }],
      },
    ])
  })

  it('demands at least one model row before saving', async () => {
    await mountSection()
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    fireEvent.click(screen.getByRole('button', { name: en.removeModel }))
    expect(screen.getByText(en.modelsEmpty)).toBeTruthy()
    // Adding one back clears the demand.
    fireEvent.click(screen.getByRole('button', { name: en.addModel }))
    expect(screen.queryByText(en.modelsEmpty)).toBeNull()
  })

  it('renders a stored key row without a reference as unaddressed', async () => {
    await mountSection({ namespaces: [namespace({
      value: { providers: { openrouter: {
        displayName: 'OpenRouter',
        models: [{ id: 'm-1', name: 'Model One', contextWindow: 8192 }],
        keys: [{}, { apiKeyEnv: 'OPENROUTER_KEYROTATION_2' }],
      } } },
    })] })
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    expect(screen.getByText(`${en.keyReference}: —`)).toBeTruthy()
    const keyInputs = screen.getAllByLabelText(en.keyValue)
    expect((keyInputs[0] as HTMLInputElement).placeholder).toBe(en.keyValuePlaceholder)
  })

  it('surfaces a refused save inside the card and clears it on the next edit', async () => {
    const face = {
      llm: { keyRotation: () => Promise.resolve(ok({ configured: true, routes: [] })) },
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [namespace()] })),
        mutate: () => Promise.resolve(fail('settings-conflict')),
      },
      credentials: {
        describe: () => Promise.resolve(ok({ credentials: {} })),
        set: () => Promise.resolve(ok({})),
        unset: () => Promise.resolve(ok({})),
      },
    }
    const mirror = new SettingsDescribeMirror(face as never)
    const controller = createKeyRotationStore(face as never, mirror)
    await controller.load()
    render(<KeyRotationSection {...propsOf({ controller, t: key => en[key] })} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    fireEvent.change(screen.getByLabelText(en.baseUrl), { target: { value: 'https://changed.example/api/v1' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('settings-conflict')
    // The next edit retracts the failure with the draft change.
    fireEvent.change(screen.getByLabelText(en.baseUrl), { target: { value: 'https://openrouter.example/api/v1' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('add and remove routes', () => {
  it('adds a route under a valid fresh name and opens its blank editor', async () => {
    const mounted = await mountSection()
    fireEvent.change(screen.getByLabelText(en.routeName), { target: { value: 'newroute' } })
    fireEvent.click(screen.getByRole('button', { name: en.addRoute }))
    expect(screen.getByText(en.editorNewTitle)).toBeTruthy()
    expect(screen.getByText(`${en.keyReference}: NEWROUTE_KEYROTATION_1`)).toBeTruthy()
    // Nothing is written until the card saves.
    expect(mounted.mutations).toHaveLength(0)
  })

  it('rejects an invalid route name before opening anything', async () => {
    const mounted = await mountSection()
    fireEvent.change(screen.getByLabelText(en.routeName), { target: { value: 'Bad Name' } })
    fireEvent.click(screen.getByRole('button', { name: en.addRoute }))
    expect(screen.getByRole('alert').textContent).toBe(en.routeNameInvalid)
    expect(screen.queryByText(en.editorNewTitle)).toBeNull()
    expect(mounted.mutations).toHaveLength(0)
  })

  it('deletes a user-owned route after confirmation, unsetting its references', async () => {
    const mounted = await mountSection()
    fireEvent.click(screen.getByRole('button', { name: `${en.removeRoute} OpenRouter` }))
    expect(screen.getByText('Delete OpenRouter?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete OpenRouter' }))
    await waitFor(() => { expect(mounted.mutations).toEqual([{
      ns: 'llm-key-rotation',
      ops: [{ op: 'unset', path: ['providers', 'openrouter'] }],
    }]) })
    expect(mounted.unsets).toEqual([
      { ref: 'OPENROUTER_KEYROTATION_1' },
      { ref: 'OPENROUTER_KEYROTATION_2' },
    ])
  })

  it('hides delete for base-layer-owned routes', async () => {
    await mountSection({ namespaces: [namespace({
      base: { providers: { openrouter: {} } },
    })] })
    expect(screen.queryByText(en.removeRoute)).toBeNull()
    expect(screen.getByRole('button', { name: `${en.edit} OpenRouter` })).toBeTruthy()
  })

  it('reports a refused removal inside the dialog and stays retryable', async () => {
    const face = {
      llm: { keyRotation: () => Promise.resolve(ok({ configured: true, routes: [] })) },
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [namespace()] })),
        mutate: () => Promise.resolve(fail('settings-conflict')),
      },
      credentials: {
        describe: () => Promise.resolve(ok({ credentials: {} })),
        set: () => Promise.resolve(ok({})),
        unset: () => Promise.resolve(ok({})),
      },
    }
    const mirror = new SettingsDescribeMirror(face as never)
    const controller = createKeyRotationStore(face as never, mirror)
    await controller.load()
    render(<KeyRotationSection {...propsOf({ controller, t: key => en[key] })} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.removeRoute} OpenRouter` }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete OpenRouter' }))
    expect(await screen.findByText('settings-conflict')).toBeTruthy()
  })

  it('cancels out of the delete dialog without writing anything', async () => {
    const mounted = await mountSection()
    fireEvent.click(screen.getByRole('button', { name: `${en.removeRoute} OpenRouter` }))
    expect(screen.getByText('Delete OpenRouter?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(screen.queryByText('Delete OpenRouter?')).toBeNull()
    expect(mounted.mutations).toHaveLength(0)
  })

  it('keeps the delete dialog pinned while a removal is in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const face = {
      llm: { keyRotation: () => Promise.resolve(ok({ configured: true, routes: [] })) },
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [namespace()] })),
        mutate: () => gate.then(() => ok(namespace())),
      },
      credentials: {
        describe: () => Promise.resolve(ok({ credentials: {} })),
        set: () => Promise.resolve(ok({})),
        unset: () => Promise.resolve(ok({})),
      },
    }
    const mirror = new SettingsDescribeMirror(face as never)
    const controller = createKeyRotationStore(face as never, mirror)
    await controller.load()
    render(<KeyRotationSection {...propsOf({ controller, t: key => en[key] })} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.removeRoute} OpenRouter` }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete OpenRouter' }))
    expect(await screen.findByText(en.deleting)).toBeTruthy()
    // Escape during the in-flight removal is refused; the dialog stays pinned.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByText('Delete OpenRouter?')).toBeTruthy()
    release()
    await waitFor(() => { expect(screen.queryByText('Delete OpenRouter?')).toBeNull() })
  })

  it('refuses quietly when the target route became base-owned while the dialog stood open', async () => {
    let baseOwned = false
    const mutations: Array<{ ns: string; ops: unknown }> = []
    const face = {
      llm: { keyRotation: () => Promise.resolve(ok({ configured: true, routes: [] })) },
      settings: {
        describe: () => Promise.resolve(ok({
          writable: true,
          hasDocument: false,
          namespaces: [baseOwned ? namespace({ base: { providers: { openrouter: {} } } }) : namespace()],
        })),
        mutate: (payload: { ns: string; ops: unknown }) => {
          mutations.push(payload)
          return Promise.resolve(ok(namespace()))
        },
      },
      credentials: {
        describe: () => Promise.resolve(ok({ credentials: {} })),
        set: () => Promise.resolve(ok({})),
        unset: () => Promise.resolve(ok({})),
      },
    }
    const mirror = new SettingsDescribeMirror(face as never)
    const controller = createKeyRotationStore(face as never, mirror)
    await controller.load()
    render(<KeyRotationSection {...propsOf({ controller, t: key => en[key] })} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.removeRoute} OpenRouter` }))
    // A layering change takes the route over while the dialog stands open.
    baseOwned = true
    // The page store re-reads only through the mirror, whose own refresh the
    // owning plugin drives; stage it the same way.
    await mirror.load()
    await controller.load()
    // The reload re-renders the section (hiding the card's delete affordance);
    // the dialog itself stays pinned on its held target.
    await screen.findByText('Delete OpenRouter?')
    fireEvent.click(screen.getByRole('button', { name: 'Delete OpenRouter' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete OpenRouter' })).toHaveProperty('disabled', false)
    })
    // The refusal writes nothing and keeps the dialog for another look.
    expect(screen.getByText('Delete OpenRouter?')).toBeTruthy()
    expect(mutations).toHaveLength(0)
  })

  it('saves a brand-new route as one whole profile and closes its card cleanly', async () => {
    const mounted = await mountSection()
    fireEvent.change(screen.getByLabelText(en.routeName), { target: { value: 'freshroute' } })
    fireEvent.click(screen.getByRole('button', { name: en.addRoute }))
    fireEvent.change(screen.getAllByLabelText(en.displayName)[0]!, { target: { value: 'Fresh' } })
    fireEvent.change(screen.getAllByLabelText(en.modelId)[0]!, { target: { value: 'f-1' } })
    fireEvent.change(screen.getAllByLabelText(en.keyValue)[0]!, { target: { value: 'fresh-secret' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => {
      expect(mounted.sets).toEqual([{ ref: 'FRESHROUTE_KEYROTATION_1', value: 'fresh-secret' }])
    })
    // One whole-profile write over reference names only; blanks stay unstored.
    expect(mounted.mutations).toEqual([{
      ns: 'llm-key-rotation',
      ops: [{
        op: 'set',
        path: ['providers', 'freshroute'],
        value: {
          displayName: 'Fresh',
          models: [{ id: 'f-1' }],
          keys: [{ apiKeyEnv: 'FRESHROUTE_KEYROTATION_1' }],
        },
      }],
    }])
    expect(mounted.unsets).toHaveLength(0)
    await waitFor(() => { expect(screen.queryAllByLabelText(en.keyValue)).toHaveLength(0) })

    // A second new-route card closes on cancel without writing.
    fireEvent.change(screen.getByLabelText(en.routeName), { target: { value: 'spare' } })
    fireEvent.click(screen.getByRole('button', { name: en.addRoute }))
    expect(screen.getAllByText(en.editorNewTitle)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(screen.queryAllByLabelText(en.keyValue)).toHaveLength(0)
    expect(mounted.mutations).toHaveLength(1)
  })

  it('orders stored cards by display name rather than route id', async () => {
    await mountSection({ routes: [], namespaces: [namespace({
      value: { providers: {
        zzz: { displayName: 'Alpha', models: [{ id: 'm' }], keys: [] },
        aaa: { displayName: 'Zeta', models: [{ id: 'm' }], keys: [] },
      } },
    })] })
    const body = document.body.textContent ?? ''
    expect(body.indexOf('Alpha')).toBeGreaterThan(-1)
    // Without the label sort, the ids would print Zeta's card first.
    expect(body.indexOf('Alpha')).toBeLessThan(body.indexOf('Zeta'))
  })
})

describe('read-only deployments', () => {
  it('disables every write affordance and says so', async () => {
    await mountSection({ writable: false })
    expect(screen.getByText(en.readOnly)).toBeTruthy()
    expect(screen.getByLabelText(en.routeName)).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: `${en.edit} OpenRouter` }))
    expect(screen.getByRole('button', { name: en.addRoute })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(screen.getAllByLabelText(en.moveUp)[0]).toHaveProperty('disabled', true)
  })
})

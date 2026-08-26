/** Store join and pure helpers: pool snapshot × settings namespace × credential writes. */
import { describe, expect, it } from 'vitest'
import type {
  KeyRotationRouteView, RpcResponse, SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { formatResetCountdown } from '../src/client/countdown.ts'
import {
  countdownParts, createKeyRotationStore, deriveKeyRef, fill, keysOps, messageOf,
  ROTATION_NS, storedRefsOf,
} from '../src/client/store.ts'

let nextRpc = 0
function ok<T>(value: T): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: true, value } }
}
function fail<T>(message: string): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: false, error: { code: 'internal', message, details: {} } } }
}

/** A resolved namespace storing one user route's key references. */
const NAMESPACE: SettingsNamespaceView = {
  ns: 'llm-key-rotation',
  schema: {},
  value: {
    providers: {
      openrouter: {
        keys: [{ apiKeyEnv: 'OPENROUTER_KEYROTATION_1' }, { apiKeyEnv: 'OPENROUTER_KEYROTATION_2' }],
      },
    },
  },
  base: { providers: {} },
  applies: 'live',
  secrets: [],
  revision: 0,
}

const ROUTES: KeyRotationRouteView[] = [{
  provider: 'openrouter',
  activeLabel: 'OPENROUTER_KEYROTATION_2',
  keys: [
    {
      label: 'OPENROUTER_KEYROTATION_1',
      source: 'reference',
      reference: 'OPENROUTER_KEYROTATION_1',
      status: { state: 'parked', parkedAt: '2026-08-24T10:00:00.000Z', resetAt: '2026-08-25T00:00:00.000Z' },
    },
    { label: 'OPENROUTER_KEYROTATION_2', source: 'reference', reference: 'OPENROUTER_KEYROTATION_2', status: { state: 'usable' } },
  ],
}]

interface ScriptedOptions {
  routes?: KeyRotationRouteView[]
  namespaces?: SettingsNamespaceView[]
  writable?: boolean
  rotationAnswer?: RpcResponse<{ configured: boolean; routes: KeyRotationRouteView[] }>
  describeAnswer?: RpcResponse<{ writable: boolean; hasDocument: boolean; namespaces: SettingsNamespaceView[] }>
  unsetAnswer?: RpcResponse<Record<string, never>>
  setAnswer?: RpcResponse<Record<string, never>>
  mutateAnswer?: RpcResponse<SettingsNamespaceView>
}

function scripted(options: ScriptedOptions = {}): {
  face: unknown
  mirror: SettingsDescribeMirror
  mutations: Array<{ ns: string; ops: unknown }>
  sets: Array<{ ref: string; value: string }>
  unsets: Array<{ ref: string }>
} {
  const mutations: Array<{ ns: string; ops: unknown }> = []
  const sets: Array<{ ref: string; value: string }> = []
  const unsets: Array<{ ref: string }> = []
  const face = {
    llm: {
      keyRotation: () => Promise.resolve(options.rotationAnswer ?? ok({ configured: true, routes: options.routes ?? ROUTES })),
    },
    settings: {
      describe: () => Promise.resolve(options.describeAnswer ?? ok({
        writable: options.writable ?? true,
        hasDocument: false,
        namespaces: options.namespaces ?? [NAMESPACE],
      })),
      mutate: (payload: { ns: string; ops: unknown }) => {
        mutations.push(payload)
        return Promise.resolve(options.mutateAnswer ?? ok(NAMESPACE))
      },
    },
    credentials: {
      set: (payload: { ref: string; value: string }) => {
        sets.push(payload)
        return Promise.resolve(options.setAnswer ?? ok({}))
      },
      unset: (payload: { ref: string }) => {
        unsets.push(payload)
        return Promise.resolve(options.unsetAnswer ?? ok({}))
      },
    },
  }
  const wire = face as never
  return { face: wire, mirror: new SettingsDescribeMirror(wire), mutations, sets, unsets }
}

async function mountedStore(options?: ScriptedOptions) {
  const wired = scripted(options)
  const controller = createKeyRotationStore(wired.face as never, wired.mirror)
  await controller.load()
  return { controller, ...wired }
}

describe('pure helpers', () => {
  it('derives references one past the largest index already in use', () => {
    expect(deriveKeyRef('openrouter', [])).toBe('OPENROUTER_KEYROTATION_1')
    expect(deriveKeyRef('openrouter', ['OPENROUTER_KEYROTATION_1', 'OTHER_KEY'])).toBe('OPENROUTER_KEYROTATION_2')
    expect(deriveKeyRef('openrouter', ['OPENROUTER_KEYROTATION_7'])).toBe('OPENROUTER_KEYROTATION_8')
    // Non-numeric tails and lower numbers never raise the watermark.
    expect(deriveKeyRef('openrouter', ['OPENROUTER_KEYROTATION_X', 'OPENROUTER_KEYROTATION_5', 'OPENROUTER_KEYROTATION_2']))
      .toBe('OPENROUTER_KEYROTATION_6')
    // Route ids sanitize into addressable reference prefixes.
    expect(deriveKeyRef('deepseek-official', [])).toBe('DEEPSEEK_OFFICIAL_KEYROTATION_1')
  })

  it('lists stored references and skips rows without their own reference', () => {
    expect(storedRefsOf('openrouter', NAMESPACE)).toEqual(['OPENROUTER_KEYROTATION_1', 'OPENROUTER_KEYROTATION_2'])
    expect(storedRefsOf('absent', NAMESPACE)).toEqual([])
    expect(storedRefsOf('openrouter', undefined)).toEqual([])
    // A stored row without its own reference is skipped, not addressed empty.
    const hole = { ...NAMESPACE, value: { providers: { hole: { keys: [{}, { apiKeyEnv: 'HOLE_2' }] } } } }
    expect(storedRefsOf('hole', hole)).toEqual(['HOLE_2'])
  })

  it('rounds countdown minutes up so an expiring park never reads zero', () => {
    const now = Date.parse('2026-08-24T12:00:00.000Z')
    expect(countdownParts('2026-08-24T12:00:20.000Z', now)).toEqual({ hours: 0, minutes: 1 })
    expect(countdownParts('2026-08-24T13:30:00.000Z', now)).toEqual({ hours: 1, minutes: 30 })
    // A reset instant in the past still reports one minute rather than going negative.
    expect(countdownParts('2026-08-24T11:00:00.000Z', now)).toEqual({ hours: 0, minutes: 1 })
  })

  it('fills named template slots and keeps unknown ones', () => {
    expect(fill('{route} gone', { route: 'x' })).toBe('x gone')
    expect(fill('{missing}', {})).toBe('{missing}')
  })

  it('renders the hours template above one hour and the minutes template below it', () => {
    const copy = { resetCountdownHours: 'Limit resets in {h} h {m} min', resetCountdownMinutes: 'Limit resets in {m} min' }
    const now = Date.parse('2026-08-24T12:00:00.000Z')
    expect(formatResetCountdown('2026-08-24T13:30:00.000Z', now, copy)).toBe('Limit resets in 1 h 30 min')
    expect(formatResetCountdown('2026-08-24T12:20:00.000Z', now, copy)).toBe('Limit resets in 20 min')
  })

  it('builds minimal path ops against the stored section', () => {
    // An unchanged reference list writes nothing.
    expect(keysOps('openrouter', ['OPENROUTER_KEYROTATION_1', 'OPENROUTER_KEYROTATION_2'], NAMESPACE)).toEqual([])
    // Key order IS rotation priority: a reorder lands as one whole-array set.
    expect(keysOps('openrouter', ['OPENROUTER_KEYROTATION_2', 'OPENROUTER_KEYROTATION_1'], NAMESPACE)).toEqual([{
      op: 'set',
      path: ['providers', 'openrouter', 'keys'],
      value: [{ apiKeyEnv: 'OPENROUTER_KEYROTATION_2' }, { apiKeyEnv: 'OPENROUTER_KEYROTATION_1' }],
    }])
    // A shortened list still lands as the whole-array set.
    expect(keysOps('openrouter', ['OPENROUTER_KEYROTATION_1'], NAMESPACE)).toEqual([{
      op: 'set',
      path: ['providers', 'openrouter', 'keys'],
      value: [{ apiKeyEnv: 'OPENROUTER_KEYROTATION_1' }],
    }])
  })

  it('unsets the whole profile when every row is removed and stays silent when nothing was stored', () => {
    expect(keysOps('openrouter', [], NAMESPACE)).toEqual([{ op: 'unset', path: ['providers', 'openrouter'] }])
    // Nothing stored and nothing to store: an absent entry needs no write.
    const bare = { ...NAMESPACE, value: { providers: {} } }
    expect(keysOps('ghost', [], bare)).toEqual([])
    // A route absent from the stored section lands as one whole-column write.
    expect(keysOps('fresh', ['FRESH_KEYROTATION_1'], bare)).toEqual([{
      op: 'set',
      path: ['providers', 'fresh', 'keys'],
      value: [{ apiKeyEnv: 'FRESH_KEYROTATION_1' }],
    }])
    // A stored row without its own reference compares as addressed-empty, so
    // emptying the draft still removes the whole entry.
    const hole = { ...NAMESPACE, value: { providers: { hole: { keys: [{}] } } } }
    expect(keysOps('hole', [], hole)).toEqual([{ op: 'unset', path: ['providers', 'hole'] }])
  })

  it('describes any thrown value for failure text', () => {
    expect(messageOf(new Error('boom'))).toBe('boom')
    expect(messageOf('plain')).toBe('plain')
  })
})

describe('createKeyRotationStore', () => {
  it('folds the wire answers into one ready snapshot', async () => {
    const { controller } = await mountedStore()
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.writable).toBe(true)
    expect(state.routes).toEqual(ROUTES)
    expect(state.namespace?.ns).toBe(ROTATION_NS)
    expect(state.error).toBeNull()
  })

  it('degrades a settings outage to a read-only seat without failing the page', async () => {
    const { controller } = await mountedStore({
      describeAnswer: fail('settings service is down'),
      routes: [],
    })
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.writable).toBe(false)
    expect(state.namespace).toBeUndefined()
    expect(state.error).toBe('settings service is down')
  })

  it('reports a refused rotation answer through the error status with retryable text', async () => {
    const { controller } = await mountedStore({ rotationAnswer: fail('host exploded') })
    expect(controller.store.getSnapshot().status).toBe('error')
    expect(controller.store.getSnapshot().error).toBe('host exploded')
  })

  it('reports a transport rejection through the error status', async () => {
    const wired = scripted()
    const broken = createKeyRotationStore({
      llm: { keyRotation: () => Promise.reject(new Error('connection lost')) },
    } as never, wired.mirror)
    await broken.load()
    expect(broken.store.getSnapshot().status).toBe('error')
    expect(broken.store.getSnapshot().error).toBe('connection lost')
  })

  it('saves typed values through the seam and records references only', async () => {
    const { controller, mutations, sets, unsets } = await mountedStore()
    const failure = await controller.saveRoute('openrouter', [
      { ref: 'OPENROUTER_KEYROTATION_1', value: '  typed-secret  ' },
      { ref: 'OPENROUTER_KEYROTATION_3', value: 'another-secret' },
    ])
    expect(failure).toBeUndefined()

    // Dropped references unset; typed values land trimmed in the credential store.
    expect(unsets).toEqual([{ ref: 'OPENROUTER_KEYROTATION_2' }])
    expect(sets).toEqual([
      { ref: 'OPENROUTER_KEYROTATION_1', value: 'typed-secret' },
      { ref: 'OPENROUTER_KEYROTATION_3', value: 'another-secret' },
    ])
    // The settings write carries reference names only — never a key value — as
    // one whole-array keys op over the draft order.
    expect(mutations).toEqual([{
      ns: ROTATION_NS,
      ops: [{
        op: 'set',
        path: ['providers', 'openrouter', 'keys'],
        value: [{ apiKeyEnv: 'OPENROUTER_KEYROTATION_1' }, { apiKeyEnv: 'OPENROUTER_KEYROTATION_3' }],
      }],
    }])
    expect(JSON.stringify(mutations[0])).not.toContain('secret')
    // The write answer folded into the mirror and the reload refreshed the pool.
    expect(controller.store.getSnapshot().status).toBe('ready')
    expect(controller.store.getSnapshot().namespace?.ns).toBe(ROTATION_NS)
  })

  it('skips credential writes for kept rows with blank values and writes no ops when unchanged', async () => {
    const { controller, mutations, sets, unsets } = await mountedStore()
    const failure = await controller.saveRoute('openrouter', [
      { ref: 'OPENROUTER_KEYROTATION_1', value: '' },
      { ref: 'OPENROUTER_KEYROTATION_2', value: '  ' },
    ])
    expect(failure).toBeUndefined()
    expect(sets).toEqual([])
    expect(unsets).toEqual([])
    expect(mutations).toEqual([])
  })

  it('treats an unaddressed row as nothing to store yet', async () => {
    const { controller, mutations, sets } = await mountedStore()
    // A brand-new row carries its derived reference once added by the editor;
    // saveRoute itself still guards the unaddressed shape defensively.
    const failure = await controller.saveRoute('openrouter', [
      { ref: 'OPENROUTER_KEYROTATION_1', value: '' },
      { ref: '', value: 'untethered' },
    ])
    expect(failure).toBeUndefined()
    expect(sets).toEqual([])
    // Only the kept first row reaches the settings document.
    expect(mutations).toEqual([{
      ns: ROTATION_NS,
      ops: [{
        op: 'set',
        path: ['providers', 'openrouter', 'keys'],
        value: [{ apiKeyEnv: 'OPENROUTER_KEYROTATION_1' }],
      }],
    }])
  })

  it('removes every row into one profile unset plus the references unsets', async () => {
    const { controller, mutations, unsets } = await mountedStore()
    const failure = await controller.saveRoute('openrouter', [])
    expect(failure).toBeUndefined()
    expect(mutations).toEqual([{
      ns: ROTATION_NS,
      ops: [{ op: 'unset', path: ['providers', 'openrouter'] }],
    }])
    expect(unsets).toEqual([
      { ref: 'OPENROUTER_KEYROTATION_1' },
      { ref: 'OPENROUTER_KEYROTATION_2' },
    ])
  })

  it('keeps the failure text of a refused mutation and reports it to the card', async () => {
    const { controller, mutations } = await mountedStore({ mutateAnswer: fail('settings-conflict') })
    const failure = await controller.saveRoute('openrouter', [
      { ref: 'OPENROUTER_KEYROTATION_3', value: 'new-secret' },
    ])
    expect(failure).toBe('settings-conflict')
    expect(mutations).toHaveLength(1)
  })

  it('reports a refused credential write mid-save', async () => {
    const { controller, sets } = await mountedStore({ setAnswer: fail('credential store is read-only') })
    const failure = await controller.saveRoute('openrouter', [
      { ref: 'OPENROUTER_KEYROTATION_1', value: 'typed' },
    ])
    expect(failure).toBe('credential store is read-only')
    expect(sets).toHaveLength(1)
  })

  it('reports a refused reference removal mid-save', async () => {
    const { controller, unsets } = await mountedStore({ unsetAnswer: fail('credential is read-only') })
    const failure = await controller.saveRoute('openrouter', [
      { ref: 'OPENROUTER_KEYROTATION_1', value: '' },
    ])
    expect(failure).toBe('credential is read-only')
    expect(unsets).toHaveLength(1)
  })

  it('treats a describe answer without the writable flag as read-only', async () => {
    // The wire answer omits `writable`; the mirror's view type keeps it required,
    // so the fixture widens through the same erased face the store reads.
    const describeAnswer = ok({ hasDocument: false, namespaces: [NAMESPACE] }) as never
    const wired = scripted({ describeAnswer })
    const controller = createKeyRotationStore(wired.face as never, wired.mirror)
    await controller.load()
    expect(controller.store.getSnapshot().writable).toBe(false)
  })
})

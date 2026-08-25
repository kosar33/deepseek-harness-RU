/** Page-store join and pure helpers: pool snapshot × settings namespace × credential states. */
import { describe, expect, it } from 'vitest'
import type {
  CredentialView, KeyRotationRouteView, RpcResponse, SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import {
  baseOwnedRoutes, countdownParts, createKeyRotationStore, deriveKeyRef, draftFailure, draftOf, fill,
  messageOf, routeNameValid, routeOps, storedRefsOf,
} from '../src/client/store.ts'

let nextRpc = 0
function ok<T>(value: T): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: true, value } }
}
function fail<T>(message: string): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: false, error: { code: 'internal', message, details: {} } } }
}

/** A resolved namespace storing one user route plus one base-layer route. */
const NAMESPACE: SettingsNamespaceView = {
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
  base: { providers: { builtin: { models: [{ id: 'b' }], keys: [{ apiKeyEnv: 'BUILTIN_KEY' }] } } },
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
  configured?: boolean
  routes?: KeyRotationRouteView[]
  namespaces?: SettingsNamespaceView[]
  writable?: boolean
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
      keyRotation: () => Promise.resolve(ok({
        configured: options.configured ?? true,
        routes: options.routes ?? ROUTES,
      })),
    },
    settings: {
      describe: () => Promise.resolve(ok({
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
  const wire = face as never
  return { face: wire, mirror: new SettingsDescribeMirror(wire), mutations, sets, unsets }
}

async function mountedStore(options?: ScriptedOptions) {
  const wired = scripted(options)
  const controller = createKeyRotationStore(wired.face as never, wired.mirror)
  await controller.load()
  return { controller, ...wired }
}

/** Drain the microtask queue so fire-and-forget credential reads settle. */
async function settled(): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
}

describe('pure helpers', () => {
  it('derives references one past the largest index already in use', () => {
    expect(deriveKeyRef('openrouter', [])).toBe('OPENROUTER_KEYROTATION_1')
    expect(deriveKeyRef('openrouter', ['OPENROUTER_KEYROTATION_1', 'OTHER_KEY'])).toBe('OPENROUTER_KEYROTATION_2')
    expect(deriveKeyRef('openrouter', ['OPENROUTER_KEYROTATION_7'])).toBe('OPENROUTER_KEYROTATION_8')
    // Non-numeric tails and lower numbers never raise the watermark.
    expect(deriveKeyRef('openrouter', ['OPENROUTER_KEYROTATION_X', 'OPENROUTER_KEYROTATION_5', 'OPENROUTER_KEYROTATION_2']))
      .toBe('OPENROUTER_KEYROTATION_6')
  })

  it('rounds countdown minutes up so an expiring park never reads zero', () => {
    const now = Date.parse('2026-08-24T12:00:00.000Z')
    expect(countdownParts('2026-08-24T12:00:20.000Z', now)).toEqual({ hours: 0, minutes: 1 })
    expect(countdownParts('2026-08-24T13:30:00.000Z', now)).toEqual({ hours: 1, minutes: 30 })
    // A reset instant in the past still reports one minute rather than going negative.
    expect(countdownParts('2026-08-24T11:00:00.000Z', now)).toEqual({ hours: 0, minutes: 1 })
  })

  it('fills named template slots', () => {
    expect(fill('{route} gone', { route: 'x' })).toBe('x gone')
    expect(fill('{missing}', {})).toBe('{missing}')
  })

  it('validates route names as addressable dict keys', () => {
    expect(routeNameValid('openrouter')).toBe(true)
    expect(routeNameValid('a-b-2')).toBe(true)
    expect(routeNameValid('OpenRouter')).toBe(false)
    expect(routeNameValid('1abc')).toBe(false)
    expect(routeNameValid('')).toBe(false)
  })

  it('judges drafts before any wire call', () => {
    const storedRefs = ['R_1']
    const good = {
      displayName: '', baseURL: '', api: '',
      models: [{ id: 'm', name: '', contextWindow: '' }],
      keys: [
        { ref: 'R_1', value: '' }, // blank on a stored reference means keep
        { ref: 'R_2', value: 'v' },
      ],
    }
    expect(draftFailure(good, storedRefs)).toBeUndefined()
    expect(draftFailure({ ...good, models: [] }, storedRefs)).toBe('modelIdRequired')
    expect(draftFailure({ ...good, models: [{ id: '', name: '', contextWindow: '' }] }, storedRefs)).toBe('modelIdRequired')
    expect(draftFailure({
      ...good, models: [{ id: 'm', name: '', contextWindow: '' }, { id: 'm', name: '', contextWindow: '' }],
    }, storedRefs)).toBe('modelIdDuplicate')
    expect(draftFailure({
      ...good, models: [{ id: 'm', name: '', contextWindow: 'x' }],
    }, storedRefs)).toBe('contextWindowInvalid')
    expect(draftFailure({
      ...good, models: [{ id: 'm', name: '', contextWindow: '0' }],
    }, storedRefs)).toBe('contextWindowInvalid')
    // A brand-new row with no typed value would silently store nothing.
    expect(draftFailure({ ...good, keys: [{ ref: 'R_NEW', value: '' }] }, storedRefs)).toBe('keyBlank')
  })

  it('builds minimal path ops against the stored section', () => {
    const draft = {
      displayName: 'OpenRouter',
      baseURL: 'https://changed.example/api/v1',
      api: 'openai-completions',
      models: [{ id: 'm-1', name: 'Model One', contextWindow: '8192' }],
      keys: [{ ref: 'OPENROUTER_KEYROTATION_1', value: '' }, { ref: 'OPENROUTER_KEYROTATION_2', value: '' }],
    }
    const ops = routeOps('openrouter', draft, NAMESPACE)
    // Only baseURL differs: one set; every untouched field stays owned where it is.
    expect(ops).toEqual([{ op: 'set', path: ['providers', 'openrouter', 'baseURL'], value: 'https://changed.example/api/v1' }])

    const reordered = { ...draft, baseURL: 'https://openrouter.example/api/v1', keys: [...draft.keys].reverse() }
    expect(routeOps('openrouter', reordered, NAMESPACE)).toEqual([{
      op: 'set',
      path: ['providers', 'openrouter', 'keys'],
      value: [{ apiKeyEnv: 'OPENROUTER_KEYROTATION_2' }, { apiKeyEnv: 'OPENROUTER_KEYROTATION_1' }],
    }])

    // A cleared field unsets instead of storing an empty string.
    const cleared = { ...draft, baseURL: 'https://openrouter.example/api/v1', displayName: '' }
    expect(routeOps('openrouter', cleared, NAMESPACE)).toEqual([
      { op: 'unset', path: ['providers', 'openrouter', 'displayName'] },
    ])

    // A route absent from the stored section lands as one whole profile.
    const fresh = { ...draft, displayName: '', api: '', keys: [{ ref: 'NEW_1', value: '' }] }
    expect(routeOps('fresh', fresh, NAMESPACE)).toEqual([{
      op: 'set',
      path: ['providers', 'fresh'],
      value: {
        baseURL: 'https://changed.example/api/v1',
        models: [{ id: 'm-1', name: 'Model One', contextWindow: 8192 }],
        keys: [{ apiKeyEnv: 'NEW_1' }],
      },
    }])
  })

  it('lands a brand-new profile with only the fields the card carries', () => {
    const fresh = {
      displayName: 'Fresh',
      baseURL: '',
      api: 'openai-completions',
      models: [{ id: 'f-1', name: '', contextWindow: '' }],
      keys: [{ ref: 'FRESH_1', value: '' }],
    }
    expect(routeOps('fresh', fresh, NAMESPACE)).toEqual([{
      op: 'set',
      path: ['providers', 'fresh'],
      value: {
        displayName: 'Fresh',
        api: 'openai-completions',
        models: [{ id: 'f-1' }],
        keys: [{ apiKeyEnv: 'FRESH_1' }],
      },
    }])
  })

  it('unsets cleared fields and skips fields the stored section does not own', () => {
    const draft = {
      displayName: 'OpenRouter',
      baseURL: 'https://openrouter.example/api/v1',
      api: 'openai-completions',
      models: [{ id: 'm-1', name: 'Model One', contextWindow: '8192' }],
      keys: [
        { ref: 'OPENROUTER_KEYROTATION_1', value: '' },
        { ref: 'OPENROUTER_KEYROTATION_2', value: '' },
      ],
    }
    // Clearing baseURL and api lands two unsets; every untouched field stays put.
    expect(routeOps('openrouter', { ...draft, baseURL: '', api: '' }, NAMESPACE)).toEqual([
      { op: 'unset', path: ['providers', 'openrouter', 'baseURL'] },
      { op: 'unset', path: ['providers', 'openrouter', 'api'] },
    ])

    // A stored profile owning nothing yet: inherited-blank fields emit nothing,
    // while the model and key rows still land as whole-column writes.
    const bare = { ...NAMESPACE, value: { providers: { mini: {} } } }
    expect(routeOps('mini', {
      displayName: '', baseURL: '', api: '',
      models: [{ id: 'm-9', name: '', contextWindow: '' }],
      keys: [{ ref: 'MINI_1', value: '' }],
    }, bare)).toEqual([
      { op: 'set', path: ['providers', 'mini', 'models'], value: [{ id: 'm-9' }] },
      { op: 'set', path: ['providers', 'mini', 'keys'], value: [{ apiKeyEnv: 'MINI_1' }] },
    ])
  })

  it('sets only the stored fields the draft actually renames', () => {
    const stored = { ...NAMESPACE, value: { providers: { full: { models: [{ id: 'm-1' }], keys: [{ apiKeyEnv: 'FULL_1' }] } } } }
    const ops = routeOps('full', {
      displayName: 'Full Name',
      baseURL: 'https://full.example/api/v1',
      api: 'anthropic',
      models: [{ id: 'm-1', name: 'm-1', contextWindow: '' }],
      keys: [{ ref: 'FULL_1', value: '' }],
    }, stored)
    // A name equal to the id stores no name; an empty context window inherits.
    expect(ops).toEqual([
      { op: 'set', path: ['providers', 'full', 'displayName'], value: 'Full Name' },
      { op: 'set', path: ['providers', 'full', 'baseURL'], value: 'https://full.example/api/v1' },
      { op: 'set', path: ['providers', 'full', 'api'], value: 'anthropic' },
    ])

    // A stored row missing its own reference compares equal to the blank
    // draft row, so keeping it writes nothing.
    const holey = { ...NAMESPACE, value: { providers: { hole: { keys: [{}] } } } }
    expect(routeOps('hole', {
      displayName: '', baseURL: '', api: '',
      models: [],
      keys: [{ ref: '', value: '' }],
    }, holey)).toEqual([])
  })

  it('reads absent profiles and absent fields into blank draft rows', () => {
    expect(draftOf('ghost', NAMESPACE)).toEqual({
      displayName: '', baseURL: '', api: '', models: [], keys: [],
    })
    const sparse = { ...NAMESPACE, value: { providers: { tiny: { models: [{}], keys: [{}] } } } }
    expect(draftOf('tiny', sparse)).toEqual({
      displayName: '', baseURL: '', api: '',
      models: [{ id: '', name: '', contextWindow: '' }],
      keys: [{ ref: '', value: '' }],
    })
  })

  it('lists stored references and base ownership of a namespace view', () => {
    expect(storedRefsOf('openrouter', NAMESPACE)).toEqual(['OPENROUTER_KEYROTATION_1', 'OPENROUTER_KEYROTATION_2'])
    expect(storedRefsOf('absent', NAMESPACE)).toEqual([])
    // A stored row without its own reference is skipped, not addressed empty.
    const hole = { ...NAMESPACE, value: { providers: { hole: { keys: [{}, { apiKeyEnv: 'HOLE_2' }] } } } }
    expect(storedRefsOf('hole', hole)).toEqual(['HOLE_2'])
    expect(baseOwnedRoutes(NAMESPACE).has('builtin')).toBe(true)
    expect(baseOwnedRoutes(NAMESPACE).has('openrouter')).toBe(false)
    expect(baseOwnedRoutes(undefined).size).toBe(0)
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
    expect(state.configured).toBe(true)
    expect(state.writable).toBe(true)
    expect(state.routes).toEqual(ROUTES)
    expect(state.namespace?.ns).toBe('llm-key-rotation')
    expect(state.error).toBeNull()
  })

  it('reports an absent plugin through configured=false', async () => {
    const { controller } = await mountedStore({ configured: false, routes: [] })
    const state = controller.store.getSnapshot()
    expect(state.configured).toBe(false)
    expect(state.routes).toEqual([])
  })

  it('reports a failed load through the error status with retryable text', async () => {
    const wired = scripted()
    const broken = createKeyRotationStore({
      llm: { keyRotation: () => Promise.resolve(fail('host exploded')) },
    } as never, wired.mirror)
    await broken.load()
    expect(broken.store.getSnapshot().status).toBe('error')
    expect(broken.store.getSnapshot().error).toBe('host exploded')
  })

  it('opens editors prefilled from the stored section and describes its references', async () => {
    const { controller } = await mountedStore()
    controller.openEditor('openrouter', false)
    const state = controller.store.getSnapshot()
    expect(state.editing).toBe('openrouter')
    expect(state.draft).toEqual({
      displayName: 'OpenRouter',
      baseURL: 'https://openrouter.example/api/v1',
      api: 'openai-completions',
      models: [{ id: 'm-1', name: 'Model One', contextWindow: '8192' }],
      keys: [
        { ref: 'OPENROUTER_KEYROTATION_1', value: '' },
        { ref: 'OPENROUTER_KEYROTATION_2', value: '' },
      ],
    })
    await settled()
    const credentials = controller.store.getSnapshot().credentials
    expect(credentials.get('OPENROUTER_KEYROTATION_1')?.configured).toBe(true)
    expect(credentials.get('OPENROUTER_KEYROTATION_2')?.configured).toBe(false)

    controller.closeEditor()
    expect(controller.store.getSnapshot().editing).toBeUndefined()
    expect(controller.store.getSnapshot().draft).toBeUndefined()
  })

  it('opens a new-route editor under the reserved name with derived rows', async () => {
    const { controller } = await mountedStore()
    controller.openEditor('newroute', true)
    const state = controller.store.getSnapshot()
    expect(state.editing).toBe('newroute')
    expect(state.draft).toEqual({
      displayName: '', baseURL: '', api: '',
      models: [{ id: '', name: '', contextWindow: '' }],
      keys: [{ ref: 'NEWROUTE_KEYROTATION_1', value: '' }],
    })
  })

  it('saves typed values through the credential seam and records references only', async () => {
    const { controller, mutations, sets, unsets } = await mountedStore()
    controller.openEditor('openrouter', false)
    controller.updateDraft({
      displayName: 'OpenRouter',
      baseURL: 'https://openrouter.example/api/v1',
      api: 'openai-completions',
      models: [{ id: 'm-1', name: 'Model One', contextWindow: '8192' }],
      keys: [
        { ref: 'OPENROUTER_KEYROTATION_1', value: 'brand-new-secret' },
        { ref: 'OPENROUTER_KEYROTATION_3', value: 'another-secret' },
      ],
    })
    await settled()
    expect(await controller.save()).toBe(true)

    // The settings write carries reference names only — never a key value.
    expect(mutations).toHaveLength(1)
    expect(JSON.stringify(mutations[0])).not.toContain('secret')
    // Typed values land in the credential store; the dropped second row's
    // reference is unset.
    expect(sets).toEqual([
      { ref: 'OPENROUTER_KEYROTATION_1', value: 'brand-new-secret' },
      { ref: 'OPENROUTER_KEYROTATION_3', value: 'another-secret' },
    ])
    expect(unsets).toEqual([{ ref: 'OPENROUTER_KEYROTATION_2' }])
    expect(controller.store.getSnapshot().editing).toBeUndefined()
    // The post-save reload refreshed the live panel.
    expect(controller.store.getSnapshot().status).toBe('ready')
  })

  it('keeps the editor open with the failure text when a write is refused', async () => {
    const { controller, sets, unsets } = await mountedStore({ mutateAnswer: fail('settings-conflict') })
    controller.openEditor('openrouter', false)
    controller.updateDraft({
      displayName: 'Changed',
      baseURL: 'https://openrouter.example/api/v1',
      api: 'openai-completions',
      models: [{ id: 'm-1', name: 'Model One', contextWindow: '8192' }],
      keys: [{ ref: 'OPENROUTER_KEYROTATION_1', value: 'kept-stored' }],
    })
    await settled()
    expect(await controller.save()).toBe(false)
    const state = controller.store.getSnapshot()
    expect(state.saveError).toBe('settings-conflict')
    expect(state.editing).toBe('openrouter')
    expect(unsets).toHaveLength(0)
    expect(sets).toHaveLength(0)
  })

  it('removes a user-owned route with its stored references and refuses base-owned ones', async () => {
    const { controller, mutations, unsets } = await mountedStore()
    expect(await controller.removeRoute('builtin')).toBe(false)
    expect(mutations).toHaveLength(0)

    expect(await controller.removeRoute('openrouter')).toBe(true)
    expect(mutations).toEqual([{ ns: 'llm-key-rotation', ops: [{ op: 'unset', path: ['providers', 'openrouter'] }] }])
    expect(unsets).toEqual([
      { ref: 'OPENROUTER_KEYROTATION_1' },
      { ref: 'OPENROUTER_KEYROTATION_2' },
    ])
  })

  it('refuses to save with no editor open', async () => {
    const { controller } = await mountedStore()
    expect(await controller.save()).toBe(false)
  })

  it('clears the credential states when the draft stops referencing any', async () => {
    const { controller } = await mountedStore()
    controller.openEditor('openrouter', false)
    await settled()
    expect(controller.store.getSnapshot().credentials.size).toBe(2)

    const { draft } = controller.store.getSnapshot()
    if (draft === undefined) throw new Error('editor did not open')
    controller.updateDraft({ ...draft, keys: [] })
    await settled()
    expect(controller.store.getSnapshot().credentials.size).toBe(0)
  })

  it('degrades failed credential reads to unknown states without failing the page', async () => {
    const wired = scripted()
    const broken = createKeyRotationStore({
      ...(wired.face as Record<string, unknown>),
      credentials: {
        describe: () => Promise.resolve(fail('describe-down')),
        set: () => Promise.resolve(ok({})),
        unset: () => Promise.resolve(ok({})),
      },
    } as never, wired.mirror)
    await broken.load()
    broken.openEditor('openrouter', false)
    await settled()
    expect(broken.store.getSnapshot().status).toBe('ready')
    expect(broken.store.getSnapshot().credentials.size).toBe(0)
  })

  it('keeps the editor open when removing a reference is refused mid-save', async () => {
    const wired = scripted()
    const refusingUnset = createKeyRotationStore({
      ...(wired.face as Record<string, unknown>),
      credentials: {
        describe: () => Promise.resolve(ok({ credentials: {} })),
        set: () => Promise.resolve(ok({})),
        unset: () => Promise.resolve(fail('unset-down')),
      },
    } as never, wired.mirror)
    await refusingUnset.load()
    refusingUnset.openEditor('openrouter', false)
    const { draft } = refusingUnset.store.getSnapshot()
    if (draft === undefined) throw new Error('editor did not open')
    refusingUnset.updateDraft({ ...draft, keys: [{ ref: 'OPENROUTER_KEYROTATION_1', value: '' }] })
    await settled()

    expect(await refusingUnset.save()).toBe(false)
    const state = refusingUnset.store.getSnapshot()
    expect(state.saveError).toBe('unset-down')
    expect(state.editing).toBe('openrouter')
  })

  it('records the failure text when a credential write is refused mid-save', async () => {
    const wired = scripted()
    const refusingSet = createKeyRotationStore({
      ...(wired.face as Record<string, unknown>),
      credentials: {
        describe: () => Promise.resolve(ok({ credentials: {} })),
        set: () => Promise.resolve(fail('set-down')),
        unset: () => Promise.resolve(ok({})),
      },
    } as never, wired.mirror)
    await refusingSet.load()
    refusingSet.openEditor('openrouter', false)
    const { draft } = refusingSet.store.getSnapshot()
    if (draft === undefined) throw new Error('editor did not open')
    refusingSet.updateDraft({ ...draft, keys: [{ ref: 'OPENROUTER_KEYROTATION_1', value: 'typed' }] })
    await settled()

    expect(await refusingSet.save()).toBe(false)
    expect(refusingSet.store.getSnapshot().saveError).toBe('set-down')
  })

  it('reports the failure text when removing a route fails at its references', async () => {
    const wired = scripted()
    const refusingUnset = createKeyRotationStore({
      ...(wired.face as Record<string, unknown>),
      credentials: {
        describe: () => Promise.resolve(ok({ credentials: {} })),
        set: () => Promise.resolve(ok({})),
        unset: () => Promise.resolve(fail('unset-down')),
      },
    } as never, wired.mirror)
    await refusingUnset.load()

    expect(await refusingUnset.removeRoute('openrouter')).toBe(false)
    expect(refusingUnset.store.getSnapshot().saveError).toBe('unset-down')
  })

  it('treats a describe answer without the writable flag as read-only', async () => {
    const face = {
      llm: { keyRotation: () => Promise.resolve(ok({ configured: true, routes: ROUTES })) },
      settings: {
        describe: () => Promise.resolve(ok({ hasDocument: false, namespaces: [NAMESPACE] })),
        mutate: () => Promise.resolve(ok(NAMESPACE)),
      },
      credentials: {
        describe: () => Promise.resolve(ok({ credentials: {} })),
        set: () => Promise.resolve(ok({})),
        unset: () => Promise.resolve(ok({})),
      },
    }
    const wire = face as never
    const controller = createKeyRotationStore(wire, new SettingsDescribeMirror(wire))
    await controller.load()
    expect(controller.store.getSnapshot().status).toBe('ready')
    expect(controller.store.getSnapshot().writable).toBe(false)
  })
})

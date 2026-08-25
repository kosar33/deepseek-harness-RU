/**
 * Key-rotation settings page store: joins the rotation plugin's wire snapshot
 * (`llm.keyRotation`), the `llm-key-rotation` settings namespace (shared
 * settings mirror), and the credential states of the edited route's
 * references. The host stays the single fact source — every mutation writes
 * through the wire (credential values through `credentials.set` only, route
 * rows through `settings.mutate` path ops), and the page re-renders from the
 * next read, pushed or refetched.
 */

import type {
  CredentialView, IApiClient, KeyRotationRouteView, SettingsNamespaceView, SettingsPathOpView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'

/** The settings namespace the rotation plugin owns. */
export const ROTATION_NS = 'llm-key-rotation'

/** One editable key row in the editor draft. */
export interface KeyRowDraft {
  /**
   * The row's credential reference once saved; a brand-new unsaved row has an
   * empty ref and receives one at first save. Rows keep their reference for
   * their lifetime, so reordering permutes entries without moving secrets.
   */
  ref: string
  /** Typed key value; empty means keep whatever is already stored. */
  value: string
}

/** One editable model row in the editor draft. */
export interface ModelRowDraft {
  id: string
  name: string
  /** Stored as a number when set; an empty field inherits the provider default. */
  contextWindow: string
}

/** Editor draft of one rotated route's profile. */
export interface RouteDraft {
  displayName: string
  baseURL: string
  api: string
  models: ModelRowDraft[]
  keys: KeyRowDraft[]
}

/** Page snapshot. */
export interface KeyRotationState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Whole-load failure text; write failures stay inside the editor card. */
  error: string | null
  /**
   * Whether a composition mounts `@deepseek-ai/dsh-llm-key-rotation`; false
   * renders the section's not-composed notice instead of any editor.
   */
  configured: boolean
  /** Whether the settings provider accepts writes. */
  writable: boolean
  /** Live pool status from the plugin's state face; empty while dormant or absent. */
  routes: readonly KeyRotationRouteView[]
  /**
   * The `llm-key-rotation` settings namespace view, when the plugin is
   * composed; absence means the composition mounts no rotation plugin.
   */
  namespace: SettingsNamespaceView | undefined
  /** Credential states for the visible references, by ref. */
  credentials: ReadonlyMap<string, CredentialView>
  /** Route whose editor card is open; undefined shows the list posture. */
  editing: string | undefined
  /** Draft being edited for {@link editing}; new routes use the reserved name. */
  draft: RouteDraft | undefined
  /** Settled failure text of the last save attempt, cleared by the next edit. */
  saveError: string | null
}

/** Human text for any rejected wire call. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Mirror of the Models page's provider sanitization, kept in step with it. */
function sanitizeRoute(route: string): string {
  return route.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

/**
 * Derive the conventional credential reference for a route's next slot:
 * `<ROUTE>_KEYROTATION_<n>`, one past the largest index already in use, so a
 * reorder never re-points an existing reference at a different secret.
 * @param route - provider route id (e.g. `openrouter`).
 * @param existingRefs - references already used by this route's rows.
 * @returns the generated reference name (e.g. `OPENROUTER_KEYROTATION_3`).
 */
export function deriveKeyRef(route: string, existingRefs: readonly string[]): string {
  let max = 0
  const prefix = `${sanitizeRoute(route)}_KEYROTATION_`
  for (const ref of existingRefs) {
    if (!ref.startsWith(prefix)) continue
    const tail = Number(ref.slice(prefix.length))
    if (Number.isInteger(tail) && tail > max) max = tail
  }
  return `${prefix}${String(max + 1)}`
}

/** Stored profile shape the editor drafts from (redacted views carry refs only). */
interface StoredProfile {
  displayName?: string
  baseURL?: string
  api?: string
  models?: Array<{ id?: string; name?: string; contextWindow?: number }>
  keys?: Array<{ apiKeyEnv?: string }>
}

/** The stored providers dict of one namespace view, when it has one. */
export function storedProfiles(namespace: SettingsNamespaceView | undefined): Record<string, StoredProfile> {
  const value = namespace?.value as { providers?: Record<string, StoredProfile> } | undefined
  return value?.providers ?? {}
}

/**
 * Routes whose profile the composition base layer owns. The user layer cannot
 * delete these (removal restores the composition base), so the section hides
 * their delete affordance instead of letting the write fail.
 * @param namespace - the current namespace view (resolved + user layers).
 * @returns the route names owned by the base layer.
 */
export function baseOwnedRoutes(namespace: SettingsNamespaceView | undefined): ReadonlySet<string> {
  const base = namespace?.base as { providers?: Record<string, unknown> } | undefined
  return new Set(Object.keys(base?.providers ?? {}))
}

/** References the section currently stores for one route's key rows. */
export function storedRefsOf(route: string, namespace: SettingsNamespaceView | undefined): string[] {
  return (storedProfiles(namespace)[route]?.keys ?? []).map(key => key.apiKeyEnv ?? '').filter(ref => ref.length > 0)
}

/** Read one profile's fields into a fresh editor draft. */
export function draftOf(route: string, namespace: SettingsNamespaceView | undefined): RouteDraft {
  const profile = storedProfiles(namespace)[route] ?? {}
  return {
    displayName: profile.displayName ?? '',
    baseURL: profile.baseURL ?? '',
    api: profile.api ?? '',
    models: (profile.models ?? []).map(model => ({
      id: model.id ?? '',
      name: model.name ?? '',
      contextWindow: model.contextWindow === undefined ? '' : String(model.contextWindow),
    })),
    keys: (profile.keys ?? []).map(key => ({ ref: key.apiKeyEnv ?? '', value: '' })),
  }
}

/** Field-level validation failure keys, resolved against section copy. */
export type DraftFailureKey =
  | 'routeNameInvalid'
  | 'modelIdRequired'
  | 'modelIdDuplicate'
  | 'contextWindowInvalid'
  | 'keyBlank'

/**
 * Validate a draft before any wire call. A blank API-key row fails when its
 * reference is not already stored (a typed-past mistake must never be silently
 * dropped, and a brand-new row needs a value); a blank value on a stored
 * reference means keep what is there.
 * @param draft - the editor draft to judge.
 * @param storedRefs - references the section currently stores for this route.
 * @returns the first failure, or undefined to allow save.
 */
export function draftFailure(draft: RouteDraft, storedRefs: readonly string[]): DraftFailureKey | undefined {
  if (draft.models.length === 0 || draft.models.some(model => model.id.trim().length === 0)) return 'modelIdRequired'
  const seen = new Set<string>()
  for (const model of draft.models) {
    if (seen.has(model.id.trim())) return 'modelIdDuplicate'
    seen.add(model.id.trim())
    if (model.contextWindow.trim().length > 0
      && (!/^\d+$/.test(model.contextWindow.trim()) || Number(model.contextWindow) < 1)) {
      return 'contextWindowInvalid'
    }
  }
  const kept = new Set(storedRefs)
  for (const key of draft.keys) {
    if (key.value.trim().length === 0 && !kept.has(key.ref)) return 'keyBlank'
  }
  return undefined
}

/** Whether a route name can address a providers dict entry. */
export function routeNameValid(route: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(route)
}

/** Rendered model row for a settings write (numbers parsed, empties dropped). */
function modelValue(models: readonly ModelRowDraft[]): Array<{ id: string; name?: string; contextWindow?: number }> {
  return models.map((model) => {
    const id = model.id.trim()
    const name = model.name.trim()
    const context = model.contextWindow.trim()
    return {
      id,
      ...(name.length === 0 || name === id ? {} : { name }),
      ...(context.length === 0 ? {} : { contextWindow: Number(context) }),
    }
  })
}

/**
 * Build the minimal path ops that move one route's stored profile onto the
 * draft: per-field sets so base-layer fields the card never showed stay
 * owned where they are, and a whole-profile set for a route not yet in the
 * user document.
 * @param route - the route being saved.
 * @param draft - the editor draft.
 * @param namespace - the current namespace view (resolved + user layers).
 * @returns ordered ops for one `settings.mutate` call; empty when nothing changed.
 */
export function routeOps(
  route: string,
  draft: RouteDraft,
  namespace: SettingsNamespaceView | undefined,
): SettingsPathOpView[] {
  const root = ['providers', route]
  const stored = storedProfiles(namespace)[route]
  if (stored === undefined) {
    // New route (or a pure composition-base route being overridden for the
    // first time): the whole profile lands in the user layer as one unit.
    return [{
      op: 'set',
      path: root,
      value: {
        ...(draft.displayName.trim().length === 0 ? {} : { displayName: draft.displayName.trim() }),
        ...(draft.baseURL.trim().length === 0 ? {} : { baseURL: draft.baseURL.trim() }),
        ...(draft.api.trim().length === 0 ? {} : { api: draft.api.trim() }),
        models: modelValue(draft.models),
        keys: draft.keys.map(key => ({ apiKeyEnv: key.ref })),
      },
    }]
  }
  const ops: SettingsPathOpView[] = []
  const displayName = draft.displayName.trim()
  if ((stored.displayName ?? '') !== displayName) {
    ops.push(displayName.length === 0
      ? { op: 'unset', path: [...root, 'displayName'] }
      : { op: 'set', path: [...root, 'displayName'], value: displayName })
  }
  const baseURL = draft.baseURL.trim()
  if ((stored.baseURL ?? '') !== baseURL) {
    ops.push(baseURL.length === 0
      ? { op: 'unset', path: [...root, 'baseURL'] }
      : { op: 'set', path: [...root, 'baseURL'], value: baseURL })
  }
  const api = draft.api.trim()
  if ((stored.api ?? '') !== api) {
    ops.push(api.length === 0
      ? { op: 'unset', path: [...root, 'api'] }
      : { op: 'set', path: [...root, 'api'], value: api })
  }
  const nextModels = JSON.stringify(modelValue(draft.models))
  const storedModels = JSON.stringify(stored.models ?? [])
  if (nextModels !== storedModels) {
    ops.push({ op: 'set', path: [...root, 'models'], value: modelValue(draft.models) })
  }
  const nextKeys = JSON.stringify(draft.keys.map(key => ({ apiKeyEnv: key.ref })))
  const storedKeys = JSON.stringify((stored.keys ?? []).map(key => ({ apiKeyEnv: key.apiKeyEnv ?? '' })))
  if (nextKeys !== storedKeys) {
    ops.push({ op: 'set', path: [...root, 'keys'], value: draft.keys.map(key => ({ apiKeyEnv: key.ref })) })
  }
  return ops
}

/**
 * Countdown parts for a parked key's reset instant. Minutes round up, so a
 * park seconds from expiring still reads as one minute instead of zero.
 * @param resetAt - ISO 8601 reset instant from the snapshot.
 * @param nowMs - current time in epoch milliseconds.
 * @returns hours and minutes for the localized countdown template.
 */
export function countdownParts(resetAt: string, nowMs: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(1, Math.ceil((Date.parse(resetAt) - nowMs) / 60_000))
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}

/** Interpolate `{name}` slots of a localized template. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match)
}

/** Wire faces the page reads and writes through. */
type RotationApi = Pick<IApiClient, 'settings' | 'credentials' | 'llm'>

/** Factory producing the page store; declared at register, created in apply. */
export function createKeyRotationStore(api: RotationApi, describe: SettingsDescribeFace) {
  const store: SnapshotStore<KeyRotationState> = createSnapshotStore<KeyRotationState>({
    status: 'idle',
    error: null,
    configured: false,
    writable: true,
    routes: [],
    namespace: undefined,
    credentials: new Map(),
    editing: undefined,
    draft: undefined,
    saveError: null,
  })

  /** Fold one `llm.keyRotation` answer into the held state. */
  async function load(): Promise<void> {
    store.set({ ...store.getSnapshot(), status: 'loading', error: null })
    try {
      await describe.ensure()
      const rotation = await api.llm.keyRotation({}).then(response => response.result)
      if (!rotation.ok) throw new Error(rotation.error.message)
      const mirror = describe.getSnapshot()
      const namespace = mirror.view?.namespaces.find(view => view.ns === ROTATION_NS)
      store.set({
        ...store.getSnapshot(),
        status: 'ready',
        configured: rotation.value.configured,
        routes: rotation.value.routes,
        namespace,
        writable: mirror.view?.writable ?? false,
        error: mirror.error,
      })
    } catch (error: unknown) {
      store.set({ ...store.getSnapshot(), status: 'error', error: messageOf(error) })
    }
  }

  /** Describe the references the current draft addresses, after each edit. */
  async function refreshCredentials(refs: readonly string[]): Promise<void> {
    if (refs.length === 0) {
      store.set({ ...store.getSnapshot(), credentials: new Map() })
      return
    }
    try {
      const response = await api.credentials.describe({ refs: [...refs] })
      if (!response.result.ok) throw new Error(response.result.error.message)
      store.set({ ...store.getSnapshot(), credentials: new Map(Object.entries(response.result.value.credentials)) })
    } catch {
      // Row dots degrade to unknown; the editor itself does not depend on them.
    }
  }

  return {
    store,
    /** First-load entry point; safe to call again after invalidations. */
    load,
    /**
     * Open one route's editor card prefilled from the stored section, or open
     * a blank card for a new route name.
     */
    openEditor(route: string, isNew: boolean): void {
      const draft = isNew
        ? { displayName: '', baseURL: '', api: '', models: [{ id: '', name: '', contextWindow: '' }], keys: [{ ref: deriveKeyRef(route, []), value: '' }] }
        : draftOf(route, store.getSnapshot().namespace)
      store.set({ ...store.getSnapshot(), editing: route, draft, saveError: null })
      void refreshCredentials(draft.keys.map(key => key.ref).filter(ref => ref.length > 0))
    },
    /** Close the editor card without writing anything. */
    closeEditor(): void {
      store.set({ ...store.getSnapshot(), editing: undefined, draft: undefined, saveError: null })
    },
    /** Replace the whole draft after an edit; failures clear until the next save. */
    updateDraft(next: RouteDraft): void {
      store.set({ ...store.getSnapshot(), draft: next, saveError: null })
      void refreshCredentials(next.keys.map(key => key.ref).filter(ref => ref.length > 0))
    },
    /**
     * Save the open draft: credential writes for typed values, minimal path
     * ops for the profile, unsets for removed references — then reload.
     * @returns true when every write committed.
     */
    async save(): Promise<boolean> {
      const { editing, draft, namespace } = store.getSnapshot()
      if (editing === undefined || draft === undefined) return false
      try {
        const ops = routeOps(editing, draft, namespace)
        if (ops.length > 0) {
          const response = await api.settings.mutate({ ns: ROTATION_NS, ops })
          if (!response.result.ok) throw new Error(response.result.error.message)
          describe.acceptView(response.result.value)
        }
        for (const ref of storedRefsOf(editing, namespace)) {
          if (!draft.keys.some(key => key.ref === ref)) {
            const response = await api.credentials.unset({ ref })
            if (!response.result.ok) throw new Error(response.result.error.message)
          }
        }
        for (const key of draft.keys) {
          if (key.ref.length === 0 || key.value.trim().length === 0) continue
          const response = await api.credentials.set({ ref: key.ref, value: key.value.trim() })
          if (!response.result.ok) throw new Error(response.result.error.message)
        }
        store.set({ ...store.getSnapshot(), editing: undefined, draft: undefined, saveError: null })
        await load()
        return true
      } catch (error: unknown) {
        store.set({ ...store.getSnapshot(), saveError: messageOf(error) })
        return false
      }
    },
    /**
     * Remove a whole route the user layer owns: unset its profile, drop its
     * stored references, reload. Base-owned routes refuse here.
     */
    async removeRoute(route: string): Promise<boolean> {
      const { namespace } = store.getSnapshot()
      if (baseOwnedRoutes(namespace).has(route)) return false
      try {
        const response = await api.settings.mutate({ ns: ROTATION_NS, ops: [{ op: 'unset', path: ['providers', route] }] })
        if (!response.result.ok) throw new Error(response.result.error.message)
        describe.acceptView(response.result.value)
        for (const ref of storedRefsOf(route, namespace)) {
          const unsetResponse = await api.credentials.unset({ ref })
          if (!unsetResponse.result.ok) throw new Error(unsetResponse.result.error.message)
        }
        await load()
        return true
      } catch (error: unknown) {
        store.set({ ...store.getSnapshot(), saveError: messageOf(error) })
        return false
      }
    },
  }
}

/** The page store handle {@link createKeyRotationStore} returns. */
export type KeyRotationStore = ReturnType<typeof createKeyRotationStore>

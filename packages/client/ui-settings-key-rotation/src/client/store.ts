/**
 * Key-rotation credential-seat store: joins the rotation plugin's wire
 * snapshot (`llm.keyRotation`) and the `llm-key-rotation` settings namespace
 * (shared settings mirror). The host stays the single fact source — one
 * shared store serves every open provider card, while each card keeps its
 * own row draft as local state and writes through `settings.mutate` path ops
 * plus `credentials.set`.
 */

import type {
  IApiClient, KeyRotationRouteView, SettingsNamespaceView, SettingsPathOpView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'

/** The settings namespace the rotation plugin owns. */
export const ROTATION_NS = 'llm-key-rotation'

/** One editable key row in a provider card's local draft. */
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

/** Shared snapshot across every open provider card. */
export interface KeyRotationState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Whole-load failure text; write failures stay inside the provider card. */
  error: string | null
  /** Whether the settings provider accepts writes. */
  writable: boolean
  /** Live pool status from the plugin's state face; empty while dormant. */
  routes: readonly KeyRotationRouteView[]
  /**
   * The `llm-key-rotation` settings namespace view, when the plugin is
   * composed; absence means no keys are stored yet for any route.
   */
  namespace: SettingsNamespaceView | undefined
}

/**
 * Human text for any rejected wire call.
 * @param error - the caught value.
 * @returns its message, or its string form for non-Error values.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The stored providers dict of one namespace view, when it has one. */
function storedProfiles(namespace: SettingsNamespaceView | undefined): Record<string, { keys?: Array<{ apiKeyEnv?: string }> }> {
  const value = namespace?.value as { providers?: Record<string, { keys?: Array<{ apiKeyEnv?: string }> }> } | undefined
  return value?.providers ?? {}
}

/**
 * References the section currently stores for one route's key rows.
 * @param route - provider route id.
 * @param namespace - the current namespace view (resolved + user layers).
 * @returns the non-empty credential reference names in stored order.
 */
export function storedRefsOf(route: string, namespace: SettingsNamespaceView | undefined): string[] {
  return (storedProfiles(namespace)[route]?.keys ?? []).map(key => key.apiKeyEnv ?? '').filter(ref => ref.length > 0)
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
  const sanitize = (source: string): string => source.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  let max = 0
  const prefix = `${sanitize(route)}_KEYROTATION_`
  for (const ref of existingRefs) {
    if (!ref.startsWith(prefix)) continue
    const tail = Number(ref.slice(prefix.length))
    if (Number.isInteger(tail) && tail > max) max = tail
  }
  return `${prefix}${String(max + 1)}`
}

/**
 * Build the minimal path op that moves one route's stored keys onto the
 * draft order. A full row list lands as one whole-array `keys` set — key
 * order IS rotation priority, so there is no smaller unit — and deleting
 * every row removes the whole user-layer profile entry, because the host
 * refuses an empty keys list where it is written.
 * @param route - the route being saved.
 * @param refs - the saved reference names in draft order (non-empty ones).
 * @param namespace - the current namespace view (resolved + user layers).
 * @returns ordered ops for one `settings.mutate` call; empty when unchanged.
 */
export function keysOps(
  route: string,
  refs: readonly string[],
  namespace: SettingsNamespaceView | undefined,
): SettingsPathOpView[] {
  const next = JSON.stringify(refs.map(ref => ({ apiKeyEnv: ref })))
  const stored = JSON.stringify((storedProfiles(namespace)[route]?.keys ?? []).map(key => ({ apiKeyEnv: key.apiKeyEnv ?? '' })))
  if (next === stored) return []
  if (refs.length === 0) return [{ op: 'unset', path: ['providers', route] }]
  return [{ op: 'set', path: ['providers', route, 'keys'], value: refs.map(ref => ({ apiKeyEnv: ref })) }]
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

/**
 * Interpolate `{name}` slots of a localized template.
 * @param template - localized copy containing `{name}` slots.
 * @param vars - slot values keyed by name.
 * @returns the template with every known slot substituted.
 */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match)
}

/** Wire faces the seat reads and writes through. */
type RotationApi = Pick<IApiClient, 'settings' | 'credentials' | 'llm'>

/** The controller face components receive from the factory. */
export type KeyRotationController = {
  store: SnapshotStore<KeyRotationState>
  /** First-load entry point; safe to call again after invalidations. */
  load: () => Promise<void>
  /**
   * Save one provider card's rows: credential writes for typed values,
   * unsets for dropped references, one whole-array keys op — then reload.
   * @param route - the provider route whose keys this card edits.
   * @param rows - the card's current draft rows in display order.
   * @returns the failure message, or undefined once every write landed.
   */
  saveRoute: (route: string, rows: readonly KeyRowDraft[]) => Promise<string | undefined>
}

/**
 * Factory producing the shared store; declared at register, created in apply.
 * @param api - wire faces the store reads and writes through.
 * @param describe - settings-scope describe face resolving the namespace view.
 * @returns the store controller handle.
 */
export function createKeyRotationStore(api: RotationApi, describe: SettingsDescribeFace): KeyRotationController {
  const store: SnapshotStore<KeyRotationState> = createSnapshotStore<KeyRotationState>({
    status: 'idle',
    error: null,
    writable: true,
    routes: [],
    namespace: undefined,
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
        routes: rotation.value.routes,
        namespace,
        writable: mirror.view?.writable ?? false,
        error: mirror.error,
      })
    } catch (error: unknown) {
      store.set({ ...store.getSnapshot(), status: 'error', error: messageOf(error) })
    }
  }

  return {
    store,
    load,
    async saveRoute(route: string, rows: readonly KeyRowDraft[]): Promise<string | undefined> {
      const namespace = store.getSnapshot().namespace
      try {
        for (const ref of storedRefsOf(route, namespace)) {
          if (!rows.some(row => row.ref === ref)) {
            const response = await api.credentials.unset({ ref })
            if (!response.result.ok) throw new Error(response.result.error.message)
          }
        }
        for (const row of rows) {
          if (row.ref.length === 0 || row.value.trim().length === 0) continue
          const response = await api.credentials.set({ ref: row.ref, value: row.value.trim() })
          if (!response.result.ok) throw new Error(response.result.error.message)
        }
        const ops = keysOps(route, rows.map(row => row.ref).filter(ref => ref.length > 0), namespace)
        if (ops.length > 0) {
          const response = await api.settings.mutate({ ns: ROTATION_NS, ops })
          if (!response.result.ok) throw new Error(response.result.error.message)
          describe.acceptView(response.result.value)
        }
        await load()
        return undefined
      } catch (error: unknown) {
        return messageOf(error)
      }
    },
  }
}

/** The page store handle {@link createKeyRotationStore} returns. */
export type KeyRotationStore = ReturnType<typeof createKeyRotationStore>

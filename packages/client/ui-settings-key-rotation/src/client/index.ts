/**
 * Key-rotation settings plugin, browser half. Contributes the credential seat
 * rendered inside every Models provider card in place of the single API-key
 * input: ordered rotating keys for that card's route, edited through the
 * `llm-key-rotation` settings namespace with values travelling only through
 * the credential seam. The contribution installs only after a probe confirms
 * the Host serves the rotation face, so an unmounted host plugin leaves every
 * card on its native field. Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { KeysEditor } from './KeysEditor.tsx'
import type { KeysEditorInjected } from './KeysEditor.tsx'
import { createKeyRotationStore } from './store.ts'
import { en, ru, zh, type KeyRotationCopyKey } from './locales.ts'

export type { KeyRotationState, KeyRowDraft } from './store.ts'
export type { KeyRotationStore } from './store.ts'
export type { KeysEditorInjected, KeysEditorProps } from './KeysEditor.tsx'
export type { KeyRotationCopyKey } from './locales.ts'
export type { CountdownCopyKey } from './countdown.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The key-rotation provider-card seat copy. */
    'settings.key-rotation': KeyRotationCopyKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.key-rotation'

/**
 * Required services (cordis fiber inject). The target slot is declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registration depends on the slot through `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Whether the Host actually serves rotation state. The wire answers `ok` even
 * when no mounted composition provides the face — that case carries
 * `configured: false` — so the probe reads the flag, not the envelope; a
 * deployment without `@deepseek-ai/dsh-llm-key-rotation` must keep every
 * provider card on its native key field. The answer itself is not cached —
 * the store reloads it per render.
 * @param api - the connection's typed client.
 * @returns whether the mounted composition provides the rotation face.
 */
async function hostFaceAvailable(api: ConnectionHandle['api']): Promise<boolean> {
  try {
    const response = await api.llm.keyRotation({})
    return response.result.ok && response.result.value.configured
  } catch {
    return false
  }
}

/**
 * Register the shared store, keep it fresh on pushed invalidations, and —
 * once the Host face confirms — contribute the credential seat under the
 * Models section's hole.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ru }), 'ui-settings-key-rotation: copy dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  const controller = createKeyRotationStore(connection.api, ctx.settingsScope.describe())
  // The inject face shares one bound translate with the seat; copy freshness
  // rides the locale revision.
  const t = ctx.locale.bind(NS) as KeysEditorInjected['t']
  const injected = (): KeysEditorInjected => ({
    controller,
    hooks: { snapshot: controller.store },
    t,
  })

  // Pushed invalidations converge every open card without polling. Cards stay
  // idle until first rendered, like any other lazy surface.
  ctx.effect(() => {
    const refresh = (): void => {
      if (controller.store.getSnapshot().status === 'idle') return
      void controller.load()
    }
    const disposers = [
      ctx.remote.$on('settings/document-updated', () => { refresh() }),
      ctx.remote.$on('credentials/reference-updated', refresh),
      ctx.remote.$on('llm/adapters-updated', refresh),
      ctx.on('connection/reset', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-settings-key-rotation: pushed invalidations')

  // The probe runs once per plugin mount; effects bind to this apply fiber via
  // the stable `ctx` reference, so the late registration still disposes with
  // the plugin (and re-runs on HMR).
  void hostFaceAvailable(connection.api).then((available) => {
    if (!available) return
    ctx.slots.inject('settings.models.credential', () => ctx.slots.register({
      name: 'settings.models.credential',
      locale: NS,
      inject: injected,
    }, KeysEditor))
  })
}

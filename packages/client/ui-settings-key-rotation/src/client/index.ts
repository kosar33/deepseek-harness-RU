/**
 * Key-rotation settings plugin, browser half. Registers the Key rotation
 * page: live per-key pool status from `llm.keyRotation` beside an editor for
 * the `llm-key-rotation` settings namespace, whose API keys travel only
 * through the credential seam. The Host settings and credential contracts
 * stay behind their existing wire APIs. Export discipline:
 * packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { KeyRotationSection } from './KeyRotationSection.tsx'
import type { KeyRotationSectionInjected } from './KeyRotationSection.tsx'
import { createKeyRotationStore } from './store.ts'
import { en, ru, zh, type KeyRotationCopyKey } from './locales.ts'

export type { KeyRotationState, RouteDraft, KeyRowDraft, ModelRowDraft, DraftFailureKey } from './store.ts'
export type { KeyRotationStore } from './store.ts'
export type { KeyRotationSectionInjected, KeyRotationSectionProps } from './KeyRotationSection.tsx'
export type { KeyRotationCopyKey } from './locales.ts'
export type { CountdownCopyKey } from './countdown.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The key-rotation settings page copy. */
    'settings.key-rotation': KeyRotationCopyKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.key-rotation'

/**
 * Required services (cordis fiber inject). The target slot is declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registration depends on each slot through `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Register the Key rotation section once the `settings.section` declaration
 * is on the ledger, wire its store to the connection, and keep it fresh on
 * every pushed invalidation (settings, credentials, or provider topology — a
 * rebuild swaps the registered routes, so pools change under existing pages).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ru }), 'ui-settings-key-rotation: copy dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  const controller = createKeyRotationStore(connection.api, ctx.settingsScope.describe())
  // Registration-time text (the nav label thunk) and the inject face share
  // one bound translate; copy freshness rides the locale revision.
  const t = ctx.locale.bind(NS) as KeyRotationSectionInjected['t']
  const injected = (): KeyRotationSectionInjected => ({
    controller,
    hooks: { snapshot: controller.store },
    t,
  })

  // Pushed invalidations converge every open surface without polling. An
  // unopened page stays idle: nothing here fetches until the section loads.
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

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'key-rotation',
    order: 11,
    label: () => t('nav'),
    inject: injected,
  }, KeyRotationSection))
}

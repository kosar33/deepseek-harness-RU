/** Key-rotation section registration: slot declaration injection, the locale-following label thunk, and HMR recovery. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import type { RpcResponse, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-settings-key-rotation/client'
import { KeyRotationSection } from '../src/client/KeyRotationSection.tsx'

let nextRpc = 0
function ok<T>(value: T): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: true, value } }
}

// These specs assert the shipped Chinese copy. The lane has no jsdom `window`,
// so browser-language detection never runs and a fresh LocaleRuntime opens on
// FALLBACK_LOCALE (en); bench stages zh explicitly on the locale instead.

async function bench(isLoopback = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  // The plugin injects `remote`; forwarded events reach it through the same
  // `$dispatch` handoff the connection sink makes.
  new TestRemote(ctx)
  const namespaces: SettingsNamespaceView[] = [{
    ns: 'llm-key-rotation',
    schema: {},
    value: { providers: {} },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  }]
  ctx.provide('connection', {
    api: {
      llm: { keyRotation: () => Promise.resolve(ok({ configured: true, routes: [] })) },
      settings: { describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces })) },
      credentials: { describe: () => Promise.resolve(ok({ credentials: {} })) },
    },
    isLoopback,
  } as never)
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register(
    {
      name: 'root',
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    } as never,
    () => null,
  )
}

describe('ui-settings-key-rotation apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope'])
  })

  it('registers the key-rotation nav entry for declarations before or after apply', async () => {
    const before = await bench()
    declare(before.slots)
    await before.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = before.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(KeyRotationSection)
    expect(entry.options).toMatchObject({ id: 'key-rotation', order: 11 })
    // The nav label is a locale-following thunk; owners resolve at read time.
    expect(resolveSlotLabel(entry.options.label)).toBe('密钥轮换')
    const injected = (entry.inject as unknown as () => import('../src/client/KeyRotationSection.tsx').KeyRotationSectionInjected)()
    expect(injected.t('nav')).toBe('密钥轮换')
    expect(typeof injected.controller.load).toBe('function')
    expect(injected.hooks.snapshot).toBe(injected.controller.store)

    const after = await bench()
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    expect(after.slots.entries('settings.section')).toHaveLength(0)
    declare(after.slots)
    await Promise.resolve()
    expect(after.slots.entries('settings.section')[0]!.component).toBe(KeyRotationSection)
    // The self-inflicted ledger notifications hit the duplicate guard.
    expect(after.slots.entries('settings.section')).toHaveLength(1)
  })

  it('the label thunk follows the active locale without re-registration', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    b.locale.setLocale('en')
    expect(resolveSlotLabel(b.slots.entries('settings.section')[0]!.options.label)).toBe('Key rotation')
    b.locale.setLocale('zh')
    expect(resolveSlotLabel(b.slots.entries('settings.section')[0]!.options.label)).toBe('密钥轮换')
    b.locale.setLocale('ru')
    expect(resolveSlotLabel(b.slots.entries('settings.section')[0]!.options.label)).toBe('Ротация ключей')
  })

  it('re-registers after an HMR collapse re-declares the slot (stale disposer must not block)', async () => {
    const b = await bench()
    const redeclare = declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('settings.section')).toHaveLength(1)
    // Declarer unload: the cascade removes our entry while our local
    // disposer variable goes stale.
    redeclare()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    declare(b.slots)
    await Promise.resolve()
    expect(b.slots.entries('settings.section')[0]!.component).toBe(KeyRotationSection)
  })

  it('registers the zh/en/ru dictionaries and disposes everything with the fiber', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.locale.bind('settings.key-rotation')('nav')).toBe('密钥轮换')
    await fiber.dispose()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    // The (ns, locale) seats are free again — the dictionary disposers ran.
    expect(() => b.locale.register('settings.key-rotation', 'zh', {})).not.toThrow()
    expect(() => b.locale.register('settings.key-rotation', 'en', {})).not.toThrow()
    expect(() => b.locale.register('settings.key-rotation', 'ru', {})).not.toThrow()
  })
})

describe('pushed invalidations', () => {
  it('ignores invalidations before the page ever loaded', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    // The wire face has no mutate/set methods: a fetch attempt would throw.
    b.ctx.remote.$dispatch('settings/document-updated', ['llm-key-rotation', 1])
    b.ctx.remote.$dispatch('credentials/reference-updated', ['OPENROUTER_KEYROTATION_1'])
    b.ctx.remote.$dispatch('llm/adapters-updated', [])
    b.ctx.emit('connection/reset')
  })

  it('refreshes a loaded page on every pushed invalidation channel', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries('settings.section')[0]!
    const injected = (entry.inject as unknown as () => import('../src/client/KeyRotationSection.tsx').KeyRotationSectionInjected)()
    await injected.controller.load()
    const load = vi.spyOn(injected.controller, 'load').mockResolvedValue()
    b.ctx.remote.$dispatch('settings/document-updated', ['llm-key-rotation', 2])
    expect(load).toHaveBeenCalledTimes(1)
    b.ctx.remote.$dispatch('credentials/reference-updated', ['OPENROUTER_KEYROTATION_1'])
    expect(load).toHaveBeenCalledTimes(2)
    b.ctx.remote.$dispatch('llm/adapters-updated', [])
    expect(load).toHaveBeenCalledTimes(3)
    b.ctx.emit('connection/reset')
    expect(load).toHaveBeenCalledTimes(4)
  })
})

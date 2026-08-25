/** Credential-seat registration: host probe gating, locale-following copy, pushed invalidations, and HMR recovery. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import type { RpcResponse, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-settings-key-rotation/client'
import { KeysEditor } from '../src/client/KeysEditor.tsx'
import type { KeysEditorInjected } from '../src/client/KeysEditor.tsx'

// These specs assert the shipped Chinese copy. The lane has no jsdom `window`,
// so browser-language detection never runs and a fresh LocaleRuntime opens on
// FALLBACK_LOCALE (en); bench stages zh explicitly on the locale instead.

let nextRpc = 0
function ok<T>(value: T): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: true, value } }
}
function fail<T>(message: string): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: false, error: { code: 'internal', message, details: {} } } }
}

interface BenchOptions {
  rotationAnswer?: RpcResponse<{ configured: boolean; routes: [] }>
  rejectProbe?: boolean
}

async function bench(options: BenchOptions = {}): Promise<{
  ctx: Context
  slots: SlotRegistry
  locale: LocaleRuntime
  reads: () => number
}> {
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
  let reads = 0
  const api = {
    llm: {
      keyRotation: () => {
        reads += 1
        if (options.rejectProbe === true) return Promise.reject(new Error('probe down'))
        return Promise.resolve(options.rotationAnswer ?? ok({ configured: true, routes: [] }))
      },
    },
    settings: { describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces })) },
    credentials: {
      set: () => Promise.resolve(ok({})),
      unset: () => Promise.resolve(ok({})),
    },
  }
  ctx.provide('connection', { api, isLoopback: true } as never)
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, reads: () => reads }
}

function declare(slots: SlotRegistry): () => void {
  const disposeRoot = slots.register(
    {
      name: 'root',
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    } as never,
    () => null,
  )
  // The credential hole is declared by the Models section owner in production;
  // this stub carries the same children declaration.
  const disposeModels = slots.register(
    {
      name: 'settings.section',
      id: 'models',
      order: 10,
      label: 'Models',
      children: { 'settings.models.credential': { kind: 'single', scope: 'root' } },
    } as never,
    () => null,
  )
  return () => {
    disposeModels()
    disposeRoot()
  }
}

/** Drain the microtask chain: the async probe settles, then the seat installs. */
async function settled(): Promise<void> {
  for (let tick = 0; tick < 6; tick++) await Promise.resolve()
}

function injectedOf(bench_: Awaited<ReturnType<typeof bench>>): KeysEditorInjected {
  const entry = bench_.slots.entries('settings.models.credential')[0]!
  return (entry.inject as unknown as () => KeysEditorInjected)()
}

describe('ui-settings-key-rotation apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope'])
  })

  it('registers the credential seat for declarations before or after apply', async () => {
    const before = await bench()
    declare(before.slots)
    await before.ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(before.slots.entries('settings.models.credential')).toHaveLength(1) })
    const entry = before.slots.entries('settings.models.credential')[0]!
    expect(entry.component).toBe(KeysEditor)
    // The hole renders exactly one seat per card: no nav identity of its own,
    // and the declared dictionary namespace backs the synthesized `t` seat.
    expect(entry.options.id).toBeUndefined()
    expect(entry.options.order).toBeUndefined()
    expect(entry.locale).toBe('settings.key-rotation')
    const injected = injectedOf(before)
    expect(injected.t('title')).toBe('密钥轮换')
    expect(typeof injected.controller.load).toBe('function')
    expect(typeof injected.controller.saveRoute).toBe('function')
    expect(injected.hooks.snapshot).toBe(injected.controller.store)

    const after = await bench()
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    // The probe settles while the hole is undeclared: the injection waits.
    await settled()
    expect(after.slots.entries('settings.models.credential')).toHaveLength(0)
    declare(after.slots)
    await vi.waitFor(() => { expect(after.slots.entries('settings.models.credential')).toHaveLength(1) })
    expect(after.slots.entries('settings.models.credential')[0]!.component).toBe(KeysEditor)
  })

  it('keeps every card on its native field when the probe answers not-ok', async () => {
    const b = await bench({ rotationAnswer: fail('rotation plugin is not mounted') })
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    await settled()
    expect(b.reads()).toBe(1)
    expect(b.slots.entries('settings.models.credential')).toHaveLength(0)
  })

  it('keeps every card on its native field when the wire answers ok but unconfigured', async () => {
    // The envelope stays ok even with no mounted composition; only the
    // `configured` flag separates that deployment from a serving one.
    const b = await bench({ rotationAnswer: ok({ configured: false, routes: [] }) })
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    await settled()
    expect(b.reads()).toBe(1)
    expect(b.slots.entries('settings.models.credential')).toHaveLength(0)
  })

  it('keeps every card on its native field when the probe transport rejects', async () => {
    const b = await bench({ rejectProbe: true })
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    await settled()
    expect(b.reads()).toBe(1)
    expect(b.slots.entries('settings.models.credential')).toHaveLength(0)
  })

  it('the seat copy follows the active locale without re-registration', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(b.slots.entries('settings.models.credential')).toHaveLength(1) })
    const factory = b.slots.entries('settings.models.credential')[0]!.inject as unknown as () => KeysEditorInjected
    expect(factory().t('title')).toBe('密钥轮换')
    b.locale.setLocale('en')
    expect(factory().t('title')).toBe('Key rotation')
    b.locale.setLocale('zh')
    expect(factory().t('title')).toBe('密钥轮换')
    b.locale.setLocale('ru')
    expect(factory().t('title')).toBe('Ротация ключей')
  })

  it('re-registers after an HMR collapse re-declares the slot (stale disposer must not block)', async () => {
    const b = await bench()
    const redeclare = declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(b.slots.entries('settings.models.credential')).toHaveLength(1) })
    // Declarer unload: the cascade removes our entry while our local
    // disposer variable goes stale.
    redeclare()
    expect(b.slots.entries('settings.models.credential')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('settings.models.credential')).toHaveLength(1) })
    expect(b.slots.entries('settings.models.credential')[0]!.component).toBe(KeysEditor)
  })

  it('registers the zh/en/ru dictionaries and disposes everything with the fiber', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await vi.waitFor(() => { expect(b.slots.entries('settings.models.credential')).toHaveLength(1) })
    expect(b.locale.bind('settings.key-rotation')('title')).toBe('密钥轮换')
    await fiber.dispose()
    expect(b.slots.entries('settings.models.credential')).toHaveLength(0)
    // The (ns, locale) seats are free again — the dictionary disposers ran.
    expect(() => b.locale.register('settings.key-rotation', 'zh', {})).not.toThrow()
    expect(() => b.locale.register('settings.key-rotation', 'en', {})).not.toThrow()
    expect(() => b.locale.register('settings.key-rotation', 'ru', {})).not.toThrow()
  })
})

describe('pushed invalidations', () => {
  it('ignores invalidations before any card ever loaded', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(b.slots.entries('settings.models.credential')).toHaveLength(1) })
    // Only the probe has read the wire so far; every channel fires while idle.
    expect(b.reads()).toBe(1)
    b.ctx.remote.$dispatch('settings/document-updated', ['llm-key-rotation', 1])
    b.ctx.remote.$dispatch('credentials/reference-updated', ['OPENROUTER_KEYROTATION_1'])
    b.ctx.remote.$dispatch('llm/adapters-updated', [])
    b.ctx.emit('connection/reset')
    expect(b.reads()).toBe(1)
    expect(injectedOf(b).controller.store.getSnapshot().status).toBe('idle')
  })

  it('refreshes a loaded store on every pushed invalidation channel', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(b.slots.entries('settings.models.credential')).toHaveLength(1) })
    const controller = injectedOf(b).controller
    await controller.load()
    expect(b.reads()).toBe(2)
    const load = vi.spyOn(controller, 'load').mockResolvedValue()
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

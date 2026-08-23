<!-- Английская сторона генерируется scripts/gen-cordis-catalog.ts; русский файл ведётся вручную поверх пары EN/ZH.
     Обновление: сначала `pnpm run gen-cordis-catalog`, затем правьте перевод по диффу английской стороны и подтверждайте пару командой `node scripts/russian-docs/check.mjs --write docs/cordis-api/fiber.ru.md`. -->

# Fiber

[English](fiber.md) | [中文](fiber.zh.md) | Русский

Fiber — один загруженный экземпляр плагина: его состояние жизненного цикла, валидированная конфигурация и зарегистрированные эффекты. `ctx.fiber` — текущий fiber, а `ctx.effect()` делегирует к нему.

### ctx.effect(execute, label?)

```ts cordis-catalog
/**
 * Register a cleanup-aware effect on this fiber.
 *
 * `execute` runs immediately; the disposers it produces are collected and
 * run (in reverse order) either when the returned disposer is called or
 * when the fiber unloads, whichever comes first. Calling the disposer twice
 * is a no-op. Throws `CordisError('INACTIVE_EFFECT')` if the fiber is
 * already disposed, and `TypeError` if `execute` returns an invalid shape.
 *
 * @param execute — the effect body; see {@link Effect} for accepted shapes.
 * @param label — effect label shown in `getEffects()` diagnostics.
 * @returns a disposer that tears the effect down and settles once done.
 */
effect(execute: () => SyncEffect, label?: string): Disposable<Promise<void>>
effect(execute: () => Effect, label?: string): AsyncDisposable<Promise<void>>
```

Регистрирует на этом fiber эффект, учитывающий очистку.

`execute` выполняется немедленно; произведённые им disposers собираются и запускаются (в обратном порядке) либо при вызове возвращённого disposer'а, либо при выгрузке fiber — что наступит раньше. Повторный вызов disposer'а — no-op. Бросает `CordisError('INACTIVE_EFFECT')`, если fiber уже освобождён, и `TypeError`, если `execute` вернул недопустимую форму результата.

- `execute` — тело эффекта; допустимые формы см. в описании `Effect`.
- `label` — метка эффекта, показываемая в диагностике `getEffects()`.

**Возвращает** disposer, разбирающий эффект и завершающийся по готовности.

[Исходник](../../vendor/cordis/src/fiber.ts#L415)

### ctx.fiber

```ts cordis-catalog
/** The fiber (plugin runtime instance) that owns this context. */
fiber: Fiber
```

Fiber (экземпляр рантайма плагина), владеющий этим контекстом.

[Исходник](../../vendor/cordis/src/fiber.ts#L12)

## Класс Fiber

Экземпляр рантайма одного приложения-плагина.

Fiber отслеживает состояние зависимостей, валидированную конфигурацию, эффекты жизненного цикла и очистку для контекста плагина, возвращённого `ctx.plugin()`.

[Исходник](../../vendor/cordis/src/fiber.ts#L184)

### fiber.uid

```ts cordis-catalog
/** Unique id within the registry; 0 for the root fiber, `null` once disposed. */
public uid: number | null
```

Уникальный id в реестре; `0` у корневого fiber, `null` после освобождения.

[Исходник](../../vendor/cordis/src/fiber.ts#L186)

### fiber.ctx

```ts cordis-catalog
/** The context this fiber's plugin runs in (extends the parent context). */
public readonly ctx: Context
```

Контекст, в котором работает плагин этого fiber (расширяет родительский контекст).

[Исходник](../../vendor/cordis/src/fiber.ts#L188)

### fiber.config

```ts cordis-catalog
/** The validated plugin config (updated by `update()`). */
public config: any
```

Валидированная конфигурация плагина (обновляется методом `update()`).

[Исходник](../../vendor/cordis/src/fiber.ts#L190)

### fiber.state

```ts cordis-catalog
/** Current lifecycle state; transitions emit `internal/status`. */
public state
```

Текущее состояние жизненного цикла; переходы диспатчат `internal/status`.

[Исходник](../../vendor/cordis/src/fiber.ts#L194)

### fiber.dispose

```ts cordis-catalog
/** Dispose this fiber: unload the plugin, then settle once cleanup finished. */
public readonly dispose: () => Promise<void>
```

Освобождает этот fiber: выгружает плагин, затем завершается, когда очистка закончена.

[Исходник](../../vendor/cordis/src/fiber.ts#L196)

### fiber.store

```ts cordis-catalog
/** Snapshot of required service implementations while loaded; `undefined` otherwise. */
public store: Dict<Impl> | undefined
```

Снимок реализаций требуемых сервисов, пока плагин загружен; иначе `undefined`.

[Исходник](../../vendor/cordis/src/fiber.ts#L198)

### fiber.inertia

```ts cordis-catalog
/** The in-flight load/unload transition, if one is currently running. */
public inertia: Promise<void> | undefined
```

Текущий переход загрузки/выгрузки, если такой прямо сейчас исполняется.

[Исходник](../../vendor/cordis/src/fiber.ts#L200)

### fiber.name

```ts cordis-catalog
/** The plugin's display name, inherited from the nearest named ancestor, else `'root'`. */
get name()
```

Отображаемое имя плагина, унаследованное от ближайшего именованного предка, иначе `'root'`.

[Исходник](../../vendor/cordis/src/fiber.ts#L336)

### fiber.assertActive()

```ts cordis-catalog
/**
 * Throw if the fiber has already been disposed.
 *
 * @returns nothing when the fiber is still active.
 * @throws {CordisError} `INACTIVE_EFFECT` when the fiber's uid has been cleared.
 */
assertActive()
```

Бросает исключение, если fiber уже освобождён.

**Возвращает** ничего, пока fiber активен.

[Исходник](../../vendor/cordis/src/fiber.ts#L351)

### fiber.effect(execute, label?)

```ts cordis-catalog
/**
 * Register a cleanup-aware effect on this fiber.
 *
 * `execute` runs immediately; the disposers it produces are collected and
 * run (in reverse order) either when the returned disposer is called or
 * when the fiber unloads, whichever comes first. Calling the disposer twice
 * is a no-op. Throws `CordisError('INACTIVE_EFFECT')` if the fiber is
 * already disposed, and `TypeError` if `execute` returns an invalid shape.
 *
 * @param execute — the effect body; see {@link Effect} for accepted shapes.
 * @param label — effect label shown in `getEffects()` diagnostics.
 * @returns a disposer that tears the effect down and settles once done.
 */
effect(execute: () => SyncEffect, label?: string): Disposable<Promise<void>>
effect(execute: () => Effect, label?: string): AsyncDisposable<Promise<void>>
```

Регистрирует на этом fiber эффект, учитывающий очистку.

`execute` выполняется немедленно; произведённые им disposers собираются и запускаются (в обратном порядке) либо при вызове возвращённого disposer'а, либо при выгрузке fiber — что наступит раньше. Повторный вызов disposer'а — no-op. Бросает `CordisError('INACTIVE_EFFECT')`, если fiber уже освобождён, и `TypeError`, если `execute` вернул недопустимую форму результата.

- `execute` — тело эффекта; допустимые формы см. в описании `Effect`.
- `label` — метка эффекта, показываемая в диагностике `getEffects()`.

**Возвращает** disposer, разбирающий эффект и завершающийся по готовности.

[Исходник](../../vendor/cordis/src/fiber.ts#L415)

### fiber.getEffects()

```ts cordis-catalog
/**
 * Return metadata for currently registered effects.
 *
 * @returns one {@link EffectMeta} tree per labeled live effect.
 */
getEffects()
```

Возвращает метаданные зарегистрированных сейчас эффектов.

**Возвращает** одно дерево `EffectMeta` на каждый помеченный живой эффект.

[Исходник](../../vendor/cordis/src/fiber.ts#L568)

### fiber.await()

```ts cordis-catalog
/**
 * Wait for current lifecycle work and rethrow startup errors.
 *
 * @returns this fiber, once it has settled into a stable state.
 * @throws the config-validation or plugin-startup error, if any.
 */
async await()
```

Ожидает текущую работу жизненного цикла и перебрасывает ошибки старта.

**Возвращает** этот fiber — после того как он перешёл в устойчивое состояние.

[Исходник](../../vendor/cordis/src/fiber.ts#L704)

### fiber.restart()

```ts cordis-catalog
/**
 * Dispose and immediately reload this plugin with its current config.
 *
 * @returns a promise resolving once the reload settled.
 * @throws {CordisError} `INACTIVE_EFFECT` when the fiber is already disposed.
 */
async restart()
```

Освобождает и немедленно перезагружает этот плагин с его текущей конфигурацией.

**Возвращает** промис, разрешающийся по завершении перезагрузки.

[Исходник](../../vendor/cordis/src/fiber.ts#L718)

### fiber.update(config, noSave?)

```ts cordis-catalog
/**
 * Validate and apply new config, then restart the plugin.
 *
 * Runs the `internal/update` waterfall first, so update hooks (and HMR)
 * can veto or replace the restart.
 *
 * @param config — the new raw config; validated before anything restarts.
 * @param noSave — hint for persistence hooks not to write the change back.
 * @returns the update waterfall result; the default restart returns a promise.
 * @throws when validation, an update listener, or the restarted plugin fails.
 */
update(config: any, noSave = false)
```

Валидирует и применяет новую конфигурацию, затем перезапускает плагин.

Сначала запускает каскад `internal/update`, поэтому хуки обновления (и HMR) могут наложить вето или заменить перезапуск.

- `config` — новая сырая конфигурация; валидируется до того, что-либо перезапустится.
- `noSave` — подсказка хукам персистентности не записывать изменение обратно.

**Возвращает** результат каскада обновления; перезапуск по умолчанию возвращает промис.

[Исходник](../../vendor/cordis/src/fiber.ts#L736)

## Effect

Результат тела эффекта, принимаемый `ctx.effect()` и стартом плагина.

Либо одиночный disposer, либо промис такового, либо (возможно асинхронный) iterable, выдающий несколько — generator-эффекты регистрируют каждый выданный disposer по мере его производства.

```ts cordis-catalog
/**
 * Effect body result accepted by `ctx.effect()` and plugin startup.
 *
 * Either a single disposer, a promise of one, or a (possibly async) iterable
 * yielding several — generator effects register each yielded disposer as it
 * is produced.
 */
type Effect<T = any> =
  | SyncEffect<T>
  | AsyncEffect<T>
```

[Исходник](../../vendor/cordis/src/fiber.ts#L83)

## Disposable

Функция, возвращаемая эффектом для высвобождения ресурсов при разборке.

Disposers запускаются в порядке, обратном регистрации, когда владеющий fiber выгружается; они могут быть асинхронными — тогда выгрузка их ожидает.

```ts cordis-catalog
/**
 * Function returned by an effect to release resources during disposal.
 *
 * Disposers run in reverse registration order when the owning fiber unloads;
 * they may be async, in which case unloading awaits them.
 */
type Disposable<T = any> = () => T
```

[Исходник](../../vendor/cordis/src/fiber.ts#L74)

## EffectMeta

Узел дерева, служащий выставлению вложенных меток эффектов для диагностики.

```ts cordis-catalog
/** Tree node used to expose nested effect labels for diagnostics. */
interface EffectMeta {
  /** Human-readable effect label, e.g. `ctx.on("event")` or `ctx.provide("name")`. */
  label: string
  /** Metadata of nested effects registered while this effect ran. */
  children: EffectMeta[]
}
```

[Исходник](../../vendor/cordis/src/fiber.ts#L96)

## CordisError

Ошибка фреймворка со стабильным машиночитаемым кодом.

```ts cordis-catalog
/** Framework error with a stable machine-readable code. */
class CordisError extends Error {
  /**
   * @param code — the stable error code; also the default message.
   * @param message — optional human-readable override.
   */
  constructor(public code: CordisError.Code, message?: string)
}

/** Cordis error code definitions. */
namespace CordisError {
  export type Code = keyof typeof Code

  export const Code = {
    INACTIVE_EFFECT: 'cannot create effect on inactive context',
  } as const
}
```

[Исходник](../../vendor/cordis/src/fiber.ts#L157)

## ValidationError

Ошибка, возникающая при провале валидации конфигурации плагина по standard-schema.

```ts cordis-catalog
/** Error raised when plugin configuration fails standard-schema validation. */
class ValidationError extends TypeError {
  name = 'ValidationError'

  /**
   * Build the aggregated message from schema issues.
   *
   * @param issues — the standard-schema issues, one message line each.
   */
  constructor(issues: readonly StandardSchemaV1.Issue[])
}
```

[Исходник](../../vendor/cordis/src/fiber.ts#L19)

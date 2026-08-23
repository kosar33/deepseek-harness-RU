<!-- Английская сторона генерируется scripts/gen-cordis-catalog.ts; русский файл ведётся вручную поверх пары EN/ZH.
     Обновление: сначала `pnpm run gen-cordis-catalog`, затем правьте перевод по диффу английской стороны и подтверждайте пару командой `node scripts/russian-docs/check.mjs --write docs/cordis-api/events.ru.md`. -->

# События

[English](events.md) | [中文](events.zh.md) | Русский

API диспатча событий, подмешанный в каждый контекст. Декларации событий harness и их режимы диспатча генерируются на каждой владеющей ими [странице подсистемы](../subsystems/core.ru.md).

### ctx.parallel(name, ...args)

```ts cordis-catalog
/**
 * Dispatch an event, running all listeners concurrently.
 *
 * @param name — the event name.
 * @param args — arguments passed to every listener.
 * @returns a promise resolving once every listener has settled.
 */
parallel<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): Promise<void>
parallel<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): Promise<void>
```

Диспатчит событие, запуская все слушатели конкурентно.

- `name` — имя события.
- `args` — аргументы, передаваемые каждому слушателю.

**Возвращает** промис, который разрешается, когда завершатся все слушатели.

[Исходник](../../vendor/cordis/src/events.ts#L44)

### ctx.emit(name, ...args)

```ts cordis-catalog
/**
 * Dispatch an event synchronously, ignoring listener return values.
 *
 * @param name — the event name.
 * @param args — arguments passed to every listener.
 */
emit<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): void
emit<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): void
```

Диспатчит событие синхронно, игнорируя возвращаемые слушателями значения.

- `name` — имя события.
- `args` — аргументы, передаваемые каждому слушателю.

[Исходник](../../vendor/cordis/src/events.ts#L53)

### ctx.serial(name, ...args)

```ts cordis-catalog
/**
 * Dispatch an event, awaiting listeners in order until one bails.
 *
 * @param name — the event name.
 * @param args — arguments passed to each listener.
 * @returns the first bail value (non-null, non-false, non-undefined), if any.
 */
serial<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): Promisify<ReturnType<Events[K]>>
serial<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): Promisify<ReturnType<Events[K]>>
```

Диспатчит событие, ожидая слушателей по порядку, пока один из них не прервёт цепочку.

- `name` — имя события.
- `args` — аргументы, передаваемые каждому слушателю.

**Возвращает** первое значение досрочного выхода (не `null`, не `false` и не `undefined`), если оно было.

[Исходник](../../vendor/cordis/src/events.ts#L63)

### ctx.bail(name, ...args)

```ts cordis-catalog
/**
 * Dispatch an event, calling listeners in order until one bails.
 *
 * @param name — the event name.
 * @param args — arguments passed to each listener.
 * @returns the first bail value (non-null, non-false, non-undefined), if any.
 */
bail<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
bail<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
```

Диспатчит событие, вызывая слушателей по порядку, пока один из них не прервёт цепочку.

- `name` — имя события.
- `args` — аргументы, передаваемые каждому слушателю.

**Возвращает** первое значение досрочного выхода (не `null`, не `false` и не `undefined`), если оно было.

[Исходник](../../vendor/cordis/src/events.ts#L73)

### ctx.waterfall(name, ...args)

```ts cordis-catalog
/**
 * Dispatch an event whose last argument is a `next` continuation.
 *
 * Each listener wraps the rest of the chain: calling `next()` invokes the
 * next listener (finally the built-in behavior); not calling it vetoes.
 *
 * @param name — the event name.
 * @param args — listener arguments; the final one is the innermost `next`.
 * @returns the outermost listener's return value.
 */
waterfall<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
waterfall<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
```

Диспатчит событие, чей последний аргумент — продолжение `next`.

Каждый слушатель оборачивает остаток цепочки: вызов `next()` вызывает следующий слушатель (в конце — встроенное поведение); отказ от вызова накладывает вето.

- `name` — имя события.
- `args` — аргументы слушателей; последний из них — самый внутренний `next`.

**Возвращает** возвращаемое значение самого внешнего слушателя.

[Исходник](../../vendor/cordis/src/events.ts#L86)

### ctx.on(name, listener, options?)

```ts cordis-catalog
/**
 * Register an event listener owned by the current fiber.
 *
 * @param name — the event name to listen for.
 * @param listener — called with the dispatch arguments.
 * @param options — listener options; a boolean is shorthand for `prepend`.
 * @returns a disposer removing the listener; `true` if it was still registered.
 */
on<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean
```

Регистрирует слушателя события во владении текущего fiber.

- `name` — имя события, которое слушаем.
- `listener` — вызывается с аргументами диспатча.
- `options` — опции слушателя; булево значение — краткая форма `prepend`.

**Возвращает** disposer, удаляющего слушателя; `true`, если тот ещё был зарегистрирован.

[Исходник](../../vendor/cordis/src/events.ts#L97)

### ctx.once(name, listener, options?)

```ts cordis-catalog
/**
 * Same as `on()`, but the listener disposes itself after its first call.
 *
 * @param name — the event name to listen for.
 * @param listener — called at most once with the dispatch arguments.
 * @param options — listener options; a boolean is shorthand for `prepend`.
 * @returns a disposer removing the listener; `true` if it was still registered.
 */
once<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean
```

То же, что `on()`, но слушатель удаляет себя после первого вызова.

- `name` — имя события, которое слушаем.
- `listener` — вызывается не более одного раза с аргументами диспатча.
- `options` — опции слушателя; булево значение — краткая форма `prepend`.

**Возвращает** disposer, удаляющего слушателя; `true`, если тот ещё был зарегистрирован.

[Исходник](../../vendor/cordis/src/events.ts#L106)

## EventOptions

Опции, принимаемые `ctx.on()` и `ctx.once()`.

```ts cordis-catalog
/** Options accepted by `ctx.on()` and `ctx.once()`. */
interface EventOptions {
  /** Add the listener before existing listeners for the same event. */
  prepend?: boolean
  /** Receive the event regardless of context filter checks. */
  global?: boolean
}
```

[Исходник](../../vendor/cordis/src/events.ts#L112)

## DispatchMode

Стратегия диспатча событий, используемая сервисом событий.

`emit` запускает синхронных слушателей без их ожидания, `parallel` ожидает всех слушателей вместе, `serial` ожидает их по порядку, пока один не прервёт цепочку, `bail` останавливается на первом синхронном значении досрочного выхода, а `waterfall` компонует слушателей вокруг финального колбэка `next`.

```ts cordis-catalog
/**
 * Event dispatch strategy used by the event service.
 *
 * `emit` runs synchronous listeners without awaiting them, `parallel` awaits
 * all listeners together, `serial` awaits them in order until one bails,
 * `bail` stops on the first synchronous bail value, and `waterfall` composes
 * listeners around a final `next` callback.
 */
type DispatchMode = 'emit' | 'parallel' | 'serial' | 'bail' | 'waterfall'
```

[Исходник](../../vendor/cordis/src/events.ts#L32)

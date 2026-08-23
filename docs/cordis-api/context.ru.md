<!-- Английская сторона генерируется scripts/gen-cordis-catalog.ts; русский файл ведётся вручную поверх пары EN/ZH.
     Обновление: сначала `pnpm run gen-cordis-catalog`, затем правьте перевод по диффу английской стороны и подтверждайте пару командой `node scripts/russian-docs/check.mjs --write docs/cordis-api/context.ru.md`. -->

# Контекст

[English](context.md) | [中文](context.zh.md) | Русский

Контекст — центральный объект Cordis: каждый сервис, каждое событие и каждый API жизненного цикла достигаются через `ctx`. Методы событий описаны в разделе [События](events.ru.md), эффекты и текущий fiber — в разделе [Fiber](fiber.ru.md), загрузка плагинов — в разделе [Реестр](registry.ru.md).

Корневой и дочерние контейнеры зависимостей для плагинов Cordis.

Контекст — это прокси: обычное чтение свойств идёт через резолвер сервисов, тогда как `extend()`, `isolate()` и `intercept()` создают скоупированные дочерние контексты, не изменяя родителя.

[Исходник](../../vendor/cordis/src/context.ts#L42)

### ctx.extend(meta?)

```ts cordis-catalog
/**
 * Create a child context with extra metadata on top of the current scope.
 *
 * The child prototypally inherits every property of this context; own
 * properties of `meta` shadow the inherited ones. The parent is not mutated.
 *
 * @param meta — own properties (including symbol keys) to define on the child.
 * @returns a child context inheriting from this one.
 */
extend(meta = {}): this
```

Создаёт дочерний контекст с дополнительными метаданными поверх текущего скоупа.

Дочерний контекст прототипно наследует каждое свойство этого контекста; собственные свойства `meta` затеняют унаследованные. Родитель не изменяется.

- `meta` — собственные свойства (включая ключи типа `symbol`), определяемые на дочернем контексте.

**Возвращает** дочерний контекст, наследующий от текущего.

[Исходник](../../vendor/cordis/src/context.ts#L99)

### ctx.isolate(name, label?)

```ts cordis-catalog
/**
 * Create a child context with an independent service scope for `name`.
 *
 * Below the returned context, reads and writes of the service `name`
 * resolve against the new label instead of the parent's, so a different
 * implementation can be provided without affecting the parent scope.
 * Passing the same `label` to two `isolate()` calls joins their scopes.
 *
 * @param name — the service name to isolate.
 * @param label — scope label to join; defaults to a fresh unique symbol.
 * @returns a child context whose `name` service resolves in the new scope.
 */
isolate(name: string, label?: symbol)
```

Создаёт дочерний контекст с независимым скоупом сервисов для `name`.

Ниже возвращённого контекста чтение и запись сервиса `name` разрешаются через новую метку вместо родительской, поэтому иную реализацию можно предоставить, не задевая родительский скоуп. Передача одной и той же `label` двум вызовам `isolate()` объединяет их скоупы.

- `name` — имя изолируемого сервиса.
- `label` — метка скоупа, к которой присоединиться; по умолчанию — свежий уникальный символ.

**Возвращает** дочерний контекст, чей сервис `name` разрешается в новом скоупе.

[Исходник](../../vendor/cordis/src/context.ts#L121)

### ctx.intercept(name, config)

```ts cordis-catalog
/**
 * Add service-specific intercept config for plugins started below this
 * context.
 *
 * Plugins loaded under the returned context see `config` merged into the
 * service's resolved config (ancestor entries first; see
 * `Service[symbols.resolveConfig]`). The parent context is not affected.
 *
 * @param name — the service name whose config to intercept.
 * @param config — the intercept config to merge for that service.
 * @returns a child context carrying the additional intercept entry.
 */
intercept<K extends InjectKey>(name: K, config: Context[K] extends { [symbols.config]: infer T } ? T : never): this
intercept(name: string, config: any): this
```

Добавляет конфигурацию intercept для конкретного сервиса, которую видят плагины, запускаемые ниже этого контекста.

Плагины, загруженные под возвращённым контекстом, видят `config`, влитую в разрешённую конфигурацию сервиса (записи предков первыми; см. `Service[symbols.resolveConfig]`). На родительский контекст это не влияет.

- `name` — имя сервиса, чью конфигурацию нужно перехватить.
- `config` — конфигурация intercept, вливаемая для этого сервиса.

**Возвращает** дочерний контекст, несущий дополнительную запись intercept.

[Исходник](../../vendor/cordis/src/context.ts#L139)

### ctx.root

```ts cordis-catalog
/** The root context of the application (every child context shares it). @experimental */
root: this
```

Корневой контекст приложения (его разделяет каждый дочерний контекст). @experimental

[Исходник](../../vendor/cordis/src/context.ts#L22)

### ctx.baseUrl

```ts cordis-catalog
/** Base URL used to resolve relative plugin/module specifiers, if the runtime sets one. */
baseUrl?: string
```

Базовый URL для разрешения относительных спецификаторов плагинов и модулей, если рантайм его задаёт.

[Исходник](../../vendor/cordis/src/context.ts#L24)

### ctx.events

```ts cordis-catalog
/** The event bus. Its methods are also mixed onto `ctx` (`ctx.on`, `ctx.emit`, ...). */
events: EventsService
```

Шина событий. Её методы также подмешаны на `ctx` (`ctx.on`, `ctx.emit`, ...).

[Исходник](../../vendor/cordis/src/context.ts#L26)

### ctx.logger

```ts cordis-catalog
/** The logging service. Call `ctx.logger(name)` for a named logger. */
logger: LoggerService
```

Сервис журналирования. Вызовите `ctx.logger(name)`, чтобы получить именованный логгер.

[Исходник](../../vendor/cordis/src/context.ts#L28)

### ctx.reflect

```ts cordis-catalog
/** The reflection layer backing the context proxy (`ctx.get`, `ctx.provide`, ...). */
reflect: ReflectService
```

Слой рефлексии, стоящий за прокси контекста (`ctx.get`, `ctx.provide`, ...).

[Исходник](../../vendor/cordis/src/context.ts#L30)

### ctx.registry

```ts cordis-catalog
/** The plugin registry. Its methods are mixed onto `ctx` (`ctx.plugin`, `ctx.inject`). */
registry: RegistryService
```

Реестр плагинов. Его методы подмешаны на `ctx` (`ctx.plugin`, `ctx.inject`).

[Исходник](../../vendor/cordis/src/context.ts#L32)

## Статические члены

### Context.effect

```ts cordis-catalog
/** Symbol key under which a disposer exposes its {@link EffectMeta} diagnostics tree. */
static readonly effect: unique symbol
```

Ключ-symbol, под которым disposer выставляет своё диагностическое дерево EffectMeta.

[Исходник](../../vendor/cordis/src/context.ts#L44)

### Context.filter

```ts cordis-catalog
/** Symbol key for a context's listener filter, consulted on every event dispatch. */
static readonly filter: unique symbol
```

Ключ-symbol фильтра слушателей контекста, опрашиваемого при каждом диспатче события.

[Исходник](../../vendor/cordis/src/context.ts#L46)

### Context.isolate

```ts cordis-catalog
/** Symbol key of the isolation map (see the `Context[symbols.isolate]` property). */
static readonly isolate: unique symbol
```

Ключ-symbol карты изоляции (см. свойство `Context[symbols.isolate]`).

[Исходник](../../vendor/cordis/src/context.ts#L48)

### Context.intercept

```ts cordis-catalog
/** Symbol key of the intercept map (see the `Context[symbols.intercept]` property). */
static readonly intercept: unique symbol
```

Ключ-symbol карты intercept (см. свойство `Context[symbols.intercept]`).

[Исходник](../../vendor/cordis/src/context.ts#L50)

### Context.is(value)

```ts cordis-catalog
/**
 * Returns true for Cordis context proxies and context prototypes.
 *
 * Works across realms and across multiple copies of cordis, because the
 * brand is keyed by a global symbol rather than by `instanceof`.
 *
 * @param value — the value to test.
 * @returns `true` if `value` is a Cordis context, narrowing its type.
 */
static is(value: any): value is Context
```

Возвращает true для прокси контекстов Cordis и их прототипов.

Работает между realm'ами и между несколькими копиями cordis, потому что бренд ключуется глобальным символом, а не через `instanceof`.

- `value` — проверяемое значение.

**Возвращает** `true`, если `value` — контекст Cordis, сужая его тип.

[Исходник](../../vendor/cordis/src/context.ts#L61)

## Хранилище сервисов и миксины

### ctx.get(name, strict?)

```ts cordis-catalog
/**
 * Read a service from the store without the inject requirement.
 *
 * @param name — the service name.
 * @param strict — when `true` (default), only return implementations
 * whose providing fiber is currently active.
 * @returns the service value, or `undefined` when not (yet) provided.
 */
get<K extends string & keyof this>(name: K, strict?: boolean): undefined | this[K]
get(name: string, strict?: boolean): any
```

Читает сервис из хранилища без требования inject.

- `name` — имя сервиса.
- `strict` — когда `true` (по умолчанию), возвращаются только те реализации, чей предоставляющий fiber сейчас активен.

**Возвращает** значение сервиса либо `undefined`, если он ещё не предоставлен.

[Исходник](../../vendor/cordis/src/reflect.ts#L17)

### ctx.set(name, value)

```ts cordis-catalog
/**
 * Overwrite a provided service's value.
 *
 * Only the fiber that provided the service may set it; setting an
 * unprovided name throws.
 *
 * @param name — the service name.
 * @param value — the new service value.
 */
set<K extends string & keyof this>(name: K, value: undefined | this[K]): void
set(name: string, value: any): void
```

Перезаписывает значение предоставленного сервиса.

Установить сервис может только fiber, который его предоставил; попытка установить непредоставленное имя бросает исключение.

- `name` — имя сервиса.
- `value` — новое значение сервиса.

[Исходник](../../vendor/cordis/src/reflect.ts#L29)

### ctx.provide(name, value)

```ts cordis-catalog
/**
 * Register a service implementation owned by the current fiber.
 *
 * The service becomes visible to dependents in the same isolation scope
 * once the fiber is active; it is unregistered (waking dependents) when
 * the returned disposer runs or the fiber unloads. Throws if the name is
 * already provided in this scope or declared as an accessor.
 *
 * @param name — the service name.
 * @param value — the service value.
 * @returns a disposer that unregisters the service.
 */
provide<K extends string & keyof this>(name: K, value: undefined | this[K]): () => void
provide(name: string, value?: any): () => void
```

Регистрирует реализацию сервиса во владении текущего fiber.

Сервис становится видимым зависимым в том же изоляционном скоупе, как только fiber активен; регистрация снимается (пробуждая зависимых), когда выполняется возвращённый disposer либо fiber выгружается. Бросает исключение, если имя уже предоставлено в этом скоупе или объявлено как аксессор.

- `name` — имя сервиса.
- `value` — значение сервиса.

**Возвращает** disposer, снимающий регистрацию сервиса.

[Исходник](../../vendor/cordis/src/reflect.ts#L44)

### ctx.accessor(name, options)

```ts cordis-catalog
/**
 * Define a computed context property backed by get/set hooks.
 *
 * The accessor is removed when the current fiber unloads. Throws if the
 * name is already declared.
 *
 * @param name — the context property name.
 * @param options — the `get` hook and optional `set` hook.
 */
accessor(name: string, options: Omit<Property.Accessor, 'type'>): void
```

Объявляет вычисляемое свойство контекста, работающее на хуках get/set.

Аксессор удаляется при выгрузке текущего fiber. Бросает исключение, если имя уже объявлено.

- `name` — имя свойства контекста.
- `options` — хук `get` и необязательный хук `set`.

[Исходник](../../vendor/cordis/src/reflect.ts#L56)

### ctx.mixin(name, mixins)

```ts cordis-catalog
/**
 * Expose selected members of a service directly on `ctx`.
 *
 * Each mixed-in key becomes an accessor that forwards to the service
 * (binding methods to it), so e.g. `ctx.on` forwards to `ctx.events.on`.
 * Mixins are removed when the current fiber unloads.
 *
 * @param name — the context property holding the source service.
 * @param mixins — keys to forward, or a source-key → ctx-key map.
 */
mixin<K extends string & keyof this>(name: K, mixins: (keyof this & keyof this[K])[] | Dict<string>): void
mixin<T extends {}>(source: T, mixins: (keyof this & keyof T)[] | Dict<string>): void
```

Выставляет выбранные члены сервиса прямо на `ctx`.

Каждый подмешанный ключ становится аксессором, переадресующим к сервису (с привязкой методов к нему), так что, например, `ctx.on` переадресует к `ctx.events.on`. Миксины удаляются при выгрузке текущего fiber.

- `name` — свойство контекста, хранящее исходный сервис.
- `mixins` — ключи для переадресации либо карта «ключ источника → ключ ctx».

[Исходник](../../vendor/cordis/src/reflect.ts#L67)

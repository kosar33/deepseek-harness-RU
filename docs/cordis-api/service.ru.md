<!-- Английская сторона генерируется scripts/gen-cordis-catalog.ts; русский файл ведётся вручную поверх пары EN/ZH.
     Обновление: сначала `pnpm run gen-cordis-catalog`, затем правьте перевод по диффу английской стороны и подтверждайте пару командой `node scripts/russian-docs/check.mjs --write docs/cordis-api/service.ru.md`. -->

# Сервис

[English](service.md) | [中文](service.zh.md) | Русский

Базовый класс сервисов контекста. Подкласс, загруженный как плагин, регистрирует себя как `ctx.<имя>`.

Базовый класс для сервисов, выставляющих именованный API на `ctx`.

Подклассы вызывают `super(ctx, name)` из своего конструктора. Сервис регистрируется немедленно и автоматически удаляется вместе с владеющим fiber.

[Исходник](../../vendor/cordis/src/service.ts#L11)

### service.name

```ts cordis-catalog
/** The service name this instance is registered under. */
public name!: string
```

Имя сервиса, под которым зарегистрирован этот экземпляр.

[Исходник](../../vendor/cordis/src/service.ts#L30)

## Статические члены

### Service.init

```ts cordis-catalog
/** Symbol key of an instance method run after construction (class plugins). */
static readonly init: unique symbol
```

Ключ-symbol метода экземпляра, запускаемого после конструирования (классовые плагины).

[Исходник](../../vendor/cordis/src/service.ts#L13)

### Service.check

```ts cordis-catalog
/** Symbol key of the availability predicate passed to `ctx.provide()`. */
static readonly check: unique symbol
```

Ключ-symbol предиката доступности, передаваемого в `ctx.provide()`.

[Исходник](../../vendor/cordis/src/service.ts#L15)

### Service.config

```ts cordis-catalog
/** Symbol key of the phantom intercept-config type parameter. */
static readonly config: unique symbol
```

Ключ-symbol фантомного тип-параметра конфигурации intercept.

[Исходник](../../vendor/cordis/src/service.ts#L17)

### Service.invoke

```ts cordis-catalog
/** Symbol key of the call body making a service callable (e.g. `ctx.logger()`). */
static readonly invoke: unique symbol
```

Ключ-symbol тела вызова, делающего сервис вызываемым (например, `ctx.logger()`).

[Исходник](../../vendor/cordis/src/service.ts#L19)

### Service.extend

```ts cordis-catalog
/** Symbol key of the helper deriving an extended service instance. */
static readonly extend: unique symbol
```

Ключ-symbol хелпера, порождающего расширенный экземпляр сервиса.

[Исходник](../../vendor/cordis/src/service.ts#L21)

### Service.tracker

```ts cordis-catalog
/** Symbol key of the tracker metadata used for context tracing. */
static readonly tracker: unique symbol
```

Ключ-symbol метаданных трекера, используемых при трассировке контекста.

[Исходник](../../vendor/cordis/src/service.ts#L23)

### Service.resolveConfig

```ts cordis-catalog
/** Symbol key of the intercept-config resolution helper below. */
static readonly resolveConfig: unique symbol
```

Ключ-symbol хелпера разрешения конфигурации intercept, описанного ниже.

[Исходник](../../vendor/cordis/src/service.ts#L25)

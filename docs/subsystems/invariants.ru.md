# Рантайм-инварианты

[English](invariants.md) | [中文](invariants.zh.md) | Русский

[dsh-invariants](../../packages/runtime-diagnostics/invariants) — настраиваемый сервис-реестр (`ctx.invariants`) для рантайм-проверок инвариантов, принадлежащих пакетам. Это один пакет группы support, а не capability seam из трёх пакетов, и не часть стержня agent-loop: реестр владеет выбором, резервированием имён, жизненным циклом дочерних fiber и атрибуцией отказа пакету, а каждый пакет рабочего пространства публикует компаньон-плагин `./invariant`, регистрирующий проверки под своим точным npm-именем пакета. Что вправе утверждать проверка — авторитетные потоки событий или изменяемые данные, но никогда наличие сервиса или метода — определяет конвенция runtime-invariants в [AGENTS.md](../../AGENTS.md#conventions); дизайн реестра описан в [Agent Note об инвариант-сервисе](../../.agents/notes/implemented/architecture/2026-07-19-package-owned-invariant-service.md).

Источник: [`packages/runtime-diagnostics/invariants/src/index.ts`](../../packages/runtime-diagnostics/invariants/src/index.ts)

## Выбор

```ts type-equiv
/** Runtime invariant selection configured on the service plugin. */
interface Config {
  /** Global switch; defaults to `true`. */
  readonly enabled?: boolean
  /** Case-sensitive JavaScript regex sources that admit package names; empty admits all. */
  readonly package_allowlist?: string[]
  /** Case-sensitive JavaScript regex sources that exclude package names after allowlist matching. */
  readonly package_blocklist?: string[]
}
```

Пакет выбран, когда сервис включён, allowlist пуст или хотя бы один его шаблон совпадает с полным npm-именем пакета, и никакой шаблон blocklist не совпал — совпадение blocklist перевешивает совпадение allowlist. Записи компилируются как `new RegExp(source)`: сопоставление не привязано к краям, если источник сам не содержит `^` и `$`, а синтаксис `/pattern/flags` не разбирается. Валидация падает громко на старте сервиса: пустая, окружённая пробелами, дублирующая или недопустимая запись даёт исключение, а не тихий пропуск. Допустимый шаблон может не совпасть ни с одним из сейчас загруженных пакетов, поэтому поздняя загрузка и HMR остаются детерминированными; фильтры зафиксированы на всё время жизни сервиса ([README](../../packages/runtime-diagnostics/invariants/README.md)).

## Инсталлятор

```ts type-equiv
/**
 * Throw a package-attributed invariant failure.
 * @param message - violated package contract without the standard prefix.
 * @returns never because reporting a violation throws.
 */
type InvariantFailure = (message: string) => never
```

```ts type-equiv
/** Install one package's checks into the registration's child context. */
interface InvariantInstaller {
  /**
   * Install the package contribution.
   * @param ctx - child context owned by this invariant registration.
   * @param fail - reporter bound to the registering package name.
   * @returns nothing, or a promise settling after asynchronous checks finish.
   */
  (ctx: Context, fail: InvariantFailure): void | Promise<void>
  /** Services the child installer fiber may access. */
  readonly inject?: Inject
}
```

Включённый инсталлятор исполняется в выделенном дочернем fiber Cordis; `installer.inject` объявляет сервисы, доступные этому fiber, а синхронное или асинхронное завершение инсталлятора дожидается прежде, чем регистрация считается удавшейся. `fail(message)` бросает `InvariantError` — наследника `Error` со стабильным `code: 'INVARIANT'`, именем владеющего `packageName` и сообщением с префиксом `invariant violated by "<package>": …` — так что нарушение остаётся атрибутируемым без того чтобы реестр импортировал какой-либо продуктовый пакет.

## Сервис

`ctx.invariants.register(packageName, installer)` резервирует одну активную регистрацию под полное npm-имя пакета и возвращает её привязанный к эффекту диспоузер. Резервация держится, даже когда фильтры оставляют инсталлятор неактивным, поэтому два плагина никогда не смогут молча занять одно имя пакета; дублирующееся, пустое или содержащее пробелы имя даёт исключение. Отказ инсталлятора атомарно демонтирует дочерний fiber и снимает резервацию. Сервис владеет каждым fiber регистрации, но возвращённый диспоузер одновременно принадлежит и fiber компаньона: выгрузка любой из сторон удаляет слушатели, состояние трассировки и резервацию, так что компаньон может перезагрузиться и снова зарегистрировать то же имя без удерживаемого состояния.

## Контракт компаньона

Каждый пакет рабочего пространства владеет компаньоном `./invariant` ([контракт пакетов](../../packages/AGENTS.md)); публикация и регистрация обязательны для каждого пакета, но сами утверждения намеренно не синтетические. Компаньон ставит проверку только тогда, когда его пакет владеет наблюдаемым отношением — потоком событий или изменяемыми данными; иначе он экспортирует пустой инсталлятор, ведущий комментарий которого начинается с `No runtime invariant:` и поясняет применительно к конкретному пакету, почему проверять нечего. `pnpm run verify-package-invariants` механически отвергает сгенерированные маркеры, необъяснённые пустые инсталляторы, непустые инсталляторы, забывающие репортера или игнорирующие его, неверные имена регистрации и неполную проводку экспорта, публикации, зависимости или бандла ([Agent Note о механических правилах](../../.agents/notes/implemented/architecture/2026-07-19-package-invariant-runtime-contracts.md)). Каталог исполняемых компаньонов и стандартная композиция живут в [README пакета](../../packages/runtime-diagnostics/invariants/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxinvariants--invariantregistry"></a>

### `ctx.invariants` — `InvariantRegistry`

Package-owned invariant registry with global and regex-based selection.

```ts cordis-catalog
/**
 * Register one package's invariant installer. The package name is reserved
 * even when filtering disables its checks. Enabled installers run in a child
 * fiber; failure disposes that fiber and releases the reservation.
 * @param packageName - full npm package name that owns the contribution.
 * @param installer - listener or startup-check installer for the child context.
 * @returns an effect-scoped disposer for the registration.
 */
register(packageName: string, installer: InvariantInstaller): () => void
```

Source: [`packages/runtime-diagnostics/invariants/src/index.ts`](../../packages/runtime-diagnostics/invariants/src/index.ts)
<!-- END GENERATED cordis-surface -->

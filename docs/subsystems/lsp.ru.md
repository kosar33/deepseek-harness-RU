# Навигация LSP

[English](lsp.md) | [中文](lsp.zh.md) | Русский

LSP seam — это [capability seam](../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md), открывающий семантическую навигацию по коду на одном сервисе `ctx.lsp` и разделённый по пакетам: Service Definition ([dsh-lsp](../../packages/lsp/lsp) — `ctx.lsp` и реестр провайдеров), универсальный Service Provider ([dsh-lsp-stdio](../../packages/lsp/lsp-stdio) — настраиваемый stdio-хост языкового сервера) и Consumer ([dsh-tool-lsp](../../packages/lsp/tool-lsp) — схема инструмента `lsp`). LSP — **одна необязательная возможность**, а не часть стержня agent-loop, поэтому её словарь живёт здесь, а не в [core.ru.md](core.ru.md). Замена провайдера не меняет того, как модель запрашивает навигацию.

Источник: [`packages/lsp/lsp/src/types.ts`](../../packages/lsp/lsp/src/types.ts)

## Операции и координаты

Seam и модель открывают ровно четыре семантических запроса; объединение закрыто, поэтому добавление ещё одного — изменение, принуждаемое компиляцией сразу в seam, провайдерах и инструменте. Позиции и диапазоны отсчитываются от нуля в кодовых единицах UTF-16, как того требует протокол; инструмент на стороне модели владеет соглашением об отсчёте от единицы и преобразует координаты на входе и на выходе.

```ts type-equiv
/**
 * The four semantic queries the seam and model expose. A closed union: adding an operation is a
 * compile-enforced change across the seam, providers, and the tool. Symbols and call hierarchy are
 * not operations here; they need different schemas.
 */
type LspOperation = 'goToDefinition' | 'findReferences' | 'goToImplementation' | 'hover'
```

```ts type-equiv
/** A zero-based UTF-16 cursor coordinate, matching the LSP wire convention. */
interface LspPosition {
  /** Zero-based line. */
  readonly line: number
  /** Zero-based UTF-16 code-unit offset within the line. */
  readonly character: number
}
```

```ts type-equiv
/** A zero-based UTF-16 half-open range `[start, end)`. */
interface LspRange {
  readonly start: LspPosition
  readonly end: LspPosition
}
```

## Запрос

Каждое поле обязательно: `workspaceRoot` подаёт вызывающий, `languageId` приходит из регистрации провайдера (а не из запроса), тайм-ауты и лимиты результата принадлежат потребителям — поэтому ни одно поле не требует значения по умолчанию от реализации, и шаг `resolve()` отсутствует. Провайдер получает запрос вызывающего плюс выведенный `languageId`, который служит только синхронизации текущего документа и никогда не участвует в выборе.

```ts type-equiv
/**
 * A caller's normalized query. Every field is required: `workspaceRoot` is caller-supplied,
 * `languageId` comes from the provider registration (not here), and consumers own timeouts and
 * result limits — so no field needs implementation defaulting and there is no `resolve()` step.
 */
interface LspQueryRequest {
  /** Which semantic query to run. */
  readonly operation: LspOperation
  /** The source file to query (relative to `workspaceRoot` or absolute; the provider canonicalizes). */
  readonly filePath: string
  /** The zero-based UTF-16 cursor position to query at. */
  readonly position: LspPosition
  /** The workspace root the provider resolves against and indexes; required, never defaulted. */
  readonly workspaceRoot: string
}
```

```ts type-equiv
/**
 * A request as a provider receives it: the caller's {@link LspQueryRequest} plus the `languageId`
 * the seam derived from the provider's extension mapping. The language id only synchronizes the
 * transient document; it does not participate in selection.
 */
interface LspProviderQuery extends LspQueryRequest {
  /** The LSP language id for `filePath`, from this provider's extension mapping. */
  readonly languageId: string
}
```

## Результат

Закрытое размеченное объединение: операции навигации нормализуются к `locations`, `hover` — к содержимому или `null`. Потребители выполняют `switch` по `kind` с проверкой полноты, поэтому новая ветка ломает компиляцию, пока её не обработают. `findReferences` всегда включает объявления — провайдер обеспечивает это внутри себя, поэтому у вызывающих нет отдельного флага. Вариант `locations` несёт `resolvedWorkspaceUri` — канонический рабочий `file:`-URI провайдера. Вызывающий, приводящий URI мест к относительному виду, использует именно эту координату, а не применяет правила путей платформы хоста к корню запроса, который может оказаться символической ссылкой.

```ts type-equiv
/** One resolved location: a document URI and the range within it. */
interface LspLocation {
  /** The target document URI (`file:` or otherwise), verbatim from the server. */
  readonly uri: string
  /** The range within the target document. */
  readonly range: LspRange
}
```

```ts type-equiv
/** Normalized hover content, or `null` for no hover at the position. */
interface LspHover {
  /** The normalized hover text (markdown or plaintext, provider-joined). */
  readonly contents: string
  /** The range the hover applies to, when the server supplied one. */
  readonly range?: LspRange
}
```

```ts type-equiv
/**
 * The closed result union. Navigation operations (`goToDefinition`, `findReferences`,
 * `goToImplementation`) normalize to `locations`; `hover` normalizes to content or `null`.
 * Consumers `switch` on `kind` to exhaustiveness so a new arm breaks compilation until handled.
 *
 * The `locations` variant carries `resolvedWorkspaceUri`: the provider's canonical `file:` URI for
 * the request's workspace root. A caller that relativizes location URIs MUST use this, not parse the
 * request's possibly symlinked process path with host-platform rules; the execution platform may
 * differ from the caller's.
 */
type LspQueryResult =
  | { readonly kind: 'locations'; readonly locations: readonly LspLocation[]; readonly resolvedWorkspaceUri: string }
  | { readonly kind: 'hover'; readonly hover: LspHover | null }
```

## Провайдер и сервис

Провайдер владеет стабильным брендированным `id` и эксклюзивной картой расширений в нижнем регистре с ведущей точкой. `registerProvider` атомарно резервирует идентификатор и каждое расширение — некорректная или конфликтующая регистрация не публикует ничего, — а её disposer снимает все резервации. Выбор делается для каждого запроса и не зависит от порядка; при отсутствии совпадения бросается `LspError` `LSP_UNAVAILABLE`. Seam не раскрывает ни типов протокола, ни управления процессами и документами, ни универсального обходного пути к JSON-RPC.

```ts type-equiv
/**
 * A language-server backend registered on `ctx.lsp`. Each provider owns a stable {@link
 * LspProviderId} and an extension-to-language-id map (lowercase, leading-dot keys).
 * `findReferences` always includes declarations — the provider enforces this internally; callers
 * get no flag.
 */
interface LspProvider {
  /** Stable provider identity, reserved atomically with the extension mappings. */
  readonly id: LspProviderId
  /** Lowercase leading-dot extension → LSP language id (e.g. `{ '.ts': 'typescript' }`). */
  readonly extensionToLanguage: Readonly<Record<string, string>>
  /**
   * Run one query. The seam has already selected this provider and derived `languageId`.
   * @param request - the resolved provider query (caller request + derived language id).
   * @param signal - optional cancellation; the provider stops its own work when it aborts.
   * @returns the normalized, closed-union result.
   */
  query(request: LspProviderQuery, signal?: AbortSignal): Promise<LspQueryResult>
}
```

```ts type-equiv
/**
 * The LSP capability seam (`ctx.lsp`). Owns provider registration/selection and normalized query
 * execution; exposes exactly the four operations and no protocol escape hatch.
 */
interface LspService {
  /**
   * Register a provider, atomically reserving its id and every normalized extension. Any conflict
   * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
   * reservations. Disposed with the calling fiber.
   * @param provider - the backend to register.
   * @returns a synchronous disposer releasing the id and all extension reservations.
   */
  registerProvider(provider: LspProvider): () => void
  /**
   * Select a provider by the file's extension and run one query. Selection is per-query and
   * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
   * @param request - the normalized query.
   * @param signal - optional cancellation forwarded to the selected provider.
   * @returns the normalized, closed-union result.
   */
  query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
}
```

`LspProviderId` — брендированный идентификатор этого seam (`Branded<'LspProviderId'>` из [dsh-brand](../../packages/util/brand)); `LspError` расширяет `HarnessError` стабильными кодами — например, `LSP_INVALID_PROVIDER`, `LSP_CONFLICT`, `LSP_UNAVAILABLE`, `LSP_DISPOSED`, `LSP_UNSUPPORTED_OPERATION` и `LSP_MALFORMED_RESPONSE`, — по которым вызывающие маршрутизируют обработку вместо разбора `message`.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxlsp--lspservice"></a>

### `ctx.lsp` — `LspService`

The LSP capability seam (`ctx.lsp`). Owns provider registration/selection and normalized query execution; exposes exactly the four operations and no protocol escape hatch.

```ts cordis-catalog
/**
 * Register a provider, atomically reserving its id and every normalized extension. Any conflict
 * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
 * reservations. Disposed with the calling fiber.
 * @param provider - the backend to register.
 * @returns a synchronous disposer releasing the id and all extension reservations.
 */
registerProvider(provider: LspProvider): () => void

/**
 * Select a provider by the file's extension and run one query. Selection is per-query and
 * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
 * @param request - the normalized query.
 * @param signal - optional cancellation forwarded to the selected provider.
 * @returns the normalized, closed-union result.
 */
query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
```

Source: [`packages/lsp/lsp/src/types.ts`](../../packages/lsp/lsp/src/types.ts)
<!-- END GENERATED cordis-surface -->

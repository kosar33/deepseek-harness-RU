# Веб-доступ

[English](web.md) | [中文](web.zh.md) | Русский

Seam веб-доступа — это [capability seam](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md), охватывающий **две операции** (поиск и извлечение) на одном сервисе `ctx.web` и разделённый по пакетам: Service Definition ([dsh-web](../../packages/web/web) — `ctx.web` и реестры провайдеров), Service Providers ([dsh-web-search-exa](../../packages/web/web-search-exa), [dsh-web-search-perplexity](../../packages/web/web-search-perplexity), [dsh-web-search-deepseek](../../packages/web/web-search-deepseek), [dsh-web-fetch-http](../../packages/web/web-fetch-http)) и Consumer ([dsh-tool-web](../../packages/web/tool-web) — схемы инструментов `web_search`/`web_fetch`). Веб — **одна необязательная возможность**, а не часть стержня agent-loop, поэтому её словарь живёт здесь, а не в [core.ru.md](core.ru.md). Замена провайдера поиска не меняет того, как модель запрашивает поиск, а замена провайдера извлечения — того, как модель запрашивает URL.

Источник: [`packages/web/web/src/types.ts`](../../packages/web/web/src/types.ts)

## Почему у одной возможности две операции

Поиск и извлечение не разделяют ни схему запроса, ни бизнес-логику, но намеренно образуют один промежуточный слой `ctx.web` с одним владельцем политики выбора провайдера, единым словарём отмен и ошибок и одним обращённым к продукту конфигурационным API «как этот harness добирается до веба». Плата за это — параллельные пары методов `searchX`/`fetchX` на сервисе; эта параллельность намеренна — это не упущенное выделение общего кода. Провайдеры регистрируют **возможности** (`WebSearchProvider` или `WebFetchProvider`), а не инструменты; имена, схемы, подсказки для промпта и представление, видимые модели, живут в единственном потребителе `dsh-tool-web`.

## Запрос и результат поиска

Каждый запрос к seam несёт ровно один `query`. Потребитель `dsh-tool-web` принимает обязательный массив `queries` и разделяет его на отдельные запросы к seam; массив из одного элемента выполняет один поиск. `maxResults` — ограничение на стороне потребителя (конфиг `searchMaxResults` пакета `dsh-tool-web`, по умолчанию `8`), которое проходит через seam без изменений и принудительно применяется на обратном пути: если провайдер возвращает лишнее, seam усекает `sources[]` и устанавливает `truncated`.

```ts type-equiv
/**
 * What one search-capable backend is asked to search. Each request carries one
 * query; a consumer may issue several requests. `maxResults` is a
 * `dsh-tool-web`-layer bound passed through unchanged and enforced on the way
 * back by the seam (see {@link WebSearchResult}).
 */
interface WebSearchRequest {
  readonly query: string
  /**
   * Upper bound on returned sources; the seam truncates to it. Omitted = no
   * bound. `dsh-tool-web` always sets it. A provider whose API supports a
   * result-count control (Exa's `numResults`) should apply it at the request
   * layer as a cost/latency optimization; the seam enforces the bound
   * regardless.
   */
  readonly maxResults?: number
}
```

```ts type-equiv
/**
 * Normalized search outcome. `content` is optional provider-generated answer
 * text or summary (Exa and DeepSeek return none; Perplexity returns a
 * generated answer).
 * `sources[]` is the portable citation shape. `truncated` is set by the seam
 * when it cut `sources[]` down to `maxResults`.
 */
interface WebSearchResult {
  /** Optional provider-generated answer text, search context, or summary. */
  readonly content?: string
  /** Citeable sources, already truncated to the request's `maxResults`. */
  readonly sources: readonly WebSearchSource[]
  /** True when the seam dropped sources to honor `maxResults`. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * One citeable source. A source always has a URL; `title`, `snippet`, and
 * `publishedAt` are optional because not every provider returns them — forcing
 * adapters to invent them would make the seam lie (Perplexity citations may be
 * URL-only). `dsh-tool-web` renders `title ?? hostname(url)` for display.
 */
interface WebSearchSource {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  /** Publication/crawl timestamp as a provider-supplied ISO-8601 string. */
  readonly publishedAt?: string
}
```

## Запрос и результат извлечения

```ts type-equiv
/**
 * What one fetch-capable backend is asked to retrieve. The request deliberately
 * omits timeout, format, prompt, and extraction controls: cancellation is a
 * direct execution argument, while presentation and higher-level LLM concerns
 * belong outside safe retrieval.
 */
interface WebFetchRequest {
  readonly url: string
}
```

HTTP-статус — часть состояния полученного ресурса, а сам по себе ещё не сбой: успешное сетевое извлечение `404`/`500` возвращает `WebFetchResult` с кодом статуса и ограниченным по размеру декодированным телом. `url` — итоговый URL после разрешённых перенаправлений. `WebError` зарезервирован для случаев, когда ресурс не удаётся безопасно получить или представить.

```ts type-equiv
/**
 * Normalized fetch outcome. A successful network fetch of a non-2xx response is
 * a result, not an error: the status code is part of the fetched resource
 * state. {@link WebError} is reserved for failures to safely retrieve or
 * represent the resource.
 */
interface WebFetchResult {
  /** The final URL after allowed redirects (the request URL is in the request). */
  readonly url: string
  /** HTTP status code of the fetched response. */
  readonly statusCode: number
  /** Decoded body, classified by content kind. */
  readonly body: WebFetchBody
  /** True when the provider capped the decoded body. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * The decoded body of a fetched resource. A CLOSED discriminated union owned by
 * `dsh-web`: the provider decodes the kind and `dsh-tool-web` renders it, so a
 * new kind is a coordinated change across known packages, not a plugin
 * extension. Consumers `switch` on `kind` ending in `default: assertNever(...)`
 * so adding a kind breaks compilation at every consumer until handled. Each arm
 * stays its own object literal even where fields coincide, so an arm can gain
 * fields the others lack.
 */
type WebFetchBody =
  | { readonly kind: 'html'; readonly content: string }
  | { readonly kind: 'text'; readonly content: string }
```

## Доступность провайдеров

`available(): boolean` у провайдера — дешёвая ЛОКАЛЬНАЯ проверка (наличие учётных данных, пригодность конфигурации к разбору), которая **НЕ ДОЛЖНА выполнять сетевые вызовы**. Это входные данные для выбора в момент исполнения, а не система проверки живости: `search()`/`fetch()` читают её, чтобы выбрать работоспособного провайдера, а сбой выбора проявляется как структурированный `WebError`, по которому маршрутизирует вызывающий; детали, по которым вызывающий ветвится (отсутствующий id или неоднозначный набор кандидатов), он несёт в коде и сообщении.

Выбор никогда не зависит от порядка регистрации, конфигурации или HMR: у возможности есть явный id провайдера (конфиг `searchProvider`/`fetchProvider` или переменная окружения, задающая то же поле), либо выполняется автовыбор, когда зарегистрирован ровно один работоспособный провайдер; несколько работоспособных провайдеров без сконфигурированного id — это `WEB_PROVIDER_AMBIGUOUS`, а не «первый побеждает».

## Ошибки

`WebError extends HarnessError` ([core.ru.md](core.ru.md) — таксономия ошибок) с открытым `code: string` — как у ошибок любого другого seam (`LlmError`, `SubagentError`) — а не с закрытым объединением: провайдер может использовать собственные коды без правки `dsh-web`, а потребители должны корректно работать с неизвестным кодом. Коды разделяются по владельцу. Нейтральные к seam коды выбрасываются общим контрактом `WebRuntime`: `WEB_PROVIDER_UNAVAILABLE`, `WEB_PROVIDER_CONFIGURED_MISSING`, `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`, `WEB_PROVIDER_AMBIGUOUS`, `WEB_DUPLICATE_PROVIDER` (ошибка программирования в момент регистрации, аналог `DUPLICATE_ADAPTER` у `LlmRuntime`), `WEB_ABORTED` и `WEB_PROVIDER_ERROR` (универсальный код для собственной ошибки провайдера, проявленной через seam, охватывающий всё остальное, включая сетевые и транспортные сбои — DNS, отказ в подключении, TLS). Транспортные коды извлечения принадлежат реализации `dsh-web-fetch-http`, и другой бэкенд извлечения не обязан их выдавать: `WEB_INVALID_URL`, `WEB_BLOCKED_URL`, `WEB_REDIRECT_BLOCKED`, `WEB_FETCH_TOO_LARGE`, `WEB_FETCH_TIMEOUT`, `WEB_UNSUPPORTED_CONTENT_TYPE`.

## Сервис

`WebRuntime` регистрирует провайдеров поиска и извлечения, отклоняет дубликаты id с ошибкой `WEB_DUPLICATE_PROVIDER` и определяет провайдеров в момент исполнения со структурированными ошибками выбора. Локальный бэкенд извлечения принимает только HTTP(S), отвергает учётные данные, ограничивает число перенаправлений, байты, символы и время, заново проверяет каждый шаг перенаправления в пределах того же источника и декодирует тело; представление принадлежит инструменту. Локальный бэкенд не блокирует цели в приватных сетях; не включайте `web_fetch` там, где он может достичь чувствительных внутренних целей.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxweb--webruntime"></a>

### `ctx.web` — `WebRuntime`

The web access service. Registered as `ctx.web` (one instance per context).

Selection semantics (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → `WEB_PROVIDER_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, multiple usable providers → `WEB_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider → `WEB_PROVIDER_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register a search provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for search. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerSearchProvider(provider: WebSearchProvider): () => void

/**
 * Register a fetch provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for fetch. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerFetchProvider(provider: WebFetchProvider): () => void

/**
 * Run one search through the selected provider. Resolves the provider at call
 * time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. The seam enforces `request.maxResults` on the result:
 * if the provider over-returns, `sources[]` is truncated and `truncated` set.
 * @param request - the query and optional result limit.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the provider's results, capped to `request.maxResults`.
 */
async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>

/**
 * Retrieve one URL through the selected provider. Resolves the provider at
 * call time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. A non-2xx response is a result, not a throw.
 * @param request - the URL plus retrieval options.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the retrieval outcome; non-2xx responses resolve descriptively.
 */
async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>
```

Source: [`packages/web/web/src/index.ts`](../../packages/web/web/src/index.ts)
<!-- END GENERATED cordis-surface -->

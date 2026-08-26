# HTTP-сервер

[English](web-server.md) | [中文](web-server.zh.md) | Русский

[dsh-host-webserver](../../packages/host/webserver) — браузерный HTTP-носитель для GUI-хоста: единственный плагин поверх `node:http`, предоставляющий `ctx.webServer`, реестр именованных маршрутов, колбэки преобразования index.html и один запасной обработчик (fallback), который может занять плагин. Он не входит в agent loop и не является capability seam: он не знает понятий harness, а каждый функциональный маршрут регистрирует отдельный плагин — включая мост `/api`, бандлы плагинов и поток событий HMR ([заметка о наслоении](../../.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)). Сервер обслуживает только браузеры: Electron загружает собранные файлы через `file://` и отправляет fetch-запросы через IPC-мост вместо этого сервера.

Источник: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)

## Маршруты

```ts type-equiv
/** Route match kind: 'exact' matches the pathname verbatim; 'prefix' p matches p and p/<anything>. */
type WebRouteKind = 'exact' | 'prefix'
```

```ts type-equiv
/** One named route registration. */
interface WebRoute {
  kind: WebRouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns the full response lifecycle (may hold the response open, e.g. SSE). */
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}
```

Порядок сопоставления фиксирован: сначала таблица точных совпадений, затем самый длинный подходящий префикс, затем зарегистрированный fallback. Порядок регистрации не несёт семантики для запросов — именованные маршруты компонуются как непересекающиеся, а всё, что не занял ни один именованный маршрут, обслуживает fallback; владелец только один, повторная регистрация выбрасывает исключение. Штатная Web-композиция занимает это место через [`dsh-host-frontend-static`](../../packages/host/frontend-static/src/index.ts) — dist-сервер SPA с зафиксированной семантикой: не-GET/HEAD получает 405, выход за пределы корня dist — 403, читаемый индекс рендерится в корне dist и по настроенному пути индекса, существующие файлы отдаются напрямую, отсутствующие или не-файловые цели получают пустой ответ 404, а неизвестные расширения отдаются как octet-stream.

## Конфигурация

```ts type-equiv
/** Gateway config: the listen address. */
interface Config {
  /** Listen host; the two supported values are loopback and all-interfaces. */
  host: '127.0.0.1' | '0.0.0.0'
  /** Listen port; zero requests an OS-assigned port. */
  port: number
}
```

`host` принимает только `127.0.0.1` (значение по умолчанию) и `0.0.0.0` (намеренное открытие в сеть); TLS, аутентификации и политики origin здесь нет, поэтому привязка вне loopback открывает сервер этой сети. Расположение dist — факт композиции того плагина фронтенда, который занял место fallback.

## Сервис

`WebServer` (`ctx.webServer`) начинает слушать сразу при активации; неудача прослушивания (EADDRINUSE…) отклоняет инициализацию, а процесс загрузки сообщает об упавшем fiber. `register(route)` добавляет один именованный маршрут и возвращает его диспоузер; дубликат `(kind, path)` выбрасывает исключение, потому что шаблоны маршрутов — контракт уровня композиции, а коллизия — ошибка конфигурации. `collectIndexInjections()` собирает структурированные строки `IndexInjection` одним испусканием `webserver/index-inject`, а `renderIndex(html)` включает их в успешные ответы для корня и настроенного пути индекса, после чего применяет сырые обходные преобразования `tapIndex(transform)` (escape hatch) в порядке регистрации; [dsh-client-modules](../../packages/client/modules) отвечает на это событие строками загрузочного манифеста. `port` читает фактический порт прослушивания, включая порт, назначенный ОС, когда `config.port` равен 0.

Запрос, чья обработка бросила исключение (некорректная %-последовательность, дошедшая до `decodeURIComponent`; клиент, оборвавший соединение посреди тела), журналируется предупреждением и получает ответ 400 — либо сокет уничтожается, если заголовки уже ушли, — но никогда не приводит к завершению процесса. Освобождение ресурсов сочетает `close()` с `closeAllConnections()`, потому что обработчик может держать ответ открытым (SSE), а такие соединения не заканчиваются сами; без принудительного закрытия демонтаж зависал бы. Пакет никогда ничего не печатает: строка с URL принадлежит оболочке. Эксплуатационные подробности пакета, включая пайплайн наблюдения за бандлами в dev-режиме, находятся в [README](../../packages/host/webserver/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxwebserver--webserver"></a>

### `ctx.webServer` — `WebServer`

The browser HTTP carrier service. Activation listens immediately. Route registration order does not affect requests because configured named routes must be distinct, and the fallback handler answers anything not yet claimed during startup with 404 until its owner registers. A listen failure rejects initialization, and the boot process reports the failed fiber.

```ts cordis-catalog
/**
 * Register a named route. Duplicate (kind, path) throws — route patterns are
 * a composition-level contract, so a collision is a misconfiguration.
 * @param route - kind, path, and the owning handler.
 * @returns the disposer removing the route.
 */
register(route: WebRoute): () => void

/**
 * Register an exact-path HTTP upgrade route. Duplicate paths throw because
 * one socket can have only one protocol owner.
 * @param route - pathname and handler owning negotiation plus socket use.
 * @returns the disposer removing the route.
 */
registerUpgrade(route: WebUpgradeRoute): () => void

/**
 * Claim the fallback seat: the handler answering every request no named
 * route matches (the SPA dist server in the shipped Web composition). One
 * owner only — a second registration throws, because two fallbacks cannot
 * compose.
 * @param handler - owns the full response lifecycle of unmatched requests.
 * @returns the disposer releasing the seat.
 */
registerFallback(handler: WebRoute['handler']): () => void

/**
 * Register a raw-HTML index transform, the escape hatch for markup no
 * {@link IndexInjection} row expresses: {@link renderIndex} applies taps in
 * registration order after rendering the structured rows.
 * @param transform - pure html-to-html function.
 * @returns the disposer removing the transform.
 */
tapIndex(transform: (html: string) => string): () => void

/**
 * Run an index.html body through the registered taps in registration order
 * — called by the fallback owner on every index response it renders.
 * @param html - the raw index.html body.
 * @returns the transformed body.
 */
applyIndexTaps(html: string): string

/**
 * Gather the structured injection table: one `webserver/index-inject` emit,
 * every subscriber pushes its current rows. Fresh per call, so subscribers
 * read live state (module graph, theme preference) at emit time.
 * @returns rows in subscriber activation order.
 */
collectIndexInjections(): IndexInjection[]

/**
 * Render one index.html body: the structured injection table first, then
 * the raw `tapIndex` transforms over the result.
 * @param html - the raw index.html body.
 * @returns the transformed body.
 */
renderIndex(html: string): string
```

Source: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)

<a id="webserver-events"></a>

### `webserver/*` events

<a id="webserverindex-inject--emit"></a>

#### `webserver/index-inject` — emit

Собирает структурную таблицу инъекций индекса. Генерируется при каждой отрисовке индекса и каждом запросе boot-payload воркера; слушатели выдают свои текущие строки, поэтому данные строки читаются свежими в момент генерации.

```ts cordis-catalog
/**
 * Collect the structured index injection table. Emitted on every index
 * render and every worker boot-payload request; listeners push their
 * current rows, so a row's data is read fresh at emit time.
 * @param table - Mutable row table; listeners append in activation order.
 * @mode emit
 */
'webserver/index-inject'(table: IndexInjection[]): void
```

Source: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)
<!-- END GENERATED cordis-surface -->

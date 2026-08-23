# Клиентские модули

[English](client-modules.md) | [中文](client-modules.zh.md) | Русский

Таблица веб-плагинов: Node-половина системы клиентских модулей в [dsh-client-modules](../../packages/client/modules), предоставляемая как `ctx.clientModules` (`ClientModuleRegistry`). Она просматривает записи Loader'а хоста в поисках пакетов, объявляющих `dsh.client`, собирает граф входов `window.__DSH_BOOT__`, раздаёт каждый бандл по `/plugins/<id>/client.js` и отвечает на каждую коллекцию инъекций в индекс строками загрузочного манифеста — четыре грани одного сервиса. Это необязательная возможность стека веб-GUI, а не часть стержня agent-loop, и это потребитель [dsh-host-webserver](../../packages/host/webserver): носитель, описанный в [web-server.md](web-server.md), поставляет префиксный маршрут и событие `webserver/index-inject`, на которое отвечает этот сервис. Браузерная половина того же пакета (`ctx.modules`, таблица ленивых CJS-модулей, которая загружает и материализует эти бандлы) — механизмы уровня ядра; они документированы в [README пакета](../../packages/client/modules/README.md), а не здесь.

Источник: [`packages/client/modules/src/client/manifest.ts`](../../packages/client/modules/src/client/manifest.ts)

## Формат протокола

Граф — единственный источник формата протокола между Node- и браузерной половинами: хост составляет строки `WebBootEntry` из отсканированных пакетов, публикует граф как строку инъекции `global`, рендерящуюся перед последующими строками скриптов (`globalThis["__DSH_BOOT__"]`, с экранированным `<`, чтобы управляемые плагинами строки не могли вырваться из элемента script), а оболочка разбирает его до загрузки чего-либо. Страница без корректного манифеста не может загрузиться — парсер браузерной стороны громко падает на отсутствующем или некорректном графе.

```ts type-equiv
/**
 * One composed client entry pushed by the host (a graph row). Wire
 * single source: the host node half (package root) produces this same shape.
 * `immediately` marks stage-one prefetch; `inject` is informational graph
 * metadata (the authoritative edges live in each package's `dsh.client`
 * declaration and reach fibers through entry creation). `external` carries
 * module-graph edges: unlike `inject`, they constrain code arrival because
 * `require` is synchronous (see {@link WebBootGraph.entries}).
 */
interface WebBootEntry {
  /** Entry name == package name. */
  id: string
  /** Bundle endpoint, '/plugins/<id>/client.js?rev=<rev>'. */
  url: string
  /** Bundle content hash (cache-busting consistency anchor). */
  rev: string
  /** Package-name dependency edges, informational (preflight display / HMR diffing). */
  inject?: string[]
  /** Stage-one prefetch mark: load the script for factory registration during module-face boot. */
  immediately?: boolean
  /** Non-baseline module specifiers this row requests; omitted when it requests none. */
  external?: string[]
}
```

```ts type-equiv
/** The composed client entry graph the host injects as `window.__DSH_BOOT__`. */
interface WebBootGraph {
  /** Consistency anchor over the whole graph (content + bundle hashes). */
  rev: string
  /**
   * Composed entries in module-graph order — a dynamic package row precedes
   * rows whose `external` requests that package. Cordis activation order is
   * unrelated and remains owned by fiber service waiting.
   */
  entries: WebBootEntry[]
}
```

`rev` каждой строки — это хэш содержимого бандла, который едет в URL как cache-busting запрос; `rev` графа — хэш составленных строк, поэтому любое изменение строки меняет его. `immediately` помечает ярус предзагрузки первой стадии (fetch и исполнение во время загрузки модульной грани, только регистрация); ленивая строка загружается при первом импорте.

## Сканирование

Пакет попадает в таблицу, объявляя `dsh.client` (`platform: 'web'`, необязательные рёбра `inject`, необязательный `immediately`) в своём package.json и экспортируя собранный бандл в `exports["./client"]`. Резолюция пакетов якорится к `ctx.baseUrl` дерева конфигурации — каталогу cordis.yml, чей пакет объявляет каждый компонуемый плагин зависимостью, — а конструирование падает, когда этот якорь не задан.

Сканирование инкрементально по каждому пакету; пути полного пересканирования нет. Каждая эмиссия cordis `internal/plugin` (конструирование или освобождение fiber) помечает имя входа fiber грязным, а сброс микротаска сверяет каждое грязное имя с живыми записями загрузчика. Проход активации засевает тот же набор грязных имён всеми текущими записями и сбрасывает его синхронно, поэтому первый проход и установившийся режим разделяют одну реализацию — с противоположными стратегиями отказа. При активации некорректное объявление или отсутствующий бандл среди уже загруженных записей агрегируется в один громкий `AggregateError` со списком всех сломанных пакетов: fiber ПАДАЕТ, и громко-отказная проверка загрузки сообщает об этом. В установившемся режиме сломанный пакет пишет предупреждение и не должен отравлять остальные.

Метаданные пакета — включая отрицательный вердикт «не клиентский пакет» — кэшируются по имени и никогда не истекают: изменения набора плагинов вступают в силу после перезапуска. Перезапуск fiber повторно использует свою строку и rev без изменений; изменения содержимого бандла доходят до графа только через `rebuilt()`.

## Маршрут бандла и инъекция в индекс

`GET`/`HEAD /plugins/<id>/client.js` раздаёт зарегистрированный бандл с диска с `no-cache` (согласованность якорит запрос rev, а не HTTP-кэширование); остальные методы получают 405. Неизвестный идентификатор — или зарегистрированная строка, чей бандл нечитаем, потому что ещё не собран, — получает громкий 404, так что ни один нечитаемый бандл не выглядит успешным JavaScript-ответом. Строки инъекции несут текущий граф при каждой отрисовке индекса, поэтому перезагрузка всегда загружается против живой композиции.

## Сервис

`ClientModuleRegistry` (`ctx.clientModules`, определён в [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)) открывает операции чтения и грань пересборки; сигнатуры — в сгенерированном [каталоге сервиса](#ctxclientmodules--clientmoduleregistry). `graph()` возвращает текущий составленный граф (стабильный объект между изменениями), а `clientPath(id)` — абсолютный путь бандла. `rebuilt(id)` — единственная точка входа, через которую содержимое бандла достигает графа: она заново хэширует файл, и лишь реальное изменение rev пересобирает граф и рассылает уведомления. `onRebuilt` срабатывает на каждый изменившийся бандл с новым rev; `onGraphChanged` срабатывает после любого сброса, пересобравшего граф (строка добавлена или удалена либо изменился rev после пересборки), и работает по pull-модели — слушатели перечитывают `graph()`. Оба пути уведомлений локализуют исключения слушателей, так что один падающий подписчик не может пропустить последующих подписчиков или погубить то, что вызвало сброс.

В режиме разработки [dsh-client-hmr](../../packages/client/hmr/README.md) — watch-драйвер реестра: его Node-половина stat-опросом проверяет бандл каждой строки графа от синхронно снятого базового состояния, вызывает `rebuilt(id)` при изменении, ресинхронизирует набор наблюдения через `onGraphChanged` и рассылает изменения rev браузерной половине через SSE. Продакшен-графы полностью опускают строку HMR; сам хост модулей никогда не наблюдает файлы.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxclientmodules--clientmoduleregistry"></a>

### `ctx.clientModules` — `ClientModuleRegistry`

The web plugin table service: incremental `dsh.client` scan + wire composition + bundle route + index injection rows. Construction runs the activation scan synchronously — a malformed declaration or missing bundle among the already-loaded entries aggregates into one loud throw (FAILED fiber; the boot activation audit reports it).

```ts cordis-catalog
/**
 * Current composed entry graph (stable object between changes).
 * @returns the graph served as `window.__DSH_BOOT__`.
 */
graph(): WebBootGraph

/**
 * Absolute path of an entry's client bundle.
 * @param id - entry id (package name).
 * @returns the path, or undefined for an unknown id.
 */
clientPath(id: string): string | undefined

/**
 * Re-hash one bundle (the HMR watch's registration hook — the only entry
 * point through which bundle content changes reach the graph).
 * @param id - entry id (package name).
 * @returns the new rev, or undefined for an unknown id.
 */
rebuilt(id: string): string | undefined

/**
 * Subscribe to bundle rebuilds; fires only when the re-hash changed the rev.
 * @param listener - receives the entry id and its new bundle rev.
 * @returns the unsubscriber.
 */
onRebuilt(listener: (id: string, rev: string) => void): () => void

/**
 * Fires after any flush that recomposed the graph (row added/removed, or a
 * rebuilt rev change). Pull model: listeners re-read {@link graph}.
 * @param listener - notified with no payload.
 * @returns the unsubscriber.
 */
onGraphChanged(listener: () => void): () => void
```

Source: [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)
<!-- END GENERATED cordis-surface -->

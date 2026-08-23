# Хранилище

[English](storage.md) | [中文](storage.zh.md) | Русский

Подсистема хранилища отвечает за персистентность всего, что не является журналом событий сессии (у журналов сессий собственный seam — [persistence.md](persistence.md)). Это одна опциональная возможность, не входящая в стержень agent-loop и разделённая как [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md): хаб и Service Definition ([dsh-storage](../../packages/storage/storage), `ctx.storage`); роли Service Provider исполняют [dsh-storage-json](../../packages/storage/storage-json), регистрируемый как `json`, и [dsh-storage-sqlite](../../packages/storage/storage-sqlite), регистрируемый как `sqlite`; форма данных в роли Consumer — [dsh-storage-domain](../../packages/storage/storage-domain), `ctx.storageDomain`, доступный также как `ctx.storage.domain`, — единственный Consumer контракта бэкендов и типизированный API, которым пользуется всё остальное. Сам хаб не выполняет ввод-вывод: носителями владеют бэкенды, семантикой — формы данных, а продуктовые пакеты никогда не обращаются к бэкендам напрямую. Запись о проектировании: [Agent Note о доменном KV-хранилище и workspace](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md).

Источник: [`packages/storage/storage/src/backend.ts`](../../packages/storage/storage/src/backend.ts) · [`packages/storage/storage-domain/src/spec.ts`](../../packages/storage/storage-domain/src/spec.ts) · [`packages/storage/storage-domain/src/events.ts`](../../packages/storage/storage-domain/src/events.ts)

## Хаб: `ctx.storage`

`Storage` ([сигнатуры](#ctxstorage--storage)) — точка встречи, а не хранилище. `ctx.storage.backend` — таблица соответствия «имя → бэкенд»: несколько бэкендов остаются смонтированными одновременно, а то, какой бэкенд обслуживает какого потребителя, определяется конфигурацией самого потребителя (таблицей маршрутов слоя домена), но никогда глобальным выбором хаба. `register(name, backend)` возвращает диспоузер; дублирующееся имя или запрос неизвестного имени выбрасывают `StorageError`. Освобождение ресурсов только снимает регистрацию имени — владеющий плагин закрывает бэкенд после снятия регистрации. Каждый плагин бэкенда также публикует сервисный ключ, касающийся только жизненного цикла (`storageBackendServiceKey(name)`), который внедряют провайдеры форм, чтобы их активация не могла состязаться с регистрацией бэкенда.

Формы данных монтируются на хабе под расширяемым слиянием словарём ключей:

```ts type-equiv
/**
 * Data forms mountable on the hub, keyed by form name. Form owners extend
 * this map via declaration merging (the domain layer merges
 * `domain: DomainFacility`) and mount the facility in their `apply`.
 */
interface StorageForms {}
```

`mount(form, facility)` — эффект, диспоузер которого демонтирует форму; повторный монтаж того же ключа выбрасывает `duplicate-mount`. `form(form)` резолвит смонтированную facility и выбрасывает `form-not-mounted`, пока владеющий плагин не загружен, — сборки упорядочивают плагины соответствующим образом, а не молча откладывают обращение. Слой домена добавляет слиянием `domain: DomainFacility`, поэтому `ctx.storage.domain` и `ctx.storageDomain` — один и тот же объект.

## Контракт бэкенда

```ts type-equiv
/**
 * One registered backend. A backend owns exactly one medium and shares its
 * lifecycle across all facets; facets are optional members — a backend that
 * cannot serve a data kind simply omits it, and resolution fails loud instead.
 */
interface StorageBackend {
  /** Key-value operations; absent when this backend cannot serve them. */
  readonly kv?: KvFacet

  /**
   * Drain in-flight writes across all open units and release the medium.
   * Idempotent; concurrent and repeated calls resolve once teardown finishes.
   * @returns resolution after the medium is released.
   */
  close(): Promise<void>
}
```

Бэкенд владеет одним носителем (корнем файлового дерева, файлом базы данных) и открывает опциональные группы операций; сегодня единственная такая группа — `kv`. `KvFacet.open(descriptor)` открывает одну именованную единицу — `KvUnitDescriptor` несёт имя, версию формата, имена таблиц и признак наличия глобального singleton-слота — и возвращает `KvUnit` с методами `loadAll`, `putRecord`, `deleteRecord`, `setGlobal` и `close`. Имена единиц и таблиц должны соответствовать `UNIT_NAME_RE` (они безопасны и как имя файла, и как сегмент SQL-идентификатора); ключи записей — произвольные строки, которые никогда не попадают в пути файлов. Единица не сериализует конкурентные записи — порядок задаёт вызывающий, — но каждый отдельный вызов атомарен на носителе и становится долговечным после разрешения. Носитель с иной проставленной версией отклоняется с `version-mismatch`; носитель, который не удаётся разобрать как единицу, — с `malformed-medium` (миграций нет, режим до первого релиза). [`backend.ts`](../../packages/storage/storage/src/backend.ts) — нормативный контракт, изложенный пункт за пунктом, а общий набор тестов соответствия в [`tests/contract.ts`](../../packages/storage/storage/tests/contract.ts) проверяет каждый пункт для каждого бэкенда. [json-бэкенд](../../packages/storage/storage-json/README.md) атомарно переписывает один цельный человекочитаемый файл на единицу; [sqlite-бэкенд](../../packages/storage/storage-sqlite/README.md) хранит по одному документу в строке одной базы данных для часто обновляемых данных.

## Объявление домена

Домен один раз объявляется владеющим пакетом как spec-объект — единый источник идентичности домена, его раскладки и схем записей (zod, поэтому `z.infer` избавляет потребителей от дублирования типов):

```ts type-equiv
/** Static declaration of one domain: identity, version, and record layout. */
interface DomainSpec {
  /** Domain name; must match `UNIT_NAME_RE` (doubles as the backend unit name). */
  readonly name: string
  /** Domain format version; a medium stamped with a different version rejects at open. */
  readonly version: number
  /** Optional global singleton slot. */
  readonly global?: DomainGlobalSpec<unknown>
  /** Table declarations keyed by table name; each name must match `UNIT_NAME_RE`. */
  readonly tables: Record<string, DomainTableSpec>
}
```

`defineDomain(spec)` фиксирует литеральные типы spec и громко падает при загрузке модуля владельца, до любого касания носителя: имя домена или таблицы вне `UNIT_NAME_RE`, версия, не являющаяся неотрицательным целым, или глобальная схема, допускающая `null`, — всё это выбрасывает исключение (`null` — сигнальное значение «ещё не записано» на носителе, поэтому сохраняемое допускающее null глобальное значение не смогло бы пройти цикл записи и чтения). `domainTable<K, V>(schema)` объявляет одну таблицу с фантомным типом ключа времени компиляции (обычно [брендированный ID](core.ru.md#брендированные-id)); `descriptorOf(spec)` проецирует ориентированный на бэкенд дескриптор единицы.

## Открытый домен

```ts type-equiv
/** One open domain, typed by its spec. */
interface Domain<S extends DomainSpec> {
  /** Domain name from the spec. */
  readonly name: string
  /** Global singleton handle; a spec without `global` has no usable handle (`never`). */
  readonly global: DomainGlobalHandleOf<S>
  /**
   * Resolve one declared table handle. Handles are stable — repeated calls
   * return the same instance.
   * @param name - Declared table name.
   * @returns the typed table handle.
   */
  table<N extends keyof S['tables'] & string>(name: N): KvTable<TableKeyOf<S, N>, TableValueOf<S, N>>

  /**
   * Close this domain: reject new writes immediately, drain already-queued
   * writes (their events still emit), release the backend unit, then free
   * the domain name for a later open. Idempotent — repeated calls share one
   * teardown. The consumer owns this call (typically as its own `ctx.effect`
   * disposer); the facility closes any domain left open when it unmounts.
   * @returns resolution after the unit is released.
   */
  close(): Promise<void>
}
```

Чтения синхронны и опираются на авторитетное состояние в памяти: `KvTable` предоставляет `get`/`entries`/`keys`/`size` (итераторы-снапшоты, остающиеся стабильными, пока поставленные в очередь записи завершаются), а `get()` глобального дескриптора отдаёт `initial` из spec, пока первый `set` не материализует слот на носителе. Каждая запись — `put`, `delete`, `update`, `global.set` — встаёт в одну на домен цепочку и сначала достигает долговечности в бэкенде, затем мутирует память, затем испускает `domain/changed`; отклонённая бэкендом запись оставляет память нетронутой, поэтому чтения никогда не расходятся с носителем. `update(key, fn)` — атомарные чтение-изменение-запись в своём звене цепочки (отсутствующий ключ даёт `missing-key`); `delete` несуществующего ключа разрешается в `false` без записи и без события. Возвращённые записи — сами сохранённые объекты, а не копии: заменяйте их через `put`/`update` и никогда не мутируйте на месте.

## Доменная facility: `ctx.storageDomain`

`DomainFacility` ([сигнатуры](#ctxstoragedomain--domainfacility)) открывает объявленные домены поверх маршрутизированных бэкендов. Маршрутизация — конфигурация плагина домена, а не хаба: `backend` называет обязательный маршрут по умолчанию, а `routes` переопределяет его для отдельных имён доменов. `open(spec)` выполняет строгую последовательность шагов, где каждый шаг валит весь вызов: он отклоняет уже открытое или ещё закрывающееся имя (`already-open`), резолвит маршрут (`backend-not-found`), требует у бэкенда facet `kv` (`facet-unsupported`), открывает единицу (ошибки бэкенда `version-mismatch`/`malformed-medium` проходят насквозь) и валидирует каждую сохранённую запись и глобальное значение по zod-схемам spec (`invalid-record` с указанием виновной таблицы и ключа). Вызывающий владеет возвращённым дескриптором и освобождает его через `Domain.close()`; домены, оставшиеся открытыми к моменту размонтирования плагина, закрывает facility, а имя закрытого домена освобождается для повторного открытия только после полного завершения демонтажа. `get(name)` — нетипизированный диагностический поиск по скрытому внутри пакета рантайму `DomainImpl`, стоящему за каждым типизированным дескриптором; `closeAll()` — путь размонтирования.

## Событие изменения: `domain/changed`

Каждая долговечная запись испускает ровно одно событие строго после того, как бэкенд подтвердил долговечность, в порядке цепочки записи домена ([запись события](#domainchanged--emit)):

```ts type-equiv
/** Shared location fields of one durable domain change. */
interface DomainChangedBase {
  /** Owning domain name. */
  readonly domain: string
  /** Table name; `''` for a global-singleton write. */
  readonly table: string
  /** Record key; `''` for a global-singleton write. */
  readonly key: string
}
```

```ts type-equiv
/** One durable domain change; a closed union — switch on `operation`. */
type DomainChanged = DomainChangedPut | DomainChangedDeleted
```

`put` (вставки, перезаписи и записи глобального значения) несёт новый снапшот в `value` — и никогда старое значение; потребитель, вычисляющий диффы, хранит предыдущий снапшот самостоятельно. `deleted` — отметка об удалении без значения. Событие — уведомление, а не участник транзакции: точка фиксации уже пройдена к моменту испускания, поэтому слушатель, синхронно бросивший исключение, локализуется предупреждением в журнале, а не отменой уже долговечной записи, и испущенные значения совпадают с состоянием в памяти на момент испускания. Событие существует только внутри процесса; межпроцессная доставка изменений — зафиксированное ограничение ([README пакета](../../packages/storage/storage-domain/README.md)).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxstorage--storage"></a>

### `ctx.storage` — `Storage`

The storage hub service. Backends register under `backend`; data forms mount under their `StorageForms` key and are reached as `ctx.storage.<form>`.

```ts cordis-catalog
/**
 * Mount a data-form facility on the hub. Mounting is an effect: the
 * returned disposer unmounts the form.
 * @param form - Form key declared in {@link StorageForms}.
 * @param facility - The facility instance to expose.
 * @returns the disposer that unmounts the form.
 */
mount<K extends keyof StorageForms>(form: K, facility: StorageForms[K]): () => void

/**
 * Resolve a mounted data form.
 * @param form - Form key declared in {@link StorageForms}.
 * @returns the mounted facility.
 */
form<K extends keyof StorageForms>(form: K): StorageForms[K]
```

Source: [`packages/storage/storage/src/index.ts`](../../packages/storage/storage/src/index.ts)

<a id="ctxstoragedomain--domainfacility"></a>

### `ctx.storageDomain` — `DomainFacility`

The mounted domain facility. Opens declared domains over routed backends; one facility instance owns the open-domain table and enforces single-open per domain name.

```ts cordis-catalog
/**
 * Open one declared domain. Steps, each failing the whole call: reject a
 * name that is already open (`already-open`); resolve the backend route
 * (`backend-not-found` passes through from the hub); require its `kv` facet
 * (`facet-unsupported`); open the unit projected from the spec (backend
 * `version-mismatch`/`malformed-medium` pass through); load and validate
 * every stored record against the spec's zod schemas (`invalid-record`
 * with the offending table and key); construct the domain.
 *
 * Lifecycle: the CALLER owns the returned handle and closes it via
 * `Domain.close()` (typically as its own `ctx.effect` disposer) — the
 * facility does not tie the domain to any consumer fiber. Domains still
 * open when the facility unmounts are closed by the plugin disposer.
 * @param spec - The domain declaration, typically from `defineDomain`.
 * @returns the opened domain handle, typed by the spec.
 */
async open<S extends DomainSpec>(spec: S): Promise<Domain<S>>

/**
 * Look up an open domain by name, untyped. Diagnostic surface (the package
 * invariant cross-checks change events against live domain state); typed
 * consumers hold the handle returned by {@link open}.
 * @param name - Domain name.
 * @returns the open domain runtime, or `undefined` when not open.
 */
get(name: string): DomainImpl | undefined

/**
 * Close every domain still open on this facility. The unmount path for
 * consumers that never called `Domain.close()` themselves; closing is
 * idempotent, so double-closing an already-closed domain is harmless.
 * @returns resolution after every unit is released.
 */
async closeAll(): Promise<void>
```

Source: [`packages/storage/storage-domain/src/index.ts`](../../packages/storage/storage-domain/src/index.ts)

<a id="domain-events"></a>

### `domain/*` events

<a id="domainchanged--emit"></a>

#### `domain/changed` — emit

A domain record or the global singleton changed, emitted once per write strictly after the backend acknowledged durability. Events of one domain arrive in its write-chain order.

```ts cordis-catalog
/**
 * A domain record or the global singleton changed, emitted once per write
 * strictly after the backend acknowledged durability. Events of one
 * domain arrive in its write-chain order.
 * @param change - domain, table (`''` for global), key (`''` for global),
 * operation discriminant, and on `put` the new snapshot.
 * @mode emit
 */
'domain/changed'(change: DomainChanged): void
```

Source: [`packages/storage/storage-domain/src/events.ts`](../../packages/storage/storage-domain/src/events.ts)
<!-- END GENERATED cordis-surface -->

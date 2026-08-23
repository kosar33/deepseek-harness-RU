# Персистентность сессии

[English](persistence.md) | [中文](persistence.zh.md) | Русский

**Seam долговечности** журнала событий. В [session.md](session.ru.md) описана находящаяся в памяти `Session` — append-only журнал событий `SessionEvent`, являющийся источником истины. Эта страница описывает, как этот журнал становится долговечным: абстрактный сервис `SessionPersistence`, его бэкенды, чекпоинт флаша, восстановление после сбоя и заголовок метаданных, который сопровождает журнал. Словарь событий, который несёт журнал, перечислен член за членом в сгенерированном [каталоге событий журнала персистентности](../persistence-catalog.md).

Этот seam — [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md): один абстрактный сервис ([dsh-session-persistence](../../packages/session/session-persistence), `ctx.sessionPersistence`), определяющий locate/create/append, повторно используемую подготовку Session, логические load/inspect, физические чтения суффикса и лёгкое наблюдение list/snapshot над существующим `SessionEvent` — **без параллельного сохраняемого типа события** — и три взаимозаменяемых провайдера, реализующих один и тот же контракт. См. [Agent Note о session-persistence](../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md).

## Чекпоинт флаша

`session/event` — *синхронное* уведомление; плагины персистентности копируют событие в контроллер отдельной сессии, не блокируя производителя. Первое ожидающее событие открывает фиксированное окно пакетирования, а последующие события присоединяются к нему, не сдвигая его дедлайна. Истечение окна запускает одну долговечную партию записи; события, допущенные во время этой записи, получают собственный дедлайн и образуют следующую партию. `session/flush` отменяет ожидание и выкачивает очередь вплоть до quiescence (полного завершения всех жизненных циклов), поэтому цикл по-прежнему использует его как чекпоинт упорядочивания и наблюдения ошибок перед заявкой на следующий обычный ход. Отклонённая фоновая запись сохраняет свои события и приостанавливает автоматический повтор; новое событие открывает свежее окно, тогда как явный флаш повторяется немедленно и сообщает о сбое через `agent/error` и логгер, но никогда не событием сессии после уже закрытого хода. Освобождение ресурсов выполняет такое же финальное выкачивание. Настроенный максимум ограничивает только намеренное ожидание пакетирования, а не планирование event-loop или задержку долговечности бэкенда ([решение](../../.agents/notes/implemented/architecture/2026-08-08-bounded-session-persistence-write-batching.md)).

## Восстановление после сбоя сохраняет прерванный ход

Бэкенд, перечитывающий журнал, оборванный сбоем посреди хода, обнаруживает открытый `turn/start` без парного `turn/end`. Он **не** усекает журнал — одиночный ход может быть огромным в длинной задаче (много шагов, большой вывод инструментов), и эти события были долговечно дописаны до сбоя. Вместо этого он закрывает осиротевший ход синтетическим `turn/end { reason: { kind: 'interrupted' } }`, удерживая прерванное выполнение сбалансированным и не меняя ни одного самостоятельного события до или после него. `interrupted` — единственная причина `TurnEndReason`, которую не испускает ни один цикл (см. [session.md](session.ru.md#почему-ход-завершился-turnendreasonmap)).

Ремонт применяется только к холодным сессиям. Для живого идентификатора `SessionPersistence.load(id)` ждёт, пока канонический снапшот в памяти не станет долговечным, и возвращает его, только когда тот сбалансирован; открытый живой ход завершается отказом вместо получения синтетических границ прерывания. HMR (горячая замена модулей) принимает живой префикс, не закрывая его активный ход.

`SessionPersistence.inspect(id)` конструирует неизменяемую логическую Session, не публикуя её и не записывая ремонт. Холодная инспекция балансирует прерванный ход в памяти, оставляя разорванные физические хвосты нетронутыми; инспекция уже живой Session заимствует её текущий неизменяемый снапшот и потому может содержать открытый ход. Реализации с координатором удерживают точную холодную неопубликованную Session в ограниченном LRU, поэтому повторные чтения истории и последующий `prepare(id)` разделяют одно чтение, одну распаковку, одну валидацию, одну заморозку и одно конструирование Session. `prepare(id)` резервирует Session, фиксирует отложенный ремонт и возвращает одноразовый дескриптор публикации; `load(id)` использует тот же механизм, чтобы зафиксировать ремонт без публикации. Этим жизненным циклом владеет [решение о подготовке Session](../../.agents/notes/implemented/architecture/2026-08-05-session-preparation.md).

## `SessionLocation` — необязательная цель артефакта отдельной сессии

`SessionPersistence.locate(meta)` синхронно разрешает принадлежащий бэкенду независимый артефакт, не читая, не создавая и не флашая его. JSONL возвращает абсолютный путь транскрипта внутри своего каталога project/session; SQLite возвращает `undefined`, потому что сессии разделяют одну базу данных. Поэтому возвращённый путь может называть файл, который ещё не существует или ещё не содержит текущий незафлашенный ход; это подсказка расположения, а не авторизация и не гарантия актуальности.

```ts type-equiv
/**
 * A backend-resolved, per-session local artifact location. The path is an
 * absolute target path and can name an artifact that has not materialized yet.
 * Consumers must treat it as a location hint, never as an authorization token.
 */
interface SessionLocation {
  /** Backend-specific artifact kind, for example `jsonl`. */
  readonly kind: string
  /** Absolute path to this session's backend-owned artifact. */
  readonly path: string
}
```

<a id="sessionheader--metadata-beside-the-log"></a>

## `SessionHeader` — метаданные рядом с журналом

Метаданные отдельной сессии передаются **отдельно** от журнала событий: версия формата, cwd, родословная и граница засева — атрибуты хранилища, а не события беседы, поэтому они остаются вне `SessionEventMap` и никогда не достигают `deriveMessages()`. Заголовок прикрепляется к `Session` через `session.header`.

Источник: [`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

```ts type-equiv
/**
 * Immutable validated storage metadata, kept outside the conversation event log.
 */
interface SessionHeader {
  /**
   * On-disk format version, stamped from {@link SESSION_FORMAT_VERSION} when the
   * session is created. A persistence backend rejects any other version on load
   * (no migration — see the constant).
   */
  readonly version: number
  /** The session's id (mirrors the {@link Session}'s id). */
  readonly id: SessionId
  /** Non-negative safe-integer Unix epoch milliseconds when the session was created. */
  readonly createdAt: number
  /** Absolute working directory the session was created in (if any). */
  readonly cwd?: string
  /** The session this one was forked from (seed lineage), if any. */
  readonly parentSession?: SessionId
  /**
   * How many leading events were inherited through a seed. Persisting this
   * boundary lets resume and replay distinguish parent history from child work.
   */
  readonly seedLength?: number
  /**
   * Coarse product classification for a session created as a subagent child.
   * This is presentation metadata, not proof that the child is continuable.
   */
  readonly origin?: 'subagent'
  /**
   * Delegation depth: absent (zero) for a top-level session, parent depth + 1
   * for a subagent child. Persisted so a recursion budget survives restart and
   * resume — a runtime-only depth would reset a resumed child to top-level.
   */
  readonly delegationDepth?: number
  /**
   * Id of the agent preset this session's agent was composed from, when the
   * deployment composes per session. Durable because the preset decides the
   * session's tools and prompt: a resume that restored a different composition
   * would replay history the model can no longer act on.
   */
  readonly agentPreset?: string
}
```

## Отказ формата — журналы, которые сборка не может достоверно прочитать

Бэкенд отказывает журналу, который не может достоверно интерпретировать, ошибкой `SessionFormatUnsupportedError`, отличной от `SessionPersistenceCorruptionError`, поскольку ничего не повреждено. Заголовок с `version` впереди `SESSION_FORMAT_VERSION` называет направление ("written by a newer harness — upgrade the harness to open it"); отстающий сообщает, что эта сборка не содержит пути обновления. После нормализации устаревшей формы тип события вне сгенерированного словаря этой сборки (`KNOWN_SESSION_EVENT_TYPES`, испускается `gen-persistence-catalog`) отвергается тем же способом, если только конверт события не несёт `ignorable: true` — молчаливый пропуск нераспознанного обязательного события мог бы изменить то, как должен читаться остальной журнал. Сообщение добавляет путь сырого журнала, когда бэкенд держит один артефакт на сессию, чтобы отвергнутый текст оставался доступным. Бэкенд JSONL отвергает чужую версию прямо из сырой строки заголовка, до проверки нынешней структуры заголовка или декодирования какой-либо строки события — структурно иной будущий формат всё равно сообщает направление обновления, а не «повреждение»; SQLite сперва проверяет структуру целого файла через собственную pragma `SCHEMA_VERSION`. Обоснование решения и цепочка отложенных обновлений описаны в [Agent Note о механизме версий журнала сессии](../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md).

## `CreateSessionOptions` — засев и метаданные

Создание `Session` через хранилище принимает `seed` (начальная история воспроизведения или fork) и `meta` (поля уровня хранилища, которые хранилище сворачивает в `SessionHeader`). Хранилище заполняет `version`/`id` и подставляет значение по умолчанию для `createdAt`; вызывающий может передать валидированный абсолютный `cwd`, родословную `parentSession`, границу засева `seedLength`, необязательную грубую метку `origin`, `delegationDepth`, `agentPreset`, из которого скомпонован агент, и уже существующий `createdAt`. `origin: 'subagent'` позволяет навигации продукта скрывать дублирующиеся дочерние строки; он не доказывает ни валидность дескриптора, ни возможность возобновить потомка.

```ts type-equiv
/**
 * Options for creating a {@link Session} via the store. `seed` replays/forks
 * an existing event log; `meta` carries the caller-supplied storage fields the
 * store folds into a {@link SessionHeader}.
 */
interface CreateSessionOptions {
  /** Initial replay or fork history supplied at construction. */
  readonly seed?: readonly SessionEvent[]
  /**
   * Storage metadata read once before publication. `seedLength` is explicit
   * because a resumed seed contains the full stored log, not only its inherited prefix.
   */
  readonly meta?: {
    readonly cwd?: string
    readonly parentSession?: SessionId
    readonly createdAt?: number
    readonly seedLength?: number
    readonly origin?: 'subagent'
    readonly delegationDepth?: number
    readonly agentPreset?: string
  }
}
```

Поэтому воспроизведение/fork — это `ctx.sessions.create(id, { seed: seedEvents })`; возобновление *сохранённой* сессии в живом агенте — это `ctx.agents.resume({ resumeSessionId })`.

## `SessionRawArtifact` — дословный текст сохранённого артефакта

Собственный текст артефакта бэкенда для одной сессии, побайтово идентичный тому, что бэкенд долговечно записал (декодировано из его физической кодировки). `readRaw` возвращает его без реконструкции из разобранных событий, поэтому специфичная для бэкенда сериализация (упаковка чанков, порядок ключей, переносы строк) сохраняется. Потребители сперва проверяют `supportsRawArtifacts`: `false` означает, что бэкенд не предоставляет эту возможность (например, SQLite), а `readRaw(...) === undefined` означает, что поддерживающий бэкенд не имеет материализованного артефакта для этой сессии.

```ts type-equiv
/** A backend's own raw artifact text for one session, verbatim. */
interface SessionRawArtifact {
  /** The session header parsed from the artifact's own first line. */
  readonly meta: SessionHeader
  /** The artifact's base filename on disk, without any physical encoding suffix. */
  readonly filename: string
  /** The artifact's full text content, decoded from the backend's physical encoding. */
  readonly content: string
}
```

## Владение подготовкой и восстановлением

`SessionStore.prepare()` принимает обычные опции создания либо свежие графы персистентности, переданные через `RestoredSessionOptions`. Ветка восстановления валидирует и замораживает переданные заголовок и события на месте, поэтому вызывающие не должны удерживать изменяемых псевдонимов. Затем `SessionPreparation` владеет точной неопубликованной Session до публикации или отката; освобождение ресурсов синхронно и идемпотентно. Инспекция персистентности предоставляет только `SessionInspection` — неизменяемый логический вид, заимствованный у той же подготовленной Session.

```ts type-equiv
/**
 * Fresh storage values transferred to {@link SessionStore.prepare} without a
 * second serialization copy. Callers retain no mutable aliases.
 */
interface RestoredSessionOptions {
  /** Fresh detached storage events to validate and freeze in place. */
  readonly seed: SessionEvent[]
  /** Fresh detached storage metadata to validate and freeze in place. */
  readonly meta: SessionHeader
  /** Select the persistence ownership-transfer path. */
  readonly seedSource: 'persistence'
}
```

```ts type-equiv
/** Inputs accepted while constructing an unpublished Session. */
type PrepareSessionOptions =
  | (CreateSessionOptions & { readonly seedSource?: undefined })
  | RestoredSessionOptions
```

```ts type-equiv
/** Options for a preparation whose provider retains unpublished state. */
interface SessionPreparationOptions {
  /** Release provider-owned state when the Session was not published. */
  readonly release?: () => void
}
```

```ts public-api
/**
 * One exact unpublished Session and the provider state that keeps it usable.
 * Disposal is synchronous and idempotent. Providers decide whether release
 * returns the Session to a cache or discards it; publication may consume that
 * state before disposal, making the callback a no-op.
 */
declare class SessionPreparation implements Disposable {
  /** The exact Session to use for setup and publication. */
  readonly session: Session;
  /**
   * Wrap an unpublished Session in one preparation lifetime.
   * @param session - exact unpublished Session.
   * @param options - optional provider release behavior.
   * @returns a preparation disposed after publication or rollback.
   */
  static create(session: Session, options?: SessionPreparationOptions): SessionPreparation;
  /** Release provider state once when this preparation leaves its caller. */
  [Symbol.dispose](): void;
}
```

```ts type-equiv
/** Immutable logical session prepared from persistence or a live owner. */
interface SessionInspection {
  /** Validated immutable session metadata. */
  readonly meta: SessionHeader
  /** Validated contiguous logical event log. */
  readonly events: readonly SessionEvent[]
}
```

## Лёгкие ревизии источника

Потребители производного состояния сравнивают дешёвую непрозрачную ревизию перед загрузкой полного журнала событий. Бэкенд персистентности владеет её представлением и меняет её транзакционно вместе с append или ремонтирующей мутацией при load; вызывающие сравнивают её только на равенство.

```ts type-equiv
/**
 * Backend-owned token that identifies both one storage source and one revision
 * of a persisted session log.
 */
type SessionPersistenceRevision = Branded<'SessionPersistenceRevision'>
```

```ts type-equiv
/** Lightweight immutable source identity returned without loading a full log. */
interface SessionPersistenceSnapshot {
  /** Detached metadata for one materialized session. */
  header: SessionHeader
  /** Opaque source-qualified token that changes whenever this stored log changes. */
  revision: SessionPersistenceRevision
}
```

## Бэкенды

Все реализуют один и тот же абстрактный `SessionPersistence` (locate/create/append/prepare/load/inspect/readFrom/list/listSnapshots над `SessionEvent`, с опциональной отменой в методах наблюдения) и проходят общий набор тестов `runPersistenceContract`:

- **[dsh-session-persistence-jsonl](../../packages/session/session-persistence-jsonl)** — append-only логический журнал JSONL для каждой сессии, по умолчанию хранимый как конкатенированные кадры Zstandard с контрольными суммами или сырые строки по конфигурации, с безопасными при сбоях атомарными записями, восстановлением прерванных ходов и путём чтения/воспроизведения.
- **[dsh-session-persistence-sqlite](../../packages/session/session-persistence-sqlite)** — опциональный бэкенд на `node:sqlite`, использующий схему 17, чтобы хранить точные дельта-серии одного блока в ограниченных физических строках `text-chunks`, `reasoning-chunks` и `tool-call-chunks`. Он реконструирует полный логический поток событий перед возвратом, упаковывает только заново ставшие долговечными партии и отвергает более старые схемы вместо их миграции.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionpersistence--sessionpersistence-abstract-seam"></a>

### `ctx.sessionPersistence` — `SessionPersistence` (abstract seam)

Durable append-only session storage. Implementations preserve contiguous, losslessly JSON-serializable events; append resolves only after durability, and load balances a complete interrupted tail without rewriting committed events.

```ts cordis-catalog
/**
 * Resolve this backend's independent local artifact for a session without
 * reading, creating, flushing, or otherwise materializing it. Backends such
 * as SQLite that do not own one artifact per session return `undefined`.
 * @param meta - the immutable session header whose artifact is requested.
 * @returns the backend-specific absolute location, when one exists.
 */
abstract locate(meta: SessionHeader): SessionLocation | undefined

/**
 * Read a session's backend-owned artifact text verbatim — the exact durable
 * bytes the backend wrote (decoded from its physical encoding, e.g. a
 * decompressed JSONL). The returned `content` is the raw text, not a
 * reconstruction from parsed events, so it preserves backend-specific
 * serialization (chunk packing, key order, line breaks). Callers first test
 * {@link supportsRawArtifacts}; `undefined` then means only that the requested
 * session has no materialized artifact.
 * @param _id - the persisted session to read (unused by the default: no
 * per-session artifact).
 * @param signal - optional cancellation for backend read work.
 * @returns the raw artifact plus its parsed header, or `undefined` when the
 * session is absent.
 * @throws when this backend does not expose per-session raw artifacts.
 */
readRaw(_id: SessionId, signal?: AbortSignal): Promise<SessionRawArtifact | undefined>

/**
 * Register a new session's metadata. A backend MAY defer the physical write
 * until the first {@link append} (lazy materialization), in which case a
 * created-but-never-appended session is absent from {@link list}
 * — abandoned sessions leave nothing behind.
 * @param meta - the immutable header (id, version, cwd, lineage) to record.
 */
abstract create(meta: SessionHeader): Promise<void>

/**
 * Durably persist a batch of events. Honors the append-only and contiguous-
 * seq contracts: the first event's `seq` MUST equal the stored next-seq
 * (after `load` has durably closed any interrupted turn). Rejects non-JSON-
 * serializable `event.data` with an error naming the offending event type.
 * @param id - the session the batch belongs to.
 * @param events - the contiguous batch to persist, in seq order.
 */
abstract append(id: SessionId, events: readonly SessionEvent[]): Promise<void>

/**
 * Prepare the exact unpublished Session used by resume. Implementations may
 * reuse object graphs retained by an earlier {@link inspect} after confirming
 * their durable revision is still current; disposal releases an unpublished
 * reservation. Revision retries require the durable log to remain unchanged
 * for one read/check round trip; continuous external writers may delay completion.
 * @param id - persisted session to prepare.
 * @param signal - optional cancellation for preparation work.
 * @returns one owned unpublished Session preparation.
 */
async prepare(id: SessionId, signal?: AbortSignal): Promise<SessionPreparation>

/**
 * Load an immutable balanced logical view and commit any required cold
 * recovery. A complete interrupted final turn is preserved and durably
 * closed with missing tool errors plus any open step and turn boundaries;
 * only a torn final record is discarded. Unknown versions and corruption in
 * the committed prefix reject. Implementations MUST NOT crash-repair an
 * identity still bound to a live Session: a balanced live log may return as a
 * durable snapshot, while an open live turn rejects. Returned values may be
 * shared with immutable live or prepared state and must not be mutated.
 * Revision-based implementations may wait for one stable read/check round trip.
 * @param id - the persisted session to reload.
 * @returns the header and a log ending on a balanced `turn/end`.
 */
abstract load(id: SessionId): Promise<SessionInspection>

/**
 * Inspect an immutable logical session without committing recovery or
 * publishing it. A cold complete interrupted turn receives synthetic closers
 * in memory and a torn physical tail remains untouched. An already-live
 * Session instead yields its current immutable snapshot, which may contain an
 * open turn and its `session/end-seed` boundary. Coordinator-backed
 * implementations retain the exact cold unpublished Session for bounded
 * reuse by a later {@link prepare}. A stale ready source is reloaded; a source
 * already committing or reserved for resume remains exclusive, and inspection
 * may borrow its immutable view. Callers borrow only the immutable header and
 * log. Continuous external writers may delay revision convergence.
 * @param id - the persisted session to inspect.
 * @param signal - optional cancellation for queued and backend read work.
 * @returns the validated header and current logical event log.
 */
abstract inspect(id: SessionId, signal?: AbortSignal): Promise<SessionInspection>

/**
 * Read the stored events from `fromSeq` onward — the read-from-seq
 * primitive for read models that resume from a watermark (e.g. a persisted
 * projection cache folding only the tail past its checkpoint). Unlike
 * {@link inspect}, it is a detached physical suffix read: no preparation
 * cache, torn-tail truncation, synthetic closers, or coordinator-state
 * publication. Only events from the valid contiguous stored prefix are
 * returned, so a torn fragment never reaches the caller. `fromSeq` at or
 * beyond the stored prefix returns an empty event list (never an error).
 * Backends whose medium can seek by seq
 * (SQLite) read only the suffix; sequential media (JSONL, both encodings)
 * still parse the whole artifact and skip forward — the primitive bounds
 * what is RETURNED and refolded, not every backend's physical read.
 * @param id - the persisted session to read.
 * @param fromSeq - first event seq to include; a non-negative safe integer.
 * @param signal - optional cancellation for queued and backend read work.
 * @returns the header and the stored events with `seq >= fromSeq`.
 */
abstract readFrom(id: SessionId, fromSeq: number, signal?: AbortSignal): Promise<{ meta: SessionHeader; events: SessionEvent[] }>

/**
 * Lightweight listing from metadata, without a full-log parse.
 * @param signal - optional cancellation for backend listing work.
 * @returns one header per materialized session.
 */
abstract list(signal?: AbortSignal): Promise<SessionHeader[]>

/**
 * List materialized sessions with cheap per-log change tokens.
 *
 * Repeated observations of an unchanged log return the same revision. A
 * successful mutating {@link load} repair changes the next listed revision.
 * Revisions also distinguish independently backed stores so backend-local
 * counters cannot compare equal across different persistence sources.
 * @param signal - optional cancellation for backend snapshot-listing work.
 * @returns one header and opaque revision per materialized session without loading full logs.
 */
abstract listSnapshots(signal?: AbortSignal): Promise<SessionPersistenceSnapshot[]>
```

Types: [SessionEvent](session.md) · [SessionId](core.md)

Source: [`packages/session/session-persistence/src/index.ts`](../../packages/session/session-persistence/src/index.ts)
<!-- END GENERATED cordis-surface -->

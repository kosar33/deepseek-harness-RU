# SessionTelemetryBackend

[English](session-telemetry.md) | [中文](session-telemetry.zh.md) | Русский

Исходящая отчётность сессии разделена как [capability seam](../capability-seams.ru.md): Service Definition и координатор захвата ([dsh-session-telemetry](../../packages/session/session-telemetry), `ctx.sessionTelemetry`) владеют точками захвата, фиксированной проекцией чанков, каскадом редактирования `session-telemetry/record`, курсором передачи и минимальным контрактом бэкенда; загружаемый развёртыванием Service Provider ([dsh-session-telemetry-otel](../../packages/session/session-telemetry-otel)) — это конвейер логов OpenTelemetry JS SDK, сконфигурированный дословно. Это одна необязательная возможность, а не часть стержня agent-loop, и отсюда ничего не попадает в запрос к модели. Аксиома границы — аспект harness заканчивается на `emit()`; батчинг, повторы, очередь и политика потерь принадлежат SDK отчётности — и отвергнутые альтернативы закреплены в [Agent Note о возрождении](../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md); контракты точек захвата, курсора и проекции живут в [README Service Definition](../../packages/session/session-telemetry/README.md).

Источник: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)

## Логическая запись

```ts type-equiv
/**
 * Severity of a telemetry record, pre-mapped at capture so a receiver can
 * alert with zero configuration: `error` for events whose own outcome flag
 * says so (the tool-result block's `isError`, `turn/end` error reasons) and for
 * `agent-error` operational records. Captured events otherwise default to
 * `info`; `warn` remains available to `session-telemetry/record` policies and
 * backends.
 */
type SessionTelemetrySeverity = 'info' | 'warn' | 'error'
```

```ts type-equiv
/**
 * One logical record handed to a backend — the capture contract's whole outbound
 * vocabulary. Ledger records mirror session-log events one-to-one;
 * operational records (`channel: 'ops'`) carry the two signals with no log
 * home (`agent-error`, `shutdown`) and deliberately omit `event.seq`-style
 * identity so they can never be mistaken for ledger rows.
 */
interface SessionTelemetryRecord {
  /** Ledger (session-log mirror) or ops (operational signal) channel; backends keep the two under separate instrumentation scopes. */
  channel: 'ledger' | 'ops'
  /** Unix epoch milliseconds — the source event's append time for ledger records, the emission time for ops records. */
  time: number
  /** Pre-mapped alerting severity; see {@link SessionTelemetrySeverity}. */
  severity: SessionTelemetrySeverity
  /**
   * Identity attributes, deliberately minimal: ledger records carry
   * `session.id`, `event.type`, `event.seq`, plus `session.cwd` /
   * `session.parent_id` / `session.seed_length` when the header has them;
   * ops records carry `telemetry.op`, `session.id`, and (for `agent-error`)
   * `agent.id`, `turn`, `step`, `error.name`. Anything recoverable from the
   * body is intentionally NOT duplicated here.
   */
  attributes: Record<string, string | number>
  /**
   * The complete payload: a deep copy of the session event's `data` for
   * ledger records (JSON-serializable by `Session.append`'s own
   * validation), or the op payload for ops records. Never mutated after
   * handoff.
   */
  body: unknown
}
```

Уходит только первый `assistant/chunk` каждой пары `(turn, step)` — сигнал о старте потока; остальные отбрасываются при захвате, поэтому разрывы `seq` при передаче обычны и никогда не являются сигналом потери. Каждый другой тип [события сессии](session.ru.md), включая слитые плагинами типы, которых сам seam не знает, проходит целиком. Доставка — best-effort: курсор отмечает переданные бэкенду, а не доставленные записи; записи могут теряться (сбой, перезагрузка окна) и дублироваться (повторное усыновление без курсора, повторы SDK), поэтому получатели дедуплицируют записи канала `ledger` по `(session.id, event.seq)`; записи канала `ops` намеренно опускают эту идентичность — это сигналы для оповещения, а не записи для суммирования, и вместо этого они допускают дубликаты.

## Раскрытие обмена данными

Контракт подтверждения seam (его владелец — [раздел о раскрытии обмена данными в README Service Definition](../../packages/session/session-telemetry/README.md#the-sharing-disclosure)): каждый бэкенд раскрывает выбранную развёртыванием политику обмена данными через обязательный абстрактный член `sharing` на `ctx.sessionTelemetry`, а потребители показывают «не настроено» только когда сервис телеметрии не смонтирован. Раскрытие сообщает текущую политику, но никогда — доставку или хранение: передача является неблокирующей постановкой в очередь, а батчинг, повторы и политика потерь остаются за SDK отчётности.

```ts type-equiv
/**
 * Deployment-selected session-sharing policy disclosed by a mounted
 * {@link SessionTelemetryBackend} backend to human-facing acknowledgement surfaces (the
 * `/feedback` command's confirmation text). The seam owns the vocabulary so
 * any backend can disclose a policy without depending on the OTel package;
 * the values mirror the OTel backend's serialized `SessionTelemetryMode` choices.
 */
type SessionTelemetrySharingStatus = 'full' | 'feedback-only' | 'disabled'
```

## Контракт бэкенда

```ts type-equiv
/**
 * The minimum backend contract the coordinator requires. {@link SessionTelemetryBackend} is
 * its service-registered form; tests compose the coordinator with a bare
 * implementation of this interface.
 */
interface SessionTelemetrySink {
  /**
   * Hand one record to the backend's pipeline. MUST be a non-blocking
   * enqueue — the coordinator calls this synchronously from the
   * `session/event` hot path or an explicit canonical-log capture, so anything
   * slower than a queue push would tax the agent loop or feedback handling.
   * Errors thrown here are contained by the coordinator and logged; they
   * never reach the loop.
   * @param record - the logical record to report; owned by the backend after the call.
   */
  emit(record: SessionTelemetryRecord): void
  /**
   * Optional hint that a turn ended. A backend may forward it to its SDK's
   * flush so records are exported after each turn. Called
   * fire-and-forget; implementations must not block and must not throw
   * meaningfully (the coordinator contains exceptions). Most backends should
   * leave this unimplemented and let their SDK's own batching cadence govern
   * export timing: a backend that does implement it owns the interaction
   * between its concurrent flushes and {@link shutdown}'s drain (the OTel
   * backend leaves it unimplemented for exactly that hazard — see the
   * revival Agent Note).
   */
  flush?(): void
  /**
   * Forward the fiber's disposal to the SDK: flush whatever is queued and
   * reach quiescence, per the SDK's own shutdown contract. Everything
   * emitted before this call must still be delivered — including records
   * enqueued while a {@link flush} hint is in flight, so a backend whose SDK
   * guards against concurrent flushes orders behind the outstanding one (the
   * coordinator emits its dispose-time `shutdown` markers immediately before
   * calling this). Awaited by the coordinator's dispose; a rejection is
   * logged as a warning and never fails application teardown.
   * The coordinator captures dispose-time shutdown markers immediately before
   * this call for live capture; on-demand capture creates no ops records.
   * @returns resolves when the backend's pipeline has quiesced.
   */
  shutdown(): Promise<void>
}
```

`SessionTelemetryBackend` (`ctx.sessionTelemetry`, [сигнатуры](#ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam)) — загружаемая форма контракта: одна реализация на контекст, повторная загрузка бросает исключение, — и бэкенд компонует `SessionTelemetryCoordinator` данного seam в своём конструкторе, чтобы установить сторону захвата.

## Каскад редактирования: `session-telemetry/record`

Каждая запись проходит [каскад](../cordis-primer.ru.md#семантика-waterfall-в-cordis) `session-telemetry/record` между проекцией и `emit()` ([описание события](#session-telemetryrecord--waterfall)). Seam не поставляет никаких собственных правил: без смонтированного слушателя записи достигают бэкенда ровно в том виде, в каком захвачены, поэтому экспортированные данные настолько чисты, насколько чисты правила, смонтированные развёртыванием. Слушатели образуют цепочку, преобразуя возвращаемое значение `next()`; возврат без `next()` заменяет всё нижележащее; бросающий исключение слушатель задерживает эту одну запись, а сбой перехватывается внутри координатора по принципу fail-closed. Редактирование применяется только к экспортируемой копии — канонический журнал сессии никогда не переписывается.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam"></a>

### `ctx.sessionTelemetry` — `SessionTelemetryBackend` (abstract seam)

Загружаемая форма контракта бэкенда: одна реализация на контекст — регистрация cordis-`Service` под ключом `telemetry` бросает исключение при дубликате, стандартное поведение cordis. Бэкенд компонует `SessionTelemetryCoordinator` в своём конструкторе, чтобы установить сторону захвата.

```ts cordis-catalog
/**
 * See {@link SessionTelemetrySink.emit} — that declaration is the contract's one home.
 * @param record - the logical record to report; owned by the backend after the call.
 */
abstract emit(record: SessionTelemetryRecord): void

/** See {@link SessionTelemetrySink.flush}. */
flush?(): void

/**
 * See {@link SessionTelemetrySink.shutdown}.
 * @returns resolves when the backend's pipeline has quiesced.
 */
abstract shutdown(): Promise<void>
```

Source: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)

<a id="session-telemetry-events"></a>

### `session-telemetry/*` events

<a id="session-telemetryrecord--waterfall"></a>

#### `session-telemetry/record` — waterfall

Преобразует одну исходящую запись до того, как она достигнет бэкенда. Этот каскад — точка расширения редактирования у Service Definition. Собственных правил у него нет: внутренний `next()` проводит запись без изменений, а без смонтированного слушателя записи достигают бэкенда ровно в том виде, в каком захвачены, поэтому экспортированные данные настолько чисты, насколько чисты правила, смонтированные развёртыванием. Слушатели образуют цепочку, преобразуя возвращаемое значение `next()`; возврат без `next()` заменяет всё нижележащее. Диспетчеризация выполняется синхронно на горячем пути захвата внутри перехвата координатора: бросающий исключение слушатель задерживает эту одну запись (fail-closed) и никогда не достигает агентного цикла. Живой захват диспетчеризуется в момент добавления записи; захват по требованию — при чтении канонического журнала. Редактирование применяется только к экспортируемой копии; канонический журнал сессии никогда не переписывается.

```ts cordis-catalog
/**
 * Transform one outbound record before it reaches the backend. This
 * waterfall is the Service Definition's redaction extension point. It ships NO rules
 * of its own: the
 * innermost `next()` passes the record through unchanged, and with no
 * listener mounted records reach the backend as captured, so exported
 * data is exactly as clean as the rules a deployment mounts. Listeners
 * stack by transforming `next()`'s return value; returning without
 * `next()` replaces everything beneath. Dispatched synchronously on the
 * capture hot path inside the coordinator's containment: a throwing
 * listener withholds that one record (fail-closed) and never reaches the
 * agent loop. Live capture dispatches at append time; on-demand capture
 * dispatches while reading the canonical log. Redaction applies to the
 * exported copy only; the canonical session log is never rewritten.
 * @param record - the candidate record, already the coordinator's own deep
 *   copy; listeners return a (possibly new) record and must not mutate it.
 * @mode waterfall
 */
'session-telemetry/record'(record: SessionTelemetryRecord, next: () => SessionTelemetryRecord): SessionTelemetryRecord
```

Source: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)
<!-- END GENERATED cordis-surface -->

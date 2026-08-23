# Компакция

[English](compaction.md) | [中文](compaction.zh.md) | Русский

Seam компакции — [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md), разделённый по ролям так же, как bash: Service Definition ([dsh-compaction](../../packages/compaction/compaction), `ctx.compaction`), Service Provider (бэкенд, например [dsh-compaction-basic](../../packages/compaction/compaction-basic)) и пользовательский Consumer ([dsh-command-compact](../../packages/compaction/command-compact)). Компакция — **одна необязательная возможность**, а не часть стержня agent-loop, поэтому её словарь живёт здесь, а не в [core.ru.md](core.ru.md). Бэкенд на токенизаторе или шаблонах — соседний пакет, реализующий тот же интерфейс. В отличие от bash, интерфейс неизбежно зависит от `dsh-session` и `dsh-llm`: его операции действуют над принадлежащей агенту `Session`, а долговременное событие итога пользуется набором типов `ContentBlock` (см. [Agent Note о capability seam компакции](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md)).

Источник: [`packages/compaction/compaction/src/types.ts`](../../packages/compaction/compaction/src/types.ts)

## События сессии `compaction/*`

Компакция добавляет в [`SessionEventMap`](session.md) три типа событий через декларативное слияние (declaration merging). Все три существуют **только в журнале**: они фиксируют блокировку, итог, выбранный диапазон, затенённые seq событий, число токенов и вызов модели, не попадая на поверхность. `SurfaceEventType` намеренно НЕ расширяется (модель достигают только события, порождающие сообщения), поэтому сам итог переносится отдельным `user/message` с `surfaceOp: { op: 'replace', start, end }` — это единственная мутация поверхности, которую выполняет итоговая компакция. Обоснование повторного использования `user/message` приводит [Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md).

| Событие | Полезная нагрузка | Роль |
|---|---|---|
| `compaction/start` | `{ turn }` | захватывает фиксируемую в журнале блокировку; число обозначает открытый автоматический ход, `null` — отдельную ручную попытку |
| `compaction/summary` | `{ summary, rawOutput?, llmStreamCall?, shadowedRange, shadowedSeqs, shadowedTokenCount, provider, model, maxTokens?, usage? }` | безопасная проекция итога; необязательный полный вывод провайдера вместе с расходом; маркер `llmStreamCall: true`, отмечающий, что получение результата потребило ровно один вызов через `ctx.llm.stream()` этого контекста (что требует полного `rawOutput`); затенённая пара границ поверхности (`start`/`end` seq — позиционный интервал, а не числовой промежуток); затенённые seq в порядке поверхности; оценочное число токенов; конверт вызова суммаризации (`provider`, `model`, плюс предел генерации, если он применялся) — всё записывается в журнал, чтобы одноразовый запрос можно было восстановить из журнала и кода (Agent Note о восстанавливаемости); `rawOutput` без маркера не указывает путь вызова |
| `compaction/end` | `{ turn, error? }` | освобождает блокировку у того же владельца — числа или `null` (`error` фиксирует неудачную попытку) |

Блокировка охватывает операцию целиком: сначала в журнал попадает `compaction/start`, затем приземляются суммаризация, запись `compaction/summary` и замещающее `user/message`, и лишь потом — `compaction/end`. Освобождение блокировки последним превращает сбой посреди операции в обнаруживаемую осиротевшую блокировку (`compaction/start` без парного `compaction/end`), а не в `compaction/end`, ложно объявляющий завершение компакции.

Отметки задают моменты времени блокировки, а не служат исключающим контейнером. Между отдельными ручными `start` и `end`, пока суммаризация ещё выполняется, может появиться посторонняя инъекция в простое. Ручной путь перепроверяет только свой выбранный позиционный диапазон, поэтому инъецированный контекст переживает чекпоинт замены. Живой непарный `start` блокирует любую точку входа; непарный `start`, оказавшийся до более нового `session/end-seed`, — устаревший след прежнего жизненного цикла, и он игнорируется.

Эти варианты сливаются внутри блока `declare module '@deepseek-ai/dsh-session/types'`, поэтому — в отличие от типов верхнего уровня на других страницах подсистем — они не вставлены сверяемым на дрейф блоком ` ```ts type-equiv ` (экстрактор `verify-type-equiv` сопоставляет по имени только объявления верхнего уровня). Таблица полезных нагрузок выше служит записью каталога; авторитетные поля ищите по ссылке на источник.

## `CompactionResult`

Что успешная компакция возвращает вызывающему: seq учётных событий, безопасную проекцию итога, затенённые диапазон и seq, оценочное число токенов.

```ts type-equiv
/** Result of a successful compaction operation. */
interface CompactionResult {
  /** Stable identity shared by this compaction's complete durable lifecycle. */
  compactionId: CompactionId
  /** Human command that initiated this compaction, when it was manual. */
  sourceCommandId?: CommandId
  /** The seq of the appended `compaction/start` event. */
  startSeq: number
  /** The seq of the appended `compaction/summary` event. */
  summarySeq: number
  /** The seq of the appended `compaction/end` event. */
  endSeq: number
  /** The summary content blocks produced by the backend. */
  summary: ContentBlock[]
  /**
   * The surface-boundary pair that was shadowed: the seqs of the first
   * (`start`) and last (`end`) surface nodes of the replaced range. A
   * surface-POSITION span, not a numeric seq interval — after a prior replace
   * lands a fresh high-seq summary node at an older range's position, `start`
   * can be GREATER than `end`. {@link CompactionResult.shadowedSeqs} is the
   * authoritative set of shadowed nodes, in surface order.
   */
  shadowedRange: { start: number; end: number }
  /** The seqs of all shadowed surface nodes, in surface order. */
  shadowedSeqs: number[]
  /** Estimated token count of the shadowed content. */
  shadowedTokenCount: number
}
```

## Сервис

Автоматические вызывающие сообщают причину запуска политики; реализации могут реагировать на подтверждённое переполнение жёстче, чем на обычное давление.

```ts type-equiv
/** Why automatic policy is asking a backend to consider compaction. */
type CompactionTrigger = 'pressure' | 'context-overflow'
```

`CompactionEngine` предоставляет `compactIfNeeded(agent, trigger, signal)` для автоматической политики давления или переполнения контекста, `compactNow(agent, signal)` для однократного полезного сокращения простаивающей сессии даже ниже порога давления и `compactRegion(...)` для явно заданного включительного диапазона поверхности. `compactNow()` выполняется как обслуживание агента между ходами, возвращает `null`, ничего не записывая, если полезного диапазона нет, ставит отдельную скобку `turn: null` перед суммаризацией и сбрасывает закрытую попытку раньше, чем последующие ожидающие промпты смогут вывестись из новой поверхности. Каждый бэкенд создаёт источник замещающего `user/message` через `compactCheckpointSource(compactionId, sourceCommandId?)`; клиентские потребители и потребители формата протокола импортируют этот конструктор, `CompactionCheckpointSource` и `isCompactCheckpointSource()` из свободного от Cordis подпути `@deepseek-ai/dsh-compaction/checkpoint`, тогда как корень пакета реэкспортирует их для хостовых потребителей. Обязательная транзакционная идентичность связывает замещающий чекпоинт, а предикат сохраняет распознавание независимым от любого конкретного бэкенда. Реализации обязаны пробрасывать переданный сигнал в суммаризацию. Seam не владеет API ценообразования: одиночка [`ctx.tokenMeter`](token-meter.ru.md) напрямую владеет оценкой и воспроизведением, а `dsh-compaction-basic` владеет удержанием, упорядочиванием событий, маршрутизируемыми вызовами суммаризации и их конфигурацией.

Ожидаемые отказы ручной компакции кодируются `ManualCompactionErrorCode`:

```ts type-equiv
/** Expected failure classes for an explicit idle-session compaction request. */
type ManualCompactionErrorCode =
  | 'busy'
  | 'cancelled'
  | 'changed'
  | 'summary'
  | 'commit'
  | 'persistence'
```

`changed` и `summary` оставляют поверхность диалога неизменной, но всё равно закрывают неудавшуюся попытку и сохраняют её в журнале. `commit` возможен после частичной мутации; `persistence` означает, что находящаяся в памяти скобка закрылась, а её сброс потерпел неудачу. Отмена остаётся отдельным случаем и после обязательной очистки бросает точную причину прерывания.

Компакция давления выполняется на последовательном `agent/pre-step` до выведения запроса. Как только давление или каноническое переполнение признаются достаточным основанием, compaction-basic перед выбором диапазона вызывает необязательный [`ctx.toolResultPruner`](../../packages/compaction/compaction-tool-result-pruner/README.md), перемеряет через `ctx.tokenMeter` и может продвинуть поверхность без итога. Восстановление после неудачного запроса идёт через `agent/request-error` после закрытия неудачного шага и возвращает действие повтора, только если поколение замен поверхности продвинулось, — даже если позднейшая работа над итогом упадёт уже после прореживания; отмена всё равно побеждает. Границы региона сохраняют парность вызова и результата инструмента, но не целые ходы, поэтому ранние закрытые шаги одного чрезмерно крупного хода тоже поддаются компакции. `dsh-compaction-basic` владеет порогами, политикой удерживаемого хвоста, лимитами переполнения и обработкой отказов.

Service Definition экспортирует `toolPairingBalancedBefore(session, seq)` и `toolPairingBalancedAfter(session, seq)` для проверок парности вызова и результата инструмента до и после seq. Обе подтверждают текущее членство на поверхности и отвергают отсутствующие seq и осиротевшие результаты; кэширующее поведение определено в [контракте пакета](../../packages/compaction/compaction/README.md#tool-pairing-boundaries).

## Итоги прореживания результатов инструментов

Необязательный сервис прореживания результатов инструментов сообщает о каждой долговременной замене содержимого и об агрегированном сокращении числа кодовых точек Unicode. Его публичные типы результата лежат в [`compaction-tool-result-pruner/src/types.ts`](../../packages/compaction/compaction-tool-result-pruner/src/types.ts).

```ts type-equiv
/** Cited source event and size accounting for one landed surface replacement. */
interface PrunedEntry {
  /** Full-fidelity tool-result event shadowed by the replacement. */
  readonly originalSeq: number
  /** Newly appended pruned tool-result event. */
  readonly replacementSeq: number
  /** Tool call shared by the original and replacement. */
  readonly callId: CallId
  /** Original text size in Unicode code points. */
  readonly charsBefore: number
  /** Replacement text size in Unicode code points. */
  readonly charsAfter: number
}
```

```ts type-equiv
/** Aggregate outcome of one stable-surface pruning pass. */
interface PruneResult {
  /** Replacements in the snapshotted surface order. */
  readonly pruned: readonly PrunedEntry[]
  /** Total Unicode code points removed across replacements. */
  readonly charsRemoved: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcompaction--compactionengine-abstract-seam"></a>

### `ctx.compaction` — `CompactionEngine` (abstract seam)

Abstract compaction service. Implementations own trigger policy, retention, and summarization, and may consume a separate measurement service. A successful run replaces the selected surface span with one summary node and prevents concurrent compaction of the same session. The replacement user message uses compactCheckpointSource with the transaction identity so consumers recognize and correlate it independently of the backend. Load one implementation per context as `ctx.compaction`.

```ts cordis-catalog
/**
 * Consider automatic compaction for one explicit trigger. Pressure policy
 * uses the latest durable routed request, while context-overflow policy may
 * force a useful balanced reduction even below the normal threshold. Return
 * `null` when no safe range can be compacted. A single oversized retained
 * unit or request envelope cannot be repaired through surface compaction.
 *
 * @param agent - agent context owning the session surface and routing options.
 * @param trigger - normal pressure or provider-confirmed context overflow.
 * @param signal - cancellation signal; model-backed implementations must forward it.
 * @returns the compaction result, or `null` if no compaction was needed.
 */
abstract compactIfNeeded( agent: CompactionAgentContext, trigger: CompactionTrigger, signal: AbortSignal, ): Promise<CompactionResult | null>

/**
 * Explicitly compact useful history even below automatic pressure thresholds.
 * Implementations synchronously start an idle task before any asynchronous
 * work, select a useful range without writing on a no-op, then
 * append a standalone `compaction/start` before summarization. That durable
 * marker is the compaction lock until one `compaction/end` attempt. Later waking
 * prompts remain accepted in FIFO order and start only after the optional
 * durability checkpoint and idle-task settlement. Context injected while the
 * summary runs may sit between the marker pair; only the selected span must
 * remain stable.
 *
 * @param agent - idle agent whose durable history should be compacted.
 * @param signal - cancellation scoped to this compaction request.
 * @param sourceCommandId - initiating command identity for a manual compaction.
 * @returns the compaction result, or `null` when no safe useful range exists.
 * @throws {@link ManualCompactionError} for expected busy, agent-cancellation,
 * changed-span, summarization/shrink, commit-stage, or persistence failures;
 * an aborted request preserves its exact abort reason. Failed attempts remain
 * visible in the log.
 */
abstract compactNow( agent: ManualCompactAgentContext, signal: AbortSignal, sourceCommandId?: CommandId, ): Promise<CompactionResult | null>

/**
 * Forcibly compact a range of surface nodes into a single summary node.
 * `start` and `end` name an inclusive span by surface position, not numeric seq
 * order; replacements can make visible seqs non-monotonic. Both edges must be
 * balanced so assistant tool calls remain paired with their results. A model-
 * backed implementation forwards cancellation and rejects active, missing,
 * reversed, or unbalanced ranges. The target session is `agent.session`.
 * Its replacement user message must use {@link compactCheckpointSource} with
 * the transaction's `CompactionId`.
 * Use {@link toolPairingBalancedBefore} and {@link toolPairingBalancedAfter}
 * for the edge checks.
 *
 * @param start - first surface seq, inclusive.
 * @param end - last surface seq, inclusive.
 * @param agent - context whose session is mutated and whose routing options guide summarization.
 * @param signal - optional cancellation; model-backed implementations must forward it.
 * @throws when compaction is active or the range is missing, reversed, or unbalanced.
 * @returns the appended event seqs, summary, replaced range, and token accounting.
 */
abstract compactRegion( start: number, end: number, agent: CompactionAgentContext, signal?: AbortSignal, ): Promise<CompactionResult>
```

Types: [CommandId](commands.md)

Source: [`packages/compaction/compaction/src/index.ts`](../../packages/compaction/compaction/src/index.ts)

<a id="ctxtoolresultpruner--toolresultpruner"></a>

### `ctx.toolResultPruner` — `ToolResultPruner`

Deterministic head/middle/tail pruning for current tool-result surface nodes.

```ts cordis-catalog
/**
 * Measure text content in Unicode code points; non-text blocks cost zero.
 * @param blocks - tool-result content to measure.
 * @returns total Unicode code points across text blocks.
 */
measureContent(blocks: readonly ContentBlock[]): number

/**
 * Replace an over-budget text middle while retaining rich-block order.
 * Text slicing is by Unicode code point, not UTF-16 code unit, so a retained
 * boundary cannot split a surrogate pair. Grapheme clusters may still split.
 * @param blocks - original tool-result content.
 * @returns pruned content, or `null` when the text is within budget.
 */
pruneContent(blocks: readonly ContentBlock[]): ContentBlock[] | null

/**
 * Prune every over-budget tool result from one stable current-surface snapshot.
 * Each replacement preserves the complete event data except for `content`,
 * cites the shadowed node so replay can recover the replacement input, and is
 * immediately preceded by a `compaction/prune` shadow-price event pricing the
 * shadowed node through the injected token meter, so pure consumers can
 * subtract it without per-node state.
 * @param session - session whose current surface is rewritten.
 * @returns landed replacements and aggregate Unicode-code-point savings.
 * @throws when the session rejects a replacement; replacements committed
 * earlier in the pass remain durable.
 */
pruneSession(session: Session): PruneResult
```

Types: [ContentBlock](llm-streaming.md) · [Session](session.md)

Source: [`packages/compaction/compaction-tool-result-pruner/src/index.ts`](../../packages/compaction/compaction-tool-result-pruner/src/index.ts)
<!-- END GENERATED cordis-surface -->

# Потоковая передача LLM

[English](llm-streaming.md) | [中文](llm-streaming.zh.md) | Русский

Типы диалога и потоковой передачи из [`packages/llm`](../../packages/llm/README.md): варианты `Message`/`ContentBlock`, общие для каждого запроса и долговечной истории, полностью собранный запрос к модели, сырой протокол `StreamChunk`, контракт адаптера, который обязан реализовать каждый адаптер, и общий сборщик. [Основные пакеты](core.ru.md) хранят эти значения и журналируют их на каждом ходу; эта страница объявляет их.

Источник: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="content-blocks-and-messages"></a>

## Блоки содержимого и сообщения

Диалог — это `Message`; сообщение — массив типизированных **блоков содержимого**. Объединение блоков выводится из `ContentBlockMap`.

Источник: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

```ts type-equiv
/**
 * Merge-extensible content blocks keyed by `type`. New core blocks must land
 * with adapter, UI, and compaction support.
 */
interface ContentBlockMap {
  'text': TextBlock
  'reasoning': ReasoningBlock
  'image': ImageBlock
  'tool-call': ToolCallBlock
  'tool-result': ToolResultBlock
}
```

Интерфейсы блоков (полные поля — в исходнике): `TextBlock` (`text`), `ReasoningBlock` (рассуждение, отдельное от видимого текста), `ImageBlock` (долговечное [вложение-изображение](attachment.md)), `ToolCallBlock` (`id: CallId`, `name`, аргументы `arguments` в виде сырого JSON) и `ToolResultBlock` (`toolCallId`, вложенный `content: ContentBlock[]`, `isError?`). `ContentBlock = ContentBlockMap[ContentBlockType]`. Новая модальность попадает в расширяемую слиянием карту только тогда, когда её поддерживают пути адаптера, UI, компакции и долговечного воспроизведения.

Источник: [`packages/llm/llm/src/message.ts`](../../packages/llm/llm/src/message.ts)

`Message` — одно идентифицированное неизменяемое значение «роль/источник/содержимое». Сообщения ассистента, порождённые моделью, называют провайдера и модель, которые их создали, и несут в своём источнике опциональные приватные для адаптера данные воспроизведения:

```ts type-equiv
/** Provider/model identity and adapter-private replay data for an assistant message. */
interface AssistantProvenance {
  /** Provider route that produced the message. */
  provider: string
  /** Provider model id that produced the message. */
  model: string
  /**
   * Lossless-JSON adapter state needed to replay the provider response.
   * `LlmRuntime` exposes it to a target adapter only when that adapter instance
   * currently owns both this historical provider and the target provider.
   */
  replayState?: unknown
}
```

```ts type-equiv
/** One immutable message representation shared by delivery, durable history, and model requests. */
interface Message {
  /** Stable identity preserved across every representation boundary. */
  readonly id: MessageId
  /** Provider-neutral conversation role. */
  readonly role: 'system' | 'user' | 'assistant'
  /** Exact model-facing blocks. */
  readonly content: ContentBlock[]
  /** Required source fields supplied by the producer. */
  readonly source: MessageSource
}
```

Происхождение сообщения — самостоятельный расширяемый слиянием sum-тип:

```ts type-equiv
/**
 * Where a message (or injected content) came from.
 * Merge-extensible sum type — plugins add their own `kind`s.
 */
interface MessageSourceMap {
  user: { kind: 'user' }
  plugin: { kind: 'plugin'; plugin: string } & ContextFormed
  model: ModelMessageSource
  tool: ToolMessageSource
}
```

Идентичность производителя и форма представления независимы. `kind` отвечает на вопрос *кто это произвёл*; опциональный `form` — на вопрос *что это за информация*, а потребители решают, как её показать. Несколько производителей могут делить одну форму, а один производитель может выдать более одной формы за сессию. Значения семантичны и пополняются по одному; отсутствующее или нераспознанное значение использует задокументированное значение по умолчанию и показывается как непрозрачное содержимое:

```ts type-equiv
/**
 * The kind of information in producer-supplied context, declared by the
 * producer beside its provenance.
 *
 * `MessageSource.kind` answers *who produced this*; `form` answers *what kind
 * of thing it is*, and the two axes are deliberately independent — several
 * producers share one form, and one producer may emit more than one form over
 * a session.
 *
 * The vocabulary is SEMANTIC, never visual: a value states that the content is
 * a file's instructions or a catalog of available items, and a consumer decides
 * what that looks like. Colors, icons, ordering, and collapse defaults are the
 * consumer's business and must not enter this union. It grows one value at a
 * time as producers gain the structured fields their form needs; an absent or
 * unknown value is the documented default, presented as opaque content.
 */
type ContextForm =
  /** Instructions read out of workspace files the model is expected to follow. */
  | 'instructions'
  /** A catalog of items available in this session, republished as it changes. */
  | 'catalog'
  /** Current state, where a later snapshot from the same producer supersedes an earlier one. */
  | 'snapshot'
  /** A one-off account of something that just happened; it supersedes nothing. */
  | 'notice'
  /** A message another agent addressed to this one. */
  | 'relay'
  /** Material lifted out of another session's log, possibly reduced on the way in. */
  | 'recall'
```

```ts type-equiv
/** One named contribution to a `snapshot`-form context, in assembly order. */
interface ContextSnapshotSection {
  /** The contributing subsystem's name. */
  readonly name: string
  /** That contribution's model-facing text, exactly as assembled. */
  readonly text: string
}
```

```ts type-equiv
/**
 * Producer-declared {@link ContextForm} and the fields that form requires,
 * mixed into the source types that carry one.
 *
 * Discriminated by `form` so a producer cannot select a form without the
 * fields needed to present it: a `notice` must record its one-line
 * account, a `snapshot` its sections. Omitting `form` stays valid — an
 * undeclared context is the documented default.
 */
type ContextFormed =
  | { readonly form?: never }
  | { readonly form: 'instructions' }
  | { readonly form: 'catalog' }
  | {
    readonly form: 'snapshot'
    /** The named contributions this snapshot assembled, in order. */
    readonly sections: readonly ContextSnapshotSection[]
  }
  | {
    readonly form: 'notice'
    /** One-line account of what happened, shown without expanding the row. */
    readonly summary: string
  }
  | { readonly form: 'relay' }
  | { readonly form: 'recall' }
```

<a id="streamchunk--the-raw-protocol"></a>

## `StreamChunk` — сырой протокол

Потоковый ответ чередует несколько типизированных блоков (текст, рассуждение, несколько вызовов инструментов). `index` привязывает каждую дельту к своему блоку; `block-end` несёт полностью собранный `ContentBlock`, чтобы потребителям не пришлось собирать дельты заново самим. Это **закрытое** размеченное объединение — `switch` по `type` заканчивается `assertNever`, поэтому добавление варианта ломает компиляцию у каждого потребителя, который обязан его обрабатывать.

```ts type-equiv
/**
 * Adapter-private lossless-JSON state for replaying a successful response,
 * carried by a terminal `finish` chunk and stored on the assembled assistant
 * message's model source. Both halves stay opaque to the harness; only the
 * split is shared vocabulary, so assembly can keep stored metadata aligned
 * with stored content without reading either half.
 */
interface ReplayEnvelope {
  /** Response-level adapter-private metadata (ids, native stop reason). */
  response: unknown
  /**
   * Per-block adapter-private metadata, one entry per emitted block in
   * first-seen stream order. When assembly drops a block it drops the entry at
   * the same position; entries whose length does not match the emitted block
   * count discard the whole envelope. An adapter whose metadata is independent
   * of block structure omits this field and the envelope passes through
   * assembly unchanged.
   */
  blocks?: readonly unknown[]
}
```

```ts type-equiv
/**
 * Raw streaming protocol emitted by adapters.
 * Block indexes correlate interleaved deltas, and `block-end` carries the
 * assembled block. Adapters emit usage before the terminal finish and nothing
 * afterward; tool arguments remain raw JSON strings. An adapter implementation
 * may throw, but `LlmRuntime.stream()` normalizes that failure to a terminal
 * `error` or `aborted` finish before exposing it to consumers.
 */
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: CallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | {
    type: 'finish'
    reason: FinishReason
    /** Replay metadata for a successful response; see {@link ReplayEnvelope}. */
    replayState?: ReplayEnvelope
  }
```

## `LlmFailure`

Каждый выброшенный или переданный в самом потоке (in-band) финальный сбой адаптера нормализуется к одному сериализуемому представлению, независимому от провайдера. `providerRetryAfterMs` — провалидированная положительная задержка, запрошенная провайдером, а не решение о повторе; `ProviderRequestId` — непрозрачная брендированная строка для диагностики.

```ts type-equiv
/** Serializable provider or transport failure facts; policy decides whether they are retryable. */
interface LlmFailure {
  /** Human-readable provider or transport failure. */
  readonly message: string
  /** Stable provider-neutral machine-routing code. */
  readonly code: string
  /** HTTP status returned by the provider, when available. */
  readonly status?: number
  /** Provider-requested delay in milliseconds, when valid and available. */
  readonly providerRetryAfterMs?: number
  /** Opaque provider-issued request identifier for diagnostics. */
  readonly requestId?: ProviderRequestId
}
```

## Контракт адаптера

Каждый адаптер **ДОЛЖЕН** соблюдать эти правила, и каждый потребитель может на них полагаться:

- **`usage` до `finish`, ничего после `finish`.** Оба события привязываются к маркеру конца потока провайдера, чтобы завершающий чанк с одним лишь usage не мог нарушить порядок.
- **Аргументы `arguments` вызова инструмента остаются сырыми JSON-строками на всём пути.** Частичные фрагменты передаются потоком через `argumentsDelta`; провайдер, возвращающий распарсенные объекты, снова сериализует их в JSON на `block-end`.
- **Два санкционированных пути ошибки, один тип `LlmFailure`.** Сбой может либо ВЫБРОСИТЬСЯ из `stream()` (транспортные/протокольные ошибки), **либо** завершить поток через `finish {kind:'error'|'aborted', failure}` (передаваемые провайдером in-band ошибки — для адаптеров, которые не могут бросить исключение посреди стрима). `LlmError.failure` несёт тот же `LlmFailure`. После того как вызов выбрал свой адаптер, стрим сохраняет точный выброшенный объект `Error` и связывает с этим вызовом неизменяемые факты плюс неизменяемую политику повторов обслуживающей регистрации; agent-loop закрывает неудавшийся шаг и предлагает ошибку, факты, неизменяемые факты о уже выполненных повторах, обслуживающую политику и сигнал хода обработчику `agent/request-error`. Взявший обработку на себя слушатель возвращает `{ kind: 'retry' }` после выполненного им восстановления; без восстановления структурированный сбой становится ошибкой хода, и для этой попытки не фиксируются ни обычное сообщение ассистента, ни побочные эффекты инструментов.
- **Один вызов адаптера — одна попытка обращения к провайдеру.** Адаптеры отключают библиотечные повторы. Восстановление на уровне агента открывает другой долговечный нумерованный ход; вызывающие `ctx.llm.stream()` напрямую по-прежнему выполняют ровно одну попытку.
- **Зависания провайдера ограничены на транспортном уровне.** Оба поставляемых удалённых адаптера выставляют положительный конечный `streamIdleTimeoutMs` со значением по умолчанию в пять минут. Сторожевой таймер взводится, только пока ожидается очередной `next()` итератора, использует один стабильный сигнал отмены на весь запрос, отображает собственное истечение в `TIMEOUT` и сохраняет более раннюю отмену вызывающего как `ABORTED`.
- **Переполнение контекста имеет один канонический код.** Оба адаптера DeepSeek классифицируют явные сведения от провайдера через `isContextWindowExceededError()` и выдают `CONTEXT_WINDOW_EXCEEDED` — независимо от того, приходит ли сбой выброшенным HTTP `LlmError` или ошибкой in-band finish. Потребители маршрутизируют по коду, никогда по тексту провайдера.
- **Пустое завершение — повторяемая ошибка, а не молчаливый успех.** Оба адаптера отображают финальный финиш `stop`, не принёсший ни одного блока содержимого, в `finish {kind:'error'}` с каноническим кодом `EMPTY_RESPONSE`, и `dsh-llm-retry` по умолчанию повторяет его; см. [empty model responses are retryable](../../.agents/notes/implemented/bug-fix/2026-07-24-empty-model-response-is-retryable.md).
- **Каждый HTTP-запрос к провайдеру несёт заголовок атрибуции приложения.** Адаптеры отправляют `attributionHeaders()` (ниже) — базовый `User-Agent` — и доказывают это тестом на уровне сетевого запроса.
- **Состояние воспроизведения принадлежит адаптеру; его разделение — общий словарь.** Успешный `finish` может нести `ReplayEnvelope`: непрозрачные метаданные уровня ответа плюс опциональные погрупповые записи, выровненные с последовательностью выданных блоков. Это выравнивание — общий словарь harness: когда сборка отбрасывает блок, она отбрасывает запись на той же позиции, поэтому сохранённые метаданные всегда описывают сохранённое содержимое. Цикл хранит усечённый конверт вместе с собранным сообщением ассистента. При последующем запросе `LlmRuntime` передаёт состояние, только если исторический и целевой провайдеры в данный момент зарегистрированы за одним и тем же экземпляром адаптера. Этот адаптер валидирует состояние и владеет любым преобразованием между моделями или провайдерами; другие адаптеры получают независимое от провайдера содержимое плюс поля provider/model без приватного состояния. Долговечное содержимое остаётся авторитетным: сохранённое состояние, которое читающий адаптер не может использовать, понижает это одно сообщение до независимого от провайдера преобразования с диагностикой, а не приводит к отказу запроса.

## `ResolvedRetryPolicy`

Конфигурация повторов разрешается до регистрации маршрута в неизменяемое размеченное объединение. Обычный режим несёт `mode: 'normal'`, конечный `maxRetries`, `retryableCodes` и обязательные `initialDelayMs`, `maxDelayMs` и `jitterRatio`; режим always несёт `mode: 'always'` и те же обязательные поля задержки без конечного максимума. Пропуск политики провайдера использует обычное значение по умолчанию — пять повторов. Наслоённые настройки могут сохранить обычные `maxRetries` или `retryableCodes` после переключения в режим always; резолвер игнорирует эти неактивные поля и фиксирует чистую политику always. `LlmRuntime.providerRetryPolicy(provider)` возвращает зарегистрированное значение, а `llmRetryPolicyOf(stream)` — значение, зафиксированное обслуживающей регистрацией после того, как вызов её выбрал, поэтому последующее освобождение или замена маршрута не могут изменить политику восстановления уже выполняющегося сбоя. [Сгенерированный каталог конфигурации](../config-catalog.md) перечисляет опциональные входные поля.

## `AppIdentity` — атрибуция приложения

Статическая публичная идентичность приложения, которую каждый адаптер отправляет провайдерам ([`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)). `attributionHeaders(identity?)` отображает её только в стандартный заголовок `User-Agent`; специфичные для OpenRouter заголовки атрибуции приложения этот контракт сознательно не поддерживает. `APP_IDENTITY` по умолчанию берёт версию из манифеста пакета; каждое поле — публичный факт о продукте: никаких секретов, путей, идентификаторов сессий или пользовательских идентификаторов, и ничто в рамках отдельного запроса не может влиять на эти значения. Обоснование: [Mandatory `User-Agent` attribution](../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md).

```ts type-equiv
/**
 * Static public application identity sent to LLM providers.
 *
 * Every field is a public product fact, safe on every request: no secrets,
 * local paths, session ids, prompt text, or per-user identifiers belong here,
 * and nothing per-request may influence the values.
 */
interface AppIdentity {
  /** `User-Agent` product token (lowercase, hyphenated). */
  product: string
  /** Product version; sourced from package metadata, never hand-copied. */
  version: string
  /** Repository home URL of the app, used as the `User-Agent` comment. */
  url: string
}
```

## `TokenUsage`

Учёт токенов на вызов. Счётчики **непересекающиеся**: `inputTokens` — только некэшированный ввод; кэшированный ввод сообщается отдельно, а оплачиваемый ввод — сумма трёх. Адаптеры, чьи провайдеры складывают попадания в кэш в один суммарный счётчик промпта (`prompt_tokens` у DeepSeek), вычитают их обратно. `reasoningTokens`, когда присутствует, — информационная деталь, уже включённая в `outputTokens`; итоги не должны прибавлять её второй раз.

```ts type-equiv
/**
 * Token accounting for one model call (cache fields are optional).
 *
 * Counts are DISJOINT: `inputTokens` is uncached input only; cached input is
 * reported separately as `cacheReadTokens`/`cacheWriteTokens` (billed input =
 * sum of the three). Adapters whose providers fold cache hits into a total
 * prompt count (DeepSeek's `prompt_tokens`) subtract them out.
 */
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}
```

## `BlockAssembler`

`BlockAssembler` ([`packages/llm/llm/src/assembler.ts`](../../packages/llm/llm/src/assembler.ts)) — единственная общая реализация, сворачивающая поток `StreamChunk` обратно в `ContentBlock`, usage, причину завершения и состояние воспроизведения. Цикл журналирует сырые чанки, пропуская те же чанки через сборщик, затем сохраняет собранное содержимое ассистента вместе с породившими его провайдером и моделью. Потребитель, которому нужен собранный результат без переизобретания свёртки, использует именно его.

Одно решение «оставить/отбросить» покрывает содержимое и метаданные вместе: финиш `max-tokens` отбрасывает каждый вызов инструмента, поскольку усечённый вызов небезопасно исполнять, и то же решение удаляет погрупповую запись конверта воспроизведения на каждой отброшенной позиции. Поэтому `blocks()` и `replayState` не могут разойтись, что бы ни убрала сборка.

```ts public-api
/**
 * Incrementally assembles raw {@link StreamChunk}s into complete
 * {@link ContentBlock}s and a final assistant {@link Message}.
 *
 * The agent loop feeds it while logging raw chunks for replay fidelity, then
 * reads `blocks()` / `message()` / `usage` / `finish` once the stream ends,
 * or `interruptedBlocks()` when cancellation cut the stream short.
 *
 * Tolerant of delta-only protocols (no block-start/end); deltas arriving for
 * an index already closed by `block-end` are ignored (malformed stream) so a
 * misbehaving adapter cannot grow memory or corrupt a completed block.
 */
declare class BlockAssembler {
  /**
   * Feed one chunk into the assembly state.
   * @param chunk - the next raw chunk, in stream order.
   */
  push(chunk: StreamChunk): void;
  /**
   * Assemble all blocks seen so far, in stream order.
   * @returns one block per seen index, except that max-token truncation drops
   *   tool calls that cannot be executed safely; an open block assembles from
   *   its accumulated deltas (an unknown block type never closed by `block-end` throws).
   */
  blocks(): ContentBlock[];
  /**
   * Assemble the prefix an interrupted stream can safely finalize: closed and
   * open text/reasoning blocks with non-whitespace content, in stream order.
   * Tool calls are omitted because interruption precedes dispatch; retaining
   * one would require a fabricated result. Open unknown blocks are also omitted.
   * @returns the kept blocks; empty when nothing streamed before the interruption.
   */
  interruptedBlocks(): ContentBlock[];
  /** Usage from the `usage` chunk; undefined until one arrives. */
  get usage(): TokenUsage | undefined;
  /** Finish reason from the `finish` chunk; `{kind: 'stop'}` when the stream ended without one. */
  get finish(): FinishReason;
  /**
   * Replay metadata from the terminal finish chunk, if any, with per-block
   * entries pruned in step with {@link blocks}. Undefined when the envelope's
   * entries do not align with the emitted blocks.
   */
  get replayState(): ReplayEnvelope | undefined;
  /**
   * The assembled assistant message.
   * @param source - producer attribution for the assembled message.
   * @returns a frozen assistant-role message over `blocks()` (same open-block assembly rules).
   */
  message(source: MessageSource = { kind: 'plugin', plugin: 'dsh-llm/assembler' }): Message;
}
```

<a id="the-model-request-and-result"></a>

## Запрос к модели

Один вызов модели — полностью собранный `GenerateOptions`. Адаптер отвечает сырым потоком [`StreamChunk`](#streamchunk--the-raw-protocol); потребитель собирает его с помощью [`BlockAssembler`](#blockassembler).

Источник: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

Обнаружение провайдеров и моделей использует небольшие независимые от провайдера дескрипторы. Каталог моделей носит рекомендательный характер: маршрутизация по-прежнему ключуется на зарегистрированном провайдере, и адаптер может принимать не внесённые в каталог id моделей.

Регистрация адаптера возвращает дескриптор: функцию освобождения ресурсов плюс атомарную замену маршрутов, нужную плагину с настраиваемым пользователем набором маршрутов.

```ts type-equiv
/**
 * What {@link LlmRuntime.registerAdapter} returns: the disposer, plus an
 * atomic route replacement for the same adapter instance.
 */
interface AdapterRegistrationHandle {
  /** Release every route this registration currently holds. */
  (): void
  /**
   * Replace this registration's routes with `providers`, keeping the same
   * adapter instance. The candidate set is validated in full first — a
   * conflict with another adapter, an invalid name, or bad provider metadata
   * throws and leaves the current routes untouched — and the swap itself is
   * one synchronous section, so no request can observe a gap. An empty array
   * is legal here (a settings section that emptied holds zero routes while
   * staying registered), unlike an empty initial registration.
   *
   * Throws `LlmError` with code `REGISTRATION_DISPOSED` once the registration
   * has been released: its routes are gone and its disposer has already run,
   * so anything registered afterwards would have no owner left to release it.
   * @param providers - the complete next route set for this registration.
   */
  replace(providers: string[]): void
}
```

```ts type-equiv
/** Display metadata for one registered provider route. */
interface LlmProviderInfo {
  /** Provider route key used by {@link GenerateOptions.provider}. */
  id: string
  /** Human-readable provider name for selectors and diagnostics. */
  name: string
}
```

Плагины-адаптеры дополнительно объявляют, какие маршруты *могли бы* работать, через `registerConfigurableProviders()`, адресуя секцию пользовательских настроек каждого, чтобы поверхности конфигурации могли предлагать спящие провайдеры до регистрации какого-либо маршрута.

```ts type-equiv
/**
 * One provider route an adapter plugin can activate through configuration,
 * whether or not the route is currently registered. Configuration surfaces
 * merge this directory with `listProviders()` to offer every configurable
 * provider alongside its live/dormant state.
 */
interface LlmConfigurableProvider {
  /** Provider route key this entry activates when configured. */
  provider: string
  /** Human-readable provider name for configuration surfaces. */
  displayName: string
  /** User-settings namespace whose section configures this provider. */
  settingsNs: string
  /**
   * Path from that namespace's section root to this provider's profile
   * object; empty when the whole section is the profile.
   */
  settingsPath: readonly string[]
  /**
   * Whether the owning adapter knows this route only because configuration
   * declared it — a gateway or self-hosted server it ships nothing about.
   * Absent means the adapter draws no such distinction; false means it does
   * and this route is one of its own. Only the adapter can answer: a stored
   * profile is how a user-added route AND a corrected shipped one both look
   * from outside.
   */
  declared?: boolean
}
```

```ts type-equiv
/** One adapter-discovered model; catalog membership is advisory, not request validation. */
interface LlmModelInfo {
  /** Provider route that owns this model entry. */
  provider: string
  /** Model id passed to {@link GenerateOptions.model}. */
  id: string
  /** Human-readable model name for selectors. */
  name: string
  /** Optional user-facing distinction from otherwise similar models. */
  description?: string
  /** Accepted request modalities; absent means unknown, while an explicit omission is negative capability. */
  inputModalities?: readonly ModelModality[]
}
```

Метаданные, влияющие на корректность, разрешаются отдельно от рекомендательного каталога и принадлежат адаптеру, обслуживающему точный маршрут. Ёмкость контекста, значения вызова по умолчанию от адаптера и выбор рассуждения делят один результат разрешения точной модели, чтобы потребители не повторяли авторитетное разрешение модели.

```ts type-equiv
/** Provider-owned context capacity for one exact provider/model route. */
interface LlmModelContext {
  /** Maximum combined request and response context in tokens. */
  contextWindow: number
}
```

Усилие рассуждения — ещё одна возможность точного маршрута. Ядро брендирует идентификаторы, но не перечисляет их значения; каждый адаптер владеет упорядоченным набором, отображаемыми именами и опциональным значением развёртывания по умолчанию.

```ts type-equiv
/** Adapter-owned identifier for one model's selectable reasoning effort. */
type ReasoningEffortId = Branded<'ReasoningEffortId'>
```

```ts type-equiv
/** Display metadata for one adapter-owned reasoning effort. */
interface LlmReasoningEffortInfo {
  /** Opaque stable value accepted by {@link GenerateOptions.reasoningEffort}. */
  id: ReasoningEffortId
  /** Human-readable effort name for selectors and diagnostics. */
  name: string
  /** Optional user-facing distinction from otherwise similar efforts. */
  description?: string
}
```

```ts type-equiv
/** Selectable reasoning efforts for one exact provider/model route. */
interface LlmModelReasoningInfo {
  /** Supported efforts in adapter-preferred display order. */
  efforts: readonly LlmReasoningEffortInfo[]
  /**
   * Adapter-configured default materialized into requests when callers omit
   * an effort. Absence preserves the provider's own default.
   */
  defaultEffort?: ReasoningEffortId
}
```

```ts type-equiv
/** Exact-route model metadata resolved by its owning adapter. */
interface LlmResolvedModelInfo extends LlmModelInfo {
  /** Provider-owned context capacity when known. */
  context?: LlmModelContext
  /** Adapter-configured per-request output cap materialized when callers omit one. */
  defaultMaxTokens?: number
  /** Adapter-owned selectable reasoning levels when exposed. */
  reasoning?: LlmModelReasoningInfo
}
```

```ts type-equiv
/** A single model request, fully assembled. */
interface GenerateOptions {
  /** Registered provider route selecting the adapter instance. */
  provider: string
  model: string
  /** Adapter-owned reasoning effort selected for this exact model. */
  reasoningEffort?: ReasoningEffortId
  /**
   * Ordered conversation messages, exactly as the provider sees them (after
   * the `system` slot). A loop-built request assembles them as
   * the derived history (dsh-agent-loop); a hand-built one-shot passes any list.
   */
  messages: Message[]
  /** System prompt text (adapters map to the provider's system slot). */
  system?: string
  /** Tool schemas (adapters map to the provider's `tools` field). */
  tools?: ToolSchema[]
  temperature?: number
  maxTokens?: number
  /**
   * Stop sequences: generation halts as soon as the model produces any one of
   * these strings (adapters map to the provider's stop field, e.g. OpenAI
   * `stop`). The stop string itself is not included in the output.
   */
  stop?: string[]
  signal?: AbortSignal
  /**
   * Session identity stamped by the loop for request routing. Replay uses it
   * to separate cursors; adapters may map it to model-hidden transport metadata.
   */
  sessionId?: Branded<'SessionId'>
  /**
   * Provider-neutral classification for an auxiliary model call. Adapters may
   * map the purpose to model-hidden transport metadata or purpose-specific
   * generation policy. Ordinary conversation requests leave it unset.
   */
  purpose?: 'compaction' | 'session-title'
}
```

Почему ответ модели остановился — расширяемая слиянием причина. Финальные сбои провайдера несут [`LlmFailure`](#llmfailure) из контракта потоковой передачи:

```ts type-equiv
/**
 * Why a model response stopped.
 * Merge-extensible so adapters can surface provider-specific reasons.
 */
interface FinishReasonMap {
  'stop': { kind: 'stop' }
  'tool-calls': { kind: 'tool-calls' }
  'max-tokens': { kind: 'max-tokens' }
  'aborted': { kind: 'aborted'; failure: LlmFailure }
  'error': { kind: 'error'; failure: LlmFailure }
}
```

`FinishReason = FinishReasonMap[keyof FinishReasonMap]`. `TokenUsage` (учёт на вызов с непересекающимися полями кэша) подробно описан [ниже](#tokenusage).

`GenerateOptions.tools` несёт `ToolSchema` — JSON-Schema-описание инструмента в том виде, в каком оно отправляется модели. Он объявлен в dsh-llm (а не dsh-tools) именно потому, что является частью запроса, который цикл собирает на каждом шаге:

```ts type-equiv
/**
 * JSON-schema description of a tool, as sent to the model.
 *
 * Declared here (not in dsh-tools) because it is part of {@link GenerateOptions};
 * dsh-tools' ToolDefinition and dsh-system-prompt's PromptAssembly both import
 * it from this package.
 */
interface ToolSchema {
  name: string
  description: string
  /** JSON Schema object for the arguments. */
  parameters: Record<string, unknown>
}
```

`ToolSchema`, обращённый к модели, — тип, передаваемый по протоколу; регистрируемая `ToolDefinition`, которая его создаёт (схема + `execute`), находится в [tools.ru.md](tools.ru.md).

Провайдер, который поверхность ещё только набирает в черновике, не имеет ни маршрута, ни каталога, поэтому опрос описан отдельно: запрос несёт черновик, редактируемый пользователем, а ответ — кандидаты, которые поверхность может принять, а не каталог, который она обязана обслуживать.

```ts type-equiv
/**
 * One interrogation of a provider endpoint that configuration has not stored
 * yet. Configuration surfaces send the draft a user is still editing, so the
 * request carries the endpoint and credential directly instead of naming a
 * route: a provider being added has no route to name.
 */
interface LlmModelDiscoveryRequest {
  /**
   * Route the draft is editing, when it edits an existing one. A route whose
   * adapter already knows its models answers from that knowledge instead of
   * asking the endpoint — the adapter's own registry is the better answer, and
   * it costs no network call.
   */
  provider?: string
  /**
   * Endpoint to interrogate. Optional because a route the adapter already
   * describes needs none; a route it does not must supply one.
   */
  baseURL?: string
  /** Wire protocol the endpoint speaks, when the draft names one. */
  api?: string
  /** Credential for this interrogation alone; the harness never stores it. */
  apiKey?: string
  /** Caller cancellation; implementations must settle promptly after it aborts. */
  signal?: AbortSignal
}
```

```ts type-equiv
/**
 * One model an endpoint reports about itself. Every field but the id is
 * optional because most provider listings disclose an id and nothing else;
 * a surface adopting one of these still owes the capacities its adapter needs.
 */
interface LlmDiscoveredModel {
  /** Model id the endpoint accepts. */
  id: string
  /** Human-readable name when the endpoint supplies one. */
  name?: string
  /** Maximum combined request and response context, when disclosed. */
  contextWindow?: number
  /** Maximum output tokens, when disclosed. */
  maxTokens?: number
}
```

### Конверт запроса: `LlmCallConfig` и журналируемый заголовок

Цикл строит каждый запрос из журналируемого состояния. `EpochHeader` записывает конфигурацию вызова, помечает поля, подставленные значениями адаптера по умолчанию, и фиксирует отрисованный промпт и авторитетный порядок возврата инструментов (настраивается `toolOrder`, при отсутствии — лексикографический) полными снапшотами `request/header`. Вместе с производной историей это делает запрос реконструируемым из журнала сессии. См. [session.ru.md](session.ru.md#the-request-header-event-requestheader) и [Agent Note о реконструируемости](../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md).

`agent/request` получает замороженный сид конфигурации вызова и может вернуть замену, чтобы сменить провайдера, модель, усилие рассуждения или сэмплинг. До каскада цикл убирает значения, помеченные как значения адаптера по умолчанию, чтобы подготовка точной модели материализовала актуальные значения выбранного маршрута; непомеченные явные настройки остаются в предложении. После каскада подготовка отклоняет неподдерживаемые явно указанные id усилий без подгонки и журналирует эффективную конфигурацию плюс поля, подставленные значениями адаптера по умолчанию, под сигналом хода. Подготовленный вызов сохраняет одну регистрацию адаптера до самой диспетчеризации. Запросы, доходящие до `llm/stream`, глубоко заморожены, поэтому мутация бросает исключение, и несут локальный для процесса идентификатор цикла, чтобы наблюдатели не путали отдельно журналируемые замороженные вспомогательные вызовы с диалоговыми запросами.

По сети запрос, построенный циклом, читает slot `system` (отрисованную сборку промпта), за которым следует производная история. Журналируемый снапшот запроса заканчивается новейшим `user/message` на первом шаге хода и результатами инструментов предыдущего шага на последующих шагах. Инвариант разработки пересчитывает ровно это равенство для каждого запроса, построенного циклом.

FIXME(call-config-shape): пересмотреть, какие из оставшихся полей действительно относятся к уровню эпохи ради кэша (`model` и принадлежащее модели усилие рассуждения указаны явно; скаляры сэмплинга лежат здесь из предосторожности).

```ts type-equiv
/**
 * Provider, model, reasoning effort, and sampling scalars of one conversation's
 * requests. Every field maps 1:1 onto the same-named `GenerateOptions` field;
 * the loop builds requests from the logged header rather than accepting these
 * per call.
 */
interface LlmCallConfig {
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
  temperature?: number
  maxTokens?: number
  stop?: string[]
}
```

```ts type-equiv
/**
 * Effective config fields supplied by exact-model adapter resolution rather
 * than by the caller's request proposal.
 */
interface LlmCallConfigAdapterDefaults {
  reasoningEffort?: true
  maxTokens?: true
}
```

## Контракты сервиса и провайдера

`LlmAdapter` — контракт провайдера: наследуйте, реализуйте `stream()` и зарегистрируйте один экземпляр адаптера через `ctx.llm.registerAdapter(providers, adapter)`. `GenerateOptions.provider` выбирает зарегистрированный адаптер; `GenerateOptions.model` передаётся этому адаптеру и не обязан быть зарегистрированным к старту жизненного цикла. Дублирующиеся маршруты провайдеров приводят к атомарному отказу. Опциональный `providerRetryPolicy()` фиксируется на маршрут с обычными значениями по умолчанию, а `providerInfo()` и асинхронный `listModels()` питают `LlmRuntime.listProviders()` / `listModels()` отсоединёнными метаданными для селекторов. Этот каталог рекомендательный, а не белый список запросов: адаптер остаётся авторитетным и может принимать не внесённые в каталог id моделей. Один асинхронный запрос `resolveModel()` возвращает точную идентичность модели плюс опциональную влияющую на корректность ёмкость контекста, настроенный адаптером `defaultMaxTokens` и упорядоченные принадлежащие модели id рассуждений с опциональным значением развёртывания по умолчанию; отсутствующие поля означают недоступные метаданные или поведение, принадлежащее провайдеру, а не неверное членство в каталоге. Резолвер получает опциональную отмену и обязан завершиться вскоре после срабатывания abort. `LlmRuntime.resolveModelInfo()` валидирует и отсоединяет агрегат. На финальной границе адаптера `resolveCallConfig()` материализует выходное значение по умолчанию, только если `maxTokens` отсутствует, а также валидирует и материализует рассуждение, так что прямые вызовы не могут обойти ни одно из настроенных поведений; прямая диспетчеризация фиксирует одну регистрацию до ожидания этого разрешения. Agent-loop вместо этого использует `prepareCall()`, чтобы сохранять одну регистрацию сквозь разрешение модели, долговечное журналирование заголовка и диспетчеризацию, удерживать отсоединённые метаданные контекста из того же точного запроса и сообщать, какие поля конфигурации адаптер подставил по умолчанию. Поиск адаптера происходит в терминальном продолжении каскада `llm/stream`, поэтому слушатель может сократить вызов или направить изменяемый одноразовый запрос до поиска. AgentLoop наблюдает попытку запроса, как только внешний каскад вернул дескриптор потока; эта ограниченная граница не доказывает, что ленивый терминальный адаптер был сконструирован или начал сетевой ввод-вывод к провайдеру. Корреляция `index` между `block-start` / `block-end` вместе со сборщиком означает, что адаптеру достаточно выдавать корректно сформированные чанки — пересборка блоков не входит в задачи каждого адаптера. [architecture.md](../architecture.ru.md#поток-хода) показывает, где `ctx.llm.stream()` и каскад `llm/stream` находятся внутри одного хода.

```ts type-equiv
/** One model call whose config and adapter registration were resolved together. */
interface PreparedLlmCall {
  /** Detached, deep-frozen config with any adapter-owned default materialized. */
  readonly config: LlmCallConfig
  /** Immutable retry policy captured with the adapter registration. */
  readonly retryPolicy: ResolvedRetryPolicy
  /** Detached context metadata resolved with the registration-bound call. */
  readonly context?: LlmModelContext
  /** Exact model modalities captured with the adapter dispatch generation. */
  readonly inputModalities?: readonly ModelModality[]
  /** Config fields materialized by the captured adapter rather than proposed by the caller. */
  readonly adapterDefaults: LlmCallConfigAdapterDefaults
  /**
   * Dispatch this call once through the registration captured during
   * preparation. The request's call-config fields must match {@link config};
   * reuse or mismatch fails with `INVALID_PREPARED_CALL`.
   * @param options - fully assembled request carrying the prepared config.
   * @returns the chunk stream, including the `llm/stream` waterfall.
   */
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
```

```ts public-api
/**
 * Provider-wire adapter for the harness message and stream vocabulary. Register implementations
 * with `ctx.llm.registerAdapter(providers, adapter)`. Every provider HTTP request must include
 * `attributionHeaders()`; prove the headers are added in the wire request or library header hook. The direct-fetch
 * DeepSeek and library-backed pi-ai adapters meet this contract through different internals.
 */
declare abstract class LlmAdapter {
  /**
   * Describe one provider route owned by this adapter.
   * @param provider - a route passed to `registerAdapter()` for this instance.
   * @returns detached display metadata whose id must equal `provider`.
   */
  providerInfo(provider: string): LlmProviderInfo;
  /**
   * Return the provider-owned retry policy captured with this route.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @returns a resolved policy, or `undefined` to use the normal defaults.
   */
  providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
  /**
   * List models this adapter can currently advertise for one owned provider.
   * The result is advisory: an adapter may accept unlisted model ids, and
   * consumers must not turn absence into request rejection.
   * @param _provider - one provider route owned by this adapter.
   * @returns discoverable models in adapter-preferred order.
   */
  listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
  /**
   * Resolve all metadata available for one exact model. This query is
   * independent of the advisory catalog and does not validate request routing.
   * @param provider - one provider route owned by this adapter.
   * @param model - exact model id passed to {@link GenerateOptions.model}.
   * @param _signal - cancellation for this exact-model lookup; asynchronous
   *   implementations must settle promptly after it aborts.
   * @returns provider/model identity plus any context, call-default, and reasoning metadata.
   */
  resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo>;
  /**
   * Bind exact model metadata and the eventual request dispatch to one adapter generation.
   * Dynamic adapters override this so settings changes between preparation and
   * dispatch cannot combine one generation's capabilities with another's endpoint.
   * @param provider - registered provider route.
   * @param model - exact model id.
   * @param signal - cancellation for model resolution.
   * @returns model metadata and a one-generation stream entry point.
   */
  async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
  /**
   * Stream one model call as raw chunks. The only required method.
   * @param options - the fully-assembled request; implementations must honor `options.signal`.
   * @returns the chunk stream, obeying the adapter contract documented on `StreamChunk`.
   */
  abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
```

`ContentBlockType` (набор ключей, которые несут коррелированные по `index` блоки) выводится из [`ContentBlockMap`](#content-blocks-and-messages) выше.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxllm--llmruntime"></a>

### `ctx.llm` — `LlmRuntime`

The abstract `llm` service: an adapter registry plus a streaming model-call API, interceptable via the `llm/stream` waterfall.

```ts cordis-catalog
/**
 * Register an adapter for the given provider routes. Throws `LlmError` with code
 * `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
 * Disposed with the fiber.
 * @param providers - every provider route this adapter should serve.
 * @param adapter - the adapter that streams calls for those providers.
 * @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
 */
registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle

/**
 * Describe provider routes with a registered adapter.
 * @returns detached provider metadata in registration order.
 */
listProviders(): LlmProviderInfo[]

/**
 * Declare provider routes an adapter plugin can activate through
 * configuration. Registration is all-or-nothing: an empty list, invalid
 * entry, or a provider already declared by any registration throws
 * `LlmError` without registering the rest. Disposed with the fiber.
 * @param entries - every configurable provider this plugin owns.
 * @returns a handle that withdraws all of them, and can atomically replace them.
 */
registerConfigurableProviders(entries: readonly LlmConfigurableProvider[]): DirectoryRegistrationHandle

/**
 * List every declared configurable provider, registered or dormant.
 * @returns detached directory entries in declaration order.
 */
listConfigurableProviders(): LlmConfigurableProvider[]

/**
 * Offer to interrogate provider endpoints on behalf of the settings
 * namespace this plugin owns. The namespace is the key because that is what
 * a configuration surface already holds from the configurable-provider
 * directory, and because a provider being *added* has no route to name yet.
 * Disposed with the fiber.
 * @param settingsNs - the namespace whose profiles this discovery serves.
 * @param discover - interrogates one endpoint; must honor `request.signal`.
 * @returns the disposer that withdraws the offer.
 */
registerModelDiscovery( settingsNs: string, discover: (request: LlmModelDiscoveryRequest) => Promise<readonly LlmDiscoveredModel[]>, ): () => void

/**
 * Interrogate one provider endpoint for the models it advertises. The
 * request describes a draft, not a stored route, so nothing here reads or
 * writes settings or credentials — the caller owns both, and the reply is
 * candidate metadata a surface may offer for adoption.
 * @param settingsNs - namespace whose registered discovery serves this draft.
 * @param request - the endpoint, protocol, and one-shot credential to use.
 * @returns the advertised models, deduplicated in endpoint order.
 */
async discoverModels( settingsNs: string, request: LlmModelDiscoveryRequest, ): Promise<LlmDiscoveredModel[]>

/**
 * Resolve the retry policy captured when one provider route was registered.
 * @param provider - registered provider route to inspect.
 * @returns the provider-owned policy, with normal defaults already resolved.
 */
providerRetryPolicy(provider: string): ResolvedRetryPolicy

/**
 * Discover models advertised by one registered provider. Catalog membership
 * is advisory and never changes routing or request validation.
 * @param provider - registered provider route to inspect.
 * @returns detached model metadata in adapter-preferred order.
 */
async listModels(provider: string): Promise<LlmModelInfo[]>

/**
 * Resolve and validate all metadata from the adapter that owns one exact
 * route. The result is detached from adapter-owned objects; catalog
 * membership remains advisory and does not control request routing.
 * @param provider - registered provider route to inspect.
 * @param model - exact model id passed to the adapter.
 * @param signal - optional cancellation for adapter-owned asynchronous lookup.
 * @returns exact model identity plus available context and reasoning metadata.
 */
async resolveModelInfo( provider: string, model: string, signal?: AbortSignal, ): Promise<LlmResolvedModelInfo>

/**
 * Validate a conversation call config against its exact model capability and
 * materialize adapter-configured defaults. Unsupported explicit efforts
 * reject before provider I/O; no clamping or aliasing is performed. This
 * standalone query does not bind a later dispatch; use {@link prepareCall}
 * when logging and streaming must share one adapter registration.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a detached config only when a default must be materialized.
 */
async resolveCallConfig(config: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig>

/**
 * Resolve one call under its current adapter registration. The returned
 * one-shot handle keeps that registration across header logging and dispatch,
 * so HMR cannot combine one adapter's capability result with another adapter.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a prepared config and its registration-bound stream entry point.
 */
async prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<PreparedLlmCall>

/**
 * Stream one model call as raw chunks (token-level deltas). Replay state is
 * retained only when the same adapter instance owns its historical provider
 * and the target provider. Final adapter selection remains fixed through
 * asynchronous exact-model resolution and dispatch. Adapter selection,
 * dispatch, and iteration failures become terminal `error` or `aborted`
 * finish chunks; middleware, nested-call, cleanup, and consumer failures
 * remain thrown.
 * @param options - the full request; `options.provider` selects the adapter.
 * @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
 */
stream(options: GenerateOptions): AsyncIterable<StreamChunk>
```

Source: [`packages/llm/llm/src/index.ts`](../../packages/llm/llm/src/index.ts)

<a id="llm-events"></a>

### `llm/*` events

<a id="llmadapters-updated--emit"></a>

#### `llm/adapters-updated` — emit

The provider topology changed: an adapter registered or unregistered routes, or the configurable-provider directory gained or lost entries. This payload-free registry notification fires at each commit point (including registration disposal); consumers re-read `listProviders()`, `listModels()`, or `listConfigurableProviders()` for the new state. Observer failures are contained and cannot veto the registry mutation.

```ts cordis-catalog
/**
 * The provider topology changed: an adapter registered or unregistered
 * routes, or the configurable-provider directory gained or lost entries.
 * This payload-free registry notification fires at each commit point
 * (including registration disposal); consumers re-read `listProviders()`,
 * `listModels()`, or `listConfigurableProviders()` for the new state.
 * Observer failures are contained and cannot veto the registry mutation.
 * @mode emit
 */
'llm/adapters-updated'(): void
```

Source: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="llmstream--waterfall"></a>

#### `llm/stream` — waterfall

Waterfall around every streaming model call (retry, replay, routing). Bound to the LlmRuntime; call `next()` to reach the resolved adapter's stream, or yield your own chunks to short-circuit.

```ts cordis-catalog
/**
 * Waterfall around every streaming model call (retry, replay, routing).
 * Bound to the {@link LlmRuntime}; call `next()` to reach the resolved
 * adapter's stream, or yield your own chunks to short-circuit.
 * @param options - the full request. A LOOP-built request carries the
 *   process-local {@link markAgentLoopRequest} identity and arrives deep-frozen
 *   (mutation throws): its content is a pure function of the session log (the
 *   reconstructability Agent Note), so listeners read it, never rewrite it.
 *   Hand-built calls do not carry that marker; their messages already obey
 *   the immutable creation contract.
 * @mode waterfall
 */
'llm/stream'(this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
```

Source: [`packages/llm/llm/src/index.ts`](../../packages/llm/llm/src/index.ts)
<!-- END GENERATED cordis-surface -->

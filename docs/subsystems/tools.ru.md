# Инструменты

[English](tools.md) | [中文](tools.zh.md) | Русский

Пайплайн инструментов [dsh-tools](../../packages/core/tools). [core.md](core.md) представляет `ToolDefinition` — тип, служащий для сборки пайплайна и разделяемый базовыми пакетами; модельно-ориентированный тип [`ToolSchema`](llm-streaming.md#the-model-request-and-result), передаваемый по протоколу, объявляется вместе с запросом к модели. Эта страница документирует каждое поле `ToolDefinition`, типизированный DSL схем, который его строит, типы защищённого исполнения и типы UI-презентации.

Источник: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts) · [`packages/core/tools/src/schema.ts`](../../packages/core/tools/src/schema.ts) · [`packages/core/tools/src/presentation.ts`](../../packages/core/tools/src/presentation.ts)

## `ToolDefinition` — зарегистрированный инструмент

`ToolSchema` (модельно-ориентированные поля) плюс обязательное объявление канонического вывода, функция `execute`, доступные только хосту метаданные планировщика, необязательный колбэк финализации содержимого и необязательные UI-презентеры. Всё это хранит реестр; цикл диспетчеризует вызовы через него. Метод `schemas()` реестра строит модельно-ориентированный массив `ToolSchema[]` по явному разрешающему списку — поля `output`/`execute`/`finalizeContent`/`timeoutMs`/`isConcurrencySafe`/`presentCall`/`presentResult` **НЕ ДОЛЖНЫ** никогда попадать в запрос к модели.

```ts type-equiv
/** Tool-owned canonical output contract used after the body returns a JSON value. */
interface ToolOutputDefinition {
  /** Raw supported JSON Schema enforced against every successful canonical value. */
  readonly schema: JsonSchemaNode
  /** Pure projection from validated arguments and value to Native/model content. */
  render(args: unknown, value: JsonValue): ContentBlock[]
  /** Pure replayable presentation projection, computed only for top-level calls. */
  presentationMeta?(args: unknown, value: JsonValue): JsonValue
}
```

```ts type-equiv
/** A registered tool: its schema plus the execution function. */
interface ToolDefinition extends ToolSchema {
  /** Mandatory canonical output declaration. */
  readonly output: ToolOutputDefinition
  /**
   * Run one accepted call and return only its canonical lossless-JSON value.
   * Async work must observe or forward `exec.signal` and settle only after its
   * owned work reaches quiescence. The registry preserves caller cancellation
   * through around-dispatch signal replacement and does not abandon this
   * promise, but it cannot hard-kill same-process code.
   * @param args - losslessly snapshotted, frozen model arguments.
   * @param exec - execution identity, cancellation signal, and context deferral.
   * @returns the canonical value declared by `output.schema`.
   */
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  /**
   * Synchronous last-mile transform for model-facing content. The registry
   * snapshots this callback when execution starts and invokes it exactly once
   * for every normalized outcome, including pipeline failures that bypass
   * `tools/post-execute`, immediately before lossless materialization.
   * Returning `undefined` preserves the content; every other result field
   * remains registry-owned. The callback must be total and must not throw.
   * @param exec - immutable execution identity and arguments.
   * @param result - complete normalized outcome before materialization.
   * @returns replacement content, or `undefined` to preserve it.
   */
  finalizeContent?(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): ContentBlock[] | undefined
  /**
   * Cooperative tool-call timeout budget in milliseconds. Omit for no deadline.
   * Enforced by `@deepseek-ai/dsh-tool-call-timeout-policy` (a `tools/execute` wrapper); it
   * is NEVER sent to the model — `schemas()` whitelists only name/description/
   * parameters. Declaring it asserts this tool forwards `exec.signal` to a
   * cooperative implementation that can reach quiescence when the signal aborts.
   */
  timeoutMs?: number
  /**
   * Pure synchronous classifier for overlap with sibling tool calls. Only
   * `true` opts in; omission, exceptions, non-`true` returns, and invalid
   * `defineTool` arguments are exclusive. This metadata is never model-visible.
   *
   * Opted-in executions must not mutate parent-owned state. Shared state must
   * tolerate concurrent dispatch; recorder races are permitted only when they
   * commute or fail closed. See the
   * [parallel-tool-call Agent Note](../../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md)
   * for the full contract.
   * @param args - parsed arguments; `defineTool` validates before calling.
   * @returns Whether this call may join a parallel group.
   */
  isConcurrencySafe?(args: unknown): boolean
  /**
   * Optional: how to present the PENDING state of one call in a UI, derived from
   * the call's `args` (parsed arguments, `unknown` — the tool validates/narrows
   * its own input). Returns a {@link ToolCallView} (a `card`-tagged render intent),
   * or `undefined` (or omit the method) to fall back to a generic presentation
   * (title = tool name, raw args as input). Pure and side-effect-free: a UI may
   * call it during live streaming AND a session-log replay, so it must depend
   * only on `args`.
   */
  presentCall?(args: unknown): ToolCallView | undefined
  /**
   * Optional: how to present the COMPLETED state, given the same `args` and the
   * durable result projection (`content`, failure state, and optional `meta`). Returns a
   * {@link ToolResultView}, or `undefined` (or omit the method) to keep the
   * pending title and render the raw result content. Pure and side-effect-free
   * for the same replay reason.
   */
  presentResult?(args: unknown, result: ToolResult): ToolResultView | undefined
}
```

`execute` получает `args: unknown` — «сырой» `ToolDefinition` проверяет свой вход сам. Штатные инструменты не пишут это вручную: они используют `defineTool`, который валидирует и сужает аргументы, выводит возвращаемый тип тела из `output.schema` и типизирует оба проектора вывода. `finalizeContent` намеренно получает неизменяемое исполнение, а не типизированные аргументы, поскольку до него доходят и невалидный вход, и отказы внешнего пайплайна; он может наложить принадлежащий инструменту предел содержимого, сохраняя `isError`, каноническое значение, структурированную идентификацию ошибки, отложенные контексты и метаданные презентации.

## Единый DSL схем для JSON-значений

Авторам плагинов доступен один общий набор конструкций для типизированных параметров и типизированных выходных значений. `ValueSchemaSpec` поддерживает `string`, `number`, `integer`, `boolean`, `null`, `array`, `object`, доступный только авторам `json` и `oneOf` с совпадением ровно одной ветви; скалярные значения `enum` и `const` **ДОЛЖНЫ** соответствовать типу своего узла. Явный узел объекта всегда объявляет `additionalProperties: true | false`. Определения параметров остаются неявной открытой картой свойств объекта, где `required: true` прикрепляется к каждому обязательному свойству.

Источник: [`packages/core/tools/src/schema.ts`](../../packages/core/tools/src/schema.ts)

```ts type-equiv
/** One author-facing schema for any lossless JSON value root. */
type ValueSchemaSpec =
  | StringValueSchemaSpec
  | NumberValueSchemaSpec
  | IntegerValueSchemaSpec
  | BooleanValueSchemaSpec
  | NullValueSchemaSpec
  | ArrayValueSchemaSpec
  | ObjectValueSchemaSpec
  | JsonValueSchemaSpec
  | OneOfValueSchemaSpec
```

```ts type-equiv
/** One implicit parameter-root property, optionally required. */
type ParameterPropertySpec = ValueSchemaSpec & { required?: true }
```

```ts type-equiv
/**
 * Tool parameter schema. The map itself is an implicit open object root;
 * requiredness remains a per-property `required: true` annotation.
 */
type ParameterSchemaSpec = {
  [key: string]: ParameterPropertySpec
  [key: symbol]: never
}
```

`{ type: 'json' }` выводит `JsonValue` и компилируется в ничем не ограниченную сырую схему из одних аннотаций. Корнем вывода может быть объект, массив, скаляр или null. `InferValue<S>` учитывает литеральные ограничения и открытость объектов до 16 уровней вложенных контейнеров, после чего возвращается к `JsonValue`, не исчерпывая стек инстанцирования типов TypeScript. `InferArgs<P>` превращает обязательность отдельных свойств в обязательные и необязательные строковые ключи:

```ts type-equiv
/**
 * Infer the TypeScript value accepted by an author-facing value schema. Exact
 * inference is bounded to 16 container levels, then falls back to `JsonValue`.
 */
type InferValue<S> = InferValueAt<S, []>
```

```ts type-equiv
/** Infer the TypeScript argument object for an implicit parameter schema. */
type InferArgs<S> = InferProperties<S, []>
```

`defineTool({ name, description, parameters, output, execute, … })` связывает вывод типов параметров с `parameterSchemaSpecToJsonSchema()` и `validateArgs()`, а `execute`/`render`/`presentationMeta` — с `InferValue<OutputSchema>`. Записи схем содержат только собственные перечислимые строковые ключи, а массивы схем являются плотными внутренними массивами, поэтому вывод типов, компиляция и валидация видят одно и то же объявление. Вывод типов остаётся точным до 16 уровней контейнеров, а затем расширяется до `JsonValue`; рантайм-валидация продолжает обходить схему целиком. `valueSchemaSpecToJsonSchema()` компилирует объявления вывода через тот же принудительно проверяемый сырой поднабор. Несоответствие параметров бросает `ToolArgsError` (`INVALID_ARGS`); невалидное значение тела или пост-политики бросает `ToolOutputError` (`INVALID_TOOL_OUTPUT`). Обе идут обычным путём ошибок инструментов. Сырой JSON Schema остаётся открытым по умолчанию; неподдерживаемые ключевые слова отвергаются, а не принимаются без проверки.

Регистрация — доверенный контракт внутри одного процесса. Реестр берёт типизированное определение как readonly-вход, требует наличия `output`, валидирует его сырую схему и проверяет семантические требования вроде положительного конечного `timeoutMs`; проекцию для модели `schemas()` строит в момент сборки запроса, так что исполнение и презентация опираются на одно разрешённое определение, а колбэки не утекают в формат протокола.

## `ToolRestriction` — живой фильтр одного scope над унаследованным

`ToolRestriction` действует на инструменты, которые scope наследует: глобальный слой развёртывания плюс каждый родительский scope по его цепочке. Реестр компилирует readonly-имена в приватные множества, пересекает несколько ограничений между собой, а затем накладывает сверху СОБСТВЕННЫЕ регистрации scope — они остаются вне действия ограничений, чтобы делегированный дочерний scope сохранял инструменты, через которые отвечает сам. Фильтр из одних запретов допускает добавленные позже не перечисленные в нём унаследованные инструменты; разрешающий список, напротив, такие инструменты отсекает.

```ts type-equiv
/**
 * Per-scope filter over global tools. Restrictions intersect and do not affect
 * scoped registrations or the reserved Code Mode transport.
 */
interface ToolRestriction {
  /** Global tool names that stay visible; everything else is removed. */
  readonly allow?: readonly string[]
  /** Global tool names removed from visibility. */
  readonly deny?: readonly string[]
}
```

## Исполнение: расширяемые каскады плюс монотонная политика

`ctx.tools.execute()` принимает принадлежащий вызывающему `ToolExecutionInput` с обязательным readonly-полем `signal`, один раз материализует разобранные JSON-аргументы в принадлежащий пайплайну `ToolExecution` и проводит вызов через `tools/pre-execute` (переставляемый каскад allow/deny/ask) → зарегистрированные монотонные guard'ы → `tools/execute` (обёртки вокруг диспетчеризации) → `tools/post-execute` (осмотр/замена результата) → необязательный принадлежащий определению `finalizeContent` → `tools/result` (неизменяемый авторитетный исход). Заменить обязательный сигнал может только представление `tools/execute`. Исход — это `ToolExecutionResult`.

```ts type-equiv
/** Opaque call identity that permits correlation without exposing mutable execution state. */
type ToolExecutionToken = symbol & { readonly [toolExecutionTokenBrand]: true }
```

```ts type-equiv
/**
 * Caller-supplied description of one tool call. {@link ToolRuntime.execute}
 * adds the registry-owned token to form a pipeline {@link ToolExecution};
 * callers do not choose that token.
 */
interface ToolExecutionInput {
  readonly callId: CallId
  /**
   * Root model-requested call owning this execution tree. Callers omit it for
   * a root execution; nested dispatchers propagate the enclosing value.
   */
  readonly rootCallId?: CallId
  readonly name: string
  /** Losslessly JSON-serializable parsed arguments (tools validate their own schema). */
  readonly arguments: unknown
  /** The agent on whose behalf the call runs (set by the agent loop). */
  readonly agent?: Agent
  /**
   * Opaque token of the enclosing transport execution, when one exists. Code
   * Mode sets this on SDK sub-dispatches so commit-style observers can wait for
   * the outer `run_code` outcome without receiving its live mutable execution.
   * The token also marks the call as a transport sub-dispatch rather than a
   * model-direct call: under `mode: 'code'`, only calls WITH a parent may
   * execute a native tool name — a model-direct call (no parent) is denied as
   * `UNKNOWN_TOOL` before the policy pipeline. See {@link ToolRuntime.execute}.
   */
  readonly parent?: ToolExecutionToken
  /** Required caller-owned cancellation for this invocation. */
  readonly signal: AbortSignal
}
```

Тело инструмента получает рантайм-расширение. `deferContext()` прикрепляет контекст к собственному результату исполнения — это канал вложенной диспетчеризации составного инструмента, которым может воспользоваться и листовой инструмент, порождающий инструкцию из плагина, — не внедряя ничего внутрь ещё открытого внешнего вызова.

```ts type-equiv
/**
 * Runtime context handed to a tool implementation after the registry has
 * accepted a {@link ToolExecution}. {@link deferContext} attaches context to
 * this execution's own result — a composite tool ferries nested-dispatch
 * context back to the outer result, and a leaf tool may mint a fresh
 * plugin-sourced instruction; the loop appends it only after the
 * `tool/result`.
 */
interface ToolRunContext extends ToolExecution {
  /**
   * Defer one context — typically a nested-dispatch context ferried by a
   * composite tool, or a fresh plugin-sourced instruction — until this tool's
   * final result reaches the agent loop. Contexts retain their individual
   * source and metadata and are emitted in call order.
   */
  deferContext(context: UserMessage): void
  /**
   * Mark a successful final result as terminal for the current agent turn.
   * The marker rides this execution's own result (`concludesTurn` exists only
   * on {@link ToolExecutionSuccess}); a composite that dispatches nested
   * calls forwards it from the nested result, exactly like
   * `additionalContexts`, so only an authoritative nested success can
   * conclude the enclosing run.
   */
  concludeTurn(): void
}
```

Цикл агента запрашивает у реестра режим исполнения каждого ожидающего вызова и использует его, чтобы строить эксклюзивные барьеры и параллельные прогоны со скользящим пулом:

```ts type-equiv
/**
 * Scheduling mode for one pending call. `parallel` may overlap with siblings;
 * `exclusive` runs alone and forms an ordering barrier.
 */
type ToolExecutionMode =
  | { kind: 'parallel' }
  | { kind: 'exclusive' }
```

Мост Code Mode дополнительно передаёт каждый завершившийся вложенный вызов каскаду `tools/code-dispatch-log`, который может изменить копию содержимого в долговечном событии (значение программы и видимый модели результат остаются нетронутыми):

```ts type-equiv
/**
 * One settled `run_code` sub-dispatch about to be logged, as seen by the
 * `tools/code-dispatch-log` waterfall: the parent execution (session owner,
 * outer call identity), the sub-call identity, and the outcome whose durable
 * copy a listener may reshape. `content` is the RENDERED result projection
 * (what a native `tool/result` would carry) — the program itself received
 * the structured `value` (or just the error message on failure); only the
 * `tool/code-dispatch` event's copy changes.
 */
interface CodeDispatchLog {
  /** The outer `run_code` execution. */
  readonly exec: ToolExecution
  /** The calling agent (the scope routing key and the spill owner), when the outer call has one. */
  readonly agent?: Agent
  /** Deterministic sub-call id (`<parent>:code:<n>`). */
  readonly subCallId: CallId
  /** The dispatched sub-tool name. */
  readonly name: string
  /** Whether the sub-call settled as an error. */
  readonly isError: boolean
  /** The sub-call's complete model-facing content (the settle event's default payload). */
  readonly content: ContentBlock[]
}
```

```ts type-equiv
/**
 * One pending tool call inside the registry pipeline. Parsed arguments cross
 * one lossless-JSON materialization boundary before policy and are deep-frozen;
 * call identity, the caller signal, and the registry-assigned {@link token} are
 * readonly. The registry freezes the complete object before `tools/result`
 * observers run.
 */
interface ToolExecution extends ToolExecutionInput {
  /** Root model-requested call, resolved for every root and nested execution. */
  readonly rootCallId: CallId
  /** Registry-assigned identity shared with nested calls only as their opaque `parent` token. */
  readonly token: ToolExecutionToken
}
```

```ts type-equiv
/**
 * Around-dispatch view of a {@link ToolExecution}. A `tools/execute` wrapper
 * may replace the signal for its delegated lifetime, but it cannot remove it.
 * The registry fuses every replacement with the captured caller signal.
 */
interface ToolDispatchExecution extends Omit<ToolExecution, 'signal'> {
  /** Cancellation signal visible to the next wrapper or tool body. */
  signal: AbortSignal
}
```

`ToolExecutionToken` — непрозрачный рантайм-`Symbol`, служащий только для сравнения идентичности. До политик `execute()` материализует и замораживает аргументы, отвергает вход, не являющийся JSON, и назначает токен. Поля идентичности, обязательный сигнал вызывающего и необязательный родительский токен остаются readonly. Обёртка `ToolDispatchExecution` может заменить сигнал, но не убрать его; прежде чем вызвать тело, реестр заново сплавляет сигнал вызывающего с заменённым. Финальные наблюдатели получают замороженную идентичность исполнения.

`ToolGuard` — учитывающая scope финальная политика непосредственно перед диспетчеризацией. Возвращаемый тип намеренно не имеет результата «разрешить»: `undefined` сохраняет решение каскада, а возвращённая причина способна только урезать разрешение, поэтому более поздний слушатель не может её отменить.

```ts type-equiv
/**
 * A monotonic execution guard evaluated after every `tools/pre-execute`
 * listener and before the tool body. Returning a reason denies the call;
 * returning `undefined` leaves it unchanged. Because guards have no allow
 * result, listener ordering cannot turn a denial back into permission.
 * @param execution - the identity-protected call after extensible pre-execute policy completed.
 * @returns a final denial reason, or `undefined` to leave the call allowed.
 */
type ToolGuard = (execution: Readonly<ToolExecution>) => string | undefined
```

```ts type-equiv
/** Canonical failure detail; internal routing information remains optional. */
interface ToolFailure {
  /** Human-readable failure message without the Native `Error: ` envelope. */
  message: string
  /** Internal error class/code used by policy and durable diagnostics. */
  info?: ToolErrorInfo
}
```

```ts type-equiv
/** Successful canonical tool execution, including its Native/model projection. */
interface ToolExecutionSuccess {
  readonly isError: false
  /** Execution-local canonical value; deliberately omitted from durable events. */
  readonly value: JsonValue
  readonly content: ContentBlock[]
  readonly error?: never
  readonly meta?: JsonValue
  readonly additionalContexts?: UserMessage[]
  /** The agent loop stops after committing this successful result batch. */
  readonly concludesTurn?: true
}
```

```ts type-equiv
/** Failed canonical tool execution; failures never carry a successful value. */
interface ToolExecutionFailure {
  readonly isError: true
  readonly error: ToolFailure
  readonly value?: never
  readonly content: ContentBlock[]
  readonly meta?: JsonValue
  readonly additionalContexts?: UserMessage[]
  readonly concludesTurn?: never
}
```

```ts type-equiv
/** The discriminated, execution-local outcome of one tool call. */
type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure
```

Результат несёт только исход. Идентичность вызова остаётся на неизменяемом `ToolExecution`, которое сопровождает его через каждый хук и попадает в долговечные события сессии `tool/call` / `tool/result`, поэтому обёртки не могут создать вторую, расходящуюся идентичность. Каноническое `value` живёт лишь в пределах исполнения: цикл сохраняет только `content`, `error` и `meta`, а `tool/code-dispatch` дословно хранит отрендеренные `content` и `isError` вложенного вызова. Воспроизведение восстанавливает презентацию, но не может реконструировать канонические промежуточные значения.

При успехе реестр снимает снепшот значения тела, валидирует его, замораживает и вызывает чистый рендерер плюс необязательный проектор метаданных для вызовов верхнего уровня. Отдельно он материализует долговечные поля презентации непосредственно перед `tools/result`; невалидное значение, отказ рендерера или проектора либо не-JSON презентация становятся JSON-безопасным `isError`. Поэтому финальный live-наблюдатель видит точное локальное для исполнения значение рядом с полями, безопасными для последующей долговечной записи.

Перед финальным содержимым реестр материализует кандидат-результат; отказ в содержимом, структурной ошибке, дополнительном контексте или метаданных презентации становится JSON-безопасным результатом `isError`, который всё же доходит до `finalizeContent`. Реестр вызывает этот колбэк ровно один раз, затем материализует и замораживает принятый результат непосредственно перед `tools/result`, так что наблюдаемый live-исход безопасен для последующей долговечной записи `tool/result`.

Каждый перехватывающий каскад возвращает типизированное **решение** (идиома, общая с каскадами `agent/*`). Слушатели `tools/pre-execute` получают `(exec, next)` и возвращают `PreToolDecision`; обёртки `tools/execute` возвращают `ToolExecutionResult`; слушатели `tools/post-execute` получают `(exec, result, next)` и возвращают `PostToolDecision`:

```ts type-equiv
/**
 * Pre-dispatch decision. `allow` runs the call; `deny` materializes an error;
 * `ask` runs only after an approval service returns `allowed-once` and otherwise
 * denies. Input rewriting is excluded because arguments are already logged and
 * presented.
 */
type PreToolDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason?: string }
```

```ts type-equiv
/**
 * Post-dispatch decision: accept, replace one projection, attach context for the
 * next request, or block by turning corrective feedback into an error result.
 */
type PostToolDecision =
  | { kind: 'accept'; content?: ContentBlock[]; value?: never; additionalContexts?: UserMessage[] }
  | { kind: 'accept'; value: JsonValue; content?: never; additionalContexts?: UserMessage[] }
  | { kind: 'block'; feedback: ContentBlock[]; additionalContexts?: UserMessage[] }
```

Вызывайте `next()` для поведения по умолчанию или возвращайте решение, чтобы оборвать цепочку. Pre-политика может отклонить или запросить подтверждение; движение дальше возможно только при `allowed-once`, а отказ в гранте, отсутствующий канал или сервис одобрения либо запрос без агента превращаются в отказ. Guard'ы всё ещё могут наложить окончательный запрет. Аргументы нельзя переписывать: история, аудит, UI и исполнение **ДОЛЖНЫ** сходиться в одном.

Post-политика может заменить что-то одно — содержимое или значение, но никогда оба сразу. Замена содержимого сохраняет каноническое значение и существующие метаданные; замена значения проходит повторную валидацию и пересчитывает содержимое/метаданные; блокировка удаляет значение и превращается в `isError` с корректирующей обратной связью. Замена содержимого — политика презентации, а не конфиденциальности: слушатель, обязанный скрыть программное значение, блокирует его или заменяет. `tools/result` получает замороженные исполнение и результат после нормализации; наблюдатели не могут их преобразовать, а отказы наблюдателей локализуются. Неизвестные и падающие инструменты одинаково становятся структурированными ошибками (`ToolNotFoundError` отображается в `UNKNOWN_TOOL`), поэтому вызов завершается неудачей, не заканчивая ход.

## Принудительно проверяемый сырой поднабор JSON Schema

Сырые схемы от субагентов, воркфлоу, MCP и динамических регистраций используют протокольный аналог авторского DSL. `assertSupportedJsonSchema()` принимает любой JSON-корень, `validateJsonSchemaValue()` принудительно его проверяет, а `JsonSchemaError` сообщает о каждом неподдерживаемом или некорректном пути схемы. Пустой узел из одних аннотаций означает ничем не ограниченный lossless JSON. `oneOf` требует минимум две ветви, и значение **ДОЛЖНО** совпадать ровно с одной. Потребители, которым всё же нужен объектный корень, вызывают `assertObjectJsonSchema()` и несут с собой `ObjectJsonSchema`; так задаваемый вызывающим структурированный вывод субагентов и воркфлоу остаётся объектнокорневым без ограничения общего набора конструкций.

```ts type-equiv
/** Scalar JSON values supported by `enum` and `const`. */
type JsonSchemaScalar = string | number | boolean | null
```

```ts type-equiv
/** Single-type keywords accepted by the enforced subset. */
type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
```

```ts type-equiv
/**
 * One raw JSON Schema node in the enforced subset. The optional fields express
 * the external wire schema; {@link assertSupportedJsonSchema} rejects invalid
 * combinations before a caller treats the node as trusted.
 */
interface JsonSchemaNode {
  /** Omit with no constraints for any JSON value, or use `oneOf`. */
  type?: JsonSchemaType
  /** Exactly one branch must validate; at least two branches are required. */
  oneOf?: JsonSchemaNode[]
  /** Nested property schemas (`type: 'object'` only). */
  properties?: Record<string, JsonSchemaNode>
  /** Required property names; each must appear in `properties`. */
  required?: string[]
  /** `false` rejects undeclared keys; absent/`true` follows JSON Schema's open default. */
  additionalProperties?: boolean
  /** Item schema (`type: 'array'` only); absent accepts any JSON item. */
  items?: JsonSchemaNode
  /** Allowed values for a scalar node. */
  enum?: JsonSchemaScalar[]
  /** The single allowed value for a scalar node. */
  const?: JsonSchemaScalar
  /** Annotation, ignored for validation. */
  description?: string
  /** Annotation, ignored for validation. */
  title?: string
  /** Annotation, ignored for validation but required to be lossless JSON. */
  default?: JsonValue
  /** Annotation, ignored for validation but required to be lossless JSON. */
  examples?: JsonValue
}
```

```ts type-equiv
/** A consumer-constrained object-rooted schema. */
type ObjectJsonSchema = JsonSchemaNode & { type: 'object' }
```

## Словарь UI-презентации инструментов

Как инструмент хочет, чтобы его вызов был показан в UI (карточка вызова инструмента в редакторе, строка лога CLI), независимо от провайдера — инструмент описывает себя, не завися ни от какого клиентского протокола. `presentCall`/`presentResult` возвращают **намерение рендера с меткой `card`** — размеченное объединение (discriminated union), по которому переключается UI-мост:

- `ToolCallView` (ожидание): `{ card: 'generic', title, kind?, rawInput?, content?, locations? }` (карточка по умолчанию; `locations` — файлы вида `{ path, line? }[]`, которые вызов читает/изменяет, чтобы редактор мог следовать за инструментом), `{ card: 'terminal', title, description?, cwd? }` (команда shell → карточка терминала) или `{ card: 'diff', title, diffs, locations? }` (создание/изменение файла → карточка встроенного диффа; `diffs` — это `{ path, oldText, newText }[]`, где `oldText: null` для нового файла).
- `ToolResultView` (завершено): `{ card: 'generic', title?, content? }`, `{ card: 'terminal', title?, output?, exitCode?, signal? }` (захваченный вывод запуска плюс код выхода; способный UI показывает пилюлю статуса выхода, а другой может вывести запасной ограждённый блок ` ```console `), `{ card: 'diff', title?, diffs }` (завершённая мутация файла → показываемое изменение: обычно применённые ханки со строками контекста, вычисленными из содержимого «до/после», либо дифф целого файла, когда образа «до» нет), `{ card: 'search', shape, title?, truncated, total, … }` (завершённый поисковый вызов → совпадения, сгруппированные по файлам, при `shape: 'matches'` (grep) или плоский список путей при `shape: 'paths'` (glob); `truncated`/`total` сообщают, был ли встроенный результат усечён, чтобы UI никогда не выдавал частичный результат за полный; само представление текста результата не несёт — UI без карточки поиска возвращается к сырому содержимому результата), `{ card: 'read', title?, path, offset, lines, totalLines, lang?, content? }` (завершённое чтение файла → пронумерованный по строкам, опционально раскрашенный синтаксисом просмотр кода; `offset` — запрошенная окном первая строка в 1-базной нумерации, сохраняется даже при пустом `lines`; `lang` — подсказка языка по расширению, а `content` — текст без обёртки, к которому возвращается UI без поддержки чтения), или `{ card: 'web', kind: 'search' | 'fetch', title?, … }` (завершённое веб-извлечение; `kind: 'search'` несёт структурированные `sources`/`answer?`/`truncated`, `kind: 'fetch'` несёт `url`/`statusCode`/`truncated`, а UI без возможности `web` возвращается к сырому содержимому результата — тело в представление не дублируется). Завершённые представления заменяют ожидающие, поэтому мутирующие инструменты возвращают diff-результат, даже если он дублирует фрагмент момента вызова; у поиска и веб-извлечения нет `card`-аналога в момент вызова (их ожидающее состояние остаётся generic-карточкой, ведь структурированный результат существует только после `execute`).

`ToolCallKind` (`'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'fetch' | 'other'`) выбирает иконку на generic-карточке. `FileLocation` (`{ path, line? }`), `FileDiff` (`{ path, oldText, newText }`) и `ReadFileLine` (`{ number, text }`, одна строка окна чтения в 1-базной нумерации) образуют общий словарь файловых карточек. Дизайн закреплён в [Agent Note об объединении намерений рендера](../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.md); рантаймы хоста и клиентов проецируют этот нейтральный словарь в свои представления.

Полная документация полей презентации лежит в [`packages/core/tools/src/presentation.ts`](../../packages/core/tools/src/presentation.ts). Схема и исполнитель `bash` описаны в [shell.ru.md](shell.ru.md); универсальные управления фоновыми задачами — в [jobs.md](jobs.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxtools--toolruntime"></a>

### `ctx.tools` — `ToolRuntime`

Tool registry and execution pipeline. Scoped registrations shadow globals; one visibility resolver feeds presentation, lookup, and dispatch.

```ts cordis-catalog
/**
 * Present the calling scope's tools in `mode` instead of the deployment
 * default. Nearest scope on the chain wins, so a preset's standing
 * declaration covers every agent joined under it.
 *
 * Scoped only, and one declaration per scope: this is how an agent preset
 * composes Code Mode agents beside native ones in the same process, and a
 * process-global override would be the `mode` config field instead.
 * @param mode - the presentation the covered agents' models see.
 * @returns the exact disposer that restores the deployment default.
 */
presentAs(mode: ToolPresentationMode): () => void

/**
 * Register globally or in the calling agent scope. Scoped tools shadow
 * globals; duplicates within one layer and the reserved `run_code` name fail.
 * @param definition - tool schema, execution, and optional finalization/presentation callbacks.
 * @returns the exact disposer that unregisters the tool.
 */
register(definition: ToolDefinition): () => void

/**
 * Restrict global tools for the calling agent scope. Empty filters, unknown
 * names, scope-local names, and reserved transport names fail. Restrictions
 * intersect; scoped registrations remain visible.
 * @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
 * @returns the exact disposer that lifts this restriction.
 */
restrict(filter: ToolRestriction): () => void

/**
 * Register a monotonic guard after the extensible `tools/pre-execute`
 * waterfall. A plain-context guard applies globally; one registered through
 * `agent.ctx` applies only to that agent. Any matching guard may deny by
 * returning a reason, while no guard can force-allow a call another guard
 * denied. The exact effect disposer is returned for ordered ownership and
 * HMR cleanup.
 * @param guard - synchronous check; a returned string denies the execution.
 * @returns the exact disposer that unregisters the guard.
 */
guard(guard: ToolGuard): () => void

/**
 * Look up a tool as one scope sees it (scoped
 * shadows global; a restricted-away global reads as absent). Presenters pass
 * the calling agent so the rendered card matches the definition that
 * actually executed.
 * @param name - the tool name as registered.
 * @param scope - the viewing scope (the agent); omitted = the global view.
 * @returns the definition the scope resolves, or undefined when none is visible.
 */
get(name: string, scope?: ScopeKey): ToolDefinition | undefined

/**
 * Project visible definitions onto the allowlisted model-facing schema fields,
 * excluding execution and presentation callbacks.
 * @param scope - the viewing scope (the agent); omitted = the global view.
 * @returns one deep-cloned schema per visible tool.
 */
schemas(scope?: ScopeKey): ToolSchema[]

/**
 * Classify a pending call through the caller's visible tool definition. Only
 * an exact `true` is parallel; unknown, hidden, undeclared, invalid, or
 * throwing classifiers are exclusive.
 * @param exec - call name, parsed arguments, and optional agent scope.
 * @returns the fail-closed scheduling mode.
 */
executionMode(exec: ToolExecutionInput): ToolExecutionMode

/**
 * Execute through pre-policy, guards, around-dispatch, post-policy,
 * definition-owned content finalization, and final notification. Tool and
 * listener failures resolve as materialized error results; an invisible tool
 * reports `UNKNOWN_TOOL`. The returned outcome is the same lossless, frozen
 * snapshot final observers receive. Cancellation
 * arriving after entry and before final result materialization skips a
 * not-yet-started body with `ABORTED_BEFORE_DISPATCH` or replaces a
 * successful started outcome with `ABORTED`; already-started work is still
 * drained and may retain a tool-owned structured error.
 * @param exec - the typed same-process call input. The registry assigns its
 *   correlation token before policy begins.
 * @returns the materialized final result.
 */
async execute(exec: ToolExecutionInput): Promise<ToolExecutionResult>
```

Types: [ScopeKey](scope.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="tools-events"></a>

### `tools/*` events

<a id="toolschange--emit"></a>

#### `tools/change` — emit

A tool was registered or unregistered, or a scoped restriction changed (the available tool set changed — possibly for one scope only). An UNFILTERED registry-subject notification, deliberately not scope-filtered dispatch: a global change concerns every agent's next assembly, so a scoped listener subscribing here sees every change, not just its own scope's.

```ts cordis-catalog
/**
 * A tool was registered or unregistered, or a scoped restriction changed
 * (the available tool set changed — possibly for one scope only). An
 * UNFILTERED registry-subject notification, deliberately not scope-filtered
 * dispatch: a global change concerns every agent's next assembly, so a
 * scoped listener subscribing here sees every change, not just its own
 * scope's.
 * @mode emit
 */
'tools/change'(): void
```

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="toolscode-dispatch-log--waterfall"></a>

#### `tools/code-dispatch-log` — waterfall

Allow a listener to replace content in the DURABLE LOG COPY of one `run_code` sub-dispatch outcome before the bridge appends its `tool/code-dispatch` event. `next()` keeps the content unchanged; a listener may return replacement blocks (e.g. the spill policy's preview + locator for an oversized text result). Only the logged copy is affected — the program already received the complete value, and the model sees neither. A throwing listener is contained: the bridge falls back to logging the original settled content. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's dispatches.

```ts cordis-catalog
/**
 * Allow a listener to replace content in the DURABLE LOG COPY of one
 * `run_code` sub-dispatch outcome before the bridge appends its
 * `tool/code-dispatch` event. `next()` keeps the
 * content unchanged; a listener may return replacement blocks (e.g. the
 * spill policy's preview + locator for an oversized text result). Only the
 * logged copy is affected — the program already received the complete
 * value, and the model sees neither. A throwing listener is contained:
 * the bridge falls back to logging the original settled content.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's dispatches.
 * @param dispatch - the parent execution, sub-call identity, and the settled content to log.
 * @mode waterfall
 */
'tools/code-dispatch-log'(this: Scoped<ToolRuntime>, dispatch: CodeDispatchLog, next: () => Promise<ContentBlock[]>): Promise<ContentBlock[]>
```

Types: [ContentBlock](llm-streaming.md) · [Scoped](scope.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="toolsexecute--waterfall"></a>

#### `tools/execute` — waterfall

Around-dispatch waterfall for timeout, retry, or metrics. `next()` returns a normalized result; wrappers may change only `exec.signal`, while call identity remains immutable. The registry re-fuses the original caller signal before the body, so replacement cannot detach caller cancellation; wrappers must still restore their signal and reach quiescence. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.

```ts cordis-catalog
/**
 * Around-dispatch waterfall for timeout, retry, or metrics. `next()` returns
 * a normalized result; wrappers may change only `exec.signal`, while call
 * identity remains immutable. The registry re-fuses the original caller
 * signal before the body, so replacement cannot detach caller cancellation;
 * wrappers must still restore their signal and reach quiescence.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the allowed call about to dispatch (name, parsed arguments, caller agent, signal).
 * @mode waterfall
 */
'tools/execute'(this: Scoped<ToolRuntime>, exec: ToolDispatchExecution, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult>
```

Types: [Scoped](scope.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="toolspost-execute--waterfall"></a>

#### `tools/post-execute` — waterfall

Accept, replace, enrich, or block a normalized dispatch result. `next()` accepts it unchanged; thrown tools still reach this waterfall as errors. Async listeners must observe `exec.signal`; after they settle, caller cancellation replaces only a successful accepted outcome with the code selected by whether the tool body was invoked. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.

```ts cordis-catalog
/**
 * Accept, replace, enrich, or block a normalized dispatch result. `next()`
 * accepts it unchanged; thrown tools still reach this waterfall as errors. Async
 * listeners must observe `exec.signal`; after they settle, caller
 * cancellation replaces only a successful accepted outcome with the code
 * selected by whether the tool body was invoked.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the call that just ran (name, parsed arguments, caller agent).
 * @param result - the dispatch outcome a listener may accept, replace, or block.
 * @mode waterfall
 */
'tools/post-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, result: Readonly<ToolExecutionResult>, next: () => Promise<PostToolDecision>): Promise<PostToolDecision>
```

Types: [Scoped](scope.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="toolspre-execute--waterfall"></a>

#### `tools/pre-execute` — waterfall

Allow, deny, or ask before dispatch. `next()` delegates to allow; missing approval support turns `ask` into denial. Async gates must observe `exec.signal`; the registry rechecks cancellation after they settle but never abandons their promise. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.

```ts cordis-catalog
/**
 * Allow, deny, or ask before dispatch. `next()` delegates to allow; missing
 * approval support turns `ask` into denial. Async gates must observe
 * `exec.signal`; the registry rechecks cancellation after they settle but
 * never abandons their promise.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the pending call (name, parsed arguments, caller agent).
 * @mode waterfall
 */
'tools/pre-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>
```

Types: [Scoped](scope.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="toolsresult--emit"></a>

#### `tools/result` — emit

Observe the frozen, lossless-JSON final outcome. Listener failures are contained. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): keyed by `exec.agent`.

```ts cordis-catalog
/**
 * Observe the frozen, lossless-JSON final outcome. Listener failures are contained.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): keyed by `exec.agent`.
 * @param exec - the execution object that traversed the pipeline.
 * @param result - a deep-frozen snapshot of the final returned result.
 * @mode emit
 */
'tools/result'(this: Scoped<ToolRuntime>, exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): undefined
```

Types: [Scoped](scope.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)
<!-- END GENERATED cordis-surface -->

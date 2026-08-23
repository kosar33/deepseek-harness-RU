# Воркфлоу

[English](workflow.md) | [中文](workflow.zh.md) | Русский

Seam воркфлоу позволяет агенту исполнить написанный моделью оркестрирующий СКРИПТ, запускающий субагентов. Как и [субагент](subagent.ru.md), это **одна необязательная возможность**, а не часть агентского цикла, поэтому её типы и операции живут здесь, а не в [core.md](core.md). Как и bash, он допускает ОДНУ реализацию движка на контекст, предоставляющую `ctx.workflowEngine`; реестра именованных провайдеров нет (второй движок замещает первый через конфигурацию плагинов, а не работает рядом с ним).

Service Definition: [dsh-workflow](../../packages/workflow/workflow) (`ctx.workflowEngine` + словарь ниже). Service Provider — [dsh-workflow-worker-thread](../../packages/workflow/workflow-worker-thread) (движок на `node:worker_threads` — по одному worker на запуск, внутри него vm-контекст скрипта); видимый модели Consumer — [dsh-tool-workflow](../../packages/workflow/tool-workflow). Предложение и обоснование: [Agent Note о динамических воркфлоу](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md).

Источники: безопасный для браузера словарь в [`packages/workflow/workflow/src/types.ts`](../../packages/workflow/workflow/src/types.ts), запрос к хосту и дескрипторы живых запусков в [`runtime-types.ts`](../../packages/workflow/workflow/src/runtime-types.ts).

## Запрос на запуск

Что запрашивает вызывающий при старте запуска. Обычный инструмент воркфлоу собирает его из вызова модели `{ script, meta, args }` плюс вызывающего агента; специализированные потребители могут также выбрать один общедоменный `subagentProvider` и понизить `maxTotalAgents` для этого запуска, но скрипт не может ни наблюдать, ни заменить ни одну из этих политик. `meta` и `args` — обычные JSON-ДАННЫЕ (движок проверяет `meta` по его схеме и отвергает громко ДО того, как что-либо исполнится — ради их получения никакой текст скрипта никогда не вычисляется). `parent` **ОБЯЗАТЕЛЕН** — каждый потомок, запущенный скриптом, атрибутируется ему, а cwd, lineage и глубина проходят через [seam субагентов](subagent.ru.md).

```ts type-equiv
/**
 * What a caller asks for when starting a workflow run. `meta` and `args` are
 * plain JSON data by the seam contract. `parent` is required because every
 * `agent()` spawned by the script is attributed to that live Agent.
 */
interface WorkflowStartRequest {
  /** The plain-JS script body (top-level await allowed; ends with `return <json-value>`). */
  script: string
  /** The workflow's identity block, as plain JSON data (shape-validated by the engine). */
  meta: WorkflowMeta
  /** Optional input exposed verbatim to the script as the `args` global. */
  args?: unknown
  /** Optional engine-wide child-provider override for this run. */
  subagentProvider?: string
  /** Optional per-run total-child ceiling. */
  maxTotalAgents?: number
  /** The agent on whose behalf the run executes (parent of every child). */
  parent: Agent
  /** Cancels the run when aborted. */
  signal?: AbortSignal
}
```

## Идентичность воркфлоу: `WorkflowMeta`

Блок идентичности, переносимый как данные в запросе на запуск (параметр `meta` инструмента; набор полей совпадает с meta-блоком dynamic-workflows из Claude Code). `phases` — только словарь прогресса: вызовы `phase()` сопоставляются с заголовками для наблюдателей; никакой структуры исполнения это не подразумевает.

```ts type-equiv
/**
 * The script's identity block, provided as plain JSON data alongside the
 * script body (the model-facing tool carries it as its `meta` parameter) and
 * validated by the engine before the body runs. `name`/`description` are
 * required; the rest is optional annotation. The field vocabulary matches the
 * Claude Code dynamic-workflows meta block.
 */
interface WorkflowMeta {
  /** Short kebab-case workflow name (display + persistence key). */
  name: string
  /** One-line description of what the workflow does. */
  description: string
  /** Optional guidance on when this workflow applies (shown in listings). */
  whenToUse?: string
  /** Optional phase declarations matched by `phase()` calls. */
  phases?: WorkflowPhase[]
}
```

## Итоговый результат: `WorkflowResult`

Итог одного запуска, разрешаемый через `WorkflowRun.result`. `value` — материализованное возвращаемое значение скрипта — обычные JSON-данные мира хоста (`null`, когда скрипт ничего не вернул) — осмысленное только для `completed`. `stopReason` — ЗАМКНУТОЕ объединение (принадлежит движку; потребители могут его исчерпывать): `completed` | `cancelled` | `error`. Причина, отличная от `completed`, несёт сбой в `error`, а потребитель отображает её в результат инструмента `isError`, а не выдаёт частичный вывод за успех.

```ts type-equiv
/**
 * The outcome resolved by a live workflow run. `value` is
 * the script's materialized return value (plain host-realm JSON data; `null`
 * when the script returned `undefined`) — meaningful only for `completed`.
 * A non-`completed` reason carries the failure in `error`; the consumer maps
 * it to an `isError` tool result rather than reporting partial output.
 */
interface WorkflowResult {
  /** The script's return value (host JSON data; `null` for no return). */
  value: unknown
  /** Why the run settled. */
  stopReason: WorkflowStopReason
  /** The failure message (present iff `stopReason` is not `completed`). */
  error?: string
  /**
   * How many `agent()` calls the run accepted over its whole lifetime. On a
   * graceful settlement this is the script-side count (calls still queued for
   * a concurrency slot included); on a termination path (grace force-settle,
   * worker death) it degrades to the host-observed count — calls queued
   * inside a terminated script are unknowable then.
   */
  agentsStarted: number
}
```

## Живой запуск: `WorkflowRun`

Дескриптор, который потребитель держит, пока исполняется скрипт. Потребитель ожидает `result`, может `cancel` на полпути и **ДОЛЖЕН** вызывать `dispose` на каждом пути. `result` НЕ отклоняется — сбой скрипта разрешается с `stopReason: 'error'` — и после отмены запуска тот ЗАВЕРШАЕТСЯ в пределах ограниченной отсрочки движка, даже если сам скрипт не завершается никогда (движок принудительно завершает `cancelled`; движок на worker-потоках затем терминирует worker скрипта), поэтому потребитель, ожидающий `result`, никогда не застревает из-за отмены. `dispose()` = cancel + то ограниченное завершение + quiescence потомков (полное завершение всех их жизненных циклов); он никогда не виснет на застрявшем скрипте.

```ts type-equiv
/**
 * Holder-owned live workflow. `result` never rejects; consumers may cancel
 * and must call idempotent `dispose()` to await script and child quiescence.
 */
interface WorkflowRun {
  readonly id: WorkflowRunId
  /** The validated meta block available before the script body runs. */
  readonly meta: WorkflowMeta
  readonly result: Promise<WorkflowResult>
  /** Cancel the run and its children. */
  cancel(reason?: string): void
  /** Cancel if needed and await bounded settlement and cleanup. */
  dispose(): Promise<void>
}
```

## Дисциплина сбоев: `WorkflowError.fatal`

Ошибочное использование хуков внутри скрипта — плохие аргументы, неизвестные/отложенные опции `agent()`, схема вне [подмножества structured-output](../../packages/core/tools/README.md), сработавший потолок, неудачный запуск через seam, отмена — бросает `WorkflowError` с `fatal: true`. Комбинаторы `parallel()`/`pipeline()` ПЕРЕБРАСЫВАЮТ фатальные ошибки вместо отображения элемента в `null`: опция с опечаткой должна громко убить скрипт, а не раствориться в чём-то, что выглядит как обычный сбой потомка. Поэлементный `null` зарезервирован за сбоями дочерних запусков (причина остановки, отличная от `completed`) и обычными ошибками скрипта внутри стадии.

## События

События `workflow/*` (`workflow/start`, `workflow/phase`, `workflow/log`, `workflow/agent-start`, `workflow/agent-end`, `workflow/end` — см. [каталог событий](#cordis-surface)) — это эмиты **только для наблюдения**, несущие СНИМКИ ДАННЫХ: каждая полезная нагрузка начинается с `WorkflowRunInfo` (id + meta), а не с живого `WorkflowRun`, поэтому подписчик не может заполучить `cancel`/`dispose`, а `workflow/end` сознательно опускает значение результата (слушатель, наблюдающий исходы, не должен получать изменяемый псевдоним результата вызывающего). Каждый эмит локализован по слушателю — подписчик, бросающий исключение, логируется, никогда не пробрасывается дальше и не может вызвать голодание зарегистрированных после него слушателей, — и каждый слушатель получает собственный клон полезной нагрузки, так что её изменение не портит ни движок, ни других слушателей; эта локализация зеркалит `subagent/start`/`subagent/end`.

## Долговечные записи Chat

Потребитель верхнего уровня `dsh-tool-workflow` проецирует факты отображения в родительскую Session вызывающего, не меняя владельца исполнения. Он пишет `tool-workflow/run-start` после принятия запуска, сопоставляет старты и концы членов по `runId + seq` и пишет `tool-workflow/run-end` только после того, как результат известен, а освобождение ресурсов достигло quiescence. Вложенные транспортные вызовы записей не пишут. Первая ошибка добавления в журнал отключает дальнейшие записи для этого запуска, поэтому журнал остаётся пустым или законным непрерывным префиксом, а результат инструмента не меняется.

`dsh-tool-workflow/invariant` проверяет тот же протокол перед живой фиксацией и при загрузке Session: один старт на запуск, положительные уникальные последовательности членов, парные окончания членов, отсутствие запуска, оканчивающегося с открытыми членами, и отсутствие обновлений после окончания запуска. Отсутствующее окончание члена или запуск, оканчивающийся на хвосте журнала, — законное свидетельство прерывания, а не повреждение.

`dsh-client-ui-workflow-run` сворачивает четыре события через движок Conversation Node в один Chat-узел `workflow-run`, заякоренный на последовательности старта запуска, после исходного узла инструмента воркфлоу. Группы фаз происходят только из фактических стартов членов и сохраняют точные строки, включая различие между опущенной фазой и `''`. Закрытые Locations превращают отсутствие терминальных фактов в прерванное представление. Раскрытием, статусом и локальной навигацией в пределах того же родителя владеет [README UI-пакета](../../packages/client/ui-workflow-run/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworkflowengine--workflowengine-abstract-seam"></a>

### `ctx.workflowEngine` — `WorkflowEngine` (abstract seam)

Workflow Service Definition contract. Invalid requests throw before publication; a live run is holder-owned, its result never rejects, cancellation and disposal are bounded, and disposal waits for child cleanup within that bound. Lifecycle listener failures are contained, and `workflow/end` fires exactly once as the result settles.

```ts cordis-catalog
/**
 * Parse and execute a workflow script.
 * @param request - the script, its `args`, the parent agent, and an
 *   optional cancel signal.
 * @returns the live run; its `result` resolves when the script settles.
 */
abstract start(request: WorkflowStartRequest): WorkflowRun
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflow-events"></a>

### `workflow/*` events

<a id="workflowagent-end--emit"></a>

#### `workflow/agent-end` — emit

One `agent()` call settled (clean result, child failure, or run cancellation). Paired with Events['workflow/agent-start'] by `agent.seq`, exactly once per started call on every stop path — on an engine termination path (a worker killed past its grace) the end is engine-synthesized with outcome `'cancelled'`.

```ts cordis-catalog
/**
 * One `agent()` call settled (clean result, child failure, or run
 * cancellation). Paired with {@link Events['workflow/agent-start']} by
 * `agent.seq`, exactly once per started call on every stop path — on an
 * engine termination path (a worker killed past its grace) the end is
 * engine-synthesized with outcome `'cancelled'`.
 * @param info - the run's identity snapshot.
 * @param agent - the call identity plus its outcome.
 * @mode emit
 */
'workflow/agent-end'(info: WorkflowRunInfo, agent: WorkflowAgentEndInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowagent-start--emit"></a>

#### `workflow/agent-start` — emit

One `agent()` call established a published child run. Paired with Events['workflow/agent-end'] by `agent.seq`. A call that never receives a published run from the provider emits neither event in this pair.

```ts cordis-catalog
/**
 * One `agent()` call established a published child run. Paired with
 * {@link Events['workflow/agent-end']} by `agent.seq`. A call that never
 * receives a published run from the provider emits neither
 * event in this pair.
 * @param info - the run's identity snapshot.
 * @param agent - the call's sequence number, label, phase, and child id.
 * @mode emit
 */
'workflow/agent-start'(info: WorkflowRunInfo, agent: WorkflowAgentInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowend--emit"></a>

#### `workflow/end` — emit

A workflow run settled (any stop reason). Fired when WorkflowRun.result resolves. Paired with Events['workflow/start'].

```ts cordis-catalog
/**
 * A workflow run settled (any stop reason). Fired when
 * {@link WorkflowRun.result} resolves. Paired with
 * {@link Events['workflow/start']}.
 * @param info - the run's identity snapshot.
 * @param result - the outcome data (stop reason, error, agent count) —
 *   deliberately WITHOUT the result value (see {@link WorkflowResultInfo}).
 * @mode emit
 */
'workflow/end'(info: WorkflowRunInfo, result: WorkflowResultInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowlog--emit"></a>

#### `workflow/log` — emit

The script emitted a narration line (a `log(message)` call).

```ts cordis-catalog
/**
 * The script emitted a narration line (a `log(message)` call).
 * @param info - the run's identity snapshot.
 * @param message - the logged message, verbatim.
 * @mode emit
 */
'workflow/log'(info: WorkflowRunInfo, message: string): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowphase--emit"></a>

#### `workflow/phase` — emit

The script entered a phase (a `phase(title)` call) — progress grouping for observers; no execution semantics.

```ts cordis-catalog
/**
 * The script entered a phase (a `phase(title)` call) — progress grouping
 * for observers; no execution semantics.
 * @param info - the run's identity snapshot.
 * @param title - the phase title, verbatim.
 * @mode emit
 */
'workflow/phase'(info: WorkflowRunInfo, title: string): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowstart--emit"></a>

#### `workflow/start` — emit

A workflow run started — the script's meta block validated, the body about to execute. Paired with Events['workflow/end'].

```ts cordis-catalog
/**
 * A workflow run started — the script's meta block validated, the body
 * about to execute. Paired with {@link Events['workflow/end']}.
 * @param info - the run's identity snapshot (id + meta).
 * @mode emit
 */
'workflow/start'(info: WorkflowRunInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)
<!-- END GENERATED cordis-surface -->

# Цели текущей сессии

[English](goal.md) | [中文](goal.zh.md) | Русский

Типы, разделяемые event-sourced сервисом целей и его потребителями политики. Решениями о персистентности и активации владеет [Agent Note домена целей](../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.md); эта страница фиксирует точные поля и варианты из [`packages/goal/goal/src/types.ts`](../../packages/goal/goal/src/types.ts).

## Идентичность и жизненный цикл

`GoalId` — [брендированный идентификатор](core.md#branded-ids). Вызывающий мутирует одну точную ревизию через `GoalRef`; каждая принятая долговечная мутация увеличивает ревизию.

```ts type-equiv
/** Compare-and-set identity for one exact goal revision. */
interface GoalRef {
  /** Stable goal identity. */
  readonly id: GoalId
  /** Positive revision; every durable mutation increments it. */
  readonly revision: number
}
```

Долговечная фаза отвечает на вопрос, что стало с целью. Процессно-локальная активация отдельно отвечает на вопрос, может ли потребитель продолжений начать ещё один раунд.

```ts type-equiv
/** Durable continuation phase. Activation is process-local and separate. */
type GoalPhase =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'complete'
```

Блокировка — единственное долговечное состояние «остановлено из-за проблемы». Принадлежащая политике причина несёт стабильный код в lower-kebab-case для маршрутизации и свободную форму объяснения для людей и моделей.

```ts type-equiv
/** Machine-routable and human-readable explanation for a blocked goal. */
interface GoalBlockReason {
  /** Stable lower-kebab-case classification chosen by the blocking policy. */
  readonly code: string
  /** Non-empty explanation shown to humans and models. */
  readonly message: string
}
```

```ts type-equiv
/** Full durable state written by every non-clear goal mutation. */
interface GoalSnapshot extends GoalRef {
  /** Human-requested completion objective. */
  readonly objective: string
  /** Durable lifecycle phase. */
  readonly phase: GoalPhase
  /** Present exactly while `phase` is `blocked`. */
  readonly blockedReason?: GoalBlockReason
  /** Total admitted goal-round cap. */
  readonly maxGoalRounds: number
}
```

```ts type-equiv
/** Current goal projection, including values derived from the session log. */
interface GoalView extends GoalSnapshot {
  /** Highest admitted round number for this goal. */
  readonly roundsStarted: number
  /** Epoch milliseconds of the create mutation. */
  readonly createdAt: number
  /** Epoch milliseconds of the latest mutation. */
  readonly updatedAt: number
  /** Process-local continuation eligibility; never persisted. */
  readonly activation: GoalActivation
}
```

## Долговечные изменения

Каждая мутация — долговечное событие сессии `goal/change`, чья полезная нагрузка — либо полный послемутационный снимок, либо надгробие очистки (clear). Строгая свёртка и персистентная проекция выводят состояние жизненного цикла только из этих событий; мутации инбокса на состояние цели не влияют.

```ts type-equiv
/** Full-snapshot goal mutation committed by a durable `goal/change` event. */
interface GoalSnapshotChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: Exclude<GoalOperation, 'clear'>
  readonly goal: GoalSnapshot
  readonly roundsStarted: number
  readonly createdAt: number
  readonly updatedAt: number
}
```

```ts type-equiv
/** Tombstone retained when the current goal is cleared. */
interface GoalClearChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: 'clear'
  readonly cleared: GoalRef
  readonly clearedAt: number
}
```

Потребитель продолжений атрибутирует каждый допущенный ход с пользовательским сообщением положительным последовательным номером раунда и текущей ревизией; только эти допущенные события `user/message` продвигают `roundsStarted`. Воспроизведение отвергает неположительные раунды, пропуски, устаревшие ревизии, остановленные фазы и переполнение потолка.

```ts type-equiv
/** Message attribution for admitted continuation rounds. */
interface GoalMessageSource {
  readonly kind: 'goal'
  readonly goalId: GoalId
  readonly revision: number
  /** Positive admitted continuation round. */
  readonly round: number
}
```

## Запросы и уведомления

Создание отделяет пропуск со стороны вызывающего от выбора развёртывания, который `create()` разрешает внутренне. Правка — частичная замена, чей рантайм-валидатор требует хотя бы одно поле. Каждое уведомление о мутации несёт принятую операцию и точную ревизию; при clear поле `goal` опускается.

```ts type-equiv
/** Input whose omitted round cap is resolved by the service configuration. */
interface CreateGoalRequest {
  readonly objective: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Fields changed by an edit; at least one must be present. */
interface EditGoalRequest {
  readonly objective?: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Live notification after one durable goal mutation commits. */
interface GoalChanged {
  readonly operation: GoalOperation
  readonly ref: GoalRef
  /** Absent for a clear tombstone. */
  readonly goal?: GoalView
}
```

## Поведение сервиса

[`GoalService`](../../packages/goal/goal/src/index.ts) разрешает значения по умолчанию при создании, выполняет строгую свёртку воспроизведения по долговечным событиям `goal/change`, требует точной живой идентичности агента и compare-and-set мутаций и эмитит локализованные уведомления `goal/changed`. Вызываемый API и видимый модели контракт определяет [README пакета](../../packages/goal/goal/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxgoals--goalservice"></a>

### `ctx.goals` — `GoalService`

Goal service (`ctx.goals`) backed exclusively by the owning session log.

```ts cordis-catalog
/**
 * Read the current goal for one exact live agent.
 * @param agent - owning live agent.
 * @returns a fresh view or `undefined` when no goal is current.
 * @throws {@link GoalError} when the agent is not the registry's live instance.
 */
get(agent: Agent): GoalView | undefined

/**
 * Remove process-local continuation authority without changing durable goal
 * phase or revision. Lifecycle owners use this before unloading a driver;
 * a later human-authorized {@link resume} records the new activation edge.
 * @param agent - owning live agent.
 * @returns a fresh disarmed view, or `undefined` when no goal is current.
 */
disarm(agent: Agent): GoalView | undefined

/**
 * Create and arm a goal. A completed goal may be replaced; every other
 * current phase must be cleared or resumed instead.
 * @param agent - owning live agent.
 * @param request - objective and optional round cap.
 * @returns the created live view.
 */
create(agent: Agent, request: CreateGoalRequest): GoalView

/**
 * Edit objective and/or round cap without changing phase.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @param request - at least one replacement field.
 * @returns the edited view.
 */
@Remote('edit') edit(agent: Agent, ref: GoalRef, request: EditGoalRequest): GoalView

/**
 * Pause an active goal and disarm automatic continuation.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the paused view.
 */
@Remote('pause') pause(agent: Agent, ref: GoalRef): GoalView

/**
 * Resume and arm a stopped goal, or rearm an active goal after a
 * session-start edge, while its round budget still has capacity.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the active view.
 */
@Remote('resume') resume(agent: Agent, ref: GoalRef): GoalView

/**
 * Mark a current non-complete goal complete and disarm it.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the completed view.
 */
@Remote('complete') complete(agent: Agent, ref: GoalRef): GoalView

/**
 * Mark an active goal blocked and disarm it.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @param reason - policy-owned stable code and human-readable explanation.
 * @returns the blocked view with its durable reason.
 */
block(agent: Agent, ref: GoalRef, reason: GoalBlockReason): GoalView

/**
 * Clear the current goal while retaining a durable tombstone and history.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the tombstone ref whose revision is one past the cleared snapshot.
 */
@Remote('clear') clear(agent: Agent, ref: GoalRef): GoalRef

/**
 * Create one Goal through the remote boundary.
 * @param agent - exact live Agent resolved from the wire identity.
 * @param request - objective and optional round cap.
 * @returns the created Goal identity.
 */
@Remote('create') remoteExportCreate(agent: Agent, request: CreateGoalRequest): CreateGoalResult
```

Types: [Agent](core.md)

Source: [`packages/goal/goal/src/index.ts`](../../packages/goal/goal/src/index.ts)

<a id="goal-events"></a>

### `goal/*` events

<a id="goalchanged--emit"></a>

#### `goal/changed` — emit

Goal mutation accepted by one live agent. The matching `goal/change` session event has already committed. Listener failures are contained. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.

```ts cordis-catalog
/**
 * Goal mutation accepted by one live agent. The matching `goal/change`
 * session event has already committed. Listener failures are contained.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @param payload.agent - agent whose session owns the goal.
 * @param payload.change - fresh current projection or clear tombstone.
 * @mode emit
 */
'goal/changed'(this: import('@deepseek-ai/dsh-scope').Scoped<Agent>, payload: { agent: Agent; change: GoalChanged }): void
```

Types: [Agent](core.md) · [Scoped](scope.md)

Source: [`packages/goal/goal/src/domain.ts`](../../packages/goal/goal/src/domain.ts)
<!-- END GENERATED cordis-surface -->

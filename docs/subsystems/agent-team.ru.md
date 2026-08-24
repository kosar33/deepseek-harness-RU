# Команды агентов

[English](agent-team.md) | [中文](agent-team.zh.md) | Русский

Типы, общие для экспериментального домена команд с неявным корнем, модельных инструментов и хостовых адаптеров. Владельцем решений об идентичности, почтовом ящике, задачах и общем чекауте является [Agent Note о командах агентов](../../.agents/notes/implemented/feature/2026-08-05-agent-teams.md); эта страница фиксирует точные формы долговременного хранения из [`packages/experimental/agent-team/src/types.ts`](../../packages/experimental/agent-team/src/types.ts).

## Идентичность и состав

`TeamId` — это корневой `SessionId` под отдельным [брендом](core.ru.md#брендированные-id). `TeamTaskId` локален для команды и выделяется монотонно в виде `task-<n>`; `TeamMessageId` глобально случаен. Идентификатор сессии участника команды остаётся его постоянной идентичностью, а `name` — неизменяемая метка для модели и интерфейса.

```ts type-equiv
/** Whole durable value written on every teammate lifecycle change. */
interface TeamMemberSnapshot {
  readonly id: SessionId
  readonly name: string
  readonly description: string
  readonly provider: string
  readonly context: 'fresh' | 'fork'
  readonly phase: TeamMemberPhase
  readonly error?: string
}
```

Каждый участник начинает в `provisioning` и достигает ровно одной терминальной фазы состава — `active` или `failed`. Статус `running`/`idle`/`inactive` во время исполнения выводится отдельно и никогда не перезаписывает эту запись.

## Долговременный почтовый ящик

Сессия-лид сначала сохраняет полное сообщение при постановке в очередь. Квитанция цели подтверждается только после того, как ожидающий элемент её входящих или записанное пользовательское сообщение станет долговременным; разность «в очереди минус доставленные» остаётся почтовым ящиком восстановления.

```ts type-equiv
/** One peer message retained until its target Session records it. */
interface TeamMessageSnapshot {
  readonly id: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
  readonly targetId: SessionId
  readonly delivery: 'quiet' | 'wakeup'
  readonly content: ContentBlock[]
}
```

Целевая сессия хранит идентичность сообщения и атрибуцию отправителя и в ожидающем элементе входящих, и в итоговом пользовательском сообщении. Свёртка этого источника между входящими и историей служит ключом дедупликации на стороне цели; видимая модели подача повторяет идентификатор и отправителя.

```ts type-equiv
/** Source retained by the target Session for durable mailbox de-duplication. */
interface TeamMessageSource {
  readonly kind: 'team-message'
  readonly teamId: TeamId
  readonly messageId: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
}
```

## Общий DAG задач

Каждое событие задачи сохраняет полный снапшот. `revision` — значение compare-and-set; оно увеличивается на единицу при каждой мутации. Рёбра `blockedBy` ДОЛЖНЫ указывать неудалённые задачи и сохранять ацикличность графа. `writeScopes` — нормализованные рекомендательные префиксы путей, а не блокировки.

```ts type-equiv
/** Whole durable task snapshot; every mutation increments {@link revision}. */
interface TeamTaskSnapshot {
  readonly id: TeamTaskId
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: TeamTaskStatus
  readonly ownerId?: SessionId
  readonly blockedBy: TeamTaskId[]
  readonly writeScopes: string[]
}
```

`pending` — не начата или освобождена, `in_progress` имеет владельца, `completed` удовлетворяет условиям разблокировки, а `deleted` — сохраняемое надгробие. Представления добавляют имя владельца, готовность и предупреждения о пересечении областей записи, не меняя долговременный снапшот.

## Воспроизведение

`foldTeam()` воспроизводит по одной корневой сессии состав, доску задач и почтовый ящик «в очереди минус доставленные», которые читает каждая операция команды. Он отбирает записи по `TeamId`, поэтому события, унаследованные при обычном fork, сохраняют идентификатор предка и никогда не попадают в состояние нового корня. Поля `seq` и `time` событий сессии остаются записью порядка и времени; снапшоты команды их не дублируют. Чтения состава и задач доходят до вызывающих как представления, добавляющие имя владельца, готовность и предупреждения о пересечении областей записи, тогда как ожидающая почта остаётся внутренней деталью доставки и восстановления. Владельцем поведения операций, авторизации, восстановления и лимитов является [README пакета](../../packages/experimental/agent-team/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxagentteams--teamservice"></a>

### `ctx.agentTeams` — `TeamService`

Agent Teams service backed by the exact live Lead Session log.

```ts cordis-catalog
/**
 * Resolve one exact live Agent's Team role.
 * @param agent - exact live Agent used as the authority credential.
 * @returns its root, Team identity, role, and model-facing name.
 */
membership(agent: Agent): TeamMembership

/**
 * List the runtime-enriched roster visible to one Team member.
 * @param agent - exact live Team member.
 * @returns Lead and teammate rows in creation order.
 */
listMembers(agent: Agent): TeamMemberView[]

/**
 * Create one named, continuable direct child of the Team Lead.
 * @param caller - exact live Lead Agent.
 * @param request - immutable name, description, prompt, context mode, provider, and cancellation.
 * @returns the active roster row.
 */
async spawnTeammate(caller: Agent, request: SpawnTeammateRequest): Promise<SpawnTeammateResult>

/**
 * Queue one durable peer message, then attempt immediate delivery.
 * @param caller - exact live sending Team member.
 * @param request - target name, content, scheduling mode, and pre-queue cancellation.
 * @returns durable message identity and immediate-delivery observation.
 */
async sendMessage(caller: Agent, request: SendTeamMessageRequest): Promise<SendTeamMessageResult>

/**
 * Create one unowned pending task in the Team Lead log.
 * @param caller - exact live Team member creating the task.
 * @param request - task text, blockers, and advisory write scopes.
 * @returns the revision-one task view.
 */
async createTask(caller: Agent, request: CreateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Return one task, including a deleted tombstone.
 * @param caller - exact live Team member reading the task.
 * @param id - Team-local task identity.
 * @returns the latest task value and derived readiness diagnostics.
 */
getTask(caller: Agent, id: TeamTaskId): TeamTaskView

/**
 * List current non-deleted tasks in numeric creation order.
 * @param caller - exact live Team member reading the board.
 * @returns detached current task views.
 */
listTasks(caller: Agent): TeamTaskView[]

/**
 * Compare-and-set one authorized task transition.
 * @param caller - exact live Team member authorizing the mutation.
 * @param request - task identity, expected revision, action, and action fields.
 * @returns the committed next task revision.
 */
async updateTask(caller: Agent, request: UpdateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Wait for the next Team-domain or member-status change.
 * @param caller - exact live Team member waiting for activity.
 * @param timeoutMs - bounded wait duration from ten seconds through one hour.
 * @param signal - caller cancellation for the wait only.
 * @returns one observed change or a timeout result.
 */
async waitForChange(caller: Agent, timeoutMs: number, signal: AbortSignal): Promise<TeamWaitResult>

/**
 * Interrupt one live teammate turn without clearing its pending inbox.
 * @param caller - exact live Lead Agent.
 * @param targetName - durable teammate name.
 * @returns the target status sampled before cancellation.
 */
interrupt(caller: Agent, targetName: string): { previousStatus: 'running' | 'idle' | 'inactive' }

/**
 * Resolve a caller without throwing, used by scoped-tool installation and observers.
 * @param agent - candidate exact live Agent.
 * @returns Team membership, or undefined for non-Team subagents and stale identities.
 */
tryMembership(agent: Agent): TeamMembership | undefined
```

Types: [Agent](core.md)

Source: [`packages/experimental/agent-team/src/index.ts`](../../packages/experimental/agent-team/src/index.ts)
<!-- END GENERATED cordis-surface -->

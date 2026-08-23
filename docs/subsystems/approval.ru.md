# Одобрения пользователей

[English](approval.md) | [中文](approval.zh.md) | Русский

Seam пользовательских одобрений в [dsh-user-approval](../../packages/interaction/user-approval) отвечает на один вопрос: можно ли выполнить это конкретное действие? Он владеет общим словарём запросов/результатов, сервисом диспетчеризации `ctx.approval`, каскадом ответчиков `approval/request`, парой аудит-событий только для журнала и политикой `ask`/`never` на уровне сессии. Каналы UI могут предоставлять человеческих ответчиков; [мост автоматизации ACP](../../packages/acp/acp) выдаёт одноразовые машинные решения для собственных агентов. Вызывающие стороны вроде [dsh-tools](../../packages/core/tools) и [dsh-tool-bash](../../packages/shell/tool-bash) потребляют закрытый результат и действуют по принципу fail-closed, если он не равен `allowed-once`.

Источник: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

## Идентичность и результат

Каждый запрос получает свежий `ApprovalRequestId`. Бренд связывает аудит-события `approval/asked` и `approval/decided`, не делая идентификаторы одобрений взаимозаменяемыми с идентификаторами вызовов инструментов или агентов/сессий.

```ts type-equiv
/**
 * Pairs one `approval/asked` audit event with its `approval/decided`.
 * Service-issued (one fresh id per {@link ApprovalService.request} call).
 */
type ApprovalRequestId = Branded<'ApprovalRequestId'>
```

`ApprovalOutcome` закрыт и действует по принципу fail-closed. `allowed-once` разрешает только то действие, о котором спрашивали; вызывающие стороны трактуют `rejected`, `cancelled` и `unavailable` как отказ. Отсутствующий, не владеющий запросом, падающий или возвращающий значение вне словаря ответчик превращается в `unavailable`, а не пропускает действие.

```ts type-equiv
/**
 * Closed approval outcomes: a one-shot grant, explicit rejection, withdrawn
 * request, or unavailable answerer. Callers fail closed on `unavailable`.
 */
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
```

## Политика на уровне сессии

`ApprovalPolicy` определяет, что происходит до запуска интерактивных ответчиков. `ask` делегирует составленной цепочке ответчиков, чьим умолчанием при отсутствии ответа служит `unavailable`; `never` детерминированно возвращает `rejected`, не диспетчеризуя ни одного ответчика. Действующее значение — последнее событие `approval/policy` в журнале сессии, с откатом к конфигурации сервиса. `setApprovalPolicy(session, policy)` — единственный путь записи, поэтому воспроизведение восстанавливает переопределение.

```ts type-equiv
/**
 * A session's approval policy — what happens to an {@link ApprovalService}
 * ask BEFORE any interactive answerer sees it:
 *
 * - `'ask'` (the default) — delegate to the composed answerers; with none
 *   composed the chain falls through to the fail-closed `'unavailable'`.
 * - `'never'` — never prompt anyone: every ask resolves `'rejected'`
 *   deterministically. The strict headless stance (CI, unattended runs) and
 *   the policy whose outcome is knowable without asking.
 */
type ApprovalPolicy = 'ask' | 'never'
```

Обе политики вносят своё полное текущее значение в безопасный для кэша снапшот runtime-контекста. Событие `user/message` с атрибуцией источника — долговременный модель-видимый ввод; изменение состояния одобрений добавляет новый полный снапшот после сохранённой истории, не переписывая системный промпт в заголовке запроса.

## Запрос одобрения

`ApprovalRequest` опознаёт агента и действие инструмента достаточно точно, чтобы направить вопрос и провести его аудит. Он сознательно опускает аргументы инструмента: ответчик прикрепляет промпт к вызову инструмента, уже передаваемому потоком через `callId` вместо рендеринга второй копии, способной разойтись.

```ts type-equiv
/**
 * Readonly same-process permission question. `callId` links to an already
 * presented tool call, so arguments are not duplicated here.
 */
interface ApprovalRequest {
  /**
   * The agent on whose behalf the question is asked. Routes the question (a
   * UI answerer only answers for agents it owns) and receives the audit
   * events on its session log.
   */
  readonly agent: Agent
  /** The tool the question is about (presentation and audit). */
  readonly toolName: string
  /**
   * The exact tool call being decided, when the asker has one — lets a UI
   * attach the prompt to the tool call it already streamed.
   */
  readonly callId?: CallId
  /** The asker's human-readable explanation of WHY it is asking. */
  readonly reason?: string
  /**
   * Aborting withdraws the question: the request settles `'cancelled'`
   * immediately and a late answer from a still-pending answerer is discarded.
   */
  readonly signal?: AbortSignal
}
```

## Диспетчеризация и аудит

`ctx.approval.request(req)` требует, чтобы запрашивающая сессия находилась внутри открытого хода. Он добавляет `approval/asked`, получает один результат, добавляет соответствующий `approval/decided` и завершается этим результатом. Политика `never` соблюдается внутри сервиса до каскадной диспетчеризации, поэтому даже ответчик, зарегистрированный позже с `prepend`, не может её обойти. Ответчики возвращают результат, когда владеют запросом, или вызывают `next()` для делегирования; первый ответ занимает единственный слот решения.

Аудит-события существуют только в журнале и не попадают в транскрипт модели. Модель-видимое поведение — производный результат инструмента у вызывающей стороны плюс текущий снапшот runtime-контекста. Освобождение ресурсов сервиса убирает его вклад в контекст; слушатели-ответчики независимо привязаны эффектами к владеющим им плагинам.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxapproval--approvalservice"></a>

### `ctx.approval` — `ApprovalService`

Approval service that applies session policy before answerers and logs every ask/outcome pair to the requesting session. It exposes deterministic policy changes to the model through the runtime-context snapshot and switch notices.

```ts cordis-catalog
/**
 * Switch one live agent's policy and queue the transition for its next model
 * step. Session initialization uses {@link setApprovalPolicy} directly
 * because there is no previously visible policy to change.
 * @param agent - the live agent whose policy is changing.
 * @param policy - the new effective policy.
 */
setPolicy(agent: Agent, policy: ApprovalPolicy): void

/**
 * Ask the composed answerers to decide one readonly same-process request.
 * The service borrows the request, agent, session, and live signal directly.
 * The request requires an open turn because the audit pair must be enclosed
 * by the durable log's commit/replay boundary; an idle ask rejects before
 * appending anything. The answerer phase always produces an outcome: an
 * aborted signal yields `'cancelled'`, a missing or throwing answerer yields
 * `'unavailable'` (fail closed), and a rogue non-vocabulary return value is
 * normalized to `'unavailable'`. A failure that prevents either audit append
 * from committing still rejects because returning an unlogged decision would
 * violate the pair. Session contains post-commit observer failures, so an
 * authoritative append cannot reject the request or suppress its matching
 * audit event.
 * @param req - the pending decision (agent, tool identity, reason, signal).
 * @returns the closed outcome; `'allowed-once'` is the only grant.
 * @throws when no turn is open or either audit event fails before the session
 *   append commit point.
 */
async request(req: ApprovalRequest): Promise<ApprovalOutcome>

/**
 * Read the session override without applying the configured default.
 * @param session - session whose log supplies the override.
 * @returns the last logged policy, or `undefined` without one.
 */
overrideOf(session: Session): ApprovalPolicy | undefined
```

Types: [Agent](core.md) · [Session](session.md)

Source: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

<a id="approval-events"></a>

### `approval/*` events

<a id="approvalrequest--waterfall"></a>

#### `approval/request` — waterfall

Ask composed answerers for one decision. Return an outcome to claim the request or call `next()`; failure yields the fail-closed default. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.

```ts cordis-catalog
/**
 * Ask composed answerers for one decision. Return an outcome to claim the
 * request or call `next()`; failure yields the fail-closed default.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @param req - the pending decision (agent, tool identity, reason, signal).
 * @mode waterfall
 */
'approval/request'(this: Scoped<ApprovalService>, req: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome>
```

Types: [Scoped](scope.md)

Source: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)
<!-- END GENERATED cordis-surface -->

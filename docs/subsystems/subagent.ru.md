# Субагент

[English](subagent.md) | [中文](subagent.zh.md) | Русский

Seam субагентов позволяет агенту делегировать работу дочернему агенту. Как и [bash](shell.ru.md), это **одна необязательная возможность**, а не часть агентского цикла, поэтому её типы живут здесь, а не в [core.ru.md](core.ru.md). От прочих capability seam'ов он отличается тем, что в одном контексте **сосуществуют несколько реализаций провайдеров**, зарегистрированных по имени (`ctx.subagents`), тогда как bash допускает лишь одного исполнителя. Его реестр следует образцу [реестра LLM-адаптеров](llm-streaming.md), а не односервисного исполнителя bash.

Service Definition: [dsh-subagent](../../packages/subagent/subagent) (`ctx.subagents` + словарь ниже). Service Providers — соседние пакеты (`dsh-subagent-spawn-in-process`, `-fork`, `-acp`, `-codex`, `-claude-code`, `-dsh-sdk`); видимые модели Consumer — [dsh-tool-subagent](../../packages/subagent/tool-subagent) (делегация конкретному провайдеру), [dsh-tool-subagent-control](../../packages/subagent/tool-subagent-control) (необязательные глобальные управления `send_message`, `interrupt_agent` и `list_agents`) и [dsh-tool-subagent-report](../../packages/subagent/tool-subagent-report) (необязательный скоупированный на потомка канал возврата `report`). Тот же сервис `ctx.subagents` владеет оркестрацией продолжаемых дочерних агентов через внутренний менеджер активаций и read-only обнаружением детей и потомков напрямую из хранилища сессий и опциональной персистентности сессий. Обоснование продуктовых провайдеров живёт в [Agent Note о бэкендах Codex и Claude Code](../../.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.md); обоснование общего seam'а — в [Agent Note о субагентах](../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.md), [Agent Note о продолжаемых субагентах](../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.md), [Agent Note об инструменте report](../../.agents/notes/implemented/feature/2026-07-30-continuable-subagent-report-tool.md), [Agent Note о долговечном каталоге](../../.agents/notes/implemented/feature/2026-07-22-durable-subagent-catalog-and-list-agents.md), [Agent Note о list-identity-проекции](../../.agents/notes/implemented/architecture/2026-08-06-subagent-list-identity-projection.md) и [Agent Note о слитом сервисе](../../.agents/notes/implemented/simplification/2026-07-26-merge-subagent-control-service.md).

Источники: [`packages/subagent/subagent/src/types.ts`](../../packages/subagent/subagent/src/types.ts), [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts) и [`packages/subagent/subagent/src/continuation.ts`](../../packages/subagent/subagent/src/continuation.ts)

## Два вида возможностей, два способа обнаружения

Провайдер объявляет свои возможности **на момент старта** в статическом дескрипторе, который сервис проверяет ДО того, как разовый запуск существует; запрос, требующий отсутствующей у провайдера возможности, отвергается громко (`SubagentError('UNSUPPORTED_CAPABILITY')`), а не принимается с последующим игнорированием. Эти флаги описывают только разовый путь [`start()`](#контракт-провайдера-subagentprovider), где потомка собирает провайдер. **Продолжаемые** же потомки собираются самим менеджером продолжений, поэтому они ограждены одним необязательным методом, само наличие которого и есть возможность, а механизмом обнаружения служит TS-narrowing: [`SubagentProvider.prepareContinuable`](#контракт-провайдера-subagentprovider).

```ts type-equiv
/**
 * Which START-TIME features a provider supports. Checked by the service before delegating to
 * {@link SubagentProvider.start}: a request that needs a capability the chosen provider lacks
 * is rejected with a typed error rather than accepted-then-ignored (the "fail loud, no silent
 * degradation" rule). These flags describe the ONE-SHOT
 * {@link SubagentProvider.start} path, where the provider composes the child;
 * continuable children are composed by the continuation manager itself and are
 * gated by {@link SubagentProvider.prepareContinuable} instead. Each flag
 * corresponds one-to-one to a {@link SubagentStartRequest} option: `depthLimit`
 * to `maxDepth`; the other names match.
 */
interface SubagentCapabilities {
  readonly outputSchema: boolean
  readonly depthLimit: boolean
  readonly toolFilter: boolean
  readonly persona: boolean
}
```

## Разовый запрос на запуск

Слой инструментов собирает этот запрос из ввода модели и собственной конфигурации; сервис валидирует его против именованного провайдера до `start`. Обязательный `parent` поставляет cwd сессии, lineage и глубину делегации. Необязательные выходная схема, глубина, фильтр инструментов и персона требуют соответствующих флагов возможностей. Неподдерживаемые схемы падают на старте; внутрипроцессные бэкенды скоупируют фильтры и персоны на создание потомка и реализуют поддерживаемую схему с корнем-объектом через навязанный инструмент захвата.

```ts type-equiv
/**
 * What a caller asks for when starting a ONE-SHOT subagent. The tool layer
 * builds this from the model's `{ description, prompt }` plus its own config;
 * the service validates {@link SubagentCapabilities} against the named provider
 * and resolves the durable descriptor before dispatching to
 * {@link SubagentProvider.start}.
 */
interface SubagentStartRequest {
  /** Optional short display label persisted with a session-backed child. */
  readonly label?: string
  /** Content delivered as the child's user message. */
  readonly prompt: ContentBlock[]
  /**
   * The spawning agent. In-process providers derive workspace, lineage, and
   * delegation depth from its durable session state. ACP reads only its cwd,
   * and only when no deployment `cwd` override is configured.
   */
  readonly parent: Agent
  /**
   * Cancellation signal from the spawning context (the tool's `exec.signal`).
   * This is the canonical cancellation channel both before and after startup:
   * a provider rejects `start()` after cleaning partial resources when it
   * fires before the run is published, and cancels the published run's
   * remaining turn work when it fires afterward.
   */
  readonly signal: AbortSignal
  readonly agentOptions?: AgentOptions
  /**
   * Object-rooted JSON Schema within `assertObjectJsonSchema`'s enforced subset. Start rejects
   * unsupported schemas or providers without the capability. Data must be plain host-realm JSON;
   * a successful child returns the matching value as {@link SubagentResult.structured}.
   */
  readonly outputSchema?: ObjectJsonSchema
  /**
   * Optional absolute delegation-depth cap for the child being started: its
   * computed depth must be less than or equal to this non-negative safe
   * integer. Requires {@link SubagentCapabilities.depthLimit}; rejected at
   * start otherwise.
   */
  readonly maxDepth?: number
  /**
   * Optional child tool scoping. Requires {@link SubagentCapabilities.toolFilter};
   * rejected at start otherwise. In-process backends apply it as a scoped
   * `tools.restrict()` in the child's creation window: the named tools vanish
   * from the child's prompt AND refuse to execute (one visibility), with loud
   * unknown-name validation.
   */
  readonly toolFilter?: ToolRestriction
  /**
   * Optional per-child persona. Requires {@link SubagentCapabilities.persona};
   * rejected at start otherwise. In-process backends register it as a scoped
   * `deployment:persona` section on the child, SHADOWING the deployment's
   * persona for this child alone — same template semantics as the deployment
   * persona (strict `{{…}}` interpolation against the registered variables).
   */
  readonly persona?: string
}
```

`signal` — единственный канал отмены до и после готовности. Персоной, живым глобальным фильтром инструментов, абсолютной глубиной и принципом «видимость — не полномочие» владеет [Agent Note об управлении композицией субагентов](../../.agents/notes/implemented/feature/2026-07-12-subagent-persona-tool-filter-and-depth.md).

Запрос, обращённый к вызывающему, не несёт деталей формата каталога или состояния продолжения. `SubagentRuntime.start()` разрешает отсоединённый разовый дескриптор после проверок возможностей, затем передаёт этот обращённый к провайдеру запрос выбранному транспорту; продолжаемый потомок никогда не доходит до `SubagentProvider.start()`:

```ts type-equiv
/**
 * Provider-facing one-shot request after {@link SubagentRuntime.start} resolves
 * the durable child descriptor.
 */
interface ResolvedSubagentStartRequest extends SubagentStartRequest {
  /** Detached descriptor a session-backed provider persists in the child log. */
  readonly descriptor: SubagentDescriptorData
}
```

## Продолжаемые потомки и активации

**Продолжаемый фоновый субагент** — одна долговечная дочерняя Session максимум с одной процессно-локальной **активацией**, периодом, когда реконструированный дочерний Agent резидентен. Активация — не запрос, не результат, не отмена и не Task: она может исполнить много FIFO-ходов и остаётся резидентной, пока созданные ею потомки ещё работают. Менеджер продолжений владеет допуском активаций, авторизацией прямого родителя, графом живого владения, холодным возобновлением и освобождением ресурсов в порядке «потомок первым»; порядок всех ходов и их исполнение принадлежат циклу Agent. Ни один продолжаемый путь не создаёт Task или промежуточной обёртки, несущей результат.

```text
persisted Session
  -> optional live Activation
       -> one retained AgentHandle
       -> Agent inbox as the only turn FIFO
       -> zero or more owned child Activations
```

`SubagentRuntime.startContinuable()` резервирует стабильный id потомка, делает снимок версионируемой полезной нагрузки `subagent/descriptor`, запрашивает у именованного провайдера его отсоединённый `ContinuableCreateSpec`, создаёт дочерний Agent через приватный скоуп владельца активаций, устанавливает отношение владения «продолжаемый родитель» и отправляет начальный промпт. Он разрешается с `{ childId, messageId }`, когда приём в инбокс даёт идентификатор сообщения — не дожидаясь ни старта хода, ни попадания сообщения в журнал Session. Любой сбой до этого приёма отклоняется без обоих id, освобождая созданный дескриптор и откатывая активацию вместе с родительским владением.

`SubagentRuntime.followup()` — единственная операция доставки сообщения-продолжения, и маршрутизация зависит только от резидентности активации:

| Состояние активации | `followup` |
|---|---|
| `running` | поставить в очередь той же активации |
| `waiting` | разбудить ту же активацию |
| нет активации | холодно возобновить новую активацию |

`running` означает, что Agent имеет активный допуск или ход либо просыпающуюся работу инбокса; `waiting` — что он в quiescence (полное завершение всех жизненных циклов), но всё ещё владеет минимум одной дочерней активацией, не завершившей освобождение ресурсов; `settled` — что он в quiescence и каждый принадлежащий ему потомок освобождён, после чего менеджер освобождает [`AgentHandle`](core.ru.md#создание-и-владение) и удаляет активацию. Эти внутренние условия менеджер выводит из quiescence агента и множества принадлежащих ему потомков, а не ведёт вторую машину состояний исполнения.

Инбокс агента — единственная очередь. Каждое сообщение-продолжение становится одним FIFO-ходом `Agent.followup()`, поэтому принятые сообщения имеют один наблюдаемый порядок, а последующее сообщение не может перенаправить уже идущий ход. Успешная доставка возвращает принятый `MessageId`; существующие события `agent/inbox/inserted`, `agent/inbox/claimed` и `agent/inbox/discarded` остаются наблюдениями жизненного цикла сообщения, а слой продолжений не определяет никакого специфичного для субагентов маршрута доставки.

Полномочия на продолжение происходят из точного живого контекста инструментов Agent. Аутентифицированный Agent должен быть прямым родителем долговечного потомка, записанным в `SessionHeader.parentSession`. `MessageSource` и `senderSessionId` фиксируют, кто предоставил допущенное сообщение, но полномочий не дают; необязательный видимый модели инструмент использует `CoordinatorMessageSource`.

Для обеих операций сигнал вызывающего владеет поиском, материализацией и допуском только до приёма в инбокс. После этого менеджер владеет активацией независимо: последующая отмена со стороны вызывающего не отменяет принятый ход и не освобождает потомка, а seam не выставляет операции steering (корректировка хода диалога).

`SubagentRuntime.interrupt(targetSessionId, authority)` — единственная публичная остановка: она авторизует синхронно, выдаёт `Agent.cancel(cause, { keepInbox: true })` живой цели и возвращается, не дожидаясь quiescence. Активация, её невостребованная ожидающая работа инбокса и опубликованные потомки не затрагиваются; работа, уже взятая в прерванный ход, обратно в очередь не ставится. Когда прерванный драйвер простаивает, будящая отправка возобновляет припаркованную FIFO-очередь. Отсутствующая цель — неизвестная, разовая или уже завершившаяся — и композиция без менеджера принимаются как допустимые no-op. Для живой цели несовпадающий адрес родителя или вызывающий вне её живой линии происхождения отклоняются с `UNAUTHORIZED`; устаревшие объекты предков и запросы предка к самому себе отклоняются ещё до поиска цели.

```ts type-equiv
/**
 * Authority under which one interrupt request is admitted. `user` carries the
 * durable direct-parent address a human client presented; `ancestor` carries
 * the exact live Agent object whose recorded lineage must contain the caller.
 */
type SubagentInterruptAuthority =
  | { readonly kind: 'user'; readonly parentSessionId: SessionId }
  | { readonly kind: 'ancestor'; readonly agent: Agent }
```

Каждая активация владеет своим `AgentHandle` и `ownedChildren: Set<SessionId>`; поскольку у одной Session максимум одна живая активация, id дочерней Session идентифицирует живого потомка без дополнительной ссылки на рантайм-инкубацию. Запуск потомка или отправка работы от родителя регистрирует потомка в множестве управляемого продолжениями родителя прежде, чем потомок сможет работать, и такой родитель не может завершиться, пока множество непусто. Агент верхнего уровня или иной непродолжаемый Agent не имеет активации и остаётся вне графа ожидания. Освобождение потомка происходит только после того, как дочерний Agent достиг quiescence, каждый его собственный потомок освобождён, финальная flush сессии (в режиме best-effort) разрешилась, а `AgentHandle` потомка завершил освобождение.

Финальное завершение ожидает `ctx.sessions.flush(session)`, но игнорирует его булев флаг участия, поскольку произвольный слушатель не может доказать, что бэкенд персистентности сохранил состояние. Отклонение логируется без провала активации, и менеджер всё равно освобождает дескриптор и отпускает владение; сохранённое состояние потомка может тогда отсутствовать или оказаться устаревшим при следующем возобновлении. При выгрузке менеджер вызывает внутренний общий drain, закрывающий допуск и освобождающий каждый живой лес; `drainContinuableDescendants(parents)` закрывает допуск только под точными живыми принадлежащими хосту Agent и освобождает их продолжаемых потомков, пока посторонние леса остаются живыми. Оба пути ожидают уже допущенные материализации в своей области, распространяют отмену сверху вниз, освобождают дескрипторы в порядке «потомок первым» и ожидают каждую выбранную ветвь несмотря на отдельные сбои. Долговечные дочерние Session переживают этот процессно-локальный демонтаж.

```ts type-equiv
/** Attribution for a model coordinator's follow-up to one of its children. */
interface CoordinatorMessageSource {
  readonly kind: 'coordinator'
  /** A message another agent addressed to this one (`relay` context form). */
  readonly form: 'relay'
  /** Session id of the agent whose tool call produced the follow-up. */
  readonly senderSessionId: SessionId
}
```

```ts type-equiv
/** Options for following up with one continuable child. */
interface SubagentFollowupOptions {
  /** Durable attribution retained on the delivered message; it grants no authority. */
  readonly source: MessageSource
  /** Caller cancellation, owning the operation only until inbox acceptance. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Identities returned once a continuable child accepted its initial prompt. */
interface ContinuableStart {
  /** The durable child session id, stable across activations. */
  readonly childId: SessionId
  /** The accepted initial prompt's inbox message id. */
  readonly messageId: MessageId
}
```

Необязательный вклад setup продолжаемого потомка может установить scope-local возможности после базовой композиции потомка и до публикации активации. Реестр упорядочен и транзакционен: неудавшийся или отозванный setup откатывает неопубликованную активацию, освобождение скоупа потомка выпускает каждую установку, новые регистрации влияют на следующую активацию, а удаление регистрации немедленно отзывает каждую резидентную установку.

`SubagentRuntime.reportFrom()` использует эту точку расширения, не добавляя ни второй очереди, ни обёртки потомка, несущей результат. Вызов авторизует точный живой дочерний Agent; вызывающие не могут назвать получателя. Единственного получателя менеджер выводит из долговечного `parentSession` потомка, требует, чтобы родительский Agent был жив, оформляет выбранное содержимое как одно пользовательское сообщение `subagent-report` и возвращает стабильный `MessageId` сообщения. Тихая доставка использует `Agent.inject()` и не будит родителя; доставка «следующим шагом» использует `Agent.steer()`, будя простаивающего родителя или присоединяясь к ближайшей границе шага работающего родителя. Ни один режим не завершает ход потомка, и никакой финальный ответ не репортится имплицитно.

```ts type-equiv
/** Durable attribution for a continuable child's explicit parent report. */
interface SubagentReportMessageSource {
  readonly kind: 'subagent-report'
  /** A message another agent addressed to this one (`relay` context form). */
  readonly form: 'relay'
  /** Session id of the reporting child. */
  readonly senderSessionId: SessionId
}
```

```ts type-equiv
/** Deployment scheduling policy for accepted child reports. */
type SubagentReportDelivery = 'quiet' | 'next-step'
```

Репорт — выбор самого потомка, поэтому менеджер ведёт и отдельный собственный учёт: когда резидентная активация завершается, он доставляет одно уведомление долговечному прямому родителю потомка, описывающее, чем закончилась та эпоха, и несущее его финальное содержимое ассистента. Эта доставка безусловна для каждого потомка, чей id получил вызывающий, происходит до освобождения владения, которое позволило бы считать родителя завершённым, и достигает резидентного родителя через тот же учёт будящего допуска, что и репорт. Родитель, чья собственная линия происхождения уже разбирается, получает его без пробуждения, потому что пробуждение агента в quiescence начинает ход, а не ставит работу в очередь. Его происхождение — отдельный kind, чтобы транскрипт никогда не выдавал рантайм-учёт за написанное потомком.

```ts type-equiv
/**
 * Durable attribution for the runtime's own account of a continuable child
 * settling. Deliberately a different kind from
 * {@link SubagentReportMessageSource}: a report is content the child chose,
 * while this message is the manager stating what became of the child, and a
 * transcript that merged them would credit the child with words it never wrote.
 */
interface SubagentSettledMessageSource {
  readonly kind: 'subagent-settled'
  /** A runtime account shown without expanding the row (`notice` context form). */
  readonly form: 'notice'
  /** One-line account of how the child ended. */
  readonly summary: string
  /** Session id of the child that settled. */
  readonly senderSessionId: SessionId
}
```

```ts type-equiv
/** Options for one continuable child's report to its direct parent. */
interface SubagentReportOptions {
  /** Already-resolved parent scheduling policy. */
  readonly delivery: SubagentReportDelivery
  /** Caller cancellation, owning authorization and admission until acceptance. */
  readonly signal: AbortSignal
}
```

Провайдер участвует только в подготовке начальной спецификации создания — там, где `spawn` и `fork` различаются. Возвращённая им спецификация несёт только отсоединённые специфичные для провайдера входы создания — сегодня это необязательный сид истории родителя — и никаких операций: ни Agent, ни `AgentHandle`, ни доставки промпта, ни результата, ни освобождения ресурсов, ни возобновления. Холодное возобновление вообще не диспатчится через провайдера: менеджер сворачивает общий дескриптор, вызывает `ctx.agents.resume()` через тот же скоуп владельца активаций и отправляет ожидающий ход.

```ts type-equiv
/**
 * What the continuation manager asks a provider for while materializing one
 * continuable child's FIRST activation. The manager has already reserved the
 * durable child identity and owns every later operation, so this request
 * carries only what distinguishes a fresh child from one seeded with parent
 * history.
 */
interface ContinuableCreateRequest {
  /** The reserved durable child session id, for provider diagnostics. */
  readonly sessionId: SessionId
  /** The delegating parent agent whose history a seeding provider reads. */
  readonly parent: Agent
  /**
   * Caller cancellation, which owns preparation only until the manager accepts
   * the initial prompt into the child's inbox.
   */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/**
 * A provider's detached contribution to one continuable child's creation. This
 * is DATA, never a capability: it carries no Agent, `AgentHandle`, prompt
 * delivery, result, disposal, or resume operation, because the continuation
 * manager owns the child's whole lifecycle after preparation.
 */
interface ContinuableCreateSpec {
  /**
   * Completed-turn prefix of the parent's log to seed the child session with,
   * or absent for a fresh child. Same durable contract as
   * `CreateAgentOptions.seed`: contiguous from seq 0, lossless JSON, balanced.
   */
  readonly seed?: readonly SessionEvent[]
}
```

Дескриптор (`SubagentDescriptorData` в [descriptor.ts](../../packages/subagent/subagent/src/descriptor.ts)) — различаемая по режиму долговечная идентичность каждого сессионного субагента. Оба режима несут имя провайдера. Разовый (`one-shot`) дескриптор необязательно несёт принадлежащую вызывающему отображаемую `label`; продолжаемый (`continuable`) дескриптор требует `description` делегации как свою долговечную метку создания и дополнительно делает снимок разрешённых `agentOptions.provider`/`model` потомка и необязательных `persona`/`toolFilter` для холодного возобновления. Он никогда не снимает сам объект `AgentOptions`, расширяемый слиянием, поэтому постороннее значение расширения не может сломать продолжение, а более поздний вход композиции — сознательное изменение версии. Он опускает `subagentDepth` (холодное возобновление доверяет сохранённому в заголовке `delegationDepth` как монотонному нижнему полу) и `outputSchema` (контракт результата одного запуска или активации, а не долговечная идентичность).

Локальный разовый провайдер добавляет дескриптор внутри начального хода потомка до его первого запроса. Менеджер продолжений добавляет дескриптор после любой поставленной провайдером линии происхождения и прежде, чем начальный промпт будет допущен; `header.seedLength` остаётся границей fork-lineage: при возобновлении авторитет по дескриптору читает собственный суффикс потомка, тогда как проекция идентичности, обслуживающая списки, сворачивает `subagent/descriptor` по правилу «последний побеждает», так что собственный дескриптор потомка перекрывает дескриптор предка, засеянного форком. Событие живёт только в журнале: без `surfaceOp`, никогда в истории модели, и удерживается сквозь компакцию append-only журналом. Некорректный дескриптор текущей версии — повреждение; неподдерживаемые версии этот рантайм классифицировать не может.

## Долговечное перечисление: `listChildren()`, `listDescendants()` и их элементы

`SubagentRuntime.listChildren(parentSessionId)` перечисляет прямых сессионных субагентов родителя из объединения `ctx.sessions.list()` и необязательного `ctx.sessionPersistence.list()` с предпочтением живых — без сервисных запросов, и никакой Agent не загружается и не возобновляется. Кандидаты — прямые дети, чей долговечный заголовок несёт `origin: 'subagent'`; маркер классифицирует перечисление и грубое отклонение общего маршрута, но не может установить корректность дескриптора, возобновляемость или авторизацию — идентичностью владеет свёртка проекции, а возобновлением — контракт активации. `mode`/`label` каждой строки — значение зарегистрированной проекционной единицы `subagent`, выдаваемое через трёхступенчатую лестницу: кэш watermark реестра для живого потомка (ноль чтений журнала); необязательный кэш чекпоинтов проекции для холодного (`cachedSnapshot` — идентичность, прошедшая seq-гейт собственного суффикса, окончательна, ибо собственный дескриптор неизменяем после добавления); иначе одно чтение `persistence.inspect()`, сворачиваемое через реестр (ограниченный параллелизм, пересчёт на каждое перечисление). Кэш — чистый опциональный ускоритель: при отсутствии, выдаче sentinel-значения `null`, отсутствии ключа, провале seq-гейта или сбое он молча проваливается к авторитетному пересворачиванию. Свёртка — `subagent/descriptor` «последний побеждает» без канала сбоев: собственный дескриптор потомка перекрывает дескриптор засеянного форком предка, а некорректная полезная нагрузка или неизвестная версия сворачивается в сериализуемый sentinel `null`, считаемый отсутствием значения. Результат — один `SubagentListEntry[]` в порядке `createdAt`, затем id: обслуженная идентичность даёт элемент `child` с `mode: 'one-shot' | 'continuable'` и `activity: 'running' | 'inactive'`; продолжаемые элементы всегда несут `label`, тогда как разовые несут её, только когда вызывающий старта передал метаданные представления. Завершившийся кандидат, чья свёртка не выдала идентичности, даёт диагностику `corrupt` — отсутствующие и некорректные дескрипторы и неизвестные версии сознательно неразличимы (`unsupported` остаётся в типе, но никогда не порождается); работающий кандидат без идентичности опускается (окно создания до того, как его дескриптор ляжет в журнал); неудавшаяся холодная инспекция даёт одну диагностику `unavailable`, повторяемую при следующем перечислении, поэтому один повреждённый сосед не может спрятать здоровых детей. `hasChildren` помечает прямого потомка с долговечным субагентным происхождением, читаемым из того же объединённого материала. Снимок активности фиксирует только то, жива ли логическая запись в `ctx.sessions`, но не исход и не возобновляемость. Без персистентности перечисление охватывает только живых, а не является ошибкой — холодного потомка тогда всё равно нельзя возобновить. `listChildren()` бросает `SubagentError` с кодом `SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE`, когда отсутствует реестр `ctx.sessionProjections`, и `SUBAGENT_CONTROL_SESSION_STORE_UNAVAILABLE`, когда отсутствует хранилище сессий; оба условия проверяются до любого чтения, поэтому развёртывание без единого потомка всё равно падает детерминированно, а инструмент списка требует `ctx.subagents` и `ctx.agents` при загрузке плагина. Потребитель сервиса вроде UI может показывать оба режима и выбирать немаркированный разовый fallback, тогда как видимый модели адаптер `list_agents` (отдельно загружаемый плагин `/list-agents` из [dsh-tool-subagent-control](../../packages/subagent/tool-subagent-control)) оставляет только продолжаемые элементы и уточняет статус через живой реестр Agent в собственный словарь `running`/`idle`/`ready`, где `ready` называет существующего только в хранилище потомка возобновляемым, а не терминальным. Перечисление не консультируется ни с картой активаций менеджера продолжений, ни с реестром Agent, ни с доступностью провайдеров; `send_message` остаётся авторитетной операцией времени доставки, и перечисленный работающий продолжаемый потомок всё ещё может отклонить доставку как конфликт владения. Обоснование пути чтения живёт в [Agent Note о list-identity-проекции](../../.agents/notes/implemented/architecture/2026-08-06-subagent-list-identity-projection.md).

`SubagentRuntime.listDescendants(rootSessionId)` применяет тот же корпус с предпочтением живых и основанную на проекции интерпретацию к полному дереву потомков корня в стабильном pre-order. Обычные сессии и разовые дети остаются узлами обхода, поэтому продолжаемые потомки под ними обнаруживаются; строки порождают только кандидаты с `origin: 'subagent'`. Каждый возвращённый потомок или диагностика добавляет свою позицию из перечисленного долговечного заголовка, а холодная инспекция перед выдачей идентичности заново проверяет весь этот жизненный цикл:

```ts type-equiv
/**
 * One entry of a descendant listing: the interpreted subagent facts plus its
 * position in the complete session tree. `parentId` is the durable direct
 * parent from the enumerated header, and `depth` counts edges from the root.
 */
type SubagentDescendantListEntry = SubagentListEntry & {
  /** Durable direct parent of this candidate in the enumerated tree. */
  readonly parentId: SessionId
  /** Edge distance from the requested root; direct children are `1`. */
  readonly depth: number
}
```


## Итоговый результат: `SubagentResult`

Исход разового запуска, разрешаемый через `SubagentRun.result`. `structured` присутствует только после того, как запрошенная `outputSchema` была успешно удовлетворена; запрос схемы не гарантирует её, и провайдер может вернуть `stopReason: 'error'`, когда потомок падает или заканчивает без корректного захвата. Провайдер может приложить безопасный, не ассистентский `diagnostic` к результату с причиной, отличной от `completed`; провайдер убирает входы инструментов, содержимое файлов, значения окружения, учётные данные и сырые полезные нагрузки протокола и ограничивает полное значение 4096 байтами UTF-8, прежде чем потребители покажут его отдельно от `output`. `stopReason`, отличный от `completed`, означает, что `output` может быть частичным — потребитель отображает его в результат инструмента `isError`, а не выдаёт частичный вывод за успех.

```ts type-equiv
/**
 * The terminal outcome of a subagent run, resolved by {@link SubagentRun.result}.
 */
interface SubagentResult {
  /**
   * The child's final assistant output is the content of its last non-empty
   * assistant message. Empty-content messages, including usage-only messages,
   * are skipped. Without a non-empty message, the output is its accumulated
   * assistant text stream, or `[]` when the child produced neither.
   */
  readonly output: ContentBlock[]
  /**
   * The structured result after a requested `outputSchema` was successfully
   * satisfied. Requesting a schema does not guarantee presence: a provider can
   * end with `stopReason: 'error'` when the child fails or finishes without a
   * valid capture. The structured value is validated against the requested
   * output schema by the provider; `unknown` here because the seam is
   * schema-agnostic.
   */
  readonly structured?: unknown
  /**
   * Provider-authored, non-assistant failure detail for a non-`completed`
   * result. Providers keep this text free of tool inputs, file contents,
   * environment values, credentials, and raw protocol payloads, and limit it
   * to 4096 UTF-8 bytes. Consumers present it separately from {@link output}.
   */
  readonly diagnostic?: string
  /** Why the run ended. A non-`completed` reason means `output` may be partial. */
  readonly stopReason: SubagentStopReason
}
```

`SubagentStopReason` — [производное объединение, расширяемое слиянием](core.ru.md#паттерн-map--derived-union) — бэкенд может добавить варианты, поэтому потребители ветвятся по известным случаям и считают неизвестную причину завершения сбоем:

```ts type-equiv
/**
 * Why a subagent run ended. Merge-extensible (a backend may add variants);
 * consumers branch on the known cases and fall through `default`. The known
 * cases mirror the harness turn-end vocabulary so the tool layer can map a
 * non-`completed` result to an `isError` tool result.
 */
interface SubagentStopReasonMap {
  /** The child finished its turn normally. */
  completed: 'completed'
  /** Cancelled through the request signal or disposal. */
  aborted: 'aborted'
  /** Model or transport failure. */
  error: 'error'
  /** The child hit its token ceiling before finishing. */
  'max-tokens': 'max-tokens'
  /** The child declined the task. */
  refusal: 'refusal'
}
```

## Разовый запуск: `SubagentRun`

`SubagentRun` — принадлежащий потребителю дескриптор опубликованного разового потомка — одно делегирование на переднем плане с одним результатом, освобождаемое потребителем, а вовсе не долговечный дескриптор потомка. Отправка промпта, работа хода и инфраструктурные сбои после публикации принадлежат `result`. Потребители ожидают этот результат и всегда освобождают запуск ради достижения quiescence. Сбои потомка разрешаются причиной остановки, отличной от completed; отклоняются лишь непредставимые инфраструктурные сбои. У запуска нет ни steering, ни возобновления: продолжаемые разговоры вообще не имеют запуска, потому что менеджер продолжений держит их `AgentHandle` напрямую и упорядочивает каждый ход через собственный инбокс потомка.

```ts type-equiv
/**
 * ONE-SHOT child handle returned after publication. Prompt submission, turn
 * work, and infrastructure faults after that boundary belong to {@link result}.
 * Consumers await that result and must always {@link dispose} to cancel
 * remaining work and reach quiescence. A run is one disposable foreground
 * delegation with one result; continuable conversations have no run — the
 * continuation manager holds their `AgentHandle` directly and orders every
 * turn through the child's own inbox.
 */
interface SubagentRun {
  /**
   * Parent-scoped run id. For a local run, this MUST equal the published child
   * session id, whose `parentSession` records `request.parent.session.id`; a
   * remote provider mints an id unique in the parent namespace.
   */
  readonly id: SessionId
  /**
   * The exact published in-process child, or `undefined` for a remote run.
   * When present, its id is {@link id}; the provider retains no ownership
   * implication beyond the run's ordinary {@link dispose} contract.
   */
  readonly localAgent: Agent | undefined
  /**
   * Resolves with the child's terminal {@link SubagentResult} when the run
   * settles. Does NOT reject on a child-level failure — a model/transport
   * failure resolves with `stopReason: 'error'` so the consumer maps it to an
   * `isError` tool result. Rejects on an infrastructure fault the seam cannot
   * represent as a stop reason.
   */
  readonly result: Promise<SubagentResult>
  /**
   * Cancel remaining work, reach child quiescence, and release resources.
   * Idempotent.
   */
  dispose(): Promise<void>
}
```

Локальный разовый запуск **ДОЛЖЕН** опубликовать обычный дочерний агент/session до выполнения `start()`, вернуть id той дочерней сессии как `SubagentRun.id`, выставить точного потомка как `localAgent`, записать `request.parent.session.id` в заголовок `parentSession` потомка и добавить разрешённый дескриптор внутри начального хода потомка до его первого запроса. Владение рантайма может поместить потомка под родителя, провайдера или корневой скоуп. Удалённый провайдер вместо этого возвращает скоупированный на родителя идентификатор жизненного цикла и `localAgent: undefined`; без локальной дочерней Session он отсутствует в долговечном перечислении.

<a id="контракт-провайдера-subagentprovider"></a>

## Контракт провайдера: `SubagentProvider`

Каждый провайдер — именованный транспорт дочерних агентов, и несколько провайдеров могут сосуществовать. Сервис валидирует запрошенные возможности старта до `start()` и отклоняет продолжаемый запуск на провайдере без `prepareContinuable`. `inheritsParentContext` описывает только засев разговора (`fork`: true; `spawn` и `acp`: false), позволяя потребителям генерировать точную видимую модели формулировку, не подразумевая унаследованных инструментов, сервисов или полномочий.

```ts type-equiv
/**
 * One registered transport for running child agents. Providers are trusted
 * same-process implementations; callers treat descriptors and returned values
 * as borrowed immutable data. The service may call one provider concurrently
 * for distinct children. Providers isolate operation-local mutable state; a
 * shared capacity controller may delay an operation but must not couple its
 * settlement or cleanup to a sibling.
 */
interface SubagentProvider {
  /** Unique registry name (e.g. `spawn`, `fork`, `acp`). */
  readonly name: string
  /** The start-time features this provider supports (see {@link SubagentCapabilities}). */
  readonly capabilities: SubagentCapabilities
  /**
   * Whether the child sees the parent's completed-turn prefix. This is descriptive, not a
   * service-validated start capability: the model-facing tool derives truthful wording from it.
   * It says nothing about tool registration, injected services, or authority inheritance.
   */
  readonly inheritsParentContext: boolean
  /**
   * Establish a ONE-SHOT child and return its handle after publication.
   * The service has already validated that every requested start-time
   * capability is supported and resolved `request.descriptor`, so a
   * session-backed implementation appends that descriptor inside the child's
   * initial turn. Before fulfillment, the provider owns setup and cleans any
   * unpublished partial resources before rejecting. Ownership transfers on
   * fulfillment; subsequent turn or infrastructure failure settles through
   * the returned run. Distinct starts may overlap; cancellation, failure,
   * result settlement, and disposal remain independent for each run.
   */
  start(request: ResolvedSubagentStartRequest): Promise<SubagentRun>
  /**
   * OPTIONAL (continuable-creation capability): contribute the detached
   * creation inputs that distinguish this provider's continuable children —
   * only whether the child session is seeded with parent history. Method
   * presence IS the capability: the service rejects continuable starts on
   * providers without it, while a provider that has it may still serve
   * ordinary one-shot delegations.
   *
   * This is the provider's ONLY participation in a continuable child. The
   * continuation manager owns identity reservation, composition, Agent
   * creation, prompt delivery, cold resume, ownership, and disposal, so a
   * provider never sees the child's Agent, handle, turns, or teardown.
   * Distinct preparations may overlap; each follows its own signal and returns
   * data belonging only to `request.sessionId`.
   */
  prepareContinuable?(request: ContinuableCreateRequest): Promise<ContinuableCreateSpec>
}
```

Провайдерский `start()` выполняется уже опубликованным запуском. Сервис чеканит уникальный `runId`, снимает `local` с точного `localAgent` провайдера, наблюдает результат, эмитит `subagent/start` и возвращает тот же запуск; отклонение `start()` подразумевает уборку неопубликованных ресурсов и не эмитит пары жизненного цикла, тогда как отклонение результата после публикации закрывает эмитнутую пару. Каждая продолжаемая активация эмитит ту же пару «только для наблюдения» для своей эпохи резидентности, поэтому холодное возобновление — новая эпоха со своим `runId`. Парный `subagent/end` несёт ту же идентичность и финальный вывод либо инфраструктурный сбой. Оба события только для наблюдения и локализуют исключения слушателей. Их поле `provider` называет провайдера, начавшего запуск или эпоху активации; оно не утверждает, что провайдер остаётся зарегистрированным к моменту эмита границы.

## Внутрипроцессные бэкенды: глубина и засев

Бэкенды spawn и fork создают обычного разового агента через `parent.ctx`, передают отмену в создание ядра и освобождают ресурсы через `AgentHandle`; продолжаемого же потомка создаёт менеджер продолжений через собственный скоуп владельца активаций. Удаление провайдера блокирует новые запуски, не отзывая принятые запуски. Каждый потомок получает новый плоский скоуп, а не наследует регистрации родителя. Глубина и fork-засев переиспользуют существующий словарь агентов и сессий:

- **Глубина делегации** — долговечный `SessionHeader.delegationDepth` плюс рантайм-поле `AgentOptions.subagentDepth`, расширяемое слиянием; отсутствие означает нулевую глубину верхнего уровня, а большее из присутствующих значений авторитетно. Оба поля принадлежат seam'у — цикл их ни пишет, ни читает, — поэтому внутрипроцессный потомок сохраняет глубину родителя + 1, холодное возобновление не может её понизить, и каждый старт отклоняет выведенную глубину вне домена safe-integer или выше определённого абсолютного потолка `request.maxDepth`.
- **Fork-засев** использует [`CreateAgentOptions.seed`](core.ru.md#создание-и-владение) (префикс `SessionEvent[]`, проведённый через `AgentLoop.createAgent` → `ctx.sessions.prepare({ seed })`, — тот же примитив, что использует `ctx.agents.resume()`). Бэкенд fork передаёт *сбалансированный префикс завершённых ходов* журнала родителя — события родителя включительно до его последнего `turn/end` — поэтому засев непрерывен от 0, и воспроизведение [инвариантов](../../packages/runtime-diagnostics/invariants) принимает его (незавершённый, несбалансированный ход исключён).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsubagents--subagentruntime"></a>

### `ctx.subagents` — `SubagentRuntime`

Named provider registry with one-shot runs, durable discovery, and continuable-child operations.

```ts cordis-catalog
/**
 * Establish one durable continuable child and deliver its initial prompt.
 * Resolves when the child's inbox accepts that prompt, without waiting for the
 * turn to start or for the message to reach the Session log; any earlier
 * failure rejects with no ids and rolls back the child entirely.
 * @param spec - provider, delegation request, and caller cancellation.
 * @returns the durable child id and the accepted prompt's message id.
 * @throws when continuation services are unavailable or materialization fails.
 */
async startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>

/**
 * Deliver one later message to a continuable child as its next FIFO turn. A
 * resident child's Agent inbox accepts it directly (waking a `waiting`
 * Activation), while an absent one is cold-resumed from its persisted
 * Session. The Agent inbox is the only queue, so every accepted message has
 * one observable order.
 * @param parent - the exact live direct parent authorizing this delivery.
 * @param childId - durable child session id.
 * @param content - user-role content to deliver.
 * @param options - the message source fields and caller cancellation, which stops the
 *   operation only before inbox acceptance.
 * @returns the accepted message's inbox id.
 * @throws when continuation services are unavailable, parent authority is
 *   rejected, or the message was not admitted.
 */
async followup( parent: Agent, childId: SessionId, content: ContentBlock[], options: SubagentFollowupOptions, ): Promise<MessageId>

/**
 * Interrupt one live continuable child's current turn under a human parent
 * address or an exact live ancestor Agent. Fire-and-return: the cancel
 * signal is issued before this returns, but the target may keep running
 * until it observes the signal. Unclaimed pending inbox work, the Activation,
 * and published descendants are preserved; claimed work is not requeued.
 * Once the interrupted driver is idle, a waking send resumes the parked FIFO
 * queue. An absent target — including a one-shot or unknown id —
 * is an accepted no-op, as is a manager-less composition, which cannot own a
 * live Activation.
 * @param targetSessionId - the durable child session id to interrupt.
 * @param authority - the human parent address or exact live ancestor Agent.
 * @throws {SubagentError} `UNAUTHORIZED` when the authority does not own the
 *   live target.
 */
interrupt(targetSessionId: SessionId, authority: SubagentInterruptAuthority): void

/**
 * Deliver selected content from one live continuable child to its durable
 * direct parent. The child is the authority credential; callers cannot name a
 * recipient. Reporting does not conclude the child's turn or Activation.
 * @param child - exact live reporting child.
 * @param content - selected model-facing content.
 * @param options - parent scheduling and pre-acceptance cancellation.
 * @returns the stable identity of the parent-accepted message.
 * @throws when continuation services are unavailable, sender authorization
 *   fails, or the direct parent is not live.
 */
async reportFrom( child: Agent, content: ContentBlock[], options: SubagentReportOptions, ): Promise<MessageId>

/**
 * Compose one deployment capability into every continuable child's
 * unpublished creation context on fresh creation and cold resume. Grants wait
 * for the next Activation; removing the contribution revokes every resident
 * installation immediately.
 * @param contribution - synchronous child-scope installer.
 * @returns the exact Cordis effect disposer.
 */
registerContinuableSetup(contribution: ContinuableSetupContribution): () => void

/**
 * Close continuable admission below exact live parent Agents, stop only their
 * visible descendant Activations synchronously, then await admitted scoped
 * materializations and release those forests child-first. The scoped cutoff
 * lasts until each exact parent leaves the registry; unrelated parent trees
 * remain live.
 * @param parents - exact host-owned parent Agents entering teardown.
 * @returns once every retained descendant Activation released its `AgentHandle`.
 * @throws an aggregate error after all branches settle when any failed.
 */
async drainContinuableDescendants(parents: readonly Agent[]): Promise<void>

/**
 * Release selected resident continuable direct children of one exact live
 * parent. Other children of the same parent remain admitted and resident.
 * Absent targets and a manager-less composition are accepted no-ops.
 * @param parent - exact live direct parent authorizing the selected release.
 * @param childIds - durable direct-child ids to release when resident.
 * @returns once every selected Activation released its `AgentHandle`.
 * @throws {SubagentError} `UNAUTHORIZED` when a resident target belongs to a
 *   different parent or the supplied parent identity is stale.
 */
async drainContinuableChildren(parent: Agent, childIds: readonly SessionId[]): Promise<void>

/**
 * Enumerate the parent's direct session-backed subagents without loading or
 * resuming an Agent and without any query service: the listing merges the live
 * session store with optional session persistence (live-preferred) and
 * serves each child's durable mode/label from the registered `subagent`
 * projection unit down a three-rung ladder — the registry's watermark
 * snapshot for a live child; for a cold one, a durable projection-cache
 * row when the optional cache serves an own-suffix identity (its `seq`
 * gate proves the value postdates the fork seed, where a child's own
 * descriptor is immutable once appended), else one persistence inspection
 * folded through the registry. The
 * projection fold is the single classification authority; per-child
 * diagnostics relay a fold that served no identity or a failed inspection,
 * never a list-time descriptor parse. Absent persistence, enumeration is
 * live-only (a cold child cannot be resumed then either, so its absence is
 * capability absence, not an error). This service consults no Agent
 * registrations, Activations, or providers.
 *
 * Every persistence read receives `signal`, and the listing rechecks
 * cancellation around each of those awaits. Read rejections that settle
 * after an abort become a stable `SubagentError` with code `CANCELLED`.
 * @param parentSessionId - parent session whose direct children are listed.
 * @param signal - caller-owned cancellation forwarded to persistence reads
 *   and observed around every read await.
 * @returns children and per-child diagnostics ordered by `createdAt`, then id.
 * @throws {@link SubagentError} when the projection registry or the session
 *   store is not mounted, or the caller cancels the listing.
 */
listChildren(parentSessionId: SessionId, signal?: AbortSignal): Promise<SubagentListEntry[]>

/**
 * Enumerate the root's complete session-backed subagent tree in stable
 * pre-order from one live-preferred corpus, without loading or resuming an
 * Agent. Ordinary sessions and one-shot children remain traversal nodes so
 * continuable descendants below them are discovered; each returned entry
 * adds its durable `parentId` and root-relative `depth`. Identity resolution,
 * diagnostics, optional persistence, and cancellation follow the same
 * projection-backed contract as {@link listChildren}.
 * @param rootSessionId - session whose complete descendant tree is listed.
 * @param signal - caller-owned cancellation forwarded to persistence reads
 *   and observed around every read await.
 * @returns children and per-candidate diagnostics with tree position, in
 *   stable pre-order.
 * @throws {@link SubagentError} under the same conditions as {@link listChildren}.
 */
listDescendants(rootSessionId: SessionId, signal?: AbortSignal): Promise<SubagentDescendantListEntry[]>

/**
 * Register a provider under its name. Registration is effect-scoped and HMR
 * safe; removing a provider blocks new starts but does not revoke runs that
 * were already returned to their holders.
 * @param provider - the trusted provider implementation.
 * @returns the exact Cordis effect disposer.
 */
registerProvider(provider: SubagentProvider): () => void

/**
 * Look up a provider by name.
 * @param name - the provider name.
 * @returns the provider, or undefined when absent.
 */
getProvider(name: string): SubagentProvider | undefined

/**
 * List registered provider names in insertion order.
 * @returns the registered names.
 */
list(): string[]

/**
 * Establish a published child on the named provider. Capability and semantic
 * checks run before delegation. Provider ownership lasts until its promise
 * fulfills; a rejection therefore has no run for the caller to dispose and
 * emits no run lifecycle events. Post-publication turn and infrastructure
 * failures settle through the returned run.
 * @param name - the provider to use.
 * @param request - child label, prompt, parent, signal, and optional capabilities.
 * @returns the published holder-owned run.
 */
async start(name: string, request: SubagentStartRequest): Promise<SubagentRun>
```

Types: [Agent](core.md) · [ContentBlock](llm-streaming.md) · [MessageId](llm-streaming.md) · [SessionId](core.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagent-events"></a>

### `subagent/*` events

<a id="subagentend--emit"></a>

#### `subagent/end` — emit

A published child settled. Scope-filtered dispatch uses the same delegating parent carrier as `subagent/start`, so the lifecycle pair reaches the same scoped audience.

```ts cordis-catalog
/**
 * A published child settled. Scope-filtered dispatch uses the same delegating
 * parent carrier as `subagent/start`, so the lifecycle pair reaches the
 * same scoped audience.
 * @param info - the run identity and terminal outcome.
 * @dshScopeScan unsupported
 * @mode emit
 */
'subagent/end'(this: Scoped<SubagentRuntime>, info: SubagentRunEndInfo): void
```

Types: [Scoped](scope.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentprovider-added--emit"></a>

#### `subagent/provider-added` — emit

A provider became resolvable in the registry.

```ts cordis-catalog
/**
 * A provider became resolvable in the registry.
 * @param provider - the registered provider.
 * @mode emit
 */
'subagent/provider-added'(provider: SubagentProvider): void
```

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentprovider-removed--emit"></a>

#### `subagent/provider-removed` — emit

A provider left the registry. Accepted runs remain holder-owned.

```ts cordis-catalog
/**
 * A provider left the registry. Accepted runs remain holder-owned.
 * @param name - the provider name that no longer resolves.
 * @mode emit
 */
'subagent/provider-removed'(name: string): void
```

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentstart--emit"></a>

#### `subagent/start` — emit

A provider established a published child. For in-process providers, `ctx.agents.get(info.id)` resolves during this notification. Scope-filtered dispatch keys the carrier by the delegating parent, so a parent-scoped listener observes only its own delegations. Paired with `subagent/end`.

```ts cordis-catalog
/**
 * A provider established a published child. For in-process providers,
 * `ctx.agents.get(info.id)` resolves during this notification.
 * Scope-filtered dispatch keys the carrier by the delegating parent, so a
 * parent-scoped listener observes only its own delegations. Paired with
 * `subagent/end`.
 * @param info - the provider and published child identity.
 * @dshScopeScan unsupported
 * @mode emit
 */
'subagent/start'(this: Scoped<SubagentRuntime>, info: SubagentRunInfo): void
```

Types: [Scoped](scope.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)
<!-- END GENERATED cordis-surface -->

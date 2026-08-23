# Режим плана

[English](plan.md) | [中文](plan.zh.md) | Русский

Режим плана — записываемое в журнал состояние сотрудничества отдельного агента, которым владеет [dsh-plan-mode](../../packages/plan/plan-mode) (`ctx.planMode`, `PlanModeController`): пока он активен, в каждый запрос модели включается принадлежащий развёртыванию направляющий раздел. Режим плана — **мягкое руководство**. [Режим песочницы](sandbox.md) и [политика подтверждений](approval.md) соблюдают ограничения независимо; ни один не читает и не пишет состояние плана, поэтому развёртывания настраивают их отдельно. Пакет необязателен, и цикл агента от него не зависит. Он добавляет раздел промпта `plan:policy` и регистрирует инструмент `exit_plan_mode` и команду `/plan`. Обоснованием владеет [заметка о дизайне](../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md); деталями опыта модели и ограничений — [README пакета](../../packages/plan/plan-mode/README.md).

Источник: [`packages/plan/plan-mode/src/index.ts`](../../packages/plan/plan-mode/src/index.ts)

## Записанное состояние и восстановление

`plan/mode` (`{ active: boolean }`) — [событие сессии](session.md) только для журнала с заменой значения целиком: долговечное и воспроизводимое, оно никогда не попадает в транскрипт модели. `foldPlanMode(events, end?)` возвращает последнее записанное значение в префиксе, а при его отсутствии — `false`: действующее состояние всегда получается чистой свёрткой журнала сессии, поэтому resume, fork и компакция восстанавливают его без живого зеркала, а UI наблюдают зафиксированные переключения через `session/event`. Полное объявление события — в [каталоге событий журнала персистентности](../persistence-catalog.md).

## Ожидающие выборы и дописывание на пре-шаге

Поскольку каждое событие сессии заключено в ход, выбор пользователя остаётся ожидающим, пока следующий принятый пре-шаг внутри хода не допишет его перед порождением запроса — в том ходе, когда это произойдёт. Выбор никогда не форсирует продолжение, поэтому сделанный после последнего принятого пре-шага хода дописывается в более позднем ходе. `set(agent, active)` записывает ожидающий выбор (это no-op, когда целевое значение совпадает с записанным или уже ожидающим), а `get(agent)` возвращает `{ active: boolean; pending?: boolean }`: записанное состояние, использованное при сборке текущего шага, плюс выбранное состояние, ожидающее дописывания.

Единственная точка дописывания, пока агент работает, — добавляемый в начало слушатель `agent/pre-step`. Он наблюдает каждый предложенный шаг запроса, включая шаг 1 хода 1 и повторы восстановления запроса, сначала вызывает нижестоящие слушатели и дописывает только после того, как они примут шаг. Допуск промпта происходит до хода и не может дописать `plan/mode`, поэтому выбор, сделанный в промпте, дописывается первым принятым пре-шагом внутри хода того хода, который он начинает. Сбой дописывания не может заблокировать ход, и выбор остаётся ожидающим для более позднего принятого пре-шага внутри хода. Дописанный выбор пользователя также записывает одно уведомление `user/message` с источником-плагином, но только когда последний записанный заголовок запроса описывал другое состояние, так что модель узнаёт о смене контекста ровно тогда, когда она происходит, и никогда избыточно. Выбор, сделанный после последнего принятого пре-шага хода, остаётся локальным для процесса и теряется, если процесс завершится раньше следующего принятого пре-шага внутри хода ([ограничение в README](../../packages/plan/plan-mode/README.md#known-limitations-and-deferred-work)).

## Конфигурация

```ts type-equiv
/** Deployment-owned plan guidance. */
interface PlanModeConfig {
  /** Guidance rendered as the `plan:policy` prompt section while plan mode is active. */
  section: string
}
```

Отсутствующий, пустой или нестроковый `section`, как и любой неизвестный ключ, приводит к ошибке при загрузке плагина, а не игнорируется. Пока режим плана активен, точный текст `section` рендерится как [раздел системного промпта](system-prompt.md) `plan:policy` с порядком 50; неактивный режим плана не добавляет никакого текста.

## Инструмент выхода и команда `/plan`

[`exit_plan_mode`](../tool-catalog.md#deepseek-aidsh-plan-mode) остаётся зарегистрированным, пока режим плана неактивен, поэтому вход в режим плана и выход из него меняют только раздел промпта, но никогда каталог инструментов запроса; исполнение вне режима плана завершается ошибкой. В режиме плана он требует полный markdown-план, начинающийся с заголовка `#`, и представляет его на рассмотрение через [seam пользовательских вопросов](user-questions.md). Одобрение возвращает `{ approved: true }` и записывает беззвучный (не озвучиваемый) ожидающий выход, который дописывается на следующем принятом пре-шаге внутри хода. Руководство плана поэтому остаётся активным до конца текущей серии вызовов инструментов ассистента, а сам результат инструмента сообщает о переходе. «Продолжить планирование» — это неудавшийся вызов, несущий обратную связь пользователя, поэтому модель дорабатывает план и представляет снова; отсутствие канала взаимодействия и перезагрузка сервиса во время рассмотрения тоже приводят вызов к ошибке, а не к беззвучному выходу из режима плана.

Когда компонуется [`ctx.commands`](commands.ru.md), плагин регистрирует `/plan [off|message]`: голый `/plan` выбирает режим плана, любое другое непустое сообщение выбирает его и затем отправляет текст через `agent.steer()`, чтобы тот стал обычным записанным сообщением пользователя следующего шага под руководством плана, а точный аргумент `off` выбирает неактивное состояние, что также отменяет ожидающий вход прежде, чем он будет дописан и станет видимым запросу.

## Сервис

`ctx.planMode` владеет записанным состоянием плана, применяет и озвучивает выбранное состояние в начале шага, а также владеет разделом `plan:policy`, командой `/plan` и стабильным инструментом выхода; сигнатуры `get`/`set` — в сгенерированном [каталоге сервисов](#ctxplanmode--planmodecontroller).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxplanmode--planmodecontroller"></a>

### `ctx.planMode` — `PlanModeController`

`ctx.planMode`: owns logged plan state, applies and narrates selected state at step start, the `plan:policy` section, the `/plan` command, and the stable exit tool. UIs observe committed flips through `session/event`; there is no live mirror.

```ts cordis-catalog
/**
 * Read the logged plan state and any selected state awaiting the next
 * accepted in-turn pre-step.
 *
 * @param agent The agent to read.
 * @returns Current logged state plus a pending selection, when present.
 */
get(agent: Agent): { active: boolean; pending?: boolean }

/**
 * Select whether plan mode should be active. Between turns the method
 * appends the change immediately because no in-turn pre-step will run until
 * another prompt starts a turn. The open-turn fold is the idle signal:
 * agent status stays `running` through post-turn checkpointing, when no
 * further in-turn pre-step runs. During an open turn the selection remains
 * pending until the next accepted in-turn pre-step. Repeated selection of
 * the current or already-pending state is a no-op.
 *
 * @param agent The agent to switch.
 * @param active Whether plan mode should be active.
 * @returns what happened: `committed` (logged now), `queued` (awaiting the
 * next accepted in-turn pre-step), `cancelled` (an opposite pending selection
 * was cleared; the logged state already matches), or `noop` (already in that
 * state).
 */
set(agent: Agent, active: boolean): 'committed' | 'queued' | 'cancelled' | 'noop'
```

Types: [Agent](core.md)

Source: [`packages/plan/plan-mode/src/index.ts`](../../packages/plan/plan-mode/src/index.ts)
<!-- END GENERATED cordis-surface -->

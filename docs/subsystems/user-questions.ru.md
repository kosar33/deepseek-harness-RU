# Взаимодействие с пользователем

[English](user-questions.md) | [中文](user-questions.zh.md) | Русский

Capability seam вопросов пользователю в [dsh-user-questions](../../packages/interaction/user-questions). Это независимый от провайдера словарь, которым инструмент или плагин разрешений пользуется, когда для продолжения работы агента нужен ответ человека. Поверхности UI предоставляют активного `UserQuestionProvider`; рантайм хоста передаёт запросы подключённому клиенту.

Источник: [`packages/interaction/user-questions/src/index.ts`](../../packages/interaction/user-questions/src/index.ts)

## Варианты ответа

`AskUserQuestionOption` содержит один выбираемый вариант. `label` — текст варианта, видимый пользователю, и одновременно значение, которое получает модель; `description` — необязательная справка для UI.

```ts type-equiv
/** One selectable answer offered to the user. */
interface AskUserQuestionOption {
  /** User-facing label. */
  label: string
  /** Optional extra context rendered by capable UIs. */
  description?: string
}
```

## Намерение представления

`AskUserQuestionIntent` необязательно объявляет известный тип решения. Он помечается полем `kind`, чтобы список намерений можно было расширять; UI, не знающий метки, показывает универсальный список вариантов. Намерение меняет только представление — UI, учитывающий его, отвечает теми же метками вариантов, какие отправил бы универсальный UI, поэтому вызывающий в обоих случаях читает одни и те же поля ответа. `approve` называет утверждающий вариант, вместо того чтобы полагаться на порядок вариантов. `ask()` отклоняет два невозможных ни для какого типа утверждения: `approve`, не называющий ни одного варианта собственного вопроса, и намерение у вопроса без `detail`.

```ts type-equiv
/**
 * A caller-declared presentation intent: the question IS this kind of
 * decision, so a UI that recognises the tag may present it as such instead of as a
 * generic option list. Tagged so further intents can be added; a UI that does
 * not know a tag renders the generic flow, and the answer encoding is identical
 * either way — an intent changes presentation only, never the protocol.
 */
type AskUserQuestionIntent = {
  /** A plan submitted for review: `detail` is the plan markdown `ask()` requires, and the decision approves or declines it. */
  kind: 'plan-review'
  /**
   * The option label that approves the plan; every other option declines it.
   * Named rather than positional so no UI infers the verdict from option order.
   * An `approve` naming no option of its own question is rejected at `ask()`.
   */
  approve: string
}
```

## Элемент вопроса

`AskUserQuestionItem` — один вопрос в запросе. Вызывающий задаёт стабильный `id`, который возвращается вместе с ответом, чтобы пакетные вопросы оставались адресуемыми. Необязательный `detail` несёт пояснительный текст, который провайдеры показывают вместе с вопросом, но не включают в метки выбираемых вариантов.

```ts type-equiv
/** One question in a user-questions request. */
interface AskUserQuestionItem {
  /** Stable caller-provided question id, echoed in the answer. */
  id: string
  /** The question to display. */
  question: string
  /** Optional supporting detail rendered with the question but kept out of option labels. */
  detail?: string
  /** Optional short heading/group label. */
  header?: string
  /** Optional choices the UI can render as a menu. */
  options?: AskUserQuestionOption[]
  /** Whether more than one option may be selected. Defaults to single-select. */
  multiSelect?: boolean
  /** Optional presentation intent for capable UIs; absent asks for the generic option list. */
  intent?: AskUserQuestionIntent
}
```

## Запрос ask

`AskUserQuestionRequest` — межпакетный запрос. `questions` — массив, чтобы UI мог показать связанные вопросы одним потоком, сохраняя стабильный id для каждого ответа. Если `agent` задан, это точный живой вызывающий агент; interaction seam допускает его, только пока живой реестр опознаёт этот экземпляр как корень рантайма.

```ts type-equiv
/** Request for a human answer. */
interface AskUserQuestionRequest {
  /** Questions to display. */
  questions: AskUserQuestionItem[]
  /** Exact live calling agent, when the request came from an agent tool call. */
  agent?: Agent
  /** Abort signal for the owning tool/step. */
  signal?: AbortSignal
}
```

## Ответ

Провайдеры возвращают один элемент ответа на каждый id вопроса. `selected` содержит метки выбранных вариантов, а `custom` — свободный ответ «Другое», если пользователь его ввёл. Для вопроса с единственным выбором `custom` замещает выбранный вариант, а `selected` пуст. Для вопроса с множественным выбором `custom` может дополнять метки в `selected`. UI может также использовать элемент с пустым `selected` и без `custom`, чтобы пропущенный вопрос сохранился в иначе завершённом пакете.

```ts type-equiv
/** Answer to one question. */
interface AskUserQuestionAnswerItem {
  /** The answered question id. */
  id: string
  /** Selected option labels. May accompany custom text for a multi-select question. */
  selected: string[]
  /** Optional free-text "Other" answer. */
  custom?: string
}
```

```ts type-equiv
/** The human's answer. */
interface AskUserQuestionAnswer {
  /** Structured answers keyed by question id. */
  answers: AskUserQuestionAnswerItem[]
}
```

## Провайдер

Активным в контексте может быть только один провайдер. Регистрация провайдера привязана к эффекту, поэтому HMR/освобождение ресурсов убирает активный UI.

```ts type-equiv
/** UI-side provider for user questions. */
interface UserQuestionProvider {
  ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>
}
```

## Ошибки

`UserQuestionError` расширяет `HarnessError`, поэтому `ctx.tools.execute()` сохраняет `{ name, code }` для сбоев инструментов, видимых модели, — таких как `EMPTY_QUESTIONS`, `NO_PROVIDER`, `ASK_ABORTED` или отмена на стороне UI.

```ts type-equiv
/** Stable error taxonomy for user-questions failures. */
class UserQuestionError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'UserQuestionError'
  }
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxuserquestions--userquestionservice"></a>

### `ctx.userQuestions` — `UserQuestionService`

`ctx.userQuestions`: one active UI provider plus an `ask()` API.

```ts cordis-catalog
/**
 * Register the UI provider. Only one provider may be active in a context.
 *
 * @param provider UI-side implementation that collects answers.
 * @returns Disposer that unregisters this provider.
 */
registerProvider(provider: UserQuestionProvider): () => void

/**
 * Ask the active UI provider and wait for the user's answer.
 *
 * When a caller supplies an agent, human interaction is valid only for the
 * exact live runtime root. Runtime ownership, not durable session lineage,
 * decides this boundary: an owned child has no human answerer and would
 * block forever, while a lineage-bearing session resumed as a new runtime
 * root may ask normally.
 *
 * @param request Questions, owner agent, and abort signal.
 * @returns The answer chosen or typed by the human.
 * @throws {UserQuestionError} code `CALLER_NOT_LIVE` when a supplied
 *   agent is not the registry's exact live instance, or `DELEGATED_CALLER`
 *   when that live agent is owned by another agent.
 */
async ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>
```

Source: [`packages/interaction/user-questions/src/index.ts`](../../packages/interaction/user-questions/src/index.ts)
<!-- END GENERATED cordis-surface -->

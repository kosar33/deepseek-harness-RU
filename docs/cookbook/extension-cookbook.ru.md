# Cookbook: формы плагинов-расширений

[English](extension-cookbook.md) | [中文](extension-cookbook.zh.md) | Русский

Эталонные паттерны расширений harness. Сниппеты опускают импорты и реализации вспомогательных функций и не годятся для копирования без доработки. Конкретные пути авторства — в [чек-листе пакета](adding-a-package.ru.md), [туториале первого инструмента](../user/develop/basic/tool.ru.md), [справочнике инструментов](adding-a-tool.ru.md) и [руководстве по LLM-адаптеру](adding-an-llm-adapter.ru.md); картой системы и точек расширения владеет [архитектура](../architecture.ru.md).

## Плагин инструмента

Инструмент регистрируется на `ctx.tools`. Аннотированный пример `defineTool` (типизированные аргументы `execute`, конструирование результата, паттерн `run_in_background`) живёт в [руководстве adding-a-tool.md](adding-a-tool.ru.md) — этот документ является источником истины для определений инструментов. Сырые `ToolDefinition` с JSON-Schema тоже принимаются `ctx.tools.register()` напрямую (именно так появляются инструменты из MCP); `defineTool` — типизированный помощник для first-party инструментов.

<a id="плагин-хук-пример-шлюза-разрешений"></a>

## Плагин-хук (пример шлюза разрешений)

Этот шлюз разрешений — один из примеров плагина-хука. Он возвращает типизированное решение от гейта `tools/pre-execute`, чтобы разрешить или запретить вызов; эту точку расширения могут использовать плагины песочницы, разрешений и plan mode. Плагины-хуки способны перехватывать и другие точки расширения и не являются гейтами разрешений по своей природе. «Нативный хук» — обычный плагин Cordis на точке перехвата; внешний протокол ему не нужен.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

declare function isAllowed(exec: ToolExecution): Promise<boolean>

export const name = 'permission-gate'

export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!(await isAllowed(exec))) {
      return { kind: 'deny', reason: 'Denied by policy.' }
    }
    return next()
  })
}
```

Этот каскад — перестраиваемый слой политик. Используйте `ctx.tools.guard()`, когда инварианту нужен монотонный финальный запрет, `tools/execute`, когда плагин должен обернуть фактическое время жизни диспетчеризации (таймауты/повторы/метрики; заменяем только `exec.signal`), `tools/post-execute` для явного преобразования результата и `tools/result` для локализованного наблюдения за неизменяемым финальным исходом. Правило выбора даёт [руководство adding-a-tool](adding-a-tool.ru.md#политика-исполнения-и-наблюдение).

## Плагин UI

Плагин UI рендерит на основе ленты `session/event` (поток токенов ассистента как `assistant/chunk`, плюс границы turn/step и активность инструментов) и передаёт ввод обратно через `agent.followup()` / `agent.steer()`. Браузерный плагин, добавляющий бизнес-строку во встроенный Web Client, вместо этого регистрирует `ConversationNodeDefinition` и keyed-рендерер Chat; следуйте [руководству Conversation Node](adding-a-conversation-node.md).

```ts
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'

declare function render(text: string): void
declare function onUserInput(handler: (text: string) => void): void

export const name = 'my-ui'
export const inject = ['agents']

export function apply(ctx: Context) {
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/chunk' && event.data.chunk.type === 'text-delta') {
      render(event.data.chunk.text)
    }
  })
  onUserInput(text => ctx.agents.get(SessionId('client-session'))?.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })))
}
```

## Внешний драйвер протокола

*Драйвер протокола* адаптирует сторону проводного протокола к `ctx.agents`; он может обслуживать UI или клиента автоматизации. stdio-драйвер владеет stdout, создаёт или возобновляет агентов через фабрику и отображает запросы протокола в `followup()` или `cancel()`. Низкоуровневый запрос промпта возвращает свою долговечную квитанцию постановки в очередь; результат он не получает, сопоставляя `MessageId` с `turn/end`. Статус агента целиком публикуйте отдельно. Метод автоматизации может ждать от своей квитанции до следующего простоя и обобщить именно этот явно принадлежащий ему интервал, тогда как UI обычно продолжает наблюдать открытый поток событий. Завершайте агентов через `AgentHandle.dispose()`, чтобы освобождение ресурсов доходило до quiescence.

[`packages/acp/acp`](../../packages/acp/acp) — проработанный пример только для автоматизации: он предоставляет свежие текстовые сессии поверх Agent Client Protocol JSON-RPC stdio, выдаёт зафиксированный текст ассистента и регистрирует одноразовый машинный ответчик на разрешения для агентов, которыми владеет. Его [README](../../packages/acp/acp/README.md) определяет точные методы, порядок событий и контракт жизненного цикла.

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-protocol-bridge'
export const inject = ['agents', 'sessions', 'sessionPersistence']

export function apply(ctx: Context) {
  // Stream every logged assistant text/reasoning delta out to the client.
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/chunk') {
      const chunk = event.data.chunk
      if (chunk.type === 'text-delta') {
        // sendToClient({ kind: 'message_chunk', text: chunk.text })
      }
    }
  })
  // Inbound "prompt": create/resume an agent, feed it, and return its enqueue receipt.
  // Whole-agent status is a separate notification; no turn end belongs to this prompt.
  // Teardown reaches quiescence via AgentHandle.dispose() (stop + await exit).
}
```

## Запускаемые сборки

Запускаемые листья загружают свои деревья плагинов из `examples/*/cordis.yml`; корневые скрипты `demo:*` и эти каталоги-листья — авторитетная опись. Продуктовый лаунчер `dsh` владеет Web и однократным headless-исполнением, листья ACP используют [`@deepseek-ai/dsh-acp-demo`](../../packages/examples/acp-demo), а листья JSON-RPC — [`@deepseek-ai/dsh-sdk-jsonrpc-demo`](../../packages/examples/jsonrpc-demo). Лист headless-снапшота явно подключает [`@deepseek-ai/dsh-agent-spine-demo`](../../packages/examples/agent-spine-demo) и персистентность JSONL, а затем прогоняет их через тестовую фикстуру, которой владеет пример, а не через выпускаемый пакет приложения.

## Карта «функция → механизм»

Каждая продуктовая функция отображается в слушателей на документированной точке расширения — так утверждение о микроядре становится проверяемым ([Agent Note о микроядре](../../.agents/notes/implemented/architecture/2026-06-11-microkernel-event-taxonomy.md)). Ни одна строка не меняет цикл.

`system-prompt/assemble` — экспертное кооперативное преобразование всей сборки целиком: возвращённая им сборка авторитетна, поэтому авторы слушателей сами отвечают за сохранение активных вкладов Code Mode и протокола структурированного вывода. Для фильтрации инструментов, которая обязана оставаться согласованной между представлением, поиском и исполнением, предпочитайте `ctx.tools.restrict()`.

| Продуктовая функция | Механизм плагина |
|---|---|
| Система хуков (уровень пользователя + проекта) | слушатели на `agent/session-start`, `agent/pre-step`, `agent/request`, `tools/pre-execute`, `tools/post-execute` и `agent/turn-stopping`; каскады возвращают типизированные решения, при этом `agent/turn-stopping` может инициировать ещё один шаг; мосты `dsh-hooks-claude-code` / `dsh-hooks-codex` отображают конфигурационные файлы хуков на эти точки расширения |
| `/goal` | `ctx.goals` владеет долговечным состоянием, `dsh-goal-round-driver` планирует раунды в одной сессии через публичный `Agent`, а отдельные производители команд/инструментов предоставляют управление человеку/модели |
| `/loop` | по событию сессии `turn/end` — `followup()` для следующей итерации; либо принудительное продолжение |
| Динамический воркфлоу | `ctx.workflowEngine` + движок worker-thread + инструмент `workflow`; структурные внутрипроцессные потомки обеспечивают соблюдение требований к выводу с помощью scoped-регистраций промптов/инструментов, монотонного инструментального guard'а, финального коммита `tools/result` (включая объемлющий `run_code`) и монотонного маркера `concludeTurn()` исполнения структурированного вывода |
| Сообщения в очереди + steering | базовые `Agent.followup()` / `Agent.steer()` |
| Компакция контекста (авто + ручная) | seam `ctx.compaction` + `dsh-compaction-basic`; автоматическое давление запускается на последовательных `agent/pre-step`, каноническое восстановление после переполнения — на `agent/request-error`, а ручные вызывающие пользуются тем же сервисом компакции ([Agent Note о компакции](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md)) |
| Настраиваемость системного промпта | `ctx.systemPrompt.section()` с упорядочиванием и scope-локальным затенением |
| AGENTS.md (корень) | провайдер секции, читающий файл |
| AGENTS.md (подкаталог, при касании) + уведомления об изменении файлов | `agent.inject()` из watcher'а / слушателя результатов инструментов |
| Встроенные инструменты | `ctx.tools.register()`; схемы автоматически попадают в сборку — семейства `dsh-tool-*` (bash, fs, web, subagent, todo) — поставляемые примеры |
| ToolSearch / прогрессивное раскрытие | замена scoped-регистрации `ctx.tools.restrict()` по мере изменения видимого набора; реестр держит представление, поиск и исполнение согласованными |
| Дедлайн инструмента / повтор / метрики | обёртывание базовой диспетчеризации через `tools/execute`; обёртка может заменить `exec.signal`, делегировать и проинспектировать нормализованный результат в одном лексическом времени жизни |
| Финальные метрики / аудит / захват результата инструмента | наблюдение неизменяемых авторитетных исходов через `tools/result`; `tools/post-execute` используйте вместо него, только когда плагин обязан преобразовать результат или добавить контекст |
| Монотонная политика завершающего хода | вызов `ToolExecution.concludeTurn()` из успешного завершающего инструмента; последующие вызовы инструментов в том же ответе остаются под guard'ом, а цикл останавливается после шага |
| Песочница subprocess (landlock / sandbox-exec) | используйте бэкенд `ctx.sandbox` через `dsh-bash-sandbox`; для запрета на уровне возможности — `tools/pre-execute` |
| Система разрешений / AskUserQuestion | возвращайте `ask` из `tools/pre-execute` и отвечайте через `ctx.approval`; для обычных вопросов пользователя регистрируйте отдельный обращённый к модели инструмент ask |
| Plan mode | [`@deepseek-ai/dsh-plan-mode`](../../packages/plan/plan-mode/README.md) — журналируемое состояние `plan/mode`, направляющая секция `plan:policy`, вход `/plan [message]`, прямой выход `/plan off` и выход `exit_plan_mode` с просмотром пользователем; принуждение остаётся на независимых осях песочницы/одобрения |
| Делегация субагенту | реестр провайдеров `ctx.subagents` (`dsh-subagent-spawn-in-process`/`-fork`/`-acp`/`-codex`/`-claude-code`/`-dsh-sdk`) + `dsh-tool-subagent`, выставляющий модели одного настроенного провайдера |
| MCP | один плагин на сервер: обнаружить инструменты → `ctx.tools.register()` |
| Скиллы | регистрация секции + инструмента; `inject()` содержимого скилла при вызове |
| Память | провайдер секции + инструмент |
| Запланированные задачи (cron) | плагин регистрирует вызываемые моделью инструменты планирования; срабатывание таймера → `followup(…, {source: {kind: 'cron', …}})` при простое / уведомление `inject()` при занятости |
| UI (GUI; CLI выдаёт JSONL) | слушайте `session/event` (кусочки ассистента, границы, активность инструментов); ввод → `followup()` |
| Бизнес-узел Chat Web Client'а | регистрация `ConversationNodeDefinition` и keyed-рендерера `conversation.chat.node` |
| SessionTelemetryBackend / воспроизводимая трассировка | `session/event` → JSONL; воспроизведение = `sessions.create(id, { seed })` |
| Адаптеры моделей | подкласс `LlmAdapter` через `registerAdapter` (`dsh-llm-deepseek`, `dsh-llm-pi-ai`) |
| Горячая перезагрузка плагинов | каждая регистрация — `ctx.effect` → вендоренный HMR просто работает |

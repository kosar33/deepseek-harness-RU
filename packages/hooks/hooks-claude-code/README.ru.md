# @deepseek-ai/dsh-hooks-claude-code

[English](README.md) | [中文](README.zh.md) | Русский

Плагин cordis, запускающий поддерживаемое подмножество command-хуков из существующей конфигурации хуков **Claude Code** (файл `hooks.json` или ключ `hooks` в файле настроек) на канонических точках перехвата harness. Это половина подсистемы хуков в **диалекте CC**: она владеет stdin-payload'ами моста в форме CC для каждого события, подстановкой переменных окружения CC и `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}`, а также отображением нейтрального исхода хука на типизированные решения harness. Не зависящие от диалекта примитивы (матчер, кодек exit-кода/stdout, выполнение через `ctx.shell`, слияние по самому строгому ограничению, события `hook/*`) берутся из [`@deepseek-ai/dsh-hook-protocol`](../hook-protocol/README.md).

Нативный плагин cordis мог бы сделать всё, что делает этот мост, — мощнее, с типизированными возвратами и без границы сериализации. **Мост существует исключительно как путь совместимости для отображаемого подмножества command-хуков CC**; всё специфическое следует оформлять нативным плагином на тех же точках расширения (см. [Agent Note о точках расширения перехвата](../../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.md)).

## Конфигурация

```ts
import type { Config } from '@deepseek-ai/dsh-hooks-claude-code'
const config: Config = {
  configPath: '/path/to/hooks.json', // required: a hooks.json or a settings file with a `hooks` key
  pluginRoot: '/path/to/plugin',     // optional: replaces ${CLAUDE_PLUGIN_ROOT} in command strings
  projectDir: '/path/to/project',    // optional: replaces ${CLAUDE_PROJECT_DIR} AND sets the hook env var; defaults to the session cwd when omitted
  defaultTimeoutMs: 600_000,         // optional: per-hook timeout when a hook sets none (CC default)
  stderrSummaryMaxChars: 500,        // optional: char cap on the hook/result event's persisted stderr summary
}
```

В `cordis.yml`:

```yaml
- dsh-hooks-claude-code:
    configPath: ./.claude/hooks.json
    pluginRoot: ./.claude/plugins/my-plugin
    projectDir: .
```

Конфигурация разбирается **один раз** при загрузке. `configPath` действует **на уровне процесса**: относительный путь разрешается относительно cwd запуска процесса в момент загрузки, поэтому одна конфигурация действует на весь процесс — посессионного обнаружения конфигурации (`session/new.cwd`) пока нет (`TODO(per-session-hook-config)`). Сбой чтения или разбора изолируется — включая недопустимый regex-матчер на событии, использующем матчеры, о котором сообщается с его шаблоном и событием, — и мост пишет предупреждение и не регистрирует ничего вместо падения загрузки (опечатка в пути не должна ронять агента). Выполняются только хуки shell-формы `type: 'command'`; хук `http`/`mcp_tool`/`prompt`/`agent` разбирается и пропускается с предупреждением. Хук без собственного `timeout` работает с референсным умолчанием протокола (`DEFAULT_HOOK_TIMEOUT_MS` из `dsh-hook-protocol`, 10 минут — умолчание CC).

Сами хуки выполняются в рабочем пространстве сессии агента: для точек в области агента мост передаёт `cwd` сессии (тот самый `session/new.cwd`) как рабочий каталог процесса хука, поэтому `pwd`, относительные пути и маркеры хука действуют в дереве проекта пользователя, а не в каталоге запуска сервера.

## Точки хуков → типизированные решения

| Хук CC | Точка harness | Отображение |
|---|---|---|
| `SessionStart` | `agent/session-start` (emit) | additionalContext → `agent.inject()` в новую сессию (заблокировать нельзя) |
| `UserPromptSubmit` | `agent/pre-step` (waterfall) | `deny` → `PreStepDecision.reject`; только additionalContext → делегировать через `next()`, затем дописать к последующему решению `enter` сообщение с отдельной атрибуцией источника (внешний слушатель на следующем шаге всё ещё может отклонить или переписать) |
| `PreToolUse` | `tools/pre-execute` (waterfall) | `deny` → `PreToolDecision.deny`; `ask` → `PreToolDecision.ask` |
| `PostToolUse` | `tools/post-execute` (waterfall) | `deny` → `block` с обратной связью; только additionalContext → делегировать через `next()`, затем добавить в начало последующего решения контекст с отдельной атрибуцией источника; Code Mode откладывает контексты подвызовов до результата внешнего `run_code` |
| `Stop` | `agent/turn-stopping` (serial) | блокирующий хук Stop передаёт свою причину через `steer()`, принуждая ещё один шаг |
| `SubagentStart` | `subagent/start` (emit) | additionalContext → `agent.inject()` в живой внутрипроцессный дочерний агент; у удалённого дочернего агента локальной цели инъекции нет |
| `SubagentStop` | `subagent/end` (emit) | только наблюдение |

Три точки emit выполняются отсоединённо — ни одна точка расширения не ожидает хук `SessionStart`/`SubagentStart`/`SubagentStop`. Каждая цепочка запусков отслеживается, а освобождение ресурсов моста прерывает всё ещё работающие процессы хуков, затем осушает продолжения прежде, чем освобождение завершится (`createDetachedRuns` в `dsh-hook-protocol`).

Объект матчинга — имя инструмента (`PreToolUse`/`PostToolUse`), источник сессии (`SessionStart`) или константный `agent_type` со значением `general-purpose` (`SubagentStart`/`SubagentStop` — subagent seam в harness не несёт метки вида, поэтому мост сообщает стандартное для инструмента Task значение по умолчанию из Claude Code; матчер со значением по умолчанию/`*`/пустым срабатывает, матчер конкретного вида — нет); `UserPromptSubmit`/`Stop` игнорируют матчеры. Несколько настроенных в файлах хуков на одной точке выполняются **последовательно, в порядке конфигурации**, и свёртываются по самому строгому ограничению (`deny > ask > allow`, см. `dsh-hook-protocol`); последовательное выполнение держит пару `hook/invoked`/`hook/result` каждого хука рядом в журнале, а для итогового решения свёртка не зависит от порядка (см. в Agent Note заметку «run serially, not concurrently»).

Каждый stdin-payload в области агента несёт `session_id` и строковый `transcript_path`. Мост разрешает последний через `ctx.sessionPersistence.locate(session.header)`, когда сервис доступен, иначе отправляет `''`. Поиск не создаёт и не сбрасывает артефакт, поэтому путь может отсутствовать до первого чекпоинта конца хода или не включать текущий открытый ход.

## Источник контекста

Внедрённый контекст несёт явный источник `{ kind: 'plugin', plugin: 'hooks-claude-code' }`, поэтому долговечное сообщение никогда не принимают за пользовательский промпт.

## Model Experience

### Контекст, добавляемый хуками

#### What the model sees

Хуки `SessionStart`, принятого промпта, пост-инструментальные и старта живого внутрипроцессного субагента могут добавлять сообщения контекста с атрибуцией источника; блокирующий хук `Stop` добавляет свою причину как steering следующего шага. У удалённого дочернего агента локальной цели инъекции нет.

#### Token effect

Без затрат, когда хуки не возвращают контекст. Текст хука зависит от данных, журналируется и повторно отправляется в последующих запросах диалога до компакции.

#### KV Cache effect

Append-only; новый видимый контент следует за повторно используемым префиксом запроса и не инвалидирует существующие записи KV-кэша.

### Заблокированный промпт или исход инструмента

#### What the model sees

Причины от провайдера передаются дословно. При их отсутствии заблокированный промпт использует в точности `blocked by UserPromptSubmit hook`, отклонённый инструмент становится `Error: blocked by PreToolUse hook`, обратная связь заблокированного пост-инструментального хука — в точности `blocked by PostToolUse hook`, а блокирующий stop добавляет steering ровно в виде `continue: blocked by Stop hook`. `systemMessage` и `updatedInput` журналируются или вызывают предупреждение, но в этой реализации модели не видны.

#### Token effect

Блокировка промпта убирает токены его запроса; отклонение или обратная связь добавляют сохранённый запасной текст или текст провайдера; принудительное продолжение стоит ещё одного полного запроса.

#### KV Cache effect

Заблокированный промпт не отправляет запрос и ничего не инвалидирует. Контекст отклонения, обратной связи и принудительного продолжения дописывается после повторно используемого префикса без его переписывания.

## Известные ограничения и отложенная работа

- **Неподдерживаемые события хуков (23 из нынешних 30 у Claude Code):** `Setup`, `InstructionsLoaded`, `UserPromptExpansion`, `MessageDisplay`, `PermissionRequest`, `PostToolUseFailure`, `PostToolBatch`, `PermissionDenied`, `Notification`, `TaskCreated`, `TaskCompleted`, `StopFailure`, `TeammateIdle`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `SessionEnd`, `Elicitation` и `ElicitationResult`. Конфигурация этих событий игнорируется до группового разбора, поэтому неподдерживаемое событие не может ни инвалидировать хуки, ни зарегистрировать их. База сравнения — [официальный справочник событий хуков Claude Code](https://code.claude.com/docs/en/hooks#hook-events).
- **`SessionStart` поддержан частично:** JSON `additionalContext` используется, но контекст из простого stdout, `initialUserMessage`, `sessionTitle`, `watchPaths`, `reloadSkills` и `CLAUDE_ENV_FILE` не поддерживаются. Хук выполняется отсоединённо, поэтому контекст может не успеть к первому запросу (`TODO(session-start-gating)`), а payload опускает актуальные необязательные поля вроде `model`, `agent_type` и `session_title`.
- **`UserPromptSubmit` поддержан частично:** блокировка и JSON `additionalContext` работают, но контекст из простого stdout, `sessionTitle` и `suppressOriginalPrompt` не поддерживаются. Если не переопределено, мост также использует своё умолчание в 600 секунд вместо специфичного для события командного таймаута Claude Code в 30 секунд.
- **`PreToolUse` поддержан частично:** решения `deny` и `ask` работают; `allow` не одобряет заранее, `defer` не поддерживается, `additionalContext` игнорируется, а `updatedInput` журналируется и сопровождается предупреждением, но не применяется ([Agent Note о перезаписи входа инструментов](../../../.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.md)).
- **`PostToolUse` поддержан частично:** блокирующая обратная связь и JSON `additionalContext` работают, но `updatedToolOutput` и `updatedMCPToolOutput` не поддерживаются, а `tool_response` сводится к плоскому тексту.
- **`SubagentStart` и `SubagentStop` поддержаны частично:** оба сообщают константный `agent_type` со значением `general-purpose` и используют id дочерней сессии там, где Claude Code сообщает родительскую сессию. Стартовый контекст доставляется по возможности и может достичь только живого внутрипроцессного субагента, а stop — только наблюдение и не может ни заблокировать субагента, ни передать ему контекст. Start опускает `transcript_path`; stop также опускает `agent_transcript_path`, `last_assistant_message`, `background_tasks` и `session_crons` и всегда сообщает `stop_hook_active: false`.
- **`Stop` поддержан частично:** блокировка принуждает ещё один ход модели, но `stop_hook_active` всегда равен `false`, поля `last_assistant_message`, `background_tasks` и `session_crons` опущены, а предел последовательных блокировок не реализован (`TODO(stop-loop-guard)`). Поэтому безусловно блокирующий хук продолжает каждый шаг принудительно, если сам себя не ограничивает.
- **Общие поля payload и вывода поддержаны частично:** payload отображаемых событий опускает `prompt_id`, `transcript_path`, `permission_mode` и `effort` там, где Claude Code их предоставил бы. `systemMessage` журналируется и сопровождается предупреждением, но не показывается; `{"continue": false}` записывается, но не останавливает выполнение; `suppressOutput`, `stopReason` и `terminalSequence` не применяются (`TODO(hook-continue-false)`).
- **Поддержка обработчиков и конфигурации частична:** выполняются только command-обработчики shell-формы. Обработчики `http`, `mcp_tool`, `prompt` и `agent` пропускаются; опции command-обработчиков вроде `args`, `async`, `asyncRewake`, `shell`, `if`, `once` и `statusMessage` не применяются. Совпадающие обработчики выполняются последовательно и не дедуплицируются, тогда как Claude Code выполняет их параллельно и дедуплицирует одинаковые. Один `configPath` уровня процесса разбирается однократно при загрузке; многослойное обнаружение Claude Code по проекту, пользователю, плагину и политике, а также live reload не реализованы (`TODO(per-session-hook-config)`).

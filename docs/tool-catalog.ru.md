<!-- Сгенерировано скриптом scripts/gen-tool-catalog.ts — не редактируйте вручную.
     Для повторной генерации выполните `pnpm run gen-tool-catalog`. -->

# Каталог схем инструментов

Каждый обращённый к модели инструмент, который плагин из поставки вносит в `ctx.tools`: `name`, `description` и `parameters` по JSON-Schema, которые модель получает при сборке системного промпта. Страница дополняет [страницы подсистем](subsystems/core.ru.md) (типы плюс сгенерированный регион Cordis API на каждой странице) — здесь собраны именно *инструменты*, которые предлагают агенту.

Этот файл СГЕНЕРИРОВАН и проверяется на актуальность командой `pnpm run verify-tool-catalog` (часть `doc-sync`) — не редактируйте его вручную. В отличие от каталога cordis (чистый проход по AST исходников), этот генератор ЗАПУСКАЕТ каждый плагин инструментов на реальном контексте и читает `ctx.tools.schemas()`, потому что схема инструмента не выводится статически (энумы, раскрываемые в рантайме, склеенные описания, имена из конфигурации, MCP-инструменты с сырой JSON-Schema). Контроль полноты проходит по glob `packages/*/tool-*` и падает, если какого-то пакета нет в boot-манифесте генератора, — новый инструмент не может молча остаться незадокументированным. См. [Agent Note о каталоге схем инструментов](../.agents/notes/implemented/process/2026-07-02-tool-schema-catalog.md).

Охват: продуктовые инструменты из поставки под `packages/*/tool-*`, каждый запускается с конфигурацией ПО УМОЛЧАНИЮ, кроме случаев, когда поле Config ОБЯЗАТЕЛЬНО и не имеет значения по умолчанию, — там генератор обязан выбрать, и примечание к пакету фиксирует, какую ветку показывает эта страница. Зарегистрированное ИМЯ инструмента может быть конфигом времени загрузки (например, `toolName` у `tool-subagent`), поэтому развёртывание может выставить пакет под другим или дополнительным именем — такие алиасы из поставки примечание к пакету фиксирует там, где они есть. Демонстрационные инструменты `examples/` (например, `echo`) исключены — в духе packages-only охвата каталога cordis.

## Карта пакетов инструментов

Таблица связывает обращённые к модели имена инструментов с пакетами-плагинами и сервисными seam'ами за ними. Точные JSON-Schema — в разделах пакетов ниже.

| Пакет инструментов | Имена, видимые модели | Требует | Пишет / затрагивает | Алиасы в поставке | Примечание о развёртывании |
| --- | --- | --- | --- | --- | --- |
| `@deepseek-ai/dsh-tool-ask-user` | `ask_user_question` | `ctx.tools`, `ctx.userQuestions` | `tool/call`, `tool/result after a UI/provider answers the question` | - | ask_user_question приостанавливает вызов инструмента, пока активный UI-провайдер не вернёт ответ человека. |
| `@deepseek-ai/dsh-tools` | `run_code` | `ctx.tools`, `ctx.codeRuntime (execution time)`, `ctx.systemPrompt` | `tool/call`, `one tool/code-dispatch-start + tool/code-dispatch pair per bridged sub-call`, `tool/result` | - | Принадлежит реестру инструментов как зарезервированный транспорт вне фильтруемых capability-слоёв при `mode: code` / `mode: both` (см. Agent Note о Code Mode). При `code` это единственный вклад реестра в протокол; остальные видимые возможности объявляются в сгенерированном разделе SDK на языке загруженного рантайма, и программа вызывает их через биндинги, планируемые по нативному контракту конкурентности (старты в порядке отправки и политика; concurrency-safe тела перекрываются до `maxParallelSubCalls`); эти биндинги заново входят в полный защищённый пайплайн инструментов и связывают каждое вложенное выполнение с этим внешним результатом. |
| `@deepseek-ai/dsh-plan-mode` | `exit_plan_mode` | `ctx.tools`, `ctx.systemPrompt`, `ctx.userQuestions (execution time, opportunistic)` | `tool/call`, `plan/mode inactive on an approved review`, `tool/result` | - | exit_plan_mode остаётся в обращённой к модели схеме, пока планирование неактивно, чтобы переходы не добавляли поверх смены plan-политики ещё и дребезга каталога инструментов. Путь выполнения отклоняет вызовы вне режима планирования; в режиме планирования он показывает план через seam пользовательских вопросов (одобрить / продолжить планирование с фидбеком), а одобрение журналирует неактивность режима планирования на границе шага. |
| `@deepseek-ai/dsh-tool-bash` | `bash` | `ctx.tools`, `ctx.shell`, `ctx.systemPrompt`, `ctx.shellEnv`, `ctx.jobs at call time for run_in_background` | `tool/call`, `tool/result` | - | Инструмент bash — обращённый к модели потребитель seam исполнителя bash. Запуск с `run_in_background` регистрируется в универсальном рантайме `ctx.jobs` и собирается/останавливается через инструменты `job_*` из `@deepseek-ai/dsh-tool-jobs`; конфиг `enableRunInBackground` (по умолчанию true) при выключении убирает параметр целиком. |
| `@deepseek-ai/dsh-tool-pwsh` | `pwsh` | `ctx.tools`, `ctx.shell`, `ctx.systemPrompt`, `ctx.shellEnv`, `ctx.jobs at call time for run_in_background` | `tool/call`, `tool/result` | - | Инструмент pwsh — потребитель seam исполнителя bash в диалекте PowerShell для Windows-композиций (за `ctx.shell` стоит исполнитель PowerShell вроде `@deepseek-ai/dsh-pwsh-local`); он повторяет инструмент bash вызов-в-вызов минус управление песочницей — запуски `run_in_background` регистрируются в универсальном рантайме `ctx.jobs` и собираются/останавливаются через инструменты `job_*`, а управляемое окружение `DSH_*` даёт `@deepseek-ai/dsh-shell-env`. Каждый вызов выполняется в свежем процессе (без персистентной PTY-сессии), с нативными путями `C:\...` и переменными `$env:NAME`. |
| `@deepseek-ai/dsh-tool-cordis` | `cordis_define`, `cordis_inspect_list`, `cordis_inspect_query`, `cordis_inspect_self`, `cordis_run`, `cordis_stop`, `cordis_undefine` | `ctx.tools`, `ctx.dynamicCordisRunner` | `tool/call`, `tool/result`, `process-local dynamic package lifecycle` | - | Ни в одном дереве поставки (осознанный opt-in — код динамического пакета достигает реального рантайма, см. .agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md). Набор инструментов внедряет `ctx.dynamicCordisRunner` из `@deepseek-ai/dsh-cordis-host-runner`, который владеет реестром определений и vm-песочницей; композиция без него никогда не активирует эти инструменты. Работающий пакет может регистрировать ДОПОЛНИТЕЛЬНЫЕ обращённые к модели инструменты, пока его не остановят, не снимут его определение или DSH не перезапустится; полный изменённый заголовок запроса журналирует эти смены набора инструментов. |
| `@deepseek-ai/dsh-tool-bash-persistent` | `bash` | `ctx.tools`, `ctx.terminals`, `an owning Agent at execution time` | `tool/call`, `PTY shell state`, `tool/result` | - | Один персистентный инструмент bash с изоляцией по владельцу; композиция развёртывания подставляет PTY-бэкенд и может переопределить обращённое к модели описание окружения. |
| `@deepseek-ai/dsh-tool-pwsh-persistent` | `pwsh` | `ctx.tools`, `ctx.terminals`, `an owning Agent at execution time` | `tool/call`, `PTY shell state`, `tool/result` | - | Один персистентный инструмент pwsh с изоляцией по владельцу, Windows-парная сторона персистентного инструмента bash; композиция развёртывания подставляет PTY-бэкенд диалекта pwsh и может переопределить обращённое к модели описание окружения. |
| `@deepseek-ai/dsh-tool-str-replace-editor` | `str_replace_editor` | `ctx.tools`, `ctx.fs` | `tool/call`, `fs/observed after view presence/absence, edit absence, or successful mutation`, `tool/result` | - | Автономный инструмент просмотра/создания/уникальной литеральной замены/вставки строк поверх файлового seam; компонуется с любым shell- или терминальным API. |
| `@deepseek-ai/dsh-tool-fs` | `edit`, `read`, `read_image`, `write` | `ctx.tools`, `ctx.fs`, `ctx.systemPrompt`, `ctx.attachments (image-tool registration)`, `ctx.llm + an image-capable route (image-tool execution)` | `tool/call`, `fs/write-intent or fs/edit-intent for mutations`, `fs/observed after read presence/absence or successful file operation`, `durable attachment (read_image)`, `tool/result` | - | Политику «сперва чтение — потом запись/правка» добавляет `@deepseek-ai/dsh-fs-observation-policy` (плагин event-гейта `fs/*`, без изменения схемы); ожидается, что развёртывание, загружающее эти инструменты, загрузит и его. Инструмент изображений не регистрируется без `ctx.attachments`; его схема не зависит от маршрута, и выполнение отказывает, если конкретная промаршрутизированная модель не заявляет приём изображений. |
| `@deepseek-ai/dsh-tool-fs-search` | `glob`, `grep` | `ctx.tools`, `ctx.subprocess`, `ctx.systemPrompt` | `tool/call`, `tool/result` | - | glob и grep — безусловные инструменты обнаружения: они порождают упакованный бинарник ripgrep (`@vscode/ripgrep`) через ctx.subprocess как обычные вызовы на переднем плане (никогда — фоновые задачи), без хостовой установки `rg` и без shell-слоя. Каталог использует `sampleOverCapGlobResults: true`; развёртывания должны выбирать такое поведение явно. Ограниченные результаты сохраняют полный форматированный список через опциональный бэкенд ctx.spillStore; возвращённые локаторы доступны для последующего чтения/поиска, когда бэкенд раскрывает локальные пути в co-located развёртываниях. |
| `@deepseek-ai/dsh-tool-terminal` | `terminal_close`, `terminal_list`, `terminal_open`, `terminal_read`, `terminal_send`, `terminal_signal` | `ctx.tools`, `ctx.terminals`, `ctx.systemPrompt`, `ctx.jobs at call time for run_in_background` | `tool/call`, `tool/result` | - | Шесть терминальных инструментов — opt-in и дополняют одноразовые shell/файловые инструменты. `terminal_send(run_in_background: true)` регистрируется в `ctx.jobs`; TUI, именованные клавиатурные последовательности, BEL, resize, автостарт и совместное использование между агентами в схеме отсутствуют. |
| `@deepseek-ai/dsh-tool-goal` | `create_goal`, `get_goal`, `update_goal` | `ctx.tools`, `ctx.agents`, `ctx.goals`, `ctx.systemPrompt`, `a calling Agent in an authorized open turn` | `tool/call`, `goal/change for mutations`, `tool/result` | - | create, edit, pause и resume требуют корневых полномочий прямого человека; complete и blocked принимают также точный текущий goal round. Граница снизу для blocked по умолчанию — три зачтённых раунда. |
| `@deepseek-ai/dsh-schedule` | `schedule_create`, `schedule_delete`, `schedule_list` | `ctx.tools`, `ctx.sessions`, `Session persistence`, `a future live root Agent` | `tool/call`, `schedule/change create or delete`, `tool/result` | - | Регистрируется только внутри скоупов живого корневого Agent, созданных после загрузки opt-in плагина Schedule. Версия 1 принимает after_seconds, явное абсолютное at и ограниченный fixed-rate every_seconds и раскрывает доставку в пределах сессии; управляющие чтения и мутации требуют общего барьера Session persistence. |
| `@deepseek-ai/dsh-tool-lsp` | `lsp` | `ctx.tools`, `ctx.lsp`, `ctx.systemPrompt` | `tool/call`, `tool/result` | - | Инструмент lsp удерживает выбор провайдера и субпроцессы языковых серверов за ctx.lsp, поэтому его обращённая к модели схема стабильна между провайдерами. В рантайме требует зарегистрированного провайдера (например, `@deepseek-ai/dsh-lsp-stdio`); без него запрос возвращает структурную ошибку `LSP_UNAVAILABLE`, а не меняет схему. |
| `@deepseek-ai/dsh-tool-ralph` | `ralph` | `ctx.tools`, `ctx.workflowEngine`, `ctx.subagents`, `ctx.systemPrompt`, `a calling Agent (exec.agent parents every fresh round)` | `tool/call`, `tool/result`, `workflow and child session events during execution` | - | Фиксированный воркфлоу на переднем плане стартует один свежий структурированный дочерний агент на раунд; модель выбирает только неизменяемую цель и опциональный потолок раундов. |
| `@deepseek-ai/dsh-tool-skill` | `skill` | `ctx.tools`, `ctx.agents`, `ctx.skills` | `tool/call`, `tool/result`, `user/message replacement catalogs via agent.inject()` | - | - |
| `@deepseek-ai/dsh-tool-session-query` | `session_event_read`, `session_event_search`, `session_event_trace`, `session_search`, `session_trace` | `ctx.tools`, `ctx.systemPrompt`, `ctx.sessionQuery`, `a calling Agent for workspace authority` | `tool/call`, `tool/result` | - | Пять read-only инструментов скрывают курсоры провайдеров и авторизуют каждый результат от неизменяемой сессии вызывающего агента. Пакет — opt-in; композиции, которым нужны принудительные дедлайны или ограниченный inline-вывод, дополнительно монтируют универсальные политики timeout или spill. |
| `@deepseek-ai/dsh-tool-subagent` | `subagent` | `ctx.tools`, `ctx.subagents`, `ctx.systemPrompt` | `tool/call`, `tool/result`, `child session events through the chosen provider` | `subagent`, `subagent_fork` | Зарегистрированное имя инструмента — конфиг времени загрузки `toolName` (по умолчанию `subagent`); схема выше соответствует этому умолчанию. Композиции поставки загружают этот пакет по разу на каждый бэкенд субагентов, поэтому модель дополнительно видит `subagent_fork`, привязанный к fork-бэкенду. Описание экземпляра, параметр `run_in_background` и политика системного промпта следуют его собственным `backgroundMode` и `enableRunInBackground`, поэтому две схемы поставки не идентичны: `subagent` — `continuable` и по умолчанию считает опущенные вызовы фоновыми с автоматической доставкой итога, тогда как `subagent_fork` остаётся `one-shot` и по умолчанию направляет их на передний план — см. `packages/bundle/base/cordis.patch.yml` и `examples/acp-agent/cordis.yml`. |
| `@deepseek-ai/dsh-tool-subagent-control` | `interrupt_agent`, `list_agents`, `send_message` | `ctx.tools`, `ctx.subagents`, `ctx.agents and ctx.sessionProjections (list_agents only)` | `tool/call`, `tool/result`, `child session events through ctx.subagents` | - | Глобально именованные управляющие инструменты над continuable фоновыми субагентами: привязанные к провайдеру экземпляры `tool-subagent` регистрируют отдельные инструменты делегирования, а этот пакет регистрирует `send_message` и `interrupt_agent` однократно, плюс `list_agents` из отдельно загружаемого плагина `/list-agents` (его строки каталога используют реестры sessionProjections и живых Agent). |
| `@deepseek-ai/dsh-tool-subagent-report` | `report` | `ctx.subagents`, `ctx.systemPrompt`, `a live continuable in-process child Agent` | `tool/call`, `tool/result`, `a user-role message in the direct parent session` | - | Регистрируется на каждый continuable внутрипроцессный дочерний агент, а не глобально, поэтому эта схема видна только внутри такого потомка и переживает его глобальный `toolFilter`. Тот же вклад устанавливает секцию промпта `tool:report` со скоупом потомка, которую этот каталог не рендерит. Обращённый к родителю инструмент `send_message` устанавливается независимо. |
| `@deepseek-ai/dsh-tool-jobs` | `job_kill`, `job_list`, `job_output` | `ctx.tools`, `ctx.jobs`, `ctx.systemPrompt` | `tool/call`, `tool/result`, `user/message via agent.inject() for background completion notices` | - | Контроллер фоновых задач, безразличный к их виду: фоновые bash-команды, PTY-отправки и субагенты читаются, перечисляются и снимаются через одни и те же три инструмента. Загрузка плагина подключает контроллер, взводящий `ctx.jobs.start()` у продюсеров. |
| `@deepseek-ai/dsh-experimental-tool-agent-team` | `followup_task`, `interrupt_agent`, `list_agents`, `send_message`, `spawn_teammate`, `team_task_create`, `team_task_get`, `team_task_list`, `team_task_update`, `wait_agent` | `ctx.tools`, `ctx.systemPrompt`, `ctx.agentTeams`, `an exact live Team member Agent` | `tool/call`, `team/member`, `team/message/queued`, `team/message/delivered`, `team/task`, `tool/result` | - | Все десять инструментов имеют скоуп неявных Team Lead'ов и долговечных участников команды. Бандл dsh-base в поставке держит пакет отключённым; документированный profile-патч Agent Teams включает его, отключая прежние имена управления continuable-потомками. |
| `@deepseek-ai/dsh-tool-todo` | `todo_write` | `ctx.tools`, `owning Agent session` | `tool/call`, `todo/write`, `tool/result` | - | todo_write — состояние во владении сессии; UI рендерят последнее событие todo/write как чек-лист. `allowParallelInProgress` обязателен без значения по умолчанию, поэтому каталог фиксирует свой выбор: `true` — описание приглашает несколько пунктов `in_progress`. Развёртывание, выбирающее `false`, получает тот же инструмент с описанием, просящим ровно одну активную задачу. |
| `@deepseek-ai/dsh-tool-workflow` | `workflow` | `ctx.tools`, `ctx.workflowEngine`, `ctx.systemPrompt`, `a calling Agent (exec.agent parents the script children)` | `tool/call`, `tool/result` | - | - |
| `@deepseek-ai/dsh-tool-web` | `web_fetch`, `web_search` | `ctx.tools`, `ctx.web`, `ctx.systemPrompt` | `tool/call`, `tool/result` | - | web_search и web_fetch удерживают выбор провайдера за ctx.web, поэтому обращённые к модели схемы остаются стабильными при замене бэкендов. |

<a id="deepseek-aidsh-tool-ask-user"></a>

## `@deepseek-ai/dsh-tool-ask-user`

### `ask_user_question`

Задайте пользователю краткий вопрос, когда перед продолжением нужно подтверждение, выбор или недостающая информация. Отправьте один или несколько вопросов, каждый — со стабильным id, который будет эхом возвращён в ответе.

```json
{
  "type": "object",
  "properties": {
    "questions": {
      "type": "array",
      "description": "Questions to ask the user before continuing.",
      "items": {
        "type": "object",
        "additionalProperties": true,
        "properties": {
          "id": {
            "type": "string",
            "description": "Stable id for this question; echoed in the answer."
          },
          "question": {
            "type": "string",
            "description": "The specific question to ask the user."
          },
          "header": {
            "type": "string",
            "description": "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\"."
          },
          "options": {
            "type": "array",
            "description": "Optional choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
            "items": {
              "type": "object",
              "additionalProperties": true,
              "properties": {
                "label": {
                  "type": "string",
                  "description": "Short user-facing option label."
                },
                "description": {
                  "type": "string",
                  "description": "One sentence explaining the tradeoff or impact."
                }
              },
              "required": [
                "label"
              ]
            }
          },
          "multi_select": {
            "type": "boolean",
            "description": "Whether the user may select more than one option. Defaults to false."
          }
        },
        "required": [
          "id",
          "question"
        ]
      }
    }
  },
  "required": [
    "questions"
  ]
}
```

Source: [`packages/interaction/tool-ask-user/src/index.ts`](../packages/interaction/tool-ask-user/src/index.ts)

ask_user_question приостанавливает вызов инструмента, пока активный UI-провайдер не вернёт ответ человека.

<a id="deepseek-aidsh-tools"></a>

## `@deepseek-ai/dsh-tools`

### `run_code`

Выполните программу на TypeScript против доступных инструментов. Принимает два обязательных аргумента: `code` — ТЕЛО асинхронной функции (только erasable syntax; top-level `await` и `return` работают), и `description` — краткое резюме действий программы. Вызывайте инструменты как `await tools.name(args)` согласно декларациям в системном промпте. Вывод программы — только то, что вы печатаете или возвращаете, — курируйте его. Результаты подтинструментов с изображениями прикрепляются после запуска.

```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "description": "The program: the body of an async TypeScript function."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Examples: \"Count TODO markers across packages\"; \"Read failing test and its fixture\"; \"Rename config key in every cordis.yml\"."
    }
  },
  "required": [
    "code",
    "description"
  ]
}
```

Source: [`packages/core/tools/src/code-mode.ts`](../packages/core/tools/src/code-mode.ts)

Принадлежит реестру инструментов как зарезервированный транспорт вне фильтруемых capability-слоёв при `mode: code` / `mode: both` (см. Agent Note о Code Mode). При `code` это единственный вклад реестра в протокол; остальные видимые возможности объявляются в сгенерированном разделе SDK на языке загруженного рантайма, и программа вызывает их через биндинги, планируемые по нативному контракту конкурентности (старты в порядке отправки и политика; concurrency-safe тела перекрываются до `maxParallelSubCalls`); эти биндинги заново входят в полный защищённый пайплайн инструментов и связывают каждое вложенное выполнение с этим внешним результатом.

<a id="deepseek-aidsh-plan-mode"></a>

## `@deepseek-ai/dsh-plan-mode`

### `exit_plan_mode`

Используйте только в режиме планирования. Покажите свой план на рассмотрение пользователю и после одобрения покиньте режим планирования. Отправляйте ПОЛНЫЙ план в markdown, начиная с заголовка #, который его называет. Пользователь может одобрить (выполняйте план со своего следующего шага) или продолжить планирование — его отзыв вернётся в результате инструмента; доработайте и представьте снова.

```json
{
  "type": "object",
  "properties": {
    "plan": {
      "type": "string",
      "description": "The complete plan, as markdown, starting with a # heading that names it."
    }
  },
  "required": [
    "plan"
  ]
}
```

Source: [`packages/plan/plan-mode/src/index.ts`](../packages/plan/plan-mode/src/index.ts)

exit_plan_mode остаётся в обращённой к модели схеме, пока планирование неактивно, чтобы переходы не добавляли поверх смены plan-политики ещё и дребезга каталога инструментов. Путь выполнения отклоняет вызовы вне режима планирования; в режиме планирования он показывает план через seam пользовательских вопросов (одобрить / продолжить планирование с фидбеком), а одобрение журналирует неактивность режима планирования на границе шага.

<a id="deepseek-aidsh-tool-bash"></a>

## `@deepseek-ai/dsh-tool-bash`

### `bash`

Выполните bash-команду (`bash -c`) и верните её stdout/stderr. Каждый вызов выполняется в свежем шелле: состояние (cwd, переменные, функции) не переживает вызовы — передавайте `workdir` вместо использования `cd`. Ненулевые коды выхода помечаются как `[exit code: N]`. Актуальные факты окружения харнесса доступны через управляемые переменные `$DSH_*`; осматривайте их при необходимости. Команды могут выполняться под файловой песочницей; заблокированная файловая операция сообщается как `[sandbox: file access denied under <mode> mode]` — это отказ политики, а не баг команды; не пробуйте другой путь. Длинный вывод обрезается до хвоста; полный вывод сохраняется в файл, чей путь сообщается, когда он доступен. Для долгих команд задайте `run_in_background: true`: вызов немедленно вернёт id задачи; её вывод читайте через `job_output`, остановку делайте через `job_kill`.

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"npm install\" → \"Install package dependencies\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

Source: [`packages/shell/tool-bash/src/index.ts`](../packages/shell/tool-bash/src/index.ts)

Инструмент bash — обращённый к модели потребитель seam исполнителя bash. Запуск с `run_in_background` регистрируется в универсальном рантайме `ctx.jobs` и собирается/останавливается через инструменты `job_*` из `@deepseek-ai/dsh-tool-jobs`; конфиг `enableRunInBackground` (по умолчанию true) при выключении убирает параметр целиком.

<a id="deepseek-aidsh-tool-pwsh"></a>

## `@deepseek-ai/dsh-tool-pwsh`

### `pwsh`

Выполните команду PowerShell (`pwsh -Command`) и верните её stdout/stderr. Каждый вызов выполняется в свежем процессе pwsh: состояние (cwd, переменные, функции) не переживает вызовы — передавайте `workdir` вместо использования `cd`. Пути имеют нативный вид Windows (`C:\...`); переменные окружения читайте через `$env:NAME`. Ненулевые коды выхода помечаются как `[exit code: N]`. Актуальные факты окружения харнесса доступны через управляемые переменные `$env:DSH_*`; осматривайте их при необходимости. Команды могут выполняться под файловой песочницей; заблокированная файловая операция сообщается как `[sandbox: file access denied under <mode> mode]` — это отказ политики, а не баг команды; не пробуйте другой путь. Длинный вывод обрезается до хвоста; полный вывод сохраняется в файл, чей путь сообщается, когда он доступен. В Windows принудительно убитая команда завершается как `[exit code: 1]` без сигнальной пометки — считайте это прерыванием, а не сбоем команды. Для долгих команд задайте `run_in_background: true`: вызов немедленно вернёт id задачи; её вывод читайте через `job_output`, остановку делайте через `job_kill`.

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"Get-Process\" → \"List running processes\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

Source: [`packages/shell/tool-pwsh/src/index.ts`](../packages/shell/tool-pwsh/src/index.ts)

Инструмент pwsh — потребитель seam исполнителя bash в диалекте PowerShell для Windows-композиций (за `ctx.shell` стоит исполнитель PowerShell вроде `@deepseek-ai/dsh-pwsh-local`); он повторяет инструмент bash вызов-в-вызов минус управление песочницей — запуски `run_in_background` регистрируются в универсальном рантайме `ctx.jobs` и собираются/останавливаются через инструменты `job_*`, а управляемое окружение `DSH_*` даёт `@deepseek-ai/dsh-shell-env`. Каждый вызов выполняется в свежем процессе (без персистентной PTY-сессии), с нативными путями `C:\...` и переменными `$env:NAME`.

<a id="deepseek-aidsh-tool-cordis"></a>

## `@deepseek-ai/dsh-tool-cordis`

### `cordis_define`

Определите неизменяемый Cordis Package. Для нового Plugin используйте kind:"new" и укажите только семантический префикс из 3–6 строчных английских букв; Host вернёт итоговые pluginId и packageId. Чтобы изменить существующий Plugin, используйте kind:"existing" с его точным pluginId — Package будет дописан без перезаписи старых версий. Укажите хотя бы одно из code.host и code.client. Каждое значение — обычное тело функции на JavaScript, возвращающее Cordis Plugin; преобразования TypeScript, JSX или импортов не выполняются. Запрашивайте Inspect до того, как зависеть от Service, Event, Builtin, Slot или токена. Define только проверяет параметры и синтаксис и записывает source: он не запрашивает одобрение, не выполняет apply и не меняет currentPackageId. В случае успеха вызовите cordis_run с возвращёнными ID.

```json
{
  "type": "object",
  "properties": {
    "plugin": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "new"
            },
            "idPrefix": {
              "type": "string",
              "description": "Suggested semantic prefix of 3–6 lowercase English letters; the Host adds a unique numeric suffix."
            }
          },
          "required": [
            "kind",
            "idPrefix"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "existing"
            },
            "pluginId": {
              "type": "string",
              "description": "Exact ID of an existing Plugin; the new Package is appended to that instance."
            }
          },
          "required": [
            "kind",
            "pluginId"
          ]
        }
      ]
    },
    "name": {
      "type": "string",
      "description": "Short, readable Package name."
    },
    "purpose": {
      "type": "string",
      "description": "One-sentence, user-facing description of the Package purpose."
    },
    "code": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "host": {
          "type": "string",
          "description": "Plain JavaScript function body that returns the Host-half Cordis Plugin."
        },
        "client": {
          "type": "string",
          "description": "Plain JavaScript function body that returns the browser Client-half Cordis Plugin."
        }
      }
    }
  },
  "required": [
    "plugin",
    "name",
    "purpose",
    "code"
  ]
}
```

Source: [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_list`

Перечислите все Inspect-провайдеры Cordis, известные сейчас Host: локальные провайдеры Host и последние манифесты, синхронизированные от Client. Каждая запись включает платформу, назначение, read-only методы и схемы входа/выхода. Вызывайте этот Tool до создания или изменения Package и выбирайте из его результата провайдера и метод для cordis_inspect_query. Не угадывайте имена и не считайте Inspect-метод бизнес-Service, который код Plugin может вызывать.

```json
{
  "type": "object",
  "properties": {}
}
```

Source: [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_query`

Выполните read-only запрос, явно объявленный Inspect-провайдером. platform, provider и method должны приходить из cordis_inspect_list, а input — удовлетворять схеме этого метода. Используйте этот Tool до cordis_define, чтобы прочитать точные методы Service, режимы Event, сигнатуры Builtin, схемы Tool, токены темы или живые деревья Slot с их props. Запросы Host выполняются локально. Запрос Client ждёт первого валидного ответа страницы и остаётся в ожидании, пока какая-нибудь страница не ответит или Tool не отменят. Этот Tool не может вызывать бизнес-методы Service и менять рантайм. Для Service.listService и Event.listEvents запросите без input, чтобы перемещаться по компактному каталогу сигнатур, затем запросите конкретный сервис или событие ради его структурного контракта и упомянутых типов. Для Slots.listSubTree запросите без root, чтобы перемещаться по компактному дереву, затем запросите точный корень ради его полного контракта регистрации и props.

```json
{
  "type": "object",
  "properties": {
    "platform": {
      "type": "string",
      "description": "Runtime platform that owns the Provider.",
      "enum": [
        "host",
        "client"
      ]
    },
    "provider": {
      "type": "string",
      "description": "Exact Provider ID returned by cordis_inspect_list."
    },
    "method": {
      "type": "string",
      "description": "Exact method name declared by the Provider manifest."
    },
    "input": {
      "description": "Optional query input; it must satisfy the method input schema."
    }
  },
  "required": [
    "platform",
    "provider",
    "method"
  ]
}
```

Source: [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_self`

Осматривайте динамические объекты Cordis, принадлежащие текущей Session, с нарастающей детализацией. Без ID перечисляются только сводки Plugin. С одним pluginId возвращаются указатели версий, последний Run и сводные по каждому Package. Только pluginId плюс packageId возвращает Host/Client-source того неизменяемого Package и диагностику рантайма. packageId сам по себе передан быть не может. Запрашивайте точный Package до обработки @pluginId, починки асинхронного сбоя или определения обновлённой версии. Этот Tool read-only: он не исполняет код и не меняет указатели версий.

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable Plugin ID returned by cordis_define or injected by @pluginId; omit it to list every current Plugin."
    },
    "packageId": {
      "type": "string",
      "description": "Exact immutable Package ID owned by pluginId; when specified, source and diagnostics are returned."
    }
  }
}
```

Source: [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_run`

Активируйте один точный Package динамического Plugin. mode:"run" — для первой активации, перезапуска currentPackageId или отката. Когда current существует, используйте mode:"update" для переключения на другой Package, даже если Plugin сейчас остановлен. Неавторизованный Client Package создаёт запрос на одобрение и возвращает awaiting-approval; авторизованный Package возвращает starting и продолжает асинхронно в браузере. Ни один результат не ждёт итогового исхода внутри Tool. currentPackageId меняется только после полного успеха; при сбое старый current и целевой next остаются. Асинхронные успех, отказ или технический сбой сообщаются через state и steering. После технического сбоя прочитайте диагностику через cordis_inspect_self, исправьте тот же Plugin и повторите автономно. Не запрашивайте одобрение снова после отказа пользователя.

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable Plugin ID returned by cordis_define."
    },
    "packageId": {
      "type": "string",
      "description": "Exact immutable Package ID to activate under that Plugin."
    },
    "mode": {
      "type": "string",
      "description": "Use run for the first activation, restarting current, or rollback; use update to switch from current to a different Package.",
      "enum": [
        "run",
        "update"
      ]
    }
  },
  "required": [
    "pluginId",
    "packageId",
    "mode"
  ]
}
```

Source: [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_stop`

Остановите текущий Run динамического Plugin и отмените незавершённые запросы одобрения или активации. Plugin, все неизменяемые Package, grant'ы, currentPackageId и nextPackageId сохраняются, чтобы позже запускать или обновлять напрямую. Остановка уже остановленного Plugin завершается идемпотентно. Используйте этот Tool для временного отключения эффектов; cordis_undefine — для постоянного удаления.

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable dynamic Plugin ID to stop."
    }
  },
  "required": [
    "pluginId"
  ]
}
```

Source: [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_undefine`

Безвозвратно удалите динамический Plugin, принадлежащий текущей Session. Если он работает или ждёт одобрения, сперва остановите его и отмените запрос, затем удалите все Package, grant'ы и указатели версий. После возврата этого вызова его pluginId, packageIds, ссылка @ и бизнес-представления Package недействительны; исторические карточки хранят только запись «Plugin removed». Не вызывайте этот Tool, когда версии должны оставаться доступными для рестарта или отката; вместо него используйте cordis_stop.

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable dynamic Plugin ID to remove permanently."
    }
  },
  "required": [
    "pluginId"
  ]
}
```

Source: [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

Ни в одном дереве поставки (осознанный opt-in — код динамического пакета достигает реального рантайма, см. .agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md). Набор инструментов внедряет `ctx.dynamicCordisRunner` из `@deepseek-ai/dsh-cordis-host-runner`, который владеет реестром определений и vm-песочницей; композиция без него никогда не активирует эти инструменты. Работающий пакет может регистрировать ДОПОЛНИТЕЛЬНЫЕ обращённые к модели инструменты, пока его не остановят, не снимут его определение или DSH не перезапустится; полный изменённый заголовок запроса журналирует эти смены набора инструментов.

<a id="deepseek-aidsh-tool-bash-persistent"></a>

## `@deepseek-ai/dsh-tool-bash-persistent`

### `bash`

Выполняйте команды в персистентном bash-шелле. Состояние, включая текущий каталог и экспортированные переменные окружения, сохраняется между вызовами для этого агента.

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

Source: [`packages/shell/tool-bash-persistent/src/index.ts`](../packages/shell/tool-bash-persistent/src/index.ts)

Один персистентный инструмент bash с изоляцией по владельцу; композиция развёртывания подставляет PTY-бэкенд и может переопределить обращённое к модели описание окружения.

<a id="deepseek-aidsh-tool-pwsh-persistent"></a>

## `@deepseek-ai/dsh-tool-pwsh-persistent`

### `pwsh`

Выполняйте команды в персистентном шелле PowerShell. Состояние, включая текущий каталог и экспортированные переменные окружения, сохраняется между вызовами для этого агента.

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

Source: [`packages/shell/tool-pwsh-persistent/src/index.ts`](../packages/shell/tool-pwsh-persistent/src/index.ts)

Один персистентный инструмент pwsh с изоляцией по владельцу, Windows-парная сторона персистентного инструмента bash; композиция развёртывания подставляет PTY-бэкенд диалекта pwsh и может переопределить обращённое к модели описание окружения.

<a id="deepseek-aidsh-tool-str-replace-editor"></a>

## `@deepseek-ai/dsh-tool-str-replace-editor`

### `str_replace_editor`

Собственный инструмент правки для просмотра, создания и редактирования файлов
* Состояние персистентно между вызовами команд и обсуждениями с пользователем
* Если `path` — файл, `view` показывает результат применения `cat -n`. Если `path` — каталог, `view` перечисляет нескрытые файлы и каталоги до 2 уровней вглубь
* Команду `create` нельзя использовать, если указанный `path` уже существует как файл
* Если `command` порождает длинный вывод, он будет обрезан и помечен `<response clipped>`

Замечания по использованию команды `str_replace`:
* Параметр `old_str` должен совпадать ДОСЛОВНО с одной или несколькими подряд идущими строками исходного файла. Следите за пробельными символами!
* Если параметр `old_str` не уникален в файле, замена выполнена не будет. Включите в `old_str` достаточно контекста, чтобы сделать его уникальным
* Параметр `new_str` должен содержать отредактированные строки, которые заменят `old_str`

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The commands to run. Allowed options are: `view`, `create`, `str_replace`, `insert`.",
      "enum": [
        "view",
        "create",
        "str_replace",
        "insert"
      ]
    },
    "path": {
      "type": "string",
      "description": "Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`."
    },
    "file_text": {
      "type": "string",
      "description": "Required parameter of `create` command, with the content of the file to be created."
    },
    "insert_line": {
      "type": "integer",
      "description": "Required parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`."
    },
    "new_str": {
      "type": "string",
      "description": "Optional parameter of `str_replace` command containing the new string (if not given, no string will be added). Required parameter of `insert` command containing the string to insert."
    },
    "old_str": {
      "type": "string",
      "description": "Required parameter of `str_replace` command containing the string in `path` to replace."
    },
    "view_range": {
      "type": "array",
      "description": "Optional parameter of `view` command when `path` points to a file. If none is given, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file.",
      "items": {
        "type": "integer"
      }
    }
  },
  "required": [
    "command",
    "path"
  ]
}
```

Source: [`packages/fs/tool-str-replace-editor/src/index.ts`](../packages/fs/tool-str-replace-editor/src/index.ts)

Автономный инструмент просмотра/создания/уникальной литеральной замены/вставки строк поверх файлового seam; компонуется с любым shell- или терминальным API.

<a id="deepseek-aidsh-tool-fs"></a>

## `@deepseek-ai/dsh-tool-fs`

### `edit`

Отредактируйте существующий текстовый файл UTF-8, заменяя буквальный текст.

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to edit, resolved by the filesystem backend."
    },
    "old_string": {
      "type": "string",
      "description": "Literal text to replace. Must match exactly."
    },
    "new_string": {
      "type": "string",
      "description": "Literal replacement text. Use an empty string to delete the match."
    },
    "replace_all": {
      "type": "boolean",
      "description": "Replace all matches. Defaults to false; when false, old_string must appear exactly once."
    }
  },
  "required": [
    "file_path",
    "old_string",
    "new_string"
  ]
}
```

Source: [`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read`

Прочитайте текстовый файл UTF-8 и верните содержимое с номерами строк.

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to read, resolved by the filesystem backend."
    },
    "offset": {
      "type": "number",
      "description": "1-based first line to return. Defaults to 1."
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of lines to return. Defaults to 2000."
    }
  },
  "required": [
    "file_path"
  ]
}
```

Source: [`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read_image`

Прочитайте файл PNG/JPEG/WebP/GIF и верните само изображение. Харнесс проверяет и уменьшает крупные поддерживаемые изображения перед следующим запросом к модели, поэтому используйте этот инструмент напрямую вместо установки библиотек для изображений или создания миниатюр просто ради осмотра картинки. Независимые файлы можно читать параллельно небольшими пачками. Требует, чтобы текущая модель принимала image-вход.

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to the image file, resolved by the filesystem backend."
    }
  },
  "required": [
    "file_path"
  ]
}
```

Source: [`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `write`

Создайте или полностью замените текстовый файл UTF-8.

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to write, resolved by the filesystem backend."
    },
    "content": {
      "type": "string",
      "description": "Full UTF-8 text content to write."
    }
  },
  "required": [
    "file_path",
    "content"
  ]
}
```

Source: [`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

Политику «сперва чтение — потом запись/правка» добавляет `@deepseek-ai/dsh-fs-observation-policy` (плагин event-гейта `fs/*`, без изменения схемы); ожидается, что развёртывание, загружающее эти инструменты, загрузит и его. Инструмент изображений не регистрируется без `ctx.attachments`; его схема не зависит от маршрута, и выполнение отказывает, если конкретная промаршрутизированная модель не заявляет приём изображений.

<a id="deepseek-aidsh-tool-fs-search"></a>

## `@deepseek-ai/dsh-tool-fs-search`

### `glob`

Найдите файлы, чьи пути совпадают с glob-шаблоном. Возвращает пути файлов — никогда каталоги — включая скрытые и игнорируемые файлы (каталоги метаданных VCS исключены). До 100 путей возвращаются в порядке времени изменения; больший результат вместо этого возвращает 100 путей, прореженных по верхнеуровневым записям, сообщает об этом и указывает, где сохранён полный отсортированный список. Этот инструмент не перечисляет записи каталогов.

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Glob pattern to match file paths against (e.g. \"**/*.ts\", \"src/**/*.test.js\"). A pattern with no \"/\" matches the basename at any depth, so \"*\" and \"*.ts\" both search the whole tree; include a separator to anchor the depth."
    },
    "path": {
      "type": "string",
      "description": "Directory to search in. Defaults to the session workspace; a relative path resolves against it."
    }
  },
  "required": [
    "pattern"
  ]
}
```

Source: [`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

### `grep`

Ищите в содержимом файлов регулярным выражением ripgrep. Возвращает совпавшие строки с номерами строк, сгруппированные по файлам. Первые 250 совпадений возвращаются инлайн; ограниченный результат сообщает, где сохранён полный список совпадений. Для окружающего контекста прочитайте совпавший файл через read.

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Regular expression to search for (ripgrep syntax)."
    },
    "path": {
      "type": "string",
      "description": "File or directory to search. Defaults to the session workspace; a relative path resolves against it."
    },
    "include": {
      "type": "string",
      "description": "One glob filter for which files to search (e.g. \"*.ts\", \"*.{js,jsx}\"). Not a list; negation is not supported."
    }
  },
  "required": [
    "pattern"
  ]
}
```

Source: [`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

glob и grep — безусловные инструменты обнаружения: они порождают упакованный бинарник ripgrep (`@vscode/ripgrep`) через ctx.subprocess как обычные вызовы на переднем плане (никогда — фоновые задачи), без хостовой установки `rg` и без shell-слоя. Каталог использует `sampleOverCapGlobResults: true`; развёртывания должны выбирать такое поведение явно. Ограниченные результаты сохраняют полный форматированный список через опциональный бэкенд ctx.spillStore; возвращённые локаторы доступны для последующего чтения/поиска, когда бэкенд раскрывает локальные пути в co-located развёртываниях.

<a id="deepseek-aidsh-tool-terminal"></a>

## `@deepseek-ai/dsh-tool-terminal`

### `terminal_close`

Закройте один персистентный терминал и дождитесь исчезновения его захваченного дерева собственных процессов.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

Source: [`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_list`

Перечислите персистентные терминальные сессии, принадлежащие текущему агенту.

```json
{
  "type": "object",
  "properties": {}
}
```

Source: [`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_open`

Создайте персистентную терминальную сессию с изоляцией по владельцу из зарегистрированного типа бэкенда. Используйте для shell- или REPL-состояния, которое должно переживать вызовы инструментов.

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "description": "Registered terminal backend type, usually \"shell\"."
    },
    "name": {
      "type": "string",
      "description": "Optional owner-local display name such as \"main\" or \"gdb\"."
    },
    "cwd": {
      "type": "string",
      "description": "Initial working directory. Defaults to the deployment workspace root."
    }
  },
  "required": [
    "type"
  ]
}
```

Source: [`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_read`

Прочитайте ограниченную страницу удерживаемого вывода персистентного терминала, не отправляя вход.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "offset": {
      "type": "number",
      "description": "Newest-relative line offset (default 0)."
    },
    "count": {
      "type": "number",
      "description": "Requested line count (default 500; backend caps apply)."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

Source: [`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_send`

Отправьте текст в персистентный терминал. По умолчанию Enter отправляется, а вызов ждёт промпта, ожидания stdin, тишины вывода, таймаута или завершения сессии. Фоновый режим возвращает id задачи для job_output/job_kill.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id returned by terminal_open or terminal_list."
    },
    "text": {
      "type": "string",
      "description": "UTF-8 text to write to the terminal."
    },
    "submit": {
      "type": "boolean",
      "description": "Submit Enter after text (default true). Set false for control characters or incomplete REPL input."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Return a job id immediately; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "sessionId",
    "text"
  ]
}
```

Source: [`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_signal`

Отправьте разрешённый сигнал текущей группе процессов переднего плана персистентного терминала.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "signal": {
      "type": "string",
      "description": "Signal to deliver. Shell-targeted SIGKILL is rejected; use terminal_close.",
      "enum": [
        "SIGINT",
        "SIGTERM",
        "SIGKILL",
        "SIGTSTP",
        "SIGHUP"
      ]
    }
  },
  "required": [
    "sessionId",
    "signal"
  ]
}
```

Source: [`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

Шесть терминальных инструментов — opt-in и дополняют одноразовые shell/файловые инструменты. `terminal_send(run_in_background: true)` регистрируется в `ctx.jobs`; TUI, именованные клавиатурные последовательности, BEL, resize, автостарт и совместное использование между агентами в схеме отсутствуют.

<a id="deepseek-aidsh-tool-goal"></a>

## `@deepseek-ai/dsh-tool-goal`

### `create_goal`

Создайте одну сохраняемую цель завершения той же сессии, когда текущий прямой запрос человека — долгоживущая задача, которая должна продолжаться через автономные goal round'ы. Такое намерение можно вывести и не требуя от пользователя слов «create a goal». Не используйте это для тривиальной работы в один ход. Исполнение отклоняет полномочия не-человека и субагента.

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The concrete completion objective inferred from the direct human request."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Optional positive safe-integer limit on automatic continuation rounds."
    }
  },
  "required": [
    "objective"
  ]
}
```

Source: [`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `get_goal`

Прочитайте текущую цель той же сессии, включая её точные id/ревизию, формулировку цели, фазу, число выполненных раундов продолжения, лимит раундов, причину блокировки при наличии и взведено ли ещё одно продолжение. Вызывайте это перед обновлением цели.

```json
{
  "type": "object",
  "properties": {}
}
```

Source: [`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `update_goal`

Обновите точную текущую ревизию цели. edit, pause и resume требуют прямого запроса верхнеуровневого человека. Во время автоматического продолжения текущей цели допустимы также complete и blocked. blocked отклоняется до настроенного минимального числа раундов; модель остаётся ответственной за суждение, что то же условие держалось все эти раунды, и должна объяснить это в blocked_reason.

```json
{
  "type": "object",
  "properties": {
    "goal_id": {
      "type": "string",
      "description": "Exact id returned by get_goal."
    },
    "revision": {
      "type": "number",
      "description": "Exact positive revision returned by get_goal."
    },
    "action": {
      "type": "string",
      "description": "edit | pause | resume | complete | blocked",
      "enum": [
        "edit",
        "pause",
        "resume",
        "complete",
        "blocked"
      ]
    },
    "objective": {
      "type": "string",
      "description": "Replacement objective; valid only with action edit."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Replacement cap; valid only with action edit."
    },
    "blocked_reason": {
      "type": "string",
      "description": "Concrete blocking condition; required only with action blocked."
    }
  },
  "required": [
    "goal_id",
    "revision",
    "action"
  ]
}
```

Source: [`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

create, edit, pause и resume требуют корневых полномочий прямого человека; complete и blocked принимают также точный текущий goal round. Граница снизу для blocked по умолчанию — три зачтённых раунда.

<a id="deepseek-aidsh-schedule"></a>

## `@deepseek-ai/dsh-schedule`

### `schedule_create`

Создайте одно напоминание в текущей сессии. Укажите непустой prompt и ровно один селектор: положительный safe-integer after_seconds — задержка; at — строгий offset date-time или объект локальных даты/времени; либо safe-integer every_seconds не меньше 300. Напоминания с фиксированным темпом остаются выровненными по моменту создания, пропускают пропущенные срабатывания и собирают в батч одно последнее срабатывание согласно правилу просрочки. Доставка локальна для сессии: напоминание сработает вовремя, только пока эта сессия жива, иначе станет просроченным до возобновления сессии.

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Reminder content to present when the target becomes due."
    },
    "after_seconds": {
      "type": "number",
      "description": "Positive safe-integer delay in seconds."
    },
    "every_seconds": {
      "type": "number",
      "description": "Fixed-rate safe-integer interval in seconds, at least 300."
    },
    "at": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "date": {
              "type": "string"
            },
            "time": {
              "type": "string"
            },
            "time_zone": {
              "type": "string"
            }
          },
          "required": [
            "date",
            "time",
            "time_zone"
          ]
        }
      ],
      "description": "Absolute target as strict offset RFC 3339 or local date/time with an explicit IANA zone."
    }
  },
  "required": [
    "prompt"
  ]
}
```

Source: [`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_delete`

Удалите одно активное напоминание в текущей сессии по точному id, возвращённому schedule_create или schedule_list. Неизвестные или уже завершённые id возвращают deleted false.

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Exact session-local schedule id."
    }
  },
  "required": [
    "id"
  ]
}
```

Source: [`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_list`

Перечислите все активные напоминания текущей сессии в порядке создания, включая точный id, цель в UTC, состояние scheduled или overdue и режим доставки в пределах сессии.

```json
{
  "type": "object",
  "properties": {}
}
```

Source: [`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

Регистрируется только внутри скоупов живого корневого Agent, созданных после загрузки opt-in плагина Schedule. Версия 1 принимает after_seconds, явное абсолютное at и ограниченный fixed-rate every_seconds и раскрывает доставку в пределах сессии; управляющие чтения и мутации требуют общего барьера Session persistence.

<a id="deepseek-aidsh-tool-lsp"></a>

## `@deepseek-ai/dsh-tool-lsp`

### `lsp`

Запросите языковой сервер для точной навигации по коду. operation — одно из goToDefinition, findReferences, goToImplementation, hover. line и character — координаты курсора UTF-16, считаемые с единицы. findReferences включает объявление.

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "description": "goToDefinition, findReferences, goToImplementation, or hover.",
      "enum": [
        "goToDefinition",
        "findReferences",
        "goToImplementation",
        "hover"
      ]
    },
    "file_path": {
      "type": "string",
      "description": "The source file to query, relative to the workspace or absolute."
    },
    "line": {
      "type": "number",
      "description": "One-based line of the cursor."
    },
    "character": {
      "type": "number",
      "description": "One-based UTF-16 column of the cursor."
    }
  },
  "required": [
    "operation",
    "file_path",
    "line",
    "character"
  ]
}
```

Source: [`packages/lsp/tool-lsp/src/index.ts`](../packages/lsp/tool-lsp/src/index.ts)

Инструмент lsp удерживает выбор провайдера и субпроцессы языковых серверов за ctx.lsp, поэтому его обращённая к модели схема стабильна между провайдерами. В рантайме требует зарегистрированного провайдера (например, `@deepseek-ai/dsh-lsp-stdio`); без него запрос возвращает структурную ошибку `LSP_UNAVAILABLE`, а не меняет схему.

<a id="deepseek-aidsh-tool-ralph"></a>

## `@deepseek-ai/dsh-tool-ralph`

### `ralph`

Запустите на переднем плане Ralph-цикл свежих агентов к одной неизменяемой цели. Используйте только когда прямой человек явно просит Ralph или итерацию свежими агентами. Каждый раунд открывает нового потомка без родительской беседы и предыдущей дочерней сессии; общее рабочее пространство — долговременная память, через раунды проходит только ограниченный структурный отчёт. Вызов возвращается, когда воркер сообщит о завершении или конкретном блокере, либо по лимиту раундов. Обычная долгоживущая работа той же сессии относится к goal-инструментам.

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The immutable completion objective for every fresh Ralph round."
    },
    "maxRounds": {
      "type": "number",
      "description": "Optional positive safe-integer round cap, bounded by the deployment ceiling."
    }
  },
  "required": [
    "objective"
  ]
}
```

Source: [`packages/workflow/tool-ralph/src/index.ts`](../packages/workflow/tool-ralph/src/index.ts)

Фиксированный воркфлоу на переднем плане стартует один свежий структурированный дочерний агент на раунд; модель выбирает только неизменяемую цель и опциональный потолок раундов.

<a id="deepseek-aidsh-tool-skill"></a>

## `@deepseek-ai/dsh-tool-skill`

### `skill`

Загрузите полные инструкции доступного скилла. Вызывайте с точным именем скилла из каталога скиллов сессии до действий над задачей, которая называет или явно соответствует этому скиллу.

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The exact skill name from the available skills list."
    }
  },
  "required": [
    "name"
  ]
}
```

Source: [`packages/skill/tool-skill/src/index.ts`](../packages/skill/tool-skill/src/index.ts)

<a id="deepseek-aidsh-tool-session-query"></a>

## `@deepseek-ai/dsh-tool-session-query`

### `session_event_read`

Прочитайте одно полное неурезанное событие и опциональные сводки соседних сырых событий из авторизованной сессии.

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    },
    "before": {
      "type": "integer",
      "description": "Number of preceding raw events to summarize. Omit for none."
    },
    "after": {
      "type": "integer",
      "description": "Number of following raw events to summarize. Omit for none."
    }
  },
  "required": [
    "seq"
  ]
}
```

Source: [`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_search`

Ищите по прошлым событиям одной авторизованной сессии; текущая сессия исключает шаг, выполняющий этот вызов.

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "query": {
      "type": "string",
      "description": "Literal full-text query over the target session."
    },
    "seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

Source: [`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_trace`

Прочитайте каждую прямую замену и отношение к цитируемому исходному событию для одного события в авторизованной сессии.

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    }
  },
  "required": [
    "seq"
  ]
}
```

Source: [`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_search`

Ищите по прошлым сессиям в рабочем пространстве вызывающего и возвращайте сильнейшее совпавшее событие из каждой сессии.

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Literal full-text query over prior session history."
    },
    "session_ids": {
      "type": "array",
      "description": "Optional session ids to include.",
      "items": {
        "type": "string"
      }
    },
    "created_at_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time lower bound."
    },
    "created_at_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time upper bound."
    },
    "parent_session_ids": {
      "type": "array",
      "description": "Optional direct parent session ids.",
      "items": {
        "type": "string"
      }
    },
    "include_root_sessions": {
      "type": "boolean",
      "description": "Include sessions with no parent in the parent filter."
    },
    "availability": {
      "type": "array",
      "description": "Require at least one selected source availability.",
      "items": {
        "type": "string",
        "enum": [
          "live",
          "persisted"
        ]
      }
    },
    "event_seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "event_seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "event_time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "event_time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "event_surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

Source: [`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_trace`

Прочитайте авторизованную линию наследования сессий вокруг одной сессии, включая полные видимые отношения предков и потомков.

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    }
  }
}
```

Source: [`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

Пять read-only инструментов скрывают курсоры провайдеров и авторизуют каждый результат от неизменяемой сессии вызывающего агента. Пакет — opt-in; композиции, которым нужны принудительные дедлайны или ограниченный inline-вывод, дополнительно монтируют универсальные политики timeout или spill.

<a id="deepseek-aidsh-tool-subagent"></a>

## `@deepseek-ai/dsh-tool-subagent`

### `subagent`

Делегируйте самодостаточную задачу субагенту (отдельному агенту, работающему в собственном контексте), чтобы выгрузить сфокусированную независимую работу — исследование, реализацию в заданных рамках, анализ — и не расходовать контекст этой беседы. Субагент возвращает свой результат, а не промежуточные шаги. Дайте ему полный автономный промпт: он не видит эту беседу. Этот вызов по умолчанию ждёт результата. Задайте `run_in_background: true`, чтобы вернуть id задачи; собирайте через `job_output`, останавливайте через `job_kill`.

```json
{
  "type": "object",
  "properties": {
    "description": {
      "type": "string",
      "description": "A short (3-5 word) description of the delegated task, for display."
    },
    "prompt": {
      "type": "string",
      "description": "The complete, self-contained task for the subagent. It does not share this conversation's context, so include everything it needs."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Whether to run as a background job and return its id. Defaults to false; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "description",
    "prompt"
  ]
}
```

Source: [`packages/subagent/tool-subagent/src/index.ts`](../packages/subagent/tool-subagent/src/index.ts)

Зарегистрированное имя инструмента — конфиг времени загрузки `toolName` (по умолчанию `subagent`); схема выше соответствует этому умолчанию. Композиции поставки загружают этот пакет по разу на каждый бэкенд субагентов, поэтому модель дополнительно видит `subagent_fork`, привязанный к fork-бэкенду. Описание экземпляра, параметр `run_in_background` и политика системного промпта следуют его собственным `backgroundMode` и `enableRunInBackground`, поэтому две схемы поставки не идентичны: `subagent` — `continuable` и по умолчанию считает опущенные вызовы фоновыми с автоматической доставкой итога, тогда как `subagent_fork` остаётся `one-shot` и по умолчанию направляет их на передний план — см. `packages/bundle/base/cordis.patch.yml` и `examples/acp-agent/cordis.yml`.

<a id="deepseek-aidsh-tool-subagent-control"></a>

## `@deepseek-ai/dsh-tool-subagent-control`

### `interrupt_agent`

Запросите отмену текущего хода фонового агента по его agent id. Цель — ваш прямой потомок или более глубокий агент, созданный под вами. Останавливается только текущий ход: сообщения, уже стоящие в очереди агента, остаются отложенными до следующего send_message, запущенные им агенты продолжают работать, а сам агент остаётся доступным для продолжений. Этот вызов возвращается, как только запрос остановки принят, поэтому цель может ещё немного поработать; прерывание уже завершившегося агента — принятый no-op.

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The agent id of the running agent to interrupt."
    }
  },
  "required": [
    "agent_id"
  ]
}
```

Source: [`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

### `list_agents`

Перечислите свои continuable фоновых субагентов по долговечному id и метке. Используйте, чтобы вспомнить, кого вы запускали, а не для опроса о завершении — о завершении вам сообщат. Статус берётся из живого реестра: running — агент работает прямо сейчас; idle — загружен, но между ходами (может ждать агентов, которых запустил); ready — существует только в хранилище: возобновляемый, не терминальный и не результат, ждущий получения; `send_message` начинает новый ход в той же беседе, и прямой потомок остаётся кандидатом на `send_message` при любом статусе. Снапшот — не обещание доставки: `send_message` выполняет авторитетную проверку и всё же может отказать. Потомков, которые не удалось прочитать, отчёт называет диагностикой вместо того, чтобы молча их выбросить. Скоуп `descendants` обходит всё дерево под вами в устойчивом pre-order, снабжая каждую запись долговечным id прямой родительской сессии и глубиной. `send_message` можно использовать только для записей глубины 1; более глубокие записи — кандидаты только на `interrupt_agent`.

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "description": "children (default) lists direct children only; descendants walks the complete tree below you.",
      "enum": [
        "children",
        "descendants"
      ]
    }
  }
}
```

Source: [`packages/subagent/tool-subagent-control/src/list-agents.ts`](../packages/subagent/tool-subagent-control/src/list-agents.ts)

### `send_message`

Отправьте сообщение фоновому субагенту по его subagent id, продолжая ту же беседу. Оно станет следующим ходом субагента: если тот ещё работает, сообщение ждёт окончания его текущего хода и не может перенаправить уже идущую работу. Вызов не возвращает ответа субагента — лишь подтверждение доставки сообщения — так что используйте его, чтобы дать больше работы. Отказ означает, что сообщение НЕ доставлено.

```json
{
  "type": "object",
  "properties": {
    "subagent_id": {
      "type": "string",
      "description": "The subagent id returned when the background subagent was started."
    },
    "message": {
      "type": "string",
      "description": "The message to deliver to the subagent."
    }
  },
  "required": [
    "subagent_id",
    "message"
  ]
}
```

Source: [`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

Глобально именованные управляющие инструменты над continuable фоновыми субагентами: привязанные к провайдеру экземпляры `tool-subagent` регистрируют отдельные инструменты делегирования, а этот пакет регистрирует `send_message` и `interrupt_agent` однократно, плюс `list_agents` из отдельно загружаемого плагина `/list-agents` (его строки каталога используют реестры sessionProjections и живых Agent).

<a id="deepseek-aidsh-tool-subagent-report"></a>

## `@deepseek-ai/dsh-tool-subagent-report`

### `report`

Сообщите выбранное содержание агенту, который вас запустил. Вызывайте один раз перед завершением — с самодостаточным итоговым результатом — и раньше, для прогресса или находок, меняющих дальнейшие действия этого агента. Тот агент разделяет ваше рабочее пространство, но не получает автоматически ваш транскрипт, вывод инструментов или рассуждения, так что само по себе окончание работы — ещё не результат. Отчёт не заканчивает ваш ход и не завершает работу; получает его только ваш прямой родитель. Неудавшийся вызов всё же мог дойти, поэтому не повторяйте его вслепую.

```json
{
  "type": "object",
  "properties": {
    "output": {
      "type": "string",
      "description": "Actionable content for your parent; summarize conclusions and reference relevant shared paths."
    }
  },
  "required": [
    "output"
  ]
}
```

Source: [`packages/subagent/tool-subagent-report/src/index.ts`](../packages/subagent/tool-subagent-report/src/index.ts)

Регистрируется на каждый continuable внутрипроцессный дочерний агент, а не глобально, поэтому эта схема видна только внутри такого потомка и переживает его глобальный `toolFilter`. Тот же вклад устанавливает секцию промпта `tool:report` со скоупом потомка, которую этот каталог не рендерит. Обращённый к родителю инструмент `send_message` устанавливается независимо.

<a id="deepseek-aidsh-tool-jobs"></a>

## `@deepseek-ai/dsh-tool-jobs`

### `job_kill`

Запросите отмену работающей фоновой задачи по job id. Возвращается немедленно; задача фиксируется как убитая, когда её работа действительно прекратится.

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "reason": {
      "type": "string",
      "description": "Optional short reason, recorded in the log and forwarded to the job."
    }
  },
  "required": [
    "job_id"
  ]
}
```

Source: [`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_list`

Перечислите свои фоновые задачи (работающие и завершённые) с их id, видами и статусами.

```json
{
  "type": "object",
  "properties": {}
}
```

Source: [`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_output`

Прочитайте фоновую задачу. Потоковые задачи возвращают только вывод с момента предыдущего чтения; задачи с итоговым выводом возвращают свой результат после завершения. Каждый ответ оканчивается `[status: ...]`. Чтения неблокирующие, если не задано `wait: true` — оно ждёт до настроенного предела.

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "wait": {
      "type": "boolean",
      "description": "Block until the job reaches a terminal status or the timeout expires. A timed-out wait returns [status: running] and leaves the job alive."
    },
    "timeout_ms": {
      "type": "number",
      "description": "Max wait in milliseconds (only meaningful with wait: true). Defaults to the configured wait timeout; capped by the configured maximum."
    }
  },
  "required": [
    "job_id"
  ]
}
```

Source: [`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

Контроллер фоновых задач, безразличный к их виду: фоновые bash-команды, PTY-отправки и субагенты читаются, перечисляются и снимаются через одни и те же три инструмента. Загрузка плагина подключает контроллер, взводящий `ctx.jobs.start()` у продюсеров.

<a id="deepseek-aidsh-experimental-tool-agent-team"></a>

## `@deepseek-ai/dsh-experimental-tool-agent-team`

### `followup_task`

Отправьте долговечную follow-up задачу другому участнику Team и при необходимости начните ход.

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Team member name, or lead."
    },
    "message": {
      "type": "string",
      "description": "Self-contained message for the target."
    }
  },
  "required": [
    "target",
    "message"
  ]
}
```

Source: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `interrupt_agent`

Прервите текущий ход одного участника команды с сохранением его ожидающего инбокса. Только Team Lead.

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Teammate name."
    }
  },
  "required": [
    "target"
  ]
}
```

Source: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `list_agents`

Перечислите Lead'а и каждого долговечного участника команды с текущим рантайм-статусом.

```json
{
  "type": "object",
  "properties": {}
}
```

Source: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `send_message`

Отправьте долговечную информацию другому участнику Team, не запуская бездействующего участника.

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Team member name, or lead."
    },
    "message": {
      "type": "string",
      "description": "Self-contained message for the target."
    }
  },
  "required": [
    "target",
    "message"
  ]
}
```

Source: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `spawn_teammate`

Создайте одного именованного долговечного участника команды. Вызывать этот инструмент может только Team Lead.

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Unique lower-kebab-case teammate name."
    },
    "description": {
      "type": "string",
      "description": "Short description of the delegated responsibility."
    },
    "prompt": {
      "type": "string",
      "description": "Complete initial task for the teammate."
    },
    "context": {
      "type": "string",
      "description": "fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.",
      "enum": [
        "fresh",
        "fork"
      ]
    }
  },
  "required": [
    "name",
    "description",
    "prompt"
  ]
}
```

Source: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_create`

Создайте одну ничью отложенную задачу на общей доске задач Team.

```json
{
  "type": "object",
  "properties": {
    "subject": {
      "type": "string",
      "description": "Concise task title."
    },
    "description": {
      "type": "string",
      "description": "Complete task details and acceptance criteria."
    },
    "blocked_by": {
      "type": "array",
      "description": "Task ids that must complete first.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Advisory workspace-relative file or directory prefixes this task expects to modify.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "subject",
    "description"
  ]
}
```

Source: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_get`

Прочитайте полное последнее значение одной общей задачи до её изменения или выполнения.

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    }
  },
  "required": [
    "task_id"
  ]
}
```

Source: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_list`

Перечислите общие задачи, включая готовность, владельца, ревизию, блокеров и предупреждения write-скоупов.

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "description": "Optional exact status filter.",
      "enum": [
        "pending",
        "in_progress",
        "completed"
      ]
    },
    "owner": {
      "type": "string",
      "description": "Optional member-name filter; use unowned for tasks without an owner."
    },
    "ready": {
      "type": "boolean",
      "description": "Optional readiness filter."
    },
    "cursor": {
      "type": "integer",
      "description": "Zero-based result offset. Defaults to 0."
    },
    "limit": {
      "type": "integer",
      "description": "Number of rows, 1 through 100. Defaults to 50."
    }
  }
}
```

Source: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_update`

Выполните compare-and-set действия над общей задачей, используя последнюю ревизию из team_task_get или team_task_list.

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    },
    "expected_revision": {
      "type": "integer",
      "description": "Current task revision used as the CAS precondition."
    },
    "action": {
      "type": "string",
      "description": "Task transition to apply.",
      "enum": [
        "claim",
        "release",
        "edit",
        "set_dependencies",
        "complete",
        "reopen",
        "reassign",
        "delete"
      ]
    },
    "subject": {
      "type": "string",
      "description": "Replacement title for edit."
    },
    "description": {
      "type": "string",
      "description": "Replacement details for edit."
    },
    "blocked_by": {
      "type": "array",
      "description": "Complete blocker list for set_dependencies.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Replacement advisory write scopes for edit.",
      "items": {
        "type": "string"
      }
    },
    "owner": {
      "type": "string",
      "description": "Member name for Lead-only reassign; omit to unassign."
    }
  },
  "required": [
    "task_id",
    "expected_revision",
    "action"
  ]
}
```

Source: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `wait_agent`

Дождитесь следующей смены статуса участника команды, почтового ящика или общей задачи после старта этого вызова. Это никогда не будит неактивных участников и немедленно возвращает noProgress, когда никакой другой участник не работает и не поднимается. После пробуждения или таймаута перечитайте список вместо опроса.

```json
{
  "type": "object",
  "properties": {
    "timeout_ms": {
      "type": "integer",
      "description": "Wait duration in milliseconds, from 10000 through 3600000. Defaults to 30000."
    }
  }
}
```

Source: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

Все десять инструментов имеют скоуп неявных Team Lead'ов и долговечных участников команды. Бандл dsh-base в поставке держит пакет отключённым; документированный profile-патч Agent Teams включает его, отключая прежние имена управления continuable-потомками.

<a id="deepseek-aidsh-tool-todo"></a>

## `@deepseek-ai/dsh-tool-todo`

### `todo_write`

Записывайте и обновляйте структурированный список задач текущей работы. Отправляйте ВЕСЬ список каждым вызовом — он ЗАМЕНЯЕТ предыдущий (частичных обновлений и правок по одному пункту нет). Используйте для планирования многошаговой работы и показа прогресса: добавьте по одному todo на конкретный шаг до старта. Помечайте каждый todo, над которым идёт активная работа, как `in_progress` — несколько сразу, когда работа действительно идёт параллельно (например, конкурирующие субагенты или фоновые команды), один — для последовательной работы; пока работа остаётся, хотя бы одна задача должна быть `in_progress`. Помечайте todo как `completed` в момент завершения (не батчите завершения) и не оставляйте пунктов `in_progress`, только когда вся работа закончена. Для тривиальных одношаговых задач список пропустите. Статусы: `pending` (не начато), `in_progress` (в работе сейчас), `completed` (завершено).

```json
{
  "type": "object",
  "properties": {
    "todos": {
      "type": "array",
      "description": "The COMPLETE task list, replacing any previous list.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "content": {
            "type": "string",
            "description": "What the task is — a short imperative line."
          },
          "status": {
            "type": "string",
            "description": "pending (not started) | in_progress (now) | completed (done).",
            "enum": [
              "pending",
              "in_progress",
              "completed"
            ]
          }
        },
        "required": [
          "content",
          "status"
        ]
      }
    }
  },
  "required": [
    "todos"
  ]
}
```

Source: [`packages/todo/tool-todo/src/index.ts`](../packages/todo/tool-todo/src/index.ts)

todo_write — состояние во владении сессии; UI рендерят последнее событие todo/write как чек-лист. `allowParallelInProgress` обязателен без значения по умолчанию, поэтому каталог фиксирует свой выбор: `true` — описание приглашает несколько пунктов `in_progress`. Развёртывание, выбирающее `false`, получает тот же инструмент с описанием, просящим ровно одну активную задачу.

<a id="deepseek-aidsh-tool-workflow"></a>

## `@deepseek-ai/dsh-tool-workflow`

### `workflow`

Запустите скрипт-воркфлоу на JavaScript, оркестрирующий субагентов в масштабе. Используйте для работы, расходящейся веером по многим независимым кускам, — аудит по многим файлам, миграция, разноплановое исследование, состязательная проверка находок, — когда оркестрацию удобнее записать скриптом, а не делегировать ход за ходом.

Идентичность воркфлоу едёт в параметре `meta` как JSON: обязательные строки `name` (короткий kebab-case) и `description`, опциональные строка `whenToUse` и массив `phases` (`{title, detail?, provider?, model?}`). Параметр `script` — ТОЛЬКО тело обычного JavaScript (НЕ TypeScript и БЕЗ инструкции `export const meta` — meta это параметр, а не код); исполняется с top-level await; завершайте `return <value>` — значение должно быть JSON-сериализуемым и является результатом этого инструмента.

Хуки тела скрипта:
- `agent(prompt, opts?): Promise<any>` — доведите одного субагента до завершения. Без `opts.schema` промис разрешается финальным текстом потомка; с `opts.schema` (JSON-Schema с корнем-объектом, использующая ТОЛЬКО type/properties/required/additionalProperties/items/enum/const/oneOf — без pattern/format/числовых границ) — провалидированным объектом. Разрешается в `null`, если потомок упал (фильтруйте через `.filter(Boolean)`). Прочие opts: `label` (отображение), `phase` (группа прогресса) и независимые переопределения LLM-цели `provider`/`model` (каждое можно задать отдельно). Всё остальное (`effort`/`isolation`/`agentType`) отвергается громко.
- `pipeline(items, ...stages): Promise<any[]>` — прогоняйте каждый элемент через стадии независимо, БЕЗ барьера между стадиями (предпочтительно для многостадийной работы). Каждая стадия получает `(prev, item, index)`. Обычный throw стадии роняет этот ЭЛЕМЕНТ в `null` и пропускает его оставшиеся стадии.
- `parallel(thunks): Promise<any[]>` — запускайте функции без аргументов конкурентно и дождитесь ВСЕХ (барьер; используйте, только когда стадии действительно нужны все предыдущие результаты разом). Бросивший исключение thunk разрешается в `null`.
- `phase(title)` — откройте фазу прогресса; `log(message)` — комментируйте прогресс; `args` — вход `args` вызова инструмента, дословно.

Неверно использованные хуки (плохие аргументы, неизвестные опции, неподдерживаемые схемы, сработавшие лимиты) бросают ошибки, которые ВСЕГДА убивают скрипт, — они никогда не растворяются в поэлементном `null`.

Ограничения: действуют лимиты конкурентности и суммарного числа агентов; файловая система, сеть, таймеры или Node.js API не предоставляются — работу делают агенты, скрипт только координирует их. Запуск исполняется на переднем плане: вызов возвращается, когда весь скрипт завершится.

```json
{
  "type": "object",
  "properties": {
    "script": {
      "type": "string",
      "description": "The plain-JS workflow script body (top-level await allowed; NO `export const meta` statement; end with `return <json-value>`)."
    },
    "meta": {
      "type": "object",
      "description": "The workflow identity block (plain JSON — never code).",
      "additionalProperties": true,
      "properties": {
        "name": {
          "type": "string",
          "description": "Short kebab-case workflow name."
        },
        "description": {
          "type": "string",
          "description": "One-line description of what the workflow does."
        },
        "whenToUse": {
          "type": "string",
          "description": "Optional guidance on when this workflow applies."
        },
        "phases": {
          "type": "array",
          "description": "Optional phase declarations matched by phase() calls.",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "properties": {
              "title": {
                "type": "string",
                "description": "The phase title phase() calls match by exact string."
              },
              "detail": {
                "type": "string",
                "description": "Optional one-line description of the phase."
              },
              "provider": {
                "type": "string",
                "description": "Optional provider override this phase is expected to use."
              },
              "model": {
                "type": "string",
                "description": "Optional model override this phase is expected to use."
              }
            },
            "required": [
              "title"
            ]
          }
        }
      },
      "required": [
        "name",
        "description"
      ]
    },
    "args": {
      "type": "object",
      "description": "Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {\"files\": [...]}).",
      "additionalProperties": true
    }
  },
  "required": [
    "script",
    "meta"
  ]
}
```

Source: [`packages/workflow/tool-workflow/src/index.ts`](../packages/workflow/tool-workflow/src/index.ts)

<a id="deepseek-aidsh-tool-web"></a>

## `@deepseek-ai/dsh-tool-web`

### `web_fetch`

Получите содержимое конкретного HTTP(S)-URL и верните его, декодировав в текст.

```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "The HTTP(S) URL to fetch."
    }
  },
  "required": [
    "url"
  ]
}
```

Source: [`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

### `web_search`

Ищите актуальную информацию в вебе. Дайте 1–4 запроса в обязательном массиве queries. Возвращает опциональный сводный ответ и список URL источников.

```json
{
  "type": "object",
  "properties": {
    "queries": {
      "type": "array",
      "description": "Required search queries; accepts 1–4 items and merges their results.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "queries"
  ]
}
```

Source: [`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

web_search и web_fetch удерживают выбор провайдера за ctx.web, поэтому обращённые к модели схемы остаются стабильными при замене бэкендов.

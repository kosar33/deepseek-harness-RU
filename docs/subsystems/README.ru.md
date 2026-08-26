# Подсистемы

[English](README.md) | [中文](README.zh.md) | Русский

Одна страница на каждую подсистему DeepSeek Harness: что она такое, какими структурами данных оперирует и — там, где за ней стоит сервис `ctx` или скоуп событий, — сгенерированный раздел **Cordis API** со справочником её сервисов и событий. Каталог дополняет [architecture.md](../architecture.ru.md), где описано *поведение* поперёк подсистем (карта сервисов, жизненный цикл сессия/ход/шаг, таксономия событий); каждая страница здесь — справочник словаря и связей одной подсистемы.

| Страница | Охватывает |
|---|---|
| [core.md](core.ru.md) | как `packages/core` управляет agent loop: описание цикла пакет за пакетом, создание агентов и владение (`AgentHandle`), контракты доставки/отмены/перехвата дескриптора `Agent` и общерепозиторные типовые паттерны (`…Map → derived-union`, брендированные id) |
| [llm-streaming.md](llm-streaming.ru.md) | типы диалога из `packages/llm` — `Message`/`ContentBlock`, собранный запрос к модели, формат протокола `StreamChunk` и контракт адаптера, `BlockAssembler` и провайдерский контракт `LlmAdapter` |
| [token-meter.md](token-meter.ru.md) | неизменяемые скалярные и позиционные измерения воспроизведения с ревизиями потреблённого журнала |
| [scope.md](scope.ru.md) | идентичность скоупированной регистрации, носители диспетчеризации и контекст `Scope`, владеющий своими регистрациями |
| [typert.md](typert.ru.md) | дескрипторы удалённых вызовов, декларации lookup/Context, реестры Typert и границы Host Gateway/Client API |
| [goal.md](goal.ru.md) | персистентная идентичность цели (goal), снапшоты жизненного цикла, активация, записи изменений и атрибуция Round |
| [schedule.md](schedule.md) | записи напоминаний в пределах сессии, долговечные переходы, активные представления и доставка обычными ходами беседы |
| [commands.md](commands.ru.md) | сервис реестра человеческих команд: определения, обнаружение адаптеров, прямой вызов, результаты и представления разбора |
| [session.md](session.ru.md) | полный каталог вариантов `SessionEventMap`, `TurnTrigger`/`TurnEndReason`, `deriveMessages()`, охват исполнения и автономные события |
| [persistence.md](persistence.md) | seam долговечности: `SessionPersistence`, бэкенды JSONL и SQLite, `session/flush`, восстановление после сбоя, `SessionHeader` |
| [settings.md](settings.md) | seam пользовательских настроек: регистрация `SettingsNamespace`, многослойное разрешение (значения по умолчанию → композиционный `base` → пользовательский документ), скоупы владельцев, горячие фиксации |
| [credentials.md](credentials.ru.md) | seam учётных данных: ссылки `CredentialRef` (никогда не значения) в конфигурации, разрешение по каждой операции, безопасный для UI `CredentialInfo`, слои источников провайдеров |
| [session-query.md](session-query.md) | логические записи, точные чтения ограниченных событий, трассировки отношений, семантические фильтры/документы и страницы полнотекстовых результатов |
| [feedback.md](feedback.ru.md) | привязанные к жизненному циклу записи отзыва на каждое сообщение, оптимистичные версии, персистентность сопутствующими записями и контракт Host Remote |
| [session-title.md](session-title.ru.md) | долговечные снапшоты заголовков, цитируемые seq исходных сообщений и асинхронный контракт провайдера |
| [session-reference.md](session-reference.ru.md) | структурированные межсессийные ссылки: `SessionReferenceInput`/`Candidate`, подготовленные контексты сообщений, стабильная таксономия ошибок |
| [system-prompt.md](system-prompt.ru.md) | контекст каждой сборки, результаты провайдеров инструментов, секции промпта и кооперативная сборка |
| [tools.md](tools.ru.md) | все поля `ToolDefinition`, DSL схем, `ToolExecution`/`ToolResult`, типы UI представления инструментов и защищённый пайплайн исполнения |
| [user-questions.md](user-questions.ru.md) | опирающийся на UI seam вопросов и ответов человека: `AskUserQuestionRequest`, словарь ответов/вариантов, API провайдера, таксономия ошибок |
| [approval.md](approval.ru.md) | seam одноразового одобрения пользователем: `ApprovalRequest`, `ApprovalOutcome`, политика на сессию, события аудита и контракты отвечающего |
| [attachment.md](attachment.ru.md) | долговечная идентичность изображений и их метаданных, входные данные валидации, проверенные чтения и seam `AttachmentStore` |
| [shell.md](shell.ru.md) | seam исполнителя bash: `ShellExecRequest`/`Spec`, `ShellRunResult`, дескрипторы фоновых `ShellProcess` |
| [subprocess.md](subprocess.ru.md) | seam подпроцессов: полностью явный `SubprocessSpawnSpec`, читатели вывода по смещению, неклассифицированный `SubprocessOutcome` и управляемый словарь окружения `DSH_*` |
| [terminal.md](terminal.ru.md) | устойчивые id терминалов, контракты бэкенд/сессия, готовность к отправке, ограниченные чтения и видимые владельцу снапшоты |
| [sandbox.md](sandbox.ru.md) | разрешение политики на сессию и seam ограничения процессов: режимы файловых эффектов, политики исполнения/провайдеров, `ConfinedArgv`, принудительное применение и ошибки fail-closed |
| [code-runtime.md](code-runtime.ru.md) | seam исполнения кода: `CodeRunRequest`/`Result`, привязываемые пространства имён, захваченные журналы, таксономия `CodeRunFailure` |
| [extensions.md](extensions.ru.md) | версионированные динамические плагины и пакеты Cordis, активация Host/Client, одобрение, инспекция рантайма и демонтаж в конце жизненного цикла |
| [filesystem.md](filesystem.ru.md) | seam файловой системы: `FsTarget`, исходы чтения/записи/правки, состояние наблюдаемых файлов, `FsErrorCode` |
| [lsp.md](lsp.ru.md) | seam навигации LSP: `LspQueryRequest`/`Result`, `LspProvider`/`Service`, четыре операции, `LspError` |
| [skills.md](skills.md) | сервис скиллов: приоритет обнаружения, `SkillSummary`/`SkillDefinition`, каталог с префиксом сессии, обращённая к модели загрузка `skill` |
| [compaction.md](compaction.ru.md) | seam компакции: события сессии `compaction/*`, `CompactionResult`, интерфейс `CompactionEngine` |
| [subagent.md](subagent.ru.md) | seam субагентов: реестр именованных провайдеров, `SubagentStartRequest`/`Result`/`Run`, разделение возможностей старта и рантайма |
| [agent-team.md](agent-team.ru.md) | Агентские команды: неявная идентичность Lead, именованные continuable-участники, долговременный peer-почтовый ящик и общий DAG задач |
| [web.md](web.ru.md) | seam веб-доступа: `WebSearchRequest`/`Result`, `WebFetchRequest`/`Result`, `WebFetchBody`, доступность провайдеров, `WebError` |
| [spill.md](spill.ru.md) | seam хранения spill: `SaveTextSpill`, `SpillOwner`/`SpillSource`, `SpillRef`, брендированный `SpillLocator` |
| [workflow.md](workflow.ru.md) | воркфлоу-seam: `WorkflowStartRequest`, `WorkflowMeta`, `WorkflowRun`/`Result`, полезные нагрузки событий `workflow/*`, фатальность `WorkflowError` |
| [jobs.md](jobs.ru.md) | рантайм фоновых заданий: брендированные `JobId`, контракт производителя, представления потребителя и поведение сервиса `ctx.jobs` |
| [permission-presets.md](permission-presets.md) | слой пресетов разрешений: `PresetSpec`/`PresetOption`, производное состояние `custom`, только журналируемое событие `permission/preset` |
| [plan.md](plan.ru.md) | режим плана: только журналируемое состояние `plan/mode`, сброс ожидающего выбора, `PlanModeConfig`, рассмотрение плана через `exit_plan_mode` |
| [invariants.md](invariants.ru.md) | реестр инвариантов рантайма: конфигурация выбора `Config`, `InvariantInstaller`/`InvariantFailure`, контракт пустого компаньона |
| [web-server.md](web-server.ru.md) | HTTP-носитель: `WebRouteKind`/`WebRoute`, порядок сопоставления, единственное fallback-место, обходные преобразования индекса (`tapIndex`) |
| [storage.md](storage.ru.md) | подсистема хранилища: контракт бэкенда (`StorageBackend`), `StorageForms`, `DomainSpec`/`Domain`, `domain/changed` |
| [workspace.md](workspace.ru.md) | реестр рабочих пространств: `Workspace`/`WorkspaceId`, регистрация и разрешение, связь с `cwd` сессии |
| [client-modules.md](client-modules.ru.md) | таблица веб-плагинов: объявления `dsh.client`, протокольная композиция `WebBootGraph`, маршрут бандла и инъекция в индекс |
| [session-projection.md](session-projection.md) | seam проекции: `SessionProjectionMap`, чистый юнит `ProjectionDefinition`, согласованный срез `ProjectionSnapshot`, лента изменений |
| [session-telemetry.md](session-telemetry.md) | capability seam внешней отчётности о сессиях: `SessionTelemetryRecord`/`SessionTelemetrySeverity`, контракт `SessionTelemetrySink` и каскад редактирования `session-telemetry/record` |

> Декларации типов и их JSDoc на этих страницах эквивалентны источнику и проверяются на расхождение командой `pnpm run verify-type-equiv` (см. [development.md](../development.ru.md#документирование-типов-дословно-ts-type-equiv)). Обычные блоки сохраняют полные декларации; блоки `public-api` сохраняют декларации публичных классов без тел. Сервисы и события Cordis описываются в генерируемом разделе **Cordis API** каждой страницы.

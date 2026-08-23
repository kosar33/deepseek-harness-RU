# client/ — браузерная половина веб-GUI

[English](README.md) | [中文](README.zh.md) | Русский

Браузерная сторона веб-GUI dsh: загрузка оболочки, обмен между браузером и хостом, общие UI-сервисы и плагины функций. Правила авторинга живут в [AGENTS.md](AGENTS.md); хостовая половина — [`host/`](../host/README.md). Все, кроме `test-runtime`, — **продуктовые** пакеты с именами `@deepseek-ai/dsh-client-<name>`.

| Пакет | Назначение |
|---|---|
| [`web/`](web/README.md) | Загружает оболочку браузера из графа клиентских точек входа. |
| [`ui-renderer/`](ui-renderer/README.md) | Привязывает данные slot к React и монтирует собранное приложение после завершения клиентской загрузки. |
| [`modules/`](modules/README.md) | Загружает браузерные клиентские модули. |
| [`connection/`](connection/README.ru.md) | Поддерживает RPC-обмен между браузером и хостом и доставку событий. |
| [`runtime/`](runtime/README.ru.md) | Предоставляет общие клиентские сервисы для сессий, рабочих областей и композиции UI. |
| [`hmr/`](hmr/README.md) | Обновляет клиентские плагины во время разработки. |
| [`locale/`](locale/README.md) | Предоставляет настройки локализации и словари сообщений. |
| [`test-runtime/`](../test-support/client-runtime/README.md) | Предоставляет общую тестовую поддержку репозитория для пакетов клиентских функций. |
| [`ui-slots/`](ui-slots/README.md) | Определяет, как функции UI регистрируют и компонуют расширяемые slot. |
| [`ui-theme/`](ui-theme/README.ru.md) | Применяет выбранную цветовую тему. |
| [`ui-primitives/`](ui-primitives/README.ru.md) | Предоставляет общие элементы управления React, иконки и рендереры содержимого. |
| [`ui-attachment/`](ui-attachment/README.md) | Регистрирует презентацию вложений композера и изображений сообщений. |
| [`ui-layout/`](ui-layout/README.md) | Располагает основные области приложения. |
| [`ui-sidebar/`](ui-sidebar/README.md) | Представляет навигацию по рабочим областям и сессиям. |
| [`ui-brand-official/`](ui-brand-official/README.ru.md) | Наполняет общие browser-brand slot официальным названием и знаками. |
| [`ui-workspace/`](ui-workspace/README.ru.md) | Предоставляет поверхности выбора и создания рабочих областей. |
| [`ui-conversation/`](ui-conversation/README.ru.md) | Представляет активную беседу и её поверхность ввода. |
| [`ui-tool/`](ui-tool/README.md) | Компонует деревья вызовов инструментов и ключёванные представления по каждому инструменту. |
| [`ui-workflow-run/`](ui-workflow-run/README.md) | Воспроизводит долговечные запуски воркфлоу как вложенные раскрытия Chat с навигацией только по живым дочерним элементам. |
| [`ui-goal/`](ui-goal/README.md) | Представляет текущую цель и управляет ею. |
| [`ui-trajectory/`](ui-trajectory/README.md) | Представляет альтернативные виды активности агента. |
| [`ui-commands/`](ui-commands/README.ru.md) | Обеспечивает обнаружение и диспетчеризацию команд с учётом сессии. |
| [`ui-input-trigger/`](ui-input-trigger/README.md) | Координирует инлайн-подсказки команд и ссылок. |
| [`ui-skill/`](ui-skill/README.md) | Добавляет ссылки на скиллы в инлайн-подсказки. |
| [`ui-reference/`](ui-reference/README.md) | Единый источник ссылок Web `@file` / `@session`. |
| [`ui-subagent/`](ui-subagent/README.ru.md) | Предоставляет навигацию по субагентам, состояния дочерних транскриптов и инлайн-ссылки. |
| [`ui-jobs/`](ui-jobs/README.md) | Перечисляет фоновые задания этой сессии в заголовке беседы. |
| [`ui-model-selection/`](ui-model-selection/README.md) | Предоставляет выбор модели на поверхностях беседы. |
| [`ui-permission/`](ui-permission-presets/README.md) | Настраивает разрешения по умолчанию и переключает доступ текущей сессии. |
| [`ui-plan/`](ui-plan/README.md) | Представляет статус активного plan mode и его орган выхода. |
| [`ui-settings-plugins/`](ui-settings-plugins/README.ru.md) | Владеет разделом настроек «Плагины», его точкой расширения вкладок и конфигурируемыми карточками плагинов хостовой плоскости. |
| [`ui-user-questions/`](ui-user-questions/README.ru.md) | Представляет интерактивные вопросы, запрошенные агентом. |
| [`ui-agent-preset/`](ui-agent-preset/README.ru.md) | Выбирает агентский пресет сессии и составляет пресетные композиции. |
| [`ui-settings/`](ui-settings/README.md) | Размещает интерфейс настроек и его области расширения. |
| [`ui-settings-general/`](ui-settings-general/README.md) | Предоставляет общий раздел настроек. |
| [`ui-settings-models/`](ui-settings-models/README.ru.md) | Предоставляет конфигурацию провайдеров моделей и онбординг DeepSeek. |
| [`ui-settings-plugin-inventory/`](ui-settings-plugin-inventory/README.md) | Добавляет read-only вкладку инвентаря Host Loader в настройки плагинов. |

Каждая дочерняя ссылка владеет своим контрактом и детальным поведением. Решения о межпакетной композиции и загрузке принадлежат [стандарту системы slot](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) и [заметке об архитектуре веб-клиента](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md).

Справочник подсистемы — [client-modules.md](../../docs/subsystems/client-modules.ru.md); [стандарт системы slot](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) — определяющая модель slot, а [заметка об архитектуре веб-клиента](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) владеет цепочкой загрузки и слоем объектов.

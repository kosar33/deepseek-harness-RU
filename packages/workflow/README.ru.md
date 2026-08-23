# workflow/ — семейство возможности динамических воркфлоу

[English](README.md) | [中文](README.zh.md) | Русский

Это семейство исполняет написанные моделью оркестрирующие воркфлоу над субагентами и открывает модели универсальный инструмент и инструменты фиксированной политики.

| Пакет | Роль | Ключ ctx |
|---|---|---|
| [`workflow/`](workflow/README.ru.md) | Определяет исполнение воркфлоу и события жизненного цикла | `ctx.workflowEngine` |
| [`workflow-worker-thread/`](workflow-worker-thread/README.ru.md) | Исполняет скрипты воркфлоу в воркер-потоках | регистрируется на `ctx.workflowEngine` |
| [`tool-workflow/`](tool-workflow/README.ru.md) | Открывает модели универсальное исполнение воркфлоу | регистрируется на `ctx.tools` |
| [`tool-ralph/`](tool-ralph/README.ru.md) | Открывает модели фиксированный воркфлоу Ralph на свежих агентах | регистрируется на `ctx.tools` |

Воркер-потоки изолируют исполнение воркфлоу от событийного цикла хоста, но не являются границей безопасности. См. решения о [динамических воркфлоу](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md) и об [инструменте Ralph](../../.agents/notes/implemented/feature/2026-07-19-fresh-agent-ralph-workflow-tool.md).

Справочник подсистемы — стартовые запросы, `WorkflowMeta`, результаты, живые запуски, события `workflow/*` — живёт в [docs/subsystems/workflow.ru.md](../../docs/subsystems/workflow.ru.md); решения — в Agent Notes о [динамических воркфлоу](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md) и о [потребителе Ralph](../../.agents/notes/implemented/feature/2026-07-19-fresh-agent-ralph-workflow-tool.md).

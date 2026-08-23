# jobs/ — семейство возможности фоновых задач

[English](README.md) | [中文](README.zh.md) | Русский

Это семейство даёт долго выполняющимся инструментам единый протокол фоновых задач, изолированный по владельцу, для наблюдения, отмены, ожидания и уведомлений о завершении.

| Пакет | Роль | ctx-ключ |
|---|---|---|
| [`jobs/`](jobs/README.ru.md) | Определяет реестр задач и контракт жизненного цикла | `ctx.jobs` |
| [`jobs-local/`](jobs-local/README.ru.md) | Реализует локальный относительно процесса реестр задач | регистрируется на `ctx.jobs` |
| [`tool-jobs/`](tool-jobs/README.ru.md) | Открывает модели управление задачами и уведомления о завершении | регистрируется на `ctx.tools` |

См. решения о [рантайме фоновых задач](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md) и о [реестре задач](../../.agents/notes/implemented/architecture/2026-07-26-job-registry-seam.md).

Справочник подсистем — схема id, контракт с ограждением по владельцу, снапшоты — это [docs/subsystems/jobs.md](../../docs/subsystems/jobs.ru.md); дизайн — в Agent Notes о [рантайме фоновых задач](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md) и о [контракте реестра задач](../../.agents/notes/implemented/architecture/2026-07-26-job-registry-seam.md).

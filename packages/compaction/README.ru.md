# compaction/ — семейство возможностей компакции

[English](README.md) | [中文](README.zh.md) | Русский

Семейство возможностей компакции (см. [capability seams](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)): Service Definition, суммаризирующий провайдер, компаньон прореживания результатов инструментов без обращения к модели и команда компакции для человека. Все пакеты — **продуктовые**.

| Package | Role | ctx key |
|---|---|---|
| [`compaction/`](compaction/README.ru.md) | Compaction seam и словарь событий | `ctx.compaction` |
| [`compaction-basic/`](compaction-basic/README.ru.md) | Бэкенд давления токенов и суммаризации | регистрирует `ctx.compaction` |
| [`compaction-tool-result-pruner/`](compaction-tool-result-pruner/README.ru.md) | Необязательное прореживание результатов инструментов без модели | `ctx.toolResultPruner` |
| [`command-compact/`](command-compact/README.ru.md) | Команда компакции для человека | регистрируется на `ctx.commands` |

Бэкенд, необязательный прореживатель и человеческая команда собираются через seam; измерение токенов остаётся отдельным сервисом семейства LLM. [Agent Note о capability seam компакции](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md) владеет обоснованием зависимостей.

Справочник подсистемы — события `compaction/*`, `CompactionResult`, сервис, исходы прореживания — находится в [docs/subsystems/compaction.ru.md](../../docs/subsystems/compaction.ru.md); намеренная зависимость seam от `dsh-session`/`dsh-llm` зафиксирована в [Agent Note о capability seam компакции](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md).

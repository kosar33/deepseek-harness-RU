# subagent/ — семейство возможности субагентов

[English](README.md) | [中文](README.zh.md) | Русский

Это семейство позволяет агенту делегировать работу дочерним агентам. В одном контексте могут сосуществовать несколько именованных провайдеров.

| Пакет | Роль | Ключ ctx |
|---|---|---|
| [`subagent/`](subagent/README.ru.md) | Определяет регистрацию провайдеров, делегацию и продолжение | `ctx.subagents` |
| [`subagent-inprocess/`](subagent-in-process-driver/README.ru.md) | Поставляет общий внутрипроцессный драйвер запусков | — |
| [`subagent-spawn-in-process/`](subagent-spawn-in-process/README.ru.md) | Запускает свежего внутрипроцессного ребёнка | регистрируется на `ctx.subagents` |
| [`subagent-fork-in-process/`](subagent-fork-in-process/README.ru.md) | Запускает внутрипроцессного ребёнка из завершённой истории родителя | регистрируется на `ctx.subagents` |
| [`subagent-acp/`](subagent-acp/README.ru.md) | Запускает внепроцессного ребёнка через ACP | регистрируется на `ctx.subagents` |
| [`subagent-codex/`](subagent-codex/README.ru.md) | Запускает настоящего ребёнка Codex app-server | регистрируется на `ctx.subagents` |
| [`subagent-claude-code/`](subagent-claude-code/README.ru.md) | Запускает настоящего ребёнка Claude Code через официальный Claude Agent SDK | регистрируется на `ctx.subagents` |
| [`subagent-dsh-sdk/`](subagent-dsh-sdk/README.ru.md) | Запускает внепроцессного ребёнка Harness через TypeScript SDK | регистрируется на `ctx.subagents` |
| [`tool-subagent/`](tool-subagent/README.ru.md) | Предоставляет модели делегацию | регистрируется на `ctx.tools` |
| [`tool-subagent-control/`](tool-subagent-control/README.ru.md) | Предоставляет модели обмен сообщениями с детьми и перечисление | регистрируется на `ctx.tools` |
| [`tool-subagent-report/`](tool-subagent-report/README.ru.md) | Обеспечивает канал отчётов от ребёнка к родителю | регистрируется в дочерних скоупах |

Пакеты Codex и Claude Code — независимые опциональные бандлы профиля. Установите любой или оба командой `dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex @deepseek-ai/dsh-subagent-claude-code`, затем перезапустите этот профиль; каждый пакет регистрирует только спящего Host-провайдера. Чтобы выдать инструмент, скопируйте полный агентский пресет, удалите `disabled` из каждой подходящей строки инструмента и начните новую сессию. Удаление одного пакета отзывает только этого провайдера и его приватное рантайм-замыкание при следующем старте профиля.

Решения о [семействе возможностей](../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.md), [продолжаемых детях](../../.agents/notes/implemented/feature/2026-07-21-continuable-background-subagents.md) и [инструментах управления](../../.agents/notes/implemented/simplification/2026-07-26-merge-subagent-control-service.md) см. в соответствующих Agent Notes.

Справочник подсистемы — запросы запуска, результаты, живые запуски, контракт провайдера, продолжаемые фоновые дети — это [docs/subsystems/subagent.ru.md](../../docs/subsystems/subagent.ru.md); обоснование дизайна — в Agent Notes о [seam субагентов](../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.md), [продолжаемых фоновых субагентах](../../.agents/notes/implemented/feature/2026-07-21-continuable-background-subagents.md) и [объединённом сервисе управления субагентами](../../.agents/notes/implemented/simplification/2026-07-26-merge-subagent-control-service.md).

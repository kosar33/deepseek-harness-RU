# context/ — расширения контекста запроса

[English](README.md) | [中文](README.zh.md) | Русский

Продуктовые плагины, добавляющие видимый модели контекст запроса без определения инструмента. `agent-instructions` входит в состав дефолтного бандла `dsh-agent-spine-demo` и может быть отключён через конфигурацию бандла; `time-context`, `tmux-context`, `session-reference`, `file-reference` и `file-reference-local` подключаются по выбору.

| Package | Role | ctx key |
|---|---|---|
| [`session-reference/`](session-reference/README.ru.md) | Ограниченные по объёму снимки других сессий | `ctx.sessionReferenceResolver` |
| [`file-reference/`](file-reference/README.ru.md) | Seam обнаружения файловых ссылок и грамматика `@file` | `ctx.fileReferences` |
| [`file-reference-local/`](file-reference-local/README.ru.md) | Провайдер файловых ссылок на локальной файловой системе | — |
| [`time-context/`](time-context/README.ru.md) | Контекст текущего и прошедшего времени | — |
| [`tmux-context/`](tmux-context/README.ru.md) | Контекст расположения tmux | — |
| [`agent-instructions/`](agent-instructions/README.ru.md) | Контекст инструкций рабочей области | — |

Ссылки на сессии описаны в [docs/subsystems/session-reference.ru.md](../../docs/subsystems/session-reference.ru.md); [запись решения об `agent-instructions`](../../.agents/notes/implemented/feature/2026-06-24-workspace-context.md) владеет его изоляцией по агенту/сессии и разделением жизненных циклов.

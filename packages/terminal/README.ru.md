# terminal/ — семейство возможности персистентных PTY

[English](README.md) | [中文](README.zh.md) | Русский

PTY расшифровывается как **Pseudo-Terminal** (псевдотерминал). Эта возможность предоставляет персистентные сессии терминала с областью видимости владельца для воркфлоу, которым нужно состояние между вызовами инструментов или интерактивный stdin. PTY дополняет одноразовые инструменты bash и файловой системы; она не заменяет их более сильные пооперационные контракты.

| Package | Role | ctx key |
|---|---|---|
| [`pty`](terminal/README.ru.md) (`@deepseek-ai/dsh-terminal`) | Реестр бэкендов, брендированные id, владение конкретным Agent'ом, операции сессий и очистка с ожиданием завершения | `ctx.terminals` |
| `terminal-bash` (`@deepseek-ai/dsh-terminal-bash`) | Шелл-бэкенд над `ctx.subprocess.spawnTerminal`: обнаружение готовности, ограниченное состояние терминала, политика песочницы и операции сессий | регистрируется на `ctx.terminals` |
| `tool-terminal` (`@deepseek-ai/dsh-tool-terminal`) | Шесть инструментов, видимых модели, и универсальная интеграция с задачами для фоновых отправок | регистрируется на `ctx.tools` |

Дизайн и отложенные границы описаны в [Agent Note о персистентных PTY-сессиях](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md).

Справочник подсистемы — id, контракты бэкендов и сессий, готовность к отправке, ограниченные чтения — находится в [docs/subsystems/terminal.ru.md](../../docs/subsystems/terminal.ru.md); дизайн и отложенные границы — в [Agent Note о персистентных PTY-сессиях](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md).

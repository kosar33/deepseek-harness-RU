# workspace/ — семейство сущности рабочих пространств

[English](README.md) | [中文](README.zh.md) | Русский

Это семейство владеет персистентными рабочими пространствами: пользовательскими каталогами с заголовками и упорядоченным членством сессий.

| Пакет | Роль | Ключ ctx |
|---|---|---|
| [`workspace/`](workspace/README.ru.md) | Регистрирует рабочие пространства и ведёт учёт их сессий | `ctx.workspaceRegistry` |

[Справочник пакета workspace](workspace/README.ru.md) владеет жизненным циклом, персистентностью и семантикой удаления.

Справочник подсистемы — сущность, канон realpath, регистрация/разрешение — живёт в [docs/subsystems/workspace.ru.md](../../docs/subsystems/workspace.ru.md); устройство хранения — в [Agent Note о доменном KV-хранилище](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md).

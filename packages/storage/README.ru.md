# storage/ — семейство хранения вне сессий

[English](README.md) | [中文](README.zh.md) | Русский

Это семейство сохраняет данные приложения, отличные от журналов событий сессий, через именованные бэкенды и типизированные формы данных.

| Package | Role | ctx key |
|---|---|---|
| [`storage/`](storage/README.ru.md) | Соединяет зарегистрированные бэкенды с типизированными формами данных | `ctx.storage` |
| [`storage-json/`](storage-json/README.ru.md) | Хранит данные в JSON-файлах | регистрирует бэкенд `json` |
| [`storage-sqlite/`](storage-sqlite/README.ru.md) | Хранит данные в SQLite | регистрирует бэкенд `sqlite` |
| [`storage-domain/`](storage-domain/README.ru.md) | Поставляет проверяемое хранилище доменных записей | `ctx.storageDomain` |

Потребители пользуются формой данных, а не обращаются к бэкенду напрямую. [Решение о доменном KV-хранилище](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md) фиксирует дизайн семейства.

Справочник подсистемы — контракт бэкенда, `StorageForms`, `DomainSpec`/`Domain`, `domain/changed` — находится в [docs/subsystems/storage.ru.md](../../docs/subsystems/storage.ru.md).

# session-query/ — семейство возможности извлечения сессий

[English](README.md) | [中文](README.zh.md) | Русский

Это семейство предоставляет авторизованное извлечение из живых и долговечных журналов сессий независимо от компакции.

| Пакет | Роль | ctx-ключ |
|---|---|---|
| [`session-query/`](session-query/README.ru.md) | Определяет доверенные чтения, запросы о связях и операции поиска | `ctx.sessionQuery` |
| [`session-query-sqlite/`](session-query-sqlite/README.ru.md) | Реализует запросы сессий с полнотекстовым поиском SQLite | `ctx.sessionQuery` |
| [`session-log-export/`](session-log-export/README.ru.md) | Добавляет команду Web `/export`, общее состояние загрузок браузера и модальное окно результата поверх ZIP-эндпоинта хоста | `ctx.sessionLogDownload` |
| [`tool-session-query/`](tool-session-query/README.ru.md) | Открывает модели авторизованные рабочим пространством запросы сессий | регистрируется на `ctx.tools` |

Справочник подсистем — логические записи, ограниченные чтения, родословные, фильтры, страницы результатов — это [docs/subsystems/session-query.md](../../docs/subsystems/session-query.ru.md).

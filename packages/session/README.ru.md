# session/ — плоскость долговечных данных сессии

[English](README.md) | [中文](README.zh.md) | Русский

Долговечное семейство вокруг живого in-memory-сервиса `core/session`: seam персистентности со своими бэкендами хранения и политикой чекпоинтов, seam проекции, поставляющий значения, производные от всего журнала, заголовки на основе журнала и исходящую телеметрию сессий. Все пакеты — **продуктовые**. `session-query/` остаётся соседней группой: поверхность чтения/инструментов используется независимо от внутренностей персистентности.

## Персистентность

Долговечная персистентность сессии, семантическая политика чекпоинтов и поставляемые бэкенды хранения.

| Пакет | Роль | Ключ ctx |
|---|---|---|
| [`session-persistence/`](session-persistence/README.ru.md) | Определяет сервис персистентности и общую координацию записи | `ctx.sessionPersistence` |
| [`session-checkpoint-policy/`](session-checkpoint-policy/README.md) | Применяет семантические долговечные чекпоинты | оборачивает `ctx.llm` и `ctx.tools` |
| [`session-persistence-jsonl/`](session-persistence-jsonl/README.ru.md) | Хранит сессии в JSONL-файлах | регистрируется на `ctx.sessionPersistence` |
| [`session-persistence-sqlite/`](session-persistence-sqlite/README.ru.md) | Opt-in бэкенд SQLite с упакованными физическими строками чанков | регистрируется на `ctx.sessionPersistence` |

[Решение о session-persistence](../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md) фиксирует дизайн персистентности.

## Проекция

Поставляет клиентским носителям актуальное производное от журнала состояние каждой сессии.

| Пакет | Роль | Ключ ctx |
|---|---|---|
| [`session-projection/`](session-projection/README.ru.md) | Определяет и ведёт единицы проекции сессии | `ctx.sessionProjections` |
| [`session-projection-cache/`](session-projection-cache/README.ru.md) | Сохраняет и восстанавливает чекпоинты проекций | `ctx.sessionProjectionCache` |
| [`session-stats/`](session-stats/README.md) | Поставляет счётчики диалога и реальные времена по всему журналу (единица `sessionStats`) | регистрируется на `ctx.sessionProjections` |

## Заголовки

Выводит долговечные заголовки сессий из журнала сессии, с опциональным провайдером на базе модели.

| Пакет | Роль | Ключ ctx |
|---|---|---|
| [`session-title/`](session-title/README.ru.md) | Владеет состоянием заголовка, фолбэк-поведением, регистрацией провайдеров и обновлением | `ctx.sessionTitle` |
| [`session-title-llm/`](session-title-llm/README.md) | Поставляет общую генерацию заголовков на базе модели | — |
| [`session-title-first-prompt-llm/`](session-title-first-prompt-llm/README.md) | Задаёт сессии заголовок по её первому подходящему сообщению человека | регистрируется на `ctx.sessionTitle` |
| [`session-title-all-prompts-llm/`](session-title-all-prompts-llm/README.md) | Задаёт сессии заголовок по всем подходящим сообщениям человека | регистрируется на `ctx.sessionTitle` |

Развёртывания могут зарегистрировать один провайдер на базе модели; при его отсутствии сервис сохраняет детерминированный фолбэк.

## SessionTelemetryBackend

Проецирует активность сессии в исходящую телеметрию и делегирует доставку настроенному отчётному бэкенду. [Решение о телеметрии](../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md) фиксирует границу отчётности; [решение о режимах](../../.agents/notes/implemented/feature/2026-08-05-feedback-gated-session-telemetry.md) фиксирует немедленную доставку, доставку с гейтом обратной связи и отключённую доставку.

| Пакет | Роль |
|---|---|
| [`session-telemetry/`](session-telemetry/README.ru.md) | Определяет захват, обезличивание, проекцию и доставку на бэкенд — живую или по требованию. |
| [`session-telemetry-otel/`](session-telemetry-otel/README.ru.md) | Доставляет телеметрию через журналы OpenTelemetry в режиме `FULL`, `FEEDBACK_ONLY` или `DISABLED`. |

Ссылки подсистемы: [persistence.md](../../docs/subsystems/persistence.ru.md), [session-projection.md](../../docs/subsystems/session-projection.ru.md), [session-title.md](../../docs/subsystems/session-title.ru.md) и [session-telemetry.md](../../docs/subsystems/session-telemetry.ru.md). Одновременно может зарегистрироваться только один провайдер заголовков; демо-стержень монтирует запасной сервис и оставляет оба модельных провайдера за пределами композиции по умолчанию.

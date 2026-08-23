# llm/ — семейство возможности LLM

[English](README.md) | [中文](README.zh.md) | Русский

Seam LLM и его адаптеры провайдеров. Пакет `llm` владеет обеими ролями — Service Definition и Consumer: абстрактным сервисом, словарём блоков содержимого и сборщиком чанков потока. Адаптеры провайдеров регистрируются на `ctx.llm`. Все пакеты — **продуктовые**.

| Пакет | Роль | ctx-ключ |
|---|---|---|
| [`llm/`](llm/README.ru.md) | Сервис LLM и общий словарь потоковой передачи | `ctx.llm` |
| [`token-meter/`](token-meter/README.ru.md) | Учитывающее воспроизведение измерение токенов | `ctx.tokenMeter` |
| [`llm-retry/`](llm-retry/README.ru.md) | Политика повторов в области провайдера | слушает `agent/request-error` |
| [`llm-deepseek/`](llm-deepseek/README.ru.md) | Прямой адаптер DeepSeek | регистрируется на `ctx.llm` |
| [`llm-pi-ai/`](llm-pi-ai/README.ru.md) | Мультипровайдерный адаптер pi-ai | регистрируется на `ctx.llm` |

Адаптеры регистрируют маршруты провайдеров на seam'е; повторы и измерение токенов остаются отдельными потребителями. Дочерние README владеют маршрутизацией, метаданными, воспроизведением и деталями провайдерского протокола; обоснование хранят [архитектурные решения по LLM](../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.md).

Справочник подсистем — сообщения и блоки, запрос к модели, протокол `StreamChunk`, контракт адаптера — это [docs/subsystems/llm-streaming.md](../../docs/subsystems/llm-streaming.ru.md) (измерение токенов: [token-meter.md](../../docs/subsystems/token-meter.ru.md)); см. Agent Notes о [парных адаптерах](../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.md), о [счётчике токенов воспроизведения](../../.agents/notes/implemented/architecture/2026-07-15-replay-token-meter-service.md) и о [маршрутизируемом контексте модели](../../.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.md).

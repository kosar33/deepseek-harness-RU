# test-support/ — инфраструктура разработки и тестов

[English](README.md) | [中文](README.zh.md) | Русский

Эти пакеты поддерживают разработку репозитория, тесты и примеры, а не продуктовые API. Их совместимость следует той потребности разработки, которой они служат.

| Package | Role |
|---|---|
| [`acp-snapshot/`](acp-snapshot/README.ru.md) | Поставляет набор инструментов снапшот-тестов ACP |
| [`agent-loop-testkit/`](agent-loop-testkit/README.ru.md) | Монтирует общие предпосылки для тестов AgentLoop |
| [`invariants/`](../runtime-diagnostics/invariants/README.ru.md) | Запускает проверки рантайм-контрактов во время разработки |
| [`loader-smoke/`](loader-smoke/README.ru.md) | Запускает собранные Loader'ом приложения для смоук-тестов |
| [`llm-mock-server/`](llm-mock-server/README.ru.md) | Поставляет детерминированный OpenAI-совместимый сервер отказов |
| [`llm-replay/`](llm-replay/README.ru.md) | Воспроизводит записанные ответы моделей для безключевых тестов и демо |

Пакет покидает `test-support/`, когда обзаводится продуктовым контрактом и продуктовыми потребителями.

Контракт invariants задокументирован в [docs/subsystems/invariants.ru.md](../../docs/subsystems/invariants.ru.md).

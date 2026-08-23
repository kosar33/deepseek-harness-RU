# sandbox/ — семейство возможности процессной песочницы

[English](README.md) | [中文](README.zh.md) | Русский

Это семейство применяет политику изоляции отдельной сессии к исполнению процессов. Оно покрывает same-world subprocess (дочерний процесс, разделяющий с хостом файловую систему и ядро); изолированные окружения заменяют целые реализации возможности, а не регистрируются здесь.

| Пакет | Роль | ctx-ключ |
|---|---|---|
| [`sandbox/`](sandbox/README.ru.md) | Определяет сервис процессной песочницы и общий словарь эскалации | `ctx.sandbox` |
| [`sandbox-local/`](sandbox-local/README.ru.md) | Предоставляет локальные бэкенды платформенной изоляции | регистрируется на `ctx.sandbox` |
| [`sandbox-policy/`](sandbox-policy/README.ru.md) | Разрешает долговечную политику песочницы на сессию | `ctx.sandboxPolicy` |

Границу возможности см. в решении о [песочнице](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md), а межсемейное использование политики — в решении об [интеграции с файловой системой](../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md).

Справочник подсистем — режимы и принуждение, политика на вызов, диалекты обёрнутого argv, ошибки fail-closed — это [docs/subsystems/sandbox.md](../../docs/subsystems/sandbox.ru.md); граница и межсемейная фаза живут в Agent Notes о [песочнице](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md) и о [межсемейной fs-песочнице](../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md).

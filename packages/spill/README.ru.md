# spill/ — семейство возможности spill вывода инструментов

[English](README.md) | [中文](README.zh.md) | Русский

Это семейство сохраняет слишком большой вывод инструментов и заменяет встроенный результат ограниченным превью с локатором для извлечения.

| Package | Role | ctx key |
|---|---|---|
| [`spill/`](spill/README.ru.md) | Определяет хранилище spill | `ctx.spillStore` |
| [`spill-local/`](spill-local/README.ru.md) | Хранит уведённый в spill текст в локальных файлах с областью видимости сессии | регистрируется на `ctx.spillStore` |
| [`spill-policy/`](spill-policy/README.ru.md) | Применяет политику spill после исполнения | слушает `ctx.tools` |

Разграничение между хранением, удержанием и обработкой вывода на стороне инструмента см. в [решении о spill вывода инструментов](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md).

Справочник подсистемы — `SaveTextSpill`, владельцы/источники, брендированный локатор — находится в [docs/subsystems/spill.ru.md](../../docs/subsystems/spill.ru.md); обоснование — в [Agent Note о spill вывода инструментов](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md).

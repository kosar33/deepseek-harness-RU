# code-runtime/ — семейство возможностей исполнения кода

[English](README.md) | [中文](README.zh.md) | Русский

Capability seam исполнения кода (см. [capability seams](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)): Service Definition рантайма для исполнения одной написанной моделью программы против предоставленных хостом асинхронных биндингов с захватом того, что она напечатала и вернула; заменяемые провайдеры; и Consumer [Code Mode](../core/tools/README.ru.md) реестра инструментов (`tools: { mode: code }` — инструмент `run_code` и SDK, генерируемый на `language` загруженного рантайма). Дизайн описан в [Agent Note о Code Mode](../../.agents/notes/implemented/feature/2026-06-15-code-mode.md). Пакеты — **продуктовые**.

| Пакет | Роль | Ключ ctx |
|---|---|---|
| [`code-runtime/`](code-runtime/README.ru.md) | Service Definition и общий словарь понятий | `ctx.codeRuntime` |
| [`code-runtime-worker/`](code-runtime-worker-thread/README.ru.md) | Бэкенд на воркер-потоке | регистрирует `ctx.codeRuntime` |

Провайдеры регистрируют сервис, не меняя его Consumer. Языки, изоляция и бюджет исполнения — детали, принадлежащие дочерним README.

Справочник подсистемы — запросы и результаты запусков, пространства имён биндингов, таксономия сбоев — находится в [docs/subsystems/code-runtime.md](../../docs/subsystems/code-runtime.ru.md).

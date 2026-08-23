# shell/ — семейство возможности bash

[English](README.md) | [中文](README.zh.md) | Русский

Семейство возможности охватывает канонический seam исполнителя, его реализации, разделяемую среду оболочки и обращённые к модели инструменты. Все они — **продуктовые** пакеты.

| Пакет | Роль | ctx-ключ |
|---|---|---|
| [`shell/`](shell/README.ru.md) | Определяет контракт исполнителя, общий для Service Providers и Consumers. | `ctx.shell` |
| [`bash-local/`](bash-local/README.ru.md) | Исполняет команды через локальный сервис [`subprocess`](../subprocess/README.md). | (регистрирует `ctx.shell`) |
| [`bash-sandbox/`](bash-sandbox/README.ru.md) | Применяет настроенный бэкенд [`sandbox`](../sandbox/README.ru.md) перед локальным исполнением. | (регистрирует `ctx.shell`) |
| [`pwsh-local/`](pwsh-local/README.ru.md) | Исполняет команды PowerShell со специфичным для Windows процессным поведением. | (регистрирует `ctx.shell`) |
| [`shell-env/`](shell-env/README.ru.md) | Предоставляет управляемую среду `DSH_*`, общую для инструментов оболочки. | `ctx.shellEnv` |
| [`tool-bash/`](tool-bash/README.ru.md) | Открывает модели исполнение Bash и интеграцию с фоновыми задачами. | (регистрируется на `ctx.tools`) |
| [`tool-pwsh/`](tool-pwsh/README.ru.md) | Открывает модели исполнение PowerShell. | (регистрируется на `ctx.tools`) |

Листовой `cordis.yml` выбирает одну реализацию исполнителя и нужные ему обращённые к модели инструменты. Композиция с песочницей дополнительно выбирает провайдера `ctx.sandbox`; [пример ACP](../../examples/acp-agent/) показывает одну полную проводку.

Справочник подсистем — словарь запросов и spec, результаты, фоновые процессы, сервис и события — это [docs/subsystems/shell.md](../../docs/subsystems/shell.ru.md).

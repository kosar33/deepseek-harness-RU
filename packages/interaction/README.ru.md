# interaction/ — плоскость сотрудничества с человеком

[English](README.md) | [中文](README.zh.md) | Русский

Сервисы и плагины, через которые человек сотрудничает с работающим агентом, — вопросы, одобрения, пресеты разрешений, команды. Это **продуктовые** пакеты: реальные интерфейсы, которыми управляет человек.

| Пакет | Роль | ctx-ключ |
|---|---|---|
| [`commands/`](commands/README.ru.md) | Регистрирует и диспетчеризует человеческие команды для интерактивных адаптеров. | `ctx.commands` |
| [`user-approval/`](user-approval/README.ru.md) | Координирует одноразовые решения об одобрении. | `ctx.approval` |
| [`permission/`](permission-presets/README.ru.md) | Показывает и сохраняет обращённые к пользователю пресеты разрешений. | `ctx.permissionPresets` |
| [`user-questions/`](user-questions/README.ru.md) | Определяет независимый от провайдера seam человеческих вопросов и ответов. | `ctx.userQuestions` |
| [`tool-ask-user/`](tool-ask-user/README.ru.md) | Открывает человеческие вопросы модели. | (регистрируется на `ctx.tools`) |

Эти пакеты интегрируются через существующие контракты агента и сессии, а не меняют цикл. Интерактивные приложения предоставляют конкретные адаптеры команд, одобрений и вопросов; автоматизация использует [`acp/`](../acp/README.ru.md), а запускаемые демо-бандлы живут в [`examples/`](../examples/README.ru.md). Продуктовый CLI [`dsh`](../../apps/cli/README.md) компонует эти пакеты напрямую.

Справочники подсистем: [approval.md](../../docs/subsystems/approval.ru.md), [permission-presets.md](../../docs/subsystems/permission-presets.ru.md), [user-questions.md](../../docs/subsystems/user-questions.ru.md) и [commands.md](../../docs/subsystems/commands.ru.md). Транспорт ACP только для автоматизации — [`acp/`](../acp/README.ru.md), серверная половина JSON-RPC SDK — [`sdk/server`](../sdk/README.ru.md), а общая стартовая связка bin — [`boot/`](../boot/README.ru.md).

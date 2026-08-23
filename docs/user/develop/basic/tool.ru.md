# Создание инструмента

[English](tool.md) | [中文](tool.zh.md) | Русский

Этот туториал добавляет инструмент `greet` в веб-интерфейс. Сначала завершите [«Ваш первый плагин»](./index.ru.md) и оставьте его каталог `scratch-plugin`.

## Создайте плагин с инструментом

Замените `scratch-plugin/src/my-plugin.ts` на:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

`inject` заставляет Cordis дождаться реестра инструментов. `defineTool` выводит и валидирует `args` из `parameters`; `execute` возвращает каноническое значение, объявленное в `output.schema`, а `output.render` преобразует это значение в видимый модели контент.

## Запуск и вызов инструмента

Перезапустите команду разработки, если она не запущена:

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

Откройте `http://127.0.0.1:3080` и спросите: `Use the greet tool to greet Ada.` Модель сможет вызвать `greet` и получит `Hello, Ada!` как результат инструмента.

## Дальнейшие шаги

- [Конфигурация плагина](./config.ru.md) — сделайте приветствие настраиваемым.
- [Справочник по созданию инструментов](../../../cookbook/adding-a-tool.ru.md) — вложенные схемы, канонические значения, фоновая работа, policy-хууки, Code Mode и UI-карточки.
- [Расслоение возможностей](../practice/index.ru.md) — разделите замещаемую возможность на пакеты Service Definition, Service Provider и Consumer.

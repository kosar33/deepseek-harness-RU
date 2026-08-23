# 7. Внутрь harness

[English](07-into-the-harness.md) | [中文](07-into-the-harness.zh.md) | Русский

Эта глава регистрирует доступный модели инструмент в сервисе `tools` harness, выполняет его через конвейер инструментов harness и наблюдает событие результата. Глава обходится без ключа и не обращается к модели.

## Плагин инструмента

Создайте `greet-tool.ts` в `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // Drive one call through the real execution pipeline, standing in for
  // the model. CallId brands the correlation id a provider would issue.
  void (async () => {
    const result = await ctx.tools.execute({
      callId: CallId('demo-1'),
      name: 'greet',
      arguments: { name: 'Cordis' },
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.content))
  })()
}
```

Каждый приём здесь взят из прежних глав: `inject: ['tools']` ([глава 3](03-services.ru.md)) удерживает плагин, пока не существует реестр инструментов; `ctx.tools.register(...)` прикрепляет освобождающий дескриптор регистрации к плагину ([глава 2](02-lifecycle-and-effects.ru.md)), поэтому выгрузка отменяет регистрацию инструмента. `defineTool` преобразует спецификацию `parameters` в JSON Schema, показываемую модели, выводит тип `args` и провалидирует аргументы, присланные моделью, до запуска `execute`. Инструмент возвращает каноническое значение, объявленное в `output.schema`; `output.render` отдельно порождает Native- и durable-содержимое результата.

## Плагин-наблюдатель

Создайте `tool-logger.ts` — отдельный плагин, наблюдающий каждый вызов инструмента в приложении через событие `tools/result` harness:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
```

Строка `import type {} from '@deepseek-ai/dsh-tools'` подтягивает declaration merging пакета, благодаря чему `'tools/result'` и его полезная нагрузка получают типы, — тот же приём, что импорт `stats.ts` в главе 4, только в масштабе пакета.

## Композиция и запуск

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './tool-logger.ts'
- name: './greet-tool.ts'
```

`@deepseek-ai/dsh-tools` объявляет инъекцию сервиса `systemPrompt`, потому что инструменты добавляют схемы в системный промпт, — поэтому композиция перечисляет и его провайдера. Без него плагин инструментов останется в PENDING, как описано в [главе 6](06-composition-and-hmr.ru.md).

```sh
node --import tsx ../../vendor/cordis/bin.js
```

```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

Логгер сработал первым: `tools/result` испускается в рамках материализации результата, до того как промис `execute` разрешится вызывающему. Ни один из ваших плагинов не знает о существовании другого — их соединяют сервис-реестр и событие.

## Отсюда до полноценного агента

Настоящий агент — это та же композиция плюс другие плагины: LLM-адаптер, цикл агента, персистентность, точка входа. Сравните с [examples/headless-agent/cordis.yml](../../examples/headless-agent/cordis.yml) — теперь вы можете прочесть каждую его запись. Добавьте свой `greet-tool.ts` в копию этого файла.

Куда идти дальше:

- [Создание инструмента](../user/develop/basic/tool.ru.md) — больше о `defineTool`, включая представление результата и более богатые схемы.
- [Трёхролевой дизайн возможности](../user/develop/practice/index.ru.md) — как harness структурирует заменяемые возможности.
- Сгенерированные области `cordis-surface` на [страницах подсистем](../subsystems/core.ru.md) — всё, что можно взять инъекцией и на что можно подписаться, каждое на своей странице-владельце.
- [Архитектура](../architecture.ru.md) — карта системы, внутри которой живут эти плагины.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

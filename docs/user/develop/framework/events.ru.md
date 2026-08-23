# Система событий

[English](events.md) | [中文](events.zh.md) | Русский

События — основной механизм общения между плагинами Cordis. Harness использует их широко для слабосвязанных точек расширения.

## Базовое использование

### Подписка на событие

```ts ignore-check
ctx.on('event-name', (payload) => {
  // Handle the event.
})
```

### Отправка события

```ts ignore-check
ctx.emit('event-name', payload)
```

## Режимы событий

Cordis предоставляет несколько режимов событий под разные контракты взаимодействия.

### emit — широковещательная рассылка

Каждый слушатель выполняется синхронно, возвращаемые значения игнорируются:

```ts ignore-check
// Emit
ctx.emit('my-plugin/ready', { id: 'worker-1' })

// Listen
ctx.on('my-plugin/ready', ({ id }) => {
  console.log(`${id} is ready`)
})
```

### bail — короткое замыкание

Слушатели выполнятся по порядку; первый результат, отличный от `null`, `false` или `undefined`, становится итоговым:

```ts ignore-check
// Dispatch
const result = ctx.bail('some-check', input)

// Listen: a returned value stops later listeners.
ctx.on('some-check', (input) => {
  if (shouldBlock(input)) return 'blocked'
  // Return null, false, or undefined to continue to the next listener.
})
```

### serial — упорядоченное выполнение

Слушатели выполняются в порядке регистрации, асинхронные результаты ожидаются. Первый результат, отличный от `null`, `false` или `undefined`, останавливает дальнейшее выполнение:

```ts ignore-check
await ctx.serial('setup-phase', context)
```

### waterfall — конвейер

Каждый слушатель может обернуть результат ниже по цепочке, образуя цепочку обработки. Слушатель **обязан вызвать `next()` для передачи дальше**; пропуск вызова замыкает конвейер накоротко:

```ts ignore-check
// Dispatch
const output = await ctx.waterfall('my-plugin/transform', input, async () => input)

// Listen: next() is mandatory.
ctx.on('my-plugin/transform', async (_input, next) => {
  const downstream = await next()
  return downstream.trim()
})
```

::: warning
Слушатель waterfall **обязан вызвать `next()`**. Пропуск по дизайну замыкает конвейер накоротко, включая перехват и поведение шлюза.
:::

## Типизированные события

Harness использует declaration merging в TypeScript для типобезопасных событий:

```ts
import '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'my-plugin/ready': (payload: { id: string }) => void
    'my-plugin/check': (input: string) => boolean | undefined
    'my-plugin/transform': (input: string, next: () => Promise<string>) => Promise<string>
  }
}

// ctx.on('my-plugin/ready', ...) and ctx.emit('my-plugin/ready', ...)
// are now inferred correctly.
```

## События Cordis и записи сессии

События Cordis в Harness используют имена `namespace/action`, включая `agent/step`, `agent/request`, `agent/request-error`, `tools/result` и `session/event`. Сгенерированные области `cordis-surface` на [страницах подсистем](../../../subsystems/core.md) фиксируют полные сигнатуры и режимы.

`turn/*`, `step/*`, `tool/call`, `tool/result` и `compaction/*` — типы долговременных событий сессии, а не одноимённые события Cordis. Чтобы наблюдать их, подпишитесь на `session/event` и изучите `event.type`.

## Слушатели событий — это эффекты

Слушатель, зарегистрированный через `ctx.on()`, удаляется автоматически при выгрузке его плагина:

```ts ignore-check
export function apply(ctx: Context) {
  // This listener is removed when the plugin disposes.
  ctx.on('tools/result', handler)
}
```

## Пример: плагин логирования

Этот плагин журналирует вызовы и результаты инструментов:

```ts
import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    console.log(`[tool] ${exec.name}(${JSON.stringify(exec.arguments)})`)
    const text = result.content
      .map(block => block.type === 'text' ? block.text : '')
      .join('')
    console.log(`[tool result] ${text.slice(0, 100)}`)
  })
}
```

## Дальнейшие шаги

- [Расслоение возможностей](../practice/index.ru.md) — события внутри интерфейсов возможностей
- [LLM-адаптеры](../practice/llm-adapter.ru.md) — реализуйте полный бэкенд LLM

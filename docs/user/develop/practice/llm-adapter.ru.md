# LLM-адаптеры

[English](llm-adapter.md) | [中文](llm-adapter.zh.md) | Русский

Это руководство описывает подключение нового провайдера LLM к Harness.

## Обзор

LLM-адаптер расширяет `LlmAdapter` и реализует `stream()`, преобразуя независимый от провайдера запрос Harness в вызов API провайдера, а ответ — обратно в чанки Harness.

## Минимальная реализация

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

class MyAdapter extends LlmAdapter {
  private apiKey: string

  constructor(apiKey: string) {
    super()
    this.apiKey = apiKey
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. Convert options.messages to the provider format.
    // 2. Call the streaming API.
    // 3. Convert the response into StreamChunk values.
  }
}

export interface Config {
  apiKey: string
  providers: string[]
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
  providers: Schema.array(Schema.string()).required(),
})

export const name = 'my-llm-adapter'
export const inject = ['llm']

export function apply(ctx: Context, config: Config) {
  const adapter = new MyAdapter(config.apiKey)
  ctx.llm.registerAdapter(config.providers, adapter)
}
```

## Протокол StreamChunk

`stream()` выдаёт чанки по этому протоколу:

```ts
import { CallId, type StreamChunk } from '@deepseek-ai/dsh-llm'

async function* exampleChunks(): AsyncIterable<StreamChunk> {
  // 1. Start each content block with block-start.
  yield { type: 'block-start', index: 0, blockType: 'text' }

  // 2. Stream text through text-delta.
  yield { type: 'text-delta', index: 0, text: 'Hello' }
  yield { type: 'text-delta', index: 0, text: ' world' }

  // 3. End each content block with block-end and the complete block.
  yield {
    type: 'block-end',
    index: 0,
    block: { type: 'text', text: 'Hello world' },
  }

  // 4. Tool-call block.
  yield { type: 'block-start', index: 1, blockType: 'tool-call' }
  yield {
    type: 'tool-call-delta',
    index: 1,
    id: CallId('call-123'),
    name: 'bash',
    argumentsDelta: '{"command":"ls"}',
  }
  yield {
    type: 'block-end',
    index: 1,
    block: {
      type: 'tool-call',
      id: CallId('call-123'),
      name: 'bash',
      arguments: '{"command":"ls"}',
    },
  }

  // 5. Token usage.
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } }

  // 6. Finish reason.
  yield { type: 'finish', reason: { kind: 'stop' } }
  // Alternatively, { kind: 'tool-calls' } requests tool execution.
}
```

### Ключевые правила

- У каждого `block-start` есть парный `block-end`.
- `index` растёт с 0 и задаёт порядок блоков содержимого.
- `tool-call-delta` несёт сырой JSON-текст в `argumentsDelta`, либо весь сразу, либо через несколько чанков.
- `finish` — финальный чанк.
- Выдавайте `usage` до `finish`.

## GenerateOptions

`stream()` получает экспортируемый тип `GenerateOptions`. Он включает модель, принадлежащий адаптеру id усилия рассуждений, историю диалога, системный промпт, схемы инструментов, параметры генерации, стоп-последовательности и сигнал отмены; считайте авторитетным тип TypeScript, экспортируемый `@deepseek-ai/dsh-llm`. Сопоставьте поддерживаемые поля с API провайдера. Если провайдер не может поддержать поле, бросайте `LlmError` со стабильным кодом вместо того, чтобы молча отбрасывать его.

Переопределите `resolveModel(provider, model, signal?)`, чтобы вернуть точную идентичность провайдера/модели плюс опциональные метаданные `context` и `reasoning` одним запросом. Метаданные рассуждений содержат упорядоченные непрозрачные id и отображаемые имена плюс опциональное настроенное значение по умолчанию; сохраняйте авторитетный список выбираемых значений адаптера, включая `off`, если вышестоящий API возможностей его возвращает, вместо того чтобы переносить эти значения в перечисление ядра. Учитывайте опциональный сигнал при асинхронном запросе, чтобы отмена и освобождение ресурсов достигали quiescence (полного завершения всех жизненных циклов). Сервис валидирует агрегированный результат и отклоняет неподдерживаемые явно заданные усилия рассуждений до `stream()`; пропуск `reasoning` означает, что у этой модели нет выбираемой возможности усилия рассуждений.

## Регистрация адаптера

```ts ignore-check
ctx.llm.registerAdapter(['my-provider'], adapter)
```

Первый аргумент перечисляет маршруты провайдеров, обслуживаемые адаптером. `GenerateOptions.provider` выбирает зарегистрированный адаптер, а `GenerateOptions.model` передаёт принадлежащий адаптеру id модели без регистрации в жизненном цикле. Переопределите `listModels()`, когда адаптер может сообщить селекторам доступные варианты моделей.

## Использование из cordis.yml

```yaml
- id: my-llm
  name: './src/my-llm-adapter.ts'
  config:
    apiKey: !!js process.env.MY_API_KEY
    providers:
      - my-provider

- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: my-provider
        model: my-model-v1
```

## Референсные реализации

Репозиторий содержит полные реализации:

- `packages/llm/llm-deepseek/` — адаптер API DeepSeek в OpenAI-совместимом формате
- `packages/llm/llm-pi-ai/` — адаптер Pi AI в другом формате API

Сравните два поставляемых адаптера, чтобы увидеть, как один и тот же контракт harness реализуется поверх разных SDK провайдеров.

## Обработка ошибок

Адаптеры бросают транспортные и протокольные сбои как значения `LlmError` со стабильными кодами. Агентский цикл сохраняет ошибку и код для диагностики и политики; обычный `Error` он автоматически не конвертирует. Каждый HTTP-запрос к провайдеру также должен подмешивать `attributionHeaders()` и пробрасывать `options.signal`.

```ts
import {
  attributionHeaders,
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

class HttpAdapter extends LlmAdapter {
  constructor(private readonly endpoint: string) {
    super()
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...attributionHeaders(),
      },
      body: JSON.stringify({ model: options.model, messages: options.messages }),
      ...options.signal ? { signal: options.signal } : {},
    })
    if (!response.ok) {
      throw new LlmError(`Provider API error: ${response.status}`, 'PROVIDER_HTTP_ERROR')
    }
    // A real adapter parses the response and emits the complete chunk sequence.
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
```

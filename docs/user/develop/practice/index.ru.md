# Трёхролевой дизайн возможности

[English](index.md) | [中文](index.zh.md) | Русский

У этой страницы две части: справочник по концепции трёхролевого шаблона возможностей, за которым следует продвинутый туториал по созданию одной возможности. Сначала завершите [базовый путь плагинов](../basic/index.ru.md) и [туториал по сервисам](../framework/service.ru.md).

## Справочник по концепции

Когда возможность достаточно обща, чтобы требовать замещаемых провайдеров, — например, исполнение Bash, — Harness разделяет три роли: **Service Definition**, **Service Provider** и **Consumer**. Размещайте роли в отдельных пакетах, когда им нужно развиваться или замещаться независимо; иначе один пакет может владеть несколькими ролями. Полная возможность и есть её seam. Никакая отдельная роль seam'ом не является.

## Пример Bash

Возможность исполнения Bash состоит из:

- **Service Definition** (`dsh-shell`) — определяет сервис Cordis и типы запроса и результата Bash
- **Service Provider** (`dsh-bash-local`) — исполняет команды на локальной машине
- **Consumer** (`dsh-tool-bash`) — выставляет возможность как инструмент, вызываемый моделью

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  dsh-shell   │────▶│  dsh-bash-local  │     │ dsh-tool-bash│
│(definition) │     │    (provider)     │     │(consumer/tool)│
└─────────────┘     └──────────────────┘     └──────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
                    inject: ['shell']
```

## Преимущества разделения

### Подмена провайдеров

Один Service Definition может иметь несколько провайдеров, выбираемых через `cordis.yml`:

```yaml
# Local execution
- name: '@deepseek-ai/dsh-bash-local'

# Replace this row with another package that provides the same service.
```

Service Definition и инструмент остаются неизменными, пока меняется провайдер.

### Независимая эволюция

- Service Definition меняется редко после того, как вызывающие стали зависеть от его контракта.
- Service Provider может независимо улучшать производительность и безопасность.
- Consumer может менять представление возможности для модели.

### Развязка зависимостей

- Service Provider зависит от Service Definition.
- Consumer зависит от Service Definition.
- Service Provider и Consumer **не зависят друг от друга**.

За актуальные встроенные семейства и ссылки на пакеты отвечает [справочник capability seam](../../../capability-seams.ru.md).

## Туториал: разработка трёхролевой возможности

### Шаг 1: напишите Service Definition

```ts ignore-check
// packages/my-cap/my-cap/src/index.ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    myCap: MyCapService
  }
}

export abstract class MyCapService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myCap')
  }

  /** Execute the capability. */
  abstract execute(request: MyCapRequest): Promise<MyCapResult>
}

export interface MyCapRequest {
  input: string
}

export interface MyCapResult {
  output: string
}
```

### Шаг 2: напишите Service Provider

```ts ignore-check
// packages/my-cap/my-cap-local/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { MyCapService, type MyCapRequest, type MyCapResult } from '@deepseek-ai/dsh-my-cap'

class MyCapLocal extends MyCapService {
  async execute(request: MyCapRequest): Promise<MyCapResult> {
    // Local provider behavior.
    return { output: request.input.toUpperCase() }
  }
}

export const name = 'my-cap-local'

export function apply(ctx: Context) {
  ctx.plugin(MyCapLocal)
}
```

### Шаг 3: напишите consumer

```ts ignore-check
// packages/my-cap/tool-my-cap/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-my-cap'
export const inject = ['tools', 'myCap']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'my_cap',
    description: 'Execute my capability.',
    parameters: {
      input: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const result = await ctx.myCap.execute({ input: args.input })
      return result.output
    },
  }))
}
```

### Соберите их в cordis.yml

```yaml
- name: '@deepseek-ai/dsh-my-cap-local'
- name: '@deepseek-ai/dsh-tool-my-cap'
```

## Пункты дизайна

- **Не дробите превентивно** — раздельные пакеты нужны, только когда роли должны эволюционировать независимо. Простому плагину с инструментом это не нужно.
- **Service Definition владеет типами Request/Result** — Service Provider и Consumer зависят только от пакета Service Definition.
- **Явное лучше неявного** — вычисляйте значения по умолчанию в явном шаге `resolve(request): Spec`, а не прячьте выражения `?? default` внутри `run()`.

## Дальнейшие шаги

- [LLM-адаптер](./llm-adapter.ru.md) — реализуйте провайдера LLM

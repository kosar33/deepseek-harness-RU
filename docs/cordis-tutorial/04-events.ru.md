# 4. События

[English](04-events.md) | [中文](04-events.zh.md) | Русский

Сервисы поддерживают прямые вызовы; **события** позволяют плагину объявить о чём-то, не зная, какие плагины слушают. Harness использует события для взаимодействий вроде результатов инструментов, запросов к модели и решений об одобрении.

## Объявляем, диспатчим, слушаем

Создайте `stats.ts` в `tmp/cordis-tutorial` — сервис, который что-то считает и объявляет каждое изменение:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    stats: StatsService
  }
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}

export class StatsService extends Service {
  private counts = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'stats')
  }

  bump(name: string) {
    const next = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, next)
    this.ctx.emit('stats/report', name, next)
  }
}

export const name = 'stats'

export function apply(ctx: Context) {
  ctx.plugin(StatsService)
}
```

Слияние `interface Events` — близнец слияния `interface Context` из главы 3 на стороне системы событий: оно объявляет имя события и сигнатуру его слушателя, так что `ctx.emit` и `ctx.on` полностью типизированы. Конвенция именования `namespace/action` удерживает плоское пространство имён событий читабельным.

Создайте `reporter.ts`:

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from './stats.ts'

export const name = 'reporter'
export const inject = ['stats']

export function apply(ctx: Context) {
  ctx.on('stats/report', (name, count) => {
    console.log(`[stats] ${name} -> ${count}`)
  })
  ctx.stats.bump('tool_call')
  ctx.stats.bump('tool_call')
  ctx.stats.bump('prompt')
}
```

Строка `import type {} from './stats.ts'` ничего не импортирует в рантайме; она существует, чтобы TypeScript увидел слияния объявлений. Скомпонуйте и запустите:

```yaml
- name: './stats.ts'
- name: './reporter.ts'
```

```
[stats] tool_call -> 1
[stats] tool_call -> 2
[stats] prompt -> 1
```

Поскольку `ctx.on()` — эффект, слушатель исчезает вместе с плагином — никакой ручной бухгалтерии с `removeListener`, никогда.

## Режимы диспатча

`emit` — один из пяти режимов диспатча. Какой из них использует событие — часть его контракта: это решает, могут ли слушатели возвращать значения, работать конкурентно или замыкать друг друга накоротко:

| Режим | Вызов | Семантика |
|---|---|---|
| emit | `ctx.emit(name, ...args)` | Синхронный широковещательный диспатч; возвращённые промисы и значения не ожидаются и не собираются. |
| parallel | `await ctx.parallel(name, ...args)` | Все слушатели работают конкурентно; ожидаются вместе. |
| serial | `await ctx.serial(name, ...args)` | Слушатели работают по порядку, с ожиданием; побеждает первый возврат не-`null`/`false`/`undefined` и останавливает остальных. |
| bail | `ctx.bail(name, ...args)` | Синхронная версия serial. |
| waterfall | `ctx.waterfall(name, ...args, next)` | Around-middleware; см. ниже. |

Каждое событие harness документирует свой режим в генерируемом справочнике на своей [странице подсистемы](../subsystems/core.ru.md).

## Каскад: преобразовать или замкнуть накоротко

Каскад — режим, на котором держится перехват. Каждый слушатель получает аргументы плюс продолжение `next()`; он может преобразовать то, что вернёт `next()`, либо вернуть значение без вызова `next()` и замкнуть остаток цепи накоротко — то, что документация Cordis называет вето. Создайте `waterfall-demo.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
  }
}

export const name = 'waterfall-demo'

export function apply(ctx: Context) {
  // Listener 1: wrap the downstream result.
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()
  })

  // Listener 2: short-circuit when it owns the decision.
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'
    return next()
  })

  void (async () => {
    console.log(await ctx.waterfall('demo/transform', 'hello', async () => 'hello'))
    console.log(await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words'))
  })()
}
```

Укажите `cordis.yml` только на этот файл и запустите:

```
HELLO
** BLOCKED **
```

Разберём вторую строку: слушатель 1 исполняется первым и вызывает `next()`, который запускает слушателя 2; слушатель 2 видит `blocked` и возвращается без вызова `next()` — внутреннее значение по умолчанию (функция, переданная в `ctx.waterfall`) так и не исполняется, — а слушатель 1 уже на выходе переводит замещающее сообщение в верхний регистр.

Отсюда дисциплина: **каскадный слушатель, который только наблюдает или аннотирует, ДОЛЖЕН вызвать `next()`**; возврат без него — намеренное короткое замыкание. Забытый `next()` в логирующем слушателе молча проглатывает поведение по умолчанию для всех ниже по цепи. Это постоянное правило репозитория ([семантика waterfall](../cordis-primer.ru.md#семантика-waterfall-в-cordis)).

Harness использует каскады для решений, которые сотрудничающие плагины могут обернуть или взять на себя: [`agent/request`](../subsystems/core.ru.md#agentrequest--waterfall) позволяет плагину заменить конфигурацию вызова модели, а [`approval/request`](../subsystems/approval.ru.md#approvalrequest--waterfall) — политике ответить вместо пользователя.

Далее: [Конфигурация](05-config.ru.md) — опции плагина из `cordis.yml`.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

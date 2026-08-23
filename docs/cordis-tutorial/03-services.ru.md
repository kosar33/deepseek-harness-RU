# 3. Сервисы

[English](03-services.md) | [中文](03-services.zh.md) | Русский

**Сервис** — именованная возможность, которую один плагин предоставляет, а другие плагины потребляют через `ctx`. В harness сервисами являются `ctx.tools`, `ctx.llm` и `ctx.agents`. Потребитель называет возможность, скажем, `'tools'`, вместо того чтобы импортировать её провайдера, поэтому конфигурация может выбрать другого провайдера, не трогая потребителя.

## Предоставляем сервис

Создайте `greeter.ts` в `tmp/cordis-tutorial`:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return `Hello, ${who}!`
  }
}

export const name = 'greeter'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```

Здесь работают вместе две части:

- **Рантайм**: `super(ctx, 'greeter')` регистрирует экземпляр под именем `greeter`. С этого момента любой плагин может достучаться до него как `ctx.greeter`. Регистрация — эффект: выгрузка провайдера удаляет сервис.
- **Время компиляции**: блок `declare module '@deepseek-ai/cordis'` — это declaration merging в TypeScript. Он добавляет `greeter` в интерфейс `Context`, так что `ctx.greeter` везде проходит проверку типов. Кода он не порождает: без него сервис по-прежнему работает в рантайме, но потребители теряют типобезопасность.

Подкласс `Service` сам является плагином (форма-класс из главы 1), поэтому `ctx.plugin(GreeterService)` монтирует его, как любой другой.

## Потребляем сервис через `inject`

Создайте `consumer.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
```

`inject` перечисляет сервисы, которых требует этот плагин. Cordis держит плагин в PENDING, пока каждый из перечисленных сервисов не появится, поэтому внутри `apply` готовность `ctx.greeter` гарантирована. Порядок загрузки в `cordis.yml` не важен — когда стартуют плагины, решают зависимости, а не порядок строк в файле.

Скомпонуйте и запустите:

```yaml
- name: './greeter.ts'
- name: './consumer.ts'
```

```
Hello, world!
```

Поменяйте местами эти две строки в `cordis.yml` и запустите снова: результат тот же. Попробуйте удалить `./greeter.ts` целиком: потребитель остаётся в PENDING и ничего не печатает — ни падения, ни частичного прогона. Fiber в PENDING к тому же не держит живым event loop Node, поэтому композиция, где больше ничего не работает, молча завершается с кодом 0. [Глава 6](06-composition-and-hmr.ru.md) показывает, как диагностировать это состояние.

## Зависимости отслеживаются и после загрузки

`inject` — не разовая проверка при старте. Если требуемый сервис исчезает во время работы приложения — его провайдер выгрузили или подменили горячей перезагрузкой, — каждый зависимый плагин тоже выгружается и загружается вновь, когда сервис возвращается. В сочетании с эффектами ([глава 2](02-lifecycle-and-effects.ru.md)) это не даёт работающему потребителю удерживать ссылку на недоступный сервис: его собственные регистрации отменяются, когда зависимость исчезает.

Поэтому замена сервиса работает и в конфигурации: выгрузите запись `dsh-bash-local`, смонтируйте другого провайдера `shell`, и каждый плагин, инжектирующий `'shell'`, чисто перезапустится уже против новой реализации.

## Необязательные зависимости

`inject` — для жёстких требований. Возможность, без которой плагин может обойтись, инжектить не стоит: пропустите `inject` и проверяйте наличие в месте использования:

```ts ignore-check
export function apply(ctx: Context) {
  // undefined when no provider is loaded; the plugin still runs.
  const greeter = ctx.get('greeter')
  console.log(greeter?.greet('maybe') ?? 'no greeter available')
}
```

## Именование

Имена сервисов живут в одном плоском пространстве имён на приложение. Выделяйте собственные сервисы отличимым префиксом или пространством имён (harness занимает простые имена вроде `tools` и `llm`); генерируемые секции `cordis-surface` на [страницах подсистем](../subsystems/core.ru.md) перечисляют каждое имя, которое регистрирует harness.

Далее: [События](04-events.ru.md) — общение без общего сервиса.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

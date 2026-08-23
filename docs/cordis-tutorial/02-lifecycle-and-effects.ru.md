# 2. Жизненный цикл и эффекты

[English](02-lifecycle-and-effects.md) | [中文](02-lifecycle-and-effects.zh.md) | Русский

Плагин Cordis может быть выгружен правкой конфигурации, горячей перезагрузкой, явным освобождением ресурсов или потерей требуемого сервиса. Регистрации, сделанные через API Cordis, — это эффекты, и они отменяются, когда их плагин-владелец выгружается; ресурсы, управляемые вне этих API, **ДОЛЖНЫ** быть обёрнуты в `ctx.effect()`.

## Эффекты

Для ресурса, которым Cordis ещё не управляет, — таймер, соединение, вотчер, — оберните его в `ctx.effect()` и верните disposer:

Создайте `lifecycle.ts` в `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // Mount a child plugin and keep its fiber to dispose it later.
  const fiber = ctx.plugin(heartbeat)
  // The demo timer is itself an effect: if THIS plugin is unloaded first,
  // the pending callback is cancelled instead of firing on a dead app.
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
```

Добавьте его в `cordis.yml`:

```yaml
- name: './lifecycle.ts'
```

Запустите (`node --import tsx ../../vendor/cordis/bin.js`) и получите:

```
heartbeat plugin loading
tick
tick
tick
heartbeat cleaned up
disposed
```

Три вещи, на которые стоит обратить внимание:

- `ctx.plugin(heartbeat)` монтирует функцию **из кода** как плагин — это та же операция, которую YAML-загрузчик выполняет для каждой записи конфигурации. Плагину-функции не нужен метод `apply`: Cordis вызывает функцию напрямую и использует её имя только для диагностики. Метод `apply` требуется лишь для объектной формы: `ctx.plugin({ apply(ctx) { /* ... */ } })`. Вызов возвращает **fiber** — рантайм-дескриптор одного загруженного экземпляра плагина.
- Тело эффекта исполняется при загрузке; возвращённый им disposer — при выгрузке. Для ресурса со временем жизни плагина вы никогда не вызываете disposer сами.
- `fiber.dispose()` завершается после того, как закончилась вся очистка плагина, включая асинхронные disposer'ы, и рекурсивно выгружает все смонтированные им дочерние плагины.

## Конечный автомат fiber

У каждого загруженного экземпляра плагина есть fiber, проходящий через эти состояния:

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

- **PENDING** — заявлен, но требуемый сервис (глава 3) пока недоступен.
- **LOADING / ACTIVE** — `apply` исполняется / завершился.
- **FAILED** — исключение бросил `apply` или валидация конфигурации.
- **UNLOADING / DISPOSED** — выполняются disposer'ы / всё разобрано.

Вы встретите PENDING снова в [главе 6](06-composition-and-hmr.ru.md) — это обычный ответ на вопрос «почему мой плагин ничего не печатает?».

## Что уже является эффектом

Вам редко придётся писать `ctx.effect()` самому, потому что встроенные регистрационные API — уже эффекты:

- `ctx.on(event, listener)` — слушатель удаляется при выгрузке ([глава 4](04-events.ru.md)).
- `ctx.plugin(child)` — дочерний плагин освобождается вместе с родителем.
- Регистрации сервисов — эффекты. Реестры harness вроде `ctx.tools.register(...)` к тому же прикрепляют возвращаемые ими disposer'ы к вызывающему плагину, поэтому те отменяются автоматически ([глава 7](07-into-the-harness.ru.md)).

Для ресурса, которым Cordis не управляет, получите его внутри `ctx.effect()` и верните disposer, который его освобождает. Cordis затем вызовет это освобождение при выгрузке, включая горячую перезагрузку.

Одна оговорка о порядке: disposer'ы стартуют в обратном порядке регистрации, но несколько **асинхронных** disposer'ов работают конкурентно. Если шаги разборки должны исполняться последовательно, держите их в одном disposer и ожидайте их там.

Далее: [Сервисы](03-services.ru.md) — как плагины делятся возможностями.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

# Плагины и жизненный цикл

[English](index.md) | [中文](index.zh.md) | Русский

Эта страница описывает модель плагинов Cordis и автомат состояний жизненного цикла.

## Автомат состояний Fiber

Каждый загруженный плагин владеет скоупом **Fiber** со следующими состояниями:

```
PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

| Состояние | Значение |
|------|------|
| PENDING | Объявлен, но требуемые зависимости ещё не готовы |
| LOADING | Зависимости готовы, выполняется `apply` |
| ACTIVE | Плагин работает |
| FAILED | `apply` завершился с ошибкой |
| UNLOADING | Плагин выгружается и освобождает ресурсы |
| DISPOSED | Плагин полностью выгружен |

## Загрузка по зависимостям

Плагин с `inject` ждёт каждый требуемый сервис перед загрузкой:

```ts ignore-check
export const inject = ['tools', 'llm']

export function apply(ctx: Context) {
  // ctx.tools and ctx.llm are ready here.
}
```

Если требуемый сервис исчезает, например при замене провайдера, плагин выгружается автоматически (ACTIVE → DISPOSED) и загружается снова, когда сервис возвращается.

## Автоматическая очистка

Каждая регистрация через `ctx` отменяется при выгрузке плагина:

```ts ignore-check
export function apply(ctx: Context) {
  // Event listener: removed automatically on unload.
  ctx.on('some-event', handler)

  // Custom resource: the returned disposer runs on unload.
  ctx.effect(() => {
    const connection = createConnection()
    return () => connection.close()
  })
}
```

Фреймворк отслеживает эти регистрации и освобождает их ресурсы:
- `ctx.on(event, handler)` — слушатель событий
- `ctx.tools.register(tool)` — регистрация инструмента
- `ctx.llm.registerAdapter(names, adapter)` — регистрация LLM-адаптера
- `ctx.effect(() => cleanup)` — пользовательский ресурс

При выгрузке вызов disposer'ов начинается в порядке, обратном порядку регистрации, но несколько асинхронных disposer'ов выполняются конкурентно и не дают гарантии последовательного завершения. Зависящую от порядка очистку поместите в один disposer, возвращённый из единственного `ctx.effect()`, и ожидайте её шаги последовательно там.

## Вложенные контексты

`ctx.plugin()` создаёт дочерний Fiber, наследующий родительский контекст, но с независимым жизненным циклом:

```ts ignore-check
export function apply(ctx: Context) {
  // Register a child plugin.
  ctx.plugin(childPlugin)

  // The child has its own Fiber and unloads with its parent.
}
```

## Семантика dispose

Чтобы остановить экземпляр плагина досрочно:

```ts
import type { Context } from '@deepseek-ai/cordis'

declare const ctx: Context
declare function myPlugin(ctx: Context): void

const fiber = ctx.plugin(myPlugin)

// Dispose it manually later.
await fiber.dispose()
```

Гарантии `dispose`:
1. Все регистрации, которыми владеет плагин, отменены.
2. Дочерние плагины выгружены рекурсивно.
3. Возвращённый промис разрешается после завершения всей асинхронной очистки.

## Горячая подмена (HMR)

С загруженным из `cordis.yml` пакетом `@deepseek-ai/cordis-plugin-hmr` редактирование файла исходного кода плагина запускает:

1. Выгрузку старого плагина и очистку его регистраций.
2. Загрузку нового кода.
3. Выполнение нового `apply`.

Поскольку регистрации плагина снимаются автоматически, при горячей подмене не остаётся регистраций старого экземпляра.

## Пример жизненного цикла

```ts ignore-check
export function apply(ctx: Context) {
  console.log('plugin loading')

  ctx.effect(() => {
    console.log('effect registered')
    return () => console.log('effect cleaned up')
  })
}
```

При загрузке выводится:
```
plugin loading
effect registered
```

При выгрузке выводится:
```
effect cleaned up
```

## Дальнейшие шаги

- [Сервисы и зависимости](./service.ru.md) — предоставьте возможность другим плагинам
- [Система событий](./events.ru.md) — обмен событиями между плагинами
- [Туториал по Cordis](../../../cordis-tutorial/index.ru.md) — тот же жизненный цикл, сервисы и события, построенные шаг за шагом на базе рантайма Cordis

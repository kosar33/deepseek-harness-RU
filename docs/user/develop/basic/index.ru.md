# Ваш первый плагин

[English](index.md) | [中文](index.zh.md) | Русский

Этот туториал создаёт минимальный плагин Harness и загружает его в веб-интерфейс. Стартуйте с checkout репозитория, прошедшего путь [запуска из исходников](../../../../README.ru.md#запуск-из-исходников).

## Создайте локальный проект

Из корня репозитория создайте черновой проект для туториала:

```sh
mkdir -p scratch-plugin/src
```

## Что такое плагин?

В Harness плагин — это модуль TypeScript, экспортирующий функцию `apply`. Фреймворк вызывает `apply` при загрузке плагина и передаёт объект контекста `ctx`, через который плагин регистрирует возможности:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // Register capabilities here.
}
```

Это и есть полная конфигурация.

## Создайте файл плагина

Создайте `scratch-plugin/src/my-plugin.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  // Required dependencies are ready before apply runs.
  console.log('[hello-plugin] plugin loaded!')
}
```

## Зарегистрируйте его в cordis.yml

Выполните `pwd` в корне репозитория, затем создайте `scratch-plugin/cordis.yml` как веб-оверлей, вставляющий локальный плагин. Замените `/absolute/path/to/deepseek-harness` ниже на напечатанный путь:

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'
```

Путь к плагину должен быть абсолютным. Patch-файл добавляет конфигурацию, но не меняет каталог профиля, из которого загрузчик разрешает пути модулей.

Запустите веб-интерфейс с этим оверлеем:

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

Откройте `http://127.0.0.1:3080`. Терминал печатает `[hello-plugin] plugin loaded!` во время старта.

## Автоматическая очистка

Всё, что зарегистрировано через `ctx` — слушатели событий, инструменты или таймеры, — очищается при выгрузке плагина. Вам не нужно вручную вызывать removeListener или clearInterval.

Для ресурса, требующего явной очистки, например сетевого соединения, используйте `ctx.effect()`, чтобы предоставить его disposer:

```ts
import type { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log('heartbeat')
    }, 5000)

    // The returned function runs when the plugin unloads.
    return () => clearInterval(timer)
  })
}
```

## Объявите зависимости

Если плагин потребляет другой сервис, например `tools` или `llm`, объявите это в `inject`:

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools is ready here.
  ctx.tools.register(/* ... */)
}
```

Фреймворк ждёт каждый требуемый сервис перед загрузкой плагина.

## Три формы плагина

Помимо функционального модуля, плагин может использовать форму объекта или класса.

### Форма объекта

```ts
import type { Context } from '@deepseek-ai/cordis'

export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}
```

### Форма класса

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MyService extends Service {
  static inject = ['tools']

  constructor(ctx: Context) {
    super(ctx, 'myService')
    // Perform synchronous initialization in the constructor.
  }
}
```

Функциональной формы достаточно в большинстве случаев. Форму класса используйте, когда плагин предоставляет сервис другим плагинам; см. [сервисы и зависимости](../framework/service.ru.md).

## Дальнейшие шаги

- [Создание инструмента](./tool.ru.md) — изучите DSL определения инструментов
- [Конфигурация плагина](./config.ru.md) — принимайте пользовательскую конфигурацию
- [Туториал по Cordis](../../../cordis-tutorial/index.md) — фреймворк плагинов под капотом, строится с нуля без API-ключа

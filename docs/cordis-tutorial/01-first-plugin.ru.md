# 1. Ваш первый плагин

[English](01-first-plugin.md) | [中文](01-first-plugin.zh.md) | Русский

В используемой здесь конфигурации загрузчика модуль плагина Cordis именованным экспортом предоставляет функцию `apply`. При загрузке Cordis вызывает `apply`, передавая **контекст** — объект `ctx`, через который плагин регистрирует всё, что вносит.

## Пишем плагин

В вашем каталоге `tmp/cordis-tutorial` (см. [настройку](index.ru.md#настройка)) создайте `hello.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}
```

Экспорт `name` — необязательные метаданные для отображения; он помечает плагин в диагностике.

## Собираем приложение

Лаунчер этого туториала собирает приложение из конфигурации. Создайте `cordis.yml`:

```yaml
- name: './hello.ts'
```

Файл — это список записей плагинов. `name` — спецификатор модуля: относительный путь или имя npm-пакета, — и загрузчик монтирует каждую запись. Записи стартуют конкурентно, поэтому позиция в списке не гарантирует, какой плагин загрузится первым; порядок задаётся зависимостями между сервисами (`inject`, [глава 3](03-services.ru.md)), а не позицией в файле.

## Запускаем

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Ожидаемый результат:

```
hello from my first plugin
```

Процесс завершается сам, когда не остаётся ничего запущенного. Что произошло:

1. Лаунчер создал корневой `Context` и смонтировал плагин **Loader**.
2. Loader прочитал `cordis.yml`, разрешил `./hello.ts` и смонтировал его дочерним плагином.
3. Cordis вызвал ваш `apply(ctx)`.

В вашем файле нет кода инициализации фреймворка: плагин описывает то, что вносит, а `cordis.yml` компонует из этого приложение. Например, [`dsh` base](../../packages/bundle/base/cordis.patch.yml) — более длинная композиция плагинов, которую дополняют и переопределяют оверлеи развёртывания.

## Две другие формы плагина

Функция — самая распространённая форма, но Cordis принимает три:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

// 1. Function plugin (what you just wrote).
export function apply(ctx: Context) {}

// 2. Object plugin: an object with an `apply` method.
export const objectPlugin = {
  name: 'object-plugin',
  apply(ctx: Context) {},
}

// 3. Class plugin: a Service subclass (covered in chapter 3).
export class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myTutorialService')
  }
}
```

Пользуйтесь формой-функцией, пока не понадобится предоставить сервис; [глава 3](03-services.ru.md) разбирает, когда форма-класс оправдывает себя.

## Попробуйте сломать его

Заставьте `apply` бросить исключение:

```ts ignore-check
export function apply(ctx: Context) {
  throw new Error('apply exploded')
}
```

Запустите снова: процесс падает с вашей ошибкой. Плагин, которому не удалось загрузиться, — громкий отказ, а не пропущенная запись.

Об одной оговорке стоит узнать заранее: запись конфигурации, чей модуль невозможно **разрешить** (опечатка в пути или имени пакета), не роняет процесс — о ней сообщается через сервис логгера Cordis, и при начальной загрузке этот отчёт может быть потерян до того, как заработает консольный экспортёр. Если свежедобавленная запись, похоже, ничего не делает, первым делом проверьте написание.

Далее: [Жизненный цикл и эффекты](02-lifecycle-and-effects.ru.md) — что происходит, когда плагин выгружается.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

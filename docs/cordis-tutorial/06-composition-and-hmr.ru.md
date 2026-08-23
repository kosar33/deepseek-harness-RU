# 6. Композиция и HMR

[English](06-composition-and-hmr.md) | [中文](06-composition-and-hmr.zh.md) | Русский

Каждая созданная до сих пор возможность — это плагин, а `cordis.yml` выбирает дерево плагинов приложения. Эта глава меняет композицию, выполняет горячую перезагрузку плагина и разбирает плагин, который не загружается.

## Запись — больше чем имя

Запись конфигурации принимает метаданные помимо `name` и `config`:

```yaml
- id: greeter          # stable identity for this entry
  name: './greeter.ts'
- id: consumer
  name: './consumer.ts'
  disabled: true       # keep the entry, skip mounting it
```

`id` даёт записи стабильную идентичность, поэтому загрузчик отличает правку существующей записи от удаления с последующим добавлением. `disabled: true` размонтирует плагин, не удаляя его записи, — переключите флаг обратно, и плагин (и всё, что висит в PENDING на его сервисах) снова загрузится.

Группы содержат вложенный список записей, который загружается и выгружается как единое целое, а `isolate` выдаёт группе собственный экземпляр сервиса с данным именем — каждая из двух групп может видеть по-своему сконфигурированного провайдера `shell`, не влияя друг на друга. Подробности в [Primer по Cordis](../cordis-primer.ru.md) и в [примере изоляции сервисов](../user/develop/framework/service.ru.md#изоляция-сервисов).

## Горячая замена модулей

Поскольку выгрузка освобождает эффекты ([главу 2](02-lifecycle-and-effects.ru.md)), а загрузка следует зависимостям ([главу 3](03-services.ru.md)), HMR может заменить работающий плагин, выгрузив и загрузив его. Плагин `@deepseek-ai/cordis-plugin-hmr` следит за вашими файлами и делает ровно это при сохранении.

В `tmp/cordis-tutorial` запишите `cordis.yml`:

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/cordis-plugin-hmr'
  config:
    root: ['.']
- id: hello
  name: './hello.ts'
```

К списку присоединились два вспомогательных плагина: HMR пишет лог через сервис логгера Cordis, поэтому без консольного экспортёра его сообщений вы не увидите, а сервис `timer` он подключает через `inject` ради дебаунса — без `@deepseek-ai/cordis-plugin-timer` он навсегда молча останется в PENDING. Эта тишина — тема следующего раздела.

HMR читает внутренности загрузчика Node через нативный помощник Loader. Запустите Cordis под tsx:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Теперь отредактируйте `hello.ts` — поменяйте сообщение лога — и сохраните:

```
hello from my first plugin
2026-07-22 15:44:36 [I] hmr watching [ '.' ]
2026-07-22 15:44:39 [I] hmr reload plugin at hello.ts
hello from my EDITED plugin
```

Старый экземпляр выгрузился (все его эффекты отменены), новый код загрузился, `apply` выполнился снова. Остановите процесс сочетанием Ctrl-C. Правка самого `cordis.yml` тоже подхватывается: загрузчик сравнивает записи по `id` и монтирует, размонтирует или переконфигурирует только изменившееся. Именно поэтому записи выше несут явные `id` — запись без него при каждом чтении получает сгенерированный id, так что после любой правки файла конфигурации она считается удалённой и заново добавленной и перемонтируется, даже если её собственные строки не менялись.

## Диагностика плагина, который не загружается

Обратная сторона загрузки по зависимостям: плагин, чей `inject` перечисляет сервис, который никто не предоставляет, ждёт вечно и ничего не печатает. Ошибки нет — PENDING легитимное состояние, ведь провайдера могут смонтировать позже.

Состояния можно увидеть напрямую. Любой контекст умеет перечислять реестр плагинов; создайте `diagnose.ts`:

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
```

И плагин с невыполнимой зависимостью, `needs-timer.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'needs-timer'
export const inject = ['timer']

export function apply(ctx: Context) {
  console.log('needs-timer loaded')
}
```

```yaml
- name: './needs-timer.ts'
- name: './diagnose.ts'
```

Запустите (обычный `node --import tsx ../../vendor/cordis/bin.js`; остановка — Ctrl-C):

```
needs-timer is PENDING — a required service is missing
```

У `inject: ['timer']` нет провайдера. Добавьте `- name: '@deepseek-ai/cordis-plugin-timer'` в список, и плагин загрузится. Когда плагин ничего не делает и ни о чём не сообщает, посмотрите состояние его fiber. Итерация без фильтра PENDING покажет и собственные плагины загрузчика (Loader, Include) как fiber'ы в состоянии ACTIVE, потому что плагины монтируют сам файл конфигурации.

Далее: [Внутрь harness](07-into-the-harness.ru.md) — те же приёмы поверх настоящих сервисов harness.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

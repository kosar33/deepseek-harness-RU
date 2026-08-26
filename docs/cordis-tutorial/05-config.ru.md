# 5. Конфигурация

[English](05-config.md) | [中文](05-config.zh.md) | Русский

Каждая запись `cordis.yml` может нести блок `config`, а плагин объявляет схему, которая валидирует его до запуска `apply`. Некорректная конфигурация прерывает загрузку с точной ошибкой — плагин никогда не запускается с частичной конфигурацией.

## Настраиваемый плагин

Создайте `config-demo.ts` в `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'config-demo'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

export function apply(ctx: Context, config: Config) {
  for (const target of config.targets) {
    console.log(`${config.greeting}, ${target}!`)
  }
}
```

Экспортируемый `Config` — одновременно TypeScript-интерфейс и рантайм-схема под одним именем: потребители получают тип, Cordis — валидатор. Для схем этот репозиторий использует [Schemastery](https://github.com/shigma/schemastery); сам Cordis принимает любой валидатор [Standard Schema](https://standardschema.dev/), поэтому простой объект, экспортированный как `Config`, работать не будет.

Сконфигурируйте его:

```yaml
- name: './config-demo.ts'
  config:
    targets: ['alpha', 'beta']
```

Запуск:

```
Hello, alpha!
Hello, beta!
```

`greeting` был опущен, и его заполнило значение по умолчанию из схемы — `apply` всегда получает полную, провалидированную конфигурацию.

## Громкий отказ

Теперь передайте ему невалидные данные:

```yaml
- name: './config-demo.ts'
  config:
    targets: 'not-an-array'
```

```
ValidationError: invalid config:
  - $.targets expected array but got not-an-array (at targets)
```

fiber плагина переходит в FAILED, а лаунчер этого туториала, выведя ошибку, завершается со статусом 1. Плагину также СЛЕДУЕТ отвергать конфигурацию, валидную по схеме, но называющую недоступный ресурс или провайдера, — как только он сможет разрешить эту ссылку.

## Вычисляемые значения конфигурации

Загрузчик, используемый в этом репозитории, поддерживает тег `!!js` для значений конфигурации, которые требуется вычислить во время загрузки:

```yaml
- name: './config-demo.ts'
  config:
    greeting: !!js process.env.DEMO_GREETING ?? 'Hello'
```

`!!js` работает только внутри `config` и в поле `disabled` записи. `disabled: !!js ...` вычисляется против контекста загрузчика при каждом решении о монтировании (расширение этого репозитория), поэтому запись может сама гейтить себя по платформе или окружению; остальная метадата (`name`, `id`, `inject`, ...) остаётся статичной — там выражение было бы обычными truthy-данными. См. [конфигурацию лоадера](../cordis-primer.ru.md#конфигурация-лоадера).

Далее: [Композиция и HMR](06-composition-and-hmr.ru.md) — `cordis.yml` как само приложение.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

# Конфигурация плагина

[English](config.md) | [中文](config.zh.md) | Русский

Принимайте конфигурацию, передаваемую через `cordis.yml`.

## Определите тип Config

Экспортируйте тип `Config` и одноимённую схему Schemastery. Значения по умолчанию размещайте прямо на полях схемы:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)  // User value or schema default.
}
```

Добавьте конфигурацию в вставленную строку локального плагина в `scratch-plugin/cordis.yml`:

```yaml
- insert:
    - id: hello
      name: './src/my-plugin.ts'
      config:
        greeting: 'Hi there'
        maxRetries: 5
```

При загрузке плагина Cordis использует экспортированную схему, чтобы провалидировать конфигурацию и заполнить значения по умолчанию. Не экспортируйте простой объект как `Config`: он не реализует интерфейс Standard Schema, требуемый Cordis.

## Валидация схемой

Используйте Schemastery для более строгой валидации:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'validated-plugin'

export interface Config {
  apiKey: string
  timeout: number
  mode: 'fast' | 'accurate'
}

export const Config = Schema.object({
  apiKey: Schema.string().required(),
  timeout: Schema.number().default(30000),
  mode: Schema.union(['fast', 'accurate']).default('fast'),
})

export function apply(ctx: Context, config: Config) {
  // config is validated and type-safe.
}
```

Схема выполняется при загрузке плагина. Некорректная конфигурация валит загрузку с понятной ошибкой.

## Принципы проектирования

### Не хардкодьте настраиваемые значения

Harness требует, чтобы **всё, что два развёртывания могут захотеть задать по-разному, было полем конфигурации**.

```ts
// Wrong: hardcoded timeout.
const TIMEOUT = 30000

// Correct: configurable.
export interface Config {
  timeoutMs: number  // Defaults to 30000.
}
```

Проверка проста: может ли `cordis.yml` изменить значение без правки кода.

### Громко падайте на некорректной конфигурации

Выражайте самодостаточные ограничения в схеме, чтобы некорректная конфигурация валила загрузку плагина. Ссылки на сервисы или зарегистрированные ресурсы требуют внедрения зависимостей; этот контракт вводит [туториал по сервисам](../framework/service.ru.md).

## Работа с HMR

Правка конфигурации горячо подменяет плагин: фреймворк выгружает старый экземпляр и загружает новый. Поскольку регистрации являются эффектами и очищают себя сами, подмена не сохраняет регистраций старого экземпляра.

## Дальнейшие шаги

- [Упаковка и установка плагина](./publish.ru.md) — выпустите плагин как устанавливаемый пакет
- [Плагины и жизненный цикл](../framework/index.ru.md) — поймите полный жизненный цикл плагина
- [Сервисы и зависимости](../framework/service.ru.md) — предоставьте сервис другим плагинам

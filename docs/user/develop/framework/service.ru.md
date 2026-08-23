# Сервисы и зависимости

[English](service.md) | [中文](service.zh.md) | Русский

Сервис — это возможность, которую один плагин предоставляет другим. `inject` объявляет сервисы, которых требует плагин.

## Что такое сервис?

В Harness `tools`, `llm` и `agents` — это сервисы. Каждый — именованная возможность, смонтированная на `ctx`:

```ts ignore-check
ctx.tools    // ToolRuntime service
ctx.llm      // LLM service
ctx.agents   // Agent service
```

Любой плагин может предоставить сервис для потребления другими.

## Потребление сервиса

Объявите `inject`, чтобы использовать существующий сервис:

```ts ignore-check
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools exists and is ready here.
  ctx.tools.register(/* ... */)
}
```

Когда выполняется `apply`, каждый сервис, объявленный в `inject`, готов. Если сервис не готов, плагин ждёт вместо запуска.

## Предоставление сервиса

### Наследуйте Service

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MetricsService extends Service {
  static inject = ['llm']  // A service may depend on other services.

  constructor(ctx: Context) {
    super(ctx, 'metrics')  // 'metrics' is the service name.
  }

  // Public service method.
  record(event: string, value: number) {
    // ...
  }
}
```

После загрузки этого плагина потребители обращаются к сервису как `ctx.metrics`:

```ts ignore-check
export const inject = ['metrics']

export function apply(ctx: Context) {
  ctx.metrics.record('tool_call', 1)
}
```

### Объявите его тип

Используйте declaration merging в TypeScript, чтобы типизировать `ctx.metrics`:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    metrics: MetricsService
  }
}

export default class MetricsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'metrics')
  }

  record(event: string, value: number) { /* ... */ }
}
```

## Поведение зависимостей

### Обязательные и необязательные зависимости

```ts ignore-check
// Required: the plugin does not load while the service is absent.
export const inject = ['tools']

// Optional: omit inject and query with ctx.get() at the use site.
export function apply(ctx: Context) {
  const metrics = ctx.get('metrics')
  metrics?.record('plugin_loaded', 1)
}
```

### Когда сервис исчезает

Если требуемый сервис исчезает во время работы приложения, например потому что его провайдер выгрузился:

1. Зависимые плагины освобождаются автоматически.
2. Они загружаются снова, когда сервис возвращается.

Это не даёт плагину вызвать сервис, которого больше нет.

## Изоляция сервисов

`cordis.yml` может изолировать сервисы так, что отдельные группы плагинов видят отдельные экземпляры одного сервиса:

```yaml
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 5000
    - name: './src/plugin-a.ts'

- id: group-b
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 60000
    - name: './src/plugin-b.ts'
```

`plugin-a` и `plugin-b` каждый видят экземпляр Bash своей собственной группы, без межгрупповых эффектов.

## Встроенные сервисы Harness

Репозиторий генерирует имена сервисов, публичные методы и расположение исходников на [страницу подсистем](../../../subsystems/core.md) каждого сервиса. При разработке плагина пользуйтесь этими сгенерированными областями и интерфейсом TypeScript сервиса; не ведите второй статический список.

## Дальнейшие шаги

- [Система событий](./events.ru.md) — общайтесь между плагинами без жёсткой связанности
- [Расслоение возможностей](../practice/index.ru.md) — используйте сервисы как интерфейсы возможностей

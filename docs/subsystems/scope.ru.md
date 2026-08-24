# Скоупированная регистрация

[English](scope.md) | [中文](scope.zh.md) | Русский

[Пакет scope](../../packages/core/scope) поставляет словарь идентичности, носителя и скоупированных слоёв, благодаря которому один контекст регистрации означает одновременно видимость в пределах одного агента и совместное владение временем жизни. Это библиотечный примитив, а не сервис Cordis; за обоснованием жизненного цикла стоит [Agent Note о рантайм-дизайне agent-scope](../../.agents/notes/implemented/architecture/2026-07-12-agent-scope-runtime-design.md#scope-routing-one-opaque-key-selects-one-layer), за решением о слоях реестра — [Agent Note о разделяемом хранилище](../../.agents/notes/implemented/architecture/2026-07-12-scoped-layers-store.md), а за вызываемым API и семантикой фильтрации — [README пакета](../../packages/core/scope/README.md).

Источники: [`packages/core/scope/src/index.ts`](../../packages/core/scope/src/index.ts) и [`packages/core/scope/src/store.ts`](../../packages/core/scope/src/store.ts).

## Идентичность и носитель диспетчеризации

`ScopeKey` — непрозрачная объектная идентичность. Поставляемый цикл использует сам живой объект `Agent` в качестве его собственного ключа, но примитив никогда не инспектирует этот объект.

```ts type-equiv
/** An opaque, identity-compared scope key. */
type ScopeKey = object
```

`Scoped<T>` — бренд этапа компиляции на непрозрачном носителе маршрутизации, который возвращает `scopeTarget(base, key)`. Объявления событий с фильтрацией по скоупу требуют этот носитель как тип `this`, тогда как реальный субъект события остаётся явным аргументом.

```ts type-equiv
/**
 * A routing-only event receiver built by {@link scopeTarget}. The type
 * parameter records the subject type for dispatch checking; the carrier does
 * not expose the subject's properties. Event payloads carry the real subject.
 */
type Scoped<T extends object> = object & { readonly [ScopedBrand]: T }
```

## Владеемый контекст регистрации

`Scope` соединяет помеченный контекст регистрации с двумя путями освобождения ресурсов. `rawDispose` сохраняет точную идентичность диспоузера Cordis, которая нужна упорядоченному составному эффекту; `dispose()` — публичная общая граница quiescence (полного завершения всех жизненных циклов) для прямых и конкурирующих вызывающих.

```ts type-equiv
/** A minted registration scope and its quiescent disposal boundaries. */
interface Scope {
  /** Context through which scope-owned registrations are made. */
  ctx: Context
  /** Exact Cordis disposer, used when nesting this scope in an ordered composite effect. */
  rawDispose: () => Promise<void> | void
  /** Dispose every scope-owned registration; racing calls await the same completion. */
  dispose(): Promise<void>
}
```

## Скоупированный слой реестра

`ScopeLayer` представляет полный вклад одного реестра на глобальном уровне или на уровне точного скоупа. Конкретный слой может агрегировать несколько именованных и анонимных таблиц; пустота слоя как целого позволяет `ScopedLayers` освободить скоупированное состояние, не отбрасывая соседнюю таблицу.

```ts type-equiv
/** One scope's aggregate contribution to a registry. */
interface ScopeLayer {
  /** Whether every table in this layer is empty. */
  isEmpty(): boolean
}
```

`ScopedLayers<L>` владеет жадным глобальным слоем и лениво создаваемыми слоями точных скоупов. Чтения не создают слоёв: `peek(undefined)` означает отсутствие оверлея, тогда как `merge()` материализует именованные глобальные записи в порядке вставки, за которыми следуют скоупированные тени. Регистрации используют один контекст сразу для видимости и владения эффектами Cordis, собирают одну синхронную отмену до необязательного уведомления, возвращают точный диспоузер Cordis и освобождают скоупированный слой, только когда его полный `ScopeLayer` пуст.

`NamedEntries<V>` предоставляет поиск в порядке вставки и живую итерацию, где ошибки дубликатов принадлежат вызывающему. `AnonymousEntries<V>` даёт каждой вставке уникальную идентичность, поэтому равные значения остаются независимыми. Итерация остаётся живой в пределах одного непустого поколения таблицы; опустошение таблицы отсоединяет существующие итераторы от последующих вставок. Оба возвращают идемпотентные отмены, нацеленные точно на запись; общий реализационный интерфейс `EntryValues` не является публичным.

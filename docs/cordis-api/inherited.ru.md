<!-- Английская сторона генерируется scripts/gen-cordis-catalog.ts; русский файл ведётся вручную поверх английской стороны.
     Обновление: сначала `pnpm run gen-cordis-catalog`, затем правьте перевод по диффу английской стороны и подтверждайте пару командой `node scripts/russian-docs/check.mjs --write docs/cordis-api/inherited.ru.md`. -->

# Унаследованный API Cordis

[English](inherited.md) | Русский

Члены `ctx` фреймворка и события, которые видит каждый плагин поверх яруса harness, — закреплённые vendor-исходники ([политика вендоринга](../../vendor/README.md)), суммированные кратко, чтобы страницы harness оставались сосредоточены на словаре репозитория. Подробные API Context, Fiber, Registry и Service генерируются в [context.md](context.md), [fiber.md](fiber.md), [registry.md](registry.md) и [service.md](service.md); методы диспатча событий — в [events.md](events.md).

Этот файл ГЕНЕРИРУЕТСЯ из исходников (`scripts/gen-cordis-catalog.ts`) и проверяется на актуальность через `pnpm run verify-cordis-catalog` (часть `doc-sync`) — не редактируйте его вручную. Блоки сигнатур используют fence `ts cordis-catalog` и включают оригинальный JSDoc из исходника непосредственно перед каждым событием или методом сервиса. doc-typecheck пропускает эти голые фрагменты объявлений; имена типов в сигнатуре ссылаются на документирующую их страницу.

## Унаследованные члены `ctx` (cordis core + loader/hmr/timer)

- `ctx.on / ctx.once` — Зарегистрировать слушателя события (disposable). ([`vendor/cordis/src/events.ts:34`](../../vendor/cordis/src/events.ts))
- `ctx.emit / ctx.parallel / ctx.serial / ctx.bail / ctx.waterfall` — Диспатчить событие (синхронно / с ожиданием / досрочный выход на первом результате / короткое замыкание цепочки). ([`vendor/cordis/src/events.ts:34`](../../vendor/cordis/src/events.ts))
- `ctx.plugin / ctx.inject` — Загрузить плагин / объявить требуемые сервисы. ([`vendor/cordis/src/registry.ts:164`](../../vendor/cordis/src/registry.ts))
- `ctx.effect` — Зарегистрировать привязанный к fiber побочный эффект (disposable). ([`vendor/cordis/src/fiber.ts:9`](../../vendor/cordis/src/fiber.ts))
- `ctx.get / ctx.set / ctx.provide / ctx.accessor / ctx.mixin` — Низкоуровневый доступ к хранилищу сервисов и привязка. ([`vendor/cordis/src/reflect.ts:7`](../../vendor/cordis/src/reflect.ts))
- `ctx.extend / ctx.isolate / ctx.intercept` — Породить дочерний контекст (скоупированные сервисы / изоляция / перехват). ([`vendor/cordis/src/context.ts:42`](../../vendor/cordis/src/context.ts))
- `ctx.root / ctx.scope / ctx.fiber / ctx.registry / ctx.reflect / ctx.events / ctx.logger` — Фоновые дескрипторы работающего графа контекстов. ([`vendor/cordis/src/context.ts:16`](../../vendor/cordis/src/context.ts))
- `ctx.timer (+ interval / timeout / throttle / debounce)` — Помощники таймера (disposable). Ключ `timer` предоставляется в рантайме; четыре поддерживаемых помощника подмешиваются прямо в ctx (объявлены через Pick). ([`vendor/timer/src/index.ts:4`](../../vendor/timer/src/index.ts))
- `ctx.loader` — Загрузчик конфигурации, поднявший приложение (присутствует при загруженном loader). ([`vendor/loader/src/index.ts:30`](../../vendor/loader/src/index.ts))
- `ctx.hmr` — Наблюдатель горячей замены модулей (присутствует при загруженном плагине hmr). ([`vendor/hmr/src/index.ts:15`](../../vendor/hmr/src/index.ts))

## Унаследованные события (cordis core + loader/hmr/timer)

- `internal/plugin` — Создан fiber плагина. ([`vendor/cordis/src/events.ts:328`](../../vendor/cordis/src/events.ts))
- `internal/status` — Fiber сменил состояние жизненного цикла. ([`vendor/cordis/src/events.ts:330`](../../vendor/cordis/src/events.ts))
- `internal/service` — Хук перехвата для привязки сервиса (производителя в ядре нет). ([`vendor/cordis/src/events.ts:332`](../../vendor/cordis/src/events.ts))
- `internal/update` — Каскад: применяется обновление конфигурации fiber. ([`vendor/cordis/src/events.ts:334`](../../vendor/cordis/src/events.ts))
- `internal/get` — Каскад: сервис читается из хранилища. ([`vendor/cordis/src/events.ts:336`](../../vendor/cordis/src/events.ts))
- `internal/set` — Каскад: сервис записывается в хранилище. ([`vendor/cordis/src/events.ts:338`](../../vendor/cordis/src/events.ts))
- `internal/listener` — Зарегистрирован слушатель. ([`vendor/cordis/src/events.ts:340`](../../vendor/cordis/src/events.ts))
- `internal/dispatch` — Событие диспатчится слушателям. ([`vendor/cordis/src/events.ts:342`](../../vendor/cordis/src/events.ts))
- `hmr/change` — Наблюдаемый исходный файл изменился на диске. ([`vendor/hmr/src/index.ts:20`](../../vendor/hmr/src/index.ts))
- `hmr/reload` — Плагины перезагружаются после изменения. ([`vendor/hmr/src/index.ts:21`](../../vendor/hmr/src/index.ts))
- `exit` — Процесс завершается по сигналу. ([`vendor/loader/src/index.ts:23`](../../vendor/loader/src/index.ts))
- `loader/config-update` — Дерево конфигурации загрузчика изменилось. ([`vendor/loader/src/index.ts:24`](../../vendor/loader/src/index.ts))
- `loader/entry-init` — Инициализируется конфигурационная запись. ([`vendor/loader/src/index.ts:25`](../../vendor/loader/src/index.ts))
- `loader/partial-dispose` — При перезагрузке запись частично освобождает ресурсы. ([`vendor/loader/src/index.ts:26`](../../vendor/loader/src/index.ts))
- `loader/patch-context` — Во время перезагрузки контекст патчится. ([`vendor/loader/src/index.ts:27`](../../vendor/loader/src/index.ts))

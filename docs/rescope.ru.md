# Рескоуп вендоренных пакетов

[English](rescope.md) | [中文](rescope.zh.md) | Русский

Фреймворк Cordis и его базовые библиотеки вендорятся под [`vendor/`](../vendor/README.md) и публикуются в скоупе `@deepseek-ai`, потому что каждый пакет harness объявляет фреймворк peer-зависимостью: публикация harness публикует вместе с ним и этот слой, а под апстримными именами такая публикация захватила бы их на реестре. Эта страница — отображение имён; решение и его последствия живут в [Agent Note о рескоупе](../.agents/notes/implemented/process/2026-08-10-vendor-package-rescope.md), апстримные коммиты — в [`vendor/README.md`](../vendor/README.md).

## Отображение имён

| Каталог | Апстримное имя | Публикуемое имя | Версия | Роль |
|---|---|---|---|---|
| `vendor/cordis/` | `cordis` | `@deepseek-ai/cordis` | 4.0.0-rc.7 | Ядро фреймворка: `Context`, `Service`, `Fiber`, события |
| `vendor/cosmokit/` | `cosmokit` | `@deepseek-ai/cosmokit` | 1.8.1 | Общие утилиты, на которых строятся фреймворк и Schemastery |
| `vendor/schemastery/` | `schemastery` | `@deepseek-ai/schemastery` | 3.18.0 | Схемы конфигураций (`Schema`) за каждым `Config` плагинов |
| `vendor/loader/` | `@cordisjs/plugin-loader` | `@deepseek-ai/cordis-plugin-loader` | 1.0.0-rc.5 | Загрузка `cordis.yml`, разрешение плагинов, кэш репозитория |
| `vendor/include/` | `@cordisjs/plugin-include` | `@deepseek-ai/cordis-plugin-include` | 1.0.4 | Конфигурационные include'ы и patch-оверлеи |
| `vendor/group/` | `@cordisjs/plugin-group` | `@deepseek-ai/cordis-plugin-group` | 1.0.0 | Вложенные группы плагинов |
| `vendor/timer/` | `@cordisjs/plugin-timer` | `@deepseek-ai/cordis-plugin-timer` | 1.1.2 | Таймеры на `ctx` с учётом освобождения |
| `vendor/hmr/` | `@cordisjs/plugin-hmr` | `@deepseek-ai/cordis-plugin-hmr` | 1.0.15 | Hot module replacement для плагинов и конфигураций |
| `vendor/logger-console/` | `@cordisjs/plugin-logger-console` | `@deepseek-ai/cordis-plugin-logger-console` | 1.0.0 | Экспортёр консольного логгера |

Subpath-экспорты сохраняют путь: `@cordisjs/plugin-loader/repository` становится `@deepseek-ai/cordis-plugin-loader/repository`.

## Чего переименование не касается

- **Имён каталогов и версий.** `vendor/hmr/` остаётся `vendor/hmr/`, и каждый пакет держит апстримную версию, записанную строкой таблицы манифеста, поэтому вендоренное дерево читается как снимок апстрима.
- **Диапазонов зависимостей.** Запись зависимости меняет ключ, но не диапазон: `"cordis": "^4.0.0-rc.7"` становится `"@deepseek-ai/cordis": "^4.0.0-rc.7"`. `linkWorkspacePackages` разрешает сохранённые диапазоны на закреплённые воркспейсы.
- **Встроенного префикса `cordis:` лоадера.** `cordis:include` и `cordis:group` — протокольный префикс, не имя пакета.
- **Семейства конфигураций `cordis.yml`**, включая `*.cordis.yml`, `*.cordis.snapshot.yml` и `cordis.patch.yml`.
- **Пакетов harness, чьи собственные имена содержат это слово**, например `@deepseek-ai/dsh-tool-cordis`.
- **Апстримных рантаймных идентификаторов**, например `Symbol.for('schemastery')` у Schemastery и его поля метаданных `vendor:`.
- **Прозы вне `docs/`.** `vendor/*/README.md`, README пакетов и Agent Notes хранят имена, с которыми написаны; голый `cordis` там может быть ещё и именем опции Python SDK или id агентского пресета. Внутри `docs/` проза и каждый Markdown-fence следуют переименованию.

## Что должно поменяться в вашем коде

| Место | Было | Стало |
|---|---|---|
| Импорт модуля | `import { Context } from 'cordis'` | `import { Context } from '@deepseek-ai/cordis'` |
| Слияние типизированных событий | `declare module 'cordis'` | `declare module '@deepseek-ai/cordis'` |
| Ключ зависимости в `package.json` | `"@cordisjs/plugin-hmr": "^1.0.15"` | `"@deepseek-ai/cordis-plugin-hmr": "^1.0.15"` |
| Запись плагина в `cordis.yml` | `name: '@cordisjs/plugin-include'` | `name: '@deepseek-ai/cordis-plugin-include'` |

## Применение, проверка, откат

[`scripts/rescope-vendor.ts`](../scripts/rescope-vendor.ts) владеет отображением выше и исполняет переименование — ни одна ссылка не переименовывается руками:

```sh
pnpm run rescope-vendor            # report what would change
pnpm run rescope-vendor --apply    # rewrite every reference
pnpm run rescope-vendor:check      # assert the post-state; runs in the hygiene gate
pnpm run rescope-vendor --apply --reverse   # return to the upstream names
```

Повторно применяйте после апстримной синхронизации ([процедура](../vendor/README.md)) и затем выполните печатающуюся регенерацию: `pnpm install` для lockfile, `pnpm run gen-third-party-notices` и `pnpm run verify-translation-pairing --write` для затронутых двуязычных пар.

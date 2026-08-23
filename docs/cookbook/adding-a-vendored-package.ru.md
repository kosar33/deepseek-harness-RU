# Cookbook: добавление vendored-пакета

[English](adding-a-vendored-package.md) | [中文](adding-a-vendored-package.zh.md) | Русский

Когда harness нуждается в очередном вышестоящем пакете Cordis (например `@cordisjs/plugin-http`), он **вендорится** как закреплённый исходник под `vendor/`, а не добавляется npm-зависимостью — о причинах см. [решение о вендоринге](../../.agents/notes/implemented/process/2026-06-11-vendor-cordis-as-source.md). [vendor/README.md](../../vendor/README.md) описывает *обновление* уже вендоренного пакета; это руководство — чек-лист добавления **нового** пакета файл за файлом. (Проверено по существующему вендоренному набору; если расходится, правьте здесь.)

## 1. Скопируйте исходники

```
vendor/<dir>/
  package.json     # from upstream; set "private": true, rescope the name, keep exports/type
  tsconfig.json    # extends ../../tsconfig.base.json (see configuration below)
  src/             # the upstream src/ verbatim
  README.md LICENSE # if upstream ships them
```

`tsconfig.json` повторяет остальные вендоренные пакеты — `rootDir: src`, `outDir: lib/types`, послабления строгости, которых требует код вышестоящего источника, и запись `references` для каждого другого вендоренного пакета, который он импортирует:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src", "outDir": "lib/types",
    "noUncheckedIndexedAccess": false, "exactOptionalPropertyTypes": false,
    "noImplicitOverride": false, "noUnusedLocals": false, "noUnusedParameters": false
  },
  "include": ["src"],
  "references": [{ "path": "../cordis" }, { "path": "../cosmokit" }]
}
```

Инварианты `package.json`: `"private": true` (вендоренные пакеты никогда не публикуются), рескоуп `name` ([соответствие имён](../rescope.ru.md)) с сохранением вышестоящих `version`/`exports`/`type`, метаданные деклараций направлены на `lib/types`, публикуются выходы деклараций `.d.ts` и `.d.ts.map`, а cordis-зависимости перечислены в `peerDependencies` (как в вышестоящем манифесте). Транзитивные вышестоящие зависимости сами должны быть вендорены или уже присутствовать — вендоринг одного пакета часто означает вендоринг его дерева зависимостей (например `@cordisjs/plugin-http` тянет `@cordisjs/fetch-file`).

Локальные относительные импорты/экспорты в вендоренном TypeScript-исходнике после копирования используют явные спецификаторы `.ts`. Это локальное для репозитория отличие сборки от вышестоящего источника: `rewriteRelativeImportExtensions` порождает рантаймные импорты `.js`, а декларации сохраняют явные спецификаторы `.ts`, которые могут разрешить потребители TypeScript NodeNext/Node16.

## 2. Зарегистрируйте его в корневых конфигурациях

| Файл | Изменение |
|---|---|
| `tsconfig.base.json` | добавьте `"<npm-name>": ["./vendor/<dir>/src"]` в `paths` |
| `tsconfig.host.json` | добавьте `{ "path": "./vendor/<dir>" }` в `references` (перед записями `packages/*`; вендоренный код входит в граф только через агрегат host) |
| `vendor/README.md` | добавьте строку таблицы манифеста (dir, npm-имя, версия, вышестоящий репозиторий, commit SHA) и зафиксируйте любые локальные модификации |
| `scripts/publint-all.ts` | только если вендоренный пакет сам публикуется отсюда (вендоренные зависимости обычно нет — пропустите) |

Покрывается автоматически globs — правки не нужны: корневые workspaces в `package.json` (`vendor/*`), `tsdown.config.ts`, `vitest.config.ts`, `.oxlintrc.json`. Отдельный `vendor/<dir>/tsdown.config.ts` нужен ТОЛЬКО если конфигурация сборки отличается от корневой по умолчанию (двойная ESM/CJS или несколько точек входа — см. `vendor/schemastery` и `vendor/logger-console`); его вход должен читать JS, порождаемый под `lib/types`.

## 3. Помните про защиту манифеста

`scripts/check-vendor-manifest.sh` (pre-commit hook) падает, если что-то под `vendor/*/src` ставится в индекс без одновременной постановки `vendor/README.md`. Ставьте обновление манифеста вместе с исходниками, чтобы коммит прошёл.

## 4. Проверьте

```sh
pnpm install        # registers the workspace
pnpm run typecheck
pnpm run build && pnpm run constraints
```

Запустите поведенческие проверки, отобранные [тестовой политикой](../testing.md). Карта `paths` исходников живёт один раз в `tsconfig.base.json` и обслуживает все графы. Важная граница изоляции — граф project references: на вендоренный исходник ссылаются через его собственный `vendor/<dir>/tsconfig.json`, а не втягивают его в строгую программу агрегата ([структура](../development.md#typescript-project-layout)).

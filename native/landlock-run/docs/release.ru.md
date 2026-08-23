# Релиз

[English](release.md) | Русский

До выхода 1.0: относитесь к этому документу как к чек-листу релиза, а не как к политике стабильности.

## Версионирование

Корень workspace лаунчера и три его публичных пакета делят одну версию. Запускайте вспомогательный скрипт повышения версии из корня репозитория:

```sh
pnpm --dir native/landlock-run release:bump patch          # or minor / major / x.y.z
```

Он обновляет `native/landlock-run/package.json` и все манифесты в `native/landlock-run/packages/*`, освежает корневой lockfile репозитория (`--ignore-scripts --lockfile-only`) и запускает `release:verify`. Явно указанная версия принимает полный semver вместе с prerelease (`pnpm --dir native/landlock-run release:bump 0.0.0-test.0`); воркфлоу публикации помещает prerelease-версии под dist-tag `next`, поэтому `latest` никогда не указывает на тестовую сборку. Зависимости `workspace:*` держите в исходном виде — pnpm преобразует их в конкретные версии при упаковке.

Повышение версии — обычное изменение исходников: откройте релизный PR (либо одиночный коммит) с манифестами лаунчера и корневым lockfile, влейте его, затем от этого коммита создайте соответствующий тег `landlock-run-vX.Y.Z`. Такое пространство имён исключает коллизии с релизными тегами прочих семейств пакетов репозитория. Воркфлоу публикации проверяет, что тег согласуется с версией каждого пакета лаунчера.

```sh
pnpm --dir native/landlock-run release:commit patch        # bump + stage + commit in one command
git tag landlock-run-v0.0.2
```

## Предполётная проверка

```sh
pnpm install --frozen-lockfile
pnpm --dir native/landlock-run build:ts
pnpm --dir native/landlock-run typecheck
pnpm --dir native/landlock-run test:entry
```

На Linux-хосте прогоните локально ещё и путь упаковки:

```sh
pnpm --dir native/landlock-run build:native
pnpm --dir native/landlock-run test:launcher
node native/landlock-run/scripts/pack-release.mjs native/landlock-run/.release/npm --current-platform-only
node native/landlock-run/scripts/verify-packed-install.mjs native/landlock-run/.release/npm --current-platform-only
```

## Публикация

Пользуйтесь воркфлоу `Landlock Run Release` основного репозитория, чтобы каждый бинарник собирался на соответствующем ему нативном раннере:

1. Запустите его с `publish=false` (от релизного коммита), чтобы собрать бинарники всех платформ, скомпоновать и проверить полезные нагрузки, упаковать тарболы в порядке публикации, прогнать установку из упакованного и выгрузить артефакт `npm-tarballs` для осмотра.
2. Создайте и отправьте тег `landlock-run-vX.Y.Z`, соответствующий версиям пакетов.
3. Запустите тот же воркфлоу от этого тега уже с `publish=true`.

Воркфлоу публикует только из окончательных упакованных тарболов и в порядке из `publish-order.txt` (платформенные пакеты раньше входного, который опционально от них зависит). Прогон для текущей платформы всё же может запросить у npm метаданные о несовместимом опциональном платформенном пакете; такой пакет не способен поставить лаунчер для хоста — тот берётся из подходящего локального тарбола. Публикация каждого платформенного пакета раньше входного гарантирует, что публичная версия входного пакета никогда не обгонит собственные платформенные пакеты. Воркфлоу поддерживает npm trusted publishing через GitHub OIDC; без него задайте секрет `NPM_TOKEN` в окружении `npm-publish`. Пакеты публикуются с `--access public`.

Все три скоуп-имени пакетов при самом первом выпуске создаются под токеном организации `@deepseek-ai` через резервный путь `NPM_TOKEN`: npm [требует, чтобы пакет существовал, прежде чем для него можно будет настроить доверенного издателя](https://docs.npmjs.com/cli/v11/commands/npm-trust/). Когда первый релиз создаст все три пакета, настройте в каждом из них доверенного издателя — `landlock-run-release.yml` этого репозитория с окружением `npm-publish`, — а затем уберите резервный токен, когда позволит политика организации.

Ручной локальный резерв (только пакеты текущей платформы) — всегда через `pack-release.mjs` и никогда напрямую через `pnpm publish` (механизм pack у pnpm стирает бит исполняемости лаунчера; см. [packaging.ru.md](packaging.ru.md)):

```sh
node native/landlock-run/scripts/pack-release.mjs native/landlock-run/dist/npm --current-platform-only
node native/landlock-run/scripts/verify-packed-install.mjs native/landlock-run/dist/npm --current-platform-only
while IFS= read -r tarball; do npm publish "native/landlock-run/dist/npm/${tarball}" --access public; done < native/landlock-run/dist/npm/publish-order.txt
```

Не коммитьте файлы `.npmrc`, содержащие токены или переопределения реестра.

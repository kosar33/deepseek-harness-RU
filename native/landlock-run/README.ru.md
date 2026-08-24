# @deepseek-ai/node-addon-landlock-run

[English](README.md) | [中文](README.zh.md) | Русский

Лаунчер [Landlock](https://landlock.io/) в духе «сначала самоограничься, затем exec» для удержания дочерних процессов в ограничениях на Linux, распространяемый как предсобранные поплатформенные npm-пакеты плюс тонкий входной JS-пакет, который находит бинарник и владеет его CLI-контрактом. Создан для agent harness и других хостов, которым нужно исполнять недоверенные команды под белым списком файловой системы, не ограничивая самих себя.

Инструмент — **`landlock-run`**: лаунчер Landlock «сначала самоограничься, затем exec» (~300 строк C11 поверх сырого UAPI ядра, статически слинкован с musl). Он устанавливает набор правил Landlock на самого себя и через `exec` запускает оборачиваемую команду; набор правил наследуется сквозь `execve`, поэтому команда и каждый порождённый ею процесс работают под ограничением, тогда как вызывающий процесс остаётся свободным от ограничений. Fail-closed: если ядро не способно применять правила, происходит выход без запуска команды.

## Установка

```sh
npm install @deepseek-ai/node-addon-landlock-run
```

Публикуемые пакеты состоят из входного пакета и опциональных платформенных пакетов:

```text
@deepseek-ai/node-addon-landlock-run
@deepseek-ai/node-addon-landlock-run-linux-x64
@deepseek-ai/node-addon-landlock-run-linux-arm64
```

Поля `os`/`cpu` npm заставляют установщики выкачивать только совпадающий платформенный пакет. Сборочного запасного пути при установке нет намеренно: на хосте без платформенного пакета разрешённый путь никогда не существует, проба сообщает `unusable`, и потребитель завершается по принципу fail-closed.

## Использование

```js
import { grantArgs, launcherPath, probe } from '@deepseek-ai/node-addon-landlock-run';

const launcher = launcherPath();
if (probe(launcher) !== 'unusable') {
  const argv = [launcher, ...grantArgs({ readOnly: ['/'], readWrite: ['/tmp/work'] }), '--', 'bash', '-c', command];
  // spawn argv with your process runner of choice
}
```

Публичный API намеренно мал:

- `launcherPath()`: абсолютный путь лаунчера этого хоста (существование сознательно не проверяется — сигналом доступности служит проба).
- `probe(launcher?, { timeoutMs? })`: функциональная проба применения правил — `'full' | 'partial' | 'unusable'`.
- `grantArgs({ readOnly?, readWrite? })`: предоставляющий argv лаунчера; всё, что не предоставлено, запрещено.
- `LAUNCHER_BIN` и `LAUNCHER_FAILURE_EXIT` (125): контрактные константы. Потомок, удачно запущенный через exec, тоже может вернуть 125, поэтому для атрибуции отказа лаунчера потребителю нужны фатальная диагностика вместе со статусом.

Полный контракт бинарника (грамматика argv, коды выхода, строки отчёта) закреплён в [docs/cli-contract.md](docs/cli-contract.md).

## Поддержка

linux-x64 и linux-arm64, ядро с включённым Landlock (5.13+; уровень ABI определяет применение правил `full` или `partial` — см. [docs/support-matrix.md](docs/support-matrix.md)). Прочие платформы сознательно остаются без пакета: потребители применяют там другие бэкенды изоляции.

## Разработка

```sh
corepack enable
pnpm install
pnpm build:ts        # entry packages → lib/
pnpm build:native    # this Linux architecture's binaries (apt-get install musl-tools)
pnpm test
```

Бинарники игнорируются git и собираются нативно по архитектурам — локально для собственной машины либо раннерами CI под каждую архитектуру как каноническими сборщиками. Порядок выпуска: [docs/release.md](docs/release.md).

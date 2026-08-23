# @deepseek-ai/node-addon-landlock-run

[English](README.md) | [中文](README.zh.md) | Русский

Лончер самограничения Landlock с последующим запуском для удержания дочерних процессов в границах на Linux: этот entry-пакет разрешает предсобранный бинарник нужной платформы, прогоняет его функциональную пробу принуждения и собирает его argv с выдачей прав — потребители никогда не выписывают флаги лончера и не разбирают вывод лончера сами.

```js
import { grantArgs, launcherPath, probe } from '@deepseek-ai/node-addon-landlock-run';

const launcher = launcherPath();
if (probe(launcher) !== 'unusable') {
  const argv = [launcher, ...grantArgs({ readOnly: ['/'], readWrite: ['/tmp/work'] }), '--', 'bash', '-c', command];
}
```

Лончер устанавливает Landlock-ruleset на самого себя и `exec`-ает завёрнутую команду; ruleset наследуется сквозь `execve`, так что всё дерево процессов работает в границах. Всё не выданное — запрещено, а неудачи лончера завершаются кодом `125` без исполнения команды — fail-closed, никогда fail-open. Контракт бинарника закреплён в `docs/cli-contract.md` репозитория; C-исходник едет в этом tarball'е (`src/main.c`) ради аудита.

Платформенные пакеты (optional dependencies, избираемые по `os`/`cpu`, без JavaScript внутри): `@deepseek-ai/node-addon-landlock-run-linux-x64`, `@deepseek-ai/node-addon-landlock-run-linux-arm64`. На хостах без подходящего пакета `launcherPath()` возвращает детерминированный несуществующий путь, а `probe()` сообщает `'unusable'` — компиляционного fallback'а при установке здесь нет намеренно.

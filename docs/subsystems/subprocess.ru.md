# Дочерние процессы

[English](subprocess.md) | [中文](subprocess.zh.md) | Русский

Capability seam дочерних процессов разделён между Service Definition ([dsh-subprocess](../../packages/subprocess/subprocess), `ctx.subprocess`) и Service Provider ([dsh-subprocess-local](../../packages/subprocess/subprocess-local)); его Consumers — другие capability seam и бэкенды в отдельном процессе: [семейство исполнителей bash](shell.ru.md) использует собранный пакетный вывод, LSP — сырые протокольные пайпы, PTY-бэкенд — терминальный примитив, а субагентный бэкенд ACP — ndjson через пайп плюс унаследованный stderr. Этот seam владеет управляемым пространством имён переменных среды `DSH_*`, общей очисткой учётных данных (`scrubbedParentEnv`) и формой `CollectedOutput`; [dsh-shell](../../packages/shell/shell) реэкспортирует этот словарь, чтобы потребители bash сохраняли один корень импорта.

Источники: [`packages/subprocess/subprocess/src/types.ts`](../../packages/subprocess/subprocess/src/types.ts) · [`packages/subprocess/subprocess/src/index.ts`](../../packages/subprocess/subprocess/src/index.ts)

## Поиск исполняемых файлов

Рабочие каталоги запуска, пути исполняемых файлов, обычные процессы и терминальные сессии одного провайдера живут в том же пространстве путей и процессов, что и смонтированный провайдер файловой системы. `resolveExecutable(command, env?, signal?)` проверяет абсолютные пути исполняемых файлов либо разрешает короткие имена через очищенный `PATH` провайдера плюс явно заданные переопределения.

## Управляемое пространство имён среды и собранный вывод

Переменные `DSH_*` — факты о дочерних процессах, принадлежащие Harness; реализации отбрасывают посторонние имена `DSH_*` до слияния явного `env` вызывающего, поэтому актуальный факт попадает внутрь только как намеренная строковая запись, а явный «надгробный» `undefined` удаляет обычное внешнее значение. Каждый собранный поток сообщает своё состояние усечения и восстановления spill через `CollectedOutput`.

```ts type-equiv
/** One environment key inside the managed {@link DSH_ENV_PREFIX} namespace. */
type DshEnvironmentKey = `${typeof DSH_ENV_PREFIX}${string}`
```

```ts type-equiv
/** Trusted DeepSeek Harness variables for one child-process execution. */
type DshEnvironment = Readonly<Record<DshEnvironmentKey, string>>
```

```ts type-equiv
/** One captured stream: the (possibly truncated) text plus recovery info. */
interface CollectedOutput {
  /** Collected text — the TAIL of the stream when truncated. */
  text: string
  /** True when bytes were dropped from `text`. */
  truncated: boolean
  /** Path to a file holding the COMPLETE stream, when truncated and available. */
  spillPath?: string
}
```

## Диспозиции stdio в стиле Node

Диспозиция каждого потока задаётся явно и выбирается потребителем: сырые пайпы для протокольного кадрирования (JSON-RPC в LSP, ndjson в ACP), наследование для транзитной диагностики и режим collect для ограниченного пакетного вывода — spill-файл при этом необязателен, поэтому диагностический хвост (stderr языкового сервера) буферизуется, не оставляя файлов.

```ts type-equiv
/**
 * stdin disposition. `'ignore'` leaves fd 0 on `/dev/null`; `'pipe'` exposes
 * {@link SubprocessHandle.stdin} for the caller's ongoing protocol writes;
 * `{ data }` writes the bytes and closes (the batch shape).
 */
type SubprocessStdinMode = 'ignore' | 'pipe' | { readonly data: string }
```

```ts type-equiv
/**
 * Bounded in-memory collection for one output stream, with an optional
 * full-stream spill file. Omitting `spill` keeps only the in-memory tail —
 * the diagnostic-tail shape (a language server's stderr); including it makes
 * the complete stream recoverable up to its cap (the bash tool shape).
 */
interface SubprocessCollect {
  /** In-memory cap in bytes; overflow keeps the TAIL. */
  maxBytes: number
  /** Full-stream spill file; absent disables spilling entirely. */
  spill?: {
    /** Whole-stream byte cap; a larger stream discards its now-incomplete spill. */
    maxBytes: number
  }
}
```

```ts type-equiv
/**
 * stdout/stderr disposition. `'pipe'` exposes the raw `Readable` for the
 * caller's protocol decoding; `'inherit'` passes the parent's descriptor
 * through (child diagnostics land on the harness's own stream); a
 * {@link SubprocessCollect} object buffers boundedly with offset-based reads.
 */
type SubprocessOutputMode = 'pipe' | 'inherit' | SubprocessCollect
```

```ts type-equiv
/** Per-stream stdio dispositions, all explicit — this seam applies no defaults. */
interface SubprocessStdio {
  stdin: SubprocessStdinMode
  stdout: SubprocessOutputMode
  stderr: SubprocessOutputMode
}
```

## Полностью явная спецификация запуска

Seam не применяет значений по умолчанию: каждая диспозиция, лимит и каталог явно заданы в спецификации, поэтому их определяет собственная конфигурация вызывающего, а не скрытое умолчание сервиса дочерних процессов. `argv` никогда не интерпретируется оболочкой.

```ts type-equiv
/**
 * A fully-specified spawn request. This seam applies no defaults: every
 * disposition, limit, and directory is explicit, so the caller's own config —
 * not a hidden subprocess-service default — decides them (the `dsh-shell`
 * request/spec split is the owning template).
 */
interface SubprocessSpawnSpec {
  /** Executable and arguments; `argv[0]` is the program. Never shell-interpreted here. */
  argv: readonly string[]
  /** Working directory for the child. */
  cwd: string
  /** Per-stream stdio dispositions. */
  stdio: SubprocessStdio
  /**
   * Positive finite grace period in milliseconds, no greater than
   * `MAX_TIMER_DELAY_MS`, for the {@link SubprocessHandle.terminate} escalation
   * and for draining still-open collected pipes after the process exits (an
   * inherited descriptor held by a surviving descendant cannot hold the
   * outcome open indefinitely).
   */
  graceMs: number
  /**
   * Abort signal — starts the terminate escalation on the process tree when
   * it fires. The caller owns deadlines and cause classification; this seam
   * only reacts to the abort.
   */
  signal?: AbortSignal | undefined
  /**
   * Explicit environment entries merged onto the implementation's scrubbed
   * parent base (see `scrubbedParentEnv`), with no namespace validation. A
   * string is a deliberate caller opt-in, so a forwarded credential-shaped
   * entry or current `DSH_*` fact survives the scrub; `undefined` is a
   * tombstone that removes an ordinary ambient entry from the child.
   */
  env?: NodeJS.ProcessEnv | undefined
}
```

## Дескрипторы: потоки, читатели и завершение в масштабе дерева

Запуск немедленно возвращает живой дескриптор. Читатели режима collect работают с байтовыми смещениями всего потока и ничего не потребляют, поэтому независимые читатели не могут украсть дельты друг друга; пайповые потоки принадлежат вызывающему. Завершение на каждой платформе действует на всё дерево процессов: `terminate()` — единственный глагол завершения — эскалирует SIGTERM→grace→SIGKILL, а `waitForExit()` наблюдает за всем деревом — этого достаточно, чтобы потребитель выстроил собственную лестницу демонтажа (шаблон — `disposeAcpChild` бэкенда ACP, сначала закрывающий stdin по EOF).

```ts type-equiv
/**
 * A live child process rooted in its own process tree. Collected output
 * remains readable after exit; piped streams belong to the caller.
 *
 * Termination is tree-scoped everywhere: POSIX signals the detached process
 * group (falling back to the direct child when the group is gone), Windows
 * terminates the tree via `taskkill /T`, so helper processes cannot outlive
 * the handle unnoticed.
 */
interface SubprocessHandle {
  /** Process id (tree root); -1 when the spawn itself failed. */
  readonly pid: number
  /** The child's stdin, present iff spawned with `stdin: 'pipe'`. */
  readonly stdin: Writable | undefined
  /** The child's raw stdout, present iff spawned with `stdout: 'pipe'`. */
  readonly stdout: Readable | undefined
  /** The child's raw stderr, present iff spawned with `stderr: 'pipe'`. */
  readonly stderr: Readable | undefined
  /** Offset-based readers for collect-mode streams (also readable after exit). */
  readonly collected: SubprocessCollectedOutputs
  /** Resolves at process close with exit facts; rejects only for spawn-level failures. */
  readonly done: Promise<SubprocessOutcome>
  /**
   * Begin the SIGTERM → `graceMs` → SIGKILL escalation on the process tree
   * (Windows force-terminates immediately) — the seam's only termination
   * verb. Idempotent, a no-op once the tree is gone (the pid may be reused),
   * and also triggered by the spec's abort signal.
   */
  terminate(): void
  /**
   * Wait until the process tree has exited — the tree, not just the direct
   * child, so a still-running helper is observable before teardown returns.
   * @param signal - optional bound for the wait.
   * @returns `true` when the tree exited, `false` when the signal aborted first.
   */
  waitForExit(signal?: AbortSignal): Promise<boolean>
}
```

```ts type-equiv
/**
 * Cursor-free incremental access to one collected output stream. Offsets are
 * whole-stream byte coordinates owned by the caller, so independent readers
 * cannot consume one another's output; `readFrom(0)` after settlement is the
 * batch result (`lossy` then means the in-memory tail lost its head — the
 * {@link CollectedOutput.truncated} fact).
 */
interface SubprocessOutputReader {
  /**
   * Read everything captured since `fromByte`. When that offset has slid out
   * of the in-memory tail window the read is `lossy` — it returns the whole
   * retained tail and the gap is only recoverable from the spill file.
   * @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 for the first read).
   * @returns the delta text, the next offset, the `lossy` flag, and the spill path when one exists.
   */
  readFrom(fromByte: number): SubprocessOutputRead
}
```

```ts type-equiv
/** One incremental {@link SubprocessOutputReader.readFrom} read. */
interface SubprocessOutputRead {
  /** Stream text from the requested offset (the whole retained tail when lossy). */
  text: string
  /** Whole-stream offset to resume from on the next read. */
  nextOffset: number
  /** True when the requested offset slid out of the in-memory tail window. */
  lossy: boolean
  /** Path to the full-stream spill file, when one was created and remains intact. */
  spillPath?: string
}
```

```ts type-equiv
/** Offset-based readers for the streams spawned in collect mode. */
interface SubprocessCollectedOutputs {
  /** Present iff stdout is a {@link SubprocessCollect}. */
  readonly stdout?: SubprocessOutputReader
  /** Present iff stderr is a {@link SubprocessCollect}. */
  readonly stderr?: SubprocessOutputReader
}
```

## Итоги несут только факты о выходе

`done` сообщает словарь события `close` из Node и никакой классификации причин — сервис убивает процесс по отмене, но никогда не решает, почему (вызывающий читает принадлежащий ему сигнал дедлайна, например пару `timedOut`/`aborted` исполнителя bash). Собранный вывод остаётся доступным через `handle.collected` и после завершения, поэтому пакетные и потоковые вызывающие пользуются одним путём доступа.

```ts type-equiv
/**
 * Exit facts of one closed process — Node's `close`-event vocabulary.
 * Deliberately carries NO timeout or cancellation classification (the caller
 * reads the signal it owns to classify causes) and NO output: collected
 * streams stay readable through {@link SubprocessHandle.collected} after
 * settlement, so batch and streaming callers share one access path.
 */
interface SubprocessOutcome {
  /** Exit code; null when the process died from a signal. */
  exitCode: number | null
  /** Terminating signal (e.g. 'SIGTERM'); null on normal exit. */
  signal: NodeJS.Signals | null
}
```

## Терминальный процессный примитив

`spawnTerminal(spec)` — непайповый процессный примитив. Провайдер выделяет управляющий терминал и владеет транспортом UTF-8-текста, инспекцией групп процессов переднего плана и отправкой им сигналов, а также одной ожидаемой операцией TERM-to-KILL, доводящей до quiescence (полного завершения всех жизненных циклов) каждого члена сессии, которого провайдер ещё способен наблюдать; провайдеры документируют ограничения наблюдаемости своей подложки. PTY-бэкенд сохраняет ответственность за обнаружение приглашения, инференс готовности, scrollback, политику песочницы и владение персистентной сессией; обычный `spawn()` не может воспроизвести семантику управляющего терминала.

Спецификация терминала полностью задаёт argv, cwd, переопределения среды, размеры, льготный период очистки и необязательную отмену выделения. Её дескриптор предоставляет `pid`, упорядоченный вывод, `done`, `write`, `inspectForeground`, `signalForeground` и ожидаемый `terminate`; точные публичные формы генерируются в [каталог сервиса `ctx.subprocess`](#ctxsubprocess--subprocessruntime-abstract-seam).

## Поведение сервиса

Абстрактная Service Definition [`SubprocessRuntime`](../../packages/subprocess/subprocess/src/index.ts) задаёт координаты мира исполнения, поиск исполняемых файлов, обычный `spawn` и `spawnTerminal`. [`LocalSubprocessRuntime`](../../packages/subprocess/subprocess-local/src/index.ts) реализует их с отсоединёнными деревьями процессов, разводкой по каждой диспозиции, очисткой учётных данных, `node-pty`, платформенной инспекцией процессов и освобождением ресурсов в стиле terminate-and-join. Контракт Service Definition описан в [`dsh-subprocess`](../../packages/subprocess/subprocess/README.md), локальная механика — в [`dsh-subprocess-local`](../../packages/subprocess/subprocess-local/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxe2b--e2bruntime"></a>

### `ctx.e2b` — `E2BRuntime`

Создаёт один лениво потребляемый дескриптор E2B SDK и удаляет песочницу по таймауту или при удалении. Создание начинается при конструировании плагина; адаптеры ожидают `getSandbox` перед первой операцией.

```ts cordis-catalog
/**
 * Return the shared live SDK handle.
 * @returns the created sandbox after the configured cwd exists.
 * @throws when E2B rejects creation or the service is disposing.
 */
async getSandbox(): Promise<Sandbox>
```

Source: [`packages/e2b/e2b/src/index.ts`](../../packages/e2b/e2b/src/index.ts)

<a id="ctxsubprocess--subprocessruntime-abstract-seam"></a>

### `ctx.subprocess` — `SubprocessRuntime` (abstract seam)

Abstract subprocess service. Subclass, implement spawn, and load the subclass as a plugin — it registers as `ctx.subprocess` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Реализации обязаны соблюдать эту семантику:

- Executable paths belong to one execution world shared with the mounted filesystem provider.
- spawn returns immediately with a live handle; `done` resolves at process close with exit facts and rejects only for spawn-level failures.
- Collect-mode readers are offset-based and non-consuming, so independent readers never consume one another's output; lossy reads report truncation and the spill file holding the complete stream when one exists. Piped streams are handed to the caller raw and never buffered here.
- SubprocessHandle.terminate (and the spec's abort signal) escalates SIGTERM→grace→SIGKILL — the only termination verb — tree-scoped on every platform. SubprocessHandle.waitForExit observes whole-tree liveness, so a consumer-owned teardown ladder can hold each tier on real quiescence.
- Disposal of the service terminates all still-running managed processes and awaits their exit.
- spawnTerminal owns terminal allocation, text transport, foreground groups, signalling, and whole-session quiescence behind one awaited termination method; readiness and persistent-shell policy stay in the PTY consumer. Its output stream ends after queued terminal output when the top-level process exits.

```ts cordis-catalog
/**
 * Resolve one configured executable in this provider's execution world.
 * Absolute paths are verified; bare names use the provider's scrubbed PATH
 * plus explicit environment overrides. Relative paths containing separators
 * are rejected: the resolution base is undefined, so providers fail loud
 * instead of guessing.
 * @param command - absolute executable path or bare PATH name.
 * @param env - explicit environment entries used for lookup.
 * @param signal - aborts remote or local lookup.
 * @returns a canonical executable path.
 */
abstract resolveExecutable( command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal, ): Promise<string>

/**
 * Start one managed child process from a fully-specified spec; this seam
 * applies no defaults.
 * @param spec - argv, directory, stdio dispositions, grace, cancellation, and environment.
 * @returns the live process handle (streams/readers, signalling, outcome promise).
 */
abstract spawn(spec: SubprocessSpawnSpec): SubprocessHandle

/**
 * Allocate a real terminal and start one owned process session. This is the
 * only non-pipe process primitive: implementations own terminal byte I/O,
 * foreground groups, signals, and complete session-tree cleanup.
 * @param spec - fully specified argv, cwd, environment, dimensions, grace, and allocation cancellation.
 * @returns the live terminal handle after allocation succeeds.
 */
abstract spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle>
```

Source: [`packages/subprocess/subprocess/src/index.ts`](../../packages/subprocess/subprocess/src/index.ts)
<!-- END GENERATED cordis-surface -->

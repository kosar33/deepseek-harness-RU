# Исполнитель Bash

[English](shell.md) | [中文](shell.zh.md) | Русский

Seam исполнения bash состоит из Service Definition ([dsh-shell](../../packages/shell/shell), `ctx.shell`), Service Provider ([dsh-bash-local](../../packages/shell/bash-local) и [dsh-bash-sandbox](../../packages/shell/bash-sandbox)) и Consumer ([dsh-tool-bash](../../packages/shell/tool-bash), схема `bash`). Универсальные идентификаторы, владение и управление фоновыми задачами живут в [jobs.md](jobs.md); этот seam возвращает дескриптор процесса без какой-либо задачи. Механика групп процессов в сыром виде находится за [seam'ом дочерних процессов](subprocess.ru.md).

Источник: [`packages/shell/shell/src/types.ts`](../../packages/shell/shell/src/types.ts)

## Управляемое пространство имён окружения shell

Переменные `DSH_*` — факты дочерних процессов, находящиеся во владении Harness. Модельно-ориентированный bash-инструмент собирает их через `ctx.shellEnv` и передаёт через `ShellExecRequest.dshEnv`; сервис дочерних процессов удаляет унаследованные имена `DSH_*` перед слиянием текущего снепшота. Словарь `DshEnvironmentKey`/`DshEnvironment` принадлежит [seam'у дочерних процессов](subprocess.ru.md) и реэкспортируется `dsh-shell`.

## Request против spec: разделение через `resolve()`

Seam отделяет **запрос, обращённый к модели/плагину** (опциональные `workdir`/`timeoutMs`/`stdoutMaxBytes`, заполняемые из конфигурации или политики запроса), от **полностью разрешённого spec**, с которым работает исполнитель (эти поля обязательны). Между ними работает слой инструментов, вызывая `ctx.shell.resolve(request)` (правило репозитория «явное > неявное на границах пакетов»); разрешённые значения несёт `ShellExecSpec`.

```ts type-equiv
/**
 * A caller's execution REQUEST: `workdir` and `timeoutMs` are optional and
 * filled by {@link ShellExecutor.resolve} from the implementation's config.
 * This is the model-/plugin-facing shape; pass it to `resolve()` to obtain a
 * fully-resolved {@link ShellExecSpec}.
 */
interface ShellExecRequest {
  command: string
  /** Working directory override (default: implementation-configured). */
  workdir?: string | undefined
  /** Timeout override in milliseconds (implementations cap it). */
  timeoutMs?: number | undefined
  /**
   * Foreground stdout capture budget in bytes. Absent uses the executor's
   * default output cap. Trusted in-process consumers use this when they must
   * parse complete stdout up to their own bounded limit; the model-facing bash
   * tool does not expose it as a parameter.
   */
  stdoutMaxBytes?: number | undefined
  /** Abort signal — implementations kill the command when it fires. */
  signal?: AbortSignal | undefined
  /**
   * Bytes to write to the command's stdin, then close it. Absent leaves stdin
   * closed/empty (the default for model-driven tool calls). Set by in-process
   * plugins (e.g. the hooks bridges, which write a hook command's JSON payload
   * to its stdin); the model-facing bash tool does not expose it as a parameter
   * (a model that needs stdin uses shell syntax like a heredoc or a pipe).
   */
  stdin?: string | undefined
  /**
   * Ordinary environment entries for the command, merged after the credential
   * scrub. Managed facts belong in {@link dshEnv}, which merges after this
   * map, so an entry here can never displace one. Set by in-process plugins
   * (the hooks bridges set `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, …); the
   * model-facing bash tool does not expose it as a parameter.
   */
  env?: Record<string, string> | undefined
  /**
   * Harness-owned `DSH_*` variables for this execution (typed to managed
   * keys). Executors discard ambient `DSH_*` entries before merging this
   * snapshot last, so an unavailable current fact cannot inherit a stale
   * value from the harness process and a caller {@link env} entry cannot
   * displace a managed one.
   */
  dshEnv?: DshEnvironment | undefined
  /** Fully resolved per-call sandbox policy; sandboxing executors default it. */
  sandboxPolicy?: SandboxExecutionPolicy | undefined
}
```

```ts type-equiv
/**
 * A resolved execution spec. {@link ShellExecutor.resolve} fills and caps the
 * required fields; {@link ShellExecutor.start} ignores `timeoutMs` because
 * background processes have no executor timeout.
 */
interface ShellExecSpec {
  command: string
  workdir: string
  timeoutMs: number
  /**
   * Resolved foreground stdout capture budget in bytes. `run()` uses it for
   * stdout; background jobs and stderr keep the executor's own output cap.
   */
  stdoutMaxBytes: number
  /** Abort signal — implementations kill the command when it fires. */
  signal?: AbortSignal | undefined
  /** Bytes to write to stdin before closing it; absent means no stdin. */
  stdin?: string | undefined
  /**
   * Ordinary environment entries carried through from
   * {@link ShellExecRequest.env}; {@link dshEnv} still merges after them.
   * OPTIONAL on the spec for the same reason as `stdin`: absent means no
   * ordinary extra environment.
   */
  env?: Record<string, string> | undefined
  /** Managed `DSH_*` snapshot (typed to managed keys); merges after {@link env}. */
  dshEnv?: DshEnvironment | undefined
  /** Resolved sandbox policy; ignored by executors that do not confine. */
  sandboxPolicy: SandboxExecutionPolicy | undefined
}
```

`stdin` и `env` — доверенные входы внутрипроцессных плагинов, и `dsh-tool-bash` их не выставляет. Локальный исполнитель вычищает учётные данные из унаследованного окружения, прежде чем слить явно заданный вызывающей стороной env. См. [Agent Note о bash-stdin-env](../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-api.md).

`stdoutMaxBytes` тоже доступен только доверенным плагинам. Он позволяет потребителю на переднем плане запросить полный stdout в пределах ограниченного бюджета парсера, не меняя stderr, фоновые задачи и обычный лимит вывода модельно-ориентированного bash-инструмента.

## Прогоны на переднем плане: `ShellRunResult`

Исход одного завершившегося (или убитого) запуска на переднем плане. Ортогональные исходы сообщаются **независимо** — процесс может одновременно и упереться в таймаут, И выйти с кодом 0, перехватив сигнал, — поэтому `timedOut`, `aborted`, `signal` и `exitCode` являются отдельными полями; вызывающий никогда не примет обрезанный запуск за чистый успех.

```ts type-equiv
/** The outcome of one completed (or killed) foreground run. */
interface ShellRunResult {
  /** Exit code; null when the process died from a signal. */
  exitCode: number | null
  /** Terminating signal (e.g. 'SIGTERM'); null on normal exit. */
  signal: NodeJS.Signals | null
  /**
   * True when the executor's own timeout was the FIRST cause to cut the command
   * short. Mutually exclusive with {@link aborted}: one fused deadline drives
   * both the timeout and the caller's cancellation, so a timeout and an abort
   * racing before process close report the single first-abort cause, not both
   * (see the [timeout-library Agent Note](../../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md)).
   */
  timedOut: boolean
  /**
   * True when the caller's `AbortSignal` was the FIRST cause to kill the command
   * (and it was not the executor's own timeout). Mutually exclusive with
   * {@link timedOut} — see there for the first-cause classification.
   */
  aborted: boolean
  /** The effective timeout applied to this run (after defaulting/capping). */
  timeoutMs: number
  stdout: CollectedOutput
  stderr: CollectedOutput
  /** Sandbox execution facts, absent for an unsandboxed executor. */
  sandbox?: ShellSandboxInfo
}
```

Каждый поток — это `CollectedOutput`: текст (возможно усечённый) плюс сведения для восстановления; при усечении `text` содержит **хвост**, а полный поток выгружается в приватный spill-файл. Этими полями владеет [seam дочерних процессов](subprocess.ru.md), а `dsh-shell` их реэкспортирует.

## Файловая песочница: `ShellSandboxInfo`

Исполнитель, потребляющий песочницу, выставляет настроенный резервный режим через `ShellExecutor.sandboxMode`. Слой инструментов поручает [`@deepseek-ai/dsh-sandbox-policy`](../../packages/sandbox/sandbox-policy/README.md) превратить долговечную переопределяющую настройку `sandbox/mode` каждой вызывающей сессии и неизменяемый cwd в `ShellExecRequest.sandboxPolicy`; одобренный пользователем строго более широкий вызов заменяет только режим. Словарь режим/корень/enforcement принадлежит [seam'у песочницы `@deepseek-ai/dsh-sandbox`](sandbox.md); режимы управляют только файловыми эффектами.

Изолированный запуск сообщает свой режим, консервативную классификацию отказа и полноту enforcement'а. `runnerFailed` отмечает сбой раннера песочницы до запуска команды; выполнение на переднем плане бросает `SANDBOX_UNAVAILABLE`, а завершившийся фоновый процесс располагает лишь каналом фактов.

```ts type-equiv
/**
 * Sandbox facts for one run, present iff a sandboxing executor handled it.
 * Facts are reported independently of process exit status so callers can
 * distinguish command failures from policy denials and runner failures.
 */
interface ShellSandboxInfo {
  /** The mode the command actually ran under. */
  mode: SandboxMode
  /** Whether the sandbox denied a file operation. */
  denied: boolean
  /** How completely the selected runner enforced the requested mode. */
  enforcement?: SandboxEnforcement
  /** Whether the sandbox runner failed before the command could run. */
  runnerFailed?: boolean
}
```

Код ошибки `SANDBOX_UNAVAILABLE` (принадлежит [seam'у песочницы](sandbox.md)) — то, что бросает провайдер `ctx.sandbox` и что прокидывает исполнитель, когда у ограничивающего режима нет пригодного бэкенда. Выбранный раннер, отвергающий свой профиль, приводит к той же fail-closed ошибке на переднем плане; завершившаяся фоновая задача записывает `runnerFailed`. Модель получает факты об отказах и раннере в результатах, узнаёт эффективный режим, только когда маркер отказа его называет, и может запросить однократный строго более широкий повтор через `sandbox_permissions` плюс `justification`; прежде чем что-либо исполнится, `ctx.approval` ДОЛЖЕН подтвердить именно этот вызов. Полная политика и дизайн переключения — в [Agent Note о песочнице](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md).

## Фоновые процессы: `ShellProcess`

`start()` возвращает дескриптор без идентификатора и владельца. `dsh-tool-bash` адаптирует его в хуки `ctx.jobs.start()`; далее универсальный рантайм владеет идентичностью задачи и её жизненным циклом. `done` разрешается при закрытии процесса и никогда не отклоняется, чтения остаются валидными после завершения, а факты песочницы штампуются до разрешения `done`.

```ts type-equiv
/**
 * A background process handle returned by {@link ShellExecutor.start}. It is the
 * only access path; buffered output remains readable after exit. Composition
 * teardown (the subprocess service's disposal) kills running processes and
 * awaits {@link done}; an executor-only reload leaves them running.
 */
interface ShellProcess {
  /** Process lifecycle state (settled exactly once). */
  status: ShellProcessStatus
  /** Exit code once finished (null = killed by signal / still running). */
  exitCode: number | null
  /** Terminating signal name, when signal-killed. */
  signal: NodeJS.Signals | null
  /** Resolves when the underlying process closes (never rejects — a spawn failure settles as `killed` with the error on stderr). */
  readonly done: Promise<void>
  /** Sandbox facts, stamped once a confined process settles. */
  sandbox?: ShellSandboxInfo
  /**
   * Read output produced since the previous read (consuming — consecutive
   * reads never re-deliver). Reads that lost data flag `lossy` and point at
   * full-stream spill files when available.
   */
  readOutput(): ShellProcessRead
  /**
   * Kill the process group. Returns false when it had already finished
   * (no-op); idempotent.
   */
  kill(): boolean
}
```

`readOutput()` возвращает инкрементальную дельту и факты восстановления через spill:

```ts type-equiv
/** One incremental {@link ShellProcess.readOutput} read. */
interface ShellProcessRead {
  /** Output produced since the previous read (stderr in a marked section). */
  delta: string
  /** True when truncation dropped unread bytes the delta cannot include. */
  lossy: boolean
  /** Full stdout spill file, when stdout truncation occurred and a safe path is available. */
  stdoutSpillPath?: string
  /** Full stderr spill file, when stderr truncation occurred and a safe path is available. */
  stderrSpillPath?: string
}
```

## Сервис

`ShellExecutor` владеет `resolve`, прогоном на переднем плане `run`, фоновым `start` и фактом возможности `sandboxMode`. `dsh-bash-local` владеет значениями команд по умолчанию, классификацией таймаут/отмена, терминальным окружением и слиянием фоновых чтений; группы процессов, ограниченные коллекторы, spill-файлы, вычистку учётных данных и quiescence (полное завершение всех жизненных циклов) при освобождении ресурсов держит [сервис дочерних процессов](subprocess.ru.md). `dsh-tool-bash` владеет модельно-ориентированным рендерингом и адаптирует фоновые дескрипторы в [универсальный рантайм задач](jobs.md). `dsh-shell` владеет разделяемым контрактом статуса выхода инструментов shell: экспортируемые `parseExitStatus`/`ParsedExitStatus` обращают маркеры `[exit code: N]` / `[killed by signal: X]`, которые дописывают `renderResult` у `dsh-tool-bash` и `renderPwshResult` у `dsh-tool-pwsh`, а `presentResult` обоих инструментов использует их, чтобы разбить отрендеренный текст на тело вывода терминальной карточки и её пилюлю статуса выхода.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxshell--shellexecutor-abstract-seam"></a>

### `ctx.shell` — `ShellExecutor` (abstract seam)

Abstract bash execution service. Subclass, implement the abstract methods, and load the subclass as a plugin — it registers as `ctx.shell` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Реализации обязаны соблюдать эту семантику:

- run rejects only for infrastructure failures. Nonzero exits, timeout kills, and abort kills resolve with a ShellRunResult.
- start returns immediately; no timeout applies to background processes. `done` settles at process close and never rejects; spawn failures settle as `killed` with the error on stderr.
- ShellProcess.readOutput is incremental: consecutive reads never repeat output. Lossy reads report truncation and available spill files.
- A still-running background process is stopped and awaited when its owning composition tears down. With the subprocess seam that boundary is `ctx.subprocess` disposal, so a background process survives an executor-only reload.

```ts cordis-catalog
/**
 * Apply implementation-owned defaults and caps to a request before execution.
 * @param request - the caller's request; omitted fields get this
 *   implementation's defaults, capped fields are clamped.
 * @returns the fully-specified spec to hand to {@link run}/{@link start}.
 */
abstract resolve(request: ShellExecRequest): ShellExecSpec

/**
 * Run a command in the foreground; resolves when it finishes.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the outcome; nonzero exits, timeout kills, and abort kills
 *   resolve with a descriptive result rather than reject.
 */
abstract run(spec: ShellExecSpec): Promise<ShellRunResult>

/**
 * Start a background process and return its handle immediately.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the live process handle (reads, kill, quiescence promise).
 */
abstract start(spec: ShellExecSpec): ShellProcess
```

Source: [`packages/shell/shell/src/index.ts`](../../packages/shell/shell/src/index.ts)

<a id="ctxshellenv--shellenvregistry"></a>

### `ctx.shellEnv` — `ShellEnvRegistry`

Registry (`ctx.shellEnv`) for trusted, per-execution `DSH_*` variables. The namespace is rebuilt for every model shell call: ambient `DSH_*` values are discarded by the executor, then the registry's current snapshot is injected. Built-in shell facts remain owned by the registry itself while plugins can register additional, enumerable facts with effect-scoped disposal.

```ts cordis-catalog
/**
 * Register one environment contributor. Names and keys are unique; built-in
 * keys are reserved. Registration is disposed with the calling plugin fiber.
 * @param contributor - declared key ownership and per-execution resolver.
 * @returns the disposer that unregisters the contribution.
 */
register(contributor: BashEnvContributor): () => void

/**
 * Build the trusted `DSH_*` snapshot for one shell tool execution.
 * @param execution - the current tool execution.
 * @returns an immutable environment overlay containing built-ins and current contributions.
 */
collect(execution: ToolExecution): DshEnvironment

/**
 * Enumerate plugin-contributed variables without executing their resolvers.
 * @returns declarations sorted by environment variable name.
 */
list(): BashEnvVariableInfo[]
```

Types: [DshEnvironment](subprocess.md) · [ToolExecution](tools.md)

Source: [`packages/shell/shell-env/src/index.ts`](../../packages/shell/shell-env/src/index.ts)
<!-- END GENERATED cordis-surface -->

# Песочница процессов

[English](sandbox.md) | [中文](sandbox.zh.md) | Русский

Capability seam песочницы процессов в [dsh-sandbox](../../packages/sandbox/sandbox) оборачивает argv same-world subprocess (дочернего процесса, разделяющего с хостом файловую систему и ядро) в политику файловых эффектов, не привязывая потребителей к платформенному раннеру. [dsh-sandbox-local](../../packages/sandbox/sandbox-local) предоставляет бэкенды bwrap/Landlock для Linux, Seatbelt для macOS и Windows ACL на ограниченном токене; его потребляют [dsh-bash-sandbox](../../packages/shell/bash-sandbox) и [dsh-pwsh-sandbox](../../packages/shell/pwsh-sandbox). Контейнеры, microVM и удалённое исполнение — самостоятельные реализации целых capability seam, а не провайдеры `ctx.sandbox`.

Источник: [`packages/sandbox/sandbox/src/index.ts`](../../packages/sandbox/sandbox/src/index.ts)

## Режимы и исполнение

`SandboxMode` управляет только файловыми эффектами. Режим `read-only` требует от бэкенда запрещать запись — POSIX-раннеры дополнительно предоставляют сток `/dev/null`, который нужен их оболочкам, а раннер Windows ACL не выдаёт явного корня с правом записи и сообщает о частичном исполнении из-за неявных пробелов в своих ACL; режим `workspace-write` разрешает запись под корнем рабочей области и в обещанной бэкендом временной области; режим `danger-full-access` обходит изоляцию. Сеть и видимость процессов остаются за рамками этого перечня.

```ts type-equiv
/**
 * File-effect policy for confined processes. `read-only` permits only required
 * sinks such as `/dev/null`; `workspace-write` also permits the workspace and a
 * backend-defined temp area; `danger-full-access` bypasses confinement. Network
 * and process visibility are outside this vocabulary.
 */
type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
```

Провайдеру отправляются только первые два режима. Потребитель в режиме `danger-full-access` запускает свой исходный argv и не обращается к `ctx.sandbox`.

```ts type-equiv
/** A confining (non-`danger-full-access`) mode — the modes a {@link SandboxPolicy} can carry. */
type ConfinedSandboxMode = Exclude<SandboxMode, 'danger-full-access'>
```

Исполнение — сообщаемый факт. Значение `full` означает, что бэкенд управляет каждым файловым эффектом, обещанным этим режимом; значение `partial` — что активный бэкенд или более старый ABI ядра управляет лишь подмножеством, поэтому потребители, которым нужна абсолютная гарантия, должны отклонять такой выбор или показывать это различие. Старые ABI Landlock и границы Everyone/hard-link у раннера Windows ACL — нынешние случаи `partial`.

```ts type-equiv
/**
 * Enforcement completeness for this host. `partial` means an active backend or
 * older kernel ABI cannot govern every promised file effect; callers requiring
 * an absolute boundary must not treat it as `full`.
 */
type SandboxEnforcement = 'full' | 'partial'
```

## Политика на вызов

Полная политика исполнения вычисляется и передаётся при каждом вызове возможности. В неё включён и `danger-full-access`, чтобы потребитель мог один раз вычислить политику до того, как решит, обходить ли изоляцию. Обычные вызовы инструментов выводят `workspaceRoot` из неизменяемого cwd вызывающей сессии; конфигурация развёртывания служит запасным вариантом для вызовов без агента. Корень канонизируется с семантикой файловой системы до лексической нормализации, поэтому cwd вида `symlink/..` указывает на каталог, в котором запущенный процесс действительно работает.

```ts type-equiv
/**
 * The complete file-effect policy resolved for one capability call. The root
 * is carried even under modes that do not consume it so callers can resolve
 * policy once before choosing the enforcement path.
 */
interface SandboxExecutionPolicy {
  /** The file-effect mode this execution runs under. */
  mode: SandboxMode
  /** Absolute root directory `workspace-write` may write under. */
  workspaceRoot: string
  /**
   * Opaque identity of the calling session (the branded `dsh-session`
   * SessionId). Backends key per-session state off it (e.g. windows-acl gives
   * each live session/workspace pair a random private temp directory and SID,
   * while the workspace SID and standing grant remain per-workspace); absent
   * for agentless calls, which fall back to per-call backend state.
   */
  sessionId?: SessionId
}
```

`ctx.sandboxPolicy.resolve()` принимает активную сессию, а для одобренной повторной попытки — ещё и явный режим. Приоритеты и подстановку запасного корня держит при себе сервис, чтобы bash и fs не дублировали эту логику.

```ts type-equiv
/** Inputs that select the sandbox policy for one capability call. */
interface SandboxPolicyRequest {
  /** Calling session; its immutable cwd becomes the workspace boundary. */
  session?: Session
  /** Explicit approved mode override, which outranks session policy. */
  mode?: SandboxMode
}
```

До `ctx.sandbox` доходит только ограниченное (confined) исполнение; политика провайдера для него сужает режим, сохраняя тот же корень. Благодаря этому параллельные сессии, потребители и одноразовые эскалированные повторные попытки могут запрашивать у одного провайдера разные границы, не изменяя его состояние.

```ts type-equiv
/**
 * What one confined execution is allowed to touch — carried PER CALL, not
 * fixed on the provider: two consumers may confine under different policies
 * at the same instant (bash under `read-only` while a confined child agent
 * needs its state directory writable), and an approved escalated retry is a
 * new call with a wider policy. Defaulting/resolution is an explicit step at
 * the consumer boundary; the provider treats the policy as fully specified.
 */
interface SandboxPolicy extends SandboxExecutionPolicy {
  /** The file-effect mode this execution runs under. */
  mode: ConfinedSandboxMode
}
```

## Обёрнутый argv и диалекты классификации

`RunnerFailureRule` объединяет свидетельства того, что раннер потерпел неудачу ещё до выполнения команды. Потребитель требует ненулевого кода выхода, необязательного гейта допустимых кодов выхода и регистронезависимого совпадения с фатальной сигнатурой в одной из оставшихся строк stderr. Сначала удаляются информационные строки — точным сравнением всей строки без учёта регистра, поэтому безобидное уведомление раннера само по себе не может доказать неудачу. Совпавшая строка остаётся доступной как деталь ошибки; классификация не переписывает stderr.

```ts type-equiv
/**
 * Evidence that identifies a sandbox runner failing before it executes the
 * wrapped command. A consumer first applies {@link allowedExitCodes} when
 * present, removes {@link informationalLines} by case-insensitive exact line
 * equality, then matches {@link fatalSignatures} case-insensitively within
 * each remaining stderr line. Exit status alone never proves runner failure.
 */
interface RunnerFailureRule {
  /** Nonzero process exit codes on which this rule may match; omitted permits any nonzero exit. */
  allowedExitCodes?: readonly number[]
  /** Non-empty substrings identifying a fatal runner diagnostic on one stderr line. */
  fatalSignatures: readonly string[]
  /** Benign stderr lines excluded by exact full-line equality before fatal matching. */
  informationalLines?: readonly string[]
}
```

`ConfinedArgv` — то, что запускает потребитель. Помимо замещающего argv он несёт сообщённый бэкендом факт об исполнении и два ортогональных классификатора stderr. `denialSignatures` опознают блокировку ограниченной команды при исправно работающей песочнице. `runnerFailureRules` опознают отказ или сбой раннера песочницы ещё до выполнения им команды; потребители проверяют их первыми и сообщают о сбое инфраструктуры песочницы, но никогда — об обычном сбое задачи.

```ts type-equiv
/**
 * A {@link SandboxProvider.confine} result: the argv to spawn in place of
 * the caller's own, plus the enforcement completeness the selected backend
 * achieves for it.
 */
interface ConfinedArgv {
  /** The wrapped argv (runner, profile, separator, then the caller's argv). */
  argv: string[]
  /** How completely the selected backend enforces the policy's file effects. */
  enforcement: SandboxEnforcement
  /**
   * The selected backend's denial DIALECT: the case-insensitive stderr
   * substrings a file effect denied by THIS backend produces (EROFS text
   * under bwrap's read-only binds, EACCES under Landlock, EPERM under
   * Seatbelt). A consumer that infers denials from a failed run's stderr
   * matches against exactly these rather than a cross-backend union — the
   * union claims denials a given backend never produces.
   */
  denialSignatures: readonly string[]
  /**
   * Structured runner-failure evidence rules. Consumers require a matching
   * fatal stderr line (after informational exclusions) and any rule-specific
   * exit-code gate before checking denial signatures: runner failure means the
   * command never ran, while denial means confinement worked and blocked it.
   */
  runnerFailureRules: readonly RunnerFailureRule[]
}
```

[Локальный провайдер](../../packages/sandbox/sandbox-local/README.md) владеет операторской конфигурацией и отображает диалект своего раннера в эти правила. [Потребитель bash под песочницей](../../packages/shell/bash-sandbox/README.md) владеет запуском и атрибуцией результата.

## Провайдер и ошибки fail-closed

`ctx.sandbox.confine(argv, policy)` возвращает `ConfinedArgv` либо бросает `SandboxUnavailableError` с кодом `SANDBOX_UNAVAILABLE`, когда пригодного бэкенда нет. Потребитель может также классифицировать сбой при запуске или наблюдении возвращённого argv; эта атрибуция относится к контракту потребителя. Тихий неограниченный пропуск никогда не допустим при ограниченной политике.

Выбор провайдера, проверку работоспособности, кеширование и зависящие от конкретного бэкенда отчёты об исполнении держит при себе [локальный провайдер](../../packages/sandbox/sandbox-local/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsandbox--sandboxprovider-abstract-seam"></a>

### `ctx.sandbox` — `SandboxProvider` (abstract seam)

Abstract process-sandbox service. confine must return enforcing argv or fail closed at wrap or runner-execution time; silent unconfined passthrough is forbidden. Functional probes arbitrate multi-runner chains and may be skipped for a sole candidate, whose own refusal remains the fail-closed end.

```ts cordis-catalog
/**
 * Wrap `argv` so it executes confined under `policy` on this host; the
 * caller spawns the returned argv in place of its own.
 * @param argv - the exact argv the caller is about to spawn (program plus
 *   arguments), NOT a shell string — a shell-shaped consumer passes
 *   `['bash', '-c', command]`.
 * @param policy - the file-effect policy this execution runs under,
 *   carried per call (see {@link SandboxPolicy}).
 * @returns the argv to spawn instead, plus the enforcement completeness
 *   the selected backend achieves for it.
 */
abstract confine(argv: readonly string[], policy: SandboxPolicy): ConfinedArgv
```

Source: [`packages/sandbox/sandbox/src/index.ts`](../../packages/sandbox/sandbox/src/index.ts)

<a id="ctxsandboxpolicy--sandboxpolicyservice"></a>

### `ctx.sandboxPolicy` — `SandboxPolicyService`

The sandbox-policy service (`ctx.sandboxPolicy`). Owns the deployment default mode, fallback workspace root, and current request-time policy section. Tool layers call resolve for each execution so a session's mode log and immutable cwd travel together to every enforcing capability.

```ts cordis-catalog
/**
 * Resolve the complete policy for one capability call. An approved explicit
 * mode outranks the session's last `sandbox/mode` event, which outranks the
 * deployment default. A session cwd is its workspace-write boundary; the
 * configured root is the fallback for agentless calls and sessions without a
 * cwd.
 * @param request - optional session and approved mode override.
 * @returns the fully resolved per-call mode and absolute workspace root.
 */
resolve(request: SandboxPolicyRequest = {}): SandboxExecutionPolicy

/**
 * Read the session override without applying the deployment default.
 * @param session - session whose log supplies the override.
 * @returns the last logged mode, or `undefined` without one.
 */
overrideOf(session: Session): SandboxMode | undefined
```

Types: [Session](session.md)

Source: [`packages/sandbox/sandbox-policy/src/index.ts`](../../packages/sandbox/sandbox-policy/src/index.ts)
<!-- END GENERATED cordis-surface -->

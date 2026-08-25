# Рантайм кода

[English](code-runtime.md) | [中文](code-runtime.zh.md) | Русский

Seam исполнения кода — [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md), чьё Service Definition ([dsh-code-runtime](../../packages/code-runtime/code-runtime), `ctx.codeRuntime`) исполняет одну написанную моделью программу с предоставленными хостом асинхронными биндингами и сообщает, что она напечатала и вернула. Исполнение кода — **одна необязательная возможность**, а не часть стержня agent-loop, поэтому его словарь живёт здесь, а не в [core.ru.md](core.ru.md). Бэкенды различаются субстратом исполнения и исходным языком — оба — readonly-дескрипторы сервиса; Service Provider на worker-потоках и Consumer в реестре инструментов задаются [фундаментом Code Mode](../../.agents/notes/implemented/feature/2026-06-15-code-mode.md) и [контрактом типизированных возвращаемых значений](../../.agents/notes/implemented/feature/2026-07-20-code-mode-typed-tool-returns.md).

Источник: [`packages/code-runtime/code-runtime/src/types.ts`](../../packages/code-runtime/code-runtime/src/types.ts)

## Запуск: запрос на входе, результат на выходе

`CodeRunRequest` несёт **всё, с чем работает рантайм**, — согласно правилу «явное > неявное на границах пакетов», выбор значений по умолчанию (бюджеты времени, лимиты вывода) — это валидируемая конфигурация реализации, а не скрытый `??` внутри `run()`:

```ts type-equiv
/**
 * One run: the program source plus everything the runtime acts on. Per the
 * explicit-over-implicit convention, defaulting (time budgets, output caps)
 * is the implementation's validated config — a request carries no optional
 * tuning knobs for a hidden `??` to fill in.
 */
interface CodeRunRequest {
  /**
   * The program source, in the runtime's {@link ../index.ts | language}. It
   * runs as the body of an async function: top-level `await` and `return`
   * are available, and the completion value becomes
   * {@link CodeRunResult.value}.
   */
  program: string
  /** Host functions exposed to the program, one global object per namespace. */
  bindings: CodeBindingNamespace[]
  /**
   * Abort the run: the runtime stops the program (hard, even mid-loop) and
   * resolves with a {@link CodeRunFailure} of kind `'abort'`. In-flight
   * binding calls are the CALLER's to settle — the runtime only stops asking.
   */
  signal?: AbortSignal
}
```

Результат сообщает об ошибке как **поле**, а не как отклонение `run()` — сообщать о неудавшейся программе — задача вызывающей стороны, а не сценарий для исключений (совпадает с контрактом resolve-on-failure метода `ShellExecutor.run`):

```ts type-equiv
/**
 * The outcome of one run. An error is a FIELD on a resolved result, never a
 * rejection of `run()` — reporting a failed program is the caller's job, not
 * an exception path.
 */
interface CodeRunResult {
  /**
   * The program's completion value (its top-level `return`), when it ran to
   * completion and the value crossed the runtime's lossless-JSON boundary.
   * Invalid or over-limit completions fail the run instead of substituting a
   * rendered string; a failed or value-less run leaves this absent.
   */
  value?: CodeJsonValue
  /** Text the program emitted, in order, bounded only as part of the outer result. */
  logs: string[]
  /** Present iff the run failed; see {@link CodeRunFailure} for the taxonomy. */
  error?: CodeRunFailure
}
```

## Биндинги: хостовые функции как глобальные объекты программы

Каждый `CodeBindingNamespace` становится одним глобальным объектом с асинхронными вызываемыми функциями внутри программы (потребитель Code Mode передаёт один такой объект: `tools`). Аргументы и результаты должны быть lossless JSON и передаваться без байтового лимита на уровне seam; рантайм может переносить их через structured clone. Пространство имён может объявить видимый программе класс ошибок, не требуя от рантайма знания имён потребителя: рантайм инжектирует реальный конструктор и превращает отклонённые вызовы в его экземпляры. Рантайм также трактует имена биндингов как враждебный ввод (`__proto__` — обычное собственное свойство, а не коллизия прототипа):

```ts type-equiv
/**
 * Program-visible typed rejection for one binding namespace. The runtime
 * injects a real error constructor under `name`; rejected member calls become
 * its instances and expose the exact member name through
 * `memberNameProperty`. Both strings are runtime data rather than knowledge
 * of a particular consumer such as Code Mode.
 */
interface CodeBindingErrorClass {
  /** Constructor global and resulting `Error.name`; same portable identifier rule as {@link CodeBindingNamespace.global}. */
  name: string
  /**
   * Non-empty own property for the member name. The portable exclusion set is
   * `RESERVED_ERROR_MEMBERS` plus dunder-form names (`__x__`, non-empty
   * middle), enforced identically by every backend; any other name —
   * identifiers or not — is accepted everywhere.
   */
  memberNameProperty: string
}
```

```ts type-equiv
/**
 * A named group of {@link CodeBindingFunction}s the runtime exposes to the
 * program as one global object (e.g. `tools`). Function names are arbitrary
 * strings — a runtime must treat names like `__proto__` or `constructor` as
 * ordinary own properties (null-prototype construction), never as prototype
 * collisions.
 */
interface CodeBindingNamespace {
  /**
   * The global identifier the program sees. Must match the LANGUAGE-PORTABLE
   * identifier subset `[A-Za-z_][A-Za-z0-9_]*` and no language's reserved
   * words, so the same namespace list works against every backend regardless
   * of `language` — a JS-only spelling like `$tools` is rejected by design,
   * not just by the Python backend. Names that satisfy the identifier rule but
   * name a backend-owned slot (`RESERVED_BINDING_GLOBALS`, e.g. `console`,
   * `__dsh_main__`) are also refused everywhere; see its declaration for the
   * exact set and why each entry is reserved.
   */
  global: string
  /** The callable members, keyed by the exact name the program calls. */
  functions: Record<string, CodeBindingFunction>
  /** Optional program-visible typed rejection contract for this namespace. */
  errorClass?: CodeBindingErrorClass
}
```

```ts type-equiv
/** A lossless JSON value transferable through the dependency-light Service Definition. */
type CodeJsonValue = null | boolean | number | string | CodeJsonValue[] | { [key: string]: CodeJsonValue }
```

```ts type-equiv
/**
 * One host-side function exposed to the program as an async callable. The
 * runtime bridges calls to it (possibly across a serialization boundary), so
 * `args` and the resolution value MUST be lossless JSON. A runtime rejects a
 * lossy or non-cloneable value with a descriptive error rather than corrupting
 * the run. No seam-level byte cap applies to a binding resolution. A rejection
 * of this function surfaces inside the program as a rejection of the
 * corresponding call.
 */
type CodeBindingFunction = (args: unknown) => Promise<CodeJsonValue>
```

## Захваченный вывод и таксономия сбоев

Журналы — простые строки в порядке вывода. Рантайм захватывает консольный и потоковый вывод программы, но метаданные каналов и методов консоли не входят в seam, потому что потребители рендерят только текст. Реализации ограничивают размер сериализованного внешнего массива журналов плюс полезной нагрузки значения завершения или сообщения о сбое; фиксированный синтаксис конверта результата и пробелы в презентации потребителя не входят в этот лимит переменной части полезной нагрузки. Переполнение — явный сбой, а не подмена значения в самом результате.

Виды сбоев — **ортогональные исходы, сообщаемые независимо** (см. [defensive-patterns](../defensive-patterns.ru.md)): истечение бюджета — не исключение, отмена — не таймаут, а гибель субстрата (например, OOM) — ни то ни другое:

```ts type-equiv
/**
 * Why a run failed. The kinds are orthogonal outcomes reported independently
 * (per docs/defensive-patterns.md): a budget expiry is not an exception, an
 * abort is not a timeout, and a substrate death is neither.
 *
 * - `'exception'` — the program threw or failed to parse/transform.
 * - `'timeout'` — an implementation-owned budget expired; the message says which.
 * - `'abort'` — {@link CodeRunRequest.signal} fired.
 * - `'worker-exit'` — the execution substrate died without settling (e.g. OOM).
 * - `'invalid-output'` — the completion value was not lossless JSON.
 * - `'output-limit'` — the serialized outer logs/value/diagnostic exceeded the configured cap.
 */
interface CodeRunFailure {
  /** The failure class (see the interface doc for each kind's meaning). */
  kind: 'exception' | 'timeout' | 'abort' | 'worker-exit' | 'invalid-output' | 'output-limit'
  /** Human-readable detail, suitable for feeding back to a model to self-correct. */
  message: string
}
```

## Сервис

`CodeRuntime` (`ctx.codeRuntime`, абстрактный — определён в [`packages/code-runtime/code-runtime/src/index.ts`](../../packages/code-runtime/code-runtime/src/index.ts)) — это `run(request)` плюс два readonly-дескриптора: `language` (на каком языке должна быть написана программа — `'typescript'` и `'python'` — общеизвестные значения, те, что представляет `dsh-tools`, и только у `'typescript'` есть опубликованный бэкенд; потребитель, генерирующий зависящее от языка представление, переключается по нему и падает с явной ошибкой на значении, которое не может представить) и `isolation` (субстрат исполнения — `'worker-thread'`, `'process'`, `'container'`; диагностическая метка, **не заявление о безопасности**). Реализации обязаны держать запуски изолированными друг от друга (без состояния между запусками) и освобождать ресурсы до quiescence (полного завершения всех жизненных циклов): перед завершением демонтажа выполняющиеся запуски прерываются и дожидаются своего завершения.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcoderuntime--coderuntime-abstract-seam"></a>

### `ctx.codeRuntime` — `CodeRuntime` (abstract seam)

Регистрирует одну реализацию `ctx.codeRuntime`. Сбои программы, бюджета, отмены и субстрата разрешаются в `CodeRunResult`; отклоняется только нарушение контракта Service Definition. Реализации наводят мосты для привязок, пригодных к structured-clone, материализуют каждый объявленный класс отказов namespace, считают программы враждебными равноправными сторонами, изолируют прогоны друг от друга и при удалении завершают идущие прогоны и ожидают их.

```ts cordis-catalog
/**
 * Execute one program against the request's bindings and capture what it
 * emitted. See the class doc for the resolution contract (error is a result
 * field; rejection means Service Definition contract misuse only).
 * @param request - the program, its bindings, and the abort signal; the
 *   request carries everything the runtime acts on, with no hidden defaults.
 * @returns the run's outcome: completion value (when transferable), the
 *   ordered log capture, and the failure (if any).
 */
abstract run(request: CodeRunRequest): Promise<CodeRunResult>
```

Source: [`packages/code-runtime/code-runtime/src/index.ts`](../../packages/code-runtime/code-runtime/src/index.ts)
<!-- END GENERATED cordis-surface -->

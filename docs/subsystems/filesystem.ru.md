# Файловая система

[English](filesystem.md) | [中文](filesystem.zh.md) | Русский

Опциональная возможность файловой системы состоит из четырёх частей: [dsh-fs](../../packages/fs/fs) владеет `ctx.fs` и атомарными текстовыми операциями с опциональными guard'ами, [dsh-fs-local](../../packages/fs/fs-local) реализует локальный диск, [dsh-fs-observation-policy](../../packages/fs/fs-observation-policy) фиксирует наблюдаемые наличие или отсутствие и добавляет правила актуальности через события, а не через сервис, а [dsh-tool-fs](../../packages/fs/tool-fs) непосредственно исполняет обращённые к модели вызовы чтения/записи/правки и рендерит окна. Эта возможность лежит вне стержня agent-loop; альтернативные бэкенды не меняют ни политику, ни схемы инструментов.

Плагин `dsh-fs-observation-policy` опционален. Без него Service Definition `FileSystem`, провайдер и Consumer `dsh-tool-fs` образуют полный, свободный от ограничений seam файловой системы: `write` безусловно создаёт или перезаписывает, а `edit` безусловно заменяет литеральный текст. Плагин политики меняет эти операции, принимая решения в каскадах `fs/*`. Его удаление не ломает инструмент, потому что инструмент вызывает `ctx.fs` и диспетчеризует события, а методов политики не вызывает. От развёртывания, загружающего `dsh-tool-fs`, ожидается загрузка и `dsh-fs-observation-policy`, чтобы поведением по умолчанию стало чтение перед записью/правкой.

Исходники провайдера: [`packages/fs/fs/src/types.ts`](../../packages/fs/fs/src/types.ts) и [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts). Исходники политики: [`packages/fs/fs-observation-policy/src/types.ts`](../../packages/fs/fs-observation-policy/src/types.ts). Исходники рендеринга чтения: [`packages/fs/tool-fs/src/read-render.ts`](../../packages/fs/tool-fs/src/read-render.ts).

## Идентичность цели и метаданные (контракт провайдера)

Каждая операция сначала разрешает переданный пользователем путь в непрозрачную цель бэкенда. Потребители могут показывать `displayPath`, но не должны разбирать `targetKey` (брендированный непрозрачный идентификатор) или считать его локальным абсолютным путём.

Потребители, разделяющие с файловой системой мир исполнения, получают координаты для других возможностей через провайдера, а не интерпретируют эту идентичность сами: `processPath(target)` возвращает канонический абсолютный путь, который способен открыть дочерний процесс, `fileUrl(target)` возвращает его `file:`-URI платформы провайдера, а `contains(parent, child)` проверяет каноническую идентичность либо вхождение потомка.

```ts type-equiv
/**
 * A path resolved by a backend into a stable identity. `resolve()` produces
 * this; every other operation takes it.
 */
interface FsTarget {
  /** Opaque key for stale guards and target lookup. */
  targetKey: FsTargetKey
  /**
   * Path for model/UI-facing output. May be a local absolute path,
   * workspace-relative path, or remote URI depending on the backend.
   */
  displayPath: string
}
```

Токенами версий файлов владеет бэкенд — это токены актуальности, которым должна соответствовать запись/правка. Плагин политики хранит их для проверок устаревания; потребители их не интерпретируют. Оба идентификатора — брендированные непрозрачные строки.

```ts type-equiv
/**
 * Opaque key for stale guards and target lookup. The local backend uses a
 * realpath-like string; a remote backend might use a workspace URI or file id.
 * Consumers MUST NOT parse it or assume it is a local absolute path.
 */
type FsTargetKey = Branded<'FsTargetKey'>
```

```ts type-equiv
/**
 * Opaque file-version token — the freshness token a write/edit guards against.
 * The local backend derives it from high-resolution stat identity and freshness
 * fields; a remote backend might use a revision id. The policy layer records it
 * for stale checks; consumers may display related metadata but MUST NOT
 * interpret this token.
 */
type FsVersion = Branded<'FsVersion'>
```

`stat` возвращает метаданные (никогда не содержимое) либо `undefined`, когда цель отсутствует. Поле `type` позволяет потребителям отвергать каталоги и специальные файлы до чтения, а `size` позволяет текстовым потребителям выбирать между `readText` и `streamText`, не прибегая к пробным отказам. Текстовый потребитель применяет собственный лимит удержания, потребляя `streamText`. Потребители сырых байтов используют `readBytes(target, signal, maxBytes)`; обязательный предел полного содержимого превращает известное или обнаруженное переполнение в отказ `FS_TOO_LARGE` вместо усечения или ничем не ограниченной буферизации.

```ts type-equiv
/**
 * Metadata about a target — what {@link FileSystem.stat} returns. Lets the
 * policy layer reject directories/special files before reading and choose
 * `readText` vs `streamText` from `size` without probing by failure. `version`
 * is the freshness token. `undefined` from `stat` means the target is absent.
 */
interface FsInfo {
  /** Opaque freshness token of the target right now. */
  version: FsVersion
  /** Whether the target is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

`lstat` — примитив метаданных уровня пути, не переходящий по ссылкам. Он принимает путь, а не `FsTarget`, потому что `resolve` намеренно следует символическим ссылкам ради устойчивой идентичности; потребители, которым нужны проверки границы доверия, могут сперва вызвать `lstat` и отвергнуть `symlink` до разрешения.

```ts type-equiv
/**
 * Metadata about a path without following the final path component when it is a
 * symbolic link. Unlike {@link FsInfo}, this path-level probe can report
 * `symlink` so consumers with trust-boundary rules can reject repository-owned
 * links before resolving a target.
 */
interface FsPathInfo {
  /** Opaque freshness token of the path entry right now. */
  version: FsVersion
  /** Whether the path entry is a regular file, directory, symlink, or other. */
  type: 'file' | 'directory' | 'symlink' | 'other'
  /** Byte size of the path entry, when the backend can report it. */
  size?: number
}
```

`listDir` возвращает прямых потомков в устойчивом порядке имён. Каждая запись несёт базовое имя потомка, тип, разрешённую цель и, если бэкенд способен сообщить их недорого, метаданные. Перечислению запрещено читать содержимое файлов, поэтому `size` есть только у обычных файлов, а `version` выводится из метаданных. Битые или исчезнувшие потомки могут возвращаться как `other` без метаданных; ошибка прав доступа либо ввода-вывода бэкенда при перечислении или разрешении метаданных потомков приводит к отказу всего перечисления с `FS_PERMISSION_DENIED` или `FS_IO_ERROR`.

```ts type-equiv
/**
 * One direct child returned by {@link FileSystem.listDir}. Listing returns
 * metadata and resolved targets only; it must not read file contents.
 */
interface FsDirEntry {
  /** Basename of the child inside the listed directory. */
  name: string
  /** Whether the child is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Resolved child target for follow-up operations. */
  target: FsTarget
  /** Opaque freshness token when the backend can report metadata cheaply. */
  version?: FsVersion
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

## Guard'ы записи и правки (контракт провайдера)

И `writeText`, и `editText` принимают guard версии ОПЦИОНАЛЬНО: опустите его — получите безусловную мутацию голого провайдера; передайте — получите защиту. Guard'ом `writeText` служит `FsWriteIntent`: `createIfAbsent` создаёт отсутствующую цель и отвергает существующую с `FS_NOT_OBSERVED`, включая цель, появившуюся уже после первичной проверки провайдера, ведь публикация сама обязана проходить без замены (no-replace); `replaceIfVersion` заменяет, только если цель существует на наблюдавшейся версии, иначе — `FS_STALE_VERSION`. Опущенный `expected` даёт безусловное создание-или-перезапись. Само объединение несёт лишь два защищённых намерения; «без guard'а» выражается пропуском, поэтому запись и правка пользуются одним и тем же опциональным полем `expected`.

```ts type-equiv
/**
 * Guarded write intent. `createIfAbsent` rejects an existing target with
 * `FS_NOT_OBSERVED`; `replaceIfVersion` rejects absence or mismatch with
 * `FS_STALE_VERSION`. Omitting the intent from `writeText` means unconditional
 * create-or-overwrite, not a third union arm.
 */
type FsWriteIntent =
  | { kind: 'createIfAbsent' }
  | { kind: 'replaceIfVersion'; version: FsVersion }
```

```ts type-equiv
/** Outcome of a full-file write. */
interface FsWriteOutcome {
  /** Whether the write created a new file or replaced an existing one. */
  operation: 'create' | 'update'
  /** Opaque version of the file after the write. */
  version: FsVersion
  /**
   * The file's content BEFORE the write, or `null` when the file did not exist
   * (a create) or the backend declined a contextual basis (for example, a
   * binary/non-UTF-8 prior file or either overwrite side reaching its exclusive limit).
   * LF-normalized storage text (the diff basis), never a diff — a consumer
   * computes the result-time contextual diff from `before`/`after` when
   * `before` is present, else falls back to a whole-file diff.
   */
  before: string | null
  /** The file's content AFTER the write, LF-normalized to share `before`'s diff basis. */
  after: string
}
```

`editText` — мутация уровня провайдера, а не собранная в другом месте связка `read` плюс `write`. Под guard'ом она сверяет ожидаемую версию ДО литерального сопоставления (поэтому устаревшая правка сообщает `FS_STALE_VERSION`, а не неудачу сопоставления с более новым содержимым); без guard'а она правит текущее содержимое. В обоих случаях она применяет замену и записывает атомарно — удерживая сопоставление, обработку концов строк, проверку устаревания и атомарную замену внутри одной критической секции мутации, — а отсутствующая цель сообщает `FS_STALE_VERSION` на обоих путях.

```ts type-equiv
/** A literal-replacement edit request. */
interface FsEditRequest {
  /** Literal non-empty text to replace. Must match exactly (after line-ending normalization). */
  oldString: string
  /** Literal replacement text. An empty string deletes the matched text. */
  newString: string
  /** Replace every match instead of requiring exactly one. */
  replaceAll: boolean
}
```

```ts type-equiv
/** Outcome of a literal edit. */
interface FsEditOutcome {
  /** Opaque version of the file after the edit. */
  version: FsVersion
  /**
   * The file's content BEFORE the edit. Raw storage text (LF-normalized by the
   * backend), never a diff — a consumer computes the result-time contextual diff
   * (the applied hunk with context) from `before`/`after`.
   */
  before: string
  /** The file's content AFTER the edit. */
  after: string
}
```

## События политики fs (словарь контракта провайдера)

`dsh-fs` владеет тремя событиями, которые диспетчеризует инструмент и слушает плагин политики, поэтому эмиттер (`dsh-tool-fs`) и слушатель (`dsh-fs-observation-policy`) говорят на общем словаре `dsh-fs`, не порождая зависимости эмиттера от плагина политики. События несут только словарь `dsh-fs` плюс непрозрачного актора `object` — ни обращённых к модели понятий, ни структуры владельца агент/сессия.

`fs/write-intent` и `fs/edit-intent` — **решающие каскады с одним slot'ом**: инструмент диспетчеризует каждый из них с thunk'ом по умолчанию, возвращающим `undefined` (голый провайдер), а слушатель решает всё целиком, не вызывая `next()`. Slot достаётся первому по порядку регистрации — то, что им владеет плагин политики, является соглашением развёртывания, а не принудительно соблюдаемым инвариантом. `fs/observed` — регистрирующее fire-and-forget-событие, несущее `FsObservation`: либо present с версией, либо подтверждённое absent. Оно диспетчеризуется обычным `ctx.emit`; его слушатель ДОЛЖЕН быть синхронным и сводиться к побочным эффектам, потому что инструмент **НЕ** защищает emit — слушатель, бросающий исключение, способен подменить собой ошибку чтения или проявиться как результат `isError` инструмента после уже свершившейся мутации. Точные сигнатуры показывает расположенный ниже сгенерированный [cordis surface](#cordis-surface).

```ts type-equiv
/**
 * One authoritative observation of a target. A present observation carries the
 * version used by guarded replacement; an absent observation authorizes only a
 * guarded create, never an edit.
 */
type FsObservation =
  | { readonly kind: 'present'; readonly version: FsVersion }
  | { readonly kind: 'absent' }
```

## Контекст исполнения (плагин политики)

Плагину политики нужен ровно минимальный контекст исполнения, чтобы вывести владельца состояния наблюдений, сузив тип непрозрачного актора `object`, который несут события `fs/*`. Нужные поля есть у `ToolExecution`, поэтому `dsh-tool-fs` передаёт свой объект исполнения как актора напрямую, не вынуждая `dsh-fs-observation-policy` импортировать пакеты инструмента, агента или сессии.

```ts type-equiv
/**
 * Minimal structural view of a tool execution the policy plugin needs to derive
 * an observed-state owner. `@deepseek-ai/dsh-tools`' `ToolExecution` contains
 * these fields, so the tool passes its `exec` straight through as the opaque
 * `object` actor on the `fs/*` events; this plugin narrows that actor to
 * `FsObservationActor` without importing `dsh-tools`, `dsh-agent`, or `dsh-session`.
 *
 * The owner is `agent.session` when present. It is treated as an opaque object
 * identity (a `WeakMap` key); this package never reads any of its fields.
 */
interface FsObservationActor {
  /** The agent on whose behalf the call runs, when there is one. */
  agent?: {
    /** The session that owns observed-file state, used as an opaque key. */
    session?: object
  }
}
```

## Исход чтения (потребитель / рендеринг чтения)

Текстовое чтение ограничено окном строк, байтовым пределом и лимитами бэкенда. После исчерпания байтового предела сканирование продолжается без удержания новых строк, так что `totalLines` остаётся точным. Результат, который рендерит обращённый к модели инструмент `read`, чисто презентационный; представлений `full`/`partial` нет — авторизация основана на актуальности (инструмент испускает наблюдение `fs/observed` вида present прямо с версией из stat), поэтому любое оконное чтение способно авторизовать последующую запись/правку, пока файл не изменился. Промах по метаданным испускает наблюдение вида absent до того, как инструмент вернёт `FS_NOT_FOUND`, что позволяет последующей записи под guard'ом воссоздать внешне удалённую цель, не авторизуя правку. Оконную нарезку чтения и сборку этого результата выполняет `dsh-tool-fs` — исполнитель, владеющий чтением; плагин политики этого не делает.

```ts type-equiv
/** Outcome of a bounded text read — what {@link formatReadOutput} renders. */
interface FileReadOutcome {
  /** 1-based first line requested. */
  offset: number
  /** Returned lines, already numbered. */
  lines: FileTextLine[]
  /** Exact total line count in the file. */
  totalLines: number
  /** Whether selected output hit the byte cap. */
  truncatedByBytes?: true
}
```

## Состояние наблюдаемых файлов (плагин политики)

Состояние наблюдений — это `WeakMap<owner, Map<targetKey, FsObservation>>` внутри плагина `dsh-fs-observation-policy`. Нет записи в карте — состояние unseen; `{ kind: 'absent' }` — отсутствие подтвердил промах по метаданным при `read` либо при `view`, `str_replace` или `insert` инструмента `str_replace_editor`; `{ kind: 'present', version }` — чтение, запись или правка наблюдали эту версию. Решение о записи отображает unseen и absent в `createIfAbsent`, а present — в `replaceIfVersion`; решение о правке отображает unseen в `FS_NOT_OBSERVED`, absent — в `FS_NOT_FOUND`, а present — в его guard версии. Владелец выводится из актора события (обычно `exec.agent.session`), трактуется как непрозрачный и никогда не читается. Освобождение ресурсов отбрасывает всё (безопасность при HMR), и политика не выполняет файлового ввода-вывода.

## Таксономия ошибок (контракт провайдера)

Отказы файловой системы несут стабильные строки `FsErrorCode` в составе `FsError` (`HarnessError`). Реестр инструментов сохраняет `{ name, code }` в результатах с ошибкой, поэтому слои повтора, разрешений и UI могут выбирать нужную ветку, не разбирая текст.

```ts type-equiv
/**
 * Stable, machine-routable codes for filesystem failures. Carried on
 * {@link FsError}; the tool registry exposes `{ name, code }` on `isError`
 * results so retry/permission/UI layers can branch without parsing messages.
 */
type FsErrorCode =
  | 'FS_NOT_FOUND'
  | 'FS_NOT_DIRECTORY'
  | 'FS_NOT_TEXT'
  | 'FS_NOT_REGULAR_FILE'
  | 'FS_TOO_LARGE'
  | 'FS_PERMISSION_DENIED'
  | 'FS_SANDBOX_DENIED'
  | 'FS_IO_ERROR'
  | 'FS_STALE_VERSION'
  | 'FS_NOT_OBSERVED'
  | 'FS_AMBIGUOUS_EDIT'
  | 'FS_EDIT_NOT_FOUND'
  | 'FS_ABORTED'
```

Перечисление каталогов использует `FS_NOT_DIRECTORY`, `FS_PERMISSION_DENIED` и `FS_IO_ERROR`, чтобы различить существующую цель-не-каталог, отклонённое перечисление и неожиданный отказ ввода-вывода бэкенда. `FS_SANDBOX_DENIED` — отказ уровня ПОЛИТИКИ со стороны бэкенда, принуждающего песочницу (`dsh-fs-sandbox`): режимное ограничение отклонило запись/правку; он отличим от `FS_PERMISSION_DENIED` (отказа со стороны ядра хоста). `FS_NOT_OBSERVED` означает, что у плагина политики нет записи о предшествующем наблюдении для этого владельца (либо `createIfAbsent` наткнулся на существующий файл). `FS_NOT_FOUND` обозначает также правку, отклонённую из-за подтверждённого отсутствия. `FS_STALE_VERSION` означает, что версия бэкенда больше не совпадает с наблюдавшейся (либо сам провайдер получил правку для отсутствующей цели). У авторизации по актуальности нет деления на частичное/полное, поэтому `FS_PARTIAL_OBSERVATION` не существует.

## Файловый ввод-вывод без таймаутов

`read`/`write`/`edit` не принимают **никакого** `timeoutMs`, и контракт провайдера не задаёт дедлайна — в отличие от bash и web (они потребляют [`@deepseek-ai/dsh-timeout`](../../packages/util/timeout/README.md)) и работающих поверх дочерних процессов `glob`/`grep` (чей объявленный `timeoutMs` принудительно применяет `@deepseek-ai/dsh-tool-call-timeout-policy`): те работают поверх процессов, где дедлайн действительно способен убить работу. Локальный syscall в лучшем случае допускает прерывание по возможности (best-effort): таймаут не может заставить выполняющийся `fsync`/`rename` остановиться, так что `timeoutMs` здесь был бы дедлайном, который seam не в силах обеспечить, и неявным умолчанием ровно там, где принцип «явное > неявное» его запрещает. Отмена по-прежнему распространяется через сигнал исполнения инструмента ради прерывания по возможности на границах syscall.

## Сервис и плагин

`FileSystem` (`ctx.fs`, абстрактный) владеет примитивами провайдера: `resolve`, `processPath`, `fileUrl`, `contains`, `stat`, `lstat`, `readText`, `streamText`, `readBytes`, `listDir`, `writeText` и `editText`. `dsh-fs-observation-policy` **не регистрирует сервиса** — это плагин, добавляющий политику через гейт событий `fs/*`: он принимает решения в каскадах намерений записи/правки, исходя из состояния unseen/absent/present, и записывает значения `FsObservation`. Исполнитель — `dsh-tool-fs`: он читает, пишет и правит через `ctx.fs`, диспетчеризует каскады и испускает событие записи. Точные сигнатуры показывает расположенный ниже сгенерированный раздел [`ctx.fs`](#ctxfs--filesystem-abstract-seam).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxfs--filesystem-abstract-seam"></a>

### `ctx.fs` — `FileSystem` (abstract seam)

Abstract filesystem provider. Targets must preserve identity across aliases; reads expose regular UTF-8 text or typed errors, listings are stable and content-free, and mutations are atomic. Optional guards add stale protection without changing the unguarded provider contract.

```ts cordis-catalog
/**
 * Resolve a model/plugin-supplied path into a stable {@link FsTarget}. May perform I/O (a
 * remote/sandboxed backend may need a round-trip to map a path to a stable identity), hence
 * async even though the local backend only normalizes + realpaths.
 *
 * @param path - the path to resolve; relative paths resolve against `opts.cwd`.
 * @param opts - optional cwd override and cancellation signal.
 * @returns the stable target; the same file yields the same `targetKey`.
 */
abstract resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>

/**
 * Return the canonical absolute path a subprocess in this filesystem's
 * execution world can open. The path is deliberately separate from
 * {@link FsTarget.targetKey}: consumers may pass this value to another OS
 * capability, but must continue treating the target key as opaque.
 * @param target - the resolved target whose process path is required.
 * @returns an absolute path in the backend's execution world.
 */
abstract processPath(target: FsTarget): string

/**
 * Return the canonical `file:` URI for a target in this filesystem's
 * execution world. Backends own URI encoding because the host platform may
 * differ from the execution platform.
 * @param target - the resolved target to encode.
 * @returns the target's canonical file URI.
 */
abstract fileUrl(target: FsTarget): string

/**
 * Test canonical containment without exposing or parsing backend target
 * keys. Both targets must come from this provider.
 * @param parent - canonical directory target.
 * @param child - canonical candidate target.
 * @returns true when `child` is `parent` or a descendant of it.
 */
abstract contains(parent: FsTarget, child: FsTarget): boolean

/**
 * Return target metadata, or `undefined` when the target does not exist.
 * @param target - the resolved target to stat.
 * @param signal - aborts the metadata round-trip.
 * @returns metadata only, never content; undefined for an absent target.
 */
abstract stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>

/**
 * Return path metadata without following the final path component when it is a
 * symbolic link. This is intentionally path-shaped, not target-shaped:
 * {@link resolve} follows symlinks to produce the stable identity used by
 * normal reads/writes, while `lstat` lets a consumer reject the path itself
 * before that follow happens.
 *
 * `opts.cwd` follows {@link resolve}'s cwd rules. `undefined` means the path is
 * absent.
 * @param path - the path to inspect; relative paths resolve against `opts.cwd`.
 * @param opts - `cwd` overrides the backend's default base for relative paths.
 * @param signal - aborts the metadata round-trip.
 * @returns metadata only, never content; undefined for an absent path.
 */
abstract lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined>

/**
 * Read the whole regular text file as a single decoded string.
 * @param target - the resolved target to read.
 * @param signal - aborts the read.
 * @returns the full decoded UTF-8 content.
 */
abstract readText(target: FsTarget, signal?: AbortSignal): Promise<string>

/**
 * Stream the whole regular text file as decoded text chunks (same text
 * semantics as {@link readText}, for large files). The backend owns
 * cross-chunk UTF-8 decoding and binary rejection so the policy layer never
 * touches raw bytes.
 * @param target - the resolved target to read.
 * @param signal - aborts the stream, including between chunks.
 * @returns the chunk iterable, decoded and validated like {@link readText}.
 */
abstract streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>

/**
 * Read the whole regular file as raw bytes with no decoding or binary
 * rejection. The bound lives at this seam so a backend can never buffer an
 * unbounded file: a target known or discovered to exceed `maxBytes` fails
 * with `FS_TOO_LARGE` instead of returning a truncated result.
 * @param target - the resolved target to read.
 * @param signal - aborts the read.
 * @param maxBytes - inclusive byte cap on the complete content.
 * @returns the full raw content, at most `maxBytes` long.
 */
abstract readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>

/**
 * List direct children of a directory in stable name order. Returns resolved
 * child targets plus cheap metadata only; never reads file contents.
 * @param target - the resolved directory target.
 * @param signal - aborts the listing.
 * @returns one entry per direct child, in stable name order.
 */
abstract listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>

/**
 * Atomically create or replace UTF-8 text. `expected` guards intent and
 * staleness; omission allows unconditional overwrite.
 * @param target - the resolved target to write.
 * @param content - the full new file content.
 * @param expected - the write intent guarding the write; omit for unconditional.
 * @param signal - aborts before atomic publication takes effect.
 * @param sandboxPolicy - the per-call mode and workspace root this write
 *   runs under; a sandboxing backend fences the write by it, the bare backend
 *   ignores it. Omit to leave the backend its own default.
 * @returns the outcome, including the version the write produced.
 */
abstract writeText( target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<FsWriteOutcome>

/**
 * Atomically edit literal text. When supplied, the version guard is checked
 * before matching so stale content reports `FS_STALE_VERSION`; omission edits
 * the current content without a freshness precondition.
 * @param target - the resolved target to edit.
 * @param edit - the literal search/replace request.
 * @param expected - the version guard; omit for an unconditional edit.
 * @param signal - aborts before atomic publication takes effect.
 * @param sandboxPolicy - the per-call mode and workspace root this edit runs
 *   under; a sandboxing backend fences the edit by it, the bare backend
 *   ignores it. Omit to leave the backend its own default.
 * @returns the outcome, including the version the edit produced.
 */
abstract editText( target: FsTarget, edit: FsEditRequest, expected?: { version: FsVersion }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<FsEditOutcome>
```

Types: [SandboxExecutionPolicy](sandbox.md)

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fs-events"></a>

### `fs/*` events

<a id="fsedit-intent--waterfall"></a>

#### `fs/edit-intent` — waterfall

Single-slot decision for the next FileSystem.editText. Calling `next()` yields an unconditional edit; the first returned guard wins.

```ts cordis-catalog
/**
 * Single-slot decision for the next {@link FileSystem.editText}. Calling
 * `next()` yields an unconditional edit; the first returned guard wins.
 * @param target - the resolved target about to be edited.
 * @param actor - the opaque tool-execution context the decider keys off.
 * @mode waterfall
 */
'fs/edit-intent'(target: FsTarget, actor: object | undefined, next: () => { version: FsVersion } | undefined | Promise<{ version: FsVersion } | undefined>): Promise<{ version: FsVersion } | undefined>
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fsobserved--emit"></a>

#### `fs/observed` — emit

Record an authoritative positive or negative observation. Listeners must be synchronous recorders: throws fail the tool call and returned promises are not awaited.

```ts cordis-catalog
/**
 * Record an authoritative positive or negative observation. Listeners must
 * be synchronous recorders: throws fail the tool call and returned promises
 * are not awaited.
 * @param target - the target whose presence or absence was observed.
 * @param observation - present with its version, or confirmed absent.
 * @param actor - the observing tool-execution context; undefined records nothing useful.
 * @mode emit
 */
'fs/observed'(target: FsTarget, observation: FsObservation, actor: object | undefined): void
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fswrite-intent--waterfall"></a>

#### `fs/write-intent` — waterfall

Single-slot decision for the next FileSystem.writeText. Calling `next()` yields the bare provider's unconditional write; the first listener that returns an intent owns the decision rather than composing with peers.

```ts cordis-catalog
/**
 * Single-slot decision for the next {@link FileSystem.writeText}. Calling
 * `next()` yields the bare provider's unconditional write; the first listener
 * that returns an intent owns the decision rather than composing with peers.
 * @param target - the resolved target about to be written.
 * @param actor - the opaque tool-execution context the decider keys off.
 * @mode waterfall
 */
'fs/write-intent'(target: FsTarget, actor: object | undefined, next: () => FsWriteIntent | undefined | Promise<FsWriteIntent | undefined>): Promise<FsWriteIntent | undefined>
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)
<!-- END GENERATED cordis-surface -->

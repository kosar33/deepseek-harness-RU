# Рабочие пространства

[English](workspace.md) | [中文](workspace.zh.md) | Русский

Рабочее пространство (workspace) — персистентная запись о каталоге, в котором работает пользователь: стабильный ID поверх канонического пути, отображаемый заголовок и упорядоченный перечень сессий, принадлежащих пространству. Подсистема — это один пакет ([dsh-workspace](../../packages/workspace/workspace), `ctx.workspaceRegistry`), опциональная возможность на стороне хоста, не входящая в стержень agent-loop и невидимая для моделей (ни инструментов, ни текста промпта, ни событий сессии). Записи она хранит через [доменную форму хранилища](storage.ru.md), а членство сессий проверяет по [`SessionHeader.cwd`](persistence.md#sessionheader--metadata-beside-the-log), поэтому `storageDomain` и `sessionPersistence` — обязательные зависимости запуска: недоступный сосед по персистентности оставляет плагин ожидающим, а не позволяет принять пустую историю за настоящую. Запись о проектировании: [Agent Note о доменном KV-хранилище и workspace](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md); порядок начальной загрузки и GUI: [Agent Note о пользовательском потоке Workspace UI](../../.agents/notes/implemented/feature/2026-07-25-workspace-ui-product-flow.md).

Источник: [`packages/workspace/workspace/src/types.ts`](../../packages/workspace/workspace/src/types.ts)

## Идентичность

```ts type-equiv
/**
 * Identifies one workspace record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
type WorkspaceId = Branded<'WorkspaceId'>
```

`WorkspaceId` — [брендированный ID](core.ru.md#брендированные-id). Идентичность пути отдельна: `realpathNormalize` (`fs.realpath`; разрешаются завершающие слэши, `..` и симлинки) — единственный канон уникальности: пути рабочих пространств хранятся канонизированными, уникальность — это строковое равенство канонических путей (симлинк на уже занятый каталог даёт коллизию), и проверки cwd сессий при attach идут через тот же канон.

## Сущность рабочего пространства

Потребители видят только интерфейс `Workspace`; реализация остаётся приватной для пакета.

```ts type-equiv
/**
 * One workspace: a stable id over an existing directory, a display title, and
 * an ordered candidate account of sessions. Membership requires both an id in
 * that account and a session header whose canonical cwd equals the workspace
 * path. Consumers only see this interface; the implementation stays private.
 */
interface Workspace {
  /** Stable record id (generated uuid). */
  readonly id: WorkspaceId

  /**
   * Canonical directory path: the `fs.realpath` of the path given at create
   * time (trailing slashes, `..`, and symlinks all resolved). Never rewritten
   * afterwards, even when the directory disappears (see {@link status}).
   */
  readonly path: string

  /** Display title. Defaults to `basename(path)` at create; duplicates are allowed. */
  readonly title: string

  /** ISO-8601 creation instant, stamped at create and never rewritten. */
  readonly createdAt: string

  /** ISO-8601 instant of the last durable mutation (create counts as one). */
  readonly updatedAt: string

  /**
   * Header-validated sessions in manually owned order: a new session is
   * prepended at attach, explicit reordering goes through
   * `insertSessionBefore`, and activity never reorders. The durable candidate
   * account is filtered synchronously: missing headers, invalid cwd values,
   * and canonical cwd mismatches are never returned. A subsequent workspace
   * mutation prunes those filtered candidates durably.
   */
  readonly sessionIds: readonly SessionId[]

  /**
   * Replace the display title durably.
   * @param title - New title; any string, duplicates across workspaces allowed.
   * @returns resolution after durability.
   */
  setTitle(title: string): Promise<void>

  /**
   * Prepend a session to this workspace's candidate account. An already
   * accounted id resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs. A new id's
   * live or persisted
   * header cwd must resolve to an existing directory equal to {@link path};
   * unknown ids, missing or invalid cwd values, and mismatches reject without
   * writing.
   * @param sessionId - The session to record.
   * @returns resolution after durability.
   */
  attachSession(sessionId: SessionId): Promise<void>

  /**
   * Move an accounted session within the manual order, DOM-insertBefore-like:
   * with an anchor the session lands before it, without one it appends to the
   * end. Only the moved id changes position. A session or anchor absent from
   * the account rejects without writing; a move to the current position
   * resolves without writing, aside from the durable filtered-candidate
   * prune every accepted mutation performs; decided on the domain write
   * chain.
   * @param sessionId - The accounted session to move.
   * @param beforeSessionId - Accounted anchor to insert before; omitted appends.
   * @returns resolution after durability.
   */
  insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>

  /**
   * Remove a session from this workspace's account. Idempotent: an id not on
   * the account resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs; decided on
   * the domain write chain like attach. Never touches the session's own stored log.
   * @param sessionId - The session to remove.
   * @returns resolution after durability.
   */
  detachSession(sessionId: SessionId): Promise<void>

  /**
   * Live directory check, uncached: whether {@link path} currently exists and
   * is a directory. A missing directory never mutates the record — the
   * directory may only be temporarily moved.
   * @returns `'ok'` when the directory exists, `'missing-dir'` otherwise.
   */
  status(): Promise<'ok' | 'missing-dir'>
}
```

Истина о владении — это упорядоченные `sessionIds` записи, а не величина, производимая от cwd сессий, — но членство требует обоих: id в перечне и заголовка, чей канонический cwd равен пути пространства, поэтому одна сессия структурно принадлежит не более чем одному рабочему пространству. Неудачные записи отклоняются (`insertSessionBefore` сообщает об ошибках перечня как `WorkspaceMoveInvalidError`, сбои хранилища — обычными ошибками); каждая принятая мутация проставляет `updatedAt` и долговечно вычищает кандидатов, больше не проходящих проверку членства.

## Реестр: `ctx.workspaceRegistry`

`WorkspaceRegistry` ([сигнатуры](#ctxworkspaceregistry--workspaceregistry)) владеет регистрацией и разрешением. `create(path, title?)` канонизирует путь, отклоняет несуществующий путь (с исходным `ENOENT`) или не-каталог, при уже занятом каноническом пути возвращает существующую сущность без изменений, иначе создаёт запись с заголовком `title ?? basename(path)` и ставит её в начало долговечного порядка реестра — новая запись не может дублировать существующий отображаемый заголовок (`WorkspaceNameConflictError`). `get(id)` и упорядоченный `list()` — синхронные чтения из кэша; `resolveByPath(path)` применяет тот же канон realpath без создания. `delete(id)` удаляет только регистрацию, запись в порядке и перечень сессий — каталог, файлы пользователя, живые сессии и сохранённые журналы никогда не затрагиваются, поэтому такие сессии становятся Ungrouped ([решение](../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.md)); неизвестные id возвращают `false`. Create и delete сохраняют маркер незавершённой мутации прежде, чем их две записи (запись + порядок) смогут разойтись; при старте разрешается ровно помеченная мутация — удалением помеченной строки таблицы, что завершает прерванное удаление и откатывает прерванное создание (регистрацию можно создать заново, поэтому откат — безопасное направление), — а непомеченное расхождение порядка и таблицы громко падает как повреждение данных.

Своё cwd сессии получают при создании от того, кто их создаёт, а не от этого реестра — API-шлюз берёт cwd новой сессии из `path` выбранного рабочего пространства (с откатом к явно заданному или стандартному cwd), создаёт сессию так, чтобы cwd попал в её неизменяемый [`SessionHeader`](persistence.md#sessionheader--metadata-beside-the-log), затем вызывает `attachSession`, который повторно сверяет сохранённый cwd заголовка с путём рабочего пространства. При первом успешном старте реестр разворачивает историю только из сохранённых заголовков (`id`, `cwd`, `createdAt` — никогда из тел событий), группируя сессии с корректным каноническим cwd в отдельные по каталогу рабочие пространства, от новых к старым; маркер инициализации пишется последним, чтобы прерванная начальная загрузка безопасно возобновлялась. Начальная загрузка выполняется один раз: устаревшие сессии без cwd остаются Ungrouped, а созданные позже сессии попадают в рабочее пространство только через `attachSession`.

## Потребители

[dsh-host-apiproxy](../../packages/host/apiproxy) — продуктовый потребитель: он обслуживает CRUD рабочих пространств для GUI-клиентов поверх `ctx.workspaceRegistry` и выполняет описанный выше поток «создать сессию, затем attach». [dsh-agent-instructions](../../packages/context/agent-instructions) вопреки названию **не** потребитель: он находит инструкционные файлы в духе AGENTS.md под собственным cwd агента и никогда не трогает `ctx.workspaceRegistry` — общее слово здесь означает рабочий каталог пользователя, а не сущности этого реестра.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdirectorypicker--directorypicker-abstract-seam"></a>

### `ctx.directoryPicker` — `DirectoryPicker` (abstract seam)

Abstract directory-picking service. Subclass, implement `capability()`, and load the subclass as a plugin — it registers as `ctx.directoryPicker` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior). The capability object must be stable for the service lifetime: consumers may capture it across calls.

```ts cordis-catalog
/**
 * The backend's interaction capability.
 * @returns the discriminated capability consumers switch on.
 */
abstract capability(): DirectoryPickerCapability
```

Source: [`packages/host/directory-picker/src/index.ts`](../../packages/host/directory-picker/src/index.ts)

<a id="ctxworkspaceregistry--workspaceregistry"></a>

### `ctx.workspaceRegistry` — `WorkspaceRegistry`

Durable workspace registry. Startup waits for `sessionPersistence`, builds one canonical-cwd header index, and completes the one-time history bootstrap before the service becomes active. The persistence dependency is mandatory so an unavailable peer can never be mistaken for an empty history and commit the initialized marker.

```ts cordis-catalog
/**
 * Create or reuse a workspace for an existing directory. The path is
 * canonicalized through `fs.realpath`; a nonexistent path rejects with the
 * original error and a non-directory rejects. Repeated calls for the same
 * canonical path return the existing entity without changing its title.
 * A newly created workspace is prepended to the durable registry order.
 * Different canonical paths may share a display title.
 * @param path - Existing directory to own, in any path spelling.
 * @param title - Display title used only when a new record is created.
 * @returns the existing or newly durable workspace.
 */
async create(path: string, title?: string): Promise<Workspace>

/**
 * Look up a workspace by id.
 * @param id - Workspace id.
 * @returns the workspace, or `undefined` when unknown.
 */
get(id: WorkspaceId): Workspace | undefined

/**
 * Synchronous workspace projection in durable registry order. Every
 * entity's `sessionIds` getter is already filtered by the startup/live
 * canonical-cwd header index; this method performs no persistence reads.
 * @returns a fresh ordered array of workspace entities.
 */
list(): Workspace[]

/**
 * Delete one workspace registration while retaining its directory and every
 * session log. The durable order is updated before the table deletion; a
 * failed table write restores the prior order and keeps the entity
 * published. Unknown ids are an idempotent no-op for domain callers.
 * @param id - Workspace registration to remove.
 * @returns `true` when a record was deleted, `false` when it was unknown.
 */
delete(id: WorkspaceId): Promise<boolean>

/**
 * Move one workspace within the durable display order, DOM-insertBefore-like.
 * With an anchor it lands before that workspace; without one it appends.
 * @param id - Workspace to move.
 * @param beforeId - Workspace anchor; omitted appends.
 * @returns the complete committed workspace order.
 */
insertBefore(id: WorkspaceId, beforeId?: WorkspaceId): Promise<readonly WorkspaceId[]>

/**
 * Archive one session durably. The session must exist (live or in session
 * persistence); its workspace accounting — or lack of one — is irrelevant.
 * An already archived id resolves without writing.
 * @param sessionId - The session to archive.
 * @returns resolution after durability.
 */
archiveSession(sessionId: SessionId): Promise<void>

/**
 * Resolve by canonical directory path without creating or mutating a
 * workspace. A missing path rejects during `realpath`; an existing unowned
 * directory returns `undefined`.
 * @param path - Existing directory path in any spelling.
 * @returns the workspace owning the canonical path, when one exists.
 */
async resolveByPath(path: string): Promise<Workspace | undefined>
```

Types: [SessionId](core.md)

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)
<!-- END GENERATED cordis-surface -->

# Spill-хранилище

[English](spill.md) | [中文](spill.zh.md) | Русский

Seam spill-хранилища — [capability seam](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md), который сохраняет слишком большой текст инструмента и возвращает видимый модели локатор вместе с указаниями по извлечению; он разделён между пакетами: Service Definition ([dsh-spill](../../packages/spill/spill), `ctx.spillStore`), Service Provider ([dsh-spill-local](../../packages/spill/spill-local), приватные файлы в области сессии на файловой системе хоста) и Consumer ([dsh-spill-policy](../../packages/spill/spill-policy), политика `tools/post-execute`). Spill — **одна опциональная возможность**, а не часть стержня agent-loop, поэтому его словарь живёт здесь, а не в [core.ru.md](core.ru.md). Механика предпросмотра остаётся в [dsh-output-retention](../../packages/util/output-retention); этот seam сохраняет лишь финальный текст, который передаёт ему политика.

Источник: [`packages/spill/spill/src/types.ts`](../../packages/spill/spill/src/types.ts)

## Запрос на сохранение

`saveText` — единственная операция сервиса: сохранить `content` дословно и вернуть непрозрачный локатор, подсказку по извлечению от бэкенда и точное число байт. Запрос несёт пространство имён хранения на момент сохранения (`owner`), инструмент и вызов, породившие текст (`source` — используется для именования и осмотра, не для контроля доступа), и `suggestedName`, который бэкенд может взять как намёк для имени (это не путь).

```ts type-equiv
/** One request to persist text to a spill artifact. */
interface SaveTextSpill {
  owner: SpillOwner
  source: SpillSource
  /**
   * A caller-suggested base name (e.g. `web_fetch.txt`). The backend sanitizes
   * it to a single safe path segment before use — it is a hint, never a path.
   */
  suggestedName: string
  /** The full text to persist (UTF-8). */
  content: string
}
```

```ts type-equiv
/**
 * Save-time storage namespace for a spilled artifact. The session id lets a
 * backend group storage under the producing session, but the returned
 * {@link SpillLocator} is the model-facing handle. Forked sessions inherit
 * locators already present in the seeded log; those artifacts are not copied or
 * re-owned, and spills produced after the fork use the child session id.
 */
interface SpillOwner {
  sessionId: SessionId
}
```

`SpillOwner.sessionId` — пространство имён хранения на момент сохранения. Fork-сессии наследуют уже имеющиеся spill-локаторы, присутствующие в унаследованном через seed префиксе журнала; эти артефакты не копируются и не переходят во владение потомка, а spill'ы, созданные после fork'а, используют id дочерней сессии. Очистка по сроку хранения может объявлять старые локаторы истёкшими вместе с прочими старыми артефактами сессии; seam spill'а не определяет политику очистки для отдельной сессии.

```ts type-equiv
/**
 * Tool and call that produced one spilled artifact — recorded by the backend for a readable
 * filename and inspection. Not interpreted for access control; purely
 * descriptive.
 */
interface SpillSource {
  /** The tool whose result was spilled (e.g. `web_fetch`). */
  toolName: string
  /** The model-issued call id the result belongs to. */
  callId: CallId
  /** A short human label for the artifact (e.g. `result`). */
  label: string
}
```

## Результат

```ts type-equiv
/** A saved spill artifact: its locator, byte length, and backend-specific retrieval guidance. */
interface SpillRef {
  locator: SpillLocator
  bytes: number
  retrievalHint: string
}
```

`SpillLocator` — [брендированный](core.ru.md#брендированные-id) видимый модели дескриптор, возвращаемый бэкендом. Локальный бэкенд отображает его как путь файловой системы; удалённый бэкенд или база данных могут отобразить URI, ключ или командный токен. Потребители обращаются с ним как с непрозрачным значением и показывают его вместе с `retrievalHint`, вместо того чтобы предполагать, что `read` — всегда верный механизм извлечения.

```ts type-equiv
/**
 * Opaque model-facing handle for one spilled artifact. A local backend may use a
 * filesystem path; a remote or database backend may use a URI or key. Consumers
 * render it with {@link SpillRef.retrievalHint}, but do not parse it.
 */
type SpillLocator = Branded<'SpillLocator'>
```

## Сервис

`SpillStore` (`ctx.spillStore`, определён в [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)) — абстрактный сервис из одного метода: `saveText(input) → Promise<SpillRef>`. Он сохраняет ПОЛНЫЙ `content` и ОТКЛОНЯЕТСЯ при реальной ошибке хранилища (права доступа, ENOSPC, недоступность бэкенда). Seam владеет только хранением: ни политики удержания, ни замещения результата инструмента, ни API извлечения или поиска.

Локальный бэкенд ([dsh-spill-local](../../packages/spill/spill-local)) пишет под `<root>/session-<hash>/<random>-<safeName>` — настраиваемый или лениво создаваемый приватный (0700) корень, подкаталог сессии `sha256(sessionId)` и эксклюзивную запись только для владельца (`open(path, 'wx', 0o600)`), чтобы подложенный symlink не мог перенаправить запись. Его `locator` — локальный путь, а `retrievalHint` предписывает модели применить к этому пути `read` или `grep`. Потребитель-политика ([dsh-spill-policy](../../packages/spill/spill-policy)) заменяет превышающий `maxInlineBytes` итоговый текстовый результат на head/tail-предпросмотр из библиотеки удержания плюс ссылку на spill в режиме best-effort: отказ сохранения оставляет исходный встроенный результат, а не превращает удавшийся вызов в `isError`.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxspillstore--spillstore-abstract-seam"></a>

### `ctx.spillStore` — `SpillStore` (abstract seam)

Abstract spill storage service. Subclass, implement saveText, and load the subclass as a plugin — it registers as `ctx.spillStore` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior).

Семантика, которую обязаны соблюдать все реализации:

- saveText persists the FULL `content` verbatim and returns an opaque locator, exact byte length, and model-facing retrieval guidance.
- Storage is scoped by the request's SaveTextSpill.owner session; the backend chooses a private (not world-readable) location and a collision-free name derived from — never equal to — the caller's `suggestedName`.
- `saveText` REJECTS on a real storage failure (permissions, ENOSPC, backend unavailable); the caller decides how to degrade (the spill policy treats a rejection as best-effort and keeps the inline result).

```ts cordis-catalog
/**
 * Persist `input.content` to a session-scoped spill artifact.
 * @param input - the owner, caller-supplied source fields, suggested name, and full text to save.
 * @returns the saved artifact's {@link SpillRef}; rejects on a storage failure.
 */
abstract saveText(input: SaveTextSpill): Promise<SpillRef>
```

Source: [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)
<!-- END GENERATED cordis-surface -->

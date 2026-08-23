# Долговременные вложения изображений

[English](attachment.md) | [中文](attachment.zh.md) | Русский

Seam вложений отделяет владение бинарными изображениями от журнала сессии. Продюсер передаёт проверенные закодированные байты в [`ctx.attachments`](#ctxattachments--attachmentstore-abstract-seam); сервис публикует неизменяемую ссылку с адресацией по содержимому только после того, как объект станет долговременным. События сессии и модель-видимые `ImageBlock` содержат эту ссылку и метаданные, но никогда не содержат браузерный object URL, временный путь хоста, URL провайдера или полезную нагрузку base64.

Неотправленные черновики браузера могут оставаться в памяти, а нативные клиенты — размещать их во временном хранилище операционной системы. Когда хост принимает пользовательское сообщение, его изображения переезжают под `<DSH_HOME>/attachments/v1` до добавления пользовательского события. Структурированный вывод изображений модели следует тому же правилу «сначала сохранение, потом событие».

Источник: [`packages/attachment/attachment/src/types.ts`](../../packages/attachment/attachment/src/types.ts)

## Идентичность и проверенные метаданные

`AttachmentId` — брендированная непрозрачная строка. Локальный бэкенд в настоящее время выдаёт `sha256:<digest>`, но потребители не должны ни разбирать это представление, ни выводить из него путь файловой системы.

```ts type-equiv
/** Raster image formats accepted by the version-one attachment path. */
type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
```

```ts type-equiv
/** Durable, serializable reference to one immutable normalized image. */
interface ImageAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId
  /** Media type verified from the stored bytes. */
  mediaType: ImageMediaType
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
  /** Optional display name stripped of local path information. */
  name?: string
  /**
   * Input dimensions after applying EXIF orientation and before normalization
   * scaling. Present only when normalization reduced the image.
   */
  originalDimensions?: {
    width: number
    height: number
  }
}
```

```ts type-equiv
/** Deployment-resolved limits used by upload admission and request buffering. */
interface ImageAttachmentLimits {
  maxImageBytes: number
  maxImagesPerMessage: number
  maxMessageImageBytes: number
  maxImagePixels: number
  /** Maximum intrinsic width and maximum intrinsic height in pixels for one image. */
  maxImageDimension: number
  mediaTypes: readonly ImageMediaType[]
}
```

Локальный бэкенд допускает не более 20 изображений и 200 МиБ закодированных исходных данных на сообщение. Один источник может занимать до 20 МиБ, 64 000 000 пикселей и 8192 пикселя по любой стороне. Эти ограничения на источник предшествуют независимому этапу нормализации, который по умолчанию ограничивает длинное ребро 2048 пикселями, а закодированные данные — 4 МиБ.

Ссылка записывает собственные размеры и длину закодированных данных, чтобы клиенты могли верстать историю без предварительного декодирования, при этом каждое авторитетное чтение по-прежнему перепроверяет дайджест, медиасигнатуру, размеры и метаданные по объекту.

## Полезные нагрузки фиксации и проверенного чтения

```ts type-equiv
/** Base64-encoded image upload accompanying one wire request. */
interface EncodedImageAttachment {
  /** Declared media type, verified against the decoded bytes during admission. */
  mediaType: ImageMediaType
  /** Canonical base64 encoding of the image bytes. */
  data: string
  /** Optional display name; it is never interpreted as a path. */
  name?: string
}
```

```ts type-equiv
/** Request to validate and durably commit one image. */
interface SaveImageAttachment {
  data: Uint8Array
  /** Caller-declared media type, checked against fully decoded bytes. */
  mediaType: ImageMediaType
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string
}
```

```ts type-equiv
/** Stored image bytes returned after reference and digest verification. */
interface StoredImageAttachment {
  ref: ImageAttachmentRef
  data: Uint8Array
}
```

```ts type-equiv
/** Deterministic request-image policy selected by one exact model route. */
interface ImageRequestPolicy {
  /** Maximum width multiplied by height after aspect-preserving projection. */
  maxPixels: number
  /** Encoded-byte cap before base64 expansion or Files API upload. */
  maxBytes: number
}
```

```ts type-equiv
/** Cached request version derived from one provider-independent normalized attachment. */
interface RequestImageAttachment {
  /** Cache and upload-index key over the attachment id, policy, and fixed encoder parameters. */
  variantId: ImageVariantId
  /** Durable normalized attachment from which this request version was derived. */
  attachment: ImageAttachmentRef
  /** Encoded request bytes. */
  data: Uint8Array
  mediaType: ImageMediaType
  bytes: number
  width: number
  height: number
  /** Provider-compatible sample depth proven after request encoding. */
  depth: 'uchar'
  /** Provider-compatible color space proven after request encoding. */
  space: 'srgb'
  /** Whether the encoded request version retains an alpha channel. */
  hasAlpha: boolean
}
```

`saveImage()` готовит и атомарно фиксирует независимое от провайдера нормализованное вложение, прежде чем вернуть его `ImageAttachmentRef`. `saveImages()` готовит каждое проверенное вложение один раз до публикации батча, поэтому отказ валидации не оставляет частичных объектов, а публикация не повторяет декодирование и выбор качества. `admitEncodedImages()` — точка входа протокола для base64-загрузок; она делегирует `saveImages()` допуск по количеству, суммарным байтам и упорядоченному батчу. `readImage()` выполняет проверку нормализованного вложения из авторизованного пути сессии. `readImageRequest()` вычисляет и кэширует одну версию запроса в рамках точного бюджета пикселей и байтов маршрута; новые записи полностью декодируются до публикации, а попадания в кэш используют ограниченный зонд метаданных. Вызывающие стороны используют `Promise.all` над единичным методом, когда им нужен упорядоченный батч. Локальная реализация лениво кодирует предпочтительных кандидатов, исполняет равные идентичности запросов одним полётом (singleflight), позволяет каждому ожидающему отмениться независимо, прекращает общую работу, когда ожидающих не остаётся, и ограничивает все преобразования лимитером уровня экземпляра, который по умолчанию допускает два одновременных преобразования. Сервис нейтрален к удержанию: возобновлённые и форкнутые сессии могут разделять объекты, поэтому учитывающая ссылки сборка мусора откладывается, а не привязывается к удалению одной сессии.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxattachments--attachmentstore-abstract-seam"></a>

### `ctx.attachments` — `AttachmentStore` (abstract seam)

Immutable binary attachment service. Implementations validate bytes before publishing a reference.

```ts cordis-catalog
/**
 * Validate one image without persisting it.
 * Batch callers validate every member before saving any member.
 * @param input - encoded bytes, declared media type, and optional display name.
 * @returns completion after the encoded raster has been fully decoded.
 */
abstract validateImage(input: SaveImageAttachment): Promise<void>

/**
 * Validate and durably commit one ordered image batch.
 * @param inputs - encoded images in owning-message order.
 * @returns durable normalized attachment references in the same order after every member succeeds.
 */
async saveImages(inputs: readonly SaveImageAttachment[]): Promise<readonly ImageAttachmentRef[]>

/**
 * Validate and durably commit one image before its owning session event is appended.
 * The returned reference describes the persisted normalized image. When
 * normalization reduces the raster, its `originalDimensions` records the
 * orientation-applied input dimensions.
 * @param input - encoded bytes, declared media type, and optional display name.
 * @returns the durable content-addressed normalized image reference.
 */
abstract saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef>

/**
 * Read one image and verify that bytes still match the recorded reference.
 * @param ref - durable reference from the session log.
 * @param signal - optional cancellation for backend read and verification work.
 * @returns the verified bytes and normalized attachment reference.
 * @throws the signal reason when aborted, or a storage error when verification fails.
 */
abstract readImage(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<StoredImageAttachment>

/**
 * Generate or read one deterministic model-request version from the stored normalized image.
 * @param ref - durable provider-independent normalized attachment reference.
 * @param policy - exact route pixel and encoded-byte budget.
 * @param signal - optional cancellation.
 * @returns request bytes and the cache/upload identity covering every transform input.
 */
readImageRequest( ref: ImageAttachmentRef, policy: ImageRequestPolicy, signal?: AbortSignal, ): Promise<RequestImageAttachment>
```

Source: [`packages/attachment/attachment/src/index.ts`](../../packages/attachment/attachment/src/index.ts)
<!-- END GENERATED cordis-surface -->

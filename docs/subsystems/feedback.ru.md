# Отзыв на сообщения

[English](feedback.md) | [中文](feedback.zh.md) | Русский

[`@deepseek-ai/dsh-message-feedback`](../../packages/feedback/message-feedback) владеет изменяемым отзывом на отдельные сообщения ассистента. Он намеренно отделён от неизменяемого события уровня сессии `feedback/record`: отзыв на сообщение — это локальный сопутствующий файл домена хранилища, а не содержимое журнала событий сессии и не проекция, и никакой телеметрической передачи он не выполняет.

Источник: [`packages/feedback/message-feedback/src/types.ts`](../../packages/feedback/message-feedback/src/types.ts)

## Публичные типы

```ts type-equiv
/** Opaque compare-and-set token for one exact feedback item revision. */
type MessageFeedbackVersion = Branded<'MessageFeedbackVersion'>
```

```ts type-equiv
/** The human's overall judgment of one assistant message. */
type MessageFeedbackRating = 'positive' | 'negative'
```

```ts type-equiv
/** One current feedback value and its opaque mutation token. */
interface MessageFeedbackItem {
  /** Stable identity of the assistant message inside the owning Session. */
  readonly messageId: MessageId
  /** Overall positive or negative judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional explanation, preserved verbatim after validation. */
  readonly note?: string
  /** Equality-only token replaced by every material create or update. */
  readonly version: MessageFeedbackVersion
  /** Host-assigned creation time in Unix epoch milliseconds. */
  readonly createdAt: number
  /** Host-assigned time of the most recent material update. */
  readonly updatedAt: number
}
```

```ts type-equiv
/** Read all message feedback belonging to one persisted Session lifecycle. */
interface MessageFeedbackListRequest {
  /** Persisted Session whose sidecar should be read. */
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** Current feedback values for one Session, in first-creation order. */
interface MessageFeedbackListValue {
  /** Fresh immutable item snapshots. */
  readonly items: readonly MessageFeedbackItem[]
}
```

```ts type-equiv
/** Create or replace feedback for one assistant message. */
interface MessageFeedbackPutRequest {
  /** Persisted Session that owns the target message. */
  readonly sessionId: SessionId
  /** Target assistant-message identity. */
  readonly messageId: MessageId
  /** Desired overall judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional non-blank explanation. */
  readonly note?: string
  /** Observed item version, or `null` to require that no item exists. */
  readonly ifVersion: MessageFeedbackVersion | null
}
```

```ts type-equiv
/** Delete feedback for one message after observing its current version. */
interface MessageFeedbackDeleteRequest {
  /** Persisted Session that owns the sidecar. */
  readonly sessionId: SessionId
  /** Message whose feedback should be absent after this operation. */
  readonly messageId: MessageId
  /** Observed item version; ignored when the item is already absent. */
  readonly ifVersion: MessageFeedbackVersion
}
```

```ts type-equiv
/** Idempotent deletion acknowledgement. */
interface MessageFeedbackDeleteValue {
  /** Stable postcondition shared by the first deletion and every retry. */
  readonly absent: true
}
```

```ts type-equiv
/** No persisted Session header exists for the requested id. */
interface MessageFeedbackSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** The id does not name a derived, append-origin assistant message. */
interface MessageFeedbackTargetNotFound {
  readonly code: 'target-not-found'
  readonly sessionId: SessionId
  readonly messageId: MessageId
}
```

```ts type-equiv
/** A material mutation did not match the addressed item's current version. */
interface MessageFeedbackVersionConflict {
  readonly code: 'version-conflict'
  /** Authoritative current item, or `null` when it does not exist. */
  readonly current: MessageFeedbackItem | null
}
```

```ts type-equiv
/** A supplied note contains no non-whitespace character. */
interface MessageFeedbackNoteBlank {
  readonly code: 'note-blank'
}
```

```ts type-equiv
/** A supplied note exceeds the configured UTF-8 byte limit. */
interface MessageFeedbackNoteTooLarge {
  readonly code: 'note-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}
```

```ts type-equiv
/** Failures shared by the public message-feedback operations. */
type MessageFeedbackFailure =
  | MessageFeedbackSessionNotFound
  | MessageFeedbackTargetNotFound
  | MessageFeedbackVersionConflict
  | MessageFeedbackNoteBlank
  | MessageFeedbackNoteTooLarge
```

```ts type-equiv
/** Successful public operation result. */
interface MessageFeedbackSuccess<T> {
  readonly ok: true
  readonly value: T
}
```

```ts type-equiv
/** Rejected public operation result with a stable business failure. */
interface MessageFeedbackRejected<E extends MessageFeedbackFailure> {
  readonly ok: false
  readonly error: E
}
```

```ts type-equiv
/** Result returned by the message-feedback `list` operation. */
type MessageFeedbackListResult =
  | MessageFeedbackSuccess<MessageFeedbackListValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound>
```

```ts type-equiv
/** Result returned by the message-feedback `put` operation. */
type MessageFeedbackPutResult =
  | MessageFeedbackSuccess<MessageFeedbackItem>
  | MessageFeedbackRejected<
    | MessageFeedbackSessionNotFound
    | MessageFeedbackTargetNotFound
    | MessageFeedbackVersionConflict
    | MessageFeedbackNoteBlank
    | MessageFeedbackNoteTooLarge
  >
```

```ts type-equiv
/** Result returned by the message-feedback `delete` operation. */
type MessageFeedbackDeleteResult =
  | MessageFeedbackSuccess<MessageFeedbackDeleteValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound | MessageFeedbackVersionConflict>
```

## Данные и конкурентность

Одна строка сопутствующего файла сессии содержит заголовочную идентичность `{createdAt, cwd}` и элементы отзыва, ключуемые `MessageId`. Каждый элемент несёт положительную или отрицательную оценку, необязательное пояснение, назначенные хостом отметки времени `createdAt`/`updatedAt` и собственный непрозрачный токен версии. Версии сравниваются только на равенство и только у адресуемого сообщения; вызывающие не упорядочивают их и не синтезируют.

`put` использует строгую оптимистичную конкурентность: каждый запрос к существующему элементу обязан совпасть с его текущим `ifVersion`, даже когда запрос ничего не меняет. Конфликт возвращает авторитетный текущий элемент (или `null`), поэтому вызывающий способен согласовать потерянный ответ или конкурентную правку без дополнительного чтения. Удаление уже отсутствующего элемента считается успехом. Очередь на уровне сессии заключает в себя осмотр, чтение, оценку конфликта и запись строки целиком, так что эти гарантии распространяются и на конкурентные вызовы в пределах одного процесса хоста.

## Целевое сообщение и полномочия жизненного цикла

`SessionPersistence.inspect()` поставляет наблюдение целевой сессии, не публикуя и не возобновляя агента и не выполняя холодного восстановления. Холодная предпроверка `listSnapshots()` распознаёт заведомое отсутствие; сбой осмотра каталогизированной сессии распространяется наверх как инфраструктурный сбой. `put` принимает только непустое `assistant/message` append-происхождения с запрошенным `MessageId`; записи замещающего происхождения, пустые записи, существующие ради статистики использования, и не-ассистентские записи целями отзыва не являются.

Сохранённая идентичность `{createdAt, cwd}` обязана совпасть с осмотрённым заголовком. Несовпадение трактуется как отсутствие: `list` не возвращает элементов, а `put` может заменить устаревшую строку строкой, привязанной к текущей заголовочной идентичности. Форки получают новую идентичность сессии и копии сопутствующего файла не получают, даже если их засев содержит те же сообщения.

## Персистентность и Remote-контракт

Сервис хранит строки сессий целиком в домене хранилища `message_feedback` через `ctx.storageDomain`. Прежде чем `put` зафиксирует строку, ссылающуюся на целевое сообщение, живая целевая запись проходит через канонический чекпоинт `ctx.sessions.flush`; после этого и живой, и холодный пути физически читаются с нулевой позиции через `SessionPersistence.readFrom`. Полученное наблюдение заново проверяется перед записью сопутствующего файла, поэтому долговременный журнал целевого сообщения всегда предшествует фиксации его сопутствующего файла. `maxNoteBytes` обязателен и ограничивает текст заметки в байтах UTF-8; композиция веб-хоста задаёт `8192`. Пакет публикует унарный Remote-контракт хоста `messageFeedback.list`, `messageFeedback.put` и `messageFeedback.delete` через `TypertRemoteService` и `@Remote`; сгенерированный ниже Cordis API является авторитетным описанием на уровне методов.

Освобождение ресурсов плагина закрывает приём мутаций, опустошает принятую работу очередей на уровне сессий и лишь затем закрывает домен хранилища.

## Веб-поверхность

[`@deepseek-ai/dsh-client-ui-message-feedback`](../../packages/client/ui-message-feedback) — браузерный потребитель. `@deepseek-ai/dsh-api-remotes` монтирует сгенерированный вклад `messageFeedback`, поэтому плагин вызывает `ctx.remote.messageFeedback` и никогда не касается транспорта.

Элементы управления — это вход `feedback` (порядок 10) в list-slot `conversation.chat.assistant-actions`, который объявляет и отрисовывает `ui-conversation` внутри ряда IconActions финализированного сообщения ассистента. Чтобы добраться до места отрисовки, понадобилось одно изменение проводки: `AssistantMessageNode` теперь несёт необязательный `messageId` из события `assistant/message`. На частичных сообщениях, замороженных прерыванием, поле отсутствует, и место отрисовки пропускает slot, когда поля нет. Полоса отрисовывается один раз за ход, на закрывающем сообщении ассистента: хост принимает любое сообщение шага append-происхождения как цель, но ранние шаги многошагового хода отрисовывают ряды инструментов, а не поддающееся оценке содержимое, поэтому UI предлагает более узкий набор, чем позволяет контракт хоста.

Один `MessageFeedbackController` на сессию обслуживает все элементы управления сообщениями этой сессии: единственное чтение `list` засевает весь транскрипт и откладывается до первого наведения или фокуса, а не запускается при монтировании. Каждая мутация отправляет версию, которую контроллер наблюдал последним, как `ifVersion`; ответ `version-conflict` несёт авторитетный элемент, поэтому контроллер согласовывает состояние по самому ответу вместо повторной выборки. Мутации сериализуются на уровне сессии, так что операция в очереди сравнивается с зафиксированной версией. `connection/reset` обновляет только те сессии, которые уже были прочитаны.

## Границы и ограничения

- Очередь мутаций локальна для процесса. У домена хранилища нет межпроцессной условной записи, поэтому несколько хостовых писателей в один корень хранилища не имеют гарантий ни сравнения-и-замены (compare-and-swap), ни защиты от потерянного обновления.
- У персистентности сессии нет долговременного API удаления. Сервис не считает `session/disposed` или `host/session-removed` удалением и потому не выполняет ложного каскада; осиротевшие строки сопутствующих файлов могут оставаться после удаления журнала в обход сервиса.
- Запрос в узком интервале после отсоединения живой сессии, но до того, как каталог персистентности материализует заголовок, может получить `session-not-found`; вызывающие повторяют попытку после того, как уход сессии материализован.
- Холодные запросы сканируют полный каталог снапшотов сессии, потому что у персистентности нет операции поиска по идентификатору. У одной строки сессии нет также лимита на число элементов или суммарное число байтов; `maxNoteBytes` ограничивает лишь каждую отдельную заметку, пока какой-нибудь конкретный потребитель не заведёт собственную политику для строки.
- Заголовочная идентичность обнаруживает переиспользованный id, только если `{createdAt, cwd}` различается; клонированный журнал с той же заголовочной идентичностью этот контракт отличить не в силах.
- Контракт хоста не записывает аутентифицированного актора или аудит-идентичность и потому предполагает границу доверенного вызывающего.
- Веб-элементы управления появляются только в представлении чата. Представления траектории и каскада не отрисовывают вход отзыва, хотя их узлы ассистента несут тот же `messageId`.
- Сопутствующий файл не публикует живых кадров, поэтому оценка из второй вкладки становится видимой при переподключении или в следующем ответе о конфликте, а не мгновенно.
- Редактор заметки не проверяет `maxNoteBytes` заранее; чрезмерно крупная заметка падает при сохранении с `note-too-large`, а не во время набора.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmessagefeedback--messagefeedbackservice"></a>

### `ctx.messageFeedback` — `MessageFeedbackService`

Storage-domain sidecar service. It inspects persisted Session history and never creates or resumes an Agent or Session.

```ts cordis-catalog
/**
 * Read feedback belonging to the current persisted Session lifecycle.
 * A stale row from a reused Session id is invisible.
 * @param request - Session identity to inspect and list.
 * @returns current immutable items or `session-not-found`.
 */
@Remote('list') async list(request: MessageFeedbackListRequest): Promise<MessageFeedbackListResult>

/**
 * Create or replace feedback for one derived append-origin assistant
 * message. Every request must match the addressed item's current version;
 * a matching no-op returns the stored item without changing its revision.
 * @param request - target, desired value, and observed item version.
 * @returns the committed item or an explicit business failure.
 */
@Remote('put') put(request: MessageFeedbackPutRequest): Promise<MessageFeedbackPutResult>

/**
 * Delete one feedback item. Absence is successful regardless of the
 * supplied version; an existing item requires an exact version match.
 * @param request - Session, message, and observed item version.
 * @returns the stable absent postcondition, or an explicit failure.
 */
@Remote('delete') delete(request: MessageFeedbackDeleteRequest): Promise<MessageFeedbackDeleteResult>
```

Source: [`packages/feedback/message-feedback/src/index.ts`](../../packages/feedback/message-feedback/src/index.ts)
<!-- END GENERATED cordis-surface -->

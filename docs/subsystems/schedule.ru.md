# Schedule, локальный для сессии

[English](schedule.md) | [中文](schedule.zh.md) | Русский

Schedule владеет долговечными напоминаниями, которые возвращаются в исходную живую Session как обычные последующие ходы беседы. Решениями о персистентности и жизненном цикле владеет [Agent Note о долговечном Schedule](../../.agents/notes/implemented/feature/2026-08-05-durable-web-schedule.md), границей без квитанций — [conversational delivery](../../.agents/notes/implemented/simplification/2026-08-09-conversational-schedule-delivery.md), интерпретацией в зоне браузера — [explicit time-zone boundary](../../.agents/notes/implemented/simplification/2026-08-09-explicit-schedule-time-zone.md), а повторением — [bounded fixed-rate Schedule](../../.agents/notes/implemented/simplification/2026-08-09-bounded-fixed-rate-schedule.md). Эта страница фиксирует долговечные и обращённые к модели формы из [`packages/schedule/schedule/src/types.ts`](../../packages/schedule/schedule/src/types.ts); композицией, поведением инструмента и точным оформлением напоминания владеет [README пакета](../../packages/schedule/schedule/README.md).

## Долговечные записи

`ScheduleId` — [брендированный id](core.ru.md#брендированные-id), уникальный и никогда не переиспользуемый внутри одной Session. Версия 1 поддерживает положительную задержку safe-integer `after_seconds`, явную абсолютную цель `at` или интервал safe-integer `every_seconds` не менее пяти минут. Создание канонизирует каждую первую цель в RFC 3339 UTC `scheduledAt` с четырёхзначным годом; запись `after` сохраняет поданную задержку, запись `at` хранит лишь результирующий момент, а запись `every` сохраняет свой фиксированный интервал и следующую цель.

```ts type-equiv
/** Durable one-shot reminder created from a positive delay. */
interface AfterScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a delayed one-shot reminder. */
  readonly kind: 'after'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Positive safe-integer delay accepted at creation. */
  readonly afterSeconds: number
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable one-shot reminder created from an absolute instant. */
interface AtScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for an absolute one-shot reminder. */
  readonly kind: 'at'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable fixed-rate reminder whose next target remains creation-anchor-aligned. */
interface EveryScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a fixed-rate recurring reminder. */
  readonly kind: 'every'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Fixed safe-integer interval, never below five minutes. */
  readonly everySeconds: number
  /** Earliest anchor-aligned occurrence not yet dispatched. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** One-shot record variants that terminate on an id-only dispatch. */
type OneShotScheduleRecord = AfterScheduleRecord | AtScheduleRecord
```

```ts type-equiv
/** The v1 durable reminder record union. */
type ScheduleRecord = OneShotScheduleRecord | EveryScheduleRecord
```

## Ввод абсолютного времени

Селектор `at` — это либо строгая строка RFC 3339 со смещением, либо точный объект локального календаря. Локальная форма делает свою интерпретацию явной на границе инструмента:

```ts type-equiv
/** Structured local-calendar input accepted by `schedule_create`. */
interface LocalAtInput {
  /** Four-digit ISO calendar date. */
  readonly date: string
  /** Local wall-clock time with optional one-to-three digit milliseconds. */
  readonly time: string
  /** Explicit UTC or IANA Area/Location zone. */
  readonly time_zone: string
}
```

```ts type-equiv
/** Absolute selector accepted by `schedule_create`. */
type AtInput = string | LocalAtInput
```

Официальный веб-оверлей снимает зону IANA браузера для каждого промпта. Контекст времени указывает модели интерпретовать естественноязыковые даты и времена, иначе не квалифицированные, в этой зоне конкретного запроса, когда открытый ход располагает одной однозначной зоной браузера; смешанное или отсутствующее происхождение указывает модели переспросить. Это руководство — не долговечное умолчание Session: модель по-прежнему должна передать смещение в строковой форме или `time_zone` в локальной форме, а Schedule никогда не читает контекст браузера, Session, процесса или модели.

Schedule отвергает неверные смещения и зоны, строки без смещения, цели вне будущего и локальные времена внутри промежутков перехода на летнее время. Повтор летнего времени выбирает свой первый, более ранний момент. Успешное создание сохраняет только канонический UTC `scheduledAt`, поэтому воспроизведение никогда не зависит от окружающего состояния часовых поясов.

## Ввод фиксированного интервала и пропущенные срабатывания

`every_seconds` — это интервал отдельной записи не менее 300 секунд, привязанный ко времени создания. Это повторение строго с фиксированной частотой: в протоколе нет календарных или cron-выражений, зоны повторения, общего cooldown или межзаписного гейта допуска.

Когда Session была холодной или занятой на протяжении нескольких целей, одна запись Every вносит только своё последнее подошедшее к сроку срабатывание. Диспетчеризация продвигает её сразу к первой цели, выровненной по якорю создания, которая следует за временем принятия решения диспетчеризации, без перечисления, сохранения или воспроизведения пропущенных интервалов. Если следующая цель не помещается в четырёхзначный UTC год, финальная диспетчеризация завершает запись.

Когда несколько различных записей Every просрочены и ни один one-shot не подошёл к сроку, каждая вносит одно срабатывание в ту же последующую партию в порядке целей и создания. Каждая запись Every хранит независимое состояние, при этом все диспетчеризации в этой допущенной партии используют одно и то же время решения. Пакетирование ограничивает ходы модели; пятиминутный минимум ограничивает частоту таймера каждой записи.

## Долговечные изменения и воспроизведение

Событие Session `schedule/change` версии 1 — единственный долговечный авторитет Schedule. Create сохраняет полную запись, а delete — терминальный переход только по id. Диспетчеризация one-shot также терминальна и осуществляется только по id. Диспетчеризация Every несёт время решения по часам, использованное для выбора последнего подошедшего к сроку срабатывания, и обычно продвигает активную запись вместо её завершения. Диспетчеризация означает, что продолжение было синхронно поставлено в очередь, а не что ответ модели удался или что пользователь его прочитал.

```ts type-equiv
/** Creates one durable reminder record. */
interface ScheduleCreateChange {
  readonly version: 1
  readonly operation: 'create'
  readonly schedule: ScheduleRecord
}
```

```ts type-equiv
/** Deletes one currently active reminder. */
interface ScheduleDeleteChange {
  readonly version: 1
  readonly operation: 'delete'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records that one active one-shot reminder entered the durable dispatch history. */
interface OneShotScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records one fixed-rate decision and advances directly past missed occurrences. */
interface EveryScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
  /** Wall-clock decision time used to select the latest due occurrence. */
  readonly acceptedAt: string
}
```

```ts type-equiv
/** Durable dispatch shapes supported by the current rule set. */
type ScheduleDispatchChange = OneShotScheduleDispatchChange | EveryScheduleDispatchChange
```

```ts type-equiv
/** Strict version-1 durable Schedule mutation union. */
type ScheduleChange = ScheduleCreateChange | ScheduleDeleteChange | ScheduleDispatchChange
```

Строгий декодер и свёртка отвергают неизвестные версии, лишние поля, переиспользованные id, несоответствующие формы диспетчеризации one-shot или Every, а также переходы delete или dispatch против неактивных записей. Обычная Session свёртывает весь свой поток событий. Fork свёртывает только события начиная с `SessionHeader.seedLength` и позже, поэтому он сохраняет историю, не принимая активные напоминания родительской Session. Объявление `schedule/change` и его расположение в исходниках также индексируются в [каталоге персистентности](../persistence-catalog.md#schedulechange--log-only).

## Активные представления и управление

Значения инструментов соединяют долговечную запись с состоянием доставки, выведенным из текущего времени по часам. `session-local` означает, что исходная Session обязана быть живой: ни внешнего канала уведомлений, ни планировщика холодных сессий не существует.

```ts type-equiv
/** Current delivery timing derived from the durable record and wall clock. */
type ScheduleState = 'scheduled' | 'overdue'
```

```ts type-equiv
/** Fixed v1 delivery boundary: the original session must be live. */
type ScheduleDeliveryMode = 'session-local'
```

```ts type-equiv
/** Complete model-facing view of one active reminder. */
type ScheduleView = ScheduleRecord & {
  /** Whether the target remains in the future. */
  readonly state: ScheduleState
  /** Reminder delivery never leaves the owning session. */
  readonly deliveryMode: ScheduleDeliveryMode
}
```

Сгенерированный [каталог инструментов](../tool-catalog.md#deepseek-aidsh-schedule) владеет схемами аргументов и результатов для `schedule_create`, `schedule_list` и `schedule_delete`. Управляющие вызовы сериализуются с подошедшей работой в одной очереди уровня агента. Каждое чтение или решение сперва ждёт общего барьера персистентности Session; создание и фактическое удаление ждут снова после дописывания. Сбой барьера сообщает `persistence_uncertain`, вместо того чтобы гадать, зафиксировалась ли упреждающая запись. Остальные стабильные коды ошибок: `invalid_prompt`, `invalid_selector`, `invalid_rule`, `invalid_time_zone`, `not_future`, `time_out_of_range`, `frequency_too_high`, `corrupt_schedule_log` и `internal_error`.

## Живая доставка

Владелец в пределах процесса выводит свой ближайший таймер из долговечной свёртки и перечитывает время по часам после каждого ограниченного ожидания. Холодные Session не выполняют работы; повторное открытие реконструирует таймеры и делает прошлые цели просроченными. Подошедшие one-shot имеют приоритет и входят по одному за раз в последующий ход. Когда ни один one-shot не подошёл к сроку, все просроченные записи Every образуют единственную партию, описанную выше.

Подошедшая работа ждёт, пока Agent полностью освободится, и захватывает фазу обслуживания, прежде чем пересвёртывать состояние, снимать решение, ставить в очередь один `followup()` и дописывать соответствующие изменения диспетчеризации. Она никогда не вызывает `steer()` и никогда не прерывает текущий ход.

Допущенная партия one-shot или фиксированной частоты начинает один обычный последующий ход и проявляется только через обычный транскрипт беседы; у Schedule нет ни независимой долговечной веб-квитанции, ни браузерного рендерера. Если оформление или синхронное допущение в очередь не удались, диспетчеризация не записывается, а напоминание остаётся активным. Узкий интервал сбоя между допущением и долговечной диспетчеризацией может привести к повтору содержимого напоминания после восстановления, поэтому эта граница — best-effort доставка at-least-once, а не exactly-once.

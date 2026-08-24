# @deepseek-ai/dsh-tool-fs

[English](README.md) | [中文](README.zh.md) | Русский

**Файловые инструменты, обращённые к модели** — `read`, `read_image`, `write`, `edit` — и их **исполнитель**. Это слой Consumer файлового стека: он владеет именами инструментов, JSON-схемами, валидацией аргументов, секциями промпта, **окном чтения** и форматированием результатов. Читает/пишет/правит он **напрямую** через контракт провайдера `ctx.fs` ([`@deepseek-ai/dsh-fs`](../fs)). Политику актуальности/наблюдения вносит отдельный плагин ([`@deepseek-ai/dsh-fs-observation-policy`](../fs-observation-policy)) через событийный гейт `fs/*`; инструмент не привязан к нему на уровне методов. Под ограничивающим провайдером общий сервис песочничной политики обязателен для посессионного исполнения, а инструмент открывает эскалацию для мутаций файловой системы.

```ts ignore-check
// Default deployment: a ctx.fs provider, the policy plugin, then the tools.
await ctx.plugin(LocalFileSystem, { cwd: process.cwd() }) // @deepseek-ai/dsh-fs-local
await ctx.plugin(FsPolicy)                             // @deepseek-ai/dsh-fs-observation-policy (policy gate)
await ctx.plugin(LocalAttachmentStore, { dshHome })       // optional — enables durable read_image results
await ctx.plugin(ToolFs)                                  // this package — read/write/edit, plus read_image with attachments
```

`@deepseek-ai/dsh-fs-observation-policy` **необязателен**: уберите его, и инструменты работают против голого провайдера (безусловные запись/перезапись/правка, без наблюдённого состояния). Ожидается, что развёртывание, загружающее эти инструменты, загрузит и его, поэтому поведение — чтение перед записью/правкой.

`read_image` регистрируется только пока смонтирован долговечный сервис `ctx.attachments`. Исполнение дополнительно требует, чтобы именно модель, выбранная маршрутизацией, объявляла вход `image`; она разрешается через `ctx.llm.resolveModelInfo` из новейшего заголовка запроса сессии, а затем из опций агента.

## Конфигурация

Все ключи необязательны; значения по умолчанию — поставляемые лимиты чтения.

| Ключ | По умолчанию | Значение |
|---|---|---|
| `readLimit` | `2000` | Число строк по умолчанию и максимум, возвращаемых одним вызовом `read` (схема инструмента объявляет его как значение по умолчанию `limit`). |
| `readMaxLineLength` | `2000` | Символов на строку сохраняется до усечения (суффикс называет лимит). |
| `readMaxBytes` | `51200` | Байтовая граница выбранных строк одного вызова `read`; переполнение закрывает окно завершающим колонтитулом «capped». |
| `readStreamMinSize` | `10485760` | Файлы этого размера и больше (или неизвестного размера) передаются потоком вместо полной загрузки в память. |

## Инструменты (схемы — в [Agent Note о схемах файловых инструментов](../../../.agents/notes/implemented/feature/2026-06-17-filesystem-tool-schemas.md))

| Инструмент | Аргументы | Поведение |
|---|---|---|
| `read` | `file_path`, `offset?`, `limit?` | Содержимое UTF-8 с номерами строк и завершающей строкой пагинации. `offset` — с единицы; `limit` по умолчанию равен настроенному `readLimit` (2000) и им же ограничен. |
| `read_image` | `file_path` | Читает файл PNG/JPEG/WebP/GIF через ограниченный байтовый seam, сохраняет его через `ctx.attachments.saveImage` и возвращает блок изображения рядом с небольшим конвертом метаданных. Harness проверяет и уменьшает крупные поддерживаемые изображения перед следующим запросом модели, поэтому модель может читать источник напрямую, не создавая сначала миниатюру. Успех — только когда именно маршрутизированная модель объявляет вход изображений. |
| `write` | `file_path`, `content` | Создать или полностью заменить файл. С плагином политики: перезапись существующего файла требует предшествующего `read` неизменившейся версии; создание нового файла — нет. Без него: безусловно. |
| `edit` | `file_path`, непустой `old_string`, `new_string`, `replace_all?` | Литеральная замена; требуется единственное совпадение, если `replace_all` не истинен. С плагином политики: требует предшествующего `read` (любое окно) и неизменившийся с тех пор файл. Без него: безусловно. |

Имена полей — snake_case, совпадающие с Claude Code и существующими схемами инструментов harness.

Структурные успехи: `read` → `{ path, offset, lines: [{ number, text }], totalLines }`, `read_image` → `{ path, image: { attachmentId, mediaType, bytes, width, height, name?, originalDimensions?: { width, height } } }`, `write` → `{ path, operation: 'create' | 'update', before: string | null, after }` и `edit` → `{ path, before, after }`. `originalDimensions` появляется только тогда, когда нормализация уменьшила отправленный растр, и записывает размер входного изображения с учётом ориентации. Нативные презентеры сохраняют показанные ниже чтение с номерами строк и подтверждения мутаций. `write`/`edit` выводят метаданные карточки диффа, пригодные к воспроизведению, а `read` — воспроизводимое окно карточки чтения `{ path, offset, lines, totalLines, lang? }`; исполнение-локальные структурные значения в `tool/result` не добавляются, тогда как презентеры изображений выпускают долговечные блоки изображений, которые логирует результат.

## Инструмент — исполнитель; политика — событийный гейт

Инструменты **не** внедряют сервис политики и не инспектируют никакой кэш. Каждый инструмент разрешает путь через `ctx.fs.resolve(path, { cwd, signal })` — передавая cwd сессии вызывающего агента (`exec.agent.session.header.cwd`), чтобы относительный путь разрешался против рабочей области сессии, как в `dsh-tool-bash`, и пробрасывая отмену инструмента сквозь разрешение (см. [Agent Note о посессионном cwd](../../../.agents/notes/implemented/architecture/2026-07-02-fs-per-session-cwd.md)) — затем:

- **read** — один `ctx.fs.stat` (тип + маршрутизация по размеру + версия), затем `readText`/`streamText`, затем строится окно строк, затем `fs/observed` испускается простым `ctx.emit`. (1 stat.)
- **read_image** — проверяет аргумент, расширение, доступность вложений, медиатипы развёртывания и маршрут с поддержкой изображений до любого I/O; затем один `ctx.fs.stat` (записывая наблюдение `absent` для отсутствующей цели, как `read`), ограниченное `ctx.fs.readBytes` с потолком из меньшего из `imageLimits.maxImageBytes` и `imageLimits.maxMessageImageBytes` (результат — одно сообщение, несущее одно изображение), `attachments.saveImage` (адресация по содержимому, поэтому блок изображения ссылается на долговечно зафиксированный объект уже к моменту дописывания `tool/result`) и наконец `fs/observed`. (1 stat.)
- **write** — `ctx.waterfall('fs/write-intent', target, exec, () => undefined)` как необязательная защита, затем `ctx.fs.writeText(target, content, intent)`, затем `fs/observed`. (0 stat.)
- **edit** — `ctx.waterfall('fs/edit-intent', target, exec, () => undefined)` как необязательная защита, затем `ctx.fs.editText(target, edit, intent)`, затем `fs/observed`. (0 stat.)

Инструмент передаёт `exec` (контекст исполнения инструмента) как непрозрачного `actor` при каждой диспетчеризации. Дефолтные thunk-функции возвращают `undefined` (голый провайдер без ограничений). Когда загружен `@deepseek-ai/dsh-fs-observation-policy`, он занимает единственный slot принятия решения — возвращая `createIfAbsent`/`replaceIfVersion`/`{ version }` или бросая `FS_NOT_OBSERVED` — и пишет запись в `fs/observed`. Ошибки бэкендов (`FsError`) и брошенный `FS_NOT_OBSERVED` проходят через `ToolRuntime.execute()` и становятся результатами инструментов `isError` с приложенными `{ name, code }`.

Когда `ctx.fs.sandboxMode` сообщает об ограничении, write/edit объявляют `sandbox_permissions` и `justification` и разрешают одобренные повторные попытки через `ctx.approval`. Владелец политики вносит постоянную политику, нейтральную к возможностям; результаты инструментов сохраняют специфичное для операции руководство по отказу и повторной попытке.

## `fs/observed` — fire-and-forget

`fs/observed` срабатывает ПОСЛЕ того, как read/read_image/write/edit уже завершились успешно, посредством простого `ctx.emit`. Слушатель по контракту — синхронный регистратор только с побочными эффектами (у `@deepseek-ai/dsh-fs-observation-policy` это `WeakMap.set`); инструмент не защищает испускание, поэтому бросающий слушатель проявился бы как результат `isError` инструмента — асинхронное или способное упасть наблюдение не принадлежит этому событию.

`read` соглашается на конкурентное планирование, потому что его единственная мутация — синхронный регистратор версий. Гонки регистратора разрешаются в сторону отказа, когда последующий `write` или `edit` перепроверяет версию под своей блокировкой цели; оба мутирующих инструмента остаются исключительными. См. [Agent Note о параллельных вызовах инструментов](../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md).

Корень пакета экспортирует только контракт плагина Cordis (`name`, `inject`, `Config` и `apply`). Отрисовка чтения (окно строк + форматирование вывода) живёт в `src/read-render.ts` (без Cordis, независимо покрыта юнит-тестами); `src/read.ts`/`read-image.ts`/`write.ts`/`edit.ts` — исполнители инструментов, а `src/index.ts` их собирает.

## Model Experience

### Системный промпт

#### What the model sees

Каждый запрос в скоупе регистрации этого плагина получает приведённое ниже независимо зарегистрированное руководство для read, write и edit. Ограничения инструментов в рамках скоупа могут скрыть схемы, не убирая этих секций.

##### Руководство для read

```markdown
Use the read tool — not shell commands like cat — to inspect text files. Results include line numbers. Use offset and limit to continue reading large files.
```

##### Руководство для write

```markdown
Use the write tool to create files or completely replace file contents. Existing files are overwritten, so read an existing file first (the default fs-observation-policy requires it) and prefer edit for targeted changes.
```

##### Руководство для edit

```markdown
Use the edit tool for targeted changes to existing UTF-8 text files. It replaces literal old_string with new_string; by default old_string must appear exactly once. If old_string appears multiple times, provide a more specific old_string or set replace_all to true. Read the file first (the default fs-observation-policy requires it), unless you just created or edited it in this session.
```

#### Token effect

Фиксированная цена руководства на каждый запрос, пока плагин активен, даже когда ограничение скрывает один или несколько инструментов.

#### KV Cache effect

Префиксно-стабильно, пока скоуп плагина и текст руководства не менялись. Ограничения инструментов эту секцию не убирают, но активация или освобождение плагина могут инвалидировать переиспользование с неё.

### Схемы инструментов

#### What the model sees

Модель видит сгенерированные [схемы `read`, `read_image`, `write` и `edit`](../../../docs/tool-catalog.ru.md#deepseek-aidsh-tool-fs) со snake_case-аргументами. Инструмент изображений появляется только пока смонтировано долговечное хранилище вложений; его схема независима от маршрута, а строгий гейт отказывает при исполнении. Ограничения инструментов в рамках скоупа могут убрать любое определение для одного агента.

#### Token effect

Фиксированная цена схемы в каждом запросе этого представления инструментов.

#### KV Cache effect

Префиксно-стабильно, пока видимые определения инструментов и их порядок не менялись. Жизненный цикл регистрации или скоупные ограничения могут инвалидировать переиспользование с первого изменившегося токена схемы.

### Результат чтения

#### What the model sees

Успешный read — это ровно `<path><displayPath></path>`, перевод строки, `<type>file</type>`, перевод строки, `<content>`, строки с номерами вида `<lineNumber>: <text>`, пустая строка, одна завершающая строка и `</content>`. Завершающая строка — ровно одна из: `(Output capped. Showing lines <start>-<end>. Use offset=<next> to continue.)`, `(Showing lines <start>-<end> of <total>. Use offset=<next> to continue.)` или `(End of file - total <total> lines)`. Длинная строка заканчивается ровно `... (line truncated to <max> chars)`. Отсутствующее чтение всё равно возвращает `FS_NOT_FOUND`, но записывает подтверждённое отсутствие для вызывающей сессии; после перечитывания внешне удалённого файла повторный `write` может безопасно воссоздать его через защиту провайдера от перезаписи.

#### Token effect

Вывод чтения ограничивают `readLimit`, `readMaxLineLength` и `readMaxBytes`; удержанные вызов и результат пересылаются до компакции.

#### KV Cache effect

Append-only; заново видимое содержимое следует за переиспользуемым префиксом запроса и не инвалидирует существующие записи KV-кэша.

### Результат чтения изображения

#### What the model sees

Успешный `read_image` возвращает `<path><displayPath></path>`, `<type>image</type>` и конверт `<content>`, называющий медиатип, нормализованные размеры и размер в байтах, за которым следует само изображение как нативный блок изображения. Результат логируется со своей долговечной ссылкой перед следующим запросом модели.

#### Token effect

Изображение тарифицируется в каждом позднейшем запросе до компакции. Каждый вызов независимо ограничен хранилищем вложений `maxImageBytes`/`maxImagePixels`/`maxImageDimension`; повторные успешные вызовы накапливают историю, а адресация по содержимому дедуплицирует только сохранённые байты, но не токенную цену каждого запроса.

#### KV Cache effect

Append-only; заново видимое содержимое следует за переиспользуемым префиксом запроса и не инвалидирует существующие записи KV-кэша.

### Результаты write и edit

#### What the model sees

Write возвращает точный пятистрочный конверт `<path><displayPath></path>`, `<type>file</type>`, `<content>`, `Created file` или `Updated file`, затем `</content>`. Edit возвращает ровно `The file <displayPath> has been updated successfully.` или, для `replace_all`, `The file <displayPath> has been updated. All occurrences were successfully replaced.` Полный текст записи или замены остаётся в аргументах вызова инструмента ассистента.

#### Token effect

Текст успеха невелик, но крупные аргументы мутаций и любой результат пересылаются до компакции.

#### KV Cache effect

Append-only; заново видимое содержимое следует за переиспользуемым префиксом запроса и не инвалидирует существующие записи KV-кэша.

### Ошибки инструментов

#### What the model sees

Отказы нормализуются как `Error: <message>`. Стабильные сообщения валидации и чтения этого пакета: `file_path must be a non-empty string`, `limit must be less than or equal to <max>`, `old_string must be a non-empty string`, `old_string and new_string must differ`, `cannot read "<path>": not found`, `cannot read "<path>": not a regular file`, `offset <offset> is out of range for "<path>" (<total> lines)`, `cannot read "<path>": read_image only accepts PNG/JPEG/WebP/GIF paths`, `cannot read "<path>" as an image: model "<model>" does not declare image input; switch to an image-capable model to read images` и исправление при расхождении `cannot read "<path>": the <ext> extension declares <type>, but the bytes use a different image format; rename the file to match its actual format if it is PNG/JPEG/WebP/GIF, or convert it to one of those formats`. Неудачная 16-битная конверсия сообщает `cannot read "<path>": the 16-bit PNG could not be converted to the normalized 8-bit sRGB form; convert it to an 8-bit PNG/JPEG/WebP and retry`. Шаблоны провайдеров и политик цитируются в README их пакетов. Отказы защищённых мутаций вдобавок несут в сообщении инструкцию восстановления, дописываемую обращённым к модели обработчиком ошибок этого пакета: `FS_STALE_VERSION` получает `— re-read the file, then retry`, а `FS_NOT_OBSERVED` получает `— read the file, then retry`; структурный код сохраняется. Когда перечитывание подтверждает отсутствие, edit сообщает `FS_NOT_FOUND` вместо повторения устаревшего совета, а write использует защищённое создание.

#### Token effect

Только неудавшийся вызов добавляет эти удержанные токены.

#### KV Cache effect

Append-only; заново видимое содержимое следует за переиспользуемым префиксом запроса и не инвалидирует существующие записи KV-кэша.

## Known Limitations and Deferred Work

- **Обращённого к модели списка каталогов нет** — `ctx.fs.listDir` обслуживает код провайдеров вроде обнаружения скиллов, а соседний пакет [`dsh-tool-fs-search`](../tool-fs-search/) поставляет `glob` и `grep` на ripgrep, а не расширяет файловый seam.
- **`read` обрабатывает только текстовые файлы UTF-8** — изображения идут через отдельный маршрутизируемый по расширению инструмент `read_image`; PDF, аудио и видео остаются отложенными. Каталог как цель даёт `FS_NOT_REGULAR_FILE`.
- **Медиатип объявляется расширением** — расширение выбирает объявленный тип, а валидация магических байтов в хранилище вложений остаётся авторитетной; правильно форматированное изображение под неверным расширением отвергается с советом переименовать файл, а не распознаётся по содержимому.
- **Встроенного предпросмотра изображения на карточке результата инструмента нет** — поверхности UI отображают результат с изображением обобщённо (долговечную ссылку, не пиксели); встроенный рендеринг отложен до пакетов UI.
- **Инструмента области вложения нет** — агент может кадрировать изображение через другие доступные инструменты, когда у него есть файловый путь. Вставленное или перетащенное изображение без пути нельзя перечитать в большем разрешении.
- **Поверхности тайм-аута нет** — `read`/`write`/`edit` не принимают аргумент тайм-аута и не объявляют бюджет `timeout-policy`; отмена передаётся только через `exec.signal` ([обоснование провайдера](../README.md#no-timeouts-on-file-io)).

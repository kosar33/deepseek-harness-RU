# Добавьте узел диалога в Web Client

[English](adding-a-conversation-node.md) | [中文](adding-a-conversation-node.zh.md) | Русский

Этот туториал добавляет одну принадлежащую бизнесу строку в представление Chat веб-клиента. Готовый плагин коррелирует семейство долговечных событий сессии в один контекст, инкрементально строит бизнес-состояние, публикует типизированные данные Step и рендерит Chat Node с ключом, не сканируя окно сессии или другие отрендеренные узлы. Предполагается, что Host уже записывает события и клиентский плагин включён в композицию веб-бандла; внешние Host-side UI и дополнительные цели представлений вроде Trajectory остаются за рамками туториала.

[Решение о сборке узлов диалога](../../.agents/notes/implemented/architecture/2026-08-09-client-conversation-node-assembly.md) владеет обоснованием и полной моделью движка. Это руководство описывает путь реализации.

## 1. Спроектируйте воспроизводимое семейство событий

Выберите один стабильный бизнес-id до написания Definition. Каждое событие, вносящее вклад в один и тот же узел, **ДОЛЖНО** нести этот id или выводить его независимо из собственной полезной нагрузки; клиент **НЕ ДОЛЖЕН** никогда назначать обновление контексту «последнего незавершённого».

Для задачи ревью контракт событий мог бы выглядеть так:

| Событие | Роль | Необходимые долговечные факты |
|---|---|---|
| `review/start` | уникальный старт | `reviewId`, координаты Turn/Step, заголовок |
| `review/progress` | обновление | тот же `reviewId`, координаты, воспроизводимый прогресс |
| `review/end` | обновление | тот же `reviewId`, координаты, итоговая сводка |

Используйте принадлежащий производителю branded-тип id через границу процесса. Поместите слияние `SessionEventMap` и типы полезных нагрузок в type-only экспорт производителя, затем импортируйте этот экспорт ради побочных эффектов из клиентского пакета. У каждой пары `(kind, id)` может быть не более одного стартового события. Бизнес с единственным событием может использовать стабильную идентичность события, например `event.seq`, как локальный для Definition id.

Инкрементальные события поддерживаются. Предпочитайте чекпоинты целого значения, когда производитель может дёшево их эмитить: они остаются полезными, когда старт лежит вне загруженного окна. Каждая дельта **ДОЛЖНА** нести стабильный id и давать детерминированное состояние при воспроизведении в возрастающем `seq` журнала; она **НЕ ДОЛЖНА** зависеть от памяти, доступной только в живом процессе. Если текущее окно истории содержит только обновления, сборщик держит отложенный контекст и не строит состояние, пока более старая страница не принесёт старт. Если продукт **ДОЛЖЕН** отрендерить до загрузки старта, терминальное или чекпоинт-событие **ДОЛЖНО** нести достаточно целого резервного состояния, чтобы Definition построил этот результат напрямую; не восстанавливайте его сканированием несвязанных событий.

## 2. Реализуйте Definition и типизированную полезную нагрузку Chat

Пример держит декларации производителя и клиентский вклад в одном блоке, чтобы была видна полная связь. В семействе пакетов держите branded-id и декларацию `SessionEventMap` у производителя событий, а Definition, слияние данных Chat и рендерер — в клиентском плагине.

```ts ignore-check
import { createElement } from 'react'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  ClientContext, ConversationLocation, ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

type ReviewId = Branded<'ReviewId'>

interface ReviewStartData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly title: string
}

interface ReviewProgressData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly completed: number
}

interface ReviewEndData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly summary: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Opens one durable review job.
     * @mode emit
     * @param data - stable identity, location, and initial display state.
     */
    'review/start': ReviewStartData
    /**
     * Records replayable progress for one review job.
     * @mode emit
     * @param data - stable identity, location, and latest progress.
     */
    'review/progress': ReviewProgressData
    /**
     * Closes one review job with its final summary.
     * @mode emit
     * @param data - stable identity, location, and final display state.
     */
    'review/end': ReviewEndData
  }
}

interface ReviewChatData {
  readonly title: string
  readonly completed: number
  readonly status: 'running' | 'completed'
  readonly summary?: string
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'review-job': ReviewChatData
  }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationStepDataMap {
    'review-job': ReviewChatData
  }
}

interface ReviewState extends ReviewChatData {
  readonly turn: number
  readonly step: number
}

function locationOf(context: ConversationNodeContext): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

function viewData(state: ReviewState): ReviewChatData {
  return {
    title: state.title,
    completed: state.completed,
    status: state.status,
    ...state.summary === undefined ? {} : { summary: state.summary },
  }
}

const reviewDefinition: ConversationNodeDefinition<ReviewState> = {
  kind: 'review-job',
  target: 'chat',
  match: (event) => {
    if (event.type === 'review/start') {
      return { id: String(event.data.reviewId), role: 'start' }
    }
    if (event.type === 'review/progress' || event.type === 'review/end') {
      return { id: String(event.data.reviewId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'review/start') throw new Error('review-job requires review/start')
    return {
      turn: match.event.data.turn,
      step: match.event.data.step,
      title: match.event.data.title,
      completed: 0,
      status: 'running',
    }
  },
  update: (context, match) => {
    if (match.event.type === 'review/progress') {
      return { ...context.state, completed: match.event.data.completed }
    }
    if (match.event.type === 'review/end') {
      return { ...context.state, completed: 100, status: 'completed', summary: match.event.data.summary }
    }
    return context.state
  },
  publication: match => match.event.type === 'review/progress'
    ? 'animation-frame'
    : 'immediate',
  buildLocationData: (context, scope) => {
    if (scope !== 'step' || context.state === undefined) return null
    return {
      kind: 'step',
      turn: context.state.turn,
      step: context.state.step,
      key: 'review-job',
      value: viewData(context.state),
    }
  },
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'review-job',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
      location: locationOf(context),
      visibility: 'visible',
      data: viewData(context.state),
    }
  },
}

function ReviewNodeView({ node }: ChatNodeViewProps<'review-job'>) {
  const text = node.data.summary ?? `${node.data.title}: ${node.data.completed}%`
  return createElement('p', null, text)
}

export const inject = ['conversationEvents', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(reviewDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'review-job',
  }, ReviewNodeView))
}
```

`match(event)` — функция извлечения идентичности, а не свёртка: он получает только текущее событие и возвращает локальный для Definition id и роль жизненного цикла. После совпадения сборщик находит контекст по `(kind, id)` и вызывает `start` один раз либо `update` с текущим состоянием. Обе функции возвращают состояние, которое принимает движок; предпочтительно возвращать новое иммутабельное значение, но функция, мутирующая и возвращающая тот же объект, имеет ту же семантику принятия значения.

`buildLocationData(context, scope)` опционально публикует данные, которыми владеет Definition, на принадлежащий движку Turn или Step. Используйте declaration merging, чтобы дать каждому ключу точный тип значения. Другой узел в той же локации может потребить это значение через свой ограниченный slot-хук, например `useTurnData(key)`, не получая сессию и не сканируя `snapshot.chat.nodes`.

`target` и `buildViewNode(context)` объявляют один вклад рендера, которым владеет цель, и **ДОЛЖНЫ** появляться вместе. Сохраняйте `context.key` как идентичность для React, выбирайте `anchorSeq` по долговечным данным о порядке и возвращайте только готовые для рендерера данные. После публикации целевого узла продолжайте возвращать тот же ключ; используйте `visibility: 'hidden'`, когда он должен временно покинуть видимый поток, вместо того чтобы отзывать его через `null`.

## 3. Запрашивайте более ранний бизнес-контекст только в start

Некоторым Definition нужно ближайшее более раннее состояние другого бизнес-вида. `start` получает `ConversationContextReader`; вызывайте там `reader.previous<State>(kind)` вместо того чтобы принимать коллекцию контекстов или сканировать события. Ридер возвращает ближайший запущенный контекст перед текущим стартовым `seq` как read-only данные.

Сборщик записывает эту зависимость. Если более старый prepend позже принесёт более близкого предшественника, закроет ранее неизвестный разрыв окна или пересмотрит состояние предшественника, он перезапускает зависимый контекст с `start` и воспроизводит его обновления в возрастающем `seq`. Definition, выполнивший запрос, остаётся ответственным за запись полезного состояния; ридер не предоставляет бизнес-специфичных методов запроса и не даёт полномочий на мутацию чужого контекста.

## 4. Поймите три пути приёма данных

Историю можно запрашивать от хвоста назад по одной странице за раз, но каждая принятая страница нормализуется в возрастающий `seq` перед воспроизведением состояния.

| Путь | Работа движка | Поведение, видимое Definition |
|---|---|---|
| Замена при открытии, ресинке или устранении разрыва | Перестроить загруженное окно, сопоставить каждое событие один раз на Definition, затем воспроизвести каждый запущенный контекст | `start`, затем его обновления в возрастающем `seq`; отложенные контексты только с обновлениями остаются без состояния |
| Prepend одной более старой страницы | Сопоставить только свежие старые события, влить их в контексты по `(kind, id)`, сохранить существующие узлы с ключами и воспроизвести только затронутые контексты и зависимости | Вновь найденный старт активирует собранные им обновления; изменившаяся локация или предшественник могут перезапустить контекст |
| Append одного живого события | Вызвать `match` каждого Definition один раз, найти совпавший контекст по ключу и обновить только этот контекст | Один `update` и одна запрошенная публикация для совпавшего пост-стартового события; без сканирования существующих контекстов |

При `D` зарегистрированных Definition одно входящее событие выполняет `D` сопоставлений текущего события и lookup ключа контекста за константное время после совпадения. Код Definition **ДОЛЖЕН** сохранять это свойство: не обходите полное окно событий, все контексты, `context.matches` или коллекцию отрендеренных узлов на обычном пути append. Используйте состояние для накопленных фактов, данные локации для совместного использования внутри одного Turn/Step и `reader.previous()` для индексированных зависимостей от предшественников.

`publication` управляет моментом материализации изменённого состояния. Используйте `immediate` для структурных или терминальных изменений, `animation-frame` для высокочастотных видимых дельт и `none`, когда изменение состояния служит входом только для последующей публикации. Движок всё равно применяет каждое обновление в порядке журнала; темп лишь объединяет публикацию представления.

## 5. Проверьте воспроизведение, пагинацию и рендеринг

Добавьте сфокусированные тесты, устанавливающие эти результаты:

1. Полное окно, проведённое через replace, даёт ожидаемое финальное состояние, данные локации, полезную нагрузку узла и `anchorSeq`.
2. Хвост из одних обновлений остаётся отложенным; prepend уникального старта даёт тот же результат, что и полная замена.
3. Начальная история с последующим живым append даёт тот же результат, что и воспроизведение объединённого окна.
4. Prepend более старой страницы добавляет более ранние строки, не заменяя существующие значения узлов с ключами, чьи данные не изменились.
5. Повторяющиеся видимые дельты сохраняют `context.key` и публикуются по запросу не чаще одного раза на кадр анимации.
6. Рендерер с ключом потребляет только `node.data` и ограниченные хуки локации; он не сканирует окно событий сессии, контексты или Chat Node'ы.

Используйте [`packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts`](../../packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts) как образец потоковой передачи и прерываний, [`inbox.ts`](../../packages/client/ui-conversation/src/client/conversation-nodes/inbox.ts) вместе с [`message.ts`](../../packages/client/ui-conversation/src/client/conversation-nodes/message.ts) — для запросов предшественников, а [`packages/client/ui-deliverables`](../../packages/client/ui-deliverables) — как пример Definition, публикующего данные Turn без создания собственного узла.

<!-- Английский источник генерируется скриптом scripts/gen-doc-graphs.ts; этот русский файл — сопровождаемая парная сторона.
     При обновлении сначала выполните `pnpm run gen-doc-graphs` для английской стороны, затем обновите этот файл. -->

# Жизненный цикл хода и шага агента

[English](agent-lifecycle.md) | [中文](agent-lifecycle.zh.md) | Русский

Эта диаграмма последовательности — визуальный компаньон [документа об архитектуре](architecture.ru.md#поток-хода). Долговременные факты воспроизведения она держит на `session/event`, живые управление и статус — на `agent/*`.

```mermaid
sequenceDiagram
  participant User
  participant Agent
  participant Driver
  participant Hooks as hook listeners
  participant Prompt as ctx.systemPrompt
  participant LLM as ctx.llm
  participant Tools as ctx.tools
  participant Session
  participant SDK as UI or SDK listener
  User->>Agent: followup(content)
  Agent-->>SDK: <code>agent/inbox/spliced</code>
  Agent-->>SDK: <code>agent/inbox/inserted</code> { message }
  Agent->>Driver: queued work wakes driver
  Driver-->>SDK: <code>agent/status</code> running
  Driver->>Session: <code>turn/start</code>
  Note over Agent,Driver: claim pending next-step input plus one queued prompt
  Driver-->>SDK: <code>agent/inbox/spliced</code> pure deletion
  Driver-->>SDK: <code>agent/inbox/claimed</code> { message, turn } per message
  Driver->>Hooks: <code>agent/pre-step</code> waterfall
  Hooks-->>Driver: authoritative reject or enter(messages)
  alt proposed step rejected or pre-step failed
    Driver-->>Driver: claimed batch stays removed, the open turn spends no step
  else enter proposed step
  Driver->>Session: <code>step/start</code>
  Driver->>Session: <code>user/message</code> per entered message
  Driver->>Prompt: <code>system-prompt/assemble</code> waterfall
  Driver->>LLM: <code>agent/request</code> waterfall, then <code>llm/stream</code> waterfall
  LLM-->>Driver: StreamChunk*
  Driver->>Session: <code>assistant/chunk</code>*
  Session-->>SDK: <code>session/event</code> <code>assistant/chunk</code>*
  alt final adapter or terminal in-band request failure
    Driver->>Session: <code>step/end</code>
    Driver->>Hooks: <code>agent/request-error</code> waterfall
    Hooks-->>Driver: return retry action or preserve the original error
  else model request succeeded
  Driver->>Session: <code>assistant/message</code>
  Driver->>Tools: classify pending call by executionMode
  loop barriers and bounded rolling pool, reclassify before start
    opt call starts
      Driver->>Session: <code>tool/call</code>
      Driver->>Tools: ordered pre, concurrent execute
      Tools-->>Session: tool-owned events when applicable
    end
    opt next model-order result ready
      Driver->>Tools: ordered post
      Driver->>Session: <code>tool/result</code>
    end
  end
  Driver->>Session: <code>step/end</code>
  opt natural stop and next-step inbox empty
    Driver->>Hooks: <code>agent/turn-stopping</code> serial terminal checkpoint
  end
  opt next-step input is pending
    Driver-->>Driver: claim pending next-step input
    Driver-->>SDK: <code>agent/inbox/claimed</code> { message, turn } per message
    Driver->>Hooks: <code>agent/pre-step</code> waterfall
    Hooks-->>Driver: authoritative reject or enter(messages)
  end
  end
  end
  Driver->>Session: <code>turn/end</code>
  Driver-->>SDK: <code>agent/status</code> idle
```

Событие `assistant/message` записывает каждый успешный вызов провайдера, включая завершения без содержимого и по причине `max-tokens`. Пустое содержимое остаётся вне производной истории, тогда как долговременное событие хранит расход токенов и `sourceEventSeqs` со списком точных событий `assistant/chunk`, включая явный пустой список.

`dsh-compaction-basic` использует `agent/pre-step` для давления до вывода запроса и `agent/request-error` — только для канонического переполнения контекста. Как только один из триггеров срабатывает, перед выбором резюме выполняется необязательная обрезка результатов инструментов. Восстановление работает между закрытым отказавшим шагом и закрытием отказавшего хода и открывает свежий ход повторной попытки, только когда обрезка или суммаризация продвигает поколение замены поверхности; иначе первоначальная ошибка запроса остаётся авторитетной.

Возвращённое решение `agent/pre-step` авторитетно; слушатели, оборачивающие `next()`, сохраняют нижележащие сообщения, если замена не была намеренной. Steering (корректировка хода диалога) и внедрённый контекст проходят тот же каскад после того, как более поздняя операция клеймления забирает их батч следующего шага.

Пользователям SDK, которым нужны воспроизводимые данные транскрипта, следует потреблять `session/event`; `agent/*` — живой координационный API для очереди и статуса, перехвата промпта, построения запроса, steering, продолжения и ошибок.

Режим сопровождения: курируемая Mermaid-последовательность; точные сигнатуры событий живут в сгенерированном каталоге Cordis.

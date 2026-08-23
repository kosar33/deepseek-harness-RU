<!-- Английский источник генерируется скриптом scripts/gen-doc-graphs.ts; этот русский файл — сопровождаемая парная сторона.
     При обновлении сначала выполните `pnpm run gen-doc-graphs` для английской стороны, затем обновите этот файл. -->

# Пайплайн исполнения инструментов

[English](tool-execution-pipeline.md) | [中文](tool-execution-pipeline.zh.md) | Русский

Этот граф показывает, где исполняются политика, хуки, песочница, guard'ы файловой системы, перезапись результата, наблюдение итогового исхода и рендеринг UI — без изменения цикла. Первым запускается каскад `tools/pre-execute`, следом — монотонные guard'ы, затем каскады `tools/execute` и `tools/post-execute`; эти три каскада могут преобразовать вызов. После них исполняются принадлежащие определению `finalizeContent` и `tools/result`.

```mermaid
flowchart TD
  model["Assistant message contains tool-call block"]
  toolCall["Session event: <code>tool/call</code><br/>logged before execution"]
  presentCall["UI pending card<br/>presentCall(args)"]
  pre["<code>tools/pre-execute</code> waterfall<br/>hooks, permission, sandbox"]
  guards["Registered monotonic guards<br/>deny or abstain; identity protected"]
  denied["denied or approval refused<br/>tool body skipped"]
  approval["<code>ctx.approval</code> one-shot prompt<br/>absent or unanswerable: deny"]
  around["<code>tools/execute</code> waterfall<br/>timeout, retry, metrics (around dispatch)"]
  toolBody["Registered tool execute() body"]
  fsGate["<code>fs/write-intent</code> or <code>fs/edit-intent</code><br/>tool-fs mutations only"]
  owned["Tool-owned session events<br/><code>todo/write</code>, <code>fs/observed</code>, <code>hook/invoked</code>, <code>hook/result</code>, <code>tool/code-dispatch</code>"]
  post["<code>tools/post-execute</code> waterfall<br/>accept, block, replace, add context"]
  normalized["Registry outer normalization<br/>pipeline/result snapshot throws become isError"]
  finalize["ToolDefinition.finalizeContent<br/>last content-only invariant"]
  final["<code>tools/result</code> synchronous notification<br/>frozen authoritative outcome"]
  context["Active-batch additionalContexts FIFO<br/>injected user/message after recorded tool results"]
  toolResult["Session event: <code>tool/result</code><br/>single model-facing outcome"]
  allResults["Tool batch settled<br/>recorded tool/result events complete"]
  presentResult["UI completed card<br/>presentResult(args, result)"]
  model --> toolCall
  toolCall --> presentCall
  toolCall --> pre
  pre -->|allow| guards
  guards -->|allow| around
  guards -->|deny| denied
  guards -.->|throw| normalized
  around --> toolBody
  pre -->|deny| denied
  pre -->|ask| approval
  approval -->|allowed-once| guards
  approval -->|rejected, cancelled, unavailable| denied
  approval -.->|throw| normalized
  denied --> post
  pre -.->|throw| normalized
  toolBody --> fsGate
  fsGate --> toolBody
  toolBody --> owned
  toolBody --> around
  around --> post
  around -.->|wrapper throws| normalized
  post -.->|throw| normalized
  post --> finalize
  normalized --> finalize
  finalize --> final
  final --> toolResult
  toolResult --> presentResult
  toolResult --> allResults
  allResults --> context
```

Проверки чтения перед правкой в файловой системе остаются ниже `tool-fs`, на событиях `fs/*`. Обобщённые каскады pre/post — место для хуков и политики одобрения; `ctx.approval` обрабатывает запросы на одобрение до монотонных guard'ов, а политика владельца, которую нельзя переупорядочивать, остаётся зарегистрированным guard'ом. Задачи around-диспетчеризации, такие как таймауты, оборачивают `tools/execute`. Реестр выполняет снапшот результата-кандидата без потерь и нормализует сбой снапшота до того, как колбэк `finalizeContent` видимого определения на основе снапшота обеспечит свой синхронный content-only инвариант. Затем `tools/result` наблюдает неизменяемый исход в формате lossless-JSON. Это позволяет хукам охватывать семейства инструментов, не привязывая инструменты к одному сервису политики. Code Mode проводит через пайплайн как зарезервированный транспорт `run_code`, так и его сериализованные подвызовы; подвызовы несут токен родителя, логируют `tool/code-dispatch`, возвращают отказы как binding rejections и опускают `additionalContexts`, чтобы сохранить смежность вызова и результата.

Режим сопровождения: курируемый Mermaid-граф; точные схемы инструментов и сигнатуры событий приведены в сгенерированных каталогах.

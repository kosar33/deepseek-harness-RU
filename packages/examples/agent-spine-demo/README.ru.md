# @deepseek-ai/dsh-agent-spine-demo

[English](README.md) | [中文](README.zh.md) | Русский

**Агентский стержень по умолчанию — без исполнителя и без UI — в виде ОДНОГО бандл-плагина Cordis.** Он загружает фиксированный набор сервисов, нужный каждому агенту harness, включая локального провайдера скиллов, и пробрасывает список `agents` цикла как собственную конфигурацию, поэтому пакету приложения достаточно добавить точку входа и сменные бэкенды, чтобы собрать работающего агента.

Полное дерево плагинов и порядок их композиции описывает этот пакет.

## Дерево, которое он загружает

`apply(ctx, config)` монтирует каждого из них как ребёнка fiber бандла:

```
@deepseek-ai/cordis-plugin-timer  timer service (writes nothing to stdout)
@deepseek-ai/dsh-llm              abstract LLM service + content-block vocabulary
@deepseek-ai/dsh-session          event-sourced session log + store
@deepseek-ai/dsh-session-title    log-backed title service + deterministic fallback
@deepseek-ai/dsh-system-prompt    prompt-section + tool-schema assembly
@deepseek-ai/dsh-tools            registry + guarded pre/around/post/final-result pipeline
@deepseek-ai/dsh-skill            skill provider registry
@deepseek-ai/dsh-skill-filesystem      local filesystem skill provider
@deepseek-ai/dsh-agent            agent registry + initiator scope + agent/* events
@deepseek-ai/dsh-goal             optional persisted same-session goal domain
@deepseek-ai/dsh-tool-goal        optional model-facing goal controls
@deepseek-ai/dsh-goal-round-driver     optional same-session goal-round driver
@deepseek-ai/dsh-llm-retry        provider-routed request retry policy
@deepseek-ai/dsh-jobs-local      generic background-job registry
@deepseek-ai/dsh-invariants       configurable invariant registry service
@deepseek-ai/dsh-session/invariant
@deepseek-ai/dsh-agent/invariant
@deepseek-ai/dsh-scope/invariant
@deepseek-ai/dsh-agent-loop/invariant
                                  package-owned relational checks
@deepseek-ai/dsh-tool-bash        the model-facing bash schema (unless toolBash=false)
@deepseek-ai/dsh-agent-instructions  AGENTS.md/CLAUDE.md workspace context loader
@deepseek-ai/dsh-tool-skill       session-prefix skill catalog + model-facing loader schema
@deepseek-ai/dsh-tool-jobs       job_output/job_list/job_kill schemas + completion notices
@deepseek-ai/dsh-agent-loop       THE concrete loop (gets the forwarded `agents`)
                                  (dsh-system-prompt gets the forwarded `persona`)
```

## Что намеренно остаётся ЗА пределами бандла

Стержень — это всё ОБЩЕЕ для каждой точки входа. Сменные и привязанные к точке входа части остаются вовне и выбираются тем, кто загружает бандл:

- **адаптер LLM** — бандл поставляет абстрактный сервис `llm`; лист регистрирует конкретного адаптера на `ctx.llm` (`llm-deepseek`, `llm-pi-ai`, `llm-replay`).
- **провайдеры заголовков сессий на модели** — бандл монтирует резервный сервис с переопределяемыми примерными лимитами (5 слов, 40 байт резервного заголовка, 80 байт принятого заголовка); лист может подключить ровно одного LLM-провайдера — по первому промпту или по всем сообщениям.
- **исполнитель bash** — бандл поставляет `tool-bash` (потребительскую схему); лист предоставляет `ctx.shell` (`bash-local` или реализацию в песочнице).
- **нелокальные провайдеры скиллов** — бандл поставляет реестр скиллов, локальный провайдер файловой системы и инструмент `skill`; развёртывания могут добавлять других провайдеров, например встроенные или удалённые каталоги, как соседей.
- **точка входа и инфраструктура приложения** — пакеты приложений headless, ACP и JSON-RPC владеют транспортом, stdout и решениями о перезагрузке. `timer` остаётся в стержне, потому что он общий и молчит в stdout.

Так разделение [Service Definition / Service Provider / Consumer](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md) применяется на уровне композиции: бандл владеет общим стержнем, лист — бэкендами, пакет приложения — точкой входа.

## Конфигурация

```ts
import type { Config } from '@deepseek-ai/dsh-agent-spine-demo'
// { agents?, maxParallelToolCalls?, includeHarnessIdentity?, includeRuntimeContext?, persona?, toolOrder?, tools?, dshHome?, sessionTitle?, skills?, workspaceContext, toolBash?, jobs?, toolJobs?, goals?, invariants? }
// workspaceContext requires { maxBytes } or false; the other owner schemas supply defaults.
```

Бандл пробрасывает каждое поле ребёнку, которому оно принадлежит. Пакеты приложений поставляют предварительно созданных агентов: композиции headless и JSON-RPC создают `main`, а приложение ACP создаёт агентов по требованию на `session/new`. `includeRuntimeContext: false` пробрасывается в `dsh-system-prompt` и подавляет все динамические снапшоты контекста для свежих сессий, не отключая их сервисы политики. Настройки промпта, инструментов, заголовков, скиллов, агентских инструкций, инвариантов, целей и задач сохраняют схемы и значения по умолчанию, задокументированные пакетами-владельцами; `jobs.maxConcurrentJobsPerOwner` конфигурирует локального провайдера независимо от обращённых к модели регуляторов `toolJobs`. `pickSpineConfig()` копирует только поля, принадлежащие этому бандлу, а конфликтующие значения `dshHome` приводят композицию к ошибке.

Например, `{ invariants: { enabled: true, package_allowlist: ['^@deepseek-ai/dsh-'], package_blocklist: ['agent-loop$'] } }` оставляет смонтированными компаньоны пакетов, но подавляет заблокированного владельца. Совпадения blocklist перекрывают совпадения allowlist; правила регулярных выражений и жизненного цикла см. в [`dsh-invariants`](../../runtime-diagnostics/invariants/README.ru.md).

## Почему кодовый бандл, а не общий YAML-инклюд

YAML-инклюд умеет дедуплицировать конфигурацию, но не может владеть bin или задавать умолчания точки входа. Пакет приложения ACP делает чисто протокольную разводку stdout умолчанием, хотя лист всё ещё может добавить небезопасный логгер. Дети бандла регистрируют сервисы в хранилище с ключами по корневому isolate, поэтому соседи-листья видят их через внедрение без связи с порядком загрузки.

Политика повтора может повторить неудавшийся запрос новым нумерованным шагом. Статус повтора, ошибки провайдера и оборванные частичные чанки остаются вне истории модели; каждая попытка к провайдеру всё же может обернуться списанием, режим `always` не имеет предела попыток, точки входа суммируют расход по всем записанным шагам, а реконструированный запрос сохраняет прежний префикс для переиспользования кэша провайдера.

## Опыт модели

Косвенно, через `dsh-system-prompt`, `dsh-tool-skill`, `dsh-tool-bash`, `dsh-tools` и `dsh-llm-retry`, а также `dsh-tool-goal` и промпты goal-round, когда включены `goals`. Собственного обращённого к модели содержимого-обёртки бандл не добавляет.

#### Влияние на KV-кэш

Прямой инвалидации нет; изменениями префикса запроса владеет названный потребитель.

## Известные ограничения и отложенная работа

- **Большая часть набора стержня зафиксирована в коде** — `apply()` всегда монтирует основные сервисы; конфигурация может убрать бандльные цели, скиллы, bash и инструменты управления задачами, но заменить цикл или выбросить другого участника стержня значит собрать другой бандл.
- **Сервис инвариантов и компаньоны остаются постоянными участниками** — `invariants.enabled: false` или фильтры пакетов подавляют проверки, но не удаляют сервис и регистрации компаньонов; постоянно включённая валидация и фиксация Session идут отдельно.

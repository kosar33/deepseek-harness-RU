# Скиллы

[English](skills.md) | [中文](skills.zh.md) | Русский

[Семейство возможностей skill](../../packages/skill) включает Service Definition ([dsh-skill](../../packages/skill/skill), `ctx.skills`), локального Service Provider ([dsh-skill-filesystem](../../packages/skill/skill-filesystem)), опционального провайдера упакованного бейджа ([dsh-skill-badge](../../packages/skill/skill-badge)) и Consumer ([dsh-tool-skill](../../packages/skill/tool-skill)). Реестр сливает каталоги провайдеров через host-слой и слои по скоупам; провайдеры поставляют локальные или упакованные скиллы; Consumer владеет начальным и замещающим каталогами плюс обращённым к модели инструментом `skill`. Скиллы — необязательные инструкции, а не события сессии, поэтому их словарь живёт здесь, а не в [core.md](core.ru.md).

Источник: [`packages/skill/skill/src/index.ts`](../../packages/skill/skill/src/index.ts), [`packages/skill/skill-filesystem/src/index.ts`](../../packages/skill/skill-filesystem/src/index.ts), [`packages/skill/skill-badge/src/index.ts`](../../packages/skill/skill-badge/src/index.ts) и [`packages/skill/tool-skill/src/index.ts`](../../packages/skill/tool-skill/src/index.ts).

## Реестр провайдеров

`ctx.skills` объединяет локальных, встроенных, удалённых и прочих провайдеров. Регистрация синхронна; удалённая инициализация и обнаружение выполняются в ожидаемом вызывающим `list()`. Объекты провайдеров, опции и кандидаты заимствуются как readonly, а семантические поля валидируются.

Реестр слоится по схеме host+per-scope — той же форме, которую установил [реестр инструментов](tools.ru.md) над [dsh-scope](../../packages/core/scope): регистрация ложится в слой скоупа её вызывающего контекста, поэтому host-строки и плагины репозитория попадают в глобальный слой, а плагин, смонтированный постоянной композицией агентского пресета, — в слой этого пресета; имена провайдеров уникальны на слой, а не на процесс. Чтение сливает глобальный слой с цепочкой скоупа наблюдающего — запись ближайшего слоя выигрывает дубликат имени скилла безусловно, а порядок рангов ниже разрешает дубликаты только внутри одного слоя. Кэши обнаружения ключуются разрешённой цепочкой скоупов, поэтому переподчинение скоупа другому родителю (рекомпозиция пустой сессии) видно уже следующему чтению, без мутации реестра.

Внутри одного слоя дубликаты имён разрешаются по рангу, порядку провайдеров, затем локальному порядку; сводки сортируются по имени. Отклонённый `list()` логируется и исключается, оставляя наблюдение неполным, тогда как явное неполное наблюдение добавляет пригодных кандидатов, не делая результат кэшируемым; некорректные кандидаты приводят к немедленному отказу. Каждая фабрика провайдера получает управляющий объект, действующий в рамках этой регистрации: его `invalidate()` очищает завершённые каталоги, только пока эта точная регистрация остаётся активной, а его сигнал прерывается при неудавшейся регистрации или освобождении ресурсов. Выполняющееся обнаружение повторяется один раз при смене поколения его провайдера; вторая смена возвращает последние кандидаты неполными и некэшированными. Мутации провайдеров и рантайма порождают неотфильтрованное событие инвалидации `skills/change`; оно не несёт диффа, поэтому потребители перезапрашивают `snapshot()` со своими опциями поиска.

Массив, возвращаемый `SkillProvider.list()`, — краткая форма полностью завершённого обнаружения. `SkillProviderObservation` позволяет провайдеру предоставлять кандидатов, которые остаются напрямую загружаемыми, сообщая при этом, что наблюдение не является авторитетным.

```ts type-equiv
/** Provider candidates plus whether the current discovery is authoritative. */
interface SkillProviderObservation {
  /** Candidates available from the current provider discovery. */
  readonly candidates: readonly SkillCandidate[]
  /** Whether discovery completed and these candidates may be cached. */
  readonly complete: boolean
}
```

```ts type-equiv
/** Provider interface for one source of skills, such as local directories or a remote registry. */
interface SkillProvider {
  /** Unique provider name in the `ctx.skills` registry. */
  readonly name: string
  /**
   * List available skill candidates for the current lookup context. Provider
   * plugins register synchronously during `apply()`; remote initialization,
   * authentication, and discovery are awaited inside this method. Implementations
   * should settle promptly when `options.signal` aborts.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   * @returns provider candidates as a complete-array shorthand, or an explicit
   *   observation when usable candidates came from incomplete discovery.
   */
  readonly list: (options: SkillLookupOptions) => Promise<readonly SkillCandidate[] | SkillProviderObservation>
  /**
   * Load a complete skill body for a previously listed candidate.
   * @param candidate - the winning candidate originally returned by this provider.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   * @returns the full skill body, or `undefined` if it is no longer loadable.
   */
  readonly get: (candidate: SkillCandidate, options: SkillLookupOptions) => Promise<SkillDefinition | undefined>
}
```

```ts type-equiv
/** Registration-scoped lifecycle and invalidation capability borrowed by one provider. */
interface SkillProviderControl {
  /** Aborts if registration fails or when the exact provider registration is disposed. */
  readonly signal: AbortSignal
  /** Invalidate completed catalogs and notify consumers only while the exact registration remains active. */
  readonly invalidate: () => void
}
```

## Приоритет локального обнаружения

Поставляемый локальный провайдер сканирует корни в порядке рангов:

| Ранг | Источник | Корень |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |
| 600 | `bundled` | `Config.bundledSkillDir`, если настроен |

Корень проекта — ближайший предок, содержащий `.git`; без него используется текущий cwd. Когда доступен `ctx.fs`, обход git-корня пробует `.git` через сервис файловой системы, чтобы удалённые или изолированные песочницей рабочие пространства не откатывались к файловой системе хоста. Пользовательский корень DSH пропускает своего потомка `.system`. Локальный провайдер не синтезирует встроенные системные скиллы; развёртывания поставляют упакованные скиллы через настроенные bundled-корни или выделенных провайдеров.

`dsh-skill-badge` регистрирует одного неизменяемого кандидата `bundled` на ранге `BUNDLED_SKILL_RANK` и открывает свой каталог упакованных ресурсов через `resourceBase`. Поставляемый CLI объявляет плагин отключённым, так что включение его строки композиции — явный opt-in.

Chokidar наблюдает существующие корни на предмет прямых добавлений и удалений бандлов и плоских записей, а также прямых изменений записей скиллов. Отсутствующий корень отслеживается по одному отсутствующему сегменту пути за раз от ближайшего существующего предка, пока Chokidar сможет подключиться. Файлы ресурсов внутри бандла изменениями каталога скиллов не считаются. Наблюдения обращённых к модели инструментов `write` и `edit` синхронно инвалидируют провайдера, когда их цель затрагивает каталог скиллов, тогда как наблюдатель хоста покрывает мутации со стороны IDE, Git, shell и внешних процессов. Сбои наблюдателя делают текущее наблюдение неполным, не пряча читаемых кандидатов от прямой загрузки; наблюдатели в рамках проекта используют настроенный ограниченный LRU.

## Идентичность скилла

Имена скиллов — kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Локальный провайдер принимает каталоги-бандлы (`<name>/SKILL.md`) и плоские Markdown-файлы (`<name>.md`). Вложенное рекурсивное обнаружение `**/SKILL.md` не поддерживается.

```ts type-equiv
/** Origin bucket for a skill contribution. The value is prompt-visible metadata, not precedence by itself. */
type SkillSource = 'project-dsh' | 'project-agents' | 'runtime' | 'user-dsh' | 'user-agents' | 'custom' | 'bundled' | (string & {})
```

## Сводки, кандидаты и полные определения

`SkillSummary` — нейтральная к вызову форма сводки реестра. Потребители выбирают, какие записи и поля отрисовывать; каталог модельной сессии использует только `name` и `description` скиллов, вызываемых моделью, — никогда тело или абсолютный путь к файлу. `SkillInvocationPolicy` нормализует два независимых флага вызова в явные булевы значения, и каждая разрешённая сводка, кандидат и определение несут его, не превращая произвольный frontmatter в доменную модель.

```ts type-equiv
/** Invocation controls shared by skill discovery consumers. */
interface SkillInvocationPolicy {
  /** Whether model-facing catalogs and loaders include this skill. */
  readonly modelInvocable: boolean
  /** Whether human-facing command catalogs and loaders include this skill. */
  readonly userInvocable: boolean
}
```

```ts type-equiv
/** Invocation-neutral skill metadata returned by `ctx.skills.list()`. */
interface SkillSummary {
  /** Kebab-case identifier used to address the skill. */
  readonly name: string
  /** Short routing description shown by discovery consumers. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Resolved model and user invocation controls. */
  readonly invocation: SkillInvocationPolicy
  /** Discovery source that produced this winning skill. */
  readonly source: SkillSource
  /** Provider that owns this skill body. */
  readonly provider: string
  /** Provider-specific base for relative resources. */
  readonly resourceBase?: SkillResourceBase
}
```

`ctx.skills.list()` сохраняет все четыре комбинации политики. `isModelInvocable(skill)` и `isUserInvocable(skill)` читают соответствующее обязательное поле. Скилл только для модели ставит `{ modelInvocable: true, userInvocable: false }`, скилл только для пользователя — `{ modelInvocable: false, userInvocable: true }`, а установка обоих полей в `false` оставляет скилл доступным только доверенным вызывающим `ctx.skills.get()`. Локальный провайдер читает точные kebab-case-ключи frontmatter `disable-model-invocation` и `user-invocable`, заполняет опущенные поля значением `true` и проецирует каждый разобранный скилл в эту нормализованную политику.

`SkillCatalogSnapshot` отличает авторитетное отсутствие скиллов от преходящего сбоя провайдера или от каталога, продолжавшего меняться во время обнаружения. `skills` содержит отсортированные нейтральные к вызову сводки, собранные в этом наблюдении; `complete` истинно, только когда каждый зарегистрированный провайдер завершился без параллельной ревизии каталога. Неполные снапшоты не кэшируются, позволяя каждому потребителю удерживать свой последний исправный отфильтрованный каталог и повторять попытку.

```ts type-equiv
/** One catalog observation plus whether discovery completed within a stable catalog revision. */
interface SkillCatalogSnapshot {
  /** Sorted invocation-neutral summaries collected in this observation. */
  readonly skills: SkillSummary[]
  /** Whether every registered provider completed without a concurrent catalog revision. */
  readonly complete: boolean
}
```

`SkillCandidate` — форма «от провайдера к реестру». `locator` — непрозрачное состояние провайдера; реестр только хранит его и возвращает `get()` победившего провайдера.

```ts type-equiv
/** Provider catalog entry used by the registry to merge and later load skills. */
interface SkillCandidate extends SkillSummary {
  /** Lower ranks win duplicate skill names before provider registration order is considered. */
  readonly rank: number
  /** Opaque provider-owned handle passed back to `provider.get()`. */
  readonly locator: unknown
  /** Absolute file path when the provider has one. */
  readonly path?: string
  /** Parsed optional metadata object from provider-specific skill frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

`SkillDefinition` — полный разобранный результат, возвращаемый `ctx.skills.get()` и используемый инструментом `skill`. `resourceBase` сообщает инструменту, как отрисовывать подсказки об относительных ресурсах для локальных, URL- или управляемых провайдером скиллов.

```ts type-equiv
/** Optional provider-specific base used by loaded skill bodies to resolve relative resources. */
type SkillResourceBase =
  | { readonly kind: 'directory'; readonly path: string }
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'opaque'; readonly description: string }
```

```ts type-equiv
/** Complete parsed skill definition, including the body loaded by `ctx.skills.get()`. */
interface SkillDefinition extends SkillSummary {
  /** Markdown instruction body after any provider-specific metadata removal. */
  readonly content: string
  /** Absolute file path when the skill came from disk. */
  readonly path?: string
  /** Parsed optional metadata object from frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

Входные данные при регистрации скиллов рантайма могут опускать флаги вызова и метку провайдера. Реестр разрешает оба значения по умолчанию один раз, затем использует ту же форму полного определения и порядок сбора «первый побеждает», что и провайдеры. Возвращаемый диспоузер удаляет вклад и инвалидирует кэши обнаружения.

```ts type-equiv
/** Runtime skill contribution accepted by `ctx.skills.register()`. */
type SkillRegistration = Omit<SkillDefinition, 'invocation' | 'provider'> & {
  /** Invocation controls; omission permits both model and user surfaces. */
  readonly invocation?: SkillInvocationPolicy
  /** Provider label; omission uses the registry-owned runtime provider. */
  readonly provider?: string
}
```

## Поиск и конфигурация

Поиск скиллов чувствителен к cwd, потому что провайдеры могут предоставлять локальные для рабочего пространства скиллы, а его опциональный сигнал отменяет работу провайдеров для вызывающего. Чтения реестра дополнительно принимают наблюдающий скоуп — потребители передают вызывающего агента, который сам является ключом скоупа, — через `SkillViewOptions`; реестр потребляет `scope` для выбора слоя, а провайдеры читают из того же заимствованного объекта опций только свой контракт `SkillLookupOptions`. Отмена проверяется до и после выбора каталога, включая попадания в кэш, и выполняется в гонке как с обнаружением, так и с загрузкой полного определения. Если git-корень не найден, локальный провайдер считает сам переданный cwd корнем проекта.

Полные определения реестром не кэшируются. Каждый `get()` вызывает победившего провайдера с выбранным кандидатом, поэтому локальный провайдер перечитывает текущее тело. Определение, чьё имя больше не совпадает с этим кандидатом, отклоняется, а его провайдер инвалидируется для повторного обнаружения.

```ts type-equiv
/** Caller context used for cwd-sensitive and abortable provider work. */
interface SkillLookupOptions {
  /** Workspace selector for the current lookup. */
  readonly cwd?: string | undefined
  /** Abort discovery or loading work for the current caller. */
  readonly signal?: AbortSignal | undefined
}
```

```ts type-equiv
/**
 * Registry read options: provider lookup context plus the viewing scope.
 * The registry consumes `scope` to select layers; providers receive the same
 * borrowed options object and read only their {@link SkillLookupOptions}
 * contract from it.
 */
interface SkillViewOptions extends SkillLookupOptions {
  /** Viewing scope (the calling agent); omitted reads the global layer alone. */
  readonly scope?: ScopeKey | undefined
}
```

Реестр владеет только своим ограничением кэша обнаружения. Локальный провайдер владеет корнями файловой системы (`dshHome`, `agentsHome`, `customSkillDirs` и опциональными `bundledSkillDir`/`DSH_BUNDLED_SKILL_DIR`) плюс параметрами наблюдателя: включением, polling, стабилизацией, symlink и проектной ёмкостью. Потребитель владеет своим ограничением длины описания каталога. Точные значения по умолчанию и валидация — в сгенерированном [каталоге конфигурации](../config-catalog.ru.md).

```ts type-equiv
/** Skill registry configuration. */
interface Config {
  /** Maximum number of completed cwd/provider catalogs kept in memory. */
  readonly collectCacheMaxEntries?: number
}
```

## Сессионный каталог и контракт инструмента

`dsh-tool-skill` внедряет начальный долговечный `<system-reminder>` роли user на первом `agent/pre-step` активной сессии, когда наблюдается непустой полный вид. Каталог содержит только отсортированные `name` скиллов и нормализованные, XML-экранированные `description`; он опускает тела, пути, источники, провайдеров и подсказки маршрутизации. Обнаружение пробрасывает сигнал отмены шага через `SkillLookupOptions`. `catalogDescriptionMaxLength` — конфигурация потребителя для ограничения длины описания, по умолчанию `500` с целочисленным минимумом `3`.

Перед каждым последующим шагом модели потребитель применяет точную видимость инструментов и вычисляет дайджест точно отрисованных записей между тегами `<available_skills>` из полного снапшота. Опорное значение для сравнения он берёт из тех же записей в новейшем распознаваемом видимом сообщении каталога, источником которого выступает этот плагин. Изменившийся дайджест добавляет долговечную полную замену через `agent.inject()`; удаление всех скиллов добавляет явную пустую замену. Неполные снапшоты сохраняют последний исправный вид модели. Если компакция прячет все исторические сообщения каталога, следующий полный снапшот восстанавливает текущий каталог; пустой вид без предшествующего каталога не порождает ничего. Эти сообщения каталога — история сессии, а не World State.

Обращённый к модели инструмент `skill({ name })` проверяет имя kebab-case, находит сводку в нейтральном к вызову каталоге, отвергает её ещё до загрузки, если `isModelInvocable` не разрешает доступ, затем перечитывает полное определение для cwd вызывающего агента и перепроверяет политику перед возвратом содержимого. Неразрешённый скилл он сообщает как неизвестный или более недоступный и возвращает результат инструмента, содержащий `<skill_content name="...">`, `<skill_resources>` и `<skill_instructions>`. `resourceBase` разрешает явно упомянутые скрипты, ссылки и ресурсы только по мере необходимости; загруженный результат не перечисляет файлы каталога скилла. Поэтому правки одного лишь тела скилла меняют последующие вызовы инструмента, не порождая сообщений каталога и не переписывая прежние результаты инструментов.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxskills--skillregistry"></a>

### `ctx.skills` — `SkillRegistry`

Layered registry of skill providers, the host+per-scope shape the tools registry established. A registration files into the layer of its calling context's scope (scopeOf): host rows and repository plugins land in the global layer, while a plugin mounted by an agent preset's standing composition lands in that preset's layer. A read merges the global layer with the viewing scope's chain — the nearest layer's entry wins a duplicate name outright, and the rank order decides duplicates only within one layer. It exposes sorted invocation-neutral summaries and loads full skill bodies on demand.

```ts cordis-catalog
/**
 * Register a borrowed same-process provider synchronously during plugin
 * apply, into the calling context's layer: a scoped context (an agent
 * preset's standing mount) registers for that scope alone, an unscoped
 * context registers globally. Duplicate names within one layer and reserved
 * names throw; remote initialization belongs in `list()`. Fiber disposal
 * unregisters the provider and invalidates catalog caches.
 * @param create - synchronous factory receiving this registration's lifecycle and invalidation control.
 * @returns the exact Cordis effect disposer that unregisters this provider;
 *   composite effects may yield it directly to preserve teardown ordering.
 */
registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void

/**
 * Register a borrowed readonly runtime skill into the calling context's
 * layer. Project entries outrank runtime entries, which outrank user
 * entries, within one layer. Same-name runtime entries in one layer are
 * first-wins; a duplicate logs a warning and receives a no-op disposer so
 * it cannot remove the winner.
 * @param skill - the skill definition input; omitted invocation and provider fields receive defaults.
 * @returns the exact Cordis effect disposer, preserving composite teardown order and invalidating caches.
 */
register(skill: SkillRegistration): () => void

/**
 * List invocation-neutral skill summaries for a workspace. Consumers apply
 * model or user invocation policy at their operational boundary. Lookup
 * options and provider candidates are readonly same-process values borrowed
 * throughout discovery.
 * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
 * @returns all sorted winning summaries.
 */
async list(options: SkillViewOptions = {}): Promise<SkillSummary[]>

/**
 * Observe the current invocation-neutral catalog and whether discovery completed within a stable revision.
 * Incomplete observations are never cached, allowing consumers to retain last-good state and
 * retry on their next request boundary.
 * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
 * @returns sorted summaries plus discovery-completeness state.
 */
async snapshot(options: SkillViewOptions = {}): Promise<SkillCatalogSnapshot>

/**
 * Load and validate the winning candidate, passing its opaque discovery locator back to the
 * provider. Cancellation is rechecked after selection, including cache hits, and raced against
 * loading so an uncooperative provider cannot hang the caller.
 * @param name - kebab-case skill name.
 * @param options - view options; `scope` selects the viewing agent's layers,
 *   `cwd` selects workspace-sensitive skills, and `signal` cancels work.
 * @returns the full skill, including body content, or `undefined`.
 */
async get(name: string, options: SkillViewOptions = {}): Promise<SkillDefinition | undefined>
```

Source: [`packages/skill/skill/src/index.ts`](../../packages/skill/skill/src/index.ts)

<a id="skills-events"></a>

### `skills/*` events

<a id="skillschange--emit"></a>

#### `skills/change` — emit

A skill provider, runtime contribution, or provider-backed catalog may have changed. This is an unfiltered invalidation notification; consumers refetch the catalog for their own lookup options. Listener failures are contained and cannot veto the registry mutation.

```ts cordis-catalog
/**
 * A skill provider, runtime contribution, or provider-backed catalog may
 * have changed. This is an unfiltered invalidation notification; consumers
 * refetch the catalog for their own lookup options. Listener failures are
 * contained and cannot veto the registry mutation.
 * @mode emit
 */
'skills/change'(): void
```

Source: [`packages/skill/skill/src/index.ts`](../../packages/skill/skill/src/index.ts)
<!-- END GENERATED cordis-surface -->

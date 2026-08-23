# Пресеты разрешений

[English](permission-presets.md) | [中文](permission-presets.zh.md) | Русский

Слой пресетов разрешений в [dsh-permission-presets](../../packages/interaction/permission-presets) (`ctx.permissionPresets`, `PermissionPresetService`) объединяет два независимых регулятора принуждения — [режим песочницы](sandbox.ru.md) (`sandbox/mode`) и [политику одобрений](approval.ru.md) (`approval/policy`) — в именованные пресеты, которые клиент предлагает одним селектором Permissions. Это одна необязательная возможность, а не часть стержня agent-loop, и принуждением она не владеет: исполнение, повествование промпта и воспроизведение продолжают читать собственные свёртки регуляторов, а переключение пресета лишь записывает намерение и проводит запись через канонический сеттер каждого регулятора. Статус композиции и ограничения держит [README пакета](../../packages/interaction/permission-presets/README.md); обоснование — в [дизайне переключения песочницы](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md).

Источник: [`packages/interaction/permission-presets/src/index.ts`](../../packages/interaction/permission-presets/src/index.ts)

## Таблица пресетов

Пресет — это ключ таблицы, отображающийся в один бандл «песочница + одобрения» плюс опциональное клиентское представление; таблица по умолчанию поставляет `workspace-write` (`workspace-write` + `ask`) и `danger-full-access` (`danger-full-access` + `never`).

```ts type-equiv
/** One preset's sandbox/approval bundle and optional client presentation. */
interface PresetSpec {
  /** The `sandbox/mode` value the preset writes through. */
  sandbox: SandboxMode
  /** The `approval/policy` value the preset writes through. */
  approval: ApprovalPolicy
  /** The display label a client shows for this preset; the raw table key when omitted. */
  name?: string
  /** One user-facing sentence on what the preset means; omitted when not configured. */
  description?: string
}
```

```ts type-equiv
/** The {@link PermissionPresetService} config: preset table and composition default. */
interface Config {
  /**
   * The preset table: name → knob bundle. Defaults to `workspace-write`
   * (workspace-write + ask) and `danger-full-access` (danger-full-access +
   * never). The name `custom` is reserved for the derived not-a-preset state.
   */
  presets?: Record<string, PresetSpec>
  /**
   * Default for new sessions. When omitted, the preset matching the composed
   * sandbox and approval defaults is used.
   */
  defaultPreset?: string
}
```

Сервис требует ограничивающего исполнителя `ctx.shell` и `ctx.approval`, а неверная конфигурация падает при загрузке плагина: вход таблицы с именем `custom` бросает исключение (имя зарезервировано за производным состоянием «не-пресет»), и композиция над bash-исполнителем, который не ограничивает (нет факта возможности `sandboxMode`), бросает исключение, потому что пресеты включают режим песочницы.

## Текущий пресет и производный `custom`

`current(events)` выводит действующий пресет из регуляторов, а не из одного собственного события: он сворачивает действующий режим песочницы сессии (с откатом к настроенному режиму исполнителя) и действующую политику одобрений (с откатом к конфигурации сервиса одобрений, затем к `ask`), предпочитает всё ещё совпадающую записанную выборку, затем первый совпадающий вход таблицы в порядке объявления, а иначе возвращает `CUSTOM_PRESET` (`'custom'`). `custom` существует только как производное значение: клиенты могут показывать его как текущее, но он никогда не бывает целью переключения или полезной нагрузкой события.

`names` перечисляет переключаемые пресеты в порядке объявления таблицы; `optionOf(name)` строит опцию, которую клиент рисует для ключа таблицы (метка откатывается к ключу) или для `custom`, и бросает исключение для любого другого имени.

```ts type-equiv
/** The select-option shape a presentation layer advertises for one preset (or for the derived `custom` state). */
interface PresetOption {
  /** Stable option value: the table key, or `custom`. */
  value: string
  /** The display label. */
  name: string
  /** One user-facing sentence on what the value means; omitted when not configured. */
  description?: string
}
```

## Переключение и событие `permission/preset`

`set(session, name)` разрешает пресет (неизвестные имена бросают исключение), дописывает событие только для журнала `permission/preset`, если `name` ещё не является действующим пресетом, затем проводит каждый регулятор через его собственный сеттер — `setSandboxMode` из [dsh-sandbox-policy](../../packages/sandbox/sandbox-policy) и `setApprovalPolicy` из [dsh-user-approval](../../packages/interaction/user-approval) — и только когда действующее значение этого регулятора меняется. Событие выбора предшествует событиям регуляторов в том же ходу, а повторный выбор действующего пресета не дописывает ничего.

`permission/preset` — долговечное, существующее только в журнале намерение пользователя: оно остаётся вне транскрипта модели (видимые модели последствия несут события регуляторов через своих потребителей), а нужно оно затем, чтобы `current()` сохранял знание о том, КАКОЙ пресет выбрал пользователь, когда два пресета делят один бандл; `effectivePermissionPreset(events)` сворачивает последнее такое событие, и воспроизведение не нуждается в догоняющем состоянии. Полное объявление события — в [каталоге событий журнала персистентности](../persistence-catalog.md); сигнатуры методов — в сгенерированном [каталоге сервисов](#ctxpermissionpresets--permissionpresetservice).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxpermissionpresets--permissionpresetservice"></a>

### `ctx.permissionPresets` — `PermissionPresetService`

Owns the deployment's permission presets and their write path. Requires a confining `ctx.shell` executor and `ctx.approval`; unmatched knob values are reported as CUSTOM_PRESET, not an error.

```ts cordis-catalog
/**
 * Resolve the preset matching the effective knob values. A still-matching
 * last selection wins shared-bundle ties; otherwise the first table match
 * wins, or {@link CUSTOM_PRESET} when no entry matches.
 * @param events - the session's events in log order.
 * @returns the effective preset name, or `custom` when nothing matches.
 */
current(events: readonly SessionEvent[]): string

/**
 * Build the whole select value for one folded knob state: every table
 * option in declaration order, `custom` appended exactly while derived.
 * @param state - the folded knob overrides.
 * @returns the `permissions` projection payload.
 */
selectFor(state: KnobState): PermissionSelect

/**
 * Resolve a preset's knob bundle.
 * @param name - the preset name to resolve.
 * @returns the configured bundle.
 * @throws when `name` is not in the table.
 */
resolve(name: string): PresetSpec

/**
 * Build the client option for a table entry or {@link CUSTOM_PRESET}. A
 * missing label falls back to the table key.
 * @param name - a table key, or `custom`.
 * @returns the option a client renders.
 * @throws when `name` is neither a table key nor `custom`.
 */
optionOf(name: string): PresetOption

/**
 * Record a changed preset, then update each changed knob through its own
 * setter. Selecting the effective preset again appends nothing.
 * @param session - the session the switch belongs to.
 * @param name - the preset to switch to; unknown names throw.
 */
set(session: Session, name: string): void
```

Types: [Session](session.md) · [SessionEvent](session.md)

Source: [`packages/interaction/permission-presets/src/index.ts`](../../packages/interaction/permission-presets/src/index.ts)
<!-- END GENERATED cordis-surface -->

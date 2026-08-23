/**
 * Canonical publication manifest for the documentation website.
 *
 * Markdown stays in its owning repository tier. This manifest maps each
 * canonical source into matching route trees for every site locale; when a
 * translation is absent, the locale's route intentionally projects the
 * available source instead of copying Markdown.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')

/** Locale key used by the VitePress site. */
export type DocsLocale = 'root' | 'en' | 'ru'

/** Sidebar collection rendered for one locale and top-level module. */
export type DocsSidebar =
  | 'zh-guide'
  | 'zh-develop'
  | 'zh-reference'
  | 'en-guide'
  | 'en-develop'
  | 'en-reference'
  | 'ru-guide'
  | 'ru-develop'
  | 'ru-reference'

/**
 * Per-locale values authored for the two upstream locales, with an optional
 * Russian override. A missing `ru` value falls back to the English one, so
 * Russian navigation labels can arrive incrementally.
 */
type AuthoredLabels<T> = Record<'root' | 'en', T> & { ru?: T }

/** A page projected into the VitePress source tree. */
export interface DocsPage {
  /** VitePress locale whose route tree owns this projection. */
  locale: DocsLocale
  /** Language of the canonical source currently projected at this route. */
  contentLocale: 'zh-CN' | 'en-US' | 'ru-RU'
  /** Repository-relative canonical Markdown source. */
  source: string
  /** VitePress route, including the `.md` suffix. */
  route: string
  /** Navigation label shown in the sidebar. */
  label: string
  /** Sidebar collection that owns the page, or null for a locale home page. */
  sidebar: DocsSidebar | null
  /** Section label within the sidebar. */
  section: string
  /** Stable order within the section. */
  order: number
  /** Heading levels included in this page's VitePress outline. */
  outline?: number | readonly [number, number] | 'deep' | false
  /** Additional repository paths that resolve to this page. */
  sourceAliases?: string[]
}

interface MirroredPage {
  source: string | Record<DocsLocale, string>
  route: string
  contentLocale: DocsPage['contentLocale'] | Record<DocsLocale, DocsPage['contentLocale']>
  label: AuthoredLabels<string>
  sidebar: AuthoredLabels<DocsSidebar | null>
  section: AuthoredLabels<string>
  order: number
  outline?: DocsPage['outline']
  sourceAliases?: string[] | Partial<Record<DocsLocale, string[]>>
}

type PairedPage = Omit<MirroredPage, 'source' | 'contentLocale' | 'sourceAliases'> & {
  /** English side of a sibling `foo.md` / `foo.zh.md` pair. */
  source: string
  /** Language-neutral repository aliases, such as the directory of an index page. */
  sourceAliases?: string[]
}

/** Every route-tree locale, in manifest order. */
const LOCALES = ['root', 'en', 'ru'] as const satisfies readonly DocsLocale[]

function localized<T>(value: T | Record<DocsLocale, T>, locale: DocsLocale): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const record = value as Record<DocsLocale, T>
  return record[locale] ?? record.en
}

/** The Russian sidebar collection matching an English one; `null` stays `null`. */
function russianSidebar(sidebar: DocsSidebar | null): DocsSidebar | null {
  return sidebar === null ? null : (sidebar.replace(/^en-/, 'ru-') as DocsSidebar)
}

function mirroredPages(pages: MirroredPage[]): DocsPage[] {
  return pages.flatMap(page => LOCALES.map((locale) => {
    // Russian overrides apply to the Russian tree alone; the upstream trees
    // keep their authored values untouched.
    const label = locale === 'root'
      ? page.label.root
      : locale === 'ru' ? (page.label.ru ?? page.label.en) : page.label.en
    const sidebar = locale === 'root'
      ? page.sidebar.root
      : locale === 'ru'
        ? (page.sidebar.ru ?? russianSidebar(page.sidebar.en))
        : page.sidebar.en
    const section = locale === 'root'
      ? page.section.root
      : locale === 'ru' ? (page.section.ru ?? page.section.en) : page.section.en
    const aliases = page.sourceAliases === undefined
      ? undefined
      : Array.isArray(page.sourceAliases)
        ? page.sourceAliases
        : (page.sourceAliases[locale] ?? page.sourceAliases.en)
    return {
      locale,
      contentLocale: localized(page.contentLocale, locale),
      source: localized(page.source, locale),
      route: locale === 'root' ? page.route : `${locale}/${page.route}`,
      label,
      sidebar,
      section,
      order: page.order,
      ...(page.outline === undefined ? {} : { outline: page.outline }),
      ...(aliases === undefined ? {} : { sourceAliases: aliases }),
    }
  }))
}

/**
 * The Russian side of a pair projects the `.ru.md` sibling when it exists and
 * falls back to the English source while the translation is outstanding.
 */
function russianPairSource(englishSource: string): { source: string; contentLocale: DocsPage['contentLocale'] } {
  const candidate = englishSource.replace(/\.md$/, '.ru.md')
  return existsSync(resolve(repositoryRoot, candidate))
    ? { source: candidate, contentLocale: 'ru-RU' }
    : { source: englishSource, contentLocale: 'en-US' }
}

function pairedPages(pages: PairedPage[]): DocsPage[] {
  return mirroredPages(pages.map((page) => {
    const chineseSource = page.source.replace(/\.md$/, '.zh.md')
    const russian = russianPairSource(page.source)
    const sharedAliases = page.sourceAliases ?? []
    return {
      ...page,
      source: { root: chineseSource, en: page.source, ru: russian.source },
      contentLocale: { root: 'zh-CN', en: 'en-US', ru: russian.contentLocale },
      sourceAliases: {
        root: [...sharedAliases, page.source],
        en: [...sharedAliases, chineseSource],
        ru: [...sharedAliases, chineseSource],
      },
    }
  }))
}

const homeAndGuide = pairedPages([
  {
    source: 'docs/user/index.md',
    route: 'index.md',
    label: { root: 'DeepSeek Harness', en: 'DeepSeek Harness', ru: 'DeepSeek Harness' },
    sidebar: { root: null, en: null },
    section: { root: '首页', en: 'Home', ru: 'Главная' },
    order: 0,
  },
  {
    source: 'docs/user/guide/index.md',
    route: 'guide/quickstart.md',
    label: { root: '使用 Web UI', en: 'Use the Web UI', ru: 'Использование веб-интерфейса' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: '入门', en: 'Guide', ru: 'Руководство' },
    order: 1,
    sourceAliases: ['docs/user/guide'],
  },
  {
    source: 'docs/user/guide/providers.md',
    route: 'guide/providers.md',
    label: { root: '配置模型', en: 'Configure models', ru: 'Настройка моделей' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: '入门', en: 'Guide', ru: 'Руководство' },
    order: 2,
  },
  {
    source: 'docs/user/guide/python-sdk.md',
    route: 'guide/python-sdk.md',
    label: { root: 'Python', en: 'Python', ru: 'Python' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: 'SDK', en: 'SDK', ru: 'SDK' },
    order: 1,
  },
])

const develop = pairedPages([
  {
    source: 'docs/user/develop/basic/index.md',
    route: 'develop/basic/index.md',
    label: { root: '第一个 Harness 插件', en: 'Your first Harness plugin', ru: 'Ваш первый плагин Harness' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics', ru: 'Основы' },
    order: 1,
    sourceAliases: ['docs/user/develop/basic'],
  },
  {
    source: 'docs/user/develop/basic/tool.md',
    route: 'develop/basic/tool.md',
    label: { root: '开发一个 Tool', en: 'Build a tool', ru: 'Создание инструмента' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics', ru: 'Основы' },
    order: 2,
  },
  {
    source: 'docs/user/develop/basic/config.md',
    route: 'develop/basic/config.md',
    label: { root: '插件配置', en: 'Plugin configuration', ru: 'Конфигурация плагина' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics', ru: 'Основы' },
    order: 3,
  },
  {
    source: 'docs/user/develop/basic/publish.md',
    route: 'develop/basic/publish.md',
    label: { root: '打包与安装插件', en: 'Package and install', ru: 'Сборка и установка' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics', ru: 'Основы' },
    order: 4,
  },
  {
    source: 'docs/user/develop/framework/index.md',
    route: 'develop/framework/index.md',
    label: { root: '插件与生命周期', en: 'Plugin lifecycle', ru: 'Жизненный цикл плагина' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '框架能力', en: 'Framework', ru: 'Фреймворк' },
    order: 1,
    sourceAliases: ['docs/user/develop/framework'],
  },
  {
    source: 'docs/user/develop/framework/service.md',
    route: 'develop/framework/service.md',
    label: { root: '服务与依赖', en: 'Services and dependencies', ru: 'Сервисы и зависимости' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '框架能力', en: 'Framework', ru: 'Фреймворк' },
    order: 2,
  },
  {
    source: 'docs/user/develop/framework/events.md',
    route: 'develop/framework/events.md',
    label: { root: '事件系统', en: 'Event system', ru: 'Событийная система' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '框架能力', en: 'Framework', ru: 'Фреймворк' },
    order: 3,
  },
  {
    source: 'docs/user/develop/practice/index.md',
    route: 'develop/practice/index.md',
    label: { root: '能力的三层拆分', en: 'Capability layering', ru: 'Слои возможности' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '实战', en: 'Practice', ru: 'Практика' },
    order: 1,
    sourceAliases: ['docs/user/develop/practice'],
  },
  {
    source: 'docs/user/develop/practice/llm-adapter.md',
    route: 'develop/practice/llm-adapter.md',
    label: { root: 'LLM 适配器', en: 'LLM adapter', ru: 'LLM-адаптер' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '实战', en: 'Practice', ru: 'Практика' },
    order: 2,
  },
])

const cordisTutorial = pairedPages(([
  ['index.md', '总览', 'Overview', 'Обзор'],
  ['01-first-plugin.md', '1. 第一个插件', '1. Your first plugin', '1. Ваш первый плагин'],
  ['02-lifecycle-and-effects.md', '2. 生命周期与副作用', '2. Lifecycle and effects', '2. Жизненный цикл и эффекты'],
  ['03-services.md', '3. 服务', '3. Services', '3. Сервисы'],
  ['04-events.md', '4. 事件', '4. Events', '4. События'],
  ['05-config.md', '5. 配置', '5. Configuration', '5. Конфигурация'],
  ['06-composition-and-hmr.md', '6. 组合与热重载', '6. Composition and HMR', '6. Композиция и HMR'],
  ['07-into-the-harness.md', '7. 进入 Harness', '7. Into the harness', '7. Внутрь Harness'],
] as const).map(([file, rootLabel, enLabel, ruLabel], order): PairedPage => ({
  source: `docs/cordis-tutorial/${file}`,
  route: `develop/cordis-tutorial/${file}`,
  label: { root: rootLabel, en: enLabel, ru: ruLabel },
  sidebar: { root: 'zh-develop', en: 'en-develop' },
  section: { root: 'Cordis 框架教程', en: 'Cordis framework tutorial', ru: 'Туториал по фреймворку Cordis' },
  order,
  ...(file === 'index.md' ? { sourceAliases: ['docs/cordis-tutorial'] } : {}),
})))

const cordisPrimerReference = pairedPages([
  {
    source: 'docs/cordis-primer.md',
    route: 'reference/cordis-primer.md',
    label: { root: 'Cordis 入门', en: 'Cordis primer', ru: 'Primer по Cordis' },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '概念', en: 'Concepts', ru: 'Концепции' },
    order: 1,
  },
])

/**
 * Subsystem pages grouped by the concern they document, as `[Chinese section,
 * English section, pages]`. One flat list of every subsystem pushed the rest of
 * the reference sidebar below the fold.
 */
const subsystemGroups = [
  ['总览', 'Overview', 'Обзор', [
    ['README.md', '子系统', 'Subsystems', 'Подсистемы'],
  ]],
  ['内核与作用域', 'Core and scopes', 'Ядро и скоупы', [
    ['core.md', '核心', 'Core', 'Ядро'],
    ['scope.md', '作用域', 'Scopes', 'Скоупы'],
    ['invariants.md', '运行时不变式', 'Runtime invariants', 'Инварианты рантайма'],
  ]],
  ['会话与持久化', 'Sessions and persistence', 'Сессии и персистентность', [
    ['session.md', '会话', 'Sessions', 'Сессии'],
    ['session-query.md', '会话查询', 'Session query', 'Запросы к сессиям'],
    ['session-reference.md', '会话引用', 'Session references', 'Ссылки на сессии'],
    ['session-title.md', '会话标题', 'Session titles', 'Заголовки сессий'],
    ['session-projection.md', '会话投影', 'Session projections', 'Проекции сессий'],
    ['persistence.md', '会话持久化', 'Session persistence', 'Персистентность сессий'],
    ['spill.md', 'Spill 存储', 'Spill storage', 'Хранилище Spill'],
    ['session-telemetry.md', '遥测', 'SessionTelemetryBackend', 'SessionTelemetryBackend'],
  ]],
  ['模型与上下文', 'Model and context', 'Модель и контекст', [
    ['llm-streaming.md', 'LLM 流式响应', 'LLM streaming', 'Потоковая передача LLM'],
    ['token-meter.md', 'Token 计量', 'Token metering', 'Учёт токенов'],
    ['system-prompt.md', '系统提示词', 'System prompts', 'Системные промпты'],
    ['compaction.md', '上下文压缩', 'Compaction', 'Компакция'],
  ]],
  ['执行与工具', 'Execution and tools', 'Исполнение и инструменты', [
    ['tools.md', '工具', 'Tools', 'Инструменты'],
    ['shell.md', 'Bash 执行', 'Bash execution', 'Исполнение Bash'],
    ['subprocess.md', '子进程', 'Subprocesses', 'Субпроцессы'],
    ['terminal.md', 'PTY 会话', 'PTY sessions', 'PTY-сессии'],
    ['jobs.md', '后台任务', 'Background jobs', 'Фоновые задания'],
    ['filesystem.md', '文件系统', 'Filesystem', 'Файловая система'],
    ['lsp.md', 'LSP 导航', 'LSP navigation', 'Навигация LSP'],
    ['code-runtime.md', '代码运行时', 'Code runtime', 'Рантайм кода'],
    ['web.md', 'Web 访问', 'Web access', 'Веб-доступ'],
    ['skills.md', '技能', 'Skills', 'Навыки'],
    ['workflow.md', '工作流', 'Workflows', 'Workflows'],
    ['subagent.md', '子代理', 'Subagents', 'Субагенты'],
  ]],
  ['策略与交互', 'Policy and interaction', 'Политики и взаимодействие', [
    ['approval.md', '审批', 'Approvals', 'Одобрения'],
    ['permission-presets.md', '权限预设', 'Permission presets', 'Пресеты разрешений'],
    ['sandbox.md', '沙箱', 'Sandboxing', 'Песочница'],
    ['plan.md', '计划模式', 'Plan mode', 'Режим плана'],
    ['user-questions.md', '用户交互', 'User interaction', 'Взаимодействие с пользователем'],
    ['commands.md', '命令', 'Human commands', 'Команды пользователя'],
    ['goal.md', '目标', 'Goals', 'Цели'],
    ['schedule.md', '定时提醒', 'Scheduled reminders', 'Напоминания по расписанию'],
  ]],
  ['平台与接入', 'Platform and access', 'Платформа и доступ', [
    ['web-server.md', 'HTTP 服务器', 'HTTP server', 'HTTP-сервер'],
    ['typert.md', 'Typert', 'Typert', 'Typert'],
    ['client-modules.md', '客户端模块', 'Client modules', 'Клиентские модули'],
    ['storage.md', '存储', 'Storage', 'Хранилище'],
    ['workspace.md', '工作区', 'Workspaces', 'Рабочие области'],
    ['settings.md', '用户设置', 'User settings', 'Пользовательские настройки'],
    ['credentials.md', '用户凭据', 'User credentials', 'Учётные данные пользователя'],
  ]],
] as const

const subsystemsReference = subsystemGroups.flatMap(([rootSection, enSection, ruSection, files]) => pairedPages(
  files.map(([file, rootLabel, enLabel, ruLabel], order): PairedPage => ({
    source: `docs/subsystems/${file}`,
    route: file === 'README.md' ? 'reference/subsystems/index.md' : `reference/subsystems/${file}`,
    label: { root: rootLabel, en: enLabel, ru: ruLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: rootSection, en: enSection, ru: ruSection },
    order,
    // Subsystem pages carry long third-level sections a two-level outline reaches.
    outline: [2, 3],
    ...(file === 'README.md' ? { sourceAliases: ['docs/subsystems'] } : {}),
  })),
))

const reference = [
  ...pairedPages(([
    ['docs/architecture.md', 'reference/index.md', '架构', 'Architecture', 'Архитектура', 0],
  ] as const).map(([source, route, rootLabel, enLabel, ruLabel, order]): PairedPage => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel, ru: ruLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '概念', en: 'Concepts', ru: 'Концепции' },
    order,
  }))),
  ...pairedPages(([
    ['docs/capability-seams.md', 'reference/capability-seams.md', '能力服务', 'Capability services', 'Сервисы возможностей', 2],
    ['docs/agent-lifecycle.md', 'reference/agent-lifecycle.md', 'Agent 生命周期', 'Agent lifecycle', 'Жизненный цикл агента', 3],
    ['docs/tool-execution-pipeline.md', 'reference/tool-execution-pipeline.md', 'Tool 执行', 'Tool execution', 'Исполнение инструментов', 4],
  ] as const).map(([source, route, rootLabel, enLabel, ruLabel, order]): PairedPage => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel, ru: ruLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '概念', en: 'Concepts', ru: 'Концепции' },
    order,
  }))),
  ...pairedPages(([
    ['docs/config-catalog.md', 'reference/config-catalog.md', '插件配置', 'Plugin configuration', 'Конфигурация плагинов'],
    ['docs/tool-catalog.md', 'reference/tool-catalog.md', 'Tool Schema', 'Tool schemas', 'Схемы инструментов'],
    ['docs/persistence-catalog.md', 'reference/persistence-catalog.md', '持久化事件', 'Persistence events', 'События персистентности', 'deep'],
  ] as const).map(([source, route, rootLabel, enLabel, ruLabel, outline], order): PairedPage => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel, ru: ruLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '生成参考', en: 'Generated reference', ru: 'Сгенерированный справочник' },
    order,
    ...(outline === undefined ? {} : { outline }),
  }))),
  ...pairedPages(([
    ['context.md', 'Context', 'Context', 'Context'],
    ['events.md', 'Events', 'Events', 'Events'],
    ['fiber.md', 'Fiber', 'Fiber', 'Fiber'],
    ['registry.md', 'Plugin Registry', 'Plugin Registry', 'Plugin Registry'],
    ['service.md', 'Service', 'Service', 'Service'],
  ] as const).map(([file, rootLabel, enLabel, ruLabel], order): PairedPage => ({
    source: `docs/cordis-api/${file}`,
    route: `reference/cordis-api/${file}`,
    label: { root: rootLabel, en: enLabel, ru: ruLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: 'Cordis API', en: 'Cordis Core API', ru: 'Core API Cordis' },
    order,
  }))),
  ...mirroredPages(([
    ['inherited.md', '继承接口面', 'Inherited surface', 'Inherited surface'],
  ] as const).map(([file, rootLabel, enLabel, ruLabel], order): MirroredPage => ({
    source: `docs/cordis-api/${file}`,
    route: `reference/cordis-api/${file}`,
    contentLocale: 'en-US',
    label: { root: rootLabel, en: enLabel, ru: ruLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: 'Cordis API', en: 'Cordis Core API', ru: 'Core API Cordis' },
    order: order + 5,
  }))),
  ...pairedPages(([
    ['adding-a-package.md', '新增 Package', 'Adding a package', 'Добавление пакета'],
    ['adding-a-tool.md', '新增 Tool', 'Adding a tool', 'Добавление инструмента'],
    ['adding-an-llm-adapter.md', '新增 LLM Adapter', 'Adding an LLM adapter', 'Добавление LLM-адаптера'],
    ['adding-a-settings-card.md', '新增设置卡片', 'Adding a settings card', 'Добавление карточки настроек'],
    ['extension-cookbook.md', '扩展模式', 'Extension patterns', 'Шаблоны расширений'],
  ] as const).map(([file, rootLabel, enLabel, ruLabel], order): PairedPage => ({
    source: `docs/cookbook/${file}`,
    route: `reference/cookbook/${file}`,
    label: { root: rootLabel, en: enLabel, ru: ruLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '开发手册', en: 'Cookbook', ru: 'Cookbook' },
    order,
  }))),
  ...pairedPages([{
    source: 'docs/cookbook/adding-a-conversation-node.md',
    route: 'reference/cookbook/adding-a-conversation-node.md',
    label: { root: '新增 Conversation Node', en: 'Adding a Conversation Node', ru: 'Добавление Conversation Node' },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '开发手册', en: 'Cookbook', ru: 'Cookbook' },
    order: 5,
  }]),
]

/**
 * Sidebar collections of each locale, in the order the site's navigation
 * presents them. The navigation bar and the llms.txt index both read this
 * sequence, so a new collection lands in both surfaces together.
 */
export const localeCollections = {
  root: ['zh-guide', 'zh-develop', 'zh-reference'],
  en: ['en-guide', 'en-develop', 'en-reference'],
  ru: ['ru-guide', 'ru-develop', 'ru-reference'],
} as const satisfies Record<DocsLocale, readonly DocsSidebar[]>

/** A sidebar group, matched to pages by `label`. */
export interface DocsSection {
  /** Group heading, equal to the `section` field of every page it holds. */
  label: string
  /** Render the group collapsed until it holds the page being read. */
  collapsed?: boolean
}

/**
 * Every sidebar group, in the order its locale renders it.
 *
 * The subsystem groups collapse because together they outnumber the rest of the
 * reference sidebar; expanded, they push every other group below the fold.
 * The Russian group labels mirror the `ru` overrides authored on each page's
 * `section`; `sectionSpec` rejects a page whose section has no placement.
 */
const enSections: readonly DocsSection[] = [
  { label: 'Guide' }, { label: 'SDK' },
  { label: 'Basics' }, { label: 'Framework' }, { label: 'Practice' }, { label: 'Cordis framework tutorial' },
  { label: 'Concepts' }, { label: 'Generated reference' }, { label: 'Cordis Core API' }, { label: 'Cookbook' },
  { label: 'Overview' },
  { label: 'Core and scopes', collapsed: true },
  { label: 'Sessions and persistence', collapsed: true },
  { label: 'Model and context', collapsed: true },
  { label: 'Execution and tools', collapsed: true },
  { label: 'Policy and interaction', collapsed: true },
  { label: 'Platform and access', collapsed: true },
]

const ruSections: readonly DocsSection[] = [
  { label: 'Руководство' }, { label: 'SDK' },
  { label: 'Основы' }, { label: 'Фреймворк' }, { label: 'Практика' }, { label: 'Туториал по фреймворку Cordis' },
  { label: 'Концепции' }, { label: 'Сгенерированный справочник' }, { label: 'Core API Cordis' }, { label: 'Cookbook' },
  { label: 'Обзор' },
  { label: 'Ядро и скоупы', collapsed: true },
  { label: 'Сессии и персистентность', collapsed: true },
  { label: 'Модель и контекст', collapsed: true },
  { label: 'Исполнение и инструменты', collapsed: true },
  { label: 'Политики и взаимодействие', collapsed: true },
  { label: 'Платформа и доступ', collapsed: true },
]

const sections: Record<DocsLocale, readonly DocsSection[]> = {
  root: [
    { label: '入门' }, { label: 'SDK' },
    { label: '基础' }, { label: '框架能力' }, { label: '实战' }, { label: 'Cordis 框架教程' },
    { label: '概念' }, { label: '生成参考' }, { label: 'Cordis API' }, { label: '开发手册' },
    { label: '总览' },
    { label: '内核与作用域', collapsed: true },
    { label: '会话与持久化', collapsed: true },
    { label: '模型与上下文', collapsed: true },
    { label: '执行与工具', collapsed: true },
    { label: '策略与交互', collapsed: true },
    { label: '平台与接入', collapsed: true },
  ],
  en: enSections,
  ru: ruSections,
}

/**
 * Placement and collapse behavior of one sidebar group.
 *
 * @param locale - Route tree whose sidebar is being built.
 * @param label - Section label carried by the pages in the group.
 * @returns The declared group, plus its zero-based position in the locale.
 * @throws When the locale declares no placement for the label. Ranking by list
 *   membership alone would sort an undeclared group silently ahead of every
 *   declared one.
 */
export function sectionSpec(locale: DocsLocale, label: string): DocsSection & { index: number } {
  const declared = sections[locale]
  const section = declared.find(candidate => candidate.label === label)
  if (section === undefined) throw new Error(`Sidebar section "${label}" has no placement in the ${locale} locale.`)
  return { ...section, index: declared.indexOf(section) }
}

/** Every canonical page published by the documentation website. */
export const docsPages: DocsPage[] = [
  ...homeAndGuide,
  ...develop,
  ...cordisTutorial,
  ...cordisPrimerReference,
  ...subsystemsReference,
  ...reference,
]

/**
 * Pages of one sidebar collection, in the order the sidebar lists them.
 *
 * @param locale - Route tree whose sidebar is being built.
 * @param collection - Sidebar collection to read.
 * @returns The collection's pages, ordered by section placement then by `order`.
 */
export function orderedPages(locale: DocsLocale, collection: DocsSidebar): DocsPage[] {
  return docsPages
    .filter(page => page.locale === locale && page.sidebar === collection)
    .sort((left, right) => (
      sectionSpec(locale, left.section).index - sectionSpec(locale, right.section).index
      || left.order - right.order
    ))
}

/**
 * Site-relative link for a published route.
 *
 * @param route - Manifest route, including its `.md` suffix.
 * @returns The link VitePress serves the route at.
 */
export function routeLink(route: string): string {
  return `/${route.replace(/(?:index)?\.md$/, '')}`
}

/**
 * Where a top-level navigation item lands.
 *
 * The target is derived rather than written down: a collection whose first page
 * is renamed or reordered would otherwise leave the navigation bar pointing at
 * a route the manifest no longer publishes.
 *
 * @param locale - Route tree the navigation item belongs to.
 * @param collection - Sidebar collection the item opens.
 * @returns Site-relative link of the collection's first page.
 * @throws When the collection publishes no page.
 */
export function landingLink(locale: DocsLocale, collection: DocsSidebar): string {
  const first = orderedPages(locale, collection)[0]
  if (first === undefined) throw new Error(`Sidebar collection "${collection}" publishes no page.`)
  return routeLink(first.route)
}

/** `command` namespace dictionaries (the popupSelect shell's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'search.placeholder': '搜索…',
  'search.aria': '筛选选项',
  'status.loading': '正在加载选项…',
  'status.applying': '正在应用…',
  'status.empty': '无选项',
  'overlay.aria': '/{command} 选项',
  'listbox.aria': '/{command} 匹配项',
  'notice.imagesUnsupported': '/{command} 不接受图片附件，请先移除图片',
} satisfies Record<string, string>

/** The command namespace key union. */
export type CommandKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'search.placeholder': 'Search…',
  'search.aria': 'Filter options',
  'status.loading': 'Loading options…',
  'status.applying': 'Applying…',
  'status.empty': 'No options',
  'overlay.aria': '/{command} options',
  'listbox.aria': '/{command} matches',
  'notice.imagesUnsupported': '/{command} does not accept image attachments; remove them first',
} satisfies Record<CommandKey, string>

/** Russian dictionary, checked complete against the zh key set. */
export const ru = {
  'search.placeholder': 'Поиск…',
  'search.aria': 'Фильтрация вариантов',
  'status.loading': 'Загрузка вариантов…',
  'status.applying': 'Применение…',
  'status.empty': 'Нет вариантов',
  'overlay.aria': 'Варианты /{command}',
  'listbox.aria': 'Совпадения /{command}',
  'notice.imagesUnsupported': '«/{command}» не принимает изображения во вложениях; сначала удалите их',
} satisfies Record<CommandKey, string>

/**
 * `command.description` namespace: localized slash-menu rows for the known
 * host commands, keyed `cmd.<name>`. A command missing here keeps the host
 * catalog's own description (the seat compares the translation result with
 * the requested key to detect the miss).
 */

/** Simplified Chinese descriptions (the key-set source of truth). */
export const descriptionZh = {
  'cmd.compact': '压缩更早的会话历史',
  'cmd.goal': '设置或查看长任务的完成目标',
  'cmd.permission': '切换权限预设（沙箱模式 + 审批策略）',
  'cmd.feedback': '记录对本次会话的反馈',
  'cmd.export': '将本会话日志下载为 ZIP 归档',
  'cmd.plan': '进入或退出计划模式',
} satisfies Record<string, string>

/** The command-description key union. */
export type CommandDescriptionKey = keyof typeof descriptionZh

/** English descriptions, checked complete against the zh key set. */
export const descriptionEn = {
  'cmd.compact': 'Compact older conversation history',
  'cmd.goal': 'Set or view the goal for a long-running task',
  'cmd.permission': 'Switch the permission preset (sandbox mode + approval policy)',
  'cmd.feedback': 'Record feedback about this session',
  'cmd.export': 'Download this session log as a ZIP archive',
  'cmd.plan': 'Enter or leave plan mode',
} satisfies Record<CommandDescriptionKey, string>

/** Russian descriptions, checked complete against the zh key set. */
export const descriptionRu = {
  'cmd.compact': 'Сжать старую историю диалога',
  'cmd.goal': 'Задать или показать цель длительной задачи',
  'cmd.permission': 'Переключить пресет разрешений (песочница + политика одобрений)',
  'cmd.feedback': 'Оставить отзыв об этой сессии',
  'cmd.export': 'Скачать лог этой сессии ZIP-архивом',
  'cmd.plan': 'Войти в режим плана или выйти из него',
} satisfies Record<CommandDescriptionKey, string>

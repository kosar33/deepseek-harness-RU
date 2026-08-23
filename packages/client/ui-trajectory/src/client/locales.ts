/** `trajectory` namespace dictionaries (view tab, toolbar, ledger, inspector, timeline). */

/** Dictionary namespace owned by this plugin. */
export const NS = 'trajectory'

/** The trajectory dictionary key set (the source of truth for both locales). */
export type TrajectoryKey =
  | 'view.trajectory'
  | 'toolbar.aria'
  | 'toolbar.duration'
  | 'toolbar.useActualDuration'
  | 'toolbar.useEqualWidth'
  | 'toolbar.actualTime'
  | 'toolbar.turns'
  | 'toolbar.expandTurns'
  | 'toolbar.collapseTurns'
  | 'toolbar.calls'
  | 'toolbar.expandCalls'
  | 'toolbar.collapseCalls'
  | 'toolbar.search'
  | 'toolbar.searchPlaceholder'
  // Record-kind badges (ledger tag, inspector badge, timeline tooltip heading).
  | 'kind.system'
  | 'kind.user'
  | 'kind.context'
  | 'kind.compacted'
  | 'kind.message'
  | 'kind.tool'
  | 'kind.subtool'
  // Legacy standalone cell labels (title case, distinct from the badges).
  | 'cell.system'
  | 'cell.user'
  | 'cell.context'
  | 'cell.compacted'
  | 'cell.message'
  | 'cell.tool'
  | 'cell.sub'
  // Inspector tabs and overview section titles.
  | 'tab.systemPrompt'
  | 'tab.tools'
  | 'tab.diff'
  | 'tab.summary'
  | 'tab.options'
  | 'tab.usage'
  | 'tab.timing'
  | 'tab.rawOutput'
  | 'tab.preview'
  | 'tab.raw'
  | 'tab.source'
  | 'tab.payload'
  | 'tab.result'
  | 'tab.schema'
  | 'tab.requestTiming'
  // Overview and detail-panel field labels.
  | 'field.started'
  | 'field.totalDuration'
  | 'field.ttft'
  | 'field.generation'
  | 'field.throughput'
  | 'field.duration'
  | 'field.tokens'
  | 'field.reasoning'
  | 'field.content'
  | 'field.input'
  | 'field.cached'
  | 'field.cacheCreated'
  | 'field.other'
  | 'field.output'
  | 'field.status'
  | 'field.purpose'
  | 'field.provider'
  | 'field.model'
  | 'field.toolCalls'
  | 'field.subtoolCalls'
  | 'field.error'
  | 'field.retry'
  | 'field.retryDelay'
  | 'field.hierarchy'
  // Retry state templates.
  | 'retry.scheduled'
  | 'retry.scheduledOf'
  // Record states.
  | 'status.failed'
  | 'status.pending'
  | 'status.completed'
  // Compaction purposes and hierarchy link badges.
  | 'purpose.compaction'
  | 'purpose.compacted'
  | 'badge.assistantMessage'
  | 'badge.toolCall'
  // Timing values and timestamp toggle titles.
  | 'timing.notRecorded'
  | 'timing.stepStartUnavailable'
  | 'timing.firstTokenUnavailable'
  | 'timing.usageUnavailable'
  | 'timing.outputTokensUnavailable'
  | 'timing.durationTooShort'
  | 'timing.source'
  | 'timing.sessionTimestamps'
  | 'timing.sessionTimestampsRunning'
  | 'timing.showLocalTime'
  | 'timing.showUnix'
  | 'value.notAvailable'
  // Usage panel.
  | 'usage.notReported'
  | 'usage.thisRequest'
  | 'usage.sessionCumulative'
  // Options, schema, and JSON tree labels.
  | 'options.notRecorded'
  | 'schema.unavailable'
  | 'schema.parameters'
  | 'json.requestOptions'
  | 'json.messageSource'
  | 'json.payload'
  | 'json.result'
  | 'json.toolParameters'
  // Message source labels.
  | 'source.unknown'
  | 'source.user'
  | 'source.plugin'
  | 'source.pluginNamed'
  | 'source.goal'
  | 'source.goalRound'
  | 'source.notRecorded'
  // Empty states.
  | 'empty.noContent'
  | 'empty.noTools'
  | 'empty.noSystemPrompt'
  | 'empty.noPayload'
  | 'empty.noResult'
  | 'empty.noTimingData'
  // Thinking toggle and tool-call-only placeholders.
  | 'detail.thinking'
  | 'detail.toolCallOnly'
  | 'row.toolCallOnlyHint'
  // History paging.
  | 'history.loadingTrajectory'
  | 'history.loadEarlier'
  | 'history.loadingEarlier'
  | 'history.clickEarlier'
  // Timeline lanes, chrome, and tooltips.
  | 'timeline.lane.input'
  | 'timeline.lane.model'
  | 'timeline.lane.tools'
  | 'a11y.timeline'
  | 'a11y.timelineTrack'
  | 'tooltip.total'
  | 'tooltip.started'
  | 'tooltip.ttftDecoding'
  // Ledger sections and request labels.
  | 'section.turn'
  | 'section.betweenTurns'
  | 'label.requestNumber'
  // Collapsed fold summaries.
  | 'summary.steps'
  | 'summary.toolCalls'
  | 'a11y.collapsedTurnSummary'
  | 'a11y.collapsedAssistantSummary'
  | 'a11y.requestOnlyRow'
  // Inspector chrome and source-block navigation.
  | 'a11y.eventDetails'
  | 'a11y.resizeEventDetails'
  | 'a11y.resizeHint'
  | 'a11y.closeDetails'
  | 'a11y.openImage'
  | 'a11y.openToolCallSummary'
  | 'a11y.openBlockCall'
  | 'detail.blockLabel'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The trajectory view tab label and toolbar strings. */
    'trajectory': TrajectoryKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<TrajectoryKey, string> = {
  'view.trajectory': '轨迹',
  'toolbar.aria': '轨迹工具栏',
  'toolbar.duration': 'Duration',
  'toolbar.useActualDuration': 'Use actual duration',
  'toolbar.useEqualWidth': 'Use equal-width operations',
  'toolbar.actualTime': '实际时间',
  'toolbar.turns': 'Turns',
  'toolbar.expandTurns': 'Expand turns',
  'toolbar.collapseTurns': 'Collapse turns',
  'toolbar.calls': 'Calls',
  'toolbar.expandCalls': 'Expand calls',
  'toolbar.collapseCalls': 'Collapse calls',
  'toolbar.search': '搜索轨迹',
  'toolbar.searchPlaceholder': '搜索',
  'kind.system': '系统',
  'kind.user': '用户',
  'kind.context': '上下文',
  'kind.compacted': '已压缩',
  'kind.message': '助手',
  'kind.tool': '工具',
  'kind.subtool': '子工具',
  'cell.system': '系统',
  'cell.user': '用户',
  'cell.context': '上下文',
  'cell.compacted': '已压缩',
  'cell.message': '消息',
  'cell.tool': '工具',
  'cell.sub': '子工具',
  'tab.systemPrompt': '系统提示词',
  'tab.tools': '工具',
  'tab.diff': '差异',
  'tab.summary': '摘要',
  'tab.options': '选项',
  'tab.usage': '用量',
  'tab.timing': '耗时',
  'tab.rawOutput': '原始输出',
  'tab.preview': '预览',
  'tab.raw': '原文',
  'tab.source': '来源',
  'tab.payload': '载荷',
  'tab.result': '结果',
  'tab.schema': 'Schema',
  'tab.requestTiming': '请求耗时',
  'field.started': '开始时间',
  'field.totalDuration': '总耗时',
  'field.ttft': '首 token',
  'field.generation': '生成耗时',
  'field.throughput': '吞吐量',
  'field.duration': '耗时',
  'field.tokens': 'Token',
  'field.reasoning': '推理',
  'field.content': '正文',
  'field.input': '输入',
  'field.cached': '缓存读取',
  'field.cacheCreated': '缓存写入',
  'field.other': '其他',
  'field.output': '输出',
  'field.status': '状态',
  'field.purpose': '用途',
  'field.provider': '提供商',
  'field.model': '模型',
  'field.toolCalls': '工具调用',
  'field.subtoolCalls': '子工具调用',
  'field.error': '错误',
  'field.retry': '重试',
  'field.retryDelay': '重试延迟',
  'field.hierarchy': '层级',
  'retry.scheduled': '第 {retry} 次重试',
  'retry.scheduledOf': '第 {retry} 次重试，共 {maximum} 次',
  'status.failed': '失败',
  'status.pending': '等待中',
  'status.completed': '已完成',
  'purpose.compaction': '压缩',
  'purpose.compacted': '已压缩',
  'badge.assistantMessage': '助手消息',
  'badge.toolCall': '工具调用',
  'timing.notRecorded': '未记录',
  'timing.stepStartUnavailable': '步骤开始时间不可用',
  'timing.firstTokenUnavailable': '首个 token 时间不可用',
  'timing.usageUnavailable': '用量不可用',
  'timing.outputTokensUnavailable': '输出 token 数不可用',
  'timing.durationTooShort': '耗时过短，无法统计',
  'timing.source': '计时来源',
  'timing.sessionTimestamps': '会话时间戳',
  'timing.sessionTimestampsRunning': '会话时间戳（进行中）',
  'timing.showLocalTime': '显示本地时间',
  'timing.showUnix': '显示 Unix 时间戳',
  'value.notAvailable': '不可用',
  'usage.notReported': '未上报用量',
  'usage.thisRequest': '本次请求',
  'usage.sessionCumulative': '会话累计',
  'options.notRecorded': '未记录请求选项',
  'schema.unavailable': 'Schema 不可用',
  'schema.parameters': '参数',
  'json.requestOptions': '请求选项 JSON',
  'json.messageSource': '消息来源 JSON',
  'json.payload': '载荷 JSON',
  'json.result': '结果 JSON',
  'json.toolParameters': '{name} 参数 JSON',
  'source.unknown': '未知',
  'source.user': '用户',
  'source.plugin': '插件',
  'source.pluginNamed': '插件 · {plugin}',
  'source.goal': '目标',
  'source.goalRound': '目标 · 第 {round} 轮',
  'source.notRecorded': '未记录来源',
  'empty.noContent': '无内容',
  'empty.noTools': '此请求没有工具',
  'empty.noSystemPrompt': '此请求没有系统提示词',
  'empty.noPayload': '未捕获载荷',
  'empty.noResult': '未捕获结果',
  'empty.noTimingData': '暂无计时数据',
  'detail.thinking': '思考',
  'detail.toolCallOnly': '仅工具调用',
  'row.toolCallOnlyHint': '（仅工具调用）',
  'history.loadingTrajectory': '轨迹载入中…',
  'history.loadEarlier': '加载更早历史',
  'history.loadingEarlier': '正在加载更早历史…',
  'history.clickEarlier': '点击加载更早历史',
  'timeline.lane.input': '输入',
  'timeline.lane.model': '模型',
  'timeline.lane.tools': '工具',
  'a11y.timeline': '轨迹时间线',
  'a11y.timelineTrack': '时间线总览；左右拖动以聚焦事件',
  'tooltip.total': '总计 {duration}',
  'tooltip.started': '开始于 {time}',
  'tooltip.ttftDecoding': 'TTFT {ttft} · 解码 {decoding}',
  'section.turn': '第 {turn} 回合',
  'section.betweenTurns': '回合之间',
  'label.requestNumber': '请求 #{number}',
  'summary.steps': '{count} 步',
  'summary.toolCalls': '{count} 次工具调用',
  'a11y.collapsedTurnSummary': '已折叠回合摘要，{summary}',
  'a11y.collapsedAssistantSummary': '已折叠助手工具调用摘要，{summary}',
  'a11y.requestOnlyRow': '请求 {number}，压缩',
  'a11y.eventDetails': '事件详情',
  'a11y.resizeEventDetails': '调整事件详情宽度',
  'a11y.resizeHint': '拖动调整宽度，双击恢复默认。',
  'a11y.closeDetails': '关闭详情',
  'a11y.openImage': '打开图片',
  'a11y.openToolCallSummary': '打开工具调用摘要',
  'a11y.openBlockCall': '打开块 #{index} 的工具调用摘要',
  'detail.blockLabel': '块 #{index} {type}',
}

/** English dictionary. */
export const en: Record<TrajectoryKey, string> = {
  'view.trajectory': 'Trajectory',
  'toolbar.aria': 'Trajectory toolbar',
  'toolbar.duration': 'Duration',
  'toolbar.useActualDuration': 'Use actual duration',
  'toolbar.useEqualWidth': 'Use equal-width operations',
  'toolbar.actualTime': 'Actual time',
  'toolbar.turns': 'Turns',
  'toolbar.expandTurns': 'Expand turns',
  'toolbar.collapseTurns': 'Collapse turns',
  'toolbar.calls': 'Calls',
  'toolbar.expandCalls': 'Expand calls',
  'toolbar.collapseCalls': 'Collapse calls',
  'toolbar.search': 'Search trajectory',
  'toolbar.searchPlaceholder': 'Search',
  'kind.system': 'SYSTEM',
  'kind.user': 'USER',
  'kind.context': 'CONTEXT',
  'kind.compacted': 'COMPACTED',
  'kind.message': 'ASSISTANT',
  'kind.tool': 'TOOL',
  'kind.subtool': 'SUBTOOL',
  'cell.system': 'System',
  'cell.user': 'User',
  'cell.context': 'Context',
  'cell.compacted': 'Compacted',
  'cell.message': 'Message',
  'cell.tool': 'Tool',
  'cell.sub': 'Sub',
  'tab.systemPrompt': 'System Prompt',
  'tab.tools': 'Tools',
  'tab.diff': 'Diff',
  'tab.summary': 'Summary',
  'tab.options': 'Options',
  'tab.usage': 'Usage',
  'tab.timing': 'Timing',
  'tab.rawOutput': 'Raw Output',
  'tab.preview': 'Preview',
  'tab.raw': 'Raw',
  'tab.source': 'Source',
  'tab.payload': 'Payload',
  'tab.result': 'Result',
  'tab.schema': 'Schema',
  'tab.requestTiming': 'Request Timing',
  'field.started': 'Started',
  'field.totalDuration': 'Total duration',
  'field.ttft': 'TTFT',
  'field.generation': 'Generation',
  'field.throughput': 'Throughput',
  'field.duration': 'Duration',
  'field.tokens': 'Tokens',
  'field.reasoning': 'Reasoning',
  'field.content': 'Content',
  'field.input': 'Input',
  'field.cached': 'Cached',
  'field.cacheCreated': 'Cache created',
  'field.other': 'Other',
  'field.output': 'Output',
  'field.status': 'Status',
  'field.purpose': 'Purpose',
  'field.provider': 'Provider',
  'field.model': 'Model',
  'field.toolCalls': 'Tool calls',
  'field.subtoolCalls': 'Subtool calls',
  'field.error': 'Error',
  'field.retry': 'Retry',
  'field.retryDelay': 'Retry delay',
  'field.hierarchy': 'Hierarchy',
  'retry.scheduled': 'Scheduled {retry}',
  'retry.scheduledOf': 'Scheduled {retry} of {maximum}',
  'status.failed': 'Failed',
  'status.pending': 'Pending',
  'status.completed': 'Completed',
  'purpose.compaction': 'Compaction',
  'purpose.compacted': 'Compacted',
  'badge.assistantMessage': 'Assistant Message',
  'badge.toolCall': 'Tool Call',
  'timing.notRecorded': 'Not recorded',
  'timing.stepStartUnavailable': 'Step start unavailable',
  'timing.firstTokenUnavailable': 'First token unavailable',
  'timing.usageUnavailable': 'Usage unavailable',
  'timing.outputTokensUnavailable': 'Output tokens unavailable',
  'timing.durationTooShort': 'Duration too short',
  'timing.source': 'Timing source',
  'timing.sessionTimestamps': 'Session timestamps',
  'timing.sessionTimestampsRunning': 'Session timestamps (running)',
  'timing.showLocalTime': 'Show local time',
  'timing.showUnix': 'Show Unix timestamp',
  'value.notAvailable': 'Not available',
  'usage.notReported': 'Usage not reported',
  'usage.thisRequest': 'This request',
  'usage.sessionCumulative': 'Session cumulative',
  'options.notRecorded': 'Options not recorded',
  'schema.unavailable': 'Schema unavailable',
  'schema.parameters': 'Parameters',
  'json.requestOptions': 'Request options JSON',
  'json.messageSource': 'Message source JSON',
  'json.payload': 'Payload JSON',
  'json.result': 'Result JSON',
  'json.toolParameters': '{name} parameters JSON',
  'source.unknown': 'Unknown',
  'source.user': 'User',
  'source.plugin': 'Plugin',
  'source.pluginNamed': 'Plugin · {plugin}',
  'source.goal': 'Goal',
  'source.goalRound': 'Goal · Round {round}',
  'source.notRecorded': 'Source not recorded',
  'empty.noContent': 'No content',
  'empty.noTools': 'No tools in this request',
  'empty.noSystemPrompt': 'No system prompt in this request',
  'empty.noPayload': 'No payload captured',
  'empty.noResult': 'No result captured',
  'empty.noTimingData': 'No timing data',
  'detail.thinking': 'Thinking',
  'detail.toolCallOnly': 'Tool call only',
  'row.toolCallOnlyHint': '(tool call only)',
  'history.loadingTrajectory': 'Loading trajectory…',
  'history.loadEarlier': 'Load earlier history',
  'history.loadingEarlier': 'Loading earlier history…',
  'history.clickEarlier': 'Click to load earlier history',
  'timeline.lane.input': 'Input',
  'timeline.lane.model': 'Model',
  'timeline.lane.tools': 'Tools',
  'a11y.timeline': 'Trajectory timeline',
  'a11y.timelineTrack': 'Timeline overview; drag horizontally to focus events',
  'tooltip.total': 'Total {duration}',
  'tooltip.started': 'Started {time}',
  'tooltip.ttftDecoding': 'TTFT {ttft} · Decoding {decoding}',
  'section.turn': 'Turn {turn}',
  'section.betweenTurns': 'Between turns',
  'label.requestNumber': 'Request #{number}',
  'summary.steps': '{count} steps',
  'summary.toolCalls': '{count} tool calls',
  'a11y.collapsedTurnSummary': 'Collapsed turn summary, {summary}',
  'a11y.collapsedAssistantSummary': 'Collapsed assistant summary, {summary}',
  'a11y.requestOnlyRow': 'Request {number}, compaction',
  'a11y.eventDetails': 'Event details',
  'a11y.resizeEventDetails': 'Resize event details',
  'a11y.resizeHint': 'Drag to resize. Double-click to reset.',
  'a11y.closeDetails': 'Close details',
  'a11y.openImage': 'Open image',
  'a11y.openToolCallSummary': 'Open tool call summary',
  'a11y.openBlockCall': 'Open Block #{index} tool call summary',
  'detail.blockLabel': 'Block #{index} {type}',
}

/** Russian dictionary, checked complete against the zh key set. */
export const ru: Record<TrajectoryKey, string> = {
  'view.trajectory': 'Траектория',
  'toolbar.aria': 'Панель траектории',
  'toolbar.duration': 'Длительность',
  'toolbar.useActualDuration': 'Использовать фактическую длительность',
  'toolbar.useEqualWidth': 'Использовать одинаковую ширину операций',
  'toolbar.actualTime': 'Фактическое время',
  'toolbar.turns': 'Ходы',
  'toolbar.expandTurns': 'Развернуть ходы',
  'toolbar.collapseTurns': 'Свернуть ходы',
  'toolbar.calls': 'Вызовы',
  'toolbar.expandCalls': 'Развернуть вызовы',
  'toolbar.collapseCalls': 'Свернуть вызовы',
  'toolbar.search': 'Поиск по траектории',
  'toolbar.searchPlaceholder': 'Поиск',
  'kind.system': 'Система',
  'kind.user': 'Пользователь',
  'kind.context': 'Контекст',
  'kind.compacted': 'Сжато',
  'kind.message': 'Ассистент',
  'kind.tool': 'Инструмент',
  'kind.subtool': 'Подвызов',
  'cell.system': 'Система',
  'cell.user': 'Пользователь',
  'cell.context': 'Контекст',
  'cell.compacted': 'Сжато',
  'cell.message': 'Сообщение',
  'cell.tool': 'Инструмент',
  'cell.sub': 'Подвызов',
  'tab.systemPrompt': 'Системный промпт',
  'tab.tools': 'Инструменты',
  'tab.diff': 'Различия',
  'tab.summary': 'Сводка',
  'tab.options': 'Параметры',
  'tab.usage': 'Использование',
  'tab.timing': 'Время',
  'tab.rawOutput': 'Необработанный вывод',
  'tab.preview': 'Предпросмотр',
  'tab.raw': 'Исходный текст',
  'tab.source': 'Источник',
  'tab.payload': 'Пейлоад',
  'tab.result': 'Результат',
  'tab.schema': 'Схема',
  'tab.requestTiming': 'Время запроса',
  'field.started': 'Начало',
  'field.totalDuration': 'Общая длительность',
  'field.ttft': 'TTFT',
  'field.generation': 'Генерация',
  'field.throughput': 'Пропускная способность',
  'field.duration': 'Длительность',
  'field.tokens': 'Токены',
  'field.reasoning': 'Размышления',
  'field.content': 'Содержание',
  'field.input': 'Ввод',
  'field.cached': 'Кэшировано',
  'field.cacheCreated': 'Создано в кэше',
  'field.other': 'Другое',
  'field.output': 'Вывод',
  'field.status': 'Статус',
  'field.purpose': 'Назначение',
  'field.provider': 'Провайдер',
  'field.model': 'Модель',
  'field.toolCalls': 'Вызовы инструментов',
  'field.subtoolCalls': 'Подвызовы',
  'field.error': 'Ошибка',
  'field.retry': 'Повтор',
  'field.retryDelay': 'Задержка повтора',
  'field.hierarchy': 'Иерархия',
  'retry.scheduled': 'Повтор {retry}',
  'retry.scheduledOf': 'Повтор {retry} из {maximum}',
  'status.failed': 'Ошибка',
  'status.pending': 'Ожидает',
  'status.completed': 'Завершено',
  'purpose.compaction': 'Сжатие',
  'purpose.compacted': 'Сжато',
  'badge.assistantMessage': 'Сообщение ассистента',
  'badge.toolCall': 'Вызов инструмента',
  'timing.notRecorded': 'Не записано',
  'timing.stepStartUnavailable': 'Нет времени начала шага',
  'timing.firstTokenUnavailable': 'Недоступно время первого токена',
  'timing.usageUnavailable': 'Данные использования недоступны',
  'timing.outputTokensUnavailable': 'Нет числа выходных токенов',
  'timing.durationTooShort': 'Длительность слишком мала',
  'timing.source': 'Источник времени',
  'timing.sessionTimestamps': 'Метки времени сессии',
  'timing.sessionTimestampsRunning': 'Метки времени сессии (выполняется)',
  'timing.showLocalTime': 'Показать местное время',
  'timing.showUnix': 'Показать Unix-время',
  'value.notAvailable': 'Недоступно',
  'usage.notReported': 'Использование не передано',
  'usage.thisRequest': 'Этот запрос',
  'usage.sessionCumulative': 'За сессию',
  'options.notRecorded': 'Параметры не записаны',
  'schema.unavailable': 'Схема недоступна',
  'schema.parameters': 'Параметры',
  'json.requestOptions': 'JSON параметров запроса',
  'json.messageSource': 'JSON источника сообщения',
  'json.payload': 'JSON пейлоада',
  'json.result': 'JSON результата',
  'json.toolParameters': '{name}: JSON параметров',
  'source.unknown': 'Неизвестно',
  'source.user': 'Пользователь',
  'source.plugin': 'Плагин',
  'source.pluginNamed': 'Плагин · {plugin}',
  'source.goal': 'Цель',
  'source.goalRound': 'Цель · Раунд {round}',
  'source.notRecorded': 'Источник не записан',
  'empty.noContent': 'Нет содержимого',
  'empty.noTools': 'В этом запросе нет инструментов',
  'empty.noSystemPrompt': 'В этом запросе нет системного промпта',
  'empty.noPayload': 'Пейлоад не зафиксирован',
  'empty.noResult': 'Результат не зафиксирован',
  'empty.noTimingData': 'Нет данных времени',
  'detail.thinking': 'Размышления',
  'detail.toolCallOnly': 'Только вызов инструмента',
  'row.toolCallOnlyHint': '(только вызов инструмента)',
  'history.loadingTrajectory': 'Загрузка траектории…',
  'history.loadEarlier': 'Загрузить более раннюю историю',
  'history.loadingEarlier': 'Загрузка более ранней истории…',
  'history.clickEarlier': 'Нажмите, чтобы загрузить более раннюю историю',
  'timeline.lane.input': 'Ввод',
  'timeline.lane.model': 'Модель',
  'timeline.lane.tools': 'Инструменты',
  'a11y.timeline': 'Временная шкала траектории',
  'a11y.timelineTrack': 'Обзор временной шкалы; перетащите по горизонтали, чтобы сфокусировать события',
  'tooltip.total': 'Всего {duration}',
  'tooltip.started': 'Начало {time}',
  'tooltip.ttftDecoding': 'TTFT {ttft} · Декодирование {decoding}',
  'section.turn': 'Ход {turn}',
  'section.betweenTurns': 'Между ходами',
  'label.requestNumber': 'Запрос #{number}',
  'summary.steps': 'Шагов: {count}',
  'summary.toolCalls': 'Вызовов инструментов: {count}',
  'a11y.collapsedTurnSummary': 'Свернута сводка хода, {summary}',
  'a11y.collapsedAssistantSummary': 'Свернута сводка вызовов ассистента, {summary}',
  'a11y.requestOnlyRow': 'Запрос {number}, сжатие',
  'a11y.eventDetails': 'Детали события',
  'a11y.resizeEventDetails': 'Изменить размер деталей события',
  'a11y.resizeHint': 'Потяните, чтобы изменить размер. Двойной щелчок — сброс.',
  'a11y.closeDetails': 'Закрыть детали',
  'a11y.openImage': 'Открыть изображение',
  'a11y.openToolCallSummary': 'Открыть сводку вызова инструмента',
  'a11y.openBlockCall': 'Открыть сводку вызова инструмента в блоке #{index}',
  'detail.blockLabel': 'Блок #{index} {type}',
}

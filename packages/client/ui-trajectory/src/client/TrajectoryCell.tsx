// Legacy standalone trajectory cell retained for direct consumers and specs.

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS, type TrajectoryKey } from './locales.ts'
import {
  formatElapsedSeconds,
  type TrajectoryCellKind,
  type TrajectoryCellProps,
} from './trajectory-record.ts'
import css from './TrajectoryCell.module.css'

/** The namespace-bound translate seat this component consumes. */
type Translate = TranslateNS<typeof NS>

export { formatElapsedSeconds }
export type {
  AssistantMetricDetail,
  TrajectoryCellKind,
  TrajectoryCellProps,
} from './trajectory-record.ts'

/** Dictionary key per kind; the label renders through the bound translate. */
const KIND_KEYS: Record<TrajectoryCellKind, TrajectoryKey> = {
  system: 'cell.system',
  user: 'cell.user',
  context: 'cell.context',
  compacted: 'cell.compacted',
  message: 'cell.message',
  tool: 'cell.tool',
  subtool: 'cell.sub',
}

const TAG_CLASS: Record<TrajectoryCellKind, string | undefined> = {
  system: css.tagSystem,
  user: css.tagUser,
  context: css.tagContext,
  compacted: css.tagSystem,
  message: css.tagMessage,
  tool: css.tagTool,
  subtool: css.tagSubtool,
}

/**
 * Render one trajectory step cell.
 * @param props - index, kind, text, time, optional Message metrics, and the bound translate.
 * @returns the cell element.
 */
export function TrajectoryCell({
  index,
  kind,
  text,
  inputDetail: _inputDetail,
  promptDetail: _promptDetail,
  previousPromptDetail: _previousPromptDetail,
  outputDetail: _outputDetail,
  thinkingDetail: _thinkingDetail,
  sourceBlocks: _sourceBlocks,
  outputBlocks: _outputBlocks,
  schemaDetail: _schemaDetail,
  assistantMetrics: _assistantMetrics,
  result: _result,
  callId: _callId,
  isError: _isError,
  timeSeconds,
  startedAt: _startedAt,
  input,
  output,
  think,
  selected = false,
  className,
  t,
  ...rest
}: TrajectoryCellProps & { t: Translate }) {
  const rootClass = [
    css.root,
    selected ? css.selected : undefined,
    className,
  ].filter((c): c is string => c !== undefined).join(' ')
  const showMetrics = kind === 'message'
  return (
    <div className={rootClass} data-kind={kind} data-selected={selected || undefined} {...rest}>
      <span className={css.index}>#{index}</span>
      <span className={css.tagSlot}>
        <span className={[css.tag, TAG_CLASS[kind]].filter((c): c is string => c !== undefined).join(' ')}>{t(KIND_KEYS[kind])}</span>
      </span>
      <span className={css.text}>{text}</span>
      <span className={css.trailing}>
        {showMetrics ? (
          <>
            <span className={css.metric}>{input ?? ''}</span>
            <span className={css.metric}>{output ?? ''}</span>
            <span className={css.metric}>{think ?? ''}</span>
          </>
        ) : null}
        <span className={css.time}>{formatElapsedSeconds(timeSeconds)}</span>
      </span>
    </div>
  )
}

/**
 * The credential seat inside one provider card: the ordered rotating-key
 * editor the Models section dispatches to for `props.provider`, replacing
 * that card's single API-key input while this plugin is mounted. Pool health
 * renders as per-key chips — the sticky key highlighted, a parked one with
 * its «лимит откатится» countdown — above rows that write only through the
 * credential seam; typed values land in the credential store under derived
 * `<ROUTE>_KEYROTATION_<n>` references and the row order lands as one
 * whole-array `keys` set, so no secret ever reaches the settings document.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import clsx from 'clsx'
import { formatResetCountdown } from './countdown.ts'
import type { CountdownCopyKey } from './countdown.ts'
import { deriveKeyRef, storedRefsOf } from './store.ts'
import type { KeyRotationStore, KeyRowDraft } from './store.ts'
import type { en } from './locales.ts'
import styles from './KeysEditor.module.css'

/** Injected dependencies of {@link KeysEditor} (slot `inject`). */
export interface KeysEditorInjected {
  /** The shared store (loaded on first render, refreshed on pushed invalidations). */
  controller: KeyRotationStore
  hooks: {
    /** Store snapshot bound by the UI renderer as the useSnapshot hook. */
    snapshot: KeyRotationStore['store']
  }
  /** Seat copy. */
  t: (key: keyof typeof en) => string
}

/**
 * Props delivered by the slot outlet: the owner share names the edited
 * route, and the inject face spreads flat (the renderer erases the share
 * boundary at the render call).
 */
export type KeysEditorProps =
  PropsRuntime<'settings.models.credential'>
  & Partial<InjectFace<KeysEditorInjected>>

type SeatFace = InjectFace<KeysEditorInjected>

/** The two localized countdown templates {@link formatResetCountdown} fills. */
function countdownCopy(t: (key: keyof typeof en) => string): Record<CountdownCopyKey, string> {
  return {
    resetCountdownHours: t('resetCountdownHours'),
    resetCountdownMinutes: t('resetCountdownMinutes'),
  }
}

/** Move the row at `index` by `step` (-1 | +1), clamped to the list. */
function withRowMoved(rows: readonly KeyRowDraft[], index: number, step: -1 | 1): KeyRowDraft[] {
  const target = index + step
  /* v8 ignore next -- the arrows render disabled at either list end and React
     never dispatches their click handlers there */
  if (target < 0 || target >= rows.length) return [...rows]
  const moving = rows[index] as KeyRowDraft
  const displaced = rows[target] as KeyRowDraft
  return rows.map((row, i) => i === index ? displaced : i === target ? moving : row)
}

/** Replace the row at `index` with `next`. */
function withRowAt(rows: readonly KeyRowDraft[], index: number, next: KeyRowDraft): KeyRowDraft[] {
  return rows.map((row, i) => i === index ? next : row)
}

/** One card's local draft: its provider plus the editable rows in order. */
interface CardDraft {
  provider: string
  rows: KeyRowDraft[]
}

/**
 * Render one provider card's rotating-key editor.
 * @param props - the addressed route plus injected dependencies.
 * @returns the editor seat, or null while the shell has not injected yet.
 */
export function KeysEditor(props: KeysEditorProps): ReactNode {
  const { controller, useSnapshot, t } = props
  if (controller === undefined || useSnapshot === undefined || t === undefined) return null
  return <Loaded provider={props.provider} injected={{ controller, useSnapshot, t }} />
}

function Loaded(
  { provider, injected }: { provider: string; injected: SeatFace },
): ReactNode {
  const { controller, useSnapshot, t } = injected
  const state = useSnapshot(snapshot => snapshot)

  // The card's local draft, keyed by provider so a parent that re-points the
  // card at another route rebuilds rows instead of showing stale ones. Rows
  // materialize once the shared store is ready and keep their typed values
  // across pushed refreshes of that same provider.
  const [draft, setDraft] = useState<CardDraft | undefined>(undefined)
  if (state.status === 'ready' && (draft === undefined || draft.provider !== provider)) {
    setDraft({ provider, rows: storedRefsOf(provider, state.namespace).map(ref => ({ ref, value: '' })) })
  }

  // Parked countdowns age with the wall clock between pushed refreshes.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()) }, 30_000)
    return () => { window.clearInterval(timer) }
  }, [])

  const [saveFailure, setSaveFailure] = useState<string | undefined>(undefined)

  if (state.status === 'idle') void controller.load()
  if (state.status === 'error') {
    /* v8 ignore next -- an error status always carries text; the fallback satisfies the nullable type */
    return (
      <div className={styles['seat']}>
        <p className={styles['error']}>{`${t('loadFailed')}: ${state.error ?? ''}`}</p>
        <button type="button" className={styles['saveButton']} onClick={() => { void controller.load() }}>
          {t('retry')}
        </button>
      </div>
    )
  }
  if (draft === undefined || draft.provider !== provider) return null

  const storedRefs = storedRefsOf(provider, state.namespace)
  const isStored = (ref: string): boolean => ref.length > 0 && storedRefs.includes(ref)
  const pool = state.routes.find(route => route.provider === provider)
  const disabled = !state.writable
  // A brand-new row blocks saving until its value is typed; a stored row may
  // stay blank, which keeps its already-stored credential untouched.
  const blankFailure = draft.rows.some(row => !isStored(row.ref) && row.value.trim().length === 0)
    ? t('keyBlank')
    : undefined

  const save = async (): Promise<void> => {
    const failure = await controller.saveRoute(provider, draft.rows)
    if (failure !== undefined) {
      setSaveFailure(failure)
      return
    }
    setSaveFailure(undefined)
    // Consumed values clear back to placeholders; kept rows stay in order.
    setDraft({ provider, rows: draft.rows.filter(row => row.ref.length > 0).map(({ ref }) => ({ ref, value: '' })) })
  }

  // Live pool health above the rows: the sticky position highlighted, a
  // parked chip carrying its reset countdown.
  let chips: ReactNode = null
  if (pool !== undefined) {
    chips = (
      <div className={styles['chips']}>
        {pool.keys.map((key) => {
          const active = key.label === pool.activeLabel
          const parked = key.status.state === 'parked'
          return (
            <span
              key={key.label}
              className={clsx(styles['chip'], parked && styles['chipParked'], active && styles['chipActive'])}
            >
              <span className={styles['dot']} aria-hidden />
              {active ? t('activeChip') : parked ? t('parkedChip') : t('usableChip')}
              {key.status.state === 'parked' ? (
                <span className={styles['countdown']}>
                  {formatResetCountdown(key.status.resetAt, now, countdownCopy(t))}
                </span>
              ) : null}
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div className={styles['seat']}>
      <span className={styles['label']}>{t('keys')}</span>
      {!state.writable ? <p className={styles['hint']}>{t('readOnly')}</p> : null}
      {chips}
      <div className={styles['rows']}>
        {draft.rows.map((row, index) => (
          <div key={`${row.ref}:${index}`} className={styles['row']}>
            <span className={styles['rowIndex']}>{String(index + 1)}</span>
            <span className={styles['ref']}>{row.ref}</span>
            <input
              className={styles['value']}
              type="password"
              autoComplete="off"
              value={row.value}
              placeholder={isStored(row.ref) ? t('keyStored') : t('keyValuePlaceholder')}
              aria-label={`${t('keyValue')} ${index + 1}`}
              disabled={disabled}
              onChange={(event) => {
                setDraft({ ...draft, rows: withRowAt(draft.rows, index, { ...row, value: event.target.value }) })
              }}
            />
            <button
              type="button"
              className={styles['rowAction']}
              aria-label={t('moveUp')}
              disabled={disabled || index === 0}
              onClick={() => { setDraft({ ...draft, rows: withRowMoved(draft.rows, index, -1) }) }}
            >
              ↑
            </button>
            <button
              type="button"
              className={styles['rowAction']}
              aria-label={t('moveDown')}
              disabled={disabled || index === draft.rows.length - 1}
              onClick={() => { setDraft({ ...draft, rows: withRowMoved(draft.rows, index, 1) }) }}
            >
              ↓
            </button>
            <button
              type="button"
              className={styles['rowAction']}
              aria-label={t('removeKey')}
              disabled={disabled}
              onClick={() => { setDraft({ ...draft, rows: draft.rows.filter((_, i) => i !== index) }) }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className={styles['actions']}>
        <button
          type="button"
          className={styles['addButton']}
          disabled={disabled}
          onClick={() => {
            setDraft({
              ...draft,
              rows: [...draft.rows, { ref: deriveKeyRef(provider, draft.rows.map(row => row.ref)), value: '' }],
            })
          }}
        >
          + {t('addKey')}
        </button>
        <button
          type="button"
          className={styles['saveButton']}
          disabled={disabled || blankFailure !== undefined}
          onClick={() => { void save() }}
        >
          {t('save')}
        </button>
      </div>
      {blankFailure === undefined ? null : <p className={styles['error']}>{blankFailure}</p>}
      {saveFailure === undefined ? null : <p className={styles['error']}>{saveFailure}</p>}
    </div>
  )
}

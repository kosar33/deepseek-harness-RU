/**
 * Key-rotation settings section: one page joining the rotation plugin's live
 * pool snapshot (`llm.keyRotation`) with the `llm-key-rotation` settings
 * namespace and the credential states of its references. The upper card
 * renders per-key status — usable / parked chips plus «лимит откатится через
 * Nч Mм» countdowns computed from `resetAt` — while the stored-route cards
 * open one editor at a time. Every mutation writes through the wire: typed
 * API keys land in the credential store (`credentials.set`, write-only, under
 * a derived `<ROUTE>_KEYROTATION_<n>` reference) and route rows land as
 * `settings.mutate` path ops, so no secret ever reaches the settings document.
 * A deployment without the plugin renders its notice; a composed-but-empty
 * one renders the dormant invitation; base-layer-owned routes hide their
 * delete affordance instead of failing the write.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CredentialView } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { formatResetCountdown } from './countdown.ts'
import type { CountdownCopyKey } from './countdown.ts'
import {
  baseOwnedRoutes, deriveKeyRef, draftFailure, fill, routeNameValid, storedProfiles, storedRefsOf,
} from './store.ts'
import type { KeyRotationStore, KeyRowDraft, ModelRowDraft, RouteDraft } from './store.ts'
import type { DraftFailureKey } from './store.ts'
import type { en } from './locales.ts'
import styles from './KeyRotationSection.module.css'

/** Injected dependencies of {@link KeyRotationSection} (slot `inject`). */
export interface KeyRotationSectionInjected {
  /** The page store (loaded on mount, refreshed on pushed invalidations). */
  controller: KeyRotationStore
  hooks: {
    /** Page snapshot bound by the UI renderer as the useSnapshot hook. */
    snapshot: KeyRotationStore['store']
  }
  /** Section copy. */
  t: (key: keyof typeof en) => string
}

/**
 * Props delivered by the slot outlet: the inject face spread flat (the
 * renderer erases the share boundary at the render call).
 */
export type KeyRotationSectionProps = Partial<InjectFace<KeyRotationSectionInjected>>

type SectionFace = InjectFace<KeyRotationSectionInjected>

/** The two localized countdown templates {@link formatResetCountdown} fills. */
function countdownCopy(t: (key: keyof typeof en) => string): Record<CountdownCopyKey, string> {
  return {
    resetCountdownHours: t('resetCountdownHours'),
    resetCountdownMinutes: t('resetCountdownMinutes'),
  }
}

/** Human label for a stored route: its display name when set, else the route id. */
function routeLabel(route: string, namespace: Parameters<typeof storedProfiles>[0]): string {
  const name = storedProfiles(namespace)[route]?.displayName?.trim() ?? ''
  return name.length > 0 ? name : route
}

/** Replace the draft's model row at `index` with `next`. */
function withModel(draft: RouteDraft, index: number, next: ModelRowDraft): RouteDraft {
  return { ...draft, models: draft.models.map((model, i) => i === index ? next : model) }
}

/** Move the draft's key row at `index` by `step` (-1 | +1), clamped to the list. */
function withKeyMoved(draft: RouteDraft, index: number, step: -1 | 1): RouteDraft {
  const target = index + step
  /* v8 ignore next -- the arrows render disabled at either list end and React
     never dispatches their click handlers there; every other caller passes an
     in-range rendered row index */
  if (target < 0 || target >= draft.keys.length) return draft
  // The clamp above keeps both indices inside the dense rows array.
  const moving = draft.keys[index] as KeyRowDraft
  const displaced = draft.keys[target] as KeyRowDraft
  return {
    ...draft,
    keys: draft.keys.map((key, i) => i === index ? displaced : i === target ? moving : key),
  }
}

/** Props of one open editor card ({@link EditorCard}). */
interface EditorCardProps {
  /** The route being edited (also the reserved name of a not-yet-stored one). */
  route: string
  /** Whether the card creates a route the namespace does not store yet. */
  isNew: boolean
  draft: RouteDraft
  /** References the section currently stores for this route. */
  storedRefs: readonly string[]
  /** Credential states for the visible references, by ref. */
  credentials: ReadonlyMap<string, CredentialView>
  writable: boolean
  /** Settled failure text of the last save attempt. */
  saveError: string | null
  t: (key: keyof typeof en) => string
  onChange: (next: RouteDraft) => void
  onSave: () => void
  onClose: () => void
}

/**
 * Render the editor card for one rotated route. Field-level validation gates
 * the save button locally — an invalid draft never reaches the wire; wire
 * failures surface through {@link EditorCardProps.saveError}.
 */
function EditorCard({
  route, isNew, draft, storedRefs, credentials, writable, saveError, t, onChange, onSave, onClose,
}: EditorCardProps): ReactNode {
  const [validation, setValidation] = useState<DraftFailureKey | undefined>(undefined)

  // Any draft edit clears both failure channels: the local validation verdict
  // judged a draft that no longer exists, and the store clears its own text.
  const update = (next: RouteDraft): void => {
    setValidation(undefined)
    onChange(next)
  }

  const save = (): void => {
    const failure = draftFailure(draft, storedRefs)
    if (failure !== undefined) {
      setValidation(failure)
      return
    }
    onSave()
  }

  return (
    <div className={styles['card']} aria-label={isNew ? t('editorNewTitle') : t('editorTitle')}>
      <h3 className={styles['cardTitle']}>{isNew ? t('editorNewTitle') : t('editorTitle')}</h3>
      <p className={styles['hint']}>{route}</p>
      <div className={styles['fieldGrid']}>
        <div className={styles['field']}>
          <label className={styles['label']} htmlFor="key-rotation-display-name">{t('displayName')}</label>
          <input
            id="key-rotation-display-name"
            className={styles['input']}
            value={draft.displayName}
            placeholder={t('displayNamePlaceholder')}
            disabled={!writable}
            onChange={(event) => { update({ ...draft, displayName: event.target.value }) }}
          />
        </div>
        <div className={styles['field']}>
          <label className={styles['label']} htmlFor="key-rotation-base-url">{t('baseUrl')}</label>
          <input
            id="key-rotation-base-url"
            className={styles['input']}
            value={draft.baseURL}
            placeholder={t('baseUrlPlaceholder')}
            disabled={!writable}
            onChange={(event) => { update({ ...draft, baseURL: event.target.value }) }}
          />
        </div>
        <div className={styles['fieldWide']}>
          <label className={styles['label']} htmlFor="key-rotation-api">{t('api')}</label>
          <input
            id="key-rotation-api"
            className={styles['input']}
            value={draft.api}
            placeholder={t('apiPlaceholder')}
            disabled={!writable}
            onChange={(event) => { update({ ...draft, api: event.target.value }) }}
          />
        </div>
      </div>

      <p className={styles['label']}>{t('models')}</p>
      <div className={styles['rowList']}>
        {draft.models.map((model, index) => (
          <div className={styles['modelRow']} key={index}>
            <input
              className={styles['input']}
              aria-label={t('modelId')}
              placeholder={t('modelId')}
              value={model.id}
              disabled={!writable}
              onChange={(event) => { update(withModel(draft, index, { ...model, id: event.target.value })) }}
            />
            <input
              className={styles['input']}
              aria-label={t('modelName')}
              placeholder={t('modelName')}
              value={model.name}
              disabled={!writable}
              onChange={(event) => { update(withModel(draft, index, { ...model, name: event.target.value })) }}
            />
            <input
              className={styles['input']}
              aria-label={t('contextWindow')}
              placeholder={t('contextWindow')}
              inputMode="numeric"
              value={model.contextWindow}
              disabled={!writable}
              onChange={(event) => { update(withModel(draft, index, { ...model, contextWindow: event.target.value })) }}
            />
            <button
              type="button"
              className={styles['iconButton']}
              aria-label={t('removeModel')}
              disabled={!writable}
              onClick={() => { update({ ...draft, models: draft.models.filter((_, i) => i !== index) }) }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {draft.models.length === 0 ? <p className={styles['error']}>{t('modelsEmpty')}</p> : null}
      <button
        type="button"
        className={styles['secondaryButton']}
        disabled={!writable}
        onClick={() => { update({ ...draft, models: [...draft.models, { id: '', name: '', contextWindow: '' }] }) }}
      >
        {t('addModel')}
      </button>

      <p className={styles['label']}>{t('keys')}</p>
      <p className={styles['hint']}>{t('keysOrderHint')}</p>
      <div className={styles['rowList']}>
        {draft.keys.map((key, index) => {
          const view = key.ref.length > 0 ? credentials.get(key.ref) : undefined
          return (
            <div key={`${key.ref}:${index}`}>
              <div className={styles['keyRow']}>
                <input
                  type="password"
                  autoComplete="off"
                  className={styles['input']}
                  aria-label={t('keyValue')}
                  placeholder={view?.configured === true ? t('keyStored') : t('keyValuePlaceholder')}
                  value={key.value}
                  // A configured reference a read-only layer owns (the live
                  // environment) cannot be replaced from here; the write
                  // would only ever answer `credential-rejected`.
                  disabled={!writable || (view?.configured === true && !view.writable)}
                  onChange={(event) => {
                    update({
                      ...draft,
                      keys: draft.keys.map((row, i) => i === index ? { ...row, value: event.target.value } : row),
                    })
                  }}
                />
                <button
                  type="button"
                  className={styles['iconButton']}
                  aria-label={t('moveUp')}
                  disabled={!writable || index === 0}
                  onClick={() => { update(withKeyMoved(draft, index, -1)) }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles['iconButton']}
                  aria-label={t('moveDown')}
                  disabled={!writable || index === draft.keys.length - 1}
                  onClick={() => { update(withKeyMoved(draft, index, 1)) }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles['iconButton']}
                  aria-label={t('removeKey')}
                  disabled={!writable}
                  onClick={() => { update({ ...draft, keys: draft.keys.filter((_, i) => i !== index) }) }}
                >
                  ✕
                </button>
              </div>
              <p className={styles['hint']}>
                {`${t('keyReference')}: ${key.ref.length > 0 ? key.ref : '—'}`}
                {view?.configured === true ? ` · ${t('keyStored')}` : ''}
              </p>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className={styles['secondaryButton']}
        disabled={!writable}
        onClick={() => {
          update({
            ...draft,
            keys: [...draft.keys, { ref: deriveKeyRef(route, draft.keys.map(row => row.ref)), value: '' }],
          })
        }}
      >
        {t('addKey')}
      </button>

      {(validation !== undefined || saveError !== null)
        ? (
          <p className={styles['error']} role="alert">
            {validation !== undefined ? t(validation) : saveError}
          </p>
        )
        : null}
      <div className={styles['buttonRow']}>
        <button type="button" className={styles['secondaryButton']} onClick={onClose}>{t('cancel')}</button>
        <button type="button" className={styles['primaryButton']} disabled={!writable} onClick={save}>
          {t('save')}
        </button>
      </div>
    </div>
  )
}

/**
 * Render the key-rotation section content column.
 * @param props - slot-delivered injected dependencies.
 * @returns the section, or null while the shell has not injected yet.
 */
export function KeyRotationSection(props: KeyRotationSectionProps): ReactNode {
  const { controller, useSnapshot, t } = props
  if (controller === undefined || useSnapshot === undefined || t === undefined) return null
  return <Loaded injected={{ controller, useSnapshot, t }} />
}

function Loaded({ injected }: { injected: SectionFace }): ReactNode {
  const { controller, useSnapshot, t } = injected
  const state = useSnapshot(snapshot => snapshot)

  // Parked-key countdowns age with the wall clock; this tick is
  // component-local and subscribes to nothing external.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => { setNowMs(Date.now()) }, 30_000)
    return () => { window.clearInterval(id) }
  }, [])

  const [newName, setNewName] = useState('')
  const [newNameFailure, setNewNameFailure] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | undefined>(undefined)
  const [deleting, setDeleting] = useState(false)
  const [deleteFailure, setDeleteFailure] = useState<string | undefined>(undefined)

  if (state.status === 'idle') void controller.load()

  if (state.status === 'error') {
    /* v8 ignore next -- an error status always carries text; the fallback satisfies the nullable type */
    const errorText = state.error ?? ''
    return (
      <div className={styles['section']}>
        <h2 className={styles['title']}>{t('title')}</h2>
        <p className={styles['error']}>{`${t('loadFailed')}: ${errorText}`}</p>
        <button type="button" className={styles['secondaryButton']} onClick={() => { void controller.load() }}>
          {t('retry')}
        </button>
      </div>
    )
  }

  if (state.status !== 'ready') {
    return (
      <div className={styles['section']}>
        <h2 className={styles['title']}>{t('title')}</h2>
      </div>
    )
  }

  const profiles = storedProfiles(state.namespace)
  const storedNames = Object.keys(profiles).sort((left, right) =>
    routeLabel(left, state.namespace).localeCompare(routeLabel(right, state.namespace)))
  const baseOwned = baseOwnedRoutes(state.namespace)
  const dormant = state.routes.length === 0 && storedNames.length === 0

  const addRoute = (): void => {
    const name = newName.trim()
    if (!routeNameValid(name)) {
      setNewNameFailure(true)
      return
    }
    setNewName('')
    setNewNameFailure(false)
    // A taken name opens that route's editor instead: add acts as
    // open-or-create, so overwriting an existing profile is never a surprise.
    controller.openEditor(name, !Object.hasOwn(profiles, name))
  }

  const closeDelete = (): void => {
    if (deleting) return
    setDeleteTarget(undefined)
    setDeleteFailure(undefined)
  }

  const confirmDelete = (): void => {
    /* v8 ignore next -- the action only renders with a target and is disabled while a deletion is pending */
    if (deleteTarget === undefined || deleting) return
    setDeleting(true)
    setDeleteFailure(undefined)
    void controller.removeRoute(deleteTarget)
      .then((removed) => {
        if (removed) {
          setDeleteTarget(undefined)
          return
        }
        setDeleteFailure(controller.store.getSnapshot().saveError ?? '')
      })
      .finally(() => { setDeleting(false) })
  }

  return (
    <div className={styles['section']}>
      <div className={styles['headerRow']}>
        <h2 className={styles['title']}>{t('title')}</h2>
        <button type="button" className={styles['secondaryButton']} onClick={() => { void controller.load() }}>
          {t('refresh')}
        </button>
      </div>
      <p className={styles['intro']}>{t('intro')}</p>
      {!state.writable ? <p className={styles['notice']}>{t('readOnly')}</p> : null}
      {!state.configured ? <p className={styles['notice']}>{t('notComposed')}</p> : null}
      {dormant && state.configured ? <p className={styles['intro']}>{t('dormant')}</p> : null}

      {!dormant
        ? (
          <div className={styles['card']}>
            <h3 className={styles['cardTitle']}>{t('routesTitle')}</h3>
            <div className={styles['statusList']}>
              {state.routes.map((route) => {
                const copy = countdownCopy(t)
                return (
                  <div className={styles['routeStatus']} key={route.provider}>
                    <div className={styles['routeHead']}>
                      <p className={styles['routeName']}>{route.provider}</p>
                    </div>
                    {route.keys.map((key) => {
                      const active = key.label === route.activeLabel && key.status.state !== 'parked'
                      const chipClass = key.status.state === 'parked'
                        ? styles['chipParked']
                        : active
                          ? styles['chipActive']
                          : styles['chipUsable']
                      const chipText = key.status.state === 'parked'
                        ? t('parkedChip')
                        : active
                          ? t('activeChip')
                          : t('usableChip')
                      return (
                        <div className={styles['keyLine']} key={key.label}>
                          <span className={`${styles['chip']} ${chipClass}`}>{chipText}</span>
                          <span>{key.label}</span>
                          {key.status.state === 'parked'
                            ? (
                              <span className={styles['countdown']}>
                                {formatResetCountdown(key.status.resetAt, nowMs, copy)}
                              </span>
                            )
                            : null}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )
        : null}

      {storedNames.map((name) => {
        const open = state.editing === name
        return (
          <div className={styles['card']} key={name}>
            <div className={styles['headerRow']}>
              <h3 className={styles['cardTitle']}>{routeLabel(name, state.namespace)}</h3>
              <div className={styles['headerActions']}>
                <button
                  type="button"
                  className={styles['secondaryButton']}
                  aria-label={open ? t('close') : `${t('edit')} ${routeLabel(name, state.namespace)}`}
                  onClick={() => {
                    if (open) controller.closeEditor()
                    else controller.openEditor(name, false)
                  }}
                >
                  {open ? t('close') : t('edit')}
                </button>
                {baseOwned.has(name)
                  ? null
                  : (
                    <button
                      type="button"
                      className={styles['secondaryButton']}
                      aria-label={`${t('removeRoute')} ${routeLabel(name, state.namespace)}`}
                      disabled={!state.writable}
                      onClick={() => {
                        controller.closeEditor()
                        setDeleteFailure(undefined)
                        setDeleteTarget(name)
                      }}
                    >
                      {t('removeRoute')}
                    </button>
                  )}
              </div>
            </div>
            {open && state.draft !== undefined
              ? (
                <EditorCard
                  route={name}
                  isNew={!Object.hasOwn(profiles, name)}
                  draft={state.draft}
                  storedRefs={storedRefsOf(name, state.namespace)}
                  credentials={state.credentials}
                  writable={state.writable}
                  saveError={state.saveError}
                  t={t}
                  onChange={(next) => { controller.updateDraft(next) }}
                  onSave={() => { void controller.save() }}
                  onClose={() => { controller.closeEditor() }}
                />
              )
              : null}
          </div>
        )
      })}

      {/* A brand-new route has no stored card yet; its editor lives here
          until the first save lands the profile. */}
      {state.editing !== undefined && state.draft !== undefined && !Object.hasOwn(profiles, state.editing)
        ? (
          <div className={styles['card']}>
            <EditorCard
              route={state.editing}
              isNew
              draft={state.draft}
              storedRefs={[]}
              credentials={state.credentials}
              writable={state.writable}
              saveError={state.saveError}
              t={t}
              onChange={(next) => { controller.updateDraft(next) }}
              onSave={() => { void controller.save() }}
              onClose={() => { controller.closeEditor() }}
            />
          </div>
        )
        : null}

      <div className={styles['card']}>
        <h3 className={styles['cardTitle']}>{t('addRoute')}</h3>
        <div className={styles['keyRow']}>
          <input
            className={styles['input']}
            aria-label={t('routeName')}
            placeholder={t('routeNamePlaceholder')}
            value={newName}
            disabled={!state.writable}
            onChange={(event) => { setNewName(event.target.value); setNewNameFailure(false) }}
          />
          <button type="button" className={styles['primaryButton']} disabled={!state.writable} onClick={addRoute}>
            {t('addRoute')}
          </button>
        </div>
        {newNameFailure ? <p className={styles['error']} role="alert">{t('routeNameInvalid')}</p> : null}
      </div>

      <Modal
        open={deleteTarget !== undefined}
        onClose={closeDelete}
        title={deleteTarget === undefined ? '' : fill(t('deleteTitle'), { route: routeLabel(deleteTarget, state.namespace) })}
        closeLabel={t('close')}
        description={deleteTarget === undefined
          ? ''
          : fill(t('deleteDescription'), { route: routeLabel(deleteTarget, state.namespace) })}
        footer={(
          <>
            <Button variant="outline" autoFocus disabled={deleting} onClick={closeDelete}>
              {t('cancel')}
            </Button>
            <Button variant="outline" disabled={deleting} onClick={confirmDelete}>
              {deleteTarget === undefined
                ? ''
                : fill(deleting ? t('deleting') : t('deleteConfirm'), { route: routeLabel(deleteTarget, state.namespace) })}
            </Button>
          </>
        )}
      >
        {deleteFailure === undefined ? null : <p className={styles['error']}>{deleteFailure}</p>}
      </Modal>
    </div>
  )
}

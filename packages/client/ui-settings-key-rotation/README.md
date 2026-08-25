# @deepseek-ai/dsh-client-ui-settings-key-rotation

English | [中文](README.zh.md) | [Русский](README.ru.md)

The rotating-key editor inside every Models provider card: when the Host mounts [`@deepseek-ai/dsh-llm-key-rotation`](../../llm/llm-key-rotation/README.md), this plugin contributes the `settings.models.credential` seat and each card renders it in place of its single API-key input, so an owner never hand-edits `cordis.yml` to rotate a route's keys. The seat edits one card's route (`provider` owner prop) against the `llm-key-rotation` settings namespace and joins two wire reads into one shared snapshot: `llm.keyRotation` (the plugin's live per-route pool status) and `settings.describe` (that namespace). A deployment whose Host answers no rotation face never sees the seat — the probe fails, nothing registers, and every card keeps its native field.

Each key's single line carries its whole health: a state pill between the value field and the reorder buttons marks the sticky key **active**, others **usable** or **parked**, with a parked one rendering a countdown («лимит откатится через N ч M мин») computed locally from the snapshot's `resetAt` and aging with the wall clock. Rows are ordered — keys are tried top to bottom; arrows reorder without moving a row's stored reference. The save round-trip mirrors the Models page's trust model: typed values are write-only through `credentials.set` under derived `<ROUTE>_KEYROTATION_<n>` references (one past the largest index in use, so reordering never re-points a reference at a different secret), while one whole-array `keys` op records only those reference names — the settings document never carries a secret. Removing every row unsets the route's user-layer entry; dropped references unset their credentials. A blank brand-new row blocks saving with field-named copy before any wire call, and so do two rows holding the same value — one secret must not persist under two references. A «Reset timeouts» capsule beside the save button clears every live park of the route through `llm.keyRotationResetParks` and reloads the snapshot; it stays disabled while nothing on the route is parked. An unserviceable write is refused where it is written (the plugin validates on `settings.mutate`), so the seat surfaces the Host's message instead of silently disabling routes.

Pushed invalidations (`settings/document-updated`, `credentials/reference-updated`, `llm/adapters-updated`, reconnect) refresh the shared snapshot without polling; open cards keep their local drafts across refreshes and clear consumed values on save.

## Model Experience

None, as the seat configures provider credentials in browser Settings; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Only keys are editable here** — identity fields (endpoint, protocol, models) stay on the card's native fields under their home sections; the seat writes the `llm-key-rotation` namespace alone.
- **Literal dev-only keys have no editor** — the UI only creates reference-backed keys; a composition may still declare `value:` keys, which render as `literal` chips in the status row.
- **Status freshness is pull-based** — park changes do not push events; chips refresh through the shared invalidations and post-save reloads, while countdowns age locally between refreshes.

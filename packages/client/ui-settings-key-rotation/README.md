# @deepseek-ai/dsh-client-ui-settings-key-rotation

English | [中文](README.zh.md) | [Русский](README.ru.md)

Web Settings editor for the [`@deepseek-ai/dsh-llm-key-rotation`](../../llm/llm-key-rotation/README.md) plugin, so an owner never hand-edits `cordis.yml` to rotate API keys across a rate-limited provider route. The browser plugin registers one localized `settings.section` entry (`key-rotation`, directly after Models) whose page joins three wire reads into one snapshot: `llm.keyRotation` (the plugin's live per-route pool status), `settings.describe` (the `llm-key-rotation` namespace the plugin installs), and `credentials.describe` (value-free configured/source/writable badges for the visible references).

The upper card renders live key status: one row per configured route, each key carrying a chip — **active** at the sticky position, **usable**, or **parked** — and a parked key renders a countdown («лимит откатится через Nч Mм») computed locally from the snapshot's `resetAt`, aging with the wall clock without touching pool state. Stored routes list below as cards; each opens one editor at a time over its profile fields (display name, base URL, API protocol, ordered models) plus its ordered key rows. Keys are tried top to bottom; arrow buttons reorder rows without moving their stored references.

The save round-trip mirrors the Models page's trust model: typed key values are write-only through `credentials.set` under derived `<ROUTE>_KEYROTATION_<n>` references (one past the largest index in use, so reordering never re-points a reference at a different secret), while `settings.mutate` path ops record only those reference names — the settings document never carries a secret. Removing a row unsets its credential; deleting a whole user-owned route unsets every reference it stored. Field validation runs before any wire call: blank new key rows, duplicate or empty model IDs, and non-positive context windows fail with field-named copy. An unserviceable section is refused where it is written (the plugin validates on `settings.mutate`), so the editor surfaces the Host's message instead of silently disabling routes.

A deployment that does not mount the plugin renders its not-composed notice; a composed-but-empty configuration renders the dormant invitation with the add-route card. The add flow is open-or-create: a valid unused name opens a blank editor under the reserved name, an existing name opens that route's editor. Routes owned by the composition base layer hide their delete affordance — removal restores the composition base, so the user layer cannot perform it. Pushed invalidations (`settings/document-updated`, `credentials/reference-updated`, `llm/adapters-updated`, reconnect) refresh an opened page without polling.

## Model Experience

None, as the section configures provider credentials and routes in browser Settings; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Only rotation profiles are editable here** — the section writes the `llm-key-rotation` namespace alone; retry policy and other advanced profile fields stay wherever the composition declares them, and base-layer routes cannot be deleted from the page.
- **Literal dev-only keys have no editor** — the UI only creates reference-backed keys; a composition may still declare `value:` keys, which render as `literal` rows in the status card.
- **Status freshness is pull-based** — park changes do not push events; the panel refreshes through the shared invalidations, the Refresh button, and post-save reloads, while countdowns age locally between refreshes.

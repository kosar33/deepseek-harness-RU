# Agent Note: Editing the key-rotation plugin from web Settings

Status: implemented

English | [中文](2026-08-24-llm-key-rotation-settings-editor.zh.md)

[Per-route key-pool rotation](2026-08-24-llm-key-pool-rotation.md) kept its configuration deliberately out of the GUI: an owner rotating OpenRouter keys had to open `cordis.yml`, know the profile-plus-`keys` shape, and get both the credential references and their order right by hand. The plugin's own snapshot contract already anticipated a settings-page widget rendering «лимит откатится через Nч Mм», but no wire method exposed pool health and no surface could write the section. This note adds the missing half of that seam: the plugin installs its own user-settings section, the Host serves pool health over one privileged wire read, and a new browser package edits routes with the same trust model the Models page established.

## Problem

Three gaps, each blocking the next. The plugin resolved its section only from composition, so every key change was a restart-shaped edit. The state face lived in-process (`ctx.get('llmKeyRotation')`), so the browser could not learn which keys were parked or when their limits reset. And even with both, a naive editor would either put key values into `settings.yaml` — the exact leak the [web configuration plane](2026-07-30-web-config-plane.md) was built to prevent — or invent a second secret path beside `credentials.set`.

## Decision

### The plugin installs its own settings section; writes are refused where they are written

The plugin mounts the standard optional settings-section install from [plugin-owned settings surfaces](2026-08-12-plugin-owned-settings-surface.md) under the `llm-key-rotation` namespace, with `resolvePools` as its validate-on-write step. That keeps the fail-loud rule intact at the new entry point: a schema-valid section naming a route a plain pi-ai row already owns is refused at the `settings.mutate` call, so the stored document can never hold a providers dict the resolver cannot serve — the same refusal the Loader performs at boot for composition-authored sections. A committed change rebuilds the pools, restores persisted parks, and swaps the registered routes without a restart.

### One privileged unary read carries pool health; secrets never ride it

`llm.keyRotation` answers `{ configured, routes }`, where `configured` is false exactly when no mounted composition provides the rotation face (a composed-but-dormant plugin answers true with an empty list). Rows map the state face's snapshots field-for-field into wire views — provider, active label, per-key label/source/reference/status — and nothing else; key values have no slot. The method joins the loopback-privileged plane beside `llm.discoverModels`: it enumerates the credential reference names a deployment uses and their live health, which the anonymous plane must not serve.

### The editor mirrors the Models page's trust model, at rotation's shape

The browser package registers one `settings.section` entry whose store joins `llm.keyRotation`, the shared describe mirror's namespace view, and `credentials.describe`. Typed key values travel write-only through `credentials.set` under derived `<ROUTE>_KEYROTATION_<n>` references — one past the largest index already in use, so reordering rows never re-points a reference at a different secret — while `settings.mutate` records reference names alone; the redacted settings document never receives a value. Ops are minimal against the stored user section: unchanged fields stay where they live, cleared fields unset, a reorder travels as one whole-array `keys` set, and a first save lands a new route as one profile unit. Removing a dropped row unsets its reference; deleting a whole user-owned route unsets every reference it stored. Field validation runs before any wire call, so a blank new key row or duplicate model ID fails locally instead of spending a round trip. Base-layer-owned routes hide their delete affordance rather than failing the write, because removal there means restoring the composition base.

The status panel renders chips from the snapshot — active at the sticky position, usable, parked — and computes countdowns client-side from `resetAt`, aging with the wall clock between refreshes; consistent with the snapshot's view-only usability, rendering never mutates pool state. Postures follow composition facts: an absent plugin shows its notice, a composed-empty one shows the dormant invitation, and pushed invalidations (settings, credentials, adapter topology, reconnect) refresh an opened page without polling.

## Alternatives considered

- **Serve the section through the generic schema-driven card** ([rejected there](2026-08-12-plugin-owned-settings-surface.md) for the Models page) — rejected here for the same reason plus two: the credential-reference join and the reset countdown need a hand-written view, and the keys array's order-is-semantics does not survive a generic form.
- **Fold rotated routes into the Models page's configurable-provider directory** — rejected: the rotation note deliberately keeps those routes out of the directory, because directory entries advertise plain single-key profiles and would misrepresent pools.
- **Push park changes as remote events** — rejected for now: parks have no event channel today, and a countdown ages client-side anyway, so pull-plus-invalidations reaches the same visible freshness without new event types.

## Consequences

- An owner can add N OpenRouter keys and see per-key status without touching YAML; saves take effect immediately through the rebuild-and-swap path.
- Park transitions do not push; between refreshes the panel can show a park that just expired as parked until the next invalidation, refresh, or save-triggered reload.
- Literal dev-only keys render as `literal` status rows but have no editor; the UI creates reference-backed keys only.
- The privileged classification means non-loopback browsers keep today's posture: the whole configuration plane, now including this read, stays unreachable until real authentication exists.

## Verification

- The plugin suite boots the real composition through the Loader: the editor's exact round trip (credential values through the credentials store, then a section mutate) activates the route and serves a request without restart; withdrawing a route mid-flight fails loud; an unserviceable write is refused with the resolver's message; dormant mounts register nothing.
- apiproxy specs pin the snapshot mapping, the absent-face answer (`configured: false`), the handler route, and the fetch-client schema validation; the connection suite pins the fixture world's parked-key answer and the privileged-plane classification.
- The browser package's suites pin the pure helpers (reference derivation, countdown rounding up, minimal path ops), the store join including the settings-payload-never-carries-a-secret assertion, component behavior across all postures in English and Russian copy, the locale-following nav thunk, HMR recovery, and the invariant companion registration; `verify-client-packages` and `verify-package-invariants` pass.

## Related

- [Per-route API-key pool rotation](2026-08-24-llm-key-pool-rotation.md) owns the rotated-route mechanism this surface edits: pools, parks, and the snapshot contract the wire read projects.
- [The web configuration plane](2026-07-30-web-config-plane.md) owns the trust model this editor mirrors: write-only credentials, derived references, and minimal path ops against the redacted user layer.
- [Plugin-owned settings surfaces](2026-08-12-plugin-owned-settings-surface.md) owns the optional-section install and its validate-on-write semantics.

# Agent Note: Key rotation overlays existing provider routes

Status: implemented

English | [中文](2026-08-24-llm-key-rotation-provider-key-overlay.zh.md)

[Editing the key-rotation plugin from web Settings](2026-08-24-llm-key-rotation-settings-editor.md) shipped rotation as a route owner: the plugin built pi-ai profiles for its own routes, registered them on `ctx.llm`, refused collisions with plain rows, and gave the browser a standalone Settings page for managing those routes end to end. Owner review of that UI rejected it as reinventing what the Models page already does — provider creation, naming, and identity editing exist there, and a second route-management surface duplicated them. This note records the replacement design: rotation keeps only the keys, attaches to routes by id, and its editor lives inside each existing provider card.

## Problem

The owner-directed UX is one rule: inside a provider's edit card, where the single API-key input sits, a mounted rotation plugin shows the ordered multi-key list — park countdowns included, current key highlighted — and an unmounted plugin shows exactly the old field. Everything else about the card (add flow, directory vocabulary, identity fields, delete) must stay untouched. Two constraints follow. First, a rotated route must keep exactly one adapter registration, so takeover or duplicate ownership is off the table. Second, the browser must degrade cleanly when the Host composition lacks the plugin: cards cannot lose their native key field just because a client bundle ships the seat.

## Decision

### An optional override service replaces route ownership

`dsh-llm` defines `LlmApiKeyOverride` — one method, `resolve(provider): Promise<string | undefined>` — read by consumers through `ctx.get('llmApiKeyOverride')`. The rotation plugin provides it instead of registering adapters: pools answer first for their routes, `undefined` falls through to the family's native resolution, and a reference that resolves to nothing still fails loud with `MISSING_CREDENTIAL` rather than silently degrading to the native key. dsh-llm-pi-ai and dsh-llm-deepseek consult it at the top of their `resolveApiKey`, which also covers endpoint interrogation, since discovery reuses the same resolver. Registration stays single-owner by construction; the duplicate-refusal contract needs no inversion. The cost is accepted and documented: a hand-edited composition can name a route no family serves, storing an inert pool.

### Keys-only storage; identity stays home

The `llm-key-rotation` settings namespace shrinks to `{ providers: { [route]: { keys } } }` — validate-on-write still runs `resolvePools`, now without profile resolution. Composition entries list the same shape beside the route's own pi-ai/deepseek declaration. Parks, sticky-position recovery, `KEY_POOL_EXHAUSTED`, and the `llm.keyRotation` snapshot are unchanged; they were never tied to who registered the adapter.

### The seat rides the slot system with a probe gate

`ui-settings-models` declares a `settings.models.credential` hole (`single`, owner prop `provider`) dispatched at the exact DOM position of the key input, with that input passed as the dispatch fallback. `ui-settings-key-rotation` contributes its editor through `slots.inject`, but only after one probe call answers `api.llm.keyRotation({})` successfully: an absent Host face means no registration, so every card renders its fallback field. Per-card row drafts are component-local state keyed by provider; the shared store keeps server facts only. A bound seat suppresses the parent card's `credentialRequired` gating, because the seat owns its own commit and the parent's Apply would otherwise deadlock against an input that never renders.

## Alternatives considered

- **Keep the standalone settings page beside the seat** — two surfaces would manage one provider's keys with divergent vocabularies; the owner review rejected the page outright as duplicating the Models card.
- **Rotation takes over adapter registration for its routes** — the original design: rejected because a route must keep exactly one registration owner, and takeover either duplicates registrations or forces every consumer section to hand routes over.
- **Round-robin per request instead of sticky-with-parks** — burning a request against a key known to be exhausted until a reset instant wastes quota; the park document already encodes those instants, so serving skips them without probes.

## Consequences

- One mental model: a provider is created once, anywhere the Models page already supports, and rotating it never moves its identity.
- Turning the plugin on or off changes only where a card's key edits land — no restart-shaped migration, no orphaned providers.
- The previous note's standalone-section UI, add-route flow, delete-route affordances, and not-composed notice no longer exist; its trust-model and persistence decisions carry forward unchanged here.

## Verification

- Host suites cover `resolvePools` validation, override ordering/parking/expiry, loud `MISSING_CREDENTIAL`, mid-flight swap guards, parks restore/prune, and a real-composition boot where pi-ai serves a route this plugin overlays; per-file coverage holds at 100%.
- Client suites cover probe-gated registration (present and absent), locale dictionaries, HMR/dispose removal, chip rendering with active highlight and countdown, row draft lifecycle across provider switches, whole-array keys ops plus credential set/unset round-trips, and blank-row refusal; per-file coverage holds at 100%.
- `pnpm run typecheck`, scoped lint, `verify-client-packages`, `verify-package-invariants`, `test:gui`, and replayed web e2e run against the assembled app before merge.

# Agent Note: Per-route API-key pool rotation for rate-limited providers

Status: implemented

English | [中文](2026-08-24-llm-key-pool-rotation.zh.md)

Some providers meter requests per API key, and their daily windows do not clear by waiting within the day, so retrying a 429 against the same key spends budget on an attempt that cannot succeed until reset. [Bounded recovery](2026-06-21-bounded-llm-request-recovery.md) owns same-request retry timing but deliberately owns no credential identity: its policy decides *when* to re-attempt, never *with what* the attempt authenticates. This note adds the missing half — a plugin that chooses among several keys for one route and parks exhausted ones until their reset.

## Problem

Key selection happens inside the pi-ai adapter's per-request `resolveApiKey` closure over `ctx.credentials`, and no extension point lets another plugin influence that choice. The recovery waterfall can already authorize an immediate same-request retry by returning `{ kind: 'retry' }` without delegating, but the retried dispatch would resolve the same single reference again. A wrapping layer therefore needs both a decision seat on the recovery waterfall and control over per-request key selection.

## Decision

### The rotation plugin owns its routes instead of decorating the credential seam

`@deepseek-ai/dsh-llm-key-rotation` registers the provider routes listed in its own configuration on `ctx.llm` using a `PiAiAdapter` built from dsh-llm-pi-ai's exported building blocks (`resolveProfiles`, `credentialStoreFrom`, `authContextFrom`), with a pool-aware `resolveApiKey`. Composition moves a rotated route's row from the plain adapter section to this plugin; two registrations cannot share one route, and the conflict fails loud if a deployment leaves the row in both places. The schema passes undeclared profile fields through schemastery's merge semantics, so profile validation stays wholly owned by the pi-ai resolver and runs at load.

Promoting those three symbols to dsh-llm-pi-ai's root is a deliberate surface change, not leakage: that package's credential adapters are written for reuse by another adapter family, and profile resolution is the piece any such family would otherwise fork. Its root-encapsulation test now names `resolveProfiles` as sanctioned alongside the two seam adapters while still forbidding the event-translation helpers.

Cordis refuses a second registration of a service name, so decorating `ctx.credentials` would require replacing `dsh-credentials-local`, capturing storage and every other consumer of the seam to serve one adapter family. Adding a resolution hook inside dsh-llm-pi-ai was also rejected: it would couple adapter composition to agent-loop recovery policy, a boundary the retry decision deliberately keeps clean.

### Rotation rides the existing failed-step extension point ahead of ordinary policies

The listener registers on `agent/request-error` with `prepend`, because activation order is service-availability driven and mount order is not a stable contract. Prepend places rotation ahead of ordinary registrations such as dsh-llm-retry regardless of composition order, so a rate-limited key is parked and the sticky position advanced before any policy schedules a same-key backoff wait. For an owned failure the listener returns `{ kind: 'retry' }` without calling `next()`; the loop re-dispatches the identical request immediately and the fresh dispatch resolves the next member. Single-key pools delegate every failure untouched, which is what keeps them byte-for-byte equivalent to the plain adapter today, including backoff and retry budgets.

Pool state is one sticky index plus a park stamp per member — when the park happened and when it ends. Parking is lazy — expired stamps are dropped on read, no timers exist — and the reset instant comes from the failure's `providerRetryAfterMs` when surfaced, else from the first parsable body hint, otherwise from the coming UTC midnight that bounds daily quotas. Through the pi-ai path wire errors arrive flattened to message text (an upstream limitation noted in `llm-pi-ai/src/stream.ts`); [body-derived reset hints](../feature/2026-08-26-key-rotation-body-reset-hints.md) recover part of that lost precision inside the flattened text, and the midnight fallback covers bodies without markers. When no member is usable the listener throws `LlmError` code `KEY_POOL_EXHAUSTED` listing every key label with its reset timestamp, which surfaces verbatim as the step error. Each switch logs both keys and the reset instant through the standard logger; no session event exists because no model-visible or replayed surface fact changes, keeping model-visible-iff-logged intact.

Literal `value` keys are documented as dev-only, validated at load with `assertUsableApiKey`, and never enter diagnostics; reference members resolve per request through the credentials seam with the launch environment as the no-seam fallback, so stored key changes reach the next request without restart exactly as for the plain adapter.

### Parks persist in a plugin-owned document beside the credentials store

The agent server does not run continuously, so an in-memory-only park would resurrect an exhausted key on every restart. Each park therefore persists in `.llm-key-rotation-parks.json` beside `.credentials.yaml` under the harness home (`parkFile`/`dshHome` override it), written through dsh-atomic-write at owner-only mode on every park or expiry change, and re-read on mount: expired rows drop, rows naming routes or labels the current configuration no longer has prune, live parks reattach by route and label, and a pool whose sticky member is parked starts on its first usable key. The document holds labels and timestamps only — never key values — so its failure policy is asymmetric by design: absence is the empty state (first boot), while a corrupt or wrong-version document fails the mount loud, because silently ignoring state would resurrect exactly the keys persistence exists to keep parked; a failed write never fails the recovery but logs loudly, since rotation on in-memory state still protects the running process.

The document is deliberately not `.credentials.yaml` itself: that file is credentials-local's writer-locked store whose format and lock protocol another plugin must not write into. A sibling owned document keeps one writer per owner. It also has no cross-process writer lock, so deployments sharing one `parkFile` across concurrent processes overwrite each other — a documented limitation, acceptable because one deployment is one process in the supported posture.

### Rotation state reads through a provided face with a stable snapshot contract

Other plugins read rotation state via `ctx.get('llmKeyRotation').snapshot()`, following the storage-backend pattern of a function plugin providing a service face rather than converting to a class plugin. The snapshot lists every configured route with `activeLabel` and per-key entries carrying `label`, `source` (`reference` plus its reference name, or `literal`, which carries no reference field), and `status`: `{ state: 'usable' }` or `{ state: 'parked', parkedAt, resetAt }` with ISO 8601 UTC instants, so a settings-page widget can render «лимит откатится через Nч Mм» by diffing `resetAt` against the clock without touching plugin internals. Key values never appear. Usability in a snapshot is view-only — an expired park reports usable without mutating pool state or the file — keeping readers pure while the serve path remains the sole mutator besides recovery.

### Philosophy: pure composition suffices

This design is pure-plugin. Every behavior rides documented extension points: route registration on `ctx.llm`, per-request credential resolution through the adapter's own seam, the `agent/request-error` waterfall for recovery, and `ctx.provide` for the state face. No new extension point in dsh-llm-pi-ai or dsh-llm-retry was created and no loop changed; the only dsh-llm-pi-ai diff is exporting existing internals as the sanctioned reuse channel for a second adapter family.

## Out of scope

- Cross-provider or cross-model failover; the request still names exactly one explicit provider and model.
- Header-grade reset parsing through pi-ai; deferred until upstream forwards response headers or status beyond message text.
- Correlating each failed request with the exact member that served it under concurrency; pools keep process-wide stickiness, and single-agent sessions are the supported posture.

Editing rotated routes from web Settings shipped beside this mechanism and owns its own decision record: [Editing the key-rotation plugin from web Settings](2026-08-24-llm-key-rotation-settings-editor.md).

## Alternatives considered

- **Decorate or replace `ctx.credentials`** — rejected: cordis throws on a second registration of a service name, and replacing the local provider hijacks storage for every consumer to benefit one adapter family.
- **Rewrite the route's `apiKeyEnv` through settings between attempts** — rejected: mutating configuration documents as recovery control flow conflates the config plane with request state and loses the fail-loud reference semantics mid-flight.
- **Rotate inside a custom pi-ai transport or fetch wrapper** — rejected: pi-ai's `Transport` selects wire protocols, not HTTP clients, and `onResponse` observes responses without being able to re-issue the request.
- **Fold rotation into dsh-llm-retry** — rejected: that plugin owns timing policy for failures; credential identity and parking are a different capability with different configuration, and merging them would force single-key deployments into pool semantics.

## Verification

- Unit suites cover reset-instant selection (`providerRetryAfterMs`, absent and invalid hints, UTC-midnight rollover), sticky serving, advance-and-wrap, lazy park expiry, all-parked exhaustion with labeled resets, member-source validation including blank and non-header-safe literals, park-document location resolution and deterministic rendering, and document parsing rejections (invalid JSON, wrong version, unknown keys, non-array parks, malformed rows, duplicates).
- Composition tests drive the real agent loop over a scriptable OpenAI-compatible server: 429 then success rotates onto the next key and stays sticky; three consecutive 429s exhaust the pool into `KEY_POOL_EXHAUSTED` naming each key and reset instant; literal and environment-resolved members serve without a credentials service; a named-but-unset reference fails `MISSING_CREDENTIAL`; single-key and non-rate-limit failures delegate with dsh-llm-retry events intact; mounting dsh-llm-retry first still rotates because of prepend; foreign routes delegate; dormant mounts register nothing (and provide no state face) while disposal withdraws routes.
- Persistence tests prove a park lands in the sibling document at owner-only mode with `.credentials.yaml` byte-identical, an exhausted key stays parked across a restart so the next request starts on the spare, expired and stale rows drop on mount and the file prunes without them, corrupt or wrong-version documents fail the mount naming the path, unwritable locations log loudly while rotation continues, and snapshots report usable/parked statuses with ISO instants — treating expired parks as usable without rewriting the document.
- A real Loader composition boots `cordis.yml` rows through the shipping loop and proves the wire requests carry successive bearer tokens with no `llm/retry` event for the rotated switch, and that the durable park document names the parked key afterwards.
- Package coverage reports 100 percent statements, branches, functions, and lines per src file.

## Consequences

- Rotating a route requires moving its row out of any plain dsh-llm-pi-ai section; configurable-provider directory entries are not offered for those routes.
- Under concurrent requests, parking tracks the sticky position rather than each request's served member, so a rare interleaving can park a position another request was using; the affected key recovers lazily at its reset.
- Until upstream surfaces reset headers, daily-limit parks last until coming UTC midnight, which may idle a key longer than its true window when a deployment crosses the day boundary.
- Future recovery policies compose after rotation by delegation; a policy that must observe rate-limit switches durably needs its own session event and cannot rely on this plugin's logger lines.
- The park document is single-writer: two harness processes pointed at one `parkFile` overwrite each other's parks, so concurrent deployments need separate locations.
- Consumers of the state face depend only on the documented snapshot fields; a settings-page widget needs no access to pools, the adapter, or the park document.

## Related

- [Editing the key-rotation plugin from web Settings](2026-08-24-llm-key-rotation-settings-editor.md) owns the settings-section surface over this plugin: the editor's save round-trip, the `llm.keyRotation` wire method, and the live status panel.
- [Bounded recovery for transient LLM request failures](2026-06-21-bounded-llm-request-recovery.md) owns the recovery waterfall contract, retry timing, and the single-attempt adapter rule this plugin composes with.
- [Provider-routed LLM adapters](2026-07-14-provider-routed-llm-adapters.md) owns explicit provider routing and per-request credential resolution.
- [Request-error retry action](../simplification/2026-07-27-request-error-retry-action.md) owns the `{ kind: 'retry' }` return contract this listener uses to authorize an immediate switch.

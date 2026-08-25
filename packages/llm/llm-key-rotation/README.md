# `@deepseek-ai/dsh-llm-key-rotation`

English | [中文](README.zh.md) | [Русский](README.ru.md)

Function plugin that lets an existing provider route survive per-key 429 rate limits by rotating across several API keys. It attaches to routes the plain adapter families — dsh-llm-pi-ai and dsh-llm-deepseek — already register, overrides only each configured route's credential resolution with an ordered key pool, and recovers a rate-limited request on the agent loop's `agent/request-error` waterfall ahead of any retry policy. Every other profile fact stays owned by the route's home section.

Each entry under `providers` is keyed by an existing route id and carries only the ordered `keys` list. Each key names exactly one source: a credential reference (`apiKeyEnv`) resolved per request through the credentials seam, or a literal `value` that lands verbatim in the composition file and is meant for development only. An optional `label` names the key in logs; it defaults to the reference name or the one-based position. Resolution validates every entry at plugin load: missing or doubled key sources, duplicate labels, malformed references, and blank literals fail the mount; an `apiKeyEnv` field on a route entry is refused because that field belongs to the route's own profile. A route no family serves keeps an inert pool — harmless, and only reachable through a hand-edited composition, since the web editor writes keys onto live provider cards.

The override travels through the optional `llmApiKeyOverride` service this plugin provides; adapter families consult it before their native credential resolution and fall through when it answers `undefined`. Adapter registration is therefore untouched — the registering family remains the route's single owner — so a composition cannot create a duplicate registration by rotating a provider. A pool key whose reference resolves to nothing fails the request with `MISSING_CREDENTIAL`, naming the pool key, instead of silently falling back to the native single key: a misconfigured pool must not quietly stop rotating.

Requests authenticate with one sticky position per process. On a `RATE_LIMIT` failure of a multi-key route, the listener parks the served key until its reset instant — the failure's `providerRetryAfterMs` when the adapter surfaces one, otherwise the coming UTC midnight that bounds daily quotas — advances onto the first non-parked key, and returns `{ kind: 'retry' }`, so the loop re-issues the identical request immediately under the next key without a scheduled wait. Each switch logs both keys and the reset instant through the standard logger; nothing is appended to the session log. When every member is parked, the thrown error carries code `KEY_POOL_EXHAUSTED` and lists every key with its reset timestamp — each entry suffixed with a trimmed excerpt of the upstream text that caused the park. Parks expire lazily on read, so no timers run and a parked key returns to service exactly at its reset.

Two failures rotate without parking. A rate limit whose flattened body names the gateway's shared upstream pool (`limit_source: upstream_provider_shared_pool`) leaves rotation untouched for ordinary same-key backoff: the served credential did nothing wrong. A failure reading as the gateway relaying its upstream vendor's error («Provider returned error») first delegates to the provider's ordinary exponential same-key retry chain — the visible retry rows carrying the raw network error — and only when that chain is spent advances onto the next key and re-issues there; nothing is parked at any point.

Parks survive restarts. Each park is persisted in `.llm-key-rotation-parks.json` beside `.credentials.yaml` under the harness home — override the location with `parkFile`, or the home it defaults against with `dshHome`. The document holds labels and timestamps only, never key values; it is rewritten atomically at owner-only mode on every park or expiry change. On mount, expired rows drop, rows naming routes or keys the configuration no longer has are pruned, live parks reattach by route and label, and a pool whose sticky member is parked starts on its first usable key. A missing document is the empty state; a corrupt or wrong-version document fails the mount loud with the path named. A persistence write that fails logs loudly and rotation continues on in-memory state for that run.

The listener registers with `prepend`, so rotation precedes ordinary recovery policies regardless of mount order: a parked key is advanced past before dsh-llm-retry can schedule a same-key backoff wait, and the retried attempt reaches dsh-llm-retry fresh if it fails again. Single-key pools delegate every failure untouched, so they behave exactly like the native resolution, including retry policy and backoff. Failures that are not `RATE_LIMIT`, and failures of routes without a pool, delegate unchanged. So does a `RATE_LIMIT` whose flattened body names the provider's shared upstream pool as the limiter (`upstream_provider_shared_pool`, how OpenRouter reports throttling that is not tied to the caller's key): parking would bench every healthy key until the fallback horizon while the served key's own quota is untouched, and waiting briefly — ordinary backoff on the same key — is the actual remedy.

```yaml
# The route itself lives in its home section, as any provider does:
- id: llm-openrouter
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      openrouter:
        displayName: OpenRouter
        api: openai-completions
        baseURL: https://openrouter.ai/api/v1
        models:
          - id: anthropic/claude-sonnet-4.5
            name: Claude Sonnet 4.5
            contextWindow: 200000

# This plugin adds only the rotating keys for that same route id:
- id: llm-openrouter-keys
  name: '@deepseek-ai/dsh-llm-key-rotation'
  config:
    providers:
      openrouter:
        keys:
          - apiKeyEnv: OPENROUTER_KEY_1
          - apiKeyEnv: OPENROUTER_KEY_2
          - apiKeyEnv: OPENROUTER_KEY_3
            label: spare
```

Store the referenced values in `$DSH_HOME/.credentials.yaml` under `refs:` (the web Models page writes that document) or export them in the launching environment; a composition with no credentials seam falls back to the environment alone.

## State surface

The plugin provides a state face other plugins read through `ctx.get('llmKeyRotation')` whenever it is composed. `snapshot()` renders every configured route; usability in a snapshot is view-only, so reading it never mutates pool state or the persisted file. Key values never appear. `resetParks(route)` clears every live park of one route in memory and in the persisted document at once — the operator's escape hatch for parks that turned out to be false, such as a park caused by an upstream shared-pool throttle — and reports whether anything was actually cleared.

```json
[
  {
    "provider": "openrouter",
    "activeLabel": "OPENROUTER_KEY_2",
    "keys": [
      {
        "provider": "openrouter",
        "label": "OPENROUTER_KEY_1",
        "source": "reference",
        "reference": "OPENROUTER_KEY_1",
        "status": {
          "state": "parked",
          "parkedAt": "2026-08-24T12:00:00.000Z",
          "resetAt": "2026-08-25T00:00:00.000Z"
        }
      },
      {
        "provider": "openrouter",
        "label": "OPENROUTER_KEY_2",
        "source": "reference",
        "reference": "OPENROUTER_KEY_2",
        "status": { "state": "usable" }
      }
    ]
  }
]
```

Each entry under `keys` carries `provider`, `label`, `source` — `reference` with its `reference` name, or `literal` for a dev-only value, which carries no reference field at all — and `status`: `{ state: 'usable' }`, or `{ state: 'parked', parkedAt, resetAt }` with ISO 8601 UTC instants. A settings-page widget renders «лимит откатится через Nч Mм» by diffing `status.resetAt` against the current time — no plugin internals needed. `activeLabel` names the position the next request authenticates with; when every key is parked it names the stuck position a request would fail from. The face is absent while the plugin is dormant (no configured providers).

## Model Experience

### Model-request recovery

#### What the model sees

No rotation, parking, reset timestamp, or key identity is model-visible. The retried request carries the identical message history, tools, and call configuration; only the `Authorization` header value changes.

#### Token effect

Each key switch repeats one provider request, with its input-token billing, before any output exists; the switch itself is the recovery action `{ kind: 'retry' }` and appends nothing to the session log. Parking ends billing for exhausted keys until their reset instead of spending retries against them.

#### KV Cache effect

The retried request preserves the prior prefix and is eligible for provider cache reuse under each provider's rules. Different keys typically hold separate caches on providers that meter cache per account.

## Known Limitations and Deferred Work

- **Reset precision depends on the adapter** — through the pi-ai path, wire errors arrive flattened to message text, so daily-limit resets park until the coming UTC midnight; `providerRetryAfterMs` is honored when an adapter surfaces it, and the upstream shared-pool pass-through reads that same flattened body by its stable marker substring.
- **Parking tracks the sticky position, not the request** — concurrent requests share one process-wide sticky index, so a failure can park the position another in-flight request was served from; single-agent sessions are unaffected.
- **A typo'd route id yields a silent pool** — pools attach to routes by name match, and a composition naming a route no family serves stores a pool nothing consults; the settings editor avoids this by writing only onto live provider cards.
- **Persistence is single-writer per document** — the park document has no cross-process writer lock, so two harness processes sharing one `parkFile` overwrite each other's parks; give each deployment its own location when it needs one.

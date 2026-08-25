/**
 * llm domain contract: host-scoped provider topology for configuration
 * surfaces. `llm.providers` merges the configurable-provider directory
 * (which providers CAN be configured, and where their settings live) with the
 * live route registry; `llm.models` is the session-independent model catalog
 * (the same groups as `session.models`, without a per-session selection).
 * Clients invalidate from the forwarded `llm/adapters-updated` and
 * `settings/document-updated` owner events.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'
import type { ModelCatalogFailure, ModelProviderGroup } from './sessions.ts'

/** Wire view of one configurable provider. */
export interface ConfigurableProviderView {
  /** Provider route key (`deepseek-official`, `openai`, …). */
  provider: string
  /** Human-readable name for configuration surfaces. */
  displayName: string
  /** Settings namespace whose section configures this provider. */
  settingsNs: string
  /** Path from that section's root to the provider's profile object (empty = whole section). */
  settingsPath: string[]
  /** Whether the route is currently registered (its models are requestable). */
  active: boolean
  /**
   * Whether the owning adapter knows this route only because configuration
   * declared it. Absent when the adapter draws no such distinction, so a
   * surface must treat absence as "unknown", not as "shipped".
   */
  declared?: boolean
}

/** Wire view of one rotated key's status. */
export type KeyRotationKeyStatusView =
  | { readonly state: 'usable' }
  | { readonly state: 'parked'; readonly parkedAt: string; readonly resetAt: string }

/** Wire view of one key in a rotation pool; values and credential material never ride. */
export interface KeyRotationKeyView {
  /** Stable label from configuration; named in logs and diagnostics too. */
  label: string
  /** Whether the key resolves a credential reference or was configured as a literal dev-only value. */
  source: 'reference' | 'literal'
  /** The credential reference name for `reference` sources. */
  reference?: string
  /** Current status, with ISO 8601 UTC instants when parked. */
  status: KeyRotationKeyStatusView
}

/** Wire view of one provider route's rotation pool. */
export interface KeyRotationRouteView {
  /** The provider route this pool serves. */
  provider: string
  /** Label at the sticky position the next request authenticates with. */
  activeLabel: string
  /** Every configured key in configuration order. */
  keys: KeyRotationKeyView[]
}

/** Llm-domain unary methods (the map keys llm.* of RpcMethodMap). */
export interface LlmApi {
  /**
   * List every configurable provider with its live/dormant state, in
   * directory declaration order. Routes registered outside the directory
   * (an adapter that never declared configurability) are appended with their
   * registration identity and no settings address.
   */
  providers(request: RpcRequest<{}>): Promise<RpcResponse<{ providers: ConfigurableProviderView[] }>>

  /**
   * Host-scoped model catalog over every registered provider route: the
   * settings surface's models view, needing no session. Per-provider listing
   * failures ride `failures` without failing the sound groups.
   */
  models(request: RpcRequest<{}>): Promise<RpcResponse<{ groups: ModelProviderGroup[]; failures: ModelCatalogFailure[] }>>

  /**
   * Interrogate a provider endpoint the configuration surface is still
   * drafting, and return the models it advertises for the user to adopt.
   *
   * The payload is the draft, not a stored route: `settingsNs` selects the
   * adapter family that answers, and the rest comes from the form. `provider`
   * names the route being edited when there is one — an adapter that already
   * describes that route answers from its own registry, with better metadata
   * and no network call, and needs no endpoint. A route it does not describe is
   * asked over the wire, which is what `baseURL`, `api`, and `apiKey` are for.
   *
   * Nothing is written — the reply is candidates, and only a later
   * `settings.mutate` decides what a route serves. `apiKey` is accepted here
   * but never stored or returned; a provider whose key is already stored omits
   * it and the endpoint answers unauthenticated or refuses.
   */
  discoverModels(
    request: RpcRequest<{
      settingsNs: string
      provider?: string
      baseURL?: string
      api?: string
      apiKey?: string
    }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ models: DiscoveredModelView[] }>>

  /**
   * Snapshot the multi-key rotation plugin's pools (`llmKeyRotation` state
   * face): per route, the active key label and every key's usable/parked
   * status with reset instants, so a configuration surface can render live
   * per-key health and «лимит откатится через Nч Mм» countdowns. `configured`
   * is false when no composition mounts `@deepseek-ai/dsh-llm-key-rotation`;
   * a composed-but-dormant plugin answers true with an empty list. Labels and
   * reference names ride; key values never exist in the snapshot.
   */
  keyRotation(request: RpcRequest<{}>): Promise<RpcResponse<{ configured: boolean; routes: KeyRotationRouteView[] }>>

  /**
   * Clear every live park of one rotation route (the `llmKeyRotation` state
   * face's `resetParks`): the operator's escape hatch for parks that turned
   * out to be false. Answers with the same shape as {@link keyRotation} so a
   * caller can fold the fresh snapshot directly; `configured: false` when no
   * composition mounts the plugin.
   */
  keyRotationResetParks(
    request: RpcRequest<{ provider: string }>,
  ): Promise<RpcResponse<{ configured: boolean; routes: KeyRotationRouteView[] }>>
}

/** Wire view of one model an interrogated endpoint advertises. */
export interface DiscoveredModelView {
  /** Model id the endpoint accepts. */
  id: string
  /** Human-readable name when the endpoint supplies one. */
  name?: string
  /** Maximum combined request and response context, when disclosed. */
  contextWindow?: number
  /** Maximum output tokens, when disclosed. */
  maxTokens?: number
}

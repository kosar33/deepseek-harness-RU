/** Package-owned invariant companion. @module @deepseek-ai/dsh-llm-key-rotation/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-llm-key-rotation'

/** Cordis companion plugin name. */
export const name = 'llm-key-rotation-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin's one session event (`llm/key-rotated`)
 * is assembled from the advancing pool itself — labels and route come from
 * the members the recovery listener just moved between — so its validity is
 * fixed at the append site; the park-state document is a projection of pool
 * state the plugin rewrites atomically and revalidates on every mount, with
 * no cross-service relationship to assert.
 */
const install: InvariantInstaller = (_ctx: Context, _fail: InvariantFailure): void => {}

/**
 * Register the key-rotation invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as KeyRotationInvariant from '@deepseek-ai/dsh-client-ui-settings-key-rotation/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
// Relative source import so the per-file coverage gate attributes the run.
import { KeysEditor } from '../src/client/KeysEditor.tsx'
import { apply } from '../src/index.ts'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(KeyRotationInvariant).await()).resolves.toBeDefined()
  })

  it('node-half apply is a no-op host placeholder', () => {
    apply()
    expect(true).toBe(true) // reaching here without throw is the contract
  })

  it('renders null until the shell injects the seat dependencies', () => {
    expect(KeysEditor({} as never)).toBeNull()
  })
})

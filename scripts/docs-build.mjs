/**
 * Run the documentation site build chain under a raised JavaScript heap.
 *
 * `docs:build` chains the VitePress build with the site-fragment verifier; the
 * limit rides in `NODE_OPTIONS` so every Node process in that chain — including
 * tsx workers and VitePress children — inherits it. A CLI-level flag covers
 * only the entry process and leaves later stages at the default cap.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const env = {
  ...process.env,
  NODE_OPTIONS: ['--max-old-space-size=8192', process.env.NODE_OPTIONS ?? '']
    .join(' ')
    .trim(),
}

const steps = [
  ['--filter', '@deepseek-ai/website', 'run', 'build'],
  ['run', 'verify-doc-site-fragments'],
]
// Windows resolves package-manager shims as `pnpm.cmd`, and recent Node
// refuses `.cmd` spawn targets without a shell (CVE-2024-27980 mitigation).
const shell = process.platform === 'win32'
const pnpm = shell ? 'pnpm.cmd' : 'pnpm'
for (const args of steps) {
  const result = spawnSync(pnpm, args, { cwd: root, env, stdio: 'inherit', shell })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

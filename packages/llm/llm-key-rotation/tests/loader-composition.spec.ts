import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as LlmRuntime from '@deepseek-ai/dsh-llm'
import * as CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import type { MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import * as Retry from '@deepseek-ai/dsh-llm-retry'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as KeyRotation from '../src/index.ts'

let root: string | undefined
let context: Context | undefined
let server: MockLlmServer | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (server !== undefined) await server.close()
  server = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('real Loader composition', () => {
  // Real-Loader composition resolves workspace packages through tsx at test
  // time; first resolution after the host/client program split is slow enough
  // to trip the default 5s budget on cold caches.
  it('boots rotated OpenRouter-style routes from cordis.yml and recovers across keys', { timeout: 60_000 }, async () => {
    server = await startMockLlmServer({ sequence: ['rate_limit', 'success'] })
    root = await mkdtemp(join(tmpdir(), 'dsh-key-rotation-loader-'))
    const credentialPath = join(root, '.credentials.yaml').replaceAll('\\', '/')
    await writeFile(
      credentialPath,
      'version: 1\nrefs:\n  OPENROUTER_KEY_1: wire-k1\n  OPENROUTER_KEY_2: wire-k2\n',
      { mode: 0o600 },
    )
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-llm'",
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-system-prompt'",
      "- name: '@deepseek-ai/dsh-tools'",
      "- name: '@deepseek-ai/dsh-agent'",
      '- id: credentials',
      "  name: '@deepseek-ai/dsh-credentials-local'",
      '  config:',
      `    path: '${credentialPath}'`,
      "- name: '@deepseek-ai/dsh-llm-retry'",
      '- id: llm-openrouter',
      "  name: '@deepseek-ai/dsh-llm-key-rotation'",
      '  config:',
      `    parkFile: '${join(root, '.llm-key-rotation-parks.json').replaceAll('\\', '/')}'`,
      '    providers:',
      '      openrouter:',
      '        api: openai-completions',
      `        baseURL: '${server.baseURL}'`,
      '        models:',
      '          - id: mock-model',
      '            name: Mock Model',
      '            contextWindow: 8192',
      '        keys:',
      '          - apiKeyEnv: OPENROUTER_KEY_1',
      '          - apiKeyEnv: OPENROUTER_KEY_2',
      "- name: '@deepseek-ai/dsh-agent-loop'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-llm', LlmRuntime],
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
      ['@deepseek-ai/dsh-tools', ToolRuntime],
      ['@deepseek-ai/dsh-agent', AgentRegistry],
      ['@deepseek-ai/dsh-credentials-local', CredentialsLocal],
      ['@deepseek-ai/dsh-llm-retry', Retry],
      ['@deepseek-ai/dsh-llm-key-rotation', KeyRotation],
      ['@deepseek-ai/dsh-agent-loop', AgentLoop],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()

    expect(context.llm.listProviders().map(provider => provider.id)).toEqual(['openrouter'])
    const agent = context.agentLoop.create(SessionId('loader-key-rotation'), {
      provider: 'openrouter',
      model: 'mock-model',
    })
    const idle = agent.whenIdle()
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'survive the daily limit' }],
      source: { kind: 'user' },
    }))
    await idle

    expect(server.requests.map(request => request.headers.authorization))
      .toEqual(['Bearer wire-k1', 'Bearer wire-k2'])
    // The park survived the loop: the durable document names the parked key.
    const parks = JSON.parse(
      await readFile(join(root, '.llm-key-rotation-parks.json'), 'utf8'),
    ) as { version: number; parks: Array<{ route: string; label: string; parkedAt: number; resetAt: number }> }
    expect(parks.version).toBe(1)
    const [record] = parks.parks
    expect(record).toMatchObject({ route: 'openrouter', label: 'OPENROUTER_KEY_1' })
    expect(record?.parkedAt).toBeGreaterThan(0)
    expect(record?.resetAt).toBeGreaterThan(Date.now())
    expect(agent.session.events.some(event => event.type === 'llm/retry')).toBe(false)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'mock response recovered' }],
    })
  })
})

import type { Context } from '@deepseek-ai/cordis'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-llm-key-rotation/types'
import type { KeyRotatedChatData } from '../contract/chat-nodes.ts'
import { chatNode } from './common.ts'

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** One rotating-pool advance onto another credential. */
    'key-rotated': KeyRotatedChatData
  }
}

/**
 * Read one `llm/key-rotated` event into its renderer payload.
 * @param match - the matched start candidate.
 * @returns the payload, or undefined for any other event type.
 */
function dataOf(match: Parameters<ConversationNodeDefinition['start']>[1]): KeyRotatedChatData | undefined {
  if (match.event.type !== 'llm/key-rotated') return undefined
  const data = match.event.data
  return {
    seq: match.event.seq,
    time: match.event.time,
    provider: data.provider,
    from: data.from,
    to: data.to,
    cause: data.cause,
    ...(data.resetAt === undefined ? {} : { resetAt: data.resetAt }),
    ...(data.reason === undefined ? {} : { reason: data.reason }),
  }
}

/** One-record rotating-pool advance Definition: every event renders its own marker line. */
export const keyRotatedDefinition: ConversationNodeDefinition<KeyRotatedChatData> = {
  kind: 'key-rotated',
  target: 'chat',
  match: event => (event.type === 'llm/key-rotated'
    ? { id: `key-rotated:${event.seq}`, role: 'start' as const }
    : null),
  start: (_context, match) => {
    const data = dataOf(match)
    if (data === undefined) throw new Error('key-rotated start requires an llm/key-rotated event')
    return data
  },
  update: context => context.state,
  buildViewNode: context => (context.state === undefined
    ? null
    : chatNode(context, 'key-rotated', context.state.seq, context.state)),
}

/**
 * Register the rotating-pool advance business contribution.
 * @param ctx - owning UI Conversation context.
 */
export function registerKeyRotatedConversationNode(ctx: Context): void {
  ctx.conversationEvents.register(keyRotatedDefinition)
}

import type {
  AssistantBlock, AssistantMessageNode, ChatConversationViewNode, CommandNode,
  CompactionSummaryNode, ModelRetryNode, RunningToolCall, ToolCallBlock,
} from '@deepseek-ai/dsh-client-runtime/client'

/** Merge-extensible payload registry keyed by final Chat renderer kind. */
export interface ChatNodeDataMap {}

/** Renderer kinds contributed by the currently installed Chat business modules. */
export type ChatNodeKind = Extract<keyof ChatNodeDataMap, string>

/** Final Chat Node narrowed to one registered renderer kind and payload. */
export type ChatNode<Kind extends ChatNodeKind = ChatNodeKind> = {
  [RegisteredKind in Kind]: ChatConversationViewNode & {
    readonly kind: RegisteredKind
    readonly data: ChatNodeDataMap[RegisteredKind]
  }
}[Kind]

/** Final Assistant row payload shared by streaming and settled states. */
export interface AssistantChatData {
  readonly status: 'running' | 'settled' | 'interrupted'
  readonly turn: number
  readonly step: number
  readonly blocks: readonly AssistantBlock[]
  readonly time: number
  readonly usage?: unknown
  readonly finalNode?: AssistantMessageNode
}

/** Settled or interrupted Assistant payload with its durable presentation node. */
export type FinalAssistantChatData = AssistantChatData & {
  readonly finalNode: AssistantMessageNode
}

/** Root Tool row payload; the root lifecycle owns all recursive subcalls. */
export interface ToolChatData {
  readonly root: ToolCallBlock
}

/** One manual command and its correlated compaction transaction. */
export interface ManualCompactionChatData {
  readonly command: CommandNode
  readonly compaction: CompactionSummaryNode | null
}

/** One durable retry chain rendered as a single row. */
export interface RetryChatData {
  readonly attempts: readonly ModelRetryNode[]
  readonly current: ModelRetryNode
}

/** One rotating-pool advance rendered as a slim marker line. */
export interface KeyRotatedChatData {
  readonly seq: number
  readonly time: number
  /** Registered provider route whose pool advanced. */
  readonly provider: string
  /** Label of the credential that served the failed attempt. */
  readonly from: string
  /** Label of the credential the next attempt uses. */
  readonly to: string
  /** Why the served credential was left. */
  readonly cause: 'rate-limit' | 'vendor-relay'
  /** ISO reset instant carried by a rate-limit park; absent otherwise. */
  readonly resetAt?: string
  /** Trimmed upstream text naming the failure; absent when none was usable. */
  readonly reason?: string
}

/** Turn-local footer row that owns actions and optional feature contributions. */
export interface TurnTailChatData {
  readonly turn: number
  readonly seq: number
  readonly time: number
  /** Last finalized content-bearing Assistant in this Turn. */
  readonly closing: FinalAssistantChatData | null
  /** Whether non-rendered later evidence makes the closing seq non-tail. */
  readonly branchUnavailable: boolean
  readonly ttftMs?: number
  readonly tokensPerSecond?: number
}

/**
 * Test whether a Tool root has settled.
 * @param block - Tool root lifecycle value.
 * @returns whether the root carries its final result.
 */
export function isSettledTool(block: ToolCallBlock): block is Extract<ToolCallBlock, { kind: 'tool-result' }> {
  return 'kind' in block
}

/**
 * Test whether a Tool root is still running.
 * @param block - Tool root lifecycle value.
 * @returns whether the root lacks a final result.
 */
export function isRunningTool(block: ToolCallBlock): block is RunningToolCall {
  return !isSettledTool(block)
}

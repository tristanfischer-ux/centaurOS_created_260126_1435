/**
 * @file index.ts
 *
 * @description Public API for the ForgeOS Observational Memory system.
 * Import from '@/lib/agent-memory' to use.
 *
 * @example
 * import {
 *   createMemoryThread,
 *   addMemoryMessage,
 *   getMemoryContext,
 *   formatMemoryForPrompt,
 *   processMemory,
 * } from '@/lib/agent-memory'
 */

// Core manager operations
export {
  createMemoryThread,
  getOrCreateFoundryThread,
  addMemoryMessage,
  getMemoryContext,
  formatMemoryForPrompt,
  formatObservationsForPrompt,
  getConversationHistory,
  processMemory,
} from './manager'

// Conversation message type (for multi-turn LLM calls)
export type { ConversationMessage } from './manager'

// Token counting
export { countTokens, countMessagesTokens } from './token-counter'

// Types
export type {
  MemoryThread,
  MemoryMessage,
  MemoryObservation,
  MemoryContext,
  MemoryConfig,
  MemoryContextType,
  MessageRole,
  CompressionLevel,
} from './types'

export { DEFAULT_MEMORY_CONFIG, OBSERVATION_PRIORITY } from './types'

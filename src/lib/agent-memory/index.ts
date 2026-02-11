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
  processMemory,
} from './manager'

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

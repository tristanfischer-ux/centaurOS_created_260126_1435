/**
 * @file types.ts
 *
 * @description Type definitions for the ForgeOS Observational Memory system.
 * Defines the shape of memory threads, messages, observations, and configuration.
 */

// ─── Memory Thread ──────────────────────────────────────────────────

/** The context in which a memory thread operates */
export type MemoryContextType = 'workflow_run' | 'foundry' | 'ghost_worker' | 'chat' | 'specialist'

/** A conversation/context thread that groups messages and observations */
export interface MemoryThread {
  id: string
  foundry_id: string
  created_by: string
  context_type: MemoryContextType
  /** Optional reference to related entity (workflow_run_id, task_id, etc.) */
  context_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── Memory Message ─────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/** An individual message recorded in a memory thread */
export interface MemoryMessage {
  id: string
  thread_id: string
  foundry_id: string
  role: MessageRole
  content: string
  token_count: number
  /** Whether this message has been compressed into observations */
  is_observed: boolean
  created_at: string
}

// ─── Observations ───────────────────────────────────────────────────

/** Compressed observation block for a thread */
export interface MemoryObservation {
  id: string
  thread_id: string
  foundry_id: string
  /** The compressed observation text (date-grouped, emoji-prioritized) */
  observations_text: string
  token_count: number
  /** Incremented on each reflection pass */
  version: number
  created_at: string
  updated_at: string
}

// ─── Priority Levels ────────────────────────────────────────────────

/** Emoji-based priority levels for observations */
export const OBSERVATION_PRIORITY = {
  HIGH: '🔴',
  MEDIUM: '🟡',
  LOW: '🟢',
} as const

// ─── Configuration ──────────────────────────────────────────────────

/** Configuration for the memory system thresholds and behavior */
export interface MemoryConfig {
  /**
   * Token threshold for raw messages before triggering the Observer.
   * When unobserved messages exceed this, they get compressed into observations.
   * Lower values mean more frequent compression but faster conversations.
   * @default 12_000
   */
  observeThresholdTokens: number

  /**
   * Token threshold for observations before triggering the Reflector.
   * When observations exceed this, they get consolidated/garbage-collected.
   * @default 20_000
   */
  reflectThresholdTokens: number

  /**
   * Model to use for observer/reflector LLM calls.
   * @default "gpt-5.3-instant"
   */
  memoryModel: string

  /**
   * Temperature for observer calls (lower = more deterministic).
   * @default 0.3
   */
  observerTemperature: number

  /**
   * Temperature for reflector calls (0 = fully deterministic).
   * @default 0
   */
  reflectorTemperature: number
}

/** Default memory configuration */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  observeThresholdTokens: 12_000,
  reflectThresholdTokens: 20_000,
  memoryModel: 'gpt-5.3-instant',
  observerTemperature: 0.3,
  reflectorTemperature: 0,
}

// ─── Memory Context (returned to callers) ───────────────────────────

/** The assembled context block ready for injection into a system prompt */
export interface MemoryContext {
  /** Compressed observations from past interactions */
  observations: string
  /** Recent uncompressed messages */
  recentMessages: Array<{ role: MessageRole; content: string }>
  /** Total token count of the context */
  totalTokens: number
}

// ─── Compression Level (for reflector retries) ──────────────────────

export type CompressionLevel = 0 | 1 | 2

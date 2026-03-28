/**
 * @file types.ts — Red Team Debate type definitions
 *
 * @description Types for the multi-LLM adversarial debate system.
 * Five personas (Bull, Bear, Realist, Disruptor, Wildcard) each powered
 * by a different LLM debate a strategic decision across multiple rounds.
 */

import type { AIProviderId } from "@/lib/ai-providers/types"

// ─── Persona Definitions ────────────────────────────────────────

export type DebateRole = "bull" | "bear" | "realist" | "disruptor" | "wildcard"

export interface DebatePersona {
  role: DebateRole
  /** ForgeOS specialist character name */
  characterName: string
  /** Character title (e.g., "Strategy") */
  characterTitle: string
  /** Display label for the debate (e.g., "BULL") */
  label: string
  /** One-line position statement */
  position: string
  /** AI provider to use */
  providerId: AIProviderId
  /** Model ID within that provider */
  modelId: string
  /** Accent color for UI */
  color: string
}

// ─── Debate Structure ───────────────────────────────────────────

export interface DebateArgument {
  role: DebateRole
  characterName: string
  modelId: string
  content: string
  /** Time taken in ms */
  duration: number
  /** Estimated cost in USD for this argument */
  costUsd?: number
}

export interface FactCheck {
  claim: string
  verdict: "verified" | "unverified" | "disputed" | "corrected"
  detail: string
}

export interface DebateRound {
  roundNumber: number
  question: string
  arguments: DebateArgument[]
  factChecks: FactCheck[]
  /** User interjection after this round (if interactive mode) */
  userInput?: string
}

export interface TensionRow {
  dimension: string
  bull: string
  bear: string
  realist: string
  disruptor: string
  wildcard: string
}

export interface SuggestedObjective {
  title: string
  description: string
  targetDate?: string
}

export interface SuggestedTask {
  title: string
  description: string
  function?: string
}

export interface SuggestedRiskMitigation {
  risk: string
  mitigation: string
  owner?: string
}

export interface RedTeamDebateDocument {
  id: string
  topic: string
  context?: string
  generatedAt: string
  personas: DebatePersona[]
  /** Numbered evidence pack (each entry prefixed [R1], [R2], etc.) */
  evidencePack: string
  /** Raw evidence items for tooltip rendering */
  evidenceItems?: { label: string; content: string }[]
  rounds: DebateRound[]
  tensions: TensionRow[]
  verdict: string
  /** Custom round questions generated from topic (null = used defaults) */
  customQuestions?: string[]
  /** User interjections between rounds */
  userInputs?: Record<number, string>
  suggestedObjectives: SuggestedObjective[]
  suggestedTasks: SuggestedTask[]
  suggestedRiskMitigations: SuggestedRiskMitigation[]
  /** Total generation time in ms */
  totalDuration: number
  /** Total estimated cost in USD */
  totalCostUsd?: number
}

export interface RedTeamDebateResult {
  success: boolean
  document?: RedTeamDebateDocument
  error?: string
}

// ─── Generation Progress ────────────────────────────────────────

export type DebatePhase =
  | "research"
  | "round"
  | "fact-check"
  | "synthesis"
  | "actions"
  | "awaiting_input"
  | "complete"
  | "error"

export interface DebateProgress {
  phase: DebatePhase
  /** Current round number (1-5) when phase is "round" */
  round?: number
  /** Current persona speaking when phase is "round" */
  persona?: DebateRole
  /** Progress message for UI */
  message: string
}

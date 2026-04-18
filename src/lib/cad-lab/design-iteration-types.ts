/**
 * @file design-iteration-types.ts — Types + constants for the design-iteration
 * system, extracted so they can be imported by `"use server"` action files and
 * client components alike.
 *
 * @description `"use server"` modules can only export async functions. Keeping
 * shared types + numeric constants here avoids the Turbopack build error
 * ("Server Actions must be async functions" triggered by const exports).
 */

export type IterationTrigger =
  | "specialist_infeasibility"
  | "cost_overrun"
  | "compliance_miss"
  | "lead_time_exceeded"
  | "moq_mismatch"
  | "manual"

export interface DesignAlternative {
  headline: string
  rationale: string
  plainEnglish: string
  changes: Record<string, unknown>
  tradeOffs: Array<{ dimension: string; delta: string }>
  confidence: "low" | "medium" | "high"
  severity: {
    exportControls?: boolean
    featureDescope?: boolean
    supplyCommitmentBreak?: boolean
  }
  recommended: boolean
}

export interface IterationHistoryEntry {
  id: string
  triggeredBy: IterationTrigger
  concernHash: string
  concernText: string
  triggerContext: Record<string, unknown>
  alternativesPresented: DesignAlternative[]
  chosenOptionIndex: number | null
  founderNotes: string | null
  overrideReason: string | null
  appliedAt: string | null
  createdAt: string
}

// Phase VI hard caps.
export const MAX_ITERATIONS_PER_PROJECT = 5
export const MAX_ITERATIONS_PER_CONCERN = 3

/**
 * @file business-plan-types.ts
 * @description Type definitions for the Business Plan Intelligence Engine.
 * Covers AI analysis output, smart merge results, hiring requirements,
 * and funding requirements.
 */

// ─── AI Analysis Output ──────────────────────────────────────────────────────

// INTENT: The AI produces five parallel output streams from the business plan.
// Each stream seeds a different part of the platform.

export interface AnalyzedObjective {
  title: string
  description: string
  phase?: string
  suggestedStartDate?: string
  suggestedEndDate?: string
  tasks: AnalyzedTask[]
}

export interface AnalyzedTask {
  title: string
  description: string
  role: 'Executive' | 'Apprentice' | 'AI_Agent'
  estimatedDays?: number
}

export interface HiringRequirement {
  roleTitle: string
  roleType: 'full_time' | 'fractional' | 'apprentice'
  reason: string
  linkedObjectiveTitle: string
  suggestedDate: string
  phase?: string
}

export interface CapacityRequirement {
  description: string
  linkedObjectiveTitle: string
  requiredByDate?: string
  notes?: string
}

export interface FundingRequirement {
  title: string
  amountUsd?: number
  reason: string
  neededByDate?: string
  fundingType?: 'bootstrapping' | 'angel' | 'vc' | 'grant' | 'revenue_based' | 'debt' | 'other'
  linkedObjectiveTitles: string[]
}

export interface BusinessPlanAnalysis {
  objectives: AnalyzedObjective[]
  hiringRequirements: HiringRequirement[]
  capacityRequirements: CapacityRequirement[]
  fundingRequirements: FundingRequirement[]
  executiveSummary: string
}

// ─── Smart Merge ─────────────────────────────────────────────────────────────

// INTENT: Smart merge reconciles AI suggestions against what the user already
// has in ForgeOS. Each suggestion gets a disposition: adopt, merge, or skip.
// This prevents blowing away existing work.

export type MergeDisposition = 'adopt' | 'merge' | 'skip' | 'pending'

export interface ObjectiveMergeSuggestion {
  id: string
  aiObjective: AnalyzedObjective
  existingObjectiveId?: string
  existingObjectiveTitle?: string
  disposition: MergeDisposition
  similarity?: number
}

export interface MergeReviewState {
  objectiveSuggestions: ObjectiveMergeSuggestion[]
  hiringRequirements: HiringRequirement[]
  capacityRequirements: CapacityRequirement[]
  fundingRequirements: FundingRequirement[]
  analysisId: string
}

// ─── DB-backed hiring requirement (after saving) ─────────────────────────────

// GOTCHA: foundry_id is TEXT in the database (foundries.id is text), not UUID.
export interface SavedHiringRequirement {
  id: string
  foundry_id: string
  analysis_id: string | null
  role_title: string
  role_type: 'full_time' | 'fractional' | 'apprentice'
  reason: string | null
  linked_objective_id: string | null
  ai_suggested_date: string | null
  user_override_date: string | null
  status: 'planned' | 'recruiting' | 'hired' | 'cancelled'
  created_at: string
  updated_at: string
  linked_objective_title?: string | null
}

// ─── DB-backed funding requirement (after saving) ────────────────────────────

export interface SavedFundingRequirement {
  id: string
  foundry_id: string
  analysis_id: string | null
  title: string
  amount_usd: number | null
  reason: string | null
  needed_by_date: string | null
  funding_type: string | null
  linked_objective_ids: string[]
  status: 'projected' | 'seeking' | 'secured' | 'cancelled'
  created_at: string
  updated_at: string
}

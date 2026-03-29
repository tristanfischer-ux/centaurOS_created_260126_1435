/**
 * @file business-plan-types.ts
 * @description Type definitions for the Business Plan Intelligence Engine.
 * Covers AI analysis output, smart merge results, hiring requirements,
 * and funding requirements.
 */

import { z } from 'zod'

// ─── AI Analysis Output ──────────────────────────────────────────────────────

// INTENT: The AI produces five parallel output streams from the business plan.
// Each stream seeds a different part of the platform. Zod schemas validate
// the AI response at runtime to catch malformed output before it hits the DB.

export const analyzedTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  role: z.enum(['Executive', 'Apprentice', 'AI_Agent']).default('Apprentice'),
  estimatedDays: z.number().optional(),
})

export const analyzedObjectiveSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  phase: z.string().optional(),
  suggestedStartDate: z.string().optional(),
  suggestedEndDate: z.string().optional(),
  tasks: z.array(analyzedTaskSchema).default([]),
})

export const hiringRequirementSchema = z.object({
  roleTitle: z.string().min(1),
  roleType: z.enum(['full_time', 'fractional', 'apprentice']),
  reason: z.string().default(''),
  linkedObjectiveTitle: z.string().default(''),
  suggestedDate: z.string().default(''),
  phase: z.string().optional(),
})

export const capacityRequirementSchema = z.object({
  description: z.string().min(1),
  linkedObjectiveTitle: z.string().default(''),
  requiredByDate: z.string().optional(),
  notes: z.string().optional(),
})

export const fundingRequirementSchema = z.object({
  title: z.string().min(1),
  amountUsd: z.number().optional(),
  reason: z.string().default(''),
  neededByDate: z.string().optional(),
  fundingType: z.enum(['bootstrapping', 'angel', 'vc', 'grant', 'revenue_based', 'debt', 'other']).optional(),
  linkedObjectiveTitles: z.array(z.string()).default([]),
})

export const analyzedProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  targetMarket: z.string().optional(),
  revenueModel: z.string().optional(),
  suggestedPrice: z.number().optional(),
})

export const businessPlanAnalysisSchema = z.object({
  objectives: z.array(analyzedObjectiveSchema).default([]),
  hiringRequirements: z.array(hiringRequirementSchema).default([]),
  capacityRequirements: z.array(capacityRequirementSchema).default([]),
  fundingRequirements: z.array(fundingRequirementSchema).default([]),
  products: z.array(analyzedProductSchema).default([]),
  executiveSummary: z.string().default(''),
})

export type AnalyzedTask = z.infer<typeof analyzedTaskSchema>
export type AnalyzedObjective = z.infer<typeof analyzedObjectiveSchema>
export type AnalyzedProduct = z.infer<typeof analyzedProductSchema>
export type HiringRequirement = z.infer<typeof hiringRequirementSchema>
export type CapacityRequirement = z.infer<typeof capacityRequirementSchema>
export type FundingRequirement = z.infer<typeof fundingRequirementSchema>
export type BusinessPlanAnalysis = z.infer<typeof businessPlanAnalysisSchema>

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB
export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const
export const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.docx'] as const

// ─── Smart Merge ─────────────────────────────────────────────────────────────

// INTENT: Smart merge reconciles AI suggestions against what the user already
// has in ForgeOS. Each suggestion gets a disposition: adopt, merge, or skip.
// This prevents blowing away existing work.

export type MergeDisposition = 'adopt' | 'merge' | 'skip'

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

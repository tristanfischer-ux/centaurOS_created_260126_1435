/**
 * @file manufacturing-techniques/types.ts
 *
 * @description Type definitions for the Manufacturing Techniques Explorer.
 * Defines the shape of technique data, categories, batch-size ranges,
 * and cost tiers used throughout the explorer UI and data layer.
 */

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const TECHNIQUE_CATEGORIES = [
  'additive',
  'subtractive',
  'forming',
  'casting',
  'joining',
  'surface',
  'composite',
  'electronics',
  'textile',
  'advanced',
] as const

export type TechniqueCategory = (typeof TECHNIQUE_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<TechniqueCategory, string> = {
  additive: 'Additive Manufacturing',
  subtractive: 'Subtractive Manufacturing',
  forming: 'Forming & Shaping',
  casting: 'Casting',
  joining: 'Joining & Assembly',
  surface: 'Surface Treatment',
  composite: 'Composites',
  electronics: 'Electronics',
  textile: 'Textile & Fiber',
  advanced: 'Advanced & Emerging',
} satisfies Record<TechniqueCategory, string>

// ---------------------------------------------------------------------------
// Batch size
// ---------------------------------------------------------------------------

export const BATCH_SIZES = ['prototype', 'low', 'medium', 'high'] as const
export type BatchSize = (typeof BATCH_SIZES)[number]

export const BATCH_SIZE_LABELS: Record<BatchSize, string> = {
  prototype: 'Prototype (1–10)',
  low: 'Low Volume (10–1k)',
  medium: 'Medium Volume (1k–100k)',
  high: 'High Volume (100k+)',
} satisfies Record<BatchSize, string>

export interface BatchSizeRange {
  min: BatchSize
  max: BatchSize
}

// ---------------------------------------------------------------------------
// Cost tier
// ---------------------------------------------------------------------------

export const COST_TIERS = ['low', 'medium', 'high', 'very-high'] as const
export type CostTier = (typeof COST_TIERS)[number]

export const COST_TIER_LABELS: Record<CostTier, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  'very-high': 'Very High',
} satisfies Record<CostTier, string>

// ---------------------------------------------------------------------------
// Manufacturing Technique
// ---------------------------------------------------------------------------

export interface ManufacturingTechnique {
  /** Unique identifier, e.g. "fdm", "cnc-milling-5axis" */
  id: string
  /** Human-readable name, e.g. "Fused Deposition Modeling (FDM)" */
  name: string
  /** URL-friendly slug */
  slug: string
  /** Top-level category */
  category: TechniqueCategory
  /** Optional subcategory, e.g. "Polymer 3D Printing" */
  subcategory?: string
  /** 2-3 sentence description of the technique */
  description: string
  /** Slightly longer explanation of how the process works */
  howItWorks: string
  /** Materials this technique supports */
  materials: string[]
  /** Suitable batch size range */
  batchSize: BatchSizeRange
  /** Typical tolerance range, e.g. "±0.1mm to ±0.5mm" */
  toleranceRange?: string
  /** Surface finish quality description */
  surfaceFinish?: string
  /** Relative cost tier */
  costTier: CostTier
  /** Typical lead time, e.g. "1-5 days" */
  leadTime?: string
  /** Key advantages */
  pros: string[]
  /** Key limitations */
  cons: string[]
  /** Common applications / use cases */
  applications: string[]
  /** IDs of related techniques */
  relatedTechniques: string[]
  /** Grokipedia article slug for in-modal embedding (optional) */
  grokipediaSlug?: string
}

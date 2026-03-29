/**
 * @file product.ts — Product Intelligence Layer types
 *
 * @description Core type definitions for the Product entity that bridges
 * CAD Lab (design), Cash Burn (finance), Strategy (planning), and
 * Investors (fundraising). A product can be created from any of these
 * systems and feeds data into all of them.
 *
 * @related
 * - Server actions: src/actions/products.ts
 * - CAD Lab types: src/lib/cad-lab-types.ts (AiCostEstimate)
 * - Cash Burn types: src/types/cash-burn.ts (CashInItem, CashOutItem)
 */

// ─── Product Lifecycle ──────────────────────────────────────────────

export type ProductLifecycle =
  | 'concept'        // idea only, no validation
  | 'researching'    // market assessment in progress
  | 'validated'      // market data exists, financials modeled
  | 'prototyping'    // CAD Lab active, design underway
  | 'pre_production' // design complete, sourcing/tooling
  | 'in_market'      // shipping to customers
  | 'deprecated'     // end of life

export const LIFECYCLE_LABELS: Record<ProductLifecycle, string> = {
  concept: 'Concept',
  researching: 'Researching',
  validated: 'Validated',
  prototyping: 'Prototyping',
  pre_production: 'Pre-Production',
  in_market: 'In Market',
  deprecated: 'Deprecated',
}

export const LIFECYCLE_ORDER: ProductLifecycle[] = [
  'concept', 'researching', 'validated', 'prototyping', 'pre_production', 'in_market', 'deprecated',
]

// ─── Product Entity ─────────────────────────────────────────────────

export interface Product {
  id: string
  foundry_id: string
  created_by: string
  name: string
  description: string | null
  hero_image_url: string | null
  lifecycle: ProductLifecycle
  market_assessment: MarketAssessment | null
  unit_economics: UnitEconomics | null
  fundability_score: FundabilityScore | null
  unit_price_pence: number | null
  target_monthly_units: number | null
  cad_lab_project_id: string | null
  created_at: string
  updated_at: string
}

export interface ProductSummary {
  id: string
  name: string
  description: string | null
  hero_image_url: string | null
  lifecycle: ProductLifecycle
  unit_price_pence: number | null
  target_monthly_units: number | null
  cad_lab_project_id: string | null
  /** COGS per unit from unit_economics (for list view display) */
  cogs_per_unit: number | null
  /** Gross margin % from unit_economics (for list view display) */
  gross_margin_pct: number | null
  created_at: string
  updated_at: string
}

// ─── Market Assessment (Phase 3 — co-created with AI) ───────────────

export interface MarketAssessment {
  tam_gbp: number | null
  sam_gbp: number | null
  som_gbp: number | null
  target_customer: string | null
  customer_segments: Array<{
    name: string
    size: number | null
    willingness_to_pay: number | null
  }>
  competitive_landscape: Array<{
    competitor: string
    strengths: string
    weaknesses: string
    price_point: number | null
  }>
  pricing_analysis: {
    recommended_price_pence: number | null
    pricing_model: string | null
    price_range_low_pence: number | null
    price_range_high_pence: number | null
    reasoning: string | null
  } | null
  market_risks: string[]
  market_opportunities: string[]
  /** Which data points are AI-estimated vs founder-validated */
  validation_status: Record<string, 'ai_estimated' | 'founder_validated' | 'founder_entered'>
  assessed_at: string | null
  model_used: string | null
}

// ─── Unit Economics ─────────────────────────────────────────────────

export interface UnitEconomics {
  /** Manufacturing cost per unit (from CAD Lab ai_cost_estimates) */
  cogs_per_unit_pence: number
  /** Selling price per unit */
  selling_price_pence: number | null
  /** Gross margin percentage */
  gross_margin_pct: number | null
  /** Selling price - COGS */
  contribution_margin_pence: number | null
  /** Fixed costs / contribution margin */
  breakeven_units: number | null
  /** Total tooling/setup investment from CAD Lab */
  tooling_investment_pence: number | null
  /** COGS breakdown by category */
  cogs_breakdown: Array<{
    category: string
    amount_pence: number
    pct: number
  }>
  /** When COGS was last synced from CAD Lab */
  last_synced_from_cad_at: string | null
  /** Confidence in COGS estimate */
  cogs_confidence: 'low' | 'medium' | 'high'
}

// ─── Fundability Score (Phase 4) ────────────────────────────────────

export interface FundabilityScore {
  overall: number // 0-100
  market_size_score: number
  margin_score: number
  defensibility_score: number
  team_readiness_score: number
  traction_score: number
  investor_appetite: 'strong' | 'moderate' | 'weak'
  improvement_suggestions: Array<{
    action: string
    impact_description: string
    estimated_score_lift: number
  }>
  scored_at: string
  model_used: string
}

// ─── Create/Update Inputs ───────────────────────────────────────────

export interface CreateProductInput {
  name: string
  description?: string
  lifecycle?: ProductLifecycle
  cad_lab_project_id?: string
  unit_price_pence?: number
  target_monthly_units?: number
}

export interface UpdateProductInput {
  name?: string
  description?: string
  lifecycle?: ProductLifecycle
  unit_price_pence?: number | null
  target_monthly_units?: number | null
  hero_image_url?: string | null
}

/**
 * @file design-standards.ts — Types for the Design Standards Library.
 *
 * Engineering standards stored in Supabase, scored by relevance,
 * and injected into GPT-5.5 context for standards-compliant CAD generation.
 */

export interface DesignRule {
  rule: string
  section: string
  criticality: "mandatory" | "recommended" | "informative"
}

export interface MaterialSpecs {
  allowed_materials?: string[]
  prohibited_materials?: string[]
  test_methods?: string[]
}

export interface DesignStandard {
  id: string
  standard_code: string
  standard_name: string
  issuing_body: string
  industry_domain: string
  product_tags: string[]
  engineering_tags: string[]
  summary: string
  requirements_markdown: string
  design_rules: DesignRule[]
  material_specs: MaterialSpecs
  dimensional_constraints: Record<string, unknown>
  test_procedures: string | null
  applicable_to: string[]
  region: string[]
  version: string | null
  superseded_by: string | null
  token_estimate: number
  source: string
  source_notes: string | null
  verified: boolean
  created_at: string
  updated_at: string
}

export interface StandardsRecommendation {
  standardCode: string
  standardName: string
  issuingBody: string
  score: number
  reasons: string[]
  tokenEstimate: number
  summary: string
  requirementsMarkdown: string
  designRules: DesignRule[]
}

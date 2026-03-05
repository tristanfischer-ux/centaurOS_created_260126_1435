export interface TechniqueEnrichment {
  id: string
  technique_slug: string
  article_markdown: string | null
  real_world_tolerances: {
    min_mm?: number | null
    max_mm?: number | null
    typical_mm?: number | null
    notes?: string | null
  }
  real_world_materials: Array<{
    material: string
    frequency: number
  }>
  real_world_equipment: Array<{
    brand_model: string
    frequency: number
  }>
  real_world_surface_finishes: {
    min_ra_um?: number | null
    max_ra_um?: number | null
    typical_ra_um?: number | null
    notes?: string | null
  }
  typical_batch_sizes: {
    prototype?: boolean
    low_volume?: string | null
    production?: string | null
    notes?: string | null
  }
  tips_and_insights: string[]
  common_applications: string[]
  supplier_count: number
  source: string
  created_at: string
  updated_at: string
}

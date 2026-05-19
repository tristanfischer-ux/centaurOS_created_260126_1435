/**
 * @file db-queries.ts — Grounding data queries for the PDF engine
 *
 * Queries material_properties, process_capabilities, and design_standards
 * from Supabase. This data grounds the BOM, cost, and regulatory sections
 * with real engineering values instead of LLM hallucinations.
 *
 * SCHEMA NOTE: field names here match the actual Supabase columns.
 * Earlier versions of this file had the wrong names, which silently caused
 * every grounding lookup to return undefined. Do NOT rename a field here
 * unless you also check the Supabase table definition.
 *
 * NOTE: marketplace_listings is NOT queried here. That table contains
 * Forge Capital investor data (30,049 rows), not supplier listings.
 * Supplier matching is done via Brave Search in stages/5-suppliers.ts.
 */

import { getSupabase } from './supabase-client'

// ─── Material Properties ───────────────────────────────────────────────────

export interface MaterialProperty {
  material_code: string           // e.g. "6061-T6"
  material_name: string           // e.g. "Aluminum 6061-T6"
  material_family: string         // e.g. "aluminum"
  density_kg_m3: number
  yield_strength_mpa: number | null
  ultimate_strength_mpa: number | null
  thermal_conductivity_w_mk: number | null
  max_service_temp_c: number | null
  corrosion_resistance: string | null
  weldability: string | null
  machinability_rating: number | null
  cost_per_kg_usd: number | null
  common_forms: string[] | null
  common_processes: string[] | null
}

export async function getMaterialProperties(limit = 50): Promise<MaterialProperty[]> {
  const admin = getSupabase()
  const { data, error } = await admin
    .from('material_properties')
    .select('material_code, material_name, material_family, density_kg_m3, yield_strength_mpa, ultimate_strength_mpa, thermal_conductivity_w_mk, max_service_temp_c, corrosion_resistance, weldability, machinability_rating, cost_per_kg_usd, common_forms, common_processes')
    .limit(limit)

  if (error) {
    console.warn('[db-queries] Failed to load material_properties:', error.message)
    return []
  }
  return (data || []) as MaterialProperty[]
}

// ─── Process Capabilities ──────────────────────────────────────────────────

export interface ProcessCapability {
  process_name: string                     // e.g. "cnc_turning"
  display_name: string                     // e.g. "CNC Turning"
  tolerance_typical_mm: number | null
  surface_finish_ra_typical_um: number | null
  min_wall_thickness_mm: number | null
  max_part_size_x_mm: number | null
  max_part_size_y_mm: number | null
  max_part_size_z_mm: number | null
  setup_cost_usd_typical: number | null    // one-off setup cost
  per_part_cost_multiplier: number | null  // multiplier applied to material cost
  typical_lead_time_days: number | null
  suitable_batch_sizes: string[] | null
  suitable_materials: string[] | null
  unsuitable_materials: string[] | null
}

export async function getProcessCapabilities(limit = 30): Promise<ProcessCapability[]> {
  const admin = getSupabase()
  const { data, error } = await admin
    .from('process_capabilities')
    .select('process_name, display_name, tolerance_typical_mm, surface_finish_ra_typical_um, min_wall_thickness_mm, max_part_size_x_mm, max_part_size_y_mm, max_part_size_z_mm, setup_cost_usd_typical, per_part_cost_multiplier, typical_lead_time_days, suitable_batch_sizes, suitable_materials, unsuitable_materials')
    .limit(limit)

  if (error) {
    console.warn('[db-queries] Failed to load process_capabilities:', error.message)
    return []
  }
  return (data || []) as ProcessCapability[]
}

// ─── Design Standards ──────────────────────────────────────────────────────

export interface DesignStandard {
  standard_code: string            // e.g. "ISO 12215-5"
  standard_name: string
  issuing_body: string | null      // e.g. "ISO"
  industry_domain: string | null   // e.g. "marine", "electrical", "battery"
  product_tags: string[] | null
  engineering_tags: string[] | null
  summary: string | null
}

export async function getDesignStandards(domain?: string, limit = 30): Promise<DesignStandard[]> {
  const admin = getSupabase()
  let query = admin
    .from('design_standards')
    .select('standard_code, standard_name, issuing_body, industry_domain, product_tags, engineering_tags, summary')
    .limit(limit)

  if (domain) {
    query = query.eq('industry_domain', domain)
  }

  const { data, error } = await query

  if (error) {
    console.warn('[db-queries] Failed to load design_standards:', error.message)
    return []
  }
  return (data || []) as DesignStandard[]
}

// ─── Combined Grounding Data ───────────────────────────────────────────────

export interface GroundingData {
  materials: MaterialProperty[]
  processes: ProcessCapability[]
  standards: DesignStandard[]
  totalRecords: number
}

export async function loadAllGroundingData(domain?: string): Promise<GroundingData> {
  const [materials, processes, standards] = await Promise.all([
    getMaterialProperties(50),
    getProcessCapabilities(30),
    getDesignStandards(domain, 30),
  ])

  return {
    materials,
    processes,
    standards,
    totalRecords: materials.length + processes.length + standards.length,
  }
}

// ─── Helpers: format grounding data for LLM prompts ────────────────────────

/**
 * Compact summary of available materials for an LLM prompt.
 * One line per material with the fields that matter for BOM generation.
 */
export function formatMaterialsForPrompt(materials: MaterialProperty[]): string {
  if (materials.length === 0) return 'No materials available in grounding database.'
  return materials.map(m => {
    const cost = m.cost_per_kg_usd != null ? `$${m.cost_per_kg_usd}/kg` : 'cost unknown'
    const density = m.density_kg_m3 != null ? `${m.density_kg_m3} kg/m³` : 'density unknown'
    const processes = (m.common_processes || []).slice(0, 4).join(', ') || 'any'
    return `- ${m.material_code} (${m.material_name}, family: ${m.material_family}): ${cost}, ${density}, compatible processes: ${processes}`
  }).join('\n')
}

/**
 * Compact summary of available manufacturing processes for an LLM prompt.
 */
export function formatProcessesForPrompt(processes: ProcessCapability[]): string {
  if (processes.length === 0) return 'No processes available in grounding database.'
  return processes.map(p => {
    const setup = p.setup_cost_usd_typical != null ? `$${p.setup_cost_usd_typical} setup` : 'setup unknown'
    const mult = p.per_part_cost_multiplier != null ? `${p.per_part_cost_multiplier}x/part` : 'multiplier unknown'
    const tol = p.tolerance_typical_mm != null ? `±${p.tolerance_typical_mm}mm` : 'tolerance unknown'
    const lead = p.typical_lead_time_days != null ? `${p.typical_lead_time_days} days` : 'lead unknown'
    const mats = (p.suitable_materials || []).slice(0, 4).join(', ') || 'any'
    return `- ${p.process_name} (${p.display_name}): ${setup}, ${mult}, ${tol}, lead ${lead}, materials: ${mats}`
  }).join('\n')
}

/**
 * Compact summary of relevant design standards for an LLM prompt.
 * Filters to standards whose industry_domain or product_tags match the domain.
 */
export function formatStandardsForPrompt(standards: DesignStandard[], domain?: string): string {
  if (standards.length === 0) return 'No design standards available in grounding database.'
  const relevant = domain
    ? standards.filter(s =>
        s.industry_domain === domain ||
        (s.product_tags || []).some(t => t.toLowerCase().includes(domain.toLowerCase()))
      )
    : standards
  const use = relevant.length > 0 ? relevant : standards.slice(0, 10)
  return use.map(s => {
    const body = s.issuing_body ? ` [${s.issuing_body}]` : ''
    const tags = (s.engineering_tags || []).slice(0, 5).join(', ')
    return `- ${s.standard_code}${body}: ${s.standard_name}${tags ? ` (tags: ${tags})` : ''}`
  }).join('\n')
}

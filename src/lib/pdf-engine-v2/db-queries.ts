/**
 * @file db-queries.ts — Database queries for the supplier knowledge base
 *
 * Queries material_properties, process_capabilities, marketplace_listings,
 * and design_standards from Supabase. This data grounds the BOM and
 * supplier sections with real engineering values.
 */

import { getSupabase } from './supabase-client'

// ─── Material Properties ───────────────────────────────────────────────────

export interface MaterialProperty {
  name: string
  category: string
  density_kg_m3: number
  tensile_strength_mpa: number
  thermal_conductivity: number
  cost_per_kg_usd: number
  notes: string
}

export async function getMaterialProperties(limit = 50): Promise<MaterialProperty[]> {
  const admin = getSupabase()
  const { data, error } = await admin
    .from('material_properties')
    .select('*')
    .limit(limit)

  if (error) {
    console.warn('[db-queries] Failed to load material_properties:', error.message)
    return []
  }
  return (data || []) as MaterialProperty[]
}

// ─── Process Capabilities ──────────────────────────────────────────────────

export interface ProcessCapability {
  process_name: string
  material_compatibility: string
  tolerance_mm: number
  max_size: string
  lead_time_days: number
  cost_rating: string
  notes: string
}

export async function getProcessCapabilities(limit = 30): Promise<ProcessCapability[]> {
  const admin = getSupabase()
  const { data, error } = await admin
    .from('process_capabilities')
    .select('*')
    .limit(limit)

  if (error) {
    console.warn('[db-queries] Failed to load process_capabilities:', error.message)
    return []
  }
  return (data || []) as ProcessCapability[]
}

// ─── Marketplace Listings (Suppliers) ──────────────────────────────────────

export interface SupplierListing {
  id: string
  title: string
  category: string
  country: string
  attributes: Record<string, unknown>
}

export async function getSupplierListings(categoryFilter?: string[], limit = 30): Promise<SupplierListing[]> {
  const admin = getSupabase()
  let query = admin
    .from('marketplace_listings')
    .select('*')
    .limit(limit)

  if (categoryFilter && categoryFilter.length > 0) {
    query = query.in('category', categoryFilter)
  }

  const { data, error } = await query

  if (error) {
    console.warn('[db-queries] Failed to load marketplace_listings:', error.message)
    return []
  }
  return (data || []) as SupplierListing[]
}

// ─── Design Standards ──────────────────────────────────────────────────────

export interface DesignStandard {
  standard_code: string
  title: string
  domain: string
  description: string
  applicability: string
}

export async function getDesignStandards(domain?: string, limit = 30): Promise<DesignStandard[]> {
  const admin = getSupabase()
  let query = admin
    .from('design_standards')
    .select('*')
    .limit(limit)

  if (domain) {
    query = query.eq('domain', domain)
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
  suppliers: SupplierListing[]
  standards: DesignStandard[]
  totalRecords: number
}

export async function loadAllGroundingData(): Promise<GroundingData> {
  const [materials, processes, suppliers, standards] = await Promise.all([
    getMaterialProperties(50),
    getProcessCapabilities(30),
    getSupplierListings(['Products', 'Services'], 30),
    getDesignStandards(undefined, 30),
  ])

  return {
    materials,
    processes,
    suppliers,
    standards,
    totalRecords: materials.length + processes.length + suppliers.length + standards.length,
  }
}

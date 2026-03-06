/**
 * @file cad-lab-supplier-detail.ts — Fetch detailed supplier info for the Source page.
 *
 * @description Server action that retrieves marketplace listing details for
 * the supplier detail dialog shown in the Shortlist and Costs tabs.
 */

"use server"

import { createClient } from "@/lib/supabase/server"

// ─── Types ──────────────────────────────────────────────────────────

export interface SupplierDetail {
  id: string
  name: string
  description: string | null
  websiteUrl: string | null
  city: string | null
  country: string | null
  companySize: string | null
  foundedYear: number | null
  certifications: string[]
  materials: string[]
  specialties: string[]
  keyEquipment: string[]
  leadTime: string | null
  minimumOrder: string | null
  qualitySystems: string | null
  productionCapacity: string | null
}

/**
 * @description Fetches detailed supplier information from marketplace_listings.
 * @param listingId — The marketplace listing ID (same as supplier ID in matches).
 * @returns SupplierDetail or null if not found.
 */
export async function getSupplierDetail(listingId: string): Promise<SupplierDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("marketplace_listings")
    .select(
      "id, title, description, website_url, city, country, company_size, founded_year, certifications, materials, specialties, key_equipment, lead_time, minimum_order, quality_systems, production_capacity"
    )
    .eq("id", listingId)
    .single()

  if (error || !data) return null

  // INTENT: JSON columns may be arrays or null — normalise to string arrays
  const toStringArray = (val: unknown): string[] => {
    if (Array.isArray(val)) return val.map(String)
    return []
  }

  return {
    id: data.id,
    name: data.title,
    description: data.description,
    websiteUrl: data.website_url,
    city: data.city,
    country: data.country,
    companySize: data.company_size,
    foundedYear: data.founded_year,
    certifications: toStringArray(data.certifications),
    materials: toStringArray(data.materials),
    specialties: toStringArray(data.specialties),
    keyEquipment: toStringArray(data.key_equipment),
    leadTime: data.lead_time,
    minimumOrder: data.minimum_order,
    qualitySystems: data.quality_systems,
    productionCapacity: data.production_capacity,
  }
}

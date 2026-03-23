/**
 * @file product-dimensions-retriever.ts — Retrieves real-world product dimensions
 * from Supabase for injection into CAD generation prompts.
 *
 * INTENT: When a user says "build a coffee machine", inject real Nespresso-style
 * dimensions (330×120×260mm, 3kg) so Claude doesn't invent sizes.
 */

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

export interface ProductDimensionMatch {
  category: string
  displayName: string
  dimensions: string
  components: string
  materials: string[]
}

/**
 * Finds matching product dimensions for a description and returns formatted prompt content.
 */
export async function retrieveProductDimensionsForPrompt(
  description: string,
): Promise<{ content: string; matchedCategory: string | null }> {
  const lower = description.toLowerCase()

  // Fetch all product dimensions (small table, <100 rows) — cached 1hr
  const data = await getCachedProductDimensions()

  if (!data || data.length === 0) {
    return { content: "", matchedCategory: null }
  }

  // Score each product by keyword overlap
  let bestMatch: typeof data[0] | null = null
  let bestScore = 0

  for (const prod of data) {
    const keywords = (prod.search_keywords as string[]) ?? []
    let score = 0
    for (const kw of keywords) {
      if (lower.includes(kw)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = prod
    }
  }

  if (!bestMatch || bestScore === 0) {
    return { content: "", matchedCategory: null }
  }

  // Format for prompt injection
  const m = bestMatch
  const lines: string[] = [
    `=== REAL-WORLD PRODUCT DIMENSIONS (use these as reference — do NOT invent sizes) ===`,
    `Product: ${m.display_name}`,
    `Typical dimensions: ${m.typical_length_mm ?? "?"}mm (L) × ${m.typical_width_mm ?? "?"}mm (W) × ${m.typical_height_mm ?? "?"}mm (H)`,
  ]

  if (m.typical_weight_kg) {
    lines.push(`Typical weight: ${m.typical_weight_kg} kg`)
  }

  if (m.length_range_min_mm && m.length_range_max_mm) {
    lines.push(`Length range: ${m.length_range_min_mm}–${m.length_range_max_mm}mm`)
  }
  if (m.width_range_min_mm && m.width_range_max_mm) {
    lines.push(`Width range: ${m.width_range_min_mm}–${m.width_range_max_mm}mm`)
  }
  if (m.height_range_min_mm && m.height_range_max_mm) {
    lines.push(`Height range: ${m.height_range_min_mm}–${m.height_range_max_mm}mm`)
  }

  const components = m.component_dimensions as Record<string, unknown> | null
  if (components && Object.keys(components).length > 0) {
    lines.push("Key component dimensions:")
    for (const [key, value] of Object.entries(components)) {
      const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
      lines.push(`  - ${label}: ${value}`)
    }
  }

  lines.push("CRITICAL: Use these dimensions as your starting point. Your model should be within the stated ranges.")

  return {
    content: lines.join("\n"),
    matchedCategory: m.product_category as string,
  }
}

// DECISION: unstable_cache with 1hr TTL — this is static reference data (<100 rows)
// that rarely changes. Same pattern as cached-layout-data.ts. Uses admin client
// because unstable_cache can revalidate during a different user's request.
const getCachedProductDimensions = unstable_cache(
  async () => {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("product_reference_dimensions")
      .select("*")
      .limit(100)
    return data
  },
  ["product-reference-dimensions"],
  { revalidate: 3600 },
)

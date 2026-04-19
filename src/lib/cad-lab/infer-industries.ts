/**
 * Pure sync industry inference from free-text project descriptions.
 *
 * Extracted from src/actions/cad-lab-supplier-match.ts because "use server"
 * files can only export async functions — this is a plain utility used by
 * both the supplier-match server action AND the specify page.tsx. See the
 * MEMORY.md gotcha on "use server" module rules.
 */

export const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  aerospace: ['aerospace', 'aviation', 'uav', 'drone', 'haps', 'satellite', 'space', 'aircraft', 'avionics'],
  medical: ['medical', 'implant', 'surgical', 'biomedical', 'dental', 'orthopaedic', 'orthopedic'],
  automotive: ['automotive', 'vehicle', 'ev ', 'electric vehicle', 'ecu'],
  defence: ['defence', 'defense', 'military', 'tactical', 'weapons'],
  energy: ['turbine', 'nuclear', 'reactor', 'wind turbine'],
  consumer: ['consumer electronics', 'wearable', 'gadget'],
  industrial: ['machine tool', 'factory automation', 'industrial automation'],
  marine: ['marine', 'naval', 'submarine'],
}

/**
 * Infers project-level industry tags from free-text. Used as a fallback when
 * the caller doesn't supply explicit projectIndustries.
 */
export function inferIndustriesFromText(text: string): Set<string> {
  const lower = text.toLowerCase()
  const matched = new Set<string>()
  for (const [key, terms] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (terms.some((t) => lower.includes(t))) matched.add(key)
  }
  return matched
}

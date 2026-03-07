/**
 * Maps CAD Lab diagnostic options to technique enrichment slugs
 * and tolerance labels to numeric mm values.
 */

/** Maps the 9 diagnostic mfg_process options → technique enrichment slugs */
export const PROCESS_TO_TECHNIQUE_SLUGS: Record<string, string[]> = {
  'FDM 3D Print': ['fdm'],
  'SLA/Resin Print': ['sla'],
  'SLS/Powder Print': ['sls', 'multi-jet-fusion'],
  'CNC Machining': [
    'cnc-milling-3-axis',
    'cnc-milling-5-axis',
    'cnc-turning',
    'precision-grinding',
  ],
  'Sheet Metal': [
    'laser-cutting',
    'sheet-metal-bending',
    'sheet-metal-stamping',
  ],
  'Injection Molding': ['injection-molding'],
  Casting: ['die-casting', 'investment-casting', 'sand-casting'],
  'Manual/Assembly': [],
  Other: [],
}

/** Maps tolerance display labels → numeric mm values */
export const TOLERANCE_TO_MM: Record<string, number> = {
  'Loose (±1mm)': 1.0,
  'Standard (±0.5mm)': 0.5,
  'Precision (±0.1mm)': 0.1,
  'Tight (±0.05mm)': 0.05,
  'Ultra-tight (±0.01mm)': 0.01,
}

/** Get technique slugs for a process name (case-insensitive fuzzy match) */
export function getTechniqueSlugs(processName: string | null | undefined): string[] {
  if (!processName) return []
  // Exact match first
  if (PROCESS_TO_TECHNIQUE_SLUGS[processName]) {
    return PROCESS_TO_TECHNIQUE_SLUGS[processName]
  }
  // Fuzzy: case-insensitive partial match
  const lower = processName.toLowerCase()
  for (const [key, slugs] of Object.entries(PROCESS_TO_TECHNIQUE_SLUGS)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return slugs
    }
  }
  return []
}

/** Convert tolerance label to mm value, returns null if not found */
export function getToleranceMm(toleranceLabel: string | null | undefined): number | null {
  if (!toleranceLabel) return null
  return TOLERANCE_TO_MM[toleranceLabel] ?? null
}

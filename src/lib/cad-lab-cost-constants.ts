/**
 * @file cad-lab-cost-constants.ts — Shared manufacturing cost lookup tables.
 *
 * @description Centralised cost constants for The Forge cost estimation, BOM,
 * raw materials breakdown, and supplier mapping components. Values are
 * approximate, intended for early-stage founder guidance — not binding quotes.
 */

// ─── Material Cost per Kilogram ─────────────────────────────────────

/**
 * Approximate raw material cost per kilogram by material class.
 * Used for raw BOM / value-add analysis.
 */
export const MATERIAL_COST_PER_KG: Record<string, number> = {
  "PLA/PETG": 25,
  "ABS/Nylon": 35,
  "Aluminium": 8,
  "Steel/Iron": 4,
  "Stainless Steel": 12,
  "Copper/Brass": 18,
  "Titanium": 80,
  "Carbon Fiber Composite": 60,
  "CFRP/GFRP": 60,
  "Wood/Plywood": 3,
  "Silicone/Rubber": 15,
  "Glass/Ceramic": 10,
  "PCB/Electronic": 0, // Process-driven, not material-driven
  "Concrete": 0.1,
  "Timber": 0.8,
  "Copper Wire": 22,
  "Glass": 2.5,
  "Zinc": 3.5,
  "Lead": 2.2,
  "Nickel": 16,
  "Other": 20,
}

// ─── Process Cost Tables ────────────────────────────────────────────

/**
 * Approximate hourly rate by manufacturing process.
 * Includes machine time + operator cost estimates.
 */
export const PROCESS_HOURLY_RATE: Record<string, number> = {
  "FDM 3D Print": 15,
  "SLA/Resin Print": 25,
  "SLS/Powder Print": 40,
  "CNC Machining": 85,
  "Sheet Metal": 60,
  "Injection Molding": 0, // Amortized per-unit, handled separately
  "Casting": 45,
  "Manual/Assembly": 40,
  "Other": 50,
}

/**
 * Estimated processing hours per kg by process.
 * Very rough — real values depend on geometry complexity.
 */
export const HOURS_PER_KG: Record<string, number> = {
  "FDM 3D Print": 8,
  "SLA/Resin Print": 6,
  "SLS/Powder Print": 4,
  "CNC Machining": 3,
  "Sheet Metal": 1.5,
  "Injection Molding": 0.02, // Very fast per unit
  "Casting": 2,
  "Manual/Assembly": 5,
  "Other": 3,
}

/**
 * Tooling cost by process. One-time cost amortized over batch.
 */
export const TOOLING_COST: Record<string, number> = {
  "FDM 3D Print": 0,
  "SLA/Resin Print": 0,
  "SLS/Powder Print": 0,
  "CNC Machining": 200,
  "Sheet Metal": 500,
  "Injection Molding": 5000,
  "Casting": 1500,
  "Manual/Assembly": 0,
  "Other": 0,
}

// ─── Supplier Category Mapping ──────────────────────────────────────

/**
 * Static mapping from "process|material" to recommended supplier types.
 * Used for instant supplier recommendations without a DB query.
 *
 * @example
 * const key = `${process}|${material}`
 * const categories = SUPPLIER_CATEGORY_MAP[key] ?? getDefaultSupplierCategory(process)
 */
export const SUPPLIER_CATEGORY_MAP: Record<string, string[]> = {
  "CNC Machining|Aluminium": ["CNC Machine Shop", "Precision Engineering"],
  "CNC Machining|Steel/Iron": ["CNC Machine Shop", "Metal Fabricator"],
  "CNC Machining|Stainless Steel": ["CNC Machine Shop", "Precision Engineering"],
  "CNC Machining|Titanium": ["Aerospace Machine Shop", "Precision Engineering"],
  "CNC Machining|Copper/Brass": ["CNC Machine Shop", "Specialty Metals"],
  "FDM 3D Print|PLA/PETG": ["3D Print Service Bureau", "Rapid Prototyping"],
  "FDM 3D Print|ABS/Nylon": ["3D Print Service Bureau", "Rapid Prototyping"],
  "SLA/Resin Print|PLA/PETG": ["SLA Print Service", "Rapid Prototyping"],
  "SLA/Resin Print|Silicone/Rubber": ["SLA Print Service", "Specialty Prototyping"],
  "SLS/Powder Print|ABS/Nylon": ["SLS Print Service", "Industrial Prototyping"],
  "Sheet Metal|Steel/Iron": ["Sheet Metal Fabricator", "Metal Stamping"],
  "Sheet Metal|Stainless Steel": ["Sheet Metal Fabricator", "Precision Sheet Metal"],
  "Sheet Metal|Aluminium": ["Sheet Metal Fabricator", "Aluminium Specialist"],
  "Injection Molding|ABS/Nylon": ["Injection Molder", "Plastics Manufacturer"],
  "Injection Molding|PLA/PETG": ["Injection Molder", "Plastics Manufacturer"],
  "Injection Molding|Silicone/Rubber": ["Rubber Molder", "Elastomer Specialist"],
  "Casting|Aluminium": ["Die Casting", "Sand Casting Foundry"],
  "Casting|Steel/Iron": ["Investment Casting", "Sand Casting Foundry"],
  "Casting|Copper/Brass": ["Investment Casting", "Brass Foundry"],
  "Manual/Assembly|PCB/Electronic": ["PCB Assembly (PCBA)", "Electronics Manufacturer"],
  "Manual/Assembly|Other": ["Contract Assembler", "Light Manufacturing"],
}

/**
 * Fallback supplier categories when the exact process|material combo isn't mapped.
 */
export const DEFAULT_SUPPLIER_BY_PROCESS: Record<string, string[]> = {
  "FDM 3D Print": ["3D Print Service Bureau"],
  "SLA/Resin Print": ["SLA Print Service"],
  "SLS/Powder Print": ["SLS Print Service"],
  "CNC Machining": ["CNC Machine Shop"],
  "Sheet Metal": ["Sheet Metal Fabricator"],
  "Injection Molding": ["Injection Molder"],
  "Casting": ["Casting Foundry"],
  "Manual/Assembly": ["Contract Assembler"],
  "Other": ["General Manufacturer"],
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Get recommended supplier categories for a given process + material combo.
 *
 * @param process - Manufacturing process from diagnostics
 * @param material - Material class from diagnostics
 * @returns Array of recommended supplier type strings
 */
export function getSupplierCategories(
  process: string | null,
  material: string | null,
): string[] {
  if (!process) return ["General Manufacturer"]

  const key = `${process}|${material || "Other"}`
  return (
    SUPPLIER_CATEGORY_MAP[key] ??
    DEFAULT_SUPPLIER_BY_PROCESS[process] ??
    ["General Manufacturer"]
  )
}

/**
 * Parse batch size from diagnostic answer string.
 *
 * @param batchStr - e.g. "1-10 (prototyping)" or "100-1000 (pilot)"
 * @returns Midpoint of the range
 */
export function parseBatchSize(batchStr: string): number {
  const match = batchStr.match(/(\d+)-(\d+)/)
  if (match) {
    const low = parseInt(match[1], 10)
    const high = parseInt(match[2], 10)
    return Math.round((low + high) / 2)
  }
  const singleMatch = batchStr.match(/(\d+)\+?/)
  if (singleMatch) return parseInt(singleMatch[1], 10)
  return 5
}

/**
 * Get mass in kg from a module's CAD results, with fallback.
 *
 * @param massPropertiesKg - from result.massProperties.massKg
 * @param massGrams - from result.massGrams
 * @param fallbackKg - fallback if no data (default 0.2)
 * @returns Object with massKg and whether it's an estimate
 */
export function getModuleMassKg(
  massPropertiesKg: number | undefined | null,
  massGrams: number | undefined | null,
  fallbackKg = 0.2,
): { massKg: number; isEstimated: boolean } {
  if (massPropertiesKg && massPropertiesKg > 0) {
    return { massKg: massPropertiesKg, isEstimated: false }
  }
  if (massGrams && massGrams > 0) {
    return { massKg: massGrams / 1000, isEstimated: false }
  }
  return { massKg: fallbackKg, isEstimated: true }
}

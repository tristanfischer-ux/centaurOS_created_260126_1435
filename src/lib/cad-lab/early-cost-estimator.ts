/**
 * @file early-cost-estimator.ts — Pre-generation cost estimation from interface definitions.
 *
 * @description Parses the Component Placement Table from interface definitions to
 * extract materials and dimensions, then estimates volume → mass → cost using the
 * existing engineering data and cost constants. Runs after the interface definition
 * step (Build stage) to give users early cost signals before expensive CAD generation.
 *
 * FLOW: Interface definition text → parseComponentPlacementTable() → components[]
 *       → estimateModuleCost() → EarlyCostEstimate
 *
 * @related
 * - Cost constants: src/lib/cad-lab-cost-constants.ts
 * - Materials DB: src/lib/engineering-data/materials.ts
 * - Process costs: src/lib/engineering-data/processes.ts
 */

import { MATERIALS } from "@/lib/engineering-data/materials"
import {
  MATERIAL_COST_PER_KG,
  HOURS_PER_KG,
  PROCESS_HOURLY_RATE,
} from "@/lib/cad-lab-cost-constants"
import type { ParsedComponent, EarlyCostEstimate } from "@/lib/cad-lab-types"

// ─── Constants ──────────────────────────────────────────────────────

/** Fill factor: fraction of bounding box volume occupied by solid material.
 *  0.3 is conservative for typical engineered parts (housings, brackets, frames). */
const DEFAULT_FILL_FACTOR = 0.3

/** Default density (kg/m³) when material is not resolved — PLA baseline */
const DEFAULT_DENSITY_KG_M3 = 1240

/** Default process for cost estimation when none specified */
const DEFAULT_PROCESS = "FDM 3D Print"

/** Cost range multiplier: ±30% to reflect early estimation uncertainty */
const RANGE_FACTOR = 0.3

// ─── Material Resolution ────────────────────────────────────────────

/** Maps fuzzy material names from interface definitions to engineering DB IDs */
const MATERIAL_FUZZY_MAP: Record<string, string> = {
  aluminum: "al-6061-t6",
  aluminium: "al-6061-t6",
  "al 6061": "al-6061-t6",
  "6061": "al-6061-t6",
  "7075": "al-7075-t6",
  steel: "steel-1018",
  "mild steel": "steel-1018",
  "stainless steel": "ss-304",
  stainless: "ss-304",
  "ss 304": "ss-304",
  "ss 316": "ss-316",
  titanium: "ti-6al-4v",
  copper: "cu-c110",
  brass: "brass-c360",
  pla: "pla",
  abs: "abs",
  petg: "petg",
  nylon: "nylon-pa6",
  "pa6": "nylon-pa6",
  "pa12": "nylon-pa12",
  polycarbonate: "pc",
  peek: "peek",
  delrin: "delrin-pom",
  acetal: "delrin-pom",
  "carbon fiber": "cf-woven-3k",
  "carbon fibre": "cf-woven-3k",
  cfrp: "cf-unidirectional",
  fiberglass: "fiberglass-e-glass",
  resin: "resin-standard",
  tpu: "tpu-95a",
  rubber: "tpu-95a",
  silicone: "tpu-95a",
}

const materialIndex = new Map(MATERIALS.map((m) => [m.id, m]))

/**
 * Resolves a fuzzy material name to an engineering DB material entry.
 *
 * @param materialName - Raw material string from interface definition
 * @returns Material entry or null if unresolvable
 */
function resolveMaterial(materialName: string | null): { id: string; name: string; density: number; costPerKg: { low: number; high: number } } | null {
  if (!materialName) return null

  const lower = materialName.toLowerCase().trim()

  // Direct ID match
  const direct = materialIndex.get(lower)
  if (direct) return { id: direct.id, name: direct.name, density: direct.density_kg_m3, costPerKg: direct.cost_per_kg_usd }

  // Fuzzy map
  for (const [key, id] of Object.entries(MATERIAL_FUZZY_MAP)) {
    if (lower.includes(key)) {
      const mat = materialIndex.get(id)
      if (mat) return { id: mat.id, name: mat.name, density: mat.density_kg_m3, costPerKg: mat.cost_per_kg_usd }
    }
  }

  // Try substring match against material names
  for (const mat of MATERIALS) {
    if (mat.name.toLowerCase().includes(lower) || lower.includes(mat.name.toLowerCase())) {
      return { id: mat.id, name: mat.name, density: mat.density_kg_m3, costPerKg: mat.cost_per_kg_usd }
    }
  }

  return null
}

// ─── Table Parsing ──────────────────────────────────────────────────

/**
 * Parses the Component Placement Table from an interface definition.
 *
 * @description Extracts component names, quantities, dimensions, and materials
 * from the Section B table rows. Handles dimension formats like "200×150×50",
 * "200x150x50", "200 x 150 x 50".
 *
 * @param interfaceDefinition - Full interface definition text
 * @returns Array of parsed components, empty if table not found
 */
export function parseComponentPlacementTable(
  interfaceDefinition: string,
): ParsedComponent[] {
  const components: ParsedComponent[] = []

  // Extract section B table
  const tableMatch = interfaceDefinition.match(
    /===\s*b\)\s*COMPONENT\s*PLACEMENT\s*TABLE\s*===\s*([\s\S]*?)(?:===\s*c\)|$)/i,
  )
  if (!tableMatch) return components

  const tableText = tableMatch[1]
  const lines = tableText.split("\n")

  // Detect column positions from the header row
  // Typical format: | Component | Qty | Dimensions | Position | Notes/Material |
  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty, separator, or header rows
    if (!trimmed.startsWith("|")) continue
    if (/^\|\s*[-=]+/.test(trimmed)) continue

    // Split into cells
    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0)

    if (cells.length < 2) continue

    const name = cells[0]

    // Skip header
    if (name.toLowerCase() === "component" || name.toLowerCase() === "name") continue
    if (name.startsWith("-") || name.startsWith("=")) continue

    // Parse quantity (default 1)
    let quantity = 1
    if (cells.length > 1) {
      const qtyMatch = cells[1].match(/(\d+)/)
      if (qtyMatch) quantity = parseInt(qtyMatch[1], 10)
    }

    // Parse dimensions from any cell — look for NxNxN or N×N×N patterns
    let dimensions: [number, number, number] | null = null
    for (const cell of cells.slice(1)) {
      const dimMatch = cell.match(
        /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i,
      )
      if (dimMatch) {
        dimensions = [
          parseFloat(dimMatch[1]),
          parseFloat(dimMatch[2]),
          parseFloat(dimMatch[3]),
        ]
        break
      }
    }

    // Parse material from any cell — look for common material keywords
    let material: string | null = null
    const materialKeywords = [
      "aluminum", "aluminium", "steel", "stainless", "titanium", "copper",
      "brass", "pla", "abs", "petg", "nylon", "polycarbonate", "peek",
      "delrin", "acetal", "carbon fiber", "carbon fibre", "cfrp", "resin",
      "tpu", "rubber", "silicone", "wood", "glass", "ceramic", "iron",
      "al-", "ss-", "6061", "7075", "304", "316",
    ]
    for (const cell of cells.slice(1)) {
      const lower = cell.toLowerCase()
      for (const kw of materialKeywords) {
        if (lower.includes(kw)) {
          material = cell.trim()
          break
        }
      }
      if (material) break
    }

    components.push({ name, quantity, dimensions, material })
  }

  return components
}

// ─── Cost Estimation ────────────────────────────────────────────────

/**
 * Estimates cost for a single module from parsed components.
 *
 * @description For each component: computes bounding box volume × fill factor → mass
 * via material density → material cost from cost DB + process cost from hourly rates.
 * Applies ±30% range for early estimation uncertainty.
 *
 * @param moduleId - Module identifier
 * @param moduleName - Human-readable module name
 * @param components - Parsed components from interface definition
 * @param processHint - Optional manufacturing process hint (defaults to FDM)
 * @returns Cost estimate or null if no usable component data
 */
export function estimateModuleCost(
  moduleId: string,
  moduleName: string,
  components: ParsedComponent[],
  processHint?: string,
): EarlyCostEstimate | null {
  if (components.length === 0) return null

  // Filter to components with dimensions (can't estimate without them)
  const usableComponents = components.filter((c) => c.dimensions !== null)
  if (usableComponents.length === 0) return null

  let totalVolumeMm3 = 0
  let totalMassKg = 0
  let totalMaterialCostLow = 0
  let totalMaterialCostHigh = 0
  let primaryMaterial = "Unknown"
  let largestVolume = 0

  for (const comp of usableComponents) {
    const [x, y, z] = comp.dimensions!
    const bboxVolumeMm3 = x * y * z
    const solidVolumeMm3 = bboxVolumeMm3 * DEFAULT_FILL_FACTOR
    const compVolume = solidVolumeMm3 * comp.quantity

    // Resolve material
    const resolved = resolveMaterial(comp.material)
    const density = resolved?.density ?? DEFAULT_DENSITY_KG_M3
    const costPerKgLow = resolved?.costPerKg.low ?? 20
    const costPerKgHigh = resolved?.costPerKg.high ?? 40

    // Volume in mm³ → m³ for density calc: 1 m³ = 1e9 mm³
    const massKg = (compVolume / 1e9) * density

    totalVolumeMm3 += compVolume
    totalMassKg += massKg
    totalMaterialCostLow += massKg * costPerKgLow
    totalMaterialCostHigh += massKg * costPerKgHigh

    // Track primary material (from largest volume component)
    if (bboxVolumeMm3 > largestVolume) {
      largestVolume = bboxVolumeMm3
      primaryMaterial = resolved?.name ?? comp.material ?? "Unknown"
    }
  }

  // Process cost from hourly rate tables
  const process = processHint ?? DEFAULT_PROCESS
  const hoursPerKg = HOURS_PER_KG[process] ?? HOURS_PER_KG[DEFAULT_PROCESS] ?? 3
  const hourlyRate = PROCESS_HOURLY_RATE[process] ?? PROCESS_HOURLY_RATE[DEFAULT_PROCESS] ?? 50
  const processCost = totalMassKg * hoursPerKg * hourlyRate

  // MATERIAL_COST_PER_KG from cost constants (diagnostic-level, coarser than engineering DB)
  // We use the engineering DB costs above for better accuracy

  const baseTotalLow = totalMaterialCostLow + processCost
  const baseTotalHigh = totalMaterialCostHigh + processCost

  return {
    moduleId,
    moduleName,
    material: primaryMaterial,
    estimatedMassKg: Math.round(totalMassKg * 1000) / 1000,
    estimatedVolumeMm3: Math.round(totalVolumeMm3),
    materialCostLow: Math.round(totalMaterialCostLow * 100) / 100,
    materialCostHigh: Math.round(totalMaterialCostHigh * 100) / 100,
    totalLow: Math.round(baseTotalLow * (1 - RANGE_FACTOR) * 100) / 100,
    totalHigh: Math.round(baseTotalHigh * (1 + RANGE_FACTOR) * 100) / 100,
    currency: "USD",
    confidence: "rough",
    componentCount: usableComponents.length,
  }
}

// ─── Main Entry Point ───────────────────────────────────────────────

/**
 * Estimates early cost from a module's interface definition.
 *
 * @description Main entry point — parses the interface definition's Component
 * Placement Table, then runs cost estimation. Returns null on parse failure
 * (non-blocking — callers should gracefully handle absence of cost data).
 *
 * @param moduleId - Module identifier
 * @param moduleName - Human-readable module name
 * @param interfaceDefinition - Full interface definition text
 * @param processHint - Optional manufacturing process hint
 * @returns Cost estimate or null
 */
export function estimateEarlyCost(
  moduleId: string,
  moduleName: string,
  interfaceDefinition: string,
  processHint?: string,
): EarlyCostEstimate | null {
  try {
    const components = parseComponentPlacementTable(interfaceDefinition)
    if (components.length === 0) return null
    return estimateModuleCost(moduleId, moduleName, components, processHint)
  } catch {
    // INTENT: Non-blocking — return null on any parse failure
    return null
  }
}

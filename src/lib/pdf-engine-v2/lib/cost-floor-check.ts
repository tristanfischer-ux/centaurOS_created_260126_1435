// INTENT: Deterministic post-BOM cost-floor sanity check for capital-class parts.
// The engine sometimes reports implausibly low unit costs for heavy or
// process-intensive components (e.g. £18 for a shipping container).
// This module flags those parts so the PDF can surface a warning or
// the pipeline can trigger a re-prompt.

export interface CostFloorFlag {
  partName: string
  estimatedCost: number
  reason: string
  suggestedMin: number
}

interface PartCandidate {
  name: string
  estimatedUnitCostGbp?: number
  massKg?: number
  process?: string
}

// Rule thresholds — deterministic, no LLM calls.
const HEAVY_MASS_KG = 10
const HEAVY_COST_FLOOR_GBP = 50

const VERY_HEAVY_MASS_KG = 100
const VERY_HEAVY_COST_FLOOR_GBP = 200

const CNC_COST_FLOOR_GBP = 5
const INJECTION_COST_FLOOR_GBP = 2

/**
 * Inspect a list of BOM parts and flag any with implausibly low unit costs
 * given their mass or manufacturing process.
 *
 * Rules:
 *  1. massKg > 10  and cost < £50  → heavy-part flag
 *  2. massKg > 100 and cost < £200 → very-heavy-part flag
 *  3. process contains "CNC"        and cost < £5  → CNC floor flag
 *  4. process contains "injection"  and cost < £2  → injection-moulding floor flag
 *
 * Returns an empty array when all costs are plausible.
 */
export function checkCostFloors(parts: PartCandidate[]): CostFloorFlag[] {
  const flags: CostFloorFlag[] = []

  for (const part of parts) {
    const cost = part.estimatedUnitCostGbp
    // Skip parts with no cost estimate — nothing to check.
    if (cost === undefined || cost === null) continue

    const mass = part.massKg
    const processLower = (part.process ?? '').toLowerCase()

    // Rule 1 & 2: mass-based checks (Rule 2 is stricter, check it first)
    if (mass !== undefined && mass !== null) {
      if (mass > VERY_HEAVY_MASS_KG && cost < VERY_HEAVY_COST_FLOOR_GBP) {
        flags.push({
          partName: part.name,
          estimatedCost: cost,
          reason: `Very heavy part (${mass}kg) with suspiciously low cost £${cost}`,
          suggestedMin: VERY_HEAVY_COST_FLOOR_GBP,
        })
        // Rule 2 subsumes Rule 1 — skip to next part.
        continue
      }
      if (mass > HEAVY_MASS_KG && cost < HEAVY_COST_FLOOR_GBP) {
        flags.push({
          partName: part.name,
          estimatedCost: cost,
          reason: `Heavy part (${mass}kg) with implausibly low cost £${cost}`,
          suggestedMin: HEAVY_COST_FLOOR_GBP,
        })
      }
    }

    // Rule 3: CNC floor
    if (processLower.includes('cnc') && cost < CNC_COST_FLOOR_GBP) {
      flags.push({
        partName: part.name,
        estimatedCost: cost,
        reason: `CNC-machined part below minimum viable cost`,
        suggestedMin: CNC_COST_FLOOR_GBP,
      })
    }

    // Rule 4: injection-moulding floor
    if (processLower.includes('injection') && cost < INJECTION_COST_FLOOR_GBP) {
      flags.push({
        partName: part.name,
        estimatedCost: cost,
        reason: `Injection-moulded part below tooling amortisation`,
        suggestedMin: INJECTION_COST_FLOOR_GBP,
      })
    }
  }

  return flags
}

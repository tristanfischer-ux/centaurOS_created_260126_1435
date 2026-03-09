/**
 * @file assembly-capability-map.ts — Maps product categories to required assembly specialties
 * and scores assembly companies by specialty coverage.
 *
 * @description Pure functions, zero deps. Used by assembly-match.ts to replace the flat 25pt
 * capability score with specialty-weighted scoring.
 *
 * Two functions:
 * - inferRequiredSpecialties(categories) — derives what assembly specialties a product needs
 * - specialtyCoverageScore(companySpecialties, requiredSpecialties) — scores how well a company covers them
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface CategoryInput {
  id: string
  process: string
  material: string
  type: "buy" | "make"
  parts: { name: string; moduleId: string }[]
}

export interface CoverageResult {
  score: number           // 0–1
  matched: string[]
  missing: string[]
}

// ─── Constants ───────────────────────────────────────────────────────

// INTENT: Core specialties get 2x weight because they differentiate assembly companies.
// Table-stakes specialties (contract_assembly, test_and_inspection) are expected of everyone.
const CORE_SPECIALTIES = new Set([
  "electromechanical",
  "pcba_assembly",
  "system_integration",
  "cable_harness",
  "box_build",
])

// ─── Specialty Canonicalization ───────────────────────────────────────
// GOTCHA: The DB stores specialties as natural-language phrases from LLM enrichment
// (e.g. "CNC machining", "PCB assembly", "mechanical assembly") but our required
// specialty slugs are snake_case (e.g. "mechanical_assembly", "pcba_assembly").
// We must canonicalize company specialties to match against required slugs.

/** Normalize a raw specialty string: lowercase, trim, spaces/hyphens → underscores */
function normalizeRaw(s: string): string {
  return s.toLowerCase().trim().replace(/[\s-]+/g, "_")
}

/** Pattern-map a normalized specialty phrase to a canonical slug */
function mapToCanonicalSlug(normalized: string): string | null {
  if (/mechanical_assembly|mechanical/.test(normalized) && /assembl/.test(normalized)) return "mechanical_assembly"
  if (/cnc|machining|sheet_metal|casting|grinding|welding|3d_print|extrusion/.test(normalized)) return "mechanical_assembly"
  if (/pcba|pcb_assembly|circuit_board_assembly/.test(normalized)) return "pcba_assembly"
  if (/pcb|circuit|electronic/.test(normalized) && /assembl|manufactur|integrat/.test(normalized)) return "pcba_assembly"
  if (/cable_harness|cable_assembly|harness|wiring_assembly/.test(normalized)) return "cable_harness"
  if (/electromechanical/.test(normalized)) return "electromechanical"
  if (/system_integrat/.test(normalized)) return "system_integration"
  if (/box_build/.test(normalized)) return "box_build"
  if (/contract_assembly|contract_manufactur/.test(normalized)) return "contract_assembly"
  if (/test|inspect|quality|qc/.test(normalized)) return "test_and_inspection"
  if (/kit|fulfil|fulfi/.test(normalized)) return "kitting_and_fulfilment"
  return null
}

/**
 * Converts an array of raw DB specialty strings to a Set of canonical slugs.
 * Handles both snake_case slugs and natural-language phrases.
 */
export function canonicalizeSpecialties(rawSpecialties: string[]): Set<string> {
  const result = new Set<string>()
  for (const raw of rawSpecialties) {
    const normalized = normalizeRaw(raw)
    result.add(normalized)
    const mapped = mapToCanonicalSlug(normalized)
    if (mapped) result.add(mapped)
  }
  return result
}

const ELECTRONIC_BUY_KEYWORDS = [
  "motor", "sensor", "pcb", "arduino", "battery", "encoder", "driver",
  "microcontroller", "mcu", "raspberry", "servo", "stepper", "actuator",
  "capacitor", "resistor", "transistor", "diode", "relay", "solenoid",
]

// ─── inferRequiredSpecialties ────────────────────────────────────────

/**
 * Maps Sankey categories to the set of assembly specialties the product requires.
 *
 * @param categories - CategoryInput[] from buildSankeyData
 * @returns Set of required specialty slugs
 */
export function inferRequiredSpecialties(categories: CategoryInput[]): string[] {
  const required = new Set<string>()
  let hasMechanical = false
  let hasElectronic = false
  let makeCount = 0
  let totalParts = 0

  for (const cat of categories) {
    const proc = cat.process.toLowerCase()
    totalParts += cat.parts.length

    if (cat.type === "make") {
      makeCount++

      // Mechanical processes
      if (/cnc|machining|sheet_metal|casting|grinding|welding|3d_print|extrusion|manual/.test(proc)) {
        required.add("mechanical_assembly")
        hasMechanical = true
      }

      // Electronic processes
      if (/pcb|circuit|electronic|pcba/.test(proc)) {
        required.add("pcba_assembly")
        hasElectronic = true
      }

      // Cable/harness
      if (/cable|harness|wiring/.test(proc)) {
        required.add("cable_harness")
        hasElectronic = true
      }
    }

    // INTENT: Buy categories are NOT auto-mapped to electronics.
    // Check part names for electronic keywords instead.
    if (cat.type === "buy") {
      for (const part of cat.parts) {
        const partLower = part.name.toLowerCase()
        if (ELECTRONIC_BUY_KEYWORDS.some((kw) => partLower.includes(kw))) {
          hasElectronic = true
          break
        }
      }
    }
  }

  // Both electronic + mechanical → electromechanical
  if (hasElectronic && hasMechanical) {
    required.add("electromechanical")
  }

  // Complex products → system integration + box build
  if (makeCount >= 4 || totalParts >= 20) {
    required.add("system_integration")
    required.add("box_build")
  }

  // Always expect test & inspection
  required.add("test_and_inspection")

  return [...required]
}

// ─── specialtyCoverageScore ──────────────────────────────────────────

/**
 * Scores how well a company's specialties cover the product's requirements.
 *
 * @param companySpecialties - string[] from marketplace_listings.specialties
 * @param requiredSpecialties - string[] from inferRequiredSpecialties()
 * @returns { score: 0-1, matched[], missing[] }
 */
export function specialtyCoverageScore(
  companySpecialties: string[],
  requiredSpecialties: string[],
): CoverageResult {
  if (requiredSpecialties.length === 0) {
    return { score: 1, matched: [], missing: [] }
  }

  // INTENT: Canonicalize company specialties to handle both natural-language
  // phrases ("PCB assembly") and snake_case slugs ("pcba_assembly") from DB
  const companySet = canonicalizeSpecialties(companySpecialties)
  const matched: string[] = []
  const missing: string[] = []
  let weightedHits = 0
  let weightedTotal = 0

  for (const req of requiredSpecialties) {
    const weight = CORE_SPECIALTIES.has(req) ? 2 : 1
    weightedTotal += weight

    if (companySet.has(req)) {
      matched.push(req)
      weightedHits += weight
    } else {
      missing.push(req)
    }
  }

  return {
    score: weightedTotal > 0 ? weightedHits / weightedTotal : 1,
    matched,
    missing,
  }
}

/**
 * @file assembly-utils.ts — Shared types, constants, and defaults for the Assemble stage.
 *
 * @description Provides interfaces for assembly company matching, branding specs,
 * shipping config, and tier-based assembly assignment. Consumed by the Assemble
 * page and all assembly sub-components.
 */

// ─── Assembly Company Match ─────────────────────────────────────────

export interface AssemblyScoreBreakdown {
  semantic: number    // 30pts max
  capability: number  // 25pts max
  capacity: number    // 15pts max
  quality: number     // 15pts max
  keyword: number     // 15pts max
}

export interface AssemblyCompanyMatch {
  id: string
  name: string
  matchScore: number
  scoreBreakdown: AssemblyScoreBreakdown
  matchReasons: string[]
  isVerified: boolean
  capabilities: ("assemble" | "kit_and_ship")[]
  typicalLeadDays: number | null
  locationCountry: string | null
  certifications: string[]
  websiteUrl: string | null
  specialties: string[]            // raw specialties from DB
  matchedSpecialties: string[]     // which required specialties this company covers
  missingSpecialties: string[]     // which required specialties this company is missing
}

// ─── Assembly Tier Config ───────────────────────────────────────────

/** Each assembler node in the convergence diagram has a tier level + assigned categories */
export interface AssemblyTierNode {
  assemblerId: string
  assemblerName: string
  tierLevel: 1 | 2     // 1 = sub-assembly, 2 = final assembly
  assignedCategories: string[]  // category IDs routed to this assembler
}

/** Serializable tier config — Map<assemblerId, AssemblyTierNode> stored as entries array */
export type AssemblyTierConfig = [string, AssemblyTierNode][]

// ─── Branding Specification ─────────────────────────────────────────

export interface BrandingSpec {
  logoUrl: string | null
  colorPalette: string[]
  packagingType: "box" | "mailer" | "clamshell" | "blister" | "custom"
  boxArtworkUrl: string | null
  includeInstructionCard: boolean
  instructionCardNotes: string
  includeWarrantyCard: boolean
  customInserts: string[]
  unboxingNotes: string
  regulatoryLabels: string[]
}

// ─── Shipping Configuration ─────────────────────────────────────────

export interface ShippingAddress {
  name: string
  line1: string
  line2: string
  city: string
  postcode: string
  country: string
}

export interface ShippingConfig {
  fulfilmentModel: "drop_ship" | "warehouse" | "direct_3pl"
  shippingAddress: ShippingAddress | null
  selectedShipperId: string | null
  estimatedShippingCost: number | null
}

// ─── Constants ──────────────────────────────────────────────────────

export const ASSEMBLY_KEYWORDS = [
  "assembly", "contract manufacturing", "fulfillment", "fulfilment",
  "drop-ship", "dropship", "kitting", "box build", "system integration",
  "final assembly", "pcba", "turnkey", "sub-assembly", "pack and ship",
] as const

export const DEFAULT_BRANDING: BrandingSpec = {
  logoUrl: null,
  colorPalette: [],
  packagingType: "box",
  boxArtworkUrl: null,
  includeInstructionCard: false,
  instructionCardNotes: "",
  includeWarrantyCard: false,
  customInserts: [],
  unboxingNotes: "",
  regulatoryLabels: [],
}

export const DEFAULT_SHIPPING: ShippingConfig = {
  fulfilmentModel: "drop_ship",
  shippingAddress: null,
  selectedShipperId: null,
  estimatedShippingCost: null,
}

// ─── Packaging type labels ──────────────────────────────────────────

export const PACKAGING_OPTIONS = [
  { id: "box" as const, label: "Corrugated Box", desc: "Standard shipping box — most common for manufactured products" },
  { id: "mailer" as const, label: "Poly Mailer", desc: "Lightweight envelope — ideal for flat or soft products" },
  { id: "clamshell" as const, label: "Clamshell", desc: "Clear plastic shell — retail display packaging" },
  { id: "blister" as const, label: "Blister Pack", desc: "Card-backed blister — small electronics and accessories" },
  { id: "custom" as const, label: "Custom", desc: "Bespoke packaging — specify requirements below" },
] as const

// ─── Fulfilment model labels ────────────────────────────────────────

export const FULFILMENT_OPTIONS = [
  {
    id: "drop_ship" as const,
    label: "Drop-ship from assembler",
    desc: "Assembler packs and ships directly to your customer. Lowest handling cost, fastest.",
  },
  {
    id: "warehouse" as const,
    label: "Ship to warehouse",
    desc: "Parts ship to your facility for final QC, then you ship to customer. More control.",
  },
  {
    id: "direct_3pl" as const,
    label: "3PL fulfilment",
    desc: "Third-party logistics receives, stores, picks, packs, ships. Best for scale.",
  },
] as const

// ─── Order tracking steps ───────────────────────────────────────────

export const ORDER_TRACKING_STEPS = [
  "awaiting_parts",
  "parts_received",
  "in_assembly",
  "qc_check",
  "packed",
  "shipped",
  "delivered",
] as const

export type OrderTrackingStep = typeof ORDER_TRACKING_STEPS[number]

// ─── Multi-assembler recommendation ─────────────────────────────────

/** Maps a category process name to its dominant required specialty */
function categoryToSpecialty(process: string): string | null {
  const p = process.toLowerCase()
  if (/pcb|circuit|electronic|pcba/.test(p)) return "pcba_assembly"
  if (/cable|harness|wiring/.test(p)) return "cable_harness"
  if (/cnc|machining|sheet_metal|casting|grinding|welding|3d_print|extrusion|manual/.test(p)) return "mechanical_assembly"
  return null
}

/**
 * Recommends a single or multi-assembler tier config based on specialty coverage.
 *
 * @param matches - Scored assembly companies (sorted by score desc)
 * @param categories - Sankey categories with process/id
 * @param requiredSpecialties - From inferRequiredSpecialties()
 * @returns AssemblyTierNode[] — Tier 2 = final assembler, Tier 1 = sub-assemblers
 */
export function recommendAssemblerConfig(
  matches: AssemblyCompanyMatch[],
  categories: { id: string; process: string }[],
): AssemblyTierNode[] {
  if (matches.length === 0 || categories.length === 0) return []

  const top = matches[0]

  // INTENT: Simple products or fully-covered → single Tier 2 (existing behavior)
  // GOTCHA: Defensive ?? [] guards against stale localStorage objects missing these fields
  if ((top.missingSpecialties ?? []).length === 0 || categories.length <= 2) {
    return [{
      assemblerId: top.id,
      assemblerName: top.name,
      tierLevel: 2,
      assignedCategories: categories.map((c) => c.id),
    }]
  }

  // Pick best "final assembler": highest score among companies with system_integration or box_build
  const finalAssembler = matches.find((m) =>
    (m.matchedSpecialties ?? []).includes("system_integration") || (m.matchedSpecialties ?? []).includes("box_build"),
  ) ?? top

  const finalSpecSet = new Set(finalAssembler.matchedSpecialties ?? [])
  const uncoveredCategories: { id: string; specialty: string }[] = []
  const finalCategories: string[] = []

  for (const cat of categories) {
    const specialty = categoryToSpecialty(cat.process)
    if (!specialty || finalSpecSet.has(specialty)) {
      finalCategories.push(cat.id)
    } else {
      uncoveredCategories.push({ id: cat.id, specialty })
    }
  }

  const nodes: AssemblyTierNode[] = []

  // Greedily assign sub-assemblers for uncovered category specialties
  const subAssigned = new Map<string, string[]>() // assemblerId → categoryIds
  for (const { id: catId, specialty } of uncoveredCategories) {
    const sub = matches.find((m) =>
      m.id !== finalAssembler.id && (m.matchedSpecialties ?? []).includes(specialty),
    )
    if (sub) {
      const existing = subAssigned.get(sub.id) ?? []
      existing.push(catId)
      subAssigned.set(sub.id, existing)
    } else {
      // No sub-assembler covers this — assign to final assembler
      finalCategories.push(catId)
    }
  }

  // Build Tier 1 nodes (sub-assemblers)
  for (const [subId, catIds] of subAssigned) {
    const subMatch = matches.find((m) => m.id === subId)!
    nodes.push({
      assemblerId: subId,
      assemblerName: subMatch.name,
      tierLevel: 1,
      assignedCategories: catIds,
    })
  }

  // Final assembler as Tier 2
  nodes.push({
    assemblerId: finalAssembler.id,
    assemblerName: finalAssembler.name,
    tierLevel: 2,
    assignedCategories: finalCategories,
  })

  return nodes
}

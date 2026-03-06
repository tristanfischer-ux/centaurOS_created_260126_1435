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

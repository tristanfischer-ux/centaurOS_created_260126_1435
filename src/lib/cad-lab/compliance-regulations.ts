/**
 * @file compliance-regulations.ts — Canonical regulation set for hardware launches.
 *
 * @description Founders launching physical products need to know what regulations
 * apply where they ship to, and prove supplier compliance for each. This file
 * defines the regulation catalogue + the state shape the Compliance Packet UI
 * reads/writes.
 *
 * Regulations are grouped by jurisdiction. Each regulation has a machine id,
 * a human label, a short description, and a pointer to the authoritative doc.
 *
 * @related
 * - Consumer: src/components/cad/compliance-packet.tsx
 * - Launch readiness scorer: src/lib/cad-lab/launch-readiness.ts
 */

export type RegulationStatus = "not_started" | "required" | "attested" | "certified" | "not_applicable"

export interface Regulation {
  id: string
  /** Short human label — e.g., "CE" or "FCC Part 15" */
  label: string
  /** One-line description */
  description: string
  /** Jurisdiction or region */
  jurisdiction: "EU" | "UK" | "US" | "Global" | "APAC"
  /** Authoritative reference URL */
  referenceUrl: string
  /** Whether this regulation usually applies to all hardware, or only specific kinds */
  applicability: "general" | "electronics" | "medical" | "food" | "childrens" | "wireless"
}

/**
 * Canonical catalogue. Founders can also add bespoke regulations (e.g.,
 * FDA 510(k), ISO 13485, ITAR) via the UI — those live on the packet state,
 * not here.
 */
export const CANONICAL_REGULATIONS: Regulation[] = [
  // ── EU ──
  {
    id: "ce",
    label: "CE Marking",
    description: "Mandatory conformity mark for EU-bound products in regulated sectors.",
    jurisdiction: "EU",
    referenceUrl: "https://ec.europa.eu/growth/single-market/ce-marking_en",
    applicability: "general",
  },
  {
    id: "rohs",
    label: "RoHS",
    description: "Restriction of hazardous substances in electrical equipment (lead, cadmium, mercury, etc.).",
    jurisdiction: "EU",
    referenceUrl: "https://ec.europa.eu/environment/topics/waste-and-recycling/rohs-directive_en",
    applicability: "electronics",
  },
  {
    id: "reach",
    label: "REACH",
    description: "Registration, Evaluation, Authorisation and Restriction of Chemicals. Affects any product using chemicals or polymers.",
    jurisdiction: "EU",
    referenceUrl: "https://echa.europa.eu/regulations/reach/understanding-reach",
    applicability: "general",
  },
  {
    id: "weee",
    label: "WEEE",
    description: "Waste Electrical and Electronic Equipment directive — requires disposal plan & labelling.",
    jurisdiction: "EU",
    referenceUrl: "https://ec.europa.eu/environment/topics/waste-and-recycling/waste-electrical-and-electronic-equipment-weee_en",
    applicability: "electronics",
  },
  {
    id: "red",
    label: "RED (Radio Equipment Directive)",
    description: "Required for any product with a radio (Wi-Fi, Bluetooth, LTE) sold in the EU.",
    jurisdiction: "EU",
    referenceUrl: "https://ec.europa.eu/growth/sectors/electrical-and-electronic-engineering-industries-eei/radio-equipment-directive-red_en",
    applicability: "wireless",
  },
  // ── UK ──
  {
    id: "ukca",
    label: "UKCA",
    description: "Post-Brexit equivalent to CE for the UK market.",
    jurisdiction: "UK",
    referenceUrl: "https://www.gov.uk/guidance/using-the-ukca-marking",
    applicability: "general",
  },
  // ── US ──
  {
    id: "fcc_part15",
    label: "FCC Part 15",
    description: "US radio frequency emissions compliance — required for any product with digital electronics sold in the US.",
    jurisdiction: "US",
    referenceUrl: "https://www.fcc.gov/general/part-15",
    applicability: "electronics",
  },
  {
    id: "ul",
    label: "UL Certification",
    description: "Voluntary but commonly required safety certification for US market (retailers often require).",
    jurisdiction: "US",
    referenceUrl: "https://www.ul.com/resources/ul-product-certification",
    applicability: "electronics",
  },
  {
    id: "prop65",
    label: "California Prop 65",
    description: "California labelling requirement for products containing listed chemicals.",
    jurisdiction: "US",
    referenceUrl: "https://www.p65warnings.ca.gov/",
    applicability: "general",
  },
  // ── Global ──
  {
    id: "iso9001",
    label: "ISO 9001",
    description: "Quality management system. Not legally required, but most serious buyers expect it.",
    jurisdiction: "Global",
    referenceUrl: "https://www.iso.org/iso-9001-quality-management.html",
    applicability: "general",
  },
]

// ─── Compliance packet state (persisted per project) ────────────────

export interface PacketRegulationEntry {
  /** Regulation id — either a canonical id or a custom slug */
  id: string
  /** Human label (for custom regs that aren't in the catalogue) */
  label: string
  /** Is this regulation marked applicable to the product? */
  applicable: boolean
  status: RegulationStatus
  /** Which suppliers have attested compliance (supplier ids) */
  attestingSuppliers: string[]
  /** Free-text notes */
  notes?: string
}

export interface CompliancePacketState {
  /** Target markets — used by Launch Readiness to know what to score */
  targetMarkets: Array<"EU" | "UK" | "US" | "Global" | "APAC">
  regulations: PacketRegulationEntry[]
  /** Last-edited timestamp ISO */
  updatedAt?: string
}

export function emptyCompliancePacket(): CompliancePacketState {
  return { targetMarkets: [], regulations: [], updatedAt: undefined }
}

/**
 * Produce a starter packet for a set of target markets — pre-selects the
 * canonical regulations that apply, all unmarked (applicable=false) so the
 * founder explicitly acknowledges each one.
 */
export function starterPacketForMarkets(
  markets: Array<"EU" | "UK" | "US" | "Global" | "APAC">,
): CompliancePacketState {
  const regulations: PacketRegulationEntry[] = []
  for (const reg of CANONICAL_REGULATIONS) {
    if (!markets.includes(reg.jurisdiction)) continue
    regulations.push({
      id: reg.id,
      label: reg.label,
      applicable: false,
      status: "not_started",
      attestingSuppliers: [],
    })
  }
  return { targetMarkets: markets, regulations, updatedAt: new Date().toISOString() }
}

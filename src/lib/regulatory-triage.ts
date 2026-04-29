/**
 * @file regulatory-triage.ts — Post-Chase regulatory status differentiation.
 *
 * @description Council item 2 (Loop 27, 2026-04-29): Chase extracts a compliance
 * matrix but always emits "not-started" for every standard. A containerised
 * battery storage system and a bird feeder were indistinguishable. This module
 * runs AFTER Chase extraction and optionally AFTER Fang module reviews to
 * produce a differentiated matrix.
 *
 * Status taxonomy:
 *   "not-applicable"            — standard clearly does not apply to this product
 *   "in-scope-not-started"      — standard applies, no design work recorded yet
 *   "design-impact-identified"  — a Fang finding or applicability text links a
 *                                  concrete design decision to this standard
 *   "evidence-captured"         — downstream manual state, never auto-assigned here
 *
 * The triage is deterministic-first:
 *   1. Not-applicable detection — applicability regime tag + product-class rules
 *   2. Design-impact detection  — Fang issue categories and keywords map to standards
 *   3. In-scope-not-started     — residual for standards that apply but lack signals
 *
 * When ALL rows stay undifferentiated after a pass, `matrixUndifferentiated: true`
 * is returned so the PDF can emit a warning banner.
 *
 * @related
 *   - run-chase-research.ts      — calls triageRegulatoryMatrix after Chase extraction
 *   - export-project-pdf.tsx     — calls triageWithFangFindings at PDF-build time
 *   - src/lib/cad-lab-types.ts   — CadLabDesignBriefRegulatoryItem (status extended)
 *   - src/lib/cad-lab/industry-domains.ts — detectIndustryDomain (product class)
 */

import type { CadLabDesignBriefRegulatoryItem } from "@/lib/cad-lab-types"
import { detectIndustryDomain } from "@/lib/cad-lab/industry-domains"

// ─── Types ─────────────────────────────────────────────────────────────────

/** A Fang module-level review issue (severity/category/message). */
export interface FangIssue {
  severity: "CRITICAL" | "WARNING" | "INFO"
  category: string
  message: string
  suggestion?: string
}

/** Triage result — the enriched regulatory array + a flag when undifferentiated. */
export interface RegulatoryTriageResult {
  /** The regulatory array with statuses updated in-place (original items modified). */
  items: CadLabDesignBriefRegulatoryItem[]
  /**
   * True when ALL rows remain "in-scope-not-started" after triage — meaning no
   * standards could be differentiated. The PDF should render a warning banner.
   */
  matrixUndifferentiated: boolean
  /** Summary for audit logs — e.g. "4 not-applicable, 2 design-impact-identified, 8 in-scope-not-started". */
  triageSummary: string
}

// ─── Not-applicable rules ───────────────────────────────────────────────────

/**
 * Product-class keywords that indicate a domain-specific standard CANNOT apply.
 * Format: { standardCodeSubstring, excludedProductKeywords[] }
 *
 * A standard is marked "not-applicable" when its code contains the substring AND
 * the product subject contains NONE of the domain keywords — meaning the product
 * is clearly outside the standard's scope.
 *
 * INTENT: Keep this conservative. Only exclude when the exclusion is unambiguous
 * (e.g. grid-connection standards on a bird feeder). Do NOT exclude on partial
 * or ambiguous signals.
 */
const DOMAIN_EXCLUSION_RULES: Array<{
  /** Substring of standard code or name (case-insensitive) that identifies the domain. */
  standardMarkers: string[]
  /** If the product subject contains ANY of these keywords, the standard DOES apply. */
  productRequiredKeywords: string[]
  /** Human-readable reason for the PDF audit trail. */
  reason: string
}> = [
  {
    // Grid-connection standards — only relevant for grid-tied energy storage / generation
    standardMarkers: ["G99", "G100", "ESQCR", "grid code", "DNO", "generation equipment"],
    productRequiredKeywords: [
      "grid", "bess", "battery storage", "energy storage", "generation", "wind turbine",
      "solar farm", "photovoltaic", "export", "dnp", "distribution network",
    ],
    reason: "Grid-connection standard; product is not grid-connected energy storage",
  },
  {
    // Medical device regulations — only for products with diagnostic or treatment intent
    standardMarkers: ["UK MDR", "MDR 2002", "MHRA", "BS EN ISO 13485", "BS EN ISO 14971",
      "BS EN 60601", "IEC 60601", "BS EN 62304"],
    productRequiredKeywords: [
      "medical", "patient", "clinical", "diagnostic", "treatment", "implant",
      "surgical", "therapeutic", "prosthetic", "drug delivery", "in vitro",
    ],
    reason: "Medical device regulation; product has no medical or therapeutic function",
  },
  {
    // Aviation-specific standards — only for aircraft and UAV products
    standardMarkers: ["CS-25", "CS-23", "CS-VLA", "EASA", "ICAO", "CAA Part", "AMC20",
      "DO-160", "DO-178", "RTCA"],
    productRequiredKeywords: [
      "aircraft", "airplane", "drone", "uav", "uas", "helicopter", "glider",
      "balloon", "airship", "haps", "high altitude", "stratospheric",
    ],
    reason: "Aviation certification standard; product is not an airborne system",
  },
  {
    // Marine standards — only for watercraft
    standardMarkers: ["ISO 10592", "ISO 11812", "ISO 8665", "MCA", "SOLAS",
      "ISO 10087", "ISO 6185", "BS EN ISO 10087"],
    productRequiredKeywords: [
      "boat", "vessel", "ship", "yacht", "marine", "watercraft", "dinghy",
      "kayak", "pontoon", "submarine", "propeller",
    ],
    reason: "Marine standard; product is not a watercraft or marine system",
  },
  {
    // Automotive type-approval — only for road vehicles
    standardMarkers: ["ECE R", "UN ECE", "UNECE", "Euro NCAP", "WLTP", "NEDC",
      "BS AU", "EC/661/2009"],
    productRequiredKeywords: [
      "car", "vehicle", "truck", "motorcycle", "van", "bus", "ev", "electric vehicle",
      "road vehicle", "type approval",
    ],
    reason: "Automotive type-approval standard; product is not a road vehicle",
  },
  {
    // Food contact and food production — only for food-touching or food-growing systems
    standardMarkers: ["Food Safety Act", "EC 852/2004", "BS EN 1672", "BPR",
      "WRAS", "WSR", "drinking water", "food hygiene", "food machinery"],
    productRequiredKeywords: [
      "food", "edible", "potable", "drinking water", "vertical farm", "hydroponic",
      "aquaponic", "food production", "food contact", "food processing", "crop",
      "plant growth", "lettuce", "harvest",
    ],
    reason: "Food safety/contact standard; product does not involve food production or contact",
  },
  {
    // Drinking water and desalination — only for water treatment producing potable water
    standardMarkers: ["BS 6920", "Drinking Water Regs", "Water Supply Regs", "DWI",
      "WHO Drinking Water", "WSR 2016"],
    productRequiredKeywords: [
      "drinking water", "potable", "desalination", "water treatment", "reverse osmosis",
      "filtration plant", "water supply",
    ],
    reason: "Drinking water regulation; product does not produce or handle potable water",
  },
  {
    // Pressure systems — only for products with pressurised circuits
    standardMarkers: ["PSSR", "PESR", "PED", "Pressure Equipment", "AD Merkblatt",
      "BS PD 5500", "ASME VIII", "EN 13445"],
    productRequiredKeywords: [
      "pressure", "vessel", "hydraulic", "pneumatic", "steam", "boiler",
      "compressed gas", "compressed air", "refrigerant", "heat exchanger",
      "hydrogen", "cryogenic",
    ],
    reason: "Pressure systems standard; product has no pressurised circuits or vessels",
  },
  {
    // Battery-specific standards — only for battery-bearing products
    standardMarkers: ["IEC 62133", "IEC 62619", "IEC 63056", "UN 38.3", "ADR",
      "Batteries Regulation", "Battery Regs", "BS EN IEC 62133", "BS EN IEC 62619",
      "BS EN IEC 63056", "IEC 62485"],
    productRequiredKeywords: [
      "battery", "lithium", "cell", "electrochemical", "bms", "battery management",
      "charge", "discharge", "energy storage", "bess", "ev battery",
      "rechargeable",
    ],
    reason: "Battery safety standard; product contains no battery or electrochemical storage",
  },
]

// ─── Design-impact detection ────────────────────────────────────────────────

/**
 * Fang issue keywords → standard code substrings.
 * When a Fang issue message or category contains a trigger keyword, the listed
 * standard codes are elevated to "design-impact-identified".
 *
 * Case-insensitive matching. Multiple triggers can link one issue to many standards.
 */
const FANG_TO_STANDARD_LINKS: Array<{
  /** Keywords to match in Fang issue message or category (case-insensitive, any-match). */
  issueKeywords: string[]
  /** Standard code substrings that should be elevated (case-insensitive). */
  standardCodeMarkers: string[]
  /** Optional human-readable label for audit logs. */
  label: string
}> = [
  {
    issueKeywords: ["thermal runaway", "cell temperature", "battery temperature",
      "lithium", "lfp", "nmc", "battery safety", "cell chemistry"],
    standardCodeMarkers: ["62619", "62933", "62133", "63056", "UN 38.3"],
    label: "Battery thermal / safety",
  },
  {
    issueKeywords: ["pressure", "bar", "psi", "hydraulic", "pneumatic",
      "compressed", "vessel", "burst", "relief valve", "hydrogen storage"],
    standardCodeMarkers: ["PESR", "PSSR", "PED", "62799", "79/2009"],
    label: "Pressure systems",
  },
  {
    issueKeywords: ["grid connection", "inverter", "export", "dnp", "islanding",
      "grid-forming", "ride-through", "G99", "G100"],
    standardCodeMarkers: ["G99", "G100", "ESQCR", "ENA"],
    label: "Grid connection",
  },
  {
    issueKeywords: ["wiring", "electrical installation", "isolation", "earthing",
      "overcurrent", "short circuit", "rcd", "protection coordination"],
    standardCodeMarkers: ["BS 7671", "EAWR", "7671"],
    label: "Electrical installation",
  },
  {
    issueKeywords: ["electromagnetic", "interference", "emc", "radiated emissions",
      "conducted emissions", "rf", "radio frequency", "wireless"],
    standardCodeMarkers: ["EMC", "61000", "EN 55", "RED", "radio equipment"],
    label: "Electromagnetic compatibility",
  },
  {
    issueKeywords: ["food contact", "food safety", "hygiene", "cleaning", "sanitisation",
      "sanitation", "food-grade", "food grade", "crop"],
    standardCodeMarkers: ["Food Safety Act", "852", "1672", "food hygiene"],
    label: "Food safety and hygiene",
  },
  {
    issueKeywords: ["potable", "drinking water", "water quality", "water treatment",
      "reverse osmosis", "desalination"],
    standardCodeMarkers: ["BS 6920", "drinking water", "DWI", "WHO"],
    label: "Potable water",
  },
  {
    issueKeywords: ["machinery guard", "safe distance", "reach distance",
      "moving part", "pinch point", "nip point", "safety distance",
      "guarding", "stop function", "emergency stop", "e-stop"],
    standardCodeMarkers: ["12100", "13849", "machinery", "Supply of Machinery"],
    label: "Machinery safety",
  },
  {
    issueKeywords: ["fire", "flame spread", "flammable", "smoke", "explosion",
      "deflagration", "thermal propagation", "fire suppression", "extinguisher"],
    standardCodeMarkers: ["NFPA 855", "UL 9540", "62933-5-2", "fire"],
    label: "Fire safety",
  },
  {
    issueKeywords: ["container", "iso container", "shipping container", "csc",
      "structural", "modified container", "vent", "penetration"],
    standardCodeMarkers: ["ISO 1496", "1496-1", "CSC"],
    label: "Container structural integrity",
  },
  {
    issueKeywords: ["noise", "vibration", "acoustic", "sound pressure", "db level"],
    standardCodeMarkers: ["noise", "vibration", "BS EN ISO 3741", "3740"],
    label: "Noise and vibration",
  },
  {
    issueKeywords: ["led", "light output", "photobiological", "laser", "optical radiation",
      "uv exposure", "blue light"],
    standardCodeMarkers: ["62471", "ISO 15004", "photobiological"],
    label: "Optical radiation safety",
  },
]

// ─── Main triage function ───────────────────────────────────────────────────

/**
 * Runs regulatory triage on a Chase-extracted regulatory array.
 *
 * Called in two contexts:
 *   (A) Immediately after Chase extraction — no Fang findings available yet.
 *       Pass `fangIssues: []` and the triage assigns "not-applicable" /
 *       "in-scope-not-started" based on product class and applicability text alone.
 *   (B) At PDF-export time — Fang findings available.
 *       Pass the aggregated Fang issues; the triage additionally elevates standards
 *       to "design-impact-identified" based on semantic keyword matching.
 *
 * @param items        - Chase-extracted regulatory array (mutated in-place).
 * @param subject      - Project subject / brief description.
 * @param markets      - Operating jurisdiction codes (e.g. ["GB"] or ["GB","US"]).
 * @param fangIssues   - Fang module review issues (empty array if not yet available).
 * @returns            - RegulatoryTriageResult with updated items + metadata.
 */
export function triageRegulatoryMatrix(
  items: CadLabDesignBriefRegulatoryItem[],
  subject: string,
  markets: string[],
  fangIssues: FangIssue[],
): RegulatoryTriageResult {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      items,
      matrixUndifferentiated: false,
      triageSummary: "No regulatory items to triage",
    }
  }

  const subjectLower = (subject ?? "").toLowerCase()
  const isUK = !markets || markets.length === 0 || markets.some(
    (m) => m.toUpperCase() === "GB" || m.toUpperCase() === "UK",
  )
  const hasJurisdiction = isUK

  void hasJurisdiction // jurisdiction check placeholder for future EU-specific rules

  // ── Pass 1: Not-applicable detection ─────────────────────────────────────
  for (const item of items) {
    // Preserve statuses that have already been manually set beyond "not-started"
    // (i.e. a founder has marked something "in-progress" or "met") — don't overwrite.
    if (
      item.status === "met" ||
      item.status === "in-progress" ||
      item.status === "evidence-captured"
    ) {
      continue
    }

    // Step 1a: if the applicability field starts with "Voluntary reference" or
    // "Insurer best-practice", the standard is advisory — mark as "in-scope-not-started"
    // rather than leaving "not-started" (which is legacy and undifferentiated).
    // Note: do NOT mark these "not-applicable" — insurer requirements are real even if
    // not statutory. We just upgrade the legacy status to the new taxonomy.
    if (
      item.applicability?.startsWith("Voluntary reference") ||
      item.applicability?.startsWith("Insurer best-practice")
    ) {
      item.status = "in-scope-not-started"
      continue
    }

    // Step 1b: domain-exclusion rules — check if this standard clearly doesn't apply
    const codeAndName = `${item.code} ${item.name} ${item.applicability ?? ""}`.toLowerCase()
    let markedNotApplicable = false

    for (const rule of DOMAIN_EXCLUSION_RULES) {
      // Does this standard match the rule's markers?
      const standardMatchesRule = rule.standardMarkers.some((marker) =>
        codeAndName.includes(marker.toLowerCase()),
      )
      if (!standardMatchesRule) continue

      // Does the product have ANY of the required keywords?
      const productHasRequiredKeyword = rule.productRequiredKeywords.some((kw) =>
        subjectLower.includes(kw.toLowerCase()),
      )
      if (productHasRequiredKeyword) continue

      // Product doesn't match the required keywords → this domain standard doesn't apply
      item.status = "not-applicable"
      // Append the reason to gapAction so the PDF shows WHY it was excluded
      if (!item.gapAction || item.gapAction === "") {
        item.gapAction = `Auto-triage: ${rule.reason}`
      }
      markedNotApplicable = true
      break
    }

    if (!markedNotApplicable) {
      // Standard applies — upgrade from legacy "not-started" to taxonomy-correct value
      item.status = "in-scope-not-started"
    }
  }

  // ── Pass 2: Design-impact detection (Fang cross-reference) ───────────────
  if (fangIssues.length > 0) {
    const allIssueSentences = fangIssues.flatMap((issue) =>
      [`${issue.category ?? ""} ${issue.message ?? ""} ${issue.suggestion ?? ""}`.toLowerCase()],
    )
    const combinedIssueText = allIssueSentences.join(" ")

    for (const item of items) {
      // Only elevate items currently in "in-scope-not-started" — don't demote
      // manually set statuses or "not-applicable" items.
      if (item.status !== "in-scope-not-started" && item.status !== "not-started") {
        continue
      }

      const codeAndName = `${item.code} ${item.name}`.toLowerCase()

      for (const link of FANG_TO_STANDARD_LINKS) {
        // Does this link match the standard?
        const standardMatches = link.standardCodeMarkers.some((marker) =>
          codeAndName.includes(marker.toLowerCase()),
        )
        if (!standardMatches) continue

        // Do any Fang issues contain the trigger keywords?
        const issueMatches = link.issueKeywords.some((kw) =>
          combinedIssueText.includes(kw.toLowerCase()),
        )
        if (!issueMatches) continue

        // Fang found an issue that directly implicates this standard
        item.status = "design-impact-identified"
        // Note the cross-reference in designImpact if not already filled
        if (!item.designImpact || item.designImpact.trim() === "") {
          item.designImpact = `Auto-triage: design impact identified via manufacturing review — ${link.label}`
        }
        break
      }
    }
  }

  // ── Pass 3: Undifferentiated detection ───────────────────────────────────
  const counts = {
    notApplicable: 0,
    inScopeNotStarted: 0,
    designImpactIdentified: 0,
    evidenceCaptured: 0,
    met: 0,
    inProgress: 0,
    legacy: 0,
  }

  for (const item of items) {
    switch (item.status) {
      case "not-applicable": counts.notApplicable++; break
      case "in-scope-not-started": counts.inScopeNotStarted++; break
      case "design-impact-identified": counts.designImpactIdentified++; break
      case "evidence-captured": counts.evidenceCaptured++; break
      case "met": counts.met++; break
      case "in-progress": counts.inProgress++; break
      default: counts.legacy++; break
    }
  }

  // Undifferentiated = all rows are "in-scope-not-started" with no variety
  // (no not-applicable, no design-impact, no manually set statuses)
  const differentiated =
    counts.notApplicable > 0 ||
    counts.designImpactIdentified > 0 ||
    counts.evidenceCaptured > 0 ||
    counts.met > 0 ||
    counts.inProgress > 0
  const matrixUndifferentiated = !differentiated

  const summaryParts: string[] = []
  if (counts.notApplicable) summaryParts.push(`${counts.notApplicable} not-applicable`)
  if (counts.inScopeNotStarted) summaryParts.push(`${counts.inScopeNotStarted} in-scope-not-started`)
  if (counts.designImpactIdentified) summaryParts.push(`${counts.designImpactIdentified} design-impact-identified`)
  if (counts.evidenceCaptured) summaryParts.push(`${counts.evidenceCaptured} evidence-captured`)
  if (counts.met) summaryParts.push(`${counts.met} met`)
  if (counts.inProgress) summaryParts.push(`${counts.inProgress} in-progress`)
  if (counts.legacy) summaryParts.push(`${counts.legacy} legacy-not-started`)

  const triageSummary = summaryParts.join(", ") || "0 items"

  return { items, matrixUndifferentiated, triageSummary }
}

/**
 * Convenience wrapper for the PDF-export path where Fang data is aggregated
 * from ModulePdf.reviews across all modules.
 *
 * @param items        - Chase-extracted regulatory array.
 * @param subject      - Project brief subject.
 * @param markets      - Jurisdiction codes.
 * @param moduleReviews - Per-module Fang reviews (from PdfInput.modules).
 */
export function triageWithFangFindings(
  items: CadLabDesignBriefRegulatoryItem[],
  subject: string,
  markets: string[],
  moduleReviews: Array<{
    issues: Array<{ severity: string; category: string; message: string; suggestion?: string }>
    recommendations: string[]
  }>,
): RegulatoryTriageResult {
  // Flatten all Fang issues across modules
  const fangIssues: FangIssue[] = moduleReviews.flatMap((rev) =>
    (rev.issues ?? []).map((issue) => ({
      severity: (issue.severity as "CRITICAL" | "WARNING" | "INFO") ?? "INFO",
      category: issue.category ?? "",
      message: issue.message ?? "",
      suggestion: issue.suggestion,
    })),
  )
  return triageRegulatoryMatrix(items, subject, markets, fangIssues)
}

/**
 * Returns a human-readable label for a regulatory triage status,
 * suitable for the PDF pill renderer.
 */
export function regulatoryStatusLabel(status: string | null): string {
  switch (status) {
    case "not-applicable": return "Not applicable"
    case "in-scope-not-started": return "In scope — not started"
    case "design-impact-identified": return "Design impact identified"
    case "evidence-captured": return "Evidence captured"
    case "met": return "Met"
    case "in-progress": return "In progress"
    case "not-started": return "Not started"
    default: return status ?? "Not started"
  }
}

/**
 * Returns a CSS/PDF colour key for the regulatory triage status pill.
 * Used by the PDF renderer for colour-coded status badges.
 */
export function regulatoryStatusColour(status: string | null): {
  bg: string
  text: string
  border: string
} {
  switch (status) {
    case "not-applicable":
      return { bg: "#f3f4f6", text: "#6b7280", border: "#d1d5db" }
    case "in-scope-not-started":
      return { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" }
    case "design-impact-identified":
      return { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" }
    case "evidence-captured":
      return { bg: "#f0fdf4", text: "#166534", border: "#86efac" }
    case "met":
      return { bg: "#dcfce7", text: "#14532d", border: "#4ade80" }
    case "in-progress":
      return { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" }
    case "not-started":
    default:
      return { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" }
  }
}

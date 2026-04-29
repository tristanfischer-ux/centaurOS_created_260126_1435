/**
 * @file nre-cost-layer.ts — Non-recurring engineering cost estimates.
 *
 * @description Council fix F1 (GPT-5.5 + Kimi, critical): Finn's unit cost
 * excludes NRE, tooling, certification, compliance testing, fixtures,
 * calibration, warranty reserves, freight duties, and working capital.
 * Without these the pipeline makes infeasible hardware look investable.
 *
 * This module provides heuristic-based NRE estimates by product class.
 * All figures are GBP. Ranges are low/high bounds — not point estimates.
 *
 * @related
 *   - run-finn-cost.ts     — calls estimateNreCosts after unit cost is done
 *   - cost-reconciliation.ts — can cross-check NRE against industry benchmarks
 *   - export-project-pdf.tsx — renders NRE breakdown in cost section
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type NreCostCategory =
    | "tooling"
    | "certification"
    | "testing"
    | "fixtures"
    | "calibration"
    | "warranty-reserve"
    | "freight-duties"
    | "working-capital"

export interface NreCostLineItem {
    category: NreCostCategory
    label: string
    estimateLowGbp: number
    estimateHighGbp: number
    /** How this estimate was derived (e.g. "5-15% of BOM total"). */
    basis: string
    /** Whether this cost IS included in Finn's unit cost figure. Always false for NRE. */
    includedInUnitCost: boolean
}

export interface NreCostBreakdown {
    productClass: string
    geography: string
    lineItems: NreCostLineItem[]
    totalLowGbp: number
    totalHighGbp: number
    /** When the NRE was computed (ISO string). */
    computedAt: string
}

// ─── Product class detection ───────────────────────────────────────────────

type ProductClassBand = "aerospace" | "container-industrial" | "consumer"

function detectProductClassBand(productClass: string): ProductClassBand {
    const lower = productClass.toLowerCase()
    if (
        lower.includes("haps") ||
        lower.includes("aircraft") ||
        lower.includes("uav") ||
        lower.includes("drone") ||
        lower.includes("stratospheric") ||
        lower.includes("aerospace") ||
        lower.includes("satellite")
    ) {
        return "aerospace"
    }
    if (
        lower.includes("consumer") ||
        lower.includes("feeder") ||
        lower.includes("hedgerow") ||
        lower.includes("iot") ||
        lower.includes("wearable") ||
        lower.includes("gadget") ||
        lower.includes("accessory")
    ) {
        return "consumer"
    }
    return "container-industrial"
}

// ─── Heuristic tables ──────────────────────────────────────────────────────

interface BandRules {
    toolingPctLow: number
    toolingPctHigh: number
    certificationLowGbp: number
    certificationHighGbp: number
    testingLowGbp: number
    testingHighGbp: number
    fixturesLowGbp: number
    fixturesHighGbp: number
    calibrationLowGbp: number
    calibrationHighGbp: number
    warrantyPctLow: number
    warrantyPctHigh: number
    freightPctLow: number
    freightPctHigh: number
    workingCapitalPctLow: number
    workingCapitalPctHigh: number
}

const BAND_RULES: Record<ProductClassBand, BandRules> = {
    "aerospace": {
        toolingPctLow: 0.15,
        toolingPctHigh: 0.25,
        certificationLowGbp: 50_000,
        certificationHighGbp: 200_000,
        testingLowGbp: 20_000,
        testingHighGbp: 50_000,
        fixturesLowGbp: 15_000,
        fixturesHighGbp: 40_000,
        calibrationLowGbp: 5_000,
        calibrationHighGbp: 15_000,
        warrantyPctLow: 0.03,
        warrantyPctHigh: 0.05,
        freightPctLow: 0.10,
        freightPctHigh: 0.20,
        workingCapitalPctLow: 0.08,
        workingCapitalPctHigh: 0.15,
    },
    "container-industrial": {
        toolingPctLow: 0.05,
        toolingPctHigh: 0.15,
        certificationLowGbp: 8_000,
        certificationHighGbp: 20_000,
        testingLowGbp: 5_000,
        testingHighGbp: 10_000,
        fixturesLowGbp: 3_000,
        fixturesHighGbp: 8_000,
        calibrationLowGbp: 2_000,
        calibrationHighGbp: 5_000,
        warrantyPctLow: 0.02,
        warrantyPctHigh: 0.05,
        freightPctLow: 0.05,
        freightPctHigh: 0.15,
        workingCapitalPctLow: 0.05,
        workingCapitalPctHigh: 0.10,
    },
    "consumer": {
        toolingPctLow: 0.03,
        toolingPctHigh: 0.08,
        certificationLowGbp: 2_000,
        certificationHighGbp: 8_000,
        testingLowGbp: 2_000,
        testingHighGbp: 5_000,
        fixturesLowGbp: 1_000,
        fixturesHighGbp: 3_000,
        calibrationLowGbp: 500,
        calibrationHighGbp: 2_000,
        warrantyPctLow: 0.02,
        warrantyPctHigh: 0.03,
        freightPctLow: 0.03,
        freightPctHigh: 0.08,
        workingCapitalPctLow: 0.03,
        workingCapitalPctHigh: 0.06,
    },
}

// ─── Core estimator ────────────────────────────────────────────────────────

/**
 * Estimate NRE costs from the module list, product class, and geography.
 *
 * @param bomTotalGbp  Total BOM parts cost in GBP (sum of all module parts).
 * @param productClass Free-text product class from the brief or diagnostics.
 * @param geography    Target geography (e.g. "United Kingdom", "European Union").
 */
export function estimateNreCosts(
    bomTotalGbp: number,
    productClass: string,
    geography: string,
): NreCostBreakdown {
    const band = detectProductClassBand(productClass)
    const rules = BAND_RULES[band]
    const bom = Math.max(bomTotalGbp, 0)

    const lineItems: NreCostLineItem[] = [
        {
            category: "tooling",
            label: "Tooling and moulds",
            estimateLowGbp: Math.round(bom * rules.toolingPctLow),
            estimateHighGbp: Math.round(bom * rules.toolingPctHigh),
            basis: `${(rules.toolingPctLow * 100).toFixed(0)}-${(rules.toolingPctHigh * 100).toFixed(0)}% of bill of materials total`,
            includedInUnitCost: false,
        },
        {
            category: "certification",
            label: "Regulatory certification and compliance",
            estimateLowGbp: rules.certificationLowGbp,
            estimateHighGbp: rules.certificationHighGbp,
            basis: `${band} product class benchmark`,
            includedInUnitCost: false,
        },
        {
            category: "testing",
            label: "Compliance testing and environmental qualification",
            estimateLowGbp: rules.testingLowGbp,
            estimateHighGbp: rules.testingHighGbp,
            basis: `${band} product class benchmark`,
            includedInUnitCost: false,
        },
        {
            category: "fixtures",
            label: "Assembly and test fixtures",
            estimateLowGbp: rules.fixturesLowGbp,
            estimateHighGbp: rules.fixturesHighGbp,
            basis: `${band} product class benchmark`,
            includedInUnitCost: false,
        },
        {
            category: "calibration",
            label: "Calibration equipment and procedures",
            estimateLowGbp: rules.calibrationLowGbp,
            estimateHighGbp: rules.calibrationHighGbp,
            basis: `${band} product class benchmark`,
            includedInUnitCost: false,
        },
        {
            category: "warranty-reserve",
            label: "Warranty reserve (per-unit, amortised)",
            estimateLowGbp: Math.round(bom * rules.warrantyPctLow),
            estimateHighGbp: Math.round(bom * rules.warrantyPctHigh),
            basis: `${(rules.warrantyPctLow * 100).toFixed(0)}-${(rules.warrantyPctHigh * 100).toFixed(0)}% of bill of materials total`,
            includedInUnitCost: false,
        },
        {
            category: "freight-duties",
            label: "Freight, tariffs, and duties",
            estimateLowGbp: Math.round(bom * rules.freightPctLow),
            estimateHighGbp: Math.round(bom * rules.freightPctHigh),
            basis: `${(rules.freightPctLow * 100).toFixed(0)}-${(rules.freightPctHigh * 100).toFixed(0)}% of bill of materials total, ${geography || "global"} routing`,
            includedInUnitCost: false,
        },
        {
            category: "working-capital",
            label: "Working capital (supplier deposits, minimum order quantities, inventory)",
            estimateLowGbp: Math.round(bom * rules.workingCapitalPctLow),
            estimateHighGbp: Math.round(bom * rules.workingCapitalPctHigh),
            basis: `${(rules.workingCapitalPctLow * 100).toFixed(0)}-${(rules.workingCapitalPctHigh * 100).toFixed(0)}% of bill of materials total`,
            includedInUnitCost: false,
        },
    ]

    const totalLowGbp = lineItems.reduce((s, i) => s + i.estimateLowGbp, 0)
    const totalHighGbp = lineItems.reduce((s, i) => s + i.estimateHighGbp, 0)

    return {
        productClass: band,
        geography: geography || "global",
        lineItems,
        totalLowGbp,
        totalHighGbp,
        computedAt: new Date().toISOString(),
    }
}

// ─── NRE inclusion flags ───────────────────────────────────────────────────

/**
 * Explicit disclosure of what IS and ISN'T included in Finn's unit cost.
 * Consumed by the PDF renderer and cost summary UI.
 */
export const NRE_INCLUSION_FLAGS = {
    includedInUnitCost: [
        "Raw materials and components",
        "Assembly labour (at standard hourly rate)",
        "Direct manufacturing overhead",
    ],
    excludedFromUnitCost: [
        "Tooling and moulds (non-recurring engineering)",
        "Regulatory certification and compliance fees",
        "Environmental and compliance testing",
        "Assembly and test fixtures",
        "Calibration equipment",
        "Warranty reserves",
        "Freight, tariffs, and import duties",
        "Working capital (supplier deposits, minimum order quantities)",
        "Prototype iteration costs",
        "Field service and returns processing",
    ],
} as const

// ─── Formatter ─────────────────────────────────────────────────────────────

/**
 * Produce a human-readable NRE summary for the PDF cost section.
 */
export function formatNreSummary(breakdown: NreCostBreakdown): string {
    const lines = breakdown.lineItems
        .map(
            (item) =>
                `• ${item.label}: £${item.estimateLowGbp.toLocaleString("en-GB")} – £${item.estimateHighGbp.toLocaleString("en-GB")} (${item.basis})`,
        )
        .join("\n")

    return [
        `Non-recurring and excluded cost estimate (${breakdown.productClass} class, ${breakdown.geography}):`,
        "",
        lines,
        "",
        `Total NRE range: £${breakdown.totalLowGbp.toLocaleString("en-GB")} – £${breakdown.totalHighGbp.toLocaleString("en-GB")}`,
        "",
        "These costs are NOT included in the per-unit cost estimate above.",
        "They represent one-time or amortised costs required to bring the product to market.",
    ].join("\n")
}

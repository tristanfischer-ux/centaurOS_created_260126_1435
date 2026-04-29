/**
 * @file fully-burdened-cost.ts — Computes the fully burdened unit cost by
 * layering non-recurring engineering, tooling, certification, warranty,
 * landed-cost uplift, and yield/scrap allowance on top of the raw bill of
 * materials unit cost.
 *
 * Addresses pipeline council finding F1 (3/6 models, critical): Finn computes
 * margins from bill of materials unit cost alone, which excludes the real-world
 * costs that determine whether a hardware product is commercially viable.
 *
 * This module is a pure function — no I/O, no LLM calls, no side effects.
 * Product-class certification estimates are derived from the checklist
 * definitions in product-class-checklists.ts.
 */

// ── Types ─────────────────────────────────────────────────────────────────

/** Product classes recognised by the certification estimator. */
export type ProductClass =
    | "High-Altitude Pseudo-Satellite"
    | "Battery Energy Storage System"
    | "Seawater Reverse Osmosis"
    | "Vertical Farm"
    | "Consumer Device"

/** The tier a product class falls into for certification cost estimation. */
export type CertificationTier = "aerospace" | "industrial" | "consumer"

/** Full breakdown of every cost layer on top of raw bill of materials cost. */
export interface FullyBurdenedCost {
    /** Raw bill of materials unit cost in GBP (input, not computed). */
    rawBomCost: number
    /** Non-recurring engineering cost amortised over the stated production volume. */
    nreAmortised: number
    /** Estimated certification cost amortised over the stated production volume. */
    certificationEstimate: number
    /** Tooling cost amortised over the stated production volume. */
    toolingEstimate: number
    /** Warranty reserve per unit (percentage of raw bill of materials cost). */
    warrantyReserve: number
    /** Landed cost uplift per unit (freight, tariffs, duties, insurance). */
    landedCostUplift: number
    /** Yield and scrap allowance per unit. */
    yieldScrapAllowance: number
    /** Sum of all cost layers — the true per-unit cost. */
    fullyBurdenedUnitCost: number
    /** The production volume used for amortisation. */
    amortisationVolume: number
    /** The product class used for certification estimation. */
    productClass: ProductClass
    /** The certification tier derived from the product class. */
    certificationTier: CertificationTier
}

/** Optional overrides for default percentages and lump-sum estimates. */
export interface FullyBurdenedCostOverrides {
    /** Override the non-recurring engineering lump sum in GBP. */
    nreLumpSumGbp?: number
    /** Override the certification lump sum in GBP. */
    certificationLumpSumGbp?: number
    /** Override the tooling lump sum in GBP. */
    toolingLumpSumGbp?: number
    /** Override warranty reserve as a fraction (e.g. 0.03 = 3%). */
    warrantyReserveFraction?: number
    /** Override landed cost uplift as a fraction (e.g. 0.15 = 15%). */
    landedCostUpliftFraction?: number
    /** Override yield/scrap allowance as a fraction (e.g. 0.05 = 5%). */
    yieldScrapFraction?: number
}

// ── Certification tier mapping ────────────────────────────────────────────

const PRODUCT_CLASS_TO_TIER: Record<ProductClass, CertificationTier> = {
    "High-Altitude Pseudo-Satellite": "aerospace",
    "Battery Energy Storage System": "industrial",
    "Seawater Reverse Osmosis": "industrial",
    "Vertical Farm": "industrial",
    "Consumer Device": "consumer",
}

// ── Default certification cost ranges (midpoint used as estimate) ─────────
//
// Aerospace / high-altitude pseudo-satellite: £50,000–£200,000
// Industrial (battery energy storage, desalination, vertical farm): £20,000–£80,000
// Consumer device: £5,000–£30,000

const CERTIFICATION_MIDPOINT_GBP: Record<CertificationTier, number> = {
    aerospace: 125_000,
    industrial: 50_000,
    consumer: 17_500,
}

// ── Default non-recurring engineering estimates by tier ────────────────────

const NRE_DEFAULT_GBP: Record<CertificationTier, number> = {
    aerospace: 500_000,
    industrial: 150_000,
    consumer: 50_000,
}

// ── Default tooling estimates by tier ─────────────────────────────────────

const TOOLING_DEFAULT_GBP: Record<CertificationTier, number> = {
    aerospace: 200_000,
    industrial: 80_000,
    consumer: 30_000,
}

// ── Default percentage-based cost layers ──────────────────────────────────

const WARRANTY_RESERVE_CONSUMER = 0.03
const WARRANTY_RESERVE_INDUSTRIAL = 0.08
const LANDED_COST_UPLIFT_DEFAULT = 0.15
const YIELD_SCRAP_ALLOWANCE_DEFAULT = 0.05

// ── Pure computation ──────────────────────────────────────────────────────

/**
 * Compute the fully burdened unit cost from the raw bill of materials cost,
 * product class, production volume, and optional overrides.
 *
 * @param rawBomCostGbp — Raw bill of materials unit cost in GBP.
 * @param productClass — The detected or declared product class.
 * @param volume — Production volume over which lump-sum costs are amortised.
 *   Must be >= 1.
 * @param overrides — Optional overrides for any default estimate.
 * @returns A FullyBurdenedCost breakdown.
 * @throws When volume < 1 (amortisation over zero units is undefined).
 */
export function computeFullyBurdenedCost(
    rawBomCostGbp: number,
    productClass: ProductClass,
    volume: number,
    overrides?: FullyBurdenedCostOverrides,
): FullyBurdenedCost {
    if (volume < 1) {
        throw new Error(
            `Amortisation volume must be at least 1 (received ${volume}).`,
        )
    }

    const tier = PRODUCT_CLASS_TO_TIER[productClass]

    const nreLumpSum = overrides?.nreLumpSumGbp ?? NRE_DEFAULT_GBP[tier]
    const certLumpSum =
        overrides?.certificationLumpSumGbp ?? CERTIFICATION_MIDPOINT_GBP[tier]
    const toolingLumpSum =
        overrides?.toolingLumpSumGbp ?? TOOLING_DEFAULT_GBP[tier]

    const warrantyFraction =
        overrides?.warrantyReserveFraction ??
        (tier === "consumer"
            ? WARRANTY_RESERVE_CONSUMER
            : WARRANTY_RESERVE_INDUSTRIAL)

    const landedFraction =
        overrides?.landedCostUpliftFraction ?? LANDED_COST_UPLIFT_DEFAULT

    const yieldFraction =
        overrides?.yieldScrapFraction ?? YIELD_SCRAP_ALLOWANCE_DEFAULT

    const nreAmortised = nreLumpSum / volume
    const certificationEstimate = certLumpSum / volume
    const toolingEstimate = toolingLumpSum / volume
    const warrantyReserve = rawBomCostGbp * warrantyFraction
    const landedCostUplift = rawBomCostGbp * landedFraction
    const yieldScrapAllowance = rawBomCostGbp * yieldFraction

    const fullyBurdenedUnitCost =
        rawBomCostGbp +
        nreAmortised +
        certificationEstimate +
        toolingEstimate +
        warrantyReserve +
        landedCostUplift +
        yieldScrapAllowance

    return {
        rawBomCost: rawBomCostGbp,
        nreAmortised,
        certificationEstimate,
        toolingEstimate,
        warrantyReserve,
        landedCostUplift,
        yieldScrapAllowance,
        fullyBurdenedUnitCost,
        amortisationVolume: volume,
        productClass,
        certificationTier: tier,
    }
}

// ── Helpers for callers ───────────────────────────────────────────────────

/** All recognised product class names, for validation or UI dropdowns. */
export const PRODUCT_CLASSES: readonly ProductClass[] = [
    "High-Altitude Pseudo-Satellite",
    "Battery Energy Storage System",
    "Seawater Reverse Osmosis",
    "Vertical Farm",
    "Consumer Device",
] as const

/**
 * Format a GBP amount for display (founder-safe, no jargon).
 * Mirrors the formatter in cost-reconciliation.ts.
 */
export function formatGbp(n: number): string {
    if (n >= 1_000_000) {
        return `£${(n / 1_000_000).toFixed(2)}M`
    }
    if (n >= 1_000) {
        return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
    }
    return `£${n.toFixed(2)}`
}

/**
 * Returns a human-readable summary of the fully burdened cost breakdown.
 * Suitable for embedding in a PDF finance section or tooltip.
 */
export function summariseFullyBurdenedCost(
    result: FullyBurdenedCost,
): string {
    const pct = (part: number) =>
        result.fullyBurdenedUnitCost > 0
            ? `${((part / result.fullyBurdenedUnitCost) * 100).toFixed(1)}%`
            : "—"

    return [
        `Fully burdened unit cost: ${formatGbp(result.fullyBurdenedUnitCost)} ` +
            `(${formatGbp(result.rawBomCost)} raw bill of materials + ` +
            `${formatGbp(result.fullyBurdenedUnitCost - result.rawBomCost)} burden).`,
        ``,
        `Breakdown (amortised over ${result.amortisationVolume.toLocaleString("en-GB")} units):`,
        `  • Raw bill of materials cost: ${formatGbp(result.rawBomCost)} (${pct(result.rawBomCost)})`,
        `  • Non-recurring engineering: ${formatGbp(result.nreAmortised)} (${pct(result.nreAmortised)})`,
        `  • Certification (${result.certificationTier}): ${formatGbp(result.certificationEstimate)} (${pct(result.certificationEstimate)})`,
        `  • Tooling: ${formatGbp(result.toolingEstimate)} (${pct(result.toolingEstimate)})`,
        `  • Warranty reserve: ${formatGbp(result.warrantyReserve)} (${pct(result.warrantyReserve)})`,
        `  • Landed cost uplift (freight, tariffs, duties): ${formatGbp(result.landedCostUplift)} (${pct(result.landedCostUplift)})`,
        `  • Yield and scrap allowance: ${formatGbp(result.yieldScrapAllowance)} (${pct(result.yieldScrapAllowance)})`,
    ].join("\n")
}

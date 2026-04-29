/**
 * @file cost-reconciliation.ts — Independent cross-check of project cost totals.
 *
 * @description Addresses the single-source-of-truth risk identified in the Loop
 * council review (Item 7, GPT-5.5 unique finding): when all cost displays read
 * from one canonical source (Finn), a wrong number is undetectable because
 * every display agrees.
 *
 * This module is a pure function — no I/O, no LLM calls, no side effects.
 * Callers (run-cost-reconciliation.ts server action) supply the four data
 * sources and receive a structured result they persist and pass to the PDF/UI.
 *
 * ── Four sources compared ────────────────────────────────────────────────
 *
 *   1. Canonical total — sum of AiCostEstimate.totalPerUnit across all modules.
 *      This is Finn's output and INCLUDES labour (£40/hr × assembly hours).
 *      It is the displayed "cost to build" number.
 *
 *   2. BOM-derived total — sum of (parts.estimated_unit_cost_gbp × bom_lines.quantity)
 *      for all top-level BOM lines in the project.
 *      NOTE: this is PARTS ONLY, not labour. An apples-to-apples comparison is
 *      not possible — the threshold for this pair is wider (15%) to account for
 *      Finn legitimately including labour that the parts table does not.
 *
 *   3. Supplier-derived total — sum of manufacturing_order_lines.quoted_unit_price_gbp
 *      multiplied by quantity, for all order lines tied to this project's parts.
 *      Only available once real procurement has started. Sparse early on.
 *
 *   4. Brief ceiling — design_brief.constraints.unitCostCeilingGbp.
 *      Treated as a constraint, not an estimate. Any overage is flagged
 *      immediately regardless of percentage.
 *
 * ── Thresholds ───────────────────────────────────────────────────────────
 *
 *   Canonical vs BOM-derived:  15% (wider — Finn includes labour, BOM does not).
 *   Canonical vs Ceiling:       0% overage threshold — any value above ceiling flags.
 *   BOM-derived vs Supplier:   10% (narrower — both are parts-only).
 *
 *   Additionally: percentage thresholds are suppressed on very small assemblies
 *   (total cost < £50) to prevent noise on trivial components.
 *
 * ── Missing data handling ────────────────────────────────────────────────
 *
 *   Any source can be absent (null/undefined). When a source is absent its
 *   `available` flag is false and the pairwise check that depends on it is
 *   skipped entirely — never fabricated, never defaulted to zero.
 *
 * ── Persistence ─────────────────────────────────────────────────────────
 *
 *   Results are written to cad_lab_projects.cost_reconciliation (JSONB).
 *   The PDF renderer and UI both read from this stored result — they do NOT
 *   recompute independently, which would risk producing different numbers from
 *   different code paths.
 *
 * @related
 *   - Caller (server action):     src/actions/specialists/run-cost-reconciliation.ts
 *   - Wired in Finn pipeline:     src/actions/specialists/run-finn-cost.ts
 *   - Existing reconciliation:    src/lib/bom/bom-reconciliation.ts (count-gate pattern)
 *   - Oracle benchmarks:          src/lib/cost/oracle-benchmarks.ts
 */

// ── Types ─────────────────────────────────────────────────────────────────

/** Severity of a cost divergence finding. */
export type CostDivergenceSeverity = "info" | "warning" | "critical"

/**
 * A single pairwise comparison between two cost sources.
 * When `available` is false the comparison was skipped — do not
 * display as a zero divergence, display as "not available yet".
 */
export interface CostPairCheck {
    /** Human-readable label for this pair (e.g. "Finn vs bill of materials"). */
    label: string
    /** First source total in GBP. Null when unavailable. */
    sourceA: number | null
    /** Second source total in GBP. Null when unavailable. */
    sourceB: number | null
    /** Whether both sources had data and the check ran. */
    available: boolean
    /** Absolute difference (|A - B|). Null when not available. */
    absGbp: number | null
    /** Percentage difference as a number 0–100. Null when not available. */
    pctDiff: number | null
    /** Whether the divergence exceeded the pair's threshold. */
    flagged: boolean
    /** Severity when flagged. */
    severity: CostDivergenceSeverity | null
    /** Human-readable explanation of the finding (founder-safe copy). */
    message: string
}

/**
 * Whether the canonical total exceeds the brief's cost ceiling.
 * A separate concern from pairwise divergence — treated as a hard constraint.
 */
export interface CeilingCheck {
    /** Whether a ceiling was declared in the brief. */
    ceilingDeclared: boolean
    /** The declared ceiling in GBP, or null. */
    ceilingGbp: number | null
    /** The canonical total being compared. Null if Finn hasn't run yet. */
    canonicalGbp: number | null
    /** True when canonical > ceiling (or when ceiling missing = false). */
    breached: boolean
    /** By how much the ceiling is exceeded (negative = under budget). Null when ceiling or canonical absent. */
    overageGbp: number | null
    /** Percentage of ceiling consumed. Null when ceiling or canonical absent. */
    ceilingUtilisationPct: number | null
    /** True when utilisation is >= 90% (soft warning). */
    nearCeiling: boolean
    /** Founder-safe message. */
    message: string
}

/** The four data sources fed into reconciliation, with availability flags. */
export interface CostReconciliationSources {
    /** Sum of AiCostEstimate.totalPerUnit across costed modules. */
    canonicalTotalGbp: number | null
    /** Sum of (bom_lines.quantity × parts.estimated_unit_cost_gbp) for all lines. */
    bomDerivedTotalGbp: number | null
    /** Sum of matched supplier quotes (manufacturing_order_lines). */
    supplierDerivedTotalGbp: number | null
    /** design_brief.constraints.unitCostCeilingGbp from the brief. */
    briefCeilingGbp: number | null
    /** How many BOM line items contributed to bomDerivedTotalGbp. */
    bomLineCount: number
    /** How many BOM line items had null/zero costs (excluded from sum). */
    bomLinesWithMissingCost: number
    /** How many supplier order lines contributed to supplierDerivedTotalGbp. */
    supplierLineCount: number
    /** Coverage ratio (0–1): supplierLineCount / bomLineCount. Null when bomLineCount is 0. */
    supplierCoverageRatio: number | null
    /** Module IDs where Finn returned null totalPerUnit (cost not estimated).
     *  Council fix 2C: these are listed separately rather than contributing
     *  £0 to the canonical total. */
    uncostedModuleIds: string[]
}

/** Aggregated reconciliation result written to cad_lab_projects.cost_reconciliation. */
export interface CostReconciliationResult {
    /** ISO timestamp when this reconciliation was computed. */
    computedAt: string
    /** Source totals with availability metadata. */
    sources: CostReconciliationSources
    /** Pairwise divergence checks. */
    checks: CostPairCheck[]
    /** Hard ceiling check (separate from pairwise divergence). */
    ceilingCheck: CeilingCheck
    /** True when any check is flagged OR the ceiling is breached. */
    hasWarnings: boolean
    /** True when any check has severity 'critical' OR the ceiling is breached. */
    hasCritical: boolean
    /** Summarised founder-safe headline (one sentence). */
    summaryMessage: string
}

// ── Threshold constants ───────────────────────────────────────────────────

/**
 * Divergence threshold for Canonical (Finn) vs BOM-derived total.
 *
 * Set wider than the BOM-vs-supplier pair because Finn includes assembly
 * labour (£40/hr × estimated hours) while the BOM parts table records
 * bought/made parts only. A legitimately correct Finn estimate will always
 * read higher than a parts-only BOM sum.
 */
const THRESHOLD_CANONICAL_VS_BOM = 0.15 // 15%

/**
 * Divergence threshold for BOM-derived vs supplier-derived total.
 *
 * Both are parts-only (no labour), so they should agree more tightly.
 */
const THRESHOLD_BOM_VS_SUPPLIER = 0.10 // 10%

/**
 * Minimum total cost below which percentage thresholds are suppressed.
 * A 15% divergence on a £20 assembly is noise; a 15% divergence on a
 * £200k BESS system warrants investigation.
 */
const MIN_COST_FOR_PCT_THRESHOLD = 50 // GBP

/**
 * Critical multiplier: divergence >= this multiple of the threshold
 * is promoted to 'critical' severity.
 */
const CRITICAL_MULTIPLIER = 2.0

/**
 * Soft ceiling utilisation warning threshold (warn before actual breach).
 */
const CEILING_SOFT_WARNING_PCT = 0.90 // 90%

/**
 * Minimum supplier coverage ratio below which the BOM-vs-supplier
 * check is suppressed entirely (too sparse to be meaningful).
 */
const MIN_SUPPLIER_COVERAGE_FOR_CHECK = 0.60 // 60% of BOM lines

// ── Input types (what callers supply) ────────────────────────────────────

export interface BomLineForReconciliation {
    /** Unique ID of the bom_lines row. */
    id: string
    /** GBP cost per unit of this part. Null = not yet costed. */
    estimatedUnitCostGbp: number | null
    /** Quantity of this part per assembly. */
    quantity: number
    /** Which module sourced this part (for attribution). */
    sourceModuleId: string | null
}

export interface SupplierLineForReconciliation {
    /** The part ID this quote is for. */
    partId: string
    /** Quoted unit price in GBP. Null = no quote yet. */
    quotedUnitPriceGbp: number | null
    /** Quantity on the order line. */
    quantity: number
}

export interface AiCostEstimateForReconciliation {
    moduleId: string
    /** Finn's canonical total per unit for this module (includes labour).
     *  null means "not estimated" — distinct from 0 which means "actually
     *  zero cost" (Council fix 2C). */
    totalPerUnit: number | null
}

export interface ReconciliationInputs {
    /** Project identifier (used only for logging — not read by the pure function). */
    projectId: string
    /** Per-module cost estimates from Finn. */
    finnEstimates: AiCostEstimateForReconciliation[]
    /** Top-level BOM lines with costs. */
    bomLines: BomLineForReconciliation[]
    /** Supplier order lines with quotes. */
    supplierLines: SupplierLineForReconciliation[]
    /** Cost ceiling from the brief, or null. */
    briefCeilingGbp: number | null
}

// ── Pure computation ──────────────────────────────────────────────────────

/**
 * Compute the cost reconciliation result from the four independent sources.
 *
 * This function is pure: no I/O, no LLM calls, no side effects.
 * The caller (run-cost-reconciliation.ts) supplies pre-fetched data.
 *
 * @param inputs — The four data sources and project context.
 * @returns A structured CostReconciliationResult ready to persist.
 */
export function reconcileCosts(inputs: ReconciliationInputs): CostReconciliationResult {
    const { finnEstimates, bomLines, supplierLines, briefCeilingGbp } = inputs

    // ── Source totals ────────────────────────────────────────────────────

    // 1. Canonical total: sum of Finn's per-module estimates.
    //    DECISION (Council fix 2C): null totalPerUnit means "not estimated"
    //    — these modules are tracked separately as uncosted rather than
    //    contributing £0 to the sum. This prevents uncosted modules from
    //    silently deflating the canonical total.
    const costedEstimates = finnEstimates.filter(
        (e) => typeof e.totalPerUnit === "number",
    )
    const uncostedModuleIds = finnEstimates
        .filter((e) => e.totalPerUnit === null || e.totalPerUnit === undefined)
        .map((e) => e.moduleId)
    const canonicalTotalGbp =
        costedEstimates.length > 0
            ? costedEstimates.reduce((acc, e) => acc + (e.totalPerUnit as number), 0)
            : finnEstimates.length > 0
              ? null // All modules are uncosted — total is unknown, not zero
              : null

    // 2. BOM-derived total: parts-only (no labour).
    //    Count lines with missing costs separately for transparency.
    let bomSum = 0
    let bomLinesWithMissingCost = 0
    let bomLineCount = 0
    for (const line of bomLines) {
        bomLineCount++
        if (line.estimatedUnitCostGbp == null || line.estimatedUnitCostGbp <= 0) {
            bomLinesWithMissingCost++
        } else {
            bomSum += line.estimatedUnitCostGbp * line.quantity
        }
    }
    const bomDerivedTotalGbp = bomLineCount > 0 ? bomSum : null

    // 3. Supplier-derived total: only when coverage is sufficient.
    let supplierSum = 0
    let supplierLineCount = 0
    for (const line of supplierLines) {
        if (line.quotedUnitPriceGbp != null && line.quotedUnitPriceGbp > 0) {
            supplierSum += line.quotedUnitPriceGbp * line.quantity
            supplierLineCount++
        }
    }
    const supplierCoverageRatio =
        bomLineCount > 0 ? supplierLineCount / bomLineCount : null
    const supplierDerivedTotalGbp =
        supplierLineCount > 0 ? supplierSum : null

    const sources: CostReconciliationSources = {
        canonicalTotalGbp,
        bomDerivedTotalGbp,
        supplierDerivedTotalGbp,
        briefCeilingGbp,
        bomLineCount,
        bomLinesWithMissingCost,
        supplierLineCount,
        supplierCoverageRatio,
        uncostedModuleIds,
    }

    // ── Pairwise checks ──────────────────────────────────────────────────

    const checks: CostPairCheck[] = [
        buildPairCheck({
            label: "Finn estimate vs bill of materials",
            sourceA: canonicalTotalGbp,
            sourceB: bomDerivedTotalGbp,
            threshold: THRESHOLD_CANONICAL_VS_BOM,
            caveatMessage:
                "Finn's estimate includes assembly labour; the bill of materials is parts only. " +
                "A Finn total up to 15% higher than the bill of materials total is expected.",
            direction: "canonical_includes_labour",
        }),
        buildPairCheck({
            label: "Bill of materials vs supplier quotes",
            sourceA: bomDerivedTotalGbp,
            sourceB: supplierDerivedTotalGbp,
            threshold: THRESHOLD_BOM_VS_SUPPLIER,
            // Suppress this check when supplier coverage is too sparse.
            suppress:
                supplierCoverageRatio != null &&
                supplierCoverageRatio < MIN_SUPPLIER_COVERAGE_FOR_CHECK
                    ? `Supplier quotes cover only ${Math.round((supplierCoverageRatio ?? 0) * 100)}% of bill of materials lines — check suppressed until coverage reaches 60%.`
                    : undefined,
            caveatMessage:
                "Both sources are parts-only (no labour). A divergence over 10% may indicate " +
                "stale bill of materials estimates or supplier pricing that has changed since generation.",
        }),
    ]

    // ── Ceiling check ────────────────────────────────────────────────────

    const ceilingCheck = buildCeilingCheck({
        ceilingGbp: briefCeilingGbp,
        canonicalGbp: canonicalTotalGbp,
    })

    // ── Aggregate flags ──────────────────────────────────────────────────

    const hasWarnings =
        checks.some((c) => c.flagged) || ceilingCheck.breached || ceilingCheck.nearCeiling
    const hasCritical =
        checks.some((c) => c.severity === "critical") || ceilingCheck.breached

    const summaryMessage = buildSummaryMessage(checks, ceilingCheck, sources)

    return {
        computedAt: new Date().toISOString(),
        sources,
        checks,
        ceilingCheck,
        hasWarnings,
        hasCritical,
        summaryMessage,
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────

interface PairCheckOptions {
    label: string
    sourceA: number | null
    sourceB: number | null
    threshold: number
    /** When set, the check is skipped and this message explains why. */
    suppress?: string
    /** Contextual explanation injected into the message. */
    caveatMessage?: string
    /** Flags that sourceA legitimately includes labour — shown in message. */
    direction?: "canonical_includes_labour"
}

function buildPairCheck(opts: PairCheckOptions): CostPairCheck {
    const { label, sourceA, sourceB, threshold, suppress, caveatMessage } = opts

    // Both sources must be present to run the check.
    if (sourceA == null || sourceB == null) {
        const missingParts: string[] = []
        if (sourceA == null) missingParts.push("first source")
        if (sourceB == null) missingParts.push("second source")
        return {
            label,
            sourceA: sourceA ?? null,
            sourceB: sourceB ?? null,
            available: false,
            absGbp: null,
            pctDiff: null,
            flagged: false,
            severity: null,
            message: `Not available yet — ${missingParts.join(" and ")} not yet computed.`,
        }
    }

    // Suppress overrides availability.
    if (suppress) {
        return {
            label,
            sourceA,
            sourceB,
            available: false,
            absGbp: null,
            pctDiff: null,
            flagged: false,
            severity: null,
            message: suppress,
        }
    }

    const absGbp = Math.abs(sourceA - sourceB)
    const larger = Math.max(sourceA, sourceB)
    const pctDiff = larger > 0 ? (absGbp / larger) * 100 : 0

    // Suppress percentage check on tiny assemblies.
    const belowMinCost = Math.max(sourceA, sourceB) < MIN_COST_FOR_PCT_THRESHOLD

    let flagged = false
    let severity: CostDivergenceSeverity | null = null

    if (!belowMinCost && pctDiff > threshold * 100) {
        flagged = true
        severity =
            pctDiff > threshold * 100 * CRITICAL_MULTIPLIER ? "critical" : "warning"
    }

    const fmtGbp = (n: number) =>
        n >= 1_000_000
            ? `£${(n / 1_000_000).toFixed(2)}M`
            : n >= 1_000
              ? `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
              : `£${n.toFixed(2)}`

    let message: string
    if (belowMinCost) {
        message =
            `${label}: ${fmtGbp(sourceA)} vs ${fmtGbp(sourceB)} — assembly too small ` +
            `(under £${MIN_COST_FOR_PCT_THRESHOLD}) for percentage threshold to be meaningful.`
    } else if (!flagged) {
        message =
            `${label}: ${fmtGbp(sourceA)} vs ${fmtGbp(sourceB)} — within acceptable range ` +
            `(${pctDiff.toFixed(1)}%, threshold ${threshold * 100}%). ` +
            (caveatMessage ?? "")
    } else {
        const direction =
            sourceA > sourceB ? "first source is higher" : "second source is higher"
        message =
            `${label}: ${fmtGbp(sourceA)} vs ${fmtGbp(sourceB)} — ` +
            `${pctDiff.toFixed(1)}% divergence (threshold ${threshold * 100}%), ` +
            `${direction} by ${fmtGbp(absGbp)}. ` +
            (caveatMessage ?? "Investigate before relying on the canonical total.")
    }

    return { label, sourceA, sourceB, available: true, absGbp, pctDiff, flagged, severity, message }
}

interface CeilingCheckOptions {
    ceilingGbp: number | null
    canonicalGbp: number | null
}

function buildCeilingCheck(opts: CeilingCheckOptions): CeilingCheck {
    const { ceilingGbp, canonicalGbp } = opts

    if (ceilingGbp == null) {
        return {
            ceilingDeclared: false,
            ceilingGbp: null,
            canonicalGbp,
            breached: false,
            overageGbp: null,
            ceilingUtilisationPct: null,
            nearCeiling: false,
            message: "No cost ceiling declared in the brief — ceiling check skipped.",
        }
    }

    if (canonicalGbp == null) {
        return {
            ceilingDeclared: true,
            ceilingGbp,
            canonicalGbp: null,
            breached: false,
            overageGbp: null,
            ceilingUtilisationPct: null,
            nearCeiling: false,
            message: "Brief ceiling declared but Finn estimate not yet available — ceiling check skipped.",
        }
    }

    const fmtGbp = (n: number) =>
        n >= 1_000_000
            ? `£${(n / 1_000_000).toFixed(2)}M`
            : n >= 1_000
              ? `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
              : `£${n.toFixed(2)}`

    const overageGbp = canonicalGbp - ceilingGbp
    const utilisationPct = (canonicalGbp / ceilingGbp) * 100
    const breached = overageGbp > 0
    const nearCeiling = !breached && utilisationPct >= CEILING_SOFT_WARNING_PCT * 100

    let message: string
    if (breached) {
        message =
            `Budget ceiling breached: Finn estimates ${fmtGbp(canonicalGbp)} against a brief ceiling of ` +
            `${fmtGbp(ceilingGbp)} — ${fmtGbp(overageGbp)} over budget ` +
            `(${utilisationPct.toFixed(1)}% of ceiling). ` +
            `Review the brief target before presenting to investors.`
    } else if (nearCeiling) {
        message =
            `Close to ceiling: Finn estimates ${fmtGbp(canonicalGbp)} — ` +
            `${utilisationPct.toFixed(1)}% of the ${fmtGbp(ceilingGbp)} brief ceiling. ` +
            `Small cost increases could breach the target.`
    } else {
        message =
            `Within budget: ${fmtGbp(canonicalGbp)} against ceiling of ${fmtGbp(ceilingGbp)} ` +
            `(${utilisationPct.toFixed(1)}% utilised).`
    }

    return {
        ceilingDeclared: true,
        ceilingGbp,
        canonicalGbp,
        breached,
        overageGbp,
        ceilingUtilisationPct: utilisationPct,
        nearCeiling,
        message,
    }
}

function buildSummaryMessage(
    checks: CostPairCheck[],
    ceilingCheck: CeilingCheck,
    sources: CostReconciliationSources,
): string {
    if (ceilingCheck.breached) {
        const fmtGbp = (n: number) =>
            n >= 1_000 ? `£${Math.round(n).toLocaleString("en-GB")}` : `£${n.toFixed(2)}`
        return (
            `Budget ceiling breached by ${fmtGbp(ceilingCheck.overageGbp ?? 0)} — ` +
            `review the brief cost target before generating the final report.`
        )
    }

    const criticalChecks = checks.filter((c) => c.severity === "critical")
    const warningChecks = checks.filter((c) => c.flagged && c.severity !== "critical")

    if (criticalChecks.length > 0) {
        return (
            `${criticalChecks.length} critical cost discrepanc${criticalChecks.length === 1 ? "y" : "ies"} found ` +
            `between independent cost sources — investigate before relying on the Finn estimate.`
        )
    }

    if (warningChecks.length > 0) {
        return (
            `${warningChecks.length} cost divergence${warningChecks.length === 1 ? "" : "s"} detected ` +
            `between independent cost sources — minor discrepancies may reflect labour-inclusion differences.`
        )
    }

    const availableChecks = checks.filter((c) => c.available)
    if (availableChecks.length === 0) {
        // Not enough data yet to cross-check.
        const missingParts: string[] = []
        if (sources.bomDerivedTotalGbp == null) missingParts.push("bill of materials costs")
        if (sources.supplierDerivedTotalGbp == null) missingParts.push("supplier quotes")
        return `Cost reconciliation pending — ${missingParts.join(" and ")} not yet available.`
    }

    if (ceilingCheck.nearCeiling) {
        const uncostedSuffix =
            sources.uncostedModuleIds.length > 0
                ? ` (${sources.uncostedModuleIds.length} module${sources.uncostedModuleIds.length === 1 ? "" : "s"} not yet costed — actual total may be higher.)`
                : ""
        return `All cost sources agree — note the estimate is close to the brief's cost ceiling.${uncostedSuffix}`
    }

    // Council fix 2C: surface uncosted modules in the summary so founders
    // see that the total is incomplete rather than assuming all modules are
    // covered at their displayed cost.
    if (sources.uncostedModuleIds.length > 0) {
        return (
            `Cost sources within range, but ${sources.uncostedModuleIds.length} ` +
            `module${sources.uncostedModuleIds.length === 1 ? " has" : "s have"} ` +
            `not been costed yet — the total reflects only costed modules.`
        )
    }

    return "All available cost sources are within acceptable range of each other."
}

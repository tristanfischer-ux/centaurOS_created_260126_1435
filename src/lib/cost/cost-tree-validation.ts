/**
 * @file cost-tree-validation.ts — Post-assembly arithmetic validation for the
 * cost waterfall and bill-of-materials data.
 *
 * @description Loop 26 P3 / council finding A2 (unanimous): broken arithmetic
 * is the top credibility killer for hardware founders.
 *
 * Specific failures caught in Loop 26 HAPS PDF:
 *   Wing-Integrated Solar Array £430,560 — 104.8% of unit total £410,907.
 *   A single subsystem cannot exceed 100% of the total.
 *   Line-item arithmetic wrong: "6,800 cells × £60 = £430,560" is false
 *   (correct answer is £408,000). The embedded expression disagrees with
 *   the stated extended cost.
 *   Propulsion motor: £320 in the bill of materials vs £3,000 on the module
 *   page — a 9× discrepancy that went unreported.
 *
 * This module is a pure function — no I/O, no LLM calls, no side effects.
 * It is called after the cost waterfall is assembled (perModuleCost +
 * unitTotalGbp) and before PDF rendering. When validation fails the caller
 * receives a structured list of findings which are annotated as warnings
 * on the PDF output rather than suppressing the data.
 *
 * @related
 *   - Called from: src/actions/export-project-pdf.tsx (after cost aggregates)
 *   - Cost reconciliation:   src/lib/cost/cost-reconciliation.ts
 *   - Assembly dedup helper: src/lib/bom/assembly-dedup.ts
 *   - Feasibility verdict:   src/lib/feasibility/compute-verdict.ts
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Severity of a validation finding. */
export type ValidationSeverity = "warning" | "critical"

/** A single arithmetic validation finding to annotate on the PDF. */
export interface CostValidationFinding {
    /** Machine-readable code for the type of failure. */
    code:
        | "SUBSYSTEM_EXCEEDS_TOTAL"
        | "SUBTREE_SUM_MISMATCH"
        | "LINE_ITEM_ARITHMETIC"
        | "BOM_MODULE_DISCREPANCY"
    severity: ValidationSeverity
    /** Human-readable, founder-safe description (no jargon, no acronyms). */
    message: string
    /**
     * Structured detail for programmatic use (e.g. to place the finding
     * next to the relevant table row in the PDF).
     */
    detail: Record<string, unknown>
}

/** Aggregated result returned by validateCostTree. */
export interface CostTreeValidationResult {
    /** All findings, ordered critical-first then warning. */
    findings: CostValidationFinding[]
    /** True when any finding is present (convenience shorthand). */
    hasFindings: boolean
    /** True when any critical finding is present. */
    hasCritical: boolean
    /** One-sentence founder-safe summary. Empty string when no findings. */
    summaryMessage: string
}

// ── Input shapes ──────────────────────────────────────────────────────────────

/** Per-module cost entry as assembled by the PDF pipeline. */
export interface ModuleCostEntry {
    /** Display name of the module (used as the key for bill-of-materials cross-check). */
    moduleName: string
    /**
     * De-duplicated parts-table roll-up (preferred), or Finn estimate.
     * This is the value used in the waterfall display.
     */
    totalGbp: number | null
    /**
     * Finn's totalPerUnit from ai_cost_estimates — kept separately so the
     * cross-check can compare the two sources even when partsTotal wins the
     * display race.
     */
    finnTotalGbp: number | null
}

/**
 * A single line item from Finn's per-module cost breakdown.
 * The name field may contain embedded arithmetic like
 * "6,800 cells × £60 = £430,560" which this module parses and validates.
 */
export interface CostLineItem {
    /** Line-item name — may contain embedded quantity × unit-price expressions. */
    name: string
    /** The cost value that Finn recorded for this line (GBP). */
    cost: number
    /** Which module this line item belongs to (for attribution in findings). */
    moduleName: string
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/**
 * Maximum tolerated fraction of unit total that a single subsystem may
 * contribute. 1.0 = 100%. A module that IS the only module and equals the
 * total is valid — the check fires on any module that exceeds the total
 * which is always an error regardless of module count.
 */
const MAX_SUBSYSTEM_FRACTION_OF_TOTAL = 1.0

/**
 * Tolerance for checking that sum(module costs) approximates unitTotalGbp.
 * 1% accommodates floating-point rounding across many rows.
 */
const SUBTREE_SUM_TOLERANCE = 0.01

/**
 * Maximum acceptable discrepancy between the parts-table roll-up and
 * Finn's totalPerUnit for the same module.
 * Anything above the warning threshold is reported; above critical it
 * is promoted to critical severity.
 */
const BOM_MODULE_DISCREPANCY_WARNING_FRACTION = 0.10
const BOM_MODULE_DISCREPANCY_CRITICAL_FRACTION = 0.15

/**
 * Minimum total cost below which percentage checks are suppressed.
 * A 5% divergence on a £30 component is noise.
 */
const MIN_COST_FOR_CHECKS_GBP = 100

// ── Line-item arithmetic parser ───────────────────────────────────────────────

/**
 * Attempt to parse and validate an embedded arithmetic expression from a
 * Finn line-item name string.
 *
 * Patterns matched (case-insensitive, commas and spaces flexible):
 *   "6,800 cells × £60 = £430,560"
 *   "24 × £3,000 = £72,000"
 *   "12 units × 450 = 5400"
 *   "N × £P = £E"  (any numeric N, P, E)
 *
 * Returns null when no recognised pattern is found. Most line items do not
 * embed arithmetic and this is normal.
 *
 * Returns a finding when the embedded expression is mathematically wrong
 * (N × P ≠ E within a 1 GBP rounding tolerance) or when the recorded cost
 * field disagrees with what the expression states.
 */
function parseLineItemArithmetic(
    name: string,
    recordedCost: number,
    moduleName: string,
): CostValidationFinding | null {
    // Pattern: <qty> [× x *] [£]<unit_price> [= [£]<extended>]
    // Quantities and prices may have comma thousands-separators.
    const ARITH_PATTERN =
        /(\d[\d,]*(?:\.\d+)?)(?:\s+\w+)*?\s*[×x*]\s*£?\s*(\d[\d,]*(?:\.\d+)?)\s*=\s*£?\s*(\d[\d,]*(?:\.\d+)?)/i

    const match = ARITH_PATTERN.exec(name)
    if (match === null) return null

    const qty = parseFloat(match[1].replace(/,/g, ""))
    const unitPrice = parseFloat(match[2].replace(/,/g, ""))
    const embeddedExtended = parseFloat(match[3].replace(/,/g, ""))

    if (!Number.isFinite(qty) || !Number.isFinite(unitPrice) || !Number.isFinite(embeddedExtended)) {
        return null
    }

    const expectedExtended = qty * unitPrice

    // Check A: is the embedded arithmetic itself correct?
    const arithmeticError = Math.abs(expectedExtended - embeddedExtended)
    if (arithmeticError > 1) {
        return {
            code: "LINE_ITEM_ARITHMETIC",
            severity: "critical",
            message:
                `Line item "${name}" in module "${moduleName}": ` +
                `the embedded expression (${qty.toLocaleString("en-GB")} × ` +
                `£${unitPrice.toLocaleString("en-GB", { minimumFractionDigits: 0 })}) ` +
                `should equal £${Math.round(expectedExtended).toLocaleString("en-GB")} ` +
                `but the expression states £${Math.round(embeddedExtended).toLocaleString("en-GB")}. ` +
                `Difference: £${Math.round(arithmeticError).toLocaleString("en-GB")}. ` +
                `Re-run the cost specialist to correct this line before relying on any total that includes it.`,
            detail: {
                moduleName,
                lineName: name,
                qty,
                unitPrice,
                embeddedExtended,
                expectedExtended,
                arithmeticError,
                recordedCost,
            },
        }
    }

    // Check B: does the recorded cost agree with what the expression says?
    const recordedError = Math.abs(recordedCost - embeddedExtended)
    if (recordedError > 1) {
        return {
            code: "LINE_ITEM_ARITHMETIC",
            severity: "warning",
            message:
                `Line item "${name}" in module "${moduleName}": ` +
                `the embedded expression states £${Math.round(embeddedExtended).toLocaleString("en-GB")} ` +
                `but the recorded cost field is £${Math.round(recordedCost).toLocaleString("en-GB")}. ` +
                `Difference: £${Math.round(recordedError).toLocaleString("en-GB")}. ` +
                `The recorded cost field is used in all totals — verify which value is correct.`,
            detail: {
                moduleName,
                lineName: name,
                qty,
                unitPrice,
                embeddedExtended,
                recordedCost,
                recordedError,
            },
        }
    }

    return null
}

// ── Main validation function ──────────────────────────────────────────────────

/**
 * Validate the assembled cost tree for arithmetic consistency.
 *
 * Run this AFTER the cost waterfall is assembled (perModuleCost + unitTotalGbp)
 * and BEFORE PDF rendering. Findings are annotated on the PDF as warnings
 * rather than suppressing the data.
 *
 * Four checks:
 *   (1) No single subsystem may exceed 100% of the unit total.
 *   (2) Sum of module costs must be within 1% of unitTotalGbp.
 *   (3) Any line item with an embedded "N × £P = £E" expression is parsed
 *       and the arithmetic is verified.
 *   (4) Parts-table roll-up vs Finn per-module estimate: discrepancy > 10%.
 *
 * @param perModuleCost — One entry per module, as assembled by the pipeline.
 * @param unitTotalGbp  — The de-duplicated parts-table total for the whole unit.
 * @param lineItems     — Optional Finn cost breakdown lines for arithmetic check.
 * @returns A structured validation result with all findings.
 */
export function validateCostTree(
    perModuleCost: ModuleCostEntry[],
    unitTotalGbp: number,
    lineItems: CostLineItem[] = [],
): CostTreeValidationResult {
    const findings: CostValidationFinding[] = []

    // Suppress percentage-based checks when totals are too small to matter.
    const skipPctChecks = unitTotalGbp < MIN_COST_FOR_CHECKS_GBP

    // ── Check 1: Subsystem exceeds 100% of total ──────────────────────────
    //
    // A single subsystem cannot exceed the unit total. The HAPS Wing-Integrated
    // Solar Array at 104.8% of total (Loop 26 P3) is the canonical example.
    if (!skipPctChecks && unitTotalGbp > 0) {
        for (const m of perModuleCost) {
            if (m.totalGbp == null || m.totalGbp <= 0) continue
            const fraction = m.totalGbp / unitTotalGbp
            if (fraction > MAX_SUBSYSTEM_FRACTION_OF_TOTAL) {
                findings.push({
                    code: "SUBSYSTEM_EXCEEDS_TOTAL",
                    severity: "critical",
                    message:
                        `Module "${m.moduleName}" costs ` +
                        `£${Math.round(m.totalGbp).toLocaleString("en-GB")} ` +
                        `which is ${(fraction * 100).toFixed(1)}% of the unit total ` +
                        `(£${Math.round(unitTotalGbp).toLocaleString("en-GB")}). ` +
                        `A single subsystem cannot exceed 100% of the total. ` +
                        `This indicates either a double-counted assembly row or a ` +
                        `misassigned part cost. ` +
                        `Re-run the bill-of-materials generator to correct this ` +
                        `before presenting to investors.`,
                    detail: {
                        moduleName: m.moduleName,
                        totalGbp: m.totalGbp,
                        unitTotalGbp,
                        fractionOfTotal: fraction,
                        pctOfTotal: fraction * 100,
                    },
                })
            }
        }
    }

    // ── Check 2: Sum of module costs approximates unit total ──────────────
    //
    // Both perModuleCost and unitTotalGbp derive from the same parts-table
    // roll-up and should agree within rounding. A mismatch > 1% indicates the
    // pipeline assembled the two figures from different sources.
    if (!skipPctChecks && unitTotalGbp > 0) {
        const moduleSum = perModuleCost.reduce(
            (acc, m) => acc + (m.totalGbp ?? 0),
            0,
        )
        if (moduleSum > 0) {
            const gap = Math.abs(moduleSum - unitTotalGbp) / unitTotalGbp
            if (gap > SUBTREE_SUM_TOLERANCE) {
                findings.push({
                    code: "SUBTREE_SUM_MISMATCH",
                    severity: gap > 0.05 ? "critical" : "warning",
                    message:
                        `The per-module cost totals sum to ` +
                        `£${Math.round(moduleSum).toLocaleString("en-GB")} ` +
                        `but the unit total is ` +
                        `£${Math.round(unitTotalGbp).toLocaleString("en-GB")} ` +
                        `— a ${(gap * 100).toFixed(1)}% discrepancy. ` +
                        `The unit total and module breakdown should agree within 1%. ` +
                        `This may indicate that some modules use a Finn estimate rather ` +
                        `than a bill-of-materials roll-up, causing the two sources to diverge.`,
                    detail: {
                        moduleSum,
                        unitTotalGbp,
                        gapPct: gap * 100,
                        moduleCount: perModuleCost.length,
                    },
                })
            }
        }
    }

    // ── Check 3: Line-item arithmetic ─────────────────────────────────────
    //
    // Parse line items that embed "N × £P = £E" expressions and verify the
    // arithmetic. The HAPS "6,800 cells × £60 = £430,560" example (correct
    // answer: £408,000) is the canonical target.
    for (const item of lineItems) {
        const finding = parseLineItemArithmetic(item.name, item.cost, item.moduleName)
        if (finding !== null) findings.push(finding)
    }

    // ── Check 4: Bill-of-materials roll-up vs Finn per-module estimate ────
    //
    // When both sources are available, compare the parts-table roll-up
    // (totalGbp) vs Finn's totalPerUnit (finnTotalGbp).
    // Discrepancy > 10% is a warning; > 15% is critical.
    // This catches the propulsion motor £320 (bill of materials) vs
    // £3,000 (Finn) case from Loop 26.
    if (!skipPctChecks) {
        for (const m of perModuleCost) {
            if (m.totalGbp == null || m.finnTotalGbp == null) continue
            if (m.totalGbp <= 0 || m.finnTotalGbp <= 0) continue

            const larger = Math.max(m.totalGbp, m.finnTotalGbp)
            const gap = Math.abs(m.totalGbp - m.finnTotalGbp) / larger

            if (gap > BOM_MODULE_DISCREPANCY_WARNING_FRACTION) {
                const isCritical = gap > BOM_MODULE_DISCREPANCY_CRITICAL_FRACTION
                const direction =
                    m.totalGbp > m.finnTotalGbp
                        ? "the bill of materials is higher"
                        : "Finn's estimate is higher"
                findings.push({
                    code: "BOM_MODULE_DISCREPANCY",
                    severity: isCritical ? "critical" : "warning",
                    message:
                        `Module "${m.moduleName}": bill of materials roll-up is ` +
                        `£${Math.round(m.totalGbp).toLocaleString("en-GB")} ` +
                        `but Finn's estimate is ` +
                        `£${Math.round(m.finnTotalGbp).toLocaleString("en-GB")} ` +
                        `— a ${(gap * 100).toFixed(1)}% gap (${direction}). ` +
                        `The bill of materials is the canonical source. ` +
                        `Finn's estimate may be outdated — re-run the cost specialist ` +
                        `after updating the bill of materials.`,
                    detail: {
                        moduleName: m.moduleName,
                        bomTotal: m.totalGbp,
                        finnTotal: m.finnTotalGbp,
                        gapPct: gap * 100,
                        direction,
                    },
                })
            }
        }
    }

    // ── Aggregate ──────────────────────────────────────────────────────────
    // Sort: critical before warning, then stable by code for consistent output.
    findings.sort((a, b) => {
        if (a.severity === b.severity) return a.code.localeCompare(b.code)
        return a.severity === "critical" ? -1 : 1
    })

    const hasCritical = findings.some((f) => f.severity === "critical")
    const hasFindings = findings.length > 0

    let summaryMessage = ""
    if (hasCritical) {
        const critCount = findings.filter((f) => f.severity === "critical").length
        summaryMessage =
            `${critCount} critical cost arithmetic error${critCount === 1 ? "" : "s"} detected — ` +
            `at least one figure in this report cannot be relied upon until corrected. ` +
            `See the cost waterfall annotations below.`
    } else if (hasFindings) {
        summaryMessage =
            `${findings.length} cost consistency ` +
            `warning${findings.length === 1 ? "" : "s"} — ` +
            `minor discrepancies detected between cost sources. ` +
            `The bill of materials roll-up is the canonical figure in all cases.`
    }

    return { findings, hasFindings, hasCritical, summaryMessage }
}

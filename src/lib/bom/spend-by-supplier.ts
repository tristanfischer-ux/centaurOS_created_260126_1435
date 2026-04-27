/**
 * @file spend-by-supplier.ts — modelled spend per supplier for the
 * Suppliers section of the PDF report.
 *
 * Tristan-flagged 2026-04-27: founders should see at a glance how much
 * of the bill-of-materials cost concentrates on each supplier so they
 * can prioritise vendor due diligence.
 *
 * Allocation method: primary-nominee. Each bill-of-materials part is
 * assigned to the highest-scoring matched supplier (matchScore >= 30)
 * as its modelled primary. That supplier gets 100 percent of the part
 * cost in the spend table. Other shortlisted suppliers for the same
 * part get zero in this table; they still appear in the per-supplier
 * cards below.
 *
 * Trade-offs versus the alternatives are documented in
 * /Users/tristanfischer/Downloads/forge-demos/SUPPLIER-SPEND-TABLE-PLAN.md
 * (council-validated 2026-04-27, 3-of-3 unanimous).
 *
 * The helper is pure: no I/O, no side effects.
 */

import { dedupAssemblyRollUp } from "./assembly-dedup"

export type SpendPartLike = {
    partNumber?: string | null
    estimatedUnitCostGbp?: number | null
    sourceModuleName?: string | null
    name?: string | null
    massKg?: number | null
}

export type SpendSupplierLike = {
    name: string
    matchedPartNumbers: string[]
    matchScore: number | null
    websiteUrl?: string | null
    hq?: string | null
}

export type SpendRow = {
    supplier: SpendSupplierLike
    partsAsPrimary: number
    soleSourceParts: number
    modelledSpendGbp: number
    spendPct: number
    matchScore: number | null
    /** True when modelled spend / total >= 0.30 (procurement concentration). */
    concentrationRiskAmber: boolean
}

export type SpendSummary = {
    rows: SpendRow[]
    /** Total of effective costs across the deduped bill-of-materials. */
    bomTotalGbp: number
    /** Number of parts that had no credible supplier (no candidate >= 30 score). */
    unclaimedPartCount: number
    /** Sum of unclaimedPartCount parts' costs. */
    unclaimedSpendGbp: number
    /** True when the rendered table was capped — there are more suppliers than the cap. */
    capped: boolean
    /** Total visible-shortlist suppliers before cap. */
    rowCountBeforeCap: number
}

const MATCH_SCORE_THRESHOLD = 30
const CONCENTRATION_RISK_THRESHOLD_PCT = 30
const TOP_N_CAP = 15

/**
 * Compute the modelled spend per supplier and aggregate metadata for
 * the Suppliers section's spend-by-supplier summary table.
 *
 * Inputs:
 *   - parts: every bill-of-materials row (visible, after dedup happens
 *     internally)
 *   - visibleSuppliers: suppliers that survived the L9-P4 phantom
 *     filter and the L13-P4 empty-matched-parts filter
 */
export function buildSpendSummary<
    P extends SpendPartLike,
    S extends SpendSupplierLike,
>(parts: P[], visibleSuppliers: S[]): SpendSummary {
    // Step 1: dedup assembly rows so an assembly + its constituents do
    // not double-count.
    const dedupedRollUp = dedupAssemblyRollUp(parts)
    let bomTotalGbp = 0
    for (const v of dedupedRollUp.effectiveCost) bomTotalGbp += v

    // Step 2: build a map from partNumber → effective cost.
    const partCostMap = new Map<string, number>()
    for (let i = 0; i < parts.length; i++) {
        const pn = typeof parts[i].partNumber === "string" ? (parts[i].partNumber as string) : null
        if (!pn) continue
        partCostMap.set(pn, dedupedRollUp.effectiveCost[i])
    }

    // Step 3: for each part, find the primary supplier — highest
    // matchScore >= MATCH_SCORE_THRESHOLD.
    const primarySupplierByPart = new Map<string, S>()
    for (const part of parts) {
        const pn = typeof part.partNumber === "string" ? part.partNumber : null
        if (!pn) continue
        // Skip parts whose effective cost is 0 (assembly parents that
        // were dropped by the dedup) — they cannot contribute spend.
        const cost = partCostMap.get(pn)
        if (typeof cost !== "number" || cost <= 0) continue
        let best: S | null = null
        let bestScore = -Infinity
        for (const s of visibleSuppliers) {
            if (!s.matchedPartNumbers.includes(pn)) continue
            const score = typeof s.matchScore === "number" ? s.matchScore : 0
            if (score < MATCH_SCORE_THRESHOLD) continue
            if (score > bestScore) {
                bestScore = score
                best = s
            }
        }
        if (best) primarySupplierByPart.set(pn, best)
    }

    // Step 4: aggregate per supplier.
    const rowsRaw: SpendRow[] = []
    for (const supplier of visibleSuppliers) {
        let modelledSpend = 0
        let partsAsPrimary = 0
        let soleSourceParts = 0
        for (const [partNumber, primary] of primarySupplierByPart) {
            if (primary !== supplier) continue
            partsAsPrimary += 1
            modelledSpend += partCostMap.get(partNumber) ?? 0
        }
        // Sole-source: this supplier is the ONLY candidate (>=30 score)
        // matching the part. Reported regardless of nomination — sole-
        // source matters even when this supplier is also the primary.
        for (const partNumber of supplier.matchedPartNumbers) {
            const candidates = visibleSuppliers.filter(
                (s) =>
                    s.matchedPartNumbers.includes(partNumber) &&
                    typeof s.matchScore === "number" &&
                    s.matchScore >= MATCH_SCORE_THRESHOLD,
            )
            if (candidates.length === 1 && candidates[0] === supplier) {
                soleSourceParts += 1
            }
        }
        if (partsAsPrimary === 0 && soleSourceParts === 0) continue
        const spendPct =
            bomTotalGbp > 0 ? (modelledSpend / bomTotalGbp) * 100 : 0
        rowsRaw.push({
            supplier,
            partsAsPrimary,
            soleSourceParts,
            modelledSpendGbp: modelledSpend,
            spendPct,
            matchScore: typeof supplier.matchScore === "number" ? supplier.matchScore : null,
            concentrationRiskAmber: spendPct >= CONCENTRATION_RISK_THRESHOLD_PCT,
        })
    }

    // Step 5: sort by spend desc, ties broken by matchScore desc.
    rowsRaw.sort((a, b) => {
        if (b.modelledSpendGbp !== a.modelledSpendGbp) {
            return b.modelledSpendGbp - a.modelledSpendGbp
        }
        return (b.matchScore ?? 0) - (a.matchScore ?? 0)
    })

    // Step 6: unclaimed parts.
    let unclaimedSpendGbp = 0
    let unclaimedPartCount = 0
    for (const [pn, cost] of partCostMap) {
        if (cost <= 0) continue
        if (!primarySupplierByPart.has(pn)) {
            unclaimedSpendGbp += cost
            unclaimedPartCount += 1
        }
    }

    return {
        rows: rowsRaw.slice(0, TOP_N_CAP),
        bomTotalGbp,
        unclaimedPartCount,
        unclaimedSpendGbp,
        capped: rowsRaw.length > TOP_N_CAP,
        rowCountBeforeCap: rowsRaw.length,
    }
}

export const SPEND_BY_SUPPLIER_CONSTANTS = {
    MATCH_SCORE_THRESHOLD,
    CONCENTRATION_RISK_THRESHOLD_PCT,
    TOP_N_CAP,
}

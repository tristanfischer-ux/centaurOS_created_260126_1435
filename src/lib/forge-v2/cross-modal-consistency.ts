/**
 * @file cross-modal-consistency.ts — Post-illustration cross-modal gate.
 *
 * @description Deterministic check that fires AFTER system illustration
 * generation and BEFORE supplier matching. Catches divergences between
 * the three independent representations of the same design that exist in
 * parallel after the illustration stage completes:
 *
 *   1. Module keyParts[] declarations (what Max wrote)
 *   2. BOM master rows (what the BOM generator produced)
 *   3. Fang layout placements in dimension_sheet.placements (Fang spatial)
 *
 * Loop 24 evidence: BOM count and illustration object count diverged on
 * 4 of 5 demos. A founder reading the PDF sees one count in the BOM table,
 * a different visual count in the illustration, a third count in the Fang
 * layout description.
 *
 *   - Vertical Farm: illustration shows 4 tiers but BOM rows imply 6.
 *   - Desalination: CIP module disappeared from BOM but cost stayed in
 *     waterfall.
 *
 * No LLM is involved — every check is grounded in structured data already
 * present on the project. The verdict is reproducible and auditable.
 *
 * @related
 *   - Autopilot wiring: src/app/api/autopilot-step/route.ts —
 *     generateIllustration case, post-illustration block
 *   - Feasibility verdict: src/lib/feasibility/compute-verdict.ts —
 *     cross_modal_consistency axis added to VerdictAxis
 *   - Proofreader (canonical verdict writer): src/actions/specialists/run-proofreader.ts —
 *     runCrossModalCheck called before computeFeasibilityVerdict so blockers
 *     land in feasibility_verdict.fails via the proofreader write path
 *   - Tests: src/lib/forge-v2/__tests__/cross-modal-consistency.test.ts
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Inputs to the cross-modal check.
 *
 * All fields already exist on cad_lab_projects JSONB columns — the caller
 * reads them from the database and passes them here. No new columns required.
 */
export interface CrossModalInput {
    /**
     * The project's modules array (from cad_lab_projects.modules).
     * Each module has an id, name, and a keyParts[] array.
     */
    modules: Array<{
        id: string
        name?: string | null
        keyParts?: unknown[] | null
    }>
    /**
     * BOM master rows grouped by source_module_id.
     * Key: source_module_id (matches module.id).
     * Value: count of part rows for that module.
     *
     * Derived from `parts` table: SELECT source_module_id, COUNT(*) FROM parts
     * WHERE cad_lab_project_id = $1 GROUP BY source_module_id.
     */
    bomPartCountByModuleId: Record<string, number>
    /**
     * Total canonical unit cost from the de-duplicated BOM parts roll-up
     * (the same value the PDF stat tile uses). Used for the system-level
     * cost roll-up check.
     *
     * When null the cost check is skipped (no data).
     */
    canonicalBomTotalGbp: number | null
    /**
     * Sum of per-module cost roll-ups from ai_cost_estimates JSONB.
     * Used for the system-level cost divergence check.
     *
     * When null the cost check is skipped.
     */
    finnModuleTotalGbp: number | null
    /**
     * Layout placements from Fang's spatial plan
     * (dimension_sheet.placements or spatial_plan.placements).
     *
     * Key: module id or name string.
     * Value: count of discrete placement instances for that module.
     *
     * When null or empty the fang_layout_count check is skipped.
     */
    fangLayoutPlacementsByModuleId: Record<string, number> | null
    /**
     * The system_illustration_url for the project.
     *
     * When present it indicates the illustration stage ran. Object-count
     * metadata is NOT extractable from a URL alone, so the illustration
     * check is always skipped (logged as a warning rather than a blocker).
     * Future work: if structured illustration metadata is added to the
     * project, it would be passed here.
     */
    systemIllustrationUrl: string | null
}

export type CrossModalAxis =
    | "module_part_count"
    | "system_cost_rollup"
    | "fang_layout_count"
    | "illustration_object_count"

export interface CrossModalBlocker {
    module_id: string | null
    axis: CrossModalAxis
    expected: number
    actual: number
    divergence_pct: number
    explanation: string
}

export interface CrossModalWarning {
    axis: CrossModalAxis | "skipped"
    explanation: string
}

export interface CrossModalVerdict {
    passed: boolean
    blockers: CrossModalBlocker[]
    warnings: CrossModalWarning[]
    /** Semver string to track which version of the check produced this verdict. */
    cross_modal_version: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Divergence threshold for per-module part count checks.
 *
 * A module whose BOM row count differs from its keyParts[] count by more
 * than this fraction is a BLOCKER. Examples:
 *   - 5 keyParts, 3 BOM rows → 40% short → BLOCKER
 *   - 5 keyParts, 7 BOM rows → 40% over  → BLOCKER
 *   - 5 keyParts, 5 BOM rows → 0%        → OK
 *   - 5 keyParts, 6 BOM rows → 20% over  → BLOCKER (20% > 10%)
 *   - 5 keyParts, 4 BOM rows → 20% short → BLOCKER (20% > 10%)
 */
const MODULE_PART_COUNT_BLOCKER_THRESHOLD = 0.1

/**
 * Divergence threshold for the system-level cost roll-up check.
 *
 * When the canonical BOM total and Finn's per-module total diverge by more
 * than 1%, a blocker is fired. The two sources should agree because they
 * describe the same system — divergence indicates a stale Finn run or a
 * BOM update that didn't re-trigger costing.
 */
const SYSTEM_COST_ROLLUP_BLOCKER_THRESHOLD = 0.01

/**
 * Divergence threshold for Fang layout placement count checks.
 *
 * Uses the same 10% threshold as the module part count check.
 */
const FANG_LAYOUT_COUNT_BLOCKER_THRESHOLD = 0.1

/** Current check version — bump when logic changes break backwards compatibility. */
const CROSS_MODAL_VERSION = "1.0.0"

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Run the cross-modal consistency gate.
 *
 * Pure function — reads input, emits verdict. No I/O, no side effects.
 * Safe to call from the autopilot step handler AND from tests.
 */
export function runCrossModalCheck(input: CrossModalInput): CrossModalVerdict {
    const blockers: CrossModalBlocker[] = []
    const warnings: CrossModalWarning[] = []

    // ── 1. Per-module keyParts[] vs BOM row count ─────────────────────
    for (const mod of input.modules) {
        const moduleId = mod.id
        const moduleName = typeof mod.name === "string" && mod.name.length > 0
            ? mod.name
            : moduleId

        const keyPartsCount = Array.isArray(mod.keyParts) ? mod.keyParts.length : null
        const bomCount = input.bomPartCountByModuleId[moduleId] ?? null

        if (keyPartsCount === null || keyPartsCount === 0) {
            // No keyParts declared — nothing to check. This is a WARNING not
            // a BLOCKER because Max may legitimately leave keyParts empty for
            // ancillary or structural modules.
            warnings.push({
                axis: "module_part_count",
                explanation: `Module "${moduleName}" (${moduleId}) has no keyParts[] declared — cannot check BOM consistency.`,
            })
            continue
        }

        if (bomCount === null) {
            // Module has keyParts but no BOM rows at all — this IS a blocker
            // because Finn/PDF will have cost for this module but nothing in
            // the BOM. However the module_id mapping may have failed (BOM
            // generator uses a different key than the module id). Emit a
            // WARNING not a BLOCKER to be defensive — the brief spec says
            // "missing mapping → WARNING not BLOCKER".
            warnings.push({
                axis: "module_part_count",
                explanation: `Module "${moduleName}" (${moduleId}) has ${keyPartsCount} keyParts but no BOM rows with source_module_id="${moduleId}" — module_id mapping may have failed.`,
            })
            continue
        }

        const divergencePct = computeDivergencePct(keyPartsCount, bomCount)
        if (divergencePct > MODULE_PART_COUNT_BLOCKER_THRESHOLD) {
            blockers.push({
                module_id: moduleId,
                axis: "module_part_count",
                expected: keyPartsCount,
                actual: bomCount,
                divergence_pct: divergencePct,
                explanation:
                    `Module "${moduleName}" declares ${keyPartsCount} part class${keyPartsCount !== 1 ? "es" : ""} ` +
                    `in keyParts[] but the BOM master has ${bomCount} row${bomCount !== 1 ? "s" : ""} ` +
                    `for source_module_id="${moduleId}" ` +
                    `— divergence ${(divergencePct * 100).toFixed(0)}% exceeds the ${(MODULE_PART_COUNT_BLOCKER_THRESHOLD * 100).toFixed(0)}% threshold.`,
            })
        }
    }

    // ── 2. Fang layout placement count vs module keyParts count ──────
    if (
        input.fangLayoutPlacementsByModuleId !== null &&
        Object.keys(input.fangLayoutPlacementsByModuleId).length > 0
    ) {
        for (const mod of input.modules) {
            const moduleId = mod.id
            const moduleName = typeof mod.name === "string" && mod.name.length > 0
                ? mod.name
                : moduleId

            const keyPartsCount = Array.isArray(mod.keyParts) ? mod.keyParts.length : null
            const layoutCount = input.fangLayoutPlacementsByModuleId[moduleId] ?? null

            if (keyPartsCount === null || keyPartsCount === 0 || layoutCount === null) {
                // Skip — no basis for comparison.
                continue
            }

            const divergencePct = computeDivergencePct(keyPartsCount, layoutCount)
            if (divergencePct > FANG_LAYOUT_COUNT_BLOCKER_THRESHOLD) {
                blockers.push({
                    module_id: moduleId,
                    axis: "fang_layout_count",
                    expected: keyPartsCount,
                    actual: layoutCount,
                    divergence_pct: divergencePct,
                    explanation:
                        `Module "${moduleName}" has ${keyPartsCount} keyPart${keyPartsCount !== 1 ? "s" : ""} ` +
                        `but Fang's spatial layout shows ${layoutCount} placement${layoutCount !== 1 ? "s" : ""} ` +
                        `— divergence ${(divergencePct * 100).toFixed(0)}% exceeds the ${(FANG_LAYOUT_COUNT_BLOCKER_THRESHOLD * 100).toFixed(0)}% threshold.`,
                })
            }
        }
    }

    // ── 3. System-level cost roll-up: canonical BOM vs Finn per-module total
    if (
        input.canonicalBomTotalGbp !== null &&
        input.canonicalBomTotalGbp > 0 &&
        input.finnModuleTotalGbp !== null &&
        input.finnModuleTotalGbp > 0
    ) {
        const divergencePct = computeDivergencePct(
            input.finnModuleTotalGbp,
            input.canonicalBomTotalGbp,
        )
        if (divergencePct > SYSTEM_COST_ROLLUP_BLOCKER_THRESHOLD) {
            blockers.push({
                module_id: null,
                axis: "system_cost_rollup",
                expected: input.finnModuleTotalGbp,
                actual: input.canonicalBomTotalGbp,
                divergence_pct: divergencePct,
                explanation:
                    `System cost roll-up divergence: Finn per-module total is ` +
                    `£${formatGbp(input.finnModuleTotalGbp)} but the canonical BOM parts total is ` +
                    `£${formatGbp(input.canonicalBomTotalGbp)} — ` +
                    `divergence ${(divergencePct * 100).toFixed(1)}% exceeds the 1% threshold. ` +
                    `The BOM may have been updated after Finn ran — trigger a Finn cost recalculation.`,
            })
        }
    }

    // ── 4. Illustration object count ─────────────────────────────────
    //
    // The system_illustration_url is a storage URL — there is no structured
    // object-count metadata extractable from it without calling a vision
    // model. Skip the quantitative check and emit a WARNING so the audit
    // trail shows the check was considered but deferred.
    //
    // When/if the illustration stage writes structured metadata (e.g. an
    // `illustration_object_count` JSONB column), upgrade this to a BLOCKER
    // check by comparing that count against sum(modules[].keyParts.length).
    if (input.systemIllustrationUrl !== null) {
        warnings.push({
            axis: "illustration_object_count",
            explanation:
                "Illustration object count check skipped — system_illustration_url is a storage URL " +
                "with no structured object-count metadata. Add illustration_object_count JSONB metadata " +
                "to enable quantitative cross-modal comparison against BOM part counts.",
        })
    }

    return {
        passed: blockers.length === 0,
        blockers,
        warnings,
        cross_modal_version: CROSS_MODAL_VERSION,
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the relative divergence between an expected and actual count.
 *
 * Returns a value in [0, ∞). A divergence of 0.10 means 10% discrepancy.
 * Uses the larger of the two values as the denominator to make the measure
 * symmetric — a 5 → 3 divergence and a 3 → 5 divergence both report 40%.
 */
function computeDivergencePct(expected: number, actual: number): number {
    if (expected === actual) return 0
    const base = Math.max(Math.abs(expected), Math.abs(actual))
    if (base === 0) return 0
    return Math.abs(expected - actual) / base
}

function formatGbp(n: number): string {
    return Math.round(n).toLocaleString("en-GB")
}

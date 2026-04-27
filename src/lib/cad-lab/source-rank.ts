/**
 * @file source-rank.ts — canonical-ledger source precedence.
 *
 * @description Loop 16 council unanimity (8/8) said canonical numerical values
 * must carry their source so a downstream specialist (or a Fang post-review
 * patch) can deterministically decide whether to overwrite. Higher rank wins;
 * equal rank is "latest write wins" with a warning.
 *
 * Order (highest → lowest) was synthesised from 8 council responses:
 *   - human_override          100  (manual founder lock — never auto-overwritten)
 *   - applied_review_patch     90  (Fang post-review patch, applied via apply-design-patches.ts)
 *   - sizing_solver            80  (deterministic physical sizing math — owns power, torque, pressure)
 *   - supplier_matcher         75  (catalogue match — owns MPN + catalogue price when found)
 *   - bom_generator            70  (initial part identity + qty)
 *   - max_decomposition        50  (architectural guess from Max)
 *   - chase_research           30  (scoped research notes — rarely numeric)
 *   - finn_cost                10  (PROSE ONLY — Finn cannot author totals)
 *   - proofreader               0  (never canonical; rewrites prose around canonical values)
 *
 * Critical rule (8/8 council): Finn does NOT own canonical cost. Module cost
 * := SUM(BOM rows where module_id = X). The 60% Finn-vs-BOM gap class
 * disappears by construction.
 */

export type CanonicalSource =
    | "human_override"
    | "applied_review_patch"
    | "sizing_solver"
    | "supplier_matcher"
    | "bom_generator"
    | "max_decomposition"
    | "chase_research"
    | "finn_cost"
    | "proofreader"

export const SOURCE_RANK: Record<CanonicalSource, number> = {
    human_override: 100,
    applied_review_patch: 90,
    sizing_solver: 80,
    supplier_matcher: 75,
    bom_generator: 70,
    max_decomposition: 50,
    chase_research: 30,
    finn_cost: 10,
    proofreader: 0,
}

/**
 * Returns true if `incoming` should overwrite a value currently owned by
 * `existing`. Equal-rank: incoming wins (latest-write semantics) UNLESS
 * existing is human_override (which is immutable).
 */
export function canOverwrite(
    existing: CanonicalSource,
    incoming: CanonicalSource,
): boolean {
    if (existing === "human_override" && incoming !== "human_override") return false
    return SOURCE_RANK[incoming] >= SOURCE_RANK[existing]
}

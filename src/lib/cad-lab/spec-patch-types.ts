/**
 * @file spec-patch-types.ts — Loop 16 Block G structured-patch shape.
 *
 * @description Council unanimity (7/8): Fang must emit STRUCTURED PATCHES, not
 * prose. Today an engineering review says "[CRITICAL] specify Rittal AX 1200x800x400
 * — saves £400 vs bespoke" and the BOM stays at the bespoke £145k price with the
 * critical finding appended after the module page. Block G says the BOM line
 * BECOMES the Rittal AX entry and the document is re-rendered.
 *
 * Patch shape = RFC 6902-inspired. Atomic ops over a typed scope. Validated
 * against this Zod schema before any DB write.
 *
 * Companion: src/lib/cad-lab/apply-design-patches.ts.
 */

import { z } from "zod"
import { SOURCE_RANK, type CanonicalSource } from "./source-rank"

// ─── Public types ─────────────────────────────────────────────────────

export type SpecPatchScope = "module_spec" | "part_cost" | "part_identity" | "part_mass"

export type SpecPatchOp = "replace"

/**
 * A single atomic patch. Fang emits `SpecPatch[]` per review.
 *
 *   { scope: "part_cost",
 *     partId: "PC-001",
 *     op: "replace",
 *     value: 18000,
 *     prior_value: 145000,
 *     reason: "Rittal AX 1200x800x400 painted RAL 7035 — catalogue match for the bespoke spec; saves £127k.",
 *     source: "applied_review_patch",
 *     cost_impact_gbp_pence: -12700000 }
 */
export interface SpecPatch {
    scope: SpecPatchScope
    op: SpecPatchOp
    /** For module_spec: required. */
    moduleId?: string
    /** For module_spec: required. e.g. "powerW", "voltageV". */
    specKey?: string
    /** For part_cost / part_identity / part_mass: required. */
    partId?: string
    /** New canonical value (number for numeric scopes; object for part_identity). */
    value: number | string | { description?: string; mpn?: string; manufacturer?: string }
    /** Prior value snapshot for optimistic-lock + oscillation detection. */
    priorValue?: number | string
    /** Engineering justification (min 20 chars). */
    reason: string
    /** Always "applied_review_patch" today. Reserved for future review classes. */
    source: CanonicalSource
    /** Signed pence delta for cumulative-impact tracking. Negative = saving. */
    costImpactGbpPence?: number
    /** Optional 0-1 confidence Fang attaches. */
    confidence?: number
}

// ─── Zod schema ───────────────────────────────────────────────────────

const partIdentityValueSchema = z.object({
    description: z.string().optional(),
    mpn: z.string().optional(),
    manufacturer: z.string().optional(),
})

export const SpecPatchSchema: z.ZodType<SpecPatch> = z.object({
    scope: z.enum(["module_spec", "part_cost", "part_identity", "part_mass"]),
    op: z.literal("replace"),
    moduleId: z.string().optional(),
    specKey: z.string().optional(),
    partId: z.string().optional(),
    value: z.union([z.number(), z.string(), partIdentityValueSchema]),
    priorValue: z.union([z.number(), z.string()]).optional(),
    reason: z.string().min(20, "patch reason must be at least 20 chars"),
    source: z.enum([
        "human_override",
        "applied_review_patch",
        "sizing_solver",
        "supplier_matcher",
        "bom_generator",
        "max_decomposition",
        "chase_research",
        "finn_cost",
        "proofreader",
    ]),
    costImpactGbpPence: z.number().int().optional(),
    confidence: z.number().min(0).max(1).optional(),
}).superRefine((patch, ctx) => {
    // Scope-specific required fields.
    if (patch.scope === "module_spec") {
        if (!patch.moduleId) ctx.addIssue({ code: "custom", message: "module_spec patch requires moduleId", path: ["moduleId"] })
        if (!patch.specKey) ctx.addIssue({ code: "custom", message: "module_spec patch requires specKey", path: ["specKey"] })
        if (typeof patch.value !== "number") ctx.addIssue({ code: "custom", message: "module_spec value must be number", path: ["value"] })
    }
    if (patch.scope === "part_cost") {
        if (!patch.partId) ctx.addIssue({ code: "custom", message: "part_cost patch requires partId", path: ["partId"] })
        if (typeof patch.value !== "number" || patch.value < 0) ctx.addIssue({ code: "custom", message: "part_cost value must be non-negative number", path: ["value"] })
    }
    if (patch.scope === "part_mass") {
        if (!patch.partId) ctx.addIssue({ code: "custom", message: "part_mass patch requires partId", path: ["partId"] })
        if (typeof patch.value !== "number" || patch.value < 0) ctx.addIssue({ code: "custom", message: "part_mass value must be non-negative number", path: ["value"] })
    }
    if (patch.scope === "part_identity") {
        if (!patch.partId) ctx.addIssue({ code: "custom", message: "part_identity patch requires partId", path: ["partId"] })
        if (typeof patch.value !== "object") ctx.addIssue({ code: "custom", message: "part_identity value must be { description?, mpn?, manufacturer? }", path: ["value"] })
    }
})

// ─── Hashing for oscillation guard ────────────────────────────────────

/**
 * Stable patch hash for the oscillation guard. Identical patch (same target,
 * same value, same reason) emitted twice in the review-revise loop is a stall
 * signal — the loop halts.
 */
export function specPatchHash(patch: SpecPatch): string {
    const target =
        patch.scope === "module_spec"
            ? `${patch.scope}:${patch.moduleId}:${patch.specKey}`
            : `${patch.scope}:${patch.partId}`
    const valueStr = typeof patch.value === "object" ? JSON.stringify(patch.value) : String(patch.value)
    return `${target}=${valueStr}`
}

/** Re-export for callers. */
export { SOURCE_RANK }

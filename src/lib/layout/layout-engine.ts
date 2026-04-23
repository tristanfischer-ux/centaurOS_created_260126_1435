/**
 * @file src/lib/layout/layout-engine.ts — Generic spatial-plan wrapper.
 *
 * @description Mirror of `src/lib/sizing/sizing-engine.ts`. Given a project's
 * industry domain + sizing output + module list, this module:
 *
 *   1. Picks the right layout rules library from the registry.
 *   2. Calls its `layoutFn` to produce placements / features / constraints.
 *   3. Assembles a `SpatialPlan` with provenance metadata.
 *
 * Returns `null` when no rules library matches — callers degrade gracefully
 * (skip the spatial-plan section of the PDF, skip plan-reference image
 * prompting). Layout is an enhancement, not a hard requirement.
 *
 * Not a server action — pure compute, safe to import from anywhere.
 */

import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DimensionSheet, Envelope } from "@/lib/sizing/types"
import { pickLayoutRulesForDomain, getLayoutRulesByDomain } from "./_registry"
import type { LayoutInput, LayoutRules, SpatialPlan } from "./types"

export interface BuildSpatialPlanInput {
    /** The industry domain string (from Max's decomposition output or a
     *  persisted `dimension_sheet.rules_domain`). */
    industryDomain: string | null | undefined
    /** The project's sizing artefact — spatial plan needs the per-module
     *  dimensions + envelope to lay things out. Without it, we return null. */
    dimensionSheet: DimensionSheet | null | undefined
    /** Max's decomposition modules. The spatial plan references them by id. */
    modules: CadLabModule[]
    /** Domain targets (canopy_m2, kwh, etc.) — threaded through to layoutFn
     *  for domain-specific branching (e.g. VF grow-tray count). */
    targets: Record<string, number>
    /** Explicit domain override, used when the registry picked the wrong
     *  library and the UI let the founder choose another. Format: the
     *  `rules.domain` key (e.g. `"container_linear"`). */
    layoutDomainOverride?: string
    /** Who authored the plan. */
    authoredBy?: SpatialPlan["authored_by"]
}

export interface BuildSpatialPlanResult {
    plan: SpatialPlan | null
    rules: LayoutRules | null
    /** Human-readable reason when `plan` is null (no rules match, no sizing
     *  output, etc.) — surfaced in the UI. */
    skipReason: string | null
}

export function buildSpatialPlan(input: BuildSpatialPlanInput): BuildSpatialPlanResult {
    if (!input.dimensionSheet || !input.dimensionSheet.feasible) {
        return {
            plan: null,
            rules: null,
            skipReason: "Sizing engine did not produce a feasible dimension sheet — spatial plan skipped.",
        }
    }

    const rules = input.layoutDomainOverride
        ? getLayoutRulesByDomain(input.layoutDomainOverride)
        : pickLayoutRulesForDomain(input.industryDomain)

    if (!rules) {
        return {
            plan: null,
            rules: null,
            skipReason: `No layout rules library matches industry domain "${input.industryDomain ?? "(none)"}".`,
        }
    }

    const layoutInput: LayoutInput = {
        envelope: input.dimensionSheet.envelope,
        moduleDimensions: input.dimensionSheet.module_dimensions,
        modules: input.modules,
        targets: input.targets,
    }

    let output
    try {
        output = rules.layoutFn(layoutInput)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
            plan: null,
            rules,
            skipReason: `Layout function threw: ${message}`,
        }
    }

    const plan: SpatialPlan = {
        plan_type: rules.plan_type,
        view: rules.view,
        envelope: input.dimensionSheet.envelope,
        placements: output.placements,
        features: output.features,
        constraints: output.constraints,
        notes: output.notes,
        rules_domain: rules.domain,
        rules_version: rules.version,
        authored_by: input.authoredBy ?? "fang",
        generated_at: new Date().toISOString(),
    }

    return { plan, rules, skipReason: null }
}

/**
 * Convenience helper — returns the envelope used by a spatial plan (or the
 * passed-in envelope when the plan is null). Used by downstream consumers
 * that want "envelope or fallback" without null-checks.
 */
export function envelopeFromPlan(
    plan: SpatialPlan | null | undefined,
    fallback: Envelope,
): Envelope {
    return plan?.envelope ?? fallback
}

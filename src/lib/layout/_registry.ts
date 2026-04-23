/**
 * @file src/lib/layout/_registry.ts — Domain → layout library lookup.
 *
 * @description Mirror of `src/lib/sizing/rules/_registry.ts` but for the
 * spatial-plan layer. Fang's sizing engine picks a rules library by the
 * project's industry domain, then the layout engine picks a layout library
 * using the SAME industry domain string so the two stay in lockstep.
 *
 * Matching is case-insensitive + substring based.
 *
 * Adding a new layout domain: write
 * `src/lib/layout/rules/<domain>-v1.ts`, export a `LayoutRules` object,
 * import + register here.
 */

import type { LayoutRules } from "./types"
import { containerLinearV1 } from "./rules/container-linear-v1"
import { cabinetElevationV1 } from "./rules/cabinet-elevation-v1"
import { stackV1 } from "./rules/stack-v1"

const REGISTRY: LayoutRules[] = [containerLinearV1, cabinetElevationV1, stackV1]

/**
 * Pick the layout library for a given industry domain string.
 *
 * Returns `null` when no library matches — callers should degrade gracefully
 * (skip spatial planning + record a note). Layout is an enhancement, not a
 * hard requirement for the rest of the pipeline.
 */
export function pickLayoutRulesForDomain(industryDomain: string | null | undefined): LayoutRules | null {
    if (!industryDomain) return null
    const needle = industryDomain.toLowerCase().trim()
    for (const rules of REGISTRY) {
        for (const alias of rules.applicableIndustries) {
            const aliasLower = alias.toLowerCase()
            if (needle === aliasLower || needle.includes(aliasLower) || aliasLower.includes(needle)) {
                return rules
            }
        }
    }
    return null
}

/**
 * List every registered layout domain (UI override dropdown + PDF footer).
 */
export function listRegisteredLayoutDomains(): LayoutRules[] {
    return [...REGISTRY]
}

/**
 * Look up by exact domain key (`rules.domain`). Used by the UI's override
 * selector + by re-runs where the project already has a persisted
 * `spatial_plan.rules_domain`.
 */
export function getLayoutRulesByDomain(domain: string): LayoutRules | null {
    return REGISTRY.find((r) => r.domain === domain) ?? null
}

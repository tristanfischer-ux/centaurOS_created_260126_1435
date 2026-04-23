/**
 * @file src/lib/sizing/rules/_registry.ts — Domain → rule library lookup.
 *
 * @description Max's decomposition output tags each project with an
 * `industryDomain` string ("battery-energy-storage", "vertical-farm", ...).
 * The registry maps that string to the correct domain rules library.
 *
 * Matching is case-insensitive + substring based — a project tagged
 * "containerised battery energy storage" matches `battery_energy_storage`
 * via the `bess` substring alias.
 *
 * Adding a new domain: write `src/lib/sizing/rules/<domain>-v1.ts`, export
 * a `DomainRules` object, import + register here.
 */

import type { DomainRules } from "../types"
import { bessV1 } from "./bess-v1"
import { verticalFarmV1 } from "./vertical-farm-v1"
import { heatPumpV1 } from "./heat-pump-v1"

const REGISTRY: DomainRules[] = [bessV1, verticalFarmV1, heatPumpV1]

/**
 * Pick the rules library for a given industry domain string.
 *
 * Returns `null` when no library matches — callers should degrade gracefully
 * (skip sizing + record a note) rather than throw. Sizing is an enhancement,
 * not a hard requirement for the rest of the pipeline.
 */
export function pickRulesForDomain(industryDomain: string | null | undefined): DomainRules | null {
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
 * List every registered domain (used by the Fang UI for the "override
 * domain" dropdown when auto-detection misses).
 */
export function listRegisteredDomains(): DomainRules[] {
    return [...REGISTRY]
}

/**
 * Look up by exact domain key (`rules.domain`). Used by the UI's override
 * selector + by re-runs where the project already has a persisted
 * `rules_domain`.
 */
export function getRulesByDomain(domain: string): DomainRules | null {
    return REGISTRY.find((r) => r.domain === domain) ?? null
}

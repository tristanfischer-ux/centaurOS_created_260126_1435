/**
 * @file topology-detection.ts — Pure utility functions for detecting
 * topology-level structural changes in sizing recommendations.
 *
 * Extracted from run-fang-sizing.ts because that file has "use server"
 * and Next.js requires all exports from server action files to be async.
 * These are pure synchronous functions with no server-side dependencies.
 */

const TOPOLOGY_CHANGE_RE =
    /\b(?:split\s+(?:into|battery|rack|module|unit|enclosure|system|the)|decompose|additional\s+module|externalise|externalize|split\s+into\s+\d+\s+(?:units?|modules?)|auxiliary\s+(?:subsystem|module|cooling|thermal|skid)|separate\s+module|separate\s+skid|new\s+module)\b/i

/**
 * Returns true when ANY recommendation in the array contains a topology-level
 * structural change — i.e. the solver is saying "the current module layout
 * won't work; you need a different number or arrangement of modules".
 *
 * ANTI-CHEAT: deterministic regex, no LLM involvement.
 */
export function hasTopologyRecommendation(recommendations: readonly string[]): boolean {
    return recommendations.some((r) => TOPOLOGY_CHANGE_RE.test(r))
}

/**
 * Extract the first topology-level recommendation for use in the remediation
 * context block. Returns null if no topology recommendation is found.
 */
export function findTopologyRecommendations(recommendations: readonly string[]): string[] {
    return recommendations.filter((r) => TOPOLOGY_CHANGE_RE.test(r))
}

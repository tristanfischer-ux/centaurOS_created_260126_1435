/**
 * @file mirror-parity.ts — mirror-assembly cost parity check.
 *
 * Loop 13 scoring (HAPS): Port Wing assembly costed at £895 against the
 * Starboard Wing's £12,065 — a 13× asymmetry for what should be
 * structurally identical mirror images. Driven by 7 of the port-wing
 * bill-of-materials rows showing cost "—" while the starboard rows
 * carried real numbers. The reconciliation page detected the cost
 * mismatch between module-page totals and the bill-of-materials master
 * but did NOT compare the two wings against each other.
 *
 * This helper detects modules whose names form mirror pairs (port +
 * starboard, left + right) and checks their roll-up cost / mass for
 * parity. Divergence ≥ 30 percent is surfaced as a Mirror-section
 * reconciliation finding (the section name already exists in the
 * ReconciliationFinding type).
 *
 * Pure functions; no I/O.
 */

export type MirrorModuleLike = {
    name: string
    massKg?: number | null
}

export type MirrorPart = {
    sourceModuleName?: string | null
    estimatedUnitCostGbp?: number | null
    massKg?: number | null
}

export type MirrorFinding = {
    pairLabel: string
    aName: string
    bName: string
    aCostGbp: number
    bCostGbp: number
    costDiffPct: number
    aMassKg: number
    bMassKg: number
    massDiffPct: number
    summary: string
}

/**
 * Detect mirror pairs in a module list. A pair is two modules whose
 * names differ ONLY in a port/starboard / left/right keyword.
 *
 * Examples it catches:
 *   "Port Wing Assembly"      vs "Starboard Wing Assembly"
 *   "Left propulsion module"  vs "Right propulsion module"
 *   "Port Propulsion Pod"     vs "Starboard Propulsion Pod"
 *
 * Examples it deliberately does not catch:
 *   "Wing"                    (no mirror keyword present)
 *   "Port Aileron Actuator"   (one of the keywords) and "Wing Spar"
 *                             (no mirror) — because they don't share
 *                             the rest of the name.
 */
const MIRROR_KEYWORDS: Array<[RegExp, string]> = [
    [/\bport\b/gi, "starboard"],
    [/\bstarboard\b/gi, "port"],
    [/\bleft\b/gi, "right"],
    [/\bright\b/gi, "left"],
]

function findMirror(name: string, candidates: string[]): string | null {
    for (const [pattern, replacement] of MIRROR_KEYWORDS) {
        if (!pattern.test(name)) continue
        // Replace ONLY the matched keyword, preserving case where possible.
        pattern.lastIndex = 0
        const swapped = name.replace(pattern, (match) => {
            // Preserve initial-cap pattern.
            if (match[0] === match[0].toUpperCase()) {
                return replacement.charAt(0).toUpperCase() + replacement.slice(1)
            }
            return replacement
        })
        // Look for an exact (case-insensitive) match in candidates.
        for (const c of candidates) {
            if (c === name) continue
            if (c.toLowerCase() === swapped.toLowerCase()) return c
        }
    }
    return null
}

export function checkMirrorParity(
    modules: MirrorModuleLike[],
    parts: MirrorPart[],
    options: { thresholdPct?: number } = {},
): MirrorFinding[] {
    const threshold = options.thresholdPct ?? 30
    const findings: MirrorFinding[] = []
    const moduleNames = modules.map((m) => m.name)
    const seenPairs = new Set<string>()

    // Aggregate cost + mass per module from parts.
    const costByModule = new Map<string, number>()
    const massByModule = new Map<string, number>()
    for (const p of parts) {
        if (typeof p.sourceModuleName !== "string" || p.sourceModuleName.length === 0) continue
        const cost =
            typeof p.estimatedUnitCostGbp === "number" ? p.estimatedUnitCostGbp : 0
        const mass = typeof p.massKg === "number" ? p.massKg : 0
        costByModule.set(p.sourceModuleName, (costByModule.get(p.sourceModuleName) ?? 0) + cost)
        massByModule.set(p.sourceModuleName, (massByModule.get(p.sourceModuleName) ?? 0) + mass)
    }

    for (const m of modules) {
        const partner = findMirror(m.name, moduleNames)
        if (!partner) continue
        const pairKey = [m.name, partner].sort().join("||")
        if (seenPairs.has(pairKey)) continue
        seenPairs.add(pairKey)

        const aCost = costByModule.get(m.name) ?? 0
        const bCost = costByModule.get(partner) ?? 0
        const aMass = massByModule.get(m.name) ?? 0
        const bMass = massByModule.get(partner) ?? 0

        const costDenom = Math.max(aCost, bCost)
        const massDenom = Math.max(aMass, bMass)
        const costDiffPct = costDenom > 0 ? (Math.abs(aCost - bCost) / costDenom) * 100 : 0
        const massDiffPct = massDenom > 0 ? (Math.abs(aMass - bMass) / massDenom) * 100 : 0

        if (costDiffPct < threshold && massDiffPct < threshold) continue

        findings.push({
            pairLabel: `${m.name} ↔ ${partner}`,
            aName: m.name,
            bName: partner,
            aCostGbp: aCost,
            bCostGbp: bCost,
            costDiffPct,
            aMassKg: aMass,
            bMassKg: bMass,
            massDiffPct,
            summary: `${m.name} (${formatGbp(aCost)} / ${formatKg(aMass)}) and ${partner} (${formatGbp(bCost)} / ${formatKg(bMass)}) are declared as mirror assemblies but their bill-of-materials roll-ups disagree by ${costDiffPct.toFixed(0)} percent on cost and ${massDiffPct.toFixed(0)} percent on mass. Mirror assemblies should be near-identical in part count and cost; this divergence indicates missing or mis-allocated rows in one of the wings.`,
        })
    }

    return findings
}

function formatGbp(n: number): string {
    if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}k`
    return `£${n.toFixed(0)}`
}

function formatKg(n: number): string {
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)} t`
    if (n < 1) return `${(n * 1_000).toFixed(0)} g`
    return `${n.toFixed(1)} kg`
}

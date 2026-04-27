/**
 * @file module-consistency.ts — bill-of-materials versus module-description
 * numerical-consistency gate.
 *
 * Loop 12 critique pattern 1: 5 of 6 demos showed bill-of-materials line
 * items disagreeing with the module descriptions that should source them.
 *
 * Strategy:
 *   1. Per (parameter, unit) pair, extract the dominant value from the
 *      module description.
 *   2. Per part in that module, extract the same parameter / unit.
 *   3. If both have a value, compute the ratio.
 *   4. Ratios > 1.5 surfaced as findings.
 */

export type ModuleLike = {
    name: string
    description?: string | null
    keyParts?: string[]
}

export type PartLike = {
    partNumber?: string | null
    name?: string | null
    description?: string | null
    sourceModuleName?: string | null
}

export type ConsistencyFinding = {
    moduleName: string
    partNumber: string | null
    parameter: string
    unit: string
    moduleValue: number
    partValue: number
    ratio: number
    severity: "critical" | "high"
    summary: string
}

type Probe = {
    name: string
    canonicalUnit: string
    pattern: RegExp
    normaliser: (rawValue: number, rawUnit: string) => number
}

const PROBES: Probe[] = [
    {
        name: "power",
        canonicalUnit: "W",
        pattern:
            /(\d+(?:\.\d+)?)\s*(?:to|–|-)?\s*(\d+(?:\.\d+)?)?\s*(MW|kW|watt[s]?|kilowatt[s]?|megawatt[s]?|W\b)\b/gi,
        normaliser(rawValue: number, rawUnit: string): number {
            const u = rawUnit.toLowerCase()
            if (u === "mw" || u.startsWith("megawatt")) return rawValue * 1_000_000
            if (u === "kw" || u.startsWith("kilowatt")) return rawValue * 1_000
            return rawValue
        },
    },
    {
        name: "pressure",
        canonicalUnit: "bar",
        pattern:
            /(\d+(?:\.\d+)?)\s*(?:to|–|-)?\s*(\d+(?:\.\d+)?)?\s*(bar\b|psi\b|MPa\b|kPa\b|Pa\b|pascal[s]?)\b/gi,
        normaliser(rawValue: number, rawUnit: string): number {
            const u = rawUnit.toLowerCase()
            if (u === "bar") return rawValue
            if (u === "psi") return rawValue * 0.0689476
            if (u === "mpa") return rawValue * 10
            if (u === "kpa") return rawValue * 0.01
            if (u === "pa" || u.startsWith("pascal")) return rawValue * 0.00001
            return rawValue
        },
    },
    {
        name: "mass",
        canonicalUnit: "kg",
        pattern:
            /(\d+(?:[.,]\d+)?)\s*(?:to|–|-)?\s*(\d+(?:[.,]\d+)?)?\s*(tonne[s]?|tons|kilogram[s]?|kg\b|grams?|\bg\b|mg\b|milligram[s]?)\b/gi,
        normaliser(rawValue: number, rawUnit: string): number {
            const u = rawUnit.toLowerCase()
            if (u.startsWith("tonne") || u === "tons") return rawValue * 1_000
            if (u === "g" || u === "gram" || u === "grams") return rawValue / 1_000
            if (u === "mg" || u.startsWith("milligram")) return rawValue / 1_000_000
            return rawValue
        },
    },
    {
        name: "voltage",
        canonicalUnit: "V",
        pattern:
            /(\d+(?:\.\d+)?)\s*(?:to|–|-)?\s*(\d+(?:\.\d+)?)?\s*(kV\b|millivolt[s]?|mV\b|kilovolt[s]?|volt[s]?|V\b|VAC\b|VDC\b)\b/gi,
        normaliser(rawValue: number, rawUnit: string): number {
            const u = rawUnit.toLowerCase()
            if (u === "kv" || u.startsWith("kilovolt")) return rawValue * 1_000
            if (u === "mv" || u.startsWith("millivolt")) return rawValue / 1_000
            return rawValue
        },
    },
]

function extractDominant(text: string, probe: Probe): number | null {
    if (!text) return null
    let best: number | null = null
    probe.pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = probe.pattern.exec(text)) !== null) {
        const lowRaw = parseFloat(match[1].replace(",", ""))
        const highRaw = match[2] ? parseFloat(match[2].replace(",", "")) : lowRaw
        const unit = match[3]
        const low = probe.normaliser(lowRaw, unit)
        const high = probe.normaliser(highRaw, unit)
        const value = Math.max(low, high)
        if (!Number.isFinite(value) || value <= 0) continue
        if (best === null || value > best) best = value
    }
    return best
}

export function checkBomModuleConsistency(
    modules: ModuleLike[],
    parts: PartLike[],
): ConsistencyFinding[] {
    const findings: ConsistencyFinding[] = []
    for (const m of modules) {
        const moduleText = [
            m.description ?? "",
            ...(m.keyParts ?? []),
        ].join(" \n ")
        if (!moduleText.trim()) continue

        const partsForModule = parts.filter((p) => p.sourceModuleName === m.name)
        if (partsForModule.length === 0) continue

        for (const probe of PROBES) {
            const moduleValue = extractDominant(moduleText, probe)
            if (moduleValue === null) continue

            for (const p of partsForModule) {
                const partText = [p.name ?? "", p.description ?? ""].join(" \n ")
                if (!partText.trim()) continue
                const partValue = extractDominant(partText, probe)
                if (partValue === null) continue

                const ratio = Math.max(
                    moduleValue / partValue,
                    partValue / moduleValue,
                )
                if (!Number.isFinite(ratio) || ratio < 1.5) continue
                if (ratio > 99) continue

                const severity: ConsistencyFinding["severity"] =
                    ratio >= 5 ? "critical" : "high"

                findings.push({
                    moduleName: m.name,
                    partNumber: p.partNumber ?? null,
                    parameter: probe.name,
                    unit: probe.canonicalUnit,
                    moduleValue,
                    partValue,
                    ratio,
                    severity,
                    summary: `Module description states ~${formatValue(moduleValue, probe.canonicalUnit)} but bill-of-materials row ${p.partNumber ?? "(no number)"} specifies ~${formatValue(partValue, probe.canonicalUnit)} — ${ratio.toFixed(1)}x disagreement on ${probe.name}.`,
                })
            }
        }
    }
    return findings
}

function formatValue(value: number, unit: string): string {
    if (unit === "W" && value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MW`
    if (unit === "W" && value >= 1_000) return `${(value / 1_000).toFixed(1)} kW`
    if (unit === "W") return `${value.toFixed(0)} W`
    if (unit === "kg" && value >= 1_000) return `${(value / 1_000).toFixed(1)} tonne`
    if (unit === "kg" && value < 1) return `${(value * 1_000).toFixed(0)} g`
    if (unit === "kg") return `${value.toFixed(1)} kg`
    if (unit === "V" && value >= 1_000) return `${(value / 1_000).toFixed(1)} kV`
    if (unit === "V") return `${value.toFixed(0)} V`
    if (unit === "bar") return `${value.toFixed(1)} bar`
    return `${value.toFixed(2)} ${unit}`
}

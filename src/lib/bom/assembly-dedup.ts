/**
 * @file assembly-dedup.ts — bill-of-materials assembly-row de-duplication.
 *
 * Loop 12 critique (2026-04-27) found the L9-P1 cost roll-up was double-counting
 * across 4 of 6 demos:
 *   BESS:    PC-001-PUR "Skid Assembly" £145,000 + 8 constituents £142,000 = £287k roll-up
 *            (truth: one or the other, not both)
 *   Sentinel: HAND-ASY "Handle Assembly" £185 + 6 constituents £219 = £404 roll-up
 *            (truth: ~£185)
 *   Vertfarm: 53.8% gap between module totals (£243k) and bill-of-materials master (£113k)
 *   HAPS:     Port wing £895 vs starboard wing £24,865 — mirror module missing rows,
 *            self-declared 57.8% reconciliation failure
 *
 * Root cause: the bill-of-materials generator emits both an "assembly parent"
 * row AND its constituent leaf rows for the same physical sub-assembly. The
 * Loop 9 P1 fix (which made the cover read from the parts table) summed every
 * row, so wherever the bill-of-materials had both, the cost was double-counted.
 *
 * This helper detects the pattern and returns a per-part effective cost +
 * mass that the cover, per-module roll-up, BOM master cost column, and
 * reconciliation gate all use. Assembly-row de-duplication happens at the
 * presentation layer rather than at the data layer because:
 *  - keeping both rows in the parts table preserves the full assembly tree
 *    (useful for procurement when a customer wants to source constituents
 *    rather than buy a bundled assembly)
 *  - the dedup can be tightened or relaxed without re-running the bill-of-
 *    materials generator
 *  - a single helper invoked by every cost-summing call site keeps cover,
 *    module page, master, and reconciliation in agreement.
 */

export type DedupPartLike = {
    /** Catalogue or generator-issued part number (e.g. "PC-001-PUR", "HAND-ASY"). */
    partNumber?: string | null
    /** Human-readable name. The "Assembly" substring is the strongest signal. */
    name?: string | null
    /** Module the part belongs to. Null/undefined = top-level / orphan. */
    sourceModuleName?: string | null
    /** Cost in GBP. Skipped from sums when zero or non-numeric. */
    estimatedUnitCostGbp?: number | null
    /** Optional mass — same dedup rule applies. */
    massKg?: number | null
}

export type DedupResult = {
    /**
     * Effective cost per part, parallel to the input array. Zero for parts
     * whose cost was dropped from the roll-up because an assembly-parent
     * already covers it (or vice versa for orphan top-level wrappers).
     */
    effectiveCost: number[]
    /** Effective mass per part, parallel to the input array. */
    effectiveMass: number[]
    /** Indices of parts that were dropped as module-level assembly parents. */
    droppedParentIndices: Set<number>
    /** Indices of parts that were dropped as top-level orphan-assembly wrappers. */
    droppedOrphanIndices: Set<number>
}

// Strong-signal patterns: part number ending "-ASY" (Sentinel style) is
// unambiguous. The substring "Assembly" in a name is a weaker signal because
// constituents like "PCB Assembly", "Cable Assembly", "Filter Assembly"
// also contain it. Combined with the cost-similarity test below to avoid
// false positives.
const ASSEMBLY_PART_NUMBER_PATTERN = /-ASY(?:-|$)|-ASSEMBLY$/i
const ASSEMBLY_NAME_PATTERN = /\bAssembly\b/i

/**
 * Returns true if the part has a strong "assembly" signal in its name OR
 * part number. This is a NECESSARY but not SUFFICIENT condition — parents
 * also have to pass the cost-similarity test below.
 */
function hasAssemblySignal(p: DedupPartLike): boolean {
    const name = typeof p.name === "string" ? p.name : ""
    const partNumber = typeof p.partNumber === "string" ? p.partNumber : ""
    return (
        ASSEMBLY_PART_NUMBER_PATTERN.test(partNumber) || ASSEMBLY_NAME_PATTERN.test(name)
    )
}

/**
 * A row is treated as an "assembly parent" when:
 *   (a) it has the assembly signal in name or part number, AND
 *   (b) its cost is between 50% and 150% of the sum of OTHER rows in the
 *       same module group (i.e. the assembly's cost is approximately the
 *       roll-up of the constituents — that's the signature of double-
 *       counting). Constituents like "PCB Assembly" inside a larger module
 *       have costs that are a small fraction of the OTHERS' sum and so
 *       fail this test.
 *
 * The cost band is intentionally wide (±50%) because:
 *   - BESS PC-001 £145k vs sum of constituents £142k → ratio 102% (well
 *     inside)
 *   - Sentinel HAND-ASY £185 vs sum of constituents £219 → ratio 84%
 *     (inside; the assembly is slightly cheaper than the parts because
 *     vendor assembly absorbs some overhead vs procuring parts separately)
 *   - A "PCB Assembly" constituent worth £42 in a module whose other rows
 *     total £177 has ratio 24% (well below the floor)
 */
function isAssemblyParent(
    candidate: DedupPartLike,
    candidateIndex: number,
    groupIndices: number[],
    parts: DedupPartLike[],
): boolean {
    if (!hasAssemblySignal(candidate)) return false
    const candidateCost =
        typeof candidate.estimatedUnitCostGbp === "number"
            ? candidate.estimatedUnitCostGbp
            : 0
    if (candidateCost <= 0) return false
    let othersSum = 0
    for (const i of groupIndices) {
        if (i === candidateIndex) continue
        const other = parts[i]
        const c = typeof other.estimatedUnitCostGbp === "number" ? other.estimatedUnitCostGbp : 0
        othersSum += c
    }
    if (othersSum <= 0) return false
    const ratio = candidateCost / othersSum
    return ratio >= 0.5 && ratio <= 1.5
}

/**
 * De-duplicate assembly rows from the bill-of-materials roll-up.
 *
 * Logic per source-module group:
 *   (a) Find all rows that look like assembly parents (name contains
 *       "Assembly" or part number ends "-ASY").
 *   (b) If the group has at least 2 OTHER non-assembly rows, drop the
 *       assembly-parent rows from the cost / mass roll-up. Constituents
 *       carry the procurement breakdown.
 *   (c) If the group is JUST an assembly parent on its own (no
 *       constituents), keep the parent — it is the only signal of cost.
 *   (d) If a group has multiple assembly-parent rows AND no constituents,
 *       keep them all (rare; treat as separate sub-assemblies).
 *
 * Plus a top-level pass: parts with no source module (sourceModuleName null
 * or empty) that look like an assembly are treated as a top-level wrapper
 * (e.g. Sentinel SENT-ASY "Sentinel Walking Stick Complete Assembly"). If
 * any module-level row exists, the top-level wrapper's cost is dropped.
 */
export function dedupAssemblyRollUp<P extends DedupPartLike>(parts: P[]): DedupResult {
    const effectiveCost = new Array<number>(parts.length).fill(0)
    const effectiveMass = new Array<number>(parts.length).fill(0)
    const droppedParentIndices = new Set<number>()
    const droppedOrphanIndices = new Set<number>()

    // Group indices by source module. Empty / null source = "_orphan".
    const groups = new Map<string, number[]>()
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        const key =
            typeof p.sourceModuleName === "string" && p.sourceModuleName.length > 0
                ? p.sourceModuleName
                : "_orphan"
        const existing = groups.get(key)
        if (existing) {
            existing.push(i)
        } else {
            groups.set(key, [i])
        }
    }

    const orphanKey = "_orphan"
    const hasNonOrphanRows = Array.from(groups.keys()).some(
        (k) => k !== orphanKey && (groups.get(k)?.length ?? 0) > 0,
    )

    for (const [moduleKey, indices] of groups) {
        for (const i of indices) {
            const p = parts[i]
            const cost = typeof p.estimatedUnitCostGbp === "number" ? p.estimatedUnitCostGbp : 0
            const mass = typeof p.massKg === "number" ? p.massKg : 0

            let drop = false

            if (moduleKey === orphanKey && hasAssemblySignal(p) && hasNonOrphanRows) {
                // Top-level wrapper assembly (e.g. Sentinel SENT-ASY) when
                // the bill-of-materials has any module-level rows. Drop the
                // wrapper — the modules carry the procurement detail.
                drop = true
                droppedOrphanIndices.add(i)
            } else if (
                indices.length >= 2 &&
                isAssemblyParent(p, i, indices, parts)
            ) {
                // Module-level assembly parent: name/partNumber signals it,
                // AND its cost is ~ the sum of others in the module.
                drop = true
                droppedParentIndices.add(i)
            }

            effectiveCost[i] = drop ? 0 : cost
            effectiveMass[i] = drop ? 0 : mass
        }
    }

    return { effectiveCost, effectiveMass, droppedParentIndices, droppedOrphanIndices }
}

/**
 * Helper for the common case: just want the de-duplicated cost roll-up
 * total across all parts.
 */
export function dedupedUnitTotalGbp<P extends DedupPartLike>(parts: P[]): number {
    const { effectiveCost } = dedupAssemblyRollUp(parts)
    let total = 0
    for (const v of effectiveCost) total += v
    return total
}

/**
 * Helper: per-module de-duplicated cost roll-up keyed by sourceModuleName.
 * Modules with no parts return undefined when looked up.
 */
export function dedupedPerModuleCost<P extends DedupPartLike>(
    parts: P[],
): Map<string, number> {
    const { effectiveCost } = dedupAssemblyRollUp(parts)
    const out = new Map<string, number>()
    for (let i = 0; i < parts.length; i++) {
        const key =
            typeof parts[i].sourceModuleName === "string" && (parts[i].sourceModuleName as string).length > 0
                ? (parts[i].sourceModuleName as string)
                : "_orphan"
        out.set(key, (out.get(key) ?? 0) + effectiveCost[i])
    }
    return out
}

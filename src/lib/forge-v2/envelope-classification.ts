/**
 * @file envelope-classification.ts — Hard class fence for envelope templates.
 *
 * @description Every physical envelope kind maps to exactly one
 * EnvelopeClassificationTag. The tag is the contract between:
 *   (a) What the founder briefed ("containerised 40ft product")
 *   (b) What the sizing solver chose as its feasible alternate
 *
 * When the solver's closest_feasible_alternate is in a DIFFERENT class
 * from the briefed envelope, the pipeline must NOT silently swap to that
 * alternate — it must deliver the briefed-class max-feasible result AND
 * surface the alternate as a pushback. This check is DETERMINISTIC: no
 * LLM involvement. The tag comparison is a string equality check.
 *
 * @see src/lib/sizing/types.ts         — Envelope kind enum
 * @see src/lib/sizing/envelopes.ts     — Canonical envelope definitions
 * @see src/actions/specialists/run-fang-sizing.ts — Guard usage (Fix C)
 *
 * Loop 24 P0 root cause: BESS / Vertical Farm "PASS attempt 2" cheated by
 * silently swapping 40ft container → warehouse_bay (different product class
 * entirely). Three FAILs (HAPS, Desalination, Hedgerow) had NULL
 * dimension_sheet; pipeline advanced to matching_suppliers anyway.
 * Gate 3 council R2 synthesis: 2026-04-29, ~/Downloads/forge-demos/gates-council-2026-04-29/gate3-council-2/SYNTHESIS.md
 */

import type { Envelope } from "@/lib/sizing/types"

// ── Classification tag enum ──────────────────────────────────────────────────

/**
 * Product-class fence. Each value represents a fundamentally different
 * physical product archetype — switching between them changes the product
 * entirely, not just the size.
 *
 * INTENT: A 40ft container product is NOT interchangeable with a warehouse
 * bay product for the same capacity. The founder chose a container because
 * it ships; a warehouse bay doesn't. The engine must not silently treat
 * these as equivalent alternatives.
 */
export type EnvelopeClassificationTag =
    | "transportable_container"      // 20ft ISO, 40ft ISO, 40ft HC, 45ft HC, 53ft, 2×40ft, 3×40ft, container train
    | "fixed_building_bay"           // warehouse_bay, plant_room, industrial_unit
    | "outdoor_pad"                  // fenced_pad, slab_mounted_plant
    | "consumer_product_enclosure"   // handheld, desktop, garden_device, wall_mounted_consumer
    | "vehicle_mounted"              // truck-bed, trailer, marine
    | "stratospheric_airframe"       // HAPS / high-altitude balloon / wing
    | "unknown"                      // custom or any kind not yet mapped — treated as "different class" for safety

// ── Tag map ──────────────────────────────────────────────────────────────────

/**
 * Maps every `Envelope.kind` value to its classification tag.
 *
 * DECISION: `custom` → "unknown". Custom envelopes could be anything.
 * Treating them as "unknown" means the guard defaults to the safe
 * deliver-and-pushback path rather than silently auto-swapping.
 *
 * DECISION: `room`, `chassis`, `plot` → "unknown". These are broad
 * categories that haven't been broken into sub-classes yet. Better to
 * be conservative (pushback) than permissive (silent swap).
 */
const ENVELOPE_TAG_MAP: Record<Envelope["kind"], EnvelopeClassificationTag> = {
    container_20ft_iso: "transportable_container",
    container_40ft_iso: "transportable_container",
    container_53ft_hc:  "transportable_container",
    warehouse_bay:      "fixed_building_bay",
    room:               "unknown",
    chassis:            "vehicle_mounted",
    cabinet:            "consumer_product_enclosure",
    plot:               "outdoor_pad",
    custom:             "unknown",
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the EnvelopeClassificationTag for a given envelope.
 *
 * DETERMINISTIC — no LLM involvement. Tag is derived solely from
 * `envelope.kind`, which is always a fixed enum value set by the
 * canonical envelope definitions.
 */
export function getEnvelopeClassificationTag(
    envelope: Envelope,
): EnvelopeClassificationTag {
    return ENVELOPE_TAG_MAP[envelope.kind] ?? "unknown"
}

/**
 * Deterministic same-product-class check.
 *
 * Returns true ONLY when both envelopes share the SAME classification tag
 * AND neither is "unknown". "Unknown" is always treated as different class
 * for safety — the guard defaults to deliver-and-pushback.
 *
 * ANTI-CHEAT RULE: This function must NEVER be replaced with an LLM call.
 * The LLM may rationalise that a container and a warehouse are "similar
 * enough". They are not. The classification is hardware-domain-owned.
 */
export function areSameProductClass(a: Envelope, b: Envelope): boolean {
    const tagA = getEnvelopeClassificationTag(a)
    const tagB = getEnvelopeClassificationTag(b)
    if (tagA === "unknown" || tagB === "unknown") return false
    return tagA === tagB
}

/**
 * Stricter deterministic same-envelope-variant check.
 *
 * Extends areSameProductClass by also requiring that both envelopes share
 * the exact same `kind` value. This catches within-class size swaps —
 * the Loop 25 Desalination Module 3.1 failure mode where the solver silently
 * substituted a 20ft ISO container for a briefed 40ft ISO container. Both
 * are "transportable_container" (same class), so areSameProductClass returned
 * true and Guard 2 did NOT fire. areSameEnvelopeVariant closes this gap.
 *
 * GPT-5.5 and DeepSeek council holdout 2026-04-29: "same family of error as
 * phantom-GREEN — the system presents feasibility by mutating the brief."
 *
 * DECISION: `kind` is the canonical variant discriminator. It is always a
 * fixed enum value set by the canonical envelope definitions in
 * src/lib/sizing/envelopes.ts, never interpolated or normalised by the LLM.
 *
 * ANTI-CHEAT RULE: This function must NEVER be replaced with an LLM call.
 */
export function areSameEnvelopeVariant(a: Envelope, b: Envelope): boolean {
    // Must pass the class check first — different-class envelopes are never
    // the same variant even if their kind strings happened to collide.
    if (!areSameProductClass(a, b)) return false
    return a.kind === b.kind
}

// ── BOM container-class cross-check ─────────────────────────────────────────

/**
 * Canonical container size tokens. Extends as new envelope kinds are added.
 */
export type ContainerSizeToken = "10ft" | "20ft" | "40ft" | "45ft" | "53ft"

/**
 * A container-class conflict found in a BOM part name or description.
 *
 * Produced by `checkBomContainerClassConsistency` when the BOM generator
 * prices a container whose size does not match the briefed envelope kind.
 * The Loop 25 Desalination Module 3.1 bug: brief said 40ft ISO, BOM priced
 * "Used 20ft container" — six pressure vessels at 7,200 mm each require
 * over 21 metres and only fit in a 40ft container.
 */
export interface BomContainerClassConflict {
    partNumber: string
    partName: string
    moduleId: string | null
    detectedSize: ContainerSizeToken
    expectedSize: ContainerSizeToken
    briefedEnvelopeKind: Envelope["kind"]
    matchedPhrase: string
}

export interface BomContainerClassCheckResult {
    consistent: boolean
    conflicts: BomContainerClassConflict[]
}

/**
 * Maps each container envelope kind to its canonical size token.
 *
 * DETERMINISTIC — no LLM involvement.
 */
const CONTAINER_KIND_TO_SIZE_TOKEN: Partial<Record<Envelope["kind"], ContainerSizeToken>> = {
    container_20ft_iso: "20ft",
    container_40ft_iso: "40ft",
    container_53ft_hc:  "53ft",
}

/**
 * Returns the expected container size token for a given envelope kind.
 * Returns null for non-container envelopes (warehouse_bay, room, etc.).
 *
 * DETERMINISTIC — no LLM involvement.
 */
export function expectedContainerSizeToken(
    envelopeKind: Envelope["kind"],
): ContainerSizeToken | null {
    return CONTAINER_KIND_TO_SIZE_TOKEN[envelopeKind] ?? null
}

/**
 * Extracts a container size token from free-text part name or description.
 *
 * Two-phase proximity-aware detection (council recommendation, 2026-04-29):
 *   Phase 1 — Tokenise: detect a numeric-unit pattern ("20ft", "20-foot",
 *             "20'", "twenty foot", etc.) near container-anchor words.
 *   Phase 2 — Blocklist: reject matches where the size token appears in a
 *             mechanical-length context (cable tray, conduit, pipe, hose…)
 *             with no strong container anchor nearby.
 *
 * Strong container anchors: "container", "shipping container", "ISO container",
 *   "containerised/containerized", "enclosure shell", "container shell/unit/box".
 *
 * Blocklisted length nouns: cable tray, cable ladder, conduit, pipe run,
 *   flexible hose, flexible conduit, duct run, wireway, cable run, hose,
 *   busbar run, steel beam, steel tube, galvanised pipe, racking, chain, rope.
 *
 * Returns null when no container-size reference is confidently detected.
 *
 * ANTI-CHEAT RULE: must NEVER be replaced with an LLM call.
 * The detection is deterministic regex — lineage-independent and auditable.
 */
export function extractContainerSizeFromText(text: string): {
    size: ContainerSizeToken
    matchedPhrase: string
} | null {
    if (!text || text.length === 0) return null

    const STRONG_ANCHOR_RE =
        /\b(?:container(?:is(?:ed|ation)|ized)?|shipping\s+container|ISO\s+container|enclosure\s+(?:shell|box|unit)|container\s+(?:shell|unit|box)|containeris(?:ed|ation)|containeriz(?:ed|ation))\b/i

    const BLOCKLIST_RE =
        /\b(?:cable\s+tray|cable\s+ladder|conduit|pipe\s+(?:run|section)|tube|flexible\s+hose|flexible\s+conduit|duct\s+(?:run|section)|wireway|cable\s+run|hose|busbar\s+run|steel\s+beam|steel\s+tube|galvanis[e]?d\s+pipe|racking|chain|rope)\b/i

    const WEAK_ANCHOR_RE =
        /\b(?:enclosure|housing|shell|unit|box|skid|container|ISO|conex|shipping)\b/i

    const SIZE_PATTERNS: Array<{ token: ContainerSizeToken; re: RegExp }> = [
        {
            token: "20ft",
            re: /\b(?:20[\s-]?(?:ft|foot|feet|')|twenty[\s-]?(?:foot|feet))\b/i,
        },
        {
            token: "40ft",
            re: /\b(?:40[\s-]?(?:ft|foot|feet|')|forty[\s-]?(?:foot|feet))\b/i,
        },
        {
            token: "53ft",
            re: /\b(?:53[\s-]?(?:ft|foot|feet|')|fifty[\s-]?three[\s-]?(?:foot|feet))\b/i,
        },
        {
            token: "45ft",
            re: /\b(?:45[\s-]?(?:ft|foot|feet|')|forty[\s-]?five[\s-]?(?:foot|feet))\b/i,
        },
        {
            token: "10ft",
            re: /\b(?:10[\s-]?(?:ft|foot|feet|')|ten[\s-]?(?:foot|feet))\b/i,
        },
    ]

    for (const { token, re } of SIZE_PATTERNS) {
        const match = re.exec(text)
        if (!match) continue

        const matchedPhrase = match[0]

        // Extract a ~120-char window centred on the match for anchor and
        // blocklist inspection — captures context from outside the word boundary.
        const windowStart = Math.max(0, match.index - 60)
        const windowEnd = Math.min(text.length, match.index + matchedPhrase.length + 60)
        const window = text.slice(windowStart, windowEnd)

        const hasBlocklistWord = BLOCKLIST_RE.test(window)
        const hasStrongAnchor = STRONG_ANCHOR_RE.test(window) || STRONG_ANCHOR_RE.test(text)

        // If blocklisted AND no strong container anchor: false positive (e.g. "20ft cable tray").
        if (hasBlocklistWord && !hasStrongAnchor) {
            continue
        }

        // Require at least a weak anchor anywhere in the full text to avoid
        // flagging pure-dimension specs ("20ft long steel beam") with no
        // container terminology.
        if (!hasStrongAnchor && !WEAK_ANCHOR_RE.test(text)) {
            continue
        }

        return { size: token, matchedPhrase }
    }

    return null
}

/**
 * Checks BOM parts for container-class consistency against the briefed
 * envelope kind from `dimension_sheet.envelope.kind`.
 *
 * Only fires when the briefed envelope is a container variant (kind starts
 * with "container_"). For non-container envelopes (warehouse_bay, room, etc.)
 * returns `{ consistent: true, conflicts: [] }` immediately.
 *
 * A conflict is raised when a part name or description contains an explicit
 * container-size reference whose size token does NOT match the briefed envelope.
 *
 * DETERMINISTIC — no LLM involvement.
 * ANTI-CHEAT RULE: must NEVER be replaced with an LLM call.
 *
 * @param parts                BOM parts from the merge stage (name + description).
 * @param briefedEnvelopeKind  The envelope kind from dimension_sheet.envelope.kind.
 */
export function checkBomContainerClassConsistency(
    parts: ReadonlyArray<{
        partNumber: string
        name: string
        description?: string | null
        moduleId?: string | null
    }>,
    briefedEnvelopeKind: Envelope["kind"],
): BomContainerClassCheckResult {
    const expectedSize = expectedContainerSizeToken(briefedEnvelopeKind)
    if (!expectedSize) {
        // Not a container brief — check does not apply.
        return { consistent: true, conflicts: [] }
    }

    const conflicts: BomContainerClassConflict[] = []

    for (const part of parts) {
        const searchText = [part.name ?? "", part.description ?? ""]
            .filter((s) => s.length > 0)
            .join(" | ")

        const detected = extractContainerSizeFromText(searchText)
        if (!detected) continue

        if (detected.size === expectedSize) continue

        conflicts.push({
            partNumber: part.partNumber,
            partName: part.name,
            moduleId: part.moduleId ?? null,
            detectedSize: detected.size,
            expectedSize,
            briefedEnvelopeKind,
            matchedPhrase: detected.matchedPhrase,
        })
    }

    return {
        consistent: conflicts.length === 0,
        conflicts,
    }
}

/**
 * Build the structured alternate-envelope pushback payload.
 *
 * Called when the solver's closest_feasible_alternate is in a different
 * product class from the briefed envelope. Instead of hard-blocking or
 * silently swapping, the engine:
 *   1. Ships the briefed-class max-feasible result (whatever capacity fits)
 *   2. Attaches this payload so the PDF can render the trade-off callout
 *
 * @see src/actions/export-project-pdf.tsx — PDF callout rendering (Fix E)
 */
export interface AlternateEnvelopePushback {
    /** The envelope the founder specified in the brief. */
    briefed_envelope: {
        kind: Envelope["kind"]
        label: string
        classification_tag: EnvelopeClassificationTag
    }
    /** The envelope the solver found feasible (different product class). */
    alternate_envelope: {
        kind: Envelope["kind"]
        label: string
        classification_tag: EnvelopeClassificationTag
    }
    /**
     * Deterministic tag comparison result. Always false in this payload
     * (this object is only created when classes differ).
     */
    product_class_match: false
    /**
     * Capacity achievable within the BRIEFED product class.
     * e.g. { value: 1.4, units: "MWh" } — what fits in 40ft container.
     */
    capacity_at_briefed_class: {
        value: number | null
        units: string
        deficit: number | null
        /** Human-readable, e.g. "1.4 MWh vs 3.5 MWh target (shortfall: 2.1 MWh)" */
        summary: string
    }
    /**
     * Capacity achievable in the alternate product class.
     * e.g. { value: 3.5, units: "MWh" } — what fits in warehouse_bay.
     */
    capacity_at_alternate_class: {
        value: number | null
        units: string
    }
    /**
     * Human-readable trade-off explanation for the PDF callout.
     * Written by the gate logic, not an LLM.
     */
    trade_off_note: string
}

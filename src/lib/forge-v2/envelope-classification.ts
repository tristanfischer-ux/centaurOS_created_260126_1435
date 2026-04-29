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

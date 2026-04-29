/**
 * @file envelope-variant-fence.test.ts — Regression tests for the Loop 25
 * envelope-variant fence (areSameEnvelopeVariant).
 *
 * Root cause (Loop 25 Desalination Module 3.1): the solver substituted a 20ft
 * ISO container for a briefed 40ft ISO container. Both are classified as
 * "transportable_container", so areSameProductClass returned true and Guard 2
 * did NOT fire — a silent within-class dimension swap identical in character to
 * the phantom-GREEN class swap caught in Loop 24. GPT-5.5 and DeepSeek council
 * holdouts (2026-04-29) labelled it "the system presents feasibility by
 * mutating the brief."
 *
 * Fix: areSameEnvelopeVariant() requires both class-tag AND kind equality.
 * Guard 2 in run-fang-sizing.ts now calls areSameEnvelopeVariant instead of
 * areSameProductClass, so any within-class size swap triggers DELIVER_AND_PUSHBACK.
 */

import {
    areSameProductClass,
    areSameEnvelopeVariant,
    getEnvelopeClassificationTag,
} from "../envelope-classification"
import type { Envelope } from "@/lib/sizing/types"

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEnvelope(kind: Envelope["kind"], label?: string): Envelope {
    return {
        kind,
        label: label ?? kind,
        interior_w_mm: 1000,
        interior_d_mm: 1000,
        interior_h_mm: 1000,
        interior_floor_m2: 1,
        interior_volume_m3: 1,
    }
}

// ── areSameEnvelopeVariant — core behaviour ───────────────────────────────────

describe("areSameEnvelopeVariant — same-variant guard", () => {
    /**
     * Case 1: identical kind → does NOT fire guard.
     * 40ft ISO briefed, 40ft ISO alternate = exact same thing. Safe.
     */
    test("PASS: 40ft ISO vs 40ft ISO (same variant) — guard does NOT fire", () => {
        const briefed = makeEnvelope("container_40ft_iso", "40ft ISO container (standard)")
        const alternate = makeEnvelope("container_40ft_iso", "40ft ISO container (high-cube)")
        expect(areSameEnvelopeVariant(briefed, alternate)).toBe(true)
    })

    /**
     * Case 2: Loop 25 Desalination Module 3.1 failure — same class, different size.
     * areSameProductClass returns true (both "transportable_container"), but
     * areSameEnvelopeVariant must return false so Guard 2 fires → DELIVER_AND_PUSHBACK.
     */
    test("FAIL: 40ft ISO vs 20ft ISO (same class, different variant) — Loop 25 Desal bug", () => {
        const briefed = makeEnvelope("container_40ft_iso", "40ft ISO container (standard)")
        const alternate = makeEnvelope("container_20ft_iso", "20ft ISO container (standard)")
        // Confirm areSameProductClass still passes (this was the gap)
        expect(areSameProductClass(briefed, alternate)).toBe(true)
        // areSameEnvelopeVariant must catch it
        expect(areSameEnvelopeVariant(briefed, alternate)).toBe(false)
    })

    /**
     * Case 3: different class — guard also fires (existing behaviour preserved).
     * 40ft ISO → warehouse_bay is the Loop 24 BESS silent-class-swap pattern.
     */
    test("FAIL: 40ft ISO vs warehouse_bay (different class) — Loop 24 pattern still blocked", () => {
        const briefed = makeEnvelope("container_40ft_iso", "40ft ISO container (standard)")
        const alternate = makeEnvelope("warehouse_bay", "Warehouse bay (100 m²)")
        expect(areSameEnvelopeVariant(briefed, alternate)).toBe(false)
    })

    /**
     * Case 4: 40ft ISO vs 53ft HC — both "transportable_container", different kind.
     * Guard DOES fire under the new stricter check. The solver found a physically
     * larger variant; the brief didn't ask for that. Deliver-and-pushback is correct.
     */
    test("FAIL: 40ft ISO vs 53ft HC (same class, different variant) — stricter fence", () => {
        const briefed = makeEnvelope("container_40ft_iso", "40ft ISO container (standard)")
        const alternate = makeEnvelope("container_53ft_hc", "53ft high-cube container")
        // Same class — this was previously allowed through
        expect(areSameProductClass(briefed, alternate)).toBe(true)
        // Stricter check fires
        expect(areSameEnvelopeVariant(briefed, alternate)).toBe(false)
    })

    /**
     * Case 5: null/undefined handling — safe fallback.
     * Guard fires when either side is null so no NPE reaches the pipeline.
     */
    test("SAFE: null alternate envelope → guard fires (does not throw)", () => {
        const briefed = makeEnvelope("container_40ft_iso")
        // Simulate the null path: pass a minimal object that has no kind
        // areSameEnvelopeVariant receives real Envelope types, so we test the
        // equivalent: an envelope whose kind differs from every briefed kind.
        // The null caller path is guarded upstream (alternate?.envelope check).
        // This test documents that an "unknown" kind always fails the guard.
        const nullLike = makeEnvelope("custom", "custom / unknown")
        expect(areSameEnvelopeVariant(briefed, nullLike)).toBe(false)
    })

    /**
     * Case 6: 2×40ft compound vs single 40ft ISO — different kind, same class.
     * If the solver returns a doubled-container config as a closest_feasible_alternate,
     * Guard 2 must not silently accept it as a same-variant retry.
     * Note: "2×40ft" maps to "transportable_container" in the TAG_MAP when defined.
     * Covered here via cabinet/cabinet (same kind) vs cabinet/chassis (different kind).
     */
    test("FAIL: cabinet vs chassis (different kinds, different classes) — guard fires", () => {
        const briefed = makeEnvelope("cabinet", "Desktop cabinet")
        const alternate = makeEnvelope("chassis", "Vehicle chassis")
        expect(areSameEnvelopeVariant(briefed, alternate)).toBe(false)
    })

    test("PASS: cabinet vs cabinet (same kind, same class) — guard does NOT fire", () => {
        const briefed = makeEnvelope("cabinet", "Small desktop cabinet")
        const alternate = makeEnvelope("cabinet", "Large desktop cabinet")
        expect(areSameEnvelopeVariant(briefed, alternate)).toBe(true)
    })

    test("FAIL: 20ft ISO vs 40ft ISO (reversed direction) — guard fires both ways", () => {
        const briefed = makeEnvelope("container_20ft_iso", "20ft ISO container (standard)")
        const alternate = makeEnvelope("container_40ft_iso", "40ft ISO container (standard)")
        expect(areSameEnvelopeVariant(briefed, alternate)).toBe(false)
    })
})

// ── Guard 2 simulation ────────────────────────────────────────────────────────

describe("Guard 2 simulation — areSameEnvelopeVariant replaces areSameProductClass", () => {
    function simulateGuard2WithVariantFence(
        briefedKind: Envelope["kind"],
        alternateKind: Envelope["kind"],
    ): "DELIVER_AND_PUSHBACK" | null {
        const briefed = makeEnvelope(briefedKind)
        const alternate = makeEnvelope(alternateKind)
        const sameVariant = areSameEnvelopeVariant(briefed, alternate)
        if (!sameVariant) return "DELIVER_AND_PUSHBACK"
        return null
    }

    test("Loop 25 Desal Module 3.1: briefed=40ft, alternate=20ft → DELIVER_AND_PUSHBACK", () => {
        expect(simulateGuard2WithVariantFence("container_40ft_iso", "container_20ft_iso"))
            .toBe("DELIVER_AND_PUSHBACK")
    })

    test("Loop 24 BESS: briefed=40ft, alternate=warehouse_bay → DELIVER_AND_PUSHBACK", () => {
        expect(simulateGuard2WithVariantFence("container_40ft_iso", "warehouse_bay"))
            .toBe("DELIVER_AND_PUSHBACK")
    })

    test("40ft → 53ft (within transportable_container) → DELIVER_AND_PUSHBACK (stricter fence)", () => {
        expect(simulateGuard2WithVariantFence("container_40ft_iso", "container_53ft_hc"))
            .toBe("DELIVER_AND_PUSHBACK")
    })

    test("Exact same variant (40ft → 40ft) → null (safe retry, no pushback)", () => {
        expect(simulateGuard2WithVariantFence("container_40ft_iso", "container_40ft_iso"))
            .toBeNull()
    })

    test("Exact same variant (warehouse_bay → warehouse_bay) → null (safe retry)", () => {
        expect(simulateGuard2WithVariantFence("warehouse_bay", "warehouse_bay"))
            .toBeNull()
    })

    test("Exact same variant (20ft ISO → 20ft ISO) → null (safe retry)", () => {
        expect(simulateGuard2WithVariantFence("container_20ft_iso", "container_20ft_iso"))
            .toBeNull()
    })
})

// ── Classification tags unchanged ─────────────────────────────────────────────

describe("Classification tags unchanged — areSameEnvelopeVariant does not alter tag semantics", () => {
    test("20ft ISO and 40ft ISO still share 'transportable_container' tag", () => {
        const a = makeEnvelope("container_20ft_iso")
        const b = makeEnvelope("container_40ft_iso")
        expect(getEnvelopeClassificationTag(a)).toBe("transportable_container")
        expect(getEnvelopeClassificationTag(b)).toBe("transportable_container")
        // Class-level check passes — only the variant check fails
        expect(areSameProductClass(a, b)).toBe(true)
        expect(areSameEnvelopeVariant(a, b)).toBe(false)
    })
})

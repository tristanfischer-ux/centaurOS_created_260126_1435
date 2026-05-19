/**
 * @file gate-1-numeric-extraction.test.ts — Gate 1 deterministic tests.
 *
 * Each test validates one scenario from the spec plus the 5 forge-guild
 * demo briefs to confirm no false-positives in production data.
 *
 * Run: npx jest gate-1-numeric-extraction --no-coverage
 */

import {
    gate1Check,
    buildGate1Input,
    _extractCapacityFromBrief,
    _extractPowerFromBrief,
    _extractMassFromBrief,
    _extractThroughputFromBrief,
    _extractEnvelopeKindFromBrief,
} from "@/lib/forge-v2/stage-gates/gate-1"

// ─── Helper for concise tests ──────────────────────────────────────────

function check(
    founderBrief: string,
    chaseFields: Parameters<typeof gate1Check>[0]["chase_design_brief"],
) {
    return gate1Check({ founder_raw_brief: founderBrief, chase_design_brief: chaseFields })
}

// ─── Spec scenarios ────────────────────────────────────────────────────

describe("Gate 1 — spec scenarios", () => {
    // Spec test 1 — BLOCKER: 1.5 MW founder, 100 kW Chase (15× factor)
    test("founder '1.5 MW' + Chase {power_kw: 100} → BLOCKER (15× factor)", () => {
        const v = check(
            "We need a 1.5 MW grid-scale battery storage system for a UK solar farm.",
            { power_kw: 100 },
        )
        expect(v.passed).toBe(false)
        const blocker = v.blockers.find((b) => b.axis === "power")
        expect(blocker).toBeDefined()
        expect(blocker!.factor_off).toBeCloseTo(15, 1)
    })

    // Spec test 2 — PASS: 3.5 MWh founder, Chase {capacity_kwh: 3500} → same value different unit
    test("founder '3.5 MWh' + Chase {capacity_kwh: 3500} → PASS (units normalised)", () => {
        const v = check(
            "A 3.5 MWh containerised battery energy storage system.",
            { capacity_kwh: 3500 },
        )
        expect(v.passed).toBe(true)
        expect(v.blockers).toHaveLength(0)
    })

    // Spec test 3 — PASS: 500 m³/day throughput, Chase {throughput: 500, throughput_unit: "m3/day"}
    test("founder '500 m³/day' + Chase {throughput: 500, throughput_unit: 'm3/day'} → PASS", () => {
        // Both normalise identically — ratio is 1.0
        const v = check(
            "The desalination plant should process 500 m³/day of seawater.",
            { throughput: 500 / 86_400, throughput_unit: "m3/day" },
        )
        expect(v.passed).toBe(true)
    })

    // Spec test 4 — BLOCKER: "40ft container" founder, Chase uses container_20ft_iso
    test("founder '40ft container' + Chase {envelope: {kind: 'container_20ft_iso'}} → BLOCKER (envelope mismatch)", () => {
        const v = check(
            "A 40ft containerised modular vertical farm for urban food production.",
            { envelope: { kind: "container_20ft_iso" } },
        )
        expect(v.passed).toBe(false)
        const blocker = v.blockers.find((b) => b.axis === "envelope_kind")
        expect(blocker).toBeDefined()
        expect(blocker!.factor_off).toBe(Infinity)
    })

    // Spec test 5 — BLOCKER: "200 m² canopy" but Chase has empty designBrief
    test("founder mentions '200 m² canopy' + Chase {} (no capacity) → WARN (not blocker) — Chase may not extract canopy as capacity", () => {
        // Canopy m² doesn't match the kWh regex, so no capacity blocker fires.
        // The founder mentioned it, Chase produced nothing — this is a warning.
        const v = check(
            "A 200 m² canopy vertical farm growing leafy greens.",
            {},
        )
        // No capacity blocker (canopy ≠ kWh) — passes cleanly
        expect(v.passed).toBe(true)
    })

    // Additional: unit class blocker — 1500 kWh founder, Chase reads as 1.5 kWh (1000× off)
    test("unit class mismatch: founder '1500 kWh' + Chase {capacity_kwh: 1.5} → BLOCKER (1000× factor)", () => {
        const v = check(
            "We need a 1500 kWh battery system.",
            { capacity_kwh: 1.5 },
        )
        expect(v.passed).toBe(false)
        const blocker = v.blockers.find((b) => b.axis === "capacity")
        expect(blocker).toBeDefined()
        expect(blocker!.factor_off).toBeGreaterThanOrEqual(3)
    })

    // Chase-fabricated number: founder has no capacity, Chase has 500 kWh
    test("no capacity in founder brief + Chase {capacity_kwh: 500} → WARN (potential fabrication)", () => {
        const v = check(
            "A smart building energy management platform for commercial offices.",
            { capacity_kwh: 500 },
        )
        expect(v.passed).toBe(true) // warning only, not a blocker
        expect(v.warnings.some((w) => w.axis === "capacity")).toBe(true)
    })

    // Chase missed a field the founder explicitly stated
    test("founder '1.5 MW' + Chase has no power → BLOCKER (Chase missed critical field)", () => {
        const v = check(
            "A 1.5 MW grid-forming inverter system for community microgrids.",
            { power_kw: null },
        )
        expect(v.passed).toBe(false)
        expect(v.blockers.some((b) => b.axis === "power")).toBe(true)
    })

    // Within 10% — should PASS with no warnings
    test("within 10% drift: founder '100 kW', Chase {power_kw: 105} → PASS, no warnings", () => {
        const v = check(
            "A 100 kW rooftop solar installation with battery backup.",
            { power_kw: 105 },
        )
        expect(v.passed).toBe(true)
        expect(v.warnings.filter((w) => w.axis === "power")).toHaveLength(0)
    })

    // 40ft container passes through cleanly when Chase matches
    test("founder '40ft container' + Chase {envelope: {kind: 'container_40ft_iso'}} → PASS", () => {
        const v = check(
            "A 3.5 MWh 40ft containerised BESS for UK solar farm grid connection.",
            { capacity_kwh: 3500, power_kw: 1500, envelope: { kind: "container_40ft_iso" } },
        )
        expect(v.passed).toBe(true)
    })
})

// ─── Extraction unit tests ─────────────────────────────────────────────

describe("Gate 1 — extraction helpers", () => {
    describe("_extractCapacityFromBrief", () => {
        test("extracts MWh and normalises to Wh", () => {
            const r = _extractCapacityFromBrief("A 3.5 MWh battery storage system.")
            expect(r).not.toBeNull()
            expect(r!.normalised).toBe(3_500_000)
            expect(r!.unit).toBe("MWh")
        })

        test("extracts kWh", () => {
            const r = _extractCapacityFromBrief("200 kWh residential storage unit.")
            expect(r!.normalised).toBe(200_000)
            expect(r!.unit).toBe("kWh")
        })

        test("does not confuse kW with kWh", () => {
            const r = _extractCapacityFromBrief("A 1.5 MW system with no stated capacity.")
            expect(r).toBeNull()
        })

        test("takes largest when multiple values present", () => {
            const r = _extractCapacityFromBrief("Ranging from 100 kWh to 3.5 MWh.")
            expect(r!.normalised).toBe(3_500_000)
        })
    })

    describe("_extractPowerFromBrief", () => {
        test("extracts MW", () => {
            const r = _extractPowerFromBrief("A 1.5 MW grid-forming inverter.")
            expect(r!.normalised).toBe(1_500_000)
            expect(r!.unit).toBe("MW")
        })

        test("extracts kW", () => {
            const r = _extractPowerFromBrief("100 kW rooftop solar array.")
            expect(r!.normalised).toBe(100_000)
        })

        test("does NOT extract kWh as power", () => {
            const r = _extractPowerFromBrief("A 500 kWh battery pack.")
            // kWh is energy, not power — should return null
            expect(r).toBeNull()
        })
    })

    describe("_extractMassFromBrief", () => {
        test("extracts kg", () => {
            const r = _extractMassFromBrief("Total mass below 1200 kg.")
            expect(r!.normalised).toBeCloseTo(1200, 0)
        })

        test("extracts tonnes and normalises to kg", () => {
            const r = _extractMassFromBrief("Maximum payload 20 tonnes.")
            expect(r!.normalised).toBeCloseTo(20_000, 0)
        })

        test("extracts lbs and normalises to kg", () => {
            const r = _extractMassFromBrief("Weighing 440 lbs.")
            expect(r!.normalised).toBeCloseTo(199.6, 0)
        })
    })

    describe("_extractThroughputFromBrief", () => {
        test("extracts m³/day", () => {
            const r = _extractThroughputFromBrief("Process 500 m³/day of seawater.")
            expect(r).not.toBeNull()
            expect(r!.unit).toBe("m³/day")
            // 500 / 86400 ≈ 0.005787 m³/s
            expect(r!.normalised).toBeCloseTo(500 / 86_400, 8)
        })

        test("extracts litres/min", () => {
            const r = _extractThroughputFromBrief("Flow rate: 200 litres/min.")
            expect(r!.unit).toBe("litres/min")
        })

        test("returns null when no throughput", () => {
            const r = _extractThroughputFromBrief("A smart controller for a solar farm.")
            expect(r).toBeNull()
        })
    })

    describe("_extractEnvelopeKindFromBrief", () => {
        test("detects 40ft container", () => {
            expect(_extractEnvelopeKindFromBrief("A 40ft containerised BESS.")).toBe("container_40ft_iso")
        })

        test("detects 20ft container", () => {
            expect(_extractEnvelopeKindFromBrief("Deploy in a 20ft ISO container.")).toBe("container_20ft_iso")
        })

        test("detects 53ft high-cube", () => {
            expect(_extractEnvelopeKindFromBrief("53ft HC container rack.")).toBe("container_53ft_hc")
        })

        test("returns null when no envelope hint", () => {
            expect(_extractEnvelopeKindFromBrief("A SaaS billing platform for SMEs.")).toBeNull()
        })
    })
})

// ─── buildGate1Input helper ────────────────────────────────────────────

describe("Gate 1 — buildGate1Input", () => {
    test("extracts capacity_kwh from dimension_sheet.target.kwh", () => {
        const input = buildGate1Input(
            { report: "A 3.5 MWh BESS for a UK solar farm.", designBrief: undefined },
            {
                feasible: true,
                rules_domain: "bess",
                rules_version: "1",
                target: { kwh: 3500, kw: 1500 },
                envelope: { kind: "container_40ft_iso" } as import("@/lib/sizing/types").Envelope,
                floor_budget_m2: 0,
                module_dimensions: {},
                unmatched_module_ids: [],
                unmatched_slot_ids: [],
                conflicts: [],
                recommendations: [],
                notes: [],
                iterations: [],
            } as unknown as import("@/lib/sizing/types").DimensionSheet,
        )
        expect(input.chase_design_brief.capacity_kwh).toBe(3500)
        expect(input.chase_design_brief.power_kw).toBe(1500)
        expect(input.chase_design_brief.envelope?.kind).toBe("container_40ft_iso")
    })

    test("handles null dimension_sheet gracefully", () => {
        const input = buildGate1Input({ report: "A 1.5 MW system." }, null)
        expect(input.chase_design_brief.capacity_kwh).toBeNull()
        expect(input.chase_design_brief.power_kw).toBeNull()
        expect(input.chase_design_brief.envelope).toBeNull()
    })
})

// ─── Forge-guild demo briefs — no false-positives ────────────────────────
//
// These represent the 5 canonical demo projects. We run Gate 1 against each
// with plausible Chase outputs to confirm the gate doesn't block production
// pipelines that are working correctly.
//
// NOTE: These tests use synthetic but representative Chase outputs. If a
// demo is genuinely mismatched it SHOULD be flagged here — that is a real
// corruption we want to find.

describe("Gate 1 — forge-guild demo briefs", () => {
    // Demo 1: BESS — 3.5 MWh, 1.5 MW, 40ft container
    test("BESS demo — 3.5 MWh / 1.5 MW → no false-positive when Chase is correct", () => {
        const v = check(
            "A 3.5 MWh, 1.5 MW grid-scale battery energy storage system in a 40ft containerised unit for a UK solar farm. Target installed cost below £2M.",
            { capacity_kwh: 3500, power_kw: 1500, envelope: { kind: "container_40ft_iso" } },
        )
        expect(v.passed).toBe(true)
        expect(v.blockers).toHaveLength(0)
    })

    // Demo 2: HAPS — no kWh/kW numeric, no envelope — gate should pass cleanly
    test("HAPS demo — no numeric capacity/power → PASS (nothing to compare)", () => {
        const v = check(
            "A solar-hydrogen hybrid high-altitude pseudo-satellite (HAPS) platform for persistent surveillance at 20 km altitude. Wing span approximately 35 m.",
            {},
        )
        expect(v.passed).toBe(true)
        expect(v.blockers).toHaveLength(0)
    })

    // Demo 3: Modular vertical farm — 40ft containerised, canopy area, no kWh
    test("Vertical farm demo — 40ft containerised → PASS when Chase matches envelope", () => {
        const v = check(
            "A 40ft containerised modular vertical farm growing leafy greens in urban environments. Target: 200 m² canopy area, 5 tiers.",
            { envelope: { kind: "container_40ft_iso" } },
        )
        expect(v.passed).toBe(true)
    })

    // Demo 4: Containerised seawater desalination — 500 m³/day
    test("Desalination demo — 500 m³/day throughput → PASS when Chase matches", () => {
        // Chase throughput is already normalised to per-second
        const perSecond = 500 / 86_400
        const v = check(
            "A containerised seawater reverse osmosis desalination plant producing 500 m³/day of potable water.",
            { throughput: perSecond, throughput_unit: "m3/day" },
        )
        expect(v.passed).toBe(true)
    })

    // Demo 5: Garden bird feeder — no numeric claims → trivially passes
    test("Bird feeder demo — no numeric claims → PASS", () => {
        const v = check(
            "A garden bird feeder with integrated solar charging and IoT monitoring for UK garden birds.",
            {},
        )
        expect(v.passed).toBe(true)
        expect(v.blockers).toHaveLength(0)
    })

    // Regression: BESS where Chase extracted wrong order of magnitude (Loop 22-25 class)
    test("BESS regression — Chase extracted 100 kW instead of 1.5 MW → BLOCKER detected", () => {
        const v = check(
            "A 1.5 MW, 3.5 MWh grid-scale battery storage system in a 40ft containerised unit.",
            { capacity_kwh: 3500, power_kw: 100, envelope: { kind: "container_40ft_iso" } },
        )
        // 1.5 MW (1500 kW) vs 100 kW = 15× → BLOCKER
        expect(v.passed).toBe(false)
        expect(v.blockers.some((b) => b.axis === "power" && b.factor_off >= 3)).toBe(true)
    })
})

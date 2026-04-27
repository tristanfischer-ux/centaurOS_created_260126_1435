/**
 * @file boilerplate-detect.test.ts — Loop 15 P2: tests for risk-row repair.
 */

import {
    isCauseBoilerplate,
    isMitigationBoilerplate,
    isConsequenceBoilerplate,
    repairRiskRowFromContext,
} from "../boilerplate-detect"

describe("isCauseBoilerplate", () => {
    test("flags 'See module-level analysis' as boilerplate", () => {
        expect(isCauseBoilerplate("See module-level analysis")).toBe(true)
    })

    test("flags TBD / TBA / N/A", () => {
        expect(isCauseBoilerplate("TBD")).toBe(true)
        expect(isCauseBoilerplate("TBA")).toBe(true)
        expect(isCauseBoilerplate("N/A")).toBe(true)
    })

    test("flags empty / whitespace-only / undefined", () => {
        expect(isCauseBoilerplate(null)).toBe(true)
        expect(isCauseBoilerplate(undefined)).toBe(true)
        expect(isCauseBoilerplate("")).toBe(true)
        expect(isCauseBoilerplate("    ")).toBe(true)
    })

    test("does NOT flag substantive cause text", () => {
        expect(
            isCauseBoilerplate(
                "Lithium plating on the anode when charging below 0 °C, producing dendrites that pierce the separator.",
            ),
        ).toBe(false)
    })
})

describe("isMitigationBoilerplate", () => {
    test("flags 'Detail-design phase: derive specific monitoring' (the HAPS Loop 14 boilerplate)", () => {
        expect(
            isMitigationBoilerplate(
                "Detail-design phase: derive specific monitoring, inspection or test step from this hazard",
            ),
        ).toBe(true)
    })

    test("flags variants of 'derive specific'", () => {
        expect(isMitigationBoilerplate("Detail design phase: derive specific monitoring")).toBe(true)
        expect(isMitigationBoilerplate("derive specific inspection step")).toBe(true)
        expect(isMitigationBoilerplate("derive specific test step")).toBe(true)
    })

    test("does NOT flag substantive mitigation text", () => {
        expect(
            isMitigationBoilerplate(
                "Helium leak test at 10⁻⁵ mbar·L/s on every assembled unit; replace seals at the elastomer's documented compression-set limit.",
            ),
        ).toBe(false)
    })
})

describe("isConsequenceBoilerplate", () => {
    test("flags 'See module-level analysis'", () => {
        expect(isConsequenceBoilerplate("See module-level analysis")).toBe(true)
    })

    test("does NOT flag substantive consequence text", () => {
        expect(
            isConsequenceBoilerplate(
                "Loss of platform; fire propagation to adjacent assemblies; potential injury to personnel during ground handling.",
            ),
        ).toBe(false)
    })
})

describe("repairRiskRowFromContext", () => {
    test("when no fields are boilerplate, returns originals unchanged + repaired=false", () => {
        const out = repairRiskRowFromContext(
            {
                hazard: "Galvanic corrosion at cadmium-fastener / carbon-fibre interface",
                cause: "Cadmium plating on steel fasteners against carbon-fibre laminate forms a galvanic couple in marine atmosphere.",
                consequence: "Localised corrosion at fastener heads; long-term loss of joint preload.",
                mitigation: "Replace cadmium-plated fasteners with passivated A286 stainless steel; B117 salt-fog test 480 h.",
            },
            {
                issues: [],
                failureModes: [],
                moduleName: "Port Wing Assembly",
            },
        )
        expect(out.repaired).toBe(false)
        expect(out.cause).toContain("Cadmium plating")
        expect(out.mitigation).toContain("A286")
    })

    test("when cause is boilerplate but engineering review issue matches by tokens, repairs from engineering review", () => {
        const out = repairRiskRowFromContext(
            {
                hazard: "Tail boom bending margin shortfall under combined gust and manoeuvre loads",
                cause: "See module-level analysis",
                consequence: "See module-level analysis",
                mitigation: "Detail-design phase: derive specific monitoring, inspection or test step from this hazard",
            },
            {
                issues: [
                    {
                        severity: "critical",
                        category: "Structural",
                        message:
                            "Tail boom bending margin is 3% versus the 50% required by the structural-design specification under combined gust + 1.5g manoeuvre case.",
                        suggestion:
                            "Increase boom wall thickness from 1.6 mm to 2.4 mm; static-test to 1.5x limit load with strain-gauge instrumentation.",
                    },
                    {
                        severity: "warning",
                        category: "Manufacturing",
                        message: "Cadmium-plated fasteners present galvanic risk against carbon-fibre laminate.",
                        suggestion: "Switch to passivated A286.",
                    },
                ],
                failureModes: [],
                moduleName: "Tail Boom",
            },
        )
        expect(out.repaired).toBe(true)
        expect(out.repairSource).toBe("engineering-review")
        expect(out.cause).toContain("Tail boom bending margin")
        expect(out.cause).toContain("3%")
        expect(out.mitigation).toContain("2.4 mm")
    })

    test("when no engineering review matches, falls back to hazard-derived mechanism + named control", () => {
        const out = repairRiskRowFromContext(
            {
                hazard: "Lithium plating on the anode during sub-zero charging",
                cause: "TBD",
                consequence: "TBD",
                mitigation: "Detail-design phase: derive specific monitoring",
            },
            {
                issues: [],
                failureModes: [],
                moduleName: "Battery and Power Management",
            },
        )
        expect(out.repaired).toBe(true)
        expect(out.repairSource).toBe("hazard-derived")
        expect(out.cause).toContain("lithium")
        expect(out.cause?.toLowerCase()).toContain("plat")
        expect(out.mitigation).toContain("0 °C")
    })

    test("returns null cause / mitigation / consequence when no derivation is possible (so caller drops the row)", () => {
        const out = repairRiskRowFromContext(
            {
                hazard: "Generic hazard with no recognisable mechanism keywords",
                cause: "See module-level analysis",
                consequence: "See module-level analysis",
                mitigation: "Detail-design phase: derive specific monitoring",
            },
            {
                issues: [],
                failureModes: [],
                moduleName: "Generic Module",
            },
        )
        // No engineering review, no failure mode, no hazard-derived mechanism
        // matched. All three repaired fields stay null. The caller (PDF
        // renderer) is responsible for not rendering null fields.
        expect(out.repaired).toBe(false)
        expect(out.cause).toBeNull()
        expect(out.consequence).toBeNull()
        expect(out.mitigation).toBeNull()
    })
})

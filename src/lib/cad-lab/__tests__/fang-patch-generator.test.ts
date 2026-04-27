/**
 * @file fang-patch-generator.test.ts — Loop 16 Block G #11b — wiring.
 *
 * Pins the deterministic extractor that converts Fang's `SpecialistReview`
 * into `SpecPatch[]`. Conservative-by-design: a wrong patch is worse than
 * no patch.
 */

import { deriveFangPatches } from "../fang-patch-generator"
import type { SpecialistReview } from "@/lib/cad-lab-types"

function review(over: Partial<SpecialistReview> = {}): SpecialistReview {
    return {
        specialistId: "vp-manufacturing",
        specialistName: "Fang",
        verdict: "warn",
        summary: "Test review",
        issues: [],
        recommendations: [],
        calculations: [],
        reviewMarkdown: "# review",
        reviewedAt: new Date().toISOString(),
        reviewTimeMs: 1234,
        ...over,
    }
}

describe("deriveFangPatches — verdict gating", () => {
    it("returns [] on pass verdict", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "pass",
                issues: [
                    {
                        severity: "critical",
                        category: "Mass",
                        message: "Module exceeds budget — should be 1.5 kg",
                        suggestion: "Switch to aluminium 1.5 kg part",
                    },
                ],
            }),
            module: { id: "mod-1", keyParts: [] },
        })
        expect(patches).toEqual([])
    })

    it("emits patches on warn verdict", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "warn",
                issues: [
                    {
                        severity: "critical",
                        category: "Mass",
                        message: "Module exceeds budget — should be 1.5 kg",
                        suggestion: "Switch to aluminium",
                    },
                ],
            }),
            module: { id: "mod-1", keyParts: [] },
        })
        expect(patches.length).toBeGreaterThan(0)
        expect(patches[0].scope).toBe("module_spec")
    })

    it("emits patches on fail verdict", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                issues: [
                    {
                        severity: "critical",
                        category: "Mass",
                        message: "exceeds 2.4 kg",
                        suggestion: "redesign at 1.8 kg",
                    },
                ],
            }),
            module: { id: "mod-1", keyParts: [] },
        })
        expect(patches.length).toBeGreaterThan(0)
    })
})

describe("deriveFangPatches — severity gating", () => {
    it("ignores warning + info issues — only critical drives patches", () => {
        const patches = deriveFangPatches({
            review: review({
                issues: [
                    {
                        severity: "warning",
                        category: "Mass",
                        message: "Module is 2.3 kg",
                        suggestion: "Consider trimming to 2.0 kg",
                    },
                    {
                        severity: "info",
                        category: "Cost",
                        message: "Could be cheaper at £100",
                    },
                ],
            }),
            module: { id: "mod-1", keyParts: ["PC-001"] },
        })
        expect(patches).toEqual([])
    })
})

describe("deriveFangPatches — mass extraction", () => {
    it("extracts kg figure and emits module_spec massKg patch", () => {
        const patches = deriveFangPatches({
            review: review({
                issues: [
                    {
                        severity: "critical",
                        category: "Mass",
                        message: "Module mass 4.5 kg exceeds 2.0 kg target",
                        suggestion: "Switch from steel to aluminium — 1.6 kg",
                    },
                ],
            }),
            module: { id: "mod-wing", keyParts: [], estimatedMassKg: 4.5 },
        })
        const massPatch = patches.find(
            (p) => p.scope === "module_spec" && p.specKey === "massKg",
        )
        expect(massPatch).toBeDefined()
        // Suggestion is read first (the proposed REPLACEMENT mass — what
        // we want to patch TO). priorValue is the module's prior estimated
        // mass — what we're moving away FROM.
        expect(massPatch!.value).toBe(1.6)
        expect(massPatch!.priorValue).toBe(4.5)
        expect(massPatch!.source).toBe("applied_review_patch")
    })

    it("converts grams to kilograms", () => {
        const patches = deriveFangPatches({
            review: review({
                issues: [
                    {
                        severity: "critical",
                        category: "Weight",
                        message: "Part is 850g — should be 600g for budget",
                    },
                ],
            }),
            module: { id: "mod-1", keyParts: [] },
        })
        const massPatch = patches.find((p) => p.scope === "module_spec")
        expect(massPatch).toBeDefined()
        expect(massPatch!.value).toBe(0.85)
    })

    it("emits part_mass patch when partNumber is referenced", () => {
        const patches = deriveFangPatches({
            review: review({
                issues: [
                    {
                        severity: "critical",
                        category: "Mass",
                        message: "Wing-Skin-001 mass 4.5 kg exceeds budget",
                        suggestion: "Use composite — Wing-Skin-001 should be 1.6 kg",
                    },
                ],
            }),
            module: { id: "mod-wing", keyParts: ["Wing-Skin-001", "Wing-Spar-002"] },
        })
        const partPatch = patches.find((p) => p.scope === "part_mass")
        expect(partPatch).toBeDefined()
        expect(partPatch!.partId).toBe("Wing-Skin-001")
        // Suggestion comes first → the proposed replacement (1.6 kg) is the
        // value we patch TO, not the bespoke 4.5 kg we're moving away FROM.
        expect(partPatch!.value).toBe(1.6)
    })

    it("does NOT match partial part numbers (boundary check)", () => {
        const patches = deriveFangPatches({
            review: review({
                issues: [
                    {
                        severity: "critical",
                        category: "Mass",
                        message: "PC-100 is 2.3 kg",
                        suggestion: "swap PC-100 for PC-1000 at 1.5 kg",
                    },
                ],
            }),
            // Critical: keyParts has BOTH PC-1 and PC-100. PC-1 must NOT
            // match against text containing PC-100 / PC-1000.
            module: { id: "mod-1", keyParts: ["PC-1", "PC-100"] },
        })
        const partPatches = patches.filter((p) => p.scope === "part_mass")
        // Should match PC-100 (the longer one wins, sorted longest-first).
        expect(partPatches.length).toBeGreaterThan(0)
        for (const p of partPatches) {
            expect(p.partId).toBe("PC-100")
            expect(p.partId).not.toBe("PC-1")
        }
    })
})

describe("deriveFangPatches — cost extraction", () => {
    it("extracts £18,000 and emits part_cost patch when partNumber matches", () => {
        const patches = deriveFangPatches({
            review: review({
                issues: [
                    {
                        severity: "critical",
                        category: "Cost",
                        message: "PC-001 priced at £145k — too expensive",
                        suggestion: "Specify Rittal AX cabinet (PC-001) for £18,000 — saves £127k",
                    },
                ],
            }),
            module: { id: "mod-elec", keyParts: ["PC-001"] },
        })
        const costPatch = patches.find((p) => p.scope === "part_cost")
        expect(costPatch).toBeDefined()
        expect(costPatch!.partId).toBe("PC-001")
        expect(costPatch!.value).toBe(18000)
    })

    it("extracts £18.5k pattern", () => {
        const patches = deriveFangPatches({
            review: review({
                issues: [
                    {
                        severity: "critical",
                        category: "Cost",
                        message: "PC-001 should be £18.5k via Rittal",
                    },
                ],
            }),
            module: { id: "mod-elec", keyParts: ["PC-001"] },
        })
        const costPatch = patches.find((p) => p.scope === "part_cost")
        expect(costPatch).toBeDefined()
        expect(costPatch!.value).toBe(18500)
    })

    it("does NOT emit part_cost when no partNumber is referenced", () => {
        const patches = deriveFangPatches({
            review: review({
                issues: [
                    {
                        severity: "critical",
                        category: "Cost",
                        message: "Module costs £145k — way over budget",
                        suggestion: "Should be £18k",
                    },
                ],
            }),
            // keyParts populated but the issue text doesn't reference any.
            module: { id: "mod-1", keyParts: ["UNRELATED-PART-007"] },
        })
        const costPatches = patches.filter((p) => p.scope === "part_cost")
        expect(costPatches).toEqual([])
    })

    it("ignores cost figures outside £1..£10M range", () => {
        const patches = deriveFangPatches({
            review: review({
                issues: [
                    {
                        severity: "critical",
                        category: "Cost",
                        message: "PC-001 is £0.50 (too cheap typo)",
                        suggestion: "should be £999999999 (too high typo)",
                    },
                ],
            }),
            module: { id: "mod-1", keyParts: ["PC-001"] },
        })
        // Both extractions out of bounds; no cost patch.
        const costPatches = patches.filter((p) => p.scope === "part_cost")
        expect(costPatches).toEqual([])
    })
})

describe("deriveFangPatches — recommendations path", () => {
    it("extracts cost patch from recommendation prose", () => {
        const patches = deriveFangPatches({
            review: review({
                issues: [],
                recommendations: [
                    "Specify Rittal AX 1200x800x400 cabinet (PC-001-PUR) for £18,000 — saves £127k vs bespoke design.",
                ],
            }),
            module: { id: "mod-elec", keyParts: ["PC-001-PUR", "PC-002"] },
        })
        const costPatch = patches.find((p) => p.scope === "part_cost")
        expect(costPatch).toBeDefined()
        expect(costPatch!.partId).toBe("PC-001-PUR")
        expect(costPatch!.value).toBe(18000)
    })

    it("ignores tolerance recommendations (no cost / mass keyword)", () => {
        const patches = deriveFangPatches({
            review: review({
                issues: [],
                recommendations: [
                    "Tighten tolerance on PC-001 to ±0.05mm to align with EN 60068-2-6.",
                ],
            }),
            module: { id: "mod-1", keyParts: ["PC-001"] },
        })
        expect(patches).toEqual([])
    })
})

describe("deriveFangPatches — schema compliance", () => {
    it("every emitted patch passes SpecPatchSchema validation", async () => {
        const { SpecPatchSchema } = await import("../spec-patch-types")
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                issues: [
                    {
                        severity: "critical",
                        category: "Mass",
                        message: "Wing-001 is 4.5 kg, target 1.6 kg",
                        suggestion: "Switch composite, Wing-001 at 1.6 kg",
                    },
                    {
                        severity: "critical",
                        category: "Cost",
                        message: "Wing-001 priced at £45k",
                        suggestion: "Wing-001 should be £8,000",
                    },
                ],
                recommendations: [
                    "Wing-001 cost: £8,000 via supplier X (saves £37k).",
                ],
            }),
            module: { id: "mod-wing", keyParts: ["Wing-001"] },
        })
        expect(patches.length).toBeGreaterThan(0)
        for (const p of patches) {
            const result = SpecPatchSchema.safeParse(p)
            if (!result.success) {
                // eslint-disable-next-line no-console
                console.error("invalid patch:", p, result.error)
            }
            expect(result.success).toBe(true)
        }
    })
})

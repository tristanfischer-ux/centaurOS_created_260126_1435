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

describe("deriveFangPatches — reviewMarkdown CRITICAL block extraction", () => {
    it("extracts mass patch from a CRITICAL block in reviewMarkdown when issues[] is empty", () => {
        const md = [
            "### VERDICT: WARN",
            "",
            "#### 🔴 CRITICAL — Hub Mass Budget Exceeded",
            "",
            "The aluminium hub is currently 4.2 kg per unit but the brief target is 1.6 kg. Hub-001 must be redesigned.",
            "",
            "#### 🟡 WARNING — Tolerance call-out missing",
            "",
            "Fold-line tolerance is unspecified.",
        ].join("\n")
        const patches = deriveFangPatches({
            review: review({
                verdict: "warn",
                issues: [], // canonical Fang shape on 2026-04-27 — empty
                reviewMarkdown: md,
            }),
            module: { id: "mod-1", keyParts: ["Hub-001"], estimatedMassKg: 4.2 },
        })
        const modulePatch = patches.find(
            (p) => p.scope === "module_spec" && p.specKey === "massKg",
        )
        expect(modulePatch).toBeDefined()
        // First mass figure encountered is 4.2 kg (the bespoke claim).
        expect(modulePatch!.value).toBe(4.2)
        const partPatch = patches.find((p) => p.scope === "part_mass")
        expect(partPatch).toBeDefined()
        expect(partPatch!.partId).toBe("Hub-001")
    })

    it("extracts cost patch from CRITICAL block referencing a partNumber + £", () => {
        const md = [
            "### VERDICT: FAIL",
            "",
            "#### 🔴 CRITICAL — Cabinet cost £145k vs catalogue £18,000",
            "",
            "PC-001-PUR is bespoke at £145,000. Specify Rittal AX 1200x800x400 (PC-001-PUR) for £18,000 — saves £127k.",
        ].join("\n")
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                issues: [],
                reviewMarkdown: md,
            }),
            module: { id: "mod-elec", keyParts: ["PC-001-PUR"] },
        })
        const costPatch = patches.find((p) => p.scope === "part_cost")
        expect(costPatch).toBeDefined()
        expect(costPatch!.partId).toBe("PC-001-PUR")
        // min-selection across the block: 18000 wins over 145000 + 127000.
        expect(costPatch!.value).toBe(18000)
    })

    it("processes up to 8 CRITICAL blocks per review (cap)", () => {
        const blocks = Array.from({ length: 12 }, (_, i) =>
            `#### 🔴 CRITICAL — Block ${i} mass\n\nPart-00${i} is 2.0 kg vs target 1.0 kg.`,
        )
        const md = blocks.join("\n\n")
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                issues: [],
                reviewMarkdown: md,
            }),
            module: { id: "mod-1", keyParts: blocks.map((_, i) => `Part-00${i}`) },
        })
        // Cap is 8 blocks. Each emits up to 2 patches (module_spec + part_mass)
        // → 16 max from this loop. Past block 8, no patches.
        const partPatches = patches.filter((p) => p.scope === "part_mass")
        expect(partPatches.length).toBeLessThanOrEqual(8)
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

// ─── L16-G #11c additions ────────────────────────────────────────────────

describe("deriveFangPatches — L16-G #11c [REPLACE_PART] tag extraction", () => {
    it("extracts cost patch from a [REPLACE_PART partId=X newCost=N] tag", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                issues: [
                    {
                        severity: "critical",
                        category: "[Cost] Cabinet bespoke pricing",
                        message: "PC-001 priced at £145k — bespoke fabrication unjustified",
                        suggestion:
                            "Specify Rittal AX cabinet for PC-001 at £18,000\n[REPLACE_PART partId=PC-001 newCost=18000]",
                    },
                ],
            }),
            module: {
                id: "mod-elec",
                keyParts: [],
                bomPartNumbers: ["PC-001", "PC-002"],
            },
        })
        const costPatches = patches.filter((p) => p.scope === "part_cost")
        expect(costPatches.length).toBeGreaterThan(0)
        const tagPatch = costPatches.find((p) =>
            typeof p.reason === "string" && p.reason.includes("[REPLACE_PART]"),
        )
        expect(tagPatch).toBeDefined()
        expect(tagPatch!.partId).toBe("PC-001")
        expect(tagPatch!.value).toBe(18000)
    })

    it("extracts mass patch from [REPLACE_PART partId=X newMassKg=N]", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "warn",
                issues: [
                    {
                        severity: "critical",
                        category: "[Mass] Hub overweight",
                        message: "Hub-001 is 4.2 kg",
                        suggestion:
                            "Aluminium 7075-T6 reduces Hub-001 to 1.6 kg\n[REPLACE_PART partId=Hub-001 newMassKg=1.6]",
                    },
                ],
            }),
            module: {
                id: "mod-1",
                keyParts: [],
                bomPartNumbers: ["Hub-001", "Hub-002"],
            },
        })
        const tagMassPatches = patches.filter(
            (p) => p.scope === "part_mass" && typeof p.reason === "string"
                && p.reason.includes("[REPLACE_PART]"),
        )
        expect(tagMassPatches.length).toBeGreaterThan(0)
        expect(tagMassPatches[0].partId).toBe("Hub-001")
        expect(tagMassPatches[0].value).toBe(1.6)
    })

    it("emits both cost and mass patches when tag carries both fields", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                recommendations: [
                    "[REPLACE_PART partId=PC-001 newCost=18000 newMassKg=2.4]",
                ],
            }),
            module: {
                id: "mod-elec",
                keyParts: [],
                bomPartNumbers: ["PC-001"],
            },
        })
        const cost = patches.find(
            (p) => p.scope === "part_cost" && p.partId === "PC-001",
        )
        const mass = patches.find(
            (p) => p.scope === "part_mass" && p.partId === "PC-001",
        )
        expect(cost?.value).toBe(18000)
        expect(mass?.value).toBe(2.4)
    })

    it("rejects [REPLACE_PART] tags whose partId is not in the matching set", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                recommendations: [
                    "[REPLACE_PART partId=HALLUCINATED-PART newCost=18000]",
                ],
            }),
            module: {
                id: "mod-elec",
                keyParts: ["PC-001"],
                bomPartNumbers: ["PC-001"],
            },
        })
        // No tag patch should land — partId is unknown.
        const tagPatches = patches.filter(
            (p) => typeof p.reason === "string" && p.reason.includes("[REPLACE_PART]"),
        )
        expect(tagPatches).toEqual([])
    })

    it("tolerates quoted values: [REPLACE_PART partId=\"PC-001\" newCost=\"18000\"]", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                recommendations: [
                    `[REPLACE_PART partId="PC-001" newCost="18000"]`,
                ],
            }),
            module: {
                id: "mod-elec",
                keyParts: [],
                bomPartNumbers: ["PC-001"],
            },
        })
        const tagPatch = patches.find(
            (p) => p.scope === "part_cost"
                && typeof p.reason === "string"
                && p.reason.includes("[REPLACE_PART]"),
        )
        expect(tagPatch).toBeDefined()
        expect(tagPatch!.partId).toBe("PC-001")
        expect(tagPatch!.value).toBe(18000)
    })

    it("clamps unsafe values from [REPLACE_PART] (cost out-of-bounds)", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                recommendations: [
                    "[REPLACE_PART partId=PC-001 newCost=99999999]",
                ],
            }),
            module: {
                id: "mod-elec",
                keyParts: [],
                bomPartNumbers: ["PC-001"],
            },
        })
        // 99999999 > £10M ceiling — tag has no usable field, no patch.
        const tagPatches = patches.filter(
            (p) => typeof p.reason === "string" && p.reason.includes("[REPLACE_PART]"),
        )
        expect(tagPatches).toEqual([])
    })
})

describe("deriveFangPatches — L16-G #11c bomPartNumbers matching", () => {
    it("matches partNumbers against bomPartNumbers when keyParts is prose-only", () => {
        // Canonical Loop 16 shape: keyParts holds Max's prose hints, the
        // real BOM identifiers (AV-001 etc.) come from the parts table via
        // bomPartNumbers. The legacy-only-keyParts path failed; this one
        // succeeds.
        const patches = deriveFangPatches({
            review: review({
                verdict: "warn",
                issues: [
                    {
                        severity: "critical",
                        category: "[Cost] Avionics tray bespoke",
                        message: "AV-001 quoted at £45k for bespoke fabrication",
                        suggestion: "Spec a standard 19-inch rack — AV-001 at £6,500",
                    },
                ],
            }),
            module: {
                id: "mod-avionics",
                // The legacy prose-only keyParts that BLOCK-G handover flagged.
                keyParts: [
                    "Triple-redundant autonomous flight control computer based on radiation-tolerant ARM Cortex-R52 lockstep processors, Design Assurance Level B software per DO-178C, with three independent power buses",
                ],
                // Real BOM identifiers — what canonical_specs.parts is keyed by.
                bomPartNumbers: ["AV-001", "AV-002", "AV-003"],
            },
        })
        const costPatch = patches.find((p) => p.scope === "part_cost")
        expect(costPatch).toBeDefined()
        expect(costPatch!.partId).toBe("AV-001")
    })

    it("falls back to keyParts when bomPartNumbers is missing (legacy reviews)", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "warn",
                issues: [
                    {
                        severity: "critical",
                        category: "Cost",
                        message: "PC-001 too expensive at £45k",
                        suggestion: "PC-001 should be £6,500",
                    },
                ],
            }),
            // Old-style call — only keyParts, no bomPartNumbers.
            module: { id: "mod-elec", keyParts: ["PC-001"] },
        })
        const costPatch = patches.find((p) => p.scope === "part_cost")
        expect(costPatch).toBeDefined()
        expect(costPatch!.partId).toBe("PC-001")
    })
})

describe("deriveFangPatches — L16-G #11c normalised category tag prefixes", () => {
    it("recognises [Cost] tag prefix on category", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                issues: [
                    {
                        severity: "critical",
                        category: "[Cost] Sourcing strategy",
                        message: "PC-001 quoted £45k",
                        suggestion: "PC-001 catalogue price £6,500",
                    },
                ],
            }),
            module: {
                id: "mod-elec",
                keyParts: [],
                bomPartNumbers: ["PC-001"],
            },
        })
        // Tag prefix triggers cost extraction even though "Sourcing" isn't
        // a legacy cost-keyword — issue category is now [Cost]-prefixed.
        const costPatch = patches.find((p) => p.scope === "part_cost")
        expect(costPatch).toBeDefined()
        expect(costPatch!.partId).toBe("PC-001")
        expect(costPatch!.value).toBe(6500)
    })

    it("recognises [Mass] tag prefix on category", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "warn",
                issues: [
                    {
                        severity: "critical",
                        category: "[Mass] Thermal envelope shifted",
                        message: "Wing-001 is 4.2 kg",
                        suggestion: "Drop to 1.8 kg via composite Wing-001",
                    },
                ],
            }),
            module: {
                id: "mod-wing",
                keyParts: [],
                bomPartNumbers: ["Wing-001"],
                estimatedMassKg: 4.2,
            },
        })
        const partMass = patches.find((p) => p.scope === "part_mass")
        expect(partMass).toBeDefined()
        expect(partMass!.value).toBe(1.8)
        const moduleMass = patches.find((p) => p.scope === "module_spec")
        expect(moduleMass).toBeDefined()
    })

    it("legacy free-text category still works (back-compat)", () => {
        const patches = deriveFangPatches({
            review: review({
                verdict: "warn",
                issues: [
                    {
                        severity: "critical",
                        category: "Hub Mass Budget Exceeded",
                        message: "Hub-001 mass 4.2 kg",
                        suggestion: "Hub-001 → 1.6 kg via aluminium",
                    },
                ],
            }),
            module: {
                id: "mod-1",
                keyParts: [],
                bomPartNumbers: ["Hub-001"],
            },
        })
        const partMass = patches.find((p) => p.scope === "part_mass")
        expect(partMass).toBeDefined()
        expect(partMass!.partId).toBe("Hub-001")
    })
})

describe("deriveFangPatches — L16-G #11c bullet-form CRITICAL extraction", () => {
    it("extracts mass patch from `- **[CRITICAL]` bullet form (Loop 16 saved-review shape)", () => {
        const md = [
            "### VERDICT: WARN",
            "Hub assembly exceeds mass budget",
            "",
            "### Issues Found",
            "- **[CRITICAL] Hub Mass:** Hub-001 weighs 4.2 kg vs target 1.6 kg",
            "  - *Suggestion:* Switch to aluminium 7075-T6 — Hub-001 at 1.6 kg",
            "- **[WARNING] Tolerance:** Fold-line ±0.2 mm",
        ].join("\n")
        const patches = deriveFangPatches({
            review: review({
                verdict: "warn",
                // Empty issues[] — canonical Loop 16 shape per BLOCK-G handover.
                issues: [],
                reviewMarkdown: md,
            }),
            module: {
                id: "mod-1",
                keyParts: [],
                bomPartNumbers: ["Hub-001"],
                estimatedMassKg: 4.2,
            },
        })
        // module_spec massKg should land via bullet extraction.
        const modulePatch = patches.find(
            (p) => p.scope === "module_spec" && p.specKey === "massKg",
        )
        expect(modulePatch).toBeDefined()
        const partPatch = patches.find((p) => p.scope === "part_mass")
        expect(partPatch).toBeDefined()
        expect(partPatch!.partId).toBe("Hub-001")
    })

    it("extracts cost patch from bullet-form CRITICAL with £-figure + partNumber", () => {
        const md = [
            "### VERDICT: FAIL",
            "Cabinet sourcing flagged",
            "",
            "### Issues Found",
            "- **[CRITICAL] Cabinet Cost:** PC-001 quoted £145,000 bespoke",
            "  - *Suggestion:* Specify Rittal AX 1200x800x400 (PC-001) at £18,000",
        ].join("\n")
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                issues: [],
                reviewMarkdown: md,
            }),
            module: {
                id: "mod-elec",
                keyParts: [],
                bomPartNumbers: ["PC-001"],
            },
        })
        const costPatch = patches.find((p) => p.scope === "part_cost")
        expect(costPatch).toBeDefined()
        expect(costPatch!.partId).toBe("PC-001")
        expect(costPatch!.value).toBe(18000)
    })

    it("handles MIXED heading + bullet form in one review", () => {
        const md = [
            "### VERDICT: FAIL",
            "Multiple issues",
            "",
            "#### 🔴 CRITICAL — Hub Mass:",
            "Hub-001 at 4.2 kg, target 1.6 kg.",
            "",
            "### Issues Found",
            "- **[CRITICAL] Cabinet Cost:** PC-001 priced at £145k — should be £18,000",
        ].join("\n")
        const patches = deriveFangPatches({
            review: review({
                verdict: "fail",
                issues: [],
                reviewMarkdown: md,
            }),
            module: {
                id: "mod-mixed",
                keyParts: [],
                bomPartNumbers: ["Hub-001", "PC-001"],
            },
        })
        // Both blocks should fire.
        const hubPatch = patches.find(
            (p) => p.scope === "part_mass" && p.partId === "Hub-001",
        )
        const cabinetPatch = patches.find(
            (p) => p.scope === "part_cost" && p.partId === "PC-001",
        )
        expect(hubPatch).toBeDefined()
        expect(cabinetPatch).toBeDefined()
    })
})

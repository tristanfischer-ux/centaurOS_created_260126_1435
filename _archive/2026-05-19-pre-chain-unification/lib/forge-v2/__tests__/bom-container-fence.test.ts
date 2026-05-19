/**
 * @file bom-container-fence.test.ts — Regression tests for the Loop 25 Item 4
 * container-class BOM cross-check.
 *
 * Root cause (Loop 25 Desalination Module 3.1, council 4/6 flags, 2026-04-29):
 * the brief declared a 40ft ISO container envelope, but the BOM generator priced
 * "Used 20ft container" in Module 3.1. Six pressure vessels at 7,200 mm each
 * require over 21 metres — only feasible in a 40ft container.
 *
 * loadBomGenerationState did not load dimension_sheet, so the BOM LLM never
 * received the envelope kind as a constraint and defaulted to a 20ft container
 * based on training data priors.
 *
 * Fix (two layers):
 *   (a) Prompt constraint (preventive): briefedEnvelopeKind is now injected into
 *       the skeletonBomInternal system prompt as a hard constraint.
 *   (b) Deterministic post-check (blocking): checkBomContainerClassConsistency
 *       scans all merged BOM parts before the pipeline_run is stamped done.
 *       If a part name or description references a container size that contradicts
 *       the briefed envelope kind, the merge stage is hard-blocked.
 *
 * Council: GPT-5.5, Gemini 3.1 Pro, DeepSeek V4-Pro, Mistral Large,
 *          Kimi K2.6, Grok-3 — 2026-04-29 — all 6 voted hard-block.
 *
 * @see src/lib/forge-v2/envelope-classification.ts — implementation
 * @see src/actions/bom.ts — integration point (runBomMergeStage + skeletonBomInternal)
 */

import {
    extractContainerSizeFromText,
    checkBomContainerClassConsistency,
    expectedContainerSizeToken,
} from "../envelope-classification"

// ── extractContainerSizeFromText — true positives ────────────────────────────

describe("extractContainerSizeFromText — true positives (should detect container size)", () => {
    test("detects '20ft' in 'Used 20ft container shell'", () => {
        const result = extractContainerSizeFromText("Used 20ft container shell")
        expect(result).not.toBeNull()
        expect(result!.size).toBe("20ft")
    })

    test("detects '20ft' in '20ft ISO shipping container'", () => {
        const result = extractContainerSizeFromText("20ft ISO shipping container")
        expect(result).not.toBeNull()
        expect(result!.size).toBe("20ft")
    })

    test("detects '20ft' in 'Standard 20-foot shipping container used as primary enclosure'", () => {
        const result = extractContainerSizeFromText(
            "Standard 20-foot shipping container used as primary enclosure",
        )
        expect(result).not.toBeNull()
        expect(result!.size).toBe("20ft")
    })

    test("detects '40ft' in '40ft ISO container frame'", () => {
        const result = extractContainerSizeFromText("40ft ISO container frame")
        expect(result).not.toBeNull()
        expect(result!.size).toBe("40ft")
    })

    test("detects '40ft' in 'Containerised 40ft enclosure shell'", () => {
        const result = extractContainerSizeFromText("Containerised 40ft enclosure shell")
        expect(result).not.toBeNull()
        expect(result!.size).toBe("40ft")
    })

    test("detects '40ft' in '40-foot container (high-cube) primary housing'", () => {
        const result = extractContainerSizeFromText(
            "40-foot container (high-cube) primary housing",
        )
        expect(result).not.toBeNull()
        expect(result!.size).toBe("40ft")
    })

    test("detects '53ft' in '53ft ISO container chassis'", () => {
        const result = extractContainerSizeFromText("53ft ISO container chassis")
        expect(result).not.toBeNull()
        expect(result!.size).toBe("53ft")
    })

    test("detects '45ft' in '45ft high-cube container enclosure'", () => {
        const result = extractContainerSizeFromText("45ft high-cube container enclosure")
        expect(result).not.toBeNull()
        expect(result!.size).toBe("45ft")
    })

    test("detects '10ft' in '10ft container unit for equipment housing'", () => {
        const result = extractContainerSizeFromText("10ft container unit for equipment housing")
        expect(result).not.toBeNull()
        expect(result!.size).toBe("10ft")
    })

    test("detects 'twenty foot' in 'twenty foot shipping container'", () => {
        const result = extractContainerSizeFromText("twenty foot shipping container")
        expect(result).not.toBeNull()
        expect(result!.size).toBe("20ft")
    })
})

// ── extractContainerSizeFromText — true negatives (no-container context) ────

describe("extractContainerSizeFromText — true negatives (should NOT detect)", () => {
    test("does NOT flag '20ft cable tray' — mechanical-length context", () => {
        const result = extractContainerSizeFromText("20ft cable tray section")
        expect(result).toBeNull()
    })

    test("does NOT flag '20ft conduit run' — mechanical-length context", () => {
        const result = extractContainerSizeFromText("20ft conduit run, PVC, Schedule 40")
        expect(result).toBeNull()
    })

    test("does NOT flag '40ft flexible hose assembly' — hose blocklist", () => {
        const result = extractContainerSizeFromText(
            "40ft flexible hose assembly, DN50, braided stainless",
        )
        expect(result).toBeNull()
    })

    test("does NOT flag '40ft steel beam' — no container anchor", () => {
        const result = extractContainerSizeFromText("40ft steel beam, W8x31")
        expect(result).toBeNull()
    })

    test("does NOT flag bare '20 ft long pipe run' without any anchor", () => {
        const result = extractContainerSizeFromText("20 ft long pipe run, Schedule 80, carbon steel")
        expect(result).toBeNull()
    })

    test("does NOT flag empty string", () => {
        const result = extractContainerSizeFromText("")
        expect(result).toBeNull()
    })
})

// ── checkBomContainerClassConsistency — conflict detection ───────────────────

describe("checkBomContainerClassConsistency — conflict detection", () => {
    /**
     * The Desalination Module 3.1 bug: brief says 40ft ISO, BOM prices 20ft.
     * This must produce a conflict.
     */
    test("CONFLICT: briefed 40ft ISO, BOM part references '20ft container'", () => {
        const parts = [
            {
                partNumber: "DS-001-PUR",
                name: "Used 20ft container",
                description: "Standard 20ft ISO shipping container as module enclosure",
                moduleId: "desalination_module_3_1",
            },
            {
                partNumber: "DS-002-PUR",
                name: "High-pressure pump assembly",
                description: "Multi-stage centrifugal pump, 50 bar operating pressure",
                moduleId: "desalination_module_3_1",
            },
        ]
        const result = checkBomContainerClassConsistency(parts, "container_40ft_iso")
        expect(result.consistent).toBe(false)
        expect(result.conflicts).toHaveLength(1)
        expect(result.conflicts[0].partNumber).toBe("DS-001-PUR")
        expect(result.conflicts[0].detectedSize).toBe("20ft")
        expect(result.conflicts[0].expectedSize).toBe("40ft")
        expect(result.conflicts[0].briefedEnvelopeKind).toBe("container_40ft_iso")
    })

    /**
     * Pass case: briefed 40ft ISO, BOM correctly references 40ft container.
     */
    test("PASS: briefed 40ft ISO, BOM part references '40ft ISO container'", () => {
        const parts = [
            {
                partNumber: "DS-001-PUR",
                name: "40ft ISO container shell",
                description: "40-foot ISO container as primary module enclosure",
                moduleId: "desalination_module_3_1",
            },
        ]
        const result = checkBomContainerClassConsistency(parts, "container_40ft_iso")
        expect(result.consistent).toBe(true)
        expect(result.conflicts).toHaveLength(0)
    })

    /**
     * Non-container envelopes must pass through immediately.
     */
    test("PASS: non-container envelope (warehouse_bay) — check does not apply", () => {
        const parts = [
            {
                partNumber: "WH-001-PUR",
                name: "Steel shelving unit",
                description: "Industrial shelving, 2m × 0.5m × 2m, galvanised",
                moduleId: "storage_module",
            },
        ]
        const result = checkBomContainerClassConsistency(parts, "warehouse_bay")
        expect(result.consistent).toBe(true)
        expect(result.conflicts).toHaveLength(0)
    })

    /**
     * Non-container envelope (room) — same pass-through rule.
     */
    test("PASS: non-container envelope (room) — check does not apply", () => {
        const parts = [
            {
                partNumber: "RM-001",
                name: "Control panel housing",
                description: "Wall-mounted control panel enclosure",
                moduleId: "control_module",
            },
        ]
        const result = checkBomContainerClassConsistency(parts, "room")
        expect(result.consistent).toBe(true)
        expect(result.conflicts).toHaveLength(0)
    })

    /**
     * Multiple conflicting parts in the same project.
     */
    test("CONFLICT: multiple parts reference wrong container size", () => {
        const parts = [
            {
                partNumber: "DS-001-PUR",
                name: "Used 20ft container",
                description: "20ft shipping container enclosure",
                moduleId: "module_a",
            },
            {
                partNumber: "DS-002-PUR",
                name: "Pump assembly",
                description: "Centrifugal pump",
                moduleId: "module_a",
            },
            {
                partNumber: "DS-003-PUR",
                name: "20-foot container base frame",
                description: "Structural base frame welded to 20ft ISO container",
                moduleId: "module_b",
            },
        ]
        const result = checkBomContainerClassConsistency(parts, "container_40ft_iso")
        expect(result.consistent).toBe(false)
        // DS-001 and DS-003 both reference 20ft; DS-002 has no container reference
        expect(result.conflicts).toHaveLength(2)
        const partNumbers = result.conflicts.map((c) => c.partNumber)
        expect(partNumbers).toContain("DS-001-PUR")
        expect(partNumbers).toContain("DS-003-PUR")
    })

    /**
     * Empty BOM is consistent (nothing to conflict).
     */
    test("PASS: empty BOM parts array", () => {
        const result = checkBomContainerClassConsistency([], "container_40ft_iso")
        expect(result.consistent).toBe(true)
        expect(result.conflicts).toHaveLength(0)
    })

    /**
     * Parts with no container references at all are consistent.
     */
    test("PASS: no container references in any part name/description", () => {
        const parts = [
            {
                partNumber: "BESS-001",
                name: "Lithium iron phosphate battery module",
                description: "LiFePO4 cell pack, 48V nominal, 200Ah capacity",
                moduleId: "battery_module",
            },
            {
                partNumber: "BESS-002",
                name: "Battery management system",
                description: "Active cell balancing, BMS with CAN interface",
                moduleId: "battery_module",
            },
        ]
        const result = checkBomContainerClassConsistency(parts, "container_40ft_iso")
        expect(result.consistent).toBe(true)
        expect(result.conflicts).toHaveLength(0)
    })
})

// ── expectedContainerSizeToken — mapping correctness ─────────────────────────

describe("expectedContainerSizeToken — envelope kind to size token", () => {
    test("container_20ft_iso → '20ft'", () => {
        expect(expectedContainerSizeToken("container_20ft_iso")).toBe("20ft")
    })

    test("container_40ft_iso → '40ft'", () => {
        expect(expectedContainerSizeToken("container_40ft_iso")).toBe("40ft")
    })

    test("container_53ft_hc → '53ft'", () => {
        expect(expectedContainerSizeToken("container_53ft_hc")).toBe("53ft")
    })

    test("warehouse_bay → null (not a container)", () => {
        expect(expectedContainerSizeToken("warehouse_bay")).toBeNull()
    })

    test("room → null (not a container)", () => {
        expect(expectedContainerSizeToken("room")).toBeNull()
    })

    test("plot → null (not a container)", () => {
        expect(expectedContainerSizeToken("plot")).toBeNull()
    })

    test("custom → null (not a container)", () => {
        expect(expectedContainerSizeToken("custom")).toBeNull()
    })
})

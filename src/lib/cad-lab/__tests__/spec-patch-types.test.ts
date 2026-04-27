/**
 * @file spec-patch-types.test.ts — Loop 16 Block G structured-patch validator.
 *
 * Council unanimity: Fang must emit STRUCTURED PATCHES, never prose. The
 * Zod schema in spec-patch-types.ts is the gate. These tests pin the
 * load-bearing rules.
 */

import { SpecPatchSchema, specPatchHash, type SpecPatch } from "../spec-patch-types"

describe("SpecPatchSchema validation", () => {
    it("accepts a minimal part_cost patch", () => {
        const patch: SpecPatch = {
            scope: "part_cost",
            op: "replace",
            partId: "PC-001",
            value: 18000,
            reason: "Rittal AX 1200x800x400 catalogue match — saves £127k vs bespoke",
            source: "applied_review_patch",
            costImpactGbpPence: -12700000,
        }
        const result = SpecPatchSchema.safeParse(patch)
        expect(result.success).toBe(true)
    })

    it("rejects part_cost without partId", () => {
        const result = SpecPatchSchema.safeParse({
            scope: "part_cost",
            op: "replace",
            value: 18000,
            reason: "Catalogue match — Rittal AX 1200x800x400 painted RAL 7035",
            source: "applied_review_patch",
        })
        expect(result.success).toBe(false)
    })

    it("rejects reason shorter than 20 chars", () => {
        const result = SpecPatchSchema.safeParse({
            scope: "part_cost",
            op: "replace",
            partId: "PC-001",
            value: 18000,
            reason: "too short",
            source: "applied_review_patch",
        })
        expect(result.success).toBe(false)
    })

    it("rejects negative cost", () => {
        const result = SpecPatchSchema.safeParse({
            scope: "part_cost",
            op: "replace",
            partId: "PC-001",
            value: -100,
            reason: "Negative cost should be rejected by the schema check",
            source: "applied_review_patch",
        })
        expect(result.success).toBe(false)
    })

    it("accepts module_spec patch with required moduleId + specKey", () => {
        const result = SpecPatchSchema.safeParse({
            scope: "module_spec",
            op: "replace",
            moduleId: "PowerCabinet",
            specKey: "powerW",
            value: 2000,
            reason: "Sizing solver confirms 2 kW; BOM was oversized at 25 kW",
            source: "applied_review_patch",
        })
        expect(result.success).toBe(true)
    })

    it("rejects module_spec without specKey", () => {
        const result = SpecPatchSchema.safeParse({
            scope: "module_spec",
            op: "replace",
            moduleId: "PowerCabinet",
            value: 2000,
            reason: "Sizing solver confirms 2 kW; BOM was oversized at 25 kW",
            source: "applied_review_patch",
        })
        expect(result.success).toBe(false)
    })

    it("accepts part_identity patch with object value", () => {
        const result = SpecPatchSchema.safeParse({
            scope: "part_identity",
            op: "replace",
            partId: "CAB-001",
            value: {
                description: "Rittal AX 1200x800x400 painted RAL 7035",
                mpn: "AX-1200-800-400",
                manufacturer: "Rittal",
            },
            reason: "Catalogue match for the bespoke fabricated cabinet — saves £127k",
            source: "applied_review_patch",
        })
        expect(result.success).toBe(true)
    })
})

describe("specPatchHash oscillation guard", () => {
    it("identical patches produce identical hashes", () => {
        const a: SpecPatch = {
            scope: "part_cost",
            op: "replace",
            partId: "PC-001",
            value: 18000,
            reason: "Rittal AX catalogue match — saves £127k",
            source: "applied_review_patch",
        }
        const b: SpecPatch = { ...a }
        expect(specPatchHash(a)).toEqual(specPatchHash(b))
    })

    it("different values produce different hashes", () => {
        const a: SpecPatch = {
            scope: "part_cost",
            op: "replace",
            partId: "PC-001",
            value: 18000,
            reason: "Rittal AX catalogue match — saves £127k",
            source: "applied_review_patch",
        }
        const b: SpecPatch = { ...a, value: 145000 }
        expect(specPatchHash(a)).not.toEqual(specPatchHash(b))
    })

    it("different partIds produce different hashes", () => {
        const a: SpecPatch = {
            scope: "part_cost",
            op: "replace",
            partId: "PC-001",
            value: 18000,
            reason: "Rittal AX catalogue match — saves £127k",
            source: "applied_review_patch",
        }
        const b: SpecPatch = { ...a, partId: "PC-002" }
        expect(specPatchHash(a)).not.toEqual(specPatchHash(b))
    })
})

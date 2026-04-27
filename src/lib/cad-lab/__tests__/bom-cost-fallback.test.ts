/**
 * @file bom-cost-fallback.test.ts — Loop 15 P3.
 */

import { parametricEstimate, applyBomCostFallback } from "../bom-cost-fallback"

describe("parametricEstimate", () => {
    test("returns existing cost unchanged when non-null and > 0", () => {
        const out = parametricEstimate(
            {
                partNumber: "X1",
                name: "Foo",
                description: null,
                process: null,
                material: null,
                massKg: null,
                isPurchased: true,
            },
            120,
        )
        expect(out.estimatedUnitCostGbp).toBe(120)
        expect(out.confidence).toBe("high")
        expect(out.rationale).toBeNull()
    })

    test("HAPS PWA-001 Primary Wing Spar — categorises as aerospace composite primary structure", () => {
        const out = parametricEstimate(
            {
                partNumber: "PWA-001",
                name: "Primary Wing Spar, Port",
                description: "Carbon-fibre composite main spar, autoclave-cured, port wing",
                process: "Autoclave cure",
                material: "T800/M21 carbon prepreg",
                massKg: 8.4,
                isPurchased: true,
            },
            null,
        )
        expect(out.categoryId).toBe("aerospace-composite-primary-structure")
        expect(out.estimatedUnitCostGbp).not.toBeNull()
        // 8.4 kg × £1100/kg = £9,240
        expect(out.estimatedUnitCostGbp).toBeGreaterThan(8000)
        expect(out.estimatedUnitCostGbp).toBeLessThan(11000)
        expect(out.rationale).toContain("composite")
        expect(out.confidence).toBe("medium")
    })

    test("HAPS HYD-001 Hydrogen Tank — categorises as hydrogen-pressure-vessel", () => {
        const out = parametricEstimate(
            {
                partNumber: "HYD-001",
                name: "Hydrogen Storage Tank, 350 bar",
                description: "Type-IV composite overwrap pressure vessel",
                process: null,
                material: "Carbon overwrap on HDPE liner",
                massKg: 14,
                isPurchased: true,
            },
            null,
        )
        expect(out.categoryId).toBe("hydrogen-pressure-vessel")
        expect(out.estimatedUnitCostGbp).toBeGreaterThan(15000)
        expect(out.estimatedUnitCostGbp).toBeLessThan(25000)
    })

    test("HAPS PWA-007 Wingtip navigation light — categorises as nav-lights", () => {
        const out = parametricEstimate(
            {
                partNumber: "PWA-007",
                name: "Wingtip Navigation Light",
                description: "Position light, port side, LED cluster",
                process: null,
                material: null,
                massKg: 0.05,
                isPurchased: true,
            },
            null,
        )
        expect(out.categoryId).toBe("nav-lights")
        expect(out.estimatedUnitCostGbp).toBe(280)
    })

    test("Hedgerow camera module — categorises as camera-imager", () => {
        const out = parametricEstimate(
            {
                partNumber: "CAM-001",
                name: "Image sensor module — Sony IMX477",
                description: "12 MP CMOS sensor with C-mount lens",
                process: null,
                material: null,
                massKg: 0.04,
                isPurchased: true,
            },
            null,
        )
        expect(out.categoryId).toBe("camera-imager")
        expect(out.estimatedUnitCostGbp).toBe(35)
    })

    test("Hedgerow neural processing unit — categorises as edge-ai-npu", () => {
        const out = parametricEstimate(
            {
                partNumber: "NPU-001",
                name: "Edge AI compute module",
                description: "Hailo-8 NPU on M.2 carrier",
                process: null,
                material: null,
                massKg: 0.06,
                isPurchased: true,
            },
            null,
        )
        expect(out.categoryId).toBe("edge-ai-npu")
        expect(out.estimatedUnitCostGbp).toBe(95)
    })

    test("returns nulls when no category matches and row is unpriced", () => {
        const out = parametricEstimate(
            {
                partNumber: "X1",
                name: "Mystery widget",
                description: "Has no recognisable keywords",
                process: null,
                material: null,
                massKg: null,
                isPurchased: true,
            },
            null,
        )
        expect(out.categoryId).toBeNull()
        expect(out.estimatedUnitCostGbp).toBeNull()
    })

    test("does not estimate make rows", () => {
        const out = parametricEstimate(
            {
                partNumber: "X1",
                name: "Carbon-fibre composite spar",
                description: null,
                process: "Autoclave cure",
                material: "Carbon prepreg",
                massKg: 5,
                isPurchased: false,
            },
            null,
        )
        // Make rows are estimated upstream by the make-cost specialist
        expect(out.estimatedUnitCostGbp).toBeNull()
    })
})

describe("applyBomCostFallback", () => {
    test("returns a Map covering every input part by partNumber", () => {
        const parts = [
            {
                partNumber: "A",
                name: "Camera module IMX477",
                description: null,
                process: null,
                material: null,
                massKg: null,
                isPurchased: true,
                estimatedUnitCostGbp: null,
            },
            {
                partNumber: "B",
                name: "Already priced widget",
                description: null,
                process: null,
                material: null,
                massKg: null,
                isPurchased: true,
                estimatedUnitCostGbp: 50,
            },
        ]
        const map = applyBomCostFallback(parts)
        expect(map.size).toBe(2)
        expect(map.get("A")?.estimatedUnitCostGbp).toBe(35) // camera tier
        expect(map.get("B")?.estimatedUnitCostGbp).toBe(50) // unchanged
    })
})

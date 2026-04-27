/**
 * @file supplier-strong-fit-promotion.test.ts — Loop 15 P4.
 */

import { promoteSupplierScore } from "../supplier-strong-fit-promotion"

describe("promoteSupplierScore", () => {
    test("aerospace AS9100 supplier matched against composite wing spar gets +20 boost", () => {
        const out = promoteSupplierScore({
            matchScore: 35,
            certifications: ["AS9100D", "ISO 9001"],
            description: "Aerospace contract manufacturer specialising in carbon-fibre composite primary structures and autoclave cure.",
            capabilityText: "carbon fibre composite autoclave cure",
            matchedPartNumbers: ["PWA-001"],
            matchedPartDescriptions: ["Primary Wing Spar, Port — composite spar carbon fibre"],
        })
        // 35 base + 20 cert + 5 capability evidence = 60 (capped at boost +25)
        expect(out.boost).toBeGreaterThanOrEqual(20)
        expect(out.boost).toBeLessThanOrEqual(25)
        expect(out.promotedScore).toBeGreaterThanOrEqual(50)
        expect(out.reasons.some((r) => r.includes("AEROSPACE"))).toBe(true)
    })

    test("medical ISO 13485 supplier matched against catheter component gets +20 boost", () => {
        const out = promoteSupplierScore({
            matchScore: 38,
            certifications: ["ISO 13485:2016"],
            description: "Medical device contract manufacturer; cleanroom Class 100",
            capabilityText: "medical injection mould cleanroom",
            matchedPartNumbers: ["CAT-001"],
            matchedPartDescriptions: ["Catheter tubing — implant-grade thermoplastic"],
        })
        expect(out.boost).toBeGreaterThanOrEqual(20)
        expect(out.promotedScore).toBeGreaterThanOrEqual(50)
        expect(out.reasons.some((r) => r.includes("MEDICAL"))).toBe(true)
    })

    test("ISO 9001 + capability keyword (no industry cert) gets +10 boost", () => {
        const out = promoteSupplierScore({
            matchScore: 38,
            certifications: ["ISO 9001:2015"],
            description: "PCBA contract manufacturer specialising in low-volume mixed-technology populated PCBs.",
            capabilityText: "PCBA populated PCB SMT through-hole",
            matchedPartNumbers: ["MAIN-001"],
            matchedPartDescriptions: ["Main board populated PCB assembly"],
        })
        expect(out.boost).toBeGreaterThanOrEqual(10)
        expect(out.promotedScore).toBeGreaterThanOrEqual(45)
    })

    test("supplier with no matching cert and no capability evidence gets zero boost", () => {
        const out = promoteSupplierScore({
            matchScore: 35,
            certifications: ["BRC food grade"],
            description: "Food packaging supplier",
            capabilityText: "thermoform food packaging",
            matchedPartNumbers: ["PWA-001"],
            matchedPartDescriptions: ["Primary Wing Spar, composite carbon fibre"],
        })
        expect(out.boost).toBe(0)
        expect(out.promotedScore).toBe(35)
    })

    test("boost is capped at +25 — three keyword matches do not stack into oblivion", () => {
        const out = promoteSupplierScore({
            matchScore: 40,
            certifications: ["AS9100", "NADCAP", "ISO 9001"],
            description: "Aerospace composite + carbon fibre + cleanroom + hydrogen pressure vessel + fuel cell + autoclave",
            capabilityText: "composite hydrogen autoclave fuel cell",
            matchedPartNumbers: ["X1"],
            matchedPartDescriptions: ["aerospace composite wing"],
        })
        expect(out.boost).toBeLessThanOrEqual(25)
        expect(out.promotedScore).toBeLessThanOrEqual(100)
    })

    test("null matchScore returns null promotedScore (no-op)", () => {
        const out = promoteSupplierScore({
            matchScore: null,
            certifications: ["AS9100"],
            description: null,
            capabilityText: null,
            matchedPartNumbers: [],
            matchedPartDescriptions: [],
        })
        expect(out.promotedScore).toBeNull()
        expect(out.boost).toBe(0)
        expect(out.reasons).toEqual([])
    })

    test("score never decreases (promotion is monotonic)", () => {
        const inputs = [10, 25, 35, 50, 80]
        for (const score of inputs) {
            const out = promoteSupplierScore({
                matchScore: score,
                certifications: ["AS9100"],
                description: "aerospace composite carbon fibre",
                capabilityText: "composite autoclave",
                matchedPartNumbers: ["X"],
                matchedPartDescriptions: ["aerospace wing carbon fibre"],
            })
            expect(out.promotedScore).toBeGreaterThanOrEqual(score)
        }
    })

    test("score is capped at 100", () => {
        const out = promoteSupplierScore({
            matchScore: 95,
            certifications: ["AS9100", "NADCAP"],
            description: "aerospace composite carbon fibre autoclave hydrogen pressure vessel fuel cell",
            capabilityText: "composite autoclave hydrogen fuel cell",
            matchedPartNumbers: ["X"],
            matchedPartDescriptions: ["aerospace wing carbon fibre"],
        })
        expect(out.promotedScore).toBeLessThanOrEqual(100)
    })
})

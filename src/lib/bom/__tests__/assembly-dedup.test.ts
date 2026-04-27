import { dedupAssemblyRollUp, dedupedUnitTotalGbp } from "../assembly-dedup"

describe("dedupAssemblyRollUp", () => {
    it("drops the assembly parent when constituents are present (BESS PC-001 case)", () => {
        // BESS Power Conversion module: skid assembly £145,000 + 8 leaf parts
        // £142,000. Loop 9 P1 summed all and reported £287,000.
        const parts = [
            {
                partNumber: "PC-001-PUR",
                name: "Bi-directional Grid-Forming Power Conversion System Skid Assembly",
                sourceModuleName: "Power Conversion System",
                estimatedUnitCostGbp: 145000,
                massKg: 4200,
            },
            {
                partNumber: "PC-002-PUR",
                name: "Bi-directional grid-forming inverter, 1.5 MW continuous",
                sourceModuleName: "Power Conversion System",
                estimatedUnitCostGbp: 62000,
                massKg: 280,
            },
            {
                partNumber: "PC-003-PUR",
                name: "DC input switchgear, 1500 VDC",
                sourceModuleName: "Power Conversion System",
                estimatedUnitCostGbp: 18500,
                massKg: 185,
            },
            {
                partNumber: "PC-004-PUR",
                name: "AC output contactor and line filter assembly, 2500 A three-phase with LCL harmonic filter",
                sourceModuleName: "Power Conversion System",
                estimatedUnitCostGbp: 24000,
                massKg: 420,
            },
        ]
        const result = dedupAssemblyRollUp(parts)
        expect(result.droppedParentIndices.has(0)).toBe(true) // PC-001 is the parent
        expect(result.effectiveCost[0]).toBe(0) // dropped
        expect(result.effectiveCost[1]).toBe(62000)
        expect(result.effectiveCost[2]).toBe(18500)
        expect(result.effectiveCost[3]).toBe(24000)
        expect(dedupedUnitTotalGbp(parts)).toBe(62000 + 18500 + 24000)
    })

    it("drops the top-level orphan wrapper when module rows exist (Sentinel SENT-ASY case)", () => {
        const parts = [
            {
                partNumber: "SENT-ASY",
                name: "Sentinel Walking Stick Complete Assembly",
                sourceModuleName: null, // top-level
                estimatedUnitCostGbp: 187.5,
                massKg: 0.5,
            },
            {
                partNumber: "HAND-001",
                name: "Machined Hardwood Handle Body",
                sourceModuleName: "handle_assembly",
                estimatedUnitCostGbp: 95,
                massKg: 0.18,
            },
            {
                partNumber: "HAND-002",
                name: "Handle Acoustic Chamber Insert",
                sourceModuleName: "handle_assembly",
                estimatedUnitCostGbp: 28,
                massKg: 0.05,
            },
            {
                partNumber: "HAND-003",
                name: "Grip Sensor PCB Assembly",
                sourceModuleName: "handle_assembly",
                estimatedUnitCostGbp: 42,
                massKg: 0.04,
            },
        ]
        const result = dedupAssemblyRollUp(parts)
        expect(result.droppedOrphanIndices.has(0)).toBe(true) // SENT-ASY dropped
        expect(result.effectiveCost[0]).toBe(0)
        expect(dedupedUnitTotalGbp(parts)).toBe(95 + 28 + 42)
    })

    it("keeps the assembly when it stands alone (no constituents)", () => {
        const parts = [
            {
                partNumber: "STIK-ASY",
                name: "Walking Stick Assembly",
                sourceModuleName: "stick",
                estimatedUnitCostGbp: 100,
                massKg: 0.3,
            },
        ]
        const result = dedupAssemblyRollUp(parts)
        expect(result.droppedParentIndices.size).toBe(0)
        expect(result.effectiveCost[0]).toBe(100)
        expect(dedupedUnitTotalGbp(parts)).toBe(100)
    })

    it("keeps an assembly with only one constituent (parent IS the line)", () => {
        // Edge case: assembly + 1 leaf does not double-count strongly enough
        // to drop. Treat the assembly as the canonical line.
        const parts = [
            {
                partNumber: "X-ASY",
                name: "Sub Assembly",
                sourceModuleName: "x",
                estimatedUnitCostGbp: 50,
                massKg: 0.1,
            },
            {
                partNumber: "X-001",
                name: "Sub-component",
                sourceModuleName: "x",
                estimatedUnitCostGbp: 30,
                massKg: 0.08,
            },
        ]
        const result = dedupAssemblyRollUp(parts)
        expect(result.droppedParentIndices.size).toBe(0)
        expect(dedupedUnitTotalGbp(parts)).toBe(80)
    })

    it("matches assembly by partNumber suffix '-ASY' when cost is in band", () => {
        // POW-ASY £38 vs constituents £15 + £8 + £12 = £35 → ratio 109%
        // (well inside 50-150% band).
        const parts = [
            {
                partNumber: "POW-ASY",
                name: "Battery and Inductive Charging Receiver Module", // no "Assembly" in name
                sourceModuleName: "power_module",
                estimatedUnitCostGbp: 38,
                massKg: 0.05,
            },
            {
                partNumber: "POW-001",
                name: "Battery cell, 3.7V 2200mAh",
                sourceModuleName: "power_module",
                estimatedUnitCostGbp: 15,
                massKg: 0.04,
            },
            {
                partNumber: "POW-002",
                name: "Charge controller PCB",
                sourceModuleName: "power_module",
                estimatedUnitCostGbp: 8,
                massKg: 0.005,
            },
            {
                partNumber: "POW-003",
                name: "Inductive coil receiver",
                sourceModuleName: "power_module",
                estimatedUnitCostGbp: 12,
                massKg: 0.005,
            },
        ]
        const result = dedupAssemblyRollUp(parts)
        expect(result.droppedParentIndices.has(0)).toBe(true) // POW-ASY dropped
        expect(dedupedUnitTotalGbp(parts)).toBe(15 + 8 + 12)
    })

    it("does NOT drop assembly-named constituent inside larger module (PCB Assembly case)", () => {
        // Sentinel HAND-003 "Grip Sensor PCB Assembly" £42 — has "Assembly"
        // in name but is one component out of many. Sum of OTHERS in same
        // module is £177 (£95 + £28 + £24 + £18.5 + £11.5). Ratio 24% —
        // far below the 50% floor, so HAND-003 is correctly KEPT.
        const parts = [
            {
                partNumber: "HAND-001",
                name: "Machined Hardwood Handle Body",
                sourceModuleName: "handle_assembly",
                estimatedUnitCostGbp: 95,
                massKg: 0.18,
            },
            {
                partNumber: "HAND-002",
                name: "Handle Acoustic Chamber Insert",
                sourceModuleName: "handle_assembly",
                estimatedUnitCostGbp: 28,
                massKg: 0.05,
            },
            {
                partNumber: "HAND-003",
                name: "Grip Sensor PCB Assembly",
                sourceModuleName: "handle_assembly",
                estimatedUnitCostGbp: 42,
                massKg: 0.04,
            },
            {
                partNumber: "HAND-004",
                name: "Handle Pressure Sensor",
                sourceModuleName: "handle_assembly",
                estimatedUnitCostGbp: 24,
                massKg: 0.02,
            },
            {
                partNumber: "HAND-005",
                name: "9-Axis IMU Module",
                sourceModuleName: "handle_assembly",
                estimatedUnitCostGbp: 18.5,
                massKg: 0.005,
            },
            {
                partNumber: "HAND-006",
                name: "Linear Resonant Actuator",
                sourceModuleName: "handle_assembly",
                estimatedUnitCostGbp: 11.5,
                massKg: 0.005,
            },
            {
                partNumber: "HAND-ASY",
                name: "Hardwood Handle Assembly",
                sourceModuleName: "handle_assembly",
                estimatedUnitCostGbp: 185,
                massKg: 0.3,
            },
        ]
        const result = dedupAssemblyRollUp(parts)
        // HAND-003 (PCB Assembly) is NOT dropped — it's a constituent
        expect(result.droppedParentIndices.has(2)).toBe(false)
        // HAND-ASY IS dropped — its £185 vs others sum £219 = 84% ratio
        expect(result.droppedParentIndices.has(6)).toBe(true)
        expect(dedupedUnitTotalGbp(parts)).toBe(95 + 28 + 42 + 24 + 18.5 + 11.5)
    })

    it("returns zero total for empty input", () => {
        expect(dedupedUnitTotalGbp([])).toBe(0)
    })

    it("ignores rows with non-numeric cost", () => {
        const parts = [
            {
                partNumber: "A",
                name: "Part A",
                sourceModuleName: "m",
                estimatedUnitCostGbp: null,
                massKg: 1,
            },
            {
                partNumber: "B",
                name: "Part B",
                sourceModuleName: "m",
                estimatedUnitCostGbp: 50,
                massKg: 2,
            },
        ]
        expect(dedupedUnitTotalGbp(parts)).toBe(50)
    })
})

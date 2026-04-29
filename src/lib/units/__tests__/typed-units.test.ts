import { describe, it, expect } from "vitest"
import {
    convertTo,
    validateConsistentUnits,
    sanityCheckValue,
    getUnitCategory,
    getUnitSystem,
    UnitSystem,
    type TypedValue,
} from "../typed-units"

describe("getUnitCategory", () => {
    it("returns correct categories", () => {
        expect(getUnitCategory("kg")).toBe("mass")
        expect(getUnitCategory("lb")).toBe("mass")
        expect(getUnitCategory("mm")).toBe("length")
        expect(getUnitCategory("ft")).toBe("length")
        expect(getUnitCategory("L")).toBe("volume")
        expect(getUnitCategory("m3")).toBe("volume")
        expect(getUnitCategory("kW")).toBe("power")
        expect(getUnitCategory("hp")).toBe("power")
        expect(getUnitCategory("C")).toBe("temperature")
        expect(getUnitCategory("bar")).toBe("pressure")
        expect(getUnitCategory("A")).toBe("current")
        expect(getUnitCategory("kWh")).toBe("energy")
    })
})

describe("getUnitSystem", () => {
    it("classifies SI and imperial correctly", () => {
        expect(getUnitSystem("kg")).toBe(UnitSystem.SI)
        expect(getUnitSystem("lb")).toBe(UnitSystem.IMPERIAL)
        expect(getUnitSystem("m")).toBe(UnitSystem.SI)
        expect(getUnitSystem("ft")).toBe(UnitSystem.IMPERIAL)
        expect(getUnitSystem("L")).toBe(UnitSystem.SI)
        expect(getUnitSystem("gal")).toBe(UnitSystem.IMPERIAL)
        expect(getUnitSystem("kW")).toBe(UnitSystem.SI)
        expect(getUnitSystem("hp")).toBe(UnitSystem.IMPERIAL)
        expect(getUnitSystem("C")).toBe(UnitSystem.SI)
        expect(getUnitSystem("F")).toBe(UnitSystem.IMPERIAL)
    })
})

describe("convertTo", () => {
    it("returns same value for identity conversion", () => {
        const result = convertTo({ value: 100, unit: "kg" }, "kg")
        expect(result.value).toBe(100)
        expect(result.unit).toBe("kg")
    })

    describe("mass conversions", () => {
        it("kg → lb", () => {
            const result = convertTo({ value: 1, unit: "kg" }, "lb")
            expect(result.value).toBeCloseTo(2.20462, 4)
        })
        it("lb → kg", () => {
            const result = convertTo({ value: 1, unit: "lb" }, "kg")
            expect(result.value).toBeCloseTo(0.45359, 4)
        })
        it("kg → g", () => {
            const result = convertTo({ value: 1, unit: "kg" }, "g")
            expect(result.value).toBe(1000)
        })
        it("oz → kg", () => {
            const result = convertTo({ value: 16, unit: "oz" }, "kg")
            expect(result.value).toBeCloseTo(0.45359, 4)
        })
    })

    describe("length conversions", () => {
        it("m → mm", () => {
            const result = convertTo({ value: 1, unit: "m" }, "mm")
            expect(result.value).toBe(1000)
        })
        it("ft → m", () => {
            const result = convertTo({ value: 1, unit: "ft" }, "m")
            expect(result.value).toBeCloseTo(0.3048, 4)
        })
        it("in → cm", () => {
            const result = convertTo({ value: 1, unit: "in" }, "cm")
            expect(result.value).toBeCloseTo(2.54, 4)
        })
        it("mm → in", () => {
            const result = convertTo({ value: 25.4, unit: "mm" }, "in")
            expect(result.value).toBeCloseTo(1, 4)
        })
    })

    describe("volume conversions", () => {
        it("L → mL", () => {
            const result = convertTo({ value: 1, unit: "L" }, "mL")
            expect(result.value).toBeCloseTo(1000, 10)
        })
        it("gal → L", () => {
            const result = convertTo({ value: 1, unit: "gal" }, "L")
            expect(result.value).toBeCloseTo(3.78541, 4)
        })
        it("ft3 → m3", () => {
            const result = convertTo({ value: 1, unit: "ft3" }, "m3")
            expect(result.value).toBeCloseTo(0.02832, 4)
        })
    })

    describe("power conversions", () => {
        it("kW → W", () => {
            const result = convertTo({ value: 1, unit: "kW" }, "W")
            expect(result.value).toBe(1000)
        })
        it("hp → kW", () => {
            const result = convertTo({ value: 1, unit: "hp" }, "kW")
            expect(result.value).toBeCloseTo(0.7457, 3)
        })
        it("MW → kW", () => {
            const result = convertTo({ value: 1, unit: "MW" }, "kW")
            expect(result.value).toBe(1000)
        })
    })

    describe("temperature conversions", () => {
        it("C → F", () => {
            const result = convertTo({ value: 100, unit: "C" }, "F")
            expect(result.value).toBeCloseTo(212, 1)
        })
        it("F → C", () => {
            const result = convertTo({ value: 32, unit: "F" }, "C")
            expect(result.value).toBeCloseTo(0, 1)
        })
        it("C → K", () => {
            const result = convertTo({ value: 0, unit: "C" }, "K")
            expect(result.value).toBeCloseTo(273.15, 2)
        })
        it("K → C", () => {
            const result = convertTo({ value: 373.15, unit: "K" }, "C")
            expect(result.value).toBeCloseTo(100, 2)
        })
        it("F → K", () => {
            const result = convertTo({ value: 212, unit: "F" }, "K")
            expect(result.value).toBeCloseTo(373.15, 1)
        })
    })

    describe("pressure conversions", () => {
        it("bar → Pa", () => {
            const result = convertTo({ value: 1, unit: "bar" }, "Pa")
            expect(result.value).toBe(100000)
        })
        it("atm → bar", () => {
            const result = convertTo({ value: 1, unit: "atm" }, "bar")
            expect(result.value).toBeCloseTo(1.01325, 4)
        })
        it("psi → Pa", () => {
            const result = convertTo({ value: 1, unit: "psi" }, "Pa")
            expect(result.value).toBeCloseTo(6894.76, 0)
        })
    })

    describe("current conversions", () => {
        it("A → mA", () => {
            const result = convertTo({ value: 1, unit: "A" }, "mA")
            expect(result.value).toBe(1000)
        })
        it("mA → A", () => {
            const result = convertTo({ value: 500, unit: "mA" }, "A")
            expect(result.value).toBe(0.5)
        })
    })

    describe("energy conversions", () => {
        it("kWh → Wh", () => {
            const result = convertTo({ value: 1, unit: "kWh" }, "Wh")
            expect(result.value).toBe(1000)
        })
        it("kWh → J", () => {
            const result = convertTo({ value: 1, unit: "kWh" }, "J")
            expect(result.value).toBe(3600000)
        })
        it("MWh → kWh", () => {
            const result = convertTo({ value: 1, unit: "MWh" }, "kWh")
            expect(result.value).toBe(1000)
        })
    })

    it("throws on cross-category conversion", () => {
        expect(() => convertTo({ value: 1, unit: "kg" }, "m")).toThrow("different categories")
    })
})

describe("validateConsistentUnits", () => {
    it("returns consistent when all match", () => {
        const values: TypedValue[] = [
            { value: 10, unit: "kg" },
            { value: 20, unit: "kg" },
            { value: 5, unit: "kg" },
        ]
        const result = validateConsistentUnits(values, "kg")
        expect(result.consistent).toBe(true)
        expect(result.mismatches).toHaveLength(0)
    })

    it("detects mismatches", () => {
        const values: TypedValue[] = [
            { value: 10, unit: "kg" },
            { value: 20, unit: "lb" },
            { value: 5, unit: "kg" },
            { value: 8, unit: "oz" },
        ]
        const result = validateConsistentUnits(values, "kg")
        expect(result.consistent).toBe(false)
        expect(result.mismatches).toHaveLength(2)
        expect(result.mismatches[0]).toEqual({ index: 1, found: "lb", expected: "kg" })
        expect(result.mismatches[1]).toEqual({ index: 3, found: "oz", expected: "kg" })
    })

    it("handles empty array", () => {
        const result = validateConsistentUnits([], "kg")
        expect(result.consistent).toBe(true)
    })
})

describe("sanityCheckValue", () => {
    describe("container class", () => {
        it("passes mass within bounds", () => {
            expect(sanityCheckValue({ value: 28000, unit: "kg" }, "container").sane).toBe(true)
        })
        it("fails mass exceeding 100,000 kg", () => {
            const result = sanityCheckValue({ value: 150000, unit: "kg" }, "container")
            expect(result.sane).toBe(false)
            expect(result.reason).toContain("exceeds")
        })
        it("fails negative mass", () => {
            const result = sanityCheckValue({ value: -5, unit: "kg" }, "container")
            expect(result.sane).toBe(false)
            expect(result.reason).toContain("negative")
        })
        it("passes length within bounds", () => {
            expect(sanityCheckValue({ value: 12, unit: "m" }, "container").sane).toBe(true)
        })
        it("fails length exceeding 20m", () => {
            const result = sanityCheckValue({ value: 25, unit: "m" }, "container")
            expect(result.sane).toBe(false)
        })
    })

    describe("consumer class", () => {
        it("passes mass within 5,000 kg", () => {
            expect(sanityCheckValue({ value: 50, unit: "kg" }, "consumer").sane).toBe(true)
        })
        it("fails mass exceeding 5,000 kg", () => {
            const result = sanityCheckValue({ value: 6000, unit: "kg" }, "consumer")
            expect(result.sane).toBe(false)
        })
        it("fails length exceeding 2m", () => {
            const result = sanityCheckValue({ value: 3, unit: "m" }, "consumer")
            expect(result.sane).toBe(false)
        })
    })

    describe("aerospace class", () => {
        it("passes mass within 50,000 kg", () => {
            expect(sanityCheckValue({ value: 30000, unit: "kg" }, "aerospace").sane).toBe(true)
        })
        it("fails mass exceeding 50,000 kg", () => {
            const result = sanityCheckValue({ value: 60000, unit: "kg" }, "aerospace")
            expect(result.sane).toBe(false)
        })
        it("passes length within 100m", () => {
            expect(sanityCheckValue({ value: 45, unit: "m" }, "aerospace").sane).toBe(true)
        })
    })

    describe("imperial input", () => {
        it("converts lb to kg for comparison", () => {
            const result = sanityCheckValue({ value: 250000, unit: "lb" }, "container")
            expect(result.sane).toBe(false) // ~113,398 kg > 100,000 kg
        })
        it("converts ft to m for comparison", () => {
            const result = sanityCheckValue({ value: 70, unit: "ft" }, "container")
            expect(result.sane).toBe(false) // ~21.3m > 20m
        })
    })

    describe("power bounds", () => {
        it("fails power exceeding 10 MW", () => {
            const result = sanityCheckValue({ value: 15, unit: "MW" }, "container")
            expect(result.sane).toBe(false)
        })
        it("passes power within bounds", () => {
            expect(sanityCheckValue({ value: 500, unit: "kW" }, "container").sane).toBe(true)
        })
    })

    it("passes unknown product class", () => {
        expect(sanityCheckValue({ value: 999999, unit: "kg" }, "unknown-class").sane).toBe(true)
    })

    it("passes non-bounded categories (temperature, energy, etc.)", () => {
        expect(sanityCheckValue({ value: 5000, unit: "C" }, "container").sane).toBe(true)
        expect(sanityCheckValue({ value: 1000, unit: "kWh" }, "container").sane).toBe(true)
    })
})

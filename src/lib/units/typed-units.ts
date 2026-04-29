/**
 * @file typed-units.ts — Typed unit-of-measure system.
 *
 * Council finding S2+X9 (GPT-5.5 + Gemini, critical): JSONB fields use
 * ad-hoc key-values like `{"weight": 5, "unit": "lbs"}` allowing
 * cross-stage metric/imperial confusion. This module provides typed
 * values, unit conversion, consistency validation, and product-class
 * sanity checks.
 */

export enum UnitSystem {
    SI = "SI",
    IMPERIAL = "IMPERIAL",
}

export type MassUnit = "kg" | "g" | "lb" | "oz"
export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft"
export type VolumeUnit = "L" | "mL" | "m3" | "ft3" | "gal"
export type PowerUnit = "W" | "kW" | "MW" | "hp"
export type TemperatureUnit = "C" | "F" | "K"
export type PressureUnit = "Pa" | "bar" | "psi" | "atm"
export type CurrentUnit = "A" | "mA"
export type EnergyUnit = "Wh" | "kWh" | "MWh" | "J"

export type MeasurementUnit =
    | MassUnit
    | LengthUnit
    | VolumeUnit
    | PowerUnit
    | TemperatureUnit
    | PressureUnit
    | CurrentUnit
    | EnergyUnit

export interface TypedValue {
    value: number
    unit: MeasurementUnit
}

type UnitCategory = "mass" | "length" | "volume" | "power" | "temperature" | "pressure" | "current" | "energy"

const UNIT_CATEGORIES: Record<MeasurementUnit, UnitCategory> = {
    kg: "mass", g: "mass", lb: "mass", oz: "mass",
    mm: "length", cm: "length", m: "length", in: "length", ft: "length",
    L: "volume", mL: "volume", m3: "volume", ft3: "volume", gal: "volume",
    W: "power", kW: "power", MW: "power", hp: "power",
    C: "temperature", F: "temperature", K: "temperature",
    Pa: "pressure", bar: "pressure", psi: "pressure", atm: "pressure",
    A: "current", mA: "current",
    Wh: "energy", kWh: "energy", MWh: "energy", J: "energy",
}

// Conversion factors to base SI unit per category.
// mass → kg, length → m, volume → m3, power → W, pressure → Pa,
// current → A, energy → J.
// Temperature is handled separately (offset conversion).
const TO_BASE: Record<Exclude<MeasurementUnit, TemperatureUnit>, number> = {
    // mass → kg
    kg: 1,
    g: 0.001,
    lb: 0.45359237,
    oz: 0.028349523125,
    // length → m
    mm: 0.001,
    cm: 0.01,
    m: 1,
    in: 0.0254,
    ft: 0.3048,
    // volume → m3
    L: 0.001,
    mL: 0.000001,
    m3: 1,
    ft3: 0.028316846592,
    gal: 0.003785411784,
    // power → W
    W: 1,
    kW: 1000,
    MW: 1000000,
    hp: 745.69987158227022,
    // pressure → Pa
    Pa: 1,
    bar: 100000,
    psi: 6894.757293168,
    atm: 101325,
    // current → A
    A: 1,
    mA: 0.001,
    // energy → J
    Wh: 3600,
    kWh: 3600000,
    MWh: 3600000000,
    J: 1,
}

function isTemperatureUnit(u: MeasurementUnit): u is TemperatureUnit {
    return u === "C" || u === "F" || u === "K"
}

function toKelvin(value: number, from: TemperatureUnit): number {
    switch (from) {
        case "K": return value
        case "C": return value + 273.15
        case "F": return (value - 32) * (5 / 9) + 273.15
    }
}

function fromKelvin(kelvin: number, to: TemperatureUnit): number {
    switch (to) {
        case "K": return kelvin
        case "C": return kelvin - 273.15
        case "F": return (kelvin - 273.15) * (9 / 5) + 32
    }
}

export function getUnitCategory(unit: MeasurementUnit): UnitCategory {
    return UNIT_CATEGORIES[unit]
}

export function getUnitSystem(unit: MeasurementUnit): UnitSystem {
    const imperial: MeasurementUnit[] = ["lb", "oz", "in", "ft", "ft3", "gal", "hp", "psi", "F"]
    return imperial.includes(unit) ? UnitSystem.IMPERIAL : UnitSystem.SI
}

/**
 * Convert a typed value to a target unit within the same category.
 * Throws if the units are in different categories.
 */
export function convertTo(tv: TypedValue, targetUnit: MeasurementUnit): TypedValue {
    if (tv.unit === targetUnit) return { value: tv.value, unit: targetUnit }

    const fromCat = getUnitCategory(tv.unit)
    const toCat = getUnitCategory(targetUnit)
    if (fromCat !== toCat) {
        throw new Error(
            `Cannot convert ${tv.unit} (${fromCat}) to ${targetUnit} (${toCat}) — different categories`,
        )
    }

    if (isTemperatureUnit(tv.unit) && isTemperatureUnit(targetUnit)) {
        const kelvin = toKelvin(tv.value, tv.unit)
        return { value: fromKelvin(kelvin, targetUnit), unit: targetUnit }
    }

    const fromFactor = TO_BASE[tv.unit as Exclude<MeasurementUnit, TemperatureUnit>]
    const toFactor = TO_BASE[targetUnit as Exclude<MeasurementUnit, TemperatureUnit>]
    return { value: (tv.value * fromFactor) / toFactor, unit: targetUnit }
}

export interface UnitMismatch {
    index: number
    found: MeasurementUnit
    expected: MeasurementUnit
}

/**
 * Check that all values share the expected unit.
 */
export function validateConsistentUnits(
    values: TypedValue[],
    expectedUnit: MeasurementUnit,
): { consistent: boolean; mismatches: UnitMismatch[] } {
    const mismatches: UnitMismatch[] = []
    for (let i = 0; i < values.length; i++) {
        if (values[i].unit !== expectedUnit) {
            mismatches.push({ index: i, found: values[i].unit, expected: expectedUnit })
        }
    }
    return { consistent: mismatches.length === 0, mismatches }
}

interface SanityBounds {
    mass_kg: number
    length_m: number
    cost_gbp: number
    power_w: number
}

const PRODUCT_CLASS_BOUNDS: Record<string, SanityBounds> = {
    container: { mass_kg: 100_000, length_m: 20, cost_gbp: 10_000_000, power_w: 10_000_000 },
    consumer: { mass_kg: 5_000, length_m: 2, cost_gbp: 10_000_000, power_w: 10_000_000 },
    aerospace: { mass_kg: 50_000, length_m: 100, cost_gbp: 10_000_000, power_w: 10_000_000 },
}

/**
 * Check whether a typed value is within sane bounds for the product class.
 * Returns `{ sane: true }` if the value passes, or `{ sane: false, reason }`
 * with a human-readable explanation if not.
 */
export function sanityCheckValue(
    tv: TypedValue,
    productClass: string,
): { sane: boolean; reason?: string } {
    const cat = getUnitCategory(tv.unit)
    const bounds = PRODUCT_CLASS_BOUNDS[productClass.toLowerCase()]
    if (!bounds) return { sane: true } // unknown class → no bounds to enforce

    if (cat === "mass") {
        const inKg = convertTo(tv, "kg").value
        if (inKg > bounds.mass_kg) {
            return { sane: false, reason: `Mass ${inKg.toFixed(1)} kg exceeds ${productClass} limit of ${bounds.mass_kg} kg` }
        }
        if (inKg < 0) {
            return { sane: false, reason: `Mass cannot be negative (${inKg.toFixed(1)} kg)` }
        }
    }

    if (cat === "length") {
        const inM = convertTo(tv, "m").value
        if (inM > bounds.length_m) {
            return { sane: false, reason: `Length ${inM.toFixed(2)} m exceeds ${productClass} limit of ${bounds.length_m} m` }
        }
        if (inM < 0) {
            return { sane: false, reason: `Length cannot be negative (${inM.toFixed(2)} m)` }
        }
    }

    if (cat === "power") {
        const inW = convertTo(tv, "W").value
        if (inW > bounds.power_w) {
            return { sane: false, reason: `Power ${(inW / 1_000_000).toFixed(2)} MW exceeds limit of ${bounds.power_w / 1_000_000} MW` }
        }
    }

    return { sane: true }
}

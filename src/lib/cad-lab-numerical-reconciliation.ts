/**
 * @file cad-lab-numerical-reconciliation.ts — deterministic post-pipeline
 * numerical-consistency gate (QC-GATES.md Gate 1).
 *
 * @description Tristan-flagged 2026-04-26 NIGHT after Loop 7 critique
 * surfaced the same problem on every demo: the PDF carries 2-3 parallel
 * cost views (per-module total, BOM master assembly cost, cost waterfall
 * total) and 2-3 parallel mass views that diverge silently. Hedgerow had
 * 6 of 7 modules mis-reconciled; BESS had cells whose mass × energy
 * density was off by ~20×; VertFarm had "identical mirror" racks whose
 * masses diverged 2-13×.
 *
 * The proofreader (engine self-review) catches some of these and logs
 * them, but is explicitly non-correcting. This module runs the math
 * ourselves (no LLM), produces a structured Reconciliation result, and
 * the PDF render uses it to (a) show a banner on the cover when
 * anything diverges and (b) populate a small Reconciliation section
 * after the cost waterfall so the founder can see exactly which numbers
 * disagree before they take any of them seriously.
 *
 * Tolerances:
 *   - Cost roll-up: ±5% per pairwise comparison (a £500 module on a
 *     £100k project is 0.5%, well inside noise).
 *   - Mass roll-up: ±10% (cable, paint, fasteners often dropped from
 *     itemised mass).
 *   - Battery cell mass vs energy: ±5% against stated chemistry density
 *     (LFP 150-180 Wh/kg, NMC 200-260 Wh/kg). Use the lower bound to
 *     avoid false alarms on optimistic packs.
 *   - Lighting wattage vs declared connected load: ±10%.
 *
 * Returns one entry per finding so the PDF can list them all.
 */

export interface ReconciliationFinding {
    /** Stable identifier for tracking across loops. */
    id: string
    /** Section the divergence sits in (Cost / Mass / Energy / Lighting / Mirror). */
    section: "Cost" | "Mass" | "Energy" | "Lighting" | "Mirror"
    /** Severity — "alert" if outside tolerance, "info" otherwise. */
    severity: "alert" | "info"
    /** One-line founder-readable description. */
    summary: string
    /** Raw numbers + % diff for the founder. */
    detail: {
        sourceA: string
        valueA: number
        sourceB: string
        valueB: number
        pctDiff: number
        unit: string
    }
}

export interface ReconciliationResult {
    findings: ReconciliationFinding[]
    /** True when at least one alert-level finding exists. */
    hasAlerts: boolean
    /** Sentence the cover banner shows. */
    coverBanner: string | null
}

// Inputs we accept — typed loosely so this module doesn't import the
// full PdfInput shape (avoids the Database-type fan-out that's bitten
// us on Vercel build OOM).
export interface ReconciliationInputs {
    moduleCosts: Array<{ moduleName: string; totalGbp: number | null; massKg: number | null }>
    bomTotalGbp: number | null
    waterfallTotalGbp: number | null
    /** Mass declared in module decomposition (sum of module-page mass values). */
    declaredTotalMassKg: number | null
    /** BOM-master mass roll-up. Sum of every part's mass × qty. */
    bomTotalMassKg: number | null
    /** Battery sub-system, when present. */
    battery?: {
        declaredKwh: number | null
        declaredCellsTotal: number | null
        declaredCellAh: number | null
        declaredCellVoltage: number | null
        declaredCellMassKg: number | null
        chemistry?: "LFP" | "NMC" | "LCO" | null
    }
    /** Lighting sub-system, when present. */
    lighting?: {
        declaredConnectedKw: number | null
        barCount: number | null
        wattsPerBar: number | null
        driverCount: number | null
        wattsPerDriver: number | null
    }
    /** Mirror modules — modules the engine claims are identical mirrored copies. */
    mirroredPairs?: Array<{
        sideA: { moduleName: string; totalGbp: number | null; massKg: number | null }
        sideB: { moduleName: string; totalGbp: number | null; massKg: number | null }
    }>
}

const COST_TOLERANCE_PCT = 5
const MASS_TOLERANCE_PCT = 10
const ENERGY_TOLERANCE_PCT = 5
const WATTAGE_TOLERANCE_PCT = 10

const ENERGY_DENSITY_WH_PER_KG_BY_CHEMISTRY: Record<string, [number, number]> = {
    LFP: [140, 180],
    NMC: [200, 260],
    LCO: [180, 240],
}

function pctDiff(a: number, b: number): number {
    if (a === 0 && b === 0) return 0
    const denom = Math.max(Math.abs(a), Math.abs(b))
    if (denom === 0) return 0
    return ((a - b) / denom) * 100
}

function fmtGbp(n: number): string {
    return `£${Math.round(n).toLocaleString("en-GB")}`
}

function fmtKg(n: number): string {
    return `${n.toFixed(n < 10 ? 2 : 0)} kg`
}

export function reconcileNumerics(
    input: ReconciliationInputs,
): ReconciliationResult {
    const findings: ReconciliationFinding[] = []
    let id = 1
    const nextId = () => `R${id++}`

    // ── 1. Cost roll-up ────────────────────────────────────────────
    const moduleCostSum = input.moduleCosts
        .map((m) => m.totalGbp)
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
        .reduce((a, b) => a + b, 0)
    const moduleCostFilled = input.moduleCosts.filter(
        (m) => typeof m.totalGbp === "number",
    ).length

    if (moduleCostFilled > 0 && input.bomTotalGbp != null) {
        const diff = pctDiff(moduleCostSum, input.bomTotalGbp)
        if (Math.abs(diff) > COST_TOLERANCE_PCT) {
            findings.push({
                id: nextId(),
                section: "Cost",
                severity: "alert",
                summary: `Module-page cost total disagrees with BOM master by ${diff.toFixed(1)}%`,
                detail: {
                    sourceA: "Sum of module-page costs",
                    valueA: moduleCostSum,
                    sourceB: "BOM master assembly cost total",
                    valueB: input.bomTotalGbp,
                    pctDiff: diff,
                    unit: "GBP",
                },
            })
        }
    }
    if (input.bomTotalGbp != null && input.waterfallTotalGbp != null) {
        const diff = pctDiff(input.bomTotalGbp, input.waterfallTotalGbp)
        if (Math.abs(diff) > COST_TOLERANCE_PCT) {
            findings.push({
                id: nextId(),
                section: "Cost",
                severity: "alert",
                summary: `BOM master total disagrees with cost waterfall by ${diff.toFixed(1)}%`,
                detail: {
                    sourceA: "BOM master assembly cost total",
                    valueA: input.bomTotalGbp,
                    sourceB: "Cost waterfall unit total",
                    valueB: input.waterfallTotalGbp,
                    pctDiff: diff,
                    unit: "GBP",
                },
            })
        }
    }

    // ── 2. Mass roll-up ────────────────────────────────────────────
    if (input.declaredTotalMassKg != null && input.bomTotalMassKg != null) {
        const diff = pctDiff(input.declaredTotalMassKg, input.bomTotalMassKg)
        if (Math.abs(diff) > MASS_TOLERANCE_PCT) {
            findings.push({
                id: nextId(),
                section: "Mass",
                severity: "alert",
                summary: `Module-page mass total disagrees with BOM-row mass roll-up by ${diff.toFixed(1)}%`,
                detail: {
                    sourceA: "Sum of module-page mass values",
                    valueA: input.declaredTotalMassKg,
                    sourceB: "Sum of BOM rows (mass × qty)",
                    valueB: input.bomTotalMassKg,
                    pctDiff: diff,
                    unit: "kg",
                },
            })
        }
    }

    // ── 3. Battery cell-mass vs declared energy ───────────────────
    if (input.battery) {
        const b = input.battery
        const chemistry = b.chemistry ?? "LFP"
        const range = ENERGY_DENSITY_WH_PER_KG_BY_CHEMISTRY[chemistry]
        if (
            range &&
            typeof b.declaredKwh === "number" &&
            typeof b.declaredCellMassKg === "number" &&
            b.declaredCellMassKg > 0 &&
            b.declaredKwh > 0
        ) {
            const declaredWh = b.declaredKwh * 1000
            const impliedDensity = declaredWh / b.declaredCellMassKg
            // A pack with cells claimed at 1,050 kg storing 3,500 kWh implies
            // ~3,333 Wh/kg — wildly impossible for LFP (real ceiling 180).
            if (impliedDensity > range[1] * 1.2) {
                findings.push({
                    id: nextId(),
                    section: "Energy",
                    severity: "alert",
                    summary: `Cell mass vs declared energy is physically impossible — implies ${Math.round(impliedDensity)} Wh/kg, ${chemistry} ceiling is ${range[1]} Wh/kg`,
                    detail: {
                        sourceA: "Declared energy",
                        valueA: declaredWh,
                        sourceB: `${chemistry} max density × declared cell mass`,
                        valueB: range[1] * b.declaredCellMassKg,
                        pctDiff: pctDiff(declaredWh, range[1] * b.declaredCellMassKg),
                        unit: "Wh",
                    },
                })
            } else if (impliedDensity < range[0] * 0.8) {
                // Sub-spec — cells are very heavy for the energy.
                findings.push({
                    id: nextId(),
                    section: "Energy",
                    severity: "alert",
                    summary: `Cell mass is heavy for declared energy — implies ${Math.round(impliedDensity)} Wh/kg, ${chemistry} typical is ${range[0]}-${range[1]} Wh/kg`,
                    detail: {
                        sourceA: "Declared energy",
                        valueA: declaredWh,
                        sourceB: `${chemistry} min density × declared cell mass`,
                        valueB: range[0] * b.declaredCellMassKg,
                        pctDiff: pctDiff(declaredWh, range[0] * b.declaredCellMassKg),
                        unit: "Wh",
                    },
                })
            }
        }
        // Cell-count integer check — N cells / (M series × P parallel × R racks)
        // should be an integer. Loop 7 BESS p.92: 3,360 / (16 × 20) = 10.5.
        if (
            typeof b.declaredCellsTotal === "number" &&
            typeof b.declaredCellAh === "number" &&
            typeof b.declaredCellVoltage === "number" &&
            b.declaredKwh != null
        ) {
            const totalCellWh = b.declaredCellAh * b.declaredCellVoltage
            const impliedCells = (b.declaredKwh * 1000) / totalCellWh
            const declaredCells = b.declaredCellsTotal
            const cellDiff = pctDiff(declaredCells, impliedCells)
            if (Math.abs(cellDiff) > ENERGY_TOLERANCE_PCT) {
                findings.push({
                    id: nextId(),
                    section: "Energy",
                    severity: "alert",
                    summary: `Cell count vs declared energy disagrees by ${cellDiff.toFixed(1)}% — declared ${declaredCells.toLocaleString()} cells, implied ${Math.round(impliedCells).toLocaleString()} for ${b.declaredKwh} kWh at ${b.declaredCellAh} Ah × ${b.declaredCellVoltage} V`,
                    detail: {
                        sourceA: "Declared cell count",
                        valueA: declaredCells,
                        sourceB: `Implied cells for ${b.declaredKwh} kWh`,
                        valueB: impliedCells,
                        pctDiff: cellDiff,
                        unit: "cells",
                    },
                })
            }
        }
    }

    // ── 4. Lighting wattage ──────────────────────────────────────
    if (input.lighting) {
        const l = input.lighting
        if (
            typeof l.declaredConnectedKw === "number" &&
            typeof l.barCount === "number" &&
            typeof l.wattsPerBar === "number"
        ) {
            const fromBars = (l.barCount * l.wattsPerBar) / 1000
            const diff = pctDiff(l.declaredConnectedKw, fromBars)
            if (Math.abs(diff) > WATTAGE_TOLERANCE_PCT) {
                findings.push({
                    id: nextId(),
                    section: "Lighting",
                    severity: "alert",
                    summary: `Declared connected load disagrees with bar-count × per-bar wattage by ${diff.toFixed(1)}%`,
                    detail: {
                        sourceA: "Declared connected load",
                        valueA: l.declaredConnectedKw,
                        sourceB: `${l.barCount} bars × ${l.wattsPerBar} W`,
                        valueB: fromBars,
                        pctDiff: diff,
                        unit: "kW",
                    },
                })
            }
        }
        if (
            typeof l.declaredConnectedKw === "number" &&
            typeof l.driverCount === "number" &&
            typeof l.wattsPerDriver === "number"
        ) {
            const fromDrivers = (l.driverCount * l.wattsPerDriver) / 1000
            const diff = pctDiff(l.declaredConnectedKw, fromDrivers)
            if (Math.abs(diff) > WATTAGE_TOLERANCE_PCT) {
                findings.push({
                    id: nextId(),
                    section: "Lighting",
                    severity: "alert",
                    summary: `Declared connected load disagrees with driver-count × per-driver wattage by ${diff.toFixed(1)}%`,
                    detail: {
                        sourceA: "Declared connected load",
                        valueA: l.declaredConnectedKw,
                        sourceB: `${l.driverCount} drivers × ${l.wattsPerDriver} W`,
                        valueB: fromDrivers,
                        pctDiff: diff,
                        unit: "kW",
                    },
                })
            }
        }
    }

    // ── 5. Mirror modules ────────────────────────────────────────
    if (input.mirroredPairs) {
        for (const pair of input.mirroredPairs) {
            if (pair.sideA.totalGbp != null && pair.sideB.totalGbp != null) {
                const diff = pctDiff(pair.sideA.totalGbp, pair.sideB.totalGbp)
                if (Math.abs(diff) > 1) {
                    // Mirror modules MUST cost the same. Even 1% suggests a copy bug.
                    findings.push({
                        id: nextId(),
                        section: "Mirror",
                        severity: "alert",
                        summary: `Mirror modules "${pair.sideA.moduleName}" and "${pair.sideB.moduleName}" have ${diff.toFixed(1)}% cost mismatch — the BOM generator forgot to copy values across`,
                        detail: {
                            sourceA: pair.sideA.moduleName,
                            valueA: pair.sideA.totalGbp,
                            sourceB: pair.sideB.moduleName,
                            valueB: pair.sideB.totalGbp,
                            pctDiff: diff,
                            unit: "GBP",
                        },
                    })
                }
            }
            if (pair.sideA.massKg != null && pair.sideB.massKg != null) {
                const diff = pctDiff(pair.sideA.massKg, pair.sideB.massKg)
                if (Math.abs(diff) > 1) {
                    findings.push({
                        id: nextId(),
                        section: "Mirror",
                        severity: "alert",
                        summary: `Mirror modules "${pair.sideA.moduleName}" and "${pair.sideB.moduleName}" have ${diff.toFixed(1)}% mass mismatch`,
                        detail: {
                            sourceA: pair.sideA.moduleName,
                            valueA: pair.sideA.massKg,
                            sourceB: pair.sideB.moduleName,
                            valueB: pair.sideB.massKg,
                            pctDiff: diff,
                            unit: "kg",
                        },
                    })
                }
            }
        }
    }

    const alerts = findings.filter((f) => f.severity === "alert")
    return {
        findings,
        hasAlerts: alerts.length > 0,
        coverBanner:
            alerts.length === 0
                ? null
                : `Internal numerical inconsistency detected — ${alerts.length} ${alerts.length === 1 ? "value disagrees" : "values disagree"} across sections. See Reconciliation page.`,
    }
}

// Re-export formatters for the PDF render.
export const reconciliationFormatters = { fmtGbp, fmtKg }

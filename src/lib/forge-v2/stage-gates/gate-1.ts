/**
 * @file gate-1.ts — Deterministic numeric/unit extraction + brief-lock check.
 *
 * @description Gate 1 fires at BRIEF-LOCK — immediately after Chase persists
 * `research.designBrief` and before the autopilot advances to `waiting_max`.
 * It catches the failure mode: founder types "1.5 MW", Chase interprets
 * "100 kW" — order-of-magnitude scale mismatch that silently corrupts the
 * entire downstream pipeline (wrong BOM, wrong cost waterfall, wrong
 * supplier shortlist).
 *
 * ## What it checks
 *
 * Five numeric axes are extracted from both the founder's raw brief text
 * (regex-driven, deterministic) and Chase's structured output
 * (`dimension_sheet.target` + `designBrief.constraints`):
 *
 *   1. **Energy storage capacity** — kWh / MWh / Wh normalised to Wh
 *   2. **Power (peak / rated)** — kW / MW / W normalised to W
 *   3. **Throughput / production rate** — m³/day, litres/min, tonnes/year,
 *      units/month, kg/year, m³/h all normalised to SI base per second
 *   4. **Mass** — kg / tonnes / lbs normalised to kg
 *   5. **Envelope kind** — 40ft / 20ft / 53ft container, 1U rack, etc.
 *
 * ## Verdict thresholds
 *
 * | Condition | Severity |
 * |---|---|
 * | factor ≥ 3.0 (>3× absolute ratio) | BLOCKER |
 * | unit-class mismatch (kWh vs MWh misread as 1:1) | BLOCKER |
 * | founder value present, Chase has null for that axis | BLOCKER (Chase missed it) |
 * | Chase has value not mentioned in brief | WARN (potential fabrication) |
 * | drift > 50 % but < 3× | WARN with confirmation request |
 * | drift ≤ 10 % | PASS |
 *
 * ## Where it fires
 *
 * Wired into `src/actions/brief-lock.ts` — called synchronously inside
 * `lockCadLabBrief` after Chase's designBrief is confirmed present.
 * When `gate1Check()` returns `passed: false`, the autopilot stage is set to
 * `gate_1_blocked` and the project is stalled until the founder confirms or
 * revises the brief.
 *
 * ## No LLM calls
 *
 * This is a deterministic gate. Zero LLM calls. All extraction is regex +
 * normalisation arithmetic.
 *
 * @see src/actions/brief-lock.ts            — wiring point
 * @see src/actions/forge-v2-autopilot.ts    — `gate_1_blocked` stage
 * @see src/app/api/cron/autopilot-tick      — cron exclusion for gate_1_blocked
 * @see src/lib/forge-v2/__tests__/gate-1-numeric-extraction.test.ts  — tests
 *
 * FLOW: Chase research done → brief-lock → [Gate 1] → locking_brief → waiting_max
 *       On gate_1_blocked: founder sees mismatch summary → revises brief → unlocks → re-runs
 */

import type { CadLabDesignBrief } from "@/lib/cad-lab-types"
import type { DimensionSheet } from "@/lib/sizing/types"

// ─── Public types ──────────────────────────────────────────────────────

/** One axis where a numeric mismatch was found. */
export interface Gate1MismatchAxis {
    axis: "capacity" | "throughput" | "mass" | "envelope_kind" | "power"
    /** What the founder wrote in their brief (raw string + normalised SI value). */
    founder_value: { raw: string; normalised: number; unit: string } | null
    /** What Chase produced in the structured output. */
    chase_value: { value: number; unit: string } | null
    /**
     * Ratio of larger/smaller (always ≥ 1.0). 1.0 = exact match.
     * For envelope_kind mismatches this is always set to `Infinity`.
     */
    factor_off: number
    explanation: string
}

export interface Gate1Warning {
    axis: string
    explanation: string
}

export interface Gate1Verdict {
    /** True iff no BLOCKERs were found. Warnings do NOT make `passed` false. */
    passed: boolean
    /** Per-axis blockers. Empty array when `passed === true`. */
    blockers: Gate1MismatchAxis[]
    /** Non-blocking observations (minor drift, potential fabrication). */
    warnings: Gate1Warning[]
    /**
     * True when at least one warning is present asking the founder to confirm
     * Chase's interpretation of a number they did not mention explicitly.
     */
    needs_founder_confirmation: boolean
}

// ─── Input shape ───────────────────────────────────────────────────────

export interface Gate1Input {
    /** Raw founder brief text — the `research.report` prose Chase produced
     *  plus any intake fields the founder typed before Chase ran. Pass every
     *  available brief field joined into one string. */
    founder_raw_brief: string
    /**
     * Chase's structured extraction. The fields mirror what the sizing engine
     * persists on `dimension_sheet.target` (kWh → `capacity_kwh`, kW → `power_kw`)
     * plus the envelope kind. Pass null when no dimension_sheet row exists yet.
     */
    chase_design_brief: {
        /** Capacity in kWh as extracted by Chase / sizing engine. */
        capacity_kwh?: number | null
        /** Power in kW as extracted by Chase / sizing engine. */
        power_kw?: number | null
        /** Throughput normalised to the canonical unit below. */
        throughput?: number | null
        /** Unit string for throughput — e.g. "m3/day", "litres/min". */
        throughput_unit?: string | null
        /** Mass in kg (designBrief.constraints.maxMassKg). */
        mass_kg?: number | null
        /** Envelope kind string from dimension_sheet.envelope.kind. */
        envelope?: { kind: string } | null
    }
}

// ─── Unit normalisation constants ─────────────────────────────────────

/** All energy values are normalised to Watt-hours (Wh). */
const WH_PER_MWH = 1_000_000
const WH_PER_KWH = 1_000
const WH_PER_WH = 1

/** All power values are normalised to Watts (W). */
const W_PER_MW = 1_000_000
const W_PER_KW = 1_000
const W_PER_W = 1
const W_PER_KVA = 1_000
const W_PER_VA = 1

/** All mass values are normalised to kilograms (kg). */
const KG_PER_TONNE = 1_000
const KG_PER_LB = 0.45359237

// ─── Extraction helpers ────────────────────────────────────────────────

/** Run a pattern globally and return all captured numeric groups. */
function extractAll(pattern: RegExp, text: string, multiplier = 1): Array<{ raw: string; value: number }> {
    const results: Array<{ raw: string; value: number }> = []
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
    const globalRe = new RegExp(pattern.source, flags)
    for (const m of text.matchAll(globalRe)) {
        const raw = m[0]
        const numStr = m[1].replace(/,/g, "") // strip thousands separators
        const n = Number.parseFloat(numStr)
        if (Number.isFinite(n)) results.push({ raw, value: n * multiplier })
    }
    return results
}

/** Return the extraction with the largest normalised value. */
function largest(items: Array<{ raw: string; value: number }>): { raw: string; value: number } | null {
    if (items.length === 0) return null
    return items.reduce((best, item) => (item.value > best.value ? item : best))
}

// ─── Per-axis extraction ───────────────────────────────────────────────

/**
 * Extract the largest energy-storage capacity mention from brief text.
 * Returns value in Wh.
 */
function extractCapacityFromBrief(text: string): { raw: string; normalised: number; unit: string } | null {
    const all = [
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*MWh\b/i, text, WH_PER_MWH),
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*kWh\b/i, text, WH_PER_KWH),
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*Wh\b/i, text, WH_PER_WH),
    ]
    const best = largest(all)
    if (!best) return null
    let unit = "Wh"
    if (best.raw.toLowerCase().includes("mwh")) unit = "MWh"
    else if (best.raw.toLowerCase().includes("kwh")) unit = "kWh"
    return { raw: best.raw.trim(), normalised: best.value, unit }
}

/**
 * Extract the largest power mention from brief text.
 * Returns value in W. Avoids matching "kWh" as "kW" via negative look-ahead.
 */
function extractPowerFromBrief(text: string): { raw: string; normalised: number; unit: string } | null {
    const all = [
        ...extractAll(/(\d+(?:\.\d+)?)\s*MW(?![a-zA-Z])/i, text, W_PER_MW),
        ...extractAll(/(\d+(?:\.\d+)?)\s*kW(?![a-zA-Z])/i, text, W_PER_KW),
        ...extractAll(/(\d+(?:\.\d+)?)\s*kVA\b/i, text, W_PER_KVA),
        ...extractAll(/(\d+(?:\.\d+)?)\s*VA\b/i, text, W_PER_VA),
        ...extractAll(/(\d+(?:\.\d+)?)\s*W(?![a-zA-Z])/i, text, W_PER_W),
    ]
    // Exclude kWh matches: any item whose raw value ends in "wh" (case-insensitive)
    const filtered = all.filter((item) => !/wh\b/i.test(item.raw))
    const best = largest(filtered)
    if (!best) return null
    const raw = best.raw.trim()
    let unit = "W"
    if (/MW/i.test(raw)) unit = "MW"
    else if (/kVA/i.test(raw)) unit = "kVA"
    else if (/VA\b/i.test(raw)) unit = "VA"
    else if (/kW/i.test(raw)) unit = "kW"
    return { raw, normalised: best.value, unit }
}

/**
 * Extract mass from brief text.
 * Returns value in kg.
 */
function extractMassFromBrief(text: string): { raw: string; normalised: number; unit: string } | null {
    const all = [
        // "tonnes" before "t" to avoid partial match
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:tonnes?|metric\s+tons?)\b/i, text, KG_PER_TONNE),
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*kg\b/i, text, 1),
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i, text, KG_PER_LB),
        // bare "t" (e.g. "3.5 t") — only if preceded by whitespace or digit
        ...extractAll(/(\d+(?:\.\d+)?)\s*\bt\b(?!\w)/i, text, KG_PER_TONNE),
    ]
    const best = largest(all)
    if (!best) return null
    const raw = best.raw.trim()
    let unit = "kg"
    if (/tonnes?|metric\s+tons?/i.test(raw)) unit = "tonnes"
    else if (/lbs?|pounds?/i.test(raw)) unit = "lbs"
    else if (/\bt\b/i.test(raw)) unit = "t"
    return { raw, normalised: best.value, unit }
}

/**
 * Throughput extraction — returns SI-per-second value and canonical unit string.
 * Supports: m³/day, liters/min, litres/min, tonnes/year, units/month,
 *           kg/year, m³/h, m3/day, m3/h.
 */
function extractThroughputFromBrief(text: string): { raw: string; normalised: number; unit: string } | null {
    // Normalise all throughput to SI-per-second for comparison.
    // m³/day → /86400 s
    const SECS_PER_DAY = 86_400
    const SECS_PER_HOUR = 3_600
    const SECS_PER_MIN = 60
    const SECS_PER_YEAR = 365.25 * SECS_PER_DAY
    const SECS_PER_MONTH = SECS_PER_YEAR / 12

    const all = [
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*m[³3]\/day\b/i, text, 1 / SECS_PER_DAY),
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*m[³3]\/h(?:r|our)?\b/i, text, 1 / SECS_PER_HOUR),
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:litres?|liters?|l)\/min\b/i, text, 0.001 / SECS_PER_MIN),
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:tonnes?|metric\s+tons?)\/year\b/i, text, KG_PER_TONNE / SECS_PER_YEAR),
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*kg\/year\b/i, text, 1 / SECS_PER_YEAR),
        ...extractAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*units?\/month\b/i, text, 1 / SECS_PER_MONTH),
    ]
    const best = largest(all)
    if (!best) return null
    const raw = best.raw.trim()

    // Determine the canonical unit label for the explanation.
    let unit = "m³/s (normalised)"
    if (/m[³3]\/day/i.test(raw)) unit = "m³/day"
    else if (/m[³3]\/h/i.test(raw)) unit = "m³/h"
    else if (/(?:litres?|liters?|l)\/min/i.test(raw)) unit = "litres/min"
    else if (/(?:tonnes?|metric\s+tons?)\/year/i.test(raw)) unit = "tonnes/year"
    else if (/kg\/year/i.test(raw)) unit = "kg/year"
    else if (/units?\/month/i.test(raw)) unit = "units/month"

    return { raw, normalised: best.value, unit }
}

// Envelope-kind synonyms used to match the brief's free-text against
// DimensionSheet envelope kinds.
const ENVELOPE_KIND_PATTERNS: Array<{
    kind: string
    patterns: RegExp[]
}> = [
    {
        kind: "container_40ft_iso",
        patterns: [
            /\b40[\s-]?ft\b.*\bcontainer\b/i,
            /\bcontainer\b.*\b40[\s-]?ft\b/i,
            /\b40[\s-]?foot\s+(?:iso\s+)?container\b/i,
            /\bcontainerised\b/i, // generic containerised → default 40ft assumption
        ],
    },
    {
        kind: "container_20ft_iso",
        patterns: [
            /\b20[\s-]?ft\b.*\bcontainer\b/i,
            /\bcontainer\b.*\b20[\s-]?ft\b/i,
            /\b20[\s-]?foot\s+(?:iso\s+)?container\b/i,
        ],
    },
    {
        kind: "container_53ft_hc",
        patterns: [
            /\b53[\s-]?ft\b.*\b(?:hc|high.?cube|container)\b/i,
            /\bhigh.?cube\b.*\b53[\s-]?ft\b/i,
        ],
    },
    {
        kind: "rack_1u",
        patterns: [/\b1U\s+rack\b/i, /\b1-?U\b.*\brack\b/i],
    },
    {
        kind: "rack_2u",
        patterns: [/\b2U\s+rack\b/i, /\b2-?U\b.*\brack\b/i],
    },
    {
        kind: "warehouse_bay",
        patterns: [/\bwarehouse[\s-]bay\b/i, /\bgrow[\s-]room\b/i, /\bcea[\s-]facility\b/i],
    },
]

/**
 * Extract envelope kind from free-text brief.
 * Returns the canonical `Envelope.kind` string or null.
 */
function extractEnvelopeKindFromBrief(text: string): string | null {
    for (const { kind, patterns } of ENVELOPE_KIND_PATTERNS) {
        for (const pattern of patterns) {
            if (pattern.test(text)) return kind
        }
    }
    return null
}

// ─── Comparison helpers ────────────────────────────────────────────────

/**
 * Compute absolute factor between two positive numbers.
 * Returns larger/smaller (always ≥ 1.0).
 */
function factorBetween(a: number, b: number): number {
    if (a === 0 || b === 0) return Infinity
    return Math.max(a, b) / Math.min(a, b)
}

// ─── Main gate function ────────────────────────────────────────────────

/**
 * Run Gate 1 — deterministic numeric/unit extraction + comparison.
 *
 * @param input  Founder's raw brief text + Chase's structured interpretation.
 * @returns       Verdict with blockers and warnings.
 *
 * @example
 * ```ts
 * const verdict = gate1Check({
 *   founder_raw_brief: "A 1.5 MW grid-scale battery storage system.",
 *   chase_design_brief: { power_kw: 100 },
 * })
 * // verdict.passed === false
 * // verdict.blockers[0].factor_off === 15
 * ```
 */
export function gate1Check(input: Gate1Input): Gate1Verdict {
    const blockers: Gate1MismatchAxis[] = []
    const warnings: Gate1Warning[] = []

    const briefText = input.founder_raw_brief ?? ""
    const chase = input.chase_design_brief ?? {}

    // ── 1. Energy storage capacity ──────────────────────────────────────
    const founderCapacity = extractCapacityFromBrief(briefText)
    const chaseCapacityWh =
        typeof chase.capacity_kwh === "number" ? chase.capacity_kwh * WH_PER_KWH : null

    if (founderCapacity !== null && chaseCapacityWh !== null) {
        const factor = factorBetween(founderCapacity.normalised, chaseCapacityWh)
        if (factor >= 3.0) {
            blockers.push({
                axis: "capacity",
                founder_value: founderCapacity,
                chase_value: { value: chaseCapacityWh / WH_PER_KWH, unit: "kWh" },
                factor_off: factor,
                explanation:
                    `Order-of-magnitude mismatch on energy capacity: founder stated ` +
                    `${founderCapacity.raw} (${(founderCapacity.normalised / WH_PER_KWH).toLocaleString()} kWh) ` +
                    `but Chase extracted ${(chaseCapacityWh / WH_PER_KWH).toLocaleString()} kWh — ` +
                    `${factor.toFixed(1)}× apart. The entire downstream BOM and cost ` +
                    `waterfall will be wrong if this is a typo. Confirm the target capacity.`,
            })
        } else if (factor > 1.5) {
            warnings.push({
                axis: "capacity",
                explanation:
                    `Capacity drift of ${factor.toFixed(1)}× between brief (${founderCapacity.raw}) ` +
                    `and Chase extraction (${(chaseCapacityWh / WH_PER_KWH).toLocaleString()} kWh). ` +
                    `Please confirm Chase interpreted the capacity correctly.`,
            })
        }
    } else if (founderCapacity !== null && chaseCapacityWh === null) {
        blockers.push({
            axis: "capacity",
            founder_value: founderCapacity,
            chase_value: null,
            factor_off: Infinity,
            explanation:
                `Founder mentioned a capacity (${founderCapacity.raw}) ` +
                `but Chase did not extract it into a structured field. ` +
                `The sizing engine will default to the domain library minimum, ` +
                `which will produce a design that ignores the stated scale.`,
        })
    } else if (founderCapacity === null && chaseCapacityWh !== null) {
        warnings.push({
            axis: "capacity",
            explanation:
                `Chase produced a capacity value (${(chaseCapacityWh / WH_PER_KWH).toLocaleString()} kWh) ` +
                `that does not appear in the founder's brief text. ` +
                `Confirm that Chase did not fabricate this number.`,
        })
    }

    // ── 2. Power ────────────────────────────────────────────────────────
    const founderPower = extractPowerFromBrief(briefText)
    const chasePowerW =
        typeof chase.power_kw === "number" ? chase.power_kw * W_PER_KW : null

    if (founderPower !== null && chasePowerW !== null) {
        const factor = factorBetween(founderPower.normalised, chasePowerW)
        if (factor >= 3.0) {
            blockers.push({
                axis: "power",
                founder_value: founderPower,
                chase_value: { value: chasePowerW / W_PER_KW, unit: "kW" },
                factor_off: factor,
                explanation:
                    `Order-of-magnitude mismatch on power: founder stated ` +
                    `${founderPower.raw} (${(founderPower.normalised / W_PER_KW).toLocaleString()} kW) ` +
                    `but Chase extracted ${(chasePowerW / W_PER_KW).toLocaleString()} kW — ` +
                    `${factor.toFixed(1)}× apart. This will produce an undersized ` +
                    `or oversized power conversion system.`,
            })
        } else if (factor > 1.5) {
            warnings.push({
                axis: "power",
                explanation:
                    `Power drift of ${factor.toFixed(1)}× between brief (${founderPower.raw}) ` +
                    `and Chase extraction (${(chasePowerW / W_PER_KW).toLocaleString()} kW). ` +
                    `Please confirm Chase interpreted the power rating correctly.`,
            })
        }
    } else if (founderPower !== null && chasePowerW === null) {
        blockers.push({
            axis: "power",
            founder_value: founderPower,
            chase_value: null,
            factor_off: Infinity,
            explanation:
                `Founder mentioned a power rating (${founderPower.raw}) ` +
                `but Chase did not extract it. ` +
                `The sizing engine will size the power subsystem using a domain default.`,
        })
    } else if (founderPower === null && chasePowerW !== null) {
        warnings.push({
            axis: "power",
            explanation:
                `Chase produced a power value (${(chasePowerW / W_PER_KW).toLocaleString()} kW) ` +
                `that does not appear explicitly in the founder's brief text. ` +
                `Confirm that this is Chase's inferred sizing, not a fabricated number.`,
        })
    }

    // ── 3. Throughput ───────────────────────────────────────────────────
    const founderThroughput = extractThroughputFromBrief(briefText)
    const chaseThroughput =
        typeof chase.throughput === "number" ? chase.throughput : null

    if (founderThroughput !== null && chaseThroughput !== null) {
        const factor = factorBetween(founderThroughput.normalised, chaseThroughput)
        if (factor >= 3.0) {
            blockers.push({
                axis: "throughput",
                founder_value: founderThroughput,
                chase_value: { value: chaseThroughput, unit: chase.throughput_unit ?? "normalised/s" },
                factor_off: factor,
                explanation:
                    `Throughput mismatch of ${factor.toFixed(1)}× between brief ` +
                    `(${founderThroughput.raw}) and Chase extraction ` +
                    `(${chaseThroughput} ${chase.throughput_unit ?? "normalised/s"}). ` +
                    `The BOM will be sized for the wrong production rate.`,
            })
        } else if (factor > 1.5) {
            warnings.push({
                axis: "throughput",
                explanation:
                    `Throughput drift of ${factor.toFixed(1)}× — please confirm Chase's interpretation.`,
            })
        }
    } else if (founderThroughput !== null && chaseThroughput === null) {
        // Throughput is domain-specific — only block if Chase clearly missed it.
        // We WARN rather than BLOCK because many products don't have a
        // "throughput" axis (the sizing engine won't use it).
        warnings.push({
            axis: "throughput",
            explanation:
                `Founder mentioned a throughput figure (${founderThroughput.raw}) ` +
                `but Chase did not extract it into a structured field.`,
        })
    }

    // ── 4. Mass ─────────────────────────────────────────────────────────
    const founderMass = extractMassFromBrief(briefText)
    const chaseMassKg =
        typeof chase.mass_kg === "number" ? chase.mass_kg : null

    if (founderMass !== null && chaseMassKg !== null) {
        const factor = factorBetween(founderMass.normalised, chaseMassKg)
        if (factor >= 3.0) {
            blockers.push({
                axis: "mass",
                founder_value: founderMass,
                chase_value: { value: chaseMassKg, unit: "kg" },
                factor_off: factor,
                explanation:
                    `Mass mismatch of ${factor.toFixed(1)}× between brief (${founderMass.raw}) ` +
                    `and Chase extraction (${chaseMassKg.toLocaleString()} kg). ` +
                    `This will produce incorrect structural, shipping, and installation cost estimates.`,
            })
        } else if (factor > 1.5) {
            warnings.push({
                axis: "mass",
                explanation:
                    `Mass drift of ${factor.toFixed(1)}× — please confirm Chase's interpretation.`,
            })
        }
    } else if (founderMass !== null && chaseMassKg === null) {
        warnings.push({
            axis: "mass",
            explanation:
                `Founder mentioned a mass figure (${founderMass.raw}) ` +
                `but Chase did not extract it into constraints.maxMassKg.`,
        })
    }

    // ── 5. Envelope kind ────────────────────────────────────────────────
    const founderEnvelopeKind = extractEnvelopeKindFromBrief(briefText)
    const chaseEnvelopeKind = chase.envelope?.kind ?? null

    if (founderEnvelopeKind !== null && chaseEnvelopeKind !== null) {
        if (founderEnvelopeKind !== chaseEnvelopeKind) {
            blockers.push({
                axis: "envelope_kind",
                founder_value: { raw: founderEnvelopeKind, normalised: 0, unit: "envelope_kind" },
                chase_value: { value: 0, unit: chaseEnvelopeKind },
                factor_off: Infinity,
                explanation:
                    `Envelope kind mismatch: founder's brief implies "${founderEnvelopeKind}" ` +
                    `but Chase / the sizing engine used "${chaseEnvelopeKind}". ` +
                    `The entire spatial layout, BOM, and site-prep cost will be sized ` +
                    `for the wrong physical form factor.`,
            })
        }
    } else if (founderEnvelopeKind !== null && chaseEnvelopeKind === null) {
        warnings.push({
            axis: "envelope_kind",
            explanation:
                `Founder's brief mentions a specific form factor (${founderEnvelopeKind}) ` +
                `but Chase did not produce a matching envelope in the dimension sheet. ` +
                `The sizing engine will default to the domain library's default envelope.`,
        })
    }

    const passed = blockers.length === 0
    const needs_founder_confirmation =
        warnings.some((w) => w.explanation.toLowerCase().includes("confirm"))

    return { passed, blockers, warnings, needs_founder_confirmation }
}

// ─── Helpers for brief-lock integration ───────────────────────────────

/**
 * Build a `Gate1Input` from the project's persisted `research` blob
 * and (optionally) its `dimension_sheet`. Call this inside `lockCadLabBrief`
 * after Chase's research has been confirmed present.
 *
 * @param research    The `cad_lab_projects.research` JSON field.
 * @param dimensionSheet  The `cad_lab_projects.dimension_sheet` JSON field (may be null).
 * @returns Gate1Input ready for `gate1Check()`.
 */
export function buildGate1Input(
    research: { report?: unknown; designBrief?: CadLabDesignBrief } | null,
    dimensionSheet: DimensionSheet | null,
): Gate1Input {
    // Build the raw brief text haystack — same strategy as run-fang-sizing.ts.
    const db = research?.designBrief ?? null
    const haystack = [
        typeof research?.report === "string"
            ? research.report
            : (research?.report as { content?: string } | null)?.content ?? "",
        db?.useCase ?? "",
        db?.mission ?? "",
        db?.complianceNotes ?? "",
        db?.targetCustomers ?? "",
        db?.whyNow ?? "",
    ]
        .filter((s) => typeof s === "string" && s.length > 0)
        .join(" \n ")

    // Chase's structured interpretation lives in dimension_sheet.target.
    // The sizing engine persists capacity as `kWh` and power as `kW`.
    const target = dimensionSheet?.target ?? {}
    const capacityKwh =
        typeof target["kwh"] === "number"
            ? target["kwh"]
            : typeof target["capacity_kwh"] === "number"
              ? target["capacity_kwh"]
              : null
    const powerKw =
        typeof target["kw"] === "number"
            ? target["kw"]
            : typeof target["kw_thermal"] === "number"
              ? target["kw_thermal"]
              : typeof target["power_kw"] === "number"
                ? target["power_kw"]
                : null

    return {
        founder_raw_brief: haystack,
        chase_design_brief: {
            capacity_kwh: capacityKwh,
            power_kw: powerKw,
            throughput: null,
            throughput_unit: null,
            mass_kg: typeof db?.constraints?.maxMassKg === "number" ? db.constraints.maxMassKg : null,
            envelope: dimensionSheet?.envelope
                ? { kind: dimensionSheet.envelope.kind }
                : null,
        },
    }
}

// ─── Re-export extraction helpers for tests ────────────────────────────

/** @internal — exported for unit tests only */
export const _extractCapacityFromBrief = extractCapacityFromBrief
/** @internal — exported for unit tests only */
export const _extractPowerFromBrief = extractPowerFromBrief
/** @internal — exported for unit tests only */
export const _extractMassFromBrief = extractMassFromBrief
/** @internal — exported for unit tests only */
export const _extractThroughputFromBrief = extractThroughputFromBrief
/** @internal — exported for unit tests only */
export const _extractEnvelopeKindFromBrief = extractEnvelopeKindFromBrief

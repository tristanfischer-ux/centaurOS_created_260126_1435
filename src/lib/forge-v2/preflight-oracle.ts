/**
 * @file preflight-oracle.ts — 100ms deterministic physics-bounds check at
 * brief-lock / autopilot-start, run BEFORE the 12-stage pipeline begins.
 *
 * @description Pure-function module. No Supabase, no LLM. Receives the brief
 * text fields available at lock time and returns a PreflightVerdict within
 * milliseconds by comparing requested parameters against hardcoded physics
 * ceilings derived from publicly documented industry benchmarks.
 *
 * MOTIVATION (Gates Council R1 + R2, Loop 25):
 *   The HAPS demo ran the entire 12-stage pipeline (60+ min) before the
 *   engine discovered the solar array would cost £35M–£80M against a £2.5M
 *   brief. This module would have blocked that run in <100ms with a
 *   cost_orders_of_magnitude blocker.
 *
 * DOMAINS COVERED (v0.1):
 *   - bess:                      Lithium-ion BESS in a containerised envelope
 *   - swro_desalination:         Seawater reverse osmosis desalination plant
 *   - haps:                      High-altitude platform station (stratospheric)
 *   - hydroponic_vertical_farm:  Indoor multi-tier controlled-environment
 *   - consumer_device:           Small consumer product / hedgerow device
 *   - unknown:                   No domain matched — passes with a warning
 *
 * CEILING SOURCES (flagged SOURCED or ESTIMATED inline):
 *   Tristan / hardware domain experts should verify ESTIMATED values before
 *   v1.0 — see the inline comments on each bound.
 *
 * @related
 *   - Brief-lock wiring:  src/actions/brief-lock.ts (step 3b)
 *   - Autopilot stage:    src/actions/forge-v2-autopilot.ts  (preflight_blocked)
 *   - Cron filter:        src/app/api/cron/autopilot-tick/route.ts
 *   - Tests:              src/lib/forge-v2/__tests__/preflight-oracle.test.ts
 */

// ─── Public Types ─────────────────────────────────────────────────────────────

/**
 * Input fed to the oracle. Assembled from the project's research / subject
 * fields at brief-lock time. All fields are optional — absence is treated
 * as "not specified" and the relevant axis is skipped rather than erroneously
 * blocked.
 */
export interface BriefInput {
    /** Raw text of the project subject line. Used for domain detection and
     *  numeric extraction. */
    subject: string

    /** research.report text — the full Chase research report if available. */
    reportText?: string

    /** research.designBrief fields, forwarded verbatim when present. */
    designBrief?: {
        useCase?: string
        mission?: string
        /** BESS: energy storage target in kWh */
        targetCapacityKwh?: number
        /** BESS: peak power target in kW */
        targetPowerKw?: number
        /** Desalination: permeate flow rate in m³/day */
        targetFlowRateM3PerDay?: number
        /** All domains: brief cost ceiling in GBP */
        costCeilingGbp?: number
        /** HAPS: declared wingspan in metres */
        wingspanM?: number
        /** HAPS: payload mass in kg */
        payloadKg?: number
        /** Vertical farm: number of grow tiers */
        tierCount?: number
        /** Vertical farm: total canopy area in m² */
        canopyM2?: number
    }
}

/** The outcome of a single axis check that caused a BLOCK. */
export interface PreflightBlocker {
    /** Short identifier for the axis being checked. */
    axis: string
    /** The value the brief requires (in the axis unit). */
    required: number
    /** The physics ceiling that the required value exceeds. */
    ceiling: number
    /** Human-readable explanation of why this is a physics violation. */
    explanation: string
}

/** A non-blocking observation worth surfacing to the founder. */
export interface PreflightWarning {
    axis: string
    explanation: string
}

/** The domain tag the oracle assigned to this brief. */
export type PreflightDomain =
    | "bess"
    | "swro_desalination"
    | "haps"
    | "hydroponic_vertical_farm"
    | "consumer_device"
    | "unknown"

/** Full verdict returned by runPreflightOracle. */
export interface PreflightVerdict {
    /**
     * true = no physics violations found; the pipeline may proceed.
     * false = at least one BLOCK axis fired; the pipeline must NOT proceed.
     */
    passed: boolean
    domain: PreflightDomain
    blockers: PreflightBlocker[]
    warnings: PreflightWarning[]
    /** Monotonic version string for audit. */
    oracle_version: string
}

// ─── Internal Physics Bounds ──────────────────────────────────────────────────
// Each bound is tagged SOURCED (literature / public spec) or ESTIMATED
// (engineering rule-of-thumb flagged for domain-expert review).

/**
 * Lithium-ion BESS energy density ceiling at packaged-system level.
 * - LFP packaged: 120–200 Wh/L
 * - NMC packaged: 250–350 Wh/L
 * - Hard physics ceiling for NMC at 2024 state-of-art: ~700 Wh/L
 * SOURCED: NREL Utility-Scale BESS Cost Benchmarks 2023; Tesla Megapack II
 * spec (194 Wh/L packaged); Fluence Gridstack data sheets.
 */
const BESS_MAX_ENERGY_DENSITY_WH_PER_L = 700

/**
 * ISO 668 standard container internal volumes.
 * 40ft: 12.032 × 2.352 × 2.395 m = 67.8 m³
 * 20ft:  5.898 × 2.352 × 2.395 m = 33.2 m³
 * SOURCED: ISO 668:2020.
 */
const CONTAINER_40FT_INTERNAL_VOLUME_L = 67_800
const CONTAINER_20FT_INTERNAL_VOLUME_L = 33_200

/**
 * Seawater reverse osmosis membrane flux bounds.
 * Spiral-wound elements at 35 g/L TDS feedwater, 55–70 bar operating pressure.
 * Conservative: 10 LMH (brackish blend tolerance)
 * Optimistic:   25 LMH (clean seawater, ideal conditions)
 * SOURCED: Dow FILMTEC SW30HR-380; Toray TM820C-400 data sheets.
 */
const SWRO_MIN_FLUX_LMH = 10
const SWRO_MAX_FLUX_LMH = 25

/**
 * HAPS payload-to-wing-area ceiling.
 * At 20 km altitude: air density ~0.0889 kg/m³, cruise ~35 m/s, CL ~1.2.
 * Practical HAPS: Airbus Zephyr S total mass 75 kg, wingspan 25 m
 * (~3 kg/m² but larger span; smaller payloads trend 0.1–0.5 kg/m²).
 * We use 2.0 kg/m² as an upper bound for near-term HAPS.
 * ESTIMATED: flag for aero-domain review.
 */
const HAPS_MAX_PAYLOAD_TO_WING_AREA_KG_PER_M2 = 2.0

/**
 * HAPS high-efficiency photovoltaic cell cost.
 * GaAs triple-junction cells (HAPS-grade): £50–£200 per W.
 * Conservative budget estimate for the oracle: £100/W.
 * SOURCED: Spectrolab XTJ Prime spec (2023); SunPower SUNCAT catalogue.
 * ESTIMATED: £100/W mid-point — flag for domain review.
 */
const HAPS_SOLAR_CELL_COST_PER_W_GBP = 100
/** Block if implied solar cost > 10× the brief cost ceiling. */
const HAPS_SOLAR_CELL_BLOCK_MULTIPLIER = 10
/** Warn  if implied solar cost > 5× the brief cost ceiling. */
const HAPS_SOLAR_CELL_WARN_MULTIPLIER = 5

/**
 * 40-foot container floor area for vertical farm canopy check.
 * SOURCED: ISO 668:2020 (12.032 × 2.352 = 28.3 m²).
 */
const CONTAINER_FLOOR_M2 = 28.3

/**
 * Maximum LED power density for standard leafy-green crops.
 * SOURCED: Philips GreenPower LED Toplighting spec (2023); Osram Phytofy RL.
 */
const VF_MAX_LED_POWER_W_PER_M2 = 400

// ─── Domain Detection ─────────────────────────────────────────────────────────

function detectDomain(haystack: string): PreflightDomain {
    const h = haystack.toLowerCase()

    // BESS — explicit keyword first
    if (
        h.includes("battery energy storage") ||
        h.includes(" bess") ||
        h.includes("bess ") ||
        h.startsWith("bess") ||
        (h.includes("kwh") && h.includes("grid") && h.includes("container")) ||
        (h.includes("mwh") && (h.includes("container") || h.includes("grid storage"))) ||
        (h.includes("battery") && h.includes("storage") && (h.includes("mwh") || h.includes("kwh")))
    ) {
        return "bess"
    }

    // HAPS — check before generic "solar" because HAPS is also solar-powered
    if (
        h.includes("haps") ||
        h.includes("stratospheric") ||
        h.includes("high altitude platform") ||
        h.includes("high-altitude platform") ||
        h.includes("pseudo-satellite") ||
        h.includes("pseudo satellite") ||
        (h.includes("solar") && (h.includes("wingspan") || h.includes("stratosphere") || h.includes("20 km") || h.includes("20km")))
    ) {
        return "haps"
    }

    // Desalination
    if (
        h.includes("desalination") ||
        h.includes("desalinator") ||
        h.includes(" swro") ||
        h.startsWith("swro") ||
        h.includes("swro ") ||
        h.includes("seawater reverse osmosis") ||
        h.includes("sea water reverse osmosis") ||
        h.includes("reverse osmosis")
    ) {
        return "swro_desalination"
    }

    // Vertical farm / hydroponic
    if (
        h.includes("vertical farm") ||
        h.includes("vertical farming") ||
        h.includes("hydroponic") ||
        h.includes("hydroponics") ||
        h.includes("controlled environment agriculture") ||
        h.includes("indoor farm") ||
        h.includes("grow tier") ||
        h.includes("growing tier") ||
        h.includes("canopy")
    ) {
        return "hydroponic_vertical_farm"
    }

    // Consumer / small product — weakest signal, check last
    if (
        h.includes("bird feeder") ||
        h.includes("consumer device") ||
        h.includes("consumer product") ||
        h.includes("hedgerow") ||
        h.includes("garden product")
    ) {
        return "consumer_device"
    }

    return "unknown"
}

// ─── Numeric Extraction Helpers ───────────────────────────────────────────────

function extractNumber(text: string, pattern: RegExp): number {
    const m = pattern.exec(text)
    if (!m) return NaN
    return parseFloat(m[1])
}

function parseCapacityKwh(text: string): number {
    const t = text.toLowerCase()
    const mwh = extractNumber(t, /(\d+(?:\.\d+)?)\s*mwh/)
    if (!isNaN(mwh)) return mwh * 1000
    const kwh = extractNumber(t, /(\d+(?:\.\d+)?)\s*kwh/)
    if (!isNaN(kwh)) return kwh
    return NaN
}

function parseFlowRateM3PerDay(text: string): number {
    const t = text.toLowerCase()
    const m = /(\d+(?:\.\d+)?)\s*m[³3](?:\s*\/\s*day|\s*per\s*day|\s*d)/.exec(t)
    if (m) return parseFloat(m[1])
    return NaN
}

function parseWingspanM(text: string): number {
    const t = text.toLowerCase()
    // Range: "5-10m", "5 to 10 m" — take upper bound (conservative)
    const range = /(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*m(?:\b|$)/.exec(t)
    if (range) return parseFloat(range[2])
    // Near wingspan keyword
    const near = extractNumber(t, /(?:wingspan|span|wing)[^0-9]*(\d+(?:\.\d+)?)\s*m/)
    if (!isNaN(near)) return near
    const before = extractNumber(t, /(\d+(?:\.\d+)?)\s*m\b.*(?:wingspan|span|wing)/)
    if (!isNaN(before)) return before
    return NaN
}

function parseContainerVolumeL(text: string): number {
    const t = text.toLowerCase()
    if (t.includes("40ft") || t.includes("40-foot") || t.includes("40 foot") || t.includes("40 ft")) {
        return CONTAINER_40FT_INTERNAL_VOLUME_L
    }
    if (t.includes("20ft") || t.includes("20-foot") || t.includes("20 foot") || t.includes("20 ft")) {
        return CONTAINER_20FT_INTERNAL_VOLUME_L
    }
    if (t.includes("container")) return CONTAINER_40FT_INTERNAL_VOLUME_L
    return NaN
}

function parseCostCeilingGbp(text: string): number {
    const t = text.toLowerCase()
    const mMatch = /(?:£|gbp\s*)(\d+(?:\.\d+)?)\s*m(?:illion)?/.exec(t)
    if (mMatch) return parseFloat(mMatch[1]) * 1_000_000
    const kMatch = /(?:£|gbp\s*)(\d+(?:\.\d+)?)\s*k(?:\b|illion)?/.exec(t)
    if (kMatch) return parseFloat(kMatch[1]) * 1_000
    const plainMatch = /(?:£|gbp\s*)(\d[\d,]+)/.exec(t)
    if (plainMatch) return parseFloat(plainMatch[1].replace(/,/g, ""))
    return NaN
}

// ─── Domain-Specific Checkers ─────────────────────────────────────────────────

type CheckResult = { blockers: PreflightBlocker[]; warnings: PreflightWarning[] }

function checkBess(input: BriefInput, haystack: string): CheckResult {
    const blockers: PreflightBlocker[] = []
    const warnings: PreflightWarning[] = []

    let capacityKwh: number = input.designBrief?.targetCapacityKwh ?? NaN
    if (isNaN(capacityKwh)) capacityKwh = parseCapacityKwh(haystack)

    if (isNaN(capacityKwh)) {
        warnings.push({
            axis: "energy_density",
            explanation: "No capacity (kWh or MWh) found in the brief. Energy density could not be checked. State the target capacity before locking.",
        })
        return { blockers, warnings }
    }

    const volumeL = parseContainerVolumeL(haystack)
    if (isNaN(volumeL)) {
        warnings.push({
            axis: "energy_density",
            explanation: `Found capacity of ${capacityKwh} kWh but no containerised envelope specified. Check energy density fits the target enclosure.`,
        })
        return { blockers, warnings }
    }

    const requiredWhl = (capacityKwh * 1000) / volumeL

    if (requiredWhl > BESS_MAX_ENERGY_DENSITY_WH_PER_L) {
        blockers.push({
            axis: "energy_density",
            required: Math.round(requiredWhl),
            ceiling: BESS_MAX_ENERGY_DENSITY_WH_PER_L,
            explanation:
                `${capacityKwh} kWh in a ${volumeL / 1000} m³ envelope requires ${Math.round(requiredWhl)} Wh/L. ` +
                `The hard ceiling for commercially available NMC packaged systems is ${BESS_MAX_ENERGY_DENSITY_WH_PER_L} Wh/L. ` +
                `Either reduce the capacity target or increase the envelope size.`,
        })
    } else if (requiredWhl > 0.8 * BESS_MAX_ENERGY_DENSITY_WH_PER_L) {
        warnings.push({
            axis: "energy_density",
            explanation:
                `${Math.round(requiredWhl)} Wh/L is within 80% of the physical ceiling (${BESS_MAX_ENERGY_DENSITY_WH_PER_L} Wh/L). ` +
                `Only NMC high-energy cells achieve this — LFP will not fit. Confirm cell chemistry.`,
        })
    }

    return { blockers, warnings }
}

function checkSwro(input: BriefInput, haystack: string): CheckResult {
    const blockers: PreflightBlocker[] = []
    const warnings: PreflightWarning[] = []

    let flowM3Day: number = input.designBrief?.targetFlowRateM3PerDay ?? NaN
    if (isNaN(flowM3Day)) flowM3Day = parseFlowRateM3PerDay(haystack)

    if (isNaN(flowM3Day)) {
        warnings.push({
            axis: "membrane_area",
            explanation: "No flow rate (m³/day) found in the brief. Membrane area check skipped.",
        })
        return { blockers, warnings }
    }

    const minAreaM2 = (flowM3Day * 1000) / (24 * SWRO_MAX_FLUX_LMH)
    const maxAreaM2 = (flowM3Day * 1000) / (24 * SWRO_MIN_FLUX_LMH)

    // ESTIMATED: single containerised system can hold up to ~1000 m² of membrane
    const CONTAINER_MAX_MEMBRANE_M2 = 1000
    if (minAreaM2 > CONTAINER_MAX_MEMBRANE_M2) {
        blockers.push({
            axis: "membrane_area",
            required: Math.round(minAreaM2),
            ceiling: CONTAINER_MAX_MEMBRANE_M2,
            explanation:
                `${flowM3Day} m³/day requires at least ${Math.round(minAreaM2)} m² of membrane ` +
                `(at ${SWRO_MAX_FLUX_LMH} LMH). This exceeds the estimated single-container maximum ` +
                `(${CONTAINER_MAX_MEMBRANE_M2} m²). A multi-container or skid-mounted train will be needed.`,
        })
    } else {
        warnings.push({
            axis: "membrane_area",
            explanation:
                `${flowM3Day} m³/day requires ${Math.round(minAreaM2)}–${Math.round(maxAreaM2)} m² of spiral-wound membrane. ` +
                `Within range for a containerised system — no physics violation detected.`,
        })
    }

    return { blockers, warnings }
}

function checkHaps(input: BriefInput, haystack: string): CheckResult {
    const blockers: PreflightBlocker[] = []
    const warnings: PreflightWarning[] = []

    const payloadKg: number = input.designBrief?.payloadKg ?? NaN
    let wingspanM: number = input.designBrief?.wingspanM ?? NaN
    if (isNaN(wingspanM)) wingspanM = parseWingspanM(haystack)

    // (a) Payload density check
    if (!isNaN(payloadKg) && !isNaN(wingspanM) && wingspanM > 0) {
        // Wing area estimate: aspect ratio 20:1 → area ≈ wingspan² / 20 (ESTIMATED)
        const wingAreaM2 = (wingspanM * wingspanM) / 20
        const payloadDensity = payloadKg / wingAreaM2

        if (payloadDensity > HAPS_MAX_PAYLOAD_TO_WING_AREA_KG_PER_M2) {
            blockers.push({
                axis: "haps_payload_density",
                required: Math.round(payloadDensity * 100) / 100,
                ceiling: HAPS_MAX_PAYLOAD_TO_WING_AREA_KG_PER_M2,
                explanation:
                    `${payloadKg} kg payload on a ${wingspanM} m span (estimated wing area ` +
                    `${Math.round(wingAreaM2)} m²) requires ${payloadDensity.toFixed(2)} kg/m². ` +
                    `Stratospheric ceiling for solar-powered HAPS is ~${HAPS_MAX_PAYLOAD_TO_WING_AREA_KG_PER_M2} kg/m². ` +
                    `Reduce payload mass or increase wingspan.`,
            })
        }
    }

    // (b) Solar cost vs brief ceiling
    let costCeilingGbp: number = input.designBrief?.costCeilingGbp ?? NaN
    if (isNaN(costCeilingGbp)) costCeilingGbp = parseCostCeilingGbp(haystack)

    if (!isNaN(wingspanM) && !isNaN(costCeilingGbp) && costCeilingGbp > 0) {
        // Implied solar power: 1 kW per linear metre of wing (ESTIMATED)
        const impliedSolarW = wingspanM * 1000
        const impliedSolarCostGbp = impliedSolarW * HAPS_SOLAR_CELL_COST_PER_W_GBP
        const ratio = impliedSolarCostGbp / costCeilingGbp

        if (ratio > HAPS_SOLAR_CELL_BLOCK_MULTIPLIER) {
            blockers.push({
                axis: "cost_orders_of_magnitude",
                required: Math.round(impliedSolarCostGbp),
                ceiling: costCeilingGbp,
                explanation:
                    `Implied solar cell cost (${wingspanM} m wingspan × 1 kW/m × £${HAPS_SOLAR_CELL_COST_PER_W_GBP}/W) = ` +
                    `£${(impliedSolarCostGbp / 1_000_000).toFixed(1)}M. ` +
                    `This is ${ratio.toFixed(0)}× the brief cost ceiling of £${(costCeilingGbp / 1_000_000).toFixed(1)}M. ` +
                    `High-efficiency photovoltaic cells for stratospheric flight are £50–£200/W. ` +
                    `The brief cost target is not achievable without a fundamentally different ` +
                    `power architecture or a much larger budget.`,
            })
        } else if (ratio > HAPS_SOLAR_CELL_WARN_MULTIPLIER) {
            warnings.push({
                axis: "cost_orders_of_magnitude",
                explanation:
                    `Implied solar cell cost (£${(impliedSolarCostGbp / 1_000_000).toFixed(1)}M) is ` +
                    `${ratio.toFixed(0)}× the brief cost ceiling (£${(costCeilingGbp / 1_000_000).toFixed(1)}M). ` +
                    `Cost realism will need careful attention during the Finn stage.`,
            })
        }
    }

    if (!isNaN(wingspanM) && isNaN(costCeilingGbp)) {
        warnings.push({
            axis: "cost_orders_of_magnitude",
            explanation:
                `HAPS solar cell cost check skipped — no cost ceiling found in the brief. ` +
                `At £${HAPS_SOLAR_CELL_COST_PER_W_GBP}/W, a ${wingspanM} m wingspan implies ` +
                `~£${((wingspanM * 1000 * HAPS_SOLAR_CELL_COST_PER_W_GBP) / 1_000_000).toFixed(1)}M in solar cells alone.`,
        })
    }

    return { blockers, warnings }
}

function checkHydroponic(input: BriefInput, _haystack: string): CheckResult {
    const blockers: PreflightBlocker[] = []
    const warnings: PreflightWarning[] = []

    const tierCount = input.designBrief?.tierCount ?? NaN
    const canopyM2 = input.designBrief?.canopyM2 ?? NaN

    if (isNaN(tierCount) && isNaN(canopyM2)) {
        warnings.push({
            axis: "canopy_vs_envelope",
            explanation: "No tier count or canopy area found in the brief. Vertical farm canopy check skipped.",
        })
        return { blockers, warnings }
    }

    if (!isNaN(tierCount) && !isNaN(canopyM2) && tierCount > 0) {
        const requiredFloorM2 = canopyM2 / tierCount
        if (requiredFloorM2 > CONTAINER_FLOOR_M2 * 2) {
            blockers.push({
                axis: "canopy_vs_envelope",
                required: Math.round(requiredFloorM2),
                ceiling: CONTAINER_FLOOR_M2,
                explanation:
                    `${canopyM2} m² total canopy across ${tierCount} tiers requires ${Math.round(requiredFloorM2)} m² per tier. ` +
                    `A single 40-foot container provides ${CONTAINER_FLOOR_M2} m² of floor area. ` +
                    `This implies a multi-container installation — ensure the brief specifies the correct envelope.`,
            })
        }
    }

    const powerKw = input.designBrief?.targetPowerKw ?? NaN
    if (!isNaN(powerKw) && !isNaN(canopyM2) && canopyM2 > 0) {
        const wPerM2 = (powerKw * 1000) / canopyM2
        if (wPerM2 > VF_MAX_LED_POWER_W_PER_M2) {
            warnings.push({
                axis: "led_power_density",
                explanation:
                    `${powerKw} kW across ${canopyM2} m² canopy = ${Math.round(wPerM2)} W/m². ` +
                    `Exceeds practical ceiling for leafy-green crops (${VF_MAX_LED_POWER_W_PER_M2} W/m²). ` +
                    `Confirm crop type — fruiting crops can tolerate up to 800 W/m².`,
            })
        }
    }

    // Canopy check with haystack keyword (no structured data)
    if (isNaN(tierCount) || isNaN(canopyM2)) {
        warnings.push({
            axis: "canopy_vs_envelope",
            explanation: "Partial canopy data — full physics check requires tierCount and canopyM2 in designBrief.",
        })
    }

    return { blockers, warnings }
}

function checkConsumerDevice(_input: BriefInput, _haystack: string): CheckResult {
    return {
        blockers: [],
        warnings: [
            {
                axis: "consumer_device_canary",
                explanation: "Consumer device domain detected. No physics violations at v0.1 — canary pass.",
            },
        ],
    }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export const PREFLIGHT_ORACLE_VERSION = "v0.1-2026-04-29"

/**
 * Run the pre-flight physics-bounds oracle on a brief.
 *
 * @description Pure function — no Supabase, no network. Deterministic.
 *   Returns in <10ms for any input.
 *
 * @param brief - Fields available at brief-lock time.
 * @returns PreflightVerdict — `passed: false` means the pipeline must not
 *   start; `passed: true` means no obvious physics violations detected.
 */
export function runPreflightOracle(brief: BriefInput): PreflightVerdict {
    const haystack = [
        brief.subject ?? "",
        brief.reportText ?? "",
        brief.designBrief?.useCase ?? "",
        brief.designBrief?.mission ?? "",
    ]
        .join(" ")
        .toLowerCase()

    const domain = detectDomain(haystack)

    let blockers: PreflightBlocker[] = []
    let warnings: PreflightWarning[] = []

    switch (domain) {
        case "bess": {
            const r = checkBess(brief, haystack)
            blockers = r.blockers
            warnings = r.warnings
            break
        }
        case "swro_desalination": {
            const r = checkSwro(brief, haystack)
            blockers = r.blockers
            warnings = r.warnings
            break
        }
        case "haps": {
            const r = checkHaps(brief, haystack)
            blockers = r.blockers
            warnings = r.warnings
            break
        }
        case "hydroponic_vertical_farm": {
            const r = checkHydroponic(brief, haystack)
            blockers = r.blockers
            warnings = r.warnings
            break
        }
        case "consumer_device": {
            const r = checkConsumerDevice(brief, haystack)
            blockers = r.blockers
            warnings = r.warnings
            break
        }
        default: {
            warnings.push({
                axis: "domain_detection",
                explanation:
                    "No hardware domain was detected from the brief text. Pre-flight physics checks were skipped. Ensure the brief clearly states the product category.",
            })
        }
    }

    return {
        passed: blockers.length === 0,
        domain,
        blockers,
        warnings,
        oracle_version: PREFLIGHT_ORACLE_VERSION,
    }
}

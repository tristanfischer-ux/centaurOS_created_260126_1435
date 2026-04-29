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
 *   - Threshold config:   src/lib/forge-v2/preflight-oracle-config.ts
 */

import { loadPreflightOracleConfig, ORACLE_CONFIG_VERSION } from "./preflight-oracle-config"

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
        /**
         * Per-brief bypass flag (council-calibrated 2026-04-29).
         *
         * When true, all BLOCK-level findings are downgraded to WARNINGs so
         * the pipeline can proceed. The bypass is surfaced as a warning in the
         * PreflightVerdict and logged to the audit trail. Intended for:
         *   - Knowingly exotic designs beyond near-term commercial specs
         *   - Research / exploratory projects
         *   - Domain-expert overrides where the briefed number is correct but unusual
         *
         * The bypass does NOT suppress warnings — they still appear.
         */
        preflight_oracle_bypass?: boolean
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
     *
     * Note: when bypass is true, passed is always true even if blockers are
     * present (they are downgraded to warnings). Check the `bypassed` field
     * to distinguish a clean pass from a bypassed block.
     */
    passed: boolean
    domain: PreflightDomain
    /** Blockers that caused the brief to fail (empty when passed). */
    blockers: PreflightBlocker[]
    warnings: PreflightWarning[]
    /**
     * true when the per-brief bypass flag was set and at least one blocker
     * was downgraded to a warning. The UI should surface a yellow banner
     * "Physics oracle bypassed by design team" in this case.
     */
    bypassed: boolean
    /** Monotonic version string for audit. Combines oracle logic version and
     *  config version so both are visible in the verdict row. */
    oracle_version: string
}

// ─── Fixed Physical Constants (ISO / engineering, never configurable) ─────────
// These are physical reality, not performance targets — they don't change
// with technology and must not be in the configurable threshold file.

/**
 * ISO 668 standard container internal volumes.
 * 40ft: 12.032 × 2.352 × 2.395 m = 67.8 m³
 * 20ft:  5.898 × 2.352 × 2.395 m = 33.2 m³
 * SOURCED: ISO 668:2020.
 */
const CONTAINER_40FT_INTERNAL_VOLUME_L = 67_800
const CONTAINER_20FT_INTERNAL_VOLUME_L = 33_200

/**
 * 40-foot container floor area for vertical farm canopy check.
 * SOURCED: ISO 668:2020 (12.032 × 2.352 = 28.3 m²).
 */
const CONTAINER_FLOOR_M2 = 28.3

// ─── Performance Thresholds (read from configurable config) ───────────────────
// These change as technology advances and are therefore loaded from
// preflight-oracle-config.ts rather than hardcoded here.
// Access them via getConfig() to ensure the lazy-load pattern works correctly
// and tests can override via _resetPreflightOracleConfigForTests().

function getConfig() {
    return loadPreflightOracleConfig()
}

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
    const cfg = getConfig().bess

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
    const ceiling = cfg.maxEnergyDensityWhPerL
    const warnThreshold = ceiling * cfg.warningFractionOfCeiling

    if (requiredWhl > ceiling) {
        blockers.push({
            axis: "energy_density",
            required: Math.round(requiredWhl),
            ceiling,
            explanation:
                `${capacityKwh} kWh in a ${volumeL / 1000} m³ envelope requires ${Math.round(requiredWhl)} Wh/L. ` +
                `The ceiling for near-term packaged systems (including next-generation solid-state) is ${ceiling} Wh/L. ` +
                `Either reduce the capacity target or increase the envelope size. ` +
                `If this is an intentional advanced-chemistry design, set preflight_oracle_bypass: true in the design brief.`,
        })
    } else if (requiredWhl > warnThreshold) {
        warnings.push({
            axis: "energy_density",
            explanation:
                `${Math.round(requiredWhl)} Wh/L is above ${Math.round(cfg.warningFractionOfCeiling * 100)}% of the configured ceiling (${ceiling} Wh/L). ` +
                `Only high-energy NMC or solid-state cells achieve this — LFP will not fit. Confirm cell chemistry before locking.`,
        })
    }

    return { blockers, warnings }
}

function checkSwro(input: BriefInput, haystack: string): CheckResult {
    const blockers: PreflightBlocker[] = []
    const warnings: PreflightWarning[] = []
    const cfg = getConfig().swro

    let flowM3Day: number = input.designBrief?.targetFlowRateM3PerDay ?? NaN
    if (isNaN(flowM3Day)) flowM3Day = parseFlowRateM3PerDay(haystack)

    if (isNaN(flowM3Day)) {
        warnings.push({
            axis: "membrane_area",
            explanation: "No flow rate (m³/day) found in the brief. Membrane area check skipped.",
        })
        return { blockers, warnings }
    }

    const minAreaM2 = (flowM3Day * 1000) / (24 * cfg.maxFluxLmh)
    const maxAreaM2 = (flowM3Day * 1000) / (24 * cfg.minFluxLmh)

    if (minAreaM2 > cfg.maxContainerMembraneM2) {
        blockers.push({
            axis: "membrane_area",
            required: Math.round(minAreaM2),
            ceiling: cfg.maxContainerMembraneM2,
            explanation:
                `${flowM3Day} m³/day requires at least ${Math.round(minAreaM2)} m² of membrane ` +
                `(at ${cfg.maxFluxLmh} LMH). This exceeds the single-container maximum ` +
                `(${cfg.maxContainerMembraneM2} m²). A multi-container or skid-mounted train will be needed. ` +
                `If the brief intentionally specifies a multi-container system, set preflight_oracle_bypass: true.`,
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
    const cfg = getConfig().haps

    const payloadKg: number = input.designBrief?.payloadKg ?? NaN
    let wingspanM: number = input.designBrief?.wingspanM ?? NaN
    if (isNaN(wingspanM)) wingspanM = parseWingspanM(haystack)

    // (a) Payload density check
    if (!isNaN(payloadKg) && !isNaN(wingspanM) && wingspanM > 0) {
        // Wing area estimate: aspect ratio 20:1 → area ≈ wingspan² / 20 (ESTIMATED)
        const wingAreaM2 = (wingspanM * wingspanM) / 20
        const payloadDensity = payloadKg / wingAreaM2

        if (payloadDensity > cfg.maxPayloadToWingAreaKgPerM2) {
            blockers.push({
                axis: "haps_payload_density",
                required: Math.round(payloadDensity * 100) / 100,
                ceiling: cfg.maxPayloadToWingAreaKgPerM2,
                explanation:
                    `${payloadKg} kg payload on a ${wingspanM} m span (estimated wing area ` +
                    `${Math.round(wingAreaM2)} m²) requires ${payloadDensity.toFixed(2)} kg/m². ` +
                    `Stratospheric ceiling for solar-powered HAPS is ~${cfg.maxPayloadToWingAreaKgPerM2} kg/m². ` +
                    `Reduce payload mass or increase wingspan. For advanced structural designs, ` +
                    `set preflight_oracle_bypass: true in the design brief.`,
            })
        }
    }

    // (b) Solar cost vs brief ceiling
    let costCeilingGbp: number = input.designBrief?.costCeilingGbp ?? NaN
    if (isNaN(costCeilingGbp)) costCeilingGbp = parseCostCeilingGbp(haystack)

    if (!isNaN(wingspanM) && !isNaN(costCeilingGbp) && costCeilingGbp > 0) {
        // Implied solar power: 1 kW per linear metre of wing (ESTIMATED)
        const impliedSolarW = wingspanM * 1000
        const impliedSolarCostGbp = impliedSolarW * cfg.solarCostPerWGbp
        const ratio = impliedSolarCostGbp / costCeilingGbp

        if (ratio > cfg.solarCostBlockMultiplier) {
            blockers.push({
                axis: "cost_orders_of_magnitude",
                required: Math.round(impliedSolarCostGbp),
                ceiling: costCeilingGbp,
                explanation:
                    `Implied solar cell cost (${wingspanM} m wingspan × 1 kW/m × £${cfg.solarCostPerWGbp}/W) = ` +
                    `£${(impliedSolarCostGbp / 1_000_000).toFixed(1)}M. ` +
                    `This is ${ratio.toFixed(0)}× the brief cost ceiling of £${(costCeilingGbp / 1_000_000).toFixed(1)}M. ` +
                    `High-efficiency photovoltaic cells for stratospheric flight are £50–£200/W. ` +
                    `The brief cost target is not achievable without a fundamentally different ` +
                    `power architecture or a much larger budget.`,
            })
        } else if (ratio > cfg.solarCostWarnMultiplier) {
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
                `At £${cfg.solarCostPerWGbp}/W, a ${wingspanM} m wingspan implies ` +
                `~£${((wingspanM * 1000 * cfg.solarCostPerWGbp) / 1_000_000).toFixed(1)}M in solar cells alone.`,
        })
    }

    return { blockers, warnings }
}

function checkHydroponic(input: BriefInput, _haystack: string): CheckResult {
    const blockers: PreflightBlocker[] = []
    const warnings: PreflightWarning[] = []
    const cfg = getConfig().verticalFarm

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
        if (requiredFloorM2 > CONTAINER_FLOOR_M2 * cfg.canopyPerTierBlockMultiplier) {
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
        if (wPerM2 > cfg.maxLedPowerWPerM2) {
            // Above hard ceiling — this is a blocker, not a warning
            blockers.push({
                axis: "led_power_density",
                required: Math.round(wPerM2),
                ceiling: cfg.maxLedPowerWPerM2,
                explanation:
                    `${powerKw} kW across ${canopyM2} m² canopy = ${Math.round(wPerM2)} W/m². ` +
                    `Exceeds the configured ceiling (${cfg.maxLedPowerWPerM2} W/m²). ` +
                    `Confirm crop type and LED specification. Fruiting crops can tolerate up to 800 W/m² ` +
                    `but leafy greens rarely exceed 400 W/m². If the spec is correct, set preflight_oracle_bypass: true.`,
            })
        } else if (wPerM2 > cfg.warnLedPowerWPerM2) {
            warnings.push({
                axis: "led_power_density",
                explanation:
                    `${powerKw} kW across ${canopyM2} m² canopy = ${Math.round(wPerM2)} W/m². ` +
                    `Exceeds the standard ceiling for leafy-green crops (${cfg.warnLedPowerWPerM2} W/m²). ` +
                    `Confirm crop type — fruiting crops can tolerate higher power densities.`,
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

export const PREFLIGHT_ORACLE_VERSION = "v0.2-2026-04-29"

/**
 * Run the pre-flight physics-bounds oracle on a brief.
 *
 * @description Pure function — no Supabase, no network. Deterministic.
 *   Returns in <10ms for any input.
 *
 * @param brief - Fields available at brief-lock time.
 * @returns PreflightVerdict — `passed: false` means the pipeline must not
 *   start; `passed: true` means no obvious physics violations detected.
 *
 *   Special case: if `brief.designBrief.preflight_oracle_bypass` is true,
 *   all blockers are downgraded to warnings and `passed` is set to true.
 *   The `bypassed` field is set to true in this case.
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
    const bypassRequested = brief.designBrief?.preflight_oracle_bypass === true

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

    // Per-brief bypass: downgrade all blockers to warnings when the founder
    // has explicitly acknowledged the physics bounds do not apply to this design.
    let bypassed = false
    if (bypassRequested && blockers.length > 0) {
        bypassed = true
        // Move blockers to warnings with a bypass prefix
        for (const blocker of blockers) {
            warnings.push({
                axis: blocker.axis,
                explanation:
                    `[PHYSICS ORACLE BYPASSED] ${blocker.explanation} ` +
                    `(Required: ${blocker.required}, Ceiling: ${blocker.ceiling}). ` +
                    `This check was bypassed because preflight_oracle_bypass is set in the design brief. ` +
                    `Ensure this is intentional.`,
            })
        }
        // With bypass active, blockers are cleared — pipeline proceeds
        blockers = []
        warnings.push({
            axis: "oracle_bypass_active",
            explanation:
                "Pre-flight physics oracle bypass is active for this project. One or more physics-bounds checks " +
                "that would normally block the pipeline have been downgraded to warnings. The design team has " +
                "acknowledged these constraints do not apply.",
        })
    }

    return {
        passed: blockers.length === 0,
        domain,
        blockers,
        warnings,
        bypassed,
        oracle_version: `${PREFLIGHT_ORACLE_VERSION}+config-${ORACLE_CONFIG_VERSION}`,
    }
}

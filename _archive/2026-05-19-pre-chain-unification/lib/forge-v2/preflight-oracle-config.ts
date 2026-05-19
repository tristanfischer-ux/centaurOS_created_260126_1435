/**
 * @file preflight-oracle-config.ts — Configurable thresholds for the
 * pre-flight physics-bounds oracle.
 *
 * @description This file is the single source of truth for all oracle threshold
 * values. Changing a threshold here takes effect immediately on the next deploy
 * without touching the oracle logic in preflight-oracle.ts.
 *
 * ## Design principles (council-calibrated 2026-04-29)
 *
 * The council (GPT-5.5, Gemini 3.1 Pro, DeepSeek V4-Pro, Mistral Large 2407,
 * Kimi K2.6, Grok-3) reached unanimous consensus on three principles:
 *
 *   1. **Generous hard-block thresholds, tighter warnings.**
 *      A false negative (letting an infeasible brief through) is cheaper than
 *      a false positive (blocking an innovative but valid design). Hard-block
 *      thresholds are set at 1.4–2× current state-of-art SOURCED values and at
 *      2× ESTIMATED values so that near-future technologies (solid-state
 *      batteries, advanced membrane packing, carbon-nanotube structures) are not
 *      rejected prematurely.
 *
 *   2. **Config file + per-brief bypass flag.**
 *      Thresholds that change over time (physics doesn't change but commercially
 *      available specs do) belong in a versioned config file, not buried in code.
 *      A per-brief bypass flag (in the project research.designBrief) provides an
 *      escape hatch for knowingly exotic designs without disabling the oracle for
 *      the whole platform.
 *
 *   3. **Keep the oracle conservative on SOURCED values.**
 *      Where a threshold is derived from publicly documented datasheets
 *      (e.g. BESS NMC hard physics ceiling at 700 Wh/L) and NOT an estimate,
 *      the generous multiplier is still 1.4× (not 2×) because the physics is
 *      well-constrained and doubling it would allow briefs that are genuinely
 *      impossible with any near-term chemistry.
 *
 * ## Updating thresholds
 *
 *   1. Change the value in PREFLIGHT_ORACLE_CONFIG below.
 *   2. Update the SOURCE_NOTES comment for the changed field.
 *   3. Bump ORACLE_CONFIG_VERSION (semver patch for numeric changes, minor for
 *      new axes, major for structural schema changes).
 *   4. Run the test suite: `npx vitest src/lib/forge-v2/__tests__/preflight-oracle.test.ts`
 *   5. Commit with message: `config(preflight-oracle): [description of change]`
 *
 * ## Per-brief bypass flag
 *
 *   Set `research.designBrief.preflight_oracle_bypass = true` on a project to
 *   skip all blocking (blockers are downgraded to warnings). The bypass is
 *   surfaced in the UI as a yellow "Physics oracle bypassed" banner and logged
 *   to the audit trail. It does NOT suppress warnings — they still appear.
 *
 *   The bypass is intended for:
 *     - Knowingly exotic designs where the founder understands the risk
 *     - Research / exploratory projects not bound by near-term commercial specs
 *     - Domain-expert overrides where the briefed number is correct but unusual
 *
 *   The bypass is NOT intended for:
 *     - Hiding a genuine brief error (wrong units, typo)
 *     - Silencing the oracle to avoid reading the warnings
 *
 * @see src/lib/forge-v2/preflight-oracle.ts — oracle logic that reads this config
 * @see src/lib/forge-v2/__tests__/preflight-oracle.test.ts — test suite
 */

// ─── Config Version ───────────────────────────────────────────────────────────

/**
 * Monotonic version string. Bump on every change to PREFLIGHT_ORACLE_CONFIG.
 * The oracle embeds this in PreflightVerdict.oracle_version.
 */
export const ORACLE_CONFIG_VERSION = "v0.2-2026-04-29"

// ─── Threshold Config ─────────────────────────────────────────────────────────

/**
 * Physics-bounds configuration for the pre-flight oracle.
 *
 * Each domain section groups related thresholds. Every field includes:
 *   - The numeric value
 *   - Source classification (SOURCED = from datasheets, ESTIMATED = rule-of-thumb)
 *   - Council recommendation rationale
 */
export interface PreflightOracleConfig {
    /** BESS (containerised lithium-ion battery energy storage system) */
    bess: {
        /**
         * Hard-block ceiling for packaged NMC system energy density in Wh/L.
         *
         * Previous value: 700 Wh/L (hard physics ceiling for current NMC).
         * Council recommendation: raise to 1000 Wh/L.
         * Rationale: allows next-generation solid-state battery chemistries
         * (QuantumScape, SolidPower projections) which are plausible near-future
         * innovation. Anything above 1000 Wh/L is solidly in research-lab
         * territory and genuinely implausible in a containerised system by 2028.
         *
         * SOURCED base: 700 Wh/L (NREL 2023, Tesla Megapack II).
         * Council uplift: 1.4× → 1000 Wh/L.
         */
        maxEnergyDensityWhPerL: number

        /**
         * Warning threshold: fraction of maxEnergyDensityWhPerL above which
         * the oracle warns that only premium cell chemistry will achieve this.
         * Default 0.7 (70% of ceiling).
         */
        warningFractionOfCeiling: number
    }

    /** Seawater reverse osmosis desalination */
    swro: {
        /**
         * Maximum spiral-wound membrane area that can fit inside a single
         * containerised system in m².
         *
         * Previous value: 1000 m² (ESTIMATED — single-container heuristic).
         * Council recommendation: raise to 2000 m².
         * Rationale: the 1000 m² figure was flagged ESTIMATED in the original
         * code and was likely conservative. Advanced spiral-wound module packing
         * (e.g. Toray/DuPont high-density skid designs) can achieve denser
         * configurations. 2000 m² avoids false positives for large industrial
         * systems while still flagging genuinely multi-container designs.
         *
         * ESTIMATED. Council uplift: 2× → 2000 m².
         */
        maxContainerMembraneM2: number

        /** Conservative flux in LMH for worst-case membrane area calculation. */
        minFluxLmh: number

        /** Optimistic flux in LMH for best-case membrane area calculation. */
        maxFluxLmh: number
    }

    /** High-altitude platform station (stratospheric solar-powered drone) */
    haps: {
        /**
         * Estimated cost per Watt for HAPS-grade high-efficiency photovoltaic cells
         * in GBP.
         *
         * Previous value: £100/W (mid-point of £50–£200 GaAs range).
         * Council recommendation: keep £100/W — this is a sound economic
         * cross-check, not a physics limit.
         *
         * SOURCED: Spectrolab XTJ Prime (2023), SunPower SUNCAT catalogue.
         */
        solarCostPerWGbp: number

        /**
         * Hard-block multiplier: if implied solar cost > this × brief ceiling,
         * block the brief. Previous: 10×. Council: keep at 10×.
         */
        solarCostBlockMultiplier: number

        /**
         * Warning multiplier: if implied solar cost > this × brief ceiling,
         * warn. Previous: 5×. Council: keep at 5×.
         */
        solarCostWarnMultiplier: number

        /**
         * Maximum payload-to-wing-area density in kg/m² for solar HAPS.
         *
         * Previous value: 2.0 kg/m² (ESTIMATED — flagged for aero review).
         * Council recommendation: raise to 4.0 kg/m².
         * Rationale: the 2.0 kg/m² figure was an estimate based on Airbus Zephyr S
         * (75 kg, 25 m wingspan), which is an ultra-low-payload platform. More
         * capable HAPS concepts (Joby Aviation Altitude, Stratospheric Platforms)
         * and structural innovations (carbon nanotube skin, distributed propulsion)
         * can achieve higher payload fractions. 4.0 kg/m² allows plausible
         * next-generation designs while still blocking physically impossible briefs.
         *
         * ESTIMATED. Council uplift: 2× → 4.0 kg/m².
         */
        maxPayloadToWingAreaKgPerM2: number
    }

    /** Hydroponic vertical farm (indoor multi-tier controlled environment) */
    verticalFarm: {
        /**
         * Maximum LED power density per canopy m² for standard leafy-green crops
         * in W/m².
         *
         * Previous value: 400 W/m² (Philips GreenPower 2023 spec).
         * Council recommendation: raise to 600 W/m².
         * Rationale: high-efficiency LED technology and fruiting crops (tomatoes,
         * peppers) can tolerate up to 800 W/m² of photosynthetically active
         * radiation. 600 W/m² is a reasonable ceiling for a mixed-crop system
         * without triggering false positives for advanced LED configurations.
         * The oracle still warns above 400 W/m² that crop type must be confirmed.
         *
         * SOURCED base: 400 W/m² (Philips GreenPower, Osram Phytofy RL, 2023).
         * Council uplift: 1.5× → 600 W/m².
         */
        maxLedPowerWPerM2: number

        /**
         * Warning threshold: LED power density above which the oracle warns
         * that crop type must be confirmed (fruiting crops tolerate higher loads).
         * Kept at the SOURCED value of 400 W/m².
         */
        warnLedPowerWPerM2: number

        /**
         * Maximum canopy per floor area multiplier before the oracle blocks.
         * A value of 2 means: if canopy per tier exceeds 2× container floor area,
         * block (implies multi-container without specifying it).
         */
        canopyPerTierBlockMultiplier: number
    }
}

/**
 * Default configuration — council-calibrated 2026-04-29.
 *
 * To override for a deployment, set environment variable
 * PREFLIGHT_ORACLE_CONFIG_OVERRIDE as a JSON string matching this interface.
 * The override is merged at field level (not deep-merged), so only changed
 * domain sections need to be specified.
 */
const DEFAULT_CONFIG: PreflightOracleConfig = {
    bess: {
        maxEnergyDensityWhPerL: 1000,
        warningFractionOfCeiling: 0.7,
    },
    swro: {
        maxContainerMembraneM2: 2000,
        minFluxLmh: 10,
        maxFluxLmh: 25,
    },
    haps: {
        solarCostPerWGbp: 100,
        solarCostBlockMultiplier: 10,
        solarCostWarnMultiplier: 5,
        maxPayloadToWingAreaKgPerM2: 4.0,
    },
    verticalFarm: {
        maxLedPowerWPerM2: 600,
        warnLedPowerWPerM2: 400,
        canopyPerTierBlockMultiplier: 2,
    },
}

// ─── Config Loader ────────────────────────────────────────────────────────────

let _loaded: PreflightOracleConfig | null = null

/**
 * Load the oracle config. On first call, checks for an environment-variable
 * override and merges it at domain level. Subsequent calls return the cached
 * result.
 *
 * @returns The active PreflightOracleConfig for this deployment.
 */
export function loadPreflightOracleConfig(): PreflightOracleConfig {
    if (_loaded) return _loaded

    const override = process.env.PREFLIGHT_ORACLE_CONFIG_OVERRIDE
    if (!override) {
        _loaded = DEFAULT_CONFIG
        return _loaded
    }

    try {
        const parsed = JSON.parse(override) as Partial<PreflightOracleConfig>
        _loaded = {
            bess: { ...DEFAULT_CONFIG.bess, ...(parsed.bess ?? {}) },
            swro: { ...DEFAULT_CONFIG.swro, ...(parsed.swro ?? {}) },
            haps: { ...DEFAULT_CONFIG.haps, ...(parsed.haps ?? {}) },
            verticalFarm: { ...DEFAULT_CONFIG.verticalFarm, ...(parsed.verticalFarm ?? {}) },
        }
        console.info("[preflight-oracle-config] Config override applied from environment variable.")
    } catch (e) {
        console.error(
            "[preflight-oracle-config] Failed to parse PREFLIGHT_ORACLE_CONFIG_OVERRIDE — falling back to defaults:",
            e,
        )
        _loaded = DEFAULT_CONFIG
    }

    return _loaded
}

/**
 * Reset the loaded config (for testing purposes only).
 * @internal
 */
export function _resetPreflightOracleConfigForTests(): void {
    _loaded = null
}

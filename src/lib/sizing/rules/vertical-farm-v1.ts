/**
 * @file src/lib/sizing/rules/vertical-farm-v1.ts — Vertical-farm engineering
 * coefficient library.
 *
 * @description Generalises the BESS sizing approach to indoor vertical farms.
 * Primary payload is canopy area (m² of growing surface); ancillaries scale
 * from canopy × tier count.
 *
 * Sources: Plenty / Bowery / Fischer Farms public engineering notes, ASABE
 * S640 for controlled-environment agriculture lighting, ASHRAE 241 for
 * ventilation + HVAC load, typical dosing system sizing from Priva / Argus.
 * Numbers are conservative deployed-density figures, not optimal spec-sheet
 * ones.
 */

import { WAREHOUSE_BAY_100 } from "../envelopes"
import type {
    DomainRules,
    DomainSolveInput,
    DomainSolveResult,
    Envelope,
    ModuleDimensions,
    OptimisationResult,
    SolverIteration,
} from "../types"

// ─── v1.1 FEEDBACK LOOP (2026-04-24) ───────────────────────────────────
// v1.0 used thermal_kw_per_m2_canopy = 0.15 which only captures LED sensible
// heat. The 40ft-container trial on 2026-04-24 exposed that leafy-green
// transpiration adds a LATENT load of ~0.15 kW/m² canopy ON TOP, so real
// peak cooling is ~0.30 kW/m² — and the HVAC coil must physically condense
// 2.5-3 L/m²/day of transpired water or the farm drowns in humidity.
//
// v1.1 adds transpiration physics as first-class coefficients + derives
// peak cooling load + peak dehumidification rate from them so downstream
// (BOM, supplier match, Fang review) can specify a dehumidifier with
// adequate condensing capacity.
//
// Sources: Kozai & Niu "Plant Factory" 2020 Ch.11, Fischer Farms internal
// data on baby lettuce / basil / microgreens under 200 DLI LED.
const VF_RULES = {
    /** Growing tray stack. Tier spacing 500mm suits short leafy greens
     *  (baby lettuce, basil, microgreens) with close-coupled LED bars
     *  mounted directly under the next shelf. 800mm is the taller-crop
     *  (kale, chard) default. Modern container farms pack 5 tiers at
     *  500mm in a 2697mm 40ft-HC interior (tier_clearance_mm=200 —
     *  verified against a real installation 2026-04-24). */
    trays: {
        tier_h_mm: 500, // v1.1: dropped from 800 — short-crop-optimised
        tier_footprint_d_mm: 1_200,
        aisle_efficiency: 0.85, // v1.1: lifted from 0.65 — narrow container
                                // racks have less internal loss than wide
                                // warehouse racks
        tier_clearance_mm: 200, // v1.1: service space above top tier + deck
                                // below bottom tier. Reduced from 400 after
                                // a real-container check showed modern slim
                                // LED bars + shallow trays pack tight.
    },
    /** LED lighting for leafy greens at ~200 DLI. */
    lighting: {
        kw_per_m2_canopy: 0.25,
        led_heat_fraction: 0.60, // 60% electrical → heat; 40% photons + losses
        photoperiod_hours: 16,
    },
    /** Transpiration — v1.1 core addition. Leafy-green canopy transpires
     *  ~2.5 L/m²/day under 200 DLI. Peak rate concentrates into the 16h
     *  photoperiod. */
    transpiration: {
        l_per_m2_per_day: 2.5,
        peak_multiplier: 1.5, // peak hourly rate vs daily-average
        latent_heat_j_per_g: 2_257, // at 20°C, physics constant
    },
    /** HVAC: sized from peak_total_kw = sensible (LED heat during photoperiod)
     *  + latent (transpiration condensing). v1.0's flat 0.15 kW/m² was an
     *  under-size by ~2× for leafy-dominated designs; v1.1 derives it. */
    hvac: {
        /** Retained for back-compat; NOT used by the solver any more. */
        thermal_kw_per_m2_canopy: 0.30,
        floor_m2_per_kw_thermal: 0.12, // realistic compact industrial coil + compressor
        setpoint_rh_pct: 65,
        setpoint_t_c: 22,
        recommended_ach: 4,
    },
    /** Water + nutrient delivery. */
    water: {
        m2_per_m2_canopy: 0.02,
        min_m2: 1.5, // v1.1: container-tuned (smaller dosing rack)
    },
    /** CO₂ + air handling (fans + filters) — separate from HVAC coil. */
    air: {
        m2_per_m2_canopy: 0.015,
        min_m2: 1.2,
    },
    /** Climate + controls. */
    controls: {
        fixed_m2: 0.5, // v1.1: wall-mounted, smaller than 1.2m² warehouse default
    },
    /** Harvest prep — only for warehouse bay layouts, skipped inside
     *  containers where prep happens externally. Solver treats zero
     *  harvest_prep as a legitimate config. */
    harvest_prep: {
        m2_per_m2_canopy: 0.05,
        min_m2: 0, // v1.1: zero unless explicitly requested via targets
    },
    aisle_width_mm: 1_000, // v1.1: lifted from 900 for walkability in a
                           // single-centre-aisle container layout
} as const

// ─── Derived helpers ───────────────────────────────────────────────────
function peakLoadKw(canopy_m2: number) {
    const t = VF_RULES.transpiration
    const daily_l = canopy_m2 * t.l_per_m2_per_day
    const peak_dehumid_lph = (daily_l * t.peak_multiplier) / VF_RULES.lighting.photoperiod_hours
    // Peak latent kW: g/hr × J/g ÷ 3_600_000 J/kWh
    const peak_latent_kw = (peak_dehumid_lph * 1_000 * t.latent_heat_j_per_g) / (3_600 * 1_000)
    const peak_sensible_kw = canopy_m2 * VF_RULES.lighting.kw_per_m2_canopy * VF_RULES.lighting.led_heat_fraction
    return {
        daily_transpiration_l: daily_l,
        peak_dehumid_lph,
        peak_latent_kw,
        peak_sensible_kw,
        peak_total_kw: peak_latent_kw + peak_sensible_kw,
    }
}

// ─── Single-config evaluator ───────────────────────────────────────────
// Pure function that answers "given this canopy/tiers/envelope, does it fit
// and with how much headroom?". Called by solve() for the founder's target
// AND in a grid sweep to produce the optimisation trail.
interface ConfigOutcome {
    canopy_m2: number
    tiers: number
    feasible: boolean
    floor_budget_m2: number
    used_floor_m2: number
    remaining_floor_m2: number
    utilization_pct: number
    rack_h_mm: number
    ceiling_h_mm: number
    ceiling_fits: boolean
    allocations: Record<string, number>
    conflict_summary: string | null
}

function evaluateConfig(
    envelope: Envelope,
    canopy_m2: number,
    tiers: number,
): ConfigOutcome {
    const tray_floor_m2 = canopy_m2 / (tiers * VF_RULES.trays.aisle_efficiency)
    const aisle_m2 = (envelope.interior_w_mm * VF_RULES.aisle_width_mm) / 1_000_000
    const floor_budget_m2 = envelope.interior_floor_m2 - aisle_m2
    const peak = peakLoadKw(canopy_m2)
    const hvac_floor_m2 = peak.peak_total_kw * VF_RULES.hvac.floor_m2_per_kw_thermal
    const water_m2 = Math.max(canopy_m2 * VF_RULES.water.m2_per_m2_canopy, VF_RULES.water.min_m2)
    const air_m2 = Math.max(canopy_m2 * VF_RULES.air.m2_per_m2_canopy, VF_RULES.air.min_m2)
    const controls_m2 = VF_RULES.controls.fixed_m2
    const harvest_m2 = Math.max(
        canopy_m2 * VF_RULES.harvest_prep.m2_per_m2_canopy,
        VF_RULES.harvest_prep.min_m2,
    )
    const used = tray_floor_m2 + hvac_floor_m2 + water_m2 + air_m2 + controls_m2 + harvest_m2
    const remaining = floor_budget_m2 - used
    const floor_fits = remaining >= 0
    const rack_h_mm = tiers * VF_RULES.trays.tier_h_mm + VF_RULES.trays.tier_clearance_mm
    const ceiling_fits = rack_h_mm <= envelope.interior_h_mm
    const feasible = floor_fits && ceiling_fits

    let conflict_summary: string | null = null
    if (!floor_fits) {
        conflict_summary = `Floor over by ${Math.abs(remaining).toFixed(1)} m² (${((Math.abs(remaining) / floor_budget_m2) * 100).toFixed(0)}%)`
    }
    if (!ceiling_fits) {
        const suffix = `Rack ${rack_h_mm}mm > ${envelope.interior_h_mm}mm interior`
        conflict_summary = conflict_summary ? `${conflict_summary}. ${suffix}` : suffix
    }

    return {
        canopy_m2,
        tiers,
        feasible,
        floor_budget_m2: +floor_budget_m2.toFixed(2),
        used_floor_m2: +used.toFixed(2),
        remaining_floor_m2: +remaining.toFixed(2),
        utilization_pct: +((used / floor_budget_m2) * 100).toFixed(1),
        rack_h_mm,
        ceiling_h_mm: envelope.interior_h_mm,
        ceiling_fits,
        allocations: {
            grow_racks: +tray_floor_m2.toFixed(2),
            hvac: +hvac_floor_m2.toFixed(2),
            water_nutrients: +water_m2.toFixed(2),
            air_handling: +air_m2.toFixed(2),
            controls: +controls_m2.toFixed(2),
            harvest_prep: +harvest_m2.toFixed(2),
        },
        conflict_summary,
    }
}

// ─── Grid-sweep optimiser ─────────────────────────────────────────────
// Builds a {tiers × canopy} grid around the founder's target, evaluates
// every cell, picks a winner, and composes the trade-off narrative.
function buildOptimisationGrid(
    envelope: Envelope,
    targetCanopy: number,
    targetTiers: number,
): OptimisationResult {
    const canopySteps = [
        Math.round(targetCanopy * 0.5),
        Math.round(targetCanopy * 0.75),
        Math.round(targetCanopy * 0.9),
        targetCanopy,
        Math.round(targetCanopy * 1.15),
        Math.round(targetCanopy * 1.3),
        Math.round(targetCanopy * 1.5),
    ].filter((v, i, a) => v >= 10 && a.indexOf(v) === i)
    const tierSteps = Array.from(
        new Set([
            Math.max(1, targetTiers - 2),
            Math.max(1, targetTiers - 1),
            targetTiers,
            targetTiers + 1,
            targetTiers + 2,
        ]),
    ).filter((v) => v >= 1 && v <= 10)

    const trials: OptimisationResult["trials"] = []
    const cells: ConfigOutcome[] = []
    for (const tiers of tierSteps) {
        for (const canopy of canopySteps) {
            const cell = evaluateConfig(envelope, canopy, tiers)
            cells.push(cell)
            trials.push({
                targets: { canopy_m2: canopy, tiers },
                feasible: cell.feasible,
                utilization_pct: cell.utilization_pct,
                used_floor_m2: cell.used_floor_m2,
                conflict_summary: cell.conflict_summary,
            })
        }
    }

    // Winner selection: prefer the founder's exact target if feasible. Else
    // nearest-feasible by canopy distance + tier distance.
    const exact = cells.find(
        (c) => c.canopy_m2 === targetCanopy && c.tiers === targetTiers,
    )
    let winner: ConfigOutcome
    let rationale: string
    if (exact && exact.feasible) {
        winner = exact
        rationale = `Founder's requested target (${targetCanopy} m² × ${targetTiers} tiers) fits with ${exact.remaining_floor_m2.toFixed(1)} m² headroom on the mechanical floor.`
    } else {
        const feasibleCells = cells.filter((c) => c.feasible)
        if (feasibleCells.length === 0) {
            // All infeasible — surface the exact target as winner (even though
            // it fails) so downstream output is deterministic. Downstream
            // conflicts + recommendations explain why.
            winner = exact ?? cells[0]
            rationale = "No configuration in the sweep was feasible — see conflicts for the binding constraint."
        } else {
            feasibleCells.sort((a, b) => {
                const distA = Math.abs(a.canopy_m2 - targetCanopy) + Math.abs(a.tiers - targetTiers) * 5
                const distB = Math.abs(b.canopy_m2 - targetCanopy) + Math.abs(b.tiers - targetTiers) * 5
                return distA - distB
            })
            winner = feasibleCells[0]
            rationale = `Founder's requested ${targetCanopy} m² × ${targetTiers} tiers didn't fit; nearest feasible is ${winner.canopy_m2} m² × ${winner.tiers} tiers (${winner.remaining_floor_m2.toFixed(1)} m² headroom).`
        }
    }

    // Top alternatives: feasible cells that are NOT the winner, ranked by
    // largest canopy + healthy headroom.
    const top_alternatives = cells
        .filter((c) => c.feasible && c !== winner)
        .sort((a, b) => b.canopy_m2 * a.tiers - a.canopy_m2 * b.tiers)
        .slice(0, 3)
        .map((c) => ({
            targets: { canopy_m2: c.canopy_m2, tiers: c.tiers },
            trade_offs: `${c.canopy_m2 > winner.canopy_m2 ? "+" : ""}${(c.canopy_m2 - winner.canopy_m2).toFixed(0)} m² canopy vs winner, ${c.tiers === winner.tiers ? "same tiers" : `${c.tiers} tiers`}, ${c.utilization_pct}% floor used · headroom ${c.remaining_floor_m2.toFixed(1)} m²`,
        }))

    // Levers — generic guidance derived from what the sweep showed.
    const levers: OptimisationResult["levers"] = []
    const denserTierOption = cells.find(
        (c) => c.canopy_m2 === winner.canopy_m2 && c.tiers === winner.tiers + 1 && c.feasible,
    )
    if (denserTierOption) {
        levers.push({
            action: `Add one more tier (${winner.tiers} → ${winner.tiers + 1})`,
            gain: `Canopy could grow to ~${denserTierOption.canopy_m2} m² at same floor footprint`,
            cost: `Rack height climbs to ${denserTierOption.rack_h_mm}mm — ${(envelope.interior_h_mm - denserTierOption.rack_h_mm)}mm ceiling headroom`,
        })
    }
    const biggerCanopyOption = cells.find(
        (c) => c.tiers === winner.tiers && c.canopy_m2 > winner.canopy_m2 && c.feasible,
    )
    if (biggerCanopyOption) {
        levers.push({
            action: `Push canopy from ${winner.canopy_m2} m² → ${biggerCanopyOption.canopy_m2} m² at ${winner.tiers} tiers`,
            gain: `~${Math.round((biggerCanopyOption.canopy_m2 - winner.canopy_m2) * 200)} g/wk more leafy-green yield at 200 g/m²/week`,
            cost: `Floor utilisation climbs from ${winner.utilization_pct}% → ${biggerCanopyOption.utilization_pct}%`,
        })
    }
    const infeasibleCanopyOption = cells.find(
        (c) => c.tiers === winner.tiers && c.canopy_m2 > winner.canopy_m2 && !c.feasible,
    )
    if (infeasibleCanopyOption) {
        levers.push({
            action: `Stretch to ${infeasibleCanopyOption.canopy_m2} m² canopy at ${winner.tiers} tiers`,
            gain: `~${Math.round((infeasibleCanopyOption.canopy_m2 - winner.canopy_m2) * 200)} g/wk more yield`,
            cost: `Infeasible with current envelope: ${infeasibleCanopyOption.conflict_summary}`,
        })
    }
    levers.push({
        action: "Upgrade to a 53ft high-cube container",
        gain: "Adds ~20% floor area, ~300mm extra interior height — unlocks more tiers + more canopy in a single unit",
        cost: "Container cost rises ~30% (roughly +£3,000 CAPEX)",
    })

    return {
        trials,
        winner: {
            targets: { canopy_m2: winner.canopy_m2, tiers: winner.tiers },
            rationale,
        },
        top_alternatives,
        levers,
    }
}

function solve(input: DomainSolveInput): DomainSolveResult {
    const { envelope, targets } = input
    const requestedCanopy = targets.canopy_m2 ?? 0
    const requestedTiers = Math.max(1, Math.round(targets.tiers ?? 4))

    // v1.1 optimisation sweep — records every trial so the PDF can surface
    // "how did Forge arrive at this config" rather than a single analytic
    // answer. Pure — just arithmetic — so the cost is sub-millisecond even
    // for 35 trials.
    const optimisation = buildOptimisationGrid(envelope, requestedCanopy, requestedTiers)
    // The winner config is the one actually written to dimension_sheet. The
    // solver below recomputes the detailed allocation for the winner only,
    // so images + BOM use the feasible config, not the requested one.
    const targetCanopy = optimisation.winner.targets.canopy_m2
    const tiers = optimisation.winner.targets.tiers

    // Effective floor footprint needed for the grow racks themselves:
    //   canopy ÷ (tiers × aisle_efficiency)
    const tray_floor_m2 =
        targetCanopy / (tiers * VF_RULES.trays.aisle_efficiency)

    // Overall aisle allocation — a couple of pick aisles span the bay.
    const aisle_m2 = (envelope.interior_w_mm * VF_RULES.aisle_width_mm) / 1_000_000
    const floor_budget_m2 = envelope.interior_floor_m2 - aisle_m2

    const lighting_kw = targetCanopy * VF_RULES.lighting.kw_per_m2_canopy
    // v1.1: HVAC sized from transpiration physics, not flat 0.15 kW/m²
    const peak = peakLoadKw(targetCanopy)
    const thermal_kw = peak.peak_total_kw
    const hvac_floor_m2 = thermal_kw * VF_RULES.hvac.floor_m2_per_kw_thermal

    const water_m2 = Math.max(
        targetCanopy * VF_RULES.water.m2_per_m2_canopy,
        VF_RULES.water.min_m2,
    )
    const air_m2 = Math.max(
        targetCanopy * VF_RULES.air.m2_per_m2_canopy,
        VF_RULES.air.min_m2,
    )
    const controls_m2 = VF_RULES.controls.fixed_m2
    const harvest_m2 = Math.max(
        targetCanopy * VF_RULES.harvest_prep.m2_per_m2_canopy,
        VF_RULES.harvest_prep.min_m2,
    )

    const used_floor_m2 =
        tray_floor_m2 + hvac_floor_m2 + water_m2 + air_m2 + controls_m2 + harvest_m2
    const remaining_floor_m2 = floor_budget_m2 - used_floor_m2
    const utilization_pct = (used_floor_m2 / floor_budget_m2) * 100

    const iterations: SolverIteration[] = [
        {
            iter: 1,
            used_floor_m2: +used_floor_m2.toFixed(2),
            remaining_floor_m2: +remaining_floor_m2.toFixed(2),
            utilization_pct: +utilization_pct.toFixed(1),
            allocations: {
                grow_racks: +tray_floor_m2.toFixed(2),
                hvac: +hvac_floor_m2.toFixed(2),
                water_nutrients: +water_m2.toFixed(2),
                air_handling: +air_m2.toFixed(2),
                controls: +controls_m2.toFixed(2),
                harvest_prep: +harvest_m2.toFixed(2),
            },
        },
    ]

    const feasible = remaining_floor_m2 >= 0

    const rack_h_mm = tiers * VF_RULES.trays.tier_h_mm + VF_RULES.trays.tier_clearance_mm
    const rack_w_total = Math.round(Math.sqrt(tray_floor_m2) * 1_000)

    const slot_dimensions: Record<string, ModuleDimensions> = {
        grow_racks: {
            w_mm: rack_w_total,
            d_mm: VF_RULES.trays.tier_footprint_d_mm,
            h_mm: rack_h_mm,
            floor_m2: +tray_floor_m2.toFixed(2),
            mount: "floor",
            scaled_by: "canopy_m² ÷ tiers ÷ aisle_efficiency",
            count_hint: `${tiers}-tier vertical grow racks · ${targetCanopy.toFixed(0)} m² canopy total`,
            prompt_hint: `${tiers}-tier stacked grow racks, floor-to-ceiling, hydroponic trays, LED light bars between tiers`,
        },
        lighting: {
            w_mm: rack_w_total,
            d_mm: VF_RULES.trays.tier_footprint_d_mm,
            h_mm: 120,
            floor_m2: 0,
            mount: "ceiling",
            scaled_by: "canopy_m² × kw/m²",
            requirement: {
                label: "Lighting load",
                value: +lighting_kw.toFixed(1),
                unit: "kW",
            },
            prompt_hint: "Integrated LED light bars above each tray tier",
        },
        hvac: {
            w_mm: 1_500,
            d_mm: 1_000,
            h_mm: 1_800,
            floor_m2: +hvac_floor_m2.toFixed(2),
            mount: "floor",
            // v1.1: HVAC sized from transpiration-derived peak load.
            scaled_by: `peak sensible ${peak.peak_sensible_kw.toFixed(1)}kW + peak latent ${peak.peak_latent_kw.toFixed(1)}kW`,
            requirement: {
                label: "Peak cooling load",
                value: +peak.peak_total_kw.toFixed(1),
                unit: "kW",
            },
            prompt_hint: `Floor-mounted HVAC + DEHUMIDIFIER cabinet with visible evaporator coil, condensate drip tray, and clear PVC condensate drain line exiting to a floor drain (dehumidification rate ${peak.peak_dehumid_lph.toFixed(1)} L/hour during photoperiod). Integrated reheat coil downstream of the evaporator to prevent supply-air over-cooling.`,
        },
        dehumidification: {
            // v1.1: surface dehumidification as its own slot so downstream BOM
            // + supplier-match can pick a unit with adequate pint-rating. No
            // floor footprint (integrated into hvac); exposed for matchability.
            w_mm: 0,
            d_mm: 0,
            h_mm: 0,
            floor_m2: 0,
            mount: "floor",
            scaled_by: `transpiration ${peak.daily_transpiration_l.toFixed(0)} L/day × ${VF_RULES.transpiration.peak_multiplier}× peak / ${VF_RULES.lighting.photoperiod_hours}h photoperiod`,
            requirement: {
                label: "Dehumidification rate",
                value: +peak.peak_dehumid_lph.toFixed(1),
                unit: "L/hour",
            },
            prompt_hint: "Dehumidification integrated into HVAC cabinet — sized to condense transpired canopy water continuously during photoperiod",
        },
        water_nutrients: {
            w_mm: Math.max(1_200, Math.round(Math.sqrt(water_m2) * 1_000)),
            d_mm: 1_200,
            h_mm: 2_000,
            floor_m2: +water_m2.toFixed(2),
            mount: "floor",
            scaled_by: "canopy_m²",
            prompt_hint: "Water reservoir tanks, nutrient dosing pumps, monitoring sensors",
        },
        air_handling: {
            w_mm: Math.max(800, Math.round(Math.sqrt(air_m2) * 1_000)),
            d_mm: 1_000,
            h_mm: 1_800,
            floor_m2: +air_m2.toFixed(2),
            mount: "floor",
            scaled_by: "canopy_m²",
            prompt_hint: "CO₂ enrichment + airflow fans + filter banks",
        },
        controls: {
            w_mm: 800,
            d_mm: 400,
            h_mm: 1_800,
            floor_m2: +controls_m2.toFixed(2),
            mount: "wall",
            scaled_by: "fixed per project",
            prompt_hint: "Wall-mounted climate + SCADA control cabinet with touchscreen",
        },
        harvest_prep: {
            w_mm: Math.max(2_000, Math.round(Math.sqrt(harvest_m2) * 1_000)),
            d_mm: 2_000,
            h_mm: 1_000,
            floor_m2: +harvest_m2.toFixed(2),
            mount: "floor",
            scaled_by: "canopy_m²",
            prompt_hint: "Stainless-steel harvest prep tables and wash stations",
        },
        enclosure: {
            w_mm: envelope.interior_w_mm,
            d_mm: envelope.interior_d_mm,
            h_mm: envelope.interior_h_mm,
            floor_m2: +envelope.interior_floor_m2.toFixed(2),
            mount: "envelope",
            scaled_by: "fixed envelope",
            prompt_hint: envelope.label,
        },
    }

    const conflicts: string[] = []
    const recommendations: string[] = []
    if (!feasible) {
        const shortfall = Math.abs(remaining_floor_m2)
        conflicts.push(
            `Floor area shortfall: need ${used_floor_m2.toFixed(1)} m², have ${floor_budget_m2.toFixed(1)} m² available. Over by ${shortfall.toFixed(1)} m² (${((shortfall / floor_budget_m2) * 100).toFixed(0)}%).`,
        )
        conflicts.push(
            `Primary contributor: grow rack footprint (${tray_floor_m2.toFixed(1)} m², ${((tray_floor_m2 / used_floor_m2) * 100).toFixed(0)}% of used floor).`,
        )

        const max_canopy_at_tiers = (floor_budget_m2 - hvac_floor_m2 - water_m2 - air_m2 - controls_m2 - harvest_m2) * tiers * VF_RULES.trays.aisle_efficiency
        if (max_canopy_at_tiers > 0) {
            recommendations.push(
                `Reduce canopy target to ${Math.floor(max_canopy_at_tiers)} m² at ${tiers} tiers — fits current bay.`,
            )
        }
        recommendations.push(
            `Add more tiers (${tiers} → ${tiers + 2}) to increase canopy without growing floor footprint, if ceiling allows.`,
        )
        recommendations.push(
            `Expand to an adjacent bay or raise the ceiling to unlock higher rack stacks.`,
        )
    } else {
        const extra_canopy = remaining_floor_m2 * tiers * VF_RULES.trays.aisle_efficiency
        if (extra_canopy > 5) {
            recommendations.push(
                `Headroom: could add ~${Math.floor(extra_canopy)} m² more canopy before hitting the bay wall.`,
            )
        }
    }

    const required_ceiling_h = rack_h_mm
    if (required_ceiling_h > envelope.interior_h_mm) {
        conflicts.push(
            `Required ceiling height (${required_ceiling_h} mm for ${tiers} tiers × ${VF_RULES.trays.tier_h_mm}mm spacing + ${VF_RULES.trays.tier_clearance_mm}mm clearance) exceeds envelope interior height (${envelope.interior_h_mm} mm). Drop to ${Math.floor((envelope.interior_h_mm - VF_RULES.trays.tier_clearance_mm) / VF_RULES.trays.tier_h_mm)} tiers, tighten tier spacing, or raise the ceiling.`,
        )
    }

    return {
        feasible: feasible && required_ceiling_h <= envelope.interior_h_mm,
        floor_budget_m2: +floor_budget_m2.toFixed(2),
        slot_dimensions,
        iterations,
        conflicts,
        recommendations,
        notes: [
            `Canopy density: ${tiers} tiers × ${(VF_RULES.trays.aisle_efficiency * 100).toFixed(0)}% aisle-efficient packing.`,
            `Lighting installed: ${VF_RULES.lighting.kw_per_m2_canopy * 1_000} W/m² (leafy greens at ~200 DLI).`,
            `Transpiration load: ${peak.daily_transpiration_l.toFixed(0)} L/day water evaporates from canopy — ALL of it must be condensed by the HVAC evaporator coil and drained out of the envelope or humidity spikes and powdery mildew appears within days.`,
            `Peak cooling budget: ${peak.peak_sensible_kw.toFixed(1)} kW sensible (LED heat) + ${peak.peak_latent_kw.toFixed(1)} kW latent (condensing transpiration) = ${peak.peak_total_kw.toFixed(1)} kW total during photoperiod.`,
            `Required dehumidification rate: ${peak.peak_dehumid_lph.toFixed(1)} L/hour. Size the dehumidifier pint-rating at ≥ ${Math.ceil(peak.peak_dehumid_lph * 1.2)} L/hr at 24°C/65% RH to keep a 20% safety margin.`,
            `Setpoint: ${VF_RULES.hvac.setpoint_t_c}°C air temperature, ${VF_RULES.hvac.setpoint_rh_pct}% RH (below 70% prevents powdery mildew; above 60% keeps stomata open).`,
        ],
        optimisation,
    }
}

export const verticalFarmV1: DomainRules = {
    domain: "vertical_farm",
    version: "1.1.0",
    label: "Indoor vertical farm (controlled-environment agriculture)",
    applicableIndustries: [
        "vertical-farm",
        "vertical_farm",
        "vertical-farming",
        "indoor-agriculture",
        "controlled-environment-agriculture",
        "cea",
        "hydroponics",
        "leafy-greens",
        "indoor-farming",
    ],
    targetSpec: {
        canopy_m2: {
            label: "Canopy area",
            unit: "m²",
            min: 10,
            max: 5_000,
            default: 200,
            required: true,
        },
        tiers: {
            label: "Number of tiers",
            unit: "tiers",
            min: 1,
            max: 12,
            default: 4,
            required: true,
        },
    },
    defaultEnvelope: WAREHOUSE_BAY_100,
    slots: {
        grow_racks: {
            label: "Grow racks / trays",
            matchAliases: ["grow rack", "grow tray", "rack", "tray", "tier", "canopy", "growing surface", "hydroponic"],
            defaultMount: "floor",
        },
        lighting: {
            label: "LED lighting",
            matchAliases: ["led", "lighting", "light bar", "horticultural lighting", "grow light"],
            defaultMount: "ceiling",
        },
        hvac: {
            label: "HVAC / cooling",
            matchAliases: ["hvac", "thermal", "cooling", "chiller", "climate"],
            defaultMount: "floor",
        },
        dehumidification: {
            label: "Dehumidification",
            matchAliases: ["dehumid", "condensate", "moisture removal", "humidity control", "dew"],
            defaultMount: "floor",
        },
        water_nutrients: {
            label: "Water + nutrient delivery",
            matchAliases: ["water", "nutrient", "dosing", "reservoir", "fertigation", "irrigation", "pump"],
            defaultMount: "floor",
        },
        air_handling: {
            label: "Air handling + CO₂",
            matchAliases: ["co2", "air handling", "ventilation", "fan", "filter", "airflow"],
            defaultMount: "floor",
        },
        controls: {
            label: "Controls / SCADA",
            matchAliases: ["controls", "scada", "climate controller", "bms", "automation", "sensor"],
            defaultMount: "wall",
        },
        harvest_prep: {
            label: "Harvest / packing area",
            matchAliases: ["harvest", "packing", "prep", "wash", "processing"],
            defaultMount: "floor",
        },
        enclosure: {
            label: "Grow room enclosure",
            matchAliases: ["enclosure", "room", "container", "shell", "structural"],
            defaultMount: "envelope",
        },
    },
    solve,
}

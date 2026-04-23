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
import type { DomainRules, DomainSolveInput, DomainSolveResult, ModuleDimensions, SolverIteration } from "../types"

const VF_RULES = {
    /** Growing tray stack — floor area → canopy area at N tiers.
     *  Canopy-to-floor ratio = tiers × aisle_efficiency.  */
    trays: {
        tier_h_mm: 800, // vertical spacing per tier
        tier_footprint_d_mm: 1_200, // typical tray depth
        aisle_efficiency: 0.65, // usable canopy after aisles + service gaps
    },
    /** LED lighting power density for leafy greens (µmol/m²/s @ ~200 DLI). */
    lighting: {
        kw_per_m2_canopy: 0.25, // 250 W/m² installed
        fixture_m2_per_m2_canopy: 0.1, // ceiling-mounted, negligible floor
    },
    /** HVAC: vertical farms are dehumidification-dominated. */
    hvac: {
        thermal_kw_per_m2_canopy: 0.15, // sensible + latent
        floor_m2_per_kw_thermal: 0.08,
    },
    /** Water + nutrient delivery — scales with canopy. */
    water: {
        m2_per_m2_canopy: 0.02, // reservoir + pumps + dosers
        min_m2: 2.0,
    },
    /** CO₂ + air handling + fans (separate from HVAC chillers). */
    air: {
        m2_per_m2_canopy: 0.01,
        min_m2: 1.0,
    },
    /** Climate + controls SCADA cabinet. */
    controls: {
        fixed_m2: 1.2,
    },
    /** Sanitation / harvest prep area — regulatory + workflow. */
    harvest_prep: {
        m2_per_m2_canopy: 0.05,
        min_m2: 4.0,
    },
    aisle_width_mm: 900,
} as const

function solve(input: DomainSolveInput): DomainSolveResult {
    const { envelope, targets } = input
    const targetCanopy = targets.canopy_m2 ?? 0
    const tiers = Math.max(1, Math.round(targets.tiers ?? 4))

    // Effective floor footprint needed for the grow racks themselves:
    //   canopy ÷ (tiers × aisle_efficiency)
    const tray_floor_m2 =
        targetCanopy / (tiers * VF_RULES.trays.aisle_efficiency)

    // Overall aisle allocation — a couple of pick aisles span the bay.
    const aisle_m2 = (envelope.interior_w_mm * VF_RULES.aisle_width_mm * 2) / 1_000_000
    const floor_budget_m2 = envelope.interior_floor_m2 - aisle_m2

    const lighting_kw = targetCanopy * VF_RULES.lighting.kw_per_m2_canopy
    const thermal_kw = targetCanopy * VF_RULES.hvac.thermal_kw_per_m2_canopy
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

    const rack_h_mm = tiers * VF_RULES.trays.tier_h_mm + 400
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
            w_mm: 3_000,
            d_mm: 1_200,
            h_mm: 600,
            floor_m2: +hvac_floor_m2.toFixed(2),
            mount: "floor",
            scaled_by: "canopy_m² × thermal_kw/m²",
            requirement: {
                label: "Thermal + dehumidification",
                value: +thermal_kw.toFixed(1),
                unit: "kW",
            },
            prompt_hint: "Industrial HVAC + dehumidifier unit with ducting to grow area",
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

    const required_ceiling_h = rack_h_mm + 400
    if (required_ceiling_h > envelope.interior_h_mm) {
        conflicts.push(
            `Required ceiling height (${required_ceiling_h} mm for ${tiers} tiers + light clearance) exceeds envelope interior height (${envelope.interior_h_mm} mm). Drop to ${Math.floor((envelope.interior_h_mm - 400) / VF_RULES.trays.tier_h_mm)} tiers or raise the ceiling.`,
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
            `Lighting installed: ${VF_RULES.lighting.kw_per_m2_canopy * 1000} W/m² (leafy greens at ~200 DLI).`,
        ],
    }
}

export const verticalFarmV1: DomainRules = {
    domain: "vertical_farm",
    version: "1.0.0",
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
            label: "HVAC / dehumidification",
            matchAliases: ["hvac", "thermal", "cooling", "dehumid", "chiller", "climate"],
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

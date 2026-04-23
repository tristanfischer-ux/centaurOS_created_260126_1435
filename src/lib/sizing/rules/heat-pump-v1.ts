/**
 * @file src/lib/sizing/rules/heat-pump-v1.ts — Heat-pump engineering
 * coefficient library.
 *
 * @description Sizes an outdoor heat-pump cabinet for residential +
 * small-commercial installations. Primary target is thermal output (kW);
 * everything else scales off that via coefficient of performance (COP) and
 * refrigerant cycle physics.
 *
 * Sources: Mitsubishi Ecodan / Daikin Altherma / Vaillant aroTHERM product
 * data sheets, ISO 14511 / EN 14825 performance standards, IEC 60335-2-40
 * for safety distances + refrigerant charge limits.
 */

import { HEATPUMP_CABINET } from "../envelopes"
import type { DomainRules, DomainSolveInput, DomainSolveResult, ModuleDimensions, SolverIteration } from "../types"

const HP_RULES = {
    compressor: {
        m2_per_kw_thermal: 0.015,
        min_m2: 0.1,
        h_mm: 500,
        d_mm: 500,
    },
    heat_exchanger_outdoor: {
        /** Outdoor coil scales linearly with thermal output. */
        m2_per_kw_thermal: 0.04,
        min_m2: 0.3,
        h_mm: 1_400,
        d_mm: 200,
    },
    heat_exchanger_indoor: {
        /** Indoor plate heat-exchanger — much smaller. */
        m2_per_kw_thermal: 0.005,
        min_m2: 0.05,
        h_mm: 600,
        d_mm: 200,
    },
    fan: {
        /** Single axial fan per outdoor unit, ceiling-mounted inside cabinet. */
        m2_per_kw_thermal: 0.01,
        min_m2: 0.15,
        h_mm: 250,
    },
    controls: {
        fixed_m2: 0.1,
        h_mm: 400,
        d_mm: 150,
    },
    /** Refrigerant charge per kW thermal (R290 propane, charge-limited). */
    refrigerant: {
        kg_per_kw_thermal: 0.12,
    },
    /** Typical COP at design point. Used only for electrical sizing notes. */
    cop_design: 3.2,
    aisle_width_mm: 100, // minimal inside an outdoor cabinet
} as const

function solve(input: DomainSolveInput): DomainSolveResult {
    const { envelope, targets } = input
    const targetKwThermal = targets.kw_thermal ?? 0

    const aisle_m2 = (envelope.interior_w_mm * HP_RULES.aisle_width_mm) / 1_000_000
    const floor_budget_m2 = envelope.interior_floor_m2 - aisle_m2

    const compressor_m2 = Math.max(
        targetKwThermal * HP_RULES.compressor.m2_per_kw_thermal,
        HP_RULES.compressor.min_m2,
    )
    const hx_outdoor_m2 = Math.max(
        targetKwThermal * HP_RULES.heat_exchanger_outdoor.m2_per_kw_thermal,
        HP_RULES.heat_exchanger_outdoor.min_m2,
    )
    const hx_indoor_m2 = Math.max(
        targetKwThermal * HP_RULES.heat_exchanger_indoor.m2_per_kw_thermal,
        HP_RULES.heat_exchanger_indoor.min_m2,
    )
    const fan_m2 = Math.max(
        targetKwThermal * HP_RULES.fan.m2_per_kw_thermal,
        HP_RULES.fan.min_m2,
    )
    const controls_m2 = HP_RULES.controls.fixed_m2

    const used_floor_m2 =
        compressor_m2 + hx_outdoor_m2 + hx_indoor_m2 + fan_m2 + controls_m2
    const remaining_floor_m2 = floor_budget_m2 - used_floor_m2
    const utilization_pct = (used_floor_m2 / floor_budget_m2) * 100

    const refrigerant_kg = targetKwThermal * HP_RULES.refrigerant.kg_per_kw_thermal
    const electrical_kw = targetKwThermal / HP_RULES.cop_design

    const iterations: SolverIteration[] = [
        {
            iter: 1,
            used_floor_m2: +used_floor_m2.toFixed(3),
            remaining_floor_m2: +remaining_floor_m2.toFixed(3),
            utilization_pct: +utilization_pct.toFixed(1),
            allocations: {
                compressor: +compressor_m2.toFixed(3),
                heat_exchanger_outdoor: +hx_outdoor_m2.toFixed(3),
                heat_exchanger_indoor: +hx_indoor_m2.toFixed(3),
                fan: +fan_m2.toFixed(3),
                controls: +controls_m2.toFixed(3),
            },
        },
    ]

    const feasible = remaining_floor_m2 >= 0

    const slot_dimensions: Record<string, ModuleDimensions> = {
        compressor: {
            w_mm: Math.max(400, Math.round((compressor_m2 / (HP_RULES.compressor.d_mm / 1000)) * 1000)),
            d_mm: HP_RULES.compressor.d_mm,
            h_mm: HP_RULES.compressor.h_mm,
            floor_m2: +compressor_m2.toFixed(3),
            mount: "floor",
            scaled_by: "kW_thermal",
            prompt_hint: "Rotary scroll compressor with rubber isolators, floor-mounted inside cabinet",
        },
        heat_exchanger_outdoor: {
            w_mm: Math.max(800, Math.round((hx_outdoor_m2 / (HP_RULES.heat_exchanger_outdoor.d_mm / 1000)) * 1000)),
            d_mm: HP_RULES.heat_exchanger_outdoor.d_mm,
            h_mm: HP_RULES.heat_exchanger_outdoor.h_mm,
            floor_m2: +hx_outdoor_m2.toFixed(3),
            mount: "floor",
            scaled_by: "kW_thermal",
            prompt_hint: "Outdoor finned-tube heat exchanger coil behind front grille",
        },
        heat_exchanger_indoor: {
            w_mm: 400,
            d_mm: HP_RULES.heat_exchanger_indoor.d_mm,
            h_mm: HP_RULES.heat_exchanger_indoor.h_mm,
            floor_m2: +hx_indoor_m2.toFixed(3),
            mount: "floor",
            scaled_by: "kW_thermal",
            prompt_hint: "Compact plate heat exchanger for water side",
        },
        fan: {
            w_mm: 600,
            d_mm: 600,
            h_mm: HP_RULES.fan.h_mm,
            floor_m2: 0,
            mount: "ceiling",
            scaled_by: "kW_thermal",
            prompt_hint: "Axial fan assembly on cabinet top, protective grille",
        },
        controls: {
            w_mm: 300,
            d_mm: HP_RULES.controls.d_mm,
            h_mm: HP_RULES.controls.h_mm,
            floor_m2: +controls_m2.toFixed(3),
            mount: "wall",
            scaled_by: "fixed per project",
            prompt_hint: "Inverter / controller board with safety relays",
        },
        cabinet_shell: {
            w_mm: envelope.interior_w_mm,
            d_mm: envelope.interior_d_mm,
            h_mm: envelope.interior_h_mm,
            floor_m2: +envelope.interior_floor_m2.toFixed(3),
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
            `Cabinet floor shortfall: need ${used_floor_m2.toFixed(2)} m², have ${floor_budget_m2.toFixed(2)} m² available. Over by ${shortfall.toFixed(2)} m².`,
        )
        conflicts.push(
            `Primary contributor: outdoor heat exchanger (${hx_outdoor_m2.toFixed(2)} m², ${((hx_outdoor_m2 / used_floor_m2) * 100).toFixed(0)}% of used floor).`,
        )
        recommendations.push(
            `Reduce thermal target to ${Math.floor((floor_budget_m2 - HP_RULES.compressor.min_m2 - HP_RULES.heat_exchanger_indoor.min_m2 - HP_RULES.fan.min_m2 - HP_RULES.controls.fixed_m2) / HP_RULES.heat_exchanger_outdoor.m2_per_kw_thermal)} kW thermal.`,
        )
        recommendations.push(
            `Upgrade to a larger outdoor cabinet (commercial split 1.5 × 1.5 × 2.0m).`,
        )
        recommendations.push(
            `Switch to cascade / split architecture — indoor coil separated from outdoor cabinet.`,
        )
    }

    if (refrigerant_kg > 1.5) {
        conflicts.push(
            `Refrigerant charge ${refrigerant_kg.toFixed(2)} kg (R290) — may exceed IEC 60335-2-40 single-cabinet limit of ~1.5 kg for residential. Consider cascade split or A1/A2L refrigerant instead.`,
        )
    }

    return {
        feasible: feasible && refrigerant_kg <= 3.0,
        floor_budget_m2: +floor_budget_m2.toFixed(3),
        slot_dimensions,
        iterations,
        conflicts,
        recommendations,
        notes: [
            `Design COP assumed: ${HP_RULES.cop_design} — electrical input estimated at ${electrical_kw.toFixed(1)} kW.`,
            `Refrigerant charge (R290): ${refrigerant_kg.toFixed(2)} kg.`,
        ],
    }
}

export const heatPumpV1: DomainRules = {
    domain: "heat_pump",
    version: "1.0.0",
    label: "Outdoor heat pump (residential + small-commercial)",
    applicableIndustries: [
        "heat-pump",
        "heat_pump",
        "air-source-heat-pump",
        "ashp",
        "heatpump",
        "hvac-heat-pump",
        "low-carbon-heating",
    ],
    targetSpec: {
        kw_thermal: {
            label: "Thermal output",
            unit: "kW",
            min: 2,
            max: 50,
            default: 8,
            required: true,
        },
    },
    defaultEnvelope: HEATPUMP_CABINET,
    slots: {
        compressor: {
            label: "Compressor",
            matchAliases: ["compressor", "rotary", "scroll"],
            defaultMount: "floor",
        },
        heat_exchanger_outdoor: {
            label: "Outdoor heat exchanger",
            matchAliases: ["outdoor heat exchanger", "outdoor coil", "evaporator", "finned coil", "outdoor hx"],
            defaultMount: "floor",
        },
        heat_exchanger_indoor: {
            label: "Indoor heat exchanger",
            matchAliases: ["indoor heat exchanger", "plate heat exchanger", "condenser", "indoor hx", "water side"],
            defaultMount: "floor",
        },
        fan: {
            label: "Fan assembly",
            matchAliases: ["fan", "blower", "airflow"],
            defaultMount: "ceiling",
        },
        controls: {
            label: "Inverter / controls",
            matchAliases: ["controls", "inverter", "controller", "board", "pcb"],
            defaultMount: "wall",
        },
        cabinet_shell: {
            label: "Cabinet shell",
            matchAliases: ["cabinet", "shell", "enclosure", "housing"],
            defaultMount: "envelope",
        },
    },
    solve,
}

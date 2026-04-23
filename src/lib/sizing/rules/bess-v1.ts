/**
 * @file src/lib/sizing/rules/bess-v1.ts — BESS (battery energy storage)
 * engineering coefficient library.
 *
 * @description Ported from the /tmp/bess-sizing-engine.mjs prototype (which
 * Tristan validated on 5 configurations 500 → 3000 kWh). Sources: CATL
 * EnerD / Sungrow / Wärtsilä public data sheets, NFPA 855 fire-suppression
 * agent mass, IEEE 1547, DNV-RP-0043. Values are deliberately conservative
 * so a founder sees achievable sizing, not idealised marketing density.
 *
 * @see /tmp/bess-sizing-engine.mjs — prototype with trial results
 * @see src/lib/sizing/types.ts — DomainRules contract
 */

import { CONTAINER_40FT_ISO } from "../envelopes"
import type { DomainRules, DomainSolveInput, DomainSolveResult, ModuleDimensions, SolverIteration } from "../types"

const BESS_RULES = {
    battery: {
        kwh_per_m2_floor: 100,
        typical_rack_kwh: 232,
        typical_rack_w_mm: 1_200,
        typical_rack_d_mm: 1_200,
        typical_rack_h_mm: 2_200,
    },
    pcs: {
        m2_per_kw: 0.005,
        min_m2: 0.5,
        h_mm: 2_200,
        d_mm: 800,
    },
    dc_dist: {
        m2_per_kwh: 0.001,
        min_m2: 0.4,
        h_mm: 2_000,
        d_mm: 600,
    },
    ac_switchgear: {
        m2_per_kw: 0.005,
        min_m2: 0.7,
        h_mm: 2_100,
        d_mm: 700,
    },
    hvac: {
        thermal_kw_per_battery_kwh_at_1C: 0.015,
        ceiling_m2_per_kw_thermal: 0.2,
        h_mm: 500,
    },
    fire: {
        agent_kg_per_kwh: 0.04,
        h_mm: 300,
    },
    scada: {
        h_mm: 1_800,
        d_mm: 300,
    },
    aisle_width_mm: 600,
} as const

function solve(input: DomainSolveInput): DomainSolveResult {
    const { envelope, targets } = input
    const targetKwh = targets.kwh ?? 0
    const targetKw = targets.kw ?? 0

    const aisle_m2 = (envelope.interior_w_mm * BESS_RULES.aisle_width_mm) / 1_000_000
    const floor_budget_m2 = envelope.interior_floor_m2 - aisle_m2

    // Iteration 1 — analytic allocation (BESS converges in one pass).
    const battery_m2 = targetKwh / BESS_RULES.battery.kwh_per_m2_floor
    const pcs_m2 = Math.max(targetKw * BESS_RULES.pcs.m2_per_kw, BESS_RULES.pcs.min_m2)
    const dc_m2 = Math.max(targetKwh * BESS_RULES.dc_dist.m2_per_kwh, BESS_RULES.dc_dist.min_m2)
    const ac_m2 = Math.max(targetKw * BESS_RULES.ac_switchgear.m2_per_kw, BESS_RULES.ac_switchgear.min_m2)

    const used_floor_m2 = battery_m2 + pcs_m2 + dc_m2 + ac_m2
    const remaining_floor_m2 = floor_budget_m2 - used_floor_m2
    const utilization_pct = (used_floor_m2 / floor_budget_m2) * 100

    const thermal_kw_needed = targetKwh * BESS_RULES.hvac.thermal_kw_per_battery_kwh_at_1C
    const fire_agent_kg = targetKwh * BESS_RULES.fire.agent_kg_per_kwh

    const rack_count = Math.ceil(targetKwh / BESS_RULES.battery.typical_rack_kwh)
    const rack_w_total = rack_count * BESS_RULES.battery.typical_rack_w_mm

    const iterations: SolverIteration[] = [
        {
            iter: 1,
            used_floor_m2: +used_floor_m2.toFixed(2),
            remaining_floor_m2: +remaining_floor_m2.toFixed(2),
            utilization_pct: +utilization_pct.toFixed(1),
            allocations: {
                battery_racks: +battery_m2.toFixed(2),
                pcs_inverter: +pcs_m2.toFixed(2),
                dc_distribution: +dc_m2.toFixed(2),
                ac_switchgear: +ac_m2.toFixed(2),
            },
        },
    ]

    const feasible = remaining_floor_m2 >= 0

    const slot_dimensions: Record<string, ModuleDimensions> = {
        battery_racks: {
            w_mm: rack_w_total,
            d_mm: BESS_RULES.battery.typical_rack_d_mm,
            h_mm: BESS_RULES.battery.typical_rack_h_mm,
            floor_m2: +battery_m2.toFixed(2),
            mount: "floor",
            scaled_by: "target_kWh",
            count_hint: `${rack_count} × ${BESS_RULES.battery.typical_rack_kwh} kWh racks side-by-side`,
            prompt_hint: `${rack_count} LFP battery racks side-by-side, floor-mounted, each rack ~${BESS_RULES.battery.typical_rack_w_mm}×${BESS_RULES.battery.typical_rack_d_mm}×${BESS_RULES.battery.typical_rack_h_mm}mm`,
        },
        pcs_inverter: {
            w_mm: Math.max(600, Math.round((pcs_m2 / (BESS_RULES.pcs.d_mm / 1000)) * 1000)),
            d_mm: BESS_RULES.pcs.d_mm,
            h_mm: BESS_RULES.pcs.h_mm,
            floor_m2: +pcs_m2.toFixed(2),
            mount: "floor",
            scaled_by: "target_kW",
            prompt_hint: "Floor-mounted PCS inverter cabinet, grey metal, air-vent grilles",
        },
        dc_distribution: {
            w_mm: Math.max(500, Math.round((dc_m2 / (BESS_RULES.dc_dist.d_mm / 1000)) * 1000)),
            d_mm: BESS_RULES.dc_dist.d_mm,
            h_mm: BESS_RULES.dc_dist.h_mm,
            floor_m2: +dc_m2.toFixed(2),
            mount: "floor",
            scaled_by: "target_kWh",
            prompt_hint: "Floor-mounted DC distribution cabinet with combiner, bus bars visible inside",
        },
        ac_switchgear: {
            w_mm: Math.max(700, Math.round((ac_m2 / (BESS_RULES.ac_switchgear.d_mm / 1000)) * 1000)),
            d_mm: BESS_RULES.ac_switchgear.d_mm,
            h_mm: BESS_RULES.ac_switchgear.h_mm,
            floor_m2: +ac_m2.toFixed(2),
            mount: "floor",
            scaled_by: "target_kW",
            prompt_hint: "Floor-mounted AC switchgear cabinet, breakers and metering",
        },
        hvac: {
            w_mm: 2_500,
            d_mm: 600,
            h_mm: BESS_RULES.hvac.h_mm,
            floor_m2: 0,
            mount: "ceiling",
            scaled_by: "target_kWh × C-rate",
            requirement: {
                label: "Thermal duty",
                value: +thermal_kw_needed.toFixed(1),
                unit: "kW",
            },
            prompt_hint: "Ceiling-mounted HVAC air handler, supply + return ducts visible",
        },
        fire_suppression: {
            w_mm: 500,
            d_mm: 400,
            h_mm: BESS_RULES.fire.h_mm,
            floor_m2: 0,
            mount: "ceiling",
            scaled_by: "target_kWh (NFPA 855)",
            requirement: {
                label: "Agent mass",
                value: +fire_agent_kg.toFixed(1),
                unit: "kg",
            },
            prompt_hint: "Ceiling-mounted fire suppression panel with small agent cylinder and nozzle",
        },
        scada_controls: {
            w_mm: 600,
            d_mm: BESS_RULES.scada.d_mm,
            h_mm: BESS_RULES.scada.h_mm,
            floor_m2: 0,
            mount: "wall",
            scaled_by: "fixed per project",
            prompt_hint: "Wall-mounted SCADA / controls enclosure with HMI touchscreen",
        },
        container_shell: {
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
            `Primary contributor: battery rack allocation (${battery_m2.toFixed(1)} m², ${((battery_m2 / used_floor_m2) * 100).toFixed(0)}% of used floor).`,
        )

        const max_kwh_at_current_kw = (floor_budget_m2 - pcs_m2 - dc_m2 - ac_m2) * BESS_RULES.battery.kwh_per_m2_floor
        if (max_kwh_at_current_kw > 0) {
            recommendations.push(
                `Reduce target to ${Math.floor(max_kwh_at_current_kw)} kWh at current ${targetKw} kW power rating — fits 40ft with ~0% margin.`,
            )
        }

        const max_kw_at_current_kwh =
            (floor_budget_m2 - battery_m2 - dc_m2) /
            (BESS_RULES.pcs.m2_per_kw + BESS_RULES.ac_switchgear.m2_per_kw)
        if (max_kw_at_current_kwh > 0 && max_kw_at_current_kwh < targetKw) {
            recommendations.push(
                `Keep ${targetKwh} kWh but drop power to ${Math.floor(max_kw_at_current_kwh)} kW — fits 40ft.`,
            )
        }

        recommendations.push(
            `Upgrade to 2×40ft containers in parallel (batteries in one, ancillaries shared or duplicated).`,
        )
        recommendations.push(
            `Use 53ft high-cube container — adds ~20% floor area, roughly +6 m² usable after aisle.`,
        )
        if (targetKwh > 1_500) {
            recommendations.push(
                `Consider 20ft high-density modules stacked 2-high inside the container to double battery floor efficiency.`,
            )
        }
    } else {
        const extra_kwh_at_current_kw = remaining_floor_m2 * BESS_RULES.battery.kwh_per_m2_floor
        if (extra_kwh_at_current_kw > 20) {
            recommendations.push(
                `Headroom: could add ~${Math.floor(extra_kwh_at_current_kw)} kWh more capacity before hitting the container wall.`,
            )
        }
    }

    return {
        feasible,
        floor_budget_m2: +floor_budget_m2.toFixed(2),
        slot_dimensions,
        iterations,
        conflicts,
        recommendations,
        notes: [
            `Battery density coefficient: ${BESS_RULES.battery.kwh_per_m2_floor} kWh/m² — conservative LFP rack density with cable trays + 600mm service aisle.`,
            `Fire agent mass per NFPA 855: ${BESS_RULES.fire.agent_kg_per_kwh} kg/kWh.`,
        ],
    }
}

export const bessV1: DomainRules = {
    domain: "battery_energy_storage",
    version: "1.0.0",
    label: "Containerised BESS (battery energy storage)",
    applicableIndustries: [
        "battery-energy-storage",
        "battery_energy_storage",
        "bess",
        "energy-storage",
        "grid-storage",
        "stationary-storage",
        "containerised-battery",
    ],
    targetSpec: {
        kwh: {
            label: "Capacity",
            unit: "kWh",
            min: 50,
            max: 10_000,
            default: 500,
            required: true,
        },
        kw: {
            label: "Power rating",
            unit: "kW",
            min: 10,
            max: 5_000,
            default: 100,
            required: true,
        },
    },
    defaultEnvelope: CONTAINER_40FT_ISO,
    slots: {
        battery_racks: {
            label: "Battery racks",
            matchAliases: ["battery rack", "battery pack", "battery subsystem", "lfp", "battery modules", "energy storage", "cell module"],
            defaultMount: "floor",
        },
        pcs_inverter: {
            label: "PCS / inverter",
            matchAliases: ["pcs", "inverter", "power conversion", "bidirectional", "converter"],
            defaultMount: "floor",
        },
        dc_distribution: {
            label: "DC distribution & combiner",
            matchAliases: ["dc distribution", "dc combiner", "combiner", "dc bus", "dc panel"],
            defaultMount: "floor",
        },
        ac_switchgear: {
            label: "AC switchgear",
            matchAliases: ["ac switchgear", "switchgear", "ac panel", "breaker", "transformer"],
            defaultMount: "floor",
        },
        hvac: {
            label: "HVAC / thermal management",
            matchAliases: ["hvac", "thermal", "cooling", "chiller", "air conditioning", "heat reject"],
            defaultMount: "ceiling",
        },
        fire_suppression: {
            label: "Fire suppression",
            matchAliases: ["fire suppression", "fire safety", "fire protection", "nfpa", "detection"],
            defaultMount: "ceiling",
        },
        scada_controls: {
            label: "SCADA / controls",
            matchAliases: ["scada", "controls", "bms", "battery management", "ems", "energy management", "hmi"],
            defaultMount: "wall",
        },
        container_shell: {
            label: "Container shell / enclosure",
            matchAliases: ["container", "enclosure", "shell", "structural"],
            defaultMount: "envelope",
        },
    },
    solve,
}

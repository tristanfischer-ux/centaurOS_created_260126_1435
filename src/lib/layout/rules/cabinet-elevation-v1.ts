/**
 * @file src/lib/layout/rules/cabinet-elevation-v1.ts
 *
 * @description Side-elevation layout for cabinet-shaped envelopes viewed
 * through an open door:
 *   - Heat pump outdoor unit (compressor + heat exchanger + controls)
 *   - Indoor cabinet HVAC / air handler
 *   - Small inverter cabinets (stand-alone PV + BESS under 50 kWh)
 *   - Utility cupboards / panel closets
 *
 * Placement strategy (elevation, NOT floor plan):
 *   - Heavy / vibrating equipment on the floor (compressor, tank).
 *   - Heat-exchange surfaces above (fan, coil) — they get airflow from the
 *     vents in the top panel.
 *   - Controls + electrical panel on the door side at head height.
 *
 * x-axis = along envelope width (left → right as the viewer faces the
 *   cabinet door), y-axis = up (height). z-axis is into the cabinet (depth)
 *   and unused by the elevation view.
 */

import type { CadLabModule } from "@/lib/cad-lab-types"
import type { ModuleDimensions } from "@/lib/sizing/types"
import type {
    Constraint,
    Feature,
    LayoutInput,
    LayoutOutput,
    LayoutRules,
    Placement,
} from "../types"

const EDGE_CLEARANCE_MM = 30
const PANEL_GAP_MM = 20

type MountedModule = { module: CadLabModule; dims: ModuleDimensions }

/**
 * Heuristic classification of a module for cabinet placement.
 * Returns one of: "heavy_base", "heat_exchange", "controls", "other".
 */
function classifyForCabinet(module: CadLabModule): "heavy_base" | "heat_exchange" | "controls" | "other" {
    const text = `${module.name} ${(module.keyParts ?? []).join(" ")} ${module.purpose ?? ""}`.toLowerCase()
    if (/compressor|tank|reservoir|pump|motor/.test(text)) return "heavy_base"
    if (/coil|heat exchanger|fan|condenser|evaporator|radiator/.test(text)) return "heat_exchange"
    if (/control|panel|inverter|electrical|pcb|hmi|sensor/.test(text)) return "controls"
    return "other"
}

function layoutFn(input: LayoutInput): LayoutOutput {
    const { envelope, moduleDimensions, modules } = input

    const placements: Placement[] = []
    const features: Feature[] = []
    const constraints: Constraint[] = []
    const notes: string[] = []

    const envW = envelope.interior_w_mm
    const envH = envelope.interior_h_mm

    // Sort modules into vertical zones.
    const heavy: MountedModule[] = []
    const exchange: MountedModule[] = []
    const controls: MountedModule[] = []
    const other: MountedModule[] = []
    const envelopeMods: MountedModule[] = []

    for (const m of modules) {
        const dims = moduleDimensions[m.id]
        if (!dims) continue
        if (dims.mount === "envelope") {
            envelopeMods.push({ module: m, dims })
            continue
        }
        const klass = classifyForCabinet(m)
        if (klass === "heavy_base") heavy.push({ module: m, dims })
        else if (klass === "heat_exchange") exchange.push({ module: m, dims })
        else if (klass === "controls") controls.push({ module: m, dims })
        else other.push({ module: m, dims })
    }

    // --- Heavy base (y = 0) ---
    let baseX = EDGE_CLEARANCE_MM
    const baseBandTop = heavy.reduce((max, { dims }) => Math.max(max, dims.h_mm), 0)
    heavy.forEach(({ module, dims }) => {
        placements.push({
            module_id: module.id,
            x_mm: Math.round(baseX),
            y_mm: 0,
            w_mm: Math.round(dims.w_mm),
            d_mm: Math.round(dims.d_mm),
            h_mm: Math.round(dims.h_mm),
            orientation_deg: 0,
            mount: "floor",
        })
        baseX += dims.w_mm + PANEL_GAP_MM
    })

    // --- Heat-exchange band (above heavy base) ---
    const exchangeY = baseBandTop + PANEL_GAP_MM
    let exchangeX = EDGE_CLEARANCE_MM
    const exchangeBandTop = exchange.reduce((max, { dims }) => Math.max(max, exchangeY + dims.h_mm), exchangeY)
    exchange.forEach(({ module, dims }) => {
        placements.push({
            module_id: module.id,
            x_mm: Math.round(exchangeX),
            y_mm: Math.round(exchangeY),
            w_mm: Math.round(dims.w_mm),
            d_mm: Math.round(dims.d_mm),
            h_mm: Math.round(dims.h_mm),
            orientation_deg: 0,
            mount: "floor",
        })
        exchangeX += dims.w_mm + PANEL_GAP_MM
    })

    // --- Controls (door side, head height) ---
    const controlsY = Math.min(envH - 500, Math.max(exchangeBandTop + PANEL_GAP_MM, 1_200))
    let controlsX = envW - EDGE_CLEARANCE_MM
    controls.forEach(({ module, dims }) => {
        controlsX -= dims.w_mm
        placements.push({
            module_id: module.id,
            x_mm: Math.round(controlsX),
            y_mm: Math.round(controlsY),
            w_mm: Math.round(dims.w_mm),
            d_mm: Math.round(dims.d_mm),
            h_mm: Math.round(dims.h_mm),
            orientation_deg: 0,
            mount: "wall",
        })
        controlsX -= PANEL_GAP_MM
    })

    // --- Everything else tucked into remaining space ---
    let otherX = EDGE_CLEARANCE_MM
    const otherY = Math.max(exchangeBandTop + PANEL_GAP_MM, 1_600)
    other.forEach(({ module, dims }) => {
        placements.push({
            module_id: module.id,
            x_mm: Math.round(otherX),
            y_mm: Math.round(otherY),
            w_mm: Math.round(dims.w_mm),
            d_mm: Math.round(dims.d_mm),
            h_mm: Math.round(dims.h_mm),
            orientation_deg: 0,
            mount: "wall",
        })
        otherX += dims.w_mm + PANEL_GAP_MM
    })

    // --- Envelope (cabinet shell outline) ---
    envelopeMods.forEach(({ module, dims }) => {
        placements.push({
            module_id: module.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: Math.round(dims.w_mm),
            d_mm: Math.round(dims.d_mm),
            h_mm: Math.round(dims.h_mm),
            orientation_deg: 0,
            mount: "envelope",
        })
    })

    // --- Features ---
    // Access panel on the front face, full width, head height.
    features.push({
        kind: "access_panel",
        geometry: "rect",
        coords: [EDGE_CLEARANCE_MM, envH - 1_100, envW - EDGE_CLEARANCE_MM * 2, 1_000],
        label: "Front access panel (removable service cover)",
    })

    // Vents along the top panel for heat rejection.
    if (exchange.length > 0) {
        features.push({
            kind: "vent",
            geometry: "rect",
            coords: [EDGE_CLEARANCE_MM + 100, envH - 200, envW - EDGE_CLEARANCE_MM * 2 - 200, 120],
            label: "Top vent grille (heat rejection)",
        })
    }

    // Base drip tray (for heat pump / HVAC cabinets — catches condensate).
    features.push({
        kind: "pipe_run",
        geometry: "line",
        coords: [EDGE_CLEARANCE_MM, 0, envW - EDGE_CLEARANCE_MM, 0],
        width_mm: 80,
        label: "Condensate drip tray",
    })

    // --- Constraints ---
    if (heavy.length > 0 && controls.length > 0) {
        constraints.push({
            kind: "separation",
            a: heavy[0].module.id,
            b: controls[0].module.id,
            min_mm: 200,
            reason: "Keep vibrating compressor away from controls PCB — reduces solder-joint fatigue.",
        })
    }

    notes.push(
        `Cabinet elevation: ${envW}mm W × ${envH}mm H interior. Heavy modules on floor, heat-exchange above, controls at head height on the door side.`,
    )
    notes.push(
        `${heavy.length} heavy / ${exchange.length} heat-exchange / ${controls.length} control modules laid out. ${other.length} fallback placements.`,
    )

    return { placements, features, constraints, notes }
}

export const cabinetElevationV1: LayoutRules = {
    domain: "cabinet_elevation",
    version: "1.0.0",
    label: "Cabinet — side elevation (heat pump / HVAC / small inverter)",
    applicableIndustries: [
        "heat-pump",
        "heat_pump",
        "heatpump",
        "hvac",
        "hvac-outdoor",
        "hvac-indoor",
        "air-source-heat-pump",
        "ashp",
        "ground-source-heat-pump",
        "gshp",
        "cabinet-inverter",
        "small-inverter",
        "residential-pv",
        "utility-cupboard",
    ],
    plan_type: "elevation",
    view: "side_elevation",
    layoutFn,
}

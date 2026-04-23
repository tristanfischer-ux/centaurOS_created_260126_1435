/**
 * @file src/lib/layout/rules/stack-v1.ts
 *
 * @description Exploded-stack layout for modular stacked products:
 *   - CubeSat (1U–12U) — payload stacks along the z-axis
 *   - PCBA stack-up (motherboard + daughterboards)
 *   - Rack-unit stack (1U server, 2U storage, ...)
 *   - Aircraft avionics tray stack
 *
 * Placement strategy (isometric exploded view):
 *   - Modules are stacked along the z-axis (layer 1 at the bottom).
 *   - For an "exploded" view, each layer is offset by ~1.5× its own height
 *     so the viewer can see the internals.
 *   - x/y are the module's in-plane footprint (typically identical across
 *     layers for CubeSats — all 100×100 or 200×200 mm).
 *   - Layer number comes from explicit `layer` hint or inferred from module
 *     name ("1U", "2U", "payload bay 3").
 *
 * This is a 3D layout — the SVG renderer projects it onto isometric axes.
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

const EXPLODE_GAP_FACTOR = 1.5 // 1× means modules touch; higher = more spacing.

/**
 * Parse layer hint from module name. "Payload 1", "Bus 2U", "Layer 3" etc.
 * Returns undefined when no hint is present — caller picks sequential.
 */
function inferLayer(module: CadLabModule): number | undefined {
    const text = `${module.name} ${(module.keyParts ?? []).join(" ")}`.toLowerCase()
    // Match "layer N", "N U", "bay N", "tier N".
    const layerMatch = text.match(/(?:layer|bay|tier)\s+(\d+)/)
    if (layerMatch) return parseInt(layerMatch[1], 10)
    const uMatch = text.match(/\b(\d+)u\b/)
    if (uMatch) return parseInt(uMatch[1], 10)
    const numberedMatch = text.match(/\b([1-9])\b\s*(?:$|—|-|\s)/)
    if (numberedMatch) return parseInt(numberedMatch[1], 10)
    return undefined
}

/**
 * Stable stacking order so layer 1 ends up on the bottom. Uses the explicit
 * `layer` hint when present, else falls back to position in the modules
 * array (which reflects Max's decomposition order).
 */
function sortForStacking(modules: CadLabModule[], dimensions: Record<string, ModuleDimensions>): CadLabModule[] {
    const annotated = modules
        .filter((m) => dimensions[m.id])
        .map((m, idx) => ({ module: m, layer: inferLayer(m) ?? idx + 1, originalIdx: idx }))
    annotated.sort((a, b) => {
        if (a.layer !== b.layer) return a.layer - b.layer
        return a.originalIdx - b.originalIdx
    })
    return annotated.map((x) => x.module)
}

function layoutFn(input: LayoutInput): LayoutOutput {
    const { envelope, moduleDimensions, modules } = input

    const placements: Placement[] = []
    const features: Feature[] = []
    const constraints: Constraint[] = []
    const notes: string[] = []

    // Split envelope vs in-stack modules.
    const envelopeMods = modules.filter((m) => moduleDimensions[m.id]?.mount === "envelope")
    const stackMods = modules.filter((m) => moduleDimensions[m.id] && moduleDimensions[m.id].mount !== "envelope")

    const sorted = sortForStacking(stackMods, moduleDimensions)

    // Footprint — use max(w,d) across stack modules to find the stack
    // "envelope" in plan; all modules centre on this footprint.
    const maxW = sorted.reduce((mx, m) => Math.max(mx, moduleDimensions[m.id].w_mm), 0)
    const maxD = sorted.reduce((mx, m) => Math.max(mx, moduleDimensions[m.id].d_mm), 0)

    const centerX = envelope.interior_w_mm / 2
    const centerY = envelope.interior_d_mm / 2

    // --- Stack placement ---
    let zCursor = 0
    sorted.forEach((m, idx) => {
        const dims = moduleDimensions[m.id]
        const explicitLayer = inferLayer(m) ?? idx + 1
        const x = centerX - dims.w_mm / 2
        const y = centerY - dims.d_mm / 2
        placements.push({
            module_id: m.id,
            x_mm: Math.round(x),
            y_mm: Math.round(y),
            z_mm: Math.round(zCursor),
            w_mm: Math.round(dims.w_mm),
            d_mm: Math.round(dims.d_mm),
            h_mm: Math.round(dims.h_mm),
            orientation_deg: 0,
            mount: "floor",
            layer: explicitLayer,
        })
        zCursor += dims.h_mm * EXPLODE_GAP_FACTOR
    })

    // --- Envelope (structural frame outline) ---
    envelopeMods.forEach((m) => {
        const dims = moduleDimensions[m.id]
        placements.push({
            module_id: m.id,
            x_mm: 0,
            y_mm: 0,
            z_mm: 0,
            w_mm: Math.round(dims.w_mm),
            d_mm: Math.round(dims.d_mm),
            h_mm: Math.round(dims.h_mm),
            orientation_deg: 0,
            mount: "envelope",
        })
    })

    // --- Features ---
    // Structural rails (four vertical lines connecting layer corners — the
    // longeron / primary structure of the stack).
    const halfW = maxW / 2
    const halfD = maxD / 2
    const topZ = zCursor

    const railCorners: Array<[number, number]> = [
        [centerX - halfW, centerY - halfD],
        [centerX + halfW, centerY - halfD],
        [centerX - halfW, centerY + halfD],
        [centerX + halfW, centerY + halfD],
    ]
    railCorners.forEach(([rx, ry], cornerIdx) => {
        features.push({
            kind: "structural_column",
            geometry: "line",
            coords: [rx, ry, rx, ry + topZ],
            width_mm: 12,
            label: `Longeron ${cornerIdx + 1}`,
        })
    })

    // Access ports — one per layer (so integration engineers can reach each
    // module). Rendered as small circles next to the layer on the elevation.
    sorted.forEach((m, idx) => {
        const dims = moduleDimensions[m.id]
        const z = placements.find((p) => p.module_id === m.id)?.z_mm ?? 0
        features.push({
            kind: "access_panel",
            geometry: "rect",
            coords: [centerX + halfW + 20, centerY - 30, 60, 60],
            label: `Layer ${idx + 1} access — ${m.name}`,
            width_mm: Math.round(dims.h_mm / 4),
        })
        // suppress unused-variable lint; z informs future SVG overlay
        void z
    })

    // --- Constraints ---
    // Adjacency: consecutive stack layers must be directly above each other
    // (no lateral offset). Encoded so downstream validators can check.
    for (let i = 0; i < sorted.length - 1; i++) {
        constraints.push({
            kind: "adjacency",
            a: sorted[i].id,
            b: sorted[i + 1].id,
            max_mm: 0,
            reason: `Stack layer ${i + 1} → ${i + 2} must remain axially aligned (shared structural rails).`,
        })
    }

    // --- Notes ---
    notes.push(
        `Stack layout: ${sorted.length} layer${sorted.length === 1 ? "" : "s"}, footprint ${maxW}×${maxD} mm, total stacked height (pre-explode) ${zCursor.toFixed(0)}mm.`,
    )
    notes.push(`Explode factor: ${EXPLODE_GAP_FACTOR}× — gaps added between layers for exploded-view rendering.`)
    if (envelopeMods.length > 0) {
        notes.push(`Outer envelope: ${envelope.interior_w_mm}×${envelope.interior_d_mm}×${envelope.interior_h_mm} mm (${envelope.label}).`)
    }

    return { placements, features, constraints, notes }
}

export const stackV1: LayoutRules = {
    domain: "stack",
    version: "1.0.0",
    label: "Exploded stack (CubeSat / PCBA / rack)",
    applicableIndustries: [
        "cubesat",
        "smallsat",
        "nanosat",
        "pcba",
        "pcb",
        "printed-circuit-board",
        "board-stack",
        "rack-unit",
        "avionics",
        "stratospheric-platform",
        "haps",
        "high-altitude-pseudo-satellite",
        "uav-payload",
        "payload-bay",
    ],
    plan_type: "stack",
    view: "isometric_exploded",
    layoutFn,
}

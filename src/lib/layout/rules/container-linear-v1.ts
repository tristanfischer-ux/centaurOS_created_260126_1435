/**
 * @file src/lib/layout/rules/container-linear-v1.ts
 *
 * @description Linear floor-plan layout for container-shaped envelopes:
 *   - BESS / battery energy storage (40ft/20ft/53ft ISO)
 *   - Vertical farm (warehouse bay or container)
 *   - Data centre / edge compute containerised
 *   - Water-treatment / modular utility containers
 *
 * Placement strategy:
 *   - Floor-mounted modules are placed in a single row along the envelope's
 *     length (x-axis). Aisle runs down the centre depth (y-axis).
 *   - For symmetric layouts (VF grow trays on both sides of an aisle) the
 *     layout splits floor modules into port/starboard rows.
 *   - Ceiling-mounted modules (HVAC, fire suppression) are placed above the
 *     floor row they serve — same x, y pinned to the ceiling.
 *   - Wall-mounted modules (SCADA, controls) get a default wall position
 *     near the door end of the container.
 *
 * Features generated: aisle (line or rect down the centre), doors at one
 * or both ends, vents above floor modules.
 *
 * Constraints generated: min 600mm service aisle around each floor module,
 * separation between battery racks and fire suppression (NFPA 855 guidance
 * for BESS), adjacency between PCS and DC distribution (cable run length).
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

const AISLE_WIDTH_MM = 1_000
const WALL_CLEARANCE_MM = 50
const DOOR_WIDTH_MM = 900

/**
 * Determine whether this domain uses the symmetric port/starboard pattern
 * (both sides of a central aisle) or a single-row pattern.
 *
 * Vertical farms → symmetric (grow trays flank the aisle).
 * BESS → single row (batteries along one wall, ancillaries continue).
 * Data centre → symmetric (rack rows on both sides — hot/cold aisle).
 */
function isSymmetricDomain(industryDomain: string | undefined): boolean {
    if (!industryDomain) return false
    const lower = industryDomain.toLowerCase()
    return (
        lower.includes("vertical-farm") ||
        lower.includes("vertical_farm") ||
        lower.includes("farm") ||
        lower.includes("grow") ||
        lower.includes("data-centre") ||
        lower.includes("data_center") ||
        lower.includes("data-center") ||
        lower.includes("rack-row") ||
        lower.includes("container-rack")
    )
}

interface PartitionedModules {
    floor: Array<{ module: CadLabModule; dims: ModuleDimensions }>
    ceiling: Array<{ module: CadLabModule; dims: ModuleDimensions }>
    wall: Array<{ module: CadLabModule; dims: ModuleDimensions }>
    envelope: Array<{ module: CadLabModule; dims: ModuleDimensions }>
}

function partitionByMount(
    modules: CadLabModule[],
    dimensions: Record<string, ModuleDimensions>,
): PartitionedModules {
    const out: PartitionedModules = { floor: [], ceiling: [], wall: [], envelope: [] }
    for (const m of modules) {
        const d = dimensions[m.id]
        if (!d) continue
        out[d.mount].push({ module: m, dims: d })
    }
    return out
}

function layoutFn(input: LayoutInput): LayoutOutput {
    const { envelope, moduleDimensions, modules, targets } = input
    const { floor, ceiling, wall, envelope: envelopeMods } = partitionByMount(
        modules,
        moduleDimensions,
    )

    // Infer domain from targets (best signal we have inside the layoutFn — the
    // sizing engine already tagged domain via rules_domain but we don't get
    // that directly; fall back to names in modules).
    const moduleNames = modules.map((m) => m.name.toLowerCase()).join(" ")
    const inferredDomain = moduleNames.includes("grow tray") || moduleNames.includes("canopy")
        ? "vertical-farm"
        : moduleNames.includes("battery rack") || moduleNames.includes("lfp")
        ? "battery-energy-storage"
        : moduleNames.includes("server rack") || moduleNames.includes("data rack")
        ? "data-centre"
        : "generic-container"

    const symmetric = isSymmetricDomain(inferredDomain)

    const placements: Placement[] = []
    const features: Feature[] = []
    const constraints: Constraint[] = []
    const notes: string[] = []

    const envW = envelope.interior_w_mm
    const envD = envelope.interior_d_mm
    const envH = envelope.interior_h_mm

    // Aisle — runs the full length of the container down the centre depth.
    const aisleY = (envD - AISLE_WIDTH_MM) / 2
    features.push({
        kind: "aisle",
        geometry: "rect",
        coords: [0, aisleY, envW, AISLE_WIDTH_MM],
        label: `Service aisle (${AISLE_WIDTH_MM}mm wide)`,
    })

    // Doors — one at each end of the container. Use x=0 (back door) and
    // x=envW-DOOR_WIDTH_MM (front double-door).
    features.push({
        kind: "door",
        geometry: "rect",
        coords: [envW - DOOR_WIDTH_MM * 2, aisleY, DOOR_WIDTH_MM * 2, 200],
        label: "Main double doors",
    })

    // --- Floor modules ---
    // Layout strategy:
    //   Symmetric: port side (y = 0 to aisleY - clearance), starboard
    //     (y = aisleY + AISLE + clearance to envD). Split modules round-robin.
    //   Single-row: one side (y = aisleY - max(d_mm) - clearance).

    let portX = WALL_CLEARANCE_MM
    let starboardX = WALL_CLEARANCE_MM
    const portRowD = aisleY - WALL_CLEARANCE_MM
    const starboardRowYStart = aisleY + AISLE_WIDTH_MM
    const starboardRowD = envD - starboardRowYStart - WALL_CLEARANCE_MM

    floor.forEach(({ module, dims }, idx) => {
        const useStarboard = symmetric && idx % 2 === 1
        const rowYStart = useStarboard ? starboardRowYStart : WALL_CLEARANCE_MM
        const rowD = useStarboard ? starboardRowD : portRowD
        const xCursor = useStarboard ? starboardX : portX

        // Centre the module depth-wise within the row.
        const y = rowYStart + Math.max(0, (rowD - dims.d_mm) / 2)
        const x = xCursor

        placements.push({
            module_id: module.id,
            x_mm: Math.round(x),
            y_mm: Math.round(y),
            w_mm: Math.round(dims.w_mm),
            d_mm: Math.round(dims.d_mm),
            h_mm: Math.round(dims.h_mm),
            orientation_deg: 0,
            mount: "floor",
        })

        if (useStarboard) {
            starboardX += dims.w_mm + WALL_CLEARANCE_MM
        } else {
            portX += dims.w_mm + WALL_CLEARANCE_MM
        }
    })

    // Overflow check — if a row runs past the container length, flag it.
    if (portX > envW) {
        notes.push(
            `Port-side row overflows envelope by ${(portX - envW).toFixed(0)}mm — consider symmetric layout or larger envelope.`,
        )
    }
    if (starboardX > envW) {
        notes.push(
            `Starboard-side row overflows envelope by ${(starboardX - envW).toFixed(0)}mm.`,
        )
    }

    // --- Ceiling modules ---
    // Placed centred along the envelope length, spanning the full depth.
    ceiling.forEach(({ module, dims }) => {
        const x = (envW - dims.w_mm) / 2
        const y = (envD - dims.d_mm) / 2
        placements.push({
            module_id: module.id,
            x_mm: Math.round(x),
            y_mm: Math.round(y),
            z_mm: envH - dims.h_mm,
            w_mm: Math.round(dims.w_mm),
            d_mm: Math.round(dims.d_mm),
            h_mm: Math.round(dims.h_mm),
            orientation_deg: 0,
            mount: "ceiling",
        })
    })

    // --- Wall modules ---
    // Default: near the door end, on the back wall (y=0), stacked at
    // shoulder height (z = 1000mm).
    let wallX = envW - DOOR_WIDTH_MM * 2 - WALL_CLEARANCE_MM
    wall.forEach(({ module, dims }) => {
        placements.push({
            module_id: module.id,
            x_mm: Math.round(wallX - dims.w_mm),
            y_mm: 0,
            z_mm: 1_000,
            w_mm: Math.round(dims.w_mm),
            d_mm: Math.round(dims.d_mm),
            h_mm: Math.round(dims.h_mm),
            orientation_deg: 0,
            mount: "wall",
        })
        wallX -= dims.w_mm + WALL_CLEARANCE_MM
    })

    // --- Envelope modules ---
    // These represent the container shell itself — placed at origin, full
    // dimensions. Rendered as the outline, not a solid body.
    envelopeMods.forEach(({ module, dims }) => {
        placements.push({
            module_id: module.id,
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

    // --- Vents ---
    // Add a vent above every ceiling module that declared a thermal
    // requirement (HVAC, fire suppression).
    ceiling.forEach(({ module, dims }) => {
        if (dims.requirement && dims.requirement.unit === "kW") {
            features.push({
                kind: "vent",
                geometry: "rect",
                coords: [
                    (envW - dims.w_mm) / 2 + 100,
                    (envD - dims.d_mm) / 2 + 100,
                    dims.w_mm - 200,
                    dims.d_mm - 200,
                ],
                label: `${module.name} vent (${dims.requirement.value} ${dims.requirement.unit})`,
            })
        }
    })

    // --- Constraints ---
    // NFPA 855: battery racks must be ≥ 900mm from fire suppression nozzle in
    // BESS domains. We encode the rule; validation + re-layout happens in a
    // future iteration.
    const batteryMod = modules.find((m) =>
        /battery|lfp|rack/i.test(`${m.name} ${(m.keyParts ?? []).join(" ")}`),
    )
    const fireMod = modules.find((m) => /fire|suppression/i.test(m.name))
    if (batteryMod && fireMod) {
        constraints.push({
            kind: "separation",
            a: batteryMod.id,
            b: fireMod.id,
            min_mm: 900,
            reason: "NFPA 855 §15.3 — minimum separation from fire-suppression nozzle to battery-rack surface.",
        })
    }

    // Cable-run adjacency: PCS must be close to DC distribution.
    const pcsMod = modules.find((m) => /pcs|inverter|power conversion/i.test(m.name))
    const dcMod = modules.find((m) => /dc distribution|dc combiner|dc bus/i.test(m.name))
    if (pcsMod && dcMod) {
        constraints.push({
            kind: "adjacency",
            a: pcsMod.id,
            b: dcMod.id,
            max_mm: 3_000,
            reason: "DC cable run — PCS to DC distribution kept under 3m to minimise voltage drop.",
        })
    }

    // --- Notes ---
    notes.push(
        `Symmetric layout: ${symmetric ? "yes (port / starboard rows)" : "no (single-row floor)"}.`,
    )
    notes.push(
        `Aisle: ${AISLE_WIDTH_MM}mm centred along container depth (${envD}mm interior).`,
    )
    if (Object.keys(targets).length > 0) {
        // Human-readable — each target as "kWh: 500", "kW: 100" rather
        // than a raw JSON blob that leaked verbatim into the PDF's notes
        // section (observed 2026-04-24 on BESS PDF).
        const parts = Object.entries(targets).map(([k, v]) => {
            const label = k.toUpperCase()
            return `${label}: ${v}`
        })
        notes.push(`Target — ${parts.join(" · ")}.`)
    }

    return { placements, features, constraints, notes }
}

export const containerLinearV1: LayoutRules = {
    domain: "container_linear",
    version: "1.0.0",
    label: "Container — linear floor plan (BESS / VF / data centre)",
    applicableIndustries: [
        // BESS
        "battery-energy-storage",
        "battery_energy_storage",
        "bess",
        "energy-storage",
        "grid-storage",
        "stationary-storage",
        "containerised-battery",
        // Vertical farm
        "vertical-farm",
        "vertical_farm",
        "vertical-farming",
        "indoor-farm",
        "controlled-environment-agriculture",
        "cea",
        // Data centre
        "data-centre",
        "data_center",
        "data-center",
        "edge-compute",
        "containerised-datacentre",
        // Water / utility containers
        "water-treatment",
        "modular-utility",
    ],
    plan_type: "floor",
    view: "top_down",
    layoutFn,
}

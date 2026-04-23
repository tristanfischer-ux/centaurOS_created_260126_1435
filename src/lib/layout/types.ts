/**
 * @file src/lib/layout/types.ts — Shared types for the Forge spatial-plan engine.
 *
 * @description The layout engine produces a 2D (or 2.5D) spatial plan for
 * every project — every module placed at a specific position inside the
 * envelope. Generalises across domains by `plan_type`:
 *
 *   - container / room              → floor plan (top-down)
 *   - aircraft fuselage / cabinet   → cross-section (side elevation)
 *   - cubesat / PCBA                → exploded stack (isometric)
 *   - heat pump / outdoor unit      → cabinet elevation
 *
 * The plan is the SOURCE OF TRUTH for module spatial layout. It drives:
 *   1. gpt-image-2 multimodal-reference image generation
 *   2. PDF spatial-plan section (to-scale SVG)
 *   3. BOM auto-insert of cable/duct/pipe runs from adjacencies (future)
 */

import type { CadLabModule } from "@/lib/cad-lab-types"
import type { Envelope, ModuleDimensions } from "@/lib/sizing/types"

// ─── The persisted artefact ────────────────────────────────────────────

/**
 * Stored as `cad_lab_projects.spatial_plan` JSONB.
 *
 * Coordinate system: envelope-local. Origin (0,0,0) is the envelope's
 * lower-left corner when viewed from the canonical `view`. X is the
 * envelope's longest axis (length); Y is the secondary axis (depth or
 * height depending on view); Z is up.
 *
 * All dimensions in millimetres.
 */
export interface SpatialPlan {
    plan_type: "floor" | "elevation" | "cross_section" | "stack"
    view: "top_down" | "side_elevation" | "isometric_exploded" | "cutaway"
    envelope: Envelope
    /** Per-module placement in envelope-local coordinates. */
    placements: Placement[]
    /** Aisles, doors, vents, access panels, cable trays, pipe runs. */
    features: Feature[]
    /** Adjacency / separation / keep-out constraints between placements. */
    constraints: Constraint[]
    /** One-line notes worth surfacing in the PDF and the UI. */
    notes: string[]
    rules_domain: string
    rules_version: string
    /** Was the plan auto-generated, founder-drawn, or hybrid? */
    authored_by: "fang" | "founder" | "hybrid"
    generated_at: string
}

// ─── Placement ─────────────────────────────────────────────────────────

/**
 * One module's position in the envelope.
 *
 * Coordinate convention by view:
 *   - top_down:           x = along envelope length, y = across envelope depth, z = ignored
 *   - side_elevation:     x = along envelope length, y = up (height), z = ignored
 *   - isometric_exploded: full 3D x/y/z used
 *   - cutaway:            x along length, y across depth, z up
 */
export interface Placement {
    module_id: string                                  // matches CadLabModule.id
    /** Envelope-local origin in mm. */
    x_mm: number
    y_mm: number
    z_mm?: number
    /** Occupied bounding box in mm — derived from sizing engine ModuleDimensions. */
    w_mm: number
    d_mm: number
    h_mm: number
    /** Rotation around the vertical axis (top-down view) in degrees, 0–360. */
    orientation_deg: number
    mount: "floor" | "ceiling" | "wall" | "envelope"
    /** For stacked layouts (vertical farm tier 1–5, cubesat 1U–12U). */
    layer?: number
    /** Optional human-readable label rendered on the SVG (defaults to module name). */
    label_override?: string
}

// ─── Features ──────────────────────────────────────────────────────────

/**
 * Non-module spatial elements: aisles, doors, vents, cable trays.
 * Rendered on the SVG so the plan reads like an architectural drawing.
 */
export interface Feature {
    kind:
        | "aisle"
        | "door"
        | "vent"
        | "access_panel"
        | "cable_tray"
        | "pipe_run"
        | "wall"
        | "structural_column"
    /**
     * Geometry encoding:
     *   - "rect"    → coords = [x, y, w, h]
     *   - "line"    → coords = [x1, y1, x2, y2]
     *   - "polygon" → coords = [x1, y1, x2, y2, ...]
     */
    geometry: "rect" | "line" | "polygon"
    coords: number[]                                   // envelope-local mm
    /** For line/polygon strokes. */
    width_mm?: number
    label: string
}

// ─── Constraints ───────────────────────────────────────────────────────

/**
 * Spatial constraints between two placements (or a placement + feature).
 * Drives validation + future adjacency-aware BOM auto-insert.
 *
 * Example uses:
 *   - "battery_racks" must keep ≥ 1500mm from "fire_suppression" (NFPA 855)
 *   - "pcs_inverter" must be < 3000mm from "ac_switchgear" (cable run length)
 *   - "hvac" must NOT overlap with "battery_racks" (mount conflict)
 */
export interface Constraint {
    kind: "adjacency" | "separation" | "keep_out"
    a: string                                          // placement.module_id or feature.label
    b: string
    /** For adjacency: max distance allowed. For separation: min distance required. */
    min_mm?: number
    max_mm?: number
    reason: string
}

// ─── Rules-library contract ────────────────────────────────────────────

/**
 * Each domain (container-linear, cabinet-elevation, stack, ...) implements
 * this contract. The layout engine picks the right library by industry
 * domain and calls its layoutFn with sizing-engine output.
 */
export interface LayoutRules {
    domain: string
    version: string
    label: string
    /** Industry domain strings the registry matches against. */
    applicableIndustries: string[]
    plan_type: SpatialPlan["plan_type"]
    view: SpatialPlan["view"]
    /** Layout function — produces placements + features + constraints from
     *  the sizing engine's per-module dimensions. */
    layoutFn: (input: LayoutInput) => LayoutOutput
}

export interface LayoutInput {
    envelope: Envelope
    /** Per-module dimensions from sizing engine (keyed by Max module id). */
    moduleDimensions: Record<string, ModuleDimensions>
    /** Max's modules — the layout engine reads name + keyParts to refine
     *  positioning when needed (e.g. mirrored modules like port/starboard
     *  rack pairs). */
    modules: CadLabModule[]
    /** Domain-specific targets (canopy_m2, kw_thermal, etc.) — same shape
     *  the sizing engine consumes. */
    targets: Record<string, number>
}

export interface LayoutOutput {
    placements: Placement[]
    features: Feature[]
    constraints: Constraint[]
    notes: string[]
}

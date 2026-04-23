/**
 * @file src/lib/layout/prompt-adapter.ts — Convert SpatialPlan data into
 * prompt-ready strings that image-generation prompt builders consume via
 * the existing `VisualStyleSpec.moduleDimensionNotes` channel + the
 * hero prompt's `researchExcerpt` slot.
 *
 * @description Sibling to `src/lib/sizing/prompt-adapter.ts`. Where the
 * sizing adapter injects W×D×H + mount notes, this adapter injects
 * placement information — module at x=6500mm, adjacent-to-the-right,
 * aisle-on-the-front-face — so gpt-image-2 renders the full system
 * with modules in the right relative positions, and per-module renders
 * can ghost-draw accurate context.
 *
 * Design choice (2026-04-23): we REUSE
 * `VisualStyleSpec.moduleDimensionNotes` rather than adding a new
 * `spatialLayoutNotes` field. The image-generator's
 * `buildDimensionalConstraints(moduleName, visualStyle)` already reads
 * this per-module channel; concatenating the spatial-placement note onto
 * whatever sizing note is already there means the prompt threading stays
 * byte-identical and no parallel sub-agent patching cad-lab-types.ts
 * can race us. The hero gets its layout table via the same
 * `researchExcerpt` slot that already carries the dimension table —
 * callers simply concatenate the two briefings.
 *
 * Upstream: run-fang-layout.ts persists the plan to
 * cad_lab_projects.spatial_plan.
 *
 * Downstream:
 * - forge-v2-generate-system-illustration.ts calls
 *   `enrichVisualStyleWithSpatialPlan` + `formatHeroLayoutBriefing` and
 *   appends the briefing to the hero's `researchExcerpt`.
 * - forge-v2-generate-one-module-image.ts calls
 *   `enrichVisualStyleWithSpatialPlan` + `formatPerModuleContextBriefing`;
 *   the per-module briefing is concatenated onto the module's dimension
 *   note so it reaches the prompt through the existing injection point.
 */

import type { CadLabModule, VisualStyleSpec } from "@/lib/cad-lab-types"
import type { Placement, SpatialPlan } from "./types"

// ─── Small formatting helpers ─────────────────────────────────────────

/**
 * Human-readable mount phrase. Matches the phrasing used by the sizing
 * adapter so the two concatenated notes read in the same voice.
 */
function formatMount(mount: Placement["mount"]): string {
    switch (mount) {
        case "ceiling":
            return "ceiling-mounted"
        case "wall":
            return "wall-mounted"
        case "envelope":
            return "envelope / outer shell"
        case "floor":
        default:
            return "floor-mounted"
    }
}

/**
 * Resolve a module name from a `module_id` — falls back to a spaced-out
 * version of the id if the module list doesn't know it (e.g. slot-only
 * entries like "hvac" that the rules library injects without a matching
 * CadLabModule record).
 */
function resolveModuleName(
    moduleId: string,
    modules: readonly CadLabModule[],
): string {
    const hit = modules.find((m) => m.id === moduleId)
    if (hit?.name) return hit.name
    return moduleId.replace(/_/g, " ")
}

/**
 * One-line placement description, keyed by module name so it can sit
 * inside `VisualStyleSpec.moduleDimensionNotes[moduleName]`.
 *
 * Example:
 *   "floor-mounted at x=6500mm along container length, y=0mm, 1200×1200×2200mm, facing 0°"
 *
 * Never throws. Bad input (NaN, negative dimensions) is still rendered
 * — image models tolerate odd numbers and we'd rather surface the
 * upstream data than swallow it silently.
 */
export function formatPlacementNote(
    placement: Placement | undefined | null,
    moduleName: string,
): string {
    if (!placement) return ""
    const mount = formatMount(placement.mount)
    const parts: string[] = [
        `${mount} at x=${placement.x_mm}mm`,
        `y=${placement.y_mm}mm`,
    ]
    if (typeof placement.z_mm === "number") {
        parts.push(`z=${placement.z_mm}mm`)
    }
    parts.push(
        `${placement.w_mm}×${placement.d_mm}×${placement.h_mm}mm`,
    )
    if (placement.orientation_deg !== 0) {
        parts.push(`facing ${placement.orientation_deg}°`)
    }
    if (typeof placement.layer === "number") {
        parts.push(`layer ${placement.layer}`)
    }
    const label = placement.label_override?.trim() || moduleName
    return `${label} — ${parts.join(", ")}`
}

/**
 * Short one-line caption summarising the plan's overall structure.
 * Surfaced alongside the dimension envelope in the hero briefing.
 *
 * Example:
 *   "Floor plan (top-down) — 5 modules floor-mounted, 2 ceiling-mounted,
 *    1 wall-mounted. 1 aisle, 1 door, 1 vent."
 */
export function formatSpatialPlanCaption(
    plan: SpatialPlan | null | undefined,
): string {
    if (!plan) return ""
    const counts = {
        floor: 0,
        ceiling: 0,
        wall: 0,
        envelope: 0,
    }
    for (const p of plan.placements ?? []) {
        counts[p.mount] = (counts[p.mount] ?? 0) + 1
    }
    const mountParts: string[] = []
    if (counts.floor) mountParts.push(`${counts.floor} floor-mounted`)
    if (counts.ceiling) mountParts.push(`${counts.ceiling} ceiling-mounted`)
    if (counts.wall) mountParts.push(`${counts.wall} wall-mounted`)
    if (counts.envelope) mountParts.push(`${counts.envelope} envelope-mounted`)

    const featureCounts: Record<string, number> = {}
    for (const f of plan.features ?? []) {
        featureCounts[f.kind] = (featureCounts[f.kind] ?? 0) + 1
    }
    const featureParts = Object.entries(featureCounts).map(
        ([kind, n]) => `${n} ${kind.replace(/_/g, " ")}${n === 1 ? "" : "s"}`,
    )

    const planLabel = `${plan.plan_type.replace(/_/g, " ")} (${plan.view.replace(/_/g, " ")})`
    const sentences: string[] = [planLabel]
    if (mountParts.length > 0) {
        sentences.push(`${mountParts.join(", ")}`)
    }
    if (featureParts.length > 0) {
        sentences.push(`features: ${featureParts.join(", ")}`)
    }
    return sentences.join(" — ")
}

/**
 * Enrich a VisualStyleSpec so each module's `moduleDimensionNotes[name]`
 * entry ALSO carries placement information. We concatenate onto any
 * existing note (typically written by the sizing adapter) rather than
 * overwriting — the sizing note's W×D×H is still valuable and the
 * image-generator's `buildDimensionalConstraints` happily consumes the
 * longer string.
 *
 * If `visualStyle` is undefined we DO NOT synthesise one here. The sizing
 * adapter already handles synthesis when dimension data is the only
 * signal; when the plan is the only signal there's nothing sensible to
 * synthesise (no envelope dims, no palette) so we return undefined and
 * let the caller keep the programmatic defaults.
 *
 * Never throws. A plan with zero placements, unmatched module ids, or
 * malformed entries is silently skipped — layout is an enhancement, not
 * a hard requirement.
 */
export function enrichVisualStyleWithSpatialPlan(
    visualStyle: VisualStyleSpec | undefined,
    plan: SpatialPlan | null | undefined,
    modules: readonly CadLabModule[],
): VisualStyleSpec | undefined {
    if (!plan || !Array.isArray(plan.placements) || plan.placements.length === 0) {
        return visualStyle
    }
    if (!visualStyle) return visualStyle

    const moduleNotes: Record<string, string> = {
        ...(visualStyle.moduleDimensionNotes ?? {}),
    }

    for (const placement of plan.placements) {
        if (!placement || typeof placement.module_id !== "string") continue
        const name = resolveModuleName(placement.module_id, modules)
        if (!name) continue
        const placementNote = formatPlacementNote(placement, name)
        if (!placementNote) continue
        const existing = moduleNotes[name]
        moduleNotes[name] = existing
            ? `${existing} · layout: ${placementNote}`
            : `layout: ${placementNote}`
    }

    return {
        ...visualStyle,
        moduleDimensionNotes: moduleNotes,
    }
}

/**
 * Multi-line briefing for the hero (system illustration) prompt. Lists
 * every module's placement plus salient non-module features so
 * gpt-image-2 can arrange the scene with modules in the right positions.
 *
 * Returns "" when plan is null so callers can concatenate unconditionally.
 */
export function formatHeroLayoutBriefing(
    plan: SpatialPlan | null | undefined,
    modules: readonly CadLabModule[],
): string {
    if (!plan || !Array.isArray(plan.placements) || plan.placements.length === 0) {
        return ""
    }
    const lines: string[] = [
        `Spatial plan: ${formatSpatialPlanCaption(plan)}.`,
        `Origin (0,0,0) is the envelope's lower-left corner when viewed ${plan.view.replace(/_/g, " ")}.`,
        "",
        "Per-module placement (respect these positions + mounts):",
    ]
    for (const placement of plan.placements) {
        if (!placement || typeof placement.module_id !== "string") continue
        const name = resolveModuleName(placement.module_id, modules)
        const note = formatPlacementNote(placement, name)
        if (!note) continue
        lines.push(`  - ${note}`)
    }

    // Salient features — aisles, doors, vents — help the model draw a
    // scene that looks like an architectural drawing rather than a
    // free-floating exploded view.
    const features = Array.isArray(plan.features) ? plan.features : []
    if (features.length > 0) {
        lines.push("", "Non-module features (draw these as part of the envelope):")
        for (const f of features) {
            if (!f || typeof f.label !== "string") continue
            lines.push(`  - ${f.kind.replace(/_/g, " ")}: ${f.label}`)
        }
    }

    const notes = Array.isArray(plan.notes) ? plan.notes : []
    if (notes.length > 0) {
        lines.push("", "Plan notes:")
        for (const n of notes) {
            if (typeof n !== "string" || !n.trim()) continue
            lines.push(`  - ${n.trim()}`)
        }
    }

    return lines.join("\n")
}

/**
 * Per-module context briefing. Describes the target module's own
 * position plus immediate neighbours so a per-module render can
 * correctly ghost in adjacent modules and the envelope's relevant walls.
 *
 * "Adjacent" means nearest-neighbour by centroid distance along the
 * envelope's primary axes — two left-most neighbours and two
 * right-most / above / below where applicable. We keep this cheap and
 * deterministic; the image model doesn't need graph-theoretic rigour,
 * just a handful of anchors.
 *
 * Returns "" when plan is null, target is missing, or target has no
 * placement.
 */
export function formatPerModuleContextBriefing(
    plan: SpatialPlan | null | undefined,
    targetModuleId: string,
    modules: readonly CadLabModule[],
): string {
    if (!plan || !Array.isArray(plan.placements) || plan.placements.length === 0) {
        return ""
    }
    const target = plan.placements.find((p) => p?.module_id === targetModuleId)
    if (!target) return ""

    const targetName = resolveModuleName(targetModuleId, modules)

    const others = plan.placements
        .filter((p): p is Placement => !!p && p.module_id !== targetModuleId)
        .map((p) => ({
            placement: p,
            name: resolveModuleName(p.module_id, modules),
            dx: p.x_mm - target.x_mm,
            dy: p.y_mm - target.y_mm,
            dist: Math.hypot(
                p.x_mm - target.x_mm,
                p.y_mm - target.y_mm,
                (p.z_mm ?? 0) - (target.z_mm ?? 0),
            ),
        }))

    const right = others
        .filter((o) => o.dx > 0)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2)
    const left = others
        .filter((o) => o.dx < 0)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2)
    const front = others
        .filter((o) => o.dy < 0)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 1)
    const back = others
        .filter((o) => o.dy > 0)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 1)

    const lines: string[] = [
        `Target module "${targetName}" sits at x=${target.x_mm}mm, y=${target.y_mm}mm${
            typeof target.z_mm === "number" ? `, z=${target.z_mm}mm` : ""
        } (${formatMount(target.mount)}, ${target.w_mm}×${target.d_mm}×${target.h_mm}mm).`,
    ]
    if (right.length > 0) {
        lines.push(
            "To the right:",
            ...right.map(
                (o) =>
                    `  - ${o.name} at x=${o.placement.x_mm}mm (${formatMount(o.placement.mount)})`,
            ),
        )
    }
    if (left.length > 0) {
        lines.push(
            "To the left:",
            ...left.map(
                (o) =>
                    `  - ${o.name} at x=${o.placement.x_mm}mm (${formatMount(o.placement.mount)})`,
            ),
        )
    }
    if (front.length > 0) {
        lines.push(
            "Towards the front:",
            ...front.map(
                (o) =>
                    `  - ${o.name} at y=${o.placement.y_mm}mm`,
            ),
        )
    }
    if (back.length > 0) {
        lines.push(
            "Towards the back:",
            ...back.map(
                (o) =>
                    `  - ${o.name} at y=${o.placement.y_mm}mm`,
            ),
        )
    }

    // Surface any feature that's within ~1500mm of the target along the
    // primary axis — captures the "aisle runs along the target module's
    // front face" case the caller example shows.
    const nearFeatures = (Array.isArray(plan.features) ? plan.features : [])
        .filter((f) => f && Array.isArray(f.coords) && f.coords.length >= 2)
        .filter((f) => {
            // Use the first coord as a rough anchor — good enough for the
            // "is this feature in the neighbourhood" check the model needs.
            const fx = f.coords[0] ?? 0
            const fy = f.coords[1] ?? 0
            const dx = Math.abs(fx - target.x_mm)
            const dy = Math.abs(fy - target.y_mm)
            return Math.min(dx, dy) < 1500
        })
    if (nearFeatures.length > 0) {
        lines.push(
            "Nearby envelope features (include ghosted):",
            ...nearFeatures.map((f) => `  - ${f.kind.replace(/_/g, " ")}: ${f.label}`),
        )
    }

    return lines.join("\n")
}

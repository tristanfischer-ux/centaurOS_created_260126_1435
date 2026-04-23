/**
 * @file src/lib/sizing/prompt-adapter.ts — Convert DimensionSheet data into
 * prompt-ready strings that image-generation prompt builders consume via
 * the existing `VisualStyleSpec.moduleDimensionNotes` channel.
 *
 * @description The image-generator already honours two fields on VisualStyleSpec:
 *   - `overallDimensionsMm` — system-level envelope caption ("40ft ISO, 12192×2352×2393mm")
 *   - `moduleDimensionNotes[moduleName]` — per-module dimensional note
 *
 * This adapter reads a `DimensionSheet` and populates both fields so the
 * image prompts automatically reflect the sizing engine's ground truth
 * without each prompt builder having to understand the sheet's shape.
 *
 * Upstream: run-fang-sizing.ts persists the sheet.
 * Downstream: forge-v2-generate-one-module-image.ts + the hero orchestrator
 * call `enrichVisualStyleWithDimensions(visualStyle, sheet, modules)` before
 * invoking image generation.
 */

import type { CadLabModule, VisualStyleSpec } from "@/lib/cad-lab-types"
import type { DimensionSheet, ModuleDimensions } from "./types"

/**
 * Format a single ModuleDimensions record as a single-line prompt note.
 * Kept under ~200 chars so prompts don't explode; image models ignore
 * long structured lists.
 */
export function formatModuleDimensionNote(dim: ModuleDimensions): string {
    const parts: string[] = [
        `${dim.w_mm}×${dim.d_mm}×${dim.h_mm}mm`,
        dim.mount === "ceiling"
            ? "ceiling-mounted (above floor modules)"
            : dim.mount === "wall"
                ? "wall-mounted"
                : dim.mount === "envelope"
                    ? "envelope / outer shell"
                    : "floor-mounted",
    ]
    if (dim.count_hint) parts.push(dim.count_hint)
    if (dim.requirement) {
        parts.push(`${dim.requirement.label} ${dim.requirement.value}${dim.requirement.unit}`)
    }
    if (dim.prompt_hint) parts.push(dim.prompt_hint)
    return parts.join(" · ")
}

/**
 * Format the envelope as an "overall product" dimension caption.
 */
export function formatEnvelopeCaption(sheet: DimensionSheet): string {
    const e = sheet.envelope
    return `${e.label} (interior ${e.interior_w_mm}×${e.interior_d_mm}×${e.interior_h_mm}mm, ${e.interior_floor_m2.toFixed(1)} m² floor)`
}

/**
 * Populate `visualStyle.moduleDimensionNotes` + `overallDimensionsMm` from
 * a dimension sheet. Keyed by MODULE NAME (not id) because the prompt
 * builders index by name.
 *
 * If `visualStyle` is undefined, synthesises a minimal spec with just the
 * dimension fields — image prompts still benefit.
 *
 * Never throws. Missing dimensions or unmatched modules are silently
 * skipped — sizing is an enhancement, not a hard requirement.
 */
export function enrichVisualStyleWithDimensions(
    visualStyle: VisualStyleSpec | undefined,
    sheet: DimensionSheet | null,
    modules: CadLabModule[],
): VisualStyleSpec | undefined {
    if (!sheet || !sheet.module_dimensions) return visualStyle

    const moduleNotes: Record<string, string> = {
        ...(visualStyle?.moduleDimensionNotes ?? {}),
    }

    for (const module of modules) {
        const dim = sheet.module_dimensions[module.id]
        if (!dim) continue
        // Only overwrite when the sizing engine has a better note; keep any
        // existing note (e.g. from Opus design synthesis) if the sheet didn't
        // match this module.
        moduleNotes[module.name] = formatModuleDimensionNote(dim)
    }

    const overallDimensionsMm =
        visualStyle?.overallDimensionsMm ?? formatEnvelopeCaption(sheet)

    if (visualStyle) {
        return {
            ...visualStyle,
            moduleDimensionNotes: moduleNotes,
            overallDimensionsMm,
        }
    }

    // Synthesise minimal spec — image-generator treats this as "better than
    // nothing" and produces dimensioned prompts without the rest of the
    // style directives.
    return {
        colorPalette: "neutral industrial greys + signal blue",
        materialRendering: "realistic industrial materials, thin precise lines",
        unifyingContext: sheet.envelope.label,
        productFormDescription: sheet.envelope.label,
        overallDimensionsMm,
        moduleDimensionNotes: moduleNotes,
    }
}

/**
 * Build a "full dimension table" multi-line string suitable for injection
 * into the hero (interior-exploded) prompt. The hero prompt can fit a
 * short table because it governs one big render not N small ones.
 */
export function formatHeroDimensionTable(
    sheet: DimensionSheet | null,
    modules: CadLabModule[],
): string {
    if (!sheet || !sheet.module_dimensions) return ""

    const lines: string[] = [
        `Envelope: ${formatEnvelopeCaption(sheet)}.`,
        `Feasibility: ${sheet.feasible ? "FEASIBLE" : "INFEASIBLE"} — floor budget ${sheet.floor_budget_m2.toFixed(1)} m².`,
        "",
        "Per-module spatial layout (respect these dimensions + mount positions):",
    ]
    for (const module of modules) {
        const dim = sheet.module_dimensions[module.id]
        if (!dim) continue
        lines.push(`  - ${module.name}: ${formatModuleDimensionNote(dim)}`)
    }
    // Include any slot-only entries (container_shell, hvac that Max didn't
    // decompose but the rules library knows exists spatially).
    for (const slotId of sheet.unmatched_slot_ids) {
        const dim = sheet.module_dimensions[slotId]
        if (!dim) continue
        lines.push(`  - ${slotId.replace(/_/g, " ")}: ${formatModuleDimensionNote(dim)}`)
    }
    return lines.join("\n")
}

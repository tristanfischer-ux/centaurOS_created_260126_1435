"use client"

import { RedlineDiff, type RedlineItem } from "./redline-diff"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Concept → Build Diff ─────────────────────────────────────────────

/**
 * ConceptBuildDiff — Shows redline diffs for a module between what Concept
 * assumed and what Build determined through CAD generation.
 *
 * Data sources:
 * - mod.result?.assumptions — what the AI resolved during CAD generation
 * - mod.result?.validationWarnings — what Build found that needs attention
 * - mod.interfaceDefinition — Build's dimensional spec (enriches Concept)
 * - mod.result?.bbox — precise dimensions from CAD (vs Concept's vague estimates)
 */
export function ConceptBuildDiff({ module: mod }: { module: CadLabModule }): React.ReactNode {
  const items: RedlineItem[] = []

  // Resolved assumptions — things the AI had to decide during Build
  if (mod.result?.assumptions) {
    for (const assumption of mod.result.assumptions) {
      items.push({
        label: "Assumption",
        before: "Unspecified in concept",
        after: assumption,
      })
    }
  }

  // Dimensional refinement — Concept had vague key parts, Build has precise dimensions
  if (mod.result?.bbox && mod.keyParts.length > 0) {
    items.push({
      label: "Dimensions",
      before: `${mod.keyParts.length} components (no dimensions)`,
      after: `${mod.result.bbox.xLen}×${mod.result.bbox.yLen}×${mod.result.bbox.zLen} mm bounding box, ${mod.result.massGrams ?? "?"} g`,
    })
  }

  // Mass refinement
  if (mod.result?.massGrams != null) {
    items.push({
      label: "Mass",
      before: "Estimated from concept",
      after: `${mod.result.massGrams} g (from CAD model)`,
    })
  }

  // DFM findings — things Concept couldn't know
  if (mod.result?.dfm && !mod.result.dfm.printable) {
    items.push({
      label: "Printability",
      before: "Assumed printable",
      after: `Not printable — ${mod.result.dfm.issues.length} DFM issue${mod.result.dfm.issues.length !== 1 ? "s" : ""} found`,
    })
  }

  // Validation warnings become redline items
  if (mod.result?.validationWarnings) {
    for (const warning of mod.result.validationWarnings) {
      items.push({
        label: "Warning",
        before: null,
        after: warning,
      })
    }
  }

  if (items.length === 0) return null

  return <RedlineDiff fromStage="Concept" toStage="Build" items={items} />
}

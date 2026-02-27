"use client"

/**
 * @file checkpoint-revision-diffs.tsx — Redline diff display for checkpoint-revised modules.
 *
 * @description Shows what changed in each module after specialist checkpoint
 * feedback was automatically applied. Uses the existing RedlineDiff component
 * for consistent tracked-changes styling.
 *
 * Exports `buildRevisionItems` for reuse on the Build page.
 *
 * @related
 * - RedlineDiff: src/app/(platform)/the-forge/cad-lab/components/redline-diff.tsx
 * - Types: src/lib/cad-lab-types.ts (CadLabModule.conceptSnapshot)
 * - Context: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RedlineDiff, type RedlineItem } from "./redline-diff"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Public helper — builds RedlineItem[] from conceptSnapshot vs current ──

/**
 * Builds redline diff items by comparing a module's conceptSnapshot (original)
 * to its current fields (revised). Returns empty array if no snapshot exists
 * or nothing changed.
 */
export function buildRevisionItems(mod: CadLabModule): RedlineItem[] {
  const snap = mod.conceptSnapshot
  if (!snap) return []

  const items: RedlineItem[] = []

  // String field diffs
  if (snap.purpose !== mod.purpose) {
    items.push({ label: "Purpose", before: snap.purpose, after: mod.purpose })
  }
  if (snap.description !== mod.description) {
    items.push({ label: "Description", before: snap.description, after: mod.description })
  }
  if (snap.whyItMatters !== mod.whyItMatters) {
    items.push({ label: "Why It Matters", before: snap.whyItMatters, after: mod.whyItMatters })
  }

  // Array field diffs — show removed/added items
  diffArray("Key Parts", snap.keyParts, mod.keyParts, items)
  diffArray("Failure Modes", snap.failureModes, mod.failureModes, items)
  diffArray("Unknowns", snap.unknowns, mod.unknowns, items)

  return items
}

/** Compares two string arrays and pushes removed/added items as RedlineItems */
function diffArray(label: string, before: string[], after: string[], items: RedlineItem[]) {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)

  const removed = before.filter((s) => !afterSet.has(s))
  const added = after.filter((s) => !beforeSet.has(s))

  for (const item of removed) {
    items.push({ label, before: item, after: null })
  }
  for (const item of added) {
    items.push({ label, before: null, after: item })
  }
}

// ─── Component — renders all revision diffs for the Concept page ──

interface CheckpointRevisionDiffsProps {
  modules: CadLabModule[]
  revisedModuleIds: Set<string>
}

export function CheckpointRevisionDiffs({ modules, revisedModuleIds }: CheckpointRevisionDiffsProps) {
  if (revisedModuleIds.size === 0) return null

  const revisedModules = modules.filter((m) => revisedModuleIds.has(m.id))
  if (revisedModules.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Checkpoint Revisions</span>
          <Badge variant="info" className="text-xs">
            {revisedModules.length} module{revisedModules.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Module descriptions were updated to address specialist concerns.
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {revisedModules.map((mod) => {
          const items = buildRevisionItems(mod)
          if (items.length === 0) return null
          return (
            <div key={mod.id}>
              <p className="text-xs font-medium text-foreground mb-2">{mod.name}</p>
              <RedlineDiff fromStage="Original Concept" toStage="Revised" items={items} />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

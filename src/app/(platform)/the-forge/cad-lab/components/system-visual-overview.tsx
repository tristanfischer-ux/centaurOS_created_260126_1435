"use client"

/**
 * @file system-visual-overview.tsx
 *
 * @description Visual-first layout for the Research page: central 3D reference
 * view with module cards arranged around it. Shown after research + decomposition.
 */

import { useMemo } from "react"
import { Clock, Puzzle } from "lucide-react"
import { ReferenceModelViewer } from "./reference-model-viewer"
import type { ReferenceModel } from "@/actions/reference-models"
import type { CadLabModule } from "@/lib/cad-lab-types"

interface SystemVisualOverviewProps {
  /** Matched reference model (for central 3D preview) */
  referenceModel: ReferenceModel | null
  /** Decomposed modules to show around the 3D view */
  modules: CadLabModule[]
  /** Optional class name */
  className?: string
}

/**
 * Renders central 3D view (reference STL or placeholder) and a grid of
 * module cards around it. Used on the Research page after decomposition.
 */
export function SystemVisualOverview({
  referenceModel,
  modules,
  className = "",
}: SystemVisualOverviewProps): React.ReactNode {
  const stlUrl = referenceModel?.stlUrl ?? null

  const moduleCards = useMemo(() => {
    return modules.map((mod) => (
      <div
        key={mod.id}
        className="rounded-lg border border-border bg-card p-3 space-y-1.5 hover:border-international-orange/40 transition-colors"
      >
        <p className="text-sm font-semibold text-foreground truncate">{mod.name}</p>
        <p className="text-xs text-muted-foreground line-clamp-2">{mod.purpose}</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
          <span className="flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {mod.leadWeeks} wk
          </span>
          <span className="flex items-center gap-0.5">
            <Puzzle className="h-3 w-3" />
            {mod.keyParts.length} parts
          </span>
        </div>
      </div>
    ))
  }, [modules])

  return (
    <div className={className}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Central 3D view — takes majority on large screens */}
        <div className="lg:col-span-7 xl:col-span-8">
          <ReferenceModelViewer stlUrl={stlUrl} minHeight={340} />
          {referenceModel && !stlUrl && (
            <p className="text-xs text-muted-foreground mt-2">
              Reference: {referenceModel.name}
              {referenceModel.description && ` — ${referenceModel.description}`}
            </p>
          )}
        </div>
        {/* Module cards — orbit around the 3D view */}
        <div className="lg:col-span-5 xl:col-span-4">
          <p className="text-sm font-semibold text-foreground mb-3">Modules</p>
          {modules.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[340px] overflow-y-auto">
              {moduleCards}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Map sub-assemblies to see modules here.</p>
          )}
        </div>
      </div>
    </div>
  )
}

"use client"

/**
 * @file manufacturing-intelligence-tab.tsx — Per-module Nightshift deep enrichment data.
 *
 * @description Shows real-world manufacturing intelligence for every process+material
 * in the project's diagnostics. Reuses DfmInsightPanel and ManufacturingInsightCard,
 * plus shows alternative technique recommendations with TechniqueDetailDialog.
 */

import { useState } from "react"
import { Factory, Lightbulb, Zap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DfmInsightPanel } from "@/components/cad/dfm-insight-panel"
import { ManufacturingInsightCard } from "@/components/cad/manufacturing-insight-card"
import { TechniqueDetailDialog } from "@/components/techniques/technique-detail-dialog"
import { getTechniqueBySlug } from "@/lib/manufacturing-techniques"
import type { ManufacturingTechnique } from "@/lib/manufacturing-techniques"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { ProcessInsights } from "@/actions/manufacturing-techniques"
import type { TechniqueRecommendation } from "@/lib/cad-lab/technique-recommender"

interface ManufacturingIntelligenceTabProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  processInsights: Record<string, ProcessInsights>
  techniqueRecs: Record<string, TechniqueRecommendation[]>
}

export function ManufacturingIntelligenceTab({
  modules,
  diagnosticAnswers,
  processInsights,
  techniqueRecs,
}: ManufacturingIntelligenceTabProps) {
  const [selectedTechnique, setSelectedTechnique] = useState<ManufacturingTechnique | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Filter to modules with diagnostics
  const diagnosedModules = modules.filter((mod) => {
    const answers = diagnosticAnswers[mod.id]
    return answers?.mfg_process?.trim()
  })

  if (diagnosedModules.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Factory className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No manufacturing data yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Complete diagnostics for at least one module to see manufacturing intelligence.
          </p>
        </CardContent>
      </Card>
    )
  }

  const handleTechniqueClick = (slug: string) => {
    const technique = getTechniqueBySlug(slug)
    if (technique) {
      setSelectedTechnique(technique)
      setDialogOpen(true)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2">
            <Factory className="h-4 w-4 text-international-orange" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Manufacturing Intelligence</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-world supplier data for {diagnosedModules.length} module{diagnosedModules.length !== 1 ? "s" : ""} &mdash; tolerances, materials, equipment, and practical tips from UK manufacturers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-module cards */}
      {diagnosedModules.map((mod) => {
        const answers = diagnosticAnswers[mod.id]
        const process = answers?.mfg_process?.trim() ?? ""
        const material = answers?.material?.trim() ?? ""
        const tolerance = answers?.tolerance?.trim() ?? ""
        const insights = process ? processInsights[process] : undefined
        const recs = techniqueRecs[mod.id] ?? []

        return (
          <Card key={mod.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                {mod.name}
                {process && (
                  <Badge variant="secondary" className="text-xs">
                    {process}
                  </Badge>
                )}
                {material && (
                  <Badge variant="secondary" className="text-xs">
                    {material}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* DFM Insights from Nightshift data */}
              {insights && (
                <DfmInsightPanel
                  insights={insights}
                  selectedTolerance={tolerance || null}
                  selectedMaterial={material || null}
                />
              )}

              {/* Factory questions based on diagnostics */}
              <ManufacturingInsightCard moduleAnswers={answers} />

              {/* Alternative technique recommendations */}
              {recs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Alternative Techniques
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recs.slice(0, 5).map((rec) => (
                      <button
                        key={rec.slug}
                        onClick={() => handleTechniqueClick(rec.slug)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
                      >
                        <Zap className="h-3 w-3 text-international-orange" />
                        {rec.name}
                        <span className="text-muted-foreground">({rec.score}pt{rec.score !== 1 ? "s" : ""})</span>
                      </button>
                    ))}
                  </div>
                  {recs[0]?.reasons?.length > 0 && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Top pick: {recs[0].reasons[0]}
                    </p>
                  )}
                </div>
              )}

              {/* No insights available */}
              {!insights && recs.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No manufacturing intelligence available for this process yet.
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* Technique detail dialog */}
      <TechniqueDetailDialog
        technique={selectedTechnique}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}

"use client"

/**
 * @file manufacturing-intelligence-tab.tsx — Per-module DfM intelligence.
 *
 * @description Combines three data sources for each diagnosed module:
 *   1. `processInsights` — static Nightshift-enriched DfM checklists keyed by process
 *   2. `techniqueRecs` — deterministic scorer recommending alternative techniques
 *      based on material/tolerance/batch size
 *   3. `semanticTechniqueMatches` — vector-backed retrieval via pgvector (nomic-
 *      embed-text-v1.5, 768 dims) over manufacturing_technique_enrichments +
 *      process_capabilities. Surfaces related techniques a rigid keyword match
 *      would miss.
 */

import { useState } from "react"
import { Factory, Lightbulb, Zap, Info, Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { DfmInsightPanel } from "@/components/cad/dfm-insight-panel"
import { ManufacturingInsightCard } from "@/components/cad/manufacturing-insight-card"
import { TechniqueDetailDialog } from "@/components/techniques/technique-detail-dialog"
import { getTechniqueBySlug } from "@/lib/manufacturing-techniques"
import type { ManufacturingTechnique } from "@/lib/manufacturing-techniques"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { ProcessInsights } from "@/actions/manufacturing-techniques"
import type { TechniqueRecommendation } from "@/lib/cad-lab/technique-recommender"
import type { ManufacturingTechniqueMatch } from "@/actions/cad-lab-dfm-match"

interface ManufacturingIntelligenceTabProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  processInsights: Record<string, ProcessInsights>
  techniqueRecs: Record<string, TechniqueRecommendation[]>
  /** Phase 5: vector-backed semantic matches per module from match_manufacturing_techniques RPC. */
  semanticTechniqueMatches?: Record<string, ManufacturingTechniqueMatch[]>
}

export function ManufacturingIntelligenceTab({
  modules,
  diagnosticAnswers,
  processInsights,
  techniqueRecs,
  semanticTechniqueMatches,
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
    // DB slugs use snake_case (cnc_milling); static library uses kebab-case
    // (cnc-milling). Try both — the static library is the only source of
    // dialog content right now, so missing slugs silently no-op (the pill
    // still renders with a title tooltip explaining the match).
    const technique =
      getTechniqueBySlug(slug) ??
      getTechniqueBySlug(slug.replace(/_/g, "-")) ??
      getTechniqueBySlug(slug.replace(/-/g, "_"))
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
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Factory className="h-4 w-4 text-international-orange" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Design for Manufacture</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tolerances, materials, equipment, and practical tips for {diagnosedModules.length} module{diagnosedModules.length !== 1 ? "s" : ""} &mdash; with related techniques surfaced by semantic search.
                </p>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  aria-label="About this data"
                >
                  <Info className="h-3.5 w-3.5" />
                  What&rsquo;s this data?
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] text-xs space-y-2">
                <p className="font-medium text-foreground">Design-for-Manufacture data sources</p>
                <ul className="space-y-1 text-muted-foreground list-disc pl-4">
                  <li>
                    <span className="text-foreground">DfM checklist</span> &mdash; factory questions + tradeoffs per process, curated from supplier onboarding packs.
                  </li>
                  <li>
                    <span className="text-foreground">Alternative techniques</span> &mdash; deterministic scorer over material/tolerance/batch-size (top pick per module).
                  </li>
                  <li>
                    <span className="text-foreground">Related techniques (semantic)</span> &mdash; vector retrieval (nomic-embed-text-v1.5, 768-dim pgvector HNSW) over the technique enrichment library. Surfaces near-neighbour techniques a keyword rule would miss.
                  </li>
                </ul>
                <p className="pt-1 text-muted-foreground">
                  Retrieval is authenticated and rate-limited. Unreviewed LLM-seeded rows are hidden by default.
                </p>
              </PopoverContent>
            </Popover>
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

              {/* Semantic matches (Phase 5 vector retrieval) */}
              {(() => {
                const matches = semanticTechniqueMatches?.[mod.id] ?? []
                // Filter out any that duplicate the current diagnostic process or an already-shown recommendation slug.
                const seenSlugs = new Set<string>([
                  ...recs.map((r) => r.slug),
                  process.toLowerCase().replace(/\s+/g, "_"),
                ])
                const fresh = matches.filter((m) => !seenSlugs.has(m.techniqueSlug))
                if (fresh.length === 0) return null
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      Related Techniques
                      <span className="text-[10px] text-muted-foreground/70 font-normal">
                        (semantic)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {fresh.slice(0, 5).map((m) => (
                        <button
                          key={m.techniqueSlug}
                          onClick={() => handleTechniqueClick(m.techniqueSlug)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
                          title={`Cosine similarity ${Math.round(m.similarity * 100)}% · ${m.source ?? "unsourced"}`}
                        >
                          <Sparkles className="h-3 w-3 text-international-orange" />
                          {m.displayName}
                          <span className="text-muted-foreground">
                            {Math.round(m.similarity * 100)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* No insights available */}
              {!insights && recs.length === 0 && !(semanticTechniqueMatches?.[mod.id]?.length) && (
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

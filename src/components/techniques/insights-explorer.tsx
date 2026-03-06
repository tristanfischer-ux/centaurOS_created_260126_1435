'use client'

import { useState, useCallback } from 'react'
import { Factory } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ALL_TECHNIQUES } from '@/lib/manufacturing-techniques'
import type { ManufacturingTechnique } from '@/lib/manufacturing-techniques/types'
import type { TechniqueEnrichment } from '@/types/manufacturing-techniques'
import { TechniqueDetailDialog } from './technique-detail-dialog'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^- /gm, '')
    .replace(/\n+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// InsightsExplorer
// ---------------------------------------------------------------------------

interface InsightsExplorerProps {
  enrichments: TechniqueEnrichment[]
}

export function InsightsExplorer({ enrichments }: InsightsExplorerProps) {
  const [selectedTechnique, setSelectedTechnique] =
    useState<ManufacturingTechnique | null>(null)

  const handleViewRelated = useCallback(
    (technique: ManufacturingTechnique) => {
      setSelectedTechnique(technique)
    },
    [],
  )

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <Card className="bg-gradient-to-r from-international-orange/5 to-background border-international-orange/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-international-orange/10 flex items-center justify-center shrink-0 mt-0.5">
              <Factory className="h-5 w-5 text-international-orange" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-sm mb-0.5">
                Real-World Insights
              </h2>
              <p className="text-xs text-muted-foreground">
                Articles aggregated from {enrichments.reduce((sum, e) => sum + e.supplier_count, 0)} real
                UK suppliers via automated research. Each article synthesises
                tolerances, materials, equipment, and practical tips from
                multiple manufacturers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Article cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
        {enrichments.map(enrichment => {
          const technique = ALL_TECHNIQUES.find(
            t => t.slug === enrichment.technique_slug,
          )
          if (!technique) return null

          const preview = enrichment.article_markdown
            ? stripMarkdown(enrichment.article_markdown).slice(0, 120) + '...'
            : null

          return (
            <Card
              key={enrichment.id}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border hover:border-international-orange/30 overflow-hidden"
              onClick={() => setSelectedTechnique(technique)}
              role="button"
              tabIndex={0}
              aria-label={`Read insights for ${technique.name}`}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedTechnique(technique)
                }
              }}
            >
              {/* Orange accent bar */}
              <div className="h-1 bg-international-orange" />

              <CardContent className="p-4 space-y-3">
                {/* Technique name */}
                <h3 className="font-semibold text-sm text-foreground leading-tight line-clamp-2">
                  {technique.name}
                </h3>

                {/* Article preview */}
                {preview && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                    {preview}
                  </p>
                )}

                {/* Top 3 real-world materials */}
                {enrichment.real_world_materials.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {enrichment.real_world_materials.slice(0, 3).map((mat, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {mat.material}
                      </Badge>
                    ))}
                    {enrichment.real_world_materials.length > 3 && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        +{enrichment.real_world_materials.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Footer: supplier count + read link */}
                <div className="flex items-center justify-between pt-1 border-t border-muted">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 text-international-orange border-international-orange/30"
                  >
                    {enrichment.supplier_count}{' '}
                    {enrichment.supplier_count === 1 ? 'supplier' : 'suppliers'}
                  </Badge>
                  <span className="text-[10px] font-medium text-international-orange">
                    Read article &rarr;
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Detail dialog (reused) */}
      <TechniqueDetailDialog
        technique={selectedTechnique}
        open={!!selectedTechnique}
        onOpenChange={open => {
          if (!open) setSelectedTechnique(null)
        }}
        onViewRelated={handleViewRelated}
      />
    </div>
  )
}

'use client'

/**
 * @file WorkshopDesignSection.tsx
 *
 * @description Design phase report section — CAD Lab projects, module counts,
 * research summaries, and generation metrics.
 */

import { Pencil, Layers, Zap } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  StatCallout,
} from '@/components/reports/report-visuals'

import type { WorkshopDesignSectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

interface WorkshopDesignSectionProps extends WorkshopDesignSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

export function WorkshopDesignSection({
  totalProjects,
  activeProjects,
  projects,
  generationMetrics,
  sectionNarrative,
  templateId,
  sectionNumber,
}: WorkshopDesignSectionProps): React.JSX.Element {
  const isEmpty = totalProjects === 0

  return (
    <div className="space-y-8">
      <ReportSectionHeader
        title="Workshop: Design"
        icon={Pencil}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      <SectionNarrativeIntro narrative={sectionNarrative} />

      {isEmpty ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Pencil className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No CAD Lab projects found.</p>
        </div>
      ) : (
        <>
          {/* Hero stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <StatCallout value={String(totalProjects)} label="Total Projects" size="md" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <StatCallout value={String(activeProjects)} label="Active" size="md" />
              </CardContent>
            </Card>
            {generationMetrics != null && (
              <Card>
                <CardContent className="p-4 text-center">
                  <StatCallout
                    value={`${generationMetrics.successRate}%`}
                    label="Generation Success"
                    size="md"
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Generation metrics detail */}
          {generationMetrics != null && generationMetrics.totalGenerations > 0 && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-international-orange/10">
                    <Zap className="h-4 w-4 text-international-orange" />
                  </div>
                  <h3 className="text-sm font-semibold">Generation Metrics</h3>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold font-display">{generationMetrics.totalGenerations}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Generations</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display">
                      {generationMetrics.averageTimeMs > 0
                        ? `${(generationMetrics.averageTimeMs / 1000).toFixed(1)}s`
                        : '—'}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Time</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display text-status-success">
                      {generationMetrics.successRate}%
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Success</p>
                  </div>
                </div>
                {generationMetrics.topModels.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {generationMetrics.topModels.map(({ model, count }) => (
                      <Badge key={model} variant="secondary" className="text-[10px]">
                        {model}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Project list */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Projects
            </h3>
            <div className="space-y-2">
              {projects.slice(0, 10).map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3 bg-card"
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">
                      {p.moduleCount} module{p.moduleCount !== 1 ? 's' : ''}
                    </Badge>
                    <Badge
                      variant={p.status === 'completed' ? 'success' : 'secondary'}
                      className="text-[10px] capitalize"
                    >
                      {p.stage}
                    </Badge>
                  </div>
                </div>
              ))}
              {projects.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {projects.length - 10} more projects
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

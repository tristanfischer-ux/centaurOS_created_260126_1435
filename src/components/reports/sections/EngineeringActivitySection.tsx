'use client'

/**
 * @file EngineeringActivitySection.tsx
 *
 * @description CAD Lab project activity: total active, stage breakdown,
 * module generation stats, and a recent projects list.
 */

import { Cog, Box, Layers } from 'lucide-react'
import { format } from 'date-fns'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  StatCallout,
} from '@/components/reports/report-visuals'

import type { EngineeringActivitySectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

interface EngineeringActivitySectionProps extends EngineeringActivitySectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

const STAGE_COLORS: Record<string, string> = {
  research: 'bg-electric-blue',
  design: 'bg-international-orange',
  generation: 'bg-status-warning',
  review: 'bg-purple-500',
  complete: 'bg-status-success',
}

export function EngineeringActivitySection({
  totalActive,
  createdThisPeriod,
  completedThisPeriod,
  byStage,
  byStatus,
  totalModulesGenerated,
  recentProjects,
  sectionNarrative,
  templateId,
  sectionNumber,
}: EngineeringActivitySectionProps): React.JSX.Element {
  const isEmpty = totalActive === 0 && createdThisPeriod === 0

  return (
    <div className="space-y-8">
      <ReportSectionHeader
        title="Engineering Activity"
        icon={Cog}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      <SectionNarrativeIntro narrative={sectionNarrative} />

      {isEmpty ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Cog className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No engineering activity this period.</p>
        </div>
      ) : (
        <>
          {/* Summary pills */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs">
              {totalActive} Active
            </Badge>
            {createdThisPeriod > 0 && (
              <Badge variant="secondary" className="text-xs">
                +{createdThisPeriod} New
              </Badge>
            )}
            {completedThisPeriod > 0 && (
              <Badge variant="success" className="text-xs">
                {completedThisPeriod} Completed
              </Badge>
            )}
            {totalModulesGenerated > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Layers className="h-3 w-3 mr-1" />
                {totalModulesGenerated} Modules
              </Badge>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <StatCallout value={String(totalActive)} label="Active Projects" size="sm" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <StatCallout value={String(createdThisPeriod)} label="Created This Period" size="sm" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <StatCallout value={String(totalModulesGenerated)} label="Total Modules" size="sm" />
              </CardContent>
            </Card>
          </div>

          {/* By Stage */}
          {byStage.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                By Stage
              </h3>
              <div className="flex flex-wrap gap-3">
                {byStage.map(({ stage, count }) => (
                  <div key={stage} className="flex items-center gap-2 text-sm">
                    <span className={cn(
                      'inline-block h-2 w-2 rounded-full',
                      STAGE_COLORS[stage.toLowerCase()] ?? 'bg-muted-foreground',
                    )} />
                    <span className="text-muted-foreground capitalize">{stage}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent projects */}
          {recentProjects.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Projects
              </h3>
              <div className="space-y-2">
                {recentProjects.map((project) => (
                  <Card key={project.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-international-orange/10">
                          <Box className="h-4 w-4 text-international-orange" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{project.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(project.createdAt), 'd MMM yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {project.stage}
                        </Badge>
                        <Badge
                          variant={project.status === 'completed' ? 'success' : 'secondary'}
                          className="text-[10px] capitalize"
                        >
                          {project.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

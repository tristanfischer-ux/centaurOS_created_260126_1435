'use client'

/**
 * @file KnowledgeLearningSection.tsx
 *
 * @description Knowledge vault contributions and apprenticeship programme
 * progress. Two sub-panels: knowledge stats and apprenticeship metrics.
 */

import { BookOpen, GraduationCap, FileCheck, Clock } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  ProgressBar,
  StatCallout,
} from '@/components/reports/report-visuals'

import type { KnowledgeLearningSectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

interface KnowledgeLearningSectionProps extends KnowledgeLearningSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

export function KnowledgeLearningSection({
  knowledge,
  apprenticeships,
  sectionNarrative,
  templateId,
  sectionNumber,
}: KnowledgeLearningSectionProps): React.JSX.Element {
  const isEmpty = knowledge.totalNotes === 0 && apprenticeships.activeEnrollments === 0

  return (
    <div className="space-y-8">
      <ReportSectionHeader
        title="Knowledge & Learning"
        icon={BookOpen}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      <SectionNarrativeIntro narrative={sectionNarrative} />

      {isEmpty ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No knowledge or apprenticeship activity recorded.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Knowledge Vault */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-international-orange/10">
                  <BookOpen className="h-4 w-4 text-international-orange" />
                </div>
                <h3 className="text-sm font-semibold">Knowledge Vault</h3>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xl font-bold font-display">{knowledge.totalNotes}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold font-display text-international-orange">
                    +{knowledge.addedThisPeriod}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">New</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold font-display text-status-success">
                    {knowledge.verifiedCount}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Verified</p>
                </div>
              </div>

              {/* Top domains */}
              {knowledge.topDomains.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Top Domains
                  </p>
                  {knowledge.topDomains.map(({ name, count }) => (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground truncate">{name}</span>
                      <Badge variant="secondary" className="text-[10px] ml-2">
                        {count}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {/* By type */}
              {knowledge.byType.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {knowledge.byType.map(({ type, count }) => (
                    <Badge key={type} variant="secondary" className="text-[10px] capitalize">
                      {type}: {count}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Apprenticeships */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-electric-blue/10">
                  <GraduationCap className="h-4 w-4 text-electric-blue" />
                </div>
                <h3 className="text-sm font-semibold">Apprenticeships</h3>
              </div>

              {apprenticeships.activeEnrollments === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No active enrolments.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <p className="text-xl font-bold font-display">{apprenticeships.activeEnrollments}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold font-display text-status-success">
                        {apprenticeships.modulesCompleted}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Modules Done</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        OTJ Hours
                      </div>
                      <span className="font-semibold">{apprenticeships.otjtHoursLogged}h</span>
                    </div>

                    {apprenticeships.reviewsDue > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <FileCheck className="h-3.5 w-3.5" />
                          Reviews Due
                        </div>
                        <Badge variant="warning" className="text-[10px]">
                          {apprenticeships.reviewsDue}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Average progress */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Average Progress</p>
                      <p className="text-xs font-semibold">{apprenticeships.averageProgress}%</p>
                    </div>
                    <ProgressBar
                      value={apprenticeships.averageProgress}
                      color={
                        apprenticeships.averageProgress >= 75 ? 'success'
                          : apprenticeships.averageProgress >= 40 ? 'warning'
                          : 'orange'
                      }
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

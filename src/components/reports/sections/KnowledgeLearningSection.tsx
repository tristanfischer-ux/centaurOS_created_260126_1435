'use client'

/**
 * @file KnowledgeLearningSection.tsx
 *
 * @description Knowledge vault contributions and apprenticeship programme
 * progress. Two sub-panels: knowledge stats and apprenticeship metrics.
 */

import { useId } from 'react'
import { BookOpen, GraduationCap, FileCheck, Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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

const INTERNATIONAL_ORANGE = 'hsl(14, 100%, 50%)'
const AXIS_TICK_COLOR = 'hsl(215, 16%, 47%)'
const GRID_COLOR = '#e2e8f0'
const TOOLTIP_BORDER = 'hsl(214, 32%, 91%)'

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
  const uid = useId()
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

              {/* Top domains chart */}
              {knowledge.topDomains.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Top Domains
                  </p>
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={knowledge.topDomains} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
                        <defs>
                          <linearGradient id={`${uid}-domainBarGradient`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={INTERNATIONAL_ORANGE} stopOpacity={1} />
                            <stop offset="100%" stopColor={INTERNATIONAL_ORANGE} stopOpacity={0.6} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: AXIS_TICK_COLOR }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          dataKey="name"
                          type="category"
                          tick={{ fontSize: 11, fill: AXIS_TICK_COLOR }}
                          axisLine={false}
                          tickLine={false}
                          width={80}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: '8px',
                            border: `1px solid ${TOOLTIP_BORDER}`,
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                            fontSize: '13px',
                          }}
                        />
                        <Bar
                          dataKey="count"
                          name="Notes"
                          fill={`url(#${uid}-domainBarGradient)`}
                          radius={[0, 4, 4, 0]}
                          maxBarSize={20}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

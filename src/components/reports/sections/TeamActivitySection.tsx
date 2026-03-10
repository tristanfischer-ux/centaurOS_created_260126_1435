'use client'

/**
 * @file TeamActivitySection.tsx
 *
 * @description Visual team activity section with contributor cards, activity
 * bars, and summary stats — replacing the plain HTML table with a rich,
 * magazine-style layout.
 */

import { useId } from 'react'
import { Users, Trophy } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

import { UserAvatar } from '@/components/ui/user-avatar'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ReportSectionHeader, SectionNarrativeIntro } from '@/components/reports/report-visuals'

import type { TeamActivitySectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

const INTERNATIONAL_ORANGE = 'hsl(14, 100%, 50%)'
const AXIS_TICK_COLOR = 'hsl(215, 16%, 47%)'
const GRID_COLOR = '#e2e8f0'
const TOOLTIP_BORDER = 'hsl(214, 32%, 91%)'

interface TeamActivitySectionProps extends TeamActivitySectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

const PODIUM_ACCENTS = [
  'border-l-4 border-l-international-orange bg-international-orange/[0.03]',
  'border-l-4 border-l-electric-blue bg-electric-blue/[0.03]',
  'border-l-4 border-l-status-success bg-status-success/[0.03]',
]

export function TeamActivitySection({
  members,
  totalTeamCompleted,
  standupParticipationRate,
  sectionNarrative,
  templateId,
  sectionNumber,
}: TeamActivitySectionProps): React.JSX.Element {
  const uid = useId()
  const sorted = [...members].sort((a, b) => b.tasksCompleted - a.tasksCompleted)
  const maxTasks = sorted[0]?.tasksCompleted || 1
  const uniqueContributors = members.filter((m) => m.tasksCompleted > 0).length
  const topThree = sorted.slice(0, 3)
  const remaining = sorted.slice(3)

  return (
    <section className="space-y-8">
      <ReportSectionHeader
        title="Team Activity"
        icon={Users}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />
      <SectionNarrativeIntro narrative={sectionNarrative} />

      {/* Summary stat pills */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{totalTeamCompleted}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Tasks Completed</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{uniqueContributors}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Contributors</p>
        </div>
        {standupParticipationRate != null && (
          <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-center">
            <p className="text-2xl font-display font-bold text-foreground">
              {Math.round(standupParticipationRate)}%
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Standup Rate</p>
          </div>
        )}
      </div>

      {/* Team bar chart */}
      {sorted.length > 0 && sorted[0].tasksCompleted > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sorted.filter(m => m.tasksCompleted > 0).slice(0, 8)}
                  layout="vertical"
                  margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
                >
                  <defs>
                    <linearGradient id={`${uid}-teamBarGradient`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={INTERNATIONAL_ORANGE} stopOpacity={1} />
                      <stop offset="100%" stopColor={INTERNATIONAL_ORANGE} stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                    axisLine={false}
                    tickLine={false}
                    width={100}
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
                    dataKey="tasksCompleted"
                    name="Tasks Completed"
                    fill={`url(#${uid}-teamBarGradient)`}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top 3 contributors — highlighted cards */}
      {topThree.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-international-orange" />
            <span className="text-sm font-medium text-foreground">Top Contributors</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topThree.map((member, index) => (
              <Card
                key={member.id}
                className={cn('overflow-hidden', PODIUM_ACCENTS[index])}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <UserAvatar
                      name={member.name}
                      role={member.role}
                      avatarUrl={member.avatarUrl}
                      size="md"
                      showTooltip={false}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {member.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.role ?? 'Team Member'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Tasks completed</span>
                      <span className="text-sm font-bold text-foreground tabular-nums">
                        {member.tasksCompleted}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          index === 0 ? 'bg-international-orange' :
                          index === 1 ? 'bg-electric-blue' :
                          'bg-status-success'
                        )}
                        style={{ width: `${(member.tasksCompleted / maxTasks) * 100}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Remaining team members — compact list with activity bars */}
      {remaining.length > 0 && (
        <div className="space-y-2">
          {remaining.map((member, index) => (
            <div
              key={member.id}
              className={cn(
                'flex items-center gap-4 rounded-lg px-4 py-3',
                index % 2 === 0 ? 'bg-muted/30' : 'bg-background'
              )}
            >
              <span className="w-6 text-xs text-muted-foreground tabular-nums text-right">
                {index + 4}
              </span>
              <UserAvatar
                name={member.name}
                role={member.role}
                avatarUrl={member.avatarUrl}
                size="sm"
                showTooltip={false}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {member.name}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-muted-foreground/40 transition-all"
                    style={{ width: `${(member.tasksCompleted / maxTasks) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium tabular-nums text-foreground w-8 text-right">
                  {member.tasksCompleted}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

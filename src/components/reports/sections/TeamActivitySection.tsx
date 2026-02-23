'use client'

/**
 * @file TeamActivitySection.tsx
 *
 * @description Visual team activity section with contributor cards, activity
 * bars, and summary stats — replacing the plain HTML table with a rich,
 * magazine-style layout.
 */

import { Users, Trophy } from 'lucide-react'

import { UserAvatar } from '@/components/ui/user-avatar'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ReportSectionHeader, SectionNarrativeIntro } from '@/components/reports/report-visuals'

import type { TeamActivitySectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

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

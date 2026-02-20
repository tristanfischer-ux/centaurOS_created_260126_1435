'use client'

import { UserAvatar } from '@/components/ui/user-avatar'
import { cn } from '@/lib/utils'

import type { TeamActivitySectionData } from '@/lib/reports/report-document-types'

type TeamActivitySectionProps = TeamActivitySectionData

export function TeamActivitySection({
  members,
  totalTeamCompleted,
  standupParticipationRate,
}: TeamActivitySectionProps) {
  const sorted = [...members].sort((a, b) => b.tasksCompleted - a.tasksCompleted)
  const uniqueContributors = members.filter((m) => m.tasksCompleted > 0).length

  return (
    <section className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-international-orange" />
        <h2 className="text-2xl font-display font-bold text-foreground">
          Team Activity
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          {totalTeamCompleted} task{totalTeamCompleted !== 1 ? 's' : ''} completed by{' '}
          {uniqueContributors} team member{uniqueContributors !== 1 ? 's' : ''}
        </span>
        {standupParticipationRate != null && (
          <span>
            Standup participation: {Math.round(standupParticipationRate)}%
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-muted">
              <th className="pb-3 text-left font-medium text-muted-foreground w-12">
                #
              </th>
              <th className="pb-3 text-left font-medium text-muted-foreground">
                Team Member
              </th>
              <th className="pb-3 text-left font-medium text-muted-foreground">
                Role
              </th>
              <th className="pb-3 text-right font-medium text-muted-foreground">
                Tasks Completed
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((member, index) => {
              const isTopContributor = index < 3
              return (
                <tr
                  key={member.id}
                  className={cn(
                    'border-b border-muted',
                    index % 2 === 1 && 'bg-muted/30',
                    isTopContributor && 'font-medium'
                  )}
                >
                  <td className="py-3 text-muted-foreground">{index + 1}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={member.name}
                        role={member.role}
                        avatarUrl={member.avatarUrl}
                        size="sm"
                        showTooltip={false}
                      />
                      <span className="text-foreground">{member.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {member.role ?? '—'}
                  </td>
                  <td className="py-3 text-right tabular-nums text-foreground">
                    {member.tasksCompleted}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

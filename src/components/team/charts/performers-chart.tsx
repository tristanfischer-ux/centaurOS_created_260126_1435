"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trophy } from "lucide-react"
import type { TeamMember } from "../team-analytics"

interface TopPerformersChartProps {
  members: TeamMember[]
}

/**
 * TopPerformersChart - Mini horizontal bars showing top completers.
 * 
 * @description Shows the top 5 team members by completed tasks.
 * Helps identify who's delivering the most and recognize high performers.
 */
export function TopPerformersChart({ members }: TopPerformersChartProps) {
  // Sort by completed tasks and take top 5
  const topPerformers = [...members]
    .filter(m => m.completedTasks > 0)
    .sort((a, b) => b.completedTasks - a.completedTasks)
    .slice(0, 5)

  const maxCompleted = topPerformers[0]?.completedTasks || 1

  // Get first name or truncate full name
  const getDisplayName = (fullName: string | null): string => {
    if (!fullName) return "Unknown"
    const firstName = fullName.split(" ")[0]
    return firstName.length > 10 ? firstName.slice(0, 8) + "…" : firstName
  }

  // Handle empty state
  if (topPerformers.length === 0) {
    return (
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-muted-foreground" />
            Top Performers
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[100px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No completions yet</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Trophy className="h-4 w-4 text-status-warning" />
          Top Performers
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-1.5">
          {topPerformers.map((member, index) => {
            const barWidth = (member.completedTasks / maxCompleted) * 100
            const isTop = index === 0
            
            return (
              <div key={member.id} className="flex items-center gap-2">
                {/* Rank indicator */}
                <span className={`text-[10px] w-3 text-right font-medium ${isTop ? 'text-status-warning' : 'text-muted-foreground'}`}>
                  {index + 1}
                </span>
                {/* Name */}
                <span className="text-[11px] w-16 truncate text-foreground">
                  {getDisplayName(member.full_name)}
                </span>
                {/* Progress bar */}
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      isTop ? 'bg-status-warning' : 'bg-status-success'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                {/* Count */}
                <span className={`text-[10px] w-6 text-right font-medium ${isTop ? 'text-status-warning' : 'text-muted-foreground'}`}>
                  {member.completedTasks}
                </span>
              </div>
            )
          })}
        </div>
        {/* Total completed */}
        <div className="text-[10px] text-muted-foreground mt-2 text-center">
          {members.reduce((sum, m) => sum + m.completedTasks, 0)} tasks completed by team
        </div>
      </CardContent>
    </Card>
  )
}

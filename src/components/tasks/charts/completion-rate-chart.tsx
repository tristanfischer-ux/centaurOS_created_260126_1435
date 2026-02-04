"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { TrendingUp, CheckCircle2 } from "lucide-react"
import { isThisWeek, parseISO } from "date-fns"
import type { AnalyticsTask } from "../tasks-analytics"

interface CompletionRateChartProps {
  tasks: AnalyticsTask[]
}

/**
 * CompletionRateChart - Progress ring showing completion rate.
 * 
 * @description Shows overall completion percentage and highlights
 * tasks completed this week for momentum tracking.
 */
export function CompletionRateChart({ tasks }: CompletionRateChartProps) {
  const completedTasks = tasks.filter(t => t.status === 'Completed')
  const nonRejectedTasks = tasks.filter(t => t.status !== 'Rejected')
  
  // Count completed this week (based on when status changed, approximated by updated_at if available)
  // For now, we'll show all-time completion rate
  const completedCount = completedTasks.length
  const totalCount = nonRejectedTasks.length
  
  const completionRate = totalCount > 0 
    ? Math.round((completedCount / totalCount) * 100) 
    : 0

  // Calculate remaining (in progress)
  const inProgressCount = totalCount - completedCount

  const data = [
    { name: "Completed", value: completedCount, color: "hsl(var(--status-success))" },
    { name: "Remaining", value: inProgressCount, color: "hsl(var(--muted))" },
  ].filter(d => d.value > 0)

  // If no data, show empty ring
  if (data.length === 0) {
    data.push({ name: "Empty", value: 1, color: "hsl(var(--muted))" })
  }

  // Determine health status
  let healthStatus = ""
  let healthColor = "text-muted-foreground"
  if (completionRate >= 75) {
    healthStatus = "Strong progress"
    healthColor = "text-status-success"
  } else if (completionRate >= 50) {
    healthStatus = "On track"
    healthColor = "text-status-info"
  } else if (completionRate >= 25) {
    healthStatus = "Building momentum"
    healthColor = "text-muted-foreground"
  }

  // Handle empty state
  if (totalCount === 0) {
    return (
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Completion
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[100px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No tasks yet</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Completion
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[100px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={45}
                startAngle={90}
                endAngle={-270}
                paddingAngle={0}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="flex items-center gap-0.5">
              <CheckCircle2 className="h-3 w-3 text-status-success" />
              <span className="text-lg font-bold text-foreground">{completionRate}%</span>
            </div>
            <span className="text-[10px] text-muted-foreground">complete</span>
          </div>
        </div>
        {/* Summary */}
        <div className="flex items-center justify-center gap-1 mt-2 text-[10px]">
          <span className="text-muted-foreground">{completedCount} of {totalCount} done</span>
          {healthStatus && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className={`font-medium ${healthColor}`}>{healthStatus}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

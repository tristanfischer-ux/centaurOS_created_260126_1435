"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { HeartPulse } from "lucide-react"
import { isPast, parseISO, differenceInDays } from "date-fns"
import type { AnalyticsObjective } from "../objectives-analytics"

interface HealthOverviewChartProps {
  objectives: AnalyticsObjective[]
}

/**
 * HealthOverviewChart - Donut chart showing objective portfolio health.
 * 
 * @description Categorizes objectives as healthy, at risk, or critical
 * based on overdue tasks and stalled progress.
 */
export function HealthOverviewChart({ objectives }: HealthOverviewChartProps) {
  // Calculate health for each objective
  const categorized = objectives.map(obj => {
    const taskCount = obj.tasks.length
    const completedCount = obj.tasks.filter(t => t.status === 'Completed').length
    const progress = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0
    
    // Count overdue tasks (non-completed with past due date)
    const overdueCount = obj.tasks.filter(t => {
      if (t.status === 'Completed' || t.status === 'Rejected') return false
      if (!t.end_date) return false
      return isPast(parseISO(t.end_date))
    }).length
    
    // Check if stalled (> 7 days old, 0% progress, has tasks)
    const isStalled = obj.created_at && 
      differenceInDays(new Date(), parseISO(obj.created_at)) > 7 &&
      progress === 0 &&
      taskCount > 0
    
    // Determine health status
    let health: 'healthy' | 'at_risk' | 'critical' = 'healthy'
    if (overdueCount > 2 && isStalled) {
      health = 'critical'
    } else if (overdueCount > 0 || isStalled) {
      health = 'at_risk'
    }
    
    return { ...obj, progress, overdueCount, isStalled, health }
  })

  const healthy = categorized.filter(o => o.health === 'healthy').length
  const atRisk = categorized.filter(o => o.health === 'at_risk').length
  const critical = categorized.filter(o => o.health === 'critical').length
  const total = objectives.length

  const data = [
    { name: "Healthy", value: healthy, color: "hsl(var(--status-success))" },
    { name: "At Risk", value: atRisk, color: "hsl(var(--status-warning))" },
    { name: "Critical", value: critical, color: "hsl(var(--status-error))" },
  ].filter(d => d.value > 0)

  // Handle empty state
  if (total === 0) {
    return (
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-muted-foreground" />
            Health Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[100px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No objectives yet</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-muted-foreground" />
          Health Overview
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
                paddingAngle={2}
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
            <span className="text-lg font-bold text-foreground">{healthy}/{total}</span>
            <span className="text-[10px] text-muted-foreground">healthy</span>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-3 mt-2 text-[10px]">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center gap-1">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

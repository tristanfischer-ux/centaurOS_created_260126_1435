"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { ShieldAlert } from "lucide-react"
import type { AnalyticsTask } from "../tasks-analytics"

interface RiskLevelChartProps {
  tasks: AnalyticsTask[]
}

/**
 * RiskLevelChart - Donut chart showing risk level distribution.
 * 
 * @description Shows active tasks by risk level to help prioritize
 * attention on Critical and High risk items.
 */
export function RiskLevelChart({ tasks }: RiskLevelChartProps) {
  // Only count active (non-completed) tasks
  const activeTasks = tasks.filter(t => 
    t.status !== 'Completed' && t.status !== 'Rejected'
  )

  // Count by risk level
  const critical = activeTasks.filter(t => t.risk_level === 'Critical').length
  const high = activeTasks.filter(t => t.risk_level === 'High').length
  const medium = activeTasks.filter(t => t.risk_level === 'Medium').length
  const low = activeTasks.filter(t => t.risk_level === 'Low' || !t.risk_level).length

  const data = [
    { name: "Critical", value: critical, color: "hsl(var(--status-error))" },
    { name: "High", value: high, color: "hsl(var(--status-warning))" },
    { name: "Medium", value: medium, color: "hsl(45 93% 47%)" }, // amber
    { name: "Low", value: low, color: "hsl(var(--status-success))" },
  ].filter(d => d.value > 0)

  const highPriorityCount = critical + high
  const totalActive = activeTasks.length

  // Handle empty state
  if (totalActive === 0) {
    return (
      <Card className="rounded-xl border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-muted/50">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            </div>
            Risk Level
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[100px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No active tasks</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-xl border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-muted/50">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </div>
          Risk Level
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
            <span className="text-lg font-bold text-foreground">{totalActive}</span>
            <span className="text-[10px] text-muted-foreground">active</span>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-3 mt-2 text-[10px]">
          {highPriorityCount > 0 && (
            <span className="text-status-error font-medium">{highPriorityCount} high priority</span>
          )}
          {highPriorityCount === 0 && (
            <span className="text-status-success font-medium">All low risk</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

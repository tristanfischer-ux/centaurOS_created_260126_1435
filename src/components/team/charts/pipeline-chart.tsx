"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts"
import { Activity } from "lucide-react"
import type { TeamMember } from "../team-analytics"

interface TaskPipelineChartProps {
  members: TeamMember[]
}

/**
 * TaskPipelineChart - Horizontal bar showing task distribution by status.
 * 
 * @description Shows where work is in the pipeline across the team.
 * Helps identify bottlenecks (too many pending) or throughput issues
 * (too many active with few completed).
 */
export function TaskPipelineChart({ members }: TaskPipelineChartProps) {
  // Aggregate task counts across all members
  const totals = members.reduce(
    (acc, member) => ({
      active: acc.active + member.activeTasks,
      pending: acc.pending + member.pendingTasks,
      completed: acc.completed + member.completedTasks,
      rejected: acc.rejected + member.rejectedTasks,
    }),
    { active: 0, pending: 0, completed: 0, rejected: 0 }
  )

  const data = [
    { name: "Active", value: totals.active, color: "hsl(var(--status-info))" },
    { name: "Pending", value: totals.pending, color: "hsl(var(--status-warning))" },
    { name: "Done", value: totals.completed, color: "hsl(var(--status-success))" },
    { name: "Rejected", value: totals.rejected, color: "hsl(var(--status-error))" },
  ]

  const totalTasks = totals.active + totals.pending + totals.completed + totals.rejected

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { 
    active?: boolean
    payload?: Array<{ name: string; value: number; payload: { color: string } }>
  }) => {
    if (active && payload && payload.length) {
      const item = payload[0]
      return (
        <div className="bg-background p-2 border rounded-lg shadow-lg text-xs">
          <p className="font-medium">{item.name}</p>
          <p className="text-muted-foreground">{item.value} tasks</p>
        </div>
      )
    }
    return null
  }

  // Handle empty state
  if (totalTasks === 0) {
    return (
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Task Pipeline
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
          <Activity className="h-4 w-4 text-muted-foreground" />
          Task Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[100px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={data} 
              layout="vertical"
              margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
              <Bar 
                dataKey="value" 
                radius={[0, 4, 4, 0]}
                barSize={14}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Summary line */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2 px-1">
          <span>{totalTasks} total tasks</span>
          {totals.active > 0 && totals.pending > totals.active * 2 && (
            <span className="text-status-warning font-medium">High backlog</span>
          )}
          {totals.completed > totals.active + totals.pending && (
            <span className="text-status-success font-medium">Good throughput</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

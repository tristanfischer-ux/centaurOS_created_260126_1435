"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts"
import { GitBranch } from "lucide-react"
import type { AnalyticsTask } from "../tasks-analytics"

interface StatusFunnelChartProps {
  tasks: AnalyticsTask[]
}

/**
 * StatusFunnelChart - Horizontal bar showing task distribution by status.
 * 
 * @description Shows where tasks are in the workflow pipeline.
 * Helps identify bottlenecks (too many pending? stuck in approval?).
 */
export function StatusFunnelChart({ tasks }: StatusFunnelChartProps) {
  // Categorize tasks by workflow stage
  const pending = tasks.filter(t => t.status === 'Pending').length
  const inProgress = tasks.filter(t => t.status === 'Accepted').length
  const awaitingApproval = tasks.filter(t => 
    t.status === 'Pending_Peer_Review' || 
    t.status === 'Pending_Executive_Approval' ||
    t.status === 'Amended_Pending_Approval'
  ).length
  const amended = tasks.filter(t => t.status === 'Amended').length
  const completed = tasks.filter(t => t.status === 'Completed').length
  const rejected = tasks.filter(t => t.status === 'Rejected').length

  const data = [
    { name: "Pending", value: pending, color: "hsl(var(--status-warning))" },
    { name: "Active", value: inProgress, color: "hsl(var(--status-info))" },
    { name: "Review", value: awaitingApproval, color: "hsl(142 76% 36%)" }, // purple-ish
    { name: "Done", value: completed, color: "hsl(var(--status-success))" },
  ].filter(d => d.value > 0)

  // Determine insight message
  let insight = ""
  if (pending > inProgress * 2 && pending > 3) {
    insight = "Tasks piling up"
  } else if (awaitingApproval > inProgress && awaitingApproval > 2) {
    insight = "Review bottleneck"
  } else if (completed > pending + inProgress) {
    insight = "Good flow"
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { 
    active?: boolean
    payload?: Array<{ name: string; value: number }>
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background p-2 border rounded-lg shadow-lg text-xs">
          <p className="font-medium">{payload[0].name}</p>
          <p className="text-muted-foreground">{payload[0].value} tasks</p>
        </div>
      )
    }
    return null
  }

  const totalTasks = tasks.length

  // Handle empty state
  if (totalTasks === 0) {
    return (
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            Status Funnel
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
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          Status Funnel
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
                width={45}
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
          <span>{totalTasks} total</span>
          {insight && (
            <span className={insight === "Good flow" ? "text-status-success font-medium" : "text-status-warning font-medium"}>
              {insight}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

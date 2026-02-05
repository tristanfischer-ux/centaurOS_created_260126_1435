"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ListTodo } from "lucide-react"
import type { AnalyticsObjective } from "../objectives-analytics"

interface TaskStatusMixChartProps {
  objectives: AnalyticsObjective[]
}

/**
 * TaskStatusMixChart - Stacked horizontal bar showing task status mix.
 * 
 * @description Shows proportion of all tasks across objectives by status.
 * Helps identify if work is flowing or stuck.
 */
export function TaskStatusMixChart({ objectives }: TaskStatusMixChartProps) {
  // Flatten all tasks from all objectives
  const allTasks = objectives.flatMap(obj => obj.tasks)
  
  // Count by status
  const completed = allTasks.filter(t => t.status === 'Completed').length
  const inProgress = allTasks.filter(t => t.status === 'Accepted').length
  const pending = allTasks.filter(t => t.status === 'Pending').length
  const review = allTasks.filter(t => 
    t.status === 'Pending_Peer_Review' || 
    t.status === 'Pending_Executive_Approval' ||
    t.status === 'Amended_Pending_Approval'
  ).length
  const blocked = allTasks.filter(t => t.status === 'Rejected' || t.status === 'Amended').length
  
  const total = allTasks.length

  const segments = [
    { label: "Done", value: completed, color: "bg-status-success", textColor: "text-status-success" },
    { label: "Active", value: inProgress, color: "bg-status-info", textColor: "text-status-info" },
    { label: "Review", value: review, color: "bg-purple-500", textColor: "text-purple-600" },
    { label: "Pending", value: pending, color: "bg-status-warning", textColor: "text-status-warning" },
    { label: "Blocked", value: blocked, color: "bg-status-error", textColor: "text-status-error" },
  ].filter(s => s.value > 0)

  // Handle empty state
  if (total === 0) {
    return (
      <Card className="rounded-xl border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-muted-foreground" />
            Task Flow
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

  // Determine flow status
  let flowStatus = ""
  let flowColor = "text-muted-foreground"
  const completionRate = (completed / total) * 100
  const blockedRate = (blocked / total) * 100
  
  if (completionRate > 60) {
    flowStatus = "Strong flow"
    flowColor = "text-status-success"
  } else if (blockedRate > 20) {
    flowStatus = "Flow blocked"
    flowColor = "text-status-error"
  } else if (pending > inProgress * 2) {
    flowStatus = "Backlog building"
    flowColor = "text-status-warning"
  }

  return (
    <Card className="rounded-xl border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          Task Flow
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[100px] flex flex-col justify-center">
          {/* Stacked horizontal bar */}
          <div className="h-6 flex rounded-full overflow-hidden bg-muted">
            {segments.map((segment) => {
              const widthPercent = (segment.value / total) * 100
              return (
                <div 
                  key={segment.label}
                  className={`${segment.color} transition-all`}
                  style={{ width: `${widthPercent}%` }}
                  title={`${segment.label}: ${segment.value}`}
                />
              )
            })}
          </div>
          
          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-4 text-[10px]">
            {segments.map((segment) => (
              <div key={segment.label} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${segment.color}`} />
                <span className="text-muted-foreground">{segment.value} {segment.label.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Summary */}
        <div className="flex items-center justify-center text-[10px] mt-2">
          <span className="text-muted-foreground">{total} tasks</span>
          {flowStatus && (
            <>
              <span className="text-muted-foreground mx-1">·</span>
              <span className={`font-medium ${flowColor}`}>{flowStatus}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

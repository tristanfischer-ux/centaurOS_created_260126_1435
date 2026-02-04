"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Clock, CheckCircle, AlertTriangle } from "lucide-react"
import { isPast, parseISO, differenceInDays } from "date-fns"
import type { AnalyticsObjective } from "../objectives-analytics"

interface AttentionNeededChartProps {
  objectives: AnalyticsObjective[]
}

/**
 * AttentionNeededChart - Alert summary showing items requiring action.
 * 
 * @description Lists stalled objectives, overdue tasks, and items
 * awaiting approval. Direct calls to action.
 */
export function AttentionNeededChart({ objectives }: AttentionNeededChartProps) {
  // Calculate metrics
  let stalledCount = 0
  let overdueTaskCount = 0
  let awaitingApprovalCount = 0

  objectives.forEach(obj => {
    const taskCount = obj.tasks.length
    const completedCount = obj.tasks.filter(t => t.status === 'Completed').length
    const progress = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0
    
    // Check if stalled (> 7 days old, 0% progress, has tasks)
    if (obj.created_at && 
        differenceInDays(new Date(), parseISO(obj.created_at)) > 7 &&
        progress === 0 &&
        taskCount > 0) {
      stalledCount++
    }
    
    // Count overdue tasks
    obj.tasks.forEach(task => {
      if (task.status !== 'Completed' && task.status !== 'Rejected' && task.end_date) {
        if (isPast(parseISO(task.end_date))) {
          overdueTaskCount++
        }
      }
      
      // Count awaiting approval
      if (task.status === 'Pending_Peer_Review' || 
          task.status === 'Pending_Executive_Approval' ||
          task.status === 'Amended_Pending_Approval') {
        awaitingApprovalCount++
      }
    })
  })

  const totalIssues = stalledCount + overdueTaskCount + awaitingApprovalCount
  const hasIssues = totalIssues > 0

  // Handle all-clear state
  if (!hasIssues && objectives.length > 0) {
    return (
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            Attention Needed
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[100px] flex flex-col items-center justify-center gap-2">
            <CheckCircle className="h-8 w-8 text-status-success" />
            <p className="text-sm font-medium text-status-success">All clear!</p>
            <p className="text-[10px] text-muted-foreground">No issues detected</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Handle empty state
  if (objectives.length === 0) {
    return (
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            Attention Needed
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
          <AlertCircle className="h-4 w-4 text-status-warning" />
          Attention Needed
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[100px] flex flex-col justify-center space-y-2">
          {/* Stalled objectives */}
          {stalledCount > 0 && (
            <div className="flex items-center justify-between px-2 py-1.5 rounded bg-status-warning-light">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-status-warning" />
                <span className="text-xs font-medium text-status-warning-dark">Stalled objectives</span>
              </div>
              <span className="text-sm font-bold text-status-warning-dark">{stalledCount}</span>
            </div>
          )}

          {/* Overdue tasks */}
          {overdueTaskCount > 0 && (
            <div className="flex items-center justify-between px-2 py-1.5 rounded bg-status-error-light">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-status-error" />
                <span className="text-xs font-medium text-status-error">Tasks overdue</span>
              </div>
              <span className="text-sm font-bold text-status-error">{overdueTaskCount}</span>
            </div>
          )}

          {/* Awaiting approval */}
          {awaitingApprovalCount > 0 && (
            <div className="flex items-center justify-between px-2 py-1.5 rounded bg-muted">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-status-info" />
                <span className="text-xs font-medium text-muted-foreground">Awaiting review</span>
              </div>
              <span className="text-sm font-bold text-foreground">{awaitingApprovalCount}</span>
            </div>
          )}
        </div>
        
        {/* Summary */}
        <div className="flex items-center justify-center text-[10px] text-muted-foreground mt-2">
          <span className="text-status-warning font-medium">{totalIssues} items need attention</span>
        </div>
      </CardContent>
    </Card>
  )
}

"use client"

import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle, CheckCircle, Gavel, AlertTriangle, Clock } from "lucide-react"
import type { AnalyticsActionTask, AnalyticsBlocker } from "../home-analytics"

interface ActionRequiredChartProps {
  overdueTasks: AnalyticsActionTask[]
  pendingDecisions: AnalyticsActionTask[]
  blockers: AnalyticsBlocker[]
  isExecutiveOrFounder: boolean
}

/**
 * ActionRequiredChart - Alert summary showing items needing attention.
 * 
 * @description Shows counts for pending decisions, blockers (exec only),
 * and overdue tasks. Direct calls to action.
 */
export function ActionRequiredChart({
  overdueTasks,
  pendingDecisions,
  blockers,
  isExecutiveOrFounder
}: ActionRequiredChartProps) {
  const overdueCount = overdueTasks.length
  const decisionsCount = pendingDecisions.length
  const blockersCount = blockers.length
  
  const totalActions = overdueCount + (isExecutiveOrFounder ? decisionsCount + blockersCount : 0)

  // Handle all-clear state
  if (totalActions === 0) {
    return (
      <Card className="border bg-background">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Actions</span>
          </div>
          <div className="h-[60px] flex flex-col items-center justify-center gap-1">
            <CheckCircle className="h-6 w-6 text-status-success" />
            <span className="text-[10px] font-medium text-status-success">All clear!</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border bg-background">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-status-warning" />
            <span className="text-xs font-medium text-muted-foreground">Actions</span>
          </div>
          <span className="text-[10px] font-semibold text-status-warning">{totalActions} need attention</span>
        </div>
        
        <div className="h-[60px] flex flex-col justify-center space-y-1">
          {/* Pending Decisions - Executive only */}
          {isExecutiveOrFounder && decisionsCount > 0 && (
            <div className="flex items-center justify-between px-1.5 py-1 rounded bg-purple-50">
              <div className="flex items-center gap-1.5">
                <Gavel className="h-3 w-3 text-purple-600" />
                <span className="text-[10px] font-medium text-purple-700">Decisions</span>
              </div>
              <span className="text-xs font-bold text-purple-700">{decisionsCount}</span>
            </div>
          )}
          
          {/* Blockers - Executive only */}
          {isExecutiveOrFounder && blockersCount > 0 && (
            <div className="flex items-center justify-between px-1.5 py-1 rounded bg-status-warning-light">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-status-warning" />
                <span className="text-[10px] font-medium text-status-warning-dark">Blockers</span>
              </div>
              <span className="text-xs font-bold text-status-warning-dark">{blockersCount}</span>
            </div>
          )}
          
          {/* Overdue Tasks */}
          {overdueCount > 0 && (
            <div className="flex items-center justify-between px-1.5 py-1 rounded bg-status-error-light">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-status-error" />
                <span className="text-[10px] font-medium text-status-error">Overdue</span>
              </div>
              <span className="text-xs font-bold text-status-error">{overdueCount}</span>
            </div>
          )}
          
          {/* If executive but nothing specific showing */}
          {isExecutiveOrFounder && decisionsCount === 0 && blockersCount === 0 && overdueCount > 0 && (
            <div className="text-center">
              <span className="text-[9px] text-muted-foreground">No blockers or decisions pending</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

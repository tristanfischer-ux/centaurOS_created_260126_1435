"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarClock, AlertTriangle, Clock, CalendarDays, HelpCircle } from "lucide-react"
import { isToday, isPast, isThisWeek, parseISO } from "date-fns"
import type { AnalyticsTask } from "../tasks-analytics"

interface DueDatesChartProps {
  tasks: AnalyticsTask[]
}

/**
 * DueDatesChart - Urgency indicator showing overdue and upcoming tasks.
 * 
 * @description Shows how many tasks are overdue, due today, due this week,
 * or have no due date. Helps prioritize immediate attention.
 */
export function DueDatesChart({ tasks }: DueDatesChartProps) {
  // Only count non-completed tasks for urgency
  const activeTasks = tasks.filter(t => 
    t.status !== 'Completed' && t.status !== 'Rejected'
  )

  // Categorize by due date
  let overdue = 0
  let dueToday = 0
  let dueThisWeek = 0
  let noDueDate = 0

  activeTasks.forEach(task => {
    if (!task.end_date) {
      noDueDate++
      return
    }
    
    const dueDate = parseISO(task.end_date)
    
    if (isPast(dueDate) && !isToday(dueDate)) {
      overdue++
    } else if (isToday(dueDate)) {
      dueToday++
    } else if (isThisWeek(dueDate)) {
      dueThisWeek++
    }
  })

  const urgentCount = overdue + dueToday

  // Handle empty state
  if (activeTasks.length === 0) {
    return (
      <Card className="rounded-xl border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-muted/50">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </div>
            Due Dates
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
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </div>
          Due Dates
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[100px] flex flex-col justify-center space-y-2">
          {/* Overdue - prominent if > 0 */}
          <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${overdue > 0 ? 'bg-status-error-light' : 'bg-muted/30'}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-3.5 w-3.5 ${overdue > 0 ? 'text-status-error' : 'text-muted-foreground'}`} />
              <span className={`text-xs font-medium ${overdue > 0 ? 'text-status-error' : 'text-muted-foreground'}`}>Overdue</span>
            </div>
            <span className={`text-sm font-bold ${overdue > 0 ? 'text-status-error' : 'text-muted-foreground'}`}>{overdue}</span>
          </div>

          {/* Due Today */}
          <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${dueToday > 0 ? 'bg-status-warning-light' : 'bg-muted/30'}`}>
            <div className="flex items-center gap-2">
              <Clock className={`h-3.5 w-3.5 ${dueToday > 0 ? 'text-status-warning' : 'text-muted-foreground'}`} />
              <span className={`text-xs font-medium ${dueToday > 0 ? 'text-status-warning-dark' : 'text-muted-foreground'}`}>Due Today</span>
            </div>
            <span className={`text-sm font-bold ${dueToday > 0 ? 'text-status-warning-dark' : 'text-muted-foreground'}`}>{dueToday}</span>
          </div>

          {/* Due This Week */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-status-info" />
              <span className="text-xs font-medium text-muted-foreground">This Week</span>
            </div>
            <span className="text-sm font-bold text-foreground">{dueThisWeek}</span>
          </div>
        </div>
        
        {/* Summary */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2 px-1">
          <span>{noDueDate > 0 ? `${noDueDate} no date` : ''}</span>
          {urgentCount > 0 && (
            <span className="text-status-error font-medium">{urgentCount} need attention</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

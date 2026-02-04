"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Activity, AlertTriangle, Clock, CalendarDays } from "lucide-react"
import type { AnalyticsActionTask, AnalyticsTaskDue } from "../home-analytics"

interface TodaysPulseChartProps {
  overdueTasks: AnalyticsActionTask[]
  tasksDueToday: AnalyticsTaskDue[]
  tasksDueThisWeek: AnalyticsTaskDue[]
}

/**
 * TodaysPulseChart - Urgency indicator showing task pressure.
 * 
 * @description Compact bars showing overdue, due today, and due this week
 * to give a quick sense of today's pressure level.
 */
export function TodaysPulseChart({ 
  overdueTasks, 
  tasksDueToday, 
  tasksDueThisWeek 
}: TodaysPulseChartProps) {
  const overdueCount = overdueTasks.length
  const todayCount = tasksDueToday.length
  const weekCount = tasksDueThisWeek.length
  
  const totalPressure = overdueCount + todayCount + weekCount
  const urgentCount = overdueCount + todayCount

  // Determine pressure level
  let pressureLevel = ""
  let pressureColor = "text-muted-foreground"
  if (overdueCount > 2) {
    pressureLevel = "High pressure"
    pressureColor = "text-status-error"
  } else if (urgentCount > 3) {
    pressureLevel = "Moderate"
    pressureColor = "text-status-warning"
  } else if (totalPressure > 0) {
    pressureLevel = "Manageable"
    pressureColor = "text-status-success"
  }

  // Handle empty state
  if (totalPressure === 0) {
    return (
      <Card className="border bg-background">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Today</span>
          </div>
          <div className="h-[60px] flex items-center justify-center">
            <div className="text-center">
              <span className="text-sm font-medium text-status-success">Clear schedule</span>
              <p className="text-[10px] text-muted-foreground">No urgent tasks</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Max value for bar scaling
  const maxCount = Math.max(overdueCount, todayCount, weekCount, 1)

  return (
    <Card className="border bg-background">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Today</span>
          </div>
          {pressureLevel && (
            <span className={`text-[10px] font-medium ${pressureColor}`}>{pressureLevel}</span>
          )}
        </div>
        
        <div className="h-[60px] flex flex-col justify-center space-y-1.5">
          {/* Overdue */}
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-3 w-3 flex-shrink-0 ${overdueCount > 0 ? 'text-status-error' : 'text-muted-foreground/30'}`} />
            <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-status-error rounded-full transition-all"
                style={{ width: `${(overdueCount / maxCount) * 100}%` }}
              />
            </div>
            <span className={`text-[10px] font-semibold w-4 text-right ${overdueCount > 0 ? 'text-status-error' : 'text-muted-foreground/50'}`}>
              {overdueCount}
            </span>
          </div>
          
          {/* Due Today */}
          <div className="flex items-center gap-2">
            <Clock className={`h-3 w-3 flex-shrink-0 ${todayCount > 0 ? 'text-status-warning' : 'text-muted-foreground/30'}`} />
            <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-status-warning rounded-full transition-all"
                style={{ width: `${(todayCount / maxCount) * 100}%` }}
              />
            </div>
            <span className={`text-[10px] font-semibold w-4 text-right ${todayCount > 0 ? 'text-status-warning-dark' : 'text-muted-foreground/50'}`}>
              {todayCount}
            </span>
          </div>
          
          {/* Due This Week */}
          <div className="flex items-center gap-2">
            <CalendarDays className={`h-3 w-3 flex-shrink-0 ${weekCount > 0 ? 'text-status-info' : 'text-muted-foreground/30'}`} />
            <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-status-info rounded-full transition-all"
                style={{ width: `${(weekCount / maxCount) * 100}%` }}
              />
            </div>
            <span className={`text-[10px] font-semibold w-4 text-right ${weekCount > 0 ? 'text-foreground' : 'text-muted-foreground/50'}`}>
              {weekCount}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

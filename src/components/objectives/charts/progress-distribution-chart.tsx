"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3 } from "lucide-react"
import type { AnalyticsObjective } from "../objectives-analytics"

interface ProgressDistributionChartProps {
  objectives: AnalyticsObjective[]
}

/**
 * ProgressDistributionChart - Histogram showing objectives by progress %.
 * 
 * @description Shows how many objectives are at each stage of completion.
 * Helps identify if work is stuck at the start or finishing strong.
 */
export function ProgressDistributionChart({ objectives }: ProgressDistributionChartProps) {
  // Calculate progress for each objective
  const withProgress = objectives.map(obj => {
    const taskCount = obj.tasks.length
    const completedCount = obj.tasks.filter(t => t.status === 'Completed').length
    const progress = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0
    return { ...obj, progress }
  })

  // Bucket into ranges
  const notStarted = withProgress.filter(o => o.progress === 0).length
  const early = withProgress.filter(o => o.progress > 0 && o.progress <= 25).length
  const mid = withProgress.filter(o => o.progress > 25 && o.progress <= 50).length
  const late = withProgress.filter(o => o.progress > 50 && o.progress <= 75).length
  const almostDone = withProgress.filter(o => o.progress > 75 && o.progress < 100).length
  const complete = withProgress.filter(o => o.progress === 100).length

  const buckets = [
    { label: "0%", value: notStarted, color: "bg-muted" },
    { label: "1-25%", value: early, color: "bg-status-error" },
    { label: "26-50%", value: mid, color: "bg-status-warning" },
    { label: "51-75%", value: late, color: "bg-status-info" },
    { label: "76-99%", value: almostDone, color: "bg-electric-blue" },
    { label: "100%", value: complete, color: "bg-status-success" },
  ]

  const maxValue = Math.max(...buckets.map(b => b.value), 1)
  const total = objectives.length

  // Handle empty state
  if (total === 0) {
    return (
      <Card className="rounded-xl border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Progress Distribution
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
    <Card className="rounded-xl border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Progress Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[100px] flex items-end justify-between gap-1 px-1">
          {buckets.map((bucket) => {
            const heightPercent = (bucket.value / maxValue) * 100
            return (
              <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col items-center justify-end h-[70px]">
                  {bucket.value > 0 && (
                    <span className="text-[9px] text-muted-foreground mb-0.5">{bucket.value}</span>
                  )}
                  <div 
                    className={`w-full rounded-t ${bucket.color} transition-all`}
                    style={{ height: `${Math.max(heightPercent, bucket.value > 0 ? 10 : 0)}%` }}
                  />
                </div>
                <span className="text-[8px] text-muted-foreground">{bucket.label}</span>
              </div>
            )
          })}
        </div>
        {/* Summary */}
        <div className="flex items-center justify-center text-[10px] text-muted-foreground mt-2">
          {notStarted > 0 && notStarted === total ? (
            <span className="text-status-warning font-medium">All not started</span>
          ) : complete > total / 2 ? (
            <span className="text-status-success font-medium">Finishing strong</span>
          ) : notStarted > total / 2 ? (
            <span className="text-status-warning font-medium">Many not started</span>
          ) : (
            <span>{total} objectives total</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

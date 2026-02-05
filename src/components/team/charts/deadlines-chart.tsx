"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts"
import { CalendarClock } from "lucide-react"
import { isToday, isThisWeek, isThisMonth, parseISO } from "date-fns"

interface TaskDeadlinesChartProps {
  /** All task end_date values (null entries have no deadline) */
  taskEndDates: (string | null)[]
}

/**
 * TaskDeadlinesChart - Bar chart showing tasks due today, this week, and this month.
 *
 * @description Provides a quick visual of upcoming deadline pressure.
 * Helps teams see how work is distributed across time horizons.
 *
 * @param taskEndDates Array of ISO date strings (or null) from all non-completed tasks
 */
export function TaskDeadlinesChart({ taskEndDates }: TaskDeadlinesChartProps) {
  // Parse all non-null deadline dates
  const activeDates = taskEndDates
    .filter((d): d is string => d !== null)
    .map(d => parseISO(d))

  const dueToday = activeDates.filter(d => isToday(d)).length
  const dueThisWeek = activeDates.filter(d => isThisWeek(d, { weekStartsOn: 1 })).length
  const dueThisMonth = activeDates.filter(d => isThisMonth(d)).length

  const data = [
    { label: "Today", count: dueToday, color: "hsl(var(--status-error))" },
    { label: "This Week", count: dueThisWeek, color: "hsl(var(--status-warning))" },
    { label: "This Month", count: dueThisMonth, color: "hsl(var(--status-info))" },
  ]

  const maxCount = Math.max(...data.map(d => d.count), 1)

  // Empty state
  if (activeDates.length === 0) {
    return (
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Task Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[100px] flex flex-col items-center justify-center gap-2">
            <CalendarClock className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-[11px] text-muted-foreground text-center">
              No upcoming deadlines
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-status-warning" />
          Task Deadlines
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[100px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
              barCategoryGap="20%"
            >
              <XAxis
                type="number"
                hide
                domain={[0, maxCount]}
              />
              <YAxis
                type="category"
                dataKey="label"
                axisLine={false}
                tickLine={false}
                width={75}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                barSize={16}
                label={{
                  position: "right",
                  fontSize: 12,
                  fontWeight: 600,
                  fill: "hsl(var(--foreground))",
                }}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

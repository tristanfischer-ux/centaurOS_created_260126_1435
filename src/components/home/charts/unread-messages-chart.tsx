"use client"

import { Card, CardContent } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { MessageSquare } from "lucide-react"
import type { AnalyticsMember, AnalyticsTask } from "../home-analytics"

interface UnreadMessagesChartProps {
  members: AnalyticsMember[]
  tasks: AnalyticsTask[]
}

/**
 * UnreadMessagesChart - Donut showing unread messages split by type.
 * 
 * @description Shows total unread messages from people conversations
 * vs task discussions. Center displays total count.
 */
export function UnreadMessagesChart({ members, tasks }: UnreadMessagesChartProps) {
  // Calculate totals
  const unreadPeople = members.reduce((sum, m) => sum + (m.unread_count || 0), 0)
  const unreadTasks = tasks.reduce((sum, t) => sum + (t.unread_message_count || 0), 0)
  const totalUnread = unreadPeople + unreadTasks

  const data = [
    { name: "People", value: unreadPeople, color: "hsl(var(--status-info))" },
    { name: "Tasks", value: unreadTasks, color: "hsl(var(--international-orange))" },
  ].filter(d => d.value > 0)

  // If no unread, show empty state
  if (totalUnread === 0) {
    return (
      <Card className="border bg-background">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Messages</span>
          </div>
          <div className="h-[60px] flex items-center justify-center">
            <div className="text-center">
              <span className="text-lg font-bold text-status-success">0</span>
              <p className="text-[10px] text-muted-foreground">All caught up!</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border bg-background">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Unread</span>
        </div>
        <div className="h-[60px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={18}
                outerRadius={28}
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
            <span className="text-lg font-bold text-foreground">{totalUnread}</span>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-3 text-[9px]">
          {unreadPeople > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-status-info" />
              <span className="text-muted-foreground">{unreadPeople} people</span>
            </div>
          )}
          {unreadTasks > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-international-orange" />
              <span className="text-muted-foreground">{unreadTasks} tasks</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

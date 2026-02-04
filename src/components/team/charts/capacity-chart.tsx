"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { Users } from "lucide-react"
import type { TeamMember } from "../team-analytics"

interface TeamCapacityChartProps {
  members: TeamMember[]
}

/**
 * TeamCapacityChart - Donut chart showing team bandwidth distribution.
 * 
 * @description Shows at a glance how many team members have capacity,
 * are at capacity, or are overloaded based on their active and pending tasks.
 * 
 * Bandwidth formula: (activeTasks * 20) + (pendingTasks * 10)
 * - Has capacity: score ≤ 40
 * - At capacity: score 41-70
 * - Overloaded: score > 70
 */
export function TeamCapacityChart({ members }: TeamCapacityChartProps) {
  // Calculate bandwidth for each member
  const getBandwidthScore = (member: TeamMember): number => {
    return Math.min(100, (member.activeTasks * 20) + (member.pendingTasks * 10))
  }

  // Categorize members by bandwidth
  const hasCapacity = members.filter(m => getBandwidthScore(m) <= 40).length
  const atCapacity = members.filter(m => {
    const score = getBandwidthScore(m)
    return score > 40 && score <= 70
  }).length
  const overloaded = members.filter(m => getBandwidthScore(m) > 70).length

  const data = [
    { name: "Has capacity", value: hasCapacity, color: "hsl(var(--status-success))" },
    { name: "At capacity", value: atCapacity, color: "hsl(var(--status-warning))" },
    { name: "Overloaded", value: overloaded, color: "hsl(var(--status-error))" },
  ].filter(d => d.value > 0)

  const totalMembers = members.length
  const availableText = hasCapacity === 1 ? "1 available" : `${hasCapacity} available`

  // Handle empty state
  if (members.length === 0) {
    return (
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Team Capacity
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[100px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No team members</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Team Capacity
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[100px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={45}
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
            <span className="text-lg font-bold text-foreground">{hasCapacity}/{totalMembers}</span>
            <span className="text-[10px] text-muted-foreground">available</span>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-3 mt-2 text-[10px]">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center gap-1">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.value} {entry.name.toLowerCase()}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

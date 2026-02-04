"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { Brain, Zap } from "lucide-react"
import type { TeamMember } from "../team-analytics"

interface CentaurStatusChartProps {
  humanMembers: TeamMember[]
  aiAgentCount: number
}

/**
 * CentaurStatusChart - Radial progress showing AI-human pairing adoption.
 * 
 * @description Shows how many human team members are paired with AI agents
 * to form "Centaur" pairs. Encourages adoption by visualizing coverage.
 * Teams with higher Centaur pairing often have better throughput.
 */
export function CentaurStatusChart({ humanMembers, aiAgentCount }: CentaurStatusChartProps) {
  const pairedCount = humanMembers.filter(m => !!m.paired_ai_id).length
  const unpairedCount = humanMembers.length - pairedCount
  const totalHumans = humanMembers.length

  const pairingRate = totalHumans > 0 ? Math.round((pairedCount / totalHumans) * 100) : 0

  const data = [
    { name: "Paired", value: pairedCount, color: "hsl(var(--status-warning))" },
    { name: "Unpaired", value: unpairedCount, color: "hsl(var(--muted))" },
  ].filter(d => d.value > 0)

  // Handle empty state (no humans or no AI agents)
  if (totalHumans === 0) {
    return (
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            Centaur Pairs
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

  if (aiAgentCount === 0) {
    return (
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            Centaur Pairs
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[100px] flex flex-col items-center justify-center gap-2">
            <Brain className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-[11px] text-muted-foreground text-center">
              Add AI agents to enable<br />Centaur pairing
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
          <Brain className="h-4 w-4 text-status-info" />
          Centaur Pairs
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
                startAngle={90}
                endAngle={-270}
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
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="flex items-center gap-0.5">
              <Zap className="h-3 w-3 text-status-warning" />
              <span className="text-lg font-bold text-foreground">{pairingRate}%</span>
            </div>
            <span className="text-[10px] text-muted-foreground">paired</span>
          </div>
        </div>
        {/* Status line */}
        <div className="flex items-center justify-center gap-2 mt-2 text-[10px]">
          <span className="text-status-warning font-medium">{pairedCount} paired</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{unpairedCount} available</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-status-info">{aiAgentCount} AI{aiAgentCount !== 1 ? 's' : ''}</span>
        </div>
      </CardContent>
    </Card>
  )
}

"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Users } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnalyticsTeamMember } from "../home-analytics"

interface TeamOnlineChartProps {
  teamMembers: AnalyticsTeamMember[]
}

/**
 * TeamOnlineChart - Visual grid showing team availability.
 * 
 * @description Shows mini avatars with presence status dots.
 * Green = online, Yellow = away, Purple = focus, Gray = offline.
 */
export function TeamOnlineChart({ teamMembers }: TeamOnlineChartProps) {
  // Count by status
  const online = teamMembers.filter(m => m.presence_status === 'online').length
  const away = teamMembers.filter(m => m.presence_status === 'away').length
  const focus = teamMembers.filter(m => m.presence_status === 'focus').length
  const offline = teamMembers.filter(m => !m.presence_status || m.presence_status === 'offline').length
  
  const totalTeam = teamMembers.length
  const available = online + away // People who can be reached

  // Get status color
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online': return 'bg-status-success'
      case 'away': return 'bg-status-warning'
      case 'focus': return 'bg-purple-500'
      default: return 'bg-muted-foreground/30'
    }
  }

  // Get initials
  const getInitials = (name: string | null) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  }

  // Sort: online first, then away, then focus, then offline
  const sortedMembers = [...teamMembers].sort((a, b) => {
    const order = { online: 0, away: 1, focus: 2, offline: 3 }
    const aOrder = order[a.presence_status || 'offline'] ?? 3
    const bOrder = order[b.presence_status || 'offline'] ?? 3
    return aOrder - bOrder
  })

  // Show max 6 members in grid
  const displayMembers = sortedMembers.slice(0, 6)
  const remaining = totalTeam - 6

  // Handle empty state
  if (totalTeam === 0) {
    return (
      <Card className="border bg-background">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Team</span>
          </div>
          <div className="h-[60px] flex items-center justify-center">
            <p className="text-[10px] text-muted-foreground">No team members</p>
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
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Team</span>
          </div>
          <span className={cn(
            "text-xs font-semibold",
            available > 0 ? "text-status-success" : "text-muted-foreground"
          )}>
            {available} available
          </span>
        </div>
        
        {/* Avatar grid */}
        <div className="h-[60px] flex items-center justify-center">
          <div className="flex flex-wrap justify-center gap-1.5">
            {displayMembers.map((member) => (
              <div key={member.id} className="relative" title={member.full_name || 'Unknown'}>
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                  {getInitials(member.full_name)}
                </div>
                {/* Status dot */}
                <div className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background",
                  getStatusColor(member.presence_status)
                )} />
              </div>
            ))}
            {remaining > 0 && (
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground">
                +{remaining}
              </div>
            )}
          </div>
        </div>
        
        {/* Status legend */}
        <div className="flex items-center justify-center gap-2 text-[8px] mt-1">
          {online > 0 && (
            <div className="flex items-center gap-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-status-success" />
              <span className="text-muted-foreground">{online}</span>
            </div>
          )}
          {away > 0 && (
            <div className="flex items-center gap-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-status-warning" />
              <span className="text-muted-foreground">{away}</span>
            </div>
          )}
          {focus > 0 && (
            <div className="flex items-center gap-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <span className="text-muted-foreground">{focus}</span>
            </div>
          )}
          {offline > 0 && (
            <div className="flex items-center gap-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
              <span className="text-muted-foreground">{offline}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * TeamPulseDashboard — Live team activity and workload overview.
 * 
 * @description Shows who's working on what, workload distribution,
 * and provides a one-click daily standup generator. Designed to
 * make teams feel connected and collaborative.
 * 
 * @component
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import {
  Users,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  getTeamPulse,
  generateDailyStandup,
  type TeamPulseData,
  type TeamMemberPulse,
  type DailyStandup,
} from "@/actions/team-pulse"

// ─── Workload Helpers ─────────────────────────────────────────────

function getWorkloadLevel(activeTasks: number): { label: string; color: string } {
  if (activeTasks === 0) return { label: 'Free', color: 'text-muted-foreground' }
  if (activeTasks <= 3) return { label: 'Light', color: 'text-status-success' }
  if (activeTasks <= 6) return { label: 'Moderate', color: 'text-status-warning' }
  return { label: 'Heavy', color: 'text-destructive' }
}

// ─── Component ────────────────────────────────────────────────────

interface TeamPulseDashboardProps {
  className?: string
}

export function TeamPulseDashboard({ className }: TeamPulseDashboardProps): React.ReactElement {
  const [pulse, setPulse] = useState<TeamPulseData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [standupDialog, setStandupDialog] = useState(false)
  const [standup, setStandup] = useState<DailyStandup | null>(null)
  const [isGeneratingStandup, setIsGeneratingStandup] = useState(false)

  // Load team pulse on mount
  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const result = await getTeamPulse()
        if (result.data) setPulse(result.data)
        if (result.error) console.warn('[TeamPulse] Failed to load:', result.error)
      } catch (err) {
        console.error('[TeamPulse] Unexpected error:', err instanceof Error ? err.message : 'Unknown')
      }
      setIsLoading(false)
    }
    load()
  }, [])

  const handleRefresh = useCallback(async () => {
    setIsLoading(true)
    const result = await getTeamPulse()
    if (result.data) setPulse(result.data)
    setIsLoading(false)
  }, [])

  const handleGenerateStandup = useCallback(async () => {
    setStandupDialog(true)
    setIsGeneratingStandup(true)
    const result = await generateDailyStandup()
    setIsGeneratingStandup(false)

    if (result.error) {
      toast.error(result.error)
      setStandupDialog(false)
      return
    }

    if (result.data) {
      setStandup(result.data)
    }
  }, [])

  const handleCopyStandup = useCallback(() => {
    if (!standup) return

    const text = `Daily Standup — ${standup.date}

${standup.summary}

${standup.entries.map((e) =>
  `${e.memberName}:
  Yesterday: ${e.yesterday.length > 0 ? e.yesterday.join(', ') : 'No completions'}
  Today: ${e.today.length > 0 ? e.today.join(', ') : 'No active tasks'}
  Blockers: ${e.blockers.length > 0 ? e.blockers.join(', ') : 'None'}`
).join('\n\n')}`

    navigator.clipboard.writeText(text)
    toast.success('Standup copied to clipboard')
  }, [standup])

  if (isLoading) {
    return (
      <Card className={cn("border", className)}>
        <CardContent className="pt-6 flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (!pulse || pulse.members.length === 0) return <></>

  return (
    <>
      <Card className={cn("border", className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-international-orange" />
              Team Pulse
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateStandup}
                className="gap-1 text-xs h-7"
              >
                <MessageSquare className="h-3 w-3" />
                Standup
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                className="h-7 w-7"
                aria-label="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Stats Summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{pulse.totalActiveTasks}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-status-success">{pulse.totalCompletedThisWeek}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Done (7d)</p>
            </div>
            <div className="text-center">
              <p className={cn("text-lg font-bold", pulse.totalOverdue > 0 ? "text-destructive" : "text-foreground")}>
                {pulse.totalOverdue}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overdue</p>
            </div>
          </div>

          {/* Member List */}
          <div className="space-y-2">
            {pulse.members.map((member) => (
              <MemberPulseRow key={member.id} member={member} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Standup Dialog */}
      <Dialog open={standupDialog} onOpenChange={setStandupDialog}>
        <DialogContent size="sm" className="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-international-orange" />
              Daily Standup
            </DialogTitle>
          </DialogHeader>

          {isGeneratingStandup ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-international-orange" />
              <p className="text-sm text-muted-foreground">Generating standup...</p>
            </div>
          ) : standup ? (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                {/* AI Summary */}
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-sm text-foreground">{standup.summary}</p>
                </div>

                {/* Entries */}
                {standup.entries.map((entry) => (
                  <div key={entry.memberId} className="space-y-1.5">
                    <p className="text-sm font-semibold text-foreground">
                      {entry.memberName}
                    </p>
                    <div className="pl-3 space-y-1 text-xs">
                      <div>
                        <span className="text-muted-foreground">Yesterday: </span>
                        <span className="text-foreground">
                          {entry.yesterday.length > 0 ? entry.yesterday.join(', ') : 'No completions'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Today: </span>
                        <span className="text-foreground">
                          {entry.today.length > 0 ? entry.today.join(', ') : 'No active tasks'}
                        </span>
                      </div>
                      {entry.blockers.length > 0 && (
                        <div>
                          <span className="text-destructive">Blockers: </span>
                          <span className="text-foreground">{entry.blockers.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : null}

          {standup && (
            <DialogFooter>
              <Button variant="secondary" onClick={() => setStandupDialog(false)}>
                Close
              </Button>
              <Button onClick={handleCopyStandup} className="gap-1.5">
                Copy Standup
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Member Row ───────────────────────────────────────────────────

function MemberPulseRow({ member }: { member: TeamMemberPulse }): React.ReactElement {
  const workload = getWorkloadLevel(member.activeTasks)

  return (
    <div className="flex items-center gap-3 py-1.5">
      <UserAvatar
        name={member.name}
        role={member.role as "Founder" | "Executive" | "Apprentice" | "AI_Agent" | undefined}
        avatarUrl={member.avatarUrl || undefined}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">
            {member.name}
          </span>
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", workload.color)}>
            {workload.label}
          </Badge>
        </div>
        {member.currentFocus && (
          <p className="text-xs text-muted-foreground truncate">
            {member.currentFocus}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        <span className="flex items-center gap-0.5" title="Active tasks">
          <Clock className="h-3 w-3" />
          {member.activeTasks}
        </span>
        <span className="flex items-center gap-0.5 text-status-success" title="Completed this week">
          <CheckCircle2 className="h-3 w-3" />
          {member.completedThisWeek}
        </span>
        {member.overdueTasks > 0 && (
          <span className="flex items-center gap-0.5 text-destructive" title="Overdue">
            <AlertTriangle className="h-3 w-3" />
            {member.overdueTasks}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * WeeklyDigestPanel — Auto-generated weekly progress report.
 * 
 * @description Shows a beautiful, shareable weekly progress report with
 * visual progress bars, health indicators, AI-written summary, and
 * action items. Designed to be screenshot-worthy and shareable.
 * 
 * @component
 */

"use client"

import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Target,
  Loader2,
  Share2,
  Sparkles,
  Calendar,
  Plus,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  generateWeeklyDigest,
  type WeeklyDigest,
  type ObjectiveProgress,
} from "@/actions/progress-report"

// ─── Types ────────────────────────────────────────────────────────

interface WeeklyDigestPanelProps {
  /** Additional CSS classes */
  className?: string
}

// ─── Health Colors ────────────────────────────────────────────────

const HEALTH_CONFIG = {
  'on-track': { label: 'On Track', color: 'bg-status-success', textColor: 'text-status-success', bg: 'bg-status-success-light' },
  'at-risk': { label: 'At Risk', color: 'bg-status-warning', textColor: 'text-status-warning', bg: 'bg-status-warning-light' },
  'off-track': { label: 'Off Track', color: 'bg-destructive', textColor: 'text-destructive', bg: 'bg-status-error-light' },
  'completed': { label: 'Done', color: 'bg-status-success', textColor: 'text-status-success', bg: 'bg-status-success-light' },
} as const

// ─── Component ────────────────────────────────────────────────────

export function WeeklyDigestPanel({ className }: WeeklyDigestPanelProps): React.ReactElement {
  const [digest, setDigest] = useState<WeeklyDigest | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const handleGenerate = useCallback(async () => {
    setIsLoading(true)
    setIsOpen(true)
    const result = await generateWeeklyDigest()
    setIsLoading(false)

    if (result.error) {
      toast.error(result.error)
      setIsOpen(false)
      return
    }

    if (result.data) {
      setDigest(result.data)
    }
  }, [])

  const handleCopyReport = useCallback(() => {
    if (!digest) return

    const text = `Weekly Progress Report (${digest.weekStarting} - ${digest.weekEnding})

${digest.summary}

Objectives:
${digest.objectiveProgress.map((o) =>
  `- ${o.title}: ${o.progress}% (${o.completedTasks}/${o.totalTasks} tasks)`
).join('\n')}

Tasks completed: ${digest.tasksCompleted}
Overall trend: ${digest.overallHealthTrend}

${digest.highlights.length > 0 ? `Highlights:\n${digest.highlights.map((h) => `+ ${h}`).join('\n')}` : ''}
${digest.concerns.length > 0 ? `\nConcerns:\n${digest.concerns.map((c) => `- ${c}`).join('\n')}` : ''}

Powered by ForgeOS`

    navigator.clipboard.writeText(text)
    toast.success('Report copied to clipboard')
  }, [digest])

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        className={cn("gap-1.5", className)}
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Weekly Report
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-international-orange" />
              Weekly Progress Report
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-international-orange" />
              <p className="text-sm text-muted-foreground">
                Analyzing your week...
              </p>
            </div>
          ) : digest ? (
            <ScrollArea className="max-h-[65vh] pr-4">
              <div className="space-y-5">
                {/* Date Range */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(digest.weekStarting).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' — '}
                  {new Date(digest.weekEnding).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>

                {/* AI Summary */}
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-international-orange" />
                    <span className="text-xs font-semibold text-foreground">
                      Executive Summary
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">
                    {digest.summary}
                  </p>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-3">
                  <StatCard
                    label="Completed"
                    value={digest.tasksCompleted}
                    icon={CheckCircle2}
                    color="text-status-success"
                  />
                  <StatCard
                    label="Created"
                    value={digest.tasksCreated}
                    icon={Plus}
                    color="text-electric-blue"
                  />
                  <StatCard
                    label="Trend"
                    value={digest.overallHealthTrend}
                    icon={
                      digest.overallHealthTrend === 'improving' ? TrendingUp :
                      digest.overallHealthTrend === 'declining' ? TrendingDown : Minus
                    }
                    color={
                      digest.overallHealthTrend === 'improving' ? 'text-status-success' :
                      digest.overallHealthTrend === 'declining' ? 'text-destructive' : 'text-muted-foreground'
                    }
                    isText
                  />
                </div>

                {/* Objective Progress */}
                {digest.objectiveProgress.length > 0 && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
                      Objectives
                    </p>
                    <div className="space-y-3">
                      {digest.objectiveProgress.map((obj) => (
                        <ObjectiveProgressRow key={obj.id} objective={obj} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Highlights */}
                {digest.highlights.length > 0 && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                      Highlights
                    </p>
                    <ul className="space-y-1">
                      {digest.highlights.map((h, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-3.5 w-3.5 text-status-success mt-0.5 shrink-0" />
                          <span className="text-foreground">{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Concerns */}
                {digest.concerns.length > 0 && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                      Needs attention
                    </p>
                    <ul className="space-y-1">
                      {digest.concerns.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <AlertTriangle className="h-3.5 w-3.5 text-status-warning mt-0.5 shrink-0" />
                          <span className="text-foreground">{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ForgeOS Branding */}
                <div className="text-center pt-2 border-t border-muted">
                  <p className="text-[10px] text-muted-foreground">
                    Powered by ForgeOS &middot; fractionalforge.com
                  </p>
                </div>
              </div>
            </ScrollArea>
          ) : null}

          {digest && (
            <DialogFooter>
              <Button variant="secondary" onClick={() => setIsOpen(false)}>
                Close
              </Button>
              <Button
                onClick={handleCopyReport}
                className="gap-1.5"
              >
                <Share2 className="h-4 w-4" />
                Copy Report
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Sub-Components ───────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  color: string
  isText?: boolean
}

function StatCard({ label, value, icon: Icon, color, isText }: StatCardProps): React.ReactElement {
  return (
    <div className="rounded-lg border p-3 text-center">
      <Icon className={cn("h-4 w-4 mx-auto mb-1", color)} />
      <p className={cn(
        "font-bold",
        isText ? "text-sm capitalize" : "text-lg",
        color
      )}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
    </div>
  )
}

function ObjectiveProgressRow({ objective }: { objective: ObjectiveProgress }): React.ReactElement {
  const healthConfig = HEALTH_CONFIG[objective.health]
  const progressDelta = objective.progress - objective.previousProgress

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">
            {objective.title}
          </span>
        </div>
        <Badge
          variant="outline"
          className={cn("text-[10px] shrink-0", healthConfig.textColor)}
        >
          {healthConfig.label}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-muted rounded-full overflow-hidden mb-1.5">
        {objective.previousProgress > 0 && (
          <div
            className="absolute inset-y-0 left-0 bg-muted-foreground/20 rounded-full"
            style={{ width: `${objective.previousProgress}%` }}
          />
        )}
        <motion.div
          className={cn("absolute inset-y-0 left-0 rounded-full", healthConfig.color)}
          initial={{ width: `${objective.previousProgress}%` }}
          animate={{ width: `${objective.progress}%` }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {objective.completedTasks}/{objective.totalTasks} tasks
          {objective.overdueTasks > 0 && (
            <span className="text-destructive ml-1">
              ({objective.overdueTasks} overdue)
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          {objective.progress}%
          {progressDelta > 0 && (
            <span className="text-status-success">+{progressDelta}%</span>
          )}
        </span>
      </div>
    </div>
  )
}

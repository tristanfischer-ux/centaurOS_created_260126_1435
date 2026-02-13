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
  Calendar,
  Plus,
  ArrowRight,
  Copy,
  FileText,
  Lightbulb,
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts"
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
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  generateWeeklyDigest,
  type WeeklyDigest,
  type ObjectiveProgress,
  type CompletedTaskDetail,
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

    const weekRange = `${new Date(digest.weekStarting).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(digest.weekEnding).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    const sections: string[] = [
      `📊 Weekly Progress Report (${weekRange})`,
      '',
      digest.summary,
      '',
      `📈 Stats: ${digest.tasksCompleted} completed · ${digest.tasksCreated} created · Trend: ${digest.overallHealthTrend}`,
    ]

    if (digest.objectiveProgress.length > 0) {
      sections.push('', '🎯 Objectives:')
      digest.objectiveProgress.forEach((o) => {
        const delta = o.progress - o.previousProgress
        const deltaStr = delta > 0 ? ` (+${delta}%)` : ''
        sections.push(`  • ${o.title}: ${o.progress}%${deltaStr} — ${o.completedTasks}/${o.totalTasks} tasks`)
      })
    }

    if (digest.highlights.length > 0) {
      sections.push('', '✅ Highlights:')
      digest.highlights.forEach((h) => sections.push(`  + ${h}`))
    }

    if (digest.concerns.length > 0) {
      sections.push('', '⚠️ Needs Attention:')
      digest.concerns.forEach((c) => sections.push(`  - ${c}`))
    }

    if (digest.nextWeekPriorities && digest.nextWeekPriorities.length > 0) {
      sections.push('', '🎯 Focus Next Week:')
      digest.nextWeekPriorities.forEach((p) => sections.push(`  → ${p}`))
    }

    navigator.clipboard.writeText(sections.join('\n'))
    toast.success('Report copied to clipboard')
  }, [digest])

  const handleCopyMarkdown = useCallback(() => {
    if (!digest) return

    const weekRange = `${new Date(digest.weekStarting).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(digest.weekEnding).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    const lines: string[] = [
      `# Weekly Progress Report`,
      `**${weekRange}**`,
      '',
      '## Executive Summary',
      digest.summary,
      '',
      '## Key Stats',
      `- **Tasks Completed:** ${digest.tasksCompleted}`,
      `- **Tasks Created:** ${digest.tasksCreated}`,
      `- **Trend:** ${digest.overallHealthTrend}`,
    ]

    if (digest.objectiveProgress.length > 0) {
      lines.push('', '## Objectives')
      digest.objectiveProgress.forEach((o) => {
        const delta = o.progress - o.previousProgress
        const deltaStr = delta > 0 ? ` (+${delta}%)` : delta < 0 ? ` (${delta}%)` : ''
        lines.push(`- **${o.title}:** ${o.progress}%${deltaStr} — ${o.completedTasks}/${o.totalTasks} tasks`)
      })
    }

    if (digest.highlights.length > 0) {
      lines.push('', '## Highlights')
      digest.highlights.forEach((h) => lines.push(`- ${h}`))
    }

    if (digest.concerns.length > 0) {
      lines.push('', '## Needs Attention')
      digest.concerns.forEach((c) => lines.push(`- ${c}`))
    }

    if (digest.nextWeekPriorities && digest.nextWeekPriorities.length > 0) {
      lines.push('', '## Focus Next Week')
      digest.nextWeekPriorities.forEach((p) => lines.push(`- ${p}`))
    }

    navigator.clipboard.writeText(lines.join('\n'))
    toast.success('Markdown report copied to clipboard')
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
        <DialogContent size="md" className="max-h-[90vh]">
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
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1 h-4 bg-international-orange rounded-full" />
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

                {/* Weekly Comparison Chart */}
                {digest.objectiveProgress.length > 0 && (
                  <WeeklyComparisonChart objectives={digest.objectiveProgress} />
                )}

                {/* Top Contributor */}
                <TopContributorCard completedTasks={digest.completedTaskDetails} />

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

                {/* Next Week Priorities */}
                {digest.nextWeekPriorities && digest.nextWeekPriorities.length > 0 && (
                  <div className="bg-international-orange/5 rounded-lg p-4 border border-international-orange/10">
                    <p className="text-xs font-mono uppercase tracking-widest text-international-orange mb-2">
                      Focus next week
                    </p>
                    <ul className="space-y-1.5">
                      {digest.nextWeekPriorities.map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <ArrowRight className="h-3.5 w-3.5 text-international-orange mt-0.5 shrink-0" />
                          <span className="text-foreground font-medium">{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Intelligence Signal */}
                <div className="flex items-center gap-2 mt-2 pt-3 border-t text-xs text-muted-foreground">
                  <Lightbulb className="h-3.5 w-3.5 shrink-0 text-status-warning" />
                  <span>
                    Insights improve as activity data grows{digest.overallHealthTrend === 'improving' && ' · Trend: improving week over week'}
                  </span>
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
                variant="outline"
                onClick={handleCopyMarkdown}
                className="gap-1.5"
              >
                <FileText className="h-4 w-4" />
                Copy Markdown
              </Button>
              <Button
                onClick={handleCopyReport}
                className="gap-1.5"
              >
                <Copy className="h-4 w-4" />
                Share Report
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
            <span className="flex items-center gap-0.5 text-status-success">
              <TrendingUp className="h-3 w-3" />
              +{progressDelta}%
            </span>
          )}
          {progressDelta < 0 && (
            <span className="flex items-center gap-0.5 text-destructive">
              <TrendingDown className="h-3 w-3" />
              {progressDelta}%
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

// ─── Chart & Contributor Components ──────────────────────────────

/**
 * Computes the top contributor from completed task details.
 *
 * @param details - Array of completed task details with assignee names
 * @returns The name and count of the person who completed the most tasks, or null
 */
function getTopContributor(details: CompletedTaskDetail[]): { name: string; count: number } | null {
  if (details.length === 0) return null
  const counts: Record<string, number> = {}
  details.forEach((d) => {
    if (d.completedBy && d.completedBy !== 'Unknown') {
      counts[d.completedBy] = (counts[d.completedBy] || 0) + 1
    }
  })
  const entries = Object.entries(counts)
  if (entries.length === 0) return null
  entries.sort((a, b) => b[1] - a[1])
  return { name: entries[0][0], count: entries[0][1] }
}

/**
 * Displays the top contributor for the week with avatar and task count.
 */
function TopContributorCard({ completedTasks }: { completedTasks: CompletedTaskDetail[] }): React.ReactElement | null {
  const top = getTopContributor(completedTasks)
  if (!top) return null

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 bg-status-success-light/30">
      <UserAvatar name={top.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Top contributor</p>
        <p className="text-sm font-semibold text-foreground truncate">{top.name}</p>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold text-status-success">{top.count}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">tasks</p>
      </div>
    </div>
  )
}

/**
 * Horizontal bar chart comparing objective progress: last week vs this week.
 */
function WeeklyComparisonChart({ objectives }: { objectives: ObjectiveProgress[] }): React.ReactElement | null {
  if (objectives.length === 0) return null

  const chartData = objectives.slice(0, 6).map((obj) => ({
    name: obj.title.length > 16 ? obj.title.slice(0, 16) + '\u2026' : obj.title,
    'Last Week': obj.previousProgress,
    'This Week': obj.progress,
  }))

  return (
    <div>
      <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
        Progress comparison
      </p>
      <div className="rounded-lg border p-3">
        <ResponsiveContainer width="100%" height={chartData.length * 44 + 24}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ fontSize: 11 }}
            />
            <RechartsTooltip
              formatter={(value) => `${value}%`}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar
              dataKey="Last Week"
              fill="hsl(var(--muted-foreground))"
              radius={[0, 2, 2, 0]}
              barSize={10}
              opacity={0.25}
            />
            <Bar
              dataKey="This Week"
              fill="hsl(var(--international-orange))"
              radius={[0, 4, 4, 0]}
              barSize={10}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

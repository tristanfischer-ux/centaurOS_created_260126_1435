/**
 * MorningBriefing — Personalized daily focus card.
 * 
 * @description Shows the user what needs attention today: top tasks,
 * at-risk objectives, streak, and smart nudges. Appears on the Plan
 * section intro page.
 * 
 * @component
 */

"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sun,
  AlertTriangle,
  Clock,
  Target,
  ArrowRight,
  X,
  Flame,
  CheckCircle2,
  Loader2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getMorningBriefing, type MorningBriefing as MorningBriefingData } from "@/actions/nudges"

export function MorningBriefingCard(): React.ReactElement {
  const [briefing, setBriefing] = useState<MorningBriefingData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check if already dismissed today
    const dismissedDate = localStorage.getItem("forgeos:briefing:dismissed")
    const today = new Date().toISOString().split("T")[0]
    if (dismissedDate === today) {
      setIsDismissed(true)
      setIsLoading(false)
      return
    }

    async function loadBriefing(): Promise<void> {
      const result = await getMorningBriefing()
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setBriefing(result.data)
      }
      setIsLoading(false)
    }

    loadBriefing()
  }, [])

  const handleDismiss = (): void => {
    setIsDismissed(true)
    const today = new Date().toISOString().split("T")[0]
    localStorage.setItem("forgeos:briefing:dismissed", today)
  }

  if (isDismissed || error) return <></>
  if (isLoading) {
    return (
      <Card className="border border-dashed border-muted">
        <CardContent className="pt-6 flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }
  if (!briefing) return <></>

  const hasContent = briefing.topTasks.length > 0 || briefing.nudges.length > 0 || briefing.atRiskObjectives.length > 0

  if (!hasContent) return <></>

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="border bg-gradient-to-br from-background to-international-orange/[0.02] overflow-hidden">
        <CardContent className="pt-5 pb-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50">
                <Sun className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {briefing.greeting}
                </p>
                {briefing.streak >= 2 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Flame className={cn(
                      "h-3 w-3",
                      briefing.streak >= 7 ? "text-international-orange" : "text-amber-500"
                    )} />
                    <span className="text-xs text-muted-foreground">
                      {briefing.streak}-day streak
                    </span>
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="h-7 w-7 shrink-0"
              aria-label="Dismiss briefing"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Top Tasks */}
          {briefing.topTasks.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Today&apos;s focus
              </p>
              <div className="space-y-1.5">
                {briefing.topTasks.map((task) => (
                  <Link
                    key={task.id}
                    href="/new-tasks"
                    className="flex items-start gap-2 text-xs group hover:bg-muted/50 rounded-md px-2 py-1.5 -mx-2 transition-colors"
                  >
                    {task.isOverdue ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className={cn(
                        "text-foreground group-hover:text-international-orange transition-colors",
                        task.isOverdue && "font-medium"
                      )}>
                        {task.title}
                      </span>
                      {task.objectiveTitle && (
                        <span className="text-muted-foreground ml-1">
                          &middot; {task.objectiveTitle}
                        </span>
                      )}
                    </div>
                    {task.dueDate && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0 shrink-0",
                          task.isOverdue && "text-destructive border-destructive/30"
                        )}
                      >
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        {task.isOverdue ? "Overdue" : new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* At-Risk Objectives */}
          {briefing.atRiskObjectives.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Needs attention
              </p>
              <div className="space-y-1.5">
                {briefing.atRiskObjectives.map((obj) => (
                  <Link
                    key={obj.id}
                    href="/new-objectives"
                    className="flex items-start gap-2 text-xs group hover:bg-muted/50 rounded-md px-2 py-1.5 -mx-2 transition-colors"
                  >
                    <Target className="h-3.5 w-3.5 text-status-warning mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-foreground group-hover:text-international-orange transition-colors">
                        {obj.title}
                      </span>
                      <span className="text-muted-foreground ml-1">
                        &middot; {obj.reason}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Nudges */}
          {briefing.nudges.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-muted">
              {briefing.nudges.map((nudge, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs"
                >
                  <div className={cn(
                    "w-1 h-4 rounded-full shrink-0",
                    nudge.type === "overdue" && "bg-destructive",
                    nudge.type === "at_risk" && "bg-status-warning",
                    nudge.type === "momentum" && "bg-status-success",
                    nudge.type === "stale" && "bg-muted-foreground",
                  )} />
                  <span className="text-muted-foreground flex-1">
                    {nudge.message}
                  </span>
                  {nudge.actionHref && (
                    <Link
                      href={nudge.actionHref}
                      className="text-international-orange hover:underline shrink-0 flex items-center gap-0.5"
                    >
                      {nudge.actionLabel}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

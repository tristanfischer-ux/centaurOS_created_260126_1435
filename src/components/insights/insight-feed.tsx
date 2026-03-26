/**
 * InsightFeed — Displays background specialist insights grouped by urgency.
 *
 * @description Shows proactive findings from the Always-On Agent Intelligence
 * system. Insights are grouped into urgency bands (critical, important,
 * informational) with specialist avatars, action CTAs, and dismiss controls.
 *
 * Designed to integrate into the Today page as the primary consumption
 * surface for background intelligence.
 *
 * @component
 *
 * @example
 * <InsightFeed />
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  Lightbulb,
  Info,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle2,
  Zap,
  Eye,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  getInsightFeed,
  markInsightRead,
  dismissInsight,
  markInsightActedOn,
  type AgentInsight,
  type InsightFeedResult,
} from "@/actions/agent-insights"
import { SPECIALISTS } from "@/lib/agents/specialists-config"

// ─── Constants ──────────────────────────────────────────────────────

const URGENCY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    label: "Needs Attention",
    badgeVariant: "destructive" as const,
    borderColor: "border-l-destructive",
    bgColor: "bg-status-error-light/30",
    iconColor: "text-destructive",
  },
  important: {
    icon: Lightbulb,
    label: "Recommended",
    badgeVariant: "warning" as const,
    borderColor: "border-l-status-warning",
    bgColor: "bg-status-warning-light/30",
    iconColor: "text-status-warning",
  },
  informational: {
    icon: Info,
    label: "For Your Awareness",
    badgeVariant: "info" as const,
    borderColor: "border-l-status-info",
    bgColor: "bg-status-info-light/30",
    iconColor: "text-status-info",
  },
} as const

const INSIGHT_TYPE_LABELS: Record<string, string> = {
  alert: "Alert",
  recommendation: "Recommendation",
  observation: "Observation",
  reminder: "Reminder",
  report: "Report",
}

/** Animation variants */
const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}


// ─── Component ──────────────────────────────────────────────────────

export function InsightFeed(): React.ReactElement {
  const [feed, setFeed] = useState<InsightFeedResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showInformational, setShowInformational] = useState(false)

  // Load insights on mount
  useEffect(() => {
    async function loadInsights(): Promise<void> {
      try {
        const result = await getInsightFeed(10)
        setFeed(result)
      } catch (err) {
        console.error("[InsightFeed] Failed to load:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadInsights()
  }, [])

  const handleDismiss = useCallback(async (insightId: string) => {
    // Optimistic update
    setFeed(prev => {
      if (!prev) return prev
      const removeById = (arr: AgentInsight[]) => arr.filter(i => i.id !== insightId)
      return {
        critical: removeById(prev.critical),
        important: removeById(prev.important),
        informational: removeById(prev.informational),
        totalUnread: Math.max(0, prev.totalUnread - 1),
      }
    })
    await dismissInsight(insightId)
  }, [])

  const handleMarkRead = useCallback(async (insightId: string) => {
    setFeed(prev => {
      if (!prev) return prev
      const markRead = (arr: AgentInsight[]) =>
        arr.map(i => i.id === insightId ? { ...i, is_read: true } : i)
      return {
        critical: markRead(prev.critical),
        important: markRead(prev.important),
        informational: markRead(prev.informational),
        totalUnread: Math.max(0, prev.totalUnread - 1),
      }
    })
    await markInsightRead(insightId)
  }, [])

  const handleActOn = useCallback(async (insightId: string) => {
    setFeed(prev => {
      if (!prev) return prev
      const markActed = (arr: AgentInsight[]) =>
        arr.map(i => i.id === insightId ? { ...i, acted_on: true } : i)
      return {
        critical: markActed(prev.critical),
        important: markActed(prev.important),
        informational: markActed(prev.informational),
        totalUnread: prev.totalUnread,
      }
    })
    await markInsightActedOn(insightId)
  }, [])

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  // No insights
  if (!feed || (feed.critical.length === 0 && feed.important.length === 0 && feed.informational.length === 0)) {
    return (
      <Card className="border bg-muted/30">
        <CardContent className="pt-6 text-center py-8">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-status-success-light">
            <CheckCircle2 className="h-6 w-6 text-status-success" />
          </div>
          <p className="text-sm font-medium text-foreground">All clear</p>
          <p className="text-xs text-muted-foreground mt-1">
            Your specialists are monitoring. Insights will appear here when they find something noteworthy.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Critical insights -- always visible, prominent */}
      {feed.critical.length > 0 && (
        <InsightSection
          urgency="critical"
          insights={feed.critical}
          onDismiss={handleDismiss}
          onMarkRead={handleMarkRead}
          onActOn={handleActOn}
        />
      )}

      {/* Important insights -- visible in feed */}
      {feed.important.length > 0 && (
        <InsightSection
          urgency="important"
          insights={feed.important}
          onDismiss={handleDismiss}
          onMarkRead={handleMarkRead}
          onActOn={handleActOn}
        />
      )}

      {/* Informational insights -- collapsed by default */}
      {feed.informational.length > 0 && (
        <div>
          <button
            onClick={() => setShowInformational(!showInformational)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            {showInformational ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span>{feed.informational.length} more observation{feed.informational.length !== 1 ? 's' : ''}</span>
          </button>

          <AnimatePresence>
            {showInformational && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <InsightSection
                  urgency="informational"
                  insights={feed.informational}
                  onDismiss={handleDismiss}
                  onMarkRead={handleMarkRead}
                  onActOn={handleActOn}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

// ─── Insight Section ────────────────────────────────────────────────

interface InsightSectionProps {
  urgency: "critical" | "important" | "informational"
  insights: AgentInsight[]
  onDismiss: (id: string) => void
  onMarkRead: (id: string) => void
  onActOn: (id: string) => void
}

function InsightSection({
  urgency,
  insights,
  onDismiss,
  onMarkRead,
  onActOn,
}: InsightSectionProps): React.ReactElement {
  const config = URGENCY_CONFIG[urgency]
  const Icon = config.icon

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("h-4 w-4", config.iconColor)} />
        <span className="text-sm font-semibold text-foreground">{config.label}</span>
        <Badge variant={config.badgeVariant} className="text-xs">
          {insights.length}
        </Badge>
      </div>

      {/* Insight cards */}
      <motion.div
        className="space-y-2"
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="show"
      >
        <AnimatePresence mode="popLayout">
          {insights.map(insight => (
            <InsightCard
              key={insight.id}
              insight={insight}
              urgency={urgency}
              onDismiss={onDismiss}
              onMarkRead={onMarkRead}
              onActOn={onActOn}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// ─── Insight Card ───────────────────────────────────────────────────

interface InsightCardProps {
  insight: AgentInsight
  urgency: "critical" | "important" | "informational"
  onDismiss: (id: string) => void
  onMarkRead: (id: string) => void
  onActOn: (id: string) => void
}

function InsightCard({
  insight,
  urgency,
  onDismiss,
  onMarkRead,
  onActOn,
}: InsightCardProps): React.ReactElement {
  const config = URGENCY_CONFIG[urgency]
  const specialist = SPECIALISTS.find(s => s.id === insight.specialist_id)
  const typeLabel = INSIGHT_TYPE_LABELS[insight.insight_type] ?? insight.insight_type
  const timeAgo = getRelativeTime(insight.created_at)

  // Mark as read when card is viewed
  useEffect(() => {
    if (!insight.is_read) {
      onMarkRead(insight.id)
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      layout
    >
      <Card
        className={cn(
          "border-l-4 transition-all duration-200 hover:shadow-md",
          config.borderColor,
          !insight.is_read && config.bgColor,
        )}
      >
        <CardContent className="p-4">
          <div className="flex gap-3">
            {/* Specialist avatar */}
            <div className="flex-shrink-0 pt-0.5">
              {specialist ? (
                <UserAvatar
                  name={specialist.name}
                  role="AI_Agent"
                  size="sm"
                  avatarUrl={specialist.avatarImage}
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {insight.title}
                    </span>
                    {!insight.is_read && (
                      <span className="h-2 w-2 rounded-full bg-international-orange flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {specialist?.name ?? "Specialist"} &middot; {typeLabel} &middot; {timeAgo}
                    </span>
                  </div>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => onDismiss(insight.id)}
                  className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Dismiss insight"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Body */}
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {insight.body}
              </p>

              {/* Actions */}
              {insight.suggested_actions && insight.suggested_actions.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  {(insight.suggested_actions as Array<{ label: string; action_type: string }>).slice(0, 2).map((action, idx) => (
                    <Button
                      key={idx}
                      variant={idx === 0 ? "default" : "secondary"}
                      size="sm"
                      className={cn(
                        "h-7 text-xs",
                        idx === 0 && "bg-international-orange hover:bg-international-orange-hover",
                      )}
                      onClick={() => onActOn(insight.id)}
                    >
                      {action.action_type === "open_specialist" && (
                        <ExternalLink className="h-3 w-3 mr-1" />
                      )}
                      {action.action_type === "view_page" && (
                        <Eye className="h-3 w-3 mr-1" />
                      )}
                      {action.label}
                    </Button>
                  ))}
                  {insight.acted_on && (
                    <span className="text-xs text-status-success flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Done
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Returns a human-friendly relative time string.
 */
function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

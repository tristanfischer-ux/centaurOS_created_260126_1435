"use client"

/**
 * @file review-issue-summary.tsx — Cross-module review issue aggregation.
 *
 * @description After specialists review modules, this component aggregates all
 * issues across all modules grouped by severity (CRITICAL → WARNING → INFO).
 * Users can accept/reject individual issues and apply accepted revisions back
 * to module specs via AI-driven rewriting.
 *
 * @related
 * - Review types: src/lib/cad-lab-types.ts (SpecialistReview, ReviewIssue)
 * - Revision action: src/actions/cad-lab-reviews.ts (reviseModulesFromReviews)
 * - Context: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx
 */

import { useState, useMemo, useCallback } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { SpecialistReview, ReviewIssue, CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ──────────────────────────────────────────────────────────

/** A review issue enriched with module + specialist context */
export interface AggregatedIssue {
  /** Unique key for React rendering */
  key: string
  moduleId: string
  moduleName: string
  specialistId: string
  specialistName: string
  issue: ReviewIssue
}

export interface ReviewIssueSummaryProps {
  modules: CadLabModule[]
  moduleReviews: Record<string, SpecialistReview[]>
  isApplying: boolean
  onApplyRevisions: (acceptedIssues: AggregatedIssue[]) => void
}

// ─── Severity helpers ───────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 }

function severityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <XCircle className="h-4 w-4 text-destructive" />
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-warning" />
    default:
      return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
  }
}

function severityBadgeVariant(severity: string): "destructive" | "warning" | "secondary" {
  switch (severity) {
    case "critical":
      return "destructive"
    case "warning":
      return "warning"
    default:
      return "secondary"
  }
}

// ─── Component ──────────────────────────────────────────────────────

export function ReviewIssueSummary({
  modules,
  moduleReviews,
  isApplying,
  onApplyRevisions,
}: ReviewIssueSummaryProps) {
  // Aggregate all issues from all reviews across all modules.
  // INTENT: Also promote recommendations to issues when the structured issue
  // parser didn't match (LLMs vary format heavily). Recommendations are the
  // most reliably populated field and contain the most actionable feedback.
  const allIssues = useMemo(() => {
    const issues: AggregatedIssue[] = []
    const moduleMap = new Map(modules.map(m => [m.id, m]))

    for (const [moduleId, reviews] of Object.entries(moduleReviews)) {
      const mod = moduleMap.get(moduleId)
      if (!mod) continue

      for (const review of reviews) {
        // Add structured issues first
        for (let i = 0; i < review.issues.length; i++) {
          issues.push({
            key: `${moduleId}-${review.specialistId}-issue-${i}`,
            moduleId,
            moduleName: mod.name,
            specialistId: review.specialistId,
            specialistName: review.specialistName,
            issue: review.issues[i],
          })
        }

        // If no structured issues were parsed, promote recommendations.
        // This is the common path — LLMs rarely match the exact issue format
        // but almost always produce actionable recommendations.
        if (review.issues.length === 0 && review.recommendations.length > 0) {
          const severity = review.verdict === "fail" ? "critical" as const
            : review.verdict === "warn" ? "warning" as const
            : "info" as const
          for (let i = 0; i < review.recommendations.length; i++) {
            issues.push({
              key: `${moduleId}-${review.specialistId}-rec-${i}`,
              moduleId,
              moduleName: mod.name,
              specialistId: review.specialistId,
              specialistName: review.specialistName,
              issue: {
                severity,
                category: "Recommendation",
                message: review.recommendations[i],
              },
            })
          }
        }
      }
    }

    // Sort: CRITICAL first, then WARNING, then INFO
    issues.sort((a, b) => (SEVERITY_ORDER[a.issue.severity] ?? 99) - (SEVERITY_ORDER[b.issue.severity] ?? 99))
    return issues
  }, [modules, moduleReviews])

  // Accept/reject state — CRITICAL and WARNING default accepted, INFO default rejected
  const [accepted, setAccepted] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const issue of allIssues) {
      if (issue.issue.severity !== "info") {
        initial.add(issue.key)
      }
    }
    return initial
  })

  const toggleIssue = useCallback((key: string) => {
    setAccepted(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const acceptedIssues = useMemo(
    () => allIssues.filter(i => accepted.has(i.key)),
    [allIssues, accepted],
  )

  // Severity counts
  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 }
    for (const issue of allIssues) {
      if (issue.issue.severity in c) {
        c[issue.issue.severity as keyof typeof c]++
      }
    }
    return c
  }, [allIssues])

  const affectedModuleCount = useMemo(
    () => new Set(allIssues.map(i => i.moduleId)).size,
    [allIssues],
  )

  if (allIssues.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
          <p className="text-sm text-muted-foreground">
            No issues found across specialist reviews. All modules look good.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Group by severity for display
  const grouped = useMemo(() => {
    const groups: Record<string, AggregatedIssue[]> = { critical: [], warning: [], info: [] }
    for (const issue of allIssues) {
      const sev = issue.issue.severity
      if (sev in groups) groups[sev].push(issue)
    }
    return groups
  }, [allIssues])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-international-orange" />
            Review Issue Summary
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {counts.critical > 0 && (
              <Badge variant="destructive">{counts.critical} critical</Badge>
            )}
            {counts.warning > 0 && (
              <Badge variant="warning">{counts.warning} warning{counts.warning !== 1 ? "s" : ""}</Badge>
            )}
            {counts.info > 0 && (
              <Badge variant="secondary">{counts.info} info</Badge>
            )}
            <span className="ml-1">across {affectedModuleCount} module{affectedModuleCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Issue rows grouped by severity */}
        {(["critical", "warning", "info"] as const).map(severity => {
          const items = grouped[severity]
          if (items.length === 0) return null

          return (
            <div key={severity} className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {severityIcon(severity)}
                {severity} ({items.length})
              </h4>
              <div className="space-y-1">
                {items.map(item => {
                  const isAccepted = accepted.has(item.key)
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleIssue(item.key)}
                      disabled={isApplying}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors",
                        isAccepted
                          ? "border-border bg-card"
                          : "border-border/50 bg-muted/30 opacity-60",
                        !isApplying && "hover:bg-muted/50",
                      )}
                    >
                      {/* Accept/reject indicator */}
                      <div className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                        isAccepted
                          ? "border-international-orange bg-international-orange text-white"
                          : "border-border bg-card",
                      )}>
                        {isAccepted && <CheckCircle2 className="h-3 w-3" />}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={severityBadgeVariant(item.issue.severity)} className="text-[10px]">
                            {item.issue.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{item.moduleName}</span>
                          <span className="text-xs text-muted-foreground/60">by {item.specialistName}</span>
                        </div>
                        <p className="text-sm text-foreground">{item.issue.message}</p>
                        {item.issue.suggestion && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="cursor-help text-xs text-international-orange">
                                Fix: {item.issue.suggestion}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-sm">
                              <p className="text-xs">{item.issue.suggestion}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Apply Revisions button */}
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {acceptedIssues.length} of {allIssues.length} issue{allIssues.length !== 1 ? "s" : ""} selected for revision
          </p>
          <Button
            onClick={() => onApplyRevisions(acceptedIssues)}
            disabled={acceptedIssues.length === 0 || isApplying}
            className="gap-2"
          >
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Revising modules…
              </>
            ) : (
              <>
                <Wrench className="h-4 w-4" />
                Apply Revisions ({acceptedIssues.length})
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * @file design-changes-dialog.tsx — Review proposed design changes from convergence
 *
 * @description Displays AI-proposed parametric changes after the full analysis
 * pipeline completes. Users can approve, modify, or skip each change before
 * they are applied. This is the key "human validation" checkpoint in the
 * Generate → Analyze → Evaluate → Modify → Repeat loop.
 *
 * @related
 * - Convergence controller: ../services/convergence-controller.ts
 * - Pipeline context: ./forge-project-context.tsx
 * - Engineering summary: ./engineering-summary.tsx
 */

"use client"

import React, { useState, useMemo } from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  CheckCircle2,
  XCircle,
  Pencil,
  ArrowRight,
  AlertTriangle,
  ShieldAlert,
  Lightbulb,
  RotateCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"

import type { ProposedChange, ConvergenceEvaluation } from "../services/convergence-controller"

// ─── Types ───────────────────────────────────────────────────────────

/** User's decision on each proposed change */
type ChangeDecision = "approve" | "modify" | "skip"

export interface ChangeReview {
  change: ProposedChange
  decision: ChangeDecision
  /** Modified value when user overrides the AI suggestion */
  userValue?: string
}

interface DesignChangesDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Close handler */
  onClose: () => void
  /** Convergence evaluation with proposed changes */
  evaluation: ConvergenceEvaluation
  /** Called when user confirms their change decisions */
  onApplyChanges: (approved: ChangeReview[]) => void
  /** Whether changes are currently being applied */
  isApplying?: boolean
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * DesignChangesDialog — Review and approve AI-proposed design changes.
 *
 * @description Presents each proposed change with its rationale, current value,
 * and suggested value. Users can approve (use AI suggestion), modify (override
 * the value), or skip each change. Severity badges help prioritize decisions.
 *
 * @example
 * <DesignChangesDialog
 *   open={showChangesDialog}
 *   onClose={() => setShowChangesDialog(false)}
 *   evaluation={convergenceResult}
 *   onApplyChanges={handleApplyChanges}
 * />
 */
export function DesignChangesDialog({
  open,
  onClose,
  evaluation,
  onApplyChanges,
  isApplying = false,
}: DesignChangesDialogProps): React.ReactNode {
  const [reviews, setReviews] = useState<Map<number, ChangeReview>>(() => {
    const map = new Map<number, ChangeReview>()
    evaluation.proposedChanges.forEach((change, idx) => {
      map.set(idx, { change, decision: "approve" })
    })
    return map
  })

  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  const changes = evaluation.proposedChanges
  const approvedCount = useMemo(
    () => Array.from(reviews.values()).filter((r) => r.decision !== "skip").length,
    [reviews],
  )

  /** Update decision for a specific change */
  const setDecision = (idx: number, decision: ChangeDecision, userValue?: string): void => {
    setReviews((prev) => {
      const next = new Map(prev)
      const existing = next.get(idx)
      if (existing) {
        next.set(idx, { ...existing, decision, userValue })
      }
      return next
    })
    if (decision !== "modify") {
      setEditingIdx(null)
    }
  }

  /** Handle "Apply Changes" — send approved/modified changes to parent */
  const handleApply = (): void => {
    const approved = Array.from(reviews.values()).filter((r) => r.decision !== "skip")
    onApplyChanges(approved)
  }

  if (changes.length === 0) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>All Criteria Met</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12 text-status-success" />
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                Design is converged
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {evaluation.summary}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-international-orange" />
            Review Proposed Design Changes
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="space-y-3">
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertDescription>
              {evaluation.summary}
              <span className="block mt-1 text-xs text-muted-foreground">
                {evaluation.metCount}/{evaluation.totalCount} convergence criteria met
                {" — "}
                {changes.length} change{changes.length > 1 ? "s" : ""} proposed
              </span>
            </AlertDescription>
          </Alert>

          {/* Severity legend */}
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground font-medium">Severity:</span>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-6 rounded-full bg-destructive" />
              <span className="text-foreground">Critical</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-6 rounded-full bg-international-orange" />
              <span className="text-foreground">Recommended</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-6 rounded-full bg-muted-foreground" />
              <span className="text-foreground">Optional</span>
            </div>
          </div>
        </div>

        {/* Change list */}
        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-3 pr-4">
            {changes.map((change, idx) => {
              const review = reviews.get(idx)
              const isEditing = editingIdx === idx

              return (
                <ChangeCard
                  key={idx}
                  change={change}
                  review={review}
                  isEditing={isEditing}
                  onApprove={() => setDecision(idx, "approve")}
                  onSkip={() => setDecision(idx, "skip")}
                  onStartEdit={() => {
                    setEditingIdx(idx)
                    setDecision(idx, "modify", review?.userValue ?? change.suggestedValue)
                  }}
                  onSaveEdit={(value: string) => {
                    setDecision(idx, "modify", value)
                    setEditingIdx(null)
                  }}
                  onCancelEdit={() => {
                    setEditingIdx(null)
                    if (review?.decision === "modify" && !review.userValue) {
                      setDecision(idx, "approve")
                    }
                  }}
                />
              )
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button variant="secondary" onClick={onClose} disabled={isApplying}>
              Skip All
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {approvedCount} of {changes.length} changes selected
              </span>
              <Button
                onClick={handleApply}
                disabled={isApplying || approvedCount === 0}
              >
                {isApplying ? (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Apply {approvedCount} Change{approvedCount !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────

interface ChangeCardProps {
  change: ProposedChange
  review?: ChangeReview
  isEditing: boolean
  onApprove: () => void
  onSkip: () => void
  onStartEdit: () => void
  onSaveEdit: (value: string) => void
  onCancelEdit: () => void
}

/**
 * ChangeCard — Renders a single proposed design change with action buttons.
 */
function ChangeCard({
  change,
  review,
  isEditing,
  onApprove,
  onSkip,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: ChangeCardProps): React.ReactNode {
  const [editValue, setEditValue] = useState(change.suggestedValue)
  const decision = review?.decision ?? "approve"

  const severityConfig = {
    critical: { color: "bg-destructive", icon: ShieldAlert, variant: "destructive" as const },
    recommended: { color: "bg-international-orange", icon: AlertTriangle, variant: "warning" as const },
    optional: { color: "bg-muted-foreground", icon: Lightbulb, variant: "secondary" as const },
  }

  const config = severityConfig[change.severity]
  const SeverityIcon = config.icon

  return (
    <Card
      className={cn(
        "transition-all",
        decision === "skip" && "opacity-50",
      )}
    >
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-start gap-3">
          {/* Severity indicator */}
          <div className={cn("w-1 h-full min-h-[60px] rounded-full", config.color)} />

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <SeverityIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-semibold text-foreground truncate">
                  {change.description}
                </span>
              </div>
              <Badge variant={config.variant} className="text-[9px] shrink-0">
                {change.severity}
              </Badge>
            </div>

            {/* Parameter and values */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground font-medium">{change.parameter}:</span>
              <span className="font-mono text-foreground">{change.currentValue}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              {decision === "modify" && review?.userValue ? (
                <span className="font-mono text-international-orange font-semibold">
                  {review.userValue}
                </span>
              ) : (
                <span className="font-mono text-status-success font-semibold">
                  {change.suggestedValue}
                </span>
              )}
            </div>

            {/* Rationale */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              {change.rationale}
            </p>

            {/* Module reference */}
            <span className="text-[10px] text-muted-foreground">
              Module: {change.moduleId}
            </span>

            {/* Edit field (when modifying) */}
            {isEditing && (
              <div className="flex items-center gap-2 pt-1">
                <Label htmlFor={`edit-${change.parameter}`} className="text-xs shrink-0">
                  Your value:
                </Label>
                <Input
                  id={`edit-${change.parameter}`}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="h-8 text-xs font-mono max-w-[200px]"
                  autoFocus
                />
                <Button size="sm" variant="default" onClick={() => onSaveEdit(editValue)} className="h-8">
                  Save
                </Button>
                <Button size="sm" variant="secondary" onClick={onCancelEdit} className="h-8">
                  Cancel
                </Button>
              </div>
            )}

            {/* Action buttons */}
            {!isEditing && (
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant={decision === "approve" ? "default" : "secondary"}
                  onClick={onApprove}
                  className="h-7 text-xs"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant={decision === "modify" ? "default" : "secondary"}
                  onClick={onStartEdit}
                  className="h-7 text-xs"
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Modify
                </Button>
                <Button
                  size="sm"
                  variant={decision === "skip" ? "destructive" : "secondary"}
                  onClick={onSkip}
                  className="h-7 text-xs"
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Skip
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

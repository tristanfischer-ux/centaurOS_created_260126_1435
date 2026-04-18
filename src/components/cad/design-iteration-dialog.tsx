"use client"

/**
 * @file design-iteration-dialog.tsx — Generic dialog for presenting design alternatives.
 *
 * @description Phase III of the design-iteration system. Consumes the output of
 * the Phase II LLM generators and lets the founder pick Keep-as-is / one of
 * the alternatives / Abandon (add to accepted risks).
 *
 * Trigger-specific content (e.g. cost waterfall) is injected via the `triggerSlot` prop.
 *
 * @related
 * - Actions: src/actions/design-iterations.ts, src/actions/design-iteration-generator.ts
 * - Plan: tasks/DESIGN-ITERATION-PHASE-PLAN.md
 */

import React, { useCallback, useMemo, useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Sparkles, AlertOctagon, AlertTriangle, CheckCircle2, History, ArrowRight, Loader2, Flag, XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type {
  DesignAlternative, IterationHistoryEntry, IterationTrigger,
} from "@/lib/cad-lab/design-iteration-types"
import {
  commitIterationDecision,
  acceptDesignRisk,
} from "@/actions/design-iterations"

// ─── Public props ────────────────────────────────────────────────

export interface DesignIterationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The iteration_id written by recordDesignIteration — required so commit can update this row */
  iterationId: string | null
  projectId: string
  trigger: IterationTrigger
  /** The concern that triggered this iteration (verbatim specialist quote, cost overrun, etc.) */
  concernText: string
  /** The concern hash — needed for the abandon → accepted-risks flow */
  concernHash: string | null
  alternatives: DesignAlternative[]
  /** Iteration history for this project — optional, surfaces the "what we already tried" panel (R5) */
  history?: IterationHistoryEntry[]
  /** Optional trigger-specific content shown above alternatives (e.g. cost waterfall) */
  triggerSlot?: React.ReactNode
  /** Called after the founder commits. Pass the iteration row + pick so the parent can apply changes (Phase V) */
  onCommitted?: (result: { iterationId: string; chosenOptionIndex: number; alternative: DesignAlternative | null }) => void
}

// ─── Trigger copy ────────────────────────────────────────────────

const TRIGGER_COPY: Record<IterationTrigger, { title: string; subtitle: string }> = {
  specialist_infeasibility: {
    title: "Three ways to make this work",
    subtitle: "A specialist flagged that the design as specified cannot be built. Here's how to adjust it.",
  },
  cost_overrun: {
    title: "Three ways to bring the cost down",
    subtitle: "Unit cost is above your target. These are the paths that preserve your feature scope.",
  },
  compliance_miss: {
    title: "Three ways to meet compliance",
    subtitle: "No supplier in your shortlist can attest to one of your target regulations.",
  },
  lead_time_exceeded: {
    title: "Three ways to hit your launch window",
    subtitle: "Combined lead times exceed your launch window. Here's how to compress.",
  },
  moq_mismatch: {
    title: "Three ways to bridge the MOQ gap",
    subtitle: "Supplier MOQ exceeds your pilot volume. Either change suppliers, change volume, or change approach.",
  },
  manual: {
    title: "Three ways to reconsider this",
    subtitle: "You asked for alternatives. Here are concrete options based on your research + modules.",
  },
}

// ─── Component ───────────────────────────────────────────────────

export function DesignIterationDialog({
  open, onOpenChange,
  iterationId, projectId, trigger, concernText, concernHash,
  alternatives, history, triggerSlot, onCommitted,
}: DesignIterationDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [abandonReason, setAbandonReason] = useState("")
  const [showAbandon, setShowAbandon] = useState(false)

  const copy = TRIGGER_COPY[trigger]
  const recommendedIdx = useMemo(
    () => alternatives.findIndex((a) => a.recommended),
    [alternatives],
  )

  const submit = useCallback(async (chosenOptionIndex: number) => {
    if (!iterationId) { toast.error("Iteration not recorded yet"); return }
    setSubmitting(true)
    const res = await commitIterationDecision({ iterationId, chosenOptionIndex, founderNotes: notes })
    setSubmitting(false)
    if ("error" in res) { toast.error(res.error); return }
    const alternative = chosenOptionIndex >= 0 ? (alternatives[chosenOptionIndex] ?? null) : null
    onCommitted?.({ iterationId, chosenOptionIndex, alternative })
    onOpenChange(false)
  }, [iterationId, notes, alternatives, onCommitted, onOpenChange])

  const submitAbandon = useCallback(async () => {
    if (!iterationId || !concernHash) { toast.error("Missing iteration context"); return }
    if (!abandonReason.trim()) { toast.error("A written reason is required to abandon a concern"); return }
    setSubmitting(true)
    const accept = await acceptDesignRisk({
      projectId, concernHash, concernText, reason: abandonReason,
    })
    if ("error" in accept) { setSubmitting(false); toast.error(accept.error); return }
    const commit = await commitIterationDecision({
      iterationId, chosenOptionIndex: -2, founderNotes: `Abandoned: ${abandonReason}`,
    })
    setSubmitting(false)
    if ("error" in commit) { toast.error(commit.error); return }
    toast.success("Concern added to your accepted-risk register")
    onCommitted?.({ iterationId, chosenOptionIndex: -2, alternative: null })
    onOpenChange(false)
  }, [iterationId, concernHash, projectId, concernText, abandonReason, onCommitted, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-international-orange" />
            {copy.title}
          </DialogTitle>
          <DialogDescription>{copy.subtitle}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto pr-2 space-y-4">
          {/* ── Concern verbatim (R2) ── */}
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-semibold text-warning uppercase tracking-wider mb-1">The concern</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{concernText}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Trigger-specific slot (cost waterfall, compliance table, etc.) ── */}
          {triggerSlot}

          {/* ── History toggle (R5) ── */}
          {history && history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="h-3 w-3" />
              {showHistory ? "Hide" : "Show"} iteration history ({history.length})
            </button>
          )}
          {showHistory && history && (
            <Card className="border-border">
              <CardContent className="pt-3 pb-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Previously on this project</p>
                <ul className="space-y-1.5 text-xs">
                  {history.slice(0, 10).map((h) => (
                    <li key={h.id}>
                      <span className="text-muted-foreground">{new Date(h.createdAt).toLocaleDateString()}</span>
                      <span className="mx-1.5">·</span>
                      <span className="font-medium">{h.triggeredBy.replace(/_/g, " ")}</span>
                      <span className="mx-1.5">·</span>
                      <span className="text-muted-foreground">
                        {h.chosenOptionIndex === null ? "in progress"
                          : h.chosenOptionIndex === -1 ? "kept as-is"
                          : h.chosenOptionIndex === -2 ? "abandoned (accepted risk)"
                          : `picked: ${h.alternativesPresented[h.chosenOptionIndex]?.headline ?? "option"}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* ── Alternatives (R1: max 3, one Recommended) ── */}
          <div className="space-y-3">
            {alternatives.map((alt, idx) => (
              <AlternativeCard
                key={idx}
                alternative={alt}
                index={idx}
                selected={selectedIndex === idx}
                isRecommended={idx === recommendedIdx}
                onSelect={() => setSelectedIndex(idx)}
              />
            ))}
          </div>

          {/* ── Founder notes ── */}
          <div>
            <label className="text-xs font-medium text-foreground">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full mt-1 text-xs border border-input rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange resize-y"
              placeholder="Why did you pick (or reject) this option? Saved with the iteration log."
            />
          </div>

          {/* ── Abandon path (Round 2: commit-or-abandon ritual) ── */}
          {showAbandon && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="pt-3 pb-3 space-y-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Flag className="h-3 w-3 text-destructive" />
                  Abandon this concern — accept the risk
                </p>
                <p className="text-[11px] text-muted-foreground">
                  The concern will be logged on your Launch Readiness gauge as an accepted risk. A written reason is required for audit.
                </p>
                <textarea
                  value={abandonReason}
                  onChange={(e) => setAbandonReason(e.target.value)}
                  rows={2}
                  placeholder="Why are you accepting this risk? (e.g. 'Too early to address; will revisit before pilot.')"
                  className="w-full text-xs border border-input rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange resize-y"
                />
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Close
          </Button>
          {!showAbandon ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowAbandon(true)} disabled={submitting} className="text-destructive hover:text-destructive">
                <Flag className="h-3 w-3 mr-1" /> Abandon (accept risk)
              </Button>
              <Button variant="secondary" size="sm" onClick={() => submit(-1)} disabled={submitting}>
                <XCircle className="h-3 w-3 mr-1" /> Keep as-is
              </Button>
              <Button
                size="sm"
                onClick={() => selectedIndex !== null && submit(selectedIndex)}
                disabled={submitting || selectedIndex === null}
              >
                {submitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Apply selected <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowAbandon(false)} disabled={submitting}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={submitAbandon} disabled={submitting || !abandonReason.trim()}>
                {submitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Accept risk &amp; close
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Alternative card ────────────────────────────────────────────

function AlternativeCard({
  alternative, index, selected, isRecommended, onSelect,
}: {
  alternative: DesignAlternative
  index: number
  selected: boolean
  isRecommended: boolean
  onSelect: () => void
}) {
  const letter = String.fromCharCode("A".charCodeAt(0) + index)

  return (
    <Card
      className={cn(
        "border transition-all cursor-pointer hover:-translate-y-0.5 active:scale-[0.99] duration-200",
        selected ? "border-international-orange ring-2 ring-international-orange/30" : "border-border",
        isRecommended && !selected && "border-success/40",
      )}
      onClick={onSelect}
    >
      <CardContent className="pt-4 pb-4">
        {/* Header row: letter, headline, recommended badge, severity */}
        <div className="flex items-start gap-3 mb-2">
          <div
            className={cn(
              "flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold",
              selected ? "bg-international-orange text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {letter}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{alternative.headline}</p>
              {isRecommended && (
                <Badge variant="success" className="h-4 px-1.5 text-[10px]">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Recommended
                </Badge>
              )}
              {alternative.severity.exportControls && (
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                  <AlertOctagon className="h-2.5 w-2.5 mr-0.5" /> Export controls
                </Badge>
              )}
              {alternative.severity.featureDescope && (
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                  <AlertOctagon className="h-2.5 w-2.5 mr-0.5" /> Descopes features
                </Badge>
              )}
              {alternative.severity.supplyCommitmentBreak && (
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                  <AlertOctagon className="h-2.5 w-2.5 mr-0.5" /> Breaks supply commit
                </Badge>
              )}
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] capitalize">
                {alternative.confidence} confidence
              </Badge>
            </div>
          </div>
        </div>

        {/* Plain-English (R1) */}
        {alternative.plainEnglish && (
          <p className="text-xs text-foreground mt-1 mb-2 italic">"{alternative.plainEnglish}"</p>
        )}

        {/* Rationale (R2: references concern) */}
        {alternative.rationale && (
          <p className="text-xs text-muted-foreground mb-2">{alternative.rationale}</p>
        )}

        {/* Trade-offs (R2: labelled dimensions) */}
        {alternative.tradeOffs.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Trade-offs</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {alternative.tradeOffs.slice(0, 6).map((t, i) => (
                <div key={i} className="text-[11px]">
                  <span className="text-muted-foreground capitalize">{t.dimension}:</span>
                  <span className="text-foreground font-medium ml-1">{t.delta}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cost-specific fields, shown when present in changes */}
        {typeof alternative.changes.unit_cost_delta_gbp === "number" && (
          <div className="pt-2 border-t border-border mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <span>
              <span className="text-muted-foreground">Unit cost Δ:</span>{" "}
              <span className={cn("font-mono font-medium", (alternative.changes.unit_cost_delta_gbp as number) < 0 ? "text-success" : "text-destructive")}>
                £{(alternative.changes.unit_cost_delta_gbp as number).toFixed(0)}
              </span>
            </span>
            {typeof alternative.changes.tooling_nre_delta_gbp === "number" && (
              <span>
                <span className="text-muted-foreground">Tooling NRE Δ:</span>{" "}
                <span className="font-mono font-medium text-foreground">£{(alternative.changes.tooling_nre_delta_gbp as number).toFixed(0)}</span>
              </span>
            )}
            {typeof alternative.changes.break_even_units === "number" && (
              <span>
                <span className="text-muted-foreground">Break-even:</span>{" "}
                <span className="font-mono font-medium text-foreground">{(alternative.changes.break_even_units as number).toLocaleString()} units</span>
              </span>
            )}
            {typeof alternative.changes.moq_at_new_path === "number" && (
              <span>
                <span className="text-muted-foreground">New MOQ:</span>{" "}
                <span className="font-mono font-medium text-foreground">{(alternative.changes.moq_at_new_path as number).toLocaleString()}</span>
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

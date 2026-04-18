"use client"

/**
 * @file design-iteration-host.tsx — Orchestrates the design-iteration flow end-to-end.
 *
 * @description Phase IV integration surface. Wires together:
 *   - Phase II alternative generators (LLM)
 *   - Phase I record/history/commit actions
 *   - Phase III DesignIterationDialog
 *   - Phase V apply handler
 *
 * Mount once at the page level. Exposes a dispatch ref the page can call
 * (setRef.current?.triggerInfeasibility(...)) from the "Revise the design"
 * button in the specialist-checkpoint card + any future trigger surfaces.
 *
 * @related
 * - Plan: tasks/DESIGN-ITERATION-PHASE-PLAN.md (Phases IV + V)
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react"
import { toast } from "sonner"
import { DesignIterationDialog } from "@/components/cad/design-iteration-dialog"
import {
  getDesignIterationHistory,
  recordDesignIteration,
} from "@/actions/design-iterations"
import type {
  DesignAlternative, IterationHistoryEntry, IterationTrigger,
} from "@/lib/cad-lab/design-iteration-types"
import {
  generateInfeasibilityAlternatives,
  generateCostReductionAlternatives,
  generateManualAlternatives,
} from "@/actions/design-iteration-generator"
import { applyDesignIteration, getInFlightIterations } from "@/actions/design-iteration-apply"

export interface DesignIterationHostHandle {
  triggerInfeasibility(concernText: string, specialists: string[]): Promise<void>
  triggerCostReduction(args: {
    currentUnitCostGbp: number | null
    targetUnitCostGbp: number
    moduleCostBreakdown?: Array<{ moduleId: string; moduleName: string; costGbp: number }>
  }): Promise<void>
  triggerManual(concernText: string): Promise<void>
}

interface Props {
  projectId: string
  /** Called after a successful apply so the parent can refresh state / re-run checkpoint */
  onApplied?: (info: { newRevision: number | undefined; staleModuleIds: string[]; chosenOptionIndex: number }) => void
}

export const DesignIterationHost = forwardRef<DesignIterationHostHandle, Props>(function DesignIterationHost(
  { projectId, onApplied }, ref,
) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [trigger, setTrigger] = useState<IterationTrigger>("manual")
  const [concernText, setConcernText] = useState("")
  const [concernHash, setConcernHash] = useState<string | null>(null)
  const [iterationId, setIterationId] = useState<string | null>(null)
  const [alternatives, setAlternatives] = useState<DesignAlternative[]>([])
  const [history, setHistory] = useState<IterationHistoryEntry[] | undefined>(undefined)

  // Preload history when projectId changes (Round 5 — show previously rejected)
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    getDesignIterationHistory(projectId).then((res) => {
      if (cancelled) return
      if ("entries" in res) setHistory(res.entries)
    })
    return () => { cancelled = true }
  }, [projectId])

  const startFlow = useCallback(async (args: {
    trigger: IterationTrigger
    concernText: string
    triggerContext?: Record<string, unknown>
    alternatives: DesignAlternative[]
  }) => {
    // Phase VI: advisory lock — warn but don't block if another iteration is in flight
    const inFlightRes = await getInFlightIterations(projectId)
    if ("inFlight" in inFlightRes && inFlightRes.inFlight.length > 0) {
      toast.warning(`Another team member started an iteration ${Math.round((Date.now() - new Date(inFlightRes.inFlight[0].createdAt).getTime()) / 60000)}m ago. You can continue yours, but committing may collide.`, { duration: 8000 })
    }

    const rec = await recordDesignIteration({
      projectId,
      triggeredBy: args.trigger,
      concernText: args.concernText,
      triggerContext: args.triggerContext,
      alternativesPresented: args.alternatives,
    })
    if ("error" in rec) {
      if (rec.capBlocked) {
        toast.error(rec.error ?? "Iteration capped")
      } else {
        toast.error(rec.error ?? "Could not record iteration")
      }
      return
    }
    setIterationId(rec.iteration.id)
    setConcernHash(rec.iteration.concern_hash)
    setOpen(true)
  }, [projectId])

  useImperativeHandle(ref, (): DesignIterationHostHandle => ({
    async triggerInfeasibility(concernText, specialists) {
      setLoading(true)
      setTrigger("specialist_infeasibility")
      setConcernText(concernText)
      try {
        const res = await generateInfeasibilityAlternatives({
          projectId, concernText, flaggingSpecialists: specialists,
        })
        if (res.error || res.alternatives.length === 0) {
          toast.error(res.error ?? "Could not generate alternatives")
          return
        }
        setAlternatives(res.alternatives)
        await startFlow({
          trigger: "specialist_infeasibility",
          concernText,
          triggerContext: { flaggingSpecialists: specialists },
          alternatives: res.alternatives,
        })
      } finally { setLoading(false) }
    },
    async triggerCostReduction(args) {
      setLoading(true)
      setTrigger("cost_overrun")
      const concern = args.currentUnitCostGbp != null
        ? `Unit cost £${args.currentUnitCostGbp.toFixed(0)} exceeds target £${args.targetUnitCostGbp}. Gap to close: £${(args.currentUnitCostGbp - args.targetUnitCostGbp).toFixed(0)}.`
        : `Looking for cost-reduction paths toward target £${args.targetUnitCostGbp}.`
      setConcernText(concern)
      try {
        const res = await generateCostReductionAlternatives({
          projectId,
          currentUnitCostGbp: args.currentUnitCostGbp,
          targetUnitCostGbp: args.targetUnitCostGbp,
          moduleCostBreakdown: args.moduleCostBreakdown,
        })
        if (res.error || res.alternatives.length === 0) {
          toast.error(res.error ?? "Could not generate cost alternatives")
          return
        }
        setAlternatives(res.alternatives)
        await startFlow({
          trigger: "cost_overrun",
          concernText: concern,
          triggerContext: {
            currentUnitCostGbp: args.currentUnitCostGbp,
            targetUnitCostGbp: args.targetUnitCostGbp,
          },
          alternatives: res.alternatives,
        })
      } finally { setLoading(false) }
    },
    async triggerManual(concernText) {
      setLoading(true)
      setTrigger("manual")
      setConcernText(concernText)
      try {
        const res = await generateManualAlternatives({ projectId, concernText })
        if (res.error || res.alternatives.length === 0) {
          toast.error(res.error ?? "Could not generate alternatives")
          return
        }
        setAlternatives(res.alternatives)
        await startFlow({
          trigger: "manual",
          concernText,
          alternatives: res.alternatives,
        })
      } finally { setLoading(false) }
    },
  }), [projectId, startFlow])

  const handleCommitted = useCallback(async ({ iterationId: iterId, chosenOptionIndex, alternative }: {
    iterationId: string
    chosenOptionIndex: number
    alternative: DesignAlternative | null
  }) => {
    // If a real alternative was picked (0..2), apply it now (Phase V).
    if (chosenOptionIndex >= 0 && alternative) {
      const applyRes = await applyDesignIteration({
        iterationId: iterId, projectId, chosenOptionIndex,
      })
      if ("error" in applyRes && applyRes.error) {
        toast.error(`Apply failed: ${applyRes.error}`)
        return
      }
      toast.success(`Applied: "${alternative.headline}". Illustrations will regenerate.`, { duration: 8000 })
      onApplied?.({
        newRevision: applyRes.newRevision,
        staleModuleIds: applyRes.staleModuleIds ?? [],
        chosenOptionIndex,
      })
    } else if (chosenOptionIndex === -1) {
      toast.info("Kept as-is. Concern logged on iteration history.")
    } else if (chosenOptionIndex === -2) {
      // Already handled by DesignIterationDialog (acceptDesignRisk call)
    }
    // Refresh history for next open
    const histRes = await getDesignIterationHistory(projectId)
    if ("entries" in histRes) setHistory(histRes.entries)
  }, [projectId, onApplied])

  if (!open) {
    // Render nothing when closed, but still expose imperative handle + loading state.
    return loading ? <LoadingInline /> : null
  }

  return (
    <DesignIterationDialog
      open={open}
      onOpenChange={setOpen}
      iterationId={iterationId}
      projectId={projectId}
      trigger={trigger}
      concernText={concernText}
      concernHash={concernHash}
      alternatives={alternatives}
      history={history}
      onCommitted={handleCommitted}
    />
  )
})

function LoadingInline() {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <span className="inline-block h-3 w-3 rounded-full border-2 border-international-orange border-t-transparent animate-spin" />
      Generating design alternatives…
    </div>
  )
}

"use client"

/**
 * @file cost-reduction-trigger.tsx — Source Costs tab surface for the
 * cost-reduction design-iteration flow.
 *
 * @description Shows the founder's per-unit cost target vs the current
 * estimate. When current > target (or when the founder just wants to explore
 * cheaper paths), offers a "Propose cost reductions" button that invokes the
 * design iteration host's triggerCostReduction flow.
 *
 * Per-Phase-Plan Round-1 finding: target is OPTIONAL to set but REQUIRED
 * before cost-reduction iteration can run. So the card shows a target input
 * up-front; until the founder enters a target, the button is disabled.
 *
 * @related
 * - Action: src/actions/design-iterations.ts (getProjectTargetUnitCost / setProjectTargetUnitCost)
 * - Host: src/components/cad/design-iteration-host.tsx
 */

import React, { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PoundSterling, Sparkles, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  getProjectTargetUnitCost, setProjectTargetUnitCost,
} from "@/actions/design-iterations"

interface CostReductionTriggerProps {
  projectId: string
  /** Current estimated unit cost in GBP (or null if not calculated yet). */
  currentUnitCostGbp: number | null
  /** Module-level cost breakdown (sorted by cost, top 8 shown to the LLM). */
  moduleCostBreakdown?: Array<{ moduleId: string; moduleName: string; costGbp: number }>
  /** Called when the founder clicks "Propose cost reductions". Parent wires
   *  to DesignIterationHost.triggerCostReduction. */
  onTrigger: (args: {
    currentUnitCostGbp: number | null
    targetUnitCostGbp: number
    moduleCostBreakdown?: Array<{ moduleId: string; moduleName: string; costGbp: number }>
  }) => void
}

export function CostReductionTrigger({
  projectId, currentUnitCostGbp, moduleCostBreakdown, onTrigger,
}: CostReductionTriggerProps) {
  const [target, setTarget] = useState<string>("")
  const [savedTarget, setSavedTarget] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    getProjectTargetUnitCost(projectId).then((res) => {
      if (cancelled) return
      if ("targetUnitCostGbp" in res && res.targetUnitCostGbp != null) {
        setSavedTarget(res.targetUnitCostGbp)
        setTarget(String(res.targetUnitCostGbp))
      }
    })
    return () => { cancelled = true }
  }, [projectId])

  const handleSaveTarget = useCallback(async () => {
    const parsed = parseFloat(target)
    if (!(parsed > 0)) { toast.error("Target must be > 0"); return }
    setSaving(true)
    const res = await setProjectTargetUnitCost({ projectId, targetUnitCostGbp: parsed })
    setSaving(false)
    if ("error" in res) { toast.error(res.error); return }
    setSavedTarget(parsed)
    toast.success(`Target set: £${parsed.toFixed(0)}/unit`)
  }, [projectId, target])

  const targetNum = savedTarget ?? (parseFloat(target) > 0 ? parseFloat(target) : null)
  const overBudget = targetNum != null && currentUnitCostGbp != null && currentUnitCostGbp > targetNum
  const gap = overBudget && targetNum ? Math.round(currentUnitCostGbp! - targetNum) : null

  return (
    <Card className={cn("border", overBudget ? "border-warning/40 bg-warning/5" : "border-border")}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <PoundSterling className={cn("h-4 w-4 mt-0.5 flex-shrink-0", overBudget ? "text-warning" : "text-muted-foreground")} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Cost target</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {overBudget
                ? `Current estimate £${currentUnitCostGbp!.toFixed(0)} vs target £${targetNum}. Gap: £${gap}/unit.`
                : targetNum != null
                  ? `Target set: £${targetNum}/unit. Current estimate ${currentUnitCostGbp != null ? `£${currentUnitCostGbp.toFixed(0)}` : "(not yet calculated)"}.`
                  : "Set a per-unit cost target. Required before cost-reduction iterations can run."}
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">£</span>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="h-7 w-24 text-xs"
                  placeholder="target"
                />
                <span className="text-muted-foreground">/unit</span>
                {parseFloat(target) > 0 && parseFloat(target) !== savedTarget && (
                  <Button size="sm" variant="secondary" onClick={handleSaveTarget} disabled={saving} className="h-7">
                    {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    Save
                  </Button>
                )}
              </div>

              <Button
                size="sm"
                disabled={targetNum == null || targetNum !== savedTarget}
                onClick={() => onTrigger({
                  currentUnitCostGbp, targetUnitCostGbp: targetNum!, moduleCostBreakdown,
                })}
              >
                <Sparkles className="h-3 w-3 mr-1.5" />
                Propose cost reductions
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

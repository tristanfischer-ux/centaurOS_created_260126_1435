"use client"

/**
 * @file classification-review-panel.tsx — Review and override part classifications.
 *
 * @description Shows all parts across all modules with their auto-classified
 * type/process/material. Low-confidence items are highlighted with amber styling
 * so users can review and override before the Sankey diagram renders.
 */

import { useState, useMemo, useCallback } from "react"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, RotateCcw, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { classifyPart, KNOWN_PROCESSES, KNOWN_MATERIALS } from "@/lib/part-classification"
import type { CadLabModule, AiCostEstimate, PartCategoryOverride } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import { classifyPartsAi } from "@/actions/cad-lab-classify"
import type { PartToClassify } from "@/actions/cad-lab-classify"

// ─── Types ────────────────────────────────────────────────────────────

interface ClassifiedPart {
  partKey: string
  partName: string
  moduleId: string
  moduleName: string
  type: "buy" | "make"
  process: string
  material: string
  confidence: "high" | "medium" | "low"
  isOverridden: boolean
  reasons: string[]
}

interface ClassificationReviewPanelProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers | undefined
  aiCostEstimates: Record<string, AiCostEstimate> | undefined
  partCategoryOverrides: Record<string, PartCategoryOverride>
  onOverride: (partKey: string, override: PartCategoryOverride) => void
  onClearOverride: (partKey: string) => void
}

// ─── Component ────────────────────────────────────────────────────────

export function ClassificationReviewPanel({
  modules,
  diagnosticAnswers,
  aiCostEstimates,
  partCategoryOverrides,
  onOverride,
  onClearOverride,
}: ClassificationReviewPanelProps): React.ReactNode {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isAutoClassifying, setIsAutoClassifying] = useState(false)
  const [aiReasonings, setAiReasonings] = useState<Map<string, string>>(new Map())
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set())

  // Build classified parts list from modules + AI estimates
  const classifiedParts = useMemo(() => {
    const parts: ClassifiedPart[] = []

    for (const mod of modules) {
      const diag = diagnosticAnswers?.[mod.id]
      const costEstimate = aiCostEstimates?.[mod.id]
      const hasParts = costEstimate?.parts && costEstimate.parts.length > 0

      if (hasParts) {
        for (const part of costEstimate.parts!) {
          const cls = classifyPart(
            part.name,
            diag?.mfg_process || "Unknown Process",
            diag?.material || "Unknown Material",
          )
          const partKey = `${mod.id}::${part.name}`
          const override = partCategoryOverrides[partKey]

          const effectiveType = override?.type ?? (cls.explicit ? cls.type : part.type)
          const process = effectiveType === "buy"
            ? "Buy"
            : (override?.process ?? (cls.processDetected ? cls.process : (part.process || cls.process)))
          const material = effectiveType === "buy"
            ? "Off-the-shelf"
            : (override?.material ?? (cls.materialDetected ? cls.material : (part.material || cls.material)))

          parts.push({
            partKey,
            partName: part.name,
            moduleId: mod.id,
            moduleName: mod.name,
            type: effectiveType,
            process,
            material,
            confidence: override ? "high" : cls.confidence,
            isOverridden: !!override,
            reasons: cls.reasons,
          })
        }
      } else {
        // Fallback: keyParts
        for (const kp of mod.keyParts) {
          const cls = classifyPart(
            kp,
            diag?.mfg_process ?? "Unknown Process",
            diag?.material ?? "Unknown Material",
          )
          const partKey = `${mod.id}::${kp}`
          const override = partCategoryOverrides[partKey]

          parts.push({
            partKey,
            partName: kp,
            moduleId: mod.id,
            moduleName: mod.name,
            type: override?.type ?? cls.type,
            process: override?.process ?? cls.process,
            material: override?.material ?? cls.material,
            confidence: override ? "high" : cls.confidence,
            isOverridden: !!override,
            reasons: cls.reasons,
          })
        }
      }
    }

    // Sort: low confidence first, then medium, then high
    const order = { low: 0, medium: 1, high: 2 }
    parts.sort((a, b) => order[a.confidence] - order[b.confidence])

    return parts
  }, [modules, diagnosticAnswers, aiCostEstimates, partCategoryOverrides])

  const needsReviewCount = classifiedParts.filter(
    (p) => p.confidence !== "high" && !p.isOverridden,
  ).length

  const handleAutoClassify = useCallback(async () => {
    const reviewParts = classifiedParts.filter(
      (p) => p.confidence !== "high" && !p.isOverridden,
    )
    if (reviewParts.length === 0) return

    setIsAutoClassifying(true)
    try {
      const partsToClassify: PartToClassify[] = reviewParts.map((p) => {
        const mod = modules.find((m) => m.id === p.moduleId)!
        const diag = diagnosticAnswers?.[p.moduleId]
        return {
          partKey: p.partKey,
          partName: p.partName,
          moduleName: p.moduleName,
          modulePurpose: mod.purpose,
          currentProcess: diag?.mfg_process || "Unknown Process",
          currentMaterial: diag?.material || "Unknown Material",
        }
      })

      const result = await classifyPartsAi(partsToClassify)
      if (!result.success) {
        toast.error(`Classification failed: ${result.error}`)
        return
      }

      // Batch-apply overrides and store reasonings
      const newReasonings = new Map(aiReasonings)
      let applied = 0
      for (const cls of result.classifications) {
        if (cls.type === "buy") {
          onOverride(cls.partKey, { type: "buy", process: undefined, material: undefined })
        } else {
          onOverride(cls.partKey, { type: cls.type, process: cls.process, material: cls.material })
        }
        if (cls.reasoning) {
          newReasonings.set(cls.partKey, cls.reasoning)
        }
        applied++
      }
      setAiReasonings(newReasonings)
      toast.success(`Classified ${applied} parts`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Classification failed")
    } finally {
      setIsAutoClassifying(false)
    }
  }, [classifiedParts, modules, diagnosticAnswers, aiReasonings, onOverride])

  const handleClearOverride = useCallback((partKey: string) => {
    onClearOverride(partKey)
    setAiReasonings((prev) => {
      const next = new Map(prev)
      next.delete(partKey)
      return next
    })
  }, [onClearOverride])

  if (classifiedParts.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <h3 className="text-sm font-semibold text-foreground">Classification Review</h3>
            {needsReviewCount > 0 && (
              <Badge variant="warning" className="text-xs">
                {needsReviewCount} need review
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Review part classifications before viewing supplier matches
          </p>
        </button>

        {/* Auto-Classify button — outside the collapse toggle */}
        {needsReviewCount > 0 && !isCollapsed && (
          <div className="mt-2 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              disabled={isAutoClassifying}
              onClick={(e) => {
                e.stopPropagation()
                handleAutoClassify()
              }}
            >
              {isAutoClassifying ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              {isAutoClassifying
                ? "Classifying..."
                : `Auto-Classify ${needsReviewCount} parts`}
            </Button>
          </div>
        )}
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="pt-0">
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_100px_140px_140px_40px] gap-2 px-3 py-2 bg-muted text-xs font-medium text-muted-foreground border-b border-border">
              <span>Part Name</span>
              <span>Module</span>
              <span>Type</span>
              <span>Process</span>
              <span>Material</span>
              <span></span>
            </div>

            {/* Table rows */}
            <div className="max-h-[400px] overflow-y-auto">
              {classifiedParts.map((part) => {
                const needsReview = part.confidence !== "high" && !part.isOverridden
                const reasoning = aiReasonings.get(part.partKey)

                return (
                  <div
                    key={part.partKey}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      needsReview && "bg-warning/5 border-l-2 border-l-warning",
                      part.isOverridden && "bg-success/5 border-l-2 border-l-success",
                    )}
                  >
                  <div className="grid grid-cols-[1fr_120px_100px_140px_140px_40px] gap-2 px-3 py-2 text-sm items-center">
                    {/* Part name */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      {needsReview ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                      )}
                      <span className="truncate text-foreground">{part.partName}</span>
                    </div>

                    {/* Module */}
                    <span className="text-xs text-muted-foreground truncate">{part.moduleName}</span>

                    {/* Type toggle */}
                    <Select
                      value={part.type}
                      onValueChange={(val: "buy" | "make") => {
                        const existing = partCategoryOverrides[part.partKey] ?? {}
                        if (val === "buy") {
                          onOverride(part.partKey, { ...existing, type: val, process: undefined, material: undefined })
                        } else {
                          onOverride(part.partKey, { ...existing, type: val })
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buy">buy</SelectItem>
                        <SelectItem value="make">make</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Process */}
                    {part.type === "buy" ? (
                      <span className="text-xs text-muted-foreground">Buy</span>
                    ) : (
                      <Select
                        value={part.process}
                        onValueChange={(val) => {
                          const existing = partCategoryOverrides[part.partKey] ?? {}
                          onOverride(part.partKey, { ...existing, process: val })
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KNOWN_PROCESSES.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Material */}
                    {part.type === "buy" ? (
                      <span className="text-xs text-muted-foreground">OTS</span>
                    ) : (
                      <Select
                        value={part.material}
                        onValueChange={(val) => {
                          const existing = partCategoryOverrides[part.partKey] ?? {}
                          onOverride(part.partKey, { ...existing, material: val })
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KNOWN_MATERIALS.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Reset override */}
                    <div className="flex justify-center">
                      {part.isOverridden && (
                        <button
                          onClick={() => handleClearOverride(part.partKey)}
                          title="Reset to auto-classification"
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Classification reasoning — always visible for low confidence, expandable otherwise */}
                  {(part.reasons.length > 0 || reasoning) && (() => {
                    const isExpanded = needsReview || expandedReasons.has(part.partKey)
                    return (
                      <div className="px-3 pb-2 pl-8">
                        {!needsReview && (
                          <button
                            onClick={() => setExpandedReasons((prev) => {
                              const next = new Set(prev)
                              next.has(part.partKey) ? next.delete(part.partKey) : next.add(part.partKey)
                              return next
                            })}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors min-h-[44px] sm:min-h-0 py-1"
                          >
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            Why {part.type}?
                          </button>
                        )}
                        {isExpanded && (
                          <div className={cn("space-y-0.5", !needsReview && "mt-1")}>
                            {reasoning ? (
                              <p className="text-xs text-muted-foreground italic">AI: {reasoning}</p>
                            ) : (
                              part.reasons.map((r, i) => (
                                <p key={i} className="text-xs text-muted-foreground italic">{r}</p>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Accept all footer */}
          {needsReviewCount > 0 && (
            <div className="flex justify-end mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsCollapsed(true)}
              >
                Accept All & Continue
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

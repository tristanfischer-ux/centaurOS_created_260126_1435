"use client"

/**
 * @file fai-checklist.tsx — First Article Inspection checklist per module.
 *
 * @description Structured 5-line FAI per module: dimensional, material cert,
 * functional, visual, traceability. Each line is pending / pass / fail with
 * optional inspector + date + notes. Founder-grade but investor-presentable.
 *
 * @related
 * - State shape: src/lib/cad-lab/fai-state.ts
 * - Consumer: Assemble page
 */

import React, { useCallback, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronRight, ClipboardCheck, CheckCircle2, XCircle, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FAIChecklistState, FAIEntry, FAILineStatus } from "@/lib/cad-lab/fai-state"
import { FAI_LINE_LABELS, emptyFAIEntry } from "@/lib/cad-lab/fai-state"

interface Module {
  id: string
  name: string
}

interface FAIChecklistProps {
  modules: Module[]
  state: FAIChecklistState
  onChange: (next: FAIChecklistState) => void
}

const LINE_KEYS = Object.keys(FAI_LINE_LABELS) as Array<keyof typeof FAI_LINE_LABELS>

const STATUS_ICON: Record<FAILineStatus, React.ComponentType<{ className?: string }>> = {
  pending: Circle,
  pass: CheckCircle2,
  fail: XCircle,
}

const STATUS_CHIP_CLASS: Record<FAILineStatus, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  pass: "bg-success/10 text-success border-success/30",
  fail: "bg-destructive/10 text-destructive border-destructive/30",
}

function cycleStatus(current: FAILineStatus): FAILineStatus {
  if (current === "pending") return "pass"
  if (current === "pass") return "fail"
  return "pending"
}

export function FAIChecklist({ modules, state, onChange }: FAIChecklistProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpanded = useCallback((modId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(modId)) next.delete(modId)
      else next.add(modId)
      return next
    })
  }, [])

  const getEntry = useCallback((modId: string): FAIEntry => state[modId] ?? emptyFAIEntry(), [state])

  const updateEntry = useCallback((modId: string, patch: Partial<FAIEntry>) => {
    const current = getEntry(modId)
    onChange({ ...state, [modId]: { ...current, ...patch } })
  }, [state, getEntry, onChange])

  const cycleLine = useCallback((modId: string, line: keyof typeof FAI_LINE_LABELS) => {
    const entry = getEntry(modId)
    const nextStatus = cycleStatus(entry[line])
    updateEntry(modId, { [line]: nextStatus })
  }, [getEntry, updateEntry])

  const moduleStatus = useCallback((modId: string): { passed: number; failed: number; pending: number; percent: number } => {
    const entry = getEntry(modId)
    let passed = 0, failed = 0, pending = 0
    for (const key of LINE_KEYS) {
      const s = entry[key]
      if (s === "pass") passed++
      else if (s === "fail") failed++
      else pending++
    }
    const total = LINE_KEYS.length
    return { passed, failed, pending, percent: Math.round((passed / total) * 100) }
  }, [getEntry])

  const totals = useMemo(() => {
    let totalPass = 0, totalFail = 0
    for (const m of modules) {
      const s = moduleStatus(m.id)
      totalPass += s.passed
      totalFail += s.failed
    }
    return { totalPass, totalFail, totalLines: modules.length * LINE_KEYS.length }
  }, [modules, moduleStatus])

  if (modules.length === 0) return null

  return (
    <Card className="border-border">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-international-orange" />
              First Article Inspection
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Five checks per module before production ramps. Keep the record — investors and auditors will ask.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="success" className="h-5 px-1.5 text-[10px]">{totals.totalPass} pass</Badge>
            {totals.totalFail > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{totals.totalFail} fail</Badge>
            )}
            <span className="text-[10px] text-muted-foreground">/ {totals.totalLines} lines</span>
          </div>
        </div>

        <div className="space-y-2">
          {modules.map((mod) => {
            const isExpanded = expanded.has(mod.id)
            const entry = getEntry(mod.id)
            const status = moduleStatus(mod.id)
            return (
              <div key={mod.id} className="border border-border rounded-lg overflow-hidden">
                {/* Header row */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(mod.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                  <span className="text-sm font-medium text-foreground flex-1 truncate">{mod.name}</span>
                  {/* Line status dots */}
                  <div className="flex items-center gap-1">
                    {LINE_KEYS.map((key) => {
                      const s = entry[key]
                      const Icon = STATUS_ICON[s]
                      return (
                        <Icon
                          key={key}
                          className={cn(
                            "h-3 w-3",
                            s === "pass" && "text-success",
                            s === "fail" && "text-destructive",
                            s === "pending" && "text-muted-foreground/40",
                          )}
                          aria-label={`${FAI_LINE_LABELS[key].label}: ${s}`}
                        />
                      )
                    })}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono ml-1 flex-shrink-0">
                    {status.percent}%
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border bg-muted/20">
                    {LINE_KEYS.map((key) => {
                      const label = FAI_LINE_LABELS[key].label
                      const helper = FAI_LINE_LABELS[key].helper
                      const s = entry[key]
                      const Icon = STATUS_ICON[s]
                      return (
                        <div key={key} className="flex items-start gap-2 py-1">
                          <button
                            type="button"
                            onClick={() => cycleLine(mod.id, key)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border capitalize flex-shrink-0",
                              STATUS_CHIP_CLASS[s],
                            )}
                            aria-label={`Cycle ${label} status`}
                          >
                            <Icon className="h-3 w-3" />
                            {s}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground">{label}</p>
                            <p className="text-[11px] text-muted-foreground">{helper}</p>
                          </div>
                        </div>
                      )
                    })}
                    {/* Inspector + date */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border">
                      <input
                        type="text"
                        placeholder="Inspector (initials)"
                        value={entry.inspector ?? ""}
                        onChange={(e) => updateEntry(mod.id, { inspector: e.target.value })}
                        className="text-xs border border-input rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange"
                      />
                      <input
                        type="date"
                        value={entry.inspectedAt?.slice(0, 10) ?? ""}
                        onChange={(e) => updateEntry(mod.id, { inspectedAt: e.target.value })}
                        className="text-xs border border-input rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange"
                      />
                    </div>
                    <textarea
                      placeholder="Findings / notes — specific enough that someone else could reproduce the inspection."
                      value={entry.notes ?? ""}
                      onChange={(e) => updateEntry(mod.id, { notes: e.target.value })}
                      rows={2}
                      className="w-full text-xs border border-input rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange resize-y"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

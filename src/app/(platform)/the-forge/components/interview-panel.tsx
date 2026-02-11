/**
 * @file interview-panel.tsx — Expert Interview Panel for X-Ray modules
 *
 * @description Per-module Q&A panel that captures expert answers grouped by
 * discipline (Process, Mechanical, Controls, Operations, Regulatory, Commercial).
 * Discovered risks are written back into the module's unknownsToResolve list.
 *
 * Ported from v1's monolith (ForgeOS_CompanyScan_Demo.tsx) into v2's modular
 * architecture. Renders as a Dialog overlay on top of the dossier.
 *
 * @related
 * - Schema: ../services/xray-schema.ts (InterviewState, ExpertQuestion)
 * - Module Explorer: ./module-explorer.tsx (trigger button)
 * - Main view: ../xray-view.tsx (state management)
 */

"use client"

import React, { useState, useEffect } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { CheckCircle2, Plus, X, Users } from "lucide-react"

import type { ModuleSpec } from "../services/xray-schema"

// ─── Props ────────────────────────────────────────────────────────────

interface InterviewPanelProps {
  /** The module to interview about */
  module: ModuleSpec
  /** Whether the dialog is open */
  open: boolean
  /** Called when the dialog should close */
  onClose: () => void
  /** Called when the user saves. Returns the updated module with interview data. */
  onSave: (updated: ModuleSpec) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Calculates readiness metrics for a module's interview state.
 *
 * @param m - The module to assess
 * @returns Answered count, total questions, risks discovered, and completion percentage
 */
export function readinessFor(m: ModuleSpec): { answered: number; total: number; risks: number; pct: number } {
  const a = m.interview?.answers || {}
  const answered = Object.keys(a).filter((k) => String(a[k] || "").trim()).length
  const total = m.detail.expertQuestions.length
  const risks = m.interview?.risks?.filter(Boolean).length || 0
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100)
  return { answered, total, risks, pct }
}

// ─── Component ────────────────────────────────────────────────────────

/**
 * InterviewPanel — Dialog for capturing expert answers per module.
 *
 * @description Displays all expert questions for a module grouped by
 * discipline, with fields for answers, discovered risks, and freeform
 * notes. On save, merges risks into the module's unknownsToResolve.
 *
 * @component
 *
 * @example
 * <InterviewPanel
 *   module={selectedModule}
 *   open={isInterviewOpen}
 *   onClose={() => setIsInterviewOpen(false)}
 *   onSave={handleModuleUpdate}
 * />
 */
export function InterviewPanel({
  module,
  open,
  onClose,
  onSave,
}: InterviewPanelProps): React.ReactNode {
  const [answers, setAnswers] = useState<Record<string, string>>(module.interview?.answers || {})
  const [risks, setRisks] = useState<string[]>(module.interview?.risks || [])
  const [notes, setNotes] = useState<string>(module.interview?.notes || "")

  // Reset state when module changes
  useEffect(() => {
    setAnswers(module.interview?.answers || {})
    setRisks(module.interview?.risks || [])
    setNotes(module.interview?.notes || "")
  }, [module.id, module.interview])

  const handleSave = (): void => {
    const updated: ModuleSpec = {
      ...module,
      interview: { answers, risks, notes, completedAt: new Date().toISOString() },
    }
    // Merge discovered risks into the module's unknowns list
    updated.detail.unknownsToResolve = [
      ...new Set([...updated.detail.unknownsToResolve, ...risks.filter(Boolean)]),
    ]
    onSave(updated)
    onClose()
  }

  const answeredCount = Object.keys(answers).filter((k) => String(answers[k] || "").trim()).length
  const totalQuestions = module.detail.expertQuestions.length

  // Group questions by discipline for visual organization
  const disciplines = [...new Set(module.detail.expertQuestions.map((q) => q.discipline))]

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-chart-2/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-chart-2" />
            </div>
            <div>
              <DialogTitle className="text-lg font-display font-semibold">
                Expert Interview: {module.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {answeredCount}/{totalQuestions} questions answered
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Questions grouped by discipline */}
          {disciplines.map((discipline) => {
            const questions = module.detail.expertQuestions.filter((q) => q.discipline === discipline)
            return (
              <div key={discipline} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{discipline}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {questions.filter((q) => String(answers[q.q] || "").trim()).length}/{questions.length} answered
                  </span>
                </div>
                {questions.map((q, i) => (
                  <div key={`${discipline}-${i}`} className="space-y-1.5 pl-2 border-l-2 border-muted">
                    <Label htmlFor={`q-${discipline}-${i}`} className="text-sm font-medium">
                      {q.q}
                    </Label>
                    <Input
                      id={`q-${discipline}-${i}`}
                      value={answers[q.q] || ""}
                      onChange={(e) => setAnswers({ ...answers, [q.q]: e.target.value })}
                      placeholder="Type expert's answer..."
                    />
                  </div>
                ))}
              </div>
            )
          })}

          {/* Discovered risks */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Risks / Unknowns Discovered</h4>
              <Button variant="outline" size="sm" onClick={() => setRisks([...risks, ""])}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add risk
              </Button>
            </div>
            {risks.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No risks captured yet. Add any risks or uncertainties discovered during the interview.
              </p>
            ) : (
              risks.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={r}
                    onChange={(e) => setRisks(risks.map((x, ix) => (ix === i ? e.target.value : x)))}
                    placeholder="Risk or uncertainty..."
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove risk"
                    onClick={() => setRisks(risks.filter((_, ix) => ix !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* General notes */}
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="interview-notes" className="text-sm font-semibold">
              General Notes
            </Label>
            <Textarea
              id="interview-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Freeform notes from the expert interview..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-international-orange hover:bg-international-orange-hover text-white"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save Interview
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

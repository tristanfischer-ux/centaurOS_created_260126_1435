/**
 * @file diagnostic-center.tsx — Gating diagnostic wizard/summary
 *
 * @description If the gating diagnostic is incomplete, shows an inline
 * CTA and diagnostic questionnaire. If complete, shows a compact
 * summary of the derived process class and risks.
 */

"use client"

import React, { useState } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

import type { XRaySpec, ModuleSpec } from "../services/xray-schema"

// ─── Helpers ─────────────────────────────────────────────────────────

function findGatingModule(modules: ModuleSpec[]): ModuleSpec | undefined {
  return modules.find((m) => m.isGatingModule) ?? modules.find((m) => m.id === "react")
}

// ─── Props ───────────────────────────────────────────────────────────

interface DiagnosticCenterProps {
  spec: XRaySpec
  scanId: string | null
  onModuleUpdate: (m: ModuleSpec) => void
  onDeriveProcessClass: (moduleId: string, answers: Record<string, string>) => Promise<void>
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * DiagnosticCenter — Gating diagnostic section.
 *
 * @description Shows either a CTA to run the diagnostic, the diagnostic
 * questionnaire itself, or a summary if already complete.
 */
export function DiagnosticCenter({
  spec,
  scanId,
  onModuleUpdate,
  onDeriveProcessClass,
}: DiagnosticCenterProps): React.ReactNode {
  const gating = findGatingModule(spec.modules)
  if (!gating) return null

  const diagComplete = !!gating.diagnostic?.derivedProcessClass
  const diagnostic = gating.diagnostic

  if (diagComplete) {
    return <DiagnosticSummary gating={gating} />
  }

  return (
    <DiagnosticQuestionnaire
      gating={gating}
      scanId={scanId}
      onModuleUpdate={onModuleUpdate}
      onDeriveProcessClass={onDeriveProcessClass}
    />
  )
}

// ─── Summary (complete) ──────────────────────────────────────────────

function DiagnosticSummary({ gating }: { gating: ModuleSpec }): React.ReactNode {
  const [expanded, setExpanded] = useState(false)
  const diagnostic = gating.diagnostic
  const processClass = diagnostic?.derivedProcessClass
  const derivedRisks = diagnostic?.derivedRisks || []

  return (
    <Card className="rounded-xl shadow-sm border-status-success/20">
      <div className="h-1 w-full bg-status-success rounded-t-xl" />
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-status-success rounded-full" />
            <div>
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
                Gating Diagnostic
              </h3>
              <p className="text-xs text-muted-foreground">
                {gating.name} — diagnostic complete
              </p>
            </div>
          </div>
          <Badge variant="success" className="text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Complete
          </Badge>
        </div>

        {/* Process class */}
        <div className="rounded-xl bg-status-success-light/30 border border-status-success/20 p-4 flex items-center gap-3">
          <FlaskConical className="h-5 w-5 text-status-success shrink-0" />
          <div>
            <h4 className="text-xs font-semibold text-foreground">Derived process class</h4>
            <p className="text-sm font-medium text-foreground">{processClass}</p>
          </div>
        </div>

        {/* Derived risks */}
        {derivedRisks.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="font-medium">{derivedRisks.length} derived risks</span>
          </button>
        )}

        {expanded && derivedRisks.length > 0 && (
          <ul className="space-y-1.5 ml-6">
            {derivedRisks.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 shrink-0" />
                <span className="text-muted-foreground">{r}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Answered questions summary */}
        {diagnostic?.questions && (
          <button
            onClick={() => setExpanded(v => !v)}
            className={cn(
              "text-[11px] text-muted-foreground hover:text-foreground transition-colors",
              expanded && "hidden",
            )}
          >
            {diagnostic.questions.filter(q => q.answer).length}/{diagnostic.questions.length} questions answered
          </button>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Questionnaire (incomplete) ──────────────────────────────────────

function DiagnosticQuestionnaire({
  gating,
  scanId,
  onModuleUpdate,
  onDeriveProcessClass,
}: {
  gating: ModuleSpec
  scanId: string | null
  onModuleUpdate: (m: ModuleSpec) => void
  onDeriveProcessClass: (moduleId: string, answers: Record<string, string>) => Promise<void>
}): React.ReactNode {
  const diagnostic = gating.diagnostic
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (!diagnostic?.questions) return {}
    const initial: Record<string, string> = {}
    for (const q of diagnostic.questions) {
      if (q.answer) initial[q.id] = q.answer
    }
    return initial
  })
  const [freeform, setFreeform] = useState(diagnostic?.freeform || "")
  const [isDeriving, setIsDeriving] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const allAnswered = diagnostic?.questions.every((q) => answers[q.id]) ?? false

  const handleDerive = async (): Promise<void> => {
    if (!scanId || !diagnostic) return
    setIsDeriving(true)
    try {
      await onDeriveProcessClass(gating.id, answers)
    } catch (error) {
      toast.error("Failed to derive process class")
      console.error("[DiagnosticCenter] Error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsDeriving(false)
    }
  }

  if (!diagnostic?.questions?.length) return null

  return (
    <Card className="rounded-xl shadow-sm border-status-warning/30">
      <div className="h-1 w-full bg-status-warning rounded-t-xl" />
      <CardContent className="pt-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-status-warning rounded-full" />
            <div>
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
                Gating Diagnostic
              </h3>
              <p className="text-xs text-muted-foreground">
                {gating.name} — answer {diagnostic.questions.length} questions to unlock supplier matching
              </p>
            </div>
          </div>
          <Badge variant="warning" className="text-xs">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Needed
          </Badge>
        </div>

        {/* Alert */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-semibold">This module gates the entire supply chain.</span>{" "}
            <span className="text-muted-foreground">
              Until you complete this diagnostic, supplier quotes will be unreliable.
            </span>
          </AlertDescription>
        </Alert>

        {/* Toggle expand */}
        <button
          onClick={() => setIsExpanded(v => !v)}
          className="flex items-center gap-2 text-sm font-medium text-international-orange hover:text-international-orange-hover transition-colors"
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {isExpanded ? "Hide diagnostic questions" : "Open diagnostic questionnaire"}
        </button>

        {/* Questions */}
        {isExpanded && (
          <div className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              {diagnostic.questions.map((q, idx) => (
                <div key={q.id} className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">{idx + 1}) {q.question}</h4>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((opt) => (
                      <Button
                        key={opt}
                        variant={answers[q.id] === opt ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                        type="button"
                      >
                        {opt}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Notes (optional)</h4>
                <Input
                  value={freeform}
                  onChange={(e) => setFreeform(e.target.value)}
                  placeholder="Any extra context..."
                />
              </div>
            </div>

            <Button
              onClick={handleDerive}
              disabled={!allAnswered || isDeriving || !scanId}
              className="bg-international-orange hover:bg-international-orange-hover text-white"
            >
              {isDeriving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deriving process class...</>
              ) : (
                <><ShieldCheck className="h-4 w-4 mr-2" />Derive process class (AI)</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

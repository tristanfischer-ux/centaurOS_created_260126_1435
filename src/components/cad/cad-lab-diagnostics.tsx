/**
 * @file cad-lab-diagnostics.tsx — Engineering readiness diagnostic center.
 *
 * @description Presents a fixed set of universal engineering diagnostic
 * questions per module: manufacturing process, material class, tolerance,
 * surface finish, batch size, and operating environment. Answers inform
 * downstream supply chain and contracting decisions.
 *
 * Answers are stored in component state and passed up via callback.
 * Persistence to DB happens when the parent saves modules.
 *
 * @component
 *
 * @example
 * <CadLabDiagnostics
 *   modules={modules}
 *   answers={diagnosticAnswers}
 *   onAnswersChange={setDiagnosticAnswers}
 * />
 */

"use client"

import { useState, useMemo } from "react"
import {
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Box,
  Zap,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Diagnostic Questions ───────────────────────────────────────────

interface DiagnosticQuestion {
  /** Unique question identifier */
  id: string
  /** Short question text */
  question: string
  /** Why this question matters */
  hint: string
  /** Available answer options */
  options: string[]
}

/**
 * Standard engineering diagnostic questions.
 *
 * These are universal across all hardware modules and directly
 * inform manufacturing feasibility, supplier matching, and quoting.
 */
const DIAGNOSTIC_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: "mfg_process",
    question: "Primary manufacturing process?",
    hint: "Determines supplier pool and cost structure",
    options: [
      "FDM 3D Print",
      "SLA/Resin Print",
      "SLS/Powder Print",
      "CNC Machining",
      "Sheet Metal",
      "Injection Molding",
      "Casting",
      "Manual/Assembly",
      "Other",
    ],
  },
  {
    id: "material",
    question: "Material class?",
    hint: "Affects structural properties, cost, and lead time",
    options: [
      "PLA/PETG",
      "ABS/Nylon",
      "Resin (standard)",
      "Aluminum 6061",
      "Steel (mild)",
      "Stainless Steel",
      "Titanium",
      "Copper/Brass",
      "Carbon Fiber",
      "Wood/Plywood",
      "Other",
    ],
  },
  {
    id: "tolerance",
    question: "Tolerance class?",
    hint: "Tighter tolerances increase cost and reduce supplier options",
    options: [
      "Loose (±1mm)",
      "Standard (±0.5mm)",
      "Precision (±0.1mm)",
      "Tight (±0.05mm)",
      "Ultra-tight (±0.01mm)",
    ],
  },
  {
    id: "finish",
    question: "Surface finish?",
    hint: "Post-processing adds time and cost",
    options: [
      "As-manufactured",
      "Sanded/Deburred",
      "Painted/Coated",
      "Anodized",
      "Polished",
      "Plated",
      "N/A",
    ],
  },
  {
    id: "batch_size",
    question: "Batch size?",
    hint: "Determines manufacturing method viability and unit economics",
    options: [
      "Prototype (1–5)",
      "Small batch (10–50)",
      "Medium (50–500)",
      "Production (500+)",
      "Mass production (10k+)",
    ],
  },
  {
    id: "environment",
    question: "Operating environment?",
    hint: "Affects material selection, sealing, and testing requirements",
    options: [
      "Indoor (office)",
      "Indoor (industrial)",
      "Outdoor (temperate)",
      "Outdoor (harsh)",
      "High temperature",
      "Wet/Marine",
      "Corrosive",
      "Cleanroom",
      "Space/Vacuum",
    ],
  },
]

// ─── Types ──────────────────────────────────────────────────────────

/** Map of moduleId → { questionId: answer } */
export type DiagnosticAnswers = Record<string, Record<string, string>>

interface CadLabDiagnosticsProps {
  /** Array of decomposed modules */
  modules: CadLabModule[]
  /** Current diagnostic answers */
  answers: DiagnosticAnswers
  /** Called when answers change */
  onAnswersChange: (answers: DiagnosticAnswers) => void
  /** Whether AI pre-filled answers are present */
  aiPrefilled?: boolean
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * CadLabDiagnostics — engineering readiness diagnostic center.
 *
 * @description Presents per-module diagnostic questions covering
 * manufacturing process, materials, tolerances, finish, batch size,
 * and environment. Tracks completion per module and shows an overall
 * readiness score.
 */
export function CadLabDiagnostics({
  modules,
  answers,
  onAnswersChange,
  aiPrefilled = false,
}: CadLabDiagnosticsProps): React.ReactNode {
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null)

  // Compute completion stats
  const stats = useMemo(() => {
    const totalQuestions = DIAGNOSTIC_QUESTIONS.length
    let totalAnswered = 0
    let modulesComplete = 0

    for (const mod of modules) {
      const modAnswers = answers[mod.id] || {}
      const answered = Object.keys(modAnswers).length
      totalAnswered += answered
      if (answered >= totalQuestions) modulesComplete++
    }

    return {
      totalQuestions,
      totalModules: modules.length,
      totalAnswered,
      totalPossible: modules.length * totalQuestions,
      modulesComplete,
      completionPct:
        modules.length * totalQuestions > 0
          ? Math.round(
              (totalAnswered / (modules.length * totalQuestions)) * 100
            )
          : 0,
    }
  }, [modules, answers])

  const handleAnswer = (
    moduleId: string,
    questionId: string,
    value: string
  ): void => {
    onAnswersChange({
      ...answers,
      [moduleId]: {
        ...(answers[moduleId] || {}),
        [questionId]: value,
      },
    })
  }

  const isAllComplete = stats.modulesComplete === stats.totalModules

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          Engineering Diagnostics
          {isAllComplete ? (
            <span className="text-xs font-normal text-status-success flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Complete
            </span>
          ) : (
            <span className="text-xs font-normal text-muted-foreground">
              {stats.completionPct}% complete
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {aiPrefilled && (
          <div className="flex items-center gap-2 p-2.5 bg-status-info-light rounded text-xs text-status-info-dark">
            <Zap className="h-3.5 w-3.5 flex-shrink-0" />
            <span>AI pre-filled answers based on your research. Review and override any that need adjustment.</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Answer these manufacturing questions per module to unlock accurate
          supplier matching and contracting. Each module needs{" "}
          {DIAGNOSTIC_QUESTIONS.length} answers.
        </p>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {stats.totalAnswered}/{stats.totalPossible} answers
            </span>
            <span>
              {stats.modulesComplete}/{stats.totalModules} modules complete
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isAllComplete
                  ? "bg-status-success"
                  : stats.completionPct > 50
                    ? "bg-international-orange"
                    : "bg-muted-foreground"
              )}
              style={{ width: `${stats.completionPct}%` }}
            />
          </div>
        </div>

        {/* Per-module diagnostics */}
        <div className="space-y-2">
          {modules.map((mod) => {
            const modAnswers = answers[mod.id] || {}
            const answeredCount = Object.keys(modAnswers).length
            const isComplete =
              answeredCount >= DIAGNOSTIC_QUESTIONS.length
            const isExpanded = expandedModuleId === mod.id

            return (
              <div key={mod.id} className="border rounded-md overflow-hidden">
                {/* Module header */}
                <button
                  onClick={() =>
                    setExpandedModuleId(isExpanded ? null : mod.id)
                  }
                  className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0" />
                    ) : (
                      <Box className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium text-foreground truncate">
                      {mod.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {answeredCount}/{DIAGNOSTIC_QUESTIONS.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isComplete && answeredCount > 0 && (
                      <span className="text-[10px] text-status-warning flex items-center gap-0.5">
                        <AlertTriangle className="h-3 w-3" />
                        Incomplete
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded questionnaire */}
                {isExpanded && (
                  <div className="border-t p-4 space-y-5 bg-muted/10">
                    {DIAGNOSTIC_QUESTIONS.map((q) => {
                      const currentAnswer = modAnswers[q.id]
                      return (
                        <div key={q.id} className="space-y-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {q.question}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {q.hint}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {q.options.map((opt) => (
                              <Button
                                key={opt}
                                variant={
                                  currentAnswer === opt
                                    ? "default"
                                    : "outline"
                                }
                                size="sm"
                                className="text-xs h-7"
                                onClick={() =>
                                  handleAnswer(mod.id, q.id, opt)
                                }
                                type="button"
                              >
                                {opt}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Status message */}
        {isAllComplete && (
          <div className="flex items-center gap-2 text-sm text-status-success p-3 bg-status-success-light rounded-lg">
            <CheckCircle2 className="h-4 w-4" />
            All modules diagnosed. Supply chain matching and contracting are now
            unlocked.
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground border-t pt-3">
          <span className="font-medium">Why?</span>
          <span>
            Diagnostic answers determine which suppliers can quote, what
            contracts are needed, and estimated costs.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

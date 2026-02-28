"use client"

/**
 * @file specify/page.tsx — The Forge: Specify stage (Stage 2).
 *
 * @description Detailed specification + specialist review page. Users fill in
 * per-module diagnostics (process, material, tolerance, finish, batch, environment),
 * review interface contracts, get specialist reviews, and unlock the Source stage.
 *
 * Diagnostics are inlined directly into each module card so users can see
 * description, key parts, editable diagnostics, contracts, failure modes, and
 * cost estimates all in one place.
 *
 * 3 tabs: Overview, Module Specs, Specialist Review.
 *
 * Gate: redirects to /the-forge/cad-lab (Design stage) if no research/modules exist.
 */

import { useState, useCallback, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Loader2,
  ClipboardList,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  FlaskConical,
  Lightbulb,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DIAGNOSTIC_QUESTIONS,
  inferRecommendations,
  inferRecommendationsWithReasons,
} from "@/components/cad/cad-lab-diagnostics"
import { CadLabCostEstimate } from "@/components/cad/cad-lab-cost-estimate"
import { SpecialistReviewPanel } from "@/components/cad/specialist-review-panel"
import { ModuleFlowCanvas } from "../components/module-flow-canvas"
import { ProductOverviewCard } from "../components/product-overview-card"
import { useCadLab } from "../cad-lab-context"
import { useRegisterScreenContext } from "@/contexts/screen-context"
import {
  getMaterialCompatibilityForProcess,
  getProcessCompatibilityForMaterial,
} from "@/lib/cad-lab/diagnostic-mappings"
import type { CompatibilityStatus } from "@/lib/cad-lab/diagnostic-mappings"
import type { SpecialistReview } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

// ─── Constants ────────────────────────────────────────────────────────

const REQUIRED_REVIEW_COUNT = 2

// ─── Helpers ──────────────────────────────────────────────────────────

function isDiagnosticsFilledForModule(answers: DiagnosticAnswers, moduleId: string): boolean {
  const moduleAnswers = answers[moduleId]
  if (!moduleAnswers) return false
  const keys = ["mfg_process", "material", "tolerance", "finish", "batch_size", "environment"]
  return keys.every((k) => moduleAnswers[k]?.trim())
}

function getModuleSpecStatus(
  moduleId: string,
  diagnosticAnswers: DiagnosticAnswers,
  moduleReviews: Record<string, SpecialistReview[]>,
): "incomplete" | "ready-for-review" | "specialist-approved" {
  const diagComplete = isDiagnosticsFilledForModule(diagnosticAnswers, moduleId)
  if (!diagComplete) return "incomplete"

  const reviews = moduleReviews[moduleId] ?? []
  const passingReviews = reviews.filter((r) => r.verdict !== "fail")
  if (passingReviews.length >= REQUIRED_REVIEW_COUNT) return "specialist-approved"

  return "ready-for-review"
}

function getSpecStatusBadge(status: ReturnType<typeof getModuleSpecStatus>) {
  switch (status) {
    case "incomplete":
      return <Badge variant="secondary">Incomplete</Badge>
    case "ready-for-review":
      return <Badge variant="warning">Diagnostics complete</Badge>
    case "specialist-approved":
      return <Badge variant="success">Approved</Badge>
  }
}

// ─── Page Component ──────────────────────────────────────────────────

export default function SpecifyPage(): React.ReactNode {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    subject,
    hasResearch,
    modules,
    setModules,
    diagnosticAnswers,
    setDiagnosticAnswers,
    aiPrefilled,
    designBrief,
    productOverview,
    setProductOverview,
    interfaceContracts,
    isExtractingContracts,
    earlyCostEstimates,
    activeProjectId,
    generatingModuleIds,
  } = useCadLab()

  // Redirect to Design if no research or modules
  useEffect(() => {
    if (!hasResearch || modules.length === 0) {
      router.replace(FORGE_ROUTES.cadLab)
    }
  }, [hasResearch, modules.length, router])

  // ── Local state: specialist reviews per module ──
  const [moduleReviews, setModuleReviews] = useState<Record<string, SpecialistReview[]>>({})
  const handleReviewComplete = useCallback((moduleId: string, review: SpecialistReview) => {
    setModuleReviews((prev) => {
      const existing = prev[moduleId] ?? []
      const filtered = existing.filter((r) => r.specialistId !== review.specialistId)
      return { ...prev, [moduleId]: [...filtered, review] }
    })
  }, [])

  // ── Local state: expanded module for spec editing ──
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null)

  // ── Diagnostic handlers ──

  const handleAnswer = useCallback((moduleId: string, questionId: string, value: string) => {
    setDiagnosticAnswers((prev: DiagnosticAnswers) => ({
      ...prev,
      [moduleId]: { ...(prev[moduleId] || {}), [questionId]: value },
    }))
  }, [setDiagnosticAnswers])

  const handleUseRecommended = useCallback((moduleId: string) => {
    const mod = modules.find((m) => m.id === moduleId)
    if (!mod) return
    const recommended = inferRecommendations(mod, designBrief)
    setDiagnosticAnswers((prev: DiagnosticAnswers) => ({
      ...prev,
      [moduleId]: { ...(prev[moduleId] || {}), ...recommended },
    }))
  }, [modules, designBrief, setDiagnosticAnswers])

  const handleAutoSelectAll = useCallback(() => {
    setDiagnosticAnswers((prev: DiagnosticAnswers) => {
      const updated = { ...prev }
      for (const mod of modules) {
        const recommended = inferRecommendations(mod, designBrief)
        updated[mod.id] = { ...(updated[mod.id] || {}), ...recommended }
      }
      return updated
    })
  }, [modules, designBrief, setDiagnosticAnswers])

  // ── Diagnostic completion stats ──
  const diagStats = useMemo(() => {
    const totalQuestions = DIAGNOSTIC_QUESTIONS.length
    let totalAnswered = 0
    let modulesComplete = 0
    for (const mod of modules) {
      const modAnswers = diagnosticAnswers[mod.id] || {}
      const answered = DIAGNOSTIC_QUESTIONS.filter((q) => modAnswers[q.id]?.trim()).length
      totalAnswered += answered
      if (answered >= totalQuestions) modulesComplete++
    }
    const totalPossible = modules.length * totalQuestions
    return {
      totalAnswered,
      totalPossible,
      modulesComplete,
      totalModules: modules.length,
      completionPct: totalPossible > 0 ? Math.round((totalAnswered / totalPossible) * 100) : 0,
      isAllComplete: modulesComplete === modules.length && modules.length > 0,
      hasUnanswered: totalAnswered < totalPossible,
    }
  }, [modules, diagnosticAnswers])

  // ── Computed: module spec statuses ──
  const moduleStatuses = useMemo(() => {
    const result: Record<string, ReturnType<typeof getModuleSpecStatus>> = {}
    for (const m of modules) {
      result[m.id] = getModuleSpecStatus(m.id, diagnosticAnswers, moduleReviews)
    }
    return result
  }, [modules, diagnosticAnswers, moduleReviews])

  const approvedCount = Object.values(moduleStatuses).filter((s) => s === "specialist-approved").length
  const allApproved = approvedCount === modules.length && modules.length > 0
  const allDiagnosticsComplete = modules.length > 0 && modules.every((m) => isDiagnosticsFilledForModule(diagnosticAnswers, m.id))

  // INTENT: Mark modules as "specified" when they pass the gate, so the context
  // and nav stepper can reflect the pipeline state.
  useEffect(() => {
    let changed = false
    const updated = modules.map((m) => {
      const status = moduleStatuses[m.id]
      if (status === "specialist-approved" && m.status !== "specified" && m.status !== "generated") {
        changed = true
        return { ...m, status: "specified" as const }
      }
      return m
    })
    if (changed) {
      setModules(updated)
    }
  }, [moduleStatuses, modules, setModules])

  // ── Gate: can proceed to Source? ──
  const canProceedToSource = approvedCount > 0

  // ── Tab navigation ──
  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "specs", label: "Module Specs" },
    { id: "review", label: "Specialist Review" },
  ]

  const [activeTab, setActiveTab] = useState(() => {
    const param = searchParams.get("tab")
    if (param && TABS.some((t) => t.id === param)) return param
    return "overview"
  })

  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId)
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", tabId)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  // ── Screen context for specialists ──
  useRegisterScreenContext(
    useMemo(() => {
      const parts: string[] = [`Viewing the Specify stage for "${subject}".`]
      parts.push(`${modules.length} modules to specify.`)
      parts.push(`${approvedCount} of ${modules.length} approved by specialists.`)
      return {
        pageTitle: `The Forge — Specify: ${subject}`,
        summary: parts.join(" "),
      }
    }, [subject, modules.length, approvedCount]),
  )

  if (!hasResearch || modules.length === 0) return null

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-international-orange" />
            Specify
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define detailed specs per module and get specialist approval.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push(FORGE_ROUTES.cadLab)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Design
          </Button>
          {canProceedToSource && (
            <Button size="sm" onClick={() => router.push(FORGE_ROUTES.cadLabSource)} className="gap-1.5">
              Continue to Source
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{approvedCount} of {modules.length} modules approved</span>
          <span>{Math.round((approvedCount / Math.max(modules.length, 1)) * 100)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-international-orange rounded-full transition-all duration-500"
            style={{ width: `${(approvedCount / Math.max(modules.length, 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* ── Tab navigation ── */}
      <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border overflow-x-auto">
        <div className="flex items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? "bg-international-orange text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        {/* ═══ Overview tab ═══ */}
        {activeTab === "overview" && (
          <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            {/* Product overview card */}
            {productOverview && (
              <ProductOverviewCard
                overview={productOverview}
                onSave={setProductOverview}
              />
            )}

            {/* Module summary cards */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3">Modules ({modules.length})</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {modules.map((mod) => {
                  const status = moduleStatuses[mod.id]
                  return (
                    <Card
                      key={mod.id}
                      className="cursor-pointer hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200"
                      onClick={() => {
                        setActiveTab("specs")
                        setExpandedModuleId(mod.id)
                      }}
                    >
                      <CardContent className="pt-4 pb-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium text-foreground truncate">{mod.name}</h3>
                          {getSpecStatusBadge(status)}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{mod.purpose}</p>
                        {mod.imageUrl && (
                          <div className="aspect-[4/3] rounded-md overflow-hidden bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={mod.imageUrl}
                              alt={mod.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {mod.keyParts.slice(0, 3).map((part) => (
                            <span key={part} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {part}
                            </span>
                          ))}
                          {mod.keyParts.length > 3 && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              +{mod.keyParts.length - 3}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* Architecture graph */}
            {(modules.length > 1 || isExtractingContracts) && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Module Architecture</h2>
                {isExtractingContracts && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Loader2 className="h-3 w-3 animate-spin text-international-orange" />
                    Extracting interface contracts...
                  </p>
                )}
                {modules.length > 1 && (
                  <ModuleFlowCanvas
                    modules={modules}
                    onModuleClick={(id) => {
                      setActiveTab("specs")
                      setExpandedModuleId(id)
                    }}
                    interfaceContracts={interfaceContracts}
                    generatingModuleIds={generatingModuleIds}
                  />
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ Module Specs tab ═══ */}
        {activeTab === "specs" && (
          <motion.div key="specs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            {/* AI pre-fill banner */}
            {aiPrefilled && (
              <div className="flex items-center gap-2 p-2.5 bg-status-info-light rounded text-xs text-status-info-dark">
                <Zap className="h-3.5 w-3.5 flex-shrink-0" />
                <span>AI pre-filled answers based on your research. Review and override any that need adjustment.</span>
              </div>
            )}

            {/* Diagnostics progress + Auto-select all */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-international-orange" />
                  <h2 className="text-sm font-semibold text-foreground">Module Specifications</h2>
                  {diagStats.isAllComplete ? (
                    <span className="text-xs font-normal text-status-success flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Complete
                    </span>
                  ) : (
                    <span className="text-xs font-normal text-muted-foreground">
                      {diagStats.completionPct}% diagnosed
                    </span>
                  )}
                </div>
                {diagStats.hasUnanswered && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-international-orange hover:text-international-orange hover:bg-international-orange/10 gap-1.5"
                    onClick={handleAutoSelectAll}
                    type="button"
                  >
                    <Lightbulb className="h-3.5 w-3.5" />
                    Auto-select all
                  </Button>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                Answer manufacturing questions per module to unlock accurate
                supplier matching and contracting. Each module needs{" "}
                {DIAGNOSTIC_QUESTIONS.length} answers.
              </p>

              {/* Diagnostics progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {diagStats.totalAnswered}/{diagStats.totalPossible} answers
                  </span>
                  <span>
                    {diagStats.modulesComplete}/{diagStats.totalModules} modules complete
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      diagStats.isAllComplete
                        ? "bg-status-success"
                        : diagStats.completionPct > 50
                          ? "bg-international-orange"
                          : "bg-muted-foreground",
                    )}
                    style={{ width: `${diagStats.completionPct}%` }}
                  />
                </div>
              </div>

              {/* Completion banner */}
              {diagStats.isAllComplete && (
                <div className="flex items-center gap-2 text-sm text-status-success p-3 bg-status-success-light rounded-lg">
                  <CheckCircle2 className="h-4 w-4" />
                  All modules diagnosed. Supply chain matching and contracting are now unlocked.
                </div>
              )}
            </div>

            {/* Per-module specification cards with inline diagnostics */}
            <div className="space-y-4">
              {modules.map((mod) => {
                const status = moduleStatuses[mod.id]
                const isExpanded = expandedModuleId === mod.id
                const modDiag = diagnosticAnswers[mod.id] ?? {}
                const costEstimate = earlyCostEstimates[mod.id]
                const answeredCount = DIAGNOSTIC_QUESTIONS.filter((q) => modDiag[q.id]?.trim()).length
                const isDiagComplete = answeredCount >= DIAGNOSTIC_QUESTIONS.length

                return (
                  <Card key={mod.id} className={cn(status === "specialist-approved" && "border-success/30")}>
                    {/* Collapsible header */}
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedModuleId(isExpanded ? null : mod.id)}
                    >
                      {mod.imageUrl ? (
                        <div className="h-10 w-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mod.imageUrl} alt={mod.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <Layers className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-foreground truncate">{mod.name}</h3>
                          {getSpecStatusBadge(status)}
                          <span className="text-[10px] text-muted-foreground">
                            {isDiagComplete ? (
                              <CheckCircle2 className="h-3 w-3 text-status-success inline" />
                            ) : (
                              <>{answeredCount}/{DIAGNOSTIC_QUESTIONS.length}</>
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{mod.purpose}</p>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (() => {
                      const modRecsWithReasons = inferRecommendationsWithReasons(mod, designBrief)
                      const modRecs: Record<string, string> = {}
                      for (const [k, v] of Object.entries(modRecsWithReasons)) {
                        modRecs[k] = v.value
                      }

                      return (
                        <CardContent className="pt-0 space-y-4 border-t">
                          {/* Description */}
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</h4>
                            <p className="text-sm text-foreground">{mod.description}</p>
                          </div>

                          {/* Key parts */}
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Key Parts</h4>
                            <div className="flex flex-wrap gap-1.5">
                              {mod.keyParts.map((part) => (
                                <span key={part} className="text-xs px-2 py-1 rounded-md bg-muted text-foreground">
                                  {part}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* ── Inline Manufacturing Diagnostics ── */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <FlaskConical className="h-3.5 w-3.5" />
                                Manufacturing Diagnostics
                                {isDiagComplete ? (
                                  <CheckCircle2 className="h-3 w-3 text-status-success" />
                                ) : (
                                  <span className="text-[10px] font-normal text-muted-foreground">
                                    {answeredCount}/{DIAGNOSTIC_QUESTIONS.length}
                                  </span>
                                )}
                              </h4>
                              {!isDiagComplete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs text-international-orange hover:text-international-orange hover:bg-international-orange/10 gap-1.5"
                                  onClick={() => handleUseRecommended(mod.id)}
                                  type="button"
                                >
                                  <Lightbulb className="h-3.5 w-3.5" />
                                  Use suggested answers
                                </Button>
                              )}
                            </div>

                            <div className="space-y-5 bg-muted/10 rounded-md p-4">
                              {DIAGNOSTIC_QUESTIONS.map((q) => {
                                const currentAnswer = modDiag[q.id]

                                // INTENT: Compute compatibility map for cross-question guidance
                                let compatMap: Record<string, CompatibilityStatus> | null = null
                                if (q.id === "material" && modDiag.mfg_process) {
                                  compatMap = getMaterialCompatibilityForProcess(modDiag.mfg_process)
                                } else if (q.id === "mfg_process" && modDiag.material) {
                                  compatMap = getProcessCompatibilityForMaterial(modDiag.material)
                                }

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
                                      {q.options.map((opt) => {
                                        const isSelected = currentAnswer === opt
                                        const isSuggested = modRecs[q.id] === opt
                                        const compat = compatMap?.[opt]
                                        const isIncompat = compat === "incompatible" && !isSelected

                                        // Build tooltip text with compatibility note + suggestion reason
                                        let tooltipText = q.optionDescriptions[opt] ?? opt
                                        if (isIncompat) {
                                          const crossField = q.id === "material"
                                            ? modDiag.mfg_process
                                            : modDiag.material
                                          tooltipText += ` — Not typically used with ${crossField}`
                                        }
                                        if (isSuggested && modRecsWithReasons[q.id]?.reason) {
                                          tooltipText += ` — Suggested: ${modRecsWithReasons[q.id].reason}`
                                        }

                                        return (
                                          <Tooltip key={opt}>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant={isSelected ? "default" : "outline"}
                                                size="sm"
                                                className={cn(
                                                  "text-xs h-7",
                                                  !isSelected && isSuggested &&
                                                    "ring-1 ring-international-orange/40",
                                                  isIncompat && "opacity-40",
                                                )}
                                                onClick={() => handleAnswer(mod.id, q.id, opt)}
                                                type="button"
                                              >
                                                {isIncompat && (
                                                  <AlertTriangle className="h-3 w-3 mr-1 text-muted-foreground" />
                                                )}
                                                {!isIncompat && !isSelected && isSuggested && (
                                                  <Lightbulb className="h-3 w-3 mr-1 text-international-orange/70" />
                                                )}
                                                {opt}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent
                                              side="bottom"
                                              className="max-w-[250px] z-[300]"
                                            >
                                              <p className="text-xs leading-relaxed">
                                                {tooltipText}
                                              </p>
                                            </TooltipContent>
                                          </Tooltip>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* Interface contracts for this module */}
                          {interfaceContracts.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Interface Contracts</h4>
                              <div className="space-y-1">
                                {interfaceContracts
                                  .filter((c) => c.sourceModuleId === mod.id || c.targetModuleId === mod.id)
                                  .map((contract, i) => {
                                    const isSource = contract.sourceModuleId === mod.id
                                    const otherModuleName = modules.find(
                                      (m) => m.id === (isSource ? contract.targetModuleId : contract.sourceModuleId),
                                    )?.name ?? "Unknown"
                                    return (
                                      <div key={i} className="text-xs flex items-center gap-1.5">
                                        <span className={cn(
                                          "h-2 w-2 rounded-full",
                                          contract.compatible === true ? "bg-success" : contract.compatible === false ? "bg-destructive" : "bg-muted-foreground",
                                        )} />
                                        <span className="text-muted-foreground">
                                          {isSource ? `${contract.sourcePort} → ${otherModuleName}` : `${otherModuleName} → ${contract.targetPort}`}
                                        </span>
                                        <span className="text-muted-foreground/60">({contract.portType})</span>
                                      </div>
                                    )
                                  })}
                              </div>
                            </div>
                          )}

                          {/* Failure modes + unknowns */}
                          {(mod.failureModes.length > 0 || mod.unknowns.length > 0) && (
                            <div className="grid sm:grid-cols-2 gap-3">
                              {mod.failureModes.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Failure Modes</h4>
                                  <ul className="space-y-0.5">
                                    {mod.failureModes.map((fm, i) => (
                                      <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                                        <AlertTriangle className="h-3 w-3 text-warning flex-shrink-0 mt-0.5" />
                                        {fm}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {mod.unknowns.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Open Questions</h4>
                                  <ul className="space-y-0.5">
                                    {mod.unknowns.map((u, i) => (
                                      <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                                        <FileText className="h-3 w-3 text-info flex-shrink-0 mt-0.5" />
                                        {u}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Early cost estimate */}
                          {costEstimate && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Early Cost Estimate</h4>
                              <div className="text-xs text-foreground">
                                <span className="font-mono">${costEstimate.totalLow.toFixed(0)} – ${costEstimate.totalHigh.toFixed(0)}</span>
                                <span className="text-muted-foreground ml-1">
                                  ({costEstimate.confidence} confidence, {costEstimate.material})
                                </span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      )
                    })()}
                  </Card>
                )
              })}
            </div>

            {/* Cost estimate summary */}
            <CadLabCostEstimate
              modules={modules}
              diagnosticAnswers={diagnosticAnswers}
              onCostOverride={(moduleId, overrides) => {
                setModules(prev => prev.map(m =>
                  m.id === moduleId ? { ...m, costOverrides: overrides } : m
                ))
              }}
            />

            {/* Navigation CTA */}
            {canProceedToSource ? (
              <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/10 to-background">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Ready to source
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {approvedCount} module{approvedCount !== 1 ? "s" : ""} approved. Continue to match suppliers and create RFQs.
                      </p>
                    </div>
                    <Button onClick={() => router.push(FORGE_ROUTES.cadLabSource)} className="gap-1.5">
                      Continue to Source
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : allDiagnosticsComplete ? (
              <Card className="border-border">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    Next step: get specialist approval on the{" "}
                    <button
                      type="button"
                      className="text-international-orange font-medium hover:underline"
                      onClick={() => handleTabClick("review")}
                    >
                      Review tab
                    </button>{" "}
                    to unlock sourcing.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    Complete diagnostics for each module to continue.
                  </p>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* ═══ Specialist Review tab ═══ */}
        {activeTab === "review" && (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            {/* Gate status */}
            <Card className={cn(allApproved ? "border-success/30" : "border-border")}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Specification Gate</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {allApproved
                        ? "All modules approved. You can proceed to Source."
                        : `All modules need diagnostics filled + at least ${REQUIRED_REVIEW_COUNT} specialist reviews with no failures to unlock Source.`}
                    </p>
                  </div>
                  {allApproved && (
                    <CheckCircle2 className="h-6 w-6 text-success flex-shrink-0" />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Per-module specialist review panels */}
            {modules.map((mod) => {
              const status = moduleStatuses[mod.id]
              const diagComplete = isDiagnosticsFilledForModule(diagnosticAnswers, mod.id)
              const reviews = moduleReviews[mod.id] ?? []

              return (
                <Card key={mod.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        {mod.name}
                        {getSpecStatusBadge(status)}
                      </CardTitle>
                      {!diagComplete && (
                        <p className="text-xs text-warning flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Fill diagnostics first
                        </p>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {diagComplete && activeProjectId ? (
                      <SpecialistReviewPanel
                        module={mod}
                        allModules={modules}
                        reviews={reviews}
                        projectId={activeProjectId}
                        projectSubject={subject}
                        designBrief={designBrief}
                        diagnosticAnswers={diagnosticAnswers}
                        onReviewComplete={(review) => handleReviewComplete(mod.id, review)}
                      />
                    ) : !activeProjectId ? (
                      <p className="text-xs text-muted-foreground italic">
                        Save your project first to enable specialist reviews.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Complete the diagnostics for this module before requesting specialist reviews.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}

            {/* Source CTA */}
            {canProceedToSource && (
              <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/10 to-background">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Ready to source
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {approvedCount} module{approvedCount !== 1 ? "s" : ""} approved. Continue to match suppliers and create RFQs.
                      </p>
                    </div>
                    <Button onClick={() => router.push(FORGE_ROUTES.cadLabSource)} className="gap-1.5">
                      Continue to Source
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

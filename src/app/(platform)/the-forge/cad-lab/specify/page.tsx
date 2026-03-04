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
  RefreshCw,
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
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
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
import { ReviewIssueSummary } from "@/components/cad/review-issue-summary"
import type { AggregatedIssue } from "@/components/cad/review-issue-summary"
import { RedlineDiff } from "../components/redline-diff"
import { buildRevisionItems } from "../components/checkpoint-revision-diffs"

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

  // INTENT: Reviews are optional enrichment, not a gate. Diagnostics-complete is
  // sufficient to proceed. Having ≥1 passing review upgrades to "specialist-approved".
  const reviews = moduleReviews[moduleId] ?? []
  const hasPassingReview = reviews.some((r) => r.verdict !== "fail")
  if (hasPassingReview) return "specialist-approved"

  return "ready-for-review"
}

function getSpecStatusBadge(status: ReturnType<typeof getModuleSpecStatus>) {
  switch (status) {
    case "incomplete":
      return <Badge variant="secondary">Incomplete</Badge>
    case "ready-for-review":
      return <Badge variant="success">Ready</Badge>
    case "specialist-approved":
      return <Badge variant="success">Reviewed</Badge>
  }
}

// ─── Page Component ──────────────────────────────────────────────────

export default function SpecifyPage(): React.ReactNode {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    subject, modelId,
    hasResearch,
    modules,
    setModules,
    diagnosticAnswers,
    setDiagnosticAnswers,
    diagnosticEnrichment,
    aiPrefilled,
    designBrief,
    productOverview,
    setProductOverview,
    decompositionConnections,
    interfaceContracts,
    isExtractingContracts,
    unmatchedPorts,
    earlyCostEstimates,
    activeProjectId,
    generatingModuleIds,
    isGeneratingImages,
    handleRefreshModuleImages,
    researchModelUsed, decompositionModelUsed,
    revisedModuleIds,
    isApplyingReviewRevisions,
    handleApplyReviewRevisions,
  } = useCadLab()

  // INTENT: Compute model audit data from modules for attribution display.
  const modelAudit = useMemo(() => {
    const generatedCount = modules.filter(m => m.result?.modelUsed).length
    const imageCount = modules.filter(m => m.imageModelUsed).length
    const imageModels = [...new Set(modules.map(m => m.imageModelUsed).filter(Boolean) as string[])]
    if (!researchModelUsed && !decompositionModelUsed && generatedCount === 0 && imageCount === 0) return undefined
    return {
      codeModel: modelId, moduleCount: modules.length, generatedCount, imageCount, imageModels,
      researchModel: researchModelUsed ?? undefined,
      decompositionModel: decompositionModelUsed ?? undefined,
    }
  }, [modules, modelId, researchModelUsed, decompositionModelUsed])

  // Redirect to Design if no research or modules
  useEffect(() => {
    if (!hasResearch || modules.length === 0) {
      router.replace(FORGE_ROUTES.cadLab)
    }
  }, [hasResearch, modules.length, router])

  // ── Specialist reviews — lifted to context for persistence across navigation ──
  const { moduleReviews, handleReviewComplete, pendingReviewKeys, markReviewPending, clearReviewPending } = useCadLab()

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

  const reviewedCount = Object.values(moduleStatuses).filter((s) => s === "specialist-approved").length
  const allDiagnosticsComplete = modules.length > 0 && modules.every((m) => isDiagnosticsFilledForModule(diagnosticAnswers, m.id))

  // INTENT: Mark modules as "specified" when diagnostics are complete, so the context
  // and nav stepper can reflect the pipeline state. Both ready-for-review and
  // specialist-approved qualify since reviews are optional enrichment.
  useEffect(() => {
    let changed = false
    const updated = modules.map((m) => {
      const status = moduleStatuses[m.id]
      if ((status === "ready-for-review" || status === "specialist-approved") && m.status !== "specified" && m.status !== "generated") {
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
  // INTENT: Diagnostics-complete is sufficient. Reviews are optional enrichment.
  const canProceedToSource = allDiagnosticsComplete

  // ── Finalize summary: manufacturing process & material breakdown ──
  const finalizeSummary = useMemo(() => {
    if (!canProceedToSource) return null
    const processCounts: Record<string, number> = {}
    const materials = new Set<string>()
    for (const mod of modules) {
      const answers = diagnosticAnswers[mod.id] || {}
      const proc = answers.mfg_process?.trim()
      const mat = answers.material?.trim()
      if (proc) {
        processCounts[proc] = (processCounts[proc] || 0) + 1
      }
      if (mat) materials.add(mat)
    }
    const processEntries = Object.entries(processCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} (${count})`)
    return {
      processBreakdown: processEntries.join(", ") || "Not specified",
      materials: Array.from(materials).join(", ") || "Not specified",
    }
  }, [canProceedToSource, modules, diagnosticAnswers])

  // ── Tab navigation ──
  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "specs", label: "Module Specs" },
    { id: "review", label: "Specialist Review" },
  ]

  const [activeTab, setActiveTab] = useState("overview")

  // INTENT: Read tab from URL after hydration — avoids React #418.
  // useSearchParams() returns empty during SSR; reading in useState causes mismatch.
  useEffect(() => {
    const param = searchParams.get("tab")
    if (param && TABS.some((t) => t.id === param)) {
      setActiveTab(param)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      parts.push(`${diagStats.modulesComplete} of ${modules.length} diagnostics complete.`)
      if (reviewedCount > 0) parts.push(`${reviewedCount} reviewed by specialists.`)
      return {
        pageTitle: `The Forge — Specify: ${subject}`,
        summary: parts.join(" "),
      }
    }, [subject, modules.length, diagStats.modulesComplete, reviewedCount]),
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
            Define detailed specs per module. Reviews are optional.
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

      {/* ── Progress bar — tracks diagnostics completion ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{diagStats.modulesComplete} of {diagStats.totalModules} modules diagnosed</span>
          <span>{diagStats.completionPct}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              diagStats.isAllComplete ? "bg-success" : "bg-international-orange",
            )}
            style={{ width: `${diagStats.completionPct}%` }}
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
            {/* Product overview card — always visible so user can add/edit */}
            <ProductOverviewCard
              overview={productOverview}
              onSave={setProductOverview}
              modelAudit={modelAudit}
            />

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
                          <div className="flex items-center gap-1.5">
                            {(mod.revisionNumber ?? 1) > 1 && (
                              <Badge variant="secondary" className="text-[10px]">Rev {mod.revisionNumber}</Badge>
                            )}
                            {getSpecStatusBadge(status)}
                          </div>
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
                    decompositionConnections={decompositionConnections}
                    generatingModuleIds={generatingModuleIds}
                    unmatchedPorts={unmatchedPorts}
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
                          {(mod.revisionNumber ?? 1) > 1 && (
                            <Badge variant="secondary" className="text-[10px]">Rev {mod.revisionNumber}</Badge>
                          )}
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

                          {/* View Changes — shown when module has been revised */}
                          {mod.conceptSnapshot && buildRevisionItems(mod).length > 0 && (
                            <RedlineDiff
                              fromStage={`Rev ${(mod.revisionNumber ?? 2) - 1}`}
                              toStage={`Rev ${mod.revisionNumber ?? 2}`}
                              items={buildRevisionItems(mod)}
                            />
                          )}

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
                                const fieldEnrichment = diagnosticEnrichment?.[mod.id]?.[q.id]

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

                                        // Suggested pills get HoverCard with enrichment; others keep Tooltip
                                        if (isSuggested && !isSelected) {
                                          const reason = fieldEnrichment?.reason ?? modRecsWithReasons[q.id]?.reason
                                          const alternatives = fieldEnrichment?.alternatives ?? []
                                          const compatNote = isIncompat
                                            ? ` — Not typically used with ${q.id === "material" ? modDiag.mfg_process : modDiag.material}`
                                            : ""

                                          return (
                                            <HoverCard key={opt} openDelay={200} closeDelay={100}>
                                              <HoverCardTrigger asChild>
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className={cn(
                                                    "text-xs h-7 ring-1 ring-international-orange/40",
                                                    isIncompat && "opacity-40",
                                                  )}
                                                  onClick={() => handleAnswer(mod.id, q.id, opt)}
                                                  type="button"
                                                >
                                                  {isIncompat ? (
                                                    <AlertTriangle className="h-3 w-3 mr-1 text-muted-foreground" />
                                                  ) : (
                                                    <Lightbulb className="h-3 w-3 mr-1 text-international-orange/70" />
                                                  )}
                                                  {opt}
                                                </Button>
                                              </HoverCardTrigger>
                                              <HoverCardContent
                                                side="bottom"
                                                align="start"
                                                className="w-80 z-[300] space-y-2.5"
                                              >
                                                {/* Option description */}
                                                <p className="text-xs text-muted-foreground leading-relaxed">
                                                  {q.optionDescriptions[opt] ?? opt}{compatNote}
                                                </p>

                                                {/* AI reasoning in international-orange */}
                                                {reason && (
                                                  <p className="text-xs text-international-orange leading-relaxed font-medium">
                                                    {reason}
                                                  </p>
                                                )}

                                                {/* Ranked alternatives */}
                                                {alternatives.length > 0 && (
                                                  <div className="space-y-1 border-t pt-2">
                                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                      Alternatives considered
                                                    </p>
                                                    {alternatives.map((alt, i) => (
                                                      <div key={alt.value} className="flex items-start gap-1.5 text-xs">
                                                        <span className="text-muted-foreground font-mono text-[10px] mt-0.5 flex-shrink-0">
                                                          {i + 2}.
                                                        </span>
                                                        <div>
                                                          <span className="font-medium text-foreground">{alt.value}</span>
                                                          <span className="text-muted-foreground"> — {alt.reason}</span>
                                                        </div>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </HoverCardContent>
                                            </HoverCard>
                                          )
                                        }

                                        // Non-suggested pills: keep existing Tooltip
                                        const tooltipText = (q.optionDescriptions[opt] ?? opt)
                                          + (isIncompat ? ` — Not typically used with ${q.id === "material" ? modDiag.mfg_process : modDiag.material}` : "")

                                        return (
                                          <Tooltip key={opt}>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant={isSelected ? "default" : "outline"}
                                                size="sm"
                                                className={cn(
                                                  "text-xs h-7",
                                                  isIncompat && "opacity-40",
                                                )}
                                                onClick={() => handleAnswer(mod.id, q.id, opt)}
                                                type="button"
                                              >
                                                {isIncompat && (
                                                  <AlertTriangle className="h-3 w-3 mr-1 text-muted-foreground" />
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
              earlyCostEstimates={earlyCostEstimates}
              onCostOverride={(moduleId, overrides) => {
                setModules(prev => prev.map(m =>
                  m.id === moduleId ? { ...m, costOverrides: overrides } : m
                ))
              }}
            />

            {/* Finalize / Navigation CTA */}
            {canProceedToSource && finalizeSummary ? (
              <Card className="border-success/30 bg-gradient-to-r from-success/5 to-background">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-success/10 p-1.5">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Design finalized
                      </p>
                      <p className="text-xs text-muted-foreground">
                        All {diagStats.totalModules} module{diagStats.totalModules !== 1 ? "s" : ""} fully specified.
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Manufacturing:</span>{" "}
                          {finalizeSummary.processBreakdown}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Materials:</span>{" "}
                          {finalizeSummary.materials}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleRefreshModuleImages}
                        disabled={isGeneratingImages}
                        className="gap-1.5"
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", isGeneratingImages && "animate-spin")} />
                        {isGeneratingImages ? "Refreshing..." : "Refresh Illustrations"}
                      </Button>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Regenerate module images using your specifications.
                      </p>
                    </div>
                    <Button onClick={() => router.push(FORGE_ROUTES.cadLabSource)} className="gap-1.5">
                      Continue to Source
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
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
            <Card className={cn(allDiagnosticsComplete ? "border-success/30" : "border-border")}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Specialist Reviews</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {allDiagnosticsComplete
                        ? "Diagnostics complete. Reviews are optional — request one for extra confidence."
                        : "Complete diagnostics for all modules to unlock Source. Reviews are optional."}
                    </p>
                  </div>
                  {allDiagnosticsComplete && (
                    <CheckCircle2 className="h-6 w-6 text-success flex-shrink-0" />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Cross-module review issue summary with Apply Revisions — shown prominently before per-module panels */}
            {Object.keys(moduleReviews).length > 0 && (
              <ReviewIssueSummary
                modules={modules}
                moduleReviews={moduleReviews}
                isApplying={isApplyingReviewRevisions}
                onApplyRevisions={(issues: AggregatedIssue[]) => handleApplyReviewRevisions(issues)}
              />
            )}

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
                        {(mod.revisionNumber ?? 1) > 1 && (
                          <Badge variant="secondary" className="text-[10px]">
                            Rev {mod.revisionNumber}
                          </Badge>
                        )}
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
                        pendingReviewKeys={pendingReviewKeys}
                        onMarkPending={markReviewPending}
                        onClearPending={clearReviewPending}
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
            {allDiagnosticsComplete && finalizeSummary && (
              <Card className="border-success/30 bg-gradient-to-r from-success/5 to-background">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <p className="text-sm font-semibold text-foreground">
                        Design finalized
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

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

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
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
  PlayCircle,
  XCircle,
  ClipboardCheck,
  Grid3x3,
  FlipHorizontal2,
  FileDown,
  Network,
  PoundSterling,
} from "lucide-react"

import { toast } from "sonner"
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
import { DesignRevisionBanner } from "@/components/cad/design-revision-banner"
import { recommendSpecialist } from "@/lib/cad-lab/recommend-specialist"
import { RedlineDiff } from "../components/redline-diff"
import { buildRevisionItems } from "../components/checkpoint-revision-diffs"
import { PartsMap } from "@/components/cad/parts-map"
import { DfmInsightPanel } from "@/components/cad/dfm-insight-panel"
import { ManufacturingIntelligenceTab } from "@/components/cad/manufacturing-intelligence-tab"
import { ExecutiveReviewTab } from "@/components/cad/executive-review-tab"
import { getTechniqueInsightsByProcess, getProcessRecommendations } from "@/actions/manufacturing-techniques"
import type { ProcessInsights } from "@/actions/manufacturing-techniques"
import type { TechniqueRecommendation } from "@/lib/cad-lab/technique-recommender"
import { getToleranceMm } from "@/lib/cad-lab/diagnostic-to-technique"
import { DesignReportDialog } from "../components/design-report-dialog"
import { GetQuoteButton } from "@/components/cad/get-quote-button"
import { SpecialistIntroCard } from "@/components/cad/specialist-intro-card"
import { StageSpecialistCard } from "@/components/cad/stage-specialist-card"
import { useStageBriefing } from "@/hooks/use-stage-briefing"
import { STAGE_SPECIALISTS, getNextStageSpecialist } from "@/lib/cad-lab/stage-specialist-map"

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
    aiCostEstimates,
    activeProjectId,
    generatingModuleIds,
    researchModelUsed, decompositionModelUsed,
    revisedModuleIds,
    isApplyingReviewRevisions,
    handleApplyReviewRevisions,
    reviewSkipped,
    allModulesReviewed,
    handleSkipReviews,
    designRevision,
    imagesStale,
    isRegeneratingImages,
    markImagesCurrentManually,
    handleRegenerateDrawingsAfterRevision,
    progressLines,
    linkedRfqId,
    linkRfqToProject,
    assumptionNotes,
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
  const [showPartsMap, setShowPartsMap] = useState(false)
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)

  // ── DFM Insights — fetched per process from Nightshift technique knowledge ──
  const [processInsights, setProcessInsights] = useState<Record<string, ProcessInsights>>({})
  const fetchedProcessesRef = useRef<Set<string>>(new Set())
  const lastMirrorToastRef = useRef(0)

  // INTENT: Fetch insights when a module's mfg_process is set. Cache by process name
  // to avoid re-fetching when switching between modules with the same process.
  useEffect(() => {
    const processNames = new Set<string>()
    for (const mod of modules) {
      const process = diagnosticAnswers[mod.id]?.mfg_process?.trim()
      if (process && !fetchedProcessesRef.current.has(process)) {
        processNames.add(process)
      }
    }
    if (processNames.size === 0) return

    for (const process of processNames) {
      fetchedProcessesRef.current.add(process)
      getTechniqueInsightsByProcess(process).then((result) => {
        if (result) {
          setProcessInsights((prev) => ({ ...prev, [process]: result }))
        }
      }).catch((err) => console.warn("[SPECIFY] Technique insight fetch failed:", err))
    }
  }, [modules, diagnosticAnswers])

  // ── Technique Recommendations — fetched when material + tolerance are set ──
  const [techniqueRecs, setTechniqueRecs] = useState<Record<string, TechniqueRecommendation[]>>({})
  const recFingerprintRef = useRef<Record<string, string>>({})

  useEffect(() => {
    for (const mod of modules) {
      const diag = diagnosticAnswers[mod.id]
      if (!diag?.material || !diag?.tolerance) continue
      const toleranceMm = getToleranceMm(diag.tolerance)
      const fp = `${diag.material}|${diag.tolerance}|${diag.batch_size ?? ""}`
      if (recFingerprintRef.current[mod.id] === fp) continue
      recFingerprintRef.current[mod.id] = fp
      getProcessRecommendations(diag.material, toleranceMm, diag.batch_size ?? null).then((recs) => {
        if (recs.length > 0) {
          setTechniqueRecs((prev) => ({ ...prev, [mod.id]: recs }))
        }
      }).catch((err) => console.warn("[SPECIFY] Process recommendation fetch failed:", err))
    }
  }, [modules, diagnosticAnswers])

  // ── Diagnostic handlers ──

  const handleAnswer = useCallback((moduleId: string, questionId: string, value: string) => {
    // Count mirrors before state update (for toast after)
    const isPrimary = !modules.find((m) => m.id === moduleId)?.mirrorOf
    const mirrorCount = isPrimary ? modules.filter((m) => m.mirrorOf === moduleId).length : 0

    setDiagnosticAnswers((prev: DiagnosticAnswers) => {
      const updated: DiagnosticAnswers = {
        ...prev,
        [moduleId]: { ...(prev[moduleId] || {}), [questionId]: value },
      }

      // INTENT: Auto-sync diagnostics from primary → mirror modules.
      // Primary always wins — mirrors inherit every change. This matches the UI label
      // "Synced from {primary}" and avoids stale-comparison race conditions.
      if (isPrimary) {
        for (const mod of modules) {
          if (mod.mirrorOf === moduleId) {
            updated[mod.id] = { ...(updated[mod.id] || {}), [questionId]: value }
          }
        }
      }

      return updated
    })

    // Debounce mirror toast — suppress if fired within 3s (avoids spam on rapid answers)
    if (mirrorCount > 0 && Date.now() - lastMirrorToastRef.current > 3000) {
      lastMirrorToastRef.current = Date.now()
      toast.info(`Synced to ${mirrorCount} mirror module${mirrorCount !== 1 ? "s" : ""}`)
    }
  }, [setDiagnosticAnswers, modules])

  const handleUseRecommended = useCallback((moduleId: string) => {
    const mod = modules.find((m) => m.id === moduleId)
    if (!mod) return
    const recommended = inferRecommendations(mod, designBrief)
    setDiagnosticAnswers((prev: DiagnosticAnswers) => {
      const updated = {
        ...prev,
        [moduleId]: { ...(prev[moduleId] || {}), ...recommended },
      }
      // INTENT: Sync to mirrors if this is a primary module
      if (!mod.mirrorOf) {
        for (const m of modules) {
          if (m.mirrorOf === moduleId) {
            updated[m.id] = { ...(updated[m.id] || {}), ...recommended }
          }
        }
      }
      return updated
    })
  }, [modules, designBrief, setDiagnosticAnswers])

  const handleAutoSelectAll = useCallback(() => {
    const mirrorCount = modules.filter((m) => m.mirrorOf).length

    setDiagnosticAnswers((prev: DiagnosticAnswers) => {
      const updated = { ...prev }
      for (const mod of modules) {
        const recommended = inferRecommendations(mod, designBrief)
        updated[mod.id] = { ...(updated[mod.id] || {}), ...recommended }
      }
      // INTENT: Ensure mirrors get their primary's recommendations, not independently inferred ones.
      // Mirror modules may have divergent descriptions, so inferRecommendations() could produce
      // different values. Force consistency by copying primary → mirror.
      for (const mod of modules) {
        if (mod.mirrorOf && updated[mod.mirrorOf]) {
          updated[mod.id] = { ...updated[mod.mirrorOf] }
        }
      }
      return updated
    })

    if (mirrorCount > 0 && Date.now() - lastMirrorToastRef.current > 3000) {
      lastMirrorToastRef.current = Date.now()
      toast.info(`Synced diagnostics to ${mirrorCount} mirror module${mirrorCount !== 1 ? "s" : ""}`)
    }
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
  // INTENT: Full pipeline — diagnostics + reviews done before sourcing. Costings live in Source/Assemble.
  // INTENT: canProceedToSource also checks imagesStale / isRegeneratingImages
  // so the header "Continue to Source" button enforces the same gate as the
  // review-tab CTA at line ~1542. Previously the header button let users move
  // to Source while image regeneration was still in flight or stale, which
  // could show Source with obsolete reference images.
  const canProceedToSource =
    allDiagnosticsComplete &&
    (allModulesReviewed || reviewSkipped) &&
    !imagesStale &&
    !isRegeneratingImages

  // ── Stage briefings — Specify stage owned by Fang (VP Manufacturing) ──
  const specifyMapping = STAGE_SPECIALISTS.specify
  const nextSpecify = getNextStageSpecialist("specify")
  const reviewSummary = useMemo(() => {
    let pass = 0, warn = 0, fail = 0
    for (const reviews of Object.values(moduleReviews)) {
      for (const r of reviews) {
        if (r.verdict === "pass") pass++
        else if (r.verdict === "warn") warn++
        else if (r.verdict === "fail") fail++
      }
    }
    return { pass, warn, fail }
  }, [moduleReviews])

  const { briefing: specifyEntryBriefing, isLoading: specifyEntryLoading } = useStageBriefing({
    stage: "specify",
    variant: "entry",
    projectId: activeProjectId,
    projectSubject: subject,
    moduleCount: modules.length,
    diagnosticCompletionPct: diagStats.completionPct,
    reviewSummary,
    enabled: true,
  })
  const { briefing: specifyExitBriefing, isLoading: specifyExitLoading } = useStageBriefing({
    stage: "specify",
    variant: "exit",
    projectId: activeProjectId,
    projectSubject: subject,
    moduleCount: modules.length,
    diagnosticCompletionPct: diagStats.completionPct,
    reviewSummary,
    enabled: canProceedToSource,
  })

  // ── Batch review orchestrator ──
  // INTENT: Parallel auto-review of all unreviewed modules (up to BATCH_CONCURRENCY at once).
  // Reuses SpecialistReviewPanel's existing two-phase flow (quick verdict → full review)
  // by setting triggerReview prop on active modules, refilling from queue on completion.

  const BATCH_CONCURRENCY = 3
  const [batchReviewActive, setBatchReviewActive] = useState(false)
  const [batchActiveEntries, setBatchActiveEntries] = useState<Map<string, string>>(new Map()) // Map<moduleId, specialistId>
  const [batchCompletedCount, setBatchCompletedCount] = useState(0)
  const [batchTotalCount, setBatchTotalCount] = useState(0)
  const [batchQueue, setBatchQueue] = useState<Array<{ moduleId: string; specialistId: string }>>([])
  const batchCancelledRef = useRef(false)

  const unreviewedModuleCount = useMemo(() => {
    if (!activeProjectId) return 0
    return modules.filter((mod) => {
      if (!isDiagnosticsFilledForModule(diagnosticAnswers, mod.id)) return false
      const reviews = moduleReviews[mod.id] ?? []
      const ranking = recommendSpecialist(mod, diagnosticAnswers)
      const topSpecId = ranking[0]?.id
      if (!topSpecId) return false
      return !reviews.some((r) => r.specialistId === topSpecId)
    }).length
  }, [modules, diagnosticAnswers, moduleReviews, activeProjectId])

  const startBatchReview = useCallback(() => {
    const queue: Array<{ moduleId: string; specialistId: string }> = []
    for (const mod of modules) {
      if (!isDiagnosticsFilledForModule(diagnosticAnswers, mod.id)) continue
      const ranking = recommendSpecialist(mod, diagnosticAnswers)
      const topSpecId = ranking[0]?.id
      if (!topSpecId) continue
      const reviews = moduleReviews[mod.id] ?? []
      if (reviews.some((r) => r.specialistId === topSpecId)) continue
      queue.push({ moduleId: mod.id, specialistId: topSpecId })
    }
    if (queue.length === 0) return
    batchCancelledRef.current = false
    const initialBatch = queue.slice(0, BATCH_CONCURRENCY)
    const remaining = queue.slice(BATCH_CONCURRENCY)
    setBatchActiveEntries(new Map(initialBatch.map((q) => [q.moduleId, q.specialistId])))
    setBatchQueue(remaining)
    setBatchCompletedCount(0)
    setBatchTotalCount(queue.length)
    setBatchReviewActive(true)
  }, [modules, diagnosticAnswers, moduleReviews])

  // INTENT: Called when a single module's review completes (success or error).
  // Removes it from the active set, then pulls the next queued module in (unless cancelled).
  // Uses separate setState calls — React 18 batches them into a single render.
  const advanceBatchReview = useCallback((completedModuleId: string) => {
    setBatchCompletedCount((prev) => prev + 1)

    // Step 1: Remove completed module from active set
    setBatchActiveEntries((prev) => {
      const next = new Map(prev)
      next.delete(completedModuleId)
      return next
    })

    // Step 2: Pull next from queue into active set (if not cancelled)
    if (!batchCancelledRef.current) {
      setBatchQueue((prevQueue) => {
        if (prevQueue.length === 0) return prevQueue
        const [nextEntry, ...rest] = prevQueue
        setBatchActiveEntries((prev) => new Map(prev).set(nextEntry.moduleId, nextEntry.specialistId))
        return rest
      })
    }
  }, [])

  const cancelBatchReview = useCallback(() => {
    batchCancelledRef.current = true
    // In-flight reviews finish naturally; advanceBatchReview won't pull new modules
  }, [])

  // INTENT: Detect batch completion — when all active reviews have drained and no queue remains.
  // Runs after React batches the state updates from advanceBatchReview.
  useEffect(() => {
    if (batchReviewActive && batchActiveEntries.size === 0) {
      setBatchReviewActive(false)
    }
  }, [batchReviewActive, batchActiveEntries.size])

  // ── Tab navigation ──
  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "specs", label: "Module Specs" },
    { id: "review", label: "Specialist Review" },
    { id: "mfg_intelligence", label: "Manufacturing Intelligence" },
    { id: "executive_review", label: "Executive Review" },
  ]

  const [activeTab, setActiveTab] = useState("overview")

  // INTENT: Sync activeTab with the URL ?tab=... param.
  // - `useState` starts with "overview" (hydration-safe default, avoids React #418).
  // - This effect runs on mount AND whenever searchParams change — so browser
  //   back/forward navigation (which keeps this component mounted but advances
  //   the URL) updates the active tab too. Without the [searchParams] dep the
  //   back button moved the URL but left the page on the old tab.
  useEffect(() => {
    const param = searchParams.get("tab")
    if (param && TABS.some((t) => t.id === param)) {
      setActiveTab(param)
    }
  }, [searchParams])

  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId)
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", tabId)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams, setActiveTab],
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
            Define specs, then get expert review before sourcing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push(FORGE_ROUTES.cadLab)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Design
          </Button>
          {diagStats.modulesComplete > 0 && (
            <GetQuoteButton
              projectId={activeProjectId}
              pipelineStage="specify"
              modules={modules}
              diagnosticAnswers={diagnosticAnswers}
              designBrief={designBrief}
              assumptionNotes={assumptionNotes}
              projectName={subject}
              linkedRfqId={linkedRfqId}
              onRfqLinked={linkRfqToProject}
              size="sm"
            />
          )}
          {canProceedToSource && (
            <Button size="sm" onClick={() => router.push(FORGE_ROUTES.cadLabSource)} className="gap-1.5">
              Continue to Source
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Fang (VP Manufacturing) entry briefing ── */}
      <StageSpecialistCard
        specialistId={specifyMapping.specialistId}
        variant="entry"
        stageName="Specify"
        briefing={specifyEntryBriefing}
        isLoading={specifyEntryLoading}
      />

      {/* ── Fang exit briefing — shown when ready to proceed to Source ── */}
      {canProceedToSource && (
        <StageSpecialistCard
          specialistId={specifyMapping.specialistId}
          variant="exit"
          stageName="Specify"
          briefing={specifyExitBriefing}
          isLoading={specifyExitLoading}
          nextSpecialistId={nextSpecify?.specialistId}
          nextStageName={nextSpecify?.stageLabel}
          onProceed={() => router.push(FORGE_ROUTES.cadLabSource)}
          proceedLabel="Continue to Source"
        />
      )}

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
      {/* a11y: role="tablist" + role="tab" + aria-selected/controls gives
          screen readers proper tab semantics. Left/Right arrow handlers
          match ARIA APG pattern so keyboard users can cycle tabs. */}
      <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border overflow-x-auto">
        <div
          role="tablist"
          aria-label="Specify stage sections"
          className="flex items-center gap-2"
        >
          {TABS.map((tab, idx) => (
            <button
              key={tab.id}
              id={`specify-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`specify-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault()
                  const delta = e.key === "ArrowRight" ? 1 : -1
                  const nextIdx = (idx + delta + TABS.length) % TABS.length
                  const nextTab = TABS[nextIdx]
                  handleTabClick(nextTab.id)
                  // Move focus to the newly active tab so keyboard users see it
                  document.getElementById(`specify-tab-${nextTab.id}`)?.focus()
                } else if (e.key === "Home") {
                  e.preventDefault()
                  handleTabClick(TABS[0].id)
                  document.getElementById(`specify-tab-${TABS[0].id}`)?.focus()
                } else if (e.key === "End") {
                  e.preventDefault()
                  const last = TABS[TABS.length - 1]
                  handleTabClick(last.id)
                  document.getElementById(`specify-tab-${last.id}`)?.focus()
                }
              }}
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
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setIsReportDialogOpen(true)}
          >
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">Download Report</span>
          </Button>
        </div>
      </nav>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        {/* ═══ Overview tab ═══ */}
        {activeTab === "overview" && (
          <motion.div key="overview" role="tabpanel" id="specify-panel-overview" aria-labelledby="specify-tab-overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            {/* Product overview card — always visible so user can add/edit */}
            <ProductOverviewCard
              overview={productOverview}
              onSave={setProductOverview}
              modelAudit={modelAudit}
            />

            {/* Design revision banner — shows revision status on Overview tab too */}
            <DesignRevisionBanner
              designRevision={designRevision}
              imagesStale={imagesStale}
              revisedModuleCount={revisedModuleIds.size}
              isRegenerating={isRegeneratingImages}
              progressLines={progressLines}
            />

            {/* Meet Your Engineering Team — only shown before first review */}
            {Object.keys(moduleReviews).length === 0 && allDiagnosticsComplete && (
              <SpecialistIntroCard onNavigateToReview={() => setActiveTab("review")} />
            )}

            {/* Cost summary — aggregate early estimates across modules */}
            {aiCostEstimates && Object.keys(aiCostEstimates).length > 0 && (
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <PoundSterling className="h-4 w-4 text-muted-foreground shrink-0" />
                    <h3 className="text-sm font-semibold text-foreground">Cost Summary</h3>
                    <Badge variant="warning" className="ml-1 text-xs px-1.5 py-0 h-5">BETA</Badge>
                    <span className="text-xs text-muted-foreground ml-1">— early estimates across {Object.keys(aiCostEstimates).length} modules</span>
                  </div>

                  {/* BETA warning — costs are rough estimates and must be qualified-reviewed */}
                  <div
                    className="flex gap-2 p-3 mb-3 rounded-md border border-warning/40 bg-warning/10"
                    role="status"
                    aria-label="Cost estimate warning"
                  >
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div className="text-xs text-foreground space-y-1">
                      <p className="font-semibold">These figures are rough early estimates and could be completely wrong.</p>
                      <p className="text-foreground/80">
                        This feature is in <span className="font-semibold text-foreground">BETA</span>. Numbers are AI-generated from limited information and may be off by a large margin — in either direction. Do not use them for pricing, fundraising, or any business decision without having a qualified cost engineer or your supply chain lead fully review each line item. Confidence labels (low/medium/high) reflect the model&apos;s own self-assessment and are not a substitute for human review.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {modules.map(mod => {
                      const est = aiCostEstimates[mod.id]
                      if (!est) return null
                      return (
                        <div key={mod.id} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground truncate max-w-[60%]">{mod.name}</span>
                          <span className="font-medium text-foreground">
                            £{est.totalPerUnit?.toFixed(0) ?? "?"}/unit
                            <span className="text-xs text-muted-foreground ml-1">({est.confidence ?? "?"})</span>
                          </span>
                        </div>
                      )
                    })}
                    <div className="border-t pt-2 mt-2 flex items-center justify-between text-sm font-semibold">
                      <span className="text-foreground">Total per unit</span>
                      <span className="text-international-orange">
                        £{Object.values(aiCostEstimates).reduce((sum, e) => sum + (e.totalPerUnit ?? 0), 0).toFixed(0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Aggregated technique recommendations */}
            {(() => {
              const bySlug = new Map<string, { name: string; score: number; moduleCount: number; supplierCount: number; moduleNames: string[] }>()
              for (const [moduleId, recs] of Object.entries(techniqueRecs)) {
                const mod = modules.find((m) => m.id === moduleId)
                for (const rec of recs) {
                  const existing = bySlug.get(rec.slug)
                  if (existing) {
                    existing.moduleCount++
                    existing.score = Math.max(existing.score, rec.score)
                    existing.supplierCount = Math.max(existing.supplierCount, rec.supplierCount)
                    if (mod) existing.moduleNames.push(mod.name)
                  } else {
                    bySlug.set(rec.slug, {
                      name: rec.name,
                      score: rec.score,
                      moduleCount: 1,
                      supplierCount: rec.supplierCount,
                      moduleNames: mod ? [mod.name] : [],
                    })
                  }
                }
              }
              const aggregated = [...bySlug.values()].sort((a, b) => b.score - a.score).slice(0, 8)
              if (aggregated.length === 0) return null
              return (
                <Card>
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center gap-1.5 mb-3">
                      <FlaskConical className="h-4 w-4 text-muted-foreground shrink-0" />
                      <h3 className="text-sm font-semibold text-foreground">Recommended Techniques</h3>
                      <span className="text-xs text-muted-foreground ml-1">
                        {aggregated.length} across modules
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {aggregated.map((rec) => (
                        <div key={rec.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{rec.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {rec.moduleCount} module{rec.moduleCount !== 1 ? "s" : ""}
                              {rec.supplierCount > 0 && ` · ${rec.supplierCount} supplier${rec.supplierCount !== 1 ? "s" : ""}`}
                            </p>
                          </div>
                          <Badge variant={rec.score >= 60 ? "success" : rec.score >= 40 ? "warning" : "secondary"} className="text-xs shrink-0 ml-2">
                            {rec.score}pt
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })()}

            {/* Module summary cards */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground">Modules ({modules.length})</h2>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setShowPartsMap(true)}>
                  <Grid3x3 className="h-3.5 w-3.5" />
                  Parts Map
                </Button>
              </div>
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
                              <Badge variant="secondary" className="text-[10px]" title={`Revised via ${mod.lastRevisionSource ?? "unknown"} — revision ${mod.revisionNumber}`}>Rev {mod.revisionNumber}</Badge>
                            )}
                            {getSpecStatusBadge(status)}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{mod.purpose}</p>
                        {mod.imageUrl && (
                          <div className="relative aspect-[4/3] rounded-md overflow-hidden bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={mod.imageUrl}
                              alt={mod.name}
                              className={cn(
                                "w-full h-full object-cover",
                                imagesStale && revisedModuleIds.has(mod.id) && "opacity-50",
                              )}
                            />
                            {imagesStale && revisedModuleIds.has(mod.id) && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex items-center gap-1 rounded-full bg-warning/90 px-2 py-1 text-[10px] font-medium text-primary-foreground">
                                  <RefreshCw className="h-3 w-3" />
                                  Drawing outdated
                                </div>
                              </div>
                            )}
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
          <motion.div key="specs" role="tabpanel" id="specify-panel-specs" aria-labelledby="specify-tab-specs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
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
                        <div className="relative h-10 w-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mod.imageUrl} alt={mod.name} className={cn("w-full h-full object-cover", imagesStale && revisedModuleIds.has(mod.id) && "opacity-50")} />
                          {imagesStale && revisedModuleIds.has(mod.id) && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <RefreshCw className="h-3 w-3 text-warning" />
                            </div>
                          )}
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
                            <Badge variant="secondary" className="text-[10px]" title={`Revised via ${mod.lastRevisionSource ?? "unknown"} — revision ${mod.revisionNumber}`}>Rev {mod.revisionNumber}</Badge>
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
                        {mod.mirrorOf && (() => {
                          const primary = modules.find((m) => m.id === mod.mirrorOf)
                          return primary ? (
                            <p className="text-[10px] text-info flex items-center gap-1 mt-0.5">
                              <FlipHorizontal2 className="h-3 w-3 inline" />
                              Synced from {primary.name}
                            </p>
                          ) : null
                        })()}
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

                                    {/* DFM Insight Panel — shown below mfg_process after selection */}
                                    {q.id === "mfg_process" && currentAnswer && processInsights[currentAnswer] && (
                                      <DfmInsightPanel
                                        insights={processInsights[currentAnswer]}
                                        selectedTolerance={modDiag.tolerance}
                                        selectedMaterial={modDiag.material}
                                      />
                                    )}

                                    {/* Technique recommendations — shown below material when recs differ from selected process */}
                                    {q.id === "material" && techniqueRecs[mod.id]?.length > 0 && modDiag.mfg_process && (() => {
                                      const recs = techniqueRecs[mod.id]
                                      const selectedProcess = modDiag.mfg_process.toLowerCase()
                                      // Only show if top recommendation is different from current process
                                      const topRec = recs[0]
                                      const isAlternative = !topRec.name.toLowerCase().includes(selectedProcess) &&
                                        !selectedProcess.includes(topRec.slug.split("-")[0])
                                      if (!isAlternative) return null
                                      return (
                                        <div className="rounded-lg border border-info/20 bg-info/[0.02] p-2.5 space-y-1">
                                          <p className="text-[11px] font-medium text-info flex items-center gap-1">
                                            <Lightbulb className="h-3 w-3" />
                                            Consider alternative process
                                          </p>
                                          <p className="text-[11px] text-muted-foreground">
                                            <span className="font-medium text-foreground">{topRec.name}</span>
                                            {" "}scores higher for your requirements
                                            {topRec.supplierCount > 0 && ` (${topRec.supplierCount} suppliers)`}
                                            {topRec.reasons[0] && ` — ${topRec.reasons[0].toLowerCase()}`}
                                          </p>
                                        </div>
                                      )
                                    })()}
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

            {/* Navigation CTA — two-state progression */}
            {allDiagnosticsComplete ? (
              /* Diagnostics done — continue to review */
              <Card className="border-success/30 bg-gradient-to-r from-success/5 to-background">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          All diagnostics complete
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Continue to specialist review for expert feedback.
                        </p>
                      </div>
                    </div>
                    <Button onClick={() => handleTabClick("review")} className="gap-1.5">
                      Continue to Review
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Incomplete: diagnostics not done yet */
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
          <motion.div key="review" role="tabpanel" id="specify-panel-review" aria-labelledby="specify-tab-review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            {/* Gate status */}
            <Card className={cn(allDiagnosticsComplete ? "border-success/30" : "border-border")}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Specialist Reviews</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {!allDiagnosticsComplete
                        ? "Complete diagnostics for all modules first."
                        : allModulesReviewed
                          ? "All modules reviewed. Design ready for sourcing."
                          : `Expert review catches issues before they become expensive. ${unreviewedModuleCount} module${unreviewedModuleCount !== 1 ? "s" : ""} pending.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Batch review button */}
                    {allDiagnosticsComplete && !batchReviewActive && unreviewedModuleCount > 0 && (
                      <Button variant="secondary" size="sm" onClick={startBatchReview} className="gap-1.5">
                        <PlayCircle className="h-3.5 w-3.5" />
                        Review All Modules
                      </Button>
                    )}
                    {batchReviewActive && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-international-orange" />
                          <span>{batchCompletedCount}/{batchTotalCount} reviewed</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={cancelBatchReview} className="h-7 min-h-[44px] sm:min-h-0 sm:h-7 gap-1 text-xs">
                          <XCircle className="h-3 w-3" />
                          Cancel
                        </Button>
                      </div>
                    )}
                    {allDiagnosticsComplete && !batchReviewActive && unreviewedModuleCount === 0 && (
                      <CheckCircle2 className="h-6 w-6 text-success" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Design revision banner — shows after specialist review revisions are applied */}
            <DesignRevisionBanner
              designRevision={designRevision}
              imagesStale={imagesStale}
              revisedModuleCount={revisedModuleIds.size}
              isRegenerating={isRegeneratingImages}
              progressLines={progressLines}
            />

            {/* Cross-module review issue summary with Apply Revisions — shown prominently before per-module panels */}
            {Object.keys(moduleReviews).length > 0 && (
              <ReviewIssueSummary
                modules={modules}
                moduleReviews={moduleReviews}
                isApplying={isApplyingReviewRevisions}
                onApplyRevisions={(issues: AggregatedIssue[]) => handleApplyReviewRevisions(issues)}
                revisionsApplied={revisedModuleIds.size > 0}
              />
            )}

            {/* Per-module specialist review panels */}
            {modules.map((mod) => {
              const status = moduleStatuses[mod.id]
              const diagComplete = isDiagnosticsFilledForModule(diagnosticAnswers, mod.id)
              const reviews = moduleReviews[mod.id] ?? []

              // INTENT: Batch orchestrator sets triggerReview on all active modules (up to BATCH_CONCURRENCY).
              // Other modules get undefined — their individual buttons still work normally.
              const isBatchTarget = batchReviewActive && batchActiveEntries.has(mod.id)
              const batchSpecialistId = batchActiveEntries.get(mod.id)

              return (
                <Card key={mod.id} className={cn(isBatchTarget && "ring-2 ring-international-orange/30")}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        {mod.name}
                        {getSpecStatusBadge(status)}
                        {(mod.revisionNumber ?? 1) > 1 && (
                          <Badge variant="secondary" className="text-[10px]" title={`Revised via ${mod.lastRevisionSource ?? "unknown"} — revision ${mod.revisionNumber}`}>
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
                        onReviewComplete={(review) => {
                          handleReviewComplete(mod.id, review)
                          if (isBatchTarget) advanceBatchReview(mod.id)
                        }}
                        pendingReviewKeys={pendingReviewKeys}
                        onMarkPending={markReviewPending}
                        onClearPending={clearReviewPending}
                        triggerReview={batchSpecialistId}
                        onReviewError={isBatchTarget ? () => advanceBatchReview(mod.id) : undefined}
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

            {/* Review CTA — proceeds to costings when review complete + images current */}
            {(allModulesReviewed || reviewSkipped) && !imagesStale && !isRegeneratingImages ? (
              <div className="space-y-4">
                {/* Max (CTO) Integration Coherence Check — computed from module data */}
                {(() => {
                  // DECISION: Compute integration issues from module data rather than
                  // making a blocking AI call. Checks interface mismatches, material
                  // compatibility, and tolerance consistency across all modules.
                  const issues: string[] = []

                  // Check 1: Unmatched interface ports
                  const allOutputs = new Set<string>()
                  const allInputs = new Set<string>()
                  for (const mod of modules) {
                    for (const o of mod.outputs ?? []) allOutputs.add(o.toLowerCase())
                    for (const inp of mod.inputs ?? []) allInputs.add(inp.toLowerCase())
                  }
                  const unmatchedInputs = [...allInputs].filter(i => !allOutputs.has(i))
                  if (unmatchedInputs.length > 0) {
                    issues.push(`${unmatchedInputs.length} interface input(s) have no matching output from another module`)
                  }

                  // Check 2: Mixed material families at interfaces
                  const materialFamilies = new Set<string>()
                  for (const mod of modules) {
                    const answers = diagnosticAnswers[mod.id]
                    if (answers?.material) materialFamilies.add(answers.material)
                  }
                  if (materialFamilies.has("Aluminum") && materialFamilies.has("Carbon Steel")) {
                    issues.push("Aluminum + Carbon Steel at interfaces risks galvanic corrosion — consider isolating or switching to stainless fasteners")
                  }

                  // Check 3: Tolerance mismatch warning
                  const toleranceLevels = new Set<string>()
                  for (const mod of modules) {
                    const answers = diagnosticAnswers[mod.id]
                    if (answers?.tolerance) toleranceLevels.add(answers.tolerance)
                  }
                  if (toleranceLevels.has("Ultra-tight (±0.01mm)") && toleranceLevels.has("Standard (±0.5mm)")) {
                    issues.push("Mixing ultra-tight and standard tolerances — verify interface fit between precision and standard modules")
                  }

                  const hasIssues = issues.length > 0

                  return (
                    <Card className={hasIssues ? "border-warning/30 bg-gradient-to-r from-warning/5 to-background" : "border-info/30 bg-gradient-to-r from-info/5 to-background"}>
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                          <div className={cn("shrink-0 w-8 h-8 rounded-full flex items-center justify-center", hasIssues ? "bg-warning/10" : "bg-info/10")}>
                            <Network className={cn("h-4 w-4", hasIssues ? "text-warning" : "text-info")} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={cn("text-xs font-semibold mb-1", hasIssues ? "text-warning" : "text-info")}>
                              Max, CTO — Integration Check {hasIssues ? "(warnings)" : "(passed)"}
                            </p>
                            {hasIssues ? (
                              <div className="space-y-1">
                                {issues.map((issue, i) => (
                                  <p key={i} className="text-sm text-muted-foreground leading-relaxed flex items-start gap-2">
                                    <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                                    {issue}
                                  </p>
                                ))}
                                <p className="text-xs text-muted-foreground mt-2">These are advisory — you can proceed to sourcing and address them during manufacturing.</p>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                All {modules.length} modules checked. Interfaces match, material choices are compatible, and tolerance levels are consistent. Ready to proceed to sourcing.
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}

                {/* Continue to Source */}
                <Card className="border-success/30 bg-gradient-to-r from-success/5 to-background">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <p className="text-sm font-semibold text-foreground">
                          Reviews complete
                          {designRevision > 1 && <span className="font-normal text-muted-foreground ml-1">(v{designRevision})</span>}
                        </p>
                      </div>
                      <Button onClick={() => {
                        router.push(`${FORGE_ROUTES.cadLabSource}?from=specify`)
                      }} className="gap-1.5">
                        Continue to Source
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (allModulesReviewed || reviewSkipped) && imagesStale && !isRegeneratingImages ? (
              // INTENT: Reviewed but images stale (revisions were made and regen
              // has been attempted or not yet run). Previously this state had no
              // UI at all — the user was trapped because the only CTA appeared
              // when !imagesStale. Two paths out: retry regeneration, or accept
              // the current (outdated) drawings and move on.
              <Card className="border-warning/30 bg-gradient-to-r from-warning/5 to-background">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        Drawings are out of date
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Your revised module specs don&apos;t match the current illustrations. Regenerate them, or continue to Source with the existing drawings (they&apos;ll no longer reflect your latest spec).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={handleRegenerateDrawingsAfterRevision} className="gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Regenerate illustrations
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm("Continue to Source with the current (outdated) drawings? You can regenerate them later.")) {
                          markImagesCurrentManually()
                          router.push(`${FORGE_ROUTES.cadLabSource}?from=specify`)
                        }
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Skip &amp; continue to Source
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : allDiagnosticsComplete && !allModulesReviewed && !reviewSkipped ? (
              <Card className="border-warning/30 bg-gradient-to-r from-warning/5 to-background">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4 text-warning" />
                      <p className="text-sm font-semibold text-foreground">
                        {unreviewedModuleCount} module{unreviewedModuleCount !== 1 ? "s" : ""} awaiting review
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (window.confirm("Skip expert review? Manufacturing issues won\u2019t be caught until sourcing \u2014 this can be costly.")) {
                            handleSkipReviews()
                          }
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                      >
                        Skip &amp; Finalize
                      </button>
                      {!batchReviewActive && unreviewedModuleCount > 0 && (
                        <Button size="sm" onClick={startBatchReview} className="gap-1.5">
                          <PlayCircle className="h-3.5 w-3.5" />
                          Review All
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </motion.div>
        )}

        {/* ═══ Manufacturing Intelligence tab ═══ */}
        {activeTab === "mfg_intelligence" && (
          <motion.div key="mfg_intelligence" role="tabpanel" id="specify-panel-mfg_intelligence" aria-labelledby="specify-tab-mfg_intelligence" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            <ManufacturingIntelligenceTab
              modules={modules}
              diagnosticAnswers={diagnosticAnswers}
              processInsights={processInsights}
              techniqueRecs={techniqueRecs}
            />
          </motion.div>
        )}

        {/* ═══ Executive Review tab ═══ */}
        {activeTab === "executive_review" && (
          <motion.div key="executive_review" role="tabpanel" id="specify-panel-executive_review" aria-labelledby="specify-tab-executive_review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            <ExecutiveReviewTab
              modules={modules}
              diagnosticAnswers={diagnosticAnswers}
              context="design"
              useCase={designBrief.useCase}
            />
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Parts Map overlay ── */}
      <PartsMap
        modules={modules}
        diagnosticAnswers={diagnosticAnswers}
        aiCostEstimates={aiCostEstimates}
        subject={subject}
        open={showPartsMap}
        onClose={() => setShowPartsMap(false)}
        onModuleClick={(moduleId) => {
          setShowPartsMap(false)
          setActiveTab("specs")
          setExpandedModuleId(moduleId)
        }}
      />

      <DesignReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        stage="specify"
        stageData={{ moduleReviews, reviewSkipped }}
      />
    </div>
  )
}

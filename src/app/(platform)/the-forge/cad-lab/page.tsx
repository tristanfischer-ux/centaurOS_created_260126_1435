"use client"

/**
 * @file page.tsx — The Forge: Concept stage (Stage 1).
 *
 * @description Lightweight "napkin sketch" stage. Collects the product idea,
 * runs research in the background (report is displayed in Build), generates a
 * system overview illustration, decomposes into modules, and reveals them
 * progressively as blueprint images arrive. Concept is intentionally fast and
 * minimal — the detailed engineering happens in the Build stage.
 *
 * @related
 * - Context: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx
 * - Image card: src/app/(platform)/the-forge/cad-lab/components/module-image-card.tsx
 * - Image grid: src/app/(platform)/the-forge/cad-lab/components/module-image-grid.tsx
 * - Build stage: src/app/(platform)/the-forge/cad-lab/build/page.tsx
 */

import { useRouter, useSearchParams } from "next/navigation"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { SafeAnimatePresence } from "@/components/ui/safe-animate-presence"
import React from "react"
import { toast } from "sonner"
import {
  Loader2,
  ArrowRight,
  Layers,
  ImageIcon,
  RotateCcw,
  AlertTriangle,
  Info,
  FileDown,
  Box,
  Download,
  ShieldCheck,
  Wrench,
  Cog,
  Building2,
  Clock,
  RefreshCw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const ModelViewer = dynamic(
  () => import("@/components/cad/model-viewer").then((m) => ({ default: m.ModelViewer })),
  { ssr: false, loading: () => <Skeleton className="w-full h-[300px] rounded-lg" /> },
)

import { useRegisterScreenContext } from "@/contexts/screen-context"
import { useCadLab } from "./cad-lab-context"
import { HeroSection } from "./components/hero-section"
import { LinkedProductChip } from "./components/linked-product-chip"
import { DesignBriefInterview } from "./components/design-brief-interview"
import { IllustrationStyleSelector } from "./components/illustration-style-selector"
import { getIllustrationStyleMeta } from "@/lib/cad-lab/illustration-styles"
import { ModuleImageGrid } from "./components/module-image-grid"
import { ModuleFlowCanvas } from "./components/module-flow-canvas"
import { ProductOverviewCard } from "./components/product-overview-card"
import { CadLabProgress } from "@/components/cad/cad-lab-progress"
import { DecompositionCheckpointCard } from "@/components/cad/decomposition-checkpoint-card"
import { DesignIterationHost, type DesignIterationHostHandle } from "@/components/cad/design-iteration-host"
import { CheckpointRevisionDiffs } from "./components/checkpoint-revision-diffs"
import { DesignReportDialog } from "./components/design-report-dialog"
import { StageSpecialistCard } from "@/components/cad/stage-specialist-card"
import { useStageBriefing } from "@/hooks/use-stage-briefing"
import { STAGE_SPECIALISTS, getNextStageSpecialist } from "@/lib/cad-lab/stage-specialist-map"

// ─── Page Component ──────────────────────────────────────────────────

// Simple error boundary to catch framer-motion .length crashes without breaking the page
class RenderErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error) {
    console.error("[CAD-LAB-ERROR-BOUNDARY]", error.message, error.stack?.slice(0, 500))
  }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

export default function CadLabResearchPage(): React.ReactNode {
  const router = useRouter()
  const {
    subject, setSubject, modelId,
    referenceModel,
    isResearching,
    hasResearch, isAnyLoading, freshResearchRef = { current: false }, activeProjectId,
    handleResearch, handleDecompose,
    interviewPhase, setInterviewPhase, setDesignBrief,
    modules = [], isDecomposing, decompositionError,
    expandedModuleId, setExpandedModuleId,
    isGeneratingImages, handleGenerateModuleImages,
    revealedModuleIds = new Set(),
    decompositionConnections = [], interfaceContracts = [], isExtractingContracts, generatingModuleIds = new Set(), unmatchedPorts,
    systemIllustrationUrl, systemIllustrationStatus, systemIllustrationError, systemIllustrationConfidence, systemIllustrationIssues = [], handleRetryIllustration,
    progressLines = [],
    checkpoints, isCheckpointing,
    isRevising, revisedModuleIds = new Set(), checkpointAcknowledged, handleAcknowledgeCheckpoints,
    designInfeasibility, clearDesignInfeasibility,
    productOverview, setProductOverview,
    saveError,
    handleUpdateModule,
    researchModelUsed, decompositionModelUsed, researchResult,
    handleRefreshModuleImages,
    handleReExpandModule, reExpandingModuleIds = new Set(),
    tripoPreviewUrl, tripoPreviewStatus, tripoPreviewError,
    handleGenerateTripoPreview,
    referenceImages = [], setReferenceImages,
    referenceDocuments = [], setReferenceDocuments,
    illustrationStyle, appliedIllustrationStyle,
  } = useCadLab()

  // DEBUG: Capture full stack trace of the persistent .length error
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      if (event.message?.includes("reading 'length'") || event.message?.includes("reading `length`")) {
        console.error("[CAD-LAB-ERROR-TRACE] Full error:", {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack || "no stack"
        })
      }
    }
    window.addEventListener("error", handler)
    return () => window.removeEventListener("error", handler)
  }, [])

  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)

  // ── Design iteration host ref — Phase IV wiring.
  // Exposes triggerInfeasibility / triggerCostReduction / triggerManual so the
  // "Revise the design" button on the checkpoint card + any other trigger can
  // kick off the full generate→record→dialog→apply flow.
  const designIterationHostRef = useRef<DesignIterationHostHandle | null>(null)
  const [heroView, setHeroView] = useState<"2d" | "3d">("2d")
  const [overviewApproved, setOverviewApproved] = useState(false)

  // Stage briefings — Design stage owned by Max (CTO)
  const designMapping = STAGE_SPECIALISTS.design
  const nextDesign = getNextStageSpecialist("design")
  const { briefing: entryBriefing, isLoading: entryLoading } = useStageBriefing({
    stage: "design",
    variant: "entry",
    projectId: activeProjectId,
    projectSubject: subject,
    moduleCount: modules.length,
    enabled: !!activeProjectId && !!subject,
  })
  const { briefing: exitBriefing, isLoading: exitLoading } = useStageBriefing({
    stage: "design",
    variant: "exit",
    projectId: activeProjectId,
    projectSubject: subject,
    moduleCount: modules.length,
    enabled: modules.length > 0 && hasResearch,
  })

  // INTENT: Reset overviewApproved when switching projects. Then re-approve if the
  // loaded project already has modules (skip the gate for fully-built projects).
  // GOTCHA: handleLoadProject does NOT reset interviewPhase to "idle", so the
  // interviewPhase-based reset (below) won't fire on project switch.
  const prevProjectId = useRef(activeProjectId)
  useEffect(() => {
    if (activeProjectId !== prevProjectId.current) {
      prevProjectId.current = activeProjectId
      setOverviewApproved(modules.length > 0)
    }
  }, [activeProjectId, modules.length])

  // INTENT: If loading a saved project that already has modules, skip the approval gate.
  useEffect(() => {
    if (modules.length > 0 && !overviewApproved) {
      setOverviewApproved(true)
    }
  }, [modules.length, overviewApproved])

  // INTENT: Cross-origin URLs ignore the <a download> attribute.
  // Fetch as blob and create an object URL to force a real download.
  const handleDownloadFile = useCallback(async (url: string, filename: string) => {
    try {
      // SECURITY: Only allow downloads from our Supabase Storage domain
      const parsed = new URL(url)
      if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
        console.error("[Download] Blocked: URL not from allowed domain")
        return
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Download failed: ${res.status}`)
      const blob = await res.blob()
      // SECURITY: Sanitize filename — strip path separators and special chars
      const safeFilename = filename.replace(/[^a-zA-Z0-9_\-.\s]/g, "").slice(0, 100) || "download"
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objUrl
      a.download = safeFilename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objUrl)
    } catch (e) {
      console.error("[Download] Failed:", e)
    }
  }, [])

  // INTENT: Fetch engineering intelligence independently of research result.
  // Stringify array/object deps for stable identity (React compares by reference).
  const resStdCodesKey = JSON.stringify(researchResult?.standardCodes ?? [])
  const resIndustryDomain = researchResult?.industryDomain ?? null
  const resEngDataPoints = researchResult?.engineeringData?.totalDataPoints ?? 0

  type EngIntel = NonNullable<NonNullable<typeof researchResult>["engineeringData"]>
  type EngReportData = Awaited<ReturnType<typeof import("@/actions/design-standards").getEngineeringIntelligenceForReport>>
  const [liveEngData, setLiveEngData] = useState<EngIntel | undefined>(undefined)
  const [engReportData, setEngReportData] = useState<EngReportData | null>(null)
  const [showAllStandards, setShowAllStandards] = useState(false)
  const [showAllMaterials, setShowAllMaterials] = useState(false)
  useEffect(() => {
    if (!subject || subject.length < 3) return
    // Clear stale rich data from previous project/subject before fetching
    setEngReportData(null)
    setShowAllStandards(false)
    setShowAllMaterials(false)
    const resEngData = researchResult?.engineeringData
    if (resEngData && resEngDataPoints > 1 && resEngData.supplierTechniqueNames?.length) {
      // Cached data has everything including technique names — use it
      setLiveEngData(resEngData)
      return
    }
    if (resEngData && resEngDataPoints > 1) {
      // Cached data exists but lacks technique names — show it while fetching names
      setLiveEngData(resEngData)
      // Fall through to fetch technique names below
    }
    const stdCodes: string[] = JSON.parse(resStdCodesKey)
    let cancelled = false
    import("@/actions/design-standards").then(({ getEngineeringIntelligenceForReport }) =>
      getEngineeringIntelligenceForReport(stdCodes, resIndustryDomain, subject)
        .then(data => {
          if (cancelled) return
          setEngReportData(data)
          setLiveEngData({
            materialsApplied: data.materials.map(m => m.code),
            materialFamilies: data.materials.map(m => m.name),
            hardwareItemCount: data.hardwareCount,
            processesApplied: data.processes.map(p => p.displayName),
            supplierTechniques: data.supplierInsights?.length ?? 0,
            supplierTechniqueNames: data.supplierInsights?.map(s => `${s.technique} (${s.supplierCount} suppliers)`) ?? [],
            totalDataPoints: stdCodes.length + data.materials.length + data.hardwareCount + data.processes.length,
          })
        })
    ).catch(err => {
      console.warn("[THE-FORGE] Engineering data fetch failed (non-fatal):", err instanceof Error ? err.message : err)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, resStdCodesKey, resIndustryDomain, resEngDataPoints])

  // INTENT: Track hero image load failures via state instead of DOM mutation (avoids React error 418).
  const [heroImgError, setHeroImgError] = useState(false)
  useEffect(() => { setHeroImgError(false) }, [systemIllustrationUrl])

  // INTENT: Elapsed timer for illustration generation — prevents "frozen" UX on 30-60s Gemini calls.
  const [illustrationElapsed, setIllustrationElapsed] = useState(0)
  useEffect(() => {
    if (systemIllustrationStatus !== "generating") { setIllustrationElapsed(0); return }
    const t = setInterval(() => setIllustrationElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [systemIllustrationStatus])

  // INTENT: Elapsed timer for 3D generation — same UX pattern as illustration elapsed counter.
  const [tripoElapsed, setTripoElapsed] = useState(0)
  useEffect(() => {
    if (tripoPreviewStatus !== "generating") { setTripoElapsed(0); return }
    const t = setInterval(() => setTripoElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [tripoPreviewStatus])

  // INTENT: Auto-trigger Tripo when user switches to 3D tab and no preview yet.
  useEffect(() => {
    if (heroView === "3d" && tripoPreviewStatus === "idle") {
      handleGenerateTripoPreview()
    }
  }, [heroView, tripoPreviewStatus, handleGenerateTripoPreview])

  const allModulesRevealed = modules.length > 0 && revealedModuleIds.size >= modules.length

  // INTENT: Block "Continue to Specify" while checkpoints load OR have unacknowledged concerns.
  // Without the isCheckpointing guard, users could skip past the gate before results arrive.
  const canContinueToSpecify = allModulesRevealed && !isCheckpointing && !isRevising && !isGeneratingImages && systemIllustrationStatus !== "generating" && (() => {
    const entries = checkpoints ? Object.values(checkpoints) : []
    if (entries.length === 0) return true
    const hasConcerns = entries.some(
      (c) => c.sentiment === "cautious" || c.sentiment === "concerned",
    )
    return !hasConcerns || checkpointAcknowledged
  })()

  // Helper: open module detail dialog from flow diagram click
  const handleModuleClick = (moduleId: string): void => {
    setExpandedModuleId(expandedModuleId === moduleId ? null : moduleId)
  }

  // Retry image generation for a single failed module
  const handleRetryModule = useCallback((moduleId: string) => {
    const mod = modules.find((m) => m.id === moduleId)
    if (mod) handleGenerateModuleImages([mod])
  }, [modules, handleGenerateModuleImages])

  useRegisterScreenContext(
    useMemo(() => {
      const parts: string[] = []
      if (hasResearch) {
        parts.push(`Research complete for "${subject}".`)
        if (modules.length > 0) {
          parts.push(`${modules.length} sub-assemblies mapped.`)
        }
      } else if (isResearching) {
        parts.push(`Running research for "${subject}".`)
      } else {
        parts.push(`Viewing the CAD Lab concept stage.`)
        if (subject) parts.push(`Subject: "${subject}".`)
      }
      return {
        pageTitle: `The Forge — Concept${subject ? `: ${subject}` : ""}`,
        summary: parts.join(" "),
        entities:
          modules.length > 0
            ? modules.map((m) => ({
                type: "module",
                title: m.name,
                status: m.status === "generated" ? "CAD generated" : m.status === "failed" ? "generation failed" : "pending",
              }))
            : undefined,
      }
    }, [hasResearch, isResearching, subject, modules]),
  )

  // ── Tab navigation state ──
  const CONCEPT_TABS = useMemo(() => {
    const tabs = [{ id: "research", label: "Research" }]
    if (modules.length > 0) tabs.push({ id: "modules", label: "Modules" })
    if (modules.length > 0) tabs.push({ id: "images", label: "Images" })
    return tabs
  }, [modules.length])

  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState("research")

  // INTENT: Read tab from URL after hydration — avoids React #418.
  // useSearchParams() returns empty during SSR; reading in useState causes mismatch.
  useEffect(() => {
    const param = searchParams.get("tab")
    if (param && (param === "research" || ((param === "modules" || param === "images") && modules.length > 0))) {
      setActiveTab(param)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTabClick = useCallback((tabId: string) => {
    if (tabId === "modules") setModulesUnseen(false)
    setActiveTab(tabId)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tabId)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  // INTENT: Show a pulsing notification dot on the Modules tab when modules
  // first appear, instead of auto-switching tabs (which was disorienting).
  const [modulesUnseen, setModulesUnseen] = useState(false)
  const prevModuleCount = useRef(0)
  useEffect(() => {
    if (modules.length > 0 && prevModuleCount.current === 0) {
      setModulesUnseen(true)
    }
    prevModuleCount.current = modules.length
  }, [modules.length, prevModuleCount])

  // INTENT: Auto-trigger research after interview completes (or is skipped).
  // DECISION: Uses useEffect instead of calling handleResearch() in onComplete callback
  // because handleResearch closes over subject/designBrief — calling it synchronously
  // after setDesignBrief/setSubject would use stale values. The effect fires after React
  // commits the state updates, so handleResearch sees the correct enriched values.
  const interviewResearchFiredRef = useRef(false)
  const skippedSubjectRef = useRef<string | null>(null)
  useEffect(() => {
    if (interviewPhase === "complete" && !interviewResearchFiredRef.current && !isResearching && !hasResearch) {
      interviewResearchFiredRef.current = true
      // If subject was captured during onSkip, temporarily update subject state
      // so handleResearch's DOM read fallback also works
      if (skippedSubjectRef.current && !subject) {
        setSubject(skippedSubjectRef.current)
      }
      handleResearch()
    }
  }, [interviewPhase, isResearching, hasResearch, handleResearch, subject, setSubject])

  // Reset guards when interview resets to idle (e.g. handleReset)
  useEffect(() => {
    if (interviewPhase === "idle") {
      interviewResearchFiredRef.current = false
      setOverviewApproved(false)
    }
  }, [interviewPhase])

  // INTENT: Auto-trigger decomposition after user approves the product overview.
  // freshResearchRef is only set by handleResearch — loading a saved project won't trigger this.
  // DECISION: Gated on overviewApproved so the user reviews the research before
  // decomposition begins — prevents wasted compute on a bad research synthesis.
  useEffect(() => {
    if (freshResearchRef.current && overviewApproved && hasResearch && modules.length === 0 && !isDecomposing && activeProjectId) {
      freshResearchRef.current = false
      handleDecompose()
    }
  }, [freshResearchRef, overviewApproved, hasResearch, modules.length, isDecomposing, handleDecompose, activeProjectId])

  // INTENT: Reset freshResearchRef on unmount so navigating away and back
  // doesn't re-trigger auto-decompose. "Fresh research" means research that
  // completed in THIS mount cycle — not research from a previous session.
  // DECISION: Runs on unmount only. If research completes while user is away
  // (async in provider), handleResearch re-sets it to true, so auto-decompose
  // will correctly fire when the user returns.
  useEffect(() => {
    return () => { freshResearchRef.current = false }
  }, [freshResearchRef])

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

  // Fall back to research if modules tab is active but no modules exist
  useEffect(() => {
    if ((activeTab === "modules" || activeTab === "images") && modules.length === 0) {
      setActiveTab("research")
    }
  }, [activeTab, modules.length])

  return (
    <RenderErrorBoundary>
    <div className="space-y-6">
      {/* ── Reverse link to the product this design was promoted to, if any ── */}
      {activeProjectId && (
        <div className="flex items-center">
          <LinkedProductChip cadLabProjectId={activeProjectId} />
        </div>
      )}

      {/* ── Illustration style selector — pick the visual language up-front.
          Silent preference: the selection is persisted immediately but does
          not auto-regenerate. The hero card surfaces a "(Regenerate to apply)"
          hint when the stored preference differs from what was actually rendered. ── */}
      <IllustrationStyleSelector />

      {/* ── Primary input — always visible so the user sees what they're building ── */}
      <HeroSection
        subject={subject}
        setSubject={setSubject}
        referenceModel={referenceModel}
        isAnyLoading={isAnyLoading}
        isResearching={isResearching}
        hasResearch={hasResearch}
        onResearch={handleResearch}
        interviewPhase={interviewPhase}
        onStartInterview={() => setInterviewPhase("interviewing")}
        referenceImages={referenceImages}
        onReferenceImagesChange={setReferenceImages}
        referenceDocuments={referenceDocuments}
        onReferenceDocumentsChange={setReferenceDocuments}
      />

      {/* ── Max (CTO) entry briefing — always visible as stage owner ── */}
      <StageSpecialistCard
        specialistId={designMapping.specialistId}
        variant="entry"
        stageName="Design"
        briefing={entryBriefing}
        isLoading={entryLoading}
        onReconsider={() => {
          const q = typeof window !== "undefined"
            ? window.prompt("What do you want to reconsider about the design?", "")
            : null
          if (q && q.trim().length >= 20) {
            designIterationHostRef.current?.triggerManual(q.trim())
          } else if (q !== null) {
            toast.error("Tell us what you want to reconsider in at least 20 characters")
          }
        }}
      />

      {/* ── Design brief interview (Max CTO guided Q&A) ── */}
      <SafeAnimatePresence>
        {interviewPhase === "interviewing" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <DesignBriefInterview
              subject={subject}
              onComplete={(brief, enrichedSubject, _summary) => {
                setDesignBrief(brief)
                if (enrichedSubject) setSubject(enrichedSubject)
                setInterviewPhase("complete")
                // GOTCHA: Do NOT call handleResearch() here — it closes over
                // stale subject/designBrief. The useEffect below fires after
                // React commits the state updates with the correct values.
              }}
              onSkip={() => {
                const skippedSubject = subject
                setInterviewPhase("complete")
                skippedSubjectRef.current = skippedSubject
              }}
            />
          </motion.div>
        )}
      </SafeAnimatePresence>

      {/* ── Tab navigation — appears after research is complete ── */}
      {/* a11y: role=tablist + role=tab + arrow-key nav per ARIA APG */}
      {hasResearch && CONCEPT_TABS.length > 1 && (
        <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border overflow-x-auto">
          <div
            role="tablist"
            aria-label="Design stage sections"
            className="flex items-center gap-2"
          >
            {CONCEPT_TABS.map((tab, idx) => (
              <button
                key={tab.id}
                id={`design-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`design-panel-${tab.id}`}
                aria-label={tab.id === "modules" && modulesUnseen ? `${tab.label} (unread updates)` : undefined}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault()
                    const delta = e.key === "ArrowRight" ? 1 : -1
                    const nextIdx = (idx + delta + CONCEPT_TABS.length) % CONCEPT_TABS.length
                    const nextTab = CONCEPT_TABS[nextIdx]
                    handleTabClick(nextTab.id)
                    document.getElementById(`design-tab-${nextTab.id}`)?.focus()
                  } else if (e.key === "Home") {
                    e.preventDefault()
                    handleTabClick(CONCEPT_TABS[0].id)
                    document.getElementById(`design-tab-${CONCEPT_TABS[0].id}`)?.focus()
                  } else if (e.key === "End") {
                    e.preventDefault()
                    const last = CONCEPT_TABS[CONCEPT_TABS.length - 1]
                    handleTabClick(last.id)
                    document.getElementById(`design-tab-${last.id}`)?.focus()
                  }
                }}
                onClick={() => handleTabClick(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "bg-international-orange text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
                {tab.id === "modules" && modulesUnseen && (
                  <>
                    <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-international-orange animate-pulse" aria-hidden="true" />
                    <span className="sr-only"> (unread updates)</span>
                  </>
                )}
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
              <span className="hidden sm:inline">Download Engineering Report</span>
            </Button>
          </div>
        </nav>
      )}

      {/* ── Tab content ── */}
      {hasResearch && (
        <SafeAnimatePresence mode="wait">
          {/* ═══ Research tab ═══ */}
          {activeTab === "research" && (
            <motion.div key="research" role="tabpanel" id="design-panel-research" aria-labelledby="design-tab-research" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              {/* Product overview — always first */}
              {(productOverview || modules.length > 0 || isDecomposing) && (
                <ProductOverviewCard
                  overview={productOverview}
                  onSave={setProductOverview}
                  modelAudit={modelAudit}
                  overviewApproved={overviewApproved}
                  onApprove={modules.length === 0 && !isDecomposing ? () => {
                    setOverviewApproved(true)
                    // INTENT: Call handleDecompose directly — don't rely on the useEffect alone.
                    // If user navigated away and back, freshResearchRef is false (cleared on unmount),
                    // so the effect won't fire. Direct call ensures decomposition always starts.
                    // Clear the ref to prevent the effect from double-firing.
                    freshResearchRef.current = false
                    if (hasResearch && activeProjectId) handleDecompose()
                  } : undefined}
                  saveError={saveError}
                  isDecomposing={isDecomposing}
                />
              )}

              {/* ── Engineering Intelligence — standalone, always expanded ── */}
              {(() => {
                const engData = liveEngData ?? researchResult?.engineeringData
                const stdCodes = researchResult?.standardCodes
                const hasEngIntel = (stdCodes && stdCodes.length > 0) || (engData && engData.totalDataPoints > 0)
                if (!hasEngIntel) return null

                const parts: string[] = []
                if (stdCodes && stdCodes.length > 0) parts.push(`${stdCodes.length} design standard${stdCodes.length !== 1 ? "s" : ""}`)
                if (engData?.materialsApplied && engData.materialsApplied.length > 0) parts.push(`${engData.materialsApplied.length} verified material${engData.materialsApplied.length !== 1 ? "s" : ""}`)
                if (engData && engData.hardwareItemCount > 0) parts.push(`${engData.hardwareItemCount} hardware items`)
                if (engData?.processesApplied && engData.processesApplied.length > 0) parts.push(`${engData.processesApplied.length} manufacturing process${engData.processesApplied.length !== 1 ? "es" : ""}`)
                if (engData && engData.supplierTechniques > 0) parts.push(`${engData.supplierTechniques} supplier techniques`)

                return (
                  <Card>
                    <CardContent className="pt-5 pb-5 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-success shrink-0" />
                        <h3 className="text-sm font-semibold text-foreground">Engineering Intelligence</h3>
                        {parts.length > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            — {parts.join(", ")}
                          </span>
                        )}
                      </div>

                      {/* Standards — rich detail when report data available */}
                      {stdCodes && stdCodes.length > 0 && (
                        <div className="flex items-start gap-2">
                          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs font-medium text-foreground">Design Standards</p>
                            {engReportData?.standards && engReportData.standards.length > 0 ? (
                              <>
                                {engReportData.standards.slice(0, showAllStandards ? undefined : 3).map((std, i) => (
                                  <div key={`std-${i}`} className="text-[11px]">
                                    <span className="font-medium text-foreground">{std.code}</span>
                                    <span className="text-muted-foreground"> — {std.name}</span>
                                    {std.issuingBody && <span className="text-muted-foreground/70"> ({std.issuingBody})</span>}
                                  </div>
                                ))}
                                {engReportData.standards.length > 3 && (
                                  <button onClick={() => setShowAllStandards((p) => !p)} className="text-[11px] text-international-orange hover:underline min-h-[44px] sm:min-h-0 py-1">
                                    {showAllStandards ? "Show less" : `View all ${engReportData.standards.length}`}
                                  </button>
                                )}
                              </>
                            ) : (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {stdCodes.map((code, i) => (
                                  <span key={`std-${i}`} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-foreground max-w-[220px] truncate">
                                    {code}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Materials — rich detail when report data available */}
                      {engData?.materialsApplied && engData.materialsApplied.length > 0 && (
                        <div className="flex items-start gap-2">
                          <Layers className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs font-medium text-foreground">Material Properties</p>
                            {engReportData?.materials && engReportData.materials.length > 0 ? (
                              <>
                                {engReportData.materials.slice(0, showAllMaterials ? undefined : 3).map((mat, i) => (
                                  <div key={`mat-${i}`} className="text-[11px] flex flex-wrap items-center gap-x-2">
                                    <span className="font-medium text-foreground">{mat.code}</span>
                                    <span className="text-muted-foreground">{mat.name}</span>
                                    {mat.yieldStrength != null && <span className="text-muted-foreground">· {mat.yieldStrength} MPa</span>}
                                    {mat.costPerKg != null && <span className="text-muted-foreground">· £{(mat.costPerKg * 0.79).toFixed(2)}/kg</span>}
                                  </div>
                                ))}
                                {engReportData.materials.length > 3 && (
                                  <button onClick={() => setShowAllMaterials((p) => !p)} className="text-[11px] text-international-orange hover:underline min-h-[44px] sm:min-h-0 py-1">
                                    {showAllMaterials ? "Show less" : `View all ${engReportData.materials.length}`}
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {engData.materialsApplied.map((code, i) => (
                                    <span key={`mat-${i}`} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-foreground">
                                      {code}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {engData.materialFamilies.length > 0
                                    ? `${engData.materialFamilies.map(f => f.replace(/_/g, " ")).join(", ")} — verified handbook data`
                                    : "Verified handbook data"}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Hardware */}
                      {engData && engData.hardwareItemCount > 0 && (
                        <div className="flex items-start gap-2">
                          <Wrench className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground">Hardware Library</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {engReportData?.hardwareCount ?? engData.hardwareItemCount} standard components — bolts, nuts, washers, bearings with exact clearance holes and load ratings
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Processes — rich detail when report data available */}
                      {engData?.processesApplied && engData.processesApplied.length > 0 && (
                        <div className="flex items-start gap-2">
                          <Cog className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs font-medium text-foreground">Process Capabilities</p>
                            {engReportData?.processes && engReportData.processes.length > 0 ? (
                              engReportData.processes.map((proc, i) => (
                                <div key={`proc-${i}`} className="text-[11px] flex flex-wrap items-center gap-x-2">
                                  <span className="font-medium text-foreground">{proc.displayName}</span>
                                  {proc.toleranceTypical != null && <span className="text-muted-foreground">· ±{proc.toleranceTypical}mm</span>}
                                  {proc.minWall != null && <span className="text-muted-foreground">· {proc.minWall}mm min wall</span>}
                                </div>
                              ))
                            ) : (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {engData.processesApplied.map((name, i) => (
                                  <span key={`proc-${i}`} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-foreground">
                                    {name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Supplier Intelligence — rich detail when report data available */}
                      {engData && engData.supplierTechniques > 0 && (
                        <div className="flex items-start gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs font-medium text-foreground">Supplier Intelligence</p>
                            {engReportData?.supplierInsights && engReportData.supplierInsights.length > 0 ? (
                              engReportData.supplierInsights.map((si, i) => (
                                <div key={`si-${i}`} className="text-[11px]">
                                  <span className="font-medium text-foreground">{si.technique}</span>
                                  <span className="text-muted-foreground"> — {si.supplierCount} supplier{si.supplierCount !== 1 ? "s" : ""}</span>
                                  {si.tolerances && <span className="text-muted-foreground">, {si.tolerances}</span>}
                                </div>
                              ))
                            ) : engData.supplierTechniqueNames && engData.supplierTechniqueNames.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {engData.supplierTechniqueNames.map((name, i) => (
                                  <span key={`tech-${i}`} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-foreground">
                                    {name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {engData.supplierTechniques} manufacturing techniques enriched from real supplier data
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })()}

              {/* Known Challenges — surface failure modes and unknowns early */}
              {modules.length > 0 && (() => {
                const allFailures = modules.flatMap(m => (m.failureModes ?? []).map(f => ({ module: m.name, issue: f })))
                const allUnknowns = modules.flatMap(m => (m.unknowns ?? []).map(u => ({ module: m.name, issue: u })))
                if (allFailures.length === 0 && allUnknowns.length === 0) return null
                return (
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-1.5 mb-3">
                        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                        <h3 className="text-sm font-semibold text-foreground">Known Challenges</h3>
                        <span className="text-xs text-muted-foreground ml-1">— {allFailures.length + allUnknowns.length} items across {modules.length} modules</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {allFailures.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Failure Modes</p>
                            <div className="space-y-1">
                              {allFailures.map((f, i) => (
                                <p key={`f-${i}`} className="text-xs text-foreground"><span className="text-muted-foreground">{f.module}:</span> {f.issue}</p>
                              ))}
                            </div>
                          </div>
                        )}
                        {allUnknowns.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Open Questions</p>
                            <div className="space-y-1">
                              {allUnknowns.map((u, i) => (
                                <p key={`u-${i}`} className="text-xs text-foreground"><span className="text-muted-foreground">{u.module}:</span> {u.issue}</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })()}

              {/* During decomposition — rich progress below overview */}
              {!decompositionError && isDecomposing && (
                <CadLabProgress
                  lines={progressLines}
                  isActive={true}
                  operationType="breakdown"
                  subject={subject}
                />
              )}

              {/* "View Modules" banner — shown as soon as modules exist (not gated on system illustration) */}
              {modules.length > 0 && !isDecomposing && activeTab === "research" && (
                <Card className="border-international-orange/20 bg-international-orange-light/10">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-international-orange shrink-0" />
                        <p className="text-sm text-foreground">
                          {isGeneratingImages || systemIllustrationStatus === "generating"
                            ? `${modules.length} sub-assemblies mapped \u2014 generating illustrations (${modules.filter(m => m.imageStatus === "complete").length} of ${modules.length} ready)`
                            : `${modules.length} sub-assembly illustrations ready`}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-international-orange text-international-orange hover:bg-international-orange-light/20"
                        onClick={() => handleTabClick("modules")}
                      >
                        View Modules
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Module summary — shown during illustration generation so user sees what was found */}
              {modules.length > 0 && !isDecomposing && (isGeneratingImages || systemIllustrationStatus === "generating") && activeTab === "research" && (
                <Card className="border-border">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-international-orange shrink-0" />
                      <p className="text-sm font-medium text-foreground">
                        {modules.length} sub-assemblies identified
                      </p>
                    </div>
                    <div className="grid gap-1.5">
                      {modules.map((m, i) => (
                        <div key={m.id} className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0 w-4 text-right tabular-nums">{i + 1}.</span>
                          <div>
                            <span className="font-medium text-foreground">{m.name}</span>
                            <span className="text-muted-foreground"> — {m.purpose.slice(0, 80)}{m.purpose.length > 80 ? "..." : ""}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Generating engineering illustrations — {modules.filter(m => m.imageStatus === "complete").length} of {modules.length} ready. Each illustration coordinates manufacturing constraints, interfaces, and dimensional specs.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* System overview illustration — below modules so user reads text content first */}
              {hasResearch && (
                <>
                  {systemIllustrationUrl && systemIllustrationStatus === "complete" && (systemIllustrationConfidence === "low" || systemIllustrationConfidence === "unavailable") && (
                    <Card className={systemIllustrationConfidence === "low" ? "border-warning/40 bg-warning/5" : "border-info/40 bg-info/5"}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start gap-3">
                          {systemIllustrationConfidence === "low" ? (
                            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                          ) : (
                            <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 space-y-1.5">
                            <p className="text-sm font-medium text-foreground">
                              {systemIllustrationConfidence === "low"
                                ? "Low-confidence concept illustration"
                                : "Quality check unavailable"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {systemIllustrationConfidence === "low"
                                ? "A vision check flagged consistency or plausibility issues. Review before relying on this hero as a design reference."
                                : "The vision-based quality check couldn't run for this hero (temporary API issue or image-fetch hiccup). Review the render yourself before relying on it."}
                            </p>
                            {systemIllustrationConfidence === "low" && systemIllustrationIssues.length > 0 && (
                              <ul className="text-xs text-muted-foreground list-disc ml-4 space-y-0.5">
                                {systemIllustrationIssues.slice(0, 3).map((issue, i) => (
                                  <li key={i}>{issue}</li>
                                ))}
                              </ul>
                            )}
                            <div className="pt-1">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleRetryIllustration}
                                className="text-xs gap-1.5"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Regenerate
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {systemIllustrationUrl && systemIllustrationStatus === "complete" && (
                    <Card className="overflow-hidden">
                      {/* 2D/3D segmented toggle + download */}
                      <div className="flex items-center gap-1 p-2 bg-muted/30">
                        <button
                          onClick={() => setHeroView("2d")}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            heroView === "2d"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <ImageIcon className="h-3.5 w-3.5 inline mr-1" />
                          2D
                        </button>
                        <button
                          onClick={() => setHeroView("3d")}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            heroView === "3d"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Box className="h-3.5 w-3.5 inline mr-1" />
                          3D
                          {tripoPreviewStatus === "generating" && (
                            <Loader2 className="h-3 w-3 inline ml-1 animate-spin" />
                          )}
                        </button>
                        <div className="flex-1" />
                        {/* Style chip — shows what was rendered, plus a hint when the
                            stored preference has drifted and a regen is needed to apply it. */}
                        {heroView === "2d" && appliedIllustrationStyle && (
                          <span
                            className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-background border border-border text-muted-foreground"
                            title="Project-level illustration style used to render this hero"
                          >
                            Style: {getIllustrationStyleMeta(appliedIllustrationStyle).label}
                            {appliedIllustrationStyle !== illustrationStyle && (
                              <span className="text-international-orange">· regenerate to apply {getIllustrationStyleMeta(illustrationStyle).label}</span>
                            )}
                          </span>
                        )}
                        {heroView === "2d" && systemIllustrationUrl && (
                          <button
                            onClick={() => handleDownloadFile(systemIllustrationUrl, `${subject || "concept"}-illustration.png`)}
                            className="px-2 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Download</span>
                          </button>
                        )}
                        {heroView === "3d" && tripoPreviewStatus === "complete" && tripoPreviewUrl && (
                          <button
                            onClick={() => handleDownloadFile(tripoPreviewUrl, `${subject || "concept"}-3d-model.glb`)}
                            className="px-2 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Download GLB</span>
                          </button>
                        )}
                      </div>

                      <div className="aspect-[16/9] w-full bg-muted">
                        {heroView === "2d" ? (
                          heroImgError ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                            </div>
                          ) : (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={systemIllustrationUrl}
                              alt={`System overview: ${subject}`}
                              className="w-full h-full object-cover"
                              onError={() => setHeroImgError(true)}
                            />
                          )
                        ) : tripoPreviewStatus === "complete" && tripoPreviewUrl ? (
                          <ModelViewer glbUrl={tripoPreviewUrl} className="!border-0 !rounded-none w-full h-full" />
                        ) : tripoPreviewStatus === "generating" ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-international-orange" />
                            <p className="text-sm text-muted-foreground">Generating interactive 3D model from the system illustration...</p>
                            <span className="text-xs tabular-nums text-muted-foreground">{tripoElapsed}s</span>
                          </div>
                        ) : tripoPreviewStatus === "failed" ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                            <AlertTriangle className="h-6 w-6 text-muted-foreground/30" />
                            <p className="text-xs text-muted-foreground">{tripoPreviewError ?? "3D model generation failed — try again or use the 2D view"}</p>
                            <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={handleGenerateTripoPreview}>
                              <RotateCcw className="h-3 w-3" />
                              Retry
                            </Button>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/30" />
                          </div>
                        )}
                      </div>

                      <CardContent className="pt-4 pb-4">
                        <div>
                          <h2 className="text-base font-semibold text-foreground">{subject}</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            System overview — full research report available in the Specify stage.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* System illustration generating */}
                  {systemIllustrationStatus === "generating" && (
                    <Card className="overflow-hidden border-international-orange/20">
                      <div className="aspect-[16/9] w-full bg-muted animate-pulse" />
                      <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                          <span className="text-sm font-medium text-foreground">Generating concept illustration...</span>
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">{illustrationElapsed}s</span>
                      </CardContent>
                    </Card>
                  )}

                  {/* System illustration failed — show error with retry */}
                  {systemIllustrationStatus === "failed" && (
                    <Card className="overflow-hidden border-dashed">
                      <div className="aspect-[16/9] w-full bg-muted/30 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                          <span className="text-xs text-muted-foreground">
                            {systemIllustrationError ?? "Concept illustration unavailable"}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRetryIllustration}
                            className="text-xs gap-1.5"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* Decomposing placeholder — spinner while waiting for illustration to start */}
                  {systemIllustrationStatus === "idle" && isDecomposing && (
                    <Card className="overflow-hidden border-dashed border-muted-foreground/20">
                      <div className="aspect-[16/9] w-full bg-muted/30 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3 text-center px-6">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
                          <span className="text-xs text-muted-foreground">
                            Concept illustration will generate after module breakdown...
                          </span>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* Idle placeholder — only when NOT decomposing */}
                  {systemIllustrationStatus === "idle" && !decompositionError && !isDecomposing && (
                    <Card className="overflow-hidden border-dashed border-muted-foreground/20">
                      <div className="aspect-[16/9] w-full bg-muted/30 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3 text-center px-6">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                          {modules.length > 0 && !systemIllustrationUrl ? (
                            <>
                              <span className="text-xs text-muted-foreground">
                                Concept illustration not yet generated for this project.
                              </span>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleRetryIllustration}
                                className="text-xs gap-1.5"
                              >
                                <ImageIcon className="h-3.5 w-3.5" />
                                Generate concept illustration
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              System illustration will appear here after decomposition
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  )}
                </>
              )}

              {/* Recovery card — loaded project has research but no modules */}
              {hasResearch && modules.length === 0 && !isDecomposing && !decompositionError && activeProjectId && (
                <Card className="border-info/30 bg-info/5">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-start gap-3">
                      <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">This project has research but no module breakdown yet.</p>
                        <p className="text-sm text-muted-foreground">Generate modules to continue with decomposition and engineering illustrations.</p>
                      </div>
                    </div>
                    <Button onClick={handleDecompose} variant="secondary" size="sm">
                      Generate Modules
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Decomposition failed — persistent error card with retry */}
              {modules.length === 0 && !isDecomposing && decompositionError && (
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Sub-assembly mapping failed</p>
                        <p className="text-sm text-muted-foreground">{decompositionError}</p>
                      </div>
                    </div>
                    <Button onClick={handleDecompose} variant="secondary" size="sm">
                      Try again
                    </Button>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {/* ═══ Modules tab (text-only — no images, focused on reading) ═══ */}
          {activeTab === "modules" && modules.length > 0 && (
            <motion.div key="modules" role="tabpanel" id="design-panel-modules" aria-labelledby="design-tab-modules" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{modules.length} Sub-Assemblies</p>
                <Button variant="ghost" size="sm" onClick={() => handleTabClick("images")} className="gap-1.5 text-xs">
                  <ImageIcon className="h-3.5 w-3.5" />
                  View Illustrations
                </Button>
              </div>

              {/* Text-only module cards — no images, user can read everything */}
              <div className="grid gap-3">
                {modules.map((mod) => (
                  <Card key={mod.id}>
                    <CardContent className="pt-4 pb-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">{mod.name}</h4>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {mod.imageStatus === "complete" && <Badge variant="success" className="text-[10px]">Illustrated</Badge>}
                          {(!mod.keyParts || mod.keyParts.length === 0 || !mod.failureModes || mod.failureModes.length === 0) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs h-6 text-status-warning"
                              onClick={() => handleReExpandModule(mod.id)}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Incomplete — Retry
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{mod.purpose}</p>
                      {mod.description && <p className="text-xs text-foreground leading-relaxed">{mod.description}</p>}
                      {mod.whyItMatters && (
                        <div className="border-l-2 border-international-orange/30 pl-3 py-1">
                          <p className="text-xs text-muted-foreground italic">{mod.whyItMatters}</p>
                        </div>
                      )}
                      {mod.keyParts && mod.keyParts.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Key Components</p>
                          <div className="flex flex-wrap gap-1">
                            {mod.keyParts.map((part, i) => (
                              <span key={i} className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">{part}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {mod.failureModes && mod.failureModes.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Failure Modes</p>
                          <ul className="space-y-0.5">
                            {mod.failureModes.map((fm, i) => (
                              <li key={i} className="text-[11px] text-foreground flex items-start gap-1">
                                <AlertTriangle className="h-3 w-3 text-status-warning shrink-0 mt-0.5" />{fm}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(mod.inputs?.length > 0 || mod.outputs?.length > 0) && (
                        <div className="flex gap-4 text-[11px]">
                          {mod.inputs?.length > 0 && <span className="text-muted-foreground">In: {mod.inputs.join(", ")}</span>}
                          {mod.outputs?.length > 0 && <span className="text-muted-foreground">Out: {mod.outputs.join(", ")}</span>}
                        </div>
                      )}
                      {mod.leadWeeks > 0 && (
                        <Badge variant="secondary" className="text-[10px] gap-1"><Clock className="h-3 w-3" />{mod.leadWeeks} weeks lead</Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Process flow — how modules connect via inputs and outputs */}
              {isExtractingContracts && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-international-orange" />
                  Extracting interface contracts...
                </p>
              )}
              {modules.length > 1 && (
                <ModuleFlowCanvas
                  modules={modules}
                  onModuleClick={handleModuleClick}
                  interfaceContracts={interfaceContracts}
                  decompositionConnections={decompositionConnections}
                  generatingModuleIds={generatingModuleIds}
                  unmatchedPorts={unmatchedPorts}
                />
              )}

              {/* Specialist checkpoint — early feedback before generation */}
              {(isCheckpointing || (checkpoints && Object.keys(checkpoints).length > 0)) && (
                <DecompositionCheckpointCard
                  checkpoints={checkpoints}
                  isCheckpointing={isCheckpointing}
                  onAcknowledge={handleAcknowledgeCheckpoints}
                  acknowledged={checkpointAcknowledged}
                  isRevising={isRevising}
                  revisedModuleCount={revisedModuleIds.size}
                  designInfeasibility={designInfeasibility}
                  onReviseDesign={(concernText, specialists) => {
                    designIterationHostRef.current?.triggerInfeasibility(concernText, specialists)
                  }}
                />
              )}

              {/* Design iteration host — mounted here so it can be invoked from
                  the checkpoint card above + any future trigger surfaces. */}
              {activeProjectId && (
                <DesignIterationHost
                  ref={designIterationHostRef}
                  projectId={activeProjectId}
                  onApplied={() => {
                    // After apply: clear the infeasibility flag so the CTA
                    // disappears. The context's design_revision bump + image
                    // staleness handling happens server-side inside
                    // applyDesignIteration, so no further client state change
                    // is required beyond re-running whichever checkpoint step
                    // the founder next triggers.
                    clearDesignInfeasibility()
                  }}
                />
              )}

              {/* Checkpoint revision diffs — shown after modules are revised */}
              {revisedModuleIds.size > 0 && (
                <CheckpointRevisionDiffs modules={modules} revisedModuleIds={revisedModuleIds} />
              )}

              {/* Continue to Build CTA — gated on modules revealed + checkpoint acknowledgment */}
              {allModulesRevealed && !canContinueToSpecify && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Review specialist feedback above before continuing.
                </p>
              )}
              {canContinueToSpecify && (
                <StageSpecialistCard
                  specialistId={designMapping.specialistId}
                  variant="exit"
                  stageName="Design"
                  briefing={exitBriefing}
                  isLoading={exitLoading}
                  nextSpecialistId={nextDesign?.specialistId}
                  nextStageName={nextDesign?.stageLabel}
                  onProceed={() => router.push(FORGE_ROUTES.cadLabSpecify)}
                  proceedLabel="Continue to Specify"
                />
              )}
            </motion.div>
          )}

          {/* ═══ Images tab — all illustrations in one place ═══ */}
          {activeTab === "images" && modules.length > 0 && (
            <motion.div key="images" role="tabpanel" id="design-panel-images" aria-labelledby="design-tab-images" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {modules.filter(m => m.imageStatus === "complete").length} of {modules.length} illustrations
                </p>
                {(() => {
                  const hasStuck = modules.some(m => !m.imageStatus || m.imageStatus === "pending")
                  const hasFailed = modules.some(m => m.imageStatus === "failed")
                  if (isGeneratingImages || (!hasStuck && !hasFailed)) return null
                  return (
                    <Button variant="ghost" size="sm" onClick={handleRefreshModuleImages} className="gap-1.5 text-xs">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {hasStuck ? "Generate Illustrations" : "Retry Failed"}
                    </Button>
                  )
                })()}
              </div>

              {/* Image generation progress */}
              {(isGeneratingImages || systemIllustrationStatus === "generating") && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground">
                      Generating illustrations — {modules.filter(m => m.imageStatus === "complete").length} of {modules.length} ready
                    </p>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-international-orange rounded-full transition-all duration-500"
                        style={{ width: `${modules.length > 0 ? Math.round((modules.filter(m => m.imageStatus === "complete" || m.imageStatus === "failed").length / modules.length) * 100) : 0}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Module image grid */}
              <ModuleImageGrid
                modules={modules}
                revealedModuleIds={revealedModuleIds}
                expandedModuleId={expandedModuleId}
                onToggleExpand={(id) => setExpandedModuleId(expandedModuleId === id ? null : id)}
                onModuleSave={handleUpdateModule}
                onRetryModule={handleRetryModule}
                onReloadModule={handleReExpandModule}
                reloadingModuleIds={reExpandingModuleIds}
              />
            </motion.div>
          )}
        </SafeAnimatePresence>
      )}

      <DesignReportDialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen} stage="concept" />
    </div>
    </RenderErrorBoundary>
  )
}

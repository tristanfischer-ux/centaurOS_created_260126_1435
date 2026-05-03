"use client"

/**
 * @file build/page.tsx — The Forge: Build stage (Stage 2).
 *
 * @description Module decomposition, batch pipeline, per-module interface
 * definition and CAD generation. Shows live batch progress grid and
 * per-module results with SVG previews, metrics, and DFM analysis.
 *
 * Gate: redirects to /the-forge/cad-lab (Concept stage) if no research exists.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { SafeAnimatePresence } from "@/components/ui/safe-animate-presence"
import {
  Loader2,
  Box,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  RotateCcw,
  Check,
  Ruler,
  Download,
  Info,
  Play,
  ClipboardCheck,
  Clock,
  Puzzle,
  Search,
  FileText,
  Pencil,
  X,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CadLabWhileYouWait } from "@/components/cad/cad-lab-while-you-wait"
import { EmptyState } from "@/components/ui/empty-state"
import { ResearchSection } from "../components/research-section"
import { DesignIntakeForm } from "../components/design-intake-form"
import { RedlineDiff } from "../components/redline-diff"
import { buildRevisionItems } from "../components/checkpoint-revision-diffs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import type { CadLabResult } from "@/lib/cad-lab-types"

import { useRegisterScreenContext } from "@/contexts/screen-context"
import { AskSpecialistButton } from "@/components/specialists/ask-specialist-button"
import { ManufacturingInsightCard } from "@/components/cad/manufacturing-insight-card"
import { SpecialistReviewPanel } from "@/components/cad/specialist-review-panel"
import { ValidationSummary } from "@/components/cad/validation-summary"
import type { SpecialistReview } from "@/lib/cad-lab-types"
import { rateModuleQuality } from "@/actions/cad-lab-projects"
import { useCadLab } from "../cad-lab-context"
import { FullscreenOverlay } from "../cad-lab-utils"
import { ModuleCarousel } from "../components/module-carousel"
import { IntegrationView } from "../components/integration-view"
import { PreExecValidationAlerts } from "../components/pre-exec-validation-alerts"
import { ProductOverview } from "../components/product-overview-hero"
import { LinkedProductChip } from "../components/linked-product-chip"
import { ModuleResultsView, type ViewTab } from "../components/module-results-view"
import { SystemArchitecture } from "../components/system-architecture-graph"
import { CollapsibleSection } from "../components/collapsible-section"
import { FadeIn } from "../components/fade-in"
import { ConceptBuildDiff } from "../components/concept-build-diff"

// ─── Page Component ──────────────────────────────────────────────────

// INTENT: Build page is now behind a feature flag. When CAD generation is disabled,
// redirect to the Specify page which replaces Build in the new 4-stage pipeline.
const CAD_GENERATION_ENABLED = process.env.NEXT_PUBLIC_ENABLE_CAD_GENERATION === "true"

export default function CadLabBuildPage(): React.ReactNode {
  const router = useRouter()

  // Redirect to Specify when CAD generation is disabled
  useEffect(() => {
    if (!CAD_GENERATION_ENABLED) {
      router.replace(FORGE_ROUTES.cadLabSpecify)
    }
  }, [router])

  const {
    hasResearch, isAnyLoading, activeProjectId,
    subject, editableReport, setEditableReport,
    referenceModel,
    modelId, setModelId,
    designBrief, setDesignBrief,
    assumptionNotes, setAssumptionNotes,
    designReadinessPct,
    researchResult,
    showSources, setShowSources,
    handleReset, handleResearch,
    systemIllustrationUrl, systemIllustrationStatus,
    modules = [], expandedModuleId, setExpandedModuleId,
    generatingModuleIds,
    isDecomposing, handleDecompose,
    handleModuleGenerate, handleGenerateSingleModule, handleGenerateAllModules,
    isBatchRunning, batchProgress,
    generatedModuleCount,
    diagnosticAnswers,
    diagCompletedCount,
    integratedAssemblyStlUrl,
    isIntegrating,
    integrationError,
    integrationAssemblyCode,
    setIntegrationError,
    handleGenerateIntegration,
    handleDownload,
    handleUpdateModule,
    earlyCostEstimates,
    referenceImages, setReferenceImages,
    referenceDocuments, setReferenceDocuments,
  } = useCadLab()

  // Local UI state for result viewing
  const [activeViewTab, setActiveViewTab] = useState<ViewTab>("3d")
  const [fullscreenView, setFullscreenView] = useState<string | null>(null)
  const [viewingModuleId, setViewingModuleId] = useState<string | null>(null)
  const [showCodeSet, setShowCodeSet] = useState<Set<string>>(new Set())
  const [codeCopied, setCodeCopied] = useState(false)
  const [isConfirmRemapOpen, setIsConfirmRemapOpen] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string } | null>(null)
  const [editingSpecModuleId, setEditingSpecModuleId] = useState<string | null>(null)
  const [specDraft, setSpecDraft] = useState("")

  // P4: Quality ratings — keyed by moduleId → "good" | "bad"
  const [qualityRatings, setQualityRatings] = useState<Record<string, "good" | "bad">>({})
  const handleQualityRate = useCallback(async (moduleId: string, rating: "good" | "bad") => {
    if (!activeProjectId) return
    setQualityRatings((prev) => ({ ...prev, [moduleId]: rating }))
    await rateModuleQuality(activeProjectId, moduleId, rating)
  }, [activeProjectId])

  // Specialist reviews — lifted to context for persistence across navigation
  const { moduleReviews, handleReviewComplete, pendingReviewKeys, markReviewPending, clearReviewPending } = useCadLab()

  // Register screen context so specialists can see what the user is working on
  useRegisterScreenContext(
    useMemo(() => {
      if (!hasResearch) return null
      const parts: string[] = [`Viewing the Build stage for "${subject}".`]
      parts.push(`${modules.length} sub-assemblies decomposed.`)
      parts.push(`${generatedModuleCount} of ${modules.length} modules have generated CAD.`)
      if (isBatchRunning) parts.push("Batch generation is currently running.")
      // Design brief summary
      const briefParts: string[] = []
      if (designBrief.useCase) briefParts.push(`Use case: ${designBrief.useCase}`)
      if (designBrief.targetProcess) briefParts.push(`Process: ${designBrief.targetProcess}`)
      if (designBrief.targetMaterial) briefParts.push(`Material: ${designBrief.targetMaterial}`)
      if (briefParts.length > 0) parts.push(`Design brief: ${briefParts.join(", ")}.`)
      // Risk summary
      const totalFailureModes = modules.reduce((s, m) => s + m.failureModes.length, 0)
      const totalUnknowns = modules.reduce((s, m) => s + m.unknowns.length, 0)
      const totalDfmIssues = modules.reduce((s, m) => {
        const r = m.result as CadLabResult | undefined
        return s + (r?.dfm?.issues?.length ?? 0)
      }, 0)
      if (totalFailureModes + totalUnknowns + totalDfmIssues > 0) {
        parts.push(`Risks: ${totalFailureModes} failure modes, ${totalUnknowns} unknowns, ${totalDfmIssues} DFM issues.`)
      }
      if (integratedAssemblyStlUrl) parts.push("Integration assembly generated.")
      return {
        pageTitle: `The Forge — Build: ${subject}`,
        summary: parts.join(" "),
        entities: modules.map((m) => ({
          type: "module",
          title: m.name,
          status:
            m.status === "generated"
              ? "CAD generated"
              : m.status === "interface_ready"
                ? "dimensions planned"
                : m.status === "failed"
                  ? "generation failed"
                  : "pending",
        })),
      }
    }, [hasResearch, subject, modules, generatedModuleCount, isBatchRunning, designBrief, integratedAssemblyStlUrl]),
  )

  const handleCopyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch (err) {
      console.error("[CAD-LAB] Failed to copy code:", err)
    }
  }, [])

  // Get the module being viewed in fullscreen
  const viewingModule = viewingModuleId ? modules.find((m) => m.id === viewingModuleId) : null
  const viewingResult = viewingModule?.result as CadLabResult | undefined

  // ── Tab navigation for Build page ──
  const BUILD_TABS = useMemo(() => {
    const tabs: { id: string; label: string; sections: { id: string; label: string }[] }[] = [
      { id: "overview", label: "Overview", sections: [{ id: "build-overview", label: "Product" }, { id: "build-research", label: "Research" }] },
      { id: "manufacturing", label: "Manufacturing", sections: [{ id: "build-mfg-context", label: "Context" }] },
    ]
    if (modules.length > 0) {
      tabs.push({ id: "architecture", label: "Architecture", sections: [{ id: "build-architecture", label: "System Graph" }] })
      tabs.push({ id: "modules", label: "Modules", sections: [{ id: "build-modules", label: "Module List" }] })
    }
    return tabs
  }, [modules.length])

  const searchParams = useSearchParams()
  const validTabIds = useMemo(() => BUILD_TABS.map((t) => t.id), [BUILD_TABS])
  const [activeTab, setActiveTab] = useState("overview")

  // INTENT: Read tab from URL after hydration — avoids React #418.
  // useSearchParams() returns empty during SSR; reading in useState causes mismatch.
  useEffect(() => {
    const param = searchParams.get("tab")
    if (param && validTabIds.includes(param)) {
      setActiveTab(param)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const tabContentRef = useRef<HTMLDivElement>(null)

  // Fallback to "overview" if active tab becomes hidden (e.g. modules removed)
  useEffect(() => {
    if (!validTabIds.includes(activeTab)) setActiveTab("overview")
  }, [validTabIds, activeTab])

  const handleTabClick = useCallback((tabId: string) => {
    setActiveTab(tabId)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tabId)
    router.replace(`?${params.toString()}`, { scroll: false })
    tabContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [router, searchParams])

  if (!hasResearch) {
    return (
      <div className="py-12">
        <EmptyState
          title="Concept stage not completed"
          description="Complete the Concept stage to identify modules and sub-assemblies for your design."
          action={
            <Button onClick={() => router.push(FORGE_ROUTES.cadLab)} className="gap-1.5">
              <Search className="h-4 w-4" />
              Go to Concept
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Tab navigation ── */}
      <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border overflow-x-auto">
        <div className="flex items-center gap-2">
          {BUILD_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "bg-international-orange text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <AskSpecialistButton
              context={{
                type: "general",
                title: subject,
                description: "Product in Build stage of The Forge CAD Lab",
                metadata: {
                  status: isBatchRunning ? "batch generating" : `${generatedModuleCount}/${modules.length} generated`,
                  notes: [
                    designBrief.useCase && `Use case: ${designBrief.useCase}`,
                    designBrief.targetProcess && `Process: ${designBrief.targetProcess}`,
                    designBrief.targetMaterial && `Material: ${designBrief.targetMaterial}`,
                    `${modules.reduce((s, m) => s + m.failureModes.length, 0)} failure modes, ${modules.reduce((s, m) => s + m.unknowns.length, 0)} unknowns`,
                  ].filter(Boolean).join(". "),
                },
              }}
              specialistId="cto"
              specialistName="Max"
              variant="chip"
              label="Ask Max about design"
            />
            <AskSpecialistButton
              context={{
                type: "general",
                title: subject,
                description: "Product in Build stage — DFM and manufacturing questions",
                metadata: {
                  status: `${generatedModuleCount}/${modules.length} modules generated`,
                  notes: [
                    designBrief.targetProcess && `Target process: ${designBrief.targetProcess}`,
                    designBrief.targetMaterial && `Target material: ${designBrief.targetMaterial}`,
                    `${modules.length} sub-assemblies`,
                  ].filter(Boolean).join(". "),
                },
              }}
              specialistId="vp-manufacturing"
              specialistName="Fang"
              variant="chip"
              label="Ask Fang about DFM"
            />
          </div>
        </div>
      </nav>

      {/* ── Tab content ── */}
      <div ref={tabContentRef} className="space-y-6">
        <SafeAnimatePresence mode="wait">
          {/* ── Overview tab ── */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              {/* Reverse link: if this design was promoted to a product, surface the link here. */}
              {activeProjectId && (
                <div className="flex items-center">
                  <LinkedProductChip cadLabProjectId={activeProjectId} />
                </div>
              )}
              {modules.length > 0 && (
                <ProductOverview
                  subject={subject}
                  report={editableReport}
                  modules={modules}
                  moduleCount={modules.length}
                  totalComponents={modules.reduce((s, m) => s + m.keyParts.length, 0)}
                  criticalPathWeeks={Math.max(...modules.map((m) => m.leadWeeks))}
                  totalRisks={modules.reduce((s, m) => s + m.failureModes.length, 0)}
                  totalUnknowns={modules.reduce((s, m) => s + m.unknowns.length, 0)}
                  systemIllustrationUrl={systemIllustrationUrl}
                />
              )}
              {hasResearch && (
                <CollapsibleSection
                  title="Research Report"
                  subtitle={editableReport
                    ? editableReport.slice(0, 100).replace(/\n/g, " ").trim() + (editableReport.length > 100 ? "…" : "")
                    : "Market analysis and technical overview"}
                  icon={<FileText className="h-4 w-4" />}
                  defaultOpen={modules.length === 0}
                >
                  <ResearchSection
                    hasResearch={hasResearch}
                    isAnyLoading={isAnyLoading}
                    researchResult={researchResult}
                    editableReport={editableReport}
                    setEditableReport={setEditableReport}
                    showSources={showSources}
                    setShowSources={setShowSources}
                    handleReset={handleReset}
                    onRetryResearch={handleResearch}
                    systemIllustrationUrl={systemIllustrationUrl}
                    systemIllustrationStatus={systemIllustrationStatus}
                  />
                </CollapsibleSection>
              )}
            </motion.div>
          )}

          {/* ── Manufacturing tab ── */}
          {activeTab === "manufacturing" && (
            <motion.div key="manufacturing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              <CollapsibleSection
                title="Manufacturing Context"
                subtitle={
                  designBrief.useCase && designBrief.targetProcess && designBrief.targetMaterial
                    ? `${designBrief.targetProcess} · ${designBrief.targetMaterial} · ${designBrief.useCase}`
                    : "Process, material, tolerance, and compliance preferences"
                }
                icon={<Ruler className="h-4 w-4" />}
                defaultOpen
              >
                <DesignIntakeForm
                  modelId={modelId}
                  setModelId={setModelId}
                  designBrief={designBrief}
                  setDesignBrief={setDesignBrief}
                  assumptionNotes={assumptionNotes}
                  setAssumptionNotes={setAssumptionNotes}
                  designReadinessPct={designReadinessPct}
                  isAnyLoading={isAnyLoading}
                  referenceImages={referenceImages}
                  onReferenceImagesChange={setReferenceImages}
                  referenceDocuments={referenceDocuments}
                  onReferenceDocumentsChange={setReferenceDocuments}
                />
              </CollapsibleSection>
            </motion.div>
          )}

          {/* ── Architecture tab ── */}
          {activeTab === "architecture" && modules.length > 0 && (
            <motion.div key="architecture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              <SystemArchitecture
                subject={subject}
                modules={modules}
                earlyCostEstimates={earlyCostEstimates}
                onModuleClick={(moduleId) => {
                  // Cross-tab navigation: switch to Modules tab + expand module
                  setExpandedModuleId(moduleId)
                  handleTabClick("modules")
                  setTimeout(() => {
                    document.getElementById(`module-${moduleId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }, 200)
                }}
              />
            </motion.div>
          )}

          {/* ── Modules tab ── */}
          {activeTab === "modules" && (
            <motion.div key="modules" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              {/* Integration: combined system assembly (when all modules generated) */}
              {modules.length > 0 && generatedModuleCount === modules.length && (
                <IntegrationView
                  allModulesGenerated
                  referenceModel={referenceModel ?? null}
                  integratedAssemblyStlUrl={integratedAssemblyStlUrl}
                  isIntegrating={isIntegrating}
                  onGenerateIntegration={handleGenerateIntegration}
                  integrationError={integrationError}
                  onClearError={() => setIntegrationError(null)}
                  assemblyCode={integrationAssemblyCode}
                />
              )}

              {/* All modules generated celebration */}
              {generatedModuleCount > 0 && generatedModuleCount === modules.length && (
                <div className="rounded-xl border border-status-success/30 bg-gradient-to-r from-status-success-light/20 via-background to-status-info-light/10 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-full bg-status-success-light flex items-center justify-center">
                      <Zap className="h-6 w-6 text-status-success" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-3">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">All {modules.length} Modules Generated</h3>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs mt-2"
                          onClick={() => {
                            for (const mod of modules) {
                              const r = mod.result as CadLabResult | undefined
                              if (!r) continue
                              if (r.stepData) handleDownload(`${mod.name}.step`, r.stepData, false)
                              else if (r.stepUrl) {
                                const link = document.createElement("a")
                                link.href = r.stepUrl
                                link.download = `${mod.name}.step`
                                link.click()
                              }
                              if (r.stlData) handleDownload(`${mod.name}.stl`, r.stlData, true)
                              else if (r.stlUrl) {
                                const link = document.createElement("a")
                                link.href = r.stlUrl
                                link.download = `${mod.name}.stl`
                                link.click()
                              }
                            }
                          }}
                        >
                          <Download className="h-3 w-3" />
                          Download All STEP + STL
                        </Button>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Your product is manufacturing-ready. Continue to the Review stage for supplier-ready documentation and expert matching.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="default" size="sm" className="gap-1.5 text-xs" onClick={() => router.push(FORGE_ROUTES.cadLabSpecify)}>
                          <ClipboardCheck className="h-3 w-3" /> Continue to Specify
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Partial completion with failures */}
              {generatedModuleCount > 0 && generatedModuleCount < modules.length && (
                <div className="rounded-xl border border-warning/30 bg-gradient-to-r from-warning/10 via-background to-info-light/10 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-full bg-warning/20 flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6 text-warning" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-3">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          {generatedModuleCount} of {modules.length} Modules Generated
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Some modules failed during generation. You can proceed to Review with available modules or retry the failed ones.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs mt-2"
                          onClick={() => {
                            for (const mod of modules.filter(m => m.status === "generated")) {
                              const r = mod.result as CadLabResult | undefined
                              if (!r) continue
                              if (r.stepData) handleDownload(`${mod.name}.step`, r.stepData, false)
                              else if (r.stepUrl) {
                                const link = document.createElement("a")
                                link.href = r.stepUrl
                                link.download = `${mod.name}.step`
                                link.click()
                              }
                              if (r.stlData) handleDownload(`${mod.name}.stl`, r.stlData, true)
                              else if (r.stlUrl) {
                                const link = document.createElement("a")
                                link.href = r.stlUrl
                                link.download = `${mod.name}.stl`
                                link.click()
                              }
                            }
                          }}
                        >
                          <Download className="h-3 w-3" />
                          Download Generated ({generatedModuleCount})
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="default" size="sm" className="gap-1.5 text-xs" onClick={() => router.push(FORGE_ROUTES.cadLabSpecify)}>
                          <ClipboardCheck className="h-3 w-3" /> Continue to Specify
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs border-warning/40 text-warning hover:bg-warning/20"
                          onClick={handleGenerateAllModules}
                          disabled={isAnyLoading}
                        >
                          <RotateCcw className="h-3 w-3" /> Retry Failed Modules
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sticky Generate All action bar */}
              {modules.length > 0 && modules.some((m) => m.status !== "generated") && (
                <div className="sticky top-[52px] z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {generatedModuleCount} of {modules.length} modules generated
                        {Object.keys(earlyCostEstimates).length > 0 && (() => {
                          const estimates = Object.values(earlyCostEstimates)
                          const totalLow = estimates.reduce((s, e) => s + e.totalLow, 0)
                          const totalHigh = estimates.reduce((s, e) => s + e.totalHigh, 0)
                          return (
                            <span className="font-mono ml-2" title="Rough system cost estimate from interface specs">
                              ~${Math.round(totalLow)} – ${Math.round(totalHigh)}
                            </span>
                          )
                        })()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button onClick={handleGenerateAllModules} disabled={isAnyLoading} size="sm" className="gap-1.5">
                        {isBatchRunning ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating...</>
                        ) : (
                          <><Play className="h-3.5 w-3.5" />Generate All Modules</>
                        )}
                      </Button>
                      <span className="text-xs text-muted-foreground hidden sm:block">~2-5 min</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Module carousel during batch generation */}
              {modules.length > 0 && isBatchRunning && (
        <ModuleCarousel
          modules={modules}
          batchProgress={batchProgress}
          isBatchRunning={isBatchRunning}
          generatingModuleIds={generatingModuleIds}
          onGenerate={handleGenerateSingleModule}
          onViewResult={(moduleId) => setExpandedModuleId(moduleId)}
          autoAdvanceOnGenerate
        />
      )}

      {/* ── Module Decomposition ── */}
      <Card id="build-modules">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Box className="h-4 w-4" />
            Module Breakdown
            {modules.length > 0 && (
              <span className="text-xs font-normal text-status-success flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {modules.length} modules
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your sub-assemblies from the Concept stage are ready for CAD generation. Each module gets parametric code, dimension planning, and DFM analysis.
          </p>
          <div className="flex items-center gap-2">
            {modules.length > 0 ? (
              <Button
                onClick={() => setIsConfirmRemapOpen(true)}
                disabled={isAnyLoading || isDecomposing}
                variant="secondary"
              >
                {isDecomposing ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Mapping sub-assemblies...</>
                ) : (
                  <><RotateCcw className="h-4 w-4 mr-2" />Re-map Modules</>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => router.push(FORGE_ROUTES.cadLab)}
                variant="outline"
              >
                <Search className="h-4 w-4 mr-2" />Go to Concept
              </Button>
            )}
            {modules.length > 0 && modules.some((m) => m.status !== "generated") && (
              <div className="flex items-center gap-2">
                <Button onClick={handleGenerateAllModules} disabled={isAnyLoading} variant="default">
                  {isBatchRunning ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating All...</>
                  ) : (
                    <><Play className="h-4 w-4 mr-2" />Generate All Modules</>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">~2-5 min</span>
              </div>
            )}
          </div>

          {/* Batch progress grid — real per-module pipeline tracking */}
          {Object.keys(batchProgress).length > 0 && (
            <div className="space-y-3">
              {/* Completion counter */}
              {(() => {
                const doneCount = Object.values(batchProgress).filter((s) => s === "done").length
                const totalCount = Object.keys(batchProgress).length
                const activeCount = Object.values(batchProgress).filter((s) => s === "generating" || s === "interface").length
                const errorCount = Object.values(batchProgress).filter((s) => s === "error").length
                return (
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        {doneCount} of {totalCount} modules complete
                      </span>
                      {activeCount > 0 && (
                        <span className="text-xs text-international-orange flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {activeCount} generating...
                        </span>
                      )}
                      {errorCount > 0 && (
                        <span className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {errorCount} failed
                        </span>
                      )}
                    </div>
                    {/* Overall progress bar */}
                    <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-status-success rounded-full transition-all duration-500"
                        style={{ width: `${(doneCount / totalCount) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })()}

              {/* Per-module status rows */}
              {modules.map((mod, idx) => {
                const status = batchProgress[mod.id] || "queued"
                const stepIndex = status === "queued" ? 0 : status === "interface" ? 1 : status === "generating" ? 2 : status === "done" ? 3 : 0
                const isError = status === "error"
                const isActive = status === "interface" || status === "generating"
                const isDone = status === "done"

                return (
                  <div
                    key={mod.id}
                    className={`border rounded-lg p-3 transition-all duration-300 cursor-pointer hover:shadow-sm ${
                      isActive ? "border-international-orange/40 bg-gradient-to-r from-international-orange-light/10 to-background" :
                      isDone ? "border-status-success/30 bg-status-success-light/10" :
                      isError ? "border-destructive/30 bg-status-error-light/10" :
                      "border-muted bg-muted/10"
                    }`}
                    onClick={() => setExpandedModuleId(expandedModuleId === mod.id ? null : mod.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* Module info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {mod.imageUrl && mod.imageStatus === "complete" && (
                          <div className="h-7 w-7 rounded overflow-hidden bg-muted flex-shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mod.imageUrl} alt="" className="h-full w-full object-cover" />
                          </div>
                        )}
                        <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold flex-shrink-0 ${
                          isDone ? "bg-status-success text-white" :
                          isActive ? "bg-international-orange text-white" :
                          isError ? "bg-destructive text-white" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {isDone ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : isActive ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isError ? (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          ) : (
                            idx + 1
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${
                            isActive ? "text-foreground" :
                            isDone ? "text-status-success" :
                            isError ? "text-destructive" :
                            "text-muted-foreground"
                          }`}>
                            {mod.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{mod.purpose}</p>
                        </div>
                      </div>

                      {/* Pipeline steps — Interface → CAD → Done */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Step 1: Interface */}
                        <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          stepIndex > 1 ? "bg-status-success-light text-status-success" :
                          stepIndex === 1 ? "bg-international-orange-light text-international-orange" :
                          isError ? "bg-status-error-light text-destructive" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {stepIndex > 1 ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : stepIndex === 1 ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Ruler className="h-3 w-3" />
                          )}
                          Interface
                        </div>

                        <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />

                        {/* Step 2: CAD */}
                        <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          stepIndex > 2 ? "bg-status-success-light text-status-success" :
                          stepIndex === 2 ? "bg-international-orange-light text-international-orange" :
                          isError && stepIndex >= 2 ? "bg-status-error-light text-destructive" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {stepIndex > 2 ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : stepIndex === 2 ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Box className="h-3 w-3" />
                          )}
                          CAD
                        </div>

                        <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />

                        {/* Step 3: Complete */}
                        <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          isDone ? "bg-status-success-light text-status-success" :
                          isError ? "bg-status-error-light text-destructive" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {isDone ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : isError ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <Zap className="h-3 w-3" />
                          )}
                          {isDone ? "Done" : isError ? "Error" : "Ready"}
                        </div>
                      </div>

                      {/* Status label + expand/collapse hint */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-xs font-medium ${
                          isDone ? "text-status-success" :
                          isActive ? "text-international-orange" :
                          isError ? "text-destructive" :
                          "text-muted-foreground"
                        }`}>
                          {isDone ? "Complete" :
                           status === "interface" ? "Planning dims..." :
                           status === "generating" ? "Building CAD..." :
                           isError ? "Failed" :
                           "In queue"}
                        </span>
                        {expandedModuleId === mod.id
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </div>
                    </div>

                    {/* Progress bar for active modules */}
                    {isActive && (
                      <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-international-orange rounded-full animate-pulse" style={{ width: status === "interface" ? "35%" : "70%" }} />
                      </div>
                    )}

                    {/* Retry button for failed modules */}
                    {isError && !isBatchRunning && (
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs text-destructive">Generation failed. You can retry this module individually.</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={generatingModuleIds.has(mod.id) || isBatchRunning}
                          onClick={(e) => { e.stopPropagation(); handleGenerateSingleModule(mod.id) }}
                        >
                          <RotateCcw className="h-3 w-3" /> Retry
                        </Button>
                      </div>
                    )}

                    {/* Expanded module detail — readable while CAD generates */}
                    {expandedModuleId === mod.id && (
                      <div className="border-t mt-3 pt-3 space-y-4" onClick={(e) => e.stopPropagation()}>
                        {/* Blueprint illustration from Concept stage — click to zoom */}
                        {mod.imageUrl && mod.imageStatus === "complete" && (
                          <button
                            type="button"
                            className="aspect-[3/2] w-full max-w-md rounded-lg overflow-hidden bg-muted border cursor-zoom-in hover:ring-2 hover:ring-international-orange/30 transition-shadow text-left"
                            onClick={() => setLightboxImage({ url: mod.imageUrl!, alt: `Concept blueprint: ${mod.name}` })}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={mod.imageUrl}
                              alt={`Concept blueprint: ${mod.name}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <p className="text-[10px] text-muted-foreground text-center py-1 bg-muted/50">Click to zoom</p>
                          </button>
                        )}

                        {/* Description */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                          <p className="text-sm text-foreground">{mod.description}</p>
                        </div>

                        {/* Why This Module Matters */}
                        {mod.whyItMatters && (
                          <div className="border-l-2 border-international-orange pl-3">
                            <p className="text-xs font-semibold text-foreground mb-0.5">Why This Module Matters</p>
                            <p className="text-sm text-muted-foreground">{mod.whyItMatters}</p>
                          </div>
                        )}

                        {/* What the AI Assumed */}
                        {((mod.result?.assumptions && mod.result.assumptions.length > 0) || (mod.result?.validationWarnings && mod.result.validationWarnings.length > 0)) && (
                          <div className="border rounded-lg p-3 space-y-2 bg-status-info-light/10">
                            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
                              What the AI Assumed — Validate Before Sending to Factory
                            </p>
                            {mod.result?.assumptions && mod.result.assumptions.length > 0 && (
                              <ul className="space-y-1.5">
                                {mod.result.assumptions.map((assumption, aIdx) => (
                                  <li key={aIdx} className="text-xs text-foreground flex items-start gap-1.5">
                                    <Info className="h-3 w-3 text-status-info flex-shrink-0 mt-0.5" />
                                    <span>The AI assumed: <span className="font-medium">{assumption}</span> — is this correct for your use case?</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {mod.result?.validationWarnings && mod.result.validationWarnings.length > 0 && (
                              <ul className="space-y-1.5">
                                {mod.result.validationWarnings.map((warning, wIdx) => (
                                  <li key={wIdx} className="text-xs text-status-warning-dark flex items-start gap-1.5">
                                    <AlertTriangle className="h-3 w-3 text-status-warning flex-shrink-0 mt-0.5" />{warning}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {/* Manufacturing Questions */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Questions for Your Factory</p>
                          <ManufacturingInsightCard moduleAnswers={diagnosticAnswers?.[mod.id]} />
                        </div>

                        {/* Pre-execution Validator Findings — QW5 */}
                        {mod.result?.preExecValidation && mod.result.preExecValidation.length > 0 && (
                          <PreExecValidationAlerts findings={mod.result.preExecValidation} />
                        )}

                        {/* Design Validation */}
                        {(mod.status === "generated" || mod.result) && (
                          <ValidationSummary
                            module={mod}
                            diagnostics={diagnosticAnswers?.[mod.id]}
                          />
                        )}

                        {/* IO Flow */}
                        <div className="flex items-center gap-4 text-xs">
                          <div>
                            <p className="font-semibold text-muted-foreground mb-1">Inputs</p>
                            {mod.inputs.map((inp, iIdx) => (
                              <span key={iIdx} className="inline-block bg-muted px-2 py-0.5 rounded mr-1 mb-1 font-mono">{inp}</span>
                            ))}
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="font-semibold text-muted-foreground mb-1">Outputs</p>
                            {mod.outputs.map((out, oIdx) => (
                              <span key={oIdx} className="inline-block bg-muted px-2 py-0.5 rounded mr-1 mb-1 font-mono">{out}</span>
                            ))}
                          </div>
                        </div>

                        {/* Key Parts */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Key Components</p>
                          <div className="flex flex-wrap gap-1.5">
                            {mod.keyParts.map((part, pIdx) => (
                              <span key={pIdx} className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{part}</span>
                            ))}
                          </div>
                        </div>

                        {/* Risks & Unknowns */}
                        {(mod.failureModes.length > 0 || mod.unknowns.length > 0) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {mod.failureModes.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Failure Modes</p>
                                <ul className="space-y-1">
                                  {mod.failureModes.map((fm, fIdx) => (
                                    <li key={fIdx} className="text-xs text-foreground flex items-start gap-1.5">
                                      <AlertTriangle className="h-3 w-3 text-status-warning flex-shrink-0 mt-0.5" />{fm}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {mod.unknowns.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Unknowns</p>
                                <ul className="space-y-1">
                                  {mod.unknowns.map((u, uIdx) => (
                                    <li key={uIdx} className="text-xs text-foreground flex items-start gap-1.5">
                                      <Info className="h-3 w-3 text-status-info flex-shrink-0 mt-0.5" />{u}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Dimensional Specification */}
                        {mod.interfaceDefinition && (
                          <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
                            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <Ruler className="h-3.5 w-3.5 text-international-orange" />
                              Dimensional Specification
                            </p>
                            <pre className="text-xs font-mono whitespace-pre-wrap text-foreground max-h-[300px] overflow-y-auto">{mod.interfaceDefinition}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Batch failure summary — shown after batch with errors */}
          {!isBatchRunning && Object.keys(batchProgress).length > 0 && Object.values(batchProgress).some((s) => s === "error") && (
            <div className="border border-destructive/30 rounded-lg bg-status-error-light/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <p className="text-sm font-semibold text-destructive">
                  {Object.values(batchProgress).filter((s) => s === "error").length} module{Object.values(batchProgress).filter((s) => s === "error").length !== 1 ? "s" : ""} failed during generation
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                This can happen due to temporary service issues, complex geometry that times out, or high demand.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleGenerateAllModules}
                disabled={isAnyLoading}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry All Failed
              </Button>
            </div>
          )}

          {/* While You Wait — productive activities during batch generation */}
          {isBatchRunning && modules.length > 0 && (
            <CadLabWhileYouWait
              modules={modules}
              diagCompletedCount={diagCompletedCount}
              hasResearch={hasResearch}
              diagnosticAnswers={diagnosticAnswers}
            />
          )}

          {/* Module list — crossfade in when batch progress finishes */}
          {modules.length > 0 && Object.keys(batchProgress).length === 0 && (
            <FadeIn><div className="space-y-2 mt-4">
              {modules.map((mod) => (
                <div key={mod.id} id={`module-${mod.id}`} className="border rounded-md overflow-hidden">
                  {/* Module header */}
                  <button
                    onClick={() => setExpandedModuleId(expandedModuleId === mod.id ? null : mod.id)}
                    className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {mod.imageUrl && mod.imageStatus === "complete" && (
                        <div className="h-10 w-10 rounded overflow-hidden bg-muted flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mod.imageUrl} alt="" className="h-full w-full object-cover" />
                        </div>
                      )}
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                        generatingModuleIds.has(mod.id) ? "bg-international-orange animate-pulse"
                        : mod.status === "generated" ? "bg-status-success"
                        : mod.status === "interface_ready" ? "bg-status-info"
                        : mod.status === "failed" ? "bg-destructive"
                        : "bg-muted-foreground"
                      }`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{mod.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{mod.purpose}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground flex items-center gap-1" title={`Estimated procurement lead time: ${mod.leadWeeks} weeks`}>
                        <Clock className="h-3 w-3" />
                        {mod.leadWeeks} wk lead time
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1" title={`${mod.keyParts.length} key physical components in this sub-assembly`}>
                        <Puzzle className="h-3 w-3" />
                        {mod.keyParts.length} parts
                      </span>
                      {/* Per-module Generate button */}
                      {mod.status !== "generated" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={generatingModuleIds.has(mod.id) || isBatchRunning}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleGenerateSingleModule(mod.id)
                          }}
                        >
                          {generatingModuleIds.has(mod.id) ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> Generating...</>
                          ) : (
                            <><Zap className="h-3 w-3" /> Generate</>
                          )}
                        </Button>
                      )}
                      {mod.status === "generated" && (
                        <span className="text-xs text-status-success flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Done
                        </span>
                      )}
                      {/* P4: Quality rating — thumbs up/down */}
                      {mod.status === "generated" && (
                        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={cn(
                              "h-6 w-6 rounded flex items-center justify-center transition-colors",
                              qualityRatings[mod.id] === "good" ? "bg-status-success-light text-status-success" : "text-muted-foreground hover:text-status-success hover:bg-status-success-light/50"
                            )}
                            onClick={() => handleQualityRate(mod.id, "good")}
                            title="Good quality"
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "h-6 w-6 rounded flex items-center justify-center transition-colors",
                              qualityRatings[mod.id] === "bad" ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            )}
                            onClick={() => handleQualityRate(mod.id, "bad")}
                            title="Poor quality"
                          >
                            <ThumbsDown className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {expandedModuleId === mod.id
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </button>

                  {/* Inline progress bar while generating — width reflects pipeline phase */}
                  {generatingModuleIds.has(mod.id) && (
                    <div className="h-1 bg-muted overflow-hidden">
                      <div className={cn(
                        "h-full bg-international-orange rounded-full transition-all duration-700 animate-pulse",
                        mod.status === "pending" ? "w-1/3" : "w-2/3"
                      )} />
                    </div>
                  )}

                  {/* Expanded module detail */}
                  {expandedModuleId === mod.id && (
                    <div className="border-t p-4 space-y-4 bg-muted/20">
                      {/* Blueprint illustration from Concept stage — click to zoom */}
                      {mod.imageUrl && mod.imageStatus === "complete" && (
                        <button
                          type="button"
                          className="aspect-[3/2] w-full max-w-md rounded-lg overflow-hidden bg-muted border cursor-zoom-in hover:ring-2 hover:ring-international-orange/30 transition-shadow text-left"
                          onClick={() => setLightboxImage({ url: mod.imageUrl!, alt: `Concept blueprint: ${mod.name}` })}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={mod.imageUrl}
                            alt={`Concept blueprint: ${mod.name}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <p className="text-[10px] text-muted-foreground text-center py-1 bg-muted/50">Click to zoom</p>
                        </button>
                      )}

                      {/* Checkpoint revision diffs (Original Concept → Revised) */}
                      {mod.conceptSnapshot && (() => {
                        const revItems = buildRevisionItems(mod)
                        return revItems.length > 0 ? <RedlineDiff fromStage="Original Concept" toStage="Revised" items={revItems} /> : null
                      })()}

                      {/* Concept → Build redline diffs */}
                      <ConceptBuildDiff module={mod} />

                      {/* Description */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                        <p className="text-sm text-foreground">{mod.description}</p>
                      </div>

                      {/* Why This Module Matters */}
                      {mod.whyItMatters && (
                        <div className="border-l-2 border-international-orange pl-3">
                          <p className="text-xs font-semibold text-foreground mb-0.5">Why This Module Matters</p>
                          <p className="text-sm text-muted-foreground">{mod.whyItMatters}</p>
                        </div>
                      )}

                      {/* What the AI Assumed — things the user must validate */}
                      {((mod.result?.assumptions && mod.result.assumptions.length > 0) || (mod.result?.validationWarnings && mod.result.validationWarnings.length > 0)) && (
                        <div className="border rounded-lg p-3 space-y-2 bg-status-info-light/10">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
                            What the AI Assumed — Validate Before Sending to Factory
                          </p>
                          {mod.result?.assumptions && mod.result.assumptions.length > 0 && (
                            <ul className="space-y-1.5">
                              {mod.result.assumptions.map((assumption, idx) => (
                                <li key={idx} className="text-xs text-foreground flex items-start gap-1.5">
                                  <Info className="h-3 w-3 text-status-info flex-shrink-0 mt-0.5" />
                                  <span>The AI assumed: <span className="font-medium">{assumption}</span> — is this correct for your use case?</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {mod.result?.validationWarnings && mod.result.validationWarnings.length > 0 && (
                            <ul className="space-y-1.5">
                              {mod.result.validationWarnings.map((warning, idx) => (
                                <li key={idx} className="text-xs text-status-warning-dark flex items-start gap-1.5">
                                  <AlertTriangle className="h-3 w-3 text-status-warning flex-shrink-0 mt-0.5" />
                                  {warning}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {/* Questions for Your Factory */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Questions for Your Factory</p>
                        <ManufacturingInsightCard moduleAnswers={diagnosticAnswers?.[mod.id]} />
                      </div>

                      {/* Pre-execution Validator Findings — QW5 */}
                      {mod.result?.preExecValidation && mod.result.preExecValidation.length > 0 && (
                        <PreExecValidationAlerts findings={mod.result.preExecValidation} />
                      )}

                      {/* Design Validation */}
                      {(mod.status === "generated" || mod.result) && (
                        <ValidationSummary
                          module={mod}
                          diagnostics={diagnosticAnswers?.[mod.id]}
                        />
                      )}

                      {/* Specialist Reviews */}
                      {activeProjectId && (mod.status === "generated" || mod.result) && (
                        <SpecialistReviewPanel
                          module={mod}
                          allModules={modules}
                          reviews={moduleReviews[mod.id] ?? []}
                          projectId={activeProjectId}
                          projectSubject={subject}
                          designBrief={designBrief}
                          diagnosticAnswers={diagnosticAnswers}
                          onReviewComplete={(review) => handleReviewComplete(mod.id, review)}
                          pendingReviewKeys={pendingReviewKeys}
                          onMarkPending={markReviewPending}
                          onClearPending={clearReviewPending}
                        />
                      )}

                      {/* IO Flow */}
                      <div className="flex items-center gap-4 text-xs">
                        <div>
                          <p className="font-semibold text-muted-foreground mb-1">Inputs</p>
                          {mod.inputs.map((inp, i) => (
                            <span key={i} className="inline-block bg-muted px-2 py-0.5 rounded mr-1 mb-1 font-mono">{inp}</span>
                          ))}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-muted-foreground mb-1">Outputs</p>
                          {mod.outputs.map((out, i) => (
                            <span key={i} className="inline-block bg-muted px-2 py-0.5 rounded mr-1 mb-1 font-mono">{out}</span>
                          ))}
                        </div>
                      </div>

                      {/* Key Parts */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Key Components</p>
                        <div className="flex flex-wrap gap-1.5">
                          {mod.keyParts.map((part, i) => (
                            <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{part}</span>
                          ))}
                        </div>
                      </div>

                      {/* Risks & Unknowns */}
                      {(mod.failureModes.length > 0 || mod.unknowns.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {mod.failureModes.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Failure Modes</p>
                              <ul className="space-y-1">
                                {mod.failureModes.map((fm, i) => (
                                  <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                                    <AlertTriangle className="h-3 w-3 text-status-warning flex-shrink-0 mt-0.5" />{fm}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {mod.unknowns.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Unknowns</p>
                              <ul className="space-y-1">
                                {mod.unknowns.map((u, i) => (
                                  <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                                    <Info className="h-3 w-3 text-status-info flex-shrink-0 mt-0.5" />{u}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Module pipeline actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-muted">
                        {mod.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => handleModuleGenerate(mod.id, "interface")} disabled={generatingModuleIds.has(mod.id) || isBatchRunning}>
                            {generatingModuleIds.has(mod.id)
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Planning Dimensions...</>
                              : <><Ruler className="h-3.5 w-3.5 mr-1.5" /> Plan Dimensions</>
                            }
                          </Button>
                        )}
                        {mod.status === "interface_ready" && (
                          <>
                            <span className="text-xs text-status-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Dimensions planned</span>
                            <Button size="sm" variant="outline" onClick={() => handleModuleGenerate(mod.id, "generate")} disabled={generatingModuleIds.has(mod.id) || isBatchRunning}>
                              {generatingModuleIds.has(mod.id)
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Generating CAD...</>
                                : <><ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Generate CAD</>
                              }
                            </Button>
                          </>
                        )}
                        {mod.status === "generated" && (
                          <span className="text-xs text-status-success flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> CAD generated
                            {mod.result?.bbox && (
                              <span className="text-muted-foreground ml-2">
                                {mod.result.bbox.xLen}×{mod.result.bbox.yLen}×{mod.result.bbox.zLen}mm
                              </span>
                            )}
                          </span>
                        )}
                        {mod.status === "failed" && (
                          <>
                            <span className="text-xs text-destructive flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Generation failed
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              onClick={() => handleModuleGenerate(mod.id, mod.interfaceDefinition ? "generate" : "interface")}
                              disabled={generatingModuleIds.has(mod.id) || isBatchRunning}
                            >
                              {generatingModuleIds.has(mod.id) ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Retrying...</>
                              ) : (
                                <><RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Retry</>
                              )}
                            </Button>
                          </>
                        )}
                      </div>

                      {/* Dimensional Specification — editable before sending to factory */}
                      {mod.interfaceDefinition && (
                        <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <Ruler className="h-3.5 w-3.5 text-international-orange" />
                              Dimensional Specification
                              <span className="font-normal text-muted-foreground">— send this to your factory</span>
                            </p>
                            {editingSpecModuleId !== mod.id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 min-h-[44px] sm:min-h-0 sm:h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setEditingSpecModuleId(mod.id)
                                  setSpecDraft(mod.interfaceDefinition ?? "")
                                }}
                              >
                                <Pencil className="h-3 w-3 mr-1" /> Edit
                              </Button>
                            )}
                          </div>
                          {editingSpecModuleId === mod.id ? (
                            <div className="space-y-2">
                              <textarea
                                className="w-full text-xs font-mono whitespace-pre-wrap text-foreground bg-background border rounded-md p-2 min-h-[120px] max-h-[400px] resize-y focus:outline-none focus:ring-2 focus:ring-international-orange/40"
                                value={specDraft}
                                onChange={(e) => setSpecDraft(e.target.value)}
                                autoFocus
                              />
                              <div className="flex items-center gap-2 justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 min-h-[44px] sm:min-h-0 sm:h-7 px-2 text-xs"
                                  onClick={() => setEditingSpecModuleId(null)}
                                >
                                  <X className="h-3 w-3 mr-1" /> Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 min-h-[44px] sm:min-h-0 sm:h-7 px-3 text-xs"
                                  onClick={() => {
                                    handleUpdateModule({ ...mod, interfaceDefinition: specDraft })
                                    setEditingSpecModuleId(null)
                                  }}
                                >
                                  <Check className="h-3 w-3 mr-1" /> Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <pre className="text-xs font-mono whitespace-pre-wrap text-foreground max-h-[300px] overflow-y-auto">{mod.interfaceDefinition}</pre>
                          )}
                        </div>
                      )}

                      {/* Module results (when generated) */}
                      {mod.status === "generated" && mod.result && (
                        <ModuleResultsView
                          result={mod.result as CadLabResult}
                          moduleName={mod.name}
                          code={mod.code}
                          showCode={showCodeSet.has(mod.id)}
                          setShowCode={(v: boolean) => setShowCodeSet((prev) => {
                            const next = new Set(prev)
                            if (v) next.add(mod.id)
                            else next.delete(mod.id)
                            return next
                          })}
                          codeCopied={codeCopied}
                          onCopyCode={handleCopyCode}
                          activeViewTab={activeViewTab}
                          setActiveViewTab={setActiveViewTab}
                          onFullscreen={(view, moduleId) => {
                            setViewingModuleId(moduleId)
                            setFullscreenView(view)
                          }}
                          moduleId={mod.id}
                          onDownload={handleDownload}
                          svgUrls={mod.svgUrls}
                        />
                      )}

                      {/* SVG preview (fallback for older module data without full result viewer) */}
                      {(mod.svgUrls?.iso || mod.result?.svgIso) && mod.status === "generated" && !(mod.result as CadLabResult).stlData && (
                        <div className="bg-muted rounded-lg p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mod.svgUrls?.iso ?? mod.result?.svgIso} alt={`${mod.name} isometric view`} className="w-full" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div></FadeIn>
          )}
        </CardContent>
      </Card>
            </motion.div>
          )}
        </SafeAnimatePresence>
      </div>

      {/* ── Fullscreen overlay ── */}
      {fullscreenView && viewingResult && (
        <FullscreenOverlay
          view={fullscreenView}
          result={viewingResult}
          onClose={() => { setFullscreenView(null); setViewingModuleId(null) }}
        />
      )}

      <AlertDialog open={isConfirmRemapOpen} onOpenChange={setIsConfirmRemapOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-map modules?</AlertDialogTitle>
            <AlertDialogDescription>
              This will discard your current {modules.length} module{modules.length !== 1 ? "s" : ""} and any generated CAD files.
              You&apos;ll need to regenerate everything from scratch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setIsConfirmRemapOpen(false); handleDecompose() }}>
              Re-map Modules
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Image lightbox ── */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-4xl w-[90vw] p-2">
          {lightboxImage && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxImage.url}
                alt={lightboxImage.alt}
                className="w-full h-auto rounded-lg"
              />
              <p className="text-xs text-muted-foreground text-center mt-1">{lightboxImage.alt}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

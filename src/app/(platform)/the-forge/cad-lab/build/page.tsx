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
import { useRouter } from "next/navigation"
import {
  Loader2,
  Box,
  Code2,
  Timer,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  RotateCcw,
  Copy,
  Check,
  Maximize2,
  Ruler,
  Download,
  Printer,
  Info,
  Play,
  ClipboardCheck,
  Layers,
  Clock,
  Puzzle,
  Network,
  ArrowDownRight,
  Search,
  FileText,
  Pencil,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { hasKeywordOverlap } from "@/lib/cad-lab/keyword-matching"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { STLViewer } from "@/components/cad/stl-viewer"
import { CadLabWhileYouWait } from "@/components/cad/cad-lab-while-you-wait"
import { EmptyState } from "@/components/ui/empty-state"
import { ResearchSection } from "../components/research-section"
import { DesignIntakeForm } from "../components/design-intake-form"
import { RedlineDiff, type RedlineItem } from "../components/redline-diff"
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
import type { CadLabResult, CadLabModule } from "@/lib/cad-lab-types"

import { useRegisterScreenContext } from "@/contexts/screen-context"
import { AskSpecialistButton } from "@/components/specialists/ask-specialist-button"
import { ManufacturingInsightCard } from "@/components/cad/manufacturing-insight-card"
import { SpecialistReviewPanel } from "@/components/cad/specialist-review-panel"
import { ValidationSummary } from "@/components/cad/validation-summary"
import type { SpecialistReview } from "@/lib/cad-lab-types"
import { useCadLab } from "../cad-lab-context"
import { Metric, SvgView, RenderedView, FullscreenOverlay, extractProductSummary } from "../cad-lab-utils"
import { useRenderedViews } from "@/hooks/use-rendered-views"
import { ModuleCarousel } from "../components/module-carousel"
import { IntegrationView } from "../components/integration-view"
// ProcessFlowDiagram removed — IO info is shown inline in System Architecture cards

// ─── View Tab Type ───────────────────────────────────────────────────

type ViewTab = "3d" | "iso" | "exploded" | "front" | "back" | "left" | "right" | "top"

// ─── Page Component ──────────────────────────────────────────────────

export default function CadLabBuildPage(): React.ReactNode {
  const router = useRouter()
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
    modules, expandedModuleId, setExpandedModuleId,
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
    setIntegrationError,
    handleGenerateIntegration,
    handleDownload,
    handleUpdateModule,
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

  // Specialist reviews (keyed by moduleId → array of reviews)
  const [moduleReviews, setModuleReviews] = useState<Record<string, SpecialistReview[]>>({})
  const handleReviewComplete = useCallback((moduleId: string, review: SpecialistReview) => {
    setModuleReviews(prev => {
      const existing = prev[moduleId] ?? []
      const filtered = existing.filter(r => r.specialistId !== review.specialistId)
      return { ...prev, [moduleId]: [...filtered, review] }
    })
  }, [])

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

  // ── Section navigation for Build page ──
  const BUILD_SECTIONS = useMemo(() => {
    const sections: { id: string; label: string }[] = []
    if (modules.length > 0 && generatedModuleCount === modules.length) sections.push({ id: "build-integration", label: "Assembly" })
    if (modules.length > 0) sections.push({ id: "build-overview", label: "Overview" })
    if (hasResearch) sections.push({ id: "build-research", label: "Research" })
    if (hasResearch) sections.push({ id: "build-mfg-context", label: "Mfg Context" })
    if (modules.length > 0) sections.push({ id: "build-architecture", label: "Architecture" })
    if (modules.length > 0) sections.push({ id: "build-modules", label: "Modules" })
    return sections
  }, [modules, generatedModuleCount, hasResearch])

  const [activeBuildSection, setActiveBuildSection] = useState("")

  const handleBuildSectionClick = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  useEffect(() => {
    if (BUILD_SECTIONS.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveBuildSection(entry.target.id)
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    )
    for (const section of BUILD_SECTIONS) {
      const el = document.getElementById(section.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [BUILD_SECTIONS])

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
      {/* ── Section navigation ── */}
      {BUILD_SECTIONS.length > 1 && (
        <nav className="sticky top-12 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 bg-background border-b border-border overflow-x-auto">
          <div className="flex flex-wrap items-center gap-1">
            {BUILD_SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => handleBuildSectionClick(section.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  activeBuildSection === section.id
                    ? "bg-international-orange-light text-international-orange"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {section.label}
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
      )}

      {/* ── Integration: combined system assembly (when all modules generated) ── */}
      {modules.length > 0 && generatedModuleCount === modules.length && (
        <div id="build-integration"><IntegrationView
          allModulesGenerated
          referenceModel={referenceModel ?? null}
          integratedAssemblyStlUrl={integratedAssemblyStlUrl}
          isIntegrating={isIntegrating}
          onGenerateIntegration={handleGenerateIntegration}
          integrationError={integrationError}
          onClearError={() => setIntegrationError(null)}
        /></div>
      )}

      {/* ── All modules generated celebration ── */}
      {generatedModuleCount > 0 && generatedModuleCount === modules.length && (
        <div className="rounded-xl border border-status-success/30 bg-gradient-to-r from-status-success-light/20 via-background to-status-info-light/10 p-5">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 h-12 w-12 rounded-full bg-status-success-light flex items-center justify-center">
              <Zap className="h-6 w-6 text-status-success" />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">All {modules.length} Modules Generated</h3>
                {/* Download All — triggers individual STEP + STL downloads for every generated module */}
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
                <Button variant="default" size="sm" className="gap-1.5 text-xs" onClick={() => router.push(FORGE_ROUTES.cadLabReview)}>
                  <ClipboardCheck className="h-3 w-3" /> Review Package
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Partial completion with failures ── */}
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

                {/* Download Generated — only successful modules */}
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
                <Button variant="default" size="sm" className="gap-1.5 text-xs" onClick={() => router.push(FORGE_ROUTES.cadLabReview)}>
                  <ClipboardCheck className="h-3 w-3" /> Review Package
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

      {/* ── Sticky Generate All action bar (visible when ungenerated modules exist) ── */}
      {modules.length > 0 && modules.some((m) => m.status !== "generated") && (
        <div className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{subject}</p>
              <p className="text-xs text-muted-foreground">
                {generatedModuleCount} of {modules.length} modules generated
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

      {/* ── Product Overview ── */}
      {modules.length > 0 && (
        <div id="build-overview"><ProductOverview
          subject={subject}
          report={editableReport}
          modules={modules}
          moduleCount={modules.length}
          totalComponents={modules.reduce((s, m) => s + m.keyParts.length, 0)}
          criticalPathWeeks={Math.max(...modules.map((m) => m.leadWeeks))}
          totalRisks={modules.reduce((s, m) => s + m.failureModes.length, 0)}
          totalUnknowns={modules.reduce((s, m) => s + m.unknowns.length, 0)}
          systemIllustrationUrl={systemIllustrationUrl}
        /></div>
      )}

      {/* ── Research Report — collapsed by default once modules exist (reference material) ── */}
      {hasResearch && (
        <div id="build-research">
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
        </div>
      )}

      {/* ── Manufacturing Context (moved from Concept) ── */}
      {hasResearch && (
        <div id="build-mfg-context"><CollapsibleSection
          title="Manufacturing Context"
          subtitle={
            designBrief.useCase && designBrief.targetProcess && designBrief.targetMaterial
              ? `${designBrief.targetProcess} · ${designBrief.targetMaterial} · ${designBrief.useCase}`
              : "Process, material, tolerance, and compliance preferences"
          }
          icon={<Ruler className="h-4 w-4" />}
          defaultOpen={!(designBrief.useCase && designBrief.targetProcess && designBrief.targetMaterial)}
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
          />
        </CollapsibleSection></div>
      )}

      {/* ── System Architecture ── */}
      {modules.length > 0 && (
        <div id="build-architecture"><SystemArchitecture
          subject={subject}
          modules={modules}
          onModuleClick={(moduleId) => {
            const isCollapsing = expandedModuleId === moduleId
            setExpandedModuleId(isCollapsing ? null : moduleId)
            if (!isCollapsing) {
              // Scroll to the module detail after React renders the expanded section
              setTimeout(() => {
                document.getElementById(`module-${moduleId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }, 50)
            }
          }}
        /></div>
      )}

      {/* Module Integration Flow removed — IO info is now shown inline in System Architecture cards */}

      {/* ── Progressive module carousel: visible during batch generation for read-ahead ── */}
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
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
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
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setEditingSpecModuleId(null)}
                                >
                                  <X className="h-3 w-3 mr-1" /> Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 px-3 text-xs"
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
                        />
                      )}

                      {/* SVG preview (fallback for older module data without full result viewer) */}
                      {mod.result?.svgIso && mod.status === "generated" && !(mod.result as CadLabResult).stlData && (
                        <div className="bg-muted rounded-lg p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mod.result.svgIso} alt={`${mod.name} isometric view`} className="w-full" />
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

// ─── Product Overview ────────────────────────────────────────────────

/**
 * ProductOverview — Prominent product hero card before the module breakdown.
 *
 * @description Large visual card showing the product name, summary excerpt
 * from the research report, and aggregate engineering stats. Gives the user
 * a clear "this is the thing we're building" moment before they drill into
 * individual sub-assemblies. Includes a mini module map showing how the
 * modules are distributed by manufacturing process.
 */
function ProductOverview({
  subject,
  report,
  modules,
  moduleCount,
  totalComponents,
  criticalPathWeeks,
  totalRisks,
  totalUnknowns,
  systemIllustrationUrl,
}: {
  subject: string
  report: string
  modules: CadLabModule[]
  moduleCount: number
  totalComponents: number
  criticalPathWeeks: number
  totalRisks: number
  totalUnknowns: number
  systemIllustrationUrl?: string | null
}): React.ReactNode {
  const summary = extractProductSummary(report)

  // Group modules by lead-time for a visual weight map
  const processGroups = useMemo(() => {
    const groups: Record<string, { name: string; count: number; color: string }> = {}
    for (const mod of modules) {
      // Use the module's key parts count as a proxy for complexity
      const key = mod.leadWeeks <= 2 ? "fast" : mod.leadWeeks <= 4 ? "medium" : "long"
      if (!groups[key]) {
        groups[key] = {
          name: key === "fast" ? "Quick Turn (1-2 wk)" : key === "medium" ? "Standard (3-4 wk)" : "Long Lead (5+ wk)",
          count: 0,
          color: key === "fast" ? "bg-status-success" : key === "medium" ? "bg-status-info" : "bg-international-orange",
        }
      }
      groups[key].count++
    }
    return Object.values(groups)
  }, [modules])

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-international-orange-light/10 via-background to-status-info-light/5 p-6 sm:p-8">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-1 rounded-full bg-international-orange flex-shrink-0" />
              <h2 className="text-xl font-bold text-foreground truncate">{subject}</h2>
            </div>
            {summary && (
              <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
                {summary}
              </p>
            )}
          </div>
          {/* System illustration thumbnail */}
          {systemIllustrationUrl && (
            <div className="w-32 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0 hidden sm:block border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={systemIllustrationUrl} alt="System overview" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-background rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Puzzle className="h-3 w-3" /> Sub-Assemblies
            </p>
            <p className="text-lg font-bold text-foreground font-mono">{moduleCount}</p>
          </div>
          <div className="bg-background rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Box className="h-3 w-3" /> Components
            </p>
            <p className="text-lg font-bold text-foreground font-mono">{totalComponents}</p>
          </div>
          <div className="bg-background rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Critical Path
            </p>
            <p className="text-lg font-bold text-foreground font-mono">{criticalPathWeeks}w</p>
          </div>
          <div className="bg-background rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Failure Modes
            </p>
            <p className="text-lg font-bold text-foreground font-mono">{totalRisks}</p>
          </div>
          <div className="bg-background rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" /> Open Questions
            </p>
            <p className="text-lg font-bold text-foreground font-mono">{totalUnknowns}</p>
          </div>
        </div>

        {/* Lead time distribution bar */}
        {processGroups.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Sub-Assemblies by Lead Time</p>
            <div className="flex h-3 rounded-full overflow-hidden border">
              {processGroups.map((g) => (
                <div
                  key={g.name}
                  className={cn("h-full transition-all duration-500", g.color)}
                  style={{ width: `${(g.count / moduleCount) * 100}%` }}
                  title={`${g.name}: ${g.count} of ${moduleCount} sub-assemblies`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {processGroups.map((g) => (
                <span key={g.name} className="flex items-center gap-1.5">
                  <div className={cn("h-2 w-6 rounded-full", g.color)} />
                  {g.name} — {g.count} of {moduleCount}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── DFM Issue Explanations ──────────────────────────────────────────

const DFM_EXPLANATIONS: Record<string, string> = {
  overhang: "Overhangs above 45° require support material, which increases print time, material usage, and may leave surface marks where supports attach. Consider reorienting the part or adding fillets.",
  "thin wall": "Thin walls risk warping during cooling and may not survive post-processing. Increase wall thickness to at least 1.2mm for FDM or 0.8mm for SLA.",
  "small feature": "Very small features may not resolve at the chosen layer height, or may break during removal from the build plate. Consider scaling up or using a higher-resolution process.",
  bridge: "Unsupported horizontal spans (bridges) can sag during printing. Keep bridges under 10mm for reliable results, or add support structure.",
  tolerance: "The specified tolerance may not be achievable with this manufacturing process without post-machining. Discuss with your factory which features are truly critical.",
  "build volume": "The part exceeds the build volume of common printers. You'll need a larger-format printer or may need to split the part into sections.",
  support: "High support volume means significant material waste and post-processing time. Reorienting the part could reduce support requirements.",
  geometry: "Complex geometry may cause slicing errors or unpredictable print quality. Simplify where possible, especially internal features.",
}

function getDfmExplanation(category: string, severity: string): string | null {
  // Try exact match first
  const lower = category.toLowerCase()
  if (DFM_EXPLANATIONS[lower]) return DFM_EXPLANATIONS[lower]
  // Try keyword match
  for (const [key, explanation] of Object.entries(DFM_EXPLANATIONS)) {
    if (lower.includes(key) || key.includes(lower)) return explanation
  }
  // Generic fallback for critical/warning
  if (severity === "critical") return "This is a critical manufacturing issue. Resolve it before sending files to your factory — it will likely cause the part to fail or be unreproducible."
  if (severity === "warning") return "This may affect part quality or increase cost. Discuss with your factory to determine if it needs to be addressed for your application."
  return null
}

// ─── Module Results Viewer ───────────────────────────────────────────

/**
 * ModuleResultsView — Full results display for a generated module.
 * Shows 3D/SVG views, metrics, DFM analysis, and generated code.
 */
function ModuleResultsView({
  result,
  moduleName,
  code,
  showCode,
  setShowCode,
  codeCopied,
  onCopyCode,
  activeViewTab,
  setActiveViewTab,
  onFullscreen,
  moduleId,
  onDownload,
}: {
  result: CadLabResult
  moduleName: string
  code?: string
  showCode: boolean
  setShowCode: (v: boolean) => void
  codeCopied: boolean
  onCopyCode: (code: string) => void
  activeViewTab: ViewTab
  setActiveViewTab: (v: ViewTab) => void
  onFullscreen: (view: string, moduleId: string) => void
  moduleId: string
  onDownload: (filename: string, base64Data: string, isBinary?: boolean) => void
}): React.ReactNode {
  // Render high-quality orthographic views from STL using Three.js
  const { views: renderedViews, loading: renderedLoading } = useRenderedViews(result.stlData)

  // A view tab is available if we have STL (rendered views) OR a CadQuery SVG fallback
  const hasIso = !!(result.stlData || result.svgIso)
  const hasExploded = !!result.svgExploded
  const hasFront = !!(result.stlData || result.svgFront)
  const hasBack = !!(result.stlData || result.svgBack)
  const hasLeft = !!(result.stlData || result.svgLeft)
  const hasRight = !!(result.stlData || result.svgRight)
  const hasTop = !!(result.stlData || result.svgTop)

  // Auto-select first available tab when current tab has no matching content
  useEffect(() => {
    const availableTabs: ViewTab[] = []
    if (result.stlData) availableTabs.push("3d")
    if (hasIso) availableTabs.push("iso")
    if (hasExploded) availableTabs.push("exploded")
    if (hasFront) availableTabs.push("front")
    if (hasBack) availableTabs.push("back")
    if (hasLeft) availableTabs.push("left")
    if (hasRight) availableTabs.push("right")
    if (hasTop) availableTabs.push("top")

    if (availableTabs.length > 0 && !availableTabs.includes(activeViewTab)) {
      setActiveViewTab(availableTabs[0])
    }
  }, [result, hasIso, hasExploded, hasFront, hasBack, hasLeft, hasRight, hasTop, activeViewTab, setActiveViewTab])

  const handleDownloadFromUrl = (url: string, filename: string): void => {
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    link.click()
  }

  // Renders a single orthographic view tab — prefers Three.js PNG, falls back to CadQuery SVG
  const renderOrthoTab = (viewName: "iso" | "front" | "back" | "left" | "right" | "top", label: string) => {
    const renderedSrc = renderedViews?.[viewName] ?? null
    const svgSrc = viewName === "iso" ? result.svgIso
      : viewName === "front" ? result.svgFront
      : viewName === "back" ? result.svgBack
      : viewName === "left" ? result.svgLeft
      : viewName === "right" ? result.svgRight
      : result.svgTop

    // Prefer rendered PNG; fall back to CadQuery SVG if rendering failed/unavailable
    if (result.stlData) {
      return (
        <TabsContent value={viewName} className="mt-3">
          <RenderedView
            src={renderedSrc}
            alt={label}
            onClick={() => onFullscreen(viewName, moduleId)}
            loading={renderedLoading}
          />
        </TabsContent>
      )
    }
    if (svgSrc) {
      return (
        <TabsContent value={viewName} className="mt-3">
          <SvgView src={svgSrc} alt={label} onClick={() => onFullscreen(viewName, moduleId)} />
        </TabsContent>
      )
    }
    return null
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Views */}
      {(result.stlData || result.svgIso || result.svgFront || result.svgTop) && (
        <div className="border rounded-md">
          <div className="flex items-center justify-between p-3 border-b">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Box className="h-3.5 w-3.5" /> Views — {moduleName}
            </p>
            <div className="flex items-center gap-1.5">
              {(result.stepData || result.stepUrl) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => result.stepData
                    ? onDownload(`${moduleName}.step`, result.stepData!, false)
                    : result.stepUrl && handleDownloadFromUrl(result.stepUrl, `${moduleName}.step`)}
                  className="gap-1 text-xs h-7"
                >
                  <Download className="h-3 w-3" /> STEP
                </Button>
              )}
              {(result.stlData || result.stlUrl) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => result.stlData
                    ? onDownload(`${moduleName}.stl`, result.stlData!)
                    : result.stlUrl && handleDownloadFromUrl(result.stlUrl, `${moduleName}.stl`)}
                  className="gap-1 text-xs h-7"
                >
                  <Download className="h-3 w-3" /> STL
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => onFullscreen(activeViewTab, moduleId)} className="gap-1 text-xs h-7">
                <Maximize2 className="h-3 w-3" /> Fullscreen
              </Button>
            </div>
          </div>
          <div className="p-3">
            <Tabs value={activeViewTab} onValueChange={(v) => setActiveViewTab(v as ViewTab)}>
              <TabsList className="flex w-full overflow-x-auto">
                {result.stlData && <TabsTrigger value="3d" className="flex-1">3D</TabsTrigger>}
                {hasIso && <TabsTrigger value="iso" className="flex-1">Iso</TabsTrigger>}
                {hasExploded && <TabsTrigger value="exploded" className="flex-1">Exploded</TabsTrigger>}
                {hasFront && <TabsTrigger value="front" className="flex-1">Front</TabsTrigger>}
                {hasBack && <TabsTrigger value="back" className="flex-1">Back</TabsTrigger>}
                {hasLeft && <TabsTrigger value="left" className="flex-1">Left</TabsTrigger>}
                {hasRight && <TabsTrigger value="right" className="flex-1">Right</TabsTrigger>}
                {hasTop && <TabsTrigger value="top" className="flex-1">Top</TabsTrigger>}
              </TabsList>
              {result.stlData && (
                <TabsContent value="3d" className="mt-3">
                  <div className="h-[400px] bg-muted/30 rounded-lg overflow-hidden">
                    <STLViewer stlData={result.stlData} />
                  </div>
                </TabsContent>
              )}
              {hasIso && renderOrthoTab("iso", "Isometric")}
              {hasExploded && result.svgExploded && <TabsContent value="exploded" className="mt-3"><SvgView src={result.svgExploded} alt="Exploded" onClick={() => onFullscreen("exploded", moduleId)} /></TabsContent>}
              {hasFront && renderOrthoTab("front", "Front")}
              {hasBack && renderOrthoTab("back", "Back")}
              {hasLeft && renderOrthoTab("left", "Left")}
              {hasRight && renderOrthoTab("right", "Right")}
              {hasTop && renderOrthoTab("top", "Top")}
            </Tabs>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border rounded-md">
        {result.bbox && <Metric icon={<Box className="h-3.5 w-3.5" />} label="Bounding Box" value={`${result.bbox.xLen}×${result.bbox.yLen}×${result.bbox.zLen} mm`} />}
        {result.massGrams != null && <Metric label="Mass" value={`${result.massGrams} g`} />}
        {result.volumeMm3 != null && <Metric label="Volume" value={result.volumeMm3 > 1000 ? `${(result.volumeMm3 / 1000).toFixed(1)} cm³` : `${result.volumeMm3.toFixed(0)} mm³`} />}
        {result.massProperties?.surfaceAreaMm2 != null && <Metric label="Surface Area" value={result.massProperties.surfaceAreaMm2 > 10000 ? `${(result.massProperties.surfaceAreaMm2 / 100).toFixed(0)} cm²` : `${result.massProperties.surfaceAreaMm2.toFixed(0)} mm²`} />}
        {result.generationTime != null && <Metric icon={<Timer className="h-3.5 w-3.5" />} label="Pipeline Time" value={`${(result.generationTime / 1000).toFixed(1)}s`} />}
        {result.fillRatio != null && <Metric label="Fill Ratio" value={`${result.fillRatio}%`} />}
        {result.stepSize != null && <Metric label="STEP Size" value={result.stepSize > 1024 ? `${(result.stepSize / 1024).toFixed(1)} MB` : `${result.stepSize} KB`} />}
        {result.drawingPackage?.revision && <Metric label="Revision" value={result.drawingPackage.revision} />}
      </div>

      {/* Validation warnings */}
      {result.validationWarnings && result.validationWarnings.length > 0 && (
        <div className="border border-status-warning/30 rounded-md p-3 space-y-1.5 bg-status-warning-light/10">
          <p className="text-xs font-semibold text-status-warning-dark flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Geometry Validation Warnings
          </p>
          {result.validationWarnings.map((warning, i) => (
            <p key={i} className="text-xs text-foreground pl-5">{warning}</p>
          ))}
        </div>
      )}

      {/* DFM */}
      {result.dfm && (
        <div className="border rounded-md p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Printer className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">DFM</span>
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${result.dfm.printable ? "bg-status-success-light text-status-success" : "bg-status-error-light text-destructive"}`}>
              {result.dfm.printable ? "PRINTABLE" : "NOT PRINTABLE"}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Printable" value={result.dfm.printable ? "Yes" : "No"} />
            <Metric label="Est. Print Time" value={result.dfm.estimatedPrintTimeMin > 60 ? `${(result.dfm.estimatedPrintTimeMin / 60).toFixed(1)} hrs` : `${result.dfm.estimatedPrintTimeMin} min`} />
            <Metric label="Est. Material" value={`${result.dfm.estimatedMaterialG} g`} />
            <Metric label="Support Volume" value={`~${result.dfm.supportVolumePct}%`} />
          </div>
          {result.dfm.compatiblePrinters.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Compatible Printers</p>
              <div className="flex flex-wrap gap-1.5">
                {result.dfm.compatiblePrinters.map((printer) => (
                  <span key={printer} className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{printer}</span>
                ))}
              </div>
            </div>
          )}
          {result.massProperties && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Center of Gravity</p>
              <p className="text-xs font-mono text-foreground">
                ({result.massProperties.centerOfGravity[0].toFixed(1)}, {result.massProperties.centerOfGravity[1].toFixed(1)}, {result.massProperties.centerOfGravity[2].toFixed(1)}) mm
              </p>
            </div>
          )}
          {result.dfm.issues.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Issues — what to fix before sending to factory</p>
              {result.dfm.issues.map((issue, i) => {
                const explanation = getDfmExplanation(issue.category, issue.severity)
                return (
                  <div key={i} className={`p-2.5 rounded space-y-1 ${
                    issue.severity === "critical" ? "bg-status-error-light/50 border border-destructive/20"
                    : issue.severity === "warning" ? "bg-status-warning-light/50 border border-status-warning/20"
                    : "bg-muted border border-muted"
                  }`}>
                    <p className="text-xs font-mono">
                      <span className={`font-semibold uppercase ${issue.severity === "critical" ? "text-destructive" : issue.severity === "warning" ? "text-status-warning-dark" : "text-muted-foreground"}`}>
                        {issue.severity}:
                      </span>{" "}
                      <span className="text-foreground">{issue.message}</span>
                    </p>
                    {explanation && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{explanation}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Assumptions */}
      {result.assumptions && result.assumptions.length > 0 && (
        <div className="border rounded-md p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">Resolved Assumptions</p>
          <ul className="space-y-1">
            {result.assumptions.map((assumption, idx) => (
              <li key={`${assumption}-${idx}`} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="h-3 w-3 text-status-info flex-shrink-0 mt-0.5" />
                {assumption}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Code */}
      {code && (
        <div className="border rounded-md">
          <div className="flex items-center justify-between p-3 border-b">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5" /> Generated Code
              <span className="font-normal text-muted-foreground">({result.codeLines} lines)</span>
            </p>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => onCopyCode(code)} className="gap-1 text-xs h-7">
                {codeCopied ? <><Check className="h-3 w-3" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy</>}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowCode(!showCode)} className="text-xs h-7">
                {showCode ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
          {showCode && (
            <div className="p-3">
              <pre className="text-xs font-mono bg-muted p-3 rounded-lg overflow-auto max-h-[400px] whitespace-pre-wrap">{code}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── System Architecture ─────────────────────────────────────────────

/**
 * Represents a connection between two modules based on matching outputs to inputs.
 */
interface ModuleConnection {
  fromId: string
  fromName: string
  toId: string
  toName: string
  /** The shared interface label (the matching input/output string) */
  label: string
}

/**
 * Builds the interface connection graph by matching module outputs to other
 * modules' inputs using keyword overlap (2+ shared significant words).
 *
 * @param modules - Array of decomposed modules
 * @returns Array of connections between modules
 */
function buildConnectionGraph(modules: CadLabModule[]): ModuleConnection[] {
  const connections: ModuleConnection[] = []

  for (const source of modules) {
    for (const output of source.outputs) {
      for (const target of modules) {
        if (target.id === source.id) continue
        for (const input of target.inputs) {
          if (hasKeywordOverlap(output, input)) {
            // Avoid duplicate connections between same pair with same label
            const isDuplicate = connections.some(
              (c) => c.fromId === source.id && c.toId === target.id && c.label === output,
            )
            if (!isDuplicate) {
              connections.push({
                fromId: source.id,
                fromName: source.name,
                toId: target.id,
                toName: target.name,
                label: output,
              })
            }
          }
        }
      }
    }
  }

  return connections
}

/**
 * SystemArchitecture — Visualises how sub-assemblies relate to each other.
 *
 * @description Shows the product as a root node with all modules as children,
 * interface connections between modules, and status/lead-time at a glance.
 * Addresses the anxiety of not seeing the overall shape while working
 * bottom-up on individual modules.
 *
 * @param subject - Product name
 * @param modules - Array of decomposed modules
 * @param onModuleClick - Callback when a module node is clicked (scrolls to detail)
 */
function SystemArchitecture({
  subject,
  modules,
  onModuleClick,
}: {
  subject: string
  modules: CadLabModule[]
  onModuleClick: (moduleId: string) => void
}): React.ReactNode {
  const [hoveredModuleId, setHoveredModuleId] = useState<string | null>(null)

  const connections = useMemo(() => buildConnectionGraph(modules), [modules])

  // Find which modules connect to the hovered module
  const hoveredConnections = useMemo(() => {
    if (!hoveredModuleId) return new Set<string>()
    const related = new Set<string>()
    for (const conn of connections) {
      if (conn.fromId === hoveredModuleId) related.add(conn.toId)
      if (conn.toId === hoveredModuleId) related.add(conn.fromId)
    }
    return related
  }, [hoveredModuleId, connections])

  const maxLeadWeeks = Math.max(...modules.map((m) => m.leadWeeks), 0)
  const generatedCount = modules.filter((m) => m.status === "generated").length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="h-4 w-4" />
          System Architecture
          <span className="text-xs font-normal text-muted-foreground ml-1">
            {connections.length} interface{connections.length !== 1 ? "s" : ""} mapped
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Reassurance message */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your product has been decomposed into{" "}
          <span className="font-medium text-foreground">{modules.length} manufacturable sub-assemblies</span>.
          {connections.length > 0
            ? " The diagram below shows how they connect. Each module will be designed individually — the interfaces ensure they fit together."
            : " Each module will be designed individually, then assembled into the final product."}
        </p>

        {/* Assembly graph */}
        <div className="relative">
          {/* Product root node */}
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-international-orange/40 bg-gradient-to-r from-international-orange-light/20 to-background shadow-sm">
              <Layers className="h-4 w-4 text-international-orange" />
              <div>
                <p className="text-sm font-semibold text-foreground">{subject}</p>
                <p className="text-xs text-muted-foreground">
                  {modules.length} sub-assemblies &middot; {maxLeadWeeks}w critical path
                  {generatedCount > 0 && (
                    <> &middot; <span className="text-status-success">{generatedCount}/{modules.length} built</span></>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Connector line from root to module grid */}
          <div className="flex justify-center mb-3">
            <div className="w-0.5 h-6 bg-muted" />
          </div>

          {/* Module nodes grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {modules.map((mod) => {
              const isHovered = hoveredModuleId === mod.id
              const isConnectedToHovered = hoveredConnections.has(mod.id)
              const isCriticalPath = mod.leadWeeks === maxLeadWeeks
              const moduleConnections = connections.filter(
                (c) => c.fromId === mod.id || c.toId === mod.id,
              )

              return (
                <button
                  key={mod.id}
                  onClick={() => onModuleClick(mod.id)}
                  onMouseEnter={() => setHoveredModuleId(mod.id)}
                  onMouseLeave={() => setHoveredModuleId(null)}
                  className={cn(
                    "relative text-left p-3 rounded-lg border transition-all duration-200",
                    "hover:shadow-md focus:outline-none focus:ring-2 focus:ring-international-orange focus:ring-offset-2",
                    mod.status === "generated" && "border-status-success/40 bg-status-success-light/10",
                    mod.status === "interface_ready" && "border-status-info/40 bg-status-info-light/10",
                    mod.status === "failed" && "border-destructive/40 bg-destructive/5",
                    mod.status === "pending" && "border-muted bg-muted/10",
                    isCriticalPath && mod.status !== "generated" && "border-l-2 border-l-international-orange",
                    isHovered && "shadow-md ring-1 ring-international-orange/30",
                    isConnectedToHovered && !isHovered && "ring-1 ring-status-info/40 bg-status-info-light/5",
                    hoveredModuleId && !isHovered && !isConnectedToHovered && "opacity-50",
                  )}
                  title={`Click to view details for ${mod.name}`}
                >
                  {/* Status dot + name */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          mod.status === "generated" && "bg-status-success",
                          mod.status === "interface_ready" && "bg-status-info",
                          mod.status === "failed" && "bg-destructive",
                          mod.status === "pending" && "bg-muted-foreground",
                        )}
                      />
                      <p className="text-xs font-semibold text-foreground truncate">{mod.name}</p>
                    </div>
                    {isCriticalPath && (
                      <span className="text-xs font-mono text-international-orange bg-international-orange-light/30 px-1 py-0.5 rounded flex-shrink-0">
                        CP
                      </span>
                    )}
                  </div>

                  {/* IO summary — inputs & outputs at a glance */}
                  {(mod.outputs.length > 0 || mod.inputs.length > 0) && (
                    <div className="hidden md:block space-y-1 mt-1.5">
                      {mod.outputs.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">Out:</span>
                          {mod.outputs.slice(0, 2).map((out, j) => (
                            <span key={j} className="text-[10px] text-foreground bg-muted/60 rounded px-1 py-0.5 leading-tight truncate max-w-[100px]">{out}</span>
                          ))}
                          {mod.outputs.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{mod.outputs.length - 2}</span>
                          )}
                        </div>
                      )}
                      {mod.inputs.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">In:</span>
                          {mod.inputs.slice(0, 2).map((inp, j) => (
                            <span key={j} className="text-[10px] text-foreground bg-muted/60 rounded px-1 py-0.5 leading-tight truncate max-w-[100px]">{inp}</span>
                          ))}
                          {mod.inputs.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{mod.inputs.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Compact stats */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    {moduleConnections.length > 0 && (
                      <span className="flex items-center gap-0.5" title={`${moduleConnections.length} interface connection${moduleConnections.length !== 1 ? "s" : ""}`}>
                        <ArrowDownRight className="h-2.5 w-2.5" />
                        {moduleConnections.length} interface{moduleConnections.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {mod.status === "generated" && (
                      <CheckCircle2 className="h-2.5 w-2.5 text-status-success ml-auto" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Interface connections list */}
        {connections.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Interface Connections
            </p>
            <div className="flex flex-wrap gap-2">
              {connections.map((conn, idx) => (
                <div
                  key={`${conn.fromId}-${conn.toId}-${idx}`}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-all duration-200",
                    (hoveredModuleId === conn.fromId || hoveredModuleId === conn.toId)
                      ? "border-status-info/50 bg-status-info-light/20 text-foreground"
                      : "border-muted bg-muted/20 text-muted-foreground",
                  )}
                >
                  <button
                    onClick={() => onModuleClick(conn.fromId)}
                    className="font-medium hover:text-international-orange transition-colors"
                  >
                    {conn.fromName}
                  </button>
                  <ArrowRight className="h-3 w-3 flex-shrink-0" />
                  <button
                    onClick={() => onModuleClick(conn.toId)}
                    className="font-medium hover:text-international-orange transition-colors"
                  >
                    {conn.toName}
                  </button>
                  <span className="text-xs font-mono opacity-70 ml-0.5">({conn.label})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
          <span className="font-medium">Status:</span>
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-muted-foreground" /> Pending
          </span>
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-status-info" /> Dims Planned
          </span>
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-status-success" /> CAD Generated
          </span>
          <span className="flex items-center gap-1 ml-2">
            <span className="text-xs font-mono text-international-orange bg-international-orange-light/30 px-1 py-0.5 rounded">CP</span> Critical Path
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Collapsible Section ──────────────────────────────────────────────

/**
 * CollapsibleSection — Reusable collapsible card wrapper for carrying
 * content from earlier stages into later stages without overwhelming the page.
 */
function CollapsibleSection({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}): React.ReactNode {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <Card>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-4 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {isOpen
          ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        }
      </button>
      {isOpen && <div className="px-4 pb-4 border-t pt-4">{children}</div>}
    </Card>
  )
}

// ─── Fade In (crossfade for batch → module list transition) ──────────

/**
 * FadeIn — Subtle opacity fade when a section mounts.
 * Used to smooth the transition when batch progress grid disappears
 * and the module list appears.
 */
function FadeIn({ children }: { children: React.ReactNode }): React.ReactNode {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div
      className="transition-opacity duration-500 ease-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {children}
    </div>
  )
}

// ─── Concept → Build Diff ─────────────────────────────────────────────

/**
 * ConceptBuildDiff — Shows redline diffs for a module between what Concept
 * assumed and what Build determined through CAD generation.
 *
 * Data sources:
 * - mod.result?.assumptions — what the AI resolved during CAD generation
 * - mod.result?.validationWarnings — what Build found that needs attention
 * - mod.interfaceDefinition — Build's dimensional spec (enriches Concept)
 * - mod.result?.bbox — precise dimensions from CAD (vs Concept's vague estimates)
 */
function ConceptBuildDiff({ module: mod }: { module: CadLabModule }): React.ReactNode {
  const items: RedlineItem[] = []

  // Resolved assumptions — things the AI had to decide during Build
  if (mod.result?.assumptions) {
    for (const assumption of mod.result.assumptions) {
      items.push({
        label: "Assumption",
        before: "Unspecified in concept",
        after: assumption,
      })
    }
  }

  // Dimensional refinement — Concept had vague key parts, Build has precise dimensions
  if (mod.result?.bbox && mod.keyParts.length > 0) {
    items.push({
      label: "Dimensions",
      before: `${mod.keyParts.length} components (no dimensions)`,
      after: `${mod.result.bbox.xLen}×${mod.result.bbox.yLen}×${mod.result.bbox.zLen} mm bounding box, ${mod.result.massGrams ?? "?"} g`,
    })
  }

  // Mass refinement
  if (mod.result?.massGrams != null) {
    items.push({
      label: "Mass",
      before: "Estimated from concept",
      after: `${mod.result.massGrams} g (from CAD model)`,
    })
  }

  // DFM findings — things Concept couldn't know
  if (mod.result?.dfm && !mod.result.dfm.printable) {
    items.push({
      label: "Printability",
      before: "Assumed printable",
      after: `Not printable — ${mod.result.dfm.issues.length} DFM issue${mod.result.dfm.issues.length !== 1 ? "s" : ""} found`,
    })
  }

  // Validation warnings become redline items
  if (mod.result?.validationWarnings) {
    for (const warning of mod.result.validationWarnings) {
      items.push({
        label: "Warning",
        before: null,
        after: warning,
      })
    }
  }

  if (items.length === 0) return null

  return <RedlineDiff fromStage="Concept" toStage="Build" items={items} />
}

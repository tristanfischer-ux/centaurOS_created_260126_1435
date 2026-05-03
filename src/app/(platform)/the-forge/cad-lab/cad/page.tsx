"use client"

/**
 * @file cad/page.tsx — The Forge: CAD stage (Stage 5).
 *
 * @description Unified CAD generation page. Generates a parametric CAD model
 * via GenCAD for the entire product. Module decomposition is shown as
 * collapsible context.
 *
 * Pipeline: Design → Specify → Source → Assemble → **CAD**
 *
 * Gate: requires research + modules (from Design stage).
 */

import { useState, useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Box,
  Play,
  Download,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Layers,
  ClipboardList,
  FileDown,
} from "lucide-react"

import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useCadLab } from "../cad-lab-context"
import { FullscreenOverlay } from "../cad-lab-utils"
import { ModuleResultsView, type ViewTab } from "../components/module-results-view"
import { useRegisterScreenContext } from "@/contexts/screen-context"
import { DesignReportDialog } from "../components/design-report-dialog"
import { ProviderComparison } from "../components/provider-comparison"

// ─── Synthetic module ID for unified model ────────────────────────────
const UNIFIED_MODULE_ID = "__unified__"

// ─── Page Component ──────────────────────────────────────────────────

export default function CadStagePage(): React.ReactNode {
  const router = useRouter()
  const {
    subject,
    hasResearch,
    modules = [],
    diagnosticAnswers,
    isResearching,
    isDecomposing,
    handleDownload,
    progressLines,
    // Unified generation
    unifiedResult,
    isGeneratingUnified,
    handleGenerateUnifiedModel,
    visualStyle,
    systemIllustrationStatus,
    providerResults,
    isComparingProviders,
  } = useCadLab()

  // INTENT: CAD stage gate — mirrors getStageAccess() logic.
  // Requires research + modules (from Design stage).
  useEffect(() => {
    if (!hasResearch || modules.length === 0) {
      router.replace(FORGE_ROUTES.cadLab)
    }
  }, [hasResearch, modules.length, router])

  // ── Local UI state ──
  const [activeViewTab, setActiveViewTab] = useState<ViewTab>("3d")
  const [fullscreenView, setFullscreenView] = useState<string | null>(null)
  const [modulesExpanded, setModulesExpanded] = useState(false)
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)

  // ── Derived state ──
  const designStillRunning = systemIllustrationStatus === "generating"
  const cadBusy = isResearching || isDecomposing || isGeneratingUnified || designStillRunning
  const hasUnifiedResult = unifiedResult?.success === true
  const hasDownloadable = !!(unifiedResult?.stepData || unifiedResult?.stepUrl || unifiedResult?.stlData || unifiedResult?.stlUrl)

  // ── Spec summary ──
  const specSummary = useMemo(() => {
    const processes = new Set<string>()
    const materials = new Set<string>()
    for (const mod of modules) {
      const diag = diagnosticAnswers[mod.id]
      if (diag?.mfg_process) processes.add(diag.mfg_process)
      if (diag?.material) materials.add(diag.material)
    }
    return {
      processes: [...processes],
      materials: [...materials],
      specifiedCount: modules.filter((m) => m.status === "specified" || m.status === "generated").length,
    }
  }, [modules, diagnosticAnswers])

  // ── Unified download ──
  const handleDownloadUnified = useCallback(() => {
    if (!unifiedResult) return
    if (unifiedResult.stepData) handleDownload(`${subject || "unified"}.step`, unifiedResult.stepData, false)
    else if (unifiedResult.stepUrl) {
      const link = document.createElement("a")
      link.href = unifiedResult.stepUrl
      link.download = `${subject || "unified"}.step`
      link.click()
    }
    if (unifiedResult.stlData) handleDownload(`${subject || "unified"}.stl`, unifiedResult.stlData, true)
    else if (unifiedResult.stlUrl) {
      const link = document.createElement("a")
      link.href = unifiedResult.stlUrl
      link.download = `${subject || "unified"}.stl`
      link.click()
    }
  }, [unifiedResult, handleDownload, subject])

  // Screen context for specialists
  useRegisterScreenContext(
    useMemo(() => ({
      pageTitle: `The Forge — CAD: ${subject}`,
      summary: `CAD generation stage. ${hasUnifiedResult ? "Unified model generated." : "Awaiting generation."}`,
    }), [subject, hasUnifiedResult]),
  )

  if (!hasResearch || modules.length === 0) return null

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Box className="h-5 w-5 text-international-orange" />
            CAD Generation
            <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider">Beta</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate a parametric CAD model for the complete product.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push(FORGE_ROUTES.cadLabAssemble)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Assemble
        </Button>
      </div>

      {/* ── Product card with Generate button ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{subject}</p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {specSummary.processes.length > 0 && (
                  <span>Processes: {specSummary.processes.join(", ")}</span>
                )}
                {specSummary.materials.length > 0 && (
                  <span>Materials: {specSummary.materials.join(", ")}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setIsReportDialogOpen(true)}
              >
                <FileDown className="h-4 w-4" />
                <span className="hidden sm:inline">Report</span>
              </Button>
              {hasUnifiedResult && hasDownloadable && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleDownloadUnified}
                >
                  <Download className="h-3 w-3" />
                  Download STEP + STL
                </Button>
              )}
              <Button
                onClick={handleGenerateUnifiedModel}
                disabled={cadBusy}
                className="gap-1.5"
              >
                {isGeneratingUnified ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Generating...</>
                ) : designStillRunning ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Waiting for Design...</>
                ) : hasUnifiedResult ? (
                  <><Play className="h-4 w-4" />Regenerate Model</>
                ) : (
                  <><Play className="h-4 w-4" />Generate CAD Model</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Collapsible module breakdown — hidden when hero-image path is active ── */}
      {!visualStyle?.heroImagePrompt && (
        <Card>
          <button
            type="button"
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
            onClick={() => setModulesExpanded(!modulesExpanded)}
          >
            <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                Design Context
              </p>
              <p className="text-xs text-muted-foreground">
                {modules.length} modules inform the unified model
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs h-7"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(FORGE_ROUTES.cadLabSpecify)
                }}
              >
                <ClipboardList className="h-3 w-3" />
                View Specs
              </Button>
              {modulesExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>
          {modulesExpanded && (
            <CardContent className="pt-0 border-t">
              <div className="space-y-2 py-2">
                {modules.map((mod, i) => (
                  <div key={mod.id} className="flex items-start gap-3 py-1.5">
                    {mod.imageUrl ? (
                      <div className="h-8 w-8 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mod.imageUrl} alt={mod.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-muted-foreground">{i + 1}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{mod.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{mod.description || mod.purpose}</p>
                    </div>
                    <Badge variant="secondary" className="flex-shrink-0 text-xs">
                      {diagnosticAnswers[mod.id]?.mfg_process || "Unspecified"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Generation in progress — streaming status ── */}
      {isGeneratingUnified && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="h-5 w-5 animate-spin text-international-orange flex-shrink-0" />
              <p className="text-sm font-medium text-foreground">
                Generating CAD model...
              </p>
            </div>
            {progressLines.length > 0 && (
              <div className="space-y-1 pl-8">
                {progressLines.slice(-3).map((line, i) => (
                  <p
                    key={`${progressLines.length - 3 + i}`}
                    className={`text-xs ${i === Math.min(progressLines.length, 3) - 1 ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Unified model results ── */}
      {hasUnifiedResult && unifiedResult && (
        <ModuleResultsView
          result={unifiedResult}
          moduleName={subject || "Unified Model"}
          showCode={false}
          setShowCode={() => {}}
          codeCopied={false}
          onCopyCode={() => {}}
          activeViewTab={activeViewTab}
          setActiveViewTab={setActiveViewTab}
          onFullscreen={(view) => setFullscreenView(view)}
          moduleId={UNIFIED_MODULE_ID}
          onDownload={handleDownload}
        />
      )}

      {/* ── Provider A/B comparison grid ── */}
      <ProviderComparison
        providerResults={providerResults}
        isComparing={isComparingProviders}
      />

      {/* ── Fullscreen SVG overlay ── */}
      {fullscreenView && unifiedResult && (
        <FullscreenOverlay
          view={fullscreenView}
          result={unifiedResult}
          onClose={() => setFullscreenView(null)}
        />
      )}

      <DesignReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        stage="cad"
        stageData={{ unifiedCadResult: unifiedResult }}
      />
    </div>
  )
}

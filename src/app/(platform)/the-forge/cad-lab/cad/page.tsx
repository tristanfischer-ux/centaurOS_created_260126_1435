"use client"

/**
 * @file cad/page.tsx — The Forge: CAD stage (Stage 5 — Beta).
 *
 * @description Dedicated CAD generation page. Consumes existing context handlers
 * to generate per-module CadQuery models and build the system assembly.
 * No tabs — single-purpose page with generation controls and results display.
 *
 * Pipeline: Design → Specify → Source → Assemble → **CAD (Beta)**
 *
 * Gate: requires manufacturing orders OR all modules specified.
 */

import { useState, useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Box,
  Play,
  Download,
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Layers,
  RotateCcw,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useCadLab } from "../cad-lab-context"
import { FullscreenOverlay } from "../cad-lab-utils"
import { ModuleResultsView, type ViewTab } from "../components/module-results-view"
import { IntegrationView } from "../components/integration-view"
import { ModuleFlowCanvas } from "../components/module-flow-canvas"
import { useRegisterScreenContext } from "@/contexts/screen-context"
import type { CadLabResult } from "@/lib/cad-lab-types"

// ─── Page Component ──────────────────────────────────────────────────

export default function CadStagePage(): React.ReactNode {
  const router = useRouter()
  const {
    subject,
    hasResearch,
    modules,
    diagnosticAnswers,
    referenceModel,
    isAnyLoading,
    // Generation handlers
    handleGenerateSingleModule,
    handleGenerateAllModules,
    handleGenerateIntegration,
    handleDownload,
    // Generation state
    generatingModuleIds,
    isBatchRunning,
    batchProgress,
    generatedModuleCount,
    // Integration state
    isIntegrating,
    integrationError,
    setIntegrationError,
    integratedAssemblyStlUrl,
    integrationAssemblyCode,
    // Module expansion
    expandedModuleId,
    setExpandedModuleId,
    // Interface contracts for flow canvas
    interfaceContracts,
    unmatchedPorts,
    // Gate: CAD requires manufacturing orders OR all modules specified
    manufacturingOrderCount,
    isSpecificationComplete,
  } = useCadLab()

  // INTENT: CAD stage gate — mirrors getStageAccess() logic. Redirect to
  // Assemble (previous stage) if the user navigates here before the gate is met.
  useEffect(() => {
    if (!hasResearch || modules.length === 0) {
      router.replace(FORGE_ROUTES.cadLab)
      return
    }
    if (manufacturingOrderCount === 0 && !isSpecificationComplete) {
      router.replace(FORGE_ROUTES.cadLabAssemble)
    }
  }, [hasResearch, modules.length, manufacturingOrderCount, isSpecificationComplete, router])

  // ── Local UI state ──
  // INTENT: Per-module view tab and copy state to avoid cross-module interference
  const [viewTabByModule, setViewTabByModule] = useState<Record<string, ViewTab>>({})
  const [fullscreenView, setFullscreenView] = useState<string | null>(null)
  const [viewingModuleId, setViewingModuleId] = useState<string | null>(null)
  const [showCodeSet, setShowCodeSet] = useState<Set<string>>(new Set())
  const [copiedModuleId, setCopiedModuleId] = useState<string | null>(null)

  const getViewTab = (moduleId: string): ViewTab => viewTabByModule[moduleId] ?? "3d"
  const setViewTab = useCallback((moduleId: string, tab: ViewTab) => {
    setViewTabByModule((prev) => ({ ...prev, [moduleId]: tab }))
  }, [])

  const handleCopyCode = useCallback((code: string, moduleId: string) => {
    navigator.clipboard.writeText(code)
    setCopiedModuleId(moduleId)
    setTimeout(() => setCopiedModuleId(null), 2000)
  }, [])

  // ── Derived state ──
  const allGenerated = generatedModuleCount === modules.length && modules.length > 0
  const someGenerated = generatedModuleCount > 0
  const someNotGenerated = modules.some((m) => m.status !== "generated")
  const failedModuleCount = modules.filter((m) => m.status === "failed").length

  // Fullscreen overlay result
  const viewingResult = viewingModuleId
    ? (modules.find((m) => m.id === viewingModuleId)?.result as CadLabResult | undefined) ?? null
    : null

  // Spec summary
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

  // Download all helper
  const handleDownloadAll = useCallback(() => {
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
  }, [modules, handleDownload])

  // Screen context for specialists
  useRegisterScreenContext(
    useMemo(() => ({
      pageTitle: `The Forge — CAD: ${subject}`,
      summary: `CAD generation stage. ${generatedModuleCount} of ${modules.length} modules generated.`,
    }), [subject, generatedModuleCount, modules.length]),
  )

  if (!hasResearch || modules.length === 0 || (manufacturingOrderCount === 0 && !isSpecificationComplete)) return null

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Box className="h-5 w-5 text-international-orange" />
            CAD Generation
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-international-orange/10 text-international-orange border border-international-orange/20">
              Beta
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate parametric CadQuery models for each module and build the system assembly.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push(FORGE_ROUTES.cadLabAssemble)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Assemble
        </Button>
      </div>

      {/* ── Spec summary card ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {modules.length} module{modules.length !== 1 ? "s" : ""} ready for CAD generation
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{specSummary.specifiedCount} specified</span>
                {specSummary.processes.length > 0 && (
                  <span>Processes: {specSummary.processes.join(", ")}</span>
                )}
                {specSummary.materials.length > 0 && (
                  <span>Materials: {specSummary.materials.join(", ")}</span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(FORGE_ROUTES.cadLabSpecify)}
              className="gap-1.5 text-xs"
            >
              <ClipboardList className="h-3 w-3" />
              View Specs
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Progress bar ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{generatedModuleCount} of {modules.length} modules generated</span>
          <span>{Math.round((generatedModuleCount / Math.max(modules.length, 1)) * 100)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-international-orange rounded-full transition-all duration-500"
            style={{ width: `${(generatedModuleCount / Math.max(modules.length, 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* ── Sticky "Generate All" bar ── */}
      {modules.length > 0 && someNotGenerated && (
        <div className="sticky top-[52px] z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border shadow-sm">
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

      {/* ── Batch progress grid ── */}
      {modules.some((m) => batchProgress[m.id]) && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Generation Progress</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((mod) => {
              const status = batchProgress[mod.id]
              if (!status) return null
              const isGenerating = status === "interface" || status === "generating"
              const isDone = status === "done"
              const isError = status === "error"
              const isQueued = status === "queued"

              return (
                <div
                  key={mod.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                    isDone && "border-status-success/30 bg-status-success-light/10",
                    isError && "border-destructive/30 bg-destructive/5",
                    isGenerating && "border-international-orange/30 bg-international-orange-light/10",
                    isQueued && "border-border",
                  )}
                >
                  <div className="flex-shrink-0">
                    {isDone && <CheckCircle2 className="h-5 w-5 text-status-success" />}
                    {isError && <AlertTriangle className="h-5 w-5 text-destructive" />}
                    {isGenerating && <Loader2 className="h-5 w-5 text-international-orange animate-spin" />}
                    {isQueued && <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{mod.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{status}</p>
                  </div>
                  {isError && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-shrink-0 h-7 text-xs"
                      onClick={() => handleGenerateSingleModule(mod.id)}
                      disabled={isAnyLoading}
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Module flow canvas — shows when 2+ modules exist ── */}
      {modules.length > 1 && (
        <ModuleFlowCanvas
          modules={modules}
          onModuleClick={(id) => setExpandedModuleId(expandedModuleId === id ? null : id)}
          interfaceContracts={interfaceContracts}
          generatingModuleIds={generatingModuleIds}
          unmatchedPorts={unmatchedPorts}
        />
      )}

      {/* ── Integration view (all modules generated) ── */}
      {allGenerated && (
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

      {/* ── All modules generated celebration ── */}
      {allGenerated && (
        <div className="rounded-xl border border-status-success/30 bg-gradient-to-r from-status-success-light/20 via-background to-status-info-light/10 p-5">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 h-12 w-12 rounded-full bg-status-success-light flex items-center justify-center">
              <Zap className="h-6 w-6 text-status-success" />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">All {modules.length} Modules Generated</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CAD models are ready. Download STEP and STL files for manufacturing.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleDownloadAll}
              >
                <Download className="h-3 w-3" />
                Download All STEP + STL
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Partial completion with failures ── */}
      {someGenerated && !allGenerated && failedModuleCount > 0 && (
        <div className="rounded-xl border border-warning/30 bg-gradient-to-r from-warning/10 via-background to-background p-5">
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
                  Some modules failed during generation. You can retry the failed ones.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs border-warning/40 text-warning hover:bg-warning/20"
                  onClick={handleGenerateAllModules}
                  disabled={isAnyLoading}
                >
                  <RotateCcw className="h-3 w-3" /> Retry Failed Modules
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleDownloadAll}
                >
                  <Download className="h-3 w-3" />
                  Download Generated ({generatedModuleCount})
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Module list ── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Modules ({modules.length})</h2>
        {modules.map((mod) => {
          const isExpanded = expandedModuleId === mod.id
          const isGenerating = generatingModuleIds.has(mod.id)
          const isGenerated = mod.status === "generated"
          const result = mod.result as CadLabResult | undefined

          return (
            <Card key={mod.id} className={cn(isGenerated && "border-status-success/20")}>
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
                    {isGenerated && <Badge variant="success">Generated</Badge>}
                    {isGenerating && <Badge variant="warning">Generating</Badge>}
                    {!isGenerated && !isGenerating && <Badge variant="secondary">Pending</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{mod.purpose}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isGenerated && !isGenerating && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleGenerateSingleModule(mod.id)
                      }}
                      disabled={isAnyLoading}
                    >
                      <Play className="h-3 w-3" /> Generate
                    </Button>
                  )}
                  {isGenerating && <Loader2 className="h-4 w-4 animate-spin text-international-orange" />}
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <CardContent className="pt-0 space-y-4 border-t">
                  {/* Description */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</h4>
                    <p className="text-sm text-foreground">{mod.description}</p>
                  </div>

                  {/* Key parts */}
                  {mod.keyParts.length > 0 && (
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
                  )}

                  {/* Risks & unknowns */}
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
                                <span className="text-muted-foreground mt-0.5">?</span>
                                {u}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Blueprint image */}
                  {mod.imageUrl && (
                    <div className="aspect-[16/9] rounded-md overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mod.imageUrl}
                        alt={mod.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Generation action for expanded pending module */}
                  {!isGenerated && !isGenerating && (
                    <div className="flex justify-center py-4">
                      <Button
                        onClick={() => handleGenerateSingleModule(mod.id)}
                        disabled={isAnyLoading}
                        className="gap-1.5"
                      >
                        <Play className="h-4 w-4" />
                        Generate CAD Model
                      </Button>
                    </div>
                  )}

                  {/* Generating indicator */}
                  {isGenerating && (
                    <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                      Generating CadQuery model...
                    </div>
                  )}

                  {/* Generated but result data lost — offer regeneration */}
                  {isGenerated && !result && !isGenerating && (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      <span>Result data unavailable.</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => handleGenerateSingleModule(mod.id)}
                        disabled={isAnyLoading}
                      >
                        <RotateCcw className="h-3 w-3" /> Regenerate
                      </Button>
                    </div>
                  )}

                  {/* Module results (when generated) */}
                  {isGenerated && result && (
                    <ModuleResultsView
                      result={result}
                      moduleName={mod.name}
                      code={mod.code}
                      showCode={showCodeSet.has(mod.id)}
                      setShowCode={(v: boolean) => setShowCodeSet((prev) => {
                        const next = new Set(prev)
                        if (v) next.add(mod.id)
                        else next.delete(mod.id)
                        return next
                      })}
                      codeCopied={copiedModuleId === mod.id}
                      onCopyCode={(code) => handleCopyCode(code, mod.id)}
                      activeViewTab={getViewTab(mod.id)}
                      setActiveViewTab={(tab) => setViewTab(mod.id, tab)}
                      onFullscreen={(view, moduleId) => {
                        setViewingModuleId(moduleId)
                        setFullscreenView(view)
                      }}
                      moduleId={mod.id}
                      onDownload={handleDownload}
                      svgUrls={mod.svgUrls}
                      mfgProcess={diagnosticAnswers?.[mod.id]?.mfg_process}
                    />
                  )}

                  {/* SVG preview fallback for older data */}
                  {(mod.svgUrls?.iso || result?.svgIso) && isGenerated && !result?.stlData && (
                    <div className="bg-muted rounded-lg p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mod.svgUrls?.iso ?? result?.svgIso}
                        alt={`${mod.name} isometric view`}
                        className="w-full"
                      />
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* ── Fullscreen SVG overlay ── */}
      {fullscreenView && viewingResult && (
        <FullscreenOverlay
          view={fullscreenView}
          result={viewingResult}
          onClose={() => { setFullscreenView(null); setViewingModuleId(null) }}
        />
      )}
    </div>
  )
}

"use client"

/**
 * @file build/page.tsx — The Forge: Build stage (Stage 2).
 *
 * @description Module decomposition, batch pipeline, per-module interface
 * definition and CAD generation. Shows live batch progress grid and
 * per-module results with SVG previews, metrics, and DFM analysis.
 *
 * Gate: redirects to /the-forge/cad-lab if no research exists.
 */

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Box,
  Code2,
  Timer,
  Zap,
  CheckCircle2,
  AlertTriangle,
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
  BarChart3,
  ShoppingCart,
  ClipboardCheck,
  Layers,
  Clock,
  Puzzle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import dynamic from "next/dynamic"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { CadLabWhileYouWait } from "@/components/cad/cad-lab-while-you-wait"

const STLViewer = dynamic(
  () => import("@/components/cad/stl-viewer").then((m) => ({ default: m.STLViewer })),
  { ssr: false, loading: () => <Skeleton className="w-full h-[400px] rounded-lg" /> },
)
import type { CadLabResult } from "@/lib/cad-lab-types"

import { useCadLab } from "../cad-lab-context"
import { Metric, InlineSvg, SvgView, FullscreenOverlay, extractProductSummary } from "../cad-lab-utils"

// ─── View Tab Type ───────────────────────────────────────────────────

type ViewTab = "3d" | "iso" | "exploded" | "front" | "back" | "left" | "right" | "top"

// ─── Page Component ──────────────────────────────────────────────────

export default function CadLabBuildPage(): React.ReactNode {
  const router = useRouter()
  const {
    hasResearch, isAnyLoading,
    subject, editableReport,
    modules,
    activeModuleId,
    isDecomposing, handleDecompose,
    handleModuleGenerate, handleGenerateAllModules,
    isBatchRunning, batchProgress,
    generatedModuleCount,
    diagCompletedCount,
    handleDownload,
  } = useCadLab()

  // Local UI state for result viewing
  const [activeViewTab, setActiveViewTab] = useState<ViewTab>("3d")
  const [fullscreenView, setFullscreenView] = useState<string | null>(null)
  const [viewingModuleId, setViewingModuleId] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  // Dialog state for viewing module results — reset view tab on open
  const [dialogModuleId, setDialogModuleId] = useState<string | null>(null)
  const dialogModule = dialogModuleId ? modules.find((m) => m.id === dialogModuleId) : null
  const dialogResult = dialogModule?.result as CadLabResult | undefined

  const openModuleDialog = useCallback((moduleId: string) => {
    setActiveViewTab("3d")
    setShowCode(false)
    setDialogModuleId(moduleId)
  }, [])

  // Download All ZIP — collects all STEP + STL files into a single download
  const [isDownloadingAll, setIsDownloadingAll] = useState(false)
  const handleDownloadAll = useCallback(async () => {
    setIsDownloadingAll(true)
    try {
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()
      let fileCount = 0

      for (const mod of modules) {
        if (mod.status !== "generated" || !mod.result) continue
        const result = mod.result as CadLabResult
        const safeName = mod.name.replace(/[^a-zA-Z0-9_-]/g, "_")

        if (result.stepData) {
          const bytes = Uint8Array.from(atob(result.stepData), (c) => c.charCodeAt(0))
          zip.file(`${safeName}.step`, bytes)
          fileCount++
        }
        if (result.stlData) {
          const bytes = Uint8Array.from(atob(result.stlData), (c) => c.charCodeAt(0))
          zip.file(`${safeName}.stl`, bytes)
          fileCount++
        }
      }

      if (fileCount === 0) return

      const blob = await zip.generateAsync({ type: "blob" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${subject.replace(/[^a-zA-Z0-9_-]/g, "_")}_CAD_files.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[CAD-LAB] Download All failed:", err)
    } finally {
      setIsDownloadingAll(false)
    }
  }, [modules, subject])

  // Gate: redirect if no research
  useEffect(() => {
    if (!hasResearch) {
      router.replace("/the-forge/cad-lab")
    }
  }, [hasResearch, router])

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

  if (!hasResearch) return null

  return (
    <div className="space-y-6">
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your product is manufacturing-ready. Explore the full analysis, procurement details, and review package.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => router.push("/the-forge/cad-lab/analysis")}>
                  <BarChart3 className="h-3 w-3" /> View Analysis
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => router.push("/the-forge/cad-lab/procurement")}>
                  <ShoppingCart className="h-3 w-3" /> Procurement & Costs
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => router.push("/the-forge/cad-lab/review")}>
                  <ClipboardCheck className="h-3 w-3" /> Review Package
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleDownloadAll}
                  disabled={isDownloadingAll}
                >
                  {isDownloadingAll ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Zipping...</>
                  ) : (
                    <><Download className="h-3 w-3" /> Download All (ZIP)</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Overview ── */}
      {modules.length > 0 && (
        <ProductOverview
          subject={subject}
          report={editableReport}
          moduleCount={modules.length}
          totalComponents={modules.reduce((s, m) => s + m.keyParts.length, 0)}
          criticalPathWeeks={Math.max(...modules.map((m) => m.leadWeeks))}
          totalRisks={modules.reduce((s, m) => s + m.failureModes.length, 0)}
          totalUnknowns={modules.reduce((s, m) => s + m.unknowns.length, 0)}
        />
      )}

      {/* ── Module Decomposition ── */}
      <Card>
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
            Map your product into manufacturable sub-assemblies. Each module gets its own parametric CAD pipeline with dimension planning and DFM analysis.
          </p>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleDecompose}
              disabled={isAnyLoading || isDecomposing || !hasResearch}
              variant={modules.length > 0 ? "secondary" : "outline"}
            >
              {isDecomposing ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Mapping sub-assemblies...</>
              ) : modules.length > 0 ? (
                <><RotateCcw className="h-4 w-4 mr-2" />Re-map Modules</>
              ) : (
                <><Box className="h-4 w-4 mr-2" />Map Sub-Assemblies</>
              )}
            </Button>
            {modules.length > 0 && modules.some((m) => m.status !== "generated") && (
              <Button onClick={handleGenerateAllModules} disabled={isAnyLoading} variant="default">
                {isBatchRunning ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating All...</>
                ) : (
                  <><Play className="h-4 w-4 mr-2" />Generate All Modules</>
                )}
              </Button>
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
                const stepIndex = status === "queued" ? 0 : status === "interface" ? 1 : status === "generating" ? 2 : status === "done" ? 3 : -1
                const isError = status === "error"
                const isActive = status === "interface" || status === "generating"
                const isDone = status === "done"

                return (
                  <div
                    key={mod.id}
                    className={`border rounded-lg p-3 transition-all duration-300 ${
                      isActive ? "border-international-orange/40 bg-gradient-to-r from-international-orange-light/10 to-background shadow-sm" :
                      isDone ? "border-status-success/30 bg-status-success-light/10 cursor-pointer hover:shadow-sm" :
                      isError ? "border-destructive/30 bg-status-error-light/10" :
                      "border-muted bg-muted/10"
                    }`}
                    onClick={isDone ? () => openModuleDialog(mod.id) : undefined}
                    role={isDone ? "button" : undefined}
                    tabIndex={isDone ? 0 : undefined}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* Module info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
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

                      {/* Status label + expand hint for completed */}
                      <div className="flex-shrink-0 w-32 text-right">
                        <span className={`text-xs font-medium ${
                          isDone ? "text-status-success" :
                          isActive ? "text-international-orange" :
                          isError ? "text-destructive" :
                          "text-muted-foreground"
                        }`}>
                          {isDone ? "Complete — click to open" :
                           status === "interface" ? "Planning dims..." :
                           status === "generating" ? "Building CAD..." :
                           isError ? "Failed" :
                           "In queue"}
                        </span>
                      </div>
                    </div>

                    {/* Progress bar for active modules */}
                    {isActive && (
                      <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-international-orange rounded-full animate-pulse" style={{ width: status === "interface" ? "35%" : "70%" }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* While You Wait — productive activities during batch generation */}
          {isBatchRunning && modules.length > 0 && (
            <CadLabWhileYouWait
              modules={modules}
              diagCompletedCount={diagCompletedCount}
              hasResearch={hasResearch}
            />
          )}

          {/* Module grid — compact cards instead of long accordion */}
          {modules.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {modules.map((mod) => (
                <div
                  key={mod.id}
                  className="border rounded-lg p-4 space-y-3 hover:bg-muted/30 transition-colors"
                >
                  {/* Module header row */}
                  <div className="flex items-start gap-3">
                    <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 mt-1.5 ${
                      mod.status === "generated" ? "bg-status-success"
                      : mod.status === "interface_ready" ? "bg-status-info"
                      : "bg-muted-foreground"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{mod.name}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{mod.purpose}</p>
                    </div>
                  </div>

                  {/* SVG thumbnail — shown when module has been generated */}
                  {mod.status === "generated" && (mod.result as CadLabResult | undefined)?.svgIso && (
                    <button
                      onClick={() => openModuleDialog(mod.id)}
                      className="w-full h-24 rounded-md bg-muted/30 border border-muted overflow-hidden cursor-pointer hover:border-international-orange/30 transition-colors"
                    >
                      <InlineSvg
                        src={(mod.result as CadLabResult).svgIso!}
                        alt={`${mod.name} preview`}
                        className="w-full h-full"
                      />
                    </button>
                  )}

                  {/* Module meta row */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {mod.leadWeeks}w lead
                    </span>
                    <span className="flex items-center gap-1">
                      <Puzzle className="h-3 w-3" />
                      {mod.keyParts.length} parts
                    </span>
                    {mod.result?.bbox && (
                      <span className="flex items-center gap-1 font-mono">
                        <Ruler className="h-3 w-3" />
                        {mod.result.bbox.xLen.toFixed(0)}×{mod.result.bbox.yLen.toFixed(0)}×{mod.result.bbox.zLen.toFixed(0)}mm
                      </span>
                    )}
                  </div>

                  {/* Module action */}
                  <div className="flex items-center gap-2">
                    {mod.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => handleModuleGenerate(mod.id, "interface")} disabled={activeModuleId !== null} className="text-xs h-8">
                        {activeModuleId === mod.id
                          ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Planning...</>
                          : <><Ruler className="h-3 w-3 mr-1" /> Plan Dimensions</>
                        }
                      </Button>
                    )}
                    {mod.status === "interface_ready" && (
                      <Button size="sm" variant="outline" onClick={() => handleModuleGenerate(mod.id, "generate")} disabled={activeModuleId !== null} className="text-xs h-8">
                        {activeModuleId === mod.id
                          ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Generating...</>
                          : <><Box className="h-3 w-3 mr-1" /> Generate CAD</>
                        }
                      </Button>
                    )}
                    {mod.status === "generated" && mod.result && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openModuleDialog(mod.id)}
                        className="text-xs h-8 gap-1"
                      >
                        <Maximize2 className="h-3 w-3" />
                        View Results
                      </Button>
                    )}
                    {mod.status === "generated" && (
                      <span className="text-xs text-status-success flex items-center gap-1 ml-auto">
                        <CheckCircle2 className="h-3 w-3" /> Generated
                      </span>
                    )}
                  </div>

                  {/* Expandable details */}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors py-1">
                      Details
                    </summary>
                    <div className="pt-2 space-y-2 border-t border-muted mt-1">
                      <p className="text-foreground">{mod.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {mod.keyParts.map((part, i) => (
                          <span key={i} className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">{part}</span>
                        ))}
                      </div>
                      {mod.failureModes.length > 0 && (
                        <div className="space-y-1">
                          {mod.failureModes.map((fm, i) => (
                            <div key={i} className="flex items-start gap-1 text-foreground">
                              <AlertTriangle className="h-3 w-3 text-status-warning flex-shrink-0 mt-0.5" />
                              <span>{fm}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── What's Next CTA — shown when all modules are generated ── */}
      {generatedModuleCount > 0 && generatedModuleCount === modules.length && !isBatchRunning && (
        <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/10 to-background">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Next: Engineering Analysis
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  View risk register, project timeline, and system-level engineering metrics.
                </p>
              </div>
              <Button onClick={() => router.push("/the-forge/cad-lab/analysis")} className="gap-1.5">
                <BarChart3 className="h-4 w-4" />
                Continue to Analysis
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Module Results Dialog ── */}
      <Dialog open={dialogModuleId !== null} onOpenChange={(open) => { if (!open) setDialogModuleId(null) }}>
        <DialogContent size="lg" className="max-h-[90vh]">
          {dialogModule && dialogResult && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Box className="h-4 w-4" />
                  {dialogModule.name}
                  {dialogResult.bbox && (
                    <span className="text-xs font-normal text-muted-foreground font-mono ml-2">
                      {dialogResult.bbox.xLen.toFixed(0)}×{dialogResult.bbox.yLen.toFixed(0)}×{dialogResult.bbox.zLen.toFixed(0)}mm
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[75vh]">
                <div className="pr-4">
                  <ModuleResultsView
                    result={dialogResult}
                    moduleName={dialogModule.name}
                    code={dialogModule.code}
                    showCode={showCode}
                    setShowCode={setShowCode}
                    codeCopied={codeCopied}
                    onCopyCode={handleCopyCode}
                    activeViewTab={activeViewTab}
                    setActiveViewTab={setActiveViewTab}
                    onFullscreen={(view, modId) => {
                      setViewingModuleId(modId)
                      setFullscreenView(view)
                    }}
                    moduleId={dialogModule.id}
                    onDownload={handleDownload}
                  />
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Fullscreen overlay ── */}
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

// ─── Product Overview ────────────────────────────────────────────────

/**
 * ProductOverview — Summarises the main product before listing its modules.
 *
 * @description Shows the product name, a brief excerpt from the research
 * report, and aggregate stats so the user understands the whole before
 * diving into individual sub-assemblies.
 */
function ProductOverview({
  subject,
  report,
  moduleCount,
  totalComponents,
  criticalPathWeeks,
  totalRisks,
  totalUnknowns,
}: {
  subject: string
  report: string
  moduleCount: number
  totalComponents: number
  criticalPathWeeks: number
  totalRisks: number
  totalUnknowns: number
}): React.ReactNode {
  const summary = extractProductSummary(report)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Product Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Product name */}
        <div>
          <h3 className="text-sm font-semibold text-foreground">{subject}</h3>
          {summary && (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{summary}</p>
          )}
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 border rounded-md bg-muted/20">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Puzzle className="h-3 w-3" /> Sub-Assemblies
            </p>
            <p className="text-sm font-semibold text-foreground font-mono">{moduleCount}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Box className="h-3 w-3" /> Components
            </p>
            <p className="text-sm font-semibold text-foreground font-mono">{totalComponents}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Critical Path
            </p>
            <p className="text-sm font-semibold text-foreground font-mono">{criticalPathWeeks}w</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Failure Modes
            </p>
            <p className="text-sm font-semibold text-foreground font-mono">{totalRisks}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" /> Open Questions
            </p>
            <p className="text-sm font-semibold text-foreground font-mono">{totalUnknowns}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
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
              {result.stepData && (
                <Button variant="outline" size="sm" onClick={() => onDownload(`${moduleName}.step`, result.stepData!, false)} className="gap-1 text-xs h-7">
                  <Download className="h-3 w-3" /> STEP
                </Button>
              )}
              {result.stlData && (
                <Button variant="outline" size="sm" onClick={() => onDownload(`${moduleName}.stl`, result.stlData!)} className="gap-1 text-xs h-7">
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
                {result.svgIso && <TabsTrigger value="iso" className="flex-1">Iso</TabsTrigger>}
                {result.svgExploded && <TabsTrigger value="exploded" className="flex-1">Exploded</TabsTrigger>}
                {result.svgFront && <TabsTrigger value="front" className="flex-1">Front</TabsTrigger>}
                {result.svgBack && <TabsTrigger value="back" className="flex-1">Back</TabsTrigger>}
                {result.svgLeft && <TabsTrigger value="left" className="flex-1">Left</TabsTrigger>}
                {result.svgRight && <TabsTrigger value="right" className="flex-1">Right</TabsTrigger>}
                {result.svgTop && <TabsTrigger value="top" className="flex-1">Top</TabsTrigger>}
              </TabsList>
              {result.stlData && (
                <TabsContent value="3d" className="mt-3">
                  <div className="h-[400px] bg-muted/30 rounded-lg overflow-hidden">
                    <STLViewer stlData={result.stlData} />
                  </div>
                </TabsContent>
              )}
              {result.svgIso && <TabsContent value="iso" className="mt-3"><SvgView src={result.svgIso} alt="Isometric" onClick={() => onFullscreen("iso", moduleId)} /></TabsContent>}
              {result.svgExploded && <TabsContent value="exploded" className="mt-3"><SvgView src={result.svgExploded} alt="Exploded" onClick={() => onFullscreen("exploded", moduleId)} /></TabsContent>}
              {result.svgFront && <TabsContent value="front" className="mt-3"><SvgView src={result.svgFront} alt="Front" onClick={() => onFullscreen("front", moduleId)} /></TabsContent>}
              {result.svgBack && <TabsContent value="back" className="mt-3"><SvgView src={result.svgBack} alt="Back" onClick={() => onFullscreen("back", moduleId)} /></TabsContent>}
              {result.svgLeft && <TabsContent value="left" className="mt-3"><SvgView src={result.svgLeft} alt="Left" onClick={() => onFullscreen("left", moduleId)} /></TabsContent>}
              {result.svgRight && <TabsContent value="right" className="mt-3"><SvgView src={result.svgRight} alt="Right" onClick={() => onFullscreen("right", moduleId)} /></TabsContent>}
              {result.svgTop && <TabsContent value="top" className="mt-3"><SvgView src={result.svgTop} alt="Top" onClick={() => onFullscreen("top", moduleId)} /></TabsContent>}
            </Tabs>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border rounded-md">
        {result.bbox && <Metric icon={<Box className="h-3.5 w-3.5" />} label="Bounding Box" value={`${result.bbox.xLen}×${result.bbox.yLen}×${result.bbox.zLen} mm`} />}
        {result.massGrams != null && <Metric label="Mass" value={`${result.massGrams} g`} />}
        {result.codeLines != null && <Metric icon={<Code2 className="h-3.5 w-3.5" />} label="Code Lines" value={`${result.codeLines}`} />}
        {result.generationTime != null && <Metric icon={<Timer className="h-3.5 w-3.5" />} label="Pipeline Time" value={`${(result.generationTime / 1000).toFixed(1)}s`} />}
        {result.fillRatio != null && <Metric label="Fill Ratio" value={`${result.fillRatio}%`} />}
        {result.stepSize != null && <Metric label="STEP Size" value={result.stepSize > 1024 ? `${(result.stepSize / 1024).toFixed(1)} MB` : `${result.stepSize} KB`} />}
      </div>

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
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Issues</p>
              {result.dfm.issues.map((issue, i) => (
                <div key={i} className={`p-2 rounded text-xs font-mono ${
                  issue.severity === "critical" ? "bg-status-error-light text-destructive"
                  : issue.severity === "warning" ? "bg-status-warning-light text-status-warning-dark"
                  : "bg-muted text-muted-foreground"
                }`}>
                  <span className="font-semibold uppercase">{issue.severity}:</span> {issue.message}
                </div>
              ))}
            </div>
          )}
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

"use client"

/**
 * @file design-section.tsx — Section 3: CAD Design & Generation.
 *
 * INTENT: Combines the module carousel, batch generation controls,
 * per-module 3D/SVG results viewer, and integration assembly into one
 * unified design section. Replaces the standalone Build page.
 *
 * DECISION: Reuses ModuleCarousel and IntegrationView components directly
 * rather than rebuilding them, since they already work well.
 */

import { useState, useCallback, useEffect } from "react"
import dynamic from "next/dynamic"
import {
  Box,
  Code2,
  Timer,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Maximize2,
  Printer,
  Copy,
  Check,
  Play,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { CadLabWhileYouWait } from "@/components/cad/cad-lab-while-you-wait"
import { ModuleCarousel } from "../../cad-lab/components/module-carousel"
import { IntegrationView } from "../../cad-lab/components/integration-view"
import { Metric, SvgView, FullscreenOverlay } from "../../cad-lab/cad-lab-utils"
import type { CadLabResult } from "@/lib/cad-lab-types"

import { useCadLab } from "../../cad-lab/cad-lab-context"

const STLViewer = dynamic(
  () => import("@/components/cad/stl-viewer").then((m) => ({ default: m.STLViewer })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full rounded-lg" /> },
)

type ViewTab = "3d" | "iso" | "exploded" | "front" | "back" | "left" | "right" | "top"

export function DesignSection(): React.ReactNode {
  const {
    modules,
    expandedModuleId, setExpandedModuleId,
    activeModuleId,
    handleGenerateSingleModule, handleGenerateAllModules,
    isBatchRunning, batchProgress,
    isAnyLoading,
    generatedModuleCount,
    diagCompletedCount,
    hasResearch,
    diagnosticAnswers,
    referenceModel,
    integratedAssemblyStlUrl,
    isIntegrating,
    integrationError, setIntegrationError,
    handleGenerateIntegration,
    handleDownload,
  } = useCadLab()

  const [fullscreenView, setFullscreenView] = useState<{ view: string; moduleId: string } | null>(null)
  const [activeViewTabs, setActiveViewTabs] = useState<Record<string, ViewTab>>({})
  const [showCode, setShowCode] = useState<Record<string, boolean>>({})
  const [codeCopied, setCodeCopied] = useState(false)

  const allModulesGenerated = modules.length > 0 && generatedModuleCount === modules.length
  const pendingCount = modules.filter((m) => m.status !== "generated").length

  const handleCopyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }, [])

  const handleViewResult = useCallback((moduleId: string) => {
    setExpandedModuleId(moduleId)
    requestAnimationFrame(() => {
      document.getElementById(`module-${moduleId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [setExpandedModuleId])

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-international-orange text-white text-xs font-bold">
            3
          </div>
          <h2 className="text-lg font-semibold text-foreground">Design</h2>
          {generatedModuleCount > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              {generatedModuleCount}/{modules.length} modules generated
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground ml-9">
          Generate CAD models for each sub-assembly. Build one at a time or batch all at once.
        </p>
      </div>

      {/* Batch generate all button */}
      {pendingCount > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {pendingCount} module{pendingCount > 1 ? "s" : ""} ready to generate
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Each module runs independently — results appear as they complete.
                </p>
              </div>
              <Button
                onClick={handleGenerateAllModules}
                disabled={isBatchRunning || isAnyLoading}
                className="gap-2"
              >
                {isBatchRunning ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                ) : (
                  <><Play className="h-4 w-4" /> Generate all ({pendingCount})</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Module carousel */}
      <ModuleCarousel
        modules={modules}
        batchProgress={batchProgress}
        isBatchRunning={isBatchRunning}
        activeModuleId={activeModuleId}
        onGenerate={handleGenerateSingleModule}
        onViewResult={handleViewResult}
      />

      {/* While-you-wait content during batch generation */}
      {isBatchRunning && (
        <CadLabWhileYouWait
          modules={modules}
          diagCompletedCount={diagCompletedCount}
          hasResearch={hasResearch}
          diagnosticAnswers={diagnosticAnswers}
        />
      )}

      {/* Per-module expanded results */}
      {modules.filter((m) => m.status === "generated" && m.result).map((mod) => (
        <div key={mod.id} id={`module-${mod.id}`}>
          <Card className={cn(expandedModuleId === mod.id && "ring-2 ring-international-orange/30")}>
            <CardHeader>
              <button
                onClick={() => setExpandedModuleId(expandedModuleId === mod.id ? null : mod.id)}
                className="flex items-center justify-between w-full text-left"
              >
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-status-success" />
                  {mod.name}
                </CardTitle>
                {expandedModuleId === mod.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CardHeader>
            {expandedModuleId === mod.id && mod.result && (
              <CardContent>
                <ModuleResultInline
                  result={mod.result}
                  moduleName={mod.name}
                  code={mod.code}
                  showCode={showCode[mod.id] ?? false}
                  setShowCode={(v) => setShowCode((p) => ({ ...p, [mod.id]: v }))}
                  codeCopied={codeCopied}
                  onCopyCode={handleCopyCode}
                  activeViewTab={activeViewTabs[mod.id] ?? "3d"}
                  setActiveViewTab={(v) => setActiveViewTabs((p) => ({ ...p, [mod.id]: v }))}
                  onFullscreen={(view) => setFullscreenView({ view, moduleId: mod.id })}
                  onDownload={handleDownload}
                />
              </CardContent>
            )}
          </Card>
        </div>
      ))}

      {/* Integration assembly */}
      <IntegrationView
        allModulesGenerated={allModulesGenerated}
        referenceModel={referenceModel}
        integratedAssemblyStlUrl={integratedAssemblyStlUrl}
        isIntegrating={isIntegrating}
        onGenerateIntegration={handleGenerateIntegration}
        integrationError={integrationError}
        onClearError={() => setIntegrationError(null)}
      />

      {/* Fullscreen overlay */}
      {fullscreenView && (() => {
        const mod = modules.find((m) => m.id === fullscreenView.moduleId)
        if (!mod?.result) return null
        return (
          <FullscreenOverlay
            view={fullscreenView.view}
            result={mod.result}
            onClose={() => setFullscreenView(null)}
          />
        )
      })()}
    </div>
  )
}

/**
 * Inline module result viewer — 3D/SVG tabs, metrics, DFM, code.
 *
 * DECISION: Extracted from the build page's ModuleResultsView as a
 * self-contained component rather than importing a 200-line inline function.
 */
function ModuleResultInline({
  result, moduleName, code,
  showCode, setShowCode, codeCopied, onCopyCode,
  activeViewTab, setActiveViewTab, onFullscreen, onDownload,
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
  onFullscreen: (view: string) => void
  onDownload: (filename: string, base64Data: string, isBinary?: boolean) => void
}): React.ReactNode {
  useEffect(() => {
    const available: ViewTab[] = []
    if (result.stlData) available.push("3d")
    if (result.svgIso) available.push("iso")
    if (result.svgExploded) available.push("exploded")
    if (result.svgFront) available.push("front")
    if (!available.includes(activeViewTab) && available.length > 0) {
      setActiveViewTab(available[0])
    }
  }, [result, activeViewTab, setActiveViewTab])

  const handleDownloadFromUrl = (url: string, filename: string): void => {
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    link.click()
  }

  return (
    <div className="space-y-4">
      {/* Views */}
      {(result.stlData || result.svgIso || result.svgFront || result.svgTop) && (
        <div className="border rounded-md">
          <div className="flex items-center justify-between p-3 border-b">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Box className="h-3.5 w-3.5" /> Views
            </p>
            <div className="flex items-center gap-1.5">
              {(result.stepData || result.stepUrl) && (
                <Button variant="outline" size="sm" onClick={() => result.stepData ? onDownload(`${moduleName}.step`, result.stepData!, false) : result.stepUrl && handleDownloadFromUrl(result.stepUrl, `${moduleName}.step`)} className="gap-1 text-xs h-7">
                  <Download className="h-3 w-3" /> STEP
                </Button>
              )}
              {(result.stlData || result.stlUrl) && (
                <Button variant="outline" size="sm" onClick={() => result.stlData ? onDownload(`${moduleName}.stl`, result.stlData!) : result.stlUrl && handleDownloadFromUrl(result.stlUrl, `${moduleName}.stl`)} className="gap-1 text-xs h-7">
                  <Download className="h-3 w-3" /> STL
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => onFullscreen(activeViewTab)} className="gap-1 text-xs h-7">
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
              {result.svgIso && <TabsContent value="iso" className="mt-3"><SvgView src={result.svgIso} alt="Isometric" onClick={() => onFullscreen("iso")} /></TabsContent>}
              {result.svgExploded && <TabsContent value="exploded" className="mt-3"><SvgView src={result.svgExploded} alt="Exploded" onClick={() => onFullscreen("exploded")} /></TabsContent>}
              {result.svgFront && <TabsContent value="front" className="mt-3"><SvgView src={result.svgFront} alt="Front" onClick={() => onFullscreen("front")} /></TabsContent>}
              {result.svgBack && <TabsContent value="back" className="mt-3"><SvgView src={result.svgBack} alt="Back" onClick={() => onFullscreen("back")} /></TabsContent>}
              {result.svgLeft && <TabsContent value="left" className="mt-3"><SvgView src={result.svgLeft} alt="Left" onClick={() => onFullscreen("left")} /></TabsContent>}
              {result.svgRight && <TabsContent value="right" className="mt-3"><SvgView src={result.svgRight} alt="Right" onClick={() => onFullscreen("right")} /></TabsContent>}
              {result.svgTop && <TabsContent value="top" className="mt-3"><SvgView src={result.svgTop} alt="Top" onClick={() => onFullscreen("top")} /></TabsContent>}
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
          {result.dfm.issues.length > 0 && (
            <div className="space-y-1.5">
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

      {/* Code toggle */}
      {code && (
        <details className="border rounded-md" open={showCode} onToggle={(e) => setShowCode((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer p-3 text-sm font-medium hover:bg-muted/50 transition-colors flex items-center gap-2">
            <Code2 className="h-3.5 w-3.5" /> CadQuery code
          </summary>
          <div className="p-3 border-t relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 gap-1 text-xs h-7"
              onClick={() => onCopyCode(code)}
            >
              {codeCopied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </Button>
            <pre className="font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto">
              {code}
            </pre>
          </div>
        </details>
      )}
    </div>
  )
}

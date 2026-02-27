"use client"

import { useEffect } from "react"
import {
  Box,
  Code2,
  Timer,
  AlertTriangle,
  Copy,
  Check,
  Maximize2,
  Download,
  Printer,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { STLViewer } from "@/components/cad/stl-viewer"
import { Badge } from "@/components/ui/badge"
import type { CadLabResult } from "@/lib/cad-lab-types"
import { Metric, SvgView, RenderedView } from "../cad-lab-utils"
import { useRenderedViews } from "@/hooks/use-rendered-views"

// ─── View Tab Type ───────────────────────────────────────────────────

export type ViewTab = "3d" | "iso" | "exploded" | "front" | "back" | "left" | "right" | "top"

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
export function ModuleResultsView({
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
  svgUrls,
  mfgProcess,
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
  /** P3: Persisted SVG URLs from Supabase storage — preferred over data URIs */
  svgUrls?: Record<string, string>
  /** Diagnostic manufacturing process — when non-3D-printing, FDM metrics are hidden */
  mfgProcess?: string
}): React.ReactNode {
  // Render high-quality orthographic views from STL using Three.js
  const { views: renderedViews, loading: renderedLoading } = useRenderedViews(result.stlData)

  // P3: Prefer persisted SVG URLs from Supabase, fall back to data URI from result
  const resolveSvg = (viewName: string): string | undefined =>
    svgUrls?.[viewName] ?? (result as unknown as Record<string, unknown>)[`svg${viewName.charAt(0).toUpperCase()}${viewName.slice(1)}`] as string | undefined

  // A view tab is available if we have STL (rendered views) OR a CadQuery SVG fallback
  const hasIso = !!(result.stlData || resolveSvg("iso"))
  const hasExploded = !!resolveSvg("exploded")
  const hasFront = !!(result.stlData || resolveSvg("front"))
  const hasBack = !!(result.stlData || resolveSvg("back"))
  const hasLeft = !!(result.stlData || resolveSvg("left"))
  const hasRight = !!(result.stlData || resolveSvg("right"))
  const hasTop = !!(result.stlData || resolveSvg("top"))

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
    // P3: Prefer persisted URL from Supabase, fall back to data URI
    const svgSrc = resolveSvg(viewName)

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
      {(result.stlData || resolveSvg("iso") || resolveSvg("front") || resolveSvg("top")) && (
        <div className="border rounded-md">
          <div className="flex items-center justify-between p-3 border-b">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Box className="h-3.5 w-3.5" /> Views — {moduleName}
              {result.visionScore != null && (
                <Badge variant={result.visionScore >= 8 ? "success" : result.visionScore >= 5 ? "warning" : "destructive"} className="ml-1 text-[10px]">
                  Vision {result.visionScore}/10
                </Badge>
              )}
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

      {/* Vision issues */}
      {result.visionIssues && result.visionIssues.length > 0 && (
        <details className="border rounded-md p-3">
          <summary className="text-xs font-medium text-muted-foreground cursor-pointer">
            Vision issues ({result.visionIssues.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {result.visionIssues.map((issue, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-destructive mt-0.5">•</span> {issue}
              </li>
            ))}
          </ul>
        </details>
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

      {/* DFM — only show FDM-specific metrics when the module's mfg_process is a 3D printing variant */}
      {result.dfm && (!mfgProcess || mfgProcess.startsWith("FDM") || mfgProcess.startsWith("SLA") || mfgProcess.startsWith("SLS")) && (
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

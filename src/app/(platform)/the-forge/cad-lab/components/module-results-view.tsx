"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import {
  Box,
  Code2,
  Timer,
  AlertTriangle,
  Copy,
  Check,
  Maximize2,
  Download,
  Info,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { STLViewer } from "@/components/cad/stl-viewer"
import { Badge } from "@/components/ui/badge"
import type { CadLabResult } from "@/lib/cad-lab-types"
import { Metric, SvgView, RenderedView } from "../cad-lab-utils"
import { useRenderedViews } from "@/hooks/use-rendered-views"
import { CodeEditor, type CodeVersion } from "./code-editor"
import { ParameterPanel } from "./parameter-panel"
import { extractParameters, rebuildCodeWithParameters, type ExtractedParameter } from "@/lib/cad-lab/parameter-extractor"
import { checkPythonSyntax } from "@/lib/cad-lab/code-validators"

// ─── View Tab Type ───────────────────────────────────────────────────

export type ViewTab = "3d" | "iso" | "exploded" | "front" | "back" | "left" | "right" | "top"

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
  onExecuteCode,
  onRefineCode,
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
  /** Execute edited code on Modal — returns updated result */
  onExecuteCode?: (moduleId: string, code: string) => Promise<void>
  /** Refine code with natural language instruction — returns new code */
  onRefineCode?: (moduleId: string, currentCode: string, instruction: string) => Promise<string | null>
}): React.ReactNode {
  // Render high-quality orthographic views from STL using Three.js
  const { views: renderedViews, loading: renderedLoading } = useRenderedViews(result.stlData)

  // ── Interactive code editor state ──
  const [editedCode, setEditedCode] = useState(code ?? "")
  const [isExecuting, setIsExecuting] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [executionError, setExecutionError] = useState<string | null>(null)
  // Mutex: prevent concurrent execute/refine operations
  const busyRef = useRef(false)
  const [codeHistory, setCodeHistory] = useState<CodeVersion[]>(() =>
    code ? [{ code, timestamp: Date.now() }] : [],
  )
  const originalCodeRef = useRef(code)
  // INTENT: Track code changes we initiated (via Run/Refine) vs external regeneration.
  // Counter instead of boolean — handles rapid overlapping updates safely.
  const selfUpdateRef = useRef(0)

  // Sync if parent code changes externally (e.g., after full regeneration)
  useEffect(() => {
    if (code && code !== originalCodeRef.current) {
      if (selfUpdateRef.current > 0) {
        // Our own execution updated the parent — don't wipe history
        originalCodeRef.current = code
      } else {
        // External change (full regeneration) — reset everything
        originalCodeRef.current = code
        setEditedCode(code)
        setCodeHistory([{ code, timestamp: Date.now() }])
      }
    }
  }, [code])

  // Extract parameters from current code (#21: memoize to avoid recalc on every render)
  const parameters = useMemo(() => extractParameters(editedCode), [editedCode])

  const handleRun = useCallback(async () => {
    if (!onExecuteCode || busyRef.current) return
    busyRef.current = true
    setIsExecuting(true)
    setExecutionError(null)
    selfUpdateRef.current++
    try {
      await onExecuteCode(moduleId, editedCode)
    } catch (err) {
      setExecutionError(err instanceof Error ? err.message : "Execution failed")
    } finally {
      selfUpdateRef.current--
      setIsExecuting(false)
      busyRef.current = false
    }
  }, [onExecuteCode, moduleId, editedCode])

  const handleReset = useCallback(() => {
    if (originalCodeRef.current) {
      setEditedCode(originalCodeRef.current)
    }
  }, [])

  const handleRefine = useCallback(async (instruction: string) => {
    if (!onRefineCode || busyRef.current) return
    busyRef.current = true
    setIsRefining(true)
    setExecutionError(null)
    try {
      const newCode = await onRefineCode(moduleId, editedCode, instruction)
      if (newCode) {
        setCodeHistory((prev) => [...prev, { code: newCode, instruction, timestamp: Date.now() }])
        setEditedCode(newCode)
        // Pre-validate refined code before auto-execution (#18)
        const syntaxIssues = checkPythonSyntax(newCode)
        const critical = syntaxIssues.find((i) => i.severity === "critical")
        if (critical) {
          setExecutionError(`Syntax issue: ${critical.message}`)
          // Skip auto-execute — let user review and fix
        } else if (onExecuteCode) {
          // Auto-execute after refinement
          setIsExecuting(true)
          selfUpdateRef.current++
          try {
            await onExecuteCode(moduleId, newCode)
          } catch (err) {
            setExecutionError(err instanceof Error ? err.message : "Execution failed")
          } finally {
            selfUpdateRef.current--
            setIsExecuting(false)
          }
        }
      }
    } finally {
      setIsRefining(false)
      busyRef.current = false
    }
  }, [onRefineCode, onExecuteCode, moduleId, editedCode])

  const handleUndo = useCallback(() => {
    if (codeHistory.length < 2) return
    const newHistory = codeHistory.slice(0, -1)
    setCodeHistory(newHistory)
    setEditedCode(newHistory[newHistory.length - 1].code)
  }, [codeHistory])

  // Use ref for editedCode to avoid stale closure in parameter change callback
  const editedCodeRef = useRef(editedCode)
  useEffect(() => { editedCodeRef.current = editedCode }, [editedCode])

  const handleParameterChange = useCallback((params: ExtractedParameter[]) => {
    if (busyRef.current) return
    const newCode = rebuildCodeWithParameters(editedCodeRef.current, params)
    setEditedCode(newCode)
    editedCodeRef.current = newCode
    setCodeHistory((prev) => [...prev, { code: newCode, instruction: "Parameter adjustment", timestamp: Date.now() }])
    setExecutionError(null)
    // Auto-execute after parameter change
    if (onExecuteCode) {
      busyRef.current = true
      setIsExecuting(true)
      selfUpdateRef.current++
      onExecuteCode(moduleId, newCode)
        .catch((err) => {
          setExecutionError(err instanceof Error ? err.message : "Execution failed")
        })
        .finally(() => {
          selfUpdateRef.current--
          setIsExecuting(false)
          busyRef.current = false
        })
    }
  }, [onExecuteCode, moduleId])

  // Restore a specific version from history (#9)
  const handleRestoreVersion = useCallback((index: number) => {
    if (!codeHistory[index]) return
    const newHistory = codeHistory.slice(0, index + 1)
    setCodeHistory(newHistory)
    setEditedCode(newHistory[newHistory.length - 1].code)
  }, [codeHistory])

  // Previous code for diff view (#15)
  const previousCode = codeHistory.length >= 2 ? codeHistory[codeHistory.length - 2].code : null

  // Cancel in-flight execution (#16)
  const handleCancel = useCallback(() => {
    // Client-side cancellation: immediately clear UI state
    // Note: server-side Modal computation continues — true abort requires Modal API changes
    setIsExecuting(false)
    setIsRefining(false)
    busyRef.current = false
    setExecutionError("Execution cancelled")
  }, [])

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

      {/* Code Editor */}
      {code && (
        <div className="border rounded-md">
          <div className="flex items-center justify-between p-3 border-b">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5" /> CadQuery Code
              <span className="font-normal text-muted-foreground">({editedCode.split("\n").length} lines)</span>
            </p>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => onCopyCode(editedCode)} className="gap-1 text-xs h-7">
                {codeCopied ? <><Check className="h-3 w-3" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy</>}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowCode(!showCode)} className="text-xs h-7">
                {showCode ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
          {showCode && (
            <div className="p-3 space-y-3">
              {/* Parameter sliders (when parameters detected) */}
              {parameters.length > 0 && onExecuteCode && (
                <ParameterPanel
                  parameters={parameters}
                  onChange={handleParameterChange}
                  disabled={isExecuting || isRefining}
                />
              )}
              {/* Inline execution error (#3) */}
              {executionError && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-2.5 py-1.5">
                  {executionError}
                </p>
              )}
              {/* Cancel button (#16) */}
              {(isExecuting || isRefining) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  className="gap-1 text-xs h-7 border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <XCircle className="h-3 w-3" /> Cancel
                </Button>
              )}
              {/* Monaco editor with Run/Refine */}
              <CodeEditor
                code={editedCode}
                onChange={setEditedCode}
                onRun={handleRun}
                isRunning={isExecuting}
                onReset={handleReset}
                onRefine={onRefineCode ? handleRefine : undefined}
                isRefining={isRefining}
                history={codeHistory}
                onUndo={handleUndo}
                canUndo={codeHistory.length > 1}
                onRestoreVersion={handleRestoreVersion}
                previousCode={previousCode}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

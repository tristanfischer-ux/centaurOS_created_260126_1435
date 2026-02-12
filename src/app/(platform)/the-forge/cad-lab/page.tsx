"use client"

/**
 * @file page.tsx — CAD Lab: Claude-powered parametric CAD generation.
 *
 * @description Three-step flow following CLAUDE_CAD_INSTRUCTIONS:
 *   Step 1: Research — web search + Claude synthesis → editable report
 *   Step 2: Interface Definition — Claude generates text-only engineering plan
 *   Step 3: Generate — Claude writes complete CadQuery code → Modal executes
 *
 * Not linked from navigation. Access via /the-forge/cad-lab (behind platform auth).
 */

import { useState, useCallback } from "react"
import {
  Loader2,
  Code2,
  Box,
  Timer,
  Zap,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Globe,
  ExternalLink,
  Search,
  ArrowRight,
  RotateCcw,
  Copy,
  Check,
  Maximize2,
  Ruler,
  Download,
  Printer,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import {
  runCadLabResearch,
  generateCadLabInterface,
  generateCadLabModel,
} from "@/actions/cad-lab"
import { CLAUDE_MODELS } from "@/lib/cad-lab-types"
import { STLViewer } from "@/components/cad/stl-viewer"
import { Markdown } from "@/components/ui/markdown"

import type {
  CadLabResult,
  CadLabResearchResult,
  CadLabInterfaceResult,
  ClaudeModelId,
} from "@/lib/cad-lab-types"

export default function CadLabPage(): React.ReactNode {
  // ── Input state ──
  const [subject, setSubject] = useState("")
  const [modelId, setModelId] = useState<ClaudeModelId>("claude-opus-4-6")

  // ── Step 1: Research state ──
  const [isResearching, setIsResearching] = useState(false)
  const [researchResult, setResearchResult] = useState<CadLabResearchResult | null>(null)
  const [editableReport, setEditableReport] = useState("")
  const [showSources, setShowSources] = useState(false)

  // ── Step 2: Interface Definition state ──
  const [isGeneratingInterface, setIsGeneratingInterface] = useState(false)
  const [interfaceResult, setInterfaceResult] = useState<CadLabInterfaceResult | null>(null)
  const [editableInterface, setEditableInterface] = useState("")

  // ── Step 3: Generation state ──
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<CadLabResult | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  // ── View state ──
  type ViewTab = "3d" | "iso" | "exploded" | "front" | "back" | "left" | "right" | "top"
  const [fullscreenView, setFullscreenView] = useState<string | null>(null)
  const [activeViewTab, setActiveViewTab] = useState<ViewTab>("3d")

  // ── Step 1: Research ──
  const handleResearch = useCallback(async () => {
    setIsResearching(true)
    setResearchResult(null)
    setInterfaceResult(null)
    setResult(null)
    setEditableReport("")
    setEditableInterface("")
    try {
      const res = await runCadLabResearch(subject)
      setResearchResult(res)
      setEditableReport(res.report)
    } catch (err) {
      setResearchResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
        report: "",
        sources: [],
        referenceModels: [],
        researchTime: 0,
      })
    } finally {
      setIsResearching(false)
    }
  }, [subject])

  // ── Step 2: Interface Definition ──
  const handleGenerateInterface = useCallback(async () => {
    setIsGeneratingInterface(true)
    setInterfaceResult(null)
    setResult(null)
    setEditableInterface("")
    try {
      const res = await generateCadLabInterface(subject, editableReport, modelId)
      setInterfaceResult(res)
      setEditableInterface(res.interfaceDefinition)
    } catch (err) {
      setInterfaceResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
        interfaceDefinition: "",
        generationTime: 0,
        tokensIn: 0,
        tokensOut: 0,
      })
    } finally {
      setIsGeneratingInterface(false)
    }
  }, [subject, editableReport, modelId])

  // ── Step 3: Generate Code + Execute ──
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setResult(null)
    try {
      const res = await generateCadLabModel(
        subject,
        editableReport,
        editableInterface,
        modelId,
      )
      setResult(res)
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setIsGenerating(false)
    }
  }, [subject, editableReport, editableInterface, modelId])

  // ── Copy code to clipboard ──
  const handleCopyCode = useCallback(async () => {
    if (!result?.code) return
    try {
      await navigator.clipboard.writeText(result.code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy code:", err)
    }
  }, [result?.code])

  // ── Reset ──
  const handleReset = useCallback(() => {
    setResearchResult(null)
    setInterfaceResult(null)
    setResult(null)
    setEditableReport("")
    setEditableInterface("")
  }, [])

  // ── Download helper ──
  const handleDownload = useCallback((filename: string, base64Data: string, isBinary: boolean = true) => {
    try {
      const byteString = atob(base64Data)
      const bytes = new Uint8Array(byteString.length)
      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i)
      }
      const mimeType = isBinary ? "application/octet-stream" : "application/step"
      const blob = new Blob([bytes], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[CAD-LAB] Download failed:", err)
    }
  }, [])

  const hasResearch = researchResult?.success && editableReport.trim().length > 0
  const hasInterface = interfaceResult?.success && editableInterface.trim().length > 0
  const isAnyLoading = isResearching || isGeneratingInterface || isGenerating

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-international-orange" />
          <h1 className="text-2xl font-bold text-foreground">CAD Lab</h1>
          <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-1 rounded">
            CLAUDE PIPELINE
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Research → Interface Definition → Generate. Following the CadQuery methodology exactly.
        </p>
      </div>

      {/* Model selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="subject">What do you want to model?</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Nespresso capsule auto-reloader, DJI Mavic Air 2 drone"
                disabled={isAnyLoading}
              />
            </div>
            <div className="w-64 space-y-2">
              <Label htmlFor="model">Claude Model</Label>
              <select
                id="model"
                value={modelId}
                onChange={(e) => setModelId(e.target.value as ClaudeModelId)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isAnyLoading}
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STEP 1: RESEARCH                                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Step 1: Research Real Dimensions
            {researchResult?.success && (
              <span className="text-xs font-normal text-status-success flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Complete ({(researchResult.researchTime / 1000).toFixed(1)}s)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Before anything else, search for real-world reference dimensions. Never invent dimensions.
          </p>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleResearch}
              disabled={isAnyLoading || !subject.trim()}
              variant={hasResearch ? "secondary" : "default"}
            >
              {isResearching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Researching...
                </>
              ) : hasResearch ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Re-Research
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Research Product
                </>
              )}
            </Button>
            {hasResearch && (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Start Over
              </Button>
            )}
          </div>

          {/* Research error */}
          {researchResult && !researchResult.success && researchResult.error && (
            <div className="p-3 bg-status-error-light rounded text-sm text-destructive font-mono">
              {researchResult.error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Research Report (editable) ── */}
      {hasResearch && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Research Report
              <span className="text-xs font-normal text-muted-foreground">
                (review and edit dimensions before proceeding)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Formatted markdown display */}
            <div className="border rounded-md p-4 bg-muted/30">
              <Markdown content={editableReport} className="text-sm text-foreground" />
            </div>

            {/* Editable textarea (collapsible) */}
            <p className="text-xs text-muted-foreground">
              {editableReport.length.toLocaleString()} characters
            </p>
            <details className="border rounded-md">
              <summary className="cursor-pointer p-3 text-sm font-medium hover:bg-muted/50 transition-colors">
                Edit raw markdown
              </summary>
              <div className="p-3 border-t">
                <Textarea
                  value={editableReport}
                  onChange={(e) => setEditableReport(e.target.value)}
                  className="font-mono text-xs min-h-[400px]"
                  disabled={isAnyLoading}
                />
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      {/* ── Research Sources (expandable) ── */}
      {researchResult?.success &&
        ((researchResult.sources.length > 0) || (researchResult.referenceModels.length > 0)) && (
        <Card>
          <CardHeader>
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center justify-between w-full text-left"
            >
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Research Sources
                <span className="text-xs font-normal text-muted-foreground">
                  ({researchResult.sources.length} web + {researchResult.referenceModels.length} CAD refs)
                </span>
              </CardTitle>
              {showSources ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {showSources && (
            <CardContent className="space-y-4">
              {researchResult.sources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Web Sources
                  </p>
                  <ul className="space-y-1">
                    {researchResult.sources.map((source, i) => (
                      <li key={i} className="text-xs font-mono flex items-start gap-1.5">
                        <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <a
                          href={source.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-electric-blue hover:underline truncate"
                        >
                          {source.title || source.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STEP 2: INTERFACE DEFINITION                                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {hasResearch && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Step 2: Interface Definition
              {interfaceResult?.success && (
                <span className="text-xs font-normal text-status-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Complete ({(interfaceResult.generationTime / 1000).toFixed(1)}s)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This is the most important step. Text-only engineering plan: space budget, component placement,
              connection map, and validation checklist. No code yet.
            </p>
            <Button
              onClick={handleGenerateInterface}
              disabled={isAnyLoading || !hasResearch}
              variant={hasInterface ? "secondary" : "default"}
            >
              {isGeneratingInterface ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating Interface Definition...
                </>
              ) : hasInterface ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Regenerate Interface
                </>
              ) : (
                <>
                  <Ruler className="h-4 w-4 mr-2" />
                  Generate Interface Definition
                </>
              )}
            </Button>

            {/* Interface error */}
            {interfaceResult && !interfaceResult.success && interfaceResult.error && (
              <div className="p-3 bg-status-error-light rounded text-sm text-destructive font-mono">
                {interfaceResult.error}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Interface Definition (editable) ── */}
      {hasInterface && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Interface Definition
              <span className="text-xs font-normal text-muted-foreground">
                (review — if the numbers don't add up in text, they won't add up in 3D)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Formatted display */}
            <div className="border rounded-md p-4 bg-muted/30">
              <pre className="text-xs font-mono whitespace-pre-wrap text-foreground">
                {editableInterface}
              </pre>
            </div>

            {/* Editable (collapsible) */}
            <details className="border rounded-md">
              <summary className="cursor-pointer p-3 text-sm font-medium hover:bg-muted/50 transition-colors">
                Edit interface definition
              </summary>
              <div className="p-3 border-t">
                <Textarea
                  value={editableInterface}
                  onChange={(e) => setEditableInterface(e.target.value)}
                  className="font-mono text-xs min-h-[400px]"
                  disabled={isAnyLoading}
                />
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STEP 3: GENERATE                                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {hasInterface && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Step 3: Generate CadQuery Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Claude generates the complete CadQuery script in a single pass, then Modal executes it
              to produce STEP + STL + SVG exports.
            </p>
            <Button
              onClick={handleGenerate}
              disabled={isAnyLoading || !hasInterface}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating + Executing (~60s)...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Generate Model
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* RESULTS                                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {result && (
        <div className="space-y-6">
          {/* Error */}
          {result.error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-sm text-destructive font-mono whitespace-pre-wrap">
                  {result.error}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Validation warnings */}
          {result.validationWarnings && result.validationWarnings.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="p-3 bg-status-warning-light rounded text-xs font-mono text-status-warning-dark space-y-1">
                  <p className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Post-execution warnings:
                  </p>
                  {result.validationWarnings.map((w, i) => (
                    <p key={i}>- {w}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Views (3D + 2D Projections) */}
          {(result.stlData || result.svgIso || result.svgFront || result.svgTop) && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Box className="h-4 w-4" />
                    Views
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {result.stepData && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload("model.step", result.stepData!, false)}
                        className="gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        STEP
                      </Button>
                    )}
                    {result.stlData && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload("model.stl", result.stlData!)}
                        className="gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        STL
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFullscreenView(activeViewTab)}
                      className="gap-1.5"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      Fullscreen
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={activeViewTab} onValueChange={(v) => setActiveViewTab(v as ViewTab)}>
                  <TabsList className="flex w-full overflow-x-auto">
                    {result.stlData && <TabsTrigger value="3d" className="flex-1">3D Model</TabsTrigger>}
                    {result.svgIso && <TabsTrigger value="iso" className="flex-1">Isometric</TabsTrigger>}
                    {result.svgExploded && <TabsTrigger value="exploded" className="flex-1">Exploded</TabsTrigger>}
                    {result.svgFront && <TabsTrigger value="front" className="flex-1">Front</TabsTrigger>}
                    {result.svgBack && <TabsTrigger value="back" className="flex-1">Back</TabsTrigger>}
                    {result.svgLeft && <TabsTrigger value="left" className="flex-1">Left</TabsTrigger>}
                    {result.svgRight && <TabsTrigger value="right" className="flex-1">Right</TabsTrigger>}
                    {result.svgTop && <TabsTrigger value="top" className="flex-1">Top</TabsTrigger>}
                  </TabsList>

                  {result.stlData && (
                    <TabsContent value="3d" className="mt-4">
                      <div className="h-[500px] bg-muted/30 rounded-lg overflow-hidden">
                        <STLViewer stlData={result.stlData} />
                      </div>
                    </TabsContent>
                  )}

                  {result.svgIso && (
                    <TabsContent value="iso" className="mt-4">
                      <SvgView src={result.svgIso} alt="Isometric view" onClick={() => setFullscreenView("iso")} />
                    </TabsContent>
                  )}

                  {result.svgExploded && (
                    <TabsContent value="exploded" className="mt-4">
                      <SvgView src={result.svgExploded} alt="Exploded isometric view" onClick={() => setFullscreenView("exploded")} />
                    </TabsContent>
                  )}

                  {result.svgFront && (
                    <TabsContent value="front" className="mt-4">
                      <SvgView src={result.svgFront} alt="Front view" onClick={() => setFullscreenView("front")} />
                    </TabsContent>
                  )}

                  {result.svgBack && (
                    <TabsContent value="back" className="mt-4">
                      <SvgView src={result.svgBack} alt="Back view" onClick={() => setFullscreenView("back")} />
                    </TabsContent>
                  )}

                  {result.svgLeft && (
                    <TabsContent value="left" className="mt-4">
                      <SvgView src={result.svgLeft} alt="Left view" onClick={() => setFullscreenView("left")} />
                    </TabsContent>
                  )}

                  {result.svgRight && (
                    <TabsContent value="right" className="mt-4">
                      <SvgView src={result.svgRight} alt="Right view" onClick={() => setFullscreenView("right")} />
                    </TabsContent>
                  )}

                  {result.svgTop && (
                    <TabsContent value="top" className="mt-4">
                      <SvgView src={result.svgTop} alt="Top view" onClick={() => setFullscreenView("top")} />
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {result.bbox && (
                  <Metric
                    icon={<Box className="h-3.5 w-3.5" />}
                    label="Bounding Box"
                    value={`${result.bbox.xLen} × ${result.bbox.yLen} × ${result.bbox.zLen} mm`}
                  />
                )}
                {result.stepSize != null && (
                  <Metric
                    icon={<Box className="h-3.5 w-3.5" />}
                    label="STEP Size"
                    value={result.stepSize > 1024 ? `${(result.stepSize / 1024).toFixed(1)} MB` : `${result.stepSize} KB`}
                  />
                )}
                {result.stlSize != null && (
                  <Metric
                    icon={<Box className="h-3.5 w-3.5" />}
                    label="STL Size"
                    value={result.stlSize > 1024 ? `${(result.stlSize / 1024).toFixed(1)} MB` : `${result.stlSize} KB`}
                  />
                )}
                {result.fillRatio != null && (
                  <Metric label="Fill Ratio" value={`${result.fillRatio}%`} />
                )}
                {result.massGrams != null && (
                  <Metric label="Mass" value={`${result.massGrams} g`} />
                )}
                {result.codeLines != null && (
                  <Metric
                    icon={<Code2 className="h-3.5 w-3.5" />}
                    label="Code Lines"
                    value={`${result.codeLines}`}
                  />
                )}
                {result.modelUsed && (
                  <Metric label="Model" value={result.modelUsed.replace("claude-", "").replace(/-\d+$/, "")} />
                )}
                {result.generationTime != null && (
                  <Metric
                    icon={<Timer className="h-3.5 w-3.5" />}
                    label="Pipeline Time"
                    value={`${(result.generationTime / 1000).toFixed(1)}s`}
                  />
                )}
                {result.modalTime != null && (
                  <Metric
                    icon={<Timer className="h-3.5 w-3.5" />}
                    label="Modal Time"
                    value={`${(result.modalTime / 1000).toFixed(1)}s`}
                  />
                )}
                {result.tokensIn != null && (
                  <Metric label="Tokens In" value={`${result.tokensIn.toLocaleString()}`} />
                )}
                {result.tokensOut != null && (
                  <Metric label="Tokens Out" value={`${result.tokensOut.toLocaleString()}`} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Manufacturability Analysis */}
          {result.dfm && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Manufacturability (DFM)
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${result.dfm.printable ? "bg-status-success-light text-status-success" : "bg-status-error-light text-destructive"}`}>
                    {result.dfm.printable ? "PRINTABLE" : "NOT PRINTABLE"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Metric
                    icon={<Timer className="h-3.5 w-3.5" />}
                    label="Est. Print Time"
                    value={result.dfm.estimatedPrintTimeMin > 60
                      ? `${(result.dfm.estimatedPrintTimeMin / 60).toFixed(1)} hrs`
                      : `${result.dfm.estimatedPrintTimeMin} min`
                    }
                  />
                  <Metric
                    label="Est. Material"
                    value={`${result.dfm.estimatedMaterialG} g`}
                  />
                  <Metric
                    label="Support Volume"
                    value={`~${result.dfm.supportVolumePct}%`}
                  />
                  {result.massProperties && (
                    <Metric
                      label="Surface Area"
                      value={result.massProperties.surfaceAreaMm2 > 0
                        ? `${Math.round(result.massProperties.surfaceAreaMm2).toLocaleString()} mm²`
                        : "N/A"
                      }
                    />
                  )}
                </div>

                {result.dfm.compatiblePrinters.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Compatible Printers</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.dfm.compatiblePrinters.map((printer) => (
                        <span
                          key={printer}
                          className="text-xs font-mono bg-muted px-2 py-0.5 rounded"
                        >
                          {printer}
                        </span>
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
                      <div
                        key={i}
                        className={`p-2 rounded text-xs font-mono ${
                          issue.severity === "critical"
                            ? "bg-status-error-light text-destructive"
                            : issue.severity === "warning"
                              ? "bg-status-warning-light text-status-warning-dark"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span className="font-semibold uppercase">{issue.severity}:</span> {issue.message}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Code */}
          {result.code && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Code2 className="h-4 w-4" />
                    Generated CadQuery Code
                    <span className="text-xs font-normal text-muted-foreground">
                      ({result.codeLines} lines)
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyCode}
                      className="gap-1.5"
                    >
                      {codeCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowCode(!showCode)}>
                      {showCode ? "Hide" : "Show"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {showCode && (
                <CardContent>
                  <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-auto max-h-[500px] whitespace-pre-wrap">
                    {result.code}
                  </pre>
                </CardContent>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── Fullscreen overlay ── */}
      {fullscreenView && result && (
        <FullscreenOverlay
          view={fullscreenView}
          result={result}
          onClose={() => setFullscreenView(null)}
        />
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

/**
 * Metric — displays a labeled value in the metrics grid.
 */
function Metric({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}): React.ReactNode {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground font-mono">{value}</p>
    </div>
  )
}

/**
 * SvgView — renders an SVG engineering drawing in a clickable container.
 *
 * @description Reusable component for all orthographic/isometric SVG views.
 * Clicking opens the fullscreen overlay.
 */
function SvgView({
  src,
  alt,
  onClick,
}: {
  src: string
  alt: string
  onClick: () => void
}): React.ReactNode {
  return (
    <div className="bg-muted rounded-lg p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="w-full cursor-pointer hover:opacity-90 transition-opacity"
        onClick={onClick}
      />
    </div>
  )
}

/**
 * FullscreenOverlay — renders a full-viewport overlay for any view tab.
 *
 * @description Supports 3D STL viewer and all SVG orthographic views.
 * Maps view name to the corresponding SVG data URI from the result.
 */
function FullscreenOverlay({
  view,
  result,
  onClose,
}: {
  view: string
  result: CadLabResult
  onClose: () => void
}): React.ReactNode {
  /** Map of SVG view names to their data URIs */
  const svgMap: Record<string, string | undefined> = {
    iso: result.svgIso,
    exploded: result.svgExploded,
    front: result.svgFront,
    back: result.svgBack,
    left: result.svgLeft,
    right: result.svgRight,
    top: result.svgTop,
  }

  const svgSrc = svgMap[view]

  return (
    <div
      className="fixed inset-0 z-50 bg-background/95 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors text-sm font-mono"
        onClick={onClose}
      >
        ESC to close
      </button>
      {view === "3d" && result.stlData ? (
        <div className="w-full h-full" onClick={(e) => e.stopPropagation()}>
          <STLViewer stlData={result.stlData} />
        </div>
      ) : svgSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={svgSrc} alt={`${view} view`} className="max-w-full max-h-full object-contain" />
      ) : null}
    </div>
  )
}

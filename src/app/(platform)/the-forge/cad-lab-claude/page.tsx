"use client"

/**
 * @file page.tsx — The Forge (Claude Pipeline)
 *
 * @description Clean implementation following CLAUDE_CAD_INSTRUCTIONS exactly.
 * Each step is visible: the user watches research happen, sees the interface
 * definition being built, watches code generation, and sees execution results.
 *
 * THE PROCESS (from the instructions):
 *   Step 1: RESEARCH real dimensions
 *   Step 2: Write the INTERFACE DEFINITION (text only — no code yet)
 *   Step 3: Write the CadQuery code
 *   Step 4: Execute, export STEP + STL + SVG
 */

import { useState, useCallback } from "react"
import {
  Loader2,
  Search,
  Globe,
  ExternalLink,
  Box,
  FileText,
  Code2,
  CheckCircle2,
  AlertCircle,
  Ruler,
  Play,
  Copy,
  Check,
  Maximize2,
  RotateCcw,
  Library,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Markdown } from "@/components/ui/markdown"
import { STLViewer } from "@/components/cad/stl-viewer"

import {
  searchWebDimensions,
  searchCadReferences,
  synthesizeResearch,
  generateInterface,
  generateCode,
  executeCode,
} from "@/actions/cad-lab-claude"
import type {
  WebSearchResult,
  CadSearchResult,
  SynthesisResult,
  InterfaceResult,
  CodeResult,
  ExecutionResult,
} from "@/actions/cad-lab-claude"

// ─── Step status type ────────────────────────────────────────────────

type StepStatus = "idle" | "running" | "done" | "error"

/**
 * Small status indicator row used inside the research progress panel.
 */
function StatusRow({
  status,
  label,
  detail,
  timeMs,
}: {
  status: StepStatus
  label: string
  detail?: string
  timeMs?: number
}): React.ReactNode {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-5 flex items-center justify-center">
        {status === "running" && <Loader2 className="h-4 w-4 animate-spin text-international-orange" />}
        {status === "done" && <CheckCircle2 className="h-4 w-4 text-status-success" />}
        {status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
        {status === "idle" && <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${status === "idle" ? "text-muted-foreground" : "text-foreground"}`}>
          {label}
        </p>
        {detail && (
          <p className="text-xs text-muted-foreground truncate">{detail}</p>
        )}
      </div>
      {timeMs != null && status === "done" && (
        <span className="text-xs text-muted-foreground font-mono">
          {(timeMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  )
}

// ─── Page Component ──────────────────────────────────────────────────

export default function CadLabClaudePage(): React.ReactNode {
  // Input
  const [subject, setSubject] = useState("")

  // Step 1: Research
  const [webStatus, setWebStatus] = useState<StepStatus>("idle")
  const [cadStatus, setCadStatus] = useState<StepStatus>("idle")
  const [synthStatus, setSynthStatus] = useState<StepStatus>("idle")
  const [webResult, setWebResult] = useState<WebSearchResult | null>(null)
  const [cadResult, setCadResult] = useState<CadSearchResult | null>(null)
  const [synthResult, setSynthResult] = useState<SynthesisResult | null>(null)
  const [editableReport, setEditableReport] = useState("")

  // Step 2: Interface Definition
  const [ifaceStatus, setIfaceStatus] = useState<StepStatus>("idle")
  const [ifaceResult, setIfaceResult] = useState<InterfaceResult | null>(null)
  const [editableInterface, setEditableInterface] = useState("")

  // Step 3: Code Generation
  const [codeStatus, setCodeStatus] = useState<StepStatus>("idle")
  const [codeResult, setCodeResult] = useState<CodeResult | null>(null)

  // Step 4: Execution
  const [execStatus, setExecStatus] = useState<StepStatus>("idle")
  const [execResult, setExecResult] = useState<ExecutionResult | null>(null)

  // UI state
  const [showCode, setShowCode] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [fullscreenView, setFullscreenView] = useState<string | null>(null)
  type ViewTab = "3d" | "iso" | "exploded" | "front" | "back" | "left" | "right" | "top"
  const [activeViewTab, setActiveViewTab] = useState<ViewTab>("3d")

  const isAnyRunning =
    webStatus === "running" ||
    cadStatus === "running" ||
    synthStatus === "running" ||
    ifaceStatus === "running" ||
    codeStatus === "running" ||
    execStatus === "running"

  // ── Step 1: Research (3 visible sub-steps) ──

  const handleResearch = useCallback(async () => {
    // Reset everything
    setWebStatus("running")
    setCadStatus("running")
    setSynthStatus("idle")
    setWebResult(null)
    setCadResult(null)
    setSynthResult(null)
    setEditableReport("")
    setIfaceStatus("idle")
    setIfaceResult(null)
    setEditableInterface("")
    setCodeStatus("idle")
    setCodeResult(null)
    setExecStatus("idle")
    setExecResult(null)

    // 1a + 1b: Run web search and CAD search in parallel
    const [webRes, cadRes] = await Promise.allSettled([
      searchWebDimensions(subject),
      searchCadReferences(subject),
    ])

    const web = webRes.status === "fulfilled" ? webRes.value : null
    const cad = cadRes.status === "fulfilled" ? cadRes.value : null

    setWebResult(web)
    setWebStatus(web?.success ? "done" : "error")

    setCadResult(cad)
    setCadStatus(cad?.success ? "done" : "error")

    // 1c: Synthesize
    const specs = web?.specs ?? ""
    const models = cad?.models ?? []

    if (!specs.trim()) {
      setSynthStatus("error")
      setSynthResult({ success: false, error: "No web data to synthesize", report: "", timeMs: 0 })
      return
    }

    setSynthStatus("running")
    try {
      const synth = await synthesizeResearch(subject, specs, models)
      setSynthResult(synth)
      setSynthStatus(synth.success ? "done" : "error")
      if (synth.success) setEditableReport(synth.report)
    } catch (err) {
      setSynthStatus("error")
      setSynthResult({
        success: false,
        error: err instanceof Error ? err.message : "Synthesis failed",
        report: "",
        timeMs: 0,
      })
    }
  }, [subject])

  // ── Step 2: Interface Definition ──

  const handleInterface = useCallback(async () => {
    setIfaceStatus("running")
    setIfaceResult(null)
    setEditableInterface("")
    setCodeStatus("idle")
    setCodeResult(null)
    setExecStatus("idle")
    setExecResult(null)

    try {
      const res = await generateInterface(subject, editableReport)
      setIfaceResult(res)
      setIfaceStatus(res.success ? "done" : "error")
      if (res.success) setEditableInterface(res.definition)
    } catch (err) {
      setIfaceStatus("error")
      setIfaceResult({
        success: false,
        error: err instanceof Error ? err.message : "Failed",
        definition: "",
        timeMs: 0,
      })
    }
  }, [subject, editableReport])

  // ── Step 3: Generate Code ──

  const handleCode = useCallback(async () => {
    setCodeStatus("running")
    setCodeResult(null)
    setExecStatus("idle")
    setExecResult(null)

    try {
      const res = await generateCode(subject, editableReport, editableInterface)
      setCodeResult(res)
      setCodeStatus(res.success ? "done" : "error")
    } catch (err) {
      setCodeStatus("error")
      setCodeResult({
        success: false,
        error: err instanceof Error ? err.message : "Failed",
        code: "",
        lines: 0,
        timeMs: 0,
      })
    }
  }, [subject, editableReport, editableInterface])

  // ── Step 4: Execute ──

  const handleExecute = useCallback(async () => {
    if (!codeResult?.code) return
    setExecStatus("running")
    setExecResult(null)

    try {
      const res = await executeCode(codeResult.code)
      setExecResult(res)
      setExecStatus(res.success ? "done" : "error")
    } catch (err) {
      setExecStatus("error")
      setExecResult({
        success: false,
        error: err instanceof Error ? err.message : "Failed",
        timeMs: 0,
      })
    }
  }, [codeResult])

  // ── Copy code ──

  const handleCopyCode = useCallback(async () => {
    if (!codeResult?.code) return
    await navigator.clipboard.writeText(codeResult.code)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }, [codeResult])

  // ── Reset ──

  const handleReset = useCallback(() => {
    setWebStatus("idle")
    setCadStatus("idle")
    setSynthStatus("idle")
    setIfaceStatus("idle")
    setCodeStatus("idle")
    setExecStatus("idle")
    setWebResult(null)
    setCadResult(null)
    setSynthResult(null)
    setIfaceResult(null)
    setCodeResult(null)
    setExecResult(null)
    setEditableReport("")
    setEditableInterface("")
  }, [])

  const hasResearch = synthStatus === "done" && editableReport.trim().length > 0
  const hasInterface = ifaceStatus === "done" && editableInterface.trim().length > 0
  const hasCode = codeStatus === "done" && (codeResult?.code?.length ?? 0) > 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-international-orange" />
          <h1 className="text-2xl font-bold text-foreground">The Forge</h1>
          <span className="text-xs font-mono bg-international-orange/10 text-international-orange px-2 py-1 rounded">
            CLAUDE
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Research → Plan Dimensions → Generate → Execute.
          Following the CadQuery methodology exactly.
        </p>
      </div>

      {/* ── Input ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label htmlFor="subject">What do you want to model?</Label>
            <div className="flex gap-3">
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Nespresso capsule auto-reloader, DJI Mavic Air 2 drone"
                disabled={isAnyRunning}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && subject.trim() && !isAnyRunning) handleResearch()
                }}
              />
              {hasResearch && (
                <Button variant="ghost" size="sm" onClick={handleReset} disabled={isAnyRunning}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Start Over
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* STEP 1: RESEARCH                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              Step 1: Research Real Dimensions
            </CardTitle>
            {hasResearch && (
              <span className="text-xs text-status-success flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Complete
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Before anything else, search for real-world reference dimensions. Never invent dimensions.
          </p>

          <Button
            onClick={handleResearch}
            disabled={isAnyRunning || !subject.trim()}
            variant={hasResearch ? "secondary" : "default"}
          >
            {webStatus === "running" || cadStatus === "running" || synthStatus === "running" ? (
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
                Research Dimensions
              </>
            )}
          </Button>

          {/* ── Live progress panel ── */}
          {webStatus !== "idle" && (
            <div className="border rounded-md p-4 space-y-1 bg-muted/20">
              <StatusRow
                status={webStatus}
                label="Searching web for real dimensions"
                detail={
                  webResult?.success
                    ? `Found ${webResult.sources.length} sources`
                    : webResult?.error
                }
                timeMs={webResult?.timeMs}
              />
              <StatusRow
                status={cadStatus}
                label="Searching Thingiverse for CAD references"
                detail={
                  cadResult?.success
                    ? cadResult.models.length > 0
                      ? `Found ${cadResult.models.length} reference models`
                      : "No reference models found"
                    : cadResult?.error
                }
                timeMs={cadResult?.timeMs}
              />
              <StatusRow
                status={synthStatus}
                label="Claude synthesizing engineering report"
                detail={
                  synthResult?.success
                    ? "Report ready"
                    : synthResult?.error
                }
                timeMs={synthResult?.timeMs}
              />
            </div>
          )}

          {/* ── Web sources (inline) ── */}
          {webResult?.success && webResult.sources.length > 0 && (
            <details className="border rounded-md">
              <summary className="cursor-pointer p-3 text-sm font-medium hover:bg-muted/50 transition-colors flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Web Sources ({webResult.sources.length})
              </summary>
              <div className="p-3 border-t">
                <ul className="space-y-1">
                  {webResult.sources.map((source, i) => (
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
            </details>
          )}
        </CardContent>
      </Card>

      {/* ── Research Report (editable) ── */}
      {hasResearch && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Engineering Research Report
              <span className="text-xs font-normal text-muted-foreground">
                Review dimensions — edit if needed
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-md p-4 bg-muted/30">
              <Markdown content={editableReport} className="text-sm text-foreground" />
            </div>
            <details className="border rounded-md">
              <summary className="cursor-pointer p-3 text-sm font-medium hover:bg-muted/50 transition-colors">
                Edit raw markdown ({editableReport.length.toLocaleString()} chars)
              </summary>
              <div className="p-3 border-t">
                <Textarea
                  value={editableReport}
                  onChange={(e) => setEditableReport(e.target.value)}
                  className="font-mono text-xs min-h-[400px]"
                  disabled={isAnyRunning}
                />
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* STEP 2: INTERFACE DEFINITION                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {hasResearch && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Ruler className="h-4 w-4" />
                Step 2: Plan Dimensions
              </CardTitle>
              {hasInterface && (
                <span className="text-xs text-status-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Complete ({((ifaceResult?.timeMs ?? 0) / 1000).toFixed(1)}s)
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Before generating the 3D model, we plan every dimension and placement in text first.
              Covers space budget, component positions, connections, and a validation checklist.
            </p>
            <p className="text-sm text-muted-foreground font-medium">
              Rule: if the numbers don&apos;t add up in text, they won&apos;t add up in 3D.
            </p>
            <Button
              onClick={handleInterface}
              disabled={isAnyRunning || !hasResearch}
              variant={hasInterface ? "secondary" : "default"}
            >
              {ifaceStatus === "running" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Planning Dimensions...
                </>
              ) : hasInterface ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Regenerate
                </>
              ) : (
                <>
                  <Ruler className="h-4 w-4 mr-2" />
                  Plan Dimensions
                </>
              )}
            </Button>

            {ifaceResult && !ifaceResult.success && ifaceResult.error && (
              <div className="p-3 bg-status-error-light rounded text-sm text-destructive font-mono">
                {ifaceResult.error}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Dimension Plan (editable) ── */}
      {hasInterface && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Dimension Plan
              <span className="text-xs font-normal text-muted-foreground">
                Space Budget + Component Placement + Connection Map + Validation
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-md p-4 bg-muted/30">
              <pre className="text-xs font-mono whitespace-pre-wrap text-foreground">
                {editableInterface}
              </pre>
            </div>
            <details className="border rounded-md">
              <summary className="cursor-pointer p-3 text-sm font-medium hover:bg-muted/50 transition-colors">
                Edit dimension plan ({editableInterface.length.toLocaleString()} chars)
              </summary>
              <div className="p-3 border-t">
                <Textarea
                  value={editableInterface}
                  onChange={(e) => setEditableInterface(e.target.value)}
                  className="font-mono text-xs min-h-[400px]"
                  disabled={isAnyRunning}
                />
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* STEP 3: GENERATE CODE                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {hasInterface && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                Step 3: Generate CadQuery Code
              </CardTitle>
              {hasCode && (
                <span className="text-xs text-status-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {codeResult?.lines} lines ({((codeResult?.timeMs ?? 0) / 1000).toFixed(1)}s)
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Now — and only now — write geometry. Claude generates complete CadQuery Python
              code following all the rules: component functions, derived parameters, validation checks.
            </p>
            <Button
              onClick={handleCode}
              disabled={isAnyRunning || !hasInterface}
              variant={hasCode ? "secondary" : "default"}
            >
              {codeStatus === "running" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating Code...
                </>
              ) : hasCode ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Regenerate Code
                </>
              ) : (
                <>
                  <Code2 className="h-4 w-4 mr-2" />
                  Generate Code
                </>
              )}
            </Button>

            {codeResult && !codeResult.success && codeResult.error && (
              <div className="p-3 bg-status-error-light rounded text-sm text-destructive font-mono">
                {codeResult.error}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Code display ── */}
      {hasCode && codeResult?.code && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                Generated Code
                <span className="text-xs font-normal text-muted-foreground">
                  ({codeResult.lines} lines)
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyCode} className="gap-1.5">
                  {codeCopied ? (
                    <><Check className="h-3.5 w-3.5" /> Copied!</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> Copy</>
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
                {codeResult.code}
              </pre>
            </CardContent>
          )}
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* STEP 4: EXECUTE                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {hasCode && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="h-4 w-4" />
                Step 4: Execute on Modal
              </CardTitle>
              {execStatus === "done" && (
                <span className="text-xs text-status-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Done ({((execResult?.timeMs ?? 0) / 1000).toFixed(1)}s)
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Run the CadQuery code on Modal to produce STEP + STL + SVG exports.
            </p>
            <Button
              onClick={handleExecute}
              disabled={isAnyRunning || !hasCode}
              variant={execStatus === "done" ? "secondary" : "default"}
            >
              {execStatus === "running" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Executing (~60s)...
                </>
              ) : execStatus === "done" ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Re-Execute
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Execute Code
                </>
              )}
            </Button>

            {execResult && !execResult.success && execResult.error && (
              <div className="p-3 bg-status-error-light rounded text-sm text-destructive font-mono whitespace-pre-wrap">
                {execResult.error}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* RESULTS                                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {execResult?.success && (
        <div className="space-y-6">
          {/* Views */}
          {(execResult.stl || execResult.svgIso || execResult.svgFront || execResult.svgTop) && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Box className="h-4 w-4" />
                    Views
                  </CardTitle>
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
              </CardHeader>
              <CardContent>
                <Tabs value={activeViewTab} onValueChange={(v) => setActiveViewTab(v as ViewTab)}>
                  <TabsList className="flex w-full overflow-x-auto">
                    {execResult.stl && <TabsTrigger value="3d" className="flex-1">3D Model</TabsTrigger>}
                    {execResult.svgIso && <TabsTrigger value="iso" className="flex-1">Isometric</TabsTrigger>}
                    {execResult.svgExploded && <TabsTrigger value="exploded" className="flex-1">Exploded</TabsTrigger>}
                    {execResult.svgFront && <TabsTrigger value="front" className="flex-1">Front</TabsTrigger>}
                    {execResult.svgBack && <TabsTrigger value="back" className="flex-1">Back</TabsTrigger>}
                    {execResult.svgLeft && <TabsTrigger value="left" className="flex-1">Left</TabsTrigger>}
                    {execResult.svgRight && <TabsTrigger value="right" className="flex-1">Right</TabsTrigger>}
                    {execResult.svgTop && <TabsTrigger value="top" className="flex-1">Top</TabsTrigger>}
                  </TabsList>
                  {execResult.stl && (
                    <TabsContent value="3d" className="mt-4">
                      <div className="h-[500px] bg-muted/30 rounded-lg overflow-hidden">
                        <STLViewer stlData={execResult.stl} />
                      </div>
                    </TabsContent>
                  )}
                  {execResult.svgIso && (
                    <TabsContent value="iso" className="mt-4">
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={execResult.svgIso} alt="Isometric view" className="w-full cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenView("iso")} />
                      </div>
                    </TabsContent>
                  )}
                  {execResult.svgExploded && (
                    <TabsContent value="exploded" className="mt-4">
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={execResult.svgExploded} alt="Exploded isometric view" className="w-full cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenView("exploded")} />
                      </div>
                    </TabsContent>
                  )}
                  {execResult.svgFront && (
                    <TabsContent value="front" className="mt-4">
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={execResult.svgFront} alt="Front view" className="w-full cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenView("front")} />
                      </div>
                    </TabsContent>
                  )}
                  {execResult.svgBack && (
                    <TabsContent value="back" className="mt-4">
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={execResult.svgBack} alt="Back view" className="w-full cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenView("back")} />
                      </div>
                    </TabsContent>
                  )}
                  {execResult.svgLeft && (
                    <TabsContent value="left" className="mt-4">
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={execResult.svgLeft} alt="Left view" className="w-full cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenView("left")} />
                      </div>
                    </TabsContent>
                  )}
                  {execResult.svgRight && (
                    <TabsContent value="right" className="mt-4">
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={execResult.svgRight} alt="Right view" className="w-full cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenView("right")} />
                      </div>
                    </TabsContent>
                  )}
                  {execResult.svgTop && (
                    <TabsContent value="top" className="mt-4">
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={execResult.svgTop} alt="Top view" className="w-full cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenView("top")} />
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Library Components Used */}
          {execResult.libraryComponents && execResult.libraryComponents.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Library className="h-4 w-4 text-international-orange mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {execResult.libraryComponents.length} library component{execResult.libraryComponents.length > 1 ? "s" : ""} used
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pre-built geometry from the component library was injected for recognisable parts:
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {execResult.libraryComponents.map((slug) => (
                        <span
                          key={slug}
                          className="text-xs font-mono bg-international-orange/10 text-international-orange px-2 py-0.5 rounded"
                        >
                          {slug}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {execResult.bbox && (
                  <div>
                    <p className="text-xs text-muted-foreground">Bounding Box</p>
                    <p className="font-mono font-semibold">{execResult.bbox.xLen} x {execResult.bbox.yLen} x {execResult.bbox.zLen} mm</p>
                  </div>
                )}
                {execResult.stepSizeKb != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">STEP Size</p>
                    <p className="font-mono font-semibold">
                      {execResult.stepSizeKb > 1024
                        ? `${(execResult.stepSizeKb / 1024).toFixed(1)} MB`
                        : `${execResult.stepSizeKb} KB`}
                    </p>
                  </div>
                )}
                {execResult.stlSizeKb != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">STL Size</p>
                    <p className="font-mono font-semibold">
                      {execResult.stlSizeKb > 1024
                        ? `${(execResult.stlSizeKb / 1024).toFixed(1)} MB`
                        : `${execResult.stlSizeKb} KB`}
                    </p>
                  </div>
                )}
                {execResult.fillRatio != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Fill Ratio</p>
                    <p className="font-mono font-semibold">{execResult.fillRatio}%</p>
                  </div>
                )}
                {execResult.massGrams != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Mass</p>
                    <p className="font-mono font-semibold">{execResult.massGrams} g</p>
                  </div>
                )}
                {codeResult?.lines != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Code Lines</p>
                    <p className="font-mono font-semibold">{codeResult.lines}</p>
                  </div>
                )}
                {execResult.timeMs != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Execution Time</p>
                    <p className="font-mono font-semibold">{(execResult.timeMs / 1000).toFixed(1)}s</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Fullscreen overlay ── */}
      {fullscreenView && execResult && (() => {
        const svgMap: Record<string, string | undefined> = {
          iso: execResult.svgIso,
          exploded: execResult.svgExploded,
          front: execResult.svgFront,
          back: execResult.svgBack,
          left: execResult.svgLeft,
          right: execResult.svgRight,
          top: execResult.svgTop,
        }
        const svgSrc = svgMap[fullscreenView]

        return (
          <div
            className="fixed inset-0 z-50 bg-background/95 flex items-center justify-center p-8"
            onClick={() => setFullscreenView(null)}
          >
            <button
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors text-sm font-mono"
              onClick={() => setFullscreenView(null)}
            >
              ESC to close
            </button>
            {fullscreenView === "3d" && execResult.stl ? (
              <div className="w-full h-full" onClick={(e) => e.stopPropagation()}>
                <STLViewer stlData={execResult.stl} />
              </div>
            ) : svgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={svgSrc} alt={`${fullscreenView} view`} className="max-w-full max-h-full object-contain" />
            ) : null}
          </div>
        )
      })()}
    </div>
  )
}

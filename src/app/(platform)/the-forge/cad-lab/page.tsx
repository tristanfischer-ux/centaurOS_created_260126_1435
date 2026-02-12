"use client"

/**
 * @file page.tsx — Hidden CAD Lab for testing CadQuery generation (V2)
 *
 * @description Two-step flow:
 *   Step 1: Research — web search + Thingiverse + Claude synthesis → editable report
 *   Step 2: Generate — component-decomposed pipeline with the research report
 *
 * Not linked from navigation. Access via /the-forge/cad-lab (behind platform auth).
 */

import { useState, useCallback } from "react"
import {
  Loader2,
  Play,
  Code2,
  Box,
  Timer,
  Zap,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Layers,
  Globe,
  ExternalLink,
  Search,
  ArrowRight,
  RotateCcw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

import { runCadLabResearch, generateCadLabModel } from "@/actions/cad-lab"
import { GEMINI_MODELS } from "@/lib/cad-lab-types"

import type { CadLabResult, CadLabResearchResult, GeminiModelId } from "@/lib/cad-lab-types"

export default function CadLabPage(): React.ReactNode {
  // ── Input state ──
  const [subject, setSubject] = useState("DJI Mavic Air 2 quadcopter drone")
  const [modelId, setModelId] = useState<GeminiModelId>("gemini-2.5-pro")

  // ── Step 1: Research state ──
  const [isResearching, setIsResearching] = useState(false)
  const [researchResult, setResearchResult] = useState<CadLabResearchResult | null>(null)
  const [editableReport, setEditableReport] = useState("")
  const [showSources, setShowSources] = useState(false)

  // ── Step 2: Generation state ──
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<CadLabResult | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [showInterface, setShowInterface] = useState(false)

  // ── Step 1: Research ──
  const handleResearch = useCallback(async () => {
    setIsResearching(true)
    setResearchResult(null)
    setResult(null)
    setEditableReport("")
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

  // ── Step 2: Generate ──
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setResult(null)
    try {
      const res = await generateCadLabModel(subject, editableReport || undefined, modelId)
      setResult(res)
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setIsGenerating(false)
    }
  }, [subject, editableReport, modelId])

  // ── Reset to start over ──
  const handleReset = useCallback(() => {
    setResearchResult(null)
    setEditableReport("")
    setResult(null)
  }, [])

  const hasResearch = researchResult?.success && editableReport.trim().length > 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-international-orange" />
          <h1 className="text-2xl font-bold text-foreground">CAD Lab</h1>
          <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-1 rounded">
            V2 / COMPONENT PIPELINE
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Step 1: Research (Claude + web search) → Step 2: Generate (component pipeline + Modal).
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STEP 1: RESEARCH                                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Step 1: Research
            {researchResult?.success && (
              <span className="text-xs font-normal text-status-success flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Complete ({(researchResult.researchTime / 1000).toFixed(1)}s)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., DJI Mavic Air 2 quadcopter drone"
              disabled={isResearching || isGenerating}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleResearch}
              disabled={isResearching || isGenerating || !subject.trim()}
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
                (synthesized by Claude — edit before generating)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={editableReport}
              onChange={(e) => setEditableReport(e.target.value)}
              className="font-mono text-xs min-h-[400px]"
              disabled={isGenerating}
            />
            <p className="text-xs text-muted-foreground">
              {editableReport.length.toLocaleString()} characters — review and edit dimensions before generating.
            </p>
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
                    Web Sources (Gemini + Google Search)
                  </p>
                  <ul className="space-y-1">
                    {researchResult.sources.map((source, i) => (
                      <li key={i} className="text-xs font-mono flex items-start gap-1.5">
                        <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <a
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-electric-blue hover:underline truncate block"
                          >
                            {source.title || source.uri}
                          </a>
                          {source.title && (
                            <span className="text-muted-foreground truncate block">{source.uri}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {researchResult.referenceModels.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Thingiverse Reference Models
                  </p>
                  <ul className="space-y-1">
                    {researchResult.referenceModels.map((model, i) => (
                      <li key={i} className="text-xs font-mono flex items-center gap-1.5">
                        <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <a
                          href={model.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-electric-blue hover:underline"
                        >
                          {model.name}
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
      {/* STEP 2: GENERATE                                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {hasResearch && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Play className="h-4 w-4" />
              Step 2: Generate CAD Model
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="model">Gemini Model</Label>
              <select
                id="model"
                value={modelId}
                onChange={(e) => setModelId(e.target.value as GeminiModelId)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isGenerating}
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !hasResearch}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Pipeline running (~35-40s)...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Generate from Research
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* GENERATION RESULTS                                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {result && (
        <div className="space-y-6">
          {/* Status */}
          {result.error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-sm text-destructive font-mono whitespace-pre-wrap">
                  {result.error}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Pipeline Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Pipeline Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 flex-wrap">
                <PipelineStage label="Research" status="done" />
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <PipelineStage
                  label="Interface"
                  status={result.interfaceDefinition ? "done" : "fail"}
                />
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <PipelineStage
                  label={`Components (${result.validatedCount ?? 0}/${result.componentCount ?? 0})`}
                  status={
                    (result.validatedCount ?? 0) > 0
                      ? (result.skippedComponents?.length ?? 0) > 0
                        ? "warn"
                        : "done"
                      : "fail"
                  }
                />
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <PipelineStage
                  label="Assembly"
                  status={result.code ? "done" : "fail"}
                />
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <PipelineStage
                  label="Modal"
                  status={result.svgIso ? "done" : result.modalTime ? "fail" : "pending"}
                />
              </div>

              {/* Skipped components */}
              {result.skippedComponents && result.skippedComponents.length > 0 && (
                <div className="mt-3 p-2 bg-status-warning-light rounded text-xs font-mono text-status-warning-dark">
                  <AlertTriangle className="h-3 w-3 inline mr-1" />
                  Skipped components: {result.skippedComponents.join(", ")}
                </div>
              )}

              {/* Validation warnings */}
              {result.validationWarnings && result.validationWarnings.length > 0 && (
                <div className="mt-3 p-2 bg-status-warning-light rounded text-xs font-mono text-status-warning-dark space-y-1">
                  <p className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Post-execution warnings:
                  </p>
                  {result.validationWarnings.map((w, i) => (
                    <p key={i}>• {w}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Interface Definition (expandable) */}
          {result.interfaceDefinition && (
            <Card>
              <CardHeader>
                <button
                  onClick={() => setShowInterface(!showInterface)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Interface Definition
                  </CardTitle>
                  {showInterface ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CardHeader>
              {showInterface && (
                <CardContent>
                  <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-auto max-h-[500px] whitespace-pre-wrap">
                    {result.interfaceDefinition}
                  </pre>
                </CardContent>
              )}
            </Card>
          )}

          {/* SVGs */}
          {(result.svgIso || result.svgFront || result.svgTop) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Views</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {result.svgIso && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-mono">Isometric</p>
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result.svgIso} alt="Isometric view" className="w-full" />
                      </div>
                    </div>
                  )}
                  {result.svgFront && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-mono">Front</p>
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result.svgFront} alt="Front view" className="w-full" />
                      </div>
                    </div>
                  )}
                  {result.svgTop && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-mono">Top</p>
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result.svgTop} alt="Top view" className="w-full" />
                      </div>
                    </div>
                  )}
                </div>
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
                {result.componentCount != null && (
                  <Metric
                    icon={<Layers className="h-3.5 w-3.5" />}
                    label="Components"
                    value={`${result.validatedCount ?? 0} / ${result.componentCount}`}
                  />
                )}
                {result.modelUsed && (
                  <Metric label="Model" value={result.modelUsed} />
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

          {/* Code */}
          {result.code && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Code2 className="h-4 w-4" />
                    Generated Code
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowCode(!showCode)}>
                    {showCode ? "Hide" : "Show"}
                  </Button>
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
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

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
 * PipelineStage — visual indicator for a pipeline step.
 */
function PipelineStage({
  label,
  status,
}: {
  label: string
  status: "done" | "warn" | "fail" | "pending"
}): React.ReactNode {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono">
      {status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />}
      {status === "warn" && <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />}
      {status === "fail" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
      {status === "pending" && <div className="h-3.5 w-3.5 rounded-full bg-muted" />}
      <span className="text-foreground">{label}</span>
    </div>
  )
}

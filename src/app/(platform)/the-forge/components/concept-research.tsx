/**
 * @file concept-research.tsx — Product research section for the Concept page
 *
 * @description Shows a "Research your product" step between the ScanHero and
 * SystemBlueprint. Runs Gemini Search + Claude Opus to produce a comprehensive
 * product research report that the user can review and edit before proceeding
 * to module generation.
 *
 * @component
 *
 * @example
 * <ConceptResearch
 *   idea="an automated page turning device that can scan manuscripts"
 *   scanId="scan_123"
 *   onResearchComplete={(report) => console.log(report)}
 * />
 *
 * @related
 * - concept-view.tsx (parent)
 * - xray.ts (runConceptResearchAction, saveConceptResearchAction)
 */

"use client"

import React, { useState, useCallback, useEffect } from "react"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Markdown } from "@/components/ui/markdown"
import {
  Search,
  Globe,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

import { typography } from "@/lib/design-system"
import {
  runConceptResearchAction,
  saveConceptResearchAction,
} from "@/actions/xray"
import type { ConceptResearchResult } from "@/actions/xray"

// ─── Types ───────────────────────────────────────────────────────────

interface ConceptResearchProps {
  /** The product idea text */
  idea: string
  /** The scan ID for persisting the report */
  scanId: string
  /** Previously saved research report (loaded from DB) */
  savedResearch?: {
    report: string
    sources: Array<{ uri: string; title: string }>
  } | null
  /** Called when research is complete with the report text */
  onResearchComplete?: (report: string) => void
  /** Whether the concept scan is currently running */
  isScanning?: boolean
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * ConceptResearch — Product research step in the Forge concept flow.
 *
 * @description Provides a one-click research experience:
 * 1. User clicks "Research Product" → Gemini searches the web → Claude Opus
 *    synthesizes a comprehensive report
 * 2. Report is displayed in an editable textarea
 * 3. Sources are shown in an expandable section
 * 4. Report auto-saves to the database
 *
 * The research report can later be passed to the AI scan for better module generation.
 */
export function ConceptResearch({
  idea,
  scanId,
  savedResearch,
  onResearchComplete,
  isScanning,
}: ConceptResearchProps): React.ReactNode {
  // ── State ──
  const [isResearching, setIsResearching] = useState(false)
  const [report, setReport] = useState(savedResearch?.report ?? "")
  const [sources, setSources] = useState<Array<{ uri: string; title: string }>>(
    savedResearch?.sources ?? [],
  )
  const [researchTime, setResearchTime] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false)

  const hasReport = report.trim().length > 0

  // ── Restore saved research on mount ──
  useEffect(() => {
    if (savedResearch?.report) {
      setReport(savedResearch.report)
      setSources(savedResearch.sources ?? [])
    }
  }, [savedResearch])

  // ── Research handler ──
  const handleResearch = useCallback(async (): Promise<void> => {
    if (!idea.trim()) {
      toast.error("Please enter a product idea first")
      return
    }

    setIsResearching(true)
    setError(null)
    toast.info("Researching your product — this takes about 30-60 seconds...", { duration: 5000 })

    try {
      const result = await runConceptResearchAction(idea.trim())

      if ("error" in result && !("success" in result)) {
        setError(result.error)
        toast.error("Research failed")
        return
      }

      const researchResult = result as ConceptResearchResult
      if (!researchResult.success) {
        setError(researchResult.error ?? "Research failed")
        toast.error("Research failed")
        return
      }

      setReport(researchResult.report)
      setSources(researchResult.sources)
      setResearchTime(researchResult.researchTime)
      setHasUnsavedEdits(false)

      // Auto-save to database
      await saveConceptResearchAction(scanId, researchResult.report, researchResult.sources)

      // Notify parent
      onResearchComplete?.(researchResult.report)

      toast.success(
        `Research complete — ${researchResult.sources.length} sources found`,
        { duration: 4000 },
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      setError(message)
      toast.error("Research failed")
    } finally {
      setIsResearching(false)
    }
  }, [idea, scanId, onResearchComplete])

  // ── Auto-trigger research when idea exists but no report yet ──
  // This removes the need for a separate "Research Product" button click.
  // Runs once when the component mounts with a valid idea and no existing report.
  const hasAutoTriggered = React.useRef(false)
  useEffect(() => {
    if (
      idea.trim() &&
      !hasReport &&
      !isResearching &&
      !isScanning &&
      !savedResearch?.report &&
      !hasAutoTriggered.current
    ) {
      hasAutoTriggered.current = true
      handleResearch()
    }
  }, [idea, hasReport, isResearching, isScanning, savedResearch, handleResearch])

  // ── Save edited report ──
  const handleSaveEdits = useCallback(async (): Promise<void> => {
    try {
      await saveConceptResearchAction(scanId, report, sources)
      setHasUnsavedEdits(false)
      onResearchComplete?.(report)
      toast.success("Research report saved")
    } catch {
      toast.error("Failed to save edits")
    }
  }, [scanId, report, sources, onResearchComplete])

  // ── Handle report edits ──
  const handleReportChange = useCallback((value: string): void => {
    setReport(value)
    setHasUnsavedEdits(true)
  }, [])

  return (
    <Card className="rounded-xl shadow-sm border overflow-hidden">
      {/* Orange accent bar */}
      <div className="h-1 bg-international-orange" />

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-international-orange/10">
              <Search className="h-4.5 w-4.5 text-international-orange" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">
                Product Research
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {hasReport
                  ? "Review and edit the research findings before generating modules"
                  : "Research your product concept before building — better data means better results"}
              </p>
            </div>
          </div>

          {/* Status indicator */}
          {hasReport && !isResearching && (
            <div className="flex items-center gap-1.5 text-sm text-status-success">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">Complete</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Waiting state — shown when no report yet and not researching (auto-trigger pending) */}
        {!hasReport && !isResearching && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-international-orange/10">
              <Search className="h-7 w-7 text-international-orange" />
            </div>
            <div className="text-center max-w-md">
              <p className="text-sm font-medium text-foreground mb-1">
                Deep Product Research
              </p>
              <p className="text-sm text-muted-foreground">
                Research will start automatically once your concept is ready. It searches
                the web for specifications, competitors, materials, and engineering
                considerations — then synthesizes everything into a structured report.
              </p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isResearching && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="relative">
              <div className="h-14 w-14 rounded-full border-4 border-muted" />
              <div className="absolute inset-0 h-14 w-14 rounded-full border-4 border-transparent border-t-international-orange animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Researching your product...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Searching the web &middot; Synthesizing findings into a report
              </p>
            </div>
          </div>
        )}

        {/* Research report — shown after research completes */}
        {hasReport && !isResearching && (
          <div className="space-y-4">
            {/* Report timing */}
            {researchTime && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Research completed in {(researchTime / 1000).toFixed(1)}s
                </span>
                <span className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" />
                  {sources.length} web sources
                </span>
              </div>
            )}

            {/* Research report display */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Research Report
                </label>
                <div className="flex items-center gap-2">
                  {hasUnsavedEdits && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSaveEdits}
                      className="gap-1.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Save Edits
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResearch}
                    disabled={!idea.trim() || isScanning}
                    className="gap-1.5 text-muted-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Re-research
                  </Button>
                </div>
              </div>

              {/* Rendered markdown view */}
              <div className="border rounded-lg p-5 bg-muted/20">
                <Markdown content={report} className="text-sm text-foreground" />
              </div>

              {/* Collapsible raw editor */}
              <details className="border rounded-lg">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors select-none">
                  Edit raw markdown
                </summary>
                <div className="px-4 pb-4 pt-2 border-t">
                  <Textarea
                    value={report}
                    onChange={(e) => handleReportChange(e.target.value)}
                    className="min-h-[300px] font-mono text-xs leading-relaxed resize-y"
                    placeholder="Research report will appear here..."
                    disabled={isScanning}
                  />
                </div>
              </details>

              <p className="text-xs text-muted-foreground">
                You can edit this report before proceeding. Changes will be used as context
                when generating your product modules.
              </p>
            </div>

            {/* Expandable sources */}
            {sources.length > 0 && (
              <div className="border rounded-lg">
                <button
                  type="button"
                  onClick={() => setShowSources(!showSources)}
                  className={cn(
                    "flex w-full items-center justify-between px-4 py-3 text-sm font-medium",
                    "text-foreground hover:bg-muted/50 transition-colors rounded-lg",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    Research Sources ({sources.length})
                  </span>
                  {showSources ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {showSources && (
                  <div className="border-t px-4 py-3 space-y-2">
                    {sources.map((source, idx) => (
                      <a
                        key={`${source.uri}-${idx}`}
                        href={source.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-electric-blue hover:underline group"
                      >
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 opacity-60 group-hover:opacity-100" />
                        <span className="truncate">{source.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

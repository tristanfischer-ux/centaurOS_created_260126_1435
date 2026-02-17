"use client"

/**
 * @file research-section.tsx — Research trigger, report viewer, and sources.
 *
 * @description Contains the research action button, the editable research
 * report with raw-markdown toggle, and the collapsible source citations.
 */

import {
  Loader2,
  Search,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe,
  ExternalLink,
  RotateCcw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/components/ui/markdown"
import type { CadLabResearchResult } from "@/lib/cad-lab-types"

// ─── Component ───────────────────────────────────────────────────────

interface ResearchSectionProps {
  isResearching: boolean
  hasResearch: boolean
  isAnyLoading: boolean
  subjectTrimmed: boolean
  researchResult: CadLabResearchResult | null
  editableReport: string
  setEditableReport: (value: string) => void
  showSources: boolean
  setShowSources: (value: boolean) => void
  handleResearch: () => void
  handleReset: () => void
}

/**
 * ResearchSection — Research button, editable report viewer, and source citations.
 */
export function ResearchSection({
  isResearching,
  hasResearch,
  isAnyLoading,
  subjectTrimmed,
  researchResult,
  editableReport,
  setEditableReport,
  showSources,
  setShowSources,
  handleResearch,
  handleReset,
}: ResearchSectionProps): React.ReactNode {
  return (
    <>
      {/* ── Research button ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Research Real Dimensions
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
              id="research-btn"
              onClick={handleResearch}
              disabled={isAnyLoading || !subjectTrimmed}
              variant={hasResearch ? "secondary" : "default"}
            >
              {isResearching ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Researching...</>
              ) : hasResearch ? (
                <><RotateCcw className="h-4 w-4 mr-2" />Re-Research</>
              ) : (
                <><Search className="h-4 w-4 mr-2" />Research Product</>
              )}
            </Button>
            {hasResearch && (
              <Button variant="ghost" size="sm" onClick={handleReset}>Start Over</Button>
            )}
          </div>

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
            <div className="border rounded-md p-4 bg-muted/30">
              <Markdown content={editableReport} className="text-sm text-foreground" />
            </div>
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

      {/* ── Research Sources ── */}
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Web Sources</p>
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
    </>
  )
}

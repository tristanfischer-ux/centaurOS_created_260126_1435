"use client"

/**
 * @file research-section.tsx — Research report viewer and sources.
 *
 * @description Displays the editable research report with raw-markdown toggle
 * and collapsible source citations. The research trigger button has been moved
 * to the hero section for a cleaner flow — this component only handles results.
 */

import {
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe,
  ExternalLink,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/components/ui/markdown"
import type { CadLabResearchResult } from "@/lib/cad-lab-types"

// ─── Component ───────────────────────────────────────────────────────

interface ResearchSectionProps {
  hasResearch: boolean
  isAnyLoading: boolean
  researchResult: CadLabResearchResult | null
  editableReport: string
  setEditableReport: (value: string) => void
  showSources: boolean
  setShowSources: (value: boolean) => void
  handleReset: () => void
}

/**
 * ResearchSection — Editable report viewer and source citations.
 * Only renders when research has completed.
 */
export function ResearchSection({
  hasResearch,
  isAnyLoading,
  researchResult,
  editableReport,
  setEditableReport,
  showSources,
  setShowSources,
  handleReset,
}: ResearchSectionProps): React.ReactNode {
  if (!hasResearch && !researchResult?.error) return null

  return (
    <>
      {/* ── Error display ── */}
      {researchResult && !researchResult.success && researchResult.error && (
        <Card>
          <CardContent className="pt-6">
            <div className="p-3 bg-status-error-light rounded text-sm text-destructive font-mono">
              {researchResult.error}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Research Report (editable) ── */}
      {hasResearch && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Research Report
                {researchResult?.success && (
                  <span className="text-xs font-normal text-status-success flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Complete ({(researchResult.researchTime / 1000).toFixed(1)}s)
                  </span>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Start Over
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Review and edit dimensions before proceeding to Build.
            </p>
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

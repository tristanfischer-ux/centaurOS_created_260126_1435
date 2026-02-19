"use client"

/**
 * @file research-section.tsx — Section 2: Research results.
 *
 * INTENT: Combines the research report viewer, source citations, module
 * decomposition overview, and system architecture diagram into one
 * scrollable block. Replaces the standalone Research page.
 */

import { useMemo } from "react"
import {
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe,
  ExternalLink,
  Loader2,
  Network,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/components/ui/markdown"
import { CadLabResearchReport } from "@/components/cad/cad-lab-research-report"
import { SystemVisualOverview } from "../../cad-lab/components/system-visual-overview"
import { ProcessFlowDiagram } from "../../cad-lab/components/process-flow-diagram"

import { useCadLab } from "../../cad-lab/cad-lab-context"

export function ResearchSection(): React.ReactNode {
  const {
    researchResult,
    editableReport,
    setEditableReport,
    showSources,
    setShowSources,
    isAnyLoading,
    isDecomposing,
    modules,
    referenceModel,
  } = useCadLab()

  const useStructuredReport = useMemo(
    () => /^##\s+/m.test(editableReport),
    [editableReport],
  )

  if (!researchResult) return null

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-international-orange text-white text-xs font-bold">
            2
          </div>
          <h2 className="text-lg font-semibold text-foreground">Research</h2>
          {researchResult.success && (
            <span className="text-xs font-normal text-status-success flex items-center gap-1 ml-2">
              <CheckCircle2 className="h-3 w-3" />
              Complete ({(researchResult.researchTime / 1000).toFixed(1)}s)
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground ml-9">
          Engineering research report from web sources and reference models.
        </p>
      </div>

      {/* Error display */}
      {!researchResult.success && researchResult.error && (
        <Card>
          <CardContent className="pt-6">
            <div className="p-3 bg-status-error-light rounded text-sm text-destructive font-mono">
              {researchResult.error}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Research Report */}
      {researchResult.success && editableReport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Research Report
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {editableReport.length.toLocaleString()} characters &middot; Review and edit before proceeding
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-md p-4 bg-muted/30">
              {useStructuredReport ? (
                <CadLabResearchReport report={editableReport} />
              ) : (
                <Markdown content={editableReport} className="text-sm text-foreground" />
              )}
            </div>
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

      {/* Research Sources */}
      {researchResult.success &&
        (researchResult.sources.length > 0 || researchResult.referenceModels.length > 0) && (
        <Card>
          <CardHeader>
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center justify-between w-full text-left"
            >
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Sources
                <span className="text-xs font-normal text-muted-foreground">
                  ({researchResult.sources.length} web + {researchResult.referenceModels.length} CAD refs)
                </span>
              </CardTitle>
              {showSources ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
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
                        <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-electric-blue hover:underline truncate">
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

      {/* Decomposition loading */}
      {isDecomposing && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
              Decomposing into sub-assemblies...
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Visual Overview (module cards around reference model) */}
      {modules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="h-4 w-4" />
              System Architecture
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {modules.length} sub-assemblies identified. Module dependencies shown below.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <SystemVisualOverview referenceModel={referenceModel} modules={modules} />
            <ProcessFlowDiagram modules={modules} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

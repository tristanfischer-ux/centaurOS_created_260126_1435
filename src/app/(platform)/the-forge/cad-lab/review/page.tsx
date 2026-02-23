"use client"

/**
 * @file review/page.tsx — The Forge: Review stage (Stage 3).
 *
 * @description Complete factory-ready review package with engineering documentation,
 * DFM analysis, diagnostics, supply chain specifications, cost estimates,
 * expert discipline matching, factory conversation guide, and contracting
 * (RFQ/SOW/NDA). Requires at least one generated module.
 *
 * Gate: shows empty state if no generated modules.
 */

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  ClipboardCheck,
  ArrowLeft,
  CheckCircle2,
  Download,
  Box,
  ChevronDown,
  ChevronRight,
  Layers,
  FileText,
} from "lucide-react"

import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { CadLabReviewPackage } from "@/components/cad/cad-lab-review-package"
import { CadLabPeople } from "@/components/cad/cad-lab-people"
import { CadLabDrawingPackage } from "@/components/cad/cad-lab-drawing-package"
import { CadLabAnalysisDashboard } from "@/components/cad/cad-lab-analysis-dashboard"
import { CadLabDiagnostics } from "@/components/cad/cad-lab-diagnostics"
import { CadLabSupplyChain } from "@/components/cad/cad-lab-supply-chain"
import { CadLabCostEstimate } from "@/components/cad/cad-lab-cost-estimate"
import { CadLabContracting } from "@/components/cad/cad-lab-contracting"
import { CadLabFactoryGuide } from "@/components/cad/cad-lab-factory-guide"
import { useRegisterScreenContext } from "@/contexts/screen-context"

import { useCadLab } from "../cad-lab-context"

export default function CadLabReviewPage(): React.ReactNode {
  const router = useRouter()
  const {
    modules, generatedModuleCount, subject,
    editableReport, diagnosticAnswers, setDiagnosticAnswers,
    aiPrefilled, designBrief, assumptionNotes,
    activeProjectId, linkedRfqId,
    systemIllustrationUrl, researchResult,
  } = useCadLab()

  const [showBuildContext, setShowBuildContext] = useState(false)

  useRegisterScreenContext(
    useMemo(() => {
      const parts: string[] = [`Viewing the Review stage for "${subject}".`]
      parts.push(`Supplier-ready documentation for ${modules.length} modules.`)
      return {
        pageTitle: `The Forge — Review: ${subject}`,
        summary: parts.join(" "),
        entities: modules.slice(0, 15).map((m) => ({
          type: "module",
          title: m.name,
          status: m.status === "generated" ? "CAD generated" : "pending",
        })),
      }
    }, [subject, modules, generatedModuleCount]),
  )

  // Show empty state instead of redirect
  if (generatedModuleCount === 0) {
    return (
      <div className="py-12">
        <EmptyState
          title="No modules generated yet"
          description="Generate at least one module in the Build stage to create a supplier-ready review package with expert discipline recommendations."
          action={
            <Button onClick={() => router.push(FORGE_ROUTES.cadLabBuild)} className="gap-1.5">
              <Box className="h-4 w-4" />
              Go to Build
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stage header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-5 w-5 text-international-orange" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Review Package</h2>
            <p className="text-xs text-muted-foreground">
              Supplier-ready documentation for {modules.length} modules
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push(FORGE_ROUTES.cadLabBuild)} className="gap-1.5 text-xs">
          <ArrowLeft className="h-3 w-3" /> Back to Build
        </Button>
      </div>

      {/* ── Build Context Summary — carries forward key context from Build stage ── */}
      <Card className="overflow-hidden">
        <div className="flex items-start gap-4 p-5">
          {/* System illustration thumbnail */}
          {systemIllustrationUrl && (
            <div className="w-24 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 hidden sm:block border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={systemIllustrationUrl} alt="System overview" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground">{subject}</h3>
            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" /> {modules.length} modules
              </span>
              <span className="flex items-center gap-1">
                <Box className="h-3 w-3" /> {generatedModuleCount} generated
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-status-success" /> {modules.reduce((s, m) => s + m.keyParts.length, 0)} components
              </span>
              {researchResult?.sources && (
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {researchResult.sources.length} research sources
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Collapsible: Build module overview */}
        <button
          onClick={() => setShowBuildContext(!showBuildContext)}
          className="flex items-center justify-between w-full px-5 py-2.5 border-t text-left hover:bg-muted/50 transition-colors"
        >
          <span className="text-xs font-medium text-muted-foreground">Build Stage Summary</span>
          {showBuildContext
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </button>
        {showBuildContext && (
          <div className="px-5 pb-4 space-y-2 border-t pt-3">
            {modules.map((mod) => (
              <div key={mod.id} className="flex items-center gap-3 text-xs p-2 rounded border border-muted">
                {mod.imageUrl && mod.imageStatus === "complete" && (
                  <div className="h-8 w-8 rounded overflow-hidden bg-muted flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mod.imageUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{mod.name}</p>
                  <p className="text-muted-foreground truncate">{mod.purpose}</p>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  mod.status === "generated"
                    ? "bg-status-success-light text-status-success"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {mod.status === "generated" ? "CAD done" : mod.status}
                </span>
                {mod.result?.bbox && (
                  <span className="text-muted-foreground font-mono hidden sm:inline">
                    {mod.result.bbox.xLen}×{mod.result.bbox.yLen}×{mod.result.bbox.zLen}mm
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Engineering review package — quality scorecard, per-module summary */}
      <CadLabReviewPackage modules={modules} projectName={subject} researchReport={editableReport} diagnosticAnswers={diagnosticAnswers} />

      {/* DFM analysis dashboard — manufacturing grade, risk register */}
      <CadLabAnalysisDashboard modules={modules} projectName={subject} />

      {/* Engineering diagnostics — process, material, tolerance, finish, batch, environment */}
      <CadLabDiagnostics
        modules={modules}
        answers={diagnosticAnswers}
        onAnswersChange={setDiagnosticAnswers}
        aiPrefilled={aiPrefilled}
      />

      {/* Supply chain specifications per module */}
      <CadLabSupplyChain modules={modules} diagnosticAnswers={diagnosticAnswers} />

      {/* Cost estimate with tooling breakdown */}
      <CadLabCostEstimate modules={modules} diagnosticAnswers={diagnosticAnswers} />

      {/* Drawing package exports — JSON, Markdown, CSV */}
      <CadLabDrawingPackage modules={modules} projectName={subject} diagnosticAnswers={diagnosticAnswers} />

      {/* Expert discipline matching */}
      <CadLabPeople modules={modules} diagnosticAnswers={diagnosticAnswers} />

      {/* Factory conversation guide — what to know before talking to suppliers */}
      <CadLabFactoryGuide modules={modules} diagnosticAnswers={diagnosticAnswers} />

      {/* Contracting — RFQ, SOW, NDA generation */}
      <CadLabContracting
        modules={modules}
        projectName={subject}
        diagnosticAnswers={diagnosticAnswers}
        projectId={activeProjectId}
        linkedRfqId={linkedRfqId}
        designBrief={designBrief}
        assumptionNotes={assumptionNotes}
      />

      {/* Pipeline Complete */}
      <Card className="border-status-success/30 bg-gradient-to-r from-status-success-light/20 to-background">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-success-light">
                <CheckCircle2 className="h-5 w-5 text-status-success" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Pipeline Complete
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your engineering package for &quot;{subject}&quot; is ready. Copy the review package to share with stakeholders, or go back to Build to download STEP + STL files.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => router.push(FORGE_ROUTES.cadLabBuild)} className="gap-1.5">
                <Download className="h-4 w-4" />
                Back to Downloads
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

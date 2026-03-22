"use client"

/**
 * @file design-report-dialog.tsx
 *
 * @description Format selection dialog for downloading a design report.
 * Offers Word (.docx), Slides (.pptx), or PDF (print dialog) export.
 * Optional "Professional narration" toggle runs a two-phase AI pipeline
 * (Opus structures → Gemini writes) before formatting.
 *
 * INTENT: Export runs as a background operation — dialog closes immediately
 * and progress shows in the BackgroundOps pill. User can navigate freely.
 *
 * @related
 * - src/lib/cad-lab/design-report-types.ts — DesignReportData shape
 * - src/lib/cad-lab/export-design-report-docx.ts — DOCX exporter
 * - src/lib/cad-lab/export-design-report-pptx.ts — PPTX exporter
 * - src/actions/cad-lab-report.ts — AI pipeline (structureReportOutline + writeReportSections)
 */

import { useState, useCallback, useRef } from "react"
import { FileDown, FileText, Presentation, Printer, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

import { useCadLab } from "../cad-lab-context"
import { useBackgroundOp } from "@/hooks/useBackgroundOp"
import type { DesignReportFormat, DesignReportData, ReportStage } from "@/lib/cad-lab/design-report-types"

interface DesignReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stage?: ReportStage
  stageData?: Partial<DesignReportData>
}

const FORMAT_OPTIONS: {
  id: DesignReportFormat
  label: string
  ext: string
  description: string
  icon: typeof FileText
}[] = [
  {
    id: "docx",
    label: "Word",
    ext: ".docx",
    description: "Full report with images and formatted text",
    icon: FileText,
  },
  {
    id: "pptx",
    label: "Slides",
    ext: ".pptx",
    description: "Professional slides for design reviews",
    icon: Presentation,
  },
  {
    id: "pdf",
    label: "PDF",
    ext: "",
    description: "Opens print dialog — use 'Save as PDF'",
    icon: Printer,
  },
]

const STAGE_LABELS: Record<ReportStage, string> = {
  concept: 'Concept',
  specify: 'Specification',
  source: 'Sourcing',
  assemble: 'Assembly',
  cad: 'CAD',
}

export function DesignReportDialog({ open, onOpenChange, stage = 'concept', stageData }: DesignReportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<DesignReportFormat | null>(null)
  const [aiEnabled, setAiEnabled] = useState(true)
  const exportStartedRef = useRef(false)

  const {
    subject,
    editableReport,
    researchResult,
    modules,
    diagnosticAnswers,
    aiCostEstimates,
    productOverview,
    designBrief,
    systemIllustrationUrl,
    researchModelUsed,
    decompositionModelUsed,
  } = useCadLab()

  const { runInBackground } = useBackgroundOp()

  const assembleData = useCallback(async (): Promise<DesignReportData> => {
    const sources = (researchResult?.sources ?? []).map((s) => ({
      title: s.title,
      url: s.uri,
    }))

    const hasBrief = designBrief.useCase || designBrief.targetProcess ||
      designBrief.targetMaterial || designBrief.toleranceTarget ||
      designBrief.quantityTarget || designBrief.complianceNotes

    let engineeringIntelligence: DesignReportData["engineeringIntelligence"]
    try {
      const { getEngineeringIntelligenceForReport } = await import("@/actions/design-standards")
      const engData = await getEngineeringIntelligenceForReport(
        researchResult?.standardCodes ?? [],
        researchResult?.industryDomain ?? null,
        subject || "",
      )
      engineeringIntelligence = {
        ...engData,
        industryDomain: researchResult?.industryDomain ?? null,
      }
    } catch (engErr) {
      console.warn("[DesignReport] Engineering data fetch failed (non-fatal):", engErr)
    }

    return {
      projectName: subject || "Untitled Project",
      generatedAt: new Date().toISOString(),
      heroImageUrl: systemIllustrationUrl ?? null,
      stage,
      productOverview: productOverview || "",
      researchReport: editableReport || "",
      sources,
      designBrief: hasBrief ? designBrief : null,
      modules,
      diagnosticAnswers: diagnosticAnswers as Record<string, Record<string, string>>,
      aiCostEstimates,
      researchModelUsed: researchModelUsed ?? null,
      decompositionModelUsed: decompositionModelUsed ?? null,
      engineeringIntelligence,
      ...stageData,
    }
  }, [
    subject, editableReport, researchResult, modules, diagnosticAnswers,
    aiCostEstimates, productOverview, designBrief, systemIllustrationUrl,
    researchModelUsed, decompositionModelUsed, stage, stageData,
  ])

  const handleExport = useCallback(async () => {
    if (!selectedFormat || exportStartedRef.current) return
    exportStartedRef.current = true

    // PDF uses browser print dialog — close dialog first, then print after repaint
    if (selectedFormat === "pdf") {
      onOpenChange(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.print()
        })
      })
      return
    }

    // Close dialog immediately — work continues in background
    onOpenChange(false)

    const formatLabel = selectedFormat === "docx" ? "Word" : "Slides"
    const moduleCount = modules.length
    const useAi = aiEnabled

    // Capture assembled data before the dialog unmounts
    // (closures over useCadLab values are stable via useCallback deps)
    runInBackground(
      `${STAGE_LABELS[stage]} Report (${formatLabel})`,
      async ({ update }) => {
        // Step 1: Assemble data
        update({ stepLabel: "Collecting design data...", progress: 5 })
        const data = await assembleData()

        // Step 2: AI narration (if enabled)
        if (useAi) {
          let aiFailed = false
          try {
            update({ stepLabel: `AI: Structuring outline (${moduleCount} modules)...`, progress: 15 })
            const { structureReportOutline, writeReportSections } = await import("@/actions/cad-lab-report")
            const { outline, tokensIn, tokensOut } = await structureReportOutline(data)

            update({ stepLabel: "AI: Writing executive summary...", progress: 40 })
            const aiContent = await writeReportSections(outline, data, { in: tokensIn, out: tokensOut })

            data.aiContent = aiContent
            update({ stepLabel: "AI narration complete", progress: 75 })
          } catch (aiErr) {
            aiFailed = true
            console.error("[DesignReport] AI narration failed, falling back:", aiErr)
            toast.info("Professional narration unavailable — exporting standard report")
          }

          if (!aiFailed && data.aiContent) {
            const { opusTokens, geminiTokens } = data.aiContent
            const totalIn = opusTokens.in + geminiTokens.in
            const totalOut = opusTokens.out + geminiTokens.out
            toast.success(`AI narration complete — ${totalIn.toLocaleString()} input, ${totalOut.toLocaleString()} output tokens`)
          }
        }

        // Step 3: Format and download
        update({ stepLabel: `Formatting ${formatLabel} document...`, progress: 85 })

        if (selectedFormat === "docx") {
          const { exportDesignReportAsDOCX } = await import("@/lib/cad-lab/export-design-report-docx")
          await exportDesignReportAsDOCX(data)
        } else {
          const { exportDesignReportAsPPTX } = await import("@/lib/cad-lab/export-design-report-pptx")
          await exportDesignReportAsPPTX(data)
        }

        update({ progress: 100 })
      },
      { successMessage: `${formatLabel} report ready — downloaded` },
    )
  }, [selectedFormat, assembleData, onOpenChange, aiEnabled, modules.length, stage, runInBackground])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-international-orange" />
            Download {STAGE_LABELS[stage]} Report
          </DialogTitle>
          <DialogDescription>
            Export your design as a shareable document. You can navigate away — the report will generate in the background.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const isSelected = selectedFormat === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => setSelectedFormat(opt.id)}
                className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                  isSelected
                    ? "border-international-orange bg-international-orange/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-md p-1.5 ${isSelected ? "bg-international-orange/10" : "bg-muted"}`}>
                    <Icon className={`h-4 w-4 ${isSelected ? "text-international-orange" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {opt.label}
                      {opt.ext && <span className="text-muted-foreground font-normal"> ({opt.ext})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Professional narration toggle */}
        {selectedFormat && selectedFormat !== "pdf" && (
          <div className="flex items-center justify-between py-2 px-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-international-orange" />
              <Label htmlFor="ai-narration" className="text-sm font-medium text-foreground cursor-pointer">
                Professional narration
              </Label>
            </div>
            <Switch
              id="ai-narration"
              checked={aiEnabled}
              onCheckedChange={setAiEnabled}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={!selectedFormat}>
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

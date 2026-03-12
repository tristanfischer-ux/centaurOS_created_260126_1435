"use client"

/**
 * @file design-report-dialog.tsx
 *
 * @description Format selection dialog for downloading a design report.
 * Offers Word (.docx), Slides (.pptx), or PDF (print dialog) export.
 * Assembles DesignReportData from the CadLab context, then dynamic-imports
 * the appropriate exporter.
 *
 * @related
 * - src/lib/cad-lab/design-report-types.ts — DesignReportData shape
 * - src/lib/cad-lab/export-design-report-docx.ts — DOCX exporter
 * - src/lib/cad-lab/export-design-report-pptx.ts — PPTX exporter
 */

import { useState, useCallback } from "react"
import { FileDown, FileText, Presentation, Printer, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

import { useCadLab } from "../cad-lab-context"
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
  const [isExporting, setIsExporting] = useState(false)

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

  const assembleData = useCallback((): DesignReportData => {
    const sources = (researchResult?.sources ?? []).map((s) => ({
      title: s.title,
      url: s.uri,
    }))

    // INTENT: designBrief fields are all optional strings, so check if any are populated
    const hasBrief = designBrief.useCase || designBrief.targetProcess ||
      designBrief.targetMaterial || designBrief.toleranceTarget ||
      designBrief.quantityTarget || designBrief.complianceNotes

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
      ...stageData,
    }
  }, [
    subject, editableReport, researchResult, modules, diagnosticAnswers,
    aiCostEstimates, productOverview, designBrief, systemIllustrationUrl,
    researchModelUsed, decompositionModelUsed, stage, stageData,
  ])

  const handleExport = useCallback(async () => {
    if (!selectedFormat) return
    setIsExporting(true)

    try {
      const data = assembleData()

      if (selectedFormat === "docx") {
        const { exportDesignReportAsDOCX } = await import("@/lib/cad-lab/export-design-report-docx")
        await exportDesignReportAsDOCX(data)
      } else if (selectedFormat === "pptx") {
        const { exportDesignReportAsPPTX } = await import("@/lib/cad-lab/export-design-report-pptx")
        await exportDesignReportAsPPTX(data)
      } else {
        // PDF — open print dialog
        window.print()
      }

      onOpenChange(false)
    } catch (err) {
      console.error("[DesignReport] Export failed:", err)
    } finally {
      setIsExporting(false)
    }
  }, [selectedFormat, assembleData, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-international-orange" />
            Download {STAGE_LABELS[stage]} Report
          </DialogTitle>
          <DialogDescription>
            Export your design as a shareable document.
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={!selectedFormat || isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Exporting...
              </>
            ) : (
              "Download"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

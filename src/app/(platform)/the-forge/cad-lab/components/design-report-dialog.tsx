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

import { useState, useCallback, useRef, useEffect } from "react"
import { FileDown, FileText, Presentation, Printer, Sparkles, Route, Briefcase, Wrench, Truck, Megaphone } from "lucide-react"
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { useCadLab } from "../cad-lab-context"
import { useBackgroundOp } from "@/hooks/useBackgroundOp"
import { createClient } from "@/lib/supabase/client"
import type { DesignReportFormat, DesignReportData, ReportStage } from "@/lib/cad-lab/design-report-types"
import type { ReportAudience } from "@/lib/cad-lab/audience"
import { AUDIENCE_META, DEFAULT_AUDIENCE, REPORT_AUDIENCES, isAudienceViableAtStage } from "@/lib/cad-lab/audience"

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
  journey: 'Design Journey',
}

const AUDIENCE_ICONS: Record<ReportAudience, typeof Briefcase> = {
  investor: Briefcase,
  engineer: Wrench,
  supplier: Truck,
  marketing: Megaphone,
}

export function DesignReportDialog({ open, onOpenChange, stage = 'concept', stageData }: DesignReportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<DesignReportFormat | null>(null)
  const [selectedAudience, setSelectedAudience] = useState<ReportAudience>(DEFAULT_AUDIENCE)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [journeyMode, setJourneyMode] = useState(false)
  const exportStartedRef = useRef(false)

  // Stage used for audience gating — journey mode unlocks all audiences even
  // if the user is on an early page, matching the "full chronological narrative"
  // semantics of journey mode elsewhere in this dialog.
  const effectiveStageForGating: ReportStage = journeyMode ? 'journey' : stage

  // Reset guard when dialog reopens
  useEffect(() => {
    if (open) exportStartedRef.current = false
  }, [open])

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
    activeProjectId,
    moduleReviews,
    reviewSkipped,
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

    // INTENT: Journey mode overrides stage to 'journey' and includes ALL available
    // stage data so the report covers the complete design evolution.
    const effectiveStage = journeyMode ? 'journey' as const : stage

    // INTENT: In journey mode, include context-level data (moduleReviews, reviewSkipped)
    // that isn't in stageData unless we're on the Specify page. This ensures the
    // journey report includes reviews regardless of which page the user exports from.
    const journeyExtras: Partial<DesignReportData> = journeyMode ? {
      moduleReviews: Object.keys(moduleReviews).length > 0 ? moduleReviews : undefined,
      reviewSkipped,
    } : {}

    return {
      projectName: subject || "Untitled Project",
      generatedAt: new Date().toISOString(),
      heroImageUrl: systemIllustrationUrl ?? null,
      stage: effectiveStage,
      audience: selectedAudience,
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
      ...journeyExtras,
      ...stageData,
    }
  }, [
    subject, editableReport, researchResult, modules, diagnosticAnswers,
    aiCostEstimates, productOverview, designBrief, systemIllustrationUrl,
    researchModelUsed, decompositionModelUsed, stage, stageData, journeyMode,
    moduleReviews, reviewSkipped, selectedAudience,
  ])

  const handleExport = useCallback(async () => {
    if (!selectedFormat || exportStartedRef.current) return
    exportStartedRef.current = true

    // PDF: Native PDF export via html2pdf.js — proper formatted PDF download
    if (selectedFormat === "pdf") {
      const projectId = activeProjectId
      onOpenChange(false)
      runInBackground(
        `${journeyMode ? "Design Journey" : STAGE_LABELS[stage]} Report (PDF)`,
        async ({ update }) => {
          update({ stepLabel: "Collecting design data...", progress: 10 })
          const data = await assembleData()
          update({ stepLabel: "Generating PDF...", progress: 50 })
          const { exportDesignReportAsPDF } = await import("@/lib/cad-lab/export-design-report-pdf")
          const blob = await exportDesignReportAsPDF(data)

          // Upload to Storage for persistent re-download
          update({ stepLabel: "Uploading to cloud...", progress: 80 })
          let storagePath: string | undefined
          let uploaded = false
          try {
            const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, "-") || "report"
            const dateStr = new Date(data.generatedAt).toISOString().split("T")[0]
            const uid = crypto.randomUUID().slice(0, 8)
            storagePath = `reports/${projectId ?? "unknown"}/${safeName}-${selectedAudience}-${journeyMode ? "journey" : stage}-${dateStr}-${uid}.pdf`

            const supabase = createClient()
            const { error: uploadError } = await supabase.storage
              .from("report-exports")
              .upload(storagePath, blob, {
                contentType: "application/pdf",
                upsert: true,
              })

            if (!uploadError) {
              uploaded = true
            } else {
              console.warn("[DesignReport] Storage upload failed (non-fatal):", uploadError.message)
              toast.info("Downloaded locally — cloud backup unavailable")
            }
          } catch (uploadErr) {
            console.warn("[DesignReport] Storage upload failed (non-fatal):", uploadErr)
            toast.info("Downloaded locally — cloud backup unavailable")
          }

          // Track in report_downloads
          try {
            const { saveReportDownload } = await import("@/actions/report-downloads")
            await saveReportDownload({
              reportName: data.projectName,
              reportSource: "cad-lab",
              fileFormat: "pdf",
              fileSizeBytes: blob.size,
              storagePath: uploaded ? storagePath ?? null : null,
            })
          } catch {
            // Non-fatal — download still works
          }

          update({ progress: 100 })
        },
        { successMessage: "PDF report downloaded" },
      )
      return
    }

    // Close dialog immediately — work continues in background
    onOpenChange(false)

    const formatLabel = selectedFormat === "docx" ? "Word" : "Slides"
    const moduleCount = modules.length
    const useAi = aiEnabled
    const projectId = activeProjectId

    // Capture assembled data before the dialog unmounts
    // (closures over useCadLab values are stable via useCallback deps)
    runInBackground(
      `${journeyMode ? "Design Journey" : STAGE_LABELS[stage]} Report (${formatLabel})`,
      async ({ update }) => {
        // Step 1: Assemble data
        update({ stepLabel: "Collecting design data...", progress: 5 })
        const data = await assembleData()

        // Step 2: AI narration (if enabled)
        if (useAi) {
          let aiFailed = false
          try {
            update({ stepLabel: `AI: Structuring outline (${moduleCount} modules)...`, progress: 15 })
            const { structureReportOutline, writeReportSections, generateSlideImages } = await import("@/actions/cad-lab-report")
            const { outline, tokensIn, tokensOut } = await structureReportOutline(data, selectedAudience)

            update({ stepLabel: `AI: Writing ${moduleCount} sections...`, progress: 35 })
            let aiContent = await writeReportSections(outline, data, { in: tokensIn, out: tokensOut }, selectedAudience)

            // Phase 2.5: Generate custom slide illustrations
            // GOTCHA: Server actions return data via React Flight — large base64 images
            // can exceed serialization limits. Wrap in try-catch so image failure doesn't
            // kill the entire report. Reports still work without slide illustrations.
            const imageCount = outline.sections.filter((s) => s.imagePrompt && s.imagePrompt.length > 20).length
            if (imageCount > 0 && selectedFormat === "pptx") {
              try {
                update({ stepLabel: `Generating ${imageCount} slide illustrations...`, progress: 60 })
                aiContent = await generateSlideImages(outline, aiContent, selectedAudience)
              } catch (imgErr) {
                console.warn("[DesignReport] Slide image generation failed (non-fatal):", imgErr)
              }
            }

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

        let blob: Blob
        if (selectedFormat === "docx") {
          const { exportDesignReportAsDOCX } = await import("@/lib/cad-lab/export-design-report-docx")
          blob = await exportDesignReportAsDOCX(data)
        } else {
          const { exportDesignReportAsPPTX } = await import("@/lib/cad-lab/export-design-report-pptx")
          blob = await exportDesignReportAsPPTX(data)
        }

        // Step 4: Upload to Supabase Storage for persistent re-download
        update({ stepLabel: "Uploading to cloud...", progress: 95 })
        let storagePath: string | undefined
        let uploaded = false
        try {
          const ext = selectedFormat === "docx" ? "docx" : "pptx"
          const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, "-") || "report"
          const dateStr = new Date(data.generatedAt).toISOString().split("T")[0]
          const uid = crypto.randomUUID().slice(0, 8)
          storagePath = `reports/${projectId ?? "unknown"}/${safeName}-${selectedAudience}-${journeyMode ? "journey" : stage}-${dateStr}-${uid}.${ext}`

          const supabase = createClient()
          const { error: uploadError } = await supabase.storage
            .from("report-exports")
            .upload(storagePath, blob, {
              contentType: ext === "docx"
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              upsert: true,
            })

          if (!uploadError) {
            uploaded = true
          } else {
            console.warn("[DesignReport] Storage upload failed (non-fatal):", uploadError.message)
            toast.info("Downloaded locally — cloud backup unavailable")
          }
        } catch (uploadErr) {
          console.warn("[DesignReport] Storage upload failed (non-fatal):", uploadErr)
          toast.info("Downloaded locally — cloud backup unavailable")
        }

        // Track in report_downloads (signed URLs generated on-demand by server action)
        try {
          const { saveReportDownload } = await import("@/actions/report-downloads")
          await saveReportDownload({
            reportName: data.projectName,
            reportSource: "cad-lab",
            fileFormat: selectedFormat === "docx" ? "docx" : "pptx",
            fileSizeBytes: blob.size,
            storagePath: uploaded ? storagePath ?? null : null,
          })
        } catch {
          // Non-fatal — download still works
        }

        update({ progress: 100 })
      },
      { successMessage: `${formatLabel} report ready — downloaded` },
    )
  }, [selectedFormat, assembleData, onOpenChange, aiEnabled, journeyMode, modules.length, stage, activeProjectId, runInBackground, selectedAudience])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-international-orange" />
            Download {journeyMode ? "Design Journey" : STAGE_LABELS[stage]} Report
          </DialogTitle>
          <DialogDescription>
            Export your design as a shareable document. You can navigate away — the report will generate in the background.
          </DialogDescription>
        </DialogHeader>

        {/* Audience picker — four cards, top of dialog */}
        <TooltipProvider delayDuration={150}>
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Audience</p>
            <div className="grid grid-cols-2 gap-2">
              {REPORT_AUDIENCES.map((audId) => {
                const meta = AUDIENCE_META[audId]
                const Icon = AUDIENCE_ICONS[audId]
                const isSelected = selectedAudience === audId
                const isViable = isAudienceViableAtStage(audId, effectiveStageForGating)

                const card = (
                  <button
                    key={audId}
                    type="button"
                    disabled={!isViable}
                    onClick={() => { if (isViable) setSelectedAudience(audId) }}
                    className={`w-full text-left p-2.5 rounded-lg border-2 transition-all ${
                      isSelected
                        ? "border-international-orange bg-international-orange/5"
                        : isViable
                          ? "border-border hover:border-muted-foreground/30"
                          : "border-border/60 opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 rounded-md p-1 ${isSelected ? "bg-international-orange/10" : "bg-muted"}`}>
                        <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-international-orange" : "text-muted-foreground"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground leading-tight">{meta.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{meta.description}</p>
                      </div>
                    </div>
                  </button>
                )

                if (!isViable && meta.minStageReason) {
                  return (
                    <Tooltip key={audId}>
                      <TooltipTrigger asChild>
                        <div className="w-full">{card}</div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {meta.minStageReason}
                      </TooltipContent>
                    </Tooltip>
                  )
                }
                return card
              })}
            </div>
          </div>
        </TooltipProvider>

        <div className="space-y-1.5 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Format</p>
          <div className="space-y-2">
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

        {/* Journey mode toggle — includes all stages in one report */}
        {selectedFormat && (
          <div className="flex items-center justify-between py-2 px-1 border-t border-border">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-international-orange" />
              <div>
                <Label htmlFor="journey-mode" className="text-sm font-medium text-foreground cursor-pointer">
                  Full Design Journey
                </Label>
                <p className="text-[11px] text-muted-foreground">Include all stages in a chronological narrative</p>
              </div>
            </div>
            <Switch
              id="journey-mode"
              checked={journeyMode}
              onCheckedChange={setJourneyMode}
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

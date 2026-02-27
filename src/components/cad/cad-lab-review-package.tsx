/**
 * @file cad-lab-review-package.tsx — Engineering review summary document.
 *
 * @description Generates a read-only engineering review document from all
 * project data: modules, analysis metrics, timeline, risks, and diagnostics.
 * Designed for sharing with stakeholders or printing as a PDF-ready summary.
 *
 * @component
 *
 * @example
 * <CadLabReviewPackage
 *   modules={modules}
 *   projectName={subject}
 *   researchReport={editableReport}
 *   diagnosticAnswers={diagnosticAnswers}
 * />
 */

"use client"

import { useMemo, useRef } from "react"
import {
  FileText,
  Printer,
  Box,
  Scale,
  Ruler,
  Clock,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  ShieldAlert,
  Copy,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"
import { computeCadLabQualityScorecard } from "@/lib/cad-lab-quality-scorecard"

// ─── Types ──────────────────────────────────────────────────────────

interface CadLabReviewPackageProps {
  /** Array of decomposed modules */
  modules: CadLabModule[]
  /** Project subject/name */
  projectName: string
  /** Research report text (from Step 1) */
  researchReport?: string
  /** Diagnostic answers per module */
  diagnosticAnswers?: DiagnosticAnswers
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Generates a plain-text review summary for clipboard/print.
 *
 * @param modules - Project modules
 * @param projectName - Project name
 * @param diagnosticAnswers - Diagnostic answers
 * @returns Formatted plain text
 */
function generatePlainText(
  modules: CadLabModule[],
  projectName: string,
  diagnosticAnswers?: DiagnosticAnswers
): string {
  const lines: string[] = []
  const now = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  lines.push(`ENGINEERING REVIEW PACKAGE`)
  lines.push(`${"=".repeat(50)}`)
  lines.push(`Project: ${projectName}`)
  lines.push(`Date: ${now}`)
  lines.push(`Modules: ${modules.length}`)
  lines.push("")

  // System metrics
  let totalMassG = 0
  let generated = 0
  let totalRisks = 0
  let totalUnknowns = 0

  for (const mod of modules) {
    totalRisks += mod.failureModes.length
    totalUnknowns += mod.unknowns.length
    if (mod.result?.massGrams) totalMassG += mod.result.massGrams
    if (mod.status === "generated") generated++
  }

  lines.push(`SUMMARY`)
  lines.push(`${"-".repeat(30)}`)
  lines.push(`Generated: ${generated}/${modules.length} modules`)
  lines.push(`Total mass: ${totalMassG > 0 ? `${(totalMassG / 1000).toFixed(2)} kg` : "TBD"}`)
  lines.push(`Failure modes: ${totalRisks}`)
  lines.push(`Unknowns: ${totalUnknowns}`)
  lines.push("")

  // Per module
  const allUnknowns: { module: string; items: string[] }[] = []
  const allAssumptions: { module: string; items: string[] }[] = []

  for (const mod of modules) {
    lines.push(`MODULE: ${mod.name.toUpperCase()}`)
    lines.push(`${"-".repeat(30)}`)
    lines.push(`Purpose: ${mod.purpose}`)
    lines.push(`Status: ${mod.status}`)
    lines.push(`Lead time: ${mod.leadWeeks} weeks`)
    lines.push(`Key parts: ${mod.keyParts.join(", ")}`)

    // Why this module matters
    if (mod.whyItMatters) {
      lines.push(`Critical because: ${mod.whyItMatters}`)
    }

    if (mod.result?.bbox) {
      lines.push(
        `Dimensions: ${mod.result.bbox.xLen.toFixed(0)}×${mod.result.bbox.yLen.toFixed(0)}×${mod.result.bbox.zLen.toFixed(0)} mm`
      )
    }
    if (mod.result?.massGrams) {
      lines.push(`Mass: ${mod.result.massGrams.toFixed(1)} g`)
    }
    if (mod.result?.volumeMm3) {
      const vol = mod.result.volumeMm3
      lines.push(`Volume: ${vol > 1000 ? `${(vol / 1000).toFixed(1)} cm³` : `${vol.toFixed(0)} mm³`}`)
    }
    if (mod.result?.massProperties?.surfaceAreaMm2) {
      const sa = mod.result.massProperties.surfaceAreaMm2
      lines.push(`Surface area: ${sa > 100 ? `${(sa / 100).toFixed(1)} cm²` : `${sa.toFixed(0)} mm²`}`)
    }
    if (mod.result?.dfm) {
      lines.push(`Printable: ${mod.result.dfm.printable ? "Yes" : "No"}`)
      if (mod.result.dfm.issues.length > 0) {
        lines.push(`DFM Issues:`)
        for (const issue of mod.result.dfm.issues) {
          lines.push(`  - [${issue.severity}] ${issue.message}`)
        }
      }
    }

    // AI assumptions — critical for factory validation
    const assumptions = mod.result?.assumptions
    if (assumptions && assumptions.length > 0) {
      lines.push(`AI Assumptions (VERIFY THESE):`)
      for (const a of assumptions) lines.push(`  ⚠ ${a}`)
      allAssumptions.push({ module: mod.name, items: assumptions })
    }

    // Validation warnings
    const warnings = mod.result?.validationWarnings
    if (warnings && warnings.length > 0) {
      lines.push(`Validation Warnings:`)
      for (const w of warnings) lines.push(`  ⚠ ${w}`)
    }

    if (mod.failureModes.length > 0) {
      lines.push(`Failure Modes:`)
      for (const fm of mod.failureModes) lines.push(`  - ${fm}`)
    }
    if (mod.unknowns.length > 0) {
      lines.push(`Unknowns:`)
      for (const u of mod.unknowns) lines.push(`  ? ${u}`)
      allUnknowns.push({ module: mod.name, items: mod.unknowns })
    }

    // Dimensional specification (interface definition)
    if (mod.interfaceDefinition) {
      const iface = mod.interfaceDefinition.trim()
      const truncated = iface.length > 500 ? `${iface.slice(0, 497)}...` : iface
      lines.push(`Dimensional Specification:`)
      lines.push(`  ${truncated}`)
    }

    // Diagnostics
    const modDiag = diagnosticAnswers?.[mod.id]
    if (modDiag && Object.keys(modDiag).length > 0) {
      lines.push(`Diagnostics:`)
      for (const [key, val] of Object.entries(modDiag)) {
        lines.push(`  ${key}: ${val}`)
      }
    }

    lines.push("")
  }

  // Aggregated open questions for factory
  if (allUnknowns.length > 0 || allAssumptions.length > 0) {
    lines.push(`OPEN QUESTIONS FOR FACTORY`)
    lines.push(`${"=".repeat(50)}`)
    lines.push(`These items MUST be resolved before committing to production.`)
    lines.push("")

    let qNum = 1
    if (allAssumptions.length > 0) {
      lines.push(`AI Assumptions to Validate:`)
      for (const { module, items } of allAssumptions) {
        for (const item of items) {
          lines.push(`  ${qNum}. [${module}] ${item}`)
          qNum++
        }
      }
      lines.push("")
    }
    if (allUnknowns.length > 0) {
      lines.push(`Unresolved Engineering Questions:`)
      for (const { module, items } of allUnknowns) {
        for (const item of items) {
          lines.push(`  ${qNum}. [${module}] ${item}`)
          qNum++
        }
      }
      lines.push("")
    }
  }

  lines.push(`${"=".repeat(50)}`)
  lines.push(`Generated by The Forge — ForgeOS`)

  return lines.join("\n")
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * CadLabReviewPackage — engineering review summary document.
 *
 * @description Renders a printable review package with system-level
 * metrics, per-module summaries, risk overview, and diagnostic status.
 * Includes copy-to-clipboard and print actions.
 */
export function CadLabReviewPackage({
  modules,
  projectName,
  researchReport,
  diagnosticAnswers,
}: CadLabReviewPackageProps): React.ReactNode {
  const reviewRef = useRef<HTMLDivElement>(null)

  // Aggregate metrics
  const metrics = useMemo(() => {
    let totalMassG = 0
    let totalVolumeMm3 = 0
    let generated = 0
    let printable = 0
    let totalRisks = 0
    let totalUnknowns = 0
    let maxLeadWeeks = 0

    for (const mod of modules) {
      maxLeadWeeks = Math.max(maxLeadWeeks, mod.leadWeeks)
      totalRisks += mod.failureModes.length
      totalUnknowns += mod.unknowns.length

      if (mod.status === "generated" && mod.result) {
        generated++
        if (mod.result.massGrams) totalMassG += mod.result.massGrams
        if (mod.result.volumeMm3) totalVolumeMm3 += mod.result.volumeMm3
        if (mod.result.dfm?.printable) printable++
      }
    }

    return {
      totalMassG,
      totalVolumeMm3,
      generated,
      printable,
      totalRisks,
      totalUnknowns,
      maxLeadWeeks,
    }
  }, [modules])

  const qualityScorecard = useMemo(
    () => computeCadLabQualityScorecard(modules, diagnosticAnswers || {}),
    [modules, diagnosticAnswers],
  )
  const researchSummary = useMemo(() => {
    const trimmed = researchReport?.trim()
    if (!trimmed) return null
    return trimmed.length > 360 ? `${trimmed.slice(0, 357)}...` : trimmed
  }, [researchReport])

  const handleCopy = async (): Promise<void> => {
    const text = generatePlainText(modules, projectName, diagnosticAnswers)
    await navigator.clipboard.writeText(text)
    toast.success("Review package copied to clipboard")
  }

  const handlePrint = (): void => {
    window.print()
  }

  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Review Package
            <span className="text-xs font-normal text-muted-foreground">
              {dateStr}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              Print
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6" ref={reviewRef}>
        {/* Project header */}
        <div className="border-b pb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {projectName}
          </h2>
          <p className="text-sm text-muted-foreground">
            Engineering Review — {modules.length} modules,{" "}
            {metrics.generated} with CAD generated
          </p>
          {researchSummary && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {researchSummary}
            </p>
          )}
        </div>

        {/* System metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ReviewMetric
            icon={<Scale className="h-3.5 w-3.5" />}
            label="System Mass"
            value={
              metrics.totalMassG > 0
                ? `${(metrics.totalMassG / 1000).toFixed(2)} kg`
                : "TBD"
            }
          />
          <ReviewMetric
            icon={<Box className="h-3.5 w-3.5" />}
            label="Modules"
            value={`${metrics.generated}/${modules.length} generated`}
          />
          <ReviewMetric
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Critical Path"
            value={`${metrics.maxLeadWeeks} weeks`}
          />
          <ReviewMetric
            icon={<ShieldAlert className="h-3.5 w-3.5" />}
            label="Open Risks"
            value={`${metrics.totalRisks + metrics.totalUnknowns}`}
            highlight={metrics.totalRisks > 0}
          />
        </div>

        <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Quality Scorecard
            </h3>
            <span
              className={cn(
                "text-xs font-semibold",
                qualityScorecard.overallScore >= 80
                  ? "text-status-success"
                  : qualityScorecard.overallScore >= 60
                    ? "text-status-warning"
                    : "text-status-error",
              )}
            >
              {qualityScorecard.overallScore}% overall
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ReviewMetric
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label="CAD Validity"
              value={`${qualityScorecard.cadValidityScore}%`}
              highlight={qualityScorecard.cadValidityScore < 70}
            />
            <ReviewMetric
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Drawing Completeness"
              value={`${qualityScorecard.drawingCompletenessScore}%`}
              highlight={qualityScorecard.drawingCompletenessScore < 70}
            />
            <ReviewMetric
              icon={<ShieldAlert className="h-3.5 w-3.5" />}
              label="RFQ Readiness"
              value={`${qualityScorecard.rfqReadinessScore}%`}
              highlight={qualityScorecard.rfqReadinessScore < 70}
            />
            <ReviewMetric
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="Open Blockers"
              value={`${qualityScorecard.blockers.length}`}
              highlight={qualityScorecard.blockers.length > 0}
            />
          </div>
          {qualityScorecard.blockers.length > 0 && (
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-muted-foreground">
              {qualityScorecard.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Per-module summaries */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Module Summaries
          </h3>
          {modules.map((mod) => {
            const modDiag = diagnosticAnswers?.[mod.id]
            const diagComplete =
              modDiag && Object.keys(modDiag).length >= 6

            return (
              <div
                key={mod.id}
                className="border rounded-lg p-4 space-y-3"
              >
                {/* Module header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        mod.status === "generated"
                          ? "bg-status-success"
                          : mod.status === "interface_ready"
                            ? "bg-status-info"
                            : "bg-muted-foreground"
                      )}
                    />
                    <h4 className="text-sm font-semibold text-foreground">
                      {mod.name}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{mod.leadWeeks}w lead</span>
                    <span>{mod.keyParts.length} parts</span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded-full",
                        mod.status === "generated"
                          ? "bg-status-success-light text-status-success"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {mod.status}
                    </span>
                  </div>
                </div>

                {/* SVG views for generated modules — prefer persisted svgUrls, fall back to result data URIs */}
                {mod.status === "generated" && (mod.svgUrls?.iso || mod.result?.svgIso) && (
                  <div className={`grid gap-2 ${
                    (mod.svgUrls?.top || mod.result?.svgTop || mod.svgUrls?.front || mod.result?.svgFront) ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1"
                  }`}>
                    <div className="w-full h-48 sm:h-56 rounded-md bg-muted/30 border border-muted overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mod.svgUrls?.iso ?? mod.result?.svgIso}
                        alt={`${mod.name} isometric view`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    {(mod.svgUrls?.top || mod.result?.svgTop) && (
                      <div className="w-full h-48 sm:h-56 rounded-md bg-muted/30 border border-muted overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mod.svgUrls?.top ?? mod.result?.svgTop}
                          alt={`${mod.name} top view`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    {(mod.svgUrls?.front || mod.result?.svgFront) && (
                      <div className="w-full h-48 sm:h-56 rounded-md bg-muted/30 border border-muted overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mod.svgUrls?.front ?? mod.result?.svgFront}
                          alt={`${mod.name} front view`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Purpose and description */}
                <p className="text-xs text-muted-foreground">
                  {mod.purpose}
                </p>

                {/* Metrics row (if generated) */}
                {mod.result && (
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    {mod.result.bbox && (
                      <span className="flex items-center gap-1 text-foreground">
                        <Ruler className="h-3 w-3 text-muted-foreground" />
                        {mod.result.bbox.xLen.toFixed(0)}×
                        {mod.result.bbox.yLen.toFixed(0)}×
                        {mod.result.bbox.zLen.toFixed(0)} mm
                      </span>
                    )}
                    {mod.result.massGrams && (
                      <span className="flex items-center gap-1 text-foreground">
                        <Scale className="h-3 w-3 text-muted-foreground" />
                        {mod.result.massGrams.toFixed(1)} g
                      </span>
                    )}
                    {mod.result.dfm && (() => {
                      const process = modDiag?.mfg_process
                      const isPrint = !process || process.startsWith("FDM") || process.startsWith("SLA") || process.startsWith("SLS")
                      if (!isPrint) return null
                      return (
                        <span
                          className={cn(
                            "flex items-center gap-1",
                            mod.result.dfm.printable
                              ? "text-status-success"
                              : "text-status-warning"
                          )}
                        >
                          {mod.result.dfm.printable ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {mod.result.dfm.printable
                            ? "Printable"
                            : `${mod.result.dfm.issues.length} DFM issues`}
                        </span>
                      )
                    })()}
                  </div>
                )}

                {/* Risks and unknowns summary */}
                {(mod.failureModes.length > 0 ||
                  mod.unknowns.length > 0) && (
                  <div className="flex items-center gap-3 text-[10px]">
                    {mod.failureModes.length > 0 && (
                      <span className="flex items-center gap-1 text-status-warning">
                        <AlertTriangle className="h-3 w-3" />
                        {mod.failureModes.length} failure mode
                        {mod.failureModes.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {mod.unknowns.length > 0 && (
                      <span className="flex items-center gap-1 text-status-info">
                        <HelpCircle className="h-3 w-3" />
                        {mod.unknowns.length} unknown
                        {mod.unknowns.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {diagComplete && (
                      <span className="flex items-center gap-1 text-status-success">
                        <CheckCircle2 className="h-3 w-3" />
                        Diagnosed
                      </span>
                    )}
                  </div>
                )}

                {/* Diagnostic answers (if any) */}
                {modDiag && Object.keys(modDiag).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(modDiag).map(([key, val]) => (
                      <span
                        key={key}
                        className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono"
                      >
                        {val}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t pt-4 text-[10px] text-muted-foreground text-center">
          Generated by The Forge — ForgeOS — {dateStr}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

/**
 * ReviewMetric — compact metric card for the review summary.
 */
function ReviewMetric({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
}): React.ReactNode {
  return (
    <div className="p-3 rounded-lg bg-muted/50 space-y-1">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-semibold font-mono",
          highlight ? "text-status-warning" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  )
}

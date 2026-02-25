"use client"

/**
 * @file cad-lab-drawing-package.tsx — Supplier-facing drawing pack summary.
 *
 * @description Aggregates module-level drawing manifests and CAD artifacts into
 * a single procurement package overview. Provides quick readiness status and
 * a downloadable consolidated JSON manifest for RFQ handoff.
 */

import { useMemo, useCallback } from "react"
import { FileArchive, Download, ExternalLink, CheckCircle2, AlertTriangle, FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CadLabModule, CadLabResult } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"
import { getModuleArtifactReadiness } from "@/lib/cad-lab-readiness"
import { trackFeatureUse } from "@/hooks/useActivityTracker"
import {
  MATERIAL_COST_PER_KG,
  PROCESS_HOURLY_RATE,
  HOURS_PER_KG,
  TOOLING_COST,
  parseBatchSize,
  getModuleMassKg,
  getSupplierCategories,
} from "@/lib/cad-lab-cost-constants"

interface CadLabDrawingPackageProps {
  projectName: string
  modules: CadLabModule[]
  diagnosticAnswers?: DiagnosticAnswers
}

export interface PackageFileEntry {
  moduleId: string
  moduleName: string
  name: string
  url: string
  mimeType: string
  sizeKb?: number
}

export interface DrawingPackageSummary {
  generatedModules: CadLabModule[]
  files: PackageFileEntry[]
  moduleManifests: Array<{ moduleId: string; moduleName: string; url: string }>
  moduleCoverage: ModuleArtifactCoverage[]
  completeModules: number
  readinessPct: number
}

export interface DrawingPackageManifestPayload {
  source: "the-forge-cad-lab"
  projectName: string
  generatedAt: string
  generatedModuleCount: number
  quoteReadyModuleCount: number
  packageReadinessPct: number
  modules: Array<{
    id: string
    name: string
    purpose: string
    envelopeMm: CadLabResult["bbox"] | null
    massGrams: number | null
    drawingPackage: CadLabResult["drawingPackage"] | null
  }>
  files: PackageFileEntry[]
  moduleCoverage: ModuleArtifactCoverage[]
}

export interface ModuleArtifactCoverage {
  moduleId: string
  moduleName: string
  hasStep: boolean
  hasStl: boolean
  hasManifest: boolean
  scorePct: number
  missingArtifacts: string[]
}

function formatEnvelope(mod: CadLabModule): string {
  const box = mod.result?.bbox
  if (!box) return "TBD"
  return `${box.xLen.toFixed(0)} × ${box.yLen.toFixed(0)} × ${box.zLen.toFixed(0)} mm`
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function getModuleArtifactCoverage(mod: CadLabModule): ModuleArtifactCoverage {
  const artifactReadiness = getModuleArtifactReadiness(mod)
  const { hasStep, hasStl, hasManifest, scorePct, missingArtifacts } = artifactReadiness

  return {
    moduleId: mod.id,
    moduleName: mod.name,
    hasStep,
    hasStl,
    hasManifest,
    scorePct,
    missingArtifacts,
  }
}

export function buildDrawingPackageSummary(modules: CadLabModule[]): DrawingPackageSummary {
  const generatedModules = modules.filter((module) => module.status === "generated")
  const files: PackageFileEntry[] = []
  const moduleManifests: Array<{ moduleId: string; moduleName: string; url: string }> = []
  const moduleCoverage: ModuleArtifactCoverage[] = []

  for (const mod of generatedModules) {
    const drawingPackage = mod.result?.drawingPackage
    moduleCoverage.push(getModuleArtifactCoverage(mod))
    if (!drawingPackage) continue

    for (const file of drawingPackage.files) {
      files.push({
        moduleId: mod.id,
        moduleName: mod.name,
        name: file.name,
        url: file.url,
        mimeType: file.mimeType,
        sizeKb: file.sizeKb,
      })
    }

    if (drawingPackage.manifestUrl) {
      moduleManifests.push({
        moduleId: mod.id,
        moduleName: mod.name,
        url: drawingPackage.manifestUrl,
      })
    }
  }

  const completeModules = moduleCoverage.filter(
    (mod) => mod.hasStep && mod.hasStl && mod.hasManifest,
  ).length

  const readinessPct = generatedModules.length > 0
    ? Math.round((completeModules / generatedModules.length) * 100)
    : 0

  return {
    generatedModules,
    files,
    moduleManifests,
    moduleCoverage,
    completeModules,
    readinessPct,
  }
}

export function buildSupplierPacketMarkdown(
  projectName: string,
  modules: CadLabModule[],
  packageSummary: DrawingPackageSummary,
  generatedAt: string = new Date().toISOString(),
  diagnosticAnswers?: DiagnosticAnswers,
): string {
  const lines: string[] = [
    "# Supplier RFQ Drawing Package",
    "",
    `Project: ${projectName}`,
    `Generated: ${generatedAt}`,
    `Readiness: ${packageSummary.readinessPct}%`,
    `Generated modules: ${packageSummary.generatedModules.length}/${modules.length}`,
    "",
    "## Module Summary",
    "",
    "| Module | Purpose | Envelope | Mass | Lead | Artifacts |",
    "| --- | --- | --- | --- | --- | --- |",
    ...packageSummary.generatedModules.map((mod) => {
      const mass = mod.result?.massGrams
      const massLabel = typeof mass === "number"
        ? (mass >= 1000 ? `${(mass / 1000).toFixed(2)} kg` : `${mass.toFixed(1)} g`)
        : "TBD"
      const fileCount = mod.result?.drawingPackage?.files.length ?? 0
      return `| ${mod.name} | ${mod.purpose} | ${formatEnvelope(mod)} | ${massLabel} | ${mod.leadWeeks} weeks | ${fileCount} file(s) |`
    }),
    "",
    "## Artifacts",
    "",
    ...packageSummary.files.map(
      (file) =>
        `- ${file.moduleName}: [${file.name}](${file.url}) (${file.mimeType}${file.sizeKb ? `, ${file.sizeKb} KB` : ""})`,
    ),
    "",
    "## Module Manifests",
    "",
    ...packageSummary.moduleManifests.map(
      (manifest) => `- ${manifest.moduleName}: ${manifest.url}`,
    ),
    "",
    "## Artifact Coverage",
    "",
    ...packageSummary.moduleCoverage.map(
      (module) =>
        `- ${module.moduleName} — ${module.scorePct}% (${module.missingArtifacts.length > 0 ? `missing ${module.missingArtifacts.join(", ")}` : "complete"})`,
    ),
    "",
  ]

  // Open Engineering Questions — aggregate unknowns across all modules
  const allUnknowns = modules.flatMap((mod) =>
    mod.unknowns.map((u) => ({ module: mod.name, item: u }))
  )
  if (allUnknowns.length > 0) {
    lines.push("## Open Engineering Questions")
    lines.push("")
    lines.push("These must be resolved before production commitment.")
    lines.push("")
    for (const { module, item } of allUnknowns) {
      lines.push(`- **${module}**: ${item}`)
    }
    lines.push("")
  }

  // AI Assumptions to Validate
  const allAssumptions = modules.flatMap((mod) =>
    (mod.result?.assumptions ?? []).map((a) => ({ module: mod.name, item: a }))
  )
  if (allAssumptions.length > 0) {
    lines.push("## AI Assumptions to Validate")
    lines.push("")
    lines.push("These assumptions were made during automated design. Verify each with your engineering team.")
    lines.push("")
    for (const { module, item } of allAssumptions) {
      lines.push(`- **${module}**: ${item}`)
    }
    lines.push("")
  }

  // Dimensional Specifications — interface definitions
  const ifaceSpecs = modules.filter((mod) => mod.interfaceDefinition?.trim())
  if (ifaceSpecs.length > 0) {
    lines.push("## Dimensional Specifications")
    lines.push("")
    for (const mod of ifaceSpecs) {
      const iface = mod.interfaceDefinition!.trim()
      const truncated = iface.length > 300 ? `${iface.slice(0, 297)}...` : iface
      lines.push(`### ${mod.name}`)
      lines.push("")
      lines.push(truncated)
      lines.push("")
    }
  }

  // Known Risks — failure modes
  const allRisks = modules.flatMap((mod) =>
    mod.failureModes.map((fm) => ({ module: mod.name, item: fm }))
  )
  if (allRisks.length > 0) {
    lines.push("## Known Risks")
    lines.push("")
    for (const { module, item } of allRisks) {
      lines.push(`- **${module}**: ${item}`)
    }
    lines.push("")
  }

  // Diagnostic specifications per module (process, material, tolerance, etc.)
  if (diagnosticAnswers) {
    const diagEntries = modules
      .map((mod) => ({ mod, diag: diagnosticAnswers[mod.id] }))
      .filter(({ diag }) => diag && Object.keys(diag).length > 0)
    if (diagEntries.length > 0) {
      lines.push("## Manufacturing Specifications")
      lines.push("")
      lines.push("| Module | Process | Material | Tolerance | Finish | Batch | Environment |")
      lines.push("| --- | --- | --- | --- | --- | --- | --- |")
      for (const { mod, diag } of diagEntries) {
        lines.push(`| ${mod.name} | ${diag!.mfg_process || "—"} | ${diag!.material || "—"} | ${diag!.tolerance || "—"} | ${diag!.finish || "—"} | ${diag!.batch_size || "—"} | ${diag!.environment || "—"} |`)
      }
      lines.push("")
    }
  }

  lines.push("_Generated by The Forge_")

  return lines.join("\n")
}

export function buildModuleBomCsv(
  packageSummary: DrawingPackageSummary,
  diagnosticAnswers?: DiagnosticAnswers,
): string {
  const header = [
    "module_id",
    "module_name",
    "part_name",
    "module_purpose",
    "lead_weeks",
    "envelope",
    "material_hint",
    "artifact_count",
    "artifact_readiness_pct",
    "missing_artifacts",
  ]
  const coverageByModule = new Map(
    packageSummary.moduleCoverage.map((module) => [module.moduleId, module]),
  )
  const rows = packageSummary.generatedModules.flatMap((mod) => {
    const partNames = mod.keyParts.length > 0 ? mod.keyParts : ["module-assembly"]
    // Prefer diagnostic material answer over drawingPackage title
    const materialHint = diagnosticAnswers?.[mod.id]?.material || mod.result?.drawingPackage?.title || "TBD"
    const artifactCount = String(mod.result?.drawingPackage?.files.length ?? 0)
    const coverage = coverageByModule.get(mod.id)
    return partNames.map((part) => [
      csvCell(mod.id),
      csvCell(mod.name),
      csvCell(part),
      csvCell(mod.purpose),
      csvCell(String(mod.leadWeeks)),
      csvCell(formatEnvelope(mod)),
      csvCell(materialHint),
      csvCell(artifactCount),
      csvCell(String(coverage?.scorePct ?? 0)),
      csvCell(coverage?.missingArtifacts.join("|") || ""),
    ].join(","))
  })

  return [header.join(","), ...rows].join("\n")
}

export function buildProjectManifestPayload(
  projectName: string,
  packageSummary: DrawingPackageSummary,
  generatedAt: string = new Date().toISOString(),
): DrawingPackageManifestPayload {
  return {
    source: "the-forge-cad-lab",
    projectName,
    generatedAt,
    generatedModuleCount: packageSummary.generatedModules.length,
    quoteReadyModuleCount: packageSummary.completeModules,
    packageReadinessPct: packageSummary.readinessPct,
    modules: packageSummary.generatedModules.map((mod) => ({
      id: mod.id,
      name: mod.name,
      purpose: mod.purpose,
      envelopeMm: mod.result?.bbox ?? null,
      massGrams: mod.result?.massGrams ?? null,
      drawingPackage: mod.result?.drawingPackage ?? null,
    })),
    files: packageSummary.files,
    moduleCoverage: packageSummary.moduleCoverage,
  }
}

/**
 * Builds a comprehensive Markdown review report combining all sections.
 */
export function buildFullReviewReport(
  projectName: string,
  modules: CadLabModule[],
  packageSummary: DrawingPackageSummary,
  diagnosticAnswers?: DiagnosticAnswers,
): string {
  const now = new Date().toISOString()
  const lines: string[] = [
    `# ${projectName} — Full Review Report`,
    "",
    `Generated: ${now}`,
    `Modules: ${modules.length} total, ${packageSummary.generatedModules.length} generated`,
    `Package readiness: ${packageSummary.readinessPct}%`,
    "",
  ]

  // ── Requirements & Supplier Mapping ──
  lines.push("## Requirements & Supplier Mapping", "")
  lines.push("| Module | Requirement | Process | Material | Recommended Suppliers | Readiness |")
  lines.push("| --- | --- | --- | --- | --- | --- |")
  for (const mod of modules) {
    const diag = diagnosticAnswers?.[mod.id]
    const process = diag?.mfg_process || "—"
    const material = diag?.material || "—"
    const suppliers = getSupplierCategories(diag?.mfg_process || null, diag?.material || null).join(", ")
    const hasDiag = diag && Object.keys(diag).length > 0
    const readiness = hasDiag && diag.mfg_process && diag.material && diag.tolerance
      ? "Ready" : hasDiag ? "Partial" : "Incomplete"
    lines.push(`| ${mod.name} | ${mod.purpose} | ${process} | ${material} | ${suppliers} | ${readiness} |`)
  }
  lines.push("")

  // ── Bill of Materials ──
  lines.push("## Bill of Materials", "")
  lines.push("| Module | Part | Material | Mass (kg) | Cost/Unit | Supplier Type | Lead |")
  lines.push("| --- | --- | --- | --- | --- | --- | --- |")
  for (const mod of modules) {
    const diag = diagnosticAnswers?.[mod.id]
    const process = diag?.mfg_process || "Other"
    const material = diag?.material || "Other"
    const batchSize = parseBatchSize(diag?.batch_size || "1-10")
    const { massKg } = getModuleMassKg(mod.result?.massProperties?.massKg, mod.result?.massGrams)
    const matCost = massKg * (MATERIAL_COST_PER_KG[material] ?? 20)
    const procCost = massKg * (HOURS_PER_KG[process] ?? 3) * (PROCESS_HOURLY_RATE[process] ?? 50)
    const toolCost = batchSize > 0 ? (TOOLING_COST[process] ?? 0) / batchSize : 0
    const totalCost = matCost + procCost + toolCost
    const supplierType = getSupplierCategories(diag?.mfg_process || null, diag?.material || null)[0]
    lines.push(`| ${mod.name} | (assembly) | ${material} | ${massKg.toFixed(2)} | £${totalCost.toFixed(2)} | ${supplierType} | ${mod.leadWeeks} wk |`)
    for (const part of mod.keyParts) {
      const partCost = mod.keyParts.length > 0 ? totalCost / mod.keyParts.length : 0
      const partMass = mod.keyParts.length > 0 ? massKg / mod.keyParts.length : 0
      lines.push(`| | ${part} | ${material} | ~${partMass.toFixed(2)} | ~£${partCost.toFixed(2)} | ${supplierType} | — |`)
    }
  }
  lines.push("")

  // ── Raw Materials Breakdown ──
  const materialMap = new Map<string, { totalKg: number; modules: string[] }>()
  let totalProcessing = 0
  let totalTooling = 0
  for (const mod of modules) {
    const diag = diagnosticAnswers?.[mod.id]
    const material = diag?.material || "Other"
    const process = diag?.mfg_process || "Other"
    const batchSize = parseBatchSize(diag?.batch_size || "1-10")
    const { massKg } = getModuleMassKg(mod.result?.massProperties?.massKg, mod.result?.massGrams)
    const existing = materialMap.get(material) || { totalKg: 0, modules: [] }
    existing.totalKg += massKg
    existing.modules.push(mod.name)
    materialMap.set(material, existing)
    totalProcessing += massKg * (HOURS_PER_KG[process] ?? 3) * (PROCESS_HOURLY_RATE[process] ?? 50)
    totalTooling += batchSize > 0 ? (TOOLING_COST[process] ?? 0) / batchSize : 0
  }

  let totalRawCost = 0
  const materialRows: Array<{ name: string; kg: number; costPerKg: number; total: number; modules: string[] }> = []
  for (const [name, data] of materialMap.entries()) {
    const costPerKg = MATERIAL_COST_PER_KG[name] ?? 20
    const total = data.totalKg * costPerKg
    totalRawCost += total
    materialRows.push({ name, kg: data.totalKg, costPerKg, total, modules: data.modules })
  }
  materialRows.sort((a, b) => b.total - a.total)
  const totalMfg = totalRawCost + totalProcessing + totalTooling
  const valueAdd = totalMfg > 0 ? ((totalMfg - totalRawCost) / totalMfg * 100) : 0

  lines.push("## Raw Materials Breakdown", "")
  lines.push(`- **Raw Material Cost:** £${totalRawCost.toFixed(2)}`)
  lines.push(`- **Processing Cost:** £${totalProcessing.toFixed(2)}`)
  lines.push(`- **Tooling Cost:** £${totalTooling.toFixed(2)}`)
  lines.push(`- **Total Manufacturing Cost:** £${totalMfg.toFixed(2)}`)
  lines.push(`- **Value-Add Margin:** ${valueAdd.toFixed(1)}%`)
  lines.push("")
  lines.push("| Material | Total kg | Cost/kg | Total Cost | % of Raw |")
  lines.push("| --- | --- | --- | --- | --- |")
  for (const row of materialRows) {
    const pct = totalRawCost > 0 ? (row.total / totalRawCost * 100).toFixed(1) : "0"
    lines.push(`| ${row.name} | ${row.kg.toFixed(2)} | £${row.costPerKg.toFixed(2)} | £${row.total.toFixed(2)} | ${pct}% |`)
  }
  lines.push("")

  // ── Existing supplier packet content ──
  const supplierMarkdown = buildSupplierPacketMarkdown(projectName, modules, packageSummary, now, diagnosticAnswers)
  // Skip the header since we already have one
  const supplierLines = supplierMarkdown.split("\n")
  const startIdx = supplierLines.findIndex((l) => l.startsWith("## Module Summary"))
  if (startIdx >= 0) {
    lines.push(...supplierLines.slice(startIdx))
  }

  return lines.join("\n")
}

export function CadLabDrawingPackage({
  projectName,
  modules,
  diagnosticAnswers,
}: CadLabDrawingPackageProps): React.ReactNode {
  const packageSummary = useMemo(
    () => buildDrawingPackageSummary(modules),
    [modules],
  )

  const handleDownloadProjectManifest = (): void => {
    const payload = buildProjectManifestPayload(projectName, packageSummary)

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-drawing-package.json`
    link.click()
    URL.revokeObjectURL(url)
    trackFeatureUse("cad_lab_package_manifest_downloaded", {
      moduleCount: modules.length,
      generatedModules: packageSummary.generatedModules.length,
      quoteReadyModules: packageSummary.completeModules,
      readinessPct: packageSummary.readinessPct,
    })
  }

  const handleDownloadSupplierPacket = (): void => {
    const markdown = buildSupplierPacketMarkdown(projectName, modules, packageSummary, new Date().toISOString(), diagnosticAnswers)
    const blob = new Blob([markdown], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-supplier-packet.md`
    link.click()
    URL.revokeObjectURL(url)
    trackFeatureUse("cad_lab_supplier_packet_downloaded", {
      moduleCount: modules.length,
      generatedModules: packageSummary.generatedModules.length,
      quoteReadyModules: packageSummary.completeModules,
      readinessPct: packageSummary.readinessPct,
    })
  }

  const handleDownloadModuleBomCsv = (): void => {
    const csv = buildModuleBomCsv(packageSummary, diagnosticAnswers)
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-module-bom.csv`
    link.click()
    URL.revokeObjectURL(url)
    trackFeatureUse("cad_lab_module_bom_downloaded", {
      moduleCount: modules.length,
      generatedModules: packageSummary.generatedModules.length,
      quoteReadyModules: packageSummary.completeModules,
      readinessPct: packageSummary.readinessPct,
    })
  }

  const handleDownloadFullReport = useCallback((): void => {
    const report = buildFullReviewReport(projectName, modules, packageSummary, diagnosticAnswers)
    const blob = new Blob([report], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-full-review-report.md`
    link.click()
    URL.revokeObjectURL(url)
    trackFeatureUse("cad_lab_full_report_downloaded", {
      moduleCount: modules.length,
      generatedModules: packageSummary.generatedModules.length,
      readinessPct: packageSummary.readinessPct,
    })
  }, [projectName, modules, packageSummary, diagnosticAnswers])

  const handleOpenManifest = (manifest: { moduleId: string; moduleName: string; url: string }): void => {
    trackFeatureUse("cad_lab_manifest_opened", {
      moduleId: manifest.moduleId,
      moduleName: manifest.moduleName,
      readinessPct: packageSummary.readinessPct,
    })
    window.open(manifest.url, "_blank", "noopener,noreferrer")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileArchive className="h-4 w-4" />
          Supplier Drawing Package
          <span className="text-xs font-normal text-muted-foreground">
            {packageSummary.readinessPct}% complete
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", packageSummary.readinessPct === 100 ? "bg-status-success" : "bg-international-orange")}
            style={{ width: `${packageSummary.readinessPct}%` }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <Metric label="Generated modules" value={`${packageSummary.generatedModules.length}/${modules.length}`} />
          <Metric label="Quote-ready modules" value={`${packageSummary.completeModules}/${packageSummary.generatedModules.length || 0}`} />
          <Metric label="Artifact files" value={`${packageSummary.files.length}`} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={handleDownloadProjectManifest}
            disabled={packageSummary.files.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download package manifest
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={handleDownloadSupplierPacket}
            disabled={packageSummary.files.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download supplier packet
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={handleDownloadModuleBomCsv}
            disabled={packageSummary.generatedModules.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download module BOM (CSV)
          </Button>
          <Button
            variant="default"
            size="sm"
            className="text-xs gap-1.5"
            onClick={handleDownloadFullReport}
            disabled={modules.length === 0}
          >
            <FileDown className="h-3.5 w-3.5" />
            Download full review report
          </Button>
          {packageSummary.readinessPct === 100 ? (
            <span className="text-xs text-status-success flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              RFQ-ready artifact coverage
            </span>
          ) : (
            <span className="text-xs text-status-warning flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Generate remaining modules for full package
            </span>
          )}
        </div>

        {packageSummary.moduleManifests.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold text-foreground">Module manifests</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {packageSummary.moduleManifests.map((manifest) => (
                <button
                  key={manifest.moduleId}
                  onClick={() => handleOpenManifest(manifest)}
                  className="flex items-center justify-between gap-2 text-left p-2 border rounded-md hover:bg-muted/40 transition-colors"
                >
                  <span className="text-xs text-foreground">{manifest.moduleName}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}

        {packageSummary.moduleCoverage.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold text-foreground">Artifact coverage checks</p>
            <div className="space-y-1.5">
              {packageSummary.moduleCoverage.map((module) => (
                <div
                  key={module.moduleId}
                  className="flex items-center justify-between rounded-md border bg-muted/20 px-2.5 py-1.5"
                >
                  <span className="text-xs text-foreground">{module.moduleName}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[10px] font-semibold",
                        module.scorePct === 100 ? "text-status-success" : "text-status-warning",
                      )}
                    >
                      {module.scorePct}%
                    </span>
                    {module.missingArtifacts.length > 0 ? (
                      <span className="text-[10px] text-status-warning">
                        Missing {module.missingArtifacts.join(", ")}
                      </span>
                    ) : (
                      <span className="text-[10px] text-status-success">Complete</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }): React.ReactNode {
  return (
    <div className="p-2.5 rounded-md bg-muted/30 space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground font-mono">{value}</p>
    </div>
  )
}

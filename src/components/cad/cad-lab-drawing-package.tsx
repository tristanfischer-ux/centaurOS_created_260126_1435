"use client"

/**
 * @file cad-lab-drawing-package.tsx — Supplier-facing drawing pack summary.
 *
 * @description Aggregates module-level drawing manifests and CAD artifacts into
 * a single procurement package overview. Provides quick readiness status and
 * a downloadable consolidated JSON manifest for RFQ handoff.
 */

import { useMemo } from "react"
import { FileArchive, Download, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CadLabModule } from "@/lib/cad-lab-types"

interface CadLabDrawingPackageProps {
  projectName: string
  modules: CadLabModule[]
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
  const files = mod.result?.drawingPackage?.files || []
  const hasStep = files.some((file) => file.name.toLowerCase().endsWith(".step"))
  const hasStl = files.some((file) => file.name.toLowerCase().endsWith(".stl"))
  const hasManifest = Boolean(mod.result?.drawingPackage?.manifestUrl)
  const coverageParts = [hasStep, hasStl, hasManifest].filter(Boolean).length
  const scorePct = Math.round((coverageParts / 3) * 100)
  const missingArtifacts: string[] = []
  if (!hasStep) missingArtifacts.push("STEP")
  if (!hasStl) missingArtifacts.push("STL")
  if (!hasManifest) missingArtifacts.push("Manifest")

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
    "_Generated by The Forge Cad Lab_",
  ]

  return lines.join("\n")
}

export function buildModuleBomCsv(
  packageSummary: DrawingPackageSummary,
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
    const materialHint = mod.result?.drawingPackage?.title || "TBD"
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

export function CadLabDrawingPackage({
  projectName,
  modules,
}: CadLabDrawingPackageProps): React.ReactNode {
  const packageSummary = useMemo(
    () => buildDrawingPackageSummary(modules),
    [modules],
  )

  const handleDownloadProjectManifest = (): void => {
    const payload = {
      source: "the-forge-cad-lab",
      projectName,
      generatedAt: new Date().toISOString(),
      generatedModuleCount: packageSummary.generatedModules.length,
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
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-drawing-package.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadSupplierPacket = (): void => {
    const markdown = buildSupplierPacketMarkdown(projectName, modules, packageSummary)
    const blob = new Blob([markdown], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-supplier-packet.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadModuleBomCsv = (): void => {
    const csv = buildModuleBomCsv(packageSummary)
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-module-bom.csv`
    link.click()
    URL.revokeObjectURL(url)
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
          <Metric label="Complete CAD packs" value={`${packageSummary.completeModules}/${packageSummary.generatedModules.length || 0}`} />
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
                  onClick={() => window.open(manifest.url, "_blank", "noopener,noreferrer")}
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

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

interface PackageFileEntry {
  moduleId: string
  moduleName: string
  name: string
  url: string
  mimeType: string
  sizeKb?: number
}

export function CadLabDrawingPackage({
  projectName,
  modules,
}: CadLabDrawingPackageProps): React.ReactNode {
  const packageSummary = useMemo(() => {
    const generatedModules = modules.filter((module) => module.status === "generated")
    const files: PackageFileEntry[] = []
    const moduleManifests: Array<{ moduleId: string; moduleName: string; url: string }> = []

    for (const mod of generatedModules) {
      const drawingPackage = mod.result?.drawingPackage
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

    const completeModules = generatedModules.filter((mod) => {
      const drawingPackage = mod.result?.drawingPackage
      return Boolean(
        drawingPackage &&
        drawingPackage.files.some((file) => file.name.endsWith(".step")) &&
        drawingPackage.files.some((file) => file.name.endsWith(".stl")),
      )
    }).length

    const readinessPct = generatedModules.length > 0
      ? Math.round((completeModules / generatedModules.length) * 100)
      : 0

    return {
      generatedModules,
      files,
      moduleManifests,
      completeModules,
      readinessPct,
    }
  }, [modules])

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

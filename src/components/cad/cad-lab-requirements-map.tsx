/**
 * @file cad-lab-requirements-map.tsx — Requirements-to-supplier mapping for The Forge.
 *
 * @description Shows per-module requirements derived from diagnostic answers,
 * maps each module to recommended supplier categories via getSupplierCategories(),
 * and provides a readiness overview. Rows are expandable to show full diagnostic
 * specs and key parts. Includes CSV export for procurement handoff.
 *
 * @component
 *
 * @example
 * <CadLabRequirementsMap modules={modules} diagnosticAnswers={diagnosticAnswers} />
 */

"use client"

import { useState, useMemo, useCallback } from "react"
import {
  Target,
  ChevronDown,
  ChevronRight,
  Download,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { getSupplierCategories } from "@/lib/cad-lab-cost-constants"
import { trackFeatureUse } from "@/hooks/useActivityTracker"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"

// ─── Types ──────────────────────────────────────────────────────────

interface CadLabRequirementsMapProps {
  /** Array of decomposed modules */
  modules: CadLabModule[]
  /** Diagnostic answers per module */
  diagnosticAnswers?: DiagnosticAnswers
}

/** Derived requirement row for a single module */
interface RequirementRow {
  moduleId: string
  moduleName: string
  purpose: string
  keyParts: string[]
  process: string | null
  material: string | null
  tolerance: string | null
  supplierCategories: string[]
  readiness: "ready" | "partial" | "missing"
  /** Extra diagnostic fields for expanded view */
  finish: string | null
  batchSize: string | null
  environment: string | null
  interfaceDefinition: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────

function deriveRows(
  modules: CadLabModule[],
  diagnosticAnswers?: DiagnosticAnswers
): RequirementRow[] {
  return modules.map((mod) => {
    const diag = diagnosticAnswers?.[mod.id] || {}
    const process = diag.mfg_process || null
    const material = diag.material || null
    const tolerance = diag.tolerance || null
    const finish = diag.finish || null
    const batchSize = diag.batch_size || null
    const environment = diag.environment || null

    const hasProcess = !!process
    const hasMaterial = !!material
    const hasTolerance = !!tolerance
    const filledCount = [hasProcess, hasMaterial, hasTolerance].filter(Boolean).length

    let readiness: "ready" | "partial" | "missing"
    if (filledCount === 3) readiness = "ready"
    else if (filledCount > 0) readiness = "partial"
    else readiness = "missing"

    return {
      moduleId: mod.id,
      moduleName: mod.name,
      purpose: mod.purpose,
      keyParts: mod.keyParts,
      process,
      material,
      tolerance,
      supplierCategories: getSupplierCategories(process, material),
      readiness,
      finish,
      batchSize,
      environment,
      interfaceDefinition: mod.interfaceDefinition || null,
    }
  })
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max).trimEnd() + "\..." : str
}

function readinessStyle(r: "ready" | "partial" | "missing") {
  switch (r) {
    case "ready":
      return { label: "Ready", text: "text-status-success", bg: "bg-status-success-light" }
    case "partial":
      return { label: "Partial", text: "text-status-warning", bg: "bg-status-warning-light" }
    case "missing":
      return { label: "Incomplete", text: "text-muted-foreground", bg: "bg-muted" }
  }
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * CadLabRequirementsMap — requirements-to-supplier mapping per module.
 *
 * @description Maps each module's manufacturing requirements to recommended
 * supplier categories. Shows readiness status and supports CSV export.
 */
export function CadLabRequirementsMap({
  modules,
  diagnosticAnswers,
}: CadLabRequirementsMapProps): React.ReactNode {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const rows = useMemo(
    () => deriveRows(modules, diagnosticAnswers),
    [modules, diagnosticAnswers]
  )

  const readyCount = rows.filter((r) => r.readiness === "ready").length
  const partialCount = rows.filter((r) => r.readiness === "partial").length
  const missingCount = rows.filter((r) => r.readiness === "missing").length

  const handleDownloadCsv = useCallback(() => {
    const header = "module_name,requirement,process,material,tolerance,recommended_suppliers,readiness"
    const csvRows = rows.map((r) => {
      const escape = (s: string | null) => {
        if (!s) return ""
        // Escape double quotes and wrap in quotes if contains comma or quote
        const escaped = s.replace(/"/g, '""')
        return escaped.includes(",") || escaped.includes('"')
          ? `"${escaped}"`
          : escaped
      }
      return [
        escape(r.moduleName),
        escape(r.purpose),
        escape(r.process),
        escape(r.material),
        escape(r.tolerance),
        escape(r.supplierCategories.join("; ")),
        r.readiness,
      ].join(",")
    })

    const csv = [header, ...csvRows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "requirements-supplier-map.csv"
    a.click()
    URL.revokeObjectURL(url)

    trackFeatureUse("cad_lab_requirements_csv_downloaded", {})
  }, [rows])

  // ── Empty state ──
  if (modules.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Requirements &amp; Supplier Mapping
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 space-y-2">
            <Target className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Complete the Concept stage to map requirements. Module decomposition
              provides the foundation for supplier matching.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Requirements &amp; Supplier Mapping
            <span className="text-xs font-normal text-muted-foreground">
              {modules.length} module{modules.length !== 1 ? "s" : ""} mapped
            </span>
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleDownloadCsv}>
            <Download className="h-3 w-3 mr-1" />
            CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary readiness pills */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-success-light text-status-success font-medium">
            <CheckCircle2 className="h-3 w-3" />
            {readyCount} ready
          </div>
          {partialCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-warning-light text-status-warning font-medium">
              <AlertTriangle className="h-3 w-3" />
              {partialCount} partial
            </div>
          )}
          {missingCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">
              {missingCount} incomplete
            </div>
          )}
        </div>

        {/* Requirements table */}
        <div className="border rounded-lg overflow-hidden divide-y">
          {/* Table header */}
          <div className="hidden md:grid md:grid-cols-[1.2fr_1.5fr_0.8fr_0.8fr_1.5fr_0.6fr] gap-2 px-4 py-2 bg-muted text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            <span>Module</span>
            <span>Requirement</span>
            <span>Process</span>
            <span>Material</span>
            <span>Recommended Suppliers</span>
            <span>Readiness</span>
          </div>

          {rows.map((row) => {
            const isExpanded = expandedId === row.moduleId
            const rs = readinessStyle(row.readiness)

            return (
              <div key={row.moduleId}>
                {/* Row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : row.moduleId)}
                  className="w-full text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1.5fr_0.8fr_0.8fr_1.5fr_0.6fr] gap-2 px-4 py-3 items-center">
                    {/* Module name */}
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-sm font-semibold text-foreground truncate">
                        {row.moduleName}
                      </span>
                    </div>

                    {/* Requirement (purpose) */}
                    <span className="text-xs text-muted-foreground truncate">
                      {truncate(row.purpose, 80)}
                    </span>

                    {/* Process */}
                    <span
                      className={cn(
                        "text-xs",
                        row.process ? "text-foreground" : "text-muted-foreground italic"
                      )}
                    >
                      {row.process || "Not specified"}
                    </span>

                    {/* Material */}
                    <span
                      className={cn(
                        "text-xs",
                        row.material ? "text-foreground" : "text-muted-foreground italic"
                      )}
                    >
                      {row.material || "Not specified"}
                    </span>

                    {/* Supplier categories */}
                    <div className="flex flex-wrap gap-1">
                      {row.supplierCategories.map((cat) => (
                        <span
                          key={cat}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-foreground font-medium"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>

                    {/* Readiness badge */}
                    <span
                      className={cn(
                        "text-[10px] font-medium px-2 py-0.5 rounded-full w-fit",
                        rs.bg,
                        rs.text
                      )}
                    >
                      {rs.label}
                    </span>
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t px-4 py-3 space-y-3 bg-muted/10">
                    {/* Key parts */}
                    {row.keyParts.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                          Key Parts
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {row.keyParts.map((part, i) => (
                            <span
                              key={i}
                              className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-foreground"
                            >
                              {part}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Interface definition */}
                    {row.interfaceDefinition && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                          Interface Definition
                        </p>
                        <p className="text-xs text-foreground">
                          {truncate(row.interfaceDefinition, 200)}
                        </p>
                      </div>
                    )}

                    {/* Full diagnostic specs */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        Diagnostic Specs
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <SpecCell label="Tolerance" value={row.tolerance} />
                        <SpecCell label="Finish" value={row.finish} />
                        <SpecCell label="Batch Size" value={row.batchSize} />
                        <SpecCell label="Environment" value={row.environment} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

/** Small spec cell for expanded details */
function SpecCell({
  label,
  value,
}: {
  label: string
  value: string | null
}): React.ReactNode {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xs font-medium",
          value ? "text-foreground" : "text-muted-foreground italic"
        )}
      >
        {value || "Not specified"}
      </p>
    </div>
  )
}

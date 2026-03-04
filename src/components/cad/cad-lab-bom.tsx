/**
 * @file cad-lab-bom.tsx — Hierarchical Bill of Materials (BOM) for CAD Lab.
 *
 * @description Builds a three-level BOM (system > module > part) from module
 * decomposition data and engineering diagnostics. Cost computation mirrors
 * cad-lab-cost-estimate.tsx: materialCost + processCost + toolingCostPerUnit.
 * Part-level values split module totals evenly across keyParts (marked "~").
 *
 * @component
 *
 * @example
 * <CadLabBom
 *   modules={modules}
 *   diagnosticAnswers={diagnosticAnswers}
 *   projectName="Drone Frame"
 * />
 */

"use client"

import { useMemo, useState, useCallback } from "react"
import { List, Download, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import {
  MATERIAL_COST_PER_KG,
  PROCESS_HOURLY_RATE,
  HOURS_PER_KG,
  TOOLING_COST,
  parseBatchSize,
  getModuleMassKg,
  getSupplierCategories,
} from "@/lib/cad-lab-cost-constants"
import { trackFeatureUse } from "@/hooks/useActivityTracker"

// ─── Types ──────────────────────────────────────────────────────────

interface BomEntry {
  level: "system" | "module" | "part"
  id: string
  name: string
  material: string
  quantity: number
  massKg: number
  unitCost: number
  totalCost: number
  supplierType: string
  leadWeeks: number
  isEstimated: boolean
  /** Module has no diagnostic answers — all values are defaults */
  hasDiagnostics: boolean
  children?: BomEntry[]
}

interface CadLabBomProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  projectName: string
}

// ─── Helpers ────────────────────────────────────────────────────────

const fmtCost = (n: number) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtMass = (kg: number) => (kg < 0.01 ? "<0.01 kg" : `${kg.toFixed(2)} kg`)

// ─── Component ──────────────────────────────────────────────────────

/**
 * CadLabBom — hierarchical Bill of Materials viewer with CSV export.
 *
 * @description Derives a three-level BOM from module data and diagnostic
 * answers. Costs use the same formula as CadLabCostEstimate. Part-level
 * entries split module totals evenly across keyParts (marked as estimated).
 */
export function CadLabBom({
  modules,
  diagnosticAnswers,
  projectName,
}: CadLabBomProps): React.ReactNode {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── Build hierarchical BOM ──────────────────────────────────────

  const bom = useMemo((): BomEntry => {
    const moduleEntries: BomEntry[] = modules.map((mod) => {
      const answers = diagnosticAnswers?.[mod.id] || {}
      const hasDiagnostics = Object.keys(answers).length > 0
      const process = answers.mfg_process || "Other"
      const material = answers.material || "Other"
      const batchSize = parseBatchSize(answers.batch_size || "1-10 (prototyping)")

      const moduleText = [mod.name, mod.purpose, ...mod.keyParts].join(" ")
      const { massKg, isEstimated } = getModuleMassKg(
        mod.result?.massProperties?.massKg,
        mod.result?.massGrams,
        undefined,
        moduleText,
        mod.estimatedMassKg,
      )

      // FLOW: Same cost formula as cad-lab-cost-estimate.tsx
      const materialCost = massKg * (MATERIAL_COST_PER_KG[material] ?? 20)
      const processCost = massKg * (HOURS_PER_KG[process] ?? 3) * (PROCESS_HOURLY_RATE[process] ?? 50)
      const toolingTotal = TOOLING_COST[process] ?? 0
      const toolingCostPerUnit = batchSize > 0 ? toolingTotal / batchSize : toolingTotal
      const totalPerUnit = materialCost + processCost + toolingCostPerUnit
      const supplierType = getSupplierCategories(process, material)[0]

      const partCount = mod.keyParts.length || 1
      const partEntries: BomEntry[] = mod.keyParts.map((partName, idx) => ({
        level: "part" as const,
        id: `${mod.id}__part_${idx}`,
        name: partName,
        material: answers.material || "",
        quantity: 1,
        massKg: massKg / partCount,
        unitCost: totalPerUnit / partCount,
        totalCost: totalPerUnit / partCount,
        supplierType,
        leadWeeks: 0,
        isEstimated: true, // Always estimated (evenly split)
        hasDiagnostics: true,
      }))

      return {
        level: "module" as const, id: mod.id, name: mod.name,
        material: answers.material || "", quantity: 1, massKg,
        unitCost: totalPerUnit, totalCost: totalPerUnit, supplierType,
        leadWeeks: mod.leadWeeks, isEstimated, hasDiagnostics, children: partEntries,
      }
    })

    const systemTotal = moduleEntries.reduce((s, m) => s + m.totalCost, 0)
    const systemMass = moduleEntries.reduce((s, m) => s + m.massKg, 0)

    return {
      level: "system", id: "__system", name: projectName || "System",
      material: "", quantity: 1, massKg: systemMass,
      unitCost: systemTotal, totalCost: systemTotal, supplierType: "",
      leadWeeks: Math.max(...moduleEntries.map((m) => m.leadWeeks), 0),
      isEstimated: moduleEntries.some((m) => m.isEstimated),
      hasDiagnostics: true, children: moduleEntries,
    }
  }, [modules, diagnosticAnswers, projectName])

  // ── CSV download ────────────────────────────────────────────────

  const downloadCsv = useCallback(() => {
    const rows: string[][] = [
      ["level", "name", "material", "quantity", "mass_kg", "unit_cost", "total_cost", "supplier_type", "lead_weeks"],
    ]
    function flatten(entry: BomEntry) {
      rows.push([
        entry.level, entry.name, entry.material || "", String(entry.quantity),
        entry.massKg.toFixed(4), entry.unitCost.toFixed(2), entry.totalCost.toFixed(2),
        entry.supplierType, entry.leadWeeks > 0 ? String(entry.leadWeeks) : "",
      ])
      entry.children?.forEach(flatten)
    }
    flatten(bom)

    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${(projectName || "bom").replace(/\s+/g, "_").toLowerCase()}_bom.csv`
    a.click()
    URL.revokeObjectURL(url)
    trackFeatureUse("cad_lab_bom_csv_downloaded", {
      moduleCount: bom.children?.length ?? 0,
      totalCost: bom.totalCost,
      hasEstimates: bom.isEstimated,
    })
  }, [bom, projectName])

  // ── Empty state ─────────────────────────────────────────────────

  if (Object.keys(diagnosticAnswers).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <List className="h-4 w-4" />
            Bill of Materials
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Complete engineering diagnostics to generate the Bill of Materials. Process, material, and batch size are needed.
          </p>
        </CardContent>
      </Card>
    )
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <List className="h-4 w-4" />
            Bill of Materials
            <span className="text-xs font-normal font-mono text-foreground bg-muted px-2 py-0.5 rounded">
              {fmtCost(bom.totalCost)}
            </span>
          </CardTitle>
          <Button variant="outline" size="sm" className="text-xs h-7 gap-1.5" onClick={downloadCsv}>
            <Download className="h-3 w-3" />
            Download BOM (CSV)
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="border rounded-md overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className="text-left p-2 font-semibold text-muted-foreground">Name</th>
                <th scope="col" className="text-left p-2 font-semibold text-muted-foreground">Material</th>
                <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">Mass</th>
                <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">Cost/Unit</th>
                <th scope="col" className="text-left p-2 font-semibold text-muted-foreground">Supplier Type</th>
                <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">Lead Time</th>
              </tr>
            </thead>
            <tbody>
              {/* System row */}
              <tr className="border-b bg-muted/50 cursor-pointer" onClick={() => toggle(bom.id)}>
                <td className="p-2 font-bold text-foreground">
                  <span className="mr-1" aria-hidden="true">{expandedIds.has(bom.id) ? "\u25BE" : "\u25B8"}</span>
                  {bom.name}
                </td>
                <td className="p-2 text-muted-foreground">&mdash;</td>
                <td className="p-2 text-right font-mono text-foreground">{fmtMass(bom.massKg)}</td>
                <td className="p-2 text-right font-mono font-bold text-foreground">{fmtCost(bom.totalCost)}</td>
                <td className="p-2 text-muted-foreground">&mdash;</td>
                <td className="p-2 text-right text-foreground">
                  {Math.max(...(bom.children?.map((m) => m.leadWeeks) ?? [0])) > 0
                    ? `${Math.max(...(bom.children?.map((m) => m.leadWeeks) ?? [0]))} wk`
                    : "\u2014"}
                </td>
              </tr>
              {/* Module rows (when system expanded) */}
              {expandedIds.has(bom.id) && bom.children?.map((mod) => (
                <ModuleRow key={mod.id} entry={mod} isExpanded={expandedIds.has(mod.id)} onToggle={toggle} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">
          Part-level costs and masses marked with ~ are estimated by splitting module totals evenly across key parts.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

function ModuleRow({ entry, isExpanded, onToggle }: { entry: BomEntry; isExpanded: boolean; onToggle: (id: string) => void }) {
  const hasParts = entry.children && entry.children.length > 0
  return (
    <>
      <tr
        className={cn("border-b transition-colors", hasParts && "cursor-pointer hover:bg-muted/30")}
        onClick={() => hasParts && onToggle(entry.id)}
        aria-expanded={hasParts ? isExpanded : undefined}
      >
        <td className="p-2 pl-6 font-semibold text-foreground">
          <div className="flex items-center gap-1">
            {hasParts && <span className="mr-1" aria-hidden="true">{isExpanded ? "\u25BE" : "\u25B8"}</span>}
            {entry.name}
            {entry.isEstimated && <span className="text-[10px] font-mono text-status-warning ml-1" title="Mass estimated">~</span>}
            {!entry.hasDiagnostics && (
              <span title="No diagnostic data — using default values" className="ml-1">
                <AlertTriangle className="h-3 w-3 text-status-warning" />
              </span>
            )}
          </div>
        </td>
        <td className="p-2 text-foreground">
          {entry.material || <span className="italic text-muted-foreground">Not specified</span>}
        </td>
        <td className="p-2 text-right font-mono text-foreground">{entry.isEstimated ? "~" : ""}{fmtMass(entry.massKg)}</td>
        <td className="p-2 text-right font-mono font-semibold text-foreground">{fmtCost(entry.unitCost)}</td>
        <td className="p-2 text-foreground">{entry.supplierType}</td>
        <td className="p-2 text-right text-foreground">{entry.leadWeeks > 0 ? `${entry.leadWeeks} wk` : "\u2014"}</td>
      </tr>
      {isExpanded && entry.children?.map((part) => (
        <tr key={part.id} className="border-b last:border-b-0">
          <td className="p-2 pl-12 text-xs text-foreground">{part.name}</td>
          <td className="p-2 text-xs text-foreground">
            {part.material || <span className="italic text-muted-foreground">Not specified</span>}
          </td>
          <td className="p-2 text-right text-xs font-mono text-foreground">~{fmtMass(part.massKg)}</td>
          <td className="p-2 text-right text-xs font-mono text-foreground">~{fmtCost(part.unitCost)}</td>
          <td className="p-2 text-xs text-foreground">{part.supplierType}</td>
          <td className="p-2 text-right text-xs text-muted-foreground">&mdash;</td>
        </tr>
      ))}
    </>
  )
}

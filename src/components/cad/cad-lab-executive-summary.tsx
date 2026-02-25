/**
 * @file cad-lab-executive-summary.tsx — Executive summary card for Review stage.
 *
 * @description Shows a single-glance overview of the entire product: module count,
 * total mass, estimated cost, lead time, DFM readiness, diagnostic completion,
 * and top risks. Designed as a 30-second elevator pitch for founders, investors,
 * or co-founders.
 *
 * @component
 *
 * @example
 * <CadLabExecutiveSummary
 *   modules={modules}
 *   diagnosticAnswers={diagnosticAnswers}
 *   projectName="Drone Frame"
 * />
 */

"use client"

import { useMemo } from "react"
import {
  Layers,
  Scale,
  PoundSterling,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
} from "lucide-react"

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
} from "@/lib/cad-lab-cost-constants"

// ─── Types ──────────────────────────────────────────────────────────

interface CadLabExecutiveSummaryProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  projectName: string
}

interface SummaryData {
  moduleCount: number
  generatedCount: number
  totalMassKg: number
  hasEstimatedMass: boolean
  totalCostPerUnit: number
  maxLeadWeeks: number
  totalParts: number
  dfmIssueCount: number
  dfmCriticalCount: number
  diagnosticCompletion: number // 0-100
  topRisks: string[]
  riskCount: number
}

// ─── Component ──────────────────────────────────────────────────────

export function CadLabExecutiveSummary({
  modules,
  diagnosticAnswers,
  projectName,
}: CadLabExecutiveSummaryProps): React.ReactNode {
  const data = useMemo((): SummaryData => {
    let totalMassKg = 0
    let totalCostPerUnit = 0
    let hasEstimatedMass = false
    let dfmIssueCount = 0
    let dfmCriticalCount = 0
    const allRisks: string[] = []

    for (const mod of modules) {
      const answers = diagnosticAnswers?.[mod.id] || {}
      const process = answers.mfg_process || "Other"
      const material = answers.material || "Other"
      const batchSize = parseBatchSize(answers.batch_size || "1-10 (prototyping)")

      const { massKg, isEstimated } = getModuleMassKg(
        mod.result?.massProperties?.massKg,
        mod.result?.massGrams,
      )
      if (isEstimated) hasEstimatedMass = true
      totalMassKg += massKg

      // FLOW: Same cost formula as all other cost components
      const materialCost = massKg * (MATERIAL_COST_PER_KG[material] ?? 20)
      const processCost = massKg * (HOURS_PER_KG[process] ?? 3) * (PROCESS_HOURLY_RATE[process] ?? 50)
      const toolingTotal = TOOLING_COST[process] ?? 0
      const toolingCostPerUnit = batchSize > 0 ? toolingTotal / batchSize : toolingTotal
      totalCostPerUnit += materialCost + processCost + toolingCostPerUnit

      // DFM issues
      const dfmIssues = mod.result?.dfm?.issues ?? []
      dfmIssueCount += dfmIssues.length
      dfmCriticalCount += dfmIssues.filter(
        (i) => i.severity === "critical" || i.severity === "high",
      ).length

      // Risks from failure modes + unknowns
      for (const fm of mod.failureModes) {
        allRisks.push(`${mod.name}: ${fm}`)
      }
      for (const unk of mod.unknowns) {
        allRisks.push(`${mod.name}: ${unk}`)
      }
    }

    // Diagnostic completion: 6 categories per module
    const totalDiagFields = modules.length * 6
    let completedDiagFields = 0
    for (const mod of modules) {
      const answers = diagnosticAnswers?.[mod.id]
      if (answers) completedDiagFields += Object.keys(answers).length
    }
    const diagnosticCompletion =
      totalDiagFields > 0 ? Math.round((completedDiagFields / totalDiagFields) * 100) : 0

    return {
      moduleCount: modules.length,
      generatedCount: modules.filter((m) => m.status === "generated").length,
      totalMassKg,
      hasEstimatedMass,
      totalCostPerUnit,
      maxLeadWeeks: Math.max(...modules.map((m) => m.leadWeeks), 0),
      totalParts: modules.reduce((s, m) => s + m.keyParts.length, 0),
      dfmIssueCount,
      dfmCriticalCount,
      diagnosticCompletion,
      topRisks: allRisks.slice(0, 3),
      riskCount: allRisks.length,
    }
  }, [modules, diagnosticAnswers])

  if (modules.length === 0) return null

  const massDisplay =
    data.totalMassKg < 0.01
      ? "<10g"
      : data.totalMassKg < 1
        ? `${(data.totalMassKg * 1000).toFixed(0)}g`
        : `${data.totalMassKg.toFixed(2)}kg`

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CircleDot className="h-4 w-4" />
          Executive Summary
          <span className="text-xs font-normal text-muted-foreground">
            {projectName}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hero metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            icon={<Layers className="h-3.5 w-3.5" />}
            label="Modules"
            value={`${data.generatedCount}/${data.moduleCount}`}
            sub={`${data.totalParts} parts`}
          />
          <MetricCard
            icon={<Scale className="h-3.5 w-3.5" />}
            label="Total Mass"
            value={massDisplay}
            sub={data.hasEstimatedMass ? "includes estimates" : "from CAD"}
            warn={data.hasEstimatedMass}
          />
          <MetricCard
            icon={<PoundSterling className="h-3.5 w-3.5" />}
            label="Cost / Unit"
            value={`£${data.totalCostPerUnit.toFixed(2)}`}
            sub="mfg estimate"
          />
          <MetricCard
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Lead Time"
            value={data.maxLeadWeeks > 0 ? `${data.maxLeadWeeks} wk` : "\u2014"}
            sub="longest module"
          />
        </div>

        {/* Readiness row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* DFM readiness */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0",
                data.dfmCriticalCount === 0 ? "bg-status-success-light" : "bg-status-warning-light",
              )}
            >
              <ShieldCheck
                className={cn(
                  "h-4 w-4",
                  data.dfmCriticalCount === 0 ? "text-status-success" : "text-status-warning",
                )}
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">
                {data.dfmIssueCount === 0
                  ? "DFM Clear"
                  : `${data.dfmIssueCount} DFM Issue${data.dfmIssueCount !== 1 ? "s" : ""}`}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {data.dfmCriticalCount > 0
                  ? `${data.dfmCriticalCount} critical/high`
                  : "No critical issues"}
              </p>
            </div>
          </div>

          {/* Diagnostic completion */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0",
                data.diagnosticCompletion === 100
                  ? "bg-status-success-light"
                  : data.diagnosticCompletion > 0
                    ? "bg-status-warning-light"
                    : "bg-muted",
              )}
            >
              <CheckCircle2
                className={cn(
                  "h-4 w-4",
                  data.diagnosticCompletion === 100
                    ? "text-status-success"
                    : data.diagnosticCompletion > 0
                      ? "text-status-warning"
                      : "text-muted-foreground",
                )}
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">
                Diagnostics {data.diagnosticCompletion}%
              </p>
              <p className="text-[10px] text-muted-foreground">
                {data.diagnosticCompletion === 100
                  ? "All modules specified"
                  : "Process, material, tolerance"}
              </p>
            </div>
          </div>

          {/* Risk summary */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0",
                data.riskCount === 0 ? "bg-status-success-light" : "bg-status-warning-light",
              )}
            >
              <AlertTriangle
                className={cn(
                  "h-4 w-4",
                  data.riskCount === 0 ? "text-status-success" : "text-status-warning",
                )}
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">
                {data.riskCount === 0
                  ? "No Risks Flagged"
                  : `${data.riskCount} Risk${data.riskCount !== 1 ? "s" : ""}`}
              </p>
              {data.topRisks.length > 0 && (
                <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                  {data.topRisks[0]}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

function MetricCard({
  icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  warn?: boolean
}): React.ReactNode {
  return (
    <div className="p-3 rounded-lg bg-muted/30 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold font-mono text-foreground">{value}</p>
      <p className={cn("text-[10px]", warn ? "text-status-warning" : "text-muted-foreground")}>
        {sub}
      </p>
    </div>
  )
}

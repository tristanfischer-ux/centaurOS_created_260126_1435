/**
 * @file engineering-review-package.tsx — Reviewer-friendly analysis summary
 *
 * @description Presents all engineering analysis results in a format
 * optimized for human reviewers. Organized into clear sections:
 *
 * 1. Executive Summary — overall pass/fail with key metrics
 * 2. Structural Analysis — FEA results per module with safety factors
 * 3. Thermal Analysis — temperature maps and limits
 * 4. DFM Assessment — printability and manufacturing concerns
 * 5. Convergence Status — iteration history and proposed changes
 * 6. Action Items — what needs human decision
 *
 * This component is designed to give reviewers everything they need
 * to make an informed approve/reject decision without navigating
 * through multiple tabs and views.
 *
 * @related
 * - Engineering summary: ./engineering-summary.tsx (compact dashboard)
 * - Design changes dialog: ./design-changes-dialog.tsx (change review)
 * - Review gates: src/actions/review-gates.ts (approval flow)
 */

"use client"

import React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Scale,
  ShieldCheck,
  Thermometer,
  Printer,
  RotateCcw,
  BarChart3,
  Zap,
  Info,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { ForgeInfoTip, FORGE_EXPLANATIONS } from "./forge-hover-explanations"
import type { XRaySpec, ModuleSpec, SystemAnalysis } from "../services/xray-schema"

// ─── Props ───────────────────────────────────────────────────────────

interface EngineeringReviewPackageProps {
  /** Full spec with analysis results */
  spec: XRaySpec
  /** Additional CSS classes */
  className?: string
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * EngineeringReviewPackage — Comprehensive analysis summary for reviewers.
 *
 * @description Formats analysis results into a clear, reviewable package
 * with executive summary, per-module details, and action items.
 *
 * @example
 * <EngineeringReviewPackage spec={spec} />
 */
export function EngineeringReviewPackage({
  spec,
  className,
}: EngineeringReviewPackageProps): React.ReactNode {
  const sa = spec.systemAnalysis
  const modulesWithAnalysis = spec.modules.filter(
    (m) => m.cadModel?.analysis?.massProperties,
  )

  if (modulesWithAnalysis.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="pt-6 text-center">
          <Info className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No analysis data available. Run the full engineering analysis pipeline first.
          </p>
        </CardContent>
      </Card>
    )
  }

  const actionItems = collectActionItems(spec)

  return (
    <div className={cn("space-y-6", className)}>
      {/* Section 1: Executive Summary */}
      <ExecutiveSummary spec={spec} sa={sa} actionItemCount={actionItems.length} />

      {/* Section 2: Per-Module Structural Analysis */}
      <StructuralSection modules={spec.modules} />

      {/* Section 3: Thermal Analysis */}
      <ThermalSection modules={spec.modules} />

      {/* Section 4: DFM Assessment */}
      <DfmSection modules={spec.modules} />

      {/* Section 5: Convergence Status */}
      {sa && sa.convergenceStatus && sa.convergenceStatus !== "not_started" && (
        <ConvergenceSection sa={sa} />
      )}

      {/* Section 6: Action Items */}
      {actionItems.length > 0 && <ActionItemsSection items={actionItems} />}
    </div>
  )
}

// ─── Executive Summary ───────────────────────────────────────────────

function ExecutiveSummary({
  spec,
  sa,
  actionItemCount,
}: {
  spec: XRaySpec
  sa?: SystemAnalysis
  actionItemCount: number
}): React.ReactNode {
  const overallPass = sa?.structuralGrade === "pass" && sa?.manufacturabilityGrade === "pass"
  const overallFail = sa?.structuralGrade === "fail" || sa?.manufacturabilityGrade === "fail"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-5 w-5 text-international-orange" />
          Executive Summary
          <ForgeInfoTip text={FORGE_EXPLANATIONS.executiveSummary.description} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall verdict */}
        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
          {overallPass ? (
            <CheckCircle2 className="h-8 w-8 text-status-success shrink-0" />
          ) : overallFail ? (
            <XCircle className="h-8 w-8 text-destructive shrink-0" />
          ) : (
            <AlertTriangle className="h-8 w-8 text-status-warning shrink-0" />
          )}
          <div>
            <p className="text-lg font-semibold text-foreground">
              {overallPass
                ? "Design Passes All Checks"
                : overallFail
                  ? "Design Requires Attention"
                  : "Design Partially Passes"}
            </p>
            <p className="text-sm text-muted-foreground">
              {actionItemCount > 0
                ? `${actionItemCount} item${actionItemCount !== 1 ? "s" : ""} need human review`
                : "No action items — all analyses within acceptable limits"}
            </p>
          </div>
        </div>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCell
            label="Total Mass"
            value={sa?.totalMass_kg != null ? formatMass(sa.totalMass_kg) : "N/A"}
            icon={<Scale className="h-4 w-4" />}
            tip={FORGE_EXPLANATIONS.massProperties.description}
          />
          <MetricCell
            label="Structural"
            value={gradeLabel(sa?.structuralGrade)}
            icon={<ShieldCheck className="h-4 w-4" />}
            status={gradeStatus(sa?.structuralGrade)}
            tip={FORGE_EXPLANATIONS.feaAnalysis.description}
          />
          <MetricCell
            label="DFM"
            value={gradeLabel(sa?.manufacturabilityGrade)}
            icon={<Printer className="h-4 w-4" />}
            status={gradeStatus(sa?.manufacturabilityGrade)}
            tip={FORGE_EXPLANATIONS.dfmCheck.description}
          />
          <MetricCell
            label="Convergence"
            value={sa?.convergenceStatus === "converged" ? "Converged" : sa?.convergenceStatus ?? "N/A"}
            icon={<RotateCcw className="h-4 w-4" />}
            status={sa?.convergenceStatus === "converged" ? "pass" : sa?.convergenceStatus === "not_started" ? "neutral" : "warning"}
            tip={FORGE_EXPLANATIONS.convergenceAnalysis.description}
          />
        </div>

        {/* Module count */}
        <p className="text-xs text-muted-foreground">
          {spec.modules.length} modules analyzed •{" "}
          {spec.modules.filter((m) => m.cadModel?.status === "complete").length} with CAD •{" "}
          {spec.modules.filter((m) => m.cadModel?.analysis?.structural?.status === "complete").length} with FEA
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Structural Section ──────────────────────────────────────────────

function StructuralSection({ modules }: { modules: ModuleSpec[] }): React.ReactNode {
  const modulesWithFEA = modules.filter(
    (m) => m.cadModel?.analysis?.structural?.status === "complete",
  )

  if (modulesWithFEA.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-international-orange" />
          Structural Analysis (FEA)
          <ForgeInfoTip text={FORGE_EXPLANATIONS.feaAnalysis.description} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {modulesWithFEA.map((m) => {
            const s = m.cadModel?.analysis?.structural
            if (!s) return null
            const sf = s.safetyFactor ?? 0
            const status = sf >= 2.0 ? "pass" : sf >= 1.5 ? "warning" : "fail"

            return (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <StatusDot status={status} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Max stress: {s.maxStress_MPa?.toFixed(1) ?? "?"} MPa •{" "}
                      Deformation: {s.maxDeformation_mm?.toFixed(2) ?? "?"} mm
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "text-sm font-mono font-semibold",
                    status === "pass" ? "text-status-success" : status === "warning" ? "text-status-warning" : "text-destructive",
                  )}>
                    SF = {sf.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {status === "pass" ? "Acceptable" : status === "warning" ? "Marginal" : "Below limit"}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Thermal Section ─────────────────────────────────────────────────

function ThermalSection({ modules }: { modules: ModuleSpec[] }): React.ReactNode {
  const modulesWithThermal = modules.filter(
    (m) => m.cadModel?.analysis?.thermal?.status === "complete",
  )

  if (modulesWithThermal.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Thermometer className="h-5 w-5 text-international-orange" />
          Thermal Analysis
          <ForgeInfoTip text={FORGE_EXPLANATIONS.thermalAnalysis.description} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {modulesWithThermal.map((m) => {
            const t = m.cadModel?.analysis?.thermal
            if (!t) return null
            const maxTemp = t.maxTemp_C ?? 0
            const limit = 80 // Common plastic limit
            const status = maxTemp <= limit * 0.8 ? "pass" : maxTemp <= limit ? "warning" : "fail"

            return (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <StatusDot status={status} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Min: {t.minTemp_C?.toFixed(0) ?? "?"} °C •{" "}
                      Avg: {t.avgTemp_C?.toFixed(0) ?? "?"} °C
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "text-sm font-mono font-semibold",
                    status === "pass" ? "text-status-success" : status === "warning" ? "text-status-warning" : "text-destructive",
                  )}>
                    {maxTemp.toFixed(0)} °C
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Max temperature
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── DFM Section ─────────────────────────────────────────────────────

function DfmSection({ modules }: { modules: ModuleSpec[] }): React.ReactNode {
  const modulesWithDfm = modules.filter(
    (m) => m.cadModel?.analysis?.dfm,
  )

  if (modulesWithDfm.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Printer className="h-5 w-5 text-international-orange" />
          Design for Manufacturing
          <ForgeInfoTip text={FORGE_EXPLANATIONS.dfmCheck.description} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {modulesWithDfm.map((m) => {
            const dfm = m.cadModel?.analysis?.dfm
            if (!dfm) return null
            const status = dfm.printable ? "pass" : "fail"

            return (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <StatusDot status={status} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Min wall: {dfm.minWall_mm?.toFixed(1) ?? "?"} mm •{" "}
                      Max overhang: {dfm.maxOverhang_deg?.toFixed(0) ?? "?"}°
                    </p>
                    {dfm.issues && dfm.issues.length > 0 && (
                      <p className="text-xs text-destructive mt-0.5">
                        Issues: {dfm.issues.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <Badge variant={dfm.printable ? "success" : "destructive"} className="text-xs">
                  {dfm.printable ? "Printable" : "Not Printable"}
                </Badge>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Convergence Section ─────────────────────────────────────────────

function ConvergenceSection({ sa }: { sa: SystemAnalysis }): React.ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCcw className="h-5 w-5 text-international-orange" />
          Convergence Analysis
          <ForgeInfoTip text={FORGE_EXPLANATIONS.convergenceAnalysis.description} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge
            variant={
              sa.convergenceStatus === "converged" ? "success"
                : sa.convergenceStatus === "max_iterations" ? "warning"
                  : "secondary"
            }
          >
            {sa.convergenceStatus}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Iteration {sa.iterationCount ?? 0} of {sa.maxIterations ?? 10}
          </span>
        </div>

        {/* Criteria table */}
        {sa.convergenceCriteria && sa.convergenceCriteria.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">Criterion</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Current</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Threshold</th>
                  <th className="pb-2 font-medium text-muted-foreground text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {sa.convergenceCriteria.map((c, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-foreground">{c.metric}</td>
                    <td className="py-2 pr-4 text-right font-mono text-muted-foreground">
                      {c.currentValue?.toFixed(2) ?? "?"}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-muted-foreground">
                      {c.threshold}
                    </td>
                    <td className="py-2 text-center">
                      <StatusDot status={c.met ? "pass" : "fail"} inline />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Action Items Section ────────────────────────────────────────────

interface ActionItem {
  title: string
  severity: "critical" | "warning" | "info"
  module?: string
}

function ActionItemsSection({ items }: { items: ActionItem[] }): React.ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-5 w-5 text-international-orange" />
          Action Items ({items.length})
          <ForgeInfoTip text={FORGE_EXPLANATIONS.actionItems.description} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg",
                item.severity === "critical" && "bg-status-error-light",
                item.severity === "warning" && "bg-status-warning-light",
                item.severity === "info" && "bg-muted/50",
              )}
            >
              {item.severity === "critical" ? (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              ) : item.severity === "warning" ? (
                <AlertTriangle className="h-4 w-4 text-status-warning shrink-0" />
              ) : (
                <Info className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm text-foreground">{item.title}</p>
                {item.module && (
                  <p className="text-xs text-muted-foreground">Module: {item.module}</p>
                )}
              </div>
              <Badge
                variant={item.severity === "critical" ? "destructive" : item.severity === "warning" ? "warning" : "secondary"}
                className="text-[9px] shrink-0 ml-auto"
              >
                {item.severity}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Shared Sub-Components ───────────────────────────────────────────

function MetricCell({
  label,
  value,
  icon,
  status = "neutral",
  tip,
}: {
  label: string
  value: string
  icon: React.ReactNode
  status?: "pass" | "warning" | "fail" | "neutral"
  tip?: string
}): React.ReactNode {
  return (
    <div className="p-3 rounded-lg bg-muted/30 space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
        {tip && <ForgeInfoTip text={tip} className="h-2.5 w-2.5" />}
      </div>
      <p className={cn(
        "text-sm font-semibold",
        status === "pass" && "text-status-success",
        status === "warning" && "text-status-warning",
        status === "fail" && "text-destructive",
        status === "neutral" && "text-foreground",
      )}>
        {value}
      </p>
    </div>
  )
}

function StatusDot({
  status,
  inline = false,
}: {
  status: "pass" | "warning" | "fail"
  inline?: boolean
}): React.ReactNode {
  return (
    <div
      className={cn(
        "rounded-full shrink-0",
        inline ? "h-2 w-2 inline-block" : "h-2.5 w-2.5",
        status === "pass" && "bg-status-success",
        status === "warning" && "bg-status-warning",
        status === "fail" && "bg-destructive",
      )}
    />
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatMass(kg: number): string {
  return kg >= 1 ? `${kg.toFixed(2)} kg` : `${(kg * 1000).toFixed(1)} g`
}

type Grade = "pass" | "marginal" | "fail" | "not_analyzed" | undefined

function gradeLabel(grade: Grade): string {
  switch (grade) {
    case "pass": return "Pass"
    case "marginal": return "Marginal"
    case "fail": return "Fail"
    default: return "N/A"
  }
}

function gradeStatus(grade: Grade): "pass" | "warning" | "fail" | "neutral" {
  switch (grade) {
    case "pass": return "pass"
    case "marginal": return "warning"
    case "fail": return "fail"
    default: return "neutral"
  }
}

/**
 * Collects action items from analysis results that need human attention.
 */
function collectActionItems(spec: XRaySpec): ActionItem[] {
  const items: ActionItem[] = []

  for (const m of spec.modules) {
    const analysis = m.cadModel?.analysis
    if (!analysis) continue

    // DFM failures
    if (analysis.dfm && !analysis.dfm.printable) {
      items.push({
        title: `DFM issues — ${analysis.dfm.issues?.join(", ") ?? "not printable"}`,
        severity: "warning",
        module: m.name,
      })
    }

    // Structural failures
    const s = analysis.structural
    if (s?.status === "complete" && (s.safetyFactor ?? 0) < 1.5) {
      items.push({
        title: `Safety factor ${s.safetyFactor?.toFixed(2)} below minimum 1.5`,
        severity: "critical",
        module: m.name,
      })
    }

    // Thermal exceedances
    const t = analysis.thermal
    if (t?.status === "complete" && (t.maxTemp_C ?? 0) > 80) {
      items.push({
        title: `Max temperature ${t.maxTemp_C?.toFixed(0)}°C exceeds material limit`,
        severity: "warning",
        module: m.name,
      })
    }

    // FEA errors
    if (s?.status === "error") {
      items.push({
        title: `Structural analysis failed: ${s.error ?? "unknown error"}`,
        severity: "warning",
        module: m.name,
      })
    }
  }

  // System-level convergence
  const sa = spec.systemAnalysis
  if (sa?.convergenceStatus === "max_iterations") {
    items.push({
      title: "Convergence did not complete — max iterations reached",
      severity: "critical",
    })
  }

  return items
}

/**
 * @file engineering-summary.tsx — System-level engineering analysis summary
 *
 * @description Displays aggregated engineering metrics across all modules:
 * total mass, system center of gravity, manufacturability grade,
 * convergence status, and per-module analysis overview grid.
 *
 * @related
 * - Schema: src/app/(platform)/the-forge/services/xray-schema.ts
 * - Module explorer: ./module-explorer.tsx (per-module detail)
 * - Server actions: src/actions/xray.ts (analyzeModulesAction)
 */

"use client"

import React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Scale,
  CircleDot,
  Printer,
  ShieldCheck,
  BarChart3,
  Loader2,
  FlaskConical,
  ShieldAlert,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ClipboardList,
} from "lucide-react"
import { cn } from "@/lib/utils"

import type { XRaySpec, SystemAnalysis, ModuleSpec } from "../services/xray-schema"

// ─── Props ───────────────────────────────────────────────────────────

import type { PipelineProgress, PipelineStageStatus } from "./forge-project-context"

interface EngineeringSummaryProps {
  spec: XRaySpec
  onRunAnalysis?: () => void
  isAnalyzing?: boolean
  onRunStructural?: () => void
  isRunningStructural?: boolean
  onRunConvergence?: () => void
  isRunningConvergence?: boolean
  onRunPremium?: () => void
  isRunningPremium?: boolean
  /** Full pipeline handler */
  onRunFullPipeline?: () => void
  /** Pipeline progress state */
  pipelineProgress?: PipelineProgress
  /** Create review objective from analysis results */
  onCreateReviewObjective?: () => Promise<string | null>
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * EngineeringSummary — System-level engineering analysis dashboard.
 *
 * @description Shows total mass, CG, grades, and per-module analysis
 * status. Only renders when at least one module has analysis data.
 *
 * @example
 * <EngineeringSummary
 *   spec={spec}
 *   onRunAnalysis={handleRunAnalysis}
 *   isAnalyzing={isAnalyzing}
 * />
 */
export function EngineeringSummary({
  spec,
  onRunAnalysis,
  isAnalyzing = false,
  onRunStructural,
  isRunningStructural = false,
  onRunConvergence,
  isRunningConvergence = false,
  onRunPremium,
  isRunningPremium = false,
  onRunFullPipeline,
  pipelineProgress,
  onCreateReviewObjective,
}: EngineeringSummaryProps): React.ReactNode {
  const sa = spec.systemAnalysis
  const modulesWithAnalysis = spec.modules.filter(
    (m) => m.cadModel?.analysis?.massProperties,
  )
  const modulesWithCad = spec.modules.filter(
    (m) => m.cadModel?.status === "complete",
  )

  // Don't render if no modules have CAD or analysis
  if (modulesWithCad.length === 0) return null

  const hasAnalysis = modulesWithAnalysis.length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-7 bg-international-orange rounded-full" />
          <div>
            <h2 className="text-lg font-display font-semibold tracking-tight text-foreground">
              Engineering Analysis
            </h2>
            <p className="text-xs text-muted-foreground">
              {hasAnalysis
                ? `${modulesWithAnalysis.length}/${spec.modules.length} modules analyzed`
                : "Run analysis on CAD models to see engineering metrics"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasAnalysis && (
            <Badge variant="secondary" className="text-xs">
              {modulesWithAnalysis.length} analyzed
            </Badge>
          )}
          {onRunFullPipeline && modulesWithCad.length > 0 && (
            <Button
              size="sm"
              onClick={onRunFullPipeline}
              disabled={
                pipelineProgress?.isRunning ||
                isAnalyzing || isRunningStructural || isRunningConvergence || isRunningPremium
              }
            >
              {pipelineProgress?.isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pipeline Running...
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4 mr-2" />
                  Run Full Analysis
                </>
              )}
            </Button>
          )}
          {onRunAnalysis && modulesWithCad.length > 0 && (
            <Button
              variant={hasAnalysis ? "secondary" : "default"}
              size="sm"
              onClick={onRunAnalysis}
              disabled={isAnalyzing || isRunningStructural || isRunningConvergence || isRunningPremium}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4 mr-2" />
                  {hasAnalysis ? "Re-analyze" : "Run Analysis"}
                </>
              )}
            </Button>
          )}
          {onRunStructural && hasAnalysis && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRunStructural}
              disabled={isRunningStructural || isAnalyzing || isRunningConvergence || isRunningPremium}
            >
              {isRunningStructural ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  FEA Running...
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 mr-2" />
                  Structural FEA
                </>
              )}
            </Button>
          )}
          {onRunConvergence && hasAnalysis && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRunConvergence}
              disabled={isRunningConvergence || isAnalyzing || isRunningStructural || isRunningPremium}
            >
              {isRunningConvergence ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Evaluating...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Convergence Step
                </>
              )}
            </Button>
          )}
          {onRunPremium && hasAnalysis && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRunPremium}
              disabled={isRunningPremium || isAnalyzing || isRunningStructural || isRunningConvergence}
            >
              {isRunningPremium ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Premium Analysis...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Premium Analysis
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Full Pipeline Progress Stepper */}
      {pipelineProgress && pipelineProgress.isRunning && (
        <PipelineProgressCard stages={pipelineProgress.stages} />
      )}

      {/* Pipeline complete summary — show when pipeline finished but has results */}
      {pipelineProgress && !pipelineProgress.isRunning && pipelineProgress.stages.some((s) => s.status === "complete") && (
        <PipelineCompleteCard stages={pipelineProgress.stages} onCreateReviewObjective={onCreateReviewObjective} />
      )}

      {hasAnalysis && sa && (
        <>
          {/* System metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sa.totalMass_kg !== undefined && (
              <SystemMetricCard
                label="Total Mass"
                value={formatMass(sa.totalMass_kg)}
                icon={<Scale className="h-4 w-4" />}
                accent="chart-1"
              />
            )}
            {sa.systemCenterOfGravity && (
              <SystemMetricCard
                label="System CG"
                value={`(${sa.systemCenterOfGravity[0].toFixed(1)}, ${sa.systemCenterOfGravity[1].toFixed(1)}, ${sa.systemCenterOfGravity[2].toFixed(1)})`}
                unit="mm"
                icon={<CircleDot className="h-4 w-4" />}
                accent="chart-2"
              />
            )}
            <SystemMetricCard
              label="Manufacturability"
              value={gradeLabel(sa.manufacturabilityGrade)}
              icon={<Printer className="h-4 w-4" />}
              accent={gradeAccent(sa.manufacturabilityGrade)}
              badge={sa.manufacturabilityGrade}
            />
            <SystemMetricCard
              label="Structural"
              value={gradeLabel(sa.structuralGrade)}
              icon={<ShieldCheck className="h-4 w-4" />}
              accent={gradeAccent(sa.structuralGrade)}
              badge={sa.structuralGrade}
            />
          </div>

          {/* Convergence Status Card */}
          {sa.convergenceStatus && sa.convergenceStatus !== "not_started" && (
            <ConvergenceStatusCard sa={sa} />
          )}

          {/* Per-module analysis grid */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Per-Module Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Module</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Mass</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Volume</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground text-center">DFM</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground text-center">FEA</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Safety Factor</th>
                      <th className="pb-2 font-medium text-muted-foreground text-center">Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spec.modules.map((m) => (
                      <ModuleAnalysisRow key={m.id} module={m} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatMass(kg: number): string {
  return kg >= 1 ? `${kg.toFixed(2)} kg` : `${(kg * 1000).toFixed(1)} g`
}

type Grade = "pass" | "marginal" | "fail" | "not_analyzed" | undefined

function gradeLabel(grade: Grade): string {
  switch (grade) {
    case "pass": return "Pass"
    case "marginal": return "Marginal"
    case "fail": return "Fail"
    default: return "Not analyzed"
  }
}

function gradeAccent(grade: Grade): string {
  switch (grade) {
    case "pass": return "chart-3"
    case "marginal": return "chart-4"
    case "fail": return "chart-1"
    default: return "muted-foreground"
  }
}

// ─── Sub-Components ──────────────────────────────────────────────────

function SystemMetricCard({
  label,
  value,
  unit,
  icon,
  accent,
  badge,
}: {
  label: string
  value: string
  unit?: string
  icon: React.ReactNode
  accent: string
  badge?: Grade
}): React.ReactNode {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-start justify-between">
          <div className={cn("text-muted-foreground")}>{icon}</div>
          {badge && badge !== "not_analyzed" && (
            <Badge
              variant={
                badge === "pass" ? "success"
                  : badge === "marginal" ? "warning"
                    : "destructive"
              }
              className="text-[9px]"
            >
              {gradeLabel(badge)}
            </Badge>
          )}
        </div>
        <div className="mt-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {value}
            {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ModuleAnalysisRow({ module: m }: { module: ModuleSpec }): React.ReactNode {
  const analysis = m.cadModel?.analysis
  const mp = analysis?.massProperties
  const dfm = analysis?.dfm
  const structural = analysis?.structural
  const hasCad = m.cadModel?.status === "complete"

  const sfColor = structural?.safetyFactor != null
    ? (structural.safetyFactor >= 2.0 ? "text-status-success" : structural.safetyFactor >= 1.5 ? "text-status-warning" : "text-destructive")
    : "text-muted-foreground"

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4 font-medium text-foreground">{m.name}</td>
      <td className="py-2 pr-4 text-right text-muted-foreground">
        {mp ? formatMass(mp.mass_kg) : (hasCad ? "—" : "No CAD")}
      </td>
      <td className="py-2 pr-4 text-right text-muted-foreground">
        {mp
          ? (mp.volume_mm3 >= 1_000_000
            ? `${(mp.volume_mm3 / 1_000_000).toFixed(1)} cm³`
            : `${mp.volume_mm3.toFixed(0)} mm³`)
          : "—"}
      </td>
      <td className="py-2 pr-4 text-center">
        {dfm ? (
          <Badge
            variant={dfm.printable ? "success" : "destructive"}
            className="text-[9px]"
          >
            {dfm.printable ? "OK" : "Fail"}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2 pr-4 text-center">
        {structural ? (
          structural.status === "running" ? (
            <Loader2 className="h-3 w-3 animate-spin text-chart-2 mx-auto" />
          ) : structural.status === "complete" ? (
            <Badge
              variant={
                (structural.safetyFactor ?? 0) >= 2.0
                  ? "success"
                  : (structural.safetyFactor ?? 0) >= 1.5
                    ? "warning"
                    : "destructive"
              }
              className="text-[9px]"
            >
              {(structural.safetyFactor ?? 0) >= 1.5 ? "Pass" : "Fail"}
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[9px]">Err</Badge>
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2 pr-4 text-right">
        {structural?.safetyFactor != null ? (
          <span className={cn("font-mono font-semibold tabular-nums", sfColor)}>
            {structural.safetyFactor.toFixed(2)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2 text-center">
        {(() => {
          const premiumCount = [
            analysis?.emiShielding?.status === "complete",
            analysis?.fatigue?.status === "complete",
            analysis?.impact?.status === "complete",
          ].filter(Boolean).length
          if (premiumCount === 0) return <span className="text-muted-foreground">—</span>
          return (
            <Badge
              variant={premiumCount === 3 ? "success" : "info"}
              className="text-[9px]"
            >
              {premiumCount}/3
            </Badge>
          )
        })()}
      </td>
    </tr>
  )
}

// ─── Pipeline Progress Cards ─────────────────────────────────────────

const STAGE_ICONS: Record<string, React.ElementType> = {
  mass_dfm: Scale,
  structural: ShieldAlert,
  thermal: FlaskConical,
  topology: BarChart3,
  convergence: RotateCcw,
}

/**
 * PipelineProgressCard — Shows real-time progress of the full pipeline.
 * Renders a horizontal stepper with stage status indicators.
 */
function PipelineProgressCard({ stages }: { stages: PipelineStageStatus[] }): React.ReactNode {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center gap-2 mb-3">
          <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
          <p className="text-sm font-semibold text-foreground">Full Engineering Analysis Running</p>
        </div>
        <div className="flex items-center gap-1">
          {stages.map((stage, idx) => {
            const Icon = STAGE_ICONS[stage.id] ?? FlaskConical
            return (
              <React.Fragment key={stage.id}>
                {idx > 0 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 min-w-4",
                      stage.status === "complete" ? "bg-international-orange"
                        : stage.status === "error" ? "bg-destructive"
                          : "bg-muted",
                    )}
                  />
                )}
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium whitespace-nowrap",
                    stage.status === "running" && "bg-orange-50 text-international-orange",
                    stage.status === "complete" && "bg-orange-50/50 text-international-orange",
                    stage.status === "error" && "bg-status-error-light text-destructive",
                    stage.status === "pending" && "text-muted-foreground",
                  )}
                >
                  {stage.status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : stage.status === "complete" ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : stage.status === "error" ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{stage.label}</span>
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * PipelineCompleteCard — Summary shown after pipeline finishes.
 * Shows which stages passed/failed with a compact overview and
 * an option to create review tasks in the task system.
 */
function PipelineCompleteCard({
  stages,
  onCreateReviewObjective,
}: {
  stages: PipelineStageStatus[]
  onCreateReviewObjective?: () => Promise<string | null>
}): React.ReactNode {
  const [isCreating, setIsCreating] = React.useState(false)
  const [created, setCreated] = React.useState(false)
  const completed = stages.filter((s) => s.status === "complete").length
  const failed = stages.filter((s) => s.status === "error").length
  const total = stages.length

  const handleCreateReview = async (): Promise<void> => {
    if (!onCreateReviewObjective) return
    setIsCreating(true)
    try {
      const objId = await onCreateReviewObjective()
      if (objId) setCreated(true)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {failed === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-status-success" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-status-warning" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">
                Pipeline Complete — {completed}/{total} stages passed
              </p>
              {failed > 0 && (
                <p className="text-xs text-muted-foreground">
                  {failed} stage{failed > 1 ? "s" : ""} had errors
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className={cn(
                    "h-2 w-8 rounded-full",
                    stage.status === "complete" && "bg-international-orange",
                    stage.status === "error" && "bg-destructive",
                    stage.status === "pending" && "bg-muted",
                    stage.status === "skipped" && "bg-muted",
                  )}
                  title={`${stage.label}: ${stage.status}${stage.error ? ` — ${stage.error}` : ""}`}
                />
              ))}
            </div>
            {onCreateReviewObjective && !created && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCreateReview}
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                    Create Review Tasks
                  </>
                )}
              </Button>
            )}
            {created && (
              <Badge variant="success" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Review Created
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Convergence Status Card ─────────────────────────────────────────

/**
 * ConvergenceStatusCard — Shows the current state of the convergence loop.
 * Displays iteration count, status, and history summary.
 */
function ConvergenceStatusCard({ sa }: { sa: SystemAnalysis }): React.ReactNode {
  const statusConfig = {
    running: { icon: Loader2, label: "Running", color: "text-chart-2", animate: true },
    converged: { icon: CheckCircle2, label: "Converged", color: "text-status-success", animate: false },
    max_iterations: { icon: AlertTriangle, label: "Max Iterations Reached", color: "text-status-warning", animate: false },
    needs_review: { icon: Zap, label: "Needs Review", color: "text-status-info", animate: false },
    not_started: { icon: RotateCcw, label: "Not Started", color: "text-muted-foreground", animate: false },
  }

  const config = statusConfig[sa.convergenceStatus ?? "not_started"]
  const Icon = config.icon

  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className={cn("h-5 w-5", config.color, config.animate && "animate-spin")} />
            <div>
              <p className="text-sm font-semibold text-foreground">{config.label}</p>
              <p className="text-xs text-muted-foreground">
                Iteration {sa.iterationCount ?? 0} of {sa.maxIterations ?? 10}
              </p>
            </div>
          </div>
          {sa.convergenceCriteria && sa.convergenceCriteria.length > 0 && (
            <div className="flex items-center gap-2">
              {sa.convergenceCriteria.map((c, i) => (
                <Badge
                  key={i}
                  variant={c.met ? "success" : "secondary"}
                  className="text-[9px]"
                >
                  {c.metric}: {c.met ? "Met" : `${c.currentValue?.toFixed(2) ?? "?"} / ${c.threshold}`}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Iteration history summary */}
        {sa.iterationHistory && sa.iterationHistory.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Iteration History
            </p>
            {sa.iterationHistory.slice(-5).map((iter, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span>Iter {iter.iteration}</span>
                <div className="flex items-center gap-3">
                  <span>
                    {iter.criteriaMetCount}/{iter.criteriaTotalCount} criteria met
                  </span>
                  {iter.changesApplied.length > 0 && (
                    <Badge variant="secondary" className="text-[9px]">
                      {iter.changesApplied.length} changes
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * @file engineering-summary.tsx — System-level engineering analysis summary
 *
 * @description Displays aggregated engineering metrics across all modules:
 * total mass, system center of gravity, manufacturability grade,
 * convergence status, and per-module analysis overview grid.
 *
 * Rich hover explanations help users understand what each analysis does
 * and why it matters. Celebratory copy and visual polish create delight.
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
import { EmptyState } from "@/components/ui/empty-state"
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
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
  Info,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

import type { XRaySpec, SystemAnalysis, ModuleSpec } from "../services/xray-schema"

// ─── Explanatory Content ─────────────────────────────────────────────
// All user-facing descriptions live here for easy editing and future i18n.

const ANALYSIS_EXPLANATIONS = {
  // Action buttons
  runFullAnalysis: {
    title: "Full Engineering Pipeline",
    description:
      "Runs the complete engineering analysis: mass properties, manufacturability checks, structural stress testing, and design convergence — all in one go.",
    detail:
      "Like having a full engineering review in minutes instead of weeks. Each stage feeds into the next for a comprehensive picture of your design.",
  },
  reAnalyze: {
    title: "Re-run Mass & DFM Analysis",
    description:
      "Re-calculates mass properties and Design for Manufacturing checks on all modules with completed CAD models.",
    detail:
      "Use this after making design changes to get updated weight, volume, center of gravity, and printability results.",
  },
  structuralFea: {
    title: "Structural Stress Testing (FEA)",
    description:
      "Finite Element Analysis simulates real-world forces on your design — gravity, pressure, user loads. It finds weak spots and stress concentrations before you build anything.",
    detail:
      "Returns a safety factor for each module: above 2.0 is rock-solid, 1.5–2.0 is adequate, below 1.5 needs redesign. This is the same analysis method used by aerospace and automotive engineers.",
  },
  convergenceStep: {
    title: "AI Design Optimizer",
    description:
      "Evaluates your current analysis results against engineering criteria — safety margins, deformation limits, manufacturability — and proposes specific design improvements.",
    detail:
      "Iterates automatically until all criteria are met or suggests changes for your review. Think of it as an AI engineering co-pilot refining your design.",
  },
  premiumAnalysis: {
    title: "Premium Specialist Tests",
    description:
      "Three advanced analyses that go beyond basic structural checks:",
    bullets: [
      "EMI Shielding — Will electronics cause interference? Tests electromagnetic shielding effectiveness.",
      "Fatigue Life — How many stress cycles before failure? Predicts long-term durability.",
      "Impact Resistance — Can it survive drops and crashes? Estimates energy absorption capacity.",
    ],
    detail:
      "The kind of specialist analysis that typically costs thousands at an engineering consultancy. Included in your pipeline.",
  },

  // Metric cards
  totalMass: {
    title: "Total System Mass",
    description:
      "Combined weight of all analyzed modules. Critical for shipping costs, material costs, and the overall user experience of holding and using your product.",
  },
  systemCG: {
    title: "Center of Gravity",
    description:
      "The balance point of your entire design. A CG far from the geometric center means the product may feel tippy, unbalanced, or awkward to hold.",
    detail:
      "Coordinates are in millimeters relative to the model origin. Closer to (0, 0, 0) is generally better for symmetrical products.",
  },
  manufacturability: {
    title: "Manufacturability Check",
    description:
      "Can this actually be built? Analyzes your design for 3D-printability issues: overhangs, thin walls, unsupported features, and material constraints.",
    detail:
      "Pass = ready to print with no critical issues. Marginal = printable with warnings. Fail = has critical issues that need design changes before manufacturing.",
  },
  structural: {
    title: "Structural Integrity",
    description:
      "Overall structural health across all modules, based on FEA stress analysis. Tells you whether your design will hold up under expected real-world loads.",
    detail:
      "Pass = all modules meet safety factor requirements. Fail = one or more modules have concerning stress levels. Run Structural FEA for detailed results.",
  },

  // Table column headers
  columns: {
    mass: "Weight of this module. Affects total product weight, material cost, and shipping.",
    volume: "Physical volume of the part. Relates to material usage and print time.",
    dfm: "Design for Manufacturing — checks if this module can be 3D printed without critical issues like unsupported overhangs or walls that are too thin.",
    fea: "Finite Element Analysis result — simulates structural loads and checks if the part can handle expected forces without failing.",
    safetyFactor:
      "How much stronger the part is than it needs to be. Above 2.0 is excellent, 1.5–2.0 is adequate, below 1.5 is risky.",
    premium:
      "Specialist tests completed: EMI shielding, fatigue life, and impact resistance. Shows how many of the 3 premium tests have results.",
  },
} as const

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
 * status. Rich hover explanations on every button and metric help users
 * understand what each analysis does and why they should care.
 * Only renders when at least one module has CAD data.
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

  // Show empty state when no modules have CAD models generated yet
  if (modulesWithCad.length === 0) {
    return (
      <EmptyState
        icon={<FlaskConical className="h-10 w-10" />}
        title="No CAD models to analyze"
        description="Generate CAD models for your modules first. Once at least one module has a completed CAD model, you can run engineering analysis here."
      />
    )
  }

  const hasAnalysis = modulesWithAnalysis.length > 0
  const allModulesAnalyzed = modulesWithAnalysis.length === spec.modules.length
  const anyBusy = isAnalyzing || isRunningStructural || isRunningConvergence || isRunningPremium

  // Determine if all grades are passing for the celebration banner
  const allPassing =
    hasAnalysis &&
    sa?.manufacturabilityGrade === "pass" &&
    sa?.structuralGrade === "pass"

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
                ? allModulesAnalyzed
                  ? `All ${spec.modules.length} modules analyzed — your design is fully evaluated`
                  : `${modulesWithAnalysis.length} of ${spec.modules.length} modules analyzed — your design is taking shape`
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
            <AnalysisHoverCard
              title={ANALYSIS_EXPLANATIONS.runFullAnalysis.title}
              description={ANALYSIS_EXPLANATIONS.runFullAnalysis.description}
              detail={ANALYSIS_EXPLANATIONS.runFullAnalysis.detail}
            >
              <Button
                size="sm"
                onClick={onRunFullPipeline}
                disabled={pipelineProgress?.isRunning || anyBusy}
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
            </AnalysisHoverCard>
          )}
          {onRunAnalysis && modulesWithCad.length > 0 && (
            <AnalysisHoverCard
              title={ANALYSIS_EXPLANATIONS.reAnalyze.title}
              description={ANALYSIS_EXPLANATIONS.reAnalyze.description}
              detail={ANALYSIS_EXPLANATIONS.reAnalyze.detail}
            >
              <Button
                variant={hasAnalysis ? "secondary" : "default"}
                size="sm"
                onClick={onRunAnalysis}
                disabled={anyBusy}
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
            </AnalysisHoverCard>
          )}
          {onRunStructural && hasAnalysis && (
            <AnalysisHoverCard
              title={ANALYSIS_EXPLANATIONS.structuralFea.title}
              description={ANALYSIS_EXPLANATIONS.structuralFea.description}
              detail={ANALYSIS_EXPLANATIONS.structuralFea.detail}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={onRunStructural}
                disabled={anyBusy}
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
            </AnalysisHoverCard>
          )}
          {onRunConvergence && hasAnalysis && (
            <AnalysisHoverCard
              title={ANALYSIS_EXPLANATIONS.convergenceStep.title}
              description={ANALYSIS_EXPLANATIONS.convergenceStep.description}
              detail={ANALYSIS_EXPLANATIONS.convergenceStep.detail}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={onRunConvergence}
                disabled={anyBusy}
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
            </AnalysisHoverCard>
          )}
          {onRunPremium && hasAnalysis && (
            <PremiumAnalysisHoverCard>
              <Button
                variant="secondary"
                size="sm"
                onClick={onRunPremium}
                disabled={anyBusy}
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
            </PremiumAnalysisHoverCard>
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

      {/* All-passing celebration banner */}
      {allPassing && (
        <Card className="border-status-success bg-status-success-light/30">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-status-success-light">
                <Sparkles className="h-4 w-4 text-status-success" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  All systems go — your design meets engineering standards
                </p>
                <p className="text-xs text-muted-foreground">
                  Manufacturability and structural checks are both passing. Your design is ready for the next stage.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasAnalysis && sa && (
        <>
          {/* System metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sa.totalMass_kg !== undefined && (
              <AnalysisHoverCard
                title={ANALYSIS_EXPLANATIONS.totalMass.title}
                description={ANALYSIS_EXPLANATIONS.totalMass.description}
              >
                <div>
                  <SystemMetricCard
                    label="Total Mass"
                    value={formatMass(sa.totalMass_kg)}
                    icon={<Scale className="h-4 w-4" />}
                    accent="chart-1"
                  />
                </div>
              </AnalysisHoverCard>
            )}
            {sa.systemCenterOfGravity && (
              <AnalysisHoverCard
                title={ANALYSIS_EXPLANATIONS.systemCG.title}
                description={ANALYSIS_EXPLANATIONS.systemCG.description}
                detail={ANALYSIS_EXPLANATIONS.systemCG.detail}
              >
                <div>
                  <SystemMetricCard
                    label="System CG"
                    value={`(${sa.systemCenterOfGravity[0].toFixed(1)}, ${sa.systemCenterOfGravity[1].toFixed(1)}, ${sa.systemCenterOfGravity[2].toFixed(1)})`}
                    unit="mm"
                    icon={<CircleDot className="h-4 w-4" />}
                    accent="chart-2"
                  />
                </div>
              </AnalysisHoverCard>
            )}
            <AnalysisHoverCard
              title={ANALYSIS_EXPLANATIONS.manufacturability.title}
              description={ANALYSIS_EXPLANATIONS.manufacturability.description}
              detail={ANALYSIS_EXPLANATIONS.manufacturability.detail}
            >
              <div>
                <SystemMetricCard
                  label="Manufacturability"
                  value={gradeLabel(sa.manufacturabilityGrade)}
                  icon={<Printer className="h-4 w-4" />}
                  accent={gradeAccent(sa.manufacturabilityGrade)}
                  badge={sa.manufacturabilityGrade}
                  hint={gradeHint(sa.manufacturabilityGrade)}
                />
              </div>
            </AnalysisHoverCard>
            <AnalysisHoverCard
              title={ANALYSIS_EXPLANATIONS.structural.title}
              description={ANALYSIS_EXPLANATIONS.structural.description}
              detail={ANALYSIS_EXPLANATIONS.structural.detail}
            >
              <div>
                <SystemMetricCard
                  label="Structural"
                  value={gradeLabel(sa.structuralGrade)}
                  icon={<ShieldCheck className="h-4 w-4" />}
                  accent={gradeAccent(sa.structuralGrade)}
                  badge={sa.structuralGrade}
                  hint={gradeHint(sa.structuralGrade)}
                />
              </div>
            </AnalysisHoverCard>
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
                      <ColumnHeaderWithTooltip label="Mass" align="right" tooltip={ANALYSIS_EXPLANATIONS.columns.mass} />
                      <ColumnHeaderWithTooltip label="Volume" align="right" tooltip={ANALYSIS_EXPLANATIONS.columns.volume} />
                      <ColumnHeaderWithTooltip label="DFM" align="center" tooltip={ANALYSIS_EXPLANATIONS.columns.dfm} />
                      <ColumnHeaderWithTooltip label="FEA" align="center" tooltip={ANALYSIS_EXPLANATIONS.columns.fea} />
                      <ColumnHeaderWithTooltip label="Safety Factor" align="right" tooltip={ANALYSIS_EXPLANATIONS.columns.safetyFactor} />
                      <ColumnHeaderWithTooltip label="Premium" align="center" tooltip={ANALYSIS_EXPLANATIONS.columns.premium} last />
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

/**
 * formatMass — Formats a mass value in kg to a human-readable string.
 * Uses grams for values under 1 kg.
 */
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

/** Returns a short contextual note for the metric card based on grade. */
function gradeHint(grade: Grade): string | undefined {
  switch (grade) {
    case "pass": return "Meets all requirements"
    case "marginal": return "Printable with warnings"
    case "fail": return "Needs design changes"
    default: return undefined
  }
}

/** Returns a border-top color class for the metric card accent bar. */
function gradeBorderColor(grade: Grade): string {
  switch (grade) {
    case "pass": return "border-t-status-success"
    case "marginal": return "border-t-status-warning"
    case "fail": return "border-t-destructive"
    default: return "border-t-muted"
  }
}

/** Determines overall row status for the left-border indicator. */
function getModuleRowStatus(m: ModuleSpec): "pass" | "fail" | "partial" | "none" {
  const analysis = m.cadModel?.analysis
  if (!analysis?.massProperties) return "none"

  const dfmOk = analysis.dfm?.printable
  const feaOk = analysis.structural?.status === "complete" && (analysis.structural.safetyFactor ?? 0) >= 1.5
  const hasStructural = analysis.structural?.status === "complete"

  if (dfmOk && feaOk) return "pass"
  if (dfmOk === false || (hasStructural && !feaOk)) return "fail"
  return "partial"
}

// ─── Hover Explanation Components ────────────────────────────────────

/**
 * AnalysisHoverCard — Reusable wrapper that shows a rich explanation on hover.
 *
 * @description Used on action buttons and metric cards to explain what each
 * analysis type does and why the user should care.
 */
function AnalysisHoverCard({
  children,
  title,
  description,
  detail,
}: {
  children: React.ReactNode
  title: string
  description: string
  detail?: string
}): React.ReactNode {
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-80" align="start" side="bottom">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          {detail && (
            <p className="text-xs leading-relaxed text-muted-foreground border-t pt-2 mt-2">
              {detail}
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

/**
 * PremiumAnalysisHoverCard — Special hover card for Premium Analysis with bullet list.
 *
 * @description Shows the three sub-analyses (EMI, Fatigue, Impact) as a
 * structured list so users understand the value they're getting.
 */
function PremiumAnalysisHoverCard({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const info = ANALYSIS_EXPLANATIONS.premiumAnalysis
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-80" align="start" side="bottom">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{info.title}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{info.description}</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {info.bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-international-orange shrink-0" />
                <span className="leading-relaxed">{bullet}</span>
              </li>
            ))}
          </ul>
          {info.detail && (
            <p className="text-xs leading-relaxed text-muted-foreground border-t pt-2 mt-2">
              {info.detail}
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

/**
 * ColumnHeaderWithTooltip — Table column header with an info icon and tooltip.
 *
 * @description Adds a small info icon next to column labels that shows
 * a plain-English explanation on hover.
 */
function ColumnHeaderWithTooltip({
  label,
  tooltip,
  align = "left",
  last = false,
}: {
  label: string
  tooltip: string
  align?: "left" | "center" | "right"
  last?: boolean
}): React.ReactNode {
  const alignClass =
    align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"

  return (
    <th className={cn("pb-2 font-medium text-muted-foreground", alignClass, !last && "pr-4")}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help">
            {label}
            <Info className="h-3 w-3 text-muted-foreground/60" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px]">
          <p className="text-xs leading-relaxed">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </th>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────

/**
 * SystemMetricCard — Displays a single system-level metric with
 * colored accent bar, grade badge, and optional contextual hint.
 */
function SystemMetricCard({
  label,
  value,
  unit,
  icon,
  accent,
  badge,
  hint,
}: {
  label: string
  value: string
  unit?: string
  icon: React.ReactNode
  accent: string
  badge?: Grade
  hint?: string
}): React.ReactNode {
  return (
    <Card className={cn(
      "transition-shadow hover:shadow-md cursor-default",
      badge ? `border-t-2 ${gradeBorderColor(badge)}` : "border-t-2 border-t-muted",
    )}>
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
          {hint && (
            <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * ModuleAnalysisRow — Table row for a single module showing analysis results.
 * Includes a left-border color indicator: green for all-pass, orange for issues.
 */
function ModuleAnalysisRow({ module: m }: { module: ModuleSpec }): React.ReactNode {
  const analysis = m.cadModel?.analysis
  const mp = analysis?.massProperties
  const dfm = analysis?.dfm
  const structural = analysis?.structural
  const hasCad = m.cadModel?.status === "complete"
  const rowStatus = getModuleRowStatus(m)

  const sfColor = structural?.safetyFactor != null
    ? (structural.safetyFactor >= 2.0 ? "text-status-success" : structural.safetyFactor >= 1.5 ? "text-status-warning" : "text-destructive")
    : "text-muted-foreground"

  const rowBorderClass =
    rowStatus === "pass" ? "border-l-2 border-l-status-success"
      : rowStatus === "fail" ? "border-l-2 border-l-international-orange"
        : ""

  return (
    <tr className={cn("border-b last:border-0", rowBorderClass)}>
      <td className="py-2 pr-4 font-medium text-foreground pl-2">{m.name}</td>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("font-mono font-semibold tabular-nums cursor-help", sfColor)}>
                {structural.safetyFactor.toFixed(2)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p className="text-xs">
                {structural.safetyFactor >= 2.0
                  ? "Excellent — well above minimum"
                  : structural.safetyFactor >= 1.5
                    ? "Adequate — meets minimum threshold"
                    : "Below safe threshold of 1.5"}
              </p>
            </TooltipContent>
          </Tooltip>
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
 * Shows which stages passed/failed with a compact overview,
 * celebratory messaging when all pass, and an option to create
 * review tasks in the task system.
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
  const allPassed = failed === 0 && completed === total

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
    <Card className={allPassed ? "border-status-success" : undefined}>
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {allPassed ? (
              <div className="flex items-center justify-center h-9 w-9 rounded-full bg-status-success-light">
                <CheckCircle2 className="h-5 w-5 text-status-success" />
              </div>
            ) : failed === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-status-success" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-status-warning" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">
                {allPassed
                  ? "Engineering Review Complete — All Clear"
                  : `Pipeline Complete — ${completed}/${total} stages passed`}
              </p>
              <p className="text-xs text-muted-foreground">
                {allPassed
                  ? "Every stage passed. Your design is engineering-validated and ready to move forward."
                  : failed > 0
                    ? `${failed} stage${failed > 1 ? "s" : ""} had errors — review results below`
                    : "Analysis complete — review the results below"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {stages.map((stage) => (
                <Tooltip key={stage.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "h-2 w-8 rounded-full cursor-help",
                        stage.status === "complete" && "bg-international-orange",
                        stage.status === "error" && "bg-destructive",
                        stage.status === "pending" && "bg-muted",
                        stage.status === "skipped" && "bg-muted",
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs font-medium">{stage.label}: {stage.status}</p>
                    {stage.error && <p className="text-xs text-muted-foreground">{stage.error}</p>}
                  </TooltipContent>
                </Tooltip>
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
    running: { icon: Loader2, label: "Optimizing Your Design", color: "text-chart-2", animate: true },
    converged: { icon: CheckCircle2, label: "Design Converged — All Criteria Met", color: "text-status-success", animate: false },
    max_iterations: { icon: AlertTriangle, label: "Max Iterations Reached — Review Needed", color: "text-status-warning", animate: false },
    needs_review: { icon: Zap, label: "Needs Your Review", color: "text-status-info", animate: false },
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
                {sa.convergenceStatus === "converged" && " — no further changes needed"}
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

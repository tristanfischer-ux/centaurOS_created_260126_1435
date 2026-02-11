/**
 * @file executive-dashboard.tsx — At-a-glance metrics grid
 *
 * @description Compact 6-card grid showing key metrics derived from
 * the XRaySpec: module count, critical path, risk count, completion %,
 * estimated cost, and gating status.
 */

"use client"

import React, { useMemo } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Box,
  Clock,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ShieldCheck,
  Target,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { ForgeInfoTip, FORGE_EXPLANATIONS } from "./forge-hover-explanations"
import type { XRaySpec, ModuleSpec } from "../services/xray-schema"

// ─── Helpers ─────────────────────────────────────────────────────────

function findGatingModule(modules: ModuleSpec[]): ModuleSpec | undefined {
  return modules.find((m) => m.isGatingModule) ?? modules.find((m) => m.id === "react")
}

function isGatingDiagComplete(spec: XRaySpec): boolean {
  const gating = findGatingModule(spec.modules)
  if (!gating) return true
  return !!gating.diagnostic?.derivedProcessClass
}

interface DashboardMetrics {
  moduleCount: number
  criticalPathWeeks: number
  totalRisks: number
  totalUnknowns: number
  completionPct: number
  estimatedCost: number
  gatingComplete: boolean
  gatingModuleName: string | null
}

function computeMetrics(spec: XRaySpec): DashboardMetrics {
  const modules = spec.modules || []
  const moduleCount = modules.length

  // Critical path = max lead time across all modules
  const criticalPathWeeks = modules.reduce((max, m) => Math.max(max, m.requirements.leadWeeks), 0)

  // Aggregate risks
  let totalRisks = 0
  let totalUnknowns = 0
  for (const m of modules) {
    totalRisks += m.detail.commonFailureModes.length + (m.diagnostic?.derivedRisks?.length ?? 0)
    totalUnknowns += m.detail.unknownsToResolve.length
  }

  // Completion = % of expert questions answered
  let answeredTotal = 0
  let questionsTotal = 0
  for (const m of modules) {
    const answers = m.interview?.answers || {}
    const answered = Object.keys(answers).filter((k) => String(answers[k] || "").trim()).length
    answeredTotal += answered
    questionsTotal += m.detail.expertQuestions.length
  }
  const completionPct = questionsTotal === 0 ? 0 : Math.round((answeredTotal / questionsTotal) * 100)

  // Estimated cost
  const estimatedCost = modules.reduce((sum, m) => sum + (m.estCost ?? 0), 0)

  // Gating
  const gating = findGatingModule(modules)
  const gatingComplete = isGatingDiagComplete(spec)

  return {
    moduleCount,
    criticalPathWeeks,
    totalRisks,
    totalUnknowns,
    completionPct,
    estimatedCost,
    gatingComplete,
    gatingModuleName: gating?.name ?? null,
  }
}

// ─── Props ───────────────────────────────────────────────────────────

interface ExecutiveDashboardProps {
  spec: XRaySpec
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * ExecutiveDashboard — 6 metric cards for at-a-glance understanding.
 *
 * @description Shows module count, critical path, risk count,
 * completion %, cost estimate, and gating diagnostic status.
 */
export function ExecutiveDashboard({ spec }: ExecutiveDashboardProps): React.ReactNode {
  const m = useMemo(() => computeMetrics(spec), [spec])

  const cards = [
    {
      label: "Modules",
      value: String(m.moduleCount),
      sub: "sub-assemblies",
      icon: Box,
      color: "text-chart-1",
      bg: "bg-chart-1/10",
      tip: "The number of distinct physical sub-assemblies that make up your product. Each module is independently designable and procurable.",
    },
    {
      label: "Critical Path",
      value: `${m.criticalPathWeeks}w`,
      sub: "longest lead time",
      icon: Clock,
      color: "text-chart-2",
      bg: "bg-chart-2/10",
      tip: FORGE_EXPLANATIONS.criticalPath.description,
    },
    {
      label: "Risks",
      value: String(m.totalRisks),
      sub: `+ ${m.totalUnknowns} unknowns`,
      icon: AlertTriangle,
      color: "text-status-warning",
      bg: "bg-status-warning-light",
      tip: "Total known failure modes plus open unknowns across all modules. Higher numbers mean more items to review and mitigate before manufacturing.",
    },
    {
      label: "Readiness",
      value: `${m.completionPct}%`,
      sub: "expert questions answered",
      icon: CheckCircle2,
      color: m.completionPct === 100 ? "text-status-success" : "text-chart-2",
      bg: m.completionPct === 100 ? "bg-status-success-light" : "bg-chart-2/10",
      tip: "Percentage of expert questions answered across all modules. 100% means the design is fully specified — supplier quotes will be accurate.",
    },
    {
      label: "Est. Cost",
      value: m.estimatedCost > 0 ? `£${Math.round(m.estimatedCost).toLocaleString()}` : "—",
      sub: m.estimatedCost > 0 ? "total estimate" : "not estimated",
      icon: DollarSign,
      color: "text-chart-4",
      bg: "bg-chart-4/10",
      tip: "Sum of cost estimates across all modules. Becomes more accurate as you complete diagnostics and assign suppliers.",
    },
    {
      label: "Gating",
      value: m.gatingComplete ? "Set" : "Needed",
      sub: m.gatingModuleName ? `${m.gatingModuleName}` : "no gating module",
      icon: ShieldCheck,
      color: m.gatingComplete ? "text-status-success" : "text-status-warning",
      bg: m.gatingComplete ? "bg-status-success-light" : "bg-status-warning-light",
      tip: FORGE_EXPLANATIONS.gatingModule.description,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-chart-2 rounded-full" />
        <h2 className="text-base font-display font-semibold text-foreground tracking-tight">
          Executive Summary
        </h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.label} className="rounded-xl shadow-sm">
              <CardContent className="pt-4 pb-4 space-y-2">
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", card.bg)}>
                  <Icon className={cn("h-4.5 w-4.5", card.color)} />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold text-foreground tabular-nums leading-none">
                    {card.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 font-medium inline-flex items-center gap-1">
                    {card.label}
                    <ForgeInfoTip text={card.tip} />
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {card.sub}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Bridge action: Create objectives from X-Ray modules */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          variant="outline"
          size="sm"
          disabled
          className="rounded-full opacity-60"
          title="Coming soon — create Objectives & Tasks from each module"
        >
          <Target className="h-3.5 w-3.5 mr-1.5" />
          Create Objectives from X-Ray
        </Button>
        <span className="text-xs text-muted-foreground">
          Coming soon — auto-generate Objectives & Tasks from module specs
        </span>
      </div>
    </div>
  )
}

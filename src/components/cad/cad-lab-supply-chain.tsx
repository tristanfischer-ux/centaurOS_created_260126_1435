/**
 * @file cad-lab-supply-chain.tsx — Supply chain overview for CAD Lab.
 *
 * @description Shows per-module manufacturing requirements derived from
 * diagnostic answers and CAD results. For each module, displays the
 * manufacturing process, material, and key specifications that a supplier
 * would need to quote on. Designed to feed into RFQ generation.
 *
 * @component
 *
 * @example
 * <CadLabSupplyChain modules={modules} diagnosticAnswers={diagnosticAnswers} />
 */

"use client"

import { useMemo } from "react"
import {
  Factory,
  Box,
  CheckCircle2,
  AlertTriangle,
  Ruler,
  Scale,
  Clock,
  Package,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"

// ─── Types ──────────────────────────────────────────────────────────

interface CadLabSupplyChainProps {
  /** Array of decomposed modules */
  modules: CadLabModule[]
  /** Diagnostic answers per module */
  diagnosticAnswers?: DiagnosticAnswers
}

/** Manufacturing specification for a single module */
interface ModuleSupplySpec {
  module: CadLabModule
  /** Manufacturing process (from diagnostics) */
  process: string | null
  /** Material (from diagnostics) */
  material: string | null
  /** Tolerance class (from diagnostics) */
  tolerance: string | null
  /** Surface finish (from diagnostics) */
  finish: string | null
  /** Batch size (from diagnostics) */
  batchSize: string | null
  /** Environment (from diagnostics) */
  environment: string | null
  /** Dimensions from CAD result */
  dimensions: string | null
  /** Mass from CAD result */
  massG: number | null
  /** Whether printable (from DFM) */
  printable: boolean | null
  /** Estimated print time (from DFM) */
  printTimeMin: number | null
  /** Number of DFM issues */
  dfmIssueCount: number
  /** Readiness level (0-3: none, partial, mostly, full) */
  readiness: number
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Builds a supply specification for each module from diagnostics and CAD data.
 *
 * @param modules - Project modules
 * @param diagnosticAnswers - Diagnostic answers per module
 * @returns Array of module supply specs
 */
function buildSupplySpecs(
  modules: CadLabModule[],
  diagnosticAnswers?: DiagnosticAnswers
): ModuleSupplySpec[] {
  return modules.map((mod) => {
    const diag = diagnosticAnswers?.[mod.id] || {}
    const r = mod.result

    // Readiness score: 1 point for diagnostics, 1 for CAD, 1 for DFM
    let readiness = 0
    if (Object.keys(diag).length >= 6) readiness++ // Full diagnostics
    if (mod.status === "generated") readiness++ // CAD generated
    if (r?.dfm) readiness++ // DFM available

    return {
      module: mod,
      process: diag.mfg_process || null,
      material: diag.material || null,
      tolerance: diag.tolerance || null,
      finish: diag.finish || null,
      batchSize: diag.batch_size || null,
      environment: diag.environment || null,
      dimensions: r?.bbox
        ? `${r.bbox.xLen.toFixed(0)}×${r.bbox.yLen.toFixed(0)}×${r.bbox.zLen.toFixed(0)} mm`
        : null,
      massG: r?.massGrams ?? null,
      printable: r?.dfm?.printable ?? null,
      printTimeMin: r?.dfm?.estimatedPrintTimeMin ?? null,
      dfmIssueCount: r?.dfm?.issues?.length ?? 0,
      readiness,
    }
  })
}

/**
 * Returns readiness label and color classes.
 */
function getReadinessInfo(level: number): {
  label: string
  textColor: string
  bgColor: string
} {
  switch (level) {
    case 3:
      return {
        label: "Ready to quote",
        textColor: "text-status-success",
        bgColor: "bg-status-success-light",
      }
    case 2:
      return {
        label: "Mostly ready",
        textColor: "text-status-info",
        bgColor: "bg-status-info-light",
      }
    case 1:
      return {
        label: "Partial",
        textColor: "text-status-warning",
        bgColor: "bg-status-warning-light",
      }
    default:
      return {
        label: "Not ready",
        textColor: "text-muted-foreground",
        bgColor: "bg-muted",
      }
  }
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * CadLabSupplyChain — per-module manufacturing requirements overview.
 *
 * @description Shows what a supplier needs to quote each module:
 * process, material, tolerances, dimensions, batch size.
 * Readiness indicator shows how much info is available.
 */
export function CadLabSupplyChain({
  modules,
  diagnosticAnswers,
}: CadLabSupplyChainProps): React.ReactNode {
  const specs = useMemo(
    () => buildSupplySpecs(modules, diagnosticAnswers),
    [modules, diagnosticAnswers]
  )

  const readyCount = specs.filter((s) => s.readiness >= 3).length
  const partialCount = specs.filter(
    (s) => s.readiness > 0 && s.readiness < 3
  ).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Factory className="h-4 w-4" />
          Supply Chain Requirements
          <span className="text-xs font-normal text-muted-foreground">
            {readyCount}/{modules.length} ready to quote
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Manufacturing specifications per module, derived from diagnostics and
          CAD analysis. Complete diagnostics and generate CAD for best supplier
          matching.
        </p>

        {/* Readiness summary */}
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
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">
            <Package className="h-3 w-3" />
            {modules.length} total
          </div>
        </div>

        {/* Per-module supply specs */}
        <div className="space-y-3">
          {specs.map((spec) => {
            const readiness = getReadinessInfo(spec.readiness)

            return (
              <div
                key={spec.module.id}
                className="border rounded-lg p-4 space-y-3"
              >
                {/* Module header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Box className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      {spec.module.name}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium px-2 py-0.5 rounded-full",
                      readiness.bgColor,
                      readiness.textColor
                    )}
                  >
                    {readiness.label}
                  </span>
                </div>

                {/* Spec grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <SpecItem
                    label="Process"
                    value={spec.process}
                    icon={<Factory className="h-3 w-3" />}
                  />
                  <SpecItem
                    label="Material"
                    value={spec.material}
                    icon={<FlaskIcon />}
                  />
                  <SpecItem
                    label="Tolerance"
                    value={spec.tolerance}
                    icon={<Ruler className="h-3 w-3" />}
                  />
                  <SpecItem
                    label="Finish"
                    value={spec.finish}
                  />
                  <SpecItem
                    label="Batch Size"
                    value={spec.batchSize}
                    icon={<Package className="h-3 w-3" />}
                  />
                  <SpecItem
                    label="Lead Time"
                    value={`${spec.module.leadWeeks} weeks`}
                    icon={<Clock className="h-3 w-3" />}
                  />
                </div>

                {/* CAD-derived specs (if available) */}
                {(spec.dimensions || spec.massG !== null) && (
                  <div className="flex flex-wrap items-center gap-3 text-xs border-t pt-2">
                    {spec.dimensions && (
                      <span className="flex items-center gap-1 text-foreground">
                        <Ruler className="h-3 w-3 text-muted-foreground" />
                        {spec.dimensions}
                      </span>
                    )}
                    {spec.massG !== null && (
                      <span className="flex items-center gap-1 text-foreground">
                        <Scale className="h-3 w-3 text-muted-foreground" />
                        {spec.massG >= 1000
                          ? `${(spec.massG / 1000).toFixed(2)} kg`
                          : `${spec.massG.toFixed(1)} g`}
                      </span>
                    )}
                    {spec.printable !== null && (
                      <span
                        className={cn(
                          "flex items-center gap-1",
                          spec.printable
                            ? "text-status-success"
                            : "text-status-warning"
                        )}
                      >
                        {spec.printable ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {spec.printable
                          ? "Printable"
                          : `${spec.dfmIssueCount} DFM issues`}
                      </span>
                    )}
                  </div>
                )}

                {/* Key parts */}
                <div className="flex flex-wrap gap-1">
                  {spec.module.keyParts.map((part, i) => (
                    <span
                      key={i}
                      className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-foreground"
                    >
                      {part}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground border-t pt-3">
          <span className="font-medium">Readiness:</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-success" />
            Diagnostics + CAD + DFM complete
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-info" />
            2 of 3 data sources available
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-warning" />
            1 of 3 data sources available
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

/** Single spec item in the per-module grid */
function SpecItem({
  label,
  value,
  icon,
}: {
  label: string
  value: string | null
  icon?: React.ReactNode
}): React.ReactNode {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
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

/** Inline flask icon to avoid importing another lucide icon */
function FlaskIcon(): React.ReactNode {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
      <path d="M8.5 2h7" />
      <path d="M7 16h10" />
    </svg>
  )
}

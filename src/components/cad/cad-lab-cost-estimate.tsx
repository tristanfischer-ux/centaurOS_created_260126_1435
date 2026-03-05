/**
 * @file cad-lab-cost-estimate.tsx — Parts-level cost estimation dashboard.
 *
 * @description Shows per-module, per-part cost breakdowns produced by AI.
 * Each module card is expandable, showing individual parts classified as
 * "buy" (COTS) or "make" (manufactured), with plain English reasoning.
 *
 * Charts: donut (buy vs make vs labour split), bar (per-module totals).
 * Override: simple inline total override per module.
 *
 * Backward compatible: old saved estimates without `parts` array show
 * total-only with a "Re-estimate" note.
 *
 * @component
 */

"use client"

import { useMemo, useState, useCallback } from "react"
import {
  PoundSterling,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Loader2,
  Wrench,
  ShoppingCart,
  Hammer,
  AlertTriangle,
} from "lucide-react"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/format"
import { chartColors } from "@/lib/chart-colors"
import type { CadLabModule, EarlyCostEstimate, AiCostEstimate } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import { parseBatchSize } from "@/lib/cad-lab-cost-constants"

// ─── Chart Colors ───────────────────────────────────────────────────

const COLOR_BUY = chartColors[1]     // Blue — purchased parts
const COLOR_MAKE = chartColors[0]    // Orange — manufactured parts
const COLOR_LABOUR = chartColors[3]  // Amber — assembly labour

// ─── Types ──────────────────────────────────────────────────────────

interface ModuleCostSummary {
  moduleId: string
  moduleName: string
  /** AI estimate (may be V1 or V2 shape) */
  aiEstimate?: AiCostEstimate
  /** Total after override */
  totalPerUnit: number
  /** Whether user has a total override */
  hasOverride: boolean
  /** User's override value (if any) */
  overrideTotal?: number
  /** Aggregated buy cost from parts */
  buyCost: number
  /** Aggregated make cost from parts */
  makeCost: number
  /** Labour cost */
  labourCost: number
  /** Diagnostic context */
  process: string
  material: string
  batchSize: number
}

// ─── Component ──────────────────────────────────────────────────────

interface CadLabCostEstimateProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  onCostOverride?: (moduleId: string, overrides: CadLabModule["costOverrides"]) => void
  shortlistedSupplierCount?: number
  earlyCostEstimates?: Record<string, EarlyCostEstimate>
  aiCostEstimates?: Record<string, AiCostEstimate>
  isEstimatingCosts?: boolean
  costEstimationError?: string | null
}

/**
 * CadLabCostEstimate — Parts-level cost estimation dashboard.
 *
 * @description Shows expandable module cards with per-part buy/make
 * breakdowns, donut chart (buy vs make vs labour), bar chart (per-module
 * totals), and simple inline total overrides.
 */
export function CadLabCostEstimate({
  modules,
  diagnosticAnswers,
  onCostOverride,
  shortlistedSupplierCount = 0,
  aiCostEstimates,
  isEstimatingCosts = false,
  costEstimationError,
}: CadLabCostEstimateProps): React.ReactNode {
  const [isExpanded, setIsExpanded] = useState(true)
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null)
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  const costs = useMemo((): ModuleCostSummary[] => {
    return modules.map((mod) => {
      const answers = diagnosticAnswers[mod.id] || {}
      const process = answers.mfg_process || "Other"
      const material = answers.material || "Other"
      const batchSizeStr = answers.batch_size || "1-10 (prototyping)"
      const batchSize = parseBatchSize(batchSizeStr)

      const aiEst = aiCostEstimates?.[mod.id]
      const overrideTotal = mod.costOverrides?.totalPerUnit

      // Aggregate buy/make/labour from parts
      let buyCost = 0
      let makeCost = 0
      let labourCost = aiEst?.labourCost ?? 0

      if (aiEst?.parts && aiEst.parts.length > 0) {
        for (const part of aiEst.parts) {
          if (part.type === "buy") buyCost += part.cost
          else makeCost += part.cost
        }
      } else if (aiEst) {
        // V1 backward compat: no parts array — use legacy fields as make cost
        makeCost = (aiEst.materialCostPerUnit ?? 0) + (aiEst.processingCostPerUnit ?? 0)
        buyCost = 0
        labourCost = aiEst.toolingCost ?? 0
      }

      const aiTotal = aiEst?.totalPerUnit ?? 0
      const hasOverride = overrideTotal != null && overrideTotal > 0
      const totalPerUnit = hasOverride ? overrideTotal : aiTotal

      return {
        moduleId: mod.id,
        moduleName: mod.name,
        aiEstimate: aiEst,
        totalPerUnit,
        hasOverride,
        overrideTotal,
        buyCost,
        makeCost,
        labourCost,
        process,
        material,
        batchSize,
      }
    })
  }, [modules, diagnosticAnswers, aiCostEstimates])

  // Stable index map for numbering
  const moduleIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    modules.forEach((m, i) => map.set(m.id, i + 1))
    return map
  }, [modules])

  const systemTotal = costs.reduce((sum, c) => sum + c.totalPerUnit, 0)
  const totalBuyCost = costs.reduce((sum, c) => sum + c.buyCost, 0)
  const totalMakeCost = costs.reduce((sum, c) => sum + c.makeCost, 0)
  const totalLabourCost = costs.reduce((sum, c) => sum + c.labourCost, 0)
  const hasDiagnostics = Object.keys(diagnosticAnswers).length > 0
  const hasAnyEstimates = Object.keys(aiCostEstimates ?? {}).length > 0

  const handleOverrideApply = useCallback((moduleId: string, value: string) => {
    if (!onCostOverride) return
    const num = parseFloat(value)
    const mod = modules.find(m => m.id === moduleId)
    if (!mod) return
    const existing = mod.costOverrides ?? {}
    if (!isNaN(num) && num > 0) {
      onCostOverride(moduleId, { ...existing, totalPerUnit: num })
    } else {
      // Clear the total override, keep other overrides
      const rest = { ...existing }
      delete rest.totalPerUnit
      onCostOverride(moduleId, Object.keys(rest).length > 0 ? rest : undefined)
    }
    setEditingModuleId(null)
  }, [onCostOverride, modules])

  const handleOverrideReset = useCallback((moduleId: string) => {
    if (!onCostOverride) return
    const mod = modules.find(m => m.id === moduleId)
    if (!mod) return
    const rest = { ...mod.costOverrides }
    delete rest.totalPerUnit
    onCostOverride(moduleId, Object.keys(rest).length > 0 ? rest : undefined)
  }, [onCostOverride, modules])

  if (!hasDiagnostics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PoundSterling className="h-4 w-4" />
            Cost Estimation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Complete the engineering diagnostics above to generate cost estimates. Manufacturing process, material, and batch size are needed.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-base flex items-center gap-2">
            <PoundSterling className="h-4 w-4" />
            Cost Estimation
            {hasAnyEstimates && (
              <span className="text-xs font-normal font-mono text-foreground bg-muted px-2 py-0.5 rounded">
                {formatCurrency(systemTotal)} / unit
              </span>
            )}
            {isEstimatingCosts && (
              <span className="text-[10px] font-normal text-muted-foreground animate-pulse flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analysing your specifications…
              </span>
            )}
          </CardTitle>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Loading state — show spinner, not formula garbage */}
          {isEstimatingCosts && !hasAnyEstimates && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Analysing your specifications…</p>
              <p className="text-[10px] text-muted-foreground">
                Reading parts, estimating material & labour costs
              </p>
            </div>
          )}

          {/* Estimation failed — show actual error */}
          {!isEstimatingCosts && !hasAnyEstimates && costEstimationError && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <AlertTriangle className="h-5 w-5 text-status-warning" />
              <p className="text-sm text-muted-foreground">Cost estimation failed.</p>
              <p className="text-[10px] text-muted-foreground font-mono">{costEstimationError}</p>
              <p className="text-[10px] text-muted-foreground">
                Try updating a diagnostic answer to re-trigger estimation.
              </p>
            </div>
          )}

          {/* Waiting for estimation to run (no error, not loading, no results) */}
          {!isEstimatingCosts && !hasAnyEstimates && !costEstimationError && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <PoundSterling className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Cost estimates will appear once diagnostic answers are complete.
              </p>
            </div>
          )}

          {hasAnyEstimates && (
            <>
              {/* ── Charts ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cost split donut: Buy vs Make vs Labour */}
                <div className="p-4 border rounded-lg">
                  <p className="text-xs font-semibold text-foreground mb-3">Cost Split</p>
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Bought parts", value: totalBuyCost, color: COLOR_BUY },
                            { name: "Manufactured parts", value: totalMakeCost, color: COLOR_MAKE },
                            { name: "Labour", value: totalLabourCost, color: COLOR_LABOUR },
                          ].filter((d) => d.value > 0)}
                          dataKey="value"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={2}
                          strokeWidth={0}
                        >
                          {[
                            { name: "Bought parts", value: totalBuyCost, color: COLOR_BUY },
                            { name: "Manufactured parts", value: totalMakeCost, color: COLOR_MAKE },
                            { name: "Labour", value: totalLabourCost, color: COLOR_LABOUR },
                          ]
                            .filter((d) => d.value > 0)
                            .map((d, i) => (
                              <Cell key={i} fill={d.color} />
                            ))}
                        </Pie>
                        <Tooltip content={<CostDonutTooltip total={systemTotal} />} />
                        <Legend
                          verticalAlign="bottom"
                          height={28}
                          formatter={(value: string) => (
                            <span className="text-[10px] text-muted-foreground">{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Cost by module — horizontal bar */}
                {costs.length > 0 && (
                  <div className="p-4 border rounded-lg">
                    <p className="text-xs font-semibold text-foreground mb-3">Cost by Module</p>
                    <div style={{ height: Math.max(180, costs.length * 28 + 20) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={costs
                            .slice()
                            .sort((a, b) => b.totalPerUnit - a.totalPerUnit)
                            .map((c) => {
                              const num = moduleIndexMap.get(c.moduleId) ?? 0
                              const label = `${num}. ${c.moduleName}`
                              return {
                                name: label.length > 26 ? `${label.slice(0, 24)}…` : label,
                                total: c.totalPerUnit,
                              }
                            })}
                          layout="vertical"
                          margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis
                            type="category"
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10 }}
                            width={120}
                          />
                          <Tooltip content={<ModuleBarTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                          <Bar dataKey="total" fill={chartColors[1]} radius={[0, 4, 4, 0]} barSize={14} name="Total">
                            <LabelList
                              content={({ x, y, width: w, height: h, ...entry }) => {
                                const d = entry as unknown as { total: number }
                                if (!d.total || d.total <= 0) return null
                                return (
                                  <text
                                    x={(x as number) + (w as number) + 4}
                                    y={(y as number) + (h as number) / 2}
                                    textAnchor="start"
                                    dominantBaseline="central"
                                    className="fill-muted-foreground"
                                    fontSize={10}
                                    fontFamily="monospace"
                                  >
                                    {formatCurrency(d.total)}
                                  </text>
                                )
                              }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Module cards ── */}
              <div className="space-y-2">
                {costs.map((c) => {
                  const isOpen = expandedModuleId === c.moduleId
                  const hasParts = c.aiEstimate?.parts && c.aiEstimate.parts.length > 0
                  const isV1 = c.aiEstimate && !hasParts
                  const isEditing = editingModuleId === c.moduleId

                  return (
                    <div key={c.moduleId} className="border rounded-lg overflow-hidden">
                      {/* Module header row */}
                      <button
                        type="button"
                        onClick={() => setExpandedModuleId(isOpen ? null : c.moduleId)}
                        className="flex items-center gap-2 w-full p-3 text-left hover:bg-muted/30 transition-colors"
                      >
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground flex-shrink-0">
                          {moduleIndexMap.get(c.moduleId) ?? 0}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-foreground truncate">{c.moduleName}</span>
                            {c.aiEstimate && (
                              <span
                                className={cn(
                                  "inline-block h-2 w-2 rounded-full flex-shrink-0",
                                  c.aiEstimate.confidence === "high" && "bg-success",
                                  c.aiEstimate.confidence === "medium" && "bg-status-warning",
                                  c.aiEstimate.confidence === "low" && "bg-destructive",
                                )}
                                title={`Confidence: ${c.aiEstimate.confidence}`}
                              />
                            )}
                            {c.hasOverride && (
                              <span className="text-[9px] text-international-orange font-mono">override</span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {c.process} · {c.material} · {c.batchSize > 0 ? `${c.batchSize} units` : ""}
                          </div>
                        </div>
                        <span className="text-xs font-semibold font-mono text-foreground flex-shrink-0">
                          {c.totalPerUnit > 0 ? formatCurrency(c.totalPerUnit) : "—"}
                        </span>
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                      </button>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div className="border-t px-3 pb-3 pt-2 space-y-3 bg-muted/20">
                          {/* Parts table (V2) */}
                          {hasParts && (
                            <div className="space-y-1">
                              {c.aiEstimate!.parts!.map((part, i) => (
                                <div key={i} className="flex items-start gap-2 text-[11px]">
                                  {part.type === "buy" ? (
                                    <ShoppingCart className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                                  ) : (
                                    <Hammer className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className="text-foreground">{part.name}</span>
                                      <span className="font-mono text-foreground flex-shrink-0">{formatCurrency(part.cost)}</span>
                                    </div>
                                    {part.reasoning && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5">{part.reasoning}</p>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {/* Labour line */}
                              {(c.aiEstimate!.labourCost ?? 0) > 0 && (
                                <div className="flex items-start gap-2 text-[11px] pt-1 border-t border-border/50">
                                  <Wrench className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className="text-foreground">Assembly & integration</span>
                                      <span className="font-mono text-foreground flex-shrink-0">{formatCurrency(c.aiEstimate!.labourCost!)}</span>
                                    </div>
                                    {c.aiEstimate!.labourReasoning && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5">{c.aiEstimate!.labourReasoning}</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* V1 backward compat: total-only */}
                          {isV1 && (
                            <div className="text-[11px] text-muted-foreground space-y-1">
                              <p>Total: <span className="font-mono text-foreground">{formatCurrency(c.aiEstimate!.totalPerUnit)}</span></p>
                              {c.aiEstimate!.massReasoning && (
                                <p><span className="font-semibold text-foreground">Mass:</span> {c.aiEstimate!.massReasoning}</p>
                              )}
                              {c.aiEstimate!.materialBreakdown && (
                                <p><span className="font-semibold text-foreground">Material:</span> {c.aiEstimate!.materialBreakdown}</p>
                              )}
                              {c.aiEstimate!.processingBreakdown && (
                                <p><span className="font-semibold text-foreground">Processing:</span> {c.aiEstimate!.processingBreakdown}</p>
                              )}
                              <p className="text-[10px] text-status-warning mt-1">
                                Older estimate format — re-run estimation for per-part breakdown.
                              </p>
                            </div>
                          )}

                          {/* Overall reasoning */}
                          {c.aiEstimate?.reasoning && (
                            <p className="text-[10px] text-muted-foreground italic border-t border-border/50 pt-2">
                              {c.aiEstimate.reasoning}
                            </p>
                          )}

                          {/* Assumptions */}
                          {c.aiEstimate?.assumptions && c.aiEstimate.assumptions.length > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              <span className="font-semibold text-foreground">Assumptions:</span>
                              <ul className="list-disc ml-3 mt-0.5">
                                {c.aiEstimate.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                              </ul>
                            </div>
                          )}

                          {/* Override row */}
                          {onCostOverride && (
                            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground">£</span>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={10}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => handleOverrideApply(c.moduleId, editValue)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleOverrideApply(c.moduleId, editValue)
                                      if (e.key === "Escape") setEditingModuleId(null)
                                    }}
                                    className="h-6 w-24 text-xs"
                                    autoFocus
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingModuleId(c.moduleId)
                                    setEditValue(c.hasOverride ? String(c.overrideTotal) : "")
                                  }}
                                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {c.hasOverride ? `Override: ${formatCurrency(c.overrideTotal!)}` : "Set custom total…"}
                                </button>
                              )}
                              {c.hasOverride && !isEditing && (
                                <button
                                  type="button"
                                  onClick={() => handleOverrideReset(c.moduleId)}
                                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                                >
                                  <RotateCcw className="h-2.5 w-2.5" />
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* System total */}
              <div className="flex items-center justify-between p-3 border-2 rounded-lg">
                <span className="text-sm font-semibold text-foreground">System Total</span>
                <span className="text-sm font-bold font-mono text-foreground">{formatCurrency(systemTotal)} / unit</span>
              </div>
            </>
          )}

          {/* Disclaimer */}
          <div className="rounded-lg border border-status-info/30 bg-status-info-light/20 p-3 space-y-1">
            <p className="text-xs font-medium text-foreground">
              These are internal budget estimates based on industry rates.
            </p>
            {shortlistedSupplierCount > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {shortlistedSupplierCount} supplier{shortlistedSupplierCount !== 1 ? "s" : ""} shortlisted — send RFQs from the Shortlist tab to get real pricing.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Compare against real supplier quotes on the Shortlist tab.
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Chart Tooltips ──────────────────────────────────────────────────

interface DonutTooltipPayload {
  name: string
  value: number
  payload: { fill: string }
}

function CostDonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean
  payload?: DonutTooltipPayload[]
  total: number
}): React.ReactNode {
  if (!active || !payload?.length) return null
  const item = payload[0]
  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0"
  return (
    <div className="bg-background p-2 border rounded-lg shadow-lg text-xs">
      <p className="font-medium text-foreground">{item.name}</p>
      <p className="text-muted-foreground font-mono">
        {formatCurrency(item.value)} ({pct}%)
      </p>
    </div>
  )
}

interface BarTooltipPayload {
  name: string
  value: number
  color: string
  dataKey: string
}

function ModuleBarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: BarTooltipPayload[]
  label?: string
}): React.ReactNode {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="bg-background p-2 border rounded-lg shadow-lg text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      <p className="font-semibold text-foreground">
        {formatCurrency(total)}
      </p>
    </div>
  )
}

/**
 * @file assembly-cost-rollup.tsx — Stacked cost breakdown + margin calculator.
 *
 * @description Shows the total product cost as a stacked horizontal bar:
 *   - Manufacturing (make parts)
 *   - Bought parts (buy parts)
 *   - Assembly
 *   - Packaging
 *   - Shipping
 *   - Total landed cost per unit
 *
 * Plus a margin calculator where user enters target retail price.
 */

"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AiCostEstimate } from "@/lib/cad-lab-types"

// ─── Props ──────────────────────────────────────────────────────────

interface AssemblyCostRollupProps {
  aiCostEstimates: Record<string, AiCostEstimate> | undefined
  assemblyEstimate: number
  packagingEstimate: number
  shippingEstimate: number
}

// ─── Cost line item ─────────────────────────────────────────────────

interface CostLine {
  label: string
  value: number
  color: string
}

// ─── Component ──────────────────────────────────────────────────────

export function AssemblyCostRollup({
  aiCostEstimates,
  assemblyEstimate,
  packagingEstimate,
  shippingEstimate,
}: AssemblyCostRollupProps) {
  const [targetPrice, setTargetPrice] = useState<string>("")

  // ── Aggregate costs from AI estimates ──
  const { makeCost, buyCost } = useMemo(() => {
    let make = 0
    let buy = 0
    if (aiCostEstimates) {
      for (const est of Object.values(aiCostEstimates)) {
        if (est.parts) {
          for (const part of est.parts) {
            const unitCost = part.cost ?? 0
            if (part.type === "buy") buy += unitCost
            else make += unitCost
          }
        }
      }
    }
    return { makeCost: Math.round(make * 100) / 100, buyCost: Math.round(buy * 100) / 100 }
  }, [aiCostEstimates])

  const costLines: CostLine[] = [
    { label: "Manufacturing", value: makeCost, color: "#6366f1" },
    { label: "Bought parts", value: buyCost, color: "#0891b2" },
    { label: "Assembly", value: assemblyEstimate, color: "#d97706" },
    { label: "Packaging", value: packagingEstimate, color: "#059669" },
    { label: "Shipping", value: shippingEstimate, color: "#dc2626" },
  ]

  const totalCost = costLines.reduce((sum, l) => sum + l.value, 0)
  const maxCost = Math.max(...costLines.map((l) => l.value), 1)

  // ── Margin calculation ──
  const targetPriceNum = parseFloat(targetPrice) || 0
  const margin = targetPriceNum > 0 ? ((targetPriceNum - totalCost) / targetPriceNum) * 100 : 0
  const profitPerUnit = targetPriceNum > 0 ? targetPriceNum - totalCost : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Cost Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Stacked horizontal bars ── */}
        <div className="space-y-2">
          {costLines.map((line) => (
            <div key={line.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: line.color }}
                  />
                  <span className="text-muted-foreground">{line.label}</span>
                </div>
                <span className="font-mono text-foreground">
                  {"\u00a3"}{line.value.toFixed(2)}
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max((line.value / maxCost) * 100, 2)}%`,
                    backgroundColor: line.color,
                    opacity: 0.8,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ── Total ── */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              Total Landed Cost / Unit
            </span>
            <span className="text-lg font-bold text-foreground font-mono">
              {"\u00a3"}{totalCost.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ── Stacked bar visualization ── */}
        {totalCost > 0 && (
          <div className="flex h-6 rounded-full overflow-hidden">
            {costLines.filter((l) => l.value > 0).map((line) => (
              <div
                key={line.label}
                className="h-full transition-all duration-500"
                style={{
                  width: `${(line.value / totalCost) * 100}%`,
                  backgroundColor: line.color,
                  opacity: 0.85,
                }}
                title={`${line.label}: \u00a3${line.value.toFixed(2)}`}
              />
            ))}
          </div>
        )}

        {/* ── Margin calculator ── */}
        <div className="pt-3 border-t border-border space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Margin Calculator
          </p>
          <div className="flex items-end gap-4">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="target-price" className="text-xs">Target Retail Price ({"\u00a3"})</Label>
              <Input
                id="target-price"
                type="number"
                placeholder="0.00"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="font-mono"
              />
            </div>
            {targetPriceNum > 0 && (
              <div className="flex items-center gap-4 pb-1.5">
                <div className="text-center">
                  <p className={`text-lg font-bold font-mono ${margin >= 0 ? "text-success" : "text-destructive"}`}>
                    {margin.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">Gross margin</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-bold font-mono ${profitPerUnit >= 0 ? "text-success" : "text-destructive"}`}>
                    {"\u00a3"}{profitPerUnit.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">Per unit</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

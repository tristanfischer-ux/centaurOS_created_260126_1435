'use client'

import { useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { ChevronDown, ChevronRight, Calculator, Clock } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import {
  estimateAssemblyCost,
  estimatePartCost,
  type CostEstimateInput,
  type CostEstimate,
} from '@/lib/cost-estimate-engine'
import { cn } from '@/lib/utils'

interface InstantEstimateCardProps {
  parts: CostEstimateInput[]
  className?: string
}

const CONFIDENCE_STATUS: Record<string, 'success' | 'warning' | 'error'> = {
  high: 'success',
  medium: 'warning',
  low: 'error',
}

export function InstantEstimateCard({ parts, className }: InstantEstimateCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false)

  const assembly = useMemo(() => estimateAssemblyCost(parts), [parts])
  const perPart = useMemo(() => parts.map(estimatePartCost), [parts])

  if (parts.length === 0) return null

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calculator className="w-4 h-4 text-international-orange" />
          Instant Estimate
          <StatusBadge status={CONFIDENCE_STATUS[assembly.confidence]}>
            {assembly.confidence} confidence
          </StatusBadge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Total cost range */}
        <div className="flex items-baseline justify-between p-3 rounded-lg bg-muted/50">
          <div>
            <p className="text-xs text-muted-foreground">Estimated total ({assembly.quantity} unit{assembly.quantity !== 1 ? 's' : ''})</p>
            <p className="text-lg font-semibold text-foreground">
              {formatCurrency(assembly.totalMinGbp)} — {formatCurrency(assembly.totalMaxGbp)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Per unit</p>
            <p className="text-sm font-medium text-foreground">
              {formatCurrency(assembly.minGbp)} — {formatCurrency(assembly.maxGbp)}
            </p>
          </div>
        </div>

        {/* Lead time */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Estimated lead time: {assembly.leadTimeDays.min}–{assembly.leadTimeDays.max} days
        </div>

        {/* Collapsible breakdown */}
        <button
          onClick={() => setShowBreakdown((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {showBreakdown ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {showBreakdown ? 'Hide' : 'Show'} breakdown
        </button>

        {showBreakdown && (
          <div className="space-y-3">
            {/* Per-part breakdown */}
            {perPart.map((estimate, idx) => (
              <PartBreakdownRow key={idx} name={parts[idx].name} estimate={estimate} />
            ))}

            {/* Aggregate breakdown */}
            {parts.length > 1 && (
              <div className="pt-2 border-t border-border space-y-1">
                <BreakdownLine label="Process" amount={assembly.breakdown.processCost} />
                <BreakdownLine label="Material" amount={assembly.breakdown.materialCost} />
                {assembly.breakdown.tolerancePremium > 0 && (
                  <BreakdownLine label="Tolerance premium" amount={assembly.breakdown.tolerancePremium} />
                )}
                {assembly.breakdown.finishPremium > 0 && (
                  <BreakdownLine label="Finish premium" amount={assembly.breakdown.finishPremium} />
                )}
                {assembly.breakdown.environmentPremium > 0 && (
                  <BreakdownLine label="Environment premium" amount={assembly.breakdown.environmentPremium} />
                )}
                {assembly.breakdown.toolingCostPerUnit > 0 && (
                  <BreakdownLine label="Tooling (per unit)" amount={assembly.breakdown.toolingCostPerUnit} />
                )}
                {assembly.breakdown.setupCostPerUnit > 0 && (
                  <BreakdownLine label="Setup (per unit)" amount={assembly.breakdown.setupCostPerUnit} />
                )}
              </div>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[11px] text-muted-foreground">
          Based on typical UK supplier rates. Actual quotes may vary.
        </p>
      </CardContent>
    </Card>
  )
}

function PartBreakdownRow({ name, estimate }: { name: string; estimate: CostEstimate }) {
  return (
    <div className="p-2 rounded bg-muted/30 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{name}</span>
        <span className="text-xs text-muted-foreground">
          {formatCurrency(estimate.minGbp)} — {formatCurrency(estimate.maxGbp)} / unit
        </span>
      </div>
      <div className="flex gap-3 text-[10px] text-muted-foreground">
        <span>Process: {formatCurrency(estimate.breakdown.processCost)}</span>
        <span>Material: {formatCurrency(estimate.breakdown.materialCost)}</span>
        {estimate.breakdown.toolingCostPerUnit > 0 && (
          <span>Tooling: {formatCurrency(estimate.breakdown.toolingCostPerUnit)}</span>
        )}
      </div>
    </div>
  )
}

function BreakdownLine({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{formatCurrency(amount)}</span>
    </div>
  )
}

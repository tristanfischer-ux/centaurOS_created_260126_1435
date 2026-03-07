"use client"

/**
 * @file dfm-insight-panel.tsx — Compact DFM callout powered by Nightshift technique knowledge.
 *
 * @description Shows real-world supplier data inline below a diagnostic question:
 * tolerance range with feasibility flag, top materials with frequency, practical tips.
 * Styled to match the existing Real-World Insights overlay (international-orange accent).
 */

import { Factory, AlertTriangle, CheckCircle2 } from "lucide-react"
import type { ProcessInsights } from "@/actions/manufacturing-techniques"
import { getToleranceMm } from "@/lib/cad-lab/diagnostic-to-technique"

interface DfmInsightPanelProps {
  insights: ProcessInsights
  selectedTolerance?: string | null
  selectedMaterial?: string | null
}

export function DfmInsightPanel({
  insights,
  selectedTolerance,
  selectedMaterial,
}: DfmInsightPanelProps) {
  const toleranceMm = getToleranceMm(selectedTolerance)
  const typicalMm = insights.tolerances.typical_mm

  // Tolerance feasibility: is the selected tolerance tighter than typical?
  const isTight = toleranceMm != null && typicalMm != null && toleranceMm < typicalMm

  // Material check: does the selected material appear in insights?
  const materialMatch = selectedMaterial
    ? insights.materials.find(
        (m) => m.material.toLowerCase().includes(selectedMaterial.toLowerCase()) ||
               selectedMaterial.toLowerCase().includes(m.material.toLowerCase().split(" ")[0]),
      )
    : null

  const topMaterials = insights.materials.slice(0, 5)
  const topTips = insights.tips.slice(0, 2)

  return (
    <div className="rounded-lg border border-international-orange/20 bg-international-orange/[0.02] p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center gap-1.5 text-xs font-medium text-international-orange">
        <Factory className="h-3.5 w-3.5" />
        Based on {insights.totalSupplierCount} UK suppliers
      </div>

      {/* Tolerance range */}
      {insights.tolerances.min_mm != null && (
        <div className="text-xs text-foreground space-y-1">
          <span className="text-muted-foreground">Tolerance range: </span>
          <span className="font-mono">
            {"\u00B1"}{insights.tolerances.min_mm}mm &ndash; {"\u00B1"}{insights.tolerances.max_mm}mm
          </span>
          {typicalMm != null && (
            <span className="text-muted-foreground"> (typical {"\u00B1"}{typicalMm}mm)</span>
          )}
        </div>
      )}

      {/* Tolerance warning */}
      {isTight && (
        <div className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
          Typical tolerance is {"\u00B1"}{typicalMm}mm &mdash; tighter selection may limit supplier options
        </div>
      )}

      {/* Material check */}
      {selectedMaterial && (
        <div className="flex items-start gap-1.5 text-xs">
          {materialMatch ? (
            <>
              <CheckCircle2 className="h-3 w-3 flex-shrink-0 mt-0.5 text-success" />
              <span className="text-foreground">
                {selectedMaterial} seen at {materialMatch.frequency} supplier{materialMatch.frequency !== 1 ? "s" : ""}
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5 text-warning" />
              <span className="text-muted-foreground">
                Not commonly seen with this process among UK suppliers
              </span>
            </>
          )}
        </div>
      )}

      {/* Top materials */}
      {topMaterials.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Common materials
          </span>
          <div className="flex flex-wrap gap-1">
            {topMaterials.map((m) => (
              <span
                key={m.material}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >
                {m.material} ({m.frequency})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {topTips.length > 0 && (
        <div className="space-y-0.5">
          {topTips.map((tip, i) => (
            <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">
              &bull; {tip}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

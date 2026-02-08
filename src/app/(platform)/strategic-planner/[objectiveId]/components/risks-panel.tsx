"use client"

/**
 * @description Risks panel showing AI-identified risks with severity,
 * mitigation strategies, and critical path warnings.
 */

import { AlertTriangle, X, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import type { StrategicRisk, RiskSeverity } from "@/types/strategic-planner"

interface RisksPanelProps {
  risks: StrategicRisk[]
  criticalPathTaskIds: string[]
  onClose: () => void
}

const SEVERITY_MAP = {
  high: { status: 'error' as const, label: 'High Risk' },
  medium: { status: 'warning' as const, label: 'Medium Risk' },
  low: { status: 'info' as const, label: 'Low Risk' },
} satisfies Record<RiskSeverity, { status: 'error' | 'warning' | 'info'; label: string }>

export function RisksPanel({ risks, criticalPathTaskIds, onClose }: RisksPanelProps) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-status-warning" />
          <h3 className="text-sm font-semibold text-foreground">Risks & Warnings</h3>
          <span className="text-xs text-muted-foreground">({risks.length})</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close risks panel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Critical path warning */}
      {criticalPathTaskIds.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-status-warning-light/30 border border-status-warning/20 mb-3">
          <Shield className="h-4 w-4 text-status-warning-dark flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-status-warning-dark">
              Critical Path: {criticalPathTaskIds.length} tasks
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Any delay on these tasks will delay the entire plan. Monitor them closely.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {risks.map((risk, idx) => {
          const severityConfig = SEVERITY_MAP[risk.severity] || SEVERITY_MAP.medium

          return (
            <Card key={idx} className="border">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-foreground line-clamp-2">{risk.description}</p>
                  <StatusBadge status={severityConfig.status} size="sm">
                    {severityConfig.label}
                  </StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">
                  <span className="font-medium">Mitigation:</span> {risk.mitigation}
                </p>
                {risk.relatedTaskTitle && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t border-muted/40">
                    Related: {risk.relatedTaskTitle}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, ClipboardCheck, AlertTriangle, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { PreExecValidationResult } from "@/lib/cad-lab-types"

// ─── Pre-Execution Validation Alerts (QW5) ──────────────────────────

/** Collapsible alert cards showing pre-execution validation findings per module */
export function PreExecValidationAlerts({ findings }: { findings: PreExecValidationResult[] }) {
  const [expanded, setExpanded] = useState(false)

  const criticalCount = findings.filter((f) => f.severity === "critical").length
  const warningCount = findings.filter((f) => f.severity === "warning").length
  const infoCount = findings.filter((f) => f.severity === "info").length

  const severityVariant = (s: PreExecValidationResult["severity"]) =>
    s === "critical" ? "destructive" as const : s === "warning" ? "warning" as const : "info" as const

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Pre-execution Checks</span>
          <div className="flex items-center gap-1">
            {criticalCount > 0 && <Badge variant="destructive" size="sm">{criticalCount} critical</Badge>}
            {warningCount > 0 && <Badge variant="warning" size="sm">{warningCount} warning</Badge>}
            {infoCount > 0 && <Badge variant="info" size="sm">{infoCount} info</Badge>}
          </div>
        </div>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-2">
          {findings.map((finding, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-start gap-2 p-2 rounded text-xs",
                finding.severity === "critical" ? "bg-destructive/10" : finding.severity === "warning" ? "bg-status-warning-light/30" : "bg-status-info-light/30",
              )}
            >
              {finding.severity === "critical" ? (
                <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
              ) : finding.severity === "warning" ? (
                <AlertTriangle className="h-3 w-3 text-status-warning flex-shrink-0 mt-0.5" />
              ) : (
                <Info className="h-3 w-3 text-status-info flex-shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <span className="font-medium text-foreground">{finding.ruleId}</span>
                <span className="text-muted-foreground ml-1">{finding.message}</span>
                {finding.repairHint && (
                  <p className="text-muted-foreground mt-0.5 italic">Fix: {finding.repairHint}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

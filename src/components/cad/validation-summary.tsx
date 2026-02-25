"use client"

/**
 * @file validation-summary.tsx — Automated design validation results for CAD Lab.
 *
 * @description Displays validation results for a module, showing pass/warn/fail
 * verdict with categorised issues and actionable fix suggestions. Runs client-side
 * instantly after generation — no API call required.
 *
 * @related
 * - Rule engine: src/lib/cad-lab/validation-rules.ts
 * - Validation runner: src/lib/cad-lab/validation-runner.ts
 * - Build page: src/app/(platform)/the-forge/cad-lab/build/page.tsx
 */

import { useMemo, useState } from "react"
import {
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Info,
    ChevronDown,
    ChevronRight,
    ShieldCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { runModuleValidation } from "@/lib/cad-lab/validation-runner"
import type { ValidationSummary as ValidationSummaryType, ValidationResult, ValidationCategory } from "@/lib/cad-lab/validation-rules"

// ─── Props ──────────────────────────────────────────────────────────

interface ValidationSummaryProps {
    /** Module to validate */
    module: CadLabModule
    /** Diagnostic answers for this module (questionId → answer) */
    diagnostics?: Record<string, string>
    /** Collapsed by default */
    defaultExpanded?: boolean
}

// ─── Category Labels ────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ValidationCategory, string> = {
    geometry: "Geometry",
    "material-process": "Material / Process",
    tolerance: "Tolerance",
    structural: "Structural",
    environment: "Environment",
}

// ─── Severity Styling ───────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: ValidationResult["severity"] }) {
    switch (severity) {
        case "critical":
            return <XCircle className="h-4 w-4 text-destructive shrink-0" />
        case "warning":
            return <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
        case "info":
            return <Info className="h-4 w-4 text-info shrink-0" />
    }
}

function severityBg(severity: ValidationResult["severity"]): string {
    switch (severity) {
        case "critical":
            return "bg-destructive/10"
        case "warning":
            return "bg-warning/10"
        case "info":
            return "bg-info/10"
    }
}

// ─── Verdict Badge ──────────────────────────────────────────────────

function VerdictBadge({ verdict, criticalCount, warningCount }: {
    verdict: ValidationSummaryType["verdict"]
    criticalCount: number
    warningCount: number
}) {
    switch (verdict) {
        case "pass":
            return (
                <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    All checks passed
                </Badge>
            )
        case "warn":
            return (
                <Badge variant="warning" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {warningCount} warning{warningCount !== 1 ? "s" : ""}
                </Badge>
            )
        case "fail":
            return (
                <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    {criticalCount} critical issue{criticalCount !== 1 ? "s" : ""}
                    {warningCount > 0 ? `, ${warningCount} warning${warningCount !== 1 ? "s" : ""}` : ""}
                </Badge>
            )
    }
}

// ─── Issue Card ─────────────────────────────────────────────────────

function IssueCard({ result }: { result: ValidationResult }) {
    return (
        <div className={cn("rounded-md border p-3 space-y-1", severityBg(result.severity))}>
            <div className="flex items-start gap-2">
                <SeverityIcon severity={result.severity} />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{result.message}</p>
                    {result.suggestion && (
                        <p className="text-xs text-muted-foreground mt-1">{result.suggestion}</p>
                    )}
                    {(result.measuredValue || result.threshold) && (
                        <div className="flex gap-3 mt-1.5">
                            {result.measuredValue && (
                                <span className="text-xs text-muted-foreground">
                                    Measured: <span className="font-mono">{result.measuredValue}</span>
                                </span>
                            )}
                            {result.threshold && (
                                <span className="text-xs text-muted-foreground">
                                    Limit: <span className="font-mono">{result.threshold}</span>
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Main Component ─────────────────────────────────────────────────

/**
 * ValidationSummary — automated design validation results panel.
 *
 * @description Runs validation rules against a module's generation results and
 * diagnostic answers, displaying categorised issues with actionable fixes.
 * Runs entirely client-side — no API call or loading state needed.
 */
export function ValidationSummary({
    module,
    diagnostics = {},
    defaultExpanded = false,
}: ValidationSummaryProps) {
    const [expanded, setExpanded] = useState(defaultExpanded)

    // INTENT: Run validation synchronously — it's pure computation on local data
    const summary = useMemo(
        () => runModuleValidation(module, diagnostics),
        [module, diagnostics],
    )

    // Don't render if module hasn't been generated yet
    if (module.status !== "generated" && !module.result) {
        return null
    }

    // Don't render if there are no results at all (no rules could run)
    if (summary.results.length === 0) {
        return (
            <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Design validation — no checks applicable (add diagnostics for full validation)</span>
                </div>
            </div>
        )
    }

    // Group results by category
    const grouped = summary.results.reduce<Record<string, ValidationResult[]>>((acc, r) => {
        const key = r.category
        if (!acc[key]) acc[key] = []
        acc[key].push(r)
        return acc
    }, {})

    // Sort categories: critical-containing first
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
        const aCrit = grouped[a].some(r => r.severity === "critical") ? 0 : 1
        const bCrit = grouped[b].some(r => r.severity === "critical") ? 0 : 1
        return aCrit - bCrit
    })

    return (
        <div className="rounded-lg border bg-card">
            {/* Header — always visible */}
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
            >
                <div className="flex items-center gap-2">
                    {expanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Design Validation</span>
                </div>
                <VerdictBadge
                    verdict={summary.verdict}
                    criticalCount={summary.criticalCount}
                    warningCount={summary.warningCount}
                />
            </button>

            {/* Expanded content */}
            {expanded && (
                <div className="border-t px-3 pb-3 pt-2 space-y-4">
                    {sortedCategories.map(cat => (
                        <div key={cat} className="space-y-2">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {CATEGORY_LABELS[cat as ValidationCategory] ?? cat}
                            </h4>
                            {grouped[cat]
                                .sort((a, b) => {
                                    const order = { critical: 0, warning: 1, info: 2 }
                                    return order[a.severity] - order[b.severity]
                                })
                                .map((result, i) => (
                                    <IssueCard key={`${result.ruleId}-${i}`} result={result} />
                                ))}
                        </div>
                    ))}

                    {/* Summary footer */}
                    {summary.infoCount > 0 && summary.criticalCount === 0 && summary.warningCount === 0 && (
                        <p className="text-xs text-muted-foreground">
                            {summary.infoCount} informational note{summary.infoCount !== 1 ? "s" : ""} — no action required.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

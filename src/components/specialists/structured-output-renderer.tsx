"use client"

/**
 * @file structured-output-renderer.tsx — Renders structured output specs from specialists.
 *
 * @description Renders kanban boards, comparison tables, dashboards, and org charts
 * using existing design tokens. Parsed from <!-- STRUCTURED_OUTPUT {...} --> blocks
 * in specialist responses.
 *
 * @related
 * - Types: src/lib/agents/tools/structured-output-spec.ts
 * - Dialog: src/app/(platform)/agents/brief-specialist-dialog.tsx
 */

import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import type {
    StructuredOutputSpec,
    KanbanData,
    ComparisonData,
    DashboardData,
    OrgChartData,
    OrgNode,
} from "@/lib/agents/tools/structured-output-spec"

interface StructuredOutputRendererProps {
    spec: StructuredOutputSpec
}

export function StructuredOutputRenderer({ spec }: StructuredOutputRendererProps) {
    switch (spec.type) {
        case "kanban":
            return <KanbanRenderer data={spec} />
        case "comparison":
            return <ComparisonRenderer data={spec} />
        case "dashboard":
            return <DashboardRenderer data={spec} />
        case "org_chart":
            return <OrgChartRenderer data={spec} />
        default:
            return null
    }
}

// ─── Kanban Board ───────────────────────────────────────────────────

const PRIORITY_COLORS = {
    urgent: "border-l-destructive",
    high: "border-l-warning",
    medium: "border-l-info",
    low: "border-l-muted-foreground",
}

function KanbanRenderer({ data }: { data: KanbanData }) {
    return (
        <div className="space-y-2">
            <h4 className="text-xs font-semibold text-foreground">{data.title}</h4>
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(data.columns.length, 4)}, 1fr)` }}>
                {data.columns.map((col, ci) => (
                    <div key={ci} className="space-y-1.5">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                            {col.title} <span className="text-muted-foreground/60">({col.items.length})</span>
                        </div>
                        <div className="space-y-1">
                            {col.items.map((item, ii) => (
                                <div
                                    key={ii}
                                    className={cn(
                                        "rounded border border-border bg-card p-2 border-l-2",
                                        item.priority ? PRIORITY_COLORS[item.priority] : "border-l-border",
                                    )}
                                >
                                    <p className="text-[11px] font-medium text-foreground leading-tight">{item.title}</p>
                                    {item.description && (
                                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── Comparison Table ───────────────────────────────────────────────

const HIGHLIGHT_CLASSES = {
    positive: "bg-success/10 text-success font-medium",
    negative: "bg-destructive/10 text-destructive font-medium",
    neutral: "bg-muted text-muted-foreground",
}

function ComparisonRenderer({ data }: { data: ComparisonData }) {
    return (
        <div className="space-y-2">
            <h4 className="text-xs font-semibold text-foreground">{data.title}</h4>
            <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-[11px]">
                    <thead>
                        <tr className="bg-muted">
                            {data.headers.map((h, i) => (
                                <th key={i} className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row, ri) => (
                            <tr key={ri} className="border-t border-border">
                                {row.values.map((val, ci) => (
                                    <td
                                        key={ci}
                                        className={cn(
                                            "px-2 py-1.5 text-foreground",
                                            ci === 0 && "font-medium",
                                            row.highlights?.[ci] && HIGHLIGHT_CLASSES[row.highlights[ci]],
                                        )}
                                    >
                                        {val}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.recommendation && (
                <p className="text-[10px] text-muted-foreground italic">
                    Recommendation: {data.recommendation}
                </p>
            )}
        </div>
    )
}

// ─── Dashboard ──────────────────────────────────────────────────────

function DashboardRenderer({ data }: { data: DashboardData }) {
    return (
        <div className="space-y-2">
            <h4 className="text-xs font-semibold text-foreground">{data.title}</h4>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(data.kpis.length, 4)}, 1fr)` }}>
                {data.kpis.map((kpi, i) => (
                    <div key={i} className="rounded border border-border bg-card p-2.5">
                        <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                            <span className="text-base font-bold text-foreground">{kpi.value}</span>
                            {kpi.change && (
                                <span className={cn(
                                    "flex items-center gap-0.5 text-[10px] font-medium",
                                    kpi.trend === "up" && "text-success",
                                    kpi.trend === "down" && "text-destructive",
                                    kpi.trend === "flat" && "text-muted-foreground",
                                )}>
                                    {kpi.trend === "up" && <TrendingUp className="h-3 w-3" />}
                                    {kpi.trend === "down" && <TrendingDown className="h-3 w-3" />}
                                    {kpi.trend === "flat" && <Minus className="h-3 w-3" />}
                                    {kpi.change}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── Org Chart ──────────────────────────────────────────────────────

function OrgChartRenderer({ data }: { data: OrgChartData }) {
    return (
        <div className="space-y-2">
            <h4 className="text-xs font-semibold text-foreground">{data.title}</h4>
            <div className="flex justify-center overflow-x-auto py-2">
                <OrgNodeRenderer node={data.root} />
            </div>
        </div>
    )
}

function OrgNodeRenderer({ node }: { node: OrgNode }) {
    return (
        <div className="flex flex-col items-center">
            <div className="rounded border border-border bg-card px-3 py-1.5 text-center">
                <p className="text-[11px] font-medium text-foreground">{node.name}</p>
                <p className="text-[10px] text-muted-foreground">{node.role}</p>
            </div>
            {node.children && node.children.length > 0 && (
                <>
                    <div className="w-px h-3 bg-border" />
                    <div className="flex gap-4">
                        {node.children.map((child, i) => (
                            <div key={i} className="flex flex-col items-center">
                                <div className="w-px h-3 bg-border" />
                                <OrgNodeRenderer node={child} />
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

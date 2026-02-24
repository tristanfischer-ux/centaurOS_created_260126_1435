/**
 * @file structured-output-spec.ts — Types and validation for specialist structured outputs.
 *
 * @description Defines structured output types that specialists can produce for
 * rich rendering: kanban boards, comparison tables, dashboards, and org charts.
 * These are embedded in specialist responses as <!-- STRUCTURED_OUTPUT {...} --> blocks.
 *
 * @related
 * - Renderer: src/components/specialists/structured-output-renderer.tsx
 * - Dialog parser: src/app/(platform)/agents/brief-specialist-dialog.tsx
 * - System prompt: src/app/api/agents/execute/route.ts
 */

// ─── Output Types ───────────────────────────────────────────────────

export type StructuredOutputType = "kanban" | "comparison" | "dashboard" | "org_chart"

// ─── Kanban ─────────────────────────────────────────────────────────

export interface KanbanColumn {
    title: string
    items: Array<{
        title: string
        description?: string
        priority?: "urgent" | "high" | "medium" | "low"
    }>
}

export interface KanbanData {
    type: "kanban"
    title: string
    columns: KanbanColumn[]
}

// ─── Comparison Table ───────────────────────────────────────────────

export interface ComparisonData {
    type: "comparison"
    title: string
    /** Column headers (first column is the row label) */
    headers: string[]
    /** Rows of values matching the headers */
    rows: Array<{
        values: string[]
        /** Optional: highlight cells (index → "positive" | "negative" | "neutral") */
        highlights?: Record<number, "positive" | "negative" | "neutral">
    }>
    /** Optional recommendation row label */
    recommendation?: string
}

// ─── Dashboard ──────────────────────────────────────────────────────

export interface DashboardKpi {
    label: string
    value: string | number
    change?: string
    trend?: "up" | "down" | "flat"
}

export interface DashboardData {
    type: "dashboard"
    title: string
    kpis: DashboardKpi[]
}

// ─── Org Chart ──────────────────────────────────────────────────────

export interface OrgNode {
    name: string
    role: string
    children?: OrgNode[]
}

export interface OrgChartData {
    type: "org_chart"
    title: string
    root: OrgNode
}

// ─── Union Type ─────────────────────────────────────────────────────

export type StructuredOutputSpec = KanbanData | ComparisonData | DashboardData | OrgChartData

// ─── Validation ─────────────────────────────────────────────────────

const VALID_TYPES: StructuredOutputType[] = ["kanban", "comparison", "dashboard", "org_chart"]

/**
 * Validate a parsed JSON object as a StructuredOutputSpec.
 * Returns null if invalid.
 */
export function validateStructuredOutput(parsed: unknown): StructuredOutputSpec | null {
    if (!parsed || typeof parsed !== "object") return null
    const spec = parsed as Record<string, unknown>

    if (typeof spec.type !== "string" || !VALID_TYPES.includes(spec.type as StructuredOutputType)) return null
    if (typeof spec.title !== "string") return null

    switch (spec.type) {
        case "kanban": {
            if (!Array.isArray(spec.columns) || spec.columns.length === 0) return null
            const columns: KanbanColumn[] = []
            for (const col of spec.columns) {
                if (!col || typeof col !== "object") continue
                const c = col as Record<string, unknown>
                if (typeof c.title !== "string" || !Array.isArray(c.items)) continue
                columns.push({
                    title: c.title,
                    items: (c.items as Array<Record<string, unknown>>)
                        .filter((i) => typeof i.title === "string")
                        .map((i) => ({
                            title: i.title as string,
                            ...(typeof i.description === "string" ? { description: i.description } : {}),
                            ...(typeof i.priority === "string" ? { priority: i.priority as KanbanColumn["items"][0]["priority"] } : {}),
                        })),
                })
            }
            if (columns.length === 0) return null
            return { type: "kanban", title: spec.title as string, columns }
        }

        case "comparison": {
            if (!Array.isArray(spec.headers) || spec.headers.length < 2) return null
            if (!Array.isArray(spec.rows) || spec.rows.length === 0) return null
            return {
                type: "comparison",
                title: spec.title as string,
                headers: spec.headers as string[],
                rows: (spec.rows as Array<Record<string, unknown>>)
                    .filter((r) => Array.isArray(r.values))
                    .map((r) => ({
                        values: r.values as string[],
                        ...(r.highlights && typeof r.highlights === "object" ? { highlights: r.highlights as Record<number, "positive" | "negative" | "neutral"> } : {}),
                    })),
                ...(typeof spec.recommendation === "string" ? { recommendation: spec.recommendation } : {}),
            }
        }

        case "dashboard": {
            if (!Array.isArray(spec.kpis) || spec.kpis.length === 0) return null
            const kpis: DashboardKpi[] = (spec.kpis as Array<Record<string, unknown>>)
                .filter((k) => typeof k.label === "string" && (typeof k.value === "string" || typeof k.value === "number"))
                .map((k) => ({
                    label: k.label as string,
                    value: k.value as string | number,
                    ...(typeof k.change === "string" ? { change: k.change } : {}),
                    ...(typeof k.trend === "string" ? { trend: k.trend as DashboardKpi["trend"] } : {}),
                }))
            if (kpis.length === 0) return null
            return { type: "dashboard", title: spec.title as string, kpis }
        }

        case "org_chart": {
            if (!spec.root || typeof spec.root !== "object") return null
            const root = validateOrgNode(spec.root as Record<string, unknown>)
            if (!root) return null
            return { type: "org_chart", title: spec.title as string, root }
        }

        default:
            return null
    }
}

function validateOrgNode(node: Record<string, unknown>): OrgNode | null {
    if (typeof node.name !== "string" || typeof node.role !== "string") return null
    const result: OrgNode = { name: node.name, role: node.role }
    if (Array.isArray(node.children)) {
        const children: OrgNode[] = []
        for (const child of node.children) {
            if (child && typeof child === "object") {
                const validChild = validateOrgNode(child as Record<string, unknown>)
                if (validChild) children.push(validChild)
            }
        }
        if (children.length > 0) result.children = children
    }
    return result
}

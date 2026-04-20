/**
 * @file money/plan/variance/page.tsx — /money/plan/variance
 *
 * @description Plan vs actuals (net burn) — mockup-faithful port of
 * MONEY-MOCKUP-VARIANCE.html. Server component reads the foundry's plan
 * line items + Xero transactions + money_settings, rolls them into
 * per-month per-category deltas, and hands a typed props bundle to
 * VarianceView.
 *
 * Data sources, slot by slot:
 *   - money_settings.currency                 → display currency
 *   - plan_line_items (foundry_id, !archived) → plan side (direction,
 *     category, amount_cents, frequency, effective_from/to, probability_pct)
 *   - xero_transaction (foundry_id)           → actuals side (amount_cents
 *     signed, assigned_category, category_override, transaction_date)
 *
 * Empty-state policy (per the brief):
 *   - hasPlan === false AND xeroConnected === false   → full-page "Connect a
 *     data source and create a plan to see variance" card, no month cards.
 *   - Either exists → build month cards for the last 6 completed months +
 *     current month, using nulls where a side is missing.
 *   - No synthetic content (no Ada Chen / NimFarm / PCB copy) — the
 *     explainer text is deterministic, derived from the actual deltas.
 *
 * @related
 *   - View:   ./variance-view.tsx
 *   - Styles: ./variance-v2.css (scoped .var2)
 *   - Mockup: MONEY-MOCKUP-VARIANCE.html
 *   - Schema: MONEY-SCHEMA.md §2 plan_line_items + xero_transaction
 */

import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
    VarianceView,
    type TrendPoint,
    type VarianceCategory,
    type VarianceCategoryRow,
    type VarianceMonthCard,
    type VarianceViewProps,
} from "./variance-view"

export const metadata: Metadata = {
    title: "Variance · Money",
    description:
        "Plan vs actuals, month by month — where the money went and why the plan was wrong.",
}

export const dynamic = "force-dynamic"

const WINDOW_MONTHS = 6

export default async function MoneyVariancePage(): Promise<React.ReactNode> {
    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        return <NotInFoundry />
    }

    const supabase = await createClient()

    const currency = await loadCurrency(supabase, foundryId)
    const xeroConnected = await loadXeroConnected(supabase, foundryId)

    const windowStart = firstDayOfMonth(addMonths(startOfMonth(new Date()), -(WINDOW_MONTHS - 1)))
    const windowEnd = lastDayOfMonth(new Date())

    const planRows = await loadPlanRows(supabase, foundryId)
    const txRows = await loadTransactions(supabase, foundryId, windowStart, windowEnd)

    const hasPlan = planRows.length > 0
    const hasActuals = txRows.length > 0

    // Empty state — no plan AND no actuals.
    if (!hasPlan && !hasActuals) {
        const props: VarianceViewProps = {
            currency,
            months: [],
            xeroConnected,
            hasPlan: false,
            summary: null,
            trend: [],
        }
        return <VarianceView {...props} />
    }

    const months = buildMonthCards({
        now: new Date(),
        windowMonths: WINDOW_MONTHS,
        planRows,
        txRows,
    })

    const summary = buildSummary(months)
    const trend = buildTrend(months)

    const props: VarianceViewProps = {
        currency,
        months,
        xeroConnected,
        hasPlan,
        summary,
        trend,
    }
    return <VarianceView {...props} />
}

// ─── Loaders ────────────────────────────────────────────────────────────

async function loadCurrency(
    supabase: Awaited<ReturnType<typeof createClient>>,
    foundryId: string,
): Promise<string> {
    try {
        const { data } = await supabase
            .from("money_settings")
            .select("currency")
            .eq("foundry_id", foundryId)
            .maybeSingle()
        return data?.currency ?? "GBP"
    } catch (err) {
        console.error("[VARIANCE] loadCurrency failed:", err)
        return "GBP"
    }
}

async function loadXeroConnected(
    supabase: Awaited<ReturnType<typeof createClient>>,
    foundryId: string,
): Promise<boolean> {
    try {
        const { data } = await supabase
            .from("xero_connection")
            .select("foundry_id")
            .eq("foundry_id", foundryId)
            .maybeSingle()
        return data != null
    } catch (err) {
        console.error("[VARIANCE] loadXeroConnected failed:", err)
        return false
    }
}

interface PlanRow {
    direction: "out" | "in"
    category: string
    amountCents: number
    frequency: string
    effectiveFrom: string
    effectiveTo: string | null
    probabilityPct: number
}

async function loadPlanRows(
    supabase: Awaited<ReturnType<typeof createClient>>,
    foundryId: string,
): Promise<PlanRow[]> {
    try {
        const { data, error } = await supabase
            .from("plan_line_items")
            .select(
                "direction, category, amount_cents, frequency, effective_from, effective_to, probability_pct",
            )
            .eq("foundry_id", foundryId)
            .is("archived_at", null)
        if (error || !data) return []
        return data.map((r) => ({
            direction: r.direction === "in" ? "in" : "out",
            category: r.category,
            amountCents: r.amount_cents,
            frequency: r.frequency,
            effectiveFrom: r.effective_from,
            effectiveTo: r.effective_to,
            probabilityPct: r.probability_pct ?? 100,
        }))
    } catch (err) {
        console.error("[VARIANCE] loadPlanRows failed:", err)
        return []
    }
}

interface TxRow {
    transactionDate: string
    amountCents: number
    assignedCategory: string
    categoryOverride: string | null
}

async function loadTransactions(
    supabase: Awaited<ReturnType<typeof createClient>>,
    foundryId: string,
    windowStart: Date,
    windowEnd: Date,
): Promise<TxRow[]> {
    try {
        const { data, error } = await supabase
            .from("xero_transaction")
            .select(
                "transaction_date, amount_cents, assigned_category, category_override",
            )
            .eq("foundry_id", foundryId)
            .gte("transaction_date", isoDate(windowStart))
            .lte("transaction_date", isoDate(windowEnd))
        if (error || !data) return []
        return data.map((r) => ({
            transactionDate: r.transaction_date,
            amountCents: r.amount_cents,
            assignedCategory: r.assigned_category,
            categoryOverride: r.category_override,
        }))
    } catch (err) {
        console.error("[VARIANCE] loadTransactions failed:", err)
        return []
    }
}

// ─── Month-card builder ─────────────────────────────────────────────────

interface BuildArgs {
    now: Date
    windowMonths: number
    planRows: PlanRow[]
    txRows: TxRow[]
}

/**
 * Build one MonthCard per month in the rolling window. The window covers
 * the last `windowMonths − 1` completed months plus the current month,
 * oldest → newest.
 */
function buildMonthCards(args: BuildArgs): VarianceMonthCard[] {
    const { now, windowMonths, planRows, txRows } = args

    const months: VarianceMonthCard[] = []
    const currentStart = startOfMonth(now)

    for (let i = windowMonths - 1; i >= 0; i--) {
        const monthStart = addMonths(currentStart, -i)
        const monthEnd = lastDayOfMonth(monthStart)
        const isCurrent = sameMonth(monthStart, now)
        const isFuture = monthStart > now

        // Per-category aggregation.
        const categoryPlan = aggregatePlanByCategory(planRows, monthStart, monthEnd)
        const categoryActual = aggregateActualsByCategory(
            txRows,
            monthStart,
            monthEnd,
        )

        const { rows, planNetBurnCents, actualNetBurnCents } = buildCategoryRows({
            categoryPlan,
            categoryActual,
            isCurrent,
        })

        const daysInMonth = monthEnd.getDate()
        const daysElapsed = isCurrent
            ? Math.min(now.getDate(), daysInMonth)
            : isFuture
                ? 0
                : daysInMonth

        // For the current month, annualise actuals so plan-vs-actual is
        // apples-to-apples for the head-line diff.
        const annualisedActualCents =
            isCurrent && actualNetBurnCents != null && daysElapsed > 0
                ? Math.round((actualNetBurnCents / daysElapsed) * daysInMonth)
                : null

        // Head-line delta — closed months use raw actuals, current uses
        // annualised, future months have no delta.
        let deltaCents: number | null = null
        let tone: VarianceMonthCard["tone"] = "onpace"
        if (planNetBurnCents != null && actualNetBurnCents != null) {
            const compareActual = isCurrent
                ? annualisedActualCents ?? actualNetBurnCents
                : actualNetBurnCents
            deltaCents = compareActual - planNetBurnCents
            const onPaceThreshold = Math.max(500_00, Math.abs(planNetBurnCents) * 0.05) // 5% or £500
            if (Math.abs(deltaCents) <= onPaceThreshold) tone = "onpace"
            else if (deltaCents > 0) tone = "overrun"
            else tone = "under"
        } else if (isFuture || (planNetBurnCents != null && actualNetBurnCents == null)) {
            tone = "onpace"
        }

        const explainer = buildExplainer({
            rows,
            planNetBurnCents,
            actualNetBurnCents,
            annualisedActualCents,
            isCurrent,
            isFuture,
        })

        months.push({
            monthIso: isoDate(monthStart),
            label: formatMonthLabel(monthStart),
            state: isCurrent ? "current" : isFuture ? "future" : "closed",
            daysElapsed: isCurrent ? daysElapsed : null,
            daysInMonth,
            planNetBurnCents,
            actualNetBurnCents,
            annualisedActualCents,
            deltaCents,
            tone,
            rows,
            explainer,
        })
    }

    return months
}

// ─── Category aggregation ───────────────────────────────────────────────

/**
 * Map a `xero_transaction.assigned_category` value (free-ish text) to a
 * VarianceCategory bucket. Uses the schema's 6-cost + 4-income buckets
 * from MONEY-SCHEMA §plan_line_items.category. Unknown categories land
 * in "other".
 */
function mapToVarianceCategory(
    raw: string,
    direction: "out" | "in" | null,
): VarianceCategory {
    const c = (raw ?? "").toLowerCase().trim()
    if (direction === "in") return "cash_in"
    if (["revenue", "grants", "equity", "loans", "cash_in"].includes(c)) return "cash_in"
    if (c === "people") return "people"
    if (c === "premises") return "premises"
    if (c === "tools") return "tools"
    if (c === "materials") return "materials"
    if (c === "growth") return "growth"
    return "other"
}

const CATEGORY_LABEL: Record<VarianceCategory, string> = {
    people: "People",
    premises: "Premises",
    tools: "Tools",
    materials: "Materials",
    growth: "Growth",
    other: "Other",
    cash_in: "Cash in",
}

// Render order — cost categories first, cash_in last (mirrors mockup).
const CATEGORY_ORDER: VarianceCategory[] = [
    "people",
    "materials",
    "premises",
    "tools",
    "growth",
    "other",
    "cash_in",
]

/**
 * Project a plan line item's contribution to a given month. Honours
 * `frequency` + `effective_from` / `effective_to` + `probability_pct`.
 * Returns value in pence (always positive; direction tracked separately).
 */
function projectPlanToMonth(
    row: PlanRow,
    monthStart: Date,
    monthEnd: Date,
): number {
    const from = new Date(row.effectiveFrom)
    const to = row.effectiveTo ? new Date(row.effectiveTo) : null
    // Out of effective window entirely.
    if (from > monthEnd) return 0
    if (to && to < monthStart) return 0

    const probFactor = Math.max(0, Math.min(100, row.probabilityPct)) / 100
    const amount = Math.abs(row.amountCents) * probFactor

    switch (row.frequency) {
        case "monthly":
            return amount
        case "weekly":
            // Approx 4.33 weeks per month.
            return Math.round(amount * (365 / 12 / 7))
        case "quarterly":
            return Math.round(amount / 3)
        case "annual":
            return Math.round(amount / 12)
        case "one_off":
            // One-off lands only in the month containing effective_from.
            if (
                from.getUTCFullYear() === monthStart.getUTCFullYear() &&
                from.getUTCMonth() === monthStart.getUTCMonth()
            ) {
                return amount
            }
            return 0
        case "variable":
        default:
            // Variable lines contribute their amount per month as a baseline
            // within the effective window — founders can tune via frequency.
            return amount
    }
}

function aggregatePlanByCategory(
    plan: PlanRow[],
    monthStart: Date,
    monthEnd: Date,
): Map<VarianceCategory, { cents: number; hasAny: boolean }> {
    const out = new Map<VarianceCategory, { cents: number; hasAny: boolean }>()
    for (const row of plan) {
        const amount = projectPlanToMonth(row, monthStart, monthEnd)
        if (amount === 0) continue
        const cat = mapToVarianceCategory(
            row.category,
            row.direction === "in" ? "in" : "out",
        )
        const prev = out.get(cat) ?? { cents: 0, hasAny: false }
        prev.cents += amount
        prev.hasAny = true
        out.set(cat, prev)
    }
    return out
}

function aggregateActualsByCategory(
    tx: TxRow[],
    monthStart: Date,
    monthEnd: Date,
): Map<VarianceCategory, { cents: number; hasAny: boolean }> {
    const out = new Map<VarianceCategory, { cents: number; hasAny: boolean }>()
    const msIso = isoDate(monthStart)
    const meIso = isoDate(monthEnd)
    for (const t of tx) {
        if (t.transactionDate < msIso || t.transactionDate > meIso) continue
        // Sign convention in xero_transaction: negative = out, positive = in.
        const direction: "out" | "in" = t.amountCents < 0 ? "out" : "in"
        const rawCat = t.categoryOverride ?? t.assignedCategory
        const cat = mapToVarianceCategory(rawCat, direction)
        const prev = out.get(cat) ?? { cents: 0, hasAny: false }
        prev.cents += Math.abs(t.amountCents)
        prev.hasAny = true
        out.set(cat, prev)
    }
    return out
}

function buildCategoryRows(input: {
    categoryPlan: Map<VarianceCategory, { cents: number; hasAny: boolean }>
    categoryActual: Map<VarianceCategory, { cents: number; hasAny: boolean }>
    isCurrent: boolean
}): {
    rows: VarianceCategoryRow[]
    planNetBurnCents: number | null
    actualNetBurnCents: number | null
} {
    const { categoryPlan, categoryActual } = input

    // Max cents across plan + actual, across all cost categories — used for
    // bar width scaling so rows share a comparable ruler.
    let maxCents = 0
    for (const cat of CATEGORY_ORDER) {
        const p = categoryPlan.get(cat)?.cents ?? 0
        const a = categoryActual.get(cat)?.cents ?? 0
        if (p > maxCents) maxCents = p
        if (a > maxCents) maxCents = a
    }

    const rows: VarianceCategoryRow[] = []
    for (const cat of CATEGORY_ORDER) {
        const planEntry = categoryPlan.get(cat)
        const actualEntry = categoryActual.get(cat)
        if (!planEntry && !actualEntry) continue

        const planCents = planEntry?.cents ?? 0
        const actualCents = actualEntry?.cents ?? 0
        const deltaCents = actualCents - planCents

        const isCashIn = cat === "cash_in"
        // "good" = cost under plan OR cash_in over plan.
        const good = isCashIn ? deltaCents >= 0 : deltaCents <= 0

        const planPct = maxCents > 0 ? (planCents / maxCents) * 100 : 0
        const actualPct = maxCents > 0 ? (actualCents / maxCents) * 100 : 0

        rows.push({
            category: cat,
            label: CATEGORY_LABEL[cat],
            planCents,
            actualCents,
            deltaCents: isCashIn ? -deltaCents : deltaCents, // show cash_in shortfall as positive (bad)
            good,
            planPct,
            actualPct,
        })
    }

    // Net burn = cost out − cash in. Null when the whole side is missing.
    const planCostCents = CATEGORY_ORDER
        .filter((c) => c !== "cash_in")
        .reduce((s, c) => s + (categoryPlan.get(c)?.cents ?? 0), 0)
    const planCashInCents = categoryPlan.get("cash_in")?.cents ?? 0
    const planHasAny = Array.from(categoryPlan.values()).some((v) => v.hasAny)
    const planNetBurnCents = planHasAny
        ? planCostCents - planCashInCents
        : null

    const actualCostCents = CATEGORY_ORDER
        .filter((c) => c !== "cash_in")
        .reduce((s, c) => s + (categoryActual.get(c)?.cents ?? 0), 0)
    const actualCashInCents = categoryActual.get("cash_in")?.cents ?? 0
    const actualHasAny = Array.from(categoryActual.values()).some((v) => v.hasAny)
    const actualNetBurnCents = actualHasAny
        ? actualCostCents - actualCashInCents
        : null

    return { rows, planNetBurnCents, actualNetBurnCents }
}

// ─── Explainer text (deterministic, no hallucination) ───────────────────

function buildExplainer(input: {
    rows: VarianceCategoryRow[]
    planNetBurnCents: number | null
    actualNetBurnCents: number | null
    annualisedActualCents: number | null
    isCurrent: boolean
    isFuture: boolean
}): string {
    const {
        rows,
        planNetBurnCents,
        actualNetBurnCents,
        annualisedActualCents,
        isCurrent,
        isFuture,
    } = input

    if (isFuture) {
        return "Upcoming month — plan only. Once actuals arrive, variance will populate here."
    }

    if (planNetBurnCents == null && actualNetBurnCents == null) {
        return "No plan lines and no actuals in this month yet."
    }
    if (planNetBurnCents == null) {
        return "Actuals only — no plan lines effective this month, so the compare is one-sided."
    }
    if (actualNetBurnCents == null) {
        return "Plan only — no actuals categorised for this month yet."
    }

    // Find biggest |delta| on the cost side to call out.
    const costRows = rows.filter((r) => r.category !== "cash_in")
    const biggest = costRows
        .slice()
        .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents))[0]

    const compareActual = isCurrent
        ? annualisedActualCents ?? actualNetBurnCents
        : actualNetBurnCents
    const netDelta = compareActual - planNetBurnCents

    const direction =
        netDelta > 0 ? "over plan" : netDelta < 0 ? "under plan" : "on plan"
    const headline = isCurrent
        ? `Tracking ${direction} mid-month.`
        : `Closed ${direction}.`

    if (!biggest || biggest.deltaCents === 0) {
        return `${headline} Category deltas are flat — no single line dominates the variance.`
    }

    const biggestDir = biggest.deltaCents > 0 ? "above" : "below"
    return `${headline} Biggest category delta: ${biggest.label} is ${biggestDir} plan by the largest margin this month — open the drill-in to see which transactions drove it.`
}

// ─── Summary + trend ────────────────────────────────────────────────────

function buildSummary(months: VarianceMonthCard[]): VarianceViewProps["summary"] {
    const closedOrCurrent = months.filter((m) => m.state !== "future")
    if (closedOrCurrent.length === 0) return null

    const cumulative = closedOrCurrent.reduce(
        (s, m) => s + (m.deltaCents ?? 0),
        0,
    )

    let biggestOverrun: { monthLabel: string; cents: number } | null = null
    for (const m of closedOrCurrent) {
        if (m.deltaCents != null && m.deltaCents > 0) {
            if (!biggestOverrun || m.deltaCents > biggestOverrun.cents) {
                biggestOverrun = { monthLabel: m.label, cents: m.deltaCents }
            }
        }
    }

    const monthsOnOrUnder = closedOrCurrent.filter(
        (m) => m.tone !== "overrun",
    ).length

    const first = closedOrCurrent[0]
    const last = closedOrCurrent[closedOrCurrent.length - 1]
    const windowLabel = `${shortMonthLabel(new Date(first.monthIso))} → ${shortMonthLabel(new Date(last.monthIso))}`

    return {
        monthsTracked: closedOrCurrent.length,
        windowLabel,
        cumulativeVarianceCents: cumulative,
        biggestOverrun,
        monthsOnOrUnder,
    }
}

function buildTrend(months: VarianceMonthCard[]): TrendPoint[] {
    const closedOrCurrent = months.filter((m) => m.state !== "future")
    const points: TrendPoint[] = []
    let running = 0
    for (const m of closedOrCurrent) {
        running += m.deltaCents ?? 0
        points.push({
            label: shortMonthLabel(new Date(m.monthIso)),
            cumDriftCents: running,
        })
    }
    return points
}

// ─── Date helpers ───────────────────────────────────────────────────────

function startOfMonth(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}
function firstDayOfMonth(d: Date): Date {
    return startOfMonth(d)
}
function lastDayOfMonth(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
}
function addMonths(d: Date, n: number): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
}
function sameMonth(a: Date, b: Date): boolean {
    return (
        a.getUTCFullYear() === b.getUTCFullYear() &&
        a.getUTCMonth() === b.getUTCMonth()
    )
}
function isoDate(d: Date): string {
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(d.getUTCDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
}
function formatMonthLabel(d: Date): string {
    return d.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    })
}
function shortMonthLabel(d: Date): string {
    return d.toLocaleDateString("en-GB", {
        month: "short",
        timeZone: "UTC",
    })
}

// ─── Fallback: user not in a foundry ────────────────────────────────────

function NotInFoundry(): React.ReactElement {
    return (
        <div
            style={{
                padding: "48px 32px",
                maxWidth: 640,
                margin: "48px auto",
                textAlign: "center",
            }}
        >
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
                Variance needs a foundry
            </h1>
            <p style={{ color: "#78716c", fontSize: 14, lineHeight: 1.55 }}>
                You aren&apos;t a member of a foundry yet. Create one or accept
                a pending invite to see your plan vs actuals.
            </p>
        </div>
    )
}

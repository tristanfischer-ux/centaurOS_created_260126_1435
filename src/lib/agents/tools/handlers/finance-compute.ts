/**
 * @file finance-compute.ts — Structured financial computation tools.
 *
 * @description Provides real computation tools for financial analysis. Unlike
 * the general-purpose JS sandbox (compute.ts), these tools fetch actual company
 * data from Supabase and run deterministic calculations — the LLM provides
 * parameters, the handler does the math.
 *
 * INTENT: Founders ask "what's my burn rate?" or "how long is my runway?" — these
 * numbers must come from real expense data, not LLM estimation. These handlers
 * query actual financial records and compute real answers.
 *
 * @security All queries filter by foundry_id. Read-only.
 *
 * @related
 * - Finance data handler: src/lib/agents/tools/handlers/finance.ts
 * - Engineering compute pattern: src/lib/agents/tools/handlers/engineering-compute.ts
 * - Tool definitions: src/lib/agents/tools/definitions.ts
 * - Tool registry: src/lib/agents/tools/registry.ts
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ToolHandler } from "./common"

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Convert smallest currency unit (pence/cents) to display string with currency symbol.
 * Uses Intl.NumberFormat for automatic locale + symbol handling.
 */
function formatAmount(amount: number, currency = "GBP"): string {
    const locale = currency === "USD" ? "en-US" : currency === "EUR" ? "de-DE" : "en-GB"
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100)
}

/** Get YYYY-MM key from a date string. Returns null if date is invalid. */
function toMonthKey(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return null
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Safely compute a future month label (handles year rollover correctly). */
function futureMonthLabel(monthsAhead: number): string {
    const d = new Date()
    d.setDate(1) // Avoid month-end rollover (Jan 31 + 1 month → Mar 3)
    d.setMonth(d.getMonth() + monthsAhead)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Module-level cache for foundry currency lookups (60s TTL). */
const currencyCache = new Map<string, { value: string; ts: number }>()
const CURRENCY_CACHE_TTL_MS = 60_000

/** Fetch the company's currency from foundry profile (cached 60s). */
async function getFoundryCurrency(foundryId: string): Promise<string> {
    const cached = currencyCache.get(foundryId)
    if (cached && Date.now() - cached.ts < CURRENCY_CACHE_TTL_MS) {
        return cached.value
    }
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("foundries")
        .select("currency")
        .eq("id", foundryId)
        .single()
    const currency = data?.currency ?? "GBP"
    currencyCache.set(foundryId, { value: currency, ts: Date.now() })
    return currency
}

// ─── analyze_cashflow ───────────────────────────────────────────────

/**
 * Analyzes cash flow by aggregating expenses and invoice revenue into monthly
 * buckets, computing burn rate, runway, and trend.
 */
export const handleAnalyzeCashflow: ToolHandler = async (args, ctx) => {
    const horizonMonths = Math.min(Math.max((args.time_horizon_months as number) ?? 6, 1), 24)
    const includeProjections = (args.include_projections as boolean) ?? false
    const supabase = createAdminClient()
    const currency = await getFoundryCurrency(ctx.foundryId)

    // Fetch data for the lookback period (double the horizon for trend analysis)
    const lookbackMs = horizonMonths * 2 * 30 * 24 * 60 * 60 * 1000
    const startDate = new Date(Date.now() - lookbackMs).toISOString().split("T")[0]

    const [expensesRes, invoicesRes] = await Promise.all([
        supabase
            .from("finance_expenses")
            .select("amount, expense_date, category, status")
            .eq("foundry_id", ctx.foundryId)
            .gte("expense_date", startDate)
            .in("status", ["approved", "paid"])
            .order("expense_date", { ascending: true }),
        supabase
            .from("finance_standalone_invoices")
            .select("total, status, due_date, created_at")
            .eq("foundry_id", ctx.foundryId)
            .gte("created_at", startDate + "T00:00:00Z")
            .in("status", ["sent", "paid"])
            .order("created_at", { ascending: true }),
    ])

    if (expensesRes.error) {
        return `## Cash Flow Analysis\n\nError fetching expenses: ${expensesRes.error.message}`
    }
    if (invoicesRes.error) {
        return `## Cash Flow Analysis\n\nError fetching invoices: ${invoicesRes.error.message}`
    }

    const expenses = expensesRes.data ?? []
    const invoices = invoicesRes.data ?? []

    // Aggregate into monthly buckets
    const monthlyOutflows: Record<string, number> = {}
    const monthlyInflows: Record<string, number> = {}

    for (const e of expenses) {
        const key = toMonthKey(e.expense_date)
        if (!key) continue
        monthlyOutflows[key] = (monthlyOutflows[key] ?? 0) + (e.amount ?? 0)
    }

    for (const inv of invoices) {
        const key = toMonthKey(inv.created_at ?? inv.due_date)
        if (!key) continue
        monthlyInflows[key] = (monthlyInflows[key] ?? 0) + (inv.total ?? 0)
    }

    // Build sorted month list
    const allMonths = [...new Set([...Object.keys(monthlyOutflows), ...Object.keys(monthlyInflows)])].sort()

    if (allMonths.length === 0) {
        return "## Cash Flow Analysis\n\nNo financial data found for the requested period. Record some expenses or invoices first."
    }

    // Compute monthly net and running totals
    const monthData = allMonths.map((month) => {
        const inflow = monthlyInflows[month] ?? 0
        const outflow = monthlyOutflows[month] ?? 0
        return { month, inflow, outflow, net: inflow - outflow }
    })

    // Burn rate (average monthly outflow over last 3 months or available data)
    const recentMonths = monthData.slice(-Math.min(3, monthData.length))
    const avgMonthlyBurn = recentMonths.reduce((s, m) => s + m.outflow, 0) / recentMonths.length
    const avgMonthlyRevenue = recentMonths.reduce((s, m) => s + m.inflow, 0) / recentMonths.length
    const netBurn = avgMonthlyBurn - avgMonthlyRevenue

    let md = `## Cash Flow Analysis\n\n`
    md += `### Key Metrics\n\n`
    md += `| Metric | Value |\n|--------|-------|\n`
    md += `| Avg monthly expenses (last ${recentMonths.length}mo) | ${formatAmount(avgMonthlyBurn, currency)} |\n`
    md += `| Avg monthly revenue (last ${recentMonths.length}mo) | ${formatAmount(avgMonthlyRevenue, currency)} |\n`
    md += `| Net monthly burn | ${formatAmount(netBurn, currency)} |\n`
    if (netBurn > 0) {
        md += `| **Note** | Company is spending more than it earns — net burn is positive |\n`
    }
    md += "\n"

    // Monthly breakdown table
    md += `### Monthly Breakdown\n\n`
    md += `| Month | Inflows | Outflows | Net |\n|-------|---------|----------|-----|\n`
    for (const m of monthData) {
        const netSign = m.net >= 0 ? "+" : ""
        md += `| ${m.month} | ${formatAmount(m.inflow, currency)} | ${formatAmount(m.outflow, currency)} | ${netSign}${formatAmount(m.net, currency)} |\n`
    }
    md += "\n"

    // Expense breakdown by category
    const categoryTotals: Record<string, number> = {}
    for (const e of expenses) {
        const cat = e.category ?? "other"
        categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (e.amount ?? 0)
    }
    const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])

    md += `### Expense Breakdown by Category\n\n`
    md += `| Category | Total | % of Spend |\n|----------|-------|------------|\n`
    const totalSpend = sortedCats.reduce((s, [, v]) => s + v, 0)
    for (const [cat, amt] of sortedCats) {
        const pct = totalSpend > 0 ? ((amt / totalSpend) * 100).toFixed(1) : "0"
        md += `| ${cat} | ${formatAmount(amt, currency)} | ${pct}% |\n`
    }
    md += "\n"

    // Simple projection if requested
    if (includeProjections && monthData.length >= 2) {
        md += `### Projection (next ${horizonMonths} months)\n\n`
        md += `Based on recent trend, assuming current burn rate continues:\n\n`

        // Linear trend on net cash flow
        const netValues = monthData.map((m) => m.net)
        const n = netValues.length
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
        for (let i = 0; i < n; i++) {
            sumX += i
            sumY += netValues[i]
            sumXY += i * netValues[i]
            sumX2 += i * i
        }
        const denom = n * sumX2 - sumX ** 2
        const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
        const intercept = (sumY - slope * sumX) / n

        md += `| Month | Projected Net |\n|-------|---------------|\n`
        for (let i = 0; i < horizonMonths; i++) {
            const projected = slope * (n + i) + intercept
            const sign = projected >= 0 ? "+" : ""
            md += `| ${futureMonthLabel(i + 1)} | ${sign}${formatAmount(projected, currency)} |\n`
        }
        md += "\n"
    }

    // Chart spec for net cash flow
    const chartData = monthData.map((m) => ({
        label: m.month,
        value: Math.round(m.inflow / 100),
        value2: Math.round(m.outflow / 100),
    }))
    md += `\n<!-- CHART ${JSON.stringify({
        type: "bar",
        title: "Monthly Cash Flow",
        data: chartData,
        xLabel: "Month",
        yLabel: "Amount",
        seriesName: "Revenue",
        series2Name: "Expenses",
    })} -->`

    return md
}

// ─── analyze_budget_variance ────────────────────────────────────────

/**
 * Compares actual spending against budgets to identify over/under-spend
 * by category.
 */
export const handleAnalyzeBudgetVariance: ToolHandler = async (args, ctx) => {
    const budgetId = args.budget_id as string | undefined
    const period = (args.period as string) ?? "monthly"
    if (period !== "monthly" && period !== "quarterly") {
        return "## Budget Variance Analysis\n\nInvalid period. Use 'monthly' or 'quarterly'."
    }
    const supabase = createAdminClient()
    const currency = await getFoundryCurrency(ctx.foundryId)

    // Fetch active budgets
    let budgetQuery = supabase
        .from("finance_budgets")
        .select("id, name, category, amount, currency, period, start_date, end_date")
        .eq("foundry_id", ctx.foundryId)
        .eq("is_active", true)

    if (budgetId) {
        budgetQuery = budgetQuery.eq("id", budgetId)
    }

    const { data: budgets, error: budgetError } = await budgetQuery.limit(20)

    if (budgetError) {
        return `## Budget Variance Analysis\n\nError fetching budgets: ${budgetError.message}`
    }

    if (!budgets || budgets.length === 0) {
        return "## Budget Variance Analysis\n\nNo active budgets found. Create budgets first to track variance."
    }

    // Determine analysis period
    const now = new Date()
    let periodStart: Date
    let periodLabel: string

    if (period === "quarterly") {
        const quarterStart = Math.floor(now.getMonth() / 3) * 3
        periodStart = new Date(now.getFullYear(), quarterStart, 1)
        periodLabel = `Q${Math.floor(quarterStart / 3) + 1} ${now.getFullYear()}`
    } else {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
        periodLabel = `${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}`
    }

    const periodStartStr = periodStart.toISOString().split("T")[0]

    // Fetch actual expenses for the period
    const { data: expenses, error: expenseError } = await supabase
        .from("finance_expenses")
        .select("amount, category, status")
        .eq("foundry_id", ctx.foundryId)
        .gte("expense_date", periodStartStr)
        .in("status", ["approved", "paid"])

    if (expenseError) {
        return `## Budget Variance Analysis\n\nError fetching expenses: ${expenseError.message}`
    }

    // Aggregate actual spend by category
    const actualByCategory: Record<string, number> = {}
    for (const e of expenses ?? []) {
        const cat = e.category ?? "other"
        actualByCategory[cat] = (actualByCategory[cat] ?? 0) + (e.amount ?? 0)
    }

    // Compute variance per budget
    let md = `## Budget Variance Analysis — ${periodLabel}\n\n`
    md += `| Budget | Category | Budgeted | Actual | Variance | Status |\n`
    md += `|--------|----------|----------|--------|----------|--------|\n`

    let totalBudgeted = 0
    let totalActual = 0
    const chartData: Array<{ label: string; value: number; value2: number }> = []

    for (const b of budgets) {
        // Normalize budget amount to the analysis period
        let budgetAmount = b.amount
        if (b.period === "annual" && period === "monthly") {
            budgetAmount = Math.round(b.amount / 12)
        } else if (b.period === "annual" && period === "quarterly") {
            budgetAmount = Math.round(b.amount / 4)
        } else if (b.period === "quarterly" && period === "monthly") {
            budgetAmount = Math.round(b.amount / 3)
        } else if (b.period === "monthly" && period === "quarterly") {
            budgetAmount = b.amount * 3
        }

        const actual = actualByCategory[b.category] ?? 0
        const variance = budgetAmount - actual
        const variancePct = budgetAmount > 0 ? ((variance / budgetAmount) * 100).toFixed(1) : "N/A"
        const status = variance >= 0 ? "Under budget" : "**OVER BUDGET**"

        totalBudgeted += budgetAmount
        totalActual += actual

        // Use normalized budgetAmount for chart (not raw b.amount)
        chartData.push({
            label: b.name,
            value: Math.round(budgetAmount / 100),
            value2: Math.round(actual / 100),
        })

        md += `| ${b.name} | ${b.category} | ${formatAmount(budgetAmount, currency)} | ${formatAmount(actual, currency)} | ${variance >= 0 ? "+" : ""}${formatAmount(variance, currency)} (${variancePct}%) | ${status} |\n`
    }

    const totalVariance = totalBudgeted - totalActual
    md += `| **Total** | | **${formatAmount(totalBudgeted, currency)}** | **${formatAmount(totalActual, currency)}** | **${totalVariance >= 0 ? "+" : ""}${formatAmount(totalVariance, currency)}** | ${totalVariance >= 0 ? "Under budget" : "**OVER BUDGET**"} |\n`
    md += "\n"

    // Unbudgeted categories
    const budgetedCategories = new Set(budgets.map((b) => b.category))
    const unbudgeted = Object.entries(actualByCategory).filter(([cat]) => !budgetedCategories.has(cat))
    if (unbudgeted.length > 0) {
        md += `### Unbudgeted Spending\n\n`
        md += `| Category | Amount |\n|----------|--------|\n`
        for (const [cat, amt] of unbudgeted.sort((a, b) => b[1] - a[1])) {
            md += `| ${cat} | ${formatAmount(amt, currency)} |\n`
        }
        md += "\n"
    }

    // Chart: budget vs actual (uses period-normalized amounts built above)
    md += `\n<!-- CHART ${JSON.stringify({
        type: "bar",
        title: "Budget vs Actual",
        data: chartData,
        xLabel: "Budget",
        yLabel: "Amount",
        seriesName: "Budgeted",
        series2Name: "Actual",
    })} -->`

    return md
}

// ─── calculate_unit_economics ───────────────────────────────────────

/**
 * Pure computation tool — no DB fetch. LLM provides the numbers from
 * conversation context. Computes LTV, LTV/CAC ratio, payback period.
 */
export const handleCalculateUnitEconomics: ToolHandler = async (args, _ctx) => {
    const cac = args.cac as number
    const monthlyRevenue = args.monthly_revenue_per_customer as number
    const grossMarginPct = (args.gross_margin_pct as number) ?? 100
    const monthlyChurnRate = (args.monthly_churn_rate as number) ?? 0

    if (cac == null || monthlyRevenue == null) {
        return "Error: `cac` and `monthly_revenue_per_customer` are required."
    }
    if (cac < 0 || monthlyRevenue < 0) {
        return "Error: `cac` and `monthly_revenue_per_customer` must be non-negative."
    }
    if (grossMarginPct < 0 || grossMarginPct > 100) {
        return "Error: `gross_margin_pct` must be between 0 and 100."
    }
    if (monthlyChurnRate < 0 || monthlyChurnRate > 1) {
        return "Error: `monthly_churn_rate` must be between 0 and 1 (e.g., 0.05 for 5%)."
    }

    const marginDecimal = grossMarginPct / 100
    const monthlyGrossProfit = monthlyRevenue * marginDecimal

    // LTV calculation
    const effectiveChurn = monthlyChurnRate > 0 ? monthlyChurnRate : 0.01
    const avgLifetimeMonths = 1 / effectiveChurn
    const ltv = monthlyGrossProfit * avgLifetimeMonths

    // Ratios
    const ltvCacRatio = cac > 0 ? ltv / cac : Infinity
    const paybackMonths = monthlyGrossProfit > 0 ? cac / monthlyGrossProfit : Infinity

    // Break-even customers (how many customers to cover fixed costs)
    const annualGrossProfit = monthlyGrossProfit * 12

    // Health assessment
    let health: string
    if (ltvCacRatio >= 3) {
        health = "Healthy — LTV/CAC >= 3x is the standard benchmark"
    } else if (ltvCacRatio >= 1) {
        health = "Warning — LTV/CAC between 1-3x means you're recovering costs but margins are tight"
    } else {
        health = "Critical — LTV/CAC < 1x means you're losing money on each customer"
    }

    let paybackHealth: string
    if (paybackMonths <= 12) {
        paybackHealth = "Good — recovering CAC within 12 months"
    } else if (paybackMonths <= 18) {
        paybackHealth = "Acceptable — 12-18 month payback is common for SaaS"
    } else {
        paybackHealth = "Slow — payback over 18 months strains cash flow"
    }

    let md = `## Unit Economics Analysis\n\n`
    md += `### Inputs\n\n`
    md += `| Parameter | Value |\n|-----------|-------|\n`
    md += `| Customer Acquisition Cost (CAC) | ${cac.toLocaleString()} |\n`
    md += `| Monthly Revenue per Customer | ${monthlyRevenue.toLocaleString()} |\n`
    md += `| Gross Margin | ${grossMarginPct}% |\n`
    md += `| Monthly Churn Rate | ${(effectiveChurn * 100).toFixed(1)}% |\n`
    md += "\n"

    md += `### Results\n\n`
    md += `| Metric | Value | Assessment |\n|--------|-------|------------|\n`
    md += `| Lifetime Value (LTV) | ${ltv.toLocaleString(undefined, { maximumFractionDigits: 0 })} | Avg customer lifetime: ${avgLifetimeMonths.toFixed(1)} months |\n`
    md += `| LTV/CAC Ratio | ${ltvCacRatio.toFixed(2)}x | ${health} |\n`
    md += `| Payback Period | ${paybackMonths.toFixed(1)} months | ${paybackHealth} |\n`
    md += `| Monthly Gross Profit / Customer | ${monthlyGrossProfit.toLocaleString()} | |\n`
    md += `| Annual Gross Profit / Customer | ${annualGrossProfit.toLocaleString()} | |\n`
    md += "\n"

    return md
}

// ─── forecast_metric ────────────────────────────────────────────────

/**
 * Forecasts a financial metric using historical data. Supports linear regression
 * and exponential smoothing for trend projection with confidence intervals.
 *
 * DECISION: Using TypeScript linear regression instead of Modal Python here.
 * The math is simple enough (OLS regression) that numpy is overkill, and
 * avoiding the Modal round-trip keeps latency low for a frequently-used tool.
 */
export const handleForecastMetric: ToolHandler = async (args, ctx) => {
    const metric = (args.metric as string) ?? "expenses"
    const method = (args.method as string) ?? "linear"
    const periodsAhead = Math.min(Math.max((args.periods_ahead as number) ?? 3, 1), 12)

    if (!["revenue", "invoices", "expenses", "burn_rate"].includes(metric)) {
        return "## Forecast Error\n\nInvalid metric. Use 'revenue', 'expenses', or 'burn_rate'."
    }
    if (!["linear", "exponential"].includes(method)) {
        return "## Forecast Error\n\nInvalid method. Use 'linear' or 'exponential'."
    }

    const supabase = createAdminClient()
    const currency = await getFoundryCurrency(ctx.foundryId)

    // Fetch 12 months of historical data
    const lookbackDate = new Date()
    lookbackDate.setDate(1) // Avoid month-end rollover
    lookbackDate.setMonth(lookbackDate.getMonth() - 12)
    const startStr = lookbackDate.toISOString().split("T")[0]

    const monthlyValues: Record<string, number> = {}

    if (metric === "revenue" || metric === "invoices") {
        const { data, error } = await supabase
            .from("finance_standalone_invoices")
            .select("total, created_at, status")
            .eq("foundry_id", ctx.foundryId)
            .gte("created_at", startStr + "T00:00:00Z")
            .in("status", ["sent", "paid"])

        if (error) {
            return `## ${metric} Forecast\n\nError fetching invoice data: ${error.message}`
        }

        for (const inv of data ?? []) {
            const key = toMonthKey(inv.created_at)
            if (!key) continue
            monthlyValues[key] = (monthlyValues[key] ?? 0) + (inv.total ?? 0)
        }
    } else {
        // Default: expenses / burn_rate
        const { data, error } = await supabase
            .from("finance_expenses")
            .select("amount, expense_date, status")
            .eq("foundry_id", ctx.foundryId)
            .gte("expense_date", startStr)
            .in("status", ["approved", "paid"])

        if (error) {
            return `## ${metric} Forecast\n\nError fetching expense data: ${error.message}`
        }

        for (const e of data ?? []) {
            const key = toMonthKey(e.expense_date)
            if (!key) continue
            monthlyValues[key] = (monthlyValues[key] ?? 0) + (e.amount ?? 0)
        }
    }

    // Sort months and extract values
    const sortedMonths = Object.keys(monthlyValues).sort()
    if (sortedMonths.length < 3) {
        return `## ${metric.charAt(0).toUpperCase() + metric.slice(1)} Forecast\n\nInsufficient historical data (need at least 3 months, found ${sortedMonths.length}). Record more financial data to enable forecasting.`
    }

    const values = sortedMonths.map((m) => monthlyValues[m])
    const n = values.length
    const metricLabel = metric.charAt(0).toUpperCase() + metric.slice(1)

    // Branch on method
    if (method === "exponential") {
        // ── Exponential smoothing (alpha=0.3) ──
        const alpha = 0.3
        const smoothed: number[] = [values[0]]
        for (let i = 1; i < n; i++) {
            smoothed.push(alpha * values[i] + (1 - alpha) * smoothed[i - 1])
        }
        const lastSmoothed = smoothed[n - 1]

        // MAE (mean absolute error) as fit metric
        let totalAbsError = 0
        for (let i = 1; i < n; i++) {
            totalAbsError += Math.abs(values[i] - smoothed[i - 1])
        }
        const mae = n > 1 ? totalAbsError / (n - 1) : 0

        // Forecast: extend last smoothed value (flat forecast for single exponential smoothing)
        const forecasts: Array<{ month: string; predicted: number; lower: number; upper: number }> = []
        for (let i = 0; i < periodsAhead; i++) {
            // 80% interval using MAE as spread estimate (z ≈ 1.28), widening with sqrt of horizon
            const margin = 1.28 * mae * Math.sqrt(i + 1)
            forecasts.push({
                month: futureMonthLabel(i + 1),
                predicted: Math.max(0, lastSmoothed),
                lower: Math.max(0, lastSmoothed - margin),
                upper: lastSmoothed + margin,
            })
        }

        const meanValue = values.reduce((a, b) => a + b, 0) / n

        let md = `## ${metricLabel} Forecast\n\n`
        md += `**Method:** Exponential smoothing (α=${alpha})\n`
        md += `**Based on:** ${n} months of historical data\n`
        md += `**MAE (fit quality):** ${formatAmount(mae, currency)} ${meanValue > 0 && mae / meanValue < 0.15 ? "(good fit)" : meanValue > 0 && mae / meanValue < 0.3 ? "(moderate fit)" : "(weak fit — treat projections with caution)"}\n`
        md += `**Last smoothed value:** ${formatAmount(lastSmoothed, currency)}\n\n`

        // Historical table
        md += `### Historical Data\n\n`
        md += `| Month | Actual | Smoothed |\n|-------|--------|----------|\n`
        for (let i = 0; i < sortedMonths.length; i++) {
            md += `| ${sortedMonths[i]} | ${formatAmount(values[i], currency)} | ${formatAmount(smoothed[i], currency)} |\n`
        }
        md += "\n"

        // Forecast table
        md += `### Forecast (next ${periodsAhead} months)\n\n`
        md += `| Month | Predicted | Range (80% confidence) |\n|-------|-----------|------------------------|\n`
        for (const f of forecasts) {
            md += `| ${f.month} | ${formatAmount(f.predicted, currency)} | ${formatAmount(f.lower, currency)} – ${formatAmount(f.upper, currency)} |\n`
        }
        md += "\n"

        // Chart
        const chartData = [
            ...sortedMonths.map((m, i) => ({
                label: m,
                value: Math.round(values[i] / 100),
                value2: Math.round(smoothed[i] / 100),
            })),
            ...forecasts.map((f) => ({
                label: f.month + " (F)",
                value: 0,
                value2: Math.round(f.predicted / 100),
            })),
        ]
        md += `\n<!-- CHART ${JSON.stringify({
            type: "line",
            title: `${metricLabel} — Historical & Forecast (Exponential Smoothing)`,
            data: chartData,
            xLabel: "Month",
            yLabel: "Amount",
            seriesName: "Actual",
            series2Name: "Smoothed/Forecast",
        })} -->`

        return md
    }

    // ── Linear regression (default) ──
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    for (let i = 0; i < n; i++) {
        sumX += i
        sumY += values[i]
        sumXY += i * values[i]
        sumX2 += i * i
    }
    const denom = n * sumX2 - sumX ** 2
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
    const intercept = (sumY - slope * sumX) / n

    // R-squared
    const yMean = sumY / n
    let ssTot = 0, ssRes = 0
    for (let i = 0; i < n; i++) {
        ssTot += (values[i] - yMean) ** 2
        ssRes += (values[i] - (slope * i + intercept)) ** 2
    }
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0

    // Standard error for confidence intervals
    const se = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0

    // Denominator for prediction interval: sum of squared deviations of x from mean
    // GOTCHA: When all x values are the same (n=1, impossible here due to n>=3 check),
    // sxDev would be 0. With n>=3, sumX2 - sumX²/n is always > 0.
    const sxDev = sumX2 - (sumX ** 2) / n

    // Forecast
    const forecasts: Array<{ month: string; predicted: number; lower: number; upper: number }> = []
    for (let i = 0; i < periodsAhead; i++) {
        const futureIdx = n + i
        const predicted = slope * futureIdx + intercept
        const xMean = sumX / n
        // Approximate 80% prediction interval (z ≈ 1.28 for 80% two-sided)
        const margin = sxDev > 0
            ? 1.28 * se * Math.sqrt(1 + 1 / n + ((futureIdx - xMean) ** 2) / sxDev)
            : 1.28 * se // Fallback: no x-deviation correction when data is degenerate
        forecasts.push({
            month: futureMonthLabel(i + 1),
            predicted: Math.max(0, predicted),
            lower: Math.max(0, predicted - margin),
            upper: predicted + margin,
        })
    }

    let md = `## ${metricLabel} Forecast\n\n`
    md += `**Method:** Linear regression\n`
    md += `**Based on:** ${n} months of historical data\n`
    md += `**R² (fit quality):** ${rSquared.toFixed(3)} ${rSquared > 0.7 ? "(good fit)" : rSquared > 0.4 ? "(moderate fit)" : "(weak fit — treat projections with caution)"}\n`
    md += `**Trend:** ${slope > 0 ? "Increasing" : slope < 0 ? "Decreasing" : "Flat"} at ${formatAmount(Math.abs(slope), currency)}/month\n\n`

    // Historical table
    md += `### Historical Data\n\n`
    md += `| Month | Actual |\n|-------|--------|\n`
    for (let i = 0; i < sortedMonths.length; i++) {
        md += `| ${sortedMonths[i]} | ${formatAmount(values[i], currency)} |\n`
    }
    md += "\n"

    // Forecast table
    md += `### Forecast (next ${periodsAhead} months)\n\n`
    md += `| Month | Predicted | Range (80% confidence) |\n|-------|-----------|------------------------|\n`
    for (const f of forecasts) {
        md += `| ${f.month} | ${formatAmount(f.predicted, currency)} | ${formatAmount(f.lower, currency)} – ${formatAmount(f.upper, currency)} |\n`
    }
    md += "\n"

    // Chart: historical + forecast
    const chartData = [
        ...sortedMonths.map((m, i) => ({
            label: m,
            value: Math.round(values[i] / 100),
            value2: Math.round((slope * i + intercept) / 100),
        })),
        ...forecasts.map((f) => ({
            label: f.month + " (F)",
            value: 0,
            value2: Math.round(f.predicted / 100),
        })),
    ]
    md += `\n<!-- CHART ${JSON.stringify({
        type: "line",
        title: `${metricLabel} — Historical & Forecast`,
        data: chartData,
        xLabel: "Month",
        yLabel: "Amount",
        seriesName: "Actual",
        series2Name: "Trend/Forecast",
    })} -->`

    return md
}

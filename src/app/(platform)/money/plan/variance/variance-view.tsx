/**
 * VarianceView — Money Plan Variance page (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-VARIANCE.html. Scoped CSS under `.var2` keeps the
 * styling isolated so the variance palette/typography don't leak into the
 * rest of the platform.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb + context chips (months window, Export)
 *   2. Page header card — big title + sub + 4 summary tiles
 *   3. Rules card — "how variance is computed" (so founders can trust it)
 *   4. One month card per month in the window — per-category plan vs
 *      actual bars, category deltas, "what drove the gap" explainer
 *   5. 6-month trend chart — cumulative drift line (SVG)
 *
 * Empty-state policy (per the data contract):
 *   - No plan line items AND no Xero transactions  → "Connect a data source
 *     and create a plan to see variance" empty state.
 *   - Plan exists but no actuals yet               → month cards render
 *     "Awaiting actuals · plan £X" with a muted "no Xero data yet" note.
 *   - Actuals exist but no plan                    → month cards render
 *     "No plan for this month" with the actual alone; delta shows "—".
 *
 * Every number traces to a real source (plan_line_items,
 * xero_transaction). No synthetic mockup specifics (Ada Chen, NimFarm,
 * Sasha, PCB iteration) leak into production copy.
 */

"use client"

import Link from "next/link"

import "./variance-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * Category key — matches `plan_line_items.category` enum in MONEY-SCHEMA §2.
 * The 6 cost buckets ("out") + 4 income buckets ("in") — variance rolls the
 * 4 income buckets into a single "Cash in" row for readability.
 */
export type VarianceCategory =
    | "people"
    | "premises"
    | "tools"
    | "materials"
    | "growth"
    | "other"
    | "cash_in"

export interface VarianceCategoryRow {
    /** Stable key for React (same as `category`). */
    category: VarianceCategory
    /** Display label — "People", "Materials", "Cash in". */
    label: string
    /** Plan amount in pence for this month + category (net, positive number). */
    planCents: number
    /** Actual amount in pence for this month + category (net, positive number). */
    actualCents: number
    /** Delta in pence (actual - plan); positive = overrun for costs, underrun for cash_in. */
    deltaCents: number
    /**
     * True when the delta is "good" — i.e. cost category under plan OR
     * cash_in category over plan. Drives the green bar tint.
     */
    good: boolean
    /** Plan bar width percent (0-100) within the month's max bar scale. */
    planPct: number
    /** Actual bar width percent (0-100) within the month's max bar scale. */
    actualPct: number
}

export interface VarianceMonthCard {
    /** ISO first-of-month ("2026-04-01"). Used as React key + sort. */
    monthIso: string
    /** Display label — "April 2026". */
    label: string
    /**
     * State of the month:
     *   - current: month to date (partial actuals, annualised read)
     *   - closed:  month has ended, actuals complete
     *   - future:  plan-only, no actuals yet
     */
    state: "current" | "closed" | "future"
    /** Days elapsed / days in month — only rendered for current month. */
    daysElapsed: number | null
    daysInMonth: number
    /** Plan net burn for the month in pence (cost_out − cash_in). */
    planNetBurnCents: number | null
    /** Actual net burn in pence. Null when no actuals yet. */
    actualNetBurnCents: number | null
    /**
     * For current month: actual net burn annualised to the full month so
     * the plan-vs-actual compare is apples-to-apples.
     */
    annualisedActualCents: number | null
    /** Delta in pence (actual - plan); positive = over plan (bad for burn). */
    deltaCents: number | null
    /** "overrun" | "under" | "onpace" — drives left border colour + big-diff colour. */
    tone: "overrun" | "under" | "onpace"
    /** Per-category rows, already sorted (cost categories first, cash_in last). */
    rows: VarianceCategoryRow[]
    /** Explainer paragraph — deterministic, never fabricated. */
    explainer: string
}

export interface TrendPoint {
    /** Short month label — "Nov", "Dec" … */
    label: string
    /** Cumulative drift in pence at end of this month. */
    cumDriftCents: number
}

export interface VarianceViewProps {
    /** Display currency — from money_settings. */
    currency: string
    /** Month cards, oldest → newest. Empty array triggers the empty state. */
    months: VarianceMonthCard[]
    /** True when a xero_connection row exists. Drives the rules-card + trend copy. */
    xeroConnected: boolean
    /** True when any plan_line_items exist for this foundry. */
    hasPlan: boolean
    /** Window summary — null when months is empty. */
    summary: {
        monthsTracked: number
        windowLabel: string
        cumulativeVarianceCents: number
        biggestOverrun: { monthLabel: string; cents: number } | null
        monthsOnOrUnder: number
    } | null
    /** Trend points, oldest → newest. Empty array hides the trend card. */
    trend: TrendPoint[]
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Format pence → "£12.3k" / "£850" / "£1.2M". */
function formatGbp(cents: number | null, currency: string): string {
    if (cents == null) return "—"
    const symbol = currencySymbol(currency)
    const value = cents / 100
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`
    if (abs >= 10_000) return `${symbol}${Math.round(value / 1000).toLocaleString()}k`
    if (abs >= 1000) return `${symbol}${(value / 1000).toFixed(1)}k`
    return `${symbol}${Math.round(value).toLocaleString()}`
}

/** Format a delta with +/− sign. */
function formatDelta(cents: number, currency: string): string {
    const sign = cents > 0 ? "+" : cents < 0 ? "−" : ""
    const abs = Math.abs(cents)
    const symbol = currencySymbol(currency)
    const value = abs / 100
    if (value >= 1000) return `${sign}${symbol}${(value / 1000).toFixed(1)}k`
    return `${sign}${symbol}${Math.round(value).toLocaleString()}`
}

function currencySymbol(currency: string): string {
    if (currency === "GBP") return "£"
    if (currency === "USD") return "$"
    if (currency === "EUR") return "€"
    return `${currency} `
}

// ─── View ───────────────────────────────────────────────────────────────

export function VarianceView(props: VarianceViewProps): React.ReactElement {
    const { currency, months, xeroConnected, hasPlan, summary, trend } = props

    return (
        <div className="var2">
            {/* 1 · Breadcrumb + context chips */}
            <div className="var2-page-head">
                <div className="var2-crumbs">
                    <Link href="/money">Money</Link>
                    <span className="sep">›</span>
                    <Link href="/money/plan">Plan</Link>
                    <span className="sep">›</span>
                    <span className="current">Variance</span>
                </div>
                <div className="var2-ctx-chips">
                    {summary && (
                        <span className="var2-pill info">
                            {summary.monthsTracked} month
                            {summary.monthsTracked === 1 ? "" : "s"} ·{" "}
                            {summary.windowLabel}
                        </span>
                    )}
                    <span
                        className="var2-btn"
                        title="Export ships once the reporting pack wires up"
                        aria-disabled="true"
                        style={{ opacity: 0.55, cursor: "not-allowed" }}
                    >
                        Export
                    </span>
                </div>
            </div>

            {/* 2 · Header card with summary tiles */}
            <div className="var2-head">
                <h1>
                    <span className="var2-title-dot" aria-hidden="true" />
                    Plan vs actuals — monthly net burn
                </h1>
                <div className="sub">
                    {xeroConnected ? (
                        <>
                            Live data from Xero · variance computed against your
                            active plan · drift trend below
                        </>
                    ) : hasPlan ? (
                        <>
                            Variance computes against your active plan once
                            Xero is connected · no actuals yet
                        </>
                    ) : (
                        <>
                            Variance needs a plan and a data source — see
                            below for how to set them up
                        </>
                    )}
                </div>

                {summary && (
                    <div className="var2-stats">
                        <div className="rs">
                            <div className="lab">Months tracked</div>
                            <div className="val">{summary.monthsTracked}</div>
                            <div className="sub">{summary.windowLabel}</div>
                        </div>
                        <div className="rs">
                            <div className="lab">Cumulative variance</div>
                            <div
                                className={`val ${summary.cumulativeVarianceCents > 0 ? "danger" : summary.cumulativeVarianceCents < 0 ? "success" : "muted"}`}
                            >
                                {summary.cumulativeVarianceCents === 0
                                    ? "—"
                                    : formatDelta(summary.cumulativeVarianceCents, currency)}
                            </div>
                            <div className="sub">
                                {summary.cumulativeVarianceCents > 0
                                    ? `Above plan over ${summary.monthsTracked} month${summary.monthsTracked === 1 ? "" : "s"}`
                                    : summary.cumulativeVarianceCents < 0
                                        ? `Under plan over ${summary.monthsTracked} month${summary.monthsTracked === 1 ? "" : "s"}`
                                        : "On plan"}
                            </div>
                        </div>
                        <div className="rs">
                            <div className="lab">Biggest overrun</div>
                            <div
                                className={`val ${summary.biggestOverrun ? "danger" : "muted"}`}
                            >
                                {summary.biggestOverrun
                                    ? formatGbp(summary.biggestOverrun.cents, currency)
                                    : "—"}
                            </div>
                            <div className="sub">
                                {summary.biggestOverrun
                                    ? summary.biggestOverrun.monthLabel
                                    : "No overruns yet"}
                            </div>
                        </div>
                        <div className="rs">
                            <div className="lab">Months on/under</div>
                            <div className="val">
                                {summary.monthsOnOrUnder} of {summary.monthsTracked}
                            </div>
                            <div className="sub">
                                {summary.monthsTracked > 0
                                    ? `${Math.round((summary.monthsOnOrUnder / summary.monthsTracked) * 100)}% hit rate`
                                    : "—"}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 3 · Empty state when no plan AND no actuals */}
            {months.length === 0 && (
                <div className="var2-empty">
                    <h3>Connect a data source and create a plan to see variance</h3>
                    <p>
                        Variance compares each month&apos;s actuals from your
                        accounting feed against what the active plan said
                        you&apos;d spend. Once both sides are in place,
                        you&apos;ll see a per-category gap every month plus a
                        cumulative drift line across the window.
                    </p>
                    <div className="cta-row">
                        {!xeroConnected && (
                            <Link href="/money/connect/xero" className="primary">
                                Connect Xero
                            </Link>
                        )}
                        {!hasPlan && (
                            <Link href="/money/plan">
                                Build your plan
                            </Link>
                        )}
                    </div>
                </div>
            )}

            {/* 4 · Rules card — only when there's something to look at */}
            {months.length > 0 && (
                <div className="var2-rules">
                    <h3>How variance is computed (so you can trust it)</h3>
                    <ul>
                        <li>
                            <strong>Actuals</strong> come from Xero categorised
                            transactions in the month. Uncategorised items are
                            flagged for you to review.
                        </li>
                        <li>
                            <strong>Plan</strong> is whatever the active
                            scenario said that month&apos;s net burn would be,
                            snapshotted at month start.
                        </li>
                        <li>
                            <strong>Net burn</strong> = actual cash out − actual
                            cash in. Excludes grant drawdowns pending
                            categorisation.
                        </li>
                        <li>
                            Mid-month variance (current month) is annualised
                            from run-rate to the full month for a fair
                            apples-to-apples read.
                        </li>
                    </ul>
                </div>
            )}

            {/* 5 · Per-month cards — newest first */}
            {months
                .slice()
                .sort((a, b) => b.monthIso.localeCompare(a.monthIso))
                .map((m) => (
                    <MonthCard key={m.monthIso} month={m} currency={currency} />
                ))}

            {/* 6 · Trend card — only when we have ≥ 2 months of data */}
            {trend.length >= 2 && (
                <TrendCard trend={trend} currency={currency} />
            )}
        </div>
    )
}

// ─── Month card ─────────────────────────────────────────────────────────

function MonthCard({
    month,
    currency,
}: {
    month: VarianceMonthCard
    currency: string
}): React.ReactElement {
    const {
        label,
        state,
        daysElapsed,
        daysInMonth,
        planNetBurnCents,
        actualNetBurnCents,
        annualisedActualCents,
        deltaCents,
        tone,
        rows,
        explainer,
    } = month

    const subDate =
        state === "current" && daysElapsed != null
            ? `Month to date · ${daysElapsed} of ${daysInMonth} days`
            : state === "closed"
                ? `Closed · ${daysInMonth} days`
                : "Upcoming · plan only"

    const showAnnualised =
        state === "current" && annualisedActualCents != null

    // Big-diff label mirrors mockup:
    //   onpace   → "on pace"
    //   overrun  → "+£6k over"
    //   under    → "£2k under"
    let bigDiffLabel: string
    let bigDiffSub = ""
    if (deltaCents == null || planNetBurnCents == null || actualNetBurnCents == null) {
        bigDiffLabel = "awaiting actuals"
        if (planNetBurnCents != null) {
            bigDiffSub = `plan ${formatGbp(planNetBurnCents, currency)} · actual —`
        }
    } else if (tone === "onpace") {
        bigDiffLabel = "on pace"
        bigDiffSub = showAnnualised
            ? `plan ${formatGbp(planNetBurnCents, currency)} · actual ${formatGbp(annualisedActualCents, currency)} ann.`
            : `plan ${formatGbp(planNetBurnCents, currency)} · actual ${formatGbp(actualNetBurnCents, currency)}`
    } else if (tone === "overrun") {
        bigDiffLabel = `${formatGbp(Math.abs(deltaCents), currency)} over`
        bigDiffSub = `plan ${formatGbp(planNetBurnCents, currency)} · actual ${formatGbp(actualNetBurnCents, currency)}`
    } else {
        bigDiffLabel = `${formatGbp(Math.abs(deltaCents), currency)} under`
        bigDiffSub = `plan ${formatGbp(planNetBurnCents, currency)} · actual ${formatGbp(actualNetBurnCents, currency)}`
    }

    const bigClass = tone === "overrun" ? "up" : tone === "under" ? "down" : "flat"

    return (
        <div className={`var2-month ${tone}`}>
            <div className="var2-month-head">
                <div>
                    <h3>{label}</h3>
                    <div className="sub-date">{subDate}</div>
                </div>
                <div />
                <div>
                    <div className={`big-diff ${bigClass}`}>
                        {bigDiffLabel}
                        {bigDiffSub && <small>{bigDiffSub}</small>}
                    </div>
                </div>
                <div>
                    <Link
                        href={`/money/plan/variance/${month.monthIso.slice(0, 7)}`}
                        className="var2-btn"
                    >
                        Drill
                    </Link>
                </div>
            </div>

            <div className="var2-month-body">
                <div className="var2-cat">
                    <h4>Per category · plan vs actual</h4>
                    {rows.length === 0 ? (
                        <div className="var2-explain empty-note">
                            No per-category data for this month yet.
                        </div>
                    ) : (
                        rows.map((r) => (
                            <div key={r.category} className="var2-cat-row">
                                <div className="cat-name">{r.label}</div>
                                <div className="cat-bar">
                                    <div
                                        className="cat-plan"
                                        style={{ width: `${Math.max(0, Math.min(100, r.planPct))}%` }}
                                    />
                                    <div
                                        className={`cat-actual ${r.good ? "good" : ""}`}
                                        style={{ width: `${Math.max(0, Math.min(100, r.actualPct))}%` }}
                                    />
                                </div>
                                <div
                                    className={`cat-delta ${r.deltaCents > 0 ? "up" : r.deltaCents < 0 ? "down" : "flat"}`}
                                >
                                    {r.deltaCents === 0
                                        ? "on"
                                        : formatDelta(r.deltaCents, currency)}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="var2-explain">
                    <h4>What&apos;s driving the gap</h4>
                    <p>{explainer}</p>
                </div>
            </div>
        </div>
    )
}

// ─── Trend card ─────────────────────────────────────────────────────────

function TrendCard({
    trend,
    currency,
}: {
    trend: TrendPoint[]
    currency: string
}): React.ReactElement {
    // Map cumulative drift to an SVG path (600 × 120). Positive drift (over
    // plan) renders below the centre line — same polarity as the mockup so
    // reading the curve matches intuition: "line going up = burning more".
    const width = 600
    const height = 120
    const centreY = 60
    const n = trend.length
    const stepX = n > 1 ? width / (n - 1) : width

    // Symmetric Y-scale keyed off the absolute max drift, clamped so a
    // tiny drift doesn't exaggerate.
    const maxAbs = Math.max(
        100, // floor = £1
        ...trend.map((p) => Math.abs(p.cumDriftCents)),
    )
    // 50 pixels of half-height; invert because SVG y grows downward.
    const yFor = (cents: number): number => centreY + (cents / maxAbs) * -50 * -1 // + = down

    const pathD = trend
        .map((p, i) => {
            const x = i * stepX
            const y = yFor(p.cumDriftCents)
            return `${i === 0 ? "M" : "L"}${x},${y.toFixed(1)}`
        })
        .join(" ")

    const last = trend[trend.length - 1]

    return (
        <div className="var2-trend">
            <div className="var2-trend-head">
                <h3>{n}-month trend · cumulative drift</h3>
                <span className="caption">
                    Positive = above plan · negative = under
                </span>
            </div>
            <div className="var2-trend-chart">
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    preserveAspectRatio="none"
                    style={{ width: "100%", height: "100%" }}
                    aria-label={`Cumulative drift over ${n} months. Latest ${formatDelta(last.cumDriftCents, currency)}.`}
                >
                    <line
                        x1={0}
                        y1={centreY}
                        x2={width}
                        y2={centreY}
                        stroke="#d6d3d1"
                        strokeWidth={1}
                    />
                    <text x={10} y={centreY - 5} fill="#78716c" fontSize={10}>
                        Plan
                    </text>
                    <path
                        d={pathD}
                        stroke="#ff4500"
                        strokeWidth={2.5}
                        fill="none"
                    />
                    {trend.map((p, i) => {
                        const x = i * stepX
                        const y = yFor(p.cumDriftCents)
                        const isLast = i === n - 1
                        return (
                            <circle
                                key={p.label}
                                cx={x}
                                cy={y}
                                r={isLast ? 5 : 4}
                                fill="#ff4500"
                                stroke={isLast ? "white" : undefined}
                                strokeWidth={isLast ? 2 : 0}
                            />
                        )
                    })}
                    {trend.map((p, i) => (
                        <text
                            key={`lbl-${p.label}`}
                            x={i * stepX + (i === 0 ? 10 : -5)}
                            y={height - 10}
                            fill="#78716c"
                            fontSize={10}
                        >
                            {p.label}
                        </text>
                    ))}
                </svg>
            </div>
            <div className="var2-trend-note">
                <strong>Latest cumulative drift:</strong>{" "}
                {formatDelta(last.cumDriftCents, currency)} across the last {n}{" "}
                month{n === 1 ? "" : "s"}. Flat line = plan is matching actuals;
                curve walking away from the centre = plan needs a refresh.
            </div>
        </div>
    )
}

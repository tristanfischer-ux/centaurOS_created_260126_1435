/**
 * PlanView — Money Plan grid page (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-PLAN.html. Scoped CSS under `.pln2` keeps the
 * mockup's palette / typography isolated from the rest of the platform.
 *
 * Sections (top to bottom, matching the mockup order):
 *   1. Breadcrumb + page title (orange dot)
 *   2. Context chips (variance / full P&L links)
 *   3. Advisory banner — what Plan does
 *   4. Info band — category taxonomy cut 21 → 6
 *   5. Scenario switcher (real burn_scenarios; default-only when none)
 *   6. Tabbar (Grid / Forecast / P&L / Variance)
 *   7. Empty state ("Start your first plan") OR side-by-side grid (Out / In)
 *   8. 52-week forecast card — honest empty until plan engine wired
 *   9. Variance preview — honest empty until Xero is connected
 *  10. Mini P&L preview — honest empty until plan engine wired
 *  11. Annotation footer note
 *
 * Every number on screen is bound to real rows from `plan_line_items`
 * (+ `burn_scenarios` for the chip row). When no plan rows exist the
 * grid collapses to the empty-state CTA → /money/import/csv. The forecast,
 * variance and P&L cards render honest empty states because the runway
 * engine, variance monitor and projection renderer haven't shipped yet —
 * never fake mockup-specific numbers.
 */

"use client"

import Link from "next/link"
import "./plan-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

/** Category taxonomy — 6 cost buckets + 4 income buckets per MONEY-SCHEMA §2. */
export type PlanCategory =
  | "people"
  | "premises"
  | "tools"
  | "materials"
  | "growth"
  | "other"
  | "revenue"
  | "grants"
  | "equity"
  | "loans"

export type PlanFrequency =
  | "one_off"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "variable"

export type PlanDirection = "out" | "in"

/**
 * A single plan line as rendered on the grid. Mirrors `plan_line_items`
 * rows with `amount_cents` normalised to a monthly-equivalent figure for
 * the subtotal column. `probabilityPct` only surfaces on income rows.
 */
export interface PlanLineRow {
  id: string
  name: string
  direction: PlanDirection
  category: PlanCategory
  amountCents: number
  /** Monthly-equivalent of amount + frequency. Same as amountCents for monthly lines. */
  monthlyCents: number
  frequency: PlanFrequency
  probabilityPct: number
  currency: string
  notes: string | null
}

export interface PlanScenarioChip {
  id: string
  name: string
  /** True for the mockup-equivalent "Default" chip (first row shown). */
  isDefault: boolean
}

export interface PlanViewProps {
  /** Foundry currency (ISO 4217) — drives the £/$ prefix. */
  currency: string
  /** All non-archived scenarios for this foundry. Empty array when none exist. */
  scenarios: PlanScenarioChip[]
  /** Active scenario id (one of `scenarios.id` or null when no scenarios exist). */
  activeScenarioId: string | null
  /** All non-archived plan line items for this foundry under the active scenario. */
  lines: PlanLineRow[]
}

// ─── Helpers ────────────────────────────────────────────────────────────

function currencySymbol(currency: string): string {
  if (currency === "GBP") return "£"
  if (currency === "USD") return "$"
  if (currency === "EUR") return "€"
  return ""
}

/** £34,220  →  "£34,220"   · £1,234,567 → "£1.23M". Matches cockpit-view helper. */
function formatAmount(cents: number | null, currency = "GBP"): string {
  if (cents == null) return "—"
  const value = cents / 100
  const sym = currencySymbol(currency)
  if (Math.abs(value) >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 10_000) return `${sym}${Math.round(value / 1000).toLocaleString()}k`
  if (Math.abs(value) >= 1000) return `${sym}${Math.round(value).toLocaleString()}`
  return `${sym}${Math.round(value).toLocaleString()}`
}

function frequencyLabel(f: PlanFrequency): string {
  switch (f) {
    case "one_off":    return "One-off"
    case "weekly":     return "Weekly"
    case "monthly":    return "Monthly"
    case "quarterly":  return "Quarterly"
    case "annual":     return "Annual"
    case "variable":   return "Variable"
    default:           return "—"
  }
}

function probabilityTone(pct: number): "high" | "med" | "low" {
  if (pct >= 75) return "high"
  if (pct >= 40) return "med"
  return "low"
}

/**
 * Ordered display buckets. Out columns render cost categories in this
 * order; In columns render income categories. Empty buckets are hidden
 * (never render an empty cat-head when the bucket has zero rows).
 */
const OUT_ORDER: PlanCategory[] = ["people", "premises", "tools", "materials", "growth", "other"]
const IN_ORDER:  PlanCategory[] = ["revenue", "grants", "equity", "loans"]

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  people:    "People",
  premises:  "Premises",
  tools:     "Tools",
  materials: "Materials",
  growth:    "Growth",
  other:     "Other",
  revenue:   "Revenue",
  grants:    "Grants",
  equity:    "Equity",
  loans:     "Loans",
}

interface BucketRollup {
  category: PlanCategory
  totalMonthlyCents: number
  rows: PlanLineRow[]
}

function groupByCategory(lines: PlanLineRow[], order: PlanCategory[]): BucketRollup[] {
  const groups = new Map<PlanCategory, PlanLineRow[]>()
  for (const line of lines) {
    const bucket = groups.get(line.category) ?? []
    bucket.push(line)
    groups.set(line.category, bucket)
  }
  return order
    .map<BucketRollup>((category) => {
      const rows = groups.get(category) ?? []
      const totalMonthlyCents = rows.reduce((sum, r) => sum + r.monthlyCents, 0)
      return { category, totalMonthlyCents, rows }
    })
    .filter((b) => b.rows.length > 0)
}

function sumMonthly(lines: PlanLineRow[], direction: PlanDirection): number {
  return lines
    .filter((l) => l.direction === direction)
    .reduce((sum, l) => sum + l.monthlyCents, 0)
}

// ─── Component ──────────────────────────────────────────────────────────

export function PlanView({
  currency,
  scenarios,
  activeScenarioId,
  lines,
}: PlanViewProps): React.ReactElement {
  const hasAnyLine = lines.length > 0
  const outMonthly = sumMonthly(lines, "out")
  const inMonthly  = sumMonthly(lines, "in")
  const netBurn    = outMonthly - inMonthly

  const outBuckets = groupByCategory(lines.filter((l) => l.direction === "out"), OUT_ORDER)
  const inBuckets  = groupByCategory(lines.filter((l) => l.direction === "in"),  IN_ORDER)

  return (
    <div className="pln2">
      {/* 1 · Breadcrumb + context chips */}
      <div className="pln2-page-head">
        <div>
          <div className="pln2-crumbs">
            <Link href="/money">Money</Link>
            <span className="sep">›</span>
            <span className="current">Plan</span>
          </div>
          <div className="pln2-title-row">
            <span className="pln2-title-dot" aria-hidden="true" />
            <h1 className="pln2-title">Plan</h1>
          </div>
          <div className="pln2-subtitle">
            Every cost and income line, one surface. Numbers bind to the
            active scenario — change a line, see the monthly subtotal move.
            Variance against accounting actuals and the full P&amp;L are one
            click away.
          </div>
        </div>
        <div className="pln2-ctx-chips">
          <Link href="/money/plan/variance" className="pln2-btn">Variance</Link>
          <Link href="/money/pnl" className="pln2-btn">Full P&amp;L</Link>
          <Link href="/money/import/csv" className="pln2-btn primary">+ Import CSV</Link>
        </div>
      </div>

      {/* 2 · Advisory banner */}
      <div className="pln2-banner" role="status">
        <div>
          <strong>Plan · V2</strong>
          Every number on this page is bound to the active scenario. Click a
          line row to open its detail and editor. Variance vs. accounting
          actuals and the full P&amp;L live on their own surfaces — one click
          away.
        </div>
      </div>

      {/* 3 · Info band — taxonomy */}
      <div className="pln2-info">
        <strong>Category taxonomy:</strong> people · premises · tools ·
        materials · growth · other (cost) + revenue · grants · equity · loans
        (income). Founder-facing only — a detailed accounting taxonomy sits
        behind each line for Xero / QuickBooks export without cluttering the
        grid.
      </div>

      {/* 4 · Scenario switcher */}
      <div className="pln2-scenario-bar">
        <div className="sb-label">Scenario</div>
        <div className="pln2-scenario-chips">
          {scenarios.length === 0 ? (
            <span className="pln2-sc-chip active">
              <span className="pln2-ind" /> Default
            </span>
          ) : (
            scenarios.map((sc) => (
              <span
                key={sc.id}
                className={
                  sc.id === activeScenarioId
                    ? "pln2-sc-chip active"
                    : "pln2-sc-chip"
                }
              >
                <span className="pln2-ind" /> {sc.name}
              </span>
            ))
          )}
          <span className="pln2-sc-chip custom" title="Scenario editor ships next round">
            + New scenario
          </span>
        </div>
        <div className="pln2-scenario-summary">
          <div>
            Net burn:{" "}
            <strong>
              {hasAnyLine ? `${formatAmount(netBurn, currency)}/mo` : "—"}
            </strong>
          </div>
          <div>
            Runway: <strong>—</strong>
          </div>
        </div>
      </div>

      {/* 5 · Tabbar */}
      <div className="pln2-tabbar">
        <a href="#grid" className="active">
          Grid <span className="cnt">{lines.length}</span>
        </a>
        <a href="#forecast">Forecast</a>
        <Link href="/money/pnl">P&amp;L</Link>
        <Link href="/money/plan/variance">Variance</Link>
      </div>

      {/* 6 · Grid or empty state */}
      {!hasAnyLine ? (
        <div className="pln2-empty">
          <div className="pln2-empty-eyebrow">Start your first plan</div>
          <h2>No plan lines yet</h2>
          <p>
            Your Plan grid is where every cost and income line lives — from
            payroll and makerspace rent through to pilot revenue and grants.
            Start by importing a CSV of your current costs, or add lines one
            at a time.
          </p>
          <div className="pln2-empty-ctas">
            <Link href="/money/import/csv" className="pln2-btn primary">
              Import CSV
            </Link>
            <span
              className="pln2-btn"
              title="The line-item editor opens once a first line exists"
            >
              + Add a line
            </span>
          </div>
        </div>
      ) : (
        <div className="pln2-grid" id="grid">
          {/* ── Cash out ── */}
          <div className="pln2-col-card out">
            <div className="pln2-col-head">
              <h3>
                <span className="dot" aria-hidden="true" /> Cash out · monthly
              </h3>
              <div className="total">
                {formatAmount(outMonthly, currency)}
                <small> /mo</small>
              </div>
            </div>
            {outBuckets.length === 0 ? (
              <div style={{ padding: "28px 18px", color: "var(--pln-fg-muted)", fontSize: 12.5, textAlign: "center" }}>
                No cost lines yet. Add payroll, rent, tools, or materials to start.
              </div>
            ) : (
              outBuckets.map((b) => (
                <div key={b.category}>
                  <div className="pln2-cat-head">
                    {CATEGORY_LABEL[b.category]}
                    <span className="pln2-cat-total">
                      {formatAmount(b.totalMonthlyCents, currency)}
                    </span>
                  </div>
                  {b.rows.map((row) => (
                    <PlanRow key={row.id} row={row} currency={currency} />
                  ))}
                </div>
              ))
            )}
            <span
              className="pln2-line-add"
              title="The line-item editor opens once you click a line; wizard entry ships next round"
            >
              + Add a cost
            </span>
          </div>

          {/* ── Cash in ── */}
          <div className="pln2-col-card in">
            <div className="pln2-col-head">
              <h3>
                <span className="dot" aria-hidden="true" /> Cash in · monthly
              </h3>
              <div className="total">
                {formatAmount(inMonthly, currency)}
                <small> /mo</small>
              </div>
            </div>
            {inBuckets.length === 0 ? (
              <div style={{ padding: "28px 18px", color: "var(--pln-fg-muted)", fontSize: 12.5, textAlign: "center" }}>
                No income modelled yet. Add pilot revenue, grants, or a round
                you&apos;re raising.
              </div>
            ) : (
              inBuckets.map((b) => (
                <div key={b.category}>
                  <div className="pln2-cat-head">
                    {CATEGORY_LABEL[b.category]}
                    <span className="pln2-cat-total">
                      {formatAmount(b.totalMonthlyCents, currency)}
                    </span>
                  </div>
                  {b.rows.map((row) => (
                    <PlanRow key={row.id} row={row} currency={currency} />
                  ))}
                </div>
              ))
            )}
            <span
              className="pln2-line-add"
              title="The line-item editor opens once you click a line; wizard entry ships next round"
            >
              + Add income
            </span>
          </div>
        </div>
      )}

      {/* 7 · 52-week forecast — honest empty */}
      <div className="pln2-forecast-card" id="forecast">
        <div className="pln2-section-head">
          <div>
            <h3>52-week forecast · active scenario</h3>
            <div className="sub">
              Cash in vs cash out · projected balance
            </div>
          </div>
        </div>
        <div className="pln2-forecast-empty">
          <strong>Forecast renders once the projection engine ships.</strong>
          It takes your active scenario, applies the weekly frequency of each
          line, overlays probability-weighted income, and draws the running
          balance to week 52. Nothing is inferred from monthly totals alone.
        </div>
      </div>

      {/* 8 · Variance preview — honest empty */}
      <div className="pln2-variance-card">
        <div className="pln2-section-head">
          <div>
            <h3>
              Plan vs actuals · last 3 months
              <Link href="/money/plan/variance" className="link">
                Full view →
              </Link>
            </h3>
            <div className="sub">Monthly net burn · accounting actuals</div>
          </div>
        </div>
        <div className="pln2-variance-empty">
          <strong>No actuals yet.</strong>
          Variance surfaces once accounting is connected and at least one
          full month of transactions has synced. Until then, Plan numbers
          stand alone and are labelled &quot;plan only&quot;.
        </div>
      </div>

      {/* 9 · Mini P&L preview — honest empty */}
      <div className="pln2-pnl-preview">
        <div className="pln2-section-head">
          <div>
            <h3>P&amp;L · next 12 months (projected)</h3>
            <div className="sub">Quarterly roll-up from active scenario</div>
          </div>
          <Link href="/money/pnl" className="pln2-btn">
            Open full P&amp;L →
          </Link>
        </div>
        <div className="pln2-pnl-empty">
          <strong>P&amp;L projection ships with the plan engine.</strong>
          The preview will roll up revenue, cost of sales, opex and net
          profit by quarter — once the projection renderer is wired to the
          line-item formulas.
        </div>
      </div>

      {/* 10 · Annotation foot */}
      <div className="pln2-annot">
        <strong>How this surface works</strong>
        Scenario is global (top strip), not hidden in a side panel. The grid
        is one surface, not two routes. Probability-weighted income is
        visible inline. Variance is first-class — a preview here, a
        dedicated surface one click away. Line-item editor is a separate
        route — click any line row to open it.
      </div>
    </div>
  )
}

// ─── Line row ────────────────────────────────────────────────────────────

function PlanRow({
  row,
  currency,
}: {
  row: PlanLineRow
  currency: string
}): React.ReactElement {
  const href = `/money/plan/edit/${row.id}`
  const isIncome = row.direction === "in"
  const probTone = probabilityTone(row.probabilityPct)

  return (
    <Link href={href} className="pln2-line-row">
      <div>
        <div className="ln-name">{row.name}</div>
        {(row.notes || isIncome) && (
          <div className="ln-meta">
            {row.notes ? <span>{row.notes}</span> : null}
            {isIncome && row.probabilityPct < 100 ? (
              <span className={`prob ${probTone}`}>
                {row.probabilityPct}%
              </span>
            ) : null}
          </div>
        )}
      </div>
      <div className="freq">{frequencyLabel(row.frequency)}</div>
      <div className="amt">{formatAmount(row.monthlyCents, currency)}</div>
      <div className="edit">›</div>
    </Link>
  )
}

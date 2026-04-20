/**
 * PnlView — Money P&L income statement page (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-PNL.html. Scoped CSS under `.pnl2` keeps the
 * styling isolated so the palette/typography don't leak into the rest
 * of the platform.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb + context chips (Variance, Export to Xero, CSV)
 *   2. Header card — title + sub + view/period/show control groups
 *   3. Full P&L table — pivoted income statement (quarterly columns +
 *      12-mo total column), grouped by Revenue / COGS / Gross profit /
 *      Opex / EBIT / Net loss
 *   4. Projected balance sheet — Assets / Liabilities / Equity grid
 *   5. Annotation note explaining why the page exists
 *
 * Empty-state policy: until Xero is connected and plan_line_items exist,
 * every P&L cell renders "—" and the page surfaces a "Connect Xero or
 * import CSV" empty state. No synthetic mockup numbers leak into
 * production.
 */

"use client"

import Link from "next/link"

import "./pnl-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export type PnlView_ = "monthly" | "quarterly" | "annual"
export type PnlPeriod = "next_12" | "trailing_12" | "ytd" | "full_2026"
export type PnlShow = "plan" | "actual" | "both"

/** A single line's amount for each column in the table. Nulls render "—". */
export interface PnlLineCells {
  /** Column values in period order; length must match headers.length. */
  values: Array<number | null>
  /** 12-month (or period) total — rendered in the orange total column. */
  total: number | null
}

export interface PnlLine {
  /** Stable React key. */
  id: string
  /** Display label. */
  label: string
  /** Optional muted sub-note under the label. */
  note?: string | null
  /** "negative" renders (£N) style in red. "positive" in green. "neutral" plain. */
  tone?: "neutral" | "negative" | "positive"
  /** Indent the label (COGS / Opex sub-lines in the mockup). */
  indent?: boolean
  cells: PnlLineCells
}

export interface PnlSection {
  /** Section header row (e.g. "Revenue", "Cost of sales", "Operating expenses"). */
  title: string
  /** Item lines under this section. */
  lines: PnlLine[]
  /** Optional subtotal row rendered as class `sub`. Omit for plain sections. */
  subtotal?: {
    label: string
    tone?: "neutral" | "negative" | "positive"
    cells: PnlLineCells
  } | null
}

export interface PnlBalanceRow {
  label: string
  /** Null renders "—". */
  valueCents: number | null
  /** "muted" makes the number grey. "danger" makes it red. */
  tone?: "neutral" | "muted" | "danger"
}

export interface PnlBalanceColumn {
  /** "Assets" / "Liabilities" / "Equity". */
  title: string
  rows: PnlBalanceRow[]
  total: PnlBalanceRow
}

export interface PnlSourceState {
  /** True if a xero_connection row exists AND has synced at least once. */
  xeroConnected: boolean
  /** Count of non-archived plan_line_items rows. */
  planLineCount: number
  /** Count of xero_transaction rows — drives the "actuals available" pill. */
  transactionCount: number
}

export interface PnlViewProps {
  /** Currency code for number formatting ("GBP" / "USD"). */
  currency: string
  /** Income-statement column headers in order (e.g. ["Q2 '26","Q3 '26",...]). */
  headers: string[]
  /** Label for the total column (e.g. "12-mo total"). */
  totalHeader: string
  /** Grouped sections — Revenue / COGS / Gross profit / Opex / EBIT / Net loss. */
  sections: PnlSection[]
  /** Projected balance sheet — 3 columns (Assets / Liabilities / Equity). Null hides the card. */
  balance: {
    titleSuffix: string
    columns: PnlBalanceColumn[]
  } | null
  /** Data-source status drives the "Source:" chip + empty-state banner. */
  source: PnlSourceState
  /** Active view (monthly/quarterly/annual) — only "quarterly" implemented today. */
  activeView: PnlView_
  /** Active period — only "next_12" implemented today. */
  activePeriod: PnlPeriod
  /** Active show mode — only "plan" implemented today. */
  activeShow: PnlShow
  /** Margin trend strap copy under the table (e.g. "-30.6% -> 9.0% over 4 quarters"). Null hides. */
  marginTrend: string | null
  /** Break-even strap copy. Null hides. */
  breakEven: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────

function currencySymbol(code: string): string {
  if (code === "GBP") return "£"
  if (code === "USD") return "$"
  if (code === "EUR") return "\u20AC"
  return ""
}

function formatCents(
  cents: number | null,
  currency: string,
  opts: { negParens?: boolean } = {},
): string {
  if (cents == null) return "\u2014"
  const sym = currencySymbol(currency)
  const value = cents / 100
  const abs = Math.abs(value)
  let body: string
  if (abs >= 1_000_000) body = `${sym}${(abs / 1_000_000).toFixed(2)}M`
  else if (abs >= 10_000) body = `${sym}${Math.round(abs / 1000).toLocaleString()}k`
  else body = `${sym}${Math.round(abs).toLocaleString()}`
  if (value < 0 && opts.negParens) return `(${body})`
  if (value < 0) return `-${body}`
  return body
}

function toneClass(tone: PnlLine["tone"] | undefined, value: number | null): string {
  if (tone === "negative") return "neg"
  if (tone === "positive") return "pos"
  if (value != null && value < 0) return "neg"
  return ""
}

// ─── View ───────────────────────────────────────────────────────────────

export function PnlView(props: PnlViewProps): React.ReactElement {
  const {
    currency,
    headers,
    totalHeader,
    sections,
    balance,
    source,
    activeView,
    activePeriod,
    activeShow,
    marginTrend,
    breakEven,
  } = props

  const hasAnyData = source.planLineCount > 0 || source.transactionCount > 0

  return (
    <div className="pnl2">
      {/* ── Breadcrumb ───────────────────────────────────────── */}
      <div className="pnl2-breadcrumb">
        <Link href="/money">Money</Link>
        <span className="sep">{"\u203A"}</span>
        <Link href="/money">Plan</Link>
        <span className="sep">{"\u203A"}</span>
        <span className="current">P&amp;L</span>
      </div>

      {/* ── Page head ───────────────────────────────────────── */}
      <div className="pnl2-page-head">
        <div />
        <div className="pnl2-ctx-chips">
          <span className="pnl2-btn soon" title="Variance view ships with Chunk 3">
            Variance
          </span>
          <span className="pnl2-btn soon" title="Xero export wires with the Xero OAuth chunk">
            Export to Xero
          </span>
          <span className="pnl2-btn soon" title="CSV export ships with Chunk 3">
            CSV
          </span>
        </div>
      </div>

      {/* ── Header card ─────────────────────────────────────── */}
      <div className="pnl2-hdr">
        <h1>
          <span className="pnl2-title-dot" aria-hidden="true" />
          Income statement
          <SourceChip source={source} />
        </h1>
        <div className="sub">
          Plan and actuals rolled up into the income statement investors and
          accountants expect. Pivot across months, quarters, or years; compare
          plan to actuals once Xero is connected.
        </div>

        <div className="pnl2-controls">
          <span className="lbl">View</span>
          <div className="group" role="tablist" aria-label="Granularity">
            <button type="button" className={activeView === "monthly" ? "active" : ""} disabled>
              Monthly
            </button>
            <button type="button" className={activeView === "quarterly" ? "active" : ""} disabled>
              Quarterly
            </button>
            <button type="button" className={activeView === "annual" ? "active" : ""} disabled>
              Annual
            </button>
          </div>

          <span className="lbl" style={{ marginLeft: 18 }}>
            Period
          </span>
          <div className="group" role="tablist" aria-label="Period">
            <button type="button" className={activePeriod === "next_12" ? "active" : ""} disabled>
              Next 12 months
            </button>
            <button type="button" className={activePeriod === "trailing_12" ? "active" : ""} disabled>
              Trailing 12
            </button>
            <button type="button" className={activePeriod === "ytd" ? "active" : ""} disabled>
              YTD 2026
            </button>
            <button type="button" className={activePeriod === "full_2026" ? "active" : ""} disabled>
              Full 2026
            </button>
          </div>

          <span className="lbl" style={{ marginLeft: 18 }}>
            Show
          </span>
          <div className="group" role="tablist" aria-label="Plan vs actual">
            <button type="button" className={activeShow === "plan" ? "active" : ""} disabled>
              Plan
            </button>
            <button type="button" className={activeShow === "actual" ? "active" : ""} disabled>
              Actual
            </button>
            <button type="button" className={activeShow === "both" ? "active" : ""} disabled>
              Plan + Actual
            </button>
          </div>

          <span className="source-note">
            Source:{" "}
            {source.xeroConnected
              ? "Plan + Xero actuals"
              : source.planLineCount > 0
                ? "Plan only (Xero not connected)"
                : "No data yet"}
          </span>
        </div>
      </div>

      {/* ── Empty state OR P&L table ─────────────────────── */}
      {!hasAnyData ? (
        <div className="pnl2-empty">
          <div className="icon" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 5-5" />
            </svg>
          </div>
          <h2>Connect Xero or import a CSV to see your P&amp;L</h2>
          <p className="lede">
            The income statement rolls up every transaction by category and month. Once
            Xero is connected the actuals land live; until then I can seed the plan side
            from a CSV of your last twelve months.
          </p>
          <div className="actions">
            <Link href="/money/connect/xero" className="cta-primary">
              Connect Xero
            </Link>
            <Link href="/money" className="cta-secondary">
              Import CSV
            </Link>
          </div>
        </div>
      ) : (
        <div className="pnl2-table-card">
          <table className="pnl2-full">
            <thead>
              <tr>
                <th />
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
                <th className="total">{totalHeader}</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <PnlSectionRows key={section.title} section={section} currency={currency} />
              ))}
            </tbody>
          </table>

          {(marginTrend || breakEven) && (
            <div className="pnl2-foot">
              <span>
                {marginTrend ? <>Gross margin trending: <strong style={{ color: "var(--pnl-fg)" }}>{marginTrend}</strong></> : null}
                {marginTrend && breakEven ? " \u00b7 " : null}
                {breakEven}
              </span>
              <span>
                <span
                  className="pnl2-btn soon"
                  style={{ padding: 0, border: "none", background: "transparent", color: "var(--pnl-brand)", fontWeight: 600 }}
                >
                  Show me variance vs this plan {"\u2192"}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Projected balance sheet ──────────────────────── */}
      {balance != null && (
        <div className="pnl2-bs-card">
          <h3>Projected balance sheet {balance.titleSuffix}</h3>
          <div className="pnl2-bs-grid">
            {balance.columns.map((col) => (
              <div key={col.title} className="pnl2-bs-col">
                <h4>{col.title}</h4>
                {col.rows.map((row) => (
                  <div key={row.label} className="pnl2-bs-row">
                    <span className="k">{row.label}</span>
                    <span
                      className="v"
                      style={{
                        color:
                          row.tone === "muted"
                            ? "var(--pnl-fg-muted)"
                            : row.tone === "danger"
                              ? "var(--pnl-danger)"
                              : undefined,
                      }}
                    >
                      {formatCents(row.valueCents, currency, { negParens: true })}
                    </span>
                  </div>
                ))}
                <div className="pnl2-bs-row total">
                  <span className="k">{col.total.label}</span>
                  <span className="v">{formatCents(col.total.valueCents, currency, { negParens: true })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Annotation ─────────────────────────────────────── */}
      <div className="pnl2-annot">
        <strong>Why this page exists</strong>
        Investors expect a proper income statement and balance sheet. The P&amp;L here
        is auto-generated from your plan line items and Xero actuals when connected &mdash;
        no duplicate entry. Toggle &ldquo;Plan + Actual&rdquo; once Xero is wired to compare
        forecast against actuals side-by-side.
      </div>
    </div>
  )
}

// ─── Section rows ───────────────────────────────────────────────────────

function PnlSectionRows({
  section,
  currency,
}: {
  section: PnlSection
  currency: string
}): React.ReactElement {
  return (
    <>
      <tr className="head">
        <td>{section.title}</td>
        {section.lines[0]?.cells.values.map((_, i) => (
          <td key={i} />
        ))}
        <td />
      </tr>
      {section.lines.map((line) => (
        <tr key={line.id}>
          <td className={line.indent ? "indent" : undefined}>
            {line.label}
            {line.note ? <span className="note">{line.note}</span> : null}
          </td>
          {line.cells.values.map((v, i) => (
            <td key={i} className={`num ${toneClass(line.tone, v)}`}>
              {formatCents(v, currency, { negParens: line.tone === "negative" || (v != null && v < 0) })}
            </td>
          ))}
          <td className={`num total-col ${toneClass(line.tone, line.cells.total)}`}>
            {formatCents(line.cells.total, currency, {
              negParens: line.tone === "negative" || (line.cells.total != null && line.cells.total < 0),
            })}
          </td>
        </tr>
      ))}
      {section.subtotal && (
        <tr className="sub">
          <td>{section.subtotal.label}</td>
          {section.subtotal.cells.values.map((v, i) => (
            <td key={i} className={`num ${toneClass(section.subtotal?.tone, v)}`}>
              {formatCents(v, currency, { negParens: section.subtotal?.tone === "negative" || (v != null && v < 0) })}
            </td>
          ))}
          <td className={`num total-col ${toneClass(section.subtotal.tone, section.subtotal.cells.total)}`}>
            {formatCents(section.subtotal.cells.total, currency, {
              negParens:
                section.subtotal.tone === "negative" ||
                (section.subtotal.cells.total != null && section.subtotal.cells.total < 0),
            })}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Source chip ────────────────────────────────────────────────────────

function SourceChip({ source }: { source: PnlSourceState }): React.ReactElement {
  if (source.xeroConnected) {
    return (
      <span className="pnl2-source-chip xero">
        <span className="dot" aria-hidden="true" />
        Xero + Plan
      </span>
    )
  }
  if (source.planLineCount > 0) {
    return (
      <span className="pnl2-source-chip plan">
        <span className="dot" aria-hidden="true" />
        Plan only
      </span>
    )
  }
  return (
    <span className="pnl2-source-chip">
      <span className="dot" aria-hidden="true" />
      Not connected
    </span>
  )
}

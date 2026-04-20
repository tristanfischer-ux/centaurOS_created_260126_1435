/**
 * TransactionDrillView — Money transaction drill page (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-TRANSACTION-DRILL.html, refocused from the mockup's
 * month-rollup onto a single transaction (that's what the route resolves
 * to today — the month rollup ships with the Variance view).
 *
 * Scoped CSS under `.txd2` keeps styling isolated (convention mirrors
 * `.cd2` / `.pd2` / `.mck2`).
 *
 * Sections (top to bottom):
 *   1. Breadcrumb + back chip
 *   2. Transaction header — date, description, amount, source pill
 *   3. Stats strip — 4 tiles (amount / direction / category / sync)
 *   4. Flagged banner (rendered only when .flagged is non-null)
 *   5. Single transaction row — full detail grid
 *   6. Specialist insight card — honest empty until LLM reads wire up
 *   7. Cross-reference rail — re-categorise / open in Xero (soon) /
 *      related transactions (honest empty)
 *
 * Empty-state policy:
 *   - Category names rendered from the enum, not fabricated humanised text.
 *   - Flagged banner only rendered when `flagged` is actually set.
 *   - Month-level narrative (Finn's read, variance-per-category breakdown,
 *     suggested actions) NOT rendered — those ship with the Variance view
 *     which has access to the full transaction set.
 */

"use client"

import Link from "next/link"
import "./transaction-drill-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface TransactionDrillRow {
  id: string
  transactionDate: string
  description: string
  vendorName: string | null
  /** Negative = out, positive = in (per xero_transaction convention). */
  amountCents: number
  currency: string
  xeroAccountCode: string
  assignedCategory: string
  categoryOverride: string | null
  /** flagged enum: 'unusual_for_category' | 'structural_drift' | 'duplicate_suspected' | null */
  flagged: string | null
  syncedAt: string
}

export interface TransactionDrillXero {
  connected: boolean
  organisationName: string | null
  lastSyncAt: string | null
  syncState: string | null
}

export interface TransactionDrillViewProps {
  row: TransactionDrillRow
  xero: TransactionDrillXero
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatCurrency(cents: number, currency: string): string {
  const whole = cents / 100
  const abs = Math.abs(whole)
  const prefix = currency === "GBP" ? "£" : currency === "USD" ? "$" : ""
  return `${prefix}${abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    })
  } catch {
    return iso
  }
}

function relativeSync(iso: string | null): string {
  if (!iso) return "never"
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.round(diff / 60_000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins} min ago`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `${hrs} h ago`
    const days = Math.round(hrs / 24)
    return `${days} d ago`
  } catch {
    return "—"
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  people: "People",
  premises: "Premises",
  tools: "Tools",
  materials: "Materials",
  growth: "Growth",
  other: "Other",
  revenue: "Revenue",
  grants: "Grants",
  equity: "Equity",
  loans: "Loans",
}

const FLAG_LABEL: Record<string, { title: string; body: string }> = {
  unusual_for_category: {
    title: "Flagged as unusual for this category",
    body: "This transaction sits outside the normal range for its category. Review — if it belongs elsewhere, re-categorise; if it's real, leave as-is.",
  },
  structural_drift: {
    title: "Flagged as structural drift",
    body: "This category has been running off plan for two months in a row. Not a one-off — the baseline may need updating.",
  },
  duplicate_suspected: {
    title: "Possible duplicate",
    body: "Another transaction close in date, amount, and vendor was detected. Verify with Xero before re-categorising.",
  },
}

// ─── View ──────────────────────────────────────────────────────────────

export function TransactionDrillView(props: TransactionDrillViewProps): React.ReactElement {
  const { row, xero } = props
  const direction = row.amountCents < 0 ? "out" : "in"
  const directionLabel = direction === "out" ? "Cash out" : "Cash in"
  const effectiveCategory = row.categoryOverride ?? row.assignedCategory
  const categoryLabel = CATEGORY_LABEL[effectiveCategory] ?? effectiveCategory
  const flag = row.flagged ? FLAG_LABEL[row.flagged] ?? null : null

  return (
    <div className="txd2">

      {/* ── Breadcrumb ─────────────────────────── */}
      <div className="txd2-page-head">
        <div className="txd2-crumbs">
          <Link href="/money">Money</Link>
          <span className="sep">›</span>
          <Link href="/money">Plan</Link>
          <span className="sep">›</span>
          <span className="current">
            {formatShortDate(row.transactionDate)} · transaction
          </span>
        </div>
        <div className="txd2-ctx-chips">
          <Link href="/money" className="txd2-btn sm">
            ← Back to plan
          </Link>
        </div>
      </div>

      {/* ── Transaction header ─────────────────── */}
      <div className="txd2-head">
        <h1>
          <span className="txd2-title-dot" aria-hidden="true" />
          {row.description}
        </h1>
        <div className="sub">
          {formatDate(row.transactionDate)}
          {row.vendorName ? ` · ${row.vendorName}` : null}
          {" · "}Xero account <strong>{row.xeroAccountCode}</strong>
        </div>

        <div className="txd2-stats">
          <div className="tile">
            <div className="lab">Amount</div>
            <div className={`val ${direction === "out" ? "bad" : "good"}`}>
              {direction === "out" ? "−" : "+"}
              {formatCurrency(row.amountCents, row.currency)}
            </div>
            <div className="sub">{row.currency}</div>
          </div>
          <div className="tile">
            <div className="lab">Direction</div>
            <div className="val">{directionLabel}</div>
            <div className="sub">Resolved from amount sign</div>
          </div>
          <div className="tile">
            <div className="lab">Category</div>
            <div className="val">{categoryLabel}</div>
            <div className="sub">
              {row.categoryOverride ? "Manually re-categorised" : "From Xero mapping"}
            </div>
          </div>
          <div className="tile">
            <div className="lab">Synced</div>
            <div className="val">{relativeSync(row.syncedAt)}</div>
            <div className="sub">
              {xero.connected
                ? xero.organisationName ?? "Xero connected"
                : "Manual import"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Flagged banner ─────────────────────── */}
      {flag ? (
        <div className="txd2-flag-banner">
          <div className="flag-title">
            <span className="warn-dot" aria-hidden="true" />
            {flag.title}
          </div>
          <p className="flag-body">{flag.body}</p>
        </div>
      ) : null}

      {/* ── Detail grid ────────────────────────── */}
      <div className="txd2-card">
        <h3>Transaction detail</h3>
        <div className="txd2-detail-grid">
          <div className="cell">
            <div className="k">Date</div>
            <div className="v">{formatDate(row.transactionDate)}</div>
          </div>
          <div className="cell">
            <div className="k">Vendor</div>
            <div className="v">
              {row.vendorName ?? <span className="muted">Unknown</span>}
            </div>
          </div>
          <div className="cell">
            <div className="k">Amount</div>
            <div className={`v ${direction === "out" ? "bad" : "good"} mono`}>
              {direction === "out" ? "−" : "+"}
              {formatCurrency(row.amountCents, row.currency)}
            </div>
          </div>
          <div className="cell">
            <div className="k">Currency</div>
            <div className="v mono">{row.currency}</div>
          </div>
          <div className="cell">
            <div className="k">Xero account code</div>
            <div className="v mono">{row.xeroAccountCode}</div>
          </div>
          <div className="cell">
            <div className="k">Xero assignment</div>
            <div className="v">
              {CATEGORY_LABEL[row.assignedCategory] ?? row.assignedCategory}
            </div>
          </div>
          {row.categoryOverride ? (
            <div className="cell">
              <div className="k">Manual override</div>
              <div className="v brand">
                {CATEGORY_LABEL[row.categoryOverride] ?? row.categoryOverride}
              </div>
            </div>
          ) : null}
          <div className="cell">
            <div className="k">Synced at</div>
            <div className="v mono">{formatDate(row.syncedAt)}</div>
          </div>
          <div className="cell">
            <div className="k">Transaction ID</div>
            <div className="v mono small">{row.id}</div>
          </div>
        </div>
      </div>

      {/* ── Specialist insight card (honest empty) ─ */}
      <div className="txd2-card">
        <h3>Specialist read</h3>
        <div className="txd2-empty">
          <p style={{ margin: 0 }}>
            <strong>No specialist read on this transaction yet.</strong>{" "}
            Finn&apos;s per-transaction insight runs off the month rollup —
            open this month in the{" "}
            <Link href="/money">plan variance view</Link> for the cross-
            transaction narrative.
          </p>
        </div>
      </div>

      {/* ── Actions strip ──────────────────────── */}
      <div className="txd2-actions">
        <span className="txd2-btn primary sm soon" title="Re-categorise flow ships with the Variance view">
          Re-categorise
        </span>
        <span className="txd2-btn sm soon" title="Deep link to Xero ships with the Xero OAuth flow">
          Open in Xero
        </span>
        <span className="txd2-btn sm soon" title="Tag-to-project ships with the project ledger">
          Tag to project
        </span>
      </div>

      {/* ── Related transactions rail (honest empty) ─ */}
      <div className="txd2-card">
        <h3>Other transactions this category</h3>
        <div className="txd2-empty">
          <p style={{ margin: 0 }}>
            Related-transaction rollups live in the{" "}
            <Link href="/money">plan variance view</Link>. Open the relevant
            month there to see every {categoryLabel.toLowerCase()} transaction
            side-by-side.
          </p>
        </div>
      </div>
    </div>
  )
}

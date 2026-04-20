/**
 * CostDetailView — Money cost-line drill page (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-COST-DETAIL.html. Scoped CSS under `.cd2` keeps
 * styling isolated so the page matches the mockup without leaking styles
 * into the rest of the platform (convention mirrors `.pd2` / PartDetailView
 * and `.mck2` / CockpitView).
 *
 * Sections (top to bottom, matching mockup order):
 *   1. Breadcrumb + back chip
 *   2. Cost header — kicker, title, meta row, action strip
 *   3. Specialist strip — honest empty until lever engine ships
 *   4. Two-column split:
 *        Left:   history chart (empty), assumptions list (from line item),
 *                sensitivity table (honest empty)
 *        Right:  linked rail, accounting tags, related work (empty),
 *                audit trail (honest single entry from created_at)
 *
 * Empty-state policy (from brief):
 *   - No fabricated history numbers. No specialist quote text. No linked
 *     objectives/tasks. No "Finn suggests …" copy invented.
 *   - Real fields from plan_line_items are shown: amount_cents, frequency,
 *     direction, category, effective_from/to, xero_account_code, owner,
 *     accounting_tags, notes, source, created_at, updated_at.
 *   - Xero rail row renders only when connected (real connection row).
 *   - "Connect Xero to populate" CTA where history/actuals would sit.
 */

"use client"

import Link from "next/link"
import "./cost-detail-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface CostDetailLineItem {
  id: string
  name: string
  direction: "in" | "out"
  category: string
  amountCents: number
  currency: string
  frequency: string
  effectiveFrom: string
  effectiveTo: string | null
  probabilityPct: number
  xeroAccountCode: string | null
  accountingTags: string[]
  notes: string | null
  source: string
  createdAt: string
  updatedAt: string
}

export interface CostDetailOwner {
  id: string
  name: string
}

export interface CostDetailXero {
  connected: boolean
  organisationName: string | null
  lastSyncAt: string | null
  syncState: string | null
}

export interface CostDetailViewProps {
  line: CostDetailLineItem
  owner: CostDetailOwner | null
  xero: CostDetailXero
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Format pence as GBP (or given currency). Uses the tabular figures we rely
 * on in the rest of Money so columns line up.
 */
function formatCurrency(cents: number, currency: string): string {
  const whole = cents / 100
  const abs = Math.abs(whole)
  const sign = whole < 0 ? "−" : ""
  const prefix = currency === "GBP" ? "£" : currency === "USD" ? "$" : ""
  if (abs >= 100_000) {
    return `${sign}${prefix}${Math.round(abs).toLocaleString()}`
  }
  return `${sign}${prefix}${abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Multiply frequency → annual. Returns null when frequency is "variable"
 * or "one_off" where an annualised number would mislead.
 */
function annualise(cents: number, frequency: string): number | null {
  switch (frequency) {
    case "weekly":
      return cents * 52
    case "monthly":
      return cents * 12
    case "quarterly":
      return cents * 4
    case "annual":
      return cents
    default:
      return null
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
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

/** Human labels for category enum — matches the plan grid. */
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

const FREQUENCY_LABEL: Record<string, string> = {
  one_off: "One-off",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  variable: "Variable",
}

// ─── View ──────────────────────────────────────────────────────────────

export function CostDetailView(props: CostDetailViewProps): React.ReactElement {
  const { line, owner, xero } = props
  const directionLabel = line.direction === "in" ? "Cash in" : "Cash out"
  const kickerTone = line.direction === "in" ? "in" : "out"
  const categoryLabel = CATEGORY_LABEL[line.category] ?? line.category
  const frequencyLabel = FREQUENCY_LABEL[line.frequency] ?? line.frequency
  const annual = annualise(line.amountCents, line.frequency)

  return (
    <div className="cd2">

      {/* ── Breadcrumb ─────────────────────────── */}
      <div className="cd2-page-head">
        <div className="cd2-crumbs">
          <Link href="/money">Money</Link>
          <span className="sep">›</span>
          <Link href="/money">Plan</Link>
          <span className="sep">›</span>
          <span className="current">{line.name}</span>
        </div>
        <div className="cd2-ctx-chips">
          <Link href="/money" className="cd2-btn sm">
            ← Back to plan
          </Link>
        </div>
      </div>

      {/* ── Cost header ────────────────────────── */}
      <div className="cd2-head">
        <div className={`cd2-kicker ${kickerTone}`}>
          {directionLabel} · {categoryLabel} · {frequencyLabel}
          {line.source === "legacy_migration" ? " · migrated" : null}
        </div>
        <h1>
          <span className="cd2-title-dot" aria-hidden="true" />
          {line.name}
        </h1>
        <div className="cd2-meta">
          <span className="m">
            <strong>{formatCurrency(line.amountCents, line.currency)}</strong>
            {line.frequency === "monthly" ? "/mo" : null}
            {line.frequency === "weekly" ? "/wk" : null}
            {line.frequency === "annual" ? "/yr" : null}
            {line.frequency === "quarterly" ? "/qtr" : null}
          </span>
          {annual != null ? (
            <span className="m">
              <strong>{formatCurrency(annual, line.currency)}</strong>/yr
            </span>
          ) : null}
          {line.direction === "in" && line.probabilityPct !== 100 ? (
            <span className="m">
              <strong>{line.probabilityPct}%</strong> probability
            </span>
          ) : null}
          <span className="m">
            Active from <strong>{formatDate(line.effectiveFrom)}</strong>
          </span>
          {line.effectiveTo ? (
            <span className="m">
              until <strong>{formatDate(line.effectiveTo)}</strong>
            </span>
          ) : null}
          {owner ? (
            <span className="m">
              Owner · <strong>{owner.name}</strong>
            </span>
          ) : null}
        </div>
        <div className="cd2-actions">
          <span
            className="cd2-btn primary sm soon"
            title="Line-item editor ships with Plan editor"
          >
            Edit line item
          </span>
          {xero.connected ? (
            <span className="cd2-btn sm soon" title="Deep link to Xero ships with the Xero OAuth flow">
              Open in Xero
            </span>
          ) : null}
          <span className="cd2-btn sm soon" title="Scheduled plan changes ship with the scenario engine">
            Schedule change
          </span>
          <span className="cd2-btn sm soon" title="CSV export ships with the reporting pack">
            Export to CSV
          </span>
        </div>
      </div>

      {/* ── Specialist strip (honest empty) ────── */}
      <div className="cd2-specialist-strip">
        <div className="cd2-avatar">FN</div>
        <div className="cd2-msg">
          <strong>Specialist take · not yet available.</strong>
          {" "}Finn will surface cost levers here once actuals are wired —
          the lever engine works off a history baseline (Xero) you haven&apos;t
          connected yet.
        </div>
        <Link href="/money/connect" className="cd2-btn sm">
          Connect Xero
        </Link>
      </div>

      {/* ── Two-column split ───────────────────── */}
      <div className="cd2-split">

        {/* LEFT COLUMN */}
        <div className="cd2-col-left">

          {/* History chart — honest empty until Xero is wired */}
          <div className="cd2-card">
            <h3>Actual spend · history</h3>
            {xero.connected ? (
              <div className="cd2-empty">
                <p style={{ margin: 0 }}>
                  Xero is connected but historical transactions haven&apos;t
                  landed yet. First sync populates this chart.
                </p>
                <p style={{ margin: "8px 0 0" }}>
                  Last sync: {relativeSync(xero.lastSyncAt)}.
                </p>
              </div>
            ) : (
              <div className="cd2-empty">
                <p style={{ margin: 0 }}>
                  <strong>No actuals yet.</strong> Connect Xero to see monthly
                  history against this plan line.
                </p>
                <p style={{ margin: "8px 0 0" }}>
                  <Link href="/money/connect">Connect a data source →</Link>
                </p>
              </div>
            )}
          </div>

          {/* Assumptions (real fields from the line item) */}
          <div className="cd2-card">
            <h3>Assumptions that drive this number</h3>

            <div className="cd2-assumption-row">
              <div className="a-name">Amount</div>
              <div className="a-val">
                {formatCurrency(line.amountCents, line.currency)}
              </div>
              <div className="a-note">{frequencyLabel} · {line.currency}</div>
            </div>

            <div className="cd2-assumption-row">
              <div className="a-name">Category</div>
              <div className="a-val">{categoryLabel}</div>
              <div className="a-note">{directionLabel}</div>
            </div>

            <div className="cd2-assumption-row">
              <div className="a-name">Active window</div>
              <div className="a-val">
                {formatDate(line.effectiveFrom)}
                {line.effectiveTo ? ` → ${formatDate(line.effectiveTo)}` : " → indefinite"}
              </div>
              <div className="a-note">
                Source: {line.source.replace(/_/g, " ")}
              </div>
            </div>

            {line.direction === "in" ? (
              <div className="cd2-assumption-row">
                <div className="a-name">Probability</div>
                <div className="a-val">{line.probabilityPct}%</div>
                <div className="a-note">Reduces expected-value in roll-up</div>
              </div>
            ) : null}

            {line.xeroAccountCode ? (
              <div className="cd2-assumption-row">
                <div className="a-name">Xero account code</div>
                <div className="a-val">{line.xeroAccountCode}</div>
                <div className="a-note">
                  Used to reconcile Xero actuals back to this line
                </div>
              </div>
            ) : (
              <div className="cd2-assumption-row">
                <div className="a-name">Xero account code</div>
                <div className="a-val empty">—</div>
                <div className="a-note">
                  Not mapped — set during Xero onboarding
                </div>
              </div>
            )}
          </div>

          {/* Sensitivity — honest empty */}
          <div className="cd2-card">
            <h3>Sensitivity · impact on runway</h3>
            <div className="cd2-empty">
              <p style={{ margin: 0 }}>
                <strong>No sensitivity levers yet.</strong> This table shows
                what happens to runway if you delay, pause, or scale this
                line — it reads from the scenario engine, which ships with
                the scenario builder.
              </p>
              <p style={{ margin: "8px 0 0" }}>
                For now, adjust the line in the{" "}
                <Link href="/money">Plan grid</Link> and the Cockpit updates
                immediately.
              </p>
            </div>
          </div>

          {/* Founder notes */}
          {line.notes ? (
            <div className="cd2-card">
              <h3>Notes</h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "var(--cd-fg)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                }}
              >
                {line.notes}
              </p>
            </div>
          ) : null}
        </div>

        {/* RIGHT RAIL */}
        <div className="cd2-col-right">

          <div className="cd2-rail">
            <div className="rc-head">Linked</div>
            <div className="rc-body">
              <div className="rail-row">
                <span className="k">Owner</span>
                <span className="v">
                  {owner ? owner.name : <span className="muted">Not assigned</span>}
                </span>
              </div>
              <div className="rail-row">
                <span className="k">Direction</span>
                <span className="v">{directionLabel}</span>
              </div>
              <div className="rail-row">
                <span className="k">Frequency</span>
                <span className="v">{frequencyLabel}</span>
              </div>
              <div className="rail-row">
                <span className="k">Xero account</span>
                <span className="v">
                  {line.xeroAccountCode
                    ? <span className="brand">{line.xeroAccountCode}</span>
                    : <span className="muted">Not mapped</span>}
                </span>
              </div>
              <div className="rail-row">
                <span className="k">Last Xero sync</span>
                <span className="v muted">
                  {xero.connected ? relativeSync(xero.lastSyncAt) : "Not connected"}
                </span>
              </div>
            </div>
          </div>

          <div className="cd2-rail">
            <div className="rc-head">Accounting tags</div>
            <div className="rc-body tag-body">
              {line.accountingTags.length > 0 ? (
                <>
                  Founder-facing: <strong className="fg">{categoryLabel}</strong>
                  <br />
                  Exports with:{" "}
                  {line.accountingTags.map((t, i) => (
                    <span key={t}>
                      <code>{t}</code>
                      {i < line.accountingTags.length - 1 ? " " : null}
                    </span>
                  ))}
                </>
              ) : (
                <>
                  No accounting tags yet. Tags are set on the line-item editor
                  and used by Xero/QBO/FreeAgent on export.
                </>
              )}
            </div>
          </div>

          <div className="cd2-rail">
            <div className="rc-head">Related work</div>
            <div className="cd2-empty" style={{ borderRadius: 0, border: "none" }}>
              <p style={{ margin: 0 }}>
                No linked objectives or tasks yet. Related work surfaces
                here once the tagging flow ships.
              </p>
            </div>
          </div>

          <div className="cd2-rail">
            <div className="rc-head">Audit trail</div>
            <div className="rc-body audit-body">
              <div>
                {formatDate(line.updatedAt)} ·{" "}
                <strong className="fg">Last edited</strong>
              </div>
              <div>
                {formatDate(line.createdAt)} ·{" "}
                <strong className="fg">Line item created</strong>
                {line.source === "legacy_migration"
                  ? " (migrated from Cash Burn)"
                  : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

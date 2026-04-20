/**
 * CockpitView — Money Cockpit landing page (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-COCKPIT.html. Scoped CSS under `.mck2` keeps the
 * styling isolated so the Cockpit palette/typography don't leak into the
 * rest of the platform.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb + context chips (scenario, data source)
 *   2. Connect-source banner (shown while Xero not wired)
 *   3. Runway hero — single-number tile + bank-balance sparkline
 *   4. Finance specialist (Finn) CTA strip
 *   5. KPI strip — 4 tiles (cash out/in/net burn/days since raise)
 *   6. Split — biggest movers (out / in) + raise status card
 *   7. Upcoming commitments grid
 *   8. Data-source foot + quick actions
 *
 * Empty-state policy: Money V2 has NO real wired data sources today —
 * Xero / Stripe / Gmail integrations haven't been built. Every number
 * that depends on actuals or live plan projections renders as "—" with
 * a "Connect Xero to populate" banner. Real fields that DO exist today
 * (active investor round target + stage counts + plan line-item count +
 * Xero connection status) are bound where present.
 */

"use client"

import Link from "next/link"
import "./cockpit-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface CockpitRaiseSnapshot {
  /** Active round name — "Pre-seed · Summer 2026". Null when no active round exists. */
  name: string | null
  /** Target amount in pence. Null when no round exists. */
  targetCents: number | null
  /** Currency code for the round ("GBP" / "USD"). */
  currency: string
  /** Days between today and close_date (negative = overdue). Null when no round exists. */
  weeksToClose: number | null
  /** Close date ISO string. Null when no round exists. */
  closeDateIso: string | null
  /** Verbal commit total in pence (sum of commit_amount_cents for pipeline rows at verbal stage). */
  verbalCents: number
  /** Closed commit total in pence (sum of commit_amount_cents for pipeline rows at closed stage). */
  closedCents: number
  /** Counts per stage from investor_pipeline_state for this round. */
  stageCounts: {
    target: number
    researching: number
    contacted: number
    meeting: number
    due_diligence: number
    verbal: number
    closed: number
    passed: number
  }
}

export interface CockpitXeroSnapshot {
  /** True when a xero_connection row exists for this foundry. */
  connected: boolean
  /** Organisation name from the row. Null when not connected. */
  organisationName: string | null
  /** Last sync ISO. Null when never synced. */
  lastSyncAt: string | null
  /** Sync state: healthy / syncing / error / paused. */
  syncState: string | null
}

export interface CockpitViewProps {
  /** Foundry-level settings — used for currency + runway thresholds. */
  settings: {
    currency: string
    runwayDangerWeeks: number
    runwayHealthyWeeks: number
  }
  /** Xero connection status (drives the data-source pill + connect banner). */
  xero: CockpitXeroSnapshot
  /** Total non-archived plan_line_items rows for this foundry. */
  planLineItemCount: number
  /** Active investor round snapshot. Null when no active round exists. */
  raise: CockpitRaiseSnapshot | null
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatGbp(cents: number | null, currency = "GBP"): string {
  if (cents == null) return "—"
  const value = cents / 100
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : ""
  if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 10_000) return `${symbol}${Math.round(value / 1000).toLocaleString()}k`
  if (Math.abs(value) >= 1000) return `${symbol}${(value / 1000).toFixed(1)}k`
  return `${symbol}${Math.round(value).toLocaleString()}`
}

function formatRelativeSync(iso: string | null): string {
  if (!iso) return "never synced"
  const then = new Date(iso).getTime()
  const delta = Date.now() - then
  const minutes = Math.round(delta / 60_000)
  if (minutes < 1) return "synced just now"
  if (minutes < 60) return `synced ${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `synced ${hours}h ago`
  const days = Math.round(hours / 24)
  return `synced ${days}d ago`
}

// ─── Component ──────────────────────────────────────────────────────────

export function CockpitView({
  settings,
  xero,
  planLineItemCount,
  raise,
}: CockpitViewProps): React.ReactElement {
  const hasActuals = xero.connected && xero.syncState === "healthy"
  const hasAnyPlan = planLineItemCount > 0
  const hasRound = raise != null && raise.targetCents != null

  return (
    <div className="mck2">
      {/* 1 · Breadcrumb + context chips */}
      <div className="mck2-page-head">
        <div className="mck2-crumbs">
          <Link href="/money">Money</Link>
          <span className="sep">›</span>
          <span className="current">Cockpit</span>
        </div>
        <div className="mck2-ctx-chips">
          <span className="mck2-pill brand">Default scenario</span>
          {xero.connected ? (
            <span className="mck2-pill info">
              Xero · {formatRelativeSync(xero.lastSyncAt)}
            </span>
          ) : (
            <span className="mck2-pill warn">No accounting connected</span>
          )}
        </div>
      </div>

      {/* 2 · Connect-source banner (only when Xero not wired) */}
      {!xero.connected && (
        <div className="mck2-banner" role="status">
          <div className="mck2-banner-icon icon" aria-hidden="true">
            ⇄
          </div>
          <div className="body">
            <strong>Cockpit is running on your plan only.</strong>{" "}
            Connect Xero (or QuickBooks) to turn forecast numbers into real
            numbers — bank balance, runway, and upcoming commitments will
            populate from your actuals.
          </div>
          <div className="actions">
            <Link href="/money/connect/xero" className="mck2-btn primary">
              Connect accounting
            </Link>
          </div>
        </div>
      )}

      {/* 3 · Runway hero */}
      <div className="mck2-hero">
        <div className="mck2-hero-inner">
          <div>
            <div className="kicker">Runway at current burn</div>
            <div className="big-num">
              <span className="placeholder">—</span>
              <small>weeks</small>
            </div>
            <div className="explain">
              {hasAnyPlan ? (
                <>
                  Runway computes once you connect accounting — we&apos;ll use
                  your actuals plus the{" "}
                  <strong>
                    {planLineItemCount} plan line
                    {planLineItemCount === 1 ? "" : "s"}
                  </strong>{" "}
                  you&apos;ve already captured to project cash to zero.
                </>
              ) : (
                <>
                  Your plan is empty, so there&apos;s nothing to project yet.
                  Add a few cost and income lines, then connect accounting to
                  see real runway.
                </>
              )}
            </div>
            <span className="tag empty">
              Healthy threshold · {settings.runwayHealthyWeeks}+ weeks
            </span>
          </div>
          <div className="mck2-hero-chart empty">
            <div>
              <div className="placeholder-title">No bank history yet</div>
              <div>
                Connect Xero to show your last 12 weeks of bank balance here.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 · Finn specialist CTA */}
      <div className="mck2-spec">
        <div className="avatar" aria-hidden="true">
          FN
        </div>
        <div className="msg">
          <strong>Finance · Finn</strong> · Variance checks and burn watchpoints
          appear here once you&apos;ve connected accounting and had a month of
          actuals. For now, start by editing your plan so the baseline matches
          reality.
        </div>
        <Link href="/money/plan" className="mck2-btn">
          Open plan
        </Link>
      </div>

      {/* 5 · KPI strip — all placeholder until actuals exist */}
      <div className="mck2-kpi-strip">
        <div className="mck2-kpi-card">
          <div className="lab">Cash out · this month</div>
          <div className="val empty">—</div>
          <div className="delta flat">No actuals yet</div>
          <div className="sub">Connect Xero to populate.</div>
        </div>
        <div className="mck2-kpi-card">
          <div className="lab">Cash in · this month</div>
          <div className="val empty">—</div>
          <div className="delta flat">No actuals yet</div>
          <div className="sub">Connect Xero to populate.</div>
        </div>
        <div className="mck2-kpi-card">
          <div className="lab">Net burn · this month</div>
          <div className="val empty">—</div>
          <div className="delta flat">No actuals yet</div>
          <div className="sub">Connect Xero to populate.</div>
        </div>
        <div className="mck2-kpi-card">
          <div className="lab">Days since last raise</div>
          <div className="val empty">—</div>
          <div className="delta flat">
            {hasRound ? "Round open · no closes yet" : "No round defined"}
          </div>
          <div className="sub">
            {hasRound
              ? "Updates once the first commit closes."
              : "Start a round in Raise to track this."}
          </div>
        </div>
      </div>

      {/* 6 · Movers + Raise status */}
      <div className="mck2-split">
        {/* Biggest movers — no actuals → honest empty */}
        <div className="mck2-card">
          <div className="mck2-card-head">
            <h3>Biggest movers this month</h3>
            <span className="period">
              {hasActuals ? "From Xero actuals" : "No actuals yet"}
            </span>
          </div>
          <div className="mck2-movers-split">
            <div className="mck2-movers-side out">
              <h4>
                <span className="dot" aria-hidden="true"></span> Out
              </h4>
              <div className="mck2-movers-empty">
                <strong>Nothing recorded yet.</strong> Biggest outgoing
                movements will appear here once your accounting is connected
                and a transaction has posted this month.
              </div>
            </div>
            <div className="mck2-movers-side in">
              <h4>
                <span className="dot" aria-hidden="true"></span> In
              </h4>
              <div className="mck2-movers-empty">
                <strong>Nothing recorded yet.</strong> Incoming payments,
                grants, and pilot invoices land here once accounting is
                connected.
              </div>
            </div>
          </div>
        </div>

        {/* Raise status */}
        <div className="mck2-card mck2-raise">
          {hasRound && raise ? (
            <RaiseActive raise={raise} />
          ) : (
            <RaiseEmpty />
          )}
        </div>
      </div>

      {/* 7 · Upcoming commitments */}
      <div className="mck2-card" style={{ marginBottom: 20 }}>
        <div className="mck2-card-head">
          <h3>Upcoming commitments</h3>
          <span className="period">Next 30 days · excludes payroll</span>
        </div>
        <div className="mck2-commit-list">
          <div className="mck2-commit-empty">
            <strong>No scheduled commitments yet.</strong>{" "}
            {hasActuals
              ? "Recurring bills and tax filings appear here once Xero has categorised them."
              : "Connect accounting to auto-populate VAT, payroll, rent, and tax deadlines."}
          </div>
        </div>
      </div>

      {/* 8 · Data source foot + quick actions */}
      <div className="mck2-foot">
        <div className="mck2-data-src">
          <span className={`src-pill ${xero.connected ? "" : "off"}`}>
            {xero.connected
              ? `Xero · ${formatRelativeSync(xero.lastSyncAt)}`
              : "Not connected"}
          </span>
          <span className="dim">|</span>
          <span>
            {xero.connected
              ? "Actuals from bank + invoices · forecast layered in via Plan."
              : "Running on plan only · no live accounting data yet."}
          </span>
          <span className="dim">|</span>
          <Link href="/money/connect/xero">Switch source</Link>
        </div>
        <div className="mck2-quick-actions">
          <Link href="/money/plan" className="mck2-btn sm">
            + Log expense
          </Link>
          <Link href="/money/plan" className="mck2-btn sm">
            + Send invoice
          </Link>
          <Link href="/money/plan" className="mck2-btn sm">
            Open plan
          </Link>
          <Link href="/money/raise" className="mck2-btn sm">
            Open raise
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Raise sub-components ───────────────────────────────────────────────

function RaiseActive({ raise }: { raise: CockpitRaiseSnapshot }): React.ReactElement {
  const target = raise.targetCents ?? 0
  const committed = raise.closedCents
  const verbal = raise.verbalCents
  const committedPct = target > 0 ? Math.min(100, (committed / target) * 100) : 0
  const verbalPct =
    target > 0 ? Math.min(100 - committedPct, (verbal / target) * 100) : 0

  const contacted =
    raise.stageCounts.contacted +
    raise.stageCounts.meeting +
    raise.stageCounts.due_diligence
  const totalInPipeline =
    raise.stageCounts.target +
    raise.stageCounts.researching +
    contacted +
    raise.stageCounts.verbal +
    raise.stageCounts.closed

  return (
    <>
      <h3>{raise.name}</h3>
      <div className="sub">
        Target {formatGbp(raise.targetCents, raise.currency)}
        {raise.weeksToClose != null &&
          raise.weeksToClose > 0 &&
          ` · ${raise.weeksToClose} weeks to close`}
        {raise.weeksToClose != null &&
          raise.weeksToClose <= 0 &&
          ` · close date reached`}
      </div>
      <div className="mck2-round-prog">
        <div className="bar" role="img" aria-label="Round progress bar">
          <div className="fill" style={{ width: `${committedPct}%` }}></div>
        </div>
        <div className="legend">
          <span>
            <strong>{formatGbp(committed, raise.currency)}</strong> committed
            {verbal > 0 && (
              <>
                {" "}
                · <strong>{formatGbp(verbal, raise.currency)}</strong> verbal
              </>
            )}
          </span>
          <span>of {formatGbp(raise.targetCents, raise.currency)} target</span>
        </div>
      </div>
      <div className="mck2-raise-meta">
        <div className="m-row">
          <span className="k">Contacted</span>
          <span className={`v ${totalInPipeline === 0 ? "empty" : ""}`}>
            {totalInPipeline === 0
              ? "0 yet"
              : `${contacted} of ${totalInPipeline}`}
          </span>
        </div>
        <div className="m-row">
          <span className="k">In DD</span>
          <span className={`v ${raise.stageCounts.due_diligence === 0 ? "empty" : ""}`}>
            {raise.stageCounts.due_diligence}
          </span>
        </div>
        <div className="m-row">
          <span className="k">Verbal</span>
          <span className={`v ${raise.stageCounts.verbal === 0 ? "empty" : ""}`}>
            {raise.stageCounts.verbal}
          </span>
        </div>
        <div className="m-row">
          <span className="k">Closed</span>
          <span className={`v ${raise.stageCounts.closed === 0 ? "empty" : ""}`}>
            {raise.stageCounts.closed}
          </span>
        </div>
      </div>
      <div className="mck2-raise-ctas">
        <Link href="/money/raise" className="mck2-btn primary sm">
          Open raise
        </Link>
        <Link href="/money/raise" className="mck2-btn sm">
          Pipeline
        </Link>
      </div>
    </>
  )
}

function RaiseEmpty(): React.ReactElement {
  return (
    <>
      <h3>No active round</h3>
      <div className="sub">
        Define your next round to track targets, pipeline, and pitch readiness.
      </div>
      <div className="mck2-raise-empty">
        <div className="title">Ready to raise?</div>
        <p>
          Create a round and the Cockpit surfaces your commit progress here —
          verbal vs closed, weeks to close, and pipeline coverage against
          target. Not ready yet? Browse matches in Raise first.
        </p>
        <div className="mck2-raise-ctas">
          <Link href="/money/raise" className="mck2-btn primary sm">
            Open raise
          </Link>
          <Link href="/money/raise" className="mck2-btn sm">
            Browse matches
          </Link>
        </div>
      </div>
    </>
  )
}

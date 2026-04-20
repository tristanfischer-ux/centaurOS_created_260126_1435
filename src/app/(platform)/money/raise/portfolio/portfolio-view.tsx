/**
 * PortfolioView — Money Raise · Portfolio (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-PORTFOLIO.html. Scoped CSS under `.pfo2`.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb + context chips (Send next update, Export cap table)
 *   2. Header with orange dot accent + stats tiles (4)
 *   3. Tabs (Shareholders · Cap table · Rights & info obligations · Update history)
 *   4. Shareholder cards — closed first, then verbal faded
 *   5. Empty state — "Once you close a round, your investors land here"
 *
 * Empty-state policy: if no closed or verbal holders exist, render a
 * single empty state with the exact copy above. Stats tiles still render
 * but with honest zero values. No fabricated investor names. If a
 * pipeline row has no linked marketplace listing (no firmTitle), render
 * "Investor" as the heading — not a made-up firm name.
 */

"use client"

import Link from "next/link"

import "./portfolio-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface PortfolioActiveRound {
  id: string
  name: string
  targetCents: number
  currency: string
  closeDateIso: string
}

export interface PortfolioHolder {
  /** investor_pipeline_state.id — stable key for React list. */
  id: string
  stage: "closed" | "verbal"
  /** commit_amount_cents — nullable for verbal rows that haven't been sized yet. */
  commitCents: number | null
  /** stage_entered_at — used for "N days ago" label on closed holders. */
  stageEnteredAtIso: string
  /** lead/co_lead/follower/undecided — drives role pill. */
  leadRole: string | null
  /** Firm name from linked marketplace_listings.title. Null when no link exists. */
  firmTitle: string | null
  firmCity: string | null
  firmCountry: string | null
  firmSubcategory: string | null
}

export interface PortfolioViewProps {
  activeRound: PortfolioActiveRound | null
  closedHolders: PortfolioHolder[]
  verbalHolders: PortfolioHolder[]
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatMoney(cents: number | null, currency = "GBP"): string {
  if (cents == null) return "—"
  const value = cents / 100
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : ""
  if (Math.abs(value) >= 1_000_000) {
    return `${symbol}${(value / 1_000_000).toFixed(2)}M`
  }
  if (Math.abs(value) >= 10_000) {
    return `${symbol}${Math.round(value / 1000).toLocaleString()}k`
  }
  if (Math.abs(value) >= 1000) {
    return `${symbol}${(value / 1000).toFixed(1)}k`
  }
  return `${symbol}${Math.round(value).toLocaleString()}`
}

function formatDaysAgo(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const delta = Date.now() - then
    const days = Math.round(delta / (24 * 60 * 60 * 1000))
    if (days <= 0) return "today"
    if (days === 1) return "yesterday"
    if (days < 30) return `${days} days ago`
    const months = Math.round(days / 30)
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`
    const years = Math.round(days / 365)
    return `${years} year${years === 1 ? "" : "s"} ago`
  } catch {
    return ""
  }
}

function formatFullDate(iso: string): string {
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

function initialsFor(title: string | null): string {
  if (!title) return "IN"
  const parts = title
    .split(/\s+/)
    .filter((p) => p.length > 0 && /[A-Za-z]/.test(p[0]))
  if (parts.length === 0) return "IN"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// ─── Component ──────────────────────────────────────────────────────────

export function PortfolioView({
  activeRound,
  closedHolders,
  verbalHolders,
}: PortfolioViewProps): React.ReactElement {
  const closedCount = closedHolders.length
  const verbalCount = verbalHolders.length
  const totalRaisedCents = closedHolders.reduce(
    (sum, h) => sum + (h.commitCents ?? 0),
    0,
  )
  const currency = activeRound?.currency ?? "GBP"

  const hasAnyHolder = closedCount > 0 || verbalCount > 0

  // Oldest closed holder drives the "since DATE" subtitle on the total-raised tile.
  const oldestClosed = [...closedHolders].sort((a, b) =>
    a.stageEnteredAtIso.localeCompare(b.stageEnteredAtIso),
  )[0]

  return (
    <div className="pfo2">
      {/* 1 · Breadcrumb + context chips */}
      <div className="pfo2-page-head">
        <div className="pfo2-crumbs">
          <Link href="/money">Money</Link>
          <span className="sep">›</span>
          <Link href="/money/raise">Raise</Link>
          <span className="sep">›</span>
          <span className="current">Portfolio</span>
        </div>
        <div className="pfo2-ctx-chips">
          <span
            className="pfo2-btn sm muted"
            aria-disabled="true"
            title="Board pack composer wires up next round"
          >
            Send next update
          </span>
          <span
            className="pfo2-btn sm muted"
            aria-disabled="true"
            title="Cap-table export wires up next round"
          >
            Export cap table
          </span>
        </div>
      </div>

      {/* 2 · Header with gradient + stats tiles */}
      <section className="pfo2-head">
        <h1>
          Portfolio ·{" "}
          <span className="pfo2-head-count">
            {closedCount} {closedCount === 1 ? "shareholder" : "shareholders"}
          </span>
        </h1>
        <div className="sub">
          Investors who&apos;ve already wired. They receive your monthly
          updates, hold rights under the SAFE or equity instrument, and appear
          on your cap table. Distinct from the active round pipeline.
        </div>
        <div className="pfo2-stats">
          <div className="tile">
            <div className="lab">Shareholders</div>
            <div className="val">{closedCount}</div>
            <div className="sub">
              {verbalCount > 0
                ? `+${verbalCount} verbal pending close`
                : activeRound
                  ? "No verbal commits yet"
                  : "Not yet raising"}
            </div>
          </div>
          <div className="tile">
            <div className="lab">Total raised to date</div>
            <div className="val brand">
              {totalRaisedCents > 0
                ? formatMoney(totalRaisedCents, currency)
                : "—"}
            </div>
            <div className="sub">
              {oldestClosed
                ? `Since ${formatFullDate(oldestClosed.stageEnteredAtIso)}`
                : "No closes yet"}
            </div>
          </div>
          <div className="tile">
            <div className="lab">Round in progress</div>
            <div className="val">
              {activeRound ? activeRound.name : "—"}
            </div>
            <div className="sub">
              {activeRound
                ? `Target ${formatMoney(activeRound.targetCents, currency)}`
                : "No active round"}
            </div>
          </div>
          <div className="tile">
            <div className="lab">Next update due</div>
            <div className="val">—</div>
            <div className="sub">Board pack schedules next round</div>
          </div>
        </div>
      </section>

      {/* 3 · Tabs */}
      <nav className="pfo2-tabs" aria-label="Portfolio views">
        <button type="button" className="active" aria-current="page">
          Shareholders
        </button>
        <button type="button" disabled title="Cap table wires up next round">
          Cap table
        </button>
        <button type="button" disabled title="Rights wire up next round">
          Rights &amp; info obligations
        </button>
        <button type="button" disabled title="Update history wires up next round">
          Update history
        </button>
      </nav>

      {/* 4 · Shareholder cards — or empty state */}
      {!hasAnyHolder ? (
        <div className="pfo2-empty" role="status">
          <div className="pfo2-empty-icon" aria-hidden="true">
            ◎
          </div>
          <h2>Once you close a round, your investors land here</h2>
          <p>
            When an investor moves to <strong>Closed</strong> in your pipeline,
            they appear on this page as a shareholder — with the amount they
            wired, the date they signed, and the rights attached to their
            instrument. Verbal commits show faded until they close.
          </p>
          <div className="pfo2-empty-actions">
            <Link href="/money/raise" className="pfo2-btn primary">
              Open pipeline
            </Link>
          </div>
        </div>
      ) : (
        <>
          {closedHolders.map((holder) => (
            <HolderCard key={holder.id} holder={holder} currency={currency} />
          ))}
          {verbalHolders.map((holder) => (
            <HolderCard key={holder.id} holder={holder} currency={currency} />
          ))}
        </>
      )}
    </div>
  )
}

// ─── Holder card ────────────────────────────────────────────────────────

interface HolderCardProps {
  holder: PortfolioHolder
  currency: string
}

function HolderCard({ holder, currency }: HolderCardProps): React.ReactElement {
  const isVerbal = holder.stage === "verbal"
  const title = holder.firmTitle ?? "Investor"
  const locationBits = [holder.firmCity, holder.firmCountry].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  )
  const locationLabel = locationBits.join(", ")
  const subcategory = holder.firmSubcategory

  return (
    <article
      className={`pfo2-holder-card${isVerbal ? " verbal" : ""}`}
      aria-label={`${title} — ${isVerbal ? "verbal commitment" : "shareholder"}`}
    >
      <header className="holder-head">
        <div className="hh-avatar" aria-hidden="true">
          {initialsFor(holder.firmTitle)}
        </div>
        <div className="hh-title">
          <h3>
            {title}
            {isVerbal && <span className="stage-pill verbal">Verbal</span>}
          </h3>
          <div className="firm">
            {subcategory ? <span>{subcategory}</span> : null}
            {subcategory && locationLabel ? " · " : ""}
            {locationLabel ? <span>{locationLabel}</span> : null}
            {!subcategory && !locationLabel ? (
              <span>
                No directory profile linked — firm details populate once
                connected
              </span>
            ) : null}
          </div>
        </div>
        <div className="hh-amt">
          <div className="v">{formatMoney(holder.commitCents, currency)}</div>
          <div className="sub">
            {isVerbal
              ? "pending close"
              : `${formatFullDate(holder.stageEnteredAtIso)} · ${formatDaysAgo(holder.stageEnteredAtIso)}`}
          </div>
        </div>
        <span
          className="pfo2-btn"
          aria-disabled="true"
          title="Investor detail view wires up next round"
        >
          Open →
        </span>
      </header>
      <div className="holder-body">
        <div className="col">
          <h4>Instrument &amp; terms</h4>
          <div className="val">
            Captured with your pipeline move to{" "}
            <strong>{isVerbal ? "Verbal" : "Closed"}</strong>. Instrument,
            cap, discount, and MFN record once the close wizard is wired.
          </div>
        </div>
        <div className="col">
          <h4>Rights</h4>
          <div className="val">
            Info rights, board seat, and pro-rata terms record once the
            close wizard is wired.
          </div>
        </div>
        <div className="col">
          <h4>Role</h4>
          <div className="val">
            {holder.leadRole ? (
              <span className="role-pill">{holder.leadRole}</span>
            ) : (
              <span className="muted">Not yet declared</span>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

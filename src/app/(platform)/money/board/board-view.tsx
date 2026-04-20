/**
 * BoardView — Money Board pack / Investor update (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-BOARDPACK.html. Scoped CSS under `.bp2` keeps the
 * styling isolated so nothing leaks to other pages. Matches the mockup
 * top-to-bottom: header strip, two-column layout (document preview +
 * right rail), with an honest "Beta — exports run a dry run today"
 * banner at the top mirroring the Forge V2 Export pattern.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb + top CTAs (Save draft / Preview PDF / Send — all
 *      disabled in V1 because the send path ships next round)
 *   2. Beta banner — honest preview state
 *   3. Header strip — month label, cadence copy, title-dot (orange)
 *   4. Main grid:
 *      Left column:
 *        - Document card with 7 sections (Headline · Money · Traction
 *          · Build+Team · Pipeline · What's hard · Ask)
 *      Right column (rail):
 *        - Sections checklist
 *        - Recipients card
 *        - Sending details
 *        - Past updates
 *
 * Data contract (honest preview):
 *   - Real fields bound today: foundry currency, active round (name /
 *     target / verbal + closed commit sums / stage counts), pipeline
 *     recipient count. Past investor_update rows if any exist.
 *   - Fields that render as honest empty state ("—" / "Not yet declared"):
 *     cash balance, runway weeks, April net burn, MRR (no Xero yet),
 *     specific traction bullets, team details, "what's hard" narrative,
 *     ask block. The founder writes these once per cycle — we don't
 *     fabricate them.
 *
 * Per the user's "only real Supabase data" rule we strip any seed-literal
 * content — no placeholder names (Ada Chen / NimFarm / Octopus Ventures),
 * no made-up cash figures. If a field has no real source today, the UI
 * renders an honest empty line the founder can own.
 */

"use client"

import Link from "next/link"
import "./board-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface BoardViewProps {
  foundry: {
    id: string
    name: string
  }
  /** ISO month label for this update — e.g. "April 2026". */
  monthLabel: string
  /** Foundry reporting currency — e.g. "GBP". */
  currency: string
  /** Active raise round — null if none active. */
  round: {
    id: string
    name: string
    targetCents: number
    currency: string
    closeDateIso: string | null
    weeksToClose: number | null
    verbalCents: number
    closedCents: number
    stageCounts: Record<
      "target" | "researching" | "contacted" | "meeting" | "due_diligence" | "verbal" | "closed" | "passed",
      number
    >
  } | null
  /**
   * Pipeline recipient count — investors in stages meeting/DD/verbal/closed,
   * who would typically receive the monthly update.
   */
  pipelineRecipientCount: number
  /**
   * Past investor updates — real rows from investor_update. Empty list
   * is the expected V1 state.
   */
  pastUpdates: Array<{
    id: string
    monthLabel: string
    recipientCount: number
    openedCount: number
    repliedCount: number
  }>
  /**
   * Cadence hint — the last time an investor_update was sent for this
   * foundry. Null if none yet.
   */
  lastSentIso: string | null
  /**
   * Sender email — pulled from the authenticated user. Renders in the
   * "Send from" row. Null if not available.
   */
  senderEmail: string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatMoney(cents: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£"
  const abs = Math.abs(cents) / 100
  if (abs >= 1_000_000) return `${symbol}${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 10_000) return `${symbol}${Math.round(abs / 1000).toLocaleString()}k`
  if (abs >= 1000) return `${symbol}${(abs / 1000).toFixed(1)}k`
  return `${symbol}${Math.round(abs).toLocaleString()}`
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.round((Date.now() - then) / (24 * 60 * 60 * 1000)))
}

function todayString(): string {
  return new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

// ─── View ──────────────────────────────────────────────────────────────

export function BoardView(props: BoardViewProps): React.ReactElement {
  const {
    foundry,
    monthLabel,
    currency,
    round,
    pipelineRecipientCount,
    pastUpdates,
    lastSentIso,
    senderEmail,
  } = props

  const sendTooltip =
    "Sending investor updates ships next round — the drafting surface is live now; wire-up lands with Gmail OAuth."
  const exportTooltip =
    "PDF preview ships next round — the exporter renders the body you see above."

  const lastSentDays = daysSince(lastSentIso)
  const cadenceSubtitle = lastSentDays == null
    ? "Monthly cadence · first update · pre-filled from your current state"
    : `Monthly cadence · last sent ${lastSentDays} day${lastSentDays === 1 ? "" : "s"} ago · pre-filled from your current state`

  const currencySymbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£"

  // Pipeline KPI cells — only render real values where we have them.
  const pipelineTargetLabel = round ? formatMoney(round.targetCents, round.currency) : "—"
  const verbalLabel = round ? formatMoney(round.verbalCents, round.currency) : "—"
  const closedLabel = round ? formatMoney(round.closedCents, round.currency) : "—"
  const ddCount = round?.stageCounts.due_diligence ?? 0
  const meetingCount = round?.stageCounts.meeting ?? 0
  const inDdLabel = round ? `${ddCount} investor${ddCount === 1 ? "" : "s"}` : "—"

  const contactedOrLater = round
    ? round.stageCounts.contacted +
      round.stageCounts.meeting +
      round.stageCounts.due_diligence +
      round.stageCounts.verbal +
      round.stageCounts.closed
    : 0

  return (
    <div className="bp2">
      {/* ── Breadcrumb + CTAs ─────────────────────────────────────── */}
      <div className="bp2-page-head">
        <div className="bp2-crumbs">
          <Link href="/money">Money</Link>
          <span className="sep">›</span>
          <Link href="/money/raise">Raise</Link>
          <span className="sep">›</span>
          <span className="current">Investor update · {monthLabel}</span>
        </div>
        <div className="bp2-ctx-chips">
          <button type="button" className="bp2-btn soon" disabled title={sendTooltip}>
            Save draft
          </button>
          <button type="button" className="bp2-btn soon" disabled title={exportTooltip}>
            Preview PDF
          </button>
          <button type="button" className="bp2-btn primary soon" disabled title={sendTooltip}>
            Send to {pipelineRecipientCount} recipient{pipelineRecipientCount === 1 ? "" : "s"} →
          </button>
        </div>
      </div>

      {/* ── Beta banner — honest preview state ────────────────────── */}
      <div className="bp2-beta-banner" role="note">
        <span className="bp2-beta-banner__tag">Beta</span>
        <span className="bp2-beta-banner__body">
          <strong>Exports run a dry run today.</strong> The body below reads live from your
          Money data; the send path (Gmail OAuth + tracked opens) ships next round.
        </span>
      </div>

      {/* ── Header strip ──────────────────────────────────────────── */}
      <div className="bp2-head">
        <div>
          <h1>
            <span className="bp2-title-dot" aria-hidden="true" />
            Investor update · {monthLabel}
          </h1>
          <div className="sub">{cadenceSubtitle}</div>
        </div>
        <div className="actions">
          <button type="button" className="bp2-btn soon" disabled title={sendTooltip}>
            Previous month
          </button>
          <button type="button" className="bp2-btn soon" disabled title={sendTooltip}>
            Duplicate last month
          </button>
        </div>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────── */}
      <div className="bp2-row">
        {/* ── Document preview ───────────────────────────────────── */}
        <div>
          <div className="bp2-doc-card">
            <div className="bp2-doc-head">
              <h2>{foundry.name} — {monthLabel} update</h2>
              <div className="doc-meta">
                <span>Founder &amp; CEO</span>
                <span>·</span>
                <span>{todayString()}</span>
              </div>
            </div>

            {/* ── Headline ─────────────────────────────────────── */}
            <div className="bp2-doc-section">
              <h3>
                Headline
                <span className="bp2-source-pill manual">You write this</span>
              </h3>
              <p className="empty">
                Not yet drafted. When you send the update, lead with the single biggest thing
                that happened this month — the signed pilot, the hire, the round progress.
              </p>
            </div>

            {/* ── The money ────────────────────────────────────── */}
            <div className="bp2-doc-section">
              <h3>
                The money
                <span className="bp2-source-pill">Auto · Cockpit</span>
              </h3>
              <div className="bp2-kpi-strip">
                <div className="bp2-kpi">
                  <div className="lab">Cash at bank</div>
                  <div className="val empty">—</div>
                  <div className="sub">Connect Xero to populate</div>
                </div>
                <div className="bp2-kpi">
                  <div className="lab">Runway</div>
                  <div className="val empty">—</div>
                  <div className="sub">Needs actuals + plan</div>
                </div>
                <div className="bp2-kpi">
                  <div className="lab">Net burn</div>
                  <div className="val empty">—</div>
                  <div className="sub">Needs actuals</div>
                </div>
                <div className="bp2-kpi">
                  <div className="lab">MRR</div>
                  <div className="val empty">—</div>
                  <div className="sub">Needs revenue lines</div>
                </div>
              </div>
              <p className="empty">
                Cash and burn figures render from Cockpit once Xero is connected. Until then
                the money block shows a clean empty state — better to ship honest than to
                fabricate a number on a page investors rely on.
              </p>
            </div>

            {/* ── Traction this month ──────────────────────────── */}
            <div className="bp2-doc-section">
              <h3>
                Traction this month
                <span className="bp2-source-pill manual">Manual + Plan</span>
              </h3>
              <ul className="bp2-bullet-list">
                <li className="empty">
                  No traction bullets added yet. Add contracts signed, revenue milestones,
                  grants drawn, shipments, or pilot conversions — one line each.
                </li>
              </ul>
            </div>

            {/* ── Build + team ─────────────────────────────────── */}
            <div className="bp2-doc-section">
              <h3>
                Build + team
                <span className="bp2-source-pill manual">Auto · Workshop</span>
              </h3>
              <p className="empty">
                Team changes and build milestones render once Workshop is wired. Draft any
                key hires, releases, or field-test results here for this update.
              </p>
            </div>

            {/* ── Pipeline · round progress ────────────────────── */}
            <div className="bp2-doc-section">
              <h3>
                Pipeline · {round?.name ?? "no active round"}
                <span className="bp2-source-pill">Auto · Raise</span>
              </h3>
              {round ? (
                <>
                  <div className="bp2-kpi-strip">
                    <div className="bp2-kpi">
                      <div className="lab">Target</div>
                      <div className="val">{pipelineTargetLabel}</div>
                      <div className="sub">Round target</div>
                    </div>
                    <div className="bp2-kpi">
                      <div className="lab">Committed</div>
                      <div className={`val ${round.closedCents === 0 ? "empty" : ""}`}>
                        {round.closedCents === 0 ? "—" : closedLabel}
                      </div>
                      <div className="sub">
                        {round.stageCounts.closed} closed
                      </div>
                    </div>
                    <div className="bp2-kpi">
                      <div className="lab">Verbal</div>
                      <div className={`val ${round.verbalCents === 0 ? "empty" : ""}`}>
                        {round.verbalCents === 0 ? "—" : verbalLabel}
                      </div>
                      <div className="sub">
                        {round.stageCounts.verbal} verbal
                      </div>
                    </div>
                    <div className="bp2-kpi">
                      <div className="lab">In DD</div>
                      <div className={`val ${ddCount === 0 ? "empty" : ""}`}>
                        {ddCount === 0 ? "—" : inDdLabel}
                      </div>
                      <div className="sub">
                        {meetingCount} in meeting stage
                      </div>
                    </div>
                  </div>
                  <p>
                    {round.weeksToClose != null ? (
                      <>
                        <strong>Target close:</strong> {round.weeksToClose >= 0
                          ? `${round.weeksToClose} week${round.weeksToClose === 1 ? "" : "s"} remaining`
                          : `${Math.abs(round.weeksToClose)} week${Math.abs(round.weeksToClose) === 1 ? "" : "s"} past target`}.{" "}
                      </>
                    ) : null}
                    {contactedOrLater} investor{contactedOrLater === 1 ? "" : "s"} engaged so far ·{" "}
                    {round.stageCounts.target + round.stageCounts.researching} in the top of the funnel.
                  </p>
                </>
              ) : (
                <p className="empty">
                  No active round. Create one from Raise to populate this section with
                  target, commits, and funnel progress.
                </p>
              )}
            </div>

            {/* ── What's hard ──────────────────────────────────── */}
            <div className="bp2-doc-section">
              <h3>
                What&apos;s hard
                <span className="bp2-source-pill manual">You write this</span>
              </h3>
              <p className="empty">
                One honest paragraph. Investors remember founders who flag problems early.
                A late invoice, a hire that fell through, a milestone that slipped — say it.
              </p>
            </div>

            {/* ── Ask ──────────────────────────────────────────── */}
            <div className="bp2-doc-section">
              <h3>
                Ask
                <span className="bp2-source-pill manual">You write this</span>
              </h3>
              <div className="bp2-ask-strip">
                <strong>Your two asks for this month go here.</strong> Specific intros,
                feedback on a document, help with a hire. Keep it to two — the investors who
                act will act on something concrete, not a wish list.
              </div>
            </div>

            {/* ── Footer ───────────────────────────────────────── */}
            <div className="bp2-doc-foot">
              {foundry.name} · forge-{foundry.id} · Generated by ForgeOS · Page 1 of 1
            </div>
          </div>
        </div>

        {/* ── Right rail ─────────────────────────────────────────── */}
        <div className="bp2-rail">
          {/* Sections checklist */}
          <div className="bp2-ctrl-card">
            <h3>Sections</h3>
            <div className="bp2-ctrl-row">
              <input type="checkbox" defaultChecked disabled />
              <div className="ctrl-name">
                Headline
                <small>You write · 1 paragraph</small>
              </div>
            </div>
            <div className="bp2-ctrl-row">
              <input type="checkbox" defaultChecked disabled />
              <div className="ctrl-name">
                The money
                <small>Auto from Cockpit</small>
              </div>
            </div>
            <div className="bp2-ctrl-row">
              <input type="checkbox" defaultChecked disabled />
              <div className="ctrl-name">
                Traction
                <small>Manual + Plan milestones</small>
              </div>
            </div>
            <div className="bp2-ctrl-row">
              <input type="checkbox" defaultChecked disabled />
              <div className="ctrl-name">
                Build + team
                <small>Auto from Workshop</small>
              </div>
            </div>
            <div className="bp2-ctrl-row">
              <input type="checkbox" defaultChecked disabled />
              <div className="ctrl-name">
                Pipeline
                <small>Auto from Raise · excludes investor names</small>
              </div>
            </div>
            <div className="bp2-ctrl-row">
              <input type="checkbox" defaultChecked disabled />
              <div className="ctrl-name">
                What&apos;s hard
                <small>You write · honest flag</small>
              </div>
            </div>
            <div className="bp2-ctrl-row">
              <input type="checkbox" defaultChecked disabled />
              <div className="ctrl-name">
                Ask
                <small>You write · specific requests</small>
              </div>
            </div>
            <div className="bp2-ctrl-row">
              <input type="checkbox" disabled />
              <div className="ctrl-name">
                Data room appendix
                <small>Variance, full P&amp;L — for close contacts</small>
              </div>
            </div>
          </div>

          {/* Recipients */}
          <div className="bp2-ctrl-card">
            <h3>Recipients · {pipelineRecipientCount} in pipeline</h3>
            {pipelineRecipientCount === 0 ? (
              <div className="bp2-recip-empty">
                No investors in meeting-or-later stages yet. Once your pipeline has contacts,
                they surface here so you can pick who gets the update.
              </div>
            ) : (
              <div className="bp2-recip-empty">
                {pipelineRecipientCount} investor{pipelineRecipientCount === 1 ? "" : "s"} in your
                pipeline at meeting-or-later stages. Recipient picker ships next round with the
                send path — names stay private until then.
              </div>
            )}
            <div className="bp2-recip-actions">
              <button type="button" className="bp2-btn soon" disabled title={sendTooltip}>
                + Add recipient
              </button>
              <button type="button" className="bp2-btn soon" disabled title={sendTooltip}>
                Edit list
              </button>
            </div>
          </div>

          {/* Sending */}
          <div className="bp2-ctrl-card">
            <h3>Sending</h3>
            <div className="bp2-rail-row">
              <span className="k">Send from</span>
              <span className={`v ${senderEmail == null ? "empty" : ""}`}>
                {senderEmail ?? "—"}
              </span>
            </div>
            <div className="bp2-rail-row">
              <span className="k">Subject</span>
              <span className="v">{foundry.name} · {monthLabel}</span>
            </div>
            <div className="bp2-rail-row">
              <span className="k">Format</span>
              <span className="v">PDF + inline HTML</span>
            </div>
            <div className="bp2-rail-row">
              <span className="k">Track opens</span>
              <span className="v empty">Wires up with send path</span>
            </div>
            <div className="bp2-rail-row">
              <span className="k">Schedule</span>
              <span className="v empty">Now · or queue (next round)</span>
            </div>
          </div>

          {/* Past updates */}
          <div className="bp2-ctrl-card">
            <h3>Past updates</h3>
            {pastUpdates.length === 0 ? (
              <div className="bp2-past-empty">
                No updates sent yet. This list populates once you send your first investor
                update — month · recipients · opens · replies.
              </div>
            ) : (
              <div>
                {pastUpdates.map((u) => (
                  <div key={u.id} className="bp2-past-row">
                    <strong>{u.monthLabel}</strong>
                    · {u.recipientCount} recipient{u.recipientCount === 1 ? "" : "s"}
                    {" "}· {u.openedCount} open{u.openedCount === 1 ? "" : "s"}
                    {" "}· {u.repliedCount} repl{u.repliedCount === 1 ? "y" : "ies"}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cross-link */}
          <div className="bp2-ctrl-card">
            <h3>Looking for something else?</h3>
            <div className="bp2-rail-row">
              <span className="k">Cockpit</span>
              <span className="v"><Link href="/money">Runway + burn →</Link></span>
            </div>
            <div className="bp2-rail-row">
              <span className="k">Raise</span>
              <span className="v"><Link href="/money/raise">Pipeline →</Link></span>
            </div>
            <div className="bp2-rail-row">
              <span className="k">Plan</span>
              <span className="v"><Link href="/money/plan">Forecast →</Link></span>
            </div>
          </div>

          {/* Hint when currency isn't GBP so it doesn't look wrong */}
          {currency !== "GBP" ? (
            <div className="bp2-past-empty" aria-live="polite">
              Reporting currency: {currencySymbol} {currency}.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

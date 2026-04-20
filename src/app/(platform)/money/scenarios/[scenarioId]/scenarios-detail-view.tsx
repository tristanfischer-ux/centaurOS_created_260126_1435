/**
 * ScenariosDetailView — Money · Scenario detail (V2, data-wired).
 *
 * Port of MONEY-MOCKUP-SCENARIO-DETAIL.html. Shows one scenario — its
 * metadata, its parameters (revenue/cost delay, opening balance), and the
 * list of overrides against the default plan. Every runway impact number is
 * honest "—" (the projection engine isn't wired); every override row reads
 * directly from `money_scenario_overrides` joined against `plan_line_items`.
 *
 * Empty-state policy:
 *   - No overrides captured yet → empty row block (not a fabricated 4-row list).
 *   - Runway stats → "—" with "Projection engine not yet wired" caption.
 *   - Scenario parameters → render what exists on the row, show "—" for the
 *     fields that have no column today (seed round, pre-seed close — these
 *     belong to `investor_round`, not `money_scenarios`).
 */

"use client"

import Link from "next/link"
import "../scenarios-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface ScenarioOverrideRow {
  id: string
  lineName: string
  lineBucket: string | null
  currentDisplay: string
  overrideDisplay: string
  note: string | null
}

export interface ScenarioDetail {
  id: string
  name: string
  question: string | null
  visibility: string
  isDefault: boolean
  templateSource: string | null
  revenueDelayWeeks: number
  costDelayWeeks: number
  revenueGrowthPct: number
  openingBalanceCents: number | null
  currency: string
  createdAt: string
  updatedAt: string
}

export interface ScenariosDetailViewProps {
  scenario: ScenarioDetail
  overrides: ScenarioOverrideRow[]
}

// ─── View ──────────────────────────────────────────────────────────────

export function ScenariosDetailView(props: ScenariosDetailViewProps): React.ReactElement {
  const { scenario, overrides } = props
  const hasOverrides = overrides.length > 0

  return (
    <div className="scn2">
      {/* ── Breadcrumb ─────────────────────────────────────────── */}
      <div className="scn2-page-head">
        <div className="scn2-crumbs">
          <Link href="/money">Money</Link>
          <span className="sep">›</span>
          <Link href="/money/plan">Plan</Link>
          <span className="sep">›</span>
          <Link href="/money/scenarios">Scenarios</Link>
          <span className="sep">›</span>
          <span className="current">{scenario.name}</span>
        </div>
        <div className="scn2-ctx-chips">
          <Link href="/money/scenarios/new" className="scn2-btn sm">Clone</Link>
          <Link href="/money/scenarios/new" className="scn2-btn sm">+ New scenario</Link>
          <button
            type="button"
            className="scn2-btn sm"
            disabled
            aria-disabled="true"
            title="Set as default wires up next round."
          >
            Set as default
          </button>
          <button
            type="button"
            className="scn2-btn primary sm"
            disabled
            aria-disabled="true"
            title="Apply-to-Plan wires up with the projection engine."
          >
            Apply to Plan
          </button>
        </div>
      </div>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="scn2-detail-head">
        <h1>
          <span className="scn2-title-dot" aria-hidden="true" />
          {scenario.name}
          {scenario.isDefault ? <span className="scn2-chip brand" style={{ marginLeft: 6 }}>Default</span> : null}
        </h1>
        <div className="sub">
          {scenario.question && scenario.question.trim().length > 0
            ? scenario.question
            : "No question captured — add one to make this scenario findable and shareable later."}
        </div>
        <div className="sub" style={{ marginTop: 10, fontSize: 12 }}>
          Created {formatIsoDate(scenario.createdAt)} · Last edited {formatIsoDate(scenario.updatedAt)} · Visibility {formatVisibility(scenario.visibility)}
        </div>

        <div className="scn2-stats">
          <StatTile label="Runway" empty />
          <StatTile label="Net burn" empty />
          <StatTile label="Cash-to-zero" empty />
          <StatTile
            label="Overrides"
            value={overrides.length === 0 ? "0" : String(overrides.length)}
            caption={overrides.length === 1 ? "1 line changed" : `${overrides.length} lines changed`}
          />
        </div>
      </div>

      {/* ── Scaffold note ──────────────────────────────────────── */}
      <div className="scn2-form-empty">
        <strong>Projection engine wires up next round.</strong>{" "}
        Apply-to-Plan and the live runway comparison chart come online once the projection engine and cockpit are joined up. For now you see the scenario metadata + its overrides against the default plan.
      </div>

      <div className="scn2-grid-2">
        {/* ── Runway comparison placeholder ──────────────────── */}
        <div className="scn2-card-panel">
          <h3>Runway · this scenario vs default</h3>
          <div
            style={{
              height: 220,
              background: "var(--scn-surface-soft)",
              border: "1px dashed var(--scn-border-strong)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--scn-fg-muted)",
              fontSize: 12.5,
              padding: "0 20px",
              textAlign: "center",
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: "var(--scn-fg)", marginBottom: 4 }}>Projection chart wires up next round.</strong>
            Once the projection engine is live, this chart overlays the default plan against this scenario so the runway gap is readable at a glance.
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12, color: "var(--scn-fg-muted)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 14, height: 2, background: "var(--scn-brand)" }} />
              Default
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 14, height: 2, background: "#7c3aed" }} />
              {scenario.name}
            </span>
          </div>
        </div>

        {/* ── Scenario parameters (real fields from the row) ─── */}
        <div className="scn2-card-panel">
          <h3>Scenario parameters</h3>
          <ParamRow
            k="Opening balance"
            v={scenario.openingBalanceCents != null
              ? formatCurrencyFromCents(scenario.openingBalanceCents, scenario.currency)
              : null}
          />
          <ParamRow
            k="Revenue delay"
            v={scenario.revenueDelayWeeks !== 0
              ? `${scenario.revenueDelayWeeks > 0 ? "+" : ""}${scenario.revenueDelayWeeks} weeks vs default`
              : "0 weeks (as default)"}
          />
          <ParamRow
            k="Cost delay"
            v={scenario.costDelayWeeks !== 0
              ? `${scenario.costDelayWeeks > 0 ? "+" : ""}${scenario.costDelayWeeks} weeks vs default`
              : "0 weeks (as default)"}
          />
          <ParamRow
            k="Revenue growth"
            v={scenario.revenueGrowthPct !== 0
              ? `${scenario.revenueGrowthPct > 0 ? "+" : ""}${scenario.revenueGrowthPct}% / quarter`
              : "0% (flat)"}
          />
          <ParamRow k="Template" v={scenario.templateSource ? formatTemplate(scenario.templateSource) : null} />
          <ParamRow k="Visibility" v={formatVisibility(scenario.visibility)} />
        </div>
      </div>

      {/* ── Overrides table ────────────────────────────────────── */}
      <div className="scn2-card-panel" style={{ marginBottom: 20 }}>
        <h3>
          Overrides from default ·{" "}
          <span style={{ color: "var(--scn-fg-muted)", fontSize: 12, fontWeight: 500 }}>
            {overrides.length} line item{overrides.length === 1 ? "" : "s"} changed
          </span>
        </h3>

        {hasOverrides ? (
          overrides.map((o) => (
            <div key={o.id} className="scn2-override-row">
              <div className="o-what">
                {o.lineName}
                {o.lineBucket ? <small>{o.lineBucket}</small> : null}
                {o.note ? <small style={{ color: "var(--scn-fg-faint)", fontStyle: "italic" }}>{o.note}</small> : null}
              </div>
              <div className="o-from">{o.currentDisplay}</div>
              <div className="o-to">{o.overrideDisplay}</div>
              <div className="o-delta" style={{ color: "var(--scn-fg-subtle)" }}>—</div>
            </div>
          ))
        ) : (
          <div className="scn2-form-empty" style={{ marginBottom: 0 }}>
            <strong>No overrides on this scenario yet.</strong>{" "}
            The default plan applies everywhere until you add an override. Cloning this scenario pre-populates the wizard so you can start from its shape.
          </div>
        )}
      </div>

      {/* ── Footer CTA ─────────────────────────────────────────── */}
      <div className="scn2-cta-row">
        <div className="scn2-cta-note">
          Scenario stores only the diff against the default plan. Apply-to-Plan replaces the active scenario across Cockpit and P&amp;L.
        </div>
        <div className="scn2-btn-group">
          <Link href="/money/scenarios" className="scn2-btn ghost">← Back to scenarios</Link>
          <Link href="/money/scenarios/new" className="scn2-btn">Clone</Link>
          <button
            type="button"
            className="scn2-btn primary"
            disabled
            aria-disabled="true"
            title="Apply-to-Plan wires up with the projection engine."
          >
            Apply to Plan →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function StatTile({ label, value, caption, empty }: {
  label: string
  value?: string
  caption?: string
  empty?: boolean
}): React.ReactElement {
  return (
    <div className="rs">
      <div className="lab">{label}</div>
      <div className={`val${empty ? " empty" : ""}`}>{empty ? "—" : (value ?? "—")}</div>
      <div className="delta">{empty ? "Projection engine not yet wired" : (caption ?? "")}</div>
    </div>
  )
}

function ParamRow({ k, v }: { k: string; v: string | null }): React.ReactElement {
  return (
    <div className="scn2-param-row">
      <span className="k">{k}</span>
      <span className={`v${v == null ? " empty" : ""}`}>{v ?? "—"}</span>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatIsoDate(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatCurrencyFromCents(cents: number, currency: string): string {
  const major = cents / 100
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : ""
  return `${symbol}${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(major)}`
}

function formatTemplate(source: string): string {
  switch (source) {
    case "blank":
      return "Blank · no overrides"
    case "worst_case":
      return "Worst case"
    case "best_case":
      return "Best case"
    case "hiring":
      return "Hiring plan"
    case "revenue_delay":
      return "Revenue delay"
    case "raise":
      return "Raise scenario"
    default:
      return source
  }
}

function formatVisibility(visibility: string): string {
  switch (visibility) {
    case "private":
      return "Founders only"
    case "finance":
      return "Founders + finance specialist"
    case "foundry":
      return "All foundry members"
    default:
      return visibility
  }
}

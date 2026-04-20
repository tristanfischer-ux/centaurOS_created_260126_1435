/**
 * ScenariosNewView — Money · New scenario wizard (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-NEW-SCENARIO.html. Every form control renders as a
 * scaffold (disabled) with honest empty-state copy — the scenario save action
 * isn't wired yet. Template picker, name-the-question form, overrides table
 * and the "Global parameters V2 · deferred" card all match the mockup
 * structure section-for-section.
 *
 * Empty-state policy: the live runway impact tile renders "—" rather than
 * the mockup's worked example — there's no projection engine behind this
 * yet. Override rows are honest: we pull real `plan_line_items` for the
 * foundry when they exist, fall back to "No line items captured yet" when
 * they don't. No fabricated NimFarm/Ada/pre-seed rows.
 */

"use client"

import Link from "next/link"
import "../scenarios-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface PlanLineOption {
  id: string
  label: string
  bucket: string | null
  currentDisplay: string
}

export interface ScenariosNewViewProps {
  planLines: PlanLineOption[]
}

// ─── Templates (static choices per mockup §01) ─────────────────────────

const TEMPLATES = [
  { id: "blank",         icon: "○", name: "Blank · no overrides",   desc: "Start clean. Pick overrides manually below." },
  { id: "worst_case",    icon: "↓", name: "Worst case",             desc: "Sketch the downside — revenue delays and cost creep." },
  { id: "best_case",     icon: "↑", name: "Best case",              desc: "Revenue as planned. Discretionary spend trimmed." },
  { id: "hiring",        icon: "⚭", name: "Hiring plan",            desc: "Override headcount and onboarding costs." },
  { id: "revenue_delay", icon: "⏳", name: "Revenue delay",          desc: "Push pilot timelines. See the runway cost." },
  { id: "raise",         icon: "◎", name: "Raise scenario",         desc: "Compare different close amounts and dates." },
] as const

// ─── View ──────────────────────────────────────────────────────────────

export function ScenariosNewView(props: ScenariosNewViewProps): React.ReactElement {
  const { planLines } = props
  const hasLines = planLines.length > 0

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
          <span className="current">New scenario</span>
        </div>
        <div className="scn2-ctx-chips">
          <Link href="/money/scenarios" className="scn2-btn sm">← Cancel</Link>
        </div>
      </div>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="scn2-head">
        <h1>
          <span className="scn2-title-dot" aria-hidden="true" />
          New scenario
        </h1>
        <div className="sub">
          Answer a specific &ldquo;what if&rdquo; question by overriding lines in the default plan. Saved scenarios appear in the switcher on the Plan page and can be applied to Cockpit and P&amp;L for side-by-side comparison.
        </div>
      </div>

      {/* ── Scaffold note ──────────────────────────────────────── */}
      <div className="scn2-form-empty">
        <strong>Form editing ships next round.</strong>{" "}
        Every control on this page is a preview of the wizard shape. Once the scenario save action lands, template selection, overrides and save-to-Plan all wire up from here.
      </div>

      <div className="scn2-grid-2-3">
        <div>
          {/* ── 01 · Template picker ──────────────────────────── */}
          <div className="scn2-section">
            <h3>01 · Start from</h3>
            <div className="sub">
              Blank scenarios are rare — usually you&apos;re answering a known question with a known shape. Templates pre-populate the overrides.
            </div>
            <div className="scn2-tpl-grid" role="group" aria-disabled="true" aria-label="Template picker — disabled while form editing ships next round">
              {TEMPLATES.map((tpl) => (
                <div key={tpl.id} className="scn2-tpl-opt" aria-disabled="true">
                  <div className="t-ic" aria-hidden="true">{tpl.icon}</div>
                  <div className="t-name">{tpl.name}</div>
                  <div className="t-desc">{tpl.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 02 · Name the question ────────────────────────── */}
          <div className="scn2-section">
            <h3>02 · Name the question</h3>
            <div className="sub">
              What&apos;s the &ldquo;what if&rdquo; you&apos;re modelling? A clear question makes the scenario sharable and findable later.
            </div>

            <div className="scn2-fld">
              <label htmlFor="scn-name">Scenario name</label>
              <input
                id="scn-name"
                type="text"
                placeholder="e.g. Worst case — pilot slips and raise underwhelms"
                disabled
                aria-disabled="true"
              />
              <p className="hint">Shows in the switcher chip at the top of Plan.</p>
            </div>

            <div className="scn2-fld">
              <label htmlFor="scn-question">What question is this answering?</label>
              <textarea
                id="scn-question"
                placeholder="What question are you modelling? One or two sentences describing the what-if."
                disabled
                aria-disabled="true"
              />
              <p className="hint">Shown at the top of the Scenario detail page and on investor updates if shared.</p>
            </div>

            <div className="scn2-fld">
              <label htmlFor="scn-visibility">
                Who should see this? <span className="opt">Privacy</span>
              </label>
              <select id="scn-visibility" disabled aria-disabled="true">
                <option>Founders only</option>
                <option>Founders + finance specialist</option>
                <option>All foundry members</option>
              </select>
              <p className="hint">
                Shared scenarios appear in the Plan switcher for all members. Private ones only for you.
              </p>
            </div>
          </div>

          {/* ── 03 · Overrides ────────────────────────────────── */}
          <div className="scn2-section">
            <h3>03 · Overrides</h3>
            <div className="sub">
              Every line inherits from the default plan unless you override it here. Untick to remove; edit to adjust. Runway delta will render live once the projection engine wires in.
            </div>

            {hasLines ? (
              <div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "22px 1fr 150px 150px 110px",
                    gap: "12px",
                    padding: "8px 0 6px",
                    borderBottom: "2px solid var(--scn-border)",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 700,
                    color: "var(--scn-fg-muted)",
                  }}
                >
                  <div />
                  <div>Line</div>
                  <div style={{ textAlign: "right" }}>Current</div>
                  <div style={{ textAlign: "right" }}>Override to</div>
                  <div style={{ textAlign: "right" }}>Runway Δ</div>
                </div>
                {planLines.map((line) => (
                  <div
                    key={line.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "22px 1fr 150px 150px 110px",
                      gap: "12px",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--scn-border-soft)",
                      alignItems: "center",
                      fontSize: "13px",
                    }}
                  >
                    <input type="checkbox" disabled aria-disabled="true" style={{ accentColor: "var(--scn-brand)" }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{line.label}</div>
                      {line.bucket ? (
                        <small style={{ display: "block", fontSize: 11, color: "var(--scn-fg-muted)", fontWeight: 400, marginTop: 1 }}>
                          {line.bucket}
                        </small>
                      ) : null}
                    </div>
                    <div style={{ textAlign: "right", color: "var(--scn-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {line.currentDisplay}
                    </div>
                    <input
                      type="text"
                      disabled
                      aria-disabled="true"
                      placeholder="—"
                      style={{
                        padding: "5px 8px",
                        border: "1px solid var(--scn-border)",
                        borderRadius: 5,
                        fontSize: "12.5px",
                        fontFamily: "inherit",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        background: "var(--scn-surface-muted)",
                        color: "var(--scn-fg-subtle)",
                        cursor: "not-allowed",
                      }}
                    />
                    <div style={{ textAlign: "right", color: "var(--scn-fg-subtle)", fontWeight: 500, fontSize: 12 }}>—</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="scn2-form-empty" style={{ marginBottom: 0 }}>
                <strong>No plan line items captured yet.</strong>{" "}
                Scenarios override lines from your default plan — add lines in <Link href="/money/plan">Plan</Link> first, then come back here to model what-ifs against them.
              </div>
            )}
          </div>

          {/* ── 04 · Global parameters — V2 deferred ──────────── */}
          <div className="scn2-section" style={{ opacity: 0.55, borderStyle: "dashed" }}>
            <h3>
              04 · Global parameters{" "}
              <span className="scn2-chip" style={{ marginLeft: 6 }}>V2 · deferred</span>
            </h3>
            <div className="sub">
              Bulk modifiers (revenue delay, cost delay, growth, cost inflation) are deferred — founders tend to override specific lines rather than reach for a global dial. We&apos;ll revisit if founders ask.
            </div>
          </div>
        </div>

        {/* ── Right rail ─────────────────────────────────────── */}
        <div>
          <div className="scn2-impact">
            <h3>Live runway impact</h3>
            <div className="inner">
              <div className="cell">
                <div className="lab">Runway</div>
                <div className="val empty">—</div>
                <div className="delta empty">Wires up with projection engine</div>
              </div>
              <div className="cell">
                <div className="lab">Cash-to-zero</div>
                <div className="val empty">—</div>
                <div className="delta empty">Wires up with projection engine</div>
              </div>
              <div className="cell">
                <div className="lab">Avg burn</div>
                <div className="val empty">—</div>
                <div className="delta empty">Wires up with projection engine</div>
              </div>
              <div className="cell">
                <div className="lab">Net loss 12mo</div>
                <div className="val empty">—</div>
                <div className="delta empty">Wires up with projection engine</div>
              </div>
            </div>
            <div className="narr">
              <strong>Finance read:</strong> once the projection engine is wired, the runway delta will render live here as you tick overrides on and off — before you save.
            </div>
          </div>

          <div className="scn2-rail-card deferred">
            <div className="rc-head">
              Actions to pre-plan{" "}
              <span className="scn2-chip" style={{ marginLeft: 4 }}>V2 · deferred</span>
            </div>
            <div className="rc-body">
              Trigger-action scheduling (&ldquo;if scenario fires by date X, auto-create these tasks&rdquo;) is deferred. In V1 scenarios are purely descriptive — the founder takes action manually.
            </div>
          </div>

          <div className="scn2-rail-card">
            <div className="rc-head">Compare with</div>
            <div className="rc-body">
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" disabled aria-disabled="true" defaultChecked />
                  Default plan
                </label>
              </div>
              <div style={{ color: "var(--scn-fg-muted)", fontSize: 11, marginTop: 6 }}>
                Toggle other saved scenarios once they exist.
              </div>
            </div>
          </div>

          <div className="scn2-rail-card">
            <div className="rc-head">Save options</div>
            <div className="rc-body">
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" disabled aria-disabled="true" defaultChecked />
                  Add to Plan switcher
                </label>
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" disabled aria-disabled="true" />
                  Apply now (replace active scenario)
                </label>
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" disabled aria-disabled="true" />
                  Include in next investor update
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA row ────────────────────────────────────────────── */}
      <div className="scn2-cta-row">
        <div className="scn2-cta-note">
          Scenarios store only the diff against the default plan — no formulas, no trigger actions, no global parameters in V1. Apply to reflect on every Money surface.
        </div>
        <div className="scn2-btn-group">
          <Link href="/money/scenarios" className="scn2-btn ghost">Cancel</Link>
          <button
            type="button"
            className="scn2-btn"
            disabled
            aria-disabled="true"
            title="Save wires up next round."
          >
            Save as draft
          </button>
          <button
            type="button"
            className="scn2-btn primary"
            disabled
            aria-disabled="true"
            title="Save wires up next round."
          >
            Save scenario →
          </button>
        </div>
      </div>
    </div>
  )
}

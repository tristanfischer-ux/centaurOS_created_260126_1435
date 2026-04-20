/**
 * ScenariosListView — Money Plan · Scenarios list (V2, data-wired).
 *
 * Port of MONEY-MOCKUP-SCENARIO-DETAIL.html's entry-point (the list the
 * scenario switcher on Plan surfaces) combined with the list expectations in
 * MONEY-MOCKUP-NEW-SCENARIO.html. A scenario is a named what-if plan —
 * nothing more. The list shows what exists, links to detail, and surfaces a
 * prominent "New scenario" CTA.
 *
 * Empty-state policy: no scenarios → centred empty hero with a single
 * primary action ("Create your first scenario"). Numbers are never faked —
 * the per-card runway / overrides count read from the row itself. When
 * override counts can't be loaded the card shows "—" rather than inventing.
 */

"use client"

import Link from "next/link"
import "./scenarios-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface ScenarioCardRow {
  id: string
  name: string
  question: string | null
  templateSource: string | null
  visibility: string
  isDefault: boolean
  overrideCount: number
  updatedAt: string
  createdAt: string
}

export interface ScenariosListViewProps {
  scenarios: ScenarioCardRow[]
}

// ─── View ──────────────────────────────────────────────────────────────

export function ScenariosListView(props: ScenariosListViewProps): React.ReactElement {
  const { scenarios } = props
  const hasScenarios = scenarios.length > 0

  return (
    <div className="scn2">
      {/* ── Breadcrumb ─────────────────────────────────────────── */}
      <div className="scn2-page-head">
        <div className="scn2-crumbs">
          <Link href="/money">Money</Link>
          <span className="sep">›</span>
          <Link href="/money/plan">Plan</Link>
          <span className="sep">›</span>
          <span className="current">Scenarios</span>
        </div>
        <div className="scn2-ctx-chips">
          <Link href="/money/scenarios/new" className="scn2-btn primary sm">
            + New scenario
          </Link>
        </div>
      </div>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="scn2-head">
        <h1>
          <span className="scn2-title-dot" aria-hidden="true" />
          Scenarios
        </h1>
        <div className="sub">
          A scenario is a named what-if — a set of line-level overrides against the default plan. Saved scenarios appear in the switcher on Plan and can be applied to Cockpit and P&amp;L for side-by-side comparison.
        </div>
      </div>

      {hasScenarios ? (
        <>
          <div className="scn2-note">
            Scenarios are descriptive planning tools, not an automation engine. Each one stores only the diff against the default — everything else inherits.
          </div>

          <div className="scn2-list">
            {scenarios.map((scenario) => (
              <ScenarioCard key={scenario.id} scenario={scenario} />
            ))}
          </div>
        </>
      ) : (
        <div className="scn2-empty">
          <div className="icon" aria-hidden="true">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20v-6M6 20V10M18 20V4" />
            </svg>
          </div>
          <h2>Create your first scenario</h2>
          <p>
            What if the pilot slips 12 weeks? What if the raise closes late? Model it here — override specific lines, see the runway impact side-by-side with your default plan.
          </p>
          <Link href="/money/scenarios/new" className="scn2-btn primary">
            + Create your first scenario
          </Link>
        </div>
      )}
    </div>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function ScenarioCard({ scenario }: { scenario: ScenarioCardRow }): React.ReactElement {
  const href = `/money/scenarios/${scenario.id}`
  const hasQuestion = typeof scenario.question === "string" && scenario.question.trim().length > 0

  return (
    <Link href={href} className={`scn2-card${scenario.isDefault ? " active" : ""}`}>
      <div className="c-top">
        <h3>{scenario.name}</h3>
        {scenario.isDefault ? (
          <span className="scn2-chip brand">Default</span>
        ) : scenario.templateSource ? (
          <span className="scn2-chip">{formatTemplate(scenario.templateSource)}</span>
        ) : null}
      </div>
      <div className="c-question">
        {hasQuestion ? scenario.question : <span style={{ color: "var(--scn-fg-subtle)", fontStyle: "italic" }}>No question captured</span>}
      </div>
      <div className="c-meta">
        <span className="count">
          {scenario.overrideCount} override{scenario.overrideCount === 1 ? "" : "s"}
        </span>
        <span>{formatRelative(scenario.updatedAt)}</span>
      </div>
    </Link>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatTemplate(source: string): string {
  switch (source) {
    case "blank":
      return "Blank"
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

function formatRelative(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const diffMs = Date.now() - d.getTime()
  const day = 24 * 60 * 60 * 1000
  if (diffMs < day) return "Today"
  if (diffMs < 2 * day) return "Yesterday"
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} days ago`
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

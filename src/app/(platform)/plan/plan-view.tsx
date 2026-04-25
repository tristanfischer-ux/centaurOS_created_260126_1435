/**
 * PlanView — Compressed Plan page (V2, mockup-faithful).
 *
 * Port of FORGEOS-COMPRESSED-PLAN-MOCKUP.html. Scoped CSS under `.plan2`
 * keeps the styling isolated so the mockup palette/typography do not leak
 * into the rest of the platform.
 *
 * Sections (top to bottom, mirroring the mockup):
 *   1. Breadcrumb (Brainstorming › Plan)
 *   2. Page header — accent bar, title, subhead, head actions
 *   3. Sage hero (Strategy specialist briefing — synthesised from real data)
 *   4. View tabs (Board / Tree / Timeline) — Board is V1; the others are placeholders
 *   5. Purpose card — pulls foundry.purpose_data when present, honest empty state otherwise
 *   6. Pillars header + filter chips (filters are wired client-side over the loaded pillars)
 *   7. Pillars list — each pillar can expand to show objectives + their tasks
 *   8. Unlinked objectives footer card (dashed) — only when there are objectives without a pillar
 *
 * Empty-state policy: every section has a tone-matched empty state. No "coming
 * soon" copy. If a foundry has no Strategic pillars yet, the page nudges the
 * founder to draft one with Sage in /agents — same voice as the rest.
 */

"use client"

import * as React from "react"
import Link from "next/link"

import "./plan-v2.css"

import type { FoundryPurposeData } from "@/types/foundry"
import { StreakChip } from "./_components/streak-chip"
import { WhatChangedBanner, type PlanMonthlySummary } from "./_components/what-changed-banner"
import { PlanHistoryFeed, type PlanHistoryEntry } from "./_components/plan-history-feed"
import { DecisionLog, type DecisionRecord } from "./_components/decision-log"
import { logDecision } from "@/actions/plan/log-decision"

// ── Data shapes (mirrors what page.tsx loads from Supabase) ──────────

export interface PlanTaskRow {
  id: string
  title: string
  status: string | null
  /** Maps from `tasks.risk_level` (low / medium / high) — drives the priority bar colour. */
  riskLevel: string | null
  end_date: string | null
  assigneeInitials: string[]
  isDone: boolean
  isOverdue: boolean
}

export interface PlanObjectiveRow {
  id: string
  title: string
  description: string | null
  health: PlanHealth
  totalTasks: number
  completedTasks: number
  hint: string | null
  assigneeInitials: string[]
  tasks: PlanTaskRow[]
}

export interface PlanPillarRow {
  id: string
  title: string
  description: string | null
  progress: number
  totalTasks: number
  completedTasks: number
  health: PlanHealth
  objectiveCount: number
  objectives: PlanObjectiveRow[]
}

export type PlanHealth =
  | "on-track"
  | "at-risk"
  | "off-track"
  | "completed"
  | "not-started"

export interface PlanViewProps {
  /** Synthesised Strategy specialist briefing for the Sage hero. Pre-built on
   *  the server so the client never needs to call the AI. */
  sageBriefing: SageBriefing | null
  /** Company purpose lifted from foundries.purpose_data — null when unset. */
  purpose: FoundryPurposeData | null
  /** Aggregate plan completion percentage (across all pillars). */
  totalProgress: number
  /** Strategic pillars loaded from objectives (is_strategic_goal=true). */
  pillars: PlanPillarRow[]
  /** Count of objectives that ladder up to no pillar (free-floating). */
  unlinkedCount: number
  /** Whether the current user can create new pillars / objectives. */
  canCreate: boolean

  // ── Stickiness levers ──────────────────────────────────────────────
  /** Lever #1: last 30 plan_history rows for the right-rail feed */
  historyEntries: PlanHistoryEntry[]
  /** Lever #2: consecutive weeks of plan activity (cached in profiles) */
  streakWeeks: number
  /** Lever #3: month-to-date stats for the "what changed" banner */
  monthlySummary: PlanMonthlySummary
  /** Lever #4: strategic decisions for the decision log */
  decisions: DecisionRecord[]
}

export interface SageBriefing {
  /** Overall percent complete across all pillars. */
  overallPercent: number
  /** Total pillar count, used in the briefing copy. */
  pillarCount: number
  /** Best-tracking pillar (title + percent + health), if any. */
  bright: { title: string; percent: number } | null
  /** Worst-tracking pillar (title + percent + health), if any. */
  risk: { title: string; percent: number; reason: string } | null
}

// ── Helpers ──────────────────────────────────────────────────────────

const HEALTH_LABEL: Record<PlanHealth, string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  "off-track": "Off track",
  completed: "Completed",
  "not-started": "Not started",
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric" })
}

function classifyTaskStatus(
  status: string | null,
  isOverdue: boolean,
): "done" | "in-progress" | "blocked" | "pending" {
  const s = (status ?? "").toLowerCase()
  if (s === "completed" || s === "done") return "done"
  if (s === "blocked") return "blocked"
  if (s === "in_progress" || s === "in progress" || isOverdue) return "in-progress"
  return "pending"
}

function progressFillClass(p: number): string {
  if (p >= 60) return "green"
  if (p >= 30) return "amber"
  return "red"
}

// ── Inline icons (mirror mockup's hand-drawn svgs) ───────────────────

function IconExport(): React.ReactElement {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h16v16H4z" />
      <line x1="4" y1="10" x2="20" y2="10" />
    </svg>
  )
}
function IconSettings(): React.ReactElement {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
function IconPlus(): React.ReactElement {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
function IconBoard(): React.ReactElement {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="18" />
      <rect x="14" y="3" width="7" height="10" />
      <rect x="14" y="17" width="7" height="4" />
    </svg>
  )
}
function IconTree(): React.ReactElement {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="9 18 3 12 9 6" />
      <line x1="20" y1="12" x2="4" y2="12" />
      <polyline points="15 6 21 12 15 18" />
    </svg>
  )
}
function IconTimeline(): React.ReactElement {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="14" y2="12" />
      <line x1="3" y1="18" x2="10" y2="18" />
    </svg>
  )
}
function CaretRight(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polyline
        points="9 6 15 12 9 18"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Main view ────────────────────────────────────────────────────────

type FilterKey = "all" | "on-track" | "at-risk" | "off-track"

export function PlanView(props: PlanViewProps): React.ReactElement {
  const {
    sageBriefing, purpose, totalProgress, pillars, unlinkedCount, canCreate,
    historyEntries, streakWeeks, monthlySummary, decisions,
  } = props

  const [openPillars, setOpenPillars] = React.useState<Set<string>>(() => {
    // Start with the first pillar open if any exist (mirrors mockup default)
    return new Set(pillars[0] ? [pillars[0].id] : [])
  })
  const [openObjectives, setOpenObjectives] = React.useState<Set<string>>(() => {
    // Start with the first objective of the first pillar open (mirrors mockup default)
    const first = pillars[0]?.objectives[0]
    return new Set(first ? [first.id] : [])
  })
  const [activeView, setActiveView] = React.useState<"board" | "tree" | "timeline">("board")
  const [filter, setFilter] = React.useState<FilterKey>("all")

  const filteredPillars = React.useMemo(() => {
    if (filter === "all") return pillars
    return pillars.filter((p) => p.health === filter)
  }, [filter, pillars])

  const counts = React.useMemo(() => {
    return {
      onTrack: pillars.filter((p) => p.health === "on-track" || p.health === "completed").length,
      atRisk: pillars.filter((p) => p.health === "at-risk").length,
      offTrack: pillars.filter((p) => p.health === "off-track").length,
    }
  }, [pillars])

  function togglePillar(id: string): void {
    setOpenPillars((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleObjective(id: string): void {
    setOpenObjectives((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="plan2">
      {/* ── 1. Breadcrumb ─────────────────────────────────────────── */}
      <div className="crumbs">
        <Link href="/investors">Brainstorming</Link>
        <span className="sep">›</span>
        <span className="current">Plan</span>
      </div>

      {/* ── 2. Page header ────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-accent" />
        <div>
          <h1>Plan</h1>
          <div className="sub">Purpose → Pillars → Objectives → Tasks, in one view.</div>
        </div>
        <StreakChip weeks={streakWeeks} />
        <div className="head-actions">
          <button
            type="button"
            className="btn btn-ghost"
            aria-disabled="true"
            title="Export coming next round"
          >
            <IconExport />
            Export
          </button>
          <Link className="btn btn-secondary" href="/strategy">
            <IconSettings />
            Settings
          </Link>
          {canCreate ? (
            <Link className="btn btn-primary" href="/strategy">
              <IconPlus />
              New Pillar
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              aria-disabled="true"
              title="Founders and Executives can create pillars"
            >
              <IconPlus />
              New Pillar
            </button>
          )}
        </div>
      </div>

      {/* ── 3. What changed banner (lever #3 + #4 link) ──────────── */}
      <WhatChangedBanner summary={monthlySummary} />

      {/* ── 4. Sage hero ─────────────────────────────────────────── */}
      <SageHero briefing={sageBriefing} purpose={purpose} pillars={pillars} />

      {/* ── 4. View tabs ─────────────────────────────────────────── */}
      <div className="view-tabs" role="tablist" aria-label="Plan view">
        <button
          type="button"
          className={`view-tab${activeView === "board" ? " active" : ""}`}
          role="tab"
          aria-selected={activeView === "board"}
          onClick={() => setActiveView("board")}
        >
          <IconBoard />
          Board
        </button>
        <button
          type="button"
          className={`view-tab${activeView === "tree" ? " active" : ""}`}
          role="tab"
          aria-selected={activeView === "tree"}
          onClick={() => setActiveView("tree")}
          title="Tree view ships in a follow-up — Board is the V1 surface"
        >
          <IconTree />
          Tree
        </button>
        <button
          type="button"
          className={`view-tab${activeView === "timeline" ? " active" : ""}`}
          role="tab"
          aria-selected={activeView === "timeline"}
          onClick={() => setActiveView("timeline")}
          title="Timeline view ships in a follow-up — Board is the V1 surface"
        >
          <IconTimeline />
          Timeline
        </button>
      </div>

      {/* ── 5. Purpose card ──────────────────────────────────────── */}
      {purpose?.purpose ? (
        <div className="purpose">
          <div>
            <div className="eyebrow">Company Purpose</div>
            <h2>{purpose.purpose}</h2>
            <p>
              North-star for every pillar below. Updated when the board approves, not when a single
              objective moves.
            </p>
          </div>
          <div className="purpose-meta">
            <b>{totalProgress}%</b>
            total plan complete
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <h3>No company purpose recorded yet</h3>
          <p>
            The purpose statement is the north-star every pillar below ladders up to. Draft yours
            with Sage in a few minutes — she will turn five questions into a single sentence.
          </p>
          <div className="actions">
            <Link className="btn btn-primary" href="/strategy">
              <IconPlus />
              Draft purpose with Sage
            </Link>
          </div>
        </div>
      )}

      {/* ── 6. Pillars header + filters ──────────────────────────── */}
      <div className="pillars-header">
        <div className="label">
          Strategic Pillars <span className="count">{pillars.length}</span>
        </div>
        <div className="filters" role="group" aria-label="Pillar filters">
          <button
            type="button"
            className={`filter-chip${filter === "all" ? " active" : ""}`}
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
          >
            All
          </button>
          <button
            type="button"
            className={`filter-chip${filter === "on-track" ? " active" : ""}`}
            onClick={() => setFilter("on-track")}
            aria-pressed={filter === "on-track"}
          >
            On track ({counts.onTrack})
          </button>
          <button
            type="button"
            className={`filter-chip${filter === "at-risk" ? " active" : ""}`}
            onClick={() => setFilter("at-risk")}
            aria-pressed={filter === "at-risk"}
          >
            At risk ({counts.atRisk})
          </button>
          <button
            type="button"
            className={`filter-chip${filter === "off-track" ? " active" : ""}`}
            onClick={() => setFilter("off-track")}
            aria-pressed={filter === "off-track"}
          >
            Off track ({counts.offTrack})
          </button>
        </div>
      </div>

      {/* ── 7. Pillars list ──────────────────────────────────────── */}
      {pillars.length === 0 ? (
        <div className="empty-state">
          <h3>No strategic pillars yet</h3>
          <p>
            Pillars are the 3–5 big bets that define your strategy. Draft one with Sage — she will
            turn a single sentence into a pillar, three objectives, and a task list.
          </p>
          <div className="actions">
            {canCreate ? (
              <Link className="btn btn-primary" href="/strategy">
                <IconPlus />
                Draft a pillar
              </Link>
            ) : (
              <button type="button" className="btn btn-primary" aria-disabled="true">
                <IconPlus />
                Founders draft pillars
              </button>
            )}
            <Link className="btn btn-secondary" href="/agents">
              Discuss with Sage
            </Link>
          </div>
        </div>
      ) : (
        filteredPillars.map((pillar) => (
          <PillarCard
            key={pillar.id}
            pillar={pillar}
            isOpen={openPillars.has(pillar.id)}
            onToggle={() => togglePillar(pillar.id)}
            openObjectives={openObjectives}
            onToggleObjective={toggleObjective}
            canCreate={canCreate}
          />
        ))
      )}

      {/* ── 8. Unlinked objectives footer ────────────────────────── */}
      {unlinkedCount > 0 ? (
        <div className="unlinked-card">
          <div className="title">
            {unlinkedCount} objective{unlinkedCount === 1 ? "" : "s"} not linked to a pillar
          </div>
          <div className="sub">
            Floating work that doesn&apos;t ladder up to strategy. Link them to a pillar above, or
            archive if they&apos;re no longer priorities.
          </div>
        </div>
      ) : null}

      {/* ── 9. Decision log (lever #4) ────────────────────────────── */}
      <DecisionLog
        decisions={decisions}
        canLog={canCreate}
        onLog={async (data) => {
          const result = await logDecision(data)
          if (result.error) throw new Error(result.error)
        }}
      />

      {/* ── 10. Activity history feed (lever #1) — right rail on wide ── */}
      <div style={{ marginTop: "32px" }}>
        <PlanHistoryFeed entries={historyEntries} showViewAll />
      </div>
    </div>
  )
}

// ── Sage hero ────────────────────────────────────────────────────────

function SageHero(props: {
  briefing: SageBriefing | null
  purpose: FoundryPurposeData | null
  pillars: PlanPillarRow[]
}): React.ReactElement {
  const { briefing, purpose, pillars } = props

  // No pillars → nudge to draft one. Same Sage voice.
  if (!briefing || pillars.length === 0) {
    return (
      <div className="sage-hero">
        <div className="sage-avatar">S</div>
        <div>
          <div className="sage-name">
            Sage, Strategy <span className="sage-badge">Ready</span>
          </div>
          <div className="sage-body">
            {purpose?.purpose ? (
              <>
                Your purpose is captured — now break it into <strong>3 to 5 strategic pillars</strong>{" "}
                so the work that follows can ladder up to it. I can draft a first cut from a single
                sentence if you want.
              </>
            ) : (
              <>
                Start with one sentence on what the company is here to do, then I&apos;ll turn it
                into <strong>pillars, objectives, and tasks</strong> in a single pass. The whole
                plan in one view sits below — empty for now.
              </>
            )}
            <Link className="sage-cta" href="/agents">
              Discuss with Sage →
            </Link>
          </div>
        </div>
        <div />
      </div>
    )
  }

  // With briefing — synthesise a paragraph from real numbers (mirrors the
  // mockup's Sage paragraph in shape, but every fact is real).
  return (
    <div className="sage-hero">
      <div className="sage-avatar">S</div>
      <div>
        <div className="sage-name">
          Sage, Strategy <span className="sage-badge">Ready</span>
        </div>
        <div className="sage-body">
          Your plan is <strong>{briefing.overallPercent}% complete</strong> across{" "}
          {briefing.pillarCount} pillar{briefing.pillarCount === 1 ? "" : "s"}.
          {briefing.bright ? (
            <>
              {" "}
              <strong>&ldquo;{briefing.bright.title}&rdquo;</strong> is your brightest line at{" "}
              {briefing.bright.percent}%.
            </>
          ) : null}
          {briefing.risk ? (
            <>
              {" "}
              The biggest risk is <strong>&ldquo;{briefing.risk.title}&rdquo;</strong> —{" "}
              {briefing.risk.reason}. Spend tomorrow on this; the rest can wait two days.
            </>
          ) : (
            <> Nothing on the board is currently flagged off-track — keep the cadence.</>
          )}
          <Link className="sage-cta" href="/agents">
            Discuss with Sage →
          </Link>
        </div>
      </div>
      <div />
    </div>
  )
}

// ── Pillar card ──────────────────────────────────────────────────────

function PillarCard(props: {
  pillar: PlanPillarRow
  isOpen: boolean
  onToggle: () => void
  openObjectives: Set<string>
  onToggleObjective: (id: string) => void
  canCreate: boolean
}): React.ReactElement {
  const { pillar, isOpen, onToggle, openObjectives, onToggleObjective, canCreate } = props

  return (
    <div className={`pillar${isOpen ? " open" : ""}`}>
      <button
        type="button"
        className="pillar-head"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`pillar-body-${pillar.id}`}
      >
        <svg className="pillar-caret" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline
            points="9 6 15 12 9 18"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="pillar-title">
          <h3>{pillar.title}</h3>
          {pillar.description ? <p>{pillar.description}</p> : null}
        </div>
        <div className="pillar-progress">
          <div className="progress-bar">
            <div
              className={`progress-fill ${progressFillClass(pillar.progress)}`}
              style={{ width: `${pillar.progress}%` }}
            />
          </div>
          <div className="progress-label">
            <span>{pillar.progress}%</span>
            <span>
              {pillar.completedTasks} of {pillar.totalTasks} done
            </span>
          </div>
        </div>
        <span className={`health-badge ${pillar.health}`}>● {HEALTH_LABEL[pillar.health]}</span>
        <div className="pillar-counts">
          <b>{pillar.objectiveCount}</b> objectives
          <br />
          <b>{pillar.totalTasks}</b> tasks
        </div>
      </button>

      <div className="pillar-body" id={`pillar-body-${pillar.id}`}>
        <div className="obj-header">
          <div>
            Objectives <span className="count">{pillar.objectiveCount}</span>
          </div>
          {canCreate ? (
            <Link className="obj-header-action" href={`/objectives?pillar=${pillar.id}`}>
              + New Objective
            </Link>
          ) : null}
        </div>

        {pillar.objectives.length === 0 ? (
          <div className="pillar-empty">
            No objectives recorded yet — start by drafting one with Sage in /agents, or open the
            pillar detail to add one directly.
          </div>
        ) : (
          pillar.objectives.map((obj) => (
            <ObjectiveRow
              key={obj.id}
              obj={obj}
              isOpen={openObjectives.has(obj.id)}
              onToggle={() => onToggleObjective(obj.id)}
            />
          ))
        )}

        <div className="pillar-footer">
          <Link href={`/objectives/${pillar.id}`}>Open pillar detail →</Link>
          <Link href="/strategy" className="muted">
            Manage in Strategy
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Objective row ────────────────────────────────────────────────────

function ObjectiveRow(props: {
  obj: PlanObjectiveRow
  isOpen: boolean
  onToggle: () => void
}): React.ReactElement {
  const { obj, isOpen, onToggle } = props

  return (
    <div className={`objective${isOpen ? " open" : ""}`}>
      <button
        type="button"
        className="obj-row"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`obj-body-${obj.id}`}
      >
        <svg className="obj-caret" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline
            points="9 6 15 12 9 18"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="obj-title">
          {obj.title}
          {obj.hint ? <span className="hint">{obj.hint}</span> : null}
        </div>
        <span className="obj-tasks-count">
          {obj.completedTasks} / {obj.totalTasks} tasks
        </span>
        <span className={`health-badge ${obj.health}`}>{HEALTH_LABEL[obj.health]}</span>
        <Assignees initials={obj.assigneeInitials} />
      </button>

      <div className="obj-body" id={`obj-body-${obj.id}`}>
        {obj.tasks.length === 0 ? (
          <div className="pillar-empty">
            No tasks under this objective yet — break it into the next 3 actions to make it real.
          </div>
        ) : (
          obj.tasks.map((task) => <TaskRow key={task.id} task={task} />)
        )}
        <button type="button" className="add-task-row">
          + Add task
        </button>
      </div>
    </div>
  )
}

// ── Task row ─────────────────────────────────────────────────────────

function TaskRow({ task }: { task: PlanTaskRow }): React.ReactElement {
  const statusClass = classifyTaskStatus(task.status, task.isOverdue)
  // Map `risk_level` (low/medium/high) onto the mockup's priority bar colours.
  // The mockup distinguishes `high` (red), `med` (amber) and default (subtle).
  const priorityClass = (() => {
    const r = (task.riskLevel ?? "").toLowerCase()
    if (r === "high" || r === "critical") return "high"
    if (r === "medium") return "med"
    return ""
  })()
  const statusLabel = (() => {
    if (statusClass === "done") return "Done"
    if (statusClass === "blocked") return "Blocked"
    if (statusClass === "in-progress") return "In progress"
    return "Pending"
  })()
  return (
    <div className={`task-row${task.isDone ? " done" : ""}`}>
      <button type="button" className="task-check" aria-label={task.isDone ? "Completed" : "Mark complete"} />
      <div className={`task-priority${priorityClass ? ` ${priorityClass}` : ""}`} />
      <div className="task-title">{task.title}</div>
      <span className={`task-status ${statusClass}`}>{statusLabel}</span>
      <span className={`task-due${task.isOverdue ? " overdue" : ""}`}>
        {formatShortDate(task.end_date)}
      </span>
      <Assignees initials={task.assigneeInitials} />
    </div>
  )
}

// ── Assignees stack ──────────────────────────────────────────────────

function Assignees({ initials }: { initials: string[] }): React.ReactElement | null {
  if (initials.length === 0) return null
  return (
    <div className="assignees">
      {initials.slice(0, 4).map((init, idx) => {
        const bgClass = idx === 0 ? "" : ` bg-${(idx % 3) + 2}`
        return (
          <div key={`${init}-${idx}`} className={`av${bgClass}`}>
            {init}
          </div>
        )
      })}
    </div>
  )
}

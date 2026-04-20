/**
 * ScheduleView — global Schedule / Time view (V2, mockup-faithful).
 *
 * Mockup-faithful port of FORGE-MOCKUP-SCHEDULE.html, reframed per the build
 * brief from a single "Book ISO 27001 surveillance audit" booking action into
 * the founder's current-week time-block view. Sidebar "Time" links here.
 *
 * Interaction contract (V1):
 *   - Type toggle (Audit / Expert intro / 1:1 / Test lab / Supplier review) is
 *     a visual filter only. No wiring yet — each mode just reframes the empty
 *     state copy when active.
 *   - Week nav (‹ / ›) is disabled until a `schedule_blocks` store exists —
 *     there is nothing to navigate. "Today" badge still highlights the right
 *     column based on the current day.
 *   - "Connect calendar" and "Add block" render as disabled Soon buttons until
 *     the calendar integration and schedule mutation land.
 *
 * Empty-state policy (honest, non-fabricated):
 *   - There is no `schedule_blocks` table yet. Every day column renders
 *     "Nothing scheduled" — we never fake auditor slots, supplier calls, or
 *     standing 1:1s.
 *   - The constraints / context side cards render the static framing from the
 *     mockup (why-this-matters / typical durations / calendar-status) with no
 *     invented numbers.
 *
 * Sections (top to bottom, matching the mockup shell):
 *   1. Breadcrumb — Forge › Schedule
 *   2. Annotation note — one calendar picker for every Book/Schedule action
 *   3. Page title + sub
 *   4. Main card
 *      a. Head — title + type toggle
 *      b. Body — week nav + 7-day week grid with honest-empty columns
 *      c. Foot — status line + "Connect calendar" Soon button
 *   5. Side stack — three context cards (Why · Calendar · What this replaces)
 *   6. Annotation footer — five-mode-toggle framing from the mockup
 */

"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import "./schedule-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export type ScheduleType =
    | "audit"
    | "expert-intro"
    | "one-on-one"
    | "test-lab"
    | "supplier-review"

export interface ScheduleViewProps {
    /**
     * Today (UTC) as ISO date string (YYYY-MM-DD). Passed in so the server
     * component owns "now" — the client never reads Date.now() on first
     * render, which keeps SSR output deterministic.
     */
    todayIso: string
}

// ─── Constants ─────────────────────────────────────────────────────────

const TYPE_TOGGLE: Array<{ id: ScheduleType; label: string }> = [
    { id: "audit", label: "Audit" },
    { id: "expert-intro", label: "Expert intro" },
    { id: "one-on-one", label: "1:1" },
    { id: "test-lab", label: "Test lab" },
    { id: "supplier-review", label: "Supplier review" },
]

const DOW_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

// Per-mode empty-state copy. Ported from the mockup's annotation note which
// explains each mode preloads a different question set. For V1 we reflect the
// selected mode in the empty column copy so the toggle has honest effect.
const EMPTY_COPY_BY_TYPE: Record<ScheduleType, string> = {
    audit: "Nothing scheduled",
    "expert-intro": "Nothing scheduled",
    "one-on-one": "Nothing scheduled",
    "test-lab": "Nothing scheduled",
    "supplier-review": "Nothing scheduled",
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Given an ISO date string ("YYYY-MM-DD"), return the 7 day records making
 * up the Mon–Sun week that contains that date. Deterministic — relies only
 * on the passed-in ISO string, never on client Date.now().
 */
function buildWeek(todayIso: string): Array<{
    iso: string
    dow: typeof DOW_SHORT[number]
    dayNum: number
    monthShort: string
    isToday: boolean
}> {
    // Parse as UTC-noon to dodge DST/timezone edge cases when we iterate.
    const [yStr, mStr, dStr] = todayIso.split("-")
    const y = Number(yStr)
    const m = Number(mStr)
    const d = Number(dStr)
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
        // Fallback — render a blank Mon–Sun anchored at epoch.
        return DOW_SHORT.map((dow, i) => ({
            iso: `1970-01-0${i + 1}`,
            dow,
            dayNum: i + 1,
            monthShort: "Jan",
            isToday: false,
        }))
    }

    const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    // getUTCDay(): 0 Sun..6 Sat → shift so Mon=0..Sun=6.
    const jsDow = anchor.getUTCDay()
    const mondayOffset = (jsDow + 6) % 7
    const monday = new Date(anchor)
    monday.setUTCDate(anchor.getUTCDate() - mondayOffset)

    const out: Array<{
        iso: string
        dow: typeof DOW_SHORT[number]
        dayNum: number
        monthShort: string
        isToday: boolean
    }> = []
    for (let i = 0; i < 7; i++) {
        const day = new Date(monday)
        day.setUTCDate(monday.getUTCDate() + i)
        const iso = day.toISOString().slice(0, 10)
        out.push({
            iso,
            dow: DOW_SHORT[i],
            dayNum: day.getUTCDate(),
            monthShort: day.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
            isToday: iso === todayIso,
        })
    }
    return out
}

/**
 * Format the week header label, e.g. "Week of 20 Apr 2026" or when the week
 * straddles a month boundary "28 Apr – 4 May 2026".
 */
function formatWeekLabel(week: ReturnType<typeof buildWeek>): string {
    if (week.length === 0) return ""
    const first = week[0]
    const last = week[week.length - 1]
    if (!first || !last) return ""
    const firstDate = new Date(`${first.iso}T12:00:00Z`)
    const lastDate = new Date(`${last.iso}T12:00:00Z`)
    if (Number.isNaN(firstDate.getTime()) || Number.isNaN(lastDate.getTime())) {
        return `Week of ${first.iso}`
    }
    const sameMonth =
        firstDate.getUTCMonth() === lastDate.getUTCMonth()
        && firstDate.getUTCFullYear() === lastDate.getUTCFullYear()
    if (sameMonth) {
        return `Week of ${first.dayNum}–${last.dayNum} ${first.monthShort} ${firstDate.getUTCFullYear()}`
    }
    return `${first.dayNum} ${first.monthShort} – ${last.dayNum} ${last.monthShort} ${lastDate.getUTCFullYear()}`
}

// ─── View ──────────────────────────────────────────────────────────────

export function ScheduleView(props: ScheduleViewProps): React.ReactElement {
    const { todayIso } = props
    const [selectedType, setSelectedType] = useState<ScheduleType>("audit")

    const week = useMemo(() => buildWeek(todayIso), [todayIso])
    const weekLabel = useMemo(() => formatWeekLabel(week), [week])
    const emptyCopy = EMPTY_COPY_BY_TYPE[selectedType]

    return (
        <div className="sh2">
            {/* ── Breadcrumb ─────────────────────────────── */}
            <nav className="sh2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep" aria-hidden="true">›</span>
                <span className="current">Schedule</span>
            </nav>

            {/* ── Annotation note ────────────────────────── */}
            <div className="sh2-annot">
                <strong>Note</strong>
                Pattern: one calendar picker serves every &ldquo;Book X&rdquo;,
                &ldquo;Schedule Y&rdquo;, &ldquo;Find time for Z&rdquo; action —
                audit slots, expert intros, 1:1s, test-lab bookings, supplier
                reviews. Availability will populate from your calendar
                integration; conflicts are surfaced here once blocks exist.
            </div>

            {/* ── Page header ────────────────────────────── */}
            <h1 className="sh2-page-title"><span className="sh2-title-dot" aria-hidden="true" />Schedule</h1>
            <p className="sh2-page-sub">
                Every time-bound item across my projects in one place — calendar
                holds, specialist reviews, supplier deadlines and compliance
                audits.
            </p>

            {/* ── Main + side grid ───────────────────────── */}
            <div className="sh2-grid">

                {/* ── Main card ──────────────────────────── */}
                <div className="sh2-main">
                    <div className="sh2-head">
                        <h2>This week</h2>
                        <div className="sh2-type-toggle" role="tablist" aria-label="Block type">
                            {TYPE_TOGGLE.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={selectedType === t.id}
                                    className={selectedType === t.id ? "active" : undefined}
                                    onClick={() => setSelectedType(t.id)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="sh2-body">
                        <div className="sh2-week-nav">
                            <div className="label">{weekLabel}</div>
                            <div className="controls">
                                <button type="button" className="sh2-btn sh2-btn-compact" disabled aria-label="Previous week" title="Week navigation ships with the schedule store">‹</button>
                                <button type="button" className="sh2-btn sh2-btn-compact" disabled aria-label="Next week" title="Week navigation ships with the schedule store">›</button>
                            </div>
                        </div>

                        <div className="sh2-week-grid" role="list" aria-label="Week view">
                            {week.map((day) => (
                                <div
                                    key={day.iso}
                                    className={`sh2-day-col${day.isToday ? " today" : ""}`}
                                    role="listitem"
                                    aria-label={`${day.dow} ${day.dayNum} ${day.monthShort}`}
                                >
                                    <div className="sh2-day-head">
                                        <div className="sh2-day-dow">{day.dow}</div>
                                        <div className="sh2-day-num">{day.dayNum}</div>
                                    </div>
                                    <div className="sh2-day-empty">{emptyCopy}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="sh2-foot">
                        <div className="status">
                            No scheduled blocks yet. Schedule populates from
                            calendar integration (not yet connected) and from
                            task due dates.
                        </div>
                        <button type="button" className="sh2-btn soon" title="Calendar integration ships with the schedule store">
                            Connect calendar
                        </button>
                    </div>
                </div>

                {/* ── Side stack ─────────────────────────── */}
                <aside className="sh2-side" aria-label="Schedule context">
                    <div className="sh2-side-card">
                        <h4>Why this matters</h4>
                        <div className="body">
                            The week view collapses every booking flow into one
                            surface — audits, expert intros, supplier calls,
                            1:1s, test-lab bookings. One place to see the week,
                            one place to book the next slot.
                        </div>
                    </div>

                    <div className="sh2-side-card">
                        <h4>Calendar status</h4>
                        <div className="row"><div className="k">Google Calendar</div><div className="v">Not connected</div></div>
                        <div className="row"><div className="k">Task due dates</div><div className="v">Not wired</div></div>
                        <div className="row"><div className="k">Conflict detection</div><div className="v">Pending</div></div>
                    </div>

                    <div className="sh2-side-card">
                        <h4>What this replaces</h4>
                        <div className="muted">
                            Five mode toggles (Audit · Expert intro · 1:1 ·
                            Test lab · Supplier review) collapse the
                            Book/Schedule actions from four pages into one
                            surface. Each mode pre-loads the right question
                            set once the booking flows wire in.
                        </div>
                    </div>
                </aside>
            </div>

            {/* ── Annotation footer ──────────────────────── */}
            <div className="sh2-annot" style={{ marginTop: 24 }}>
                <strong>Note</strong>
                Each mode will pre-load the right question set —
                &ldquo;Expert intro&rdquo; shows the candidate bio pane,
                &ldquo;Test lab&rdquo; asks for equipment specs,
                &ldquo;Supplier review&rdquo; attaches the scorecard. Those
                flows wire in once the schedule store and booking mutation
                land.
            </div>
        </div>
    )
}

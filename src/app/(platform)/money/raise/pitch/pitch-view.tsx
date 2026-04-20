/**
 * PitchView — /money/raise/pitch (V2, mockup-faithful).
 *
 * Mockup-faithful DOM ported from MONEY-MOCKUP-PITCH-SECTION.html. Scoped
 * to `.ptc2` so nothing leaks into the rest of the platform.
 *
 * Interaction contract (V1):
 *   - 8-section strip at the top. Each tab tracks a done/pending state
 *     held in local component state + localStorage. Active tab is
 *     "Financial model" on first visit (matches the mockup); clicking a
 *     tab swaps the narrative form below and updates the progress bar.
 *   - Narrative form: four fields per the mockup (path to profitability,
 *     three scenarios, key sensitivities, supporting assumptions). State
 *     is per-section so switching tabs doesn't clobber the other section's
 *     text.
 *   - Preview card: shows an honest empty-state slide frame + "Start your
 *     first deck" CTA when no slides exist. Once slides exist (saved in
 *     localStorage), renders the first slide's title / bullets. The
 *     slide-list lives under `ptc2:pitch:slides`.
 *   - Save draft: persists all sections + slides to localStorage under
 *     `ptc2:pitch:draft`. Toasts confirmation. Mark section done: flips
 *     the current tab's state from pending/active → done.
 *   - Buttons that depend on absent wiring (Preview deck, Export PDF,
 *     Send to DD, Fiona sign-off) are visible but honest — they trigger
 *     a "wires up next round" toast.
 *
 * Banned mockup specifics we do NOT render:
 *   - Fiona's pre-filled narrative drafts (the "breakeven Q4 '26 / £2,400
 *     → £1,850" paragraph, the three-scenario Nimbus text, Simon King's
 *     17 Apr ask). All four textareas boot empty with honest placeholder
 *     hints. Specialist drafting lands with the specialist wiring.
 *   - Rail card investor names (Simon King · Octopus / Reshma · Seedcamp)
 *     and the past-wins references (Wayve Series B / Opus seed). Rail
 *     cards render empty-state copy until the investor / round data wires.
 *   - Auto-pulled-from-Plan bullet list. The callout says "not yet wired"
 *     with a link to Plan.
 *   - Version history timestamps. Renders "No saved versions yet" until
 *     the first local save completes.
 *
 * Sections (top to bottom, matching the mockup 1:1):
 *   1. Breadcrumb + context chips
 *   2. Preview banner — persistence-honest state
 *   3. Section header (title + subtitle + progress bar)
 *   4. 8-tab section strip
 *   5. Fiona CTA strip (honest "specialist drafting wires up next round")
 *   6. Two-thirds grid:
 *      LEFT — data-pull callout, narrative form (4 fields), preview slide
 *      RIGHT — sending-to, checklist, inspiration, version history
 *   7. Bottom actions bar
 */

"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import "./pitch-v2.css"

// ─── Storage keys ──────────────────────────────────────────────────────

const DRAFT_STORAGE_KEY = "ptc2:pitch:draft"
const SLIDES_STORAGE_KEY = "ptc2:pitch:slides"

// ─── Types ─────────────────────────────────────────────────────────────

type SectionId =
    | "company_oneliner"
    | "target_market"
    | "problem_solution"
    | "traction"
    | "team"
    | "ask"
    | "financial_model"
    | "cap_table"

type SectionState = "done" | "pending" | "active"

interface SectionDraft {
    pathToProfitability: string
    threeScenarios: string
    keySensitivities: string
    supportingAssumptions: string
}

interface PersistedDraft {
    activeSection: SectionId
    states: Record<SectionId, SectionState>
    drafts: Record<SectionId, SectionDraft>
    savedAt: string
}

/** Slide shape for the editor wiring — kept minimal for V1. */
export interface PersistedSlide {
    id: string
    position: number
    title: string
    subtitle: string
    layout: string
    bullets: string[]
    notes: string
    updatedAt: string
}

// ─── Catalogue ─────────────────────────────────────────────────────────

interface SectionTab {
    id: SectionId
    label: string
}

const SECTION_TABS: ReadonlyArray<SectionTab> = [
    { id: "company_oneliner", label: "Company + one-liner" },
    { id: "target_market", label: "Target market" },
    { id: "problem_solution", label: "Problem + solution" },
    { id: "traction", label: "Traction" },
    { id: "team", label: "Team" },
    { id: "ask", label: "Ask" },
    { id: "financial_model", label: "Financial model" },
    { id: "cap_table", label: "Cap table" },
]

function defaultStates(): Record<SectionId, SectionState> {
    return {
        company_oneliner: "pending",
        target_market: "pending",
        problem_solution: "pending",
        traction: "pending",
        team: "pending",
        ask: "pending",
        financial_model: "active",
        cap_table: "pending",
    }
}

function defaultDraft(): SectionDraft {
    return {
        pathToProfitability: "",
        threeScenarios: "",
        keySensitivities: "",
        supportingAssumptions: "",
    }
}

function defaultDrafts(): Record<SectionId, SectionDraft> {
    return {
        company_oneliner: defaultDraft(),
        target_market: defaultDraft(),
        problem_solution: defaultDraft(),
        traction: defaultDraft(),
        team: defaultDraft(),
        ask: defaultDraft(),
        financial_model: defaultDraft(),
        cap_table: defaultDraft(),
    }
}

// ─── Component ─────────────────────────────────────────────────────────

export function PitchView(): React.ReactElement {
    const [activeSection, setActiveSection] = useState<SectionId>("financial_model")
    const [states, setStates] = useState<Record<SectionId, SectionState>>(defaultStates())
    const [drafts, setDrafts] = useState<Record<SectionId, SectionDraft>>(defaultDrafts())
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
    const [slides, setSlides] = useState<PersistedSlide[]>([])

    // Rehydrate from localStorage on mount — client-only.
    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
            if (raw) {
                const parsed = JSON.parse(raw) as PersistedDraft
                if (parsed && typeof parsed === "object") {
                    if (isSectionId(parsed.activeSection)) setActiveSection(parsed.activeSection)
                    if (parsed.states) setStates({ ...defaultStates(), ...parsed.states })
                    if (parsed.drafts) setDrafts({ ...defaultDrafts(), ...parsed.drafts })
                    if (typeof parsed.savedAt === "string") setLastSavedAt(parsed.savedAt)
                }
            }
            const rawSlides = window.localStorage.getItem(SLIDES_STORAGE_KEY)
            if (rawSlides) {
                const parsed = JSON.parse(rawSlides) as PersistedSlide[]
                if (Array.isArray(parsed)) setSlides(parsed)
            }
        } catch (err) {
            console.warn("[PITCH] failed to rehydrate draft:", err)
        }
    }, [])

    const updateDraft = useCallback(
        (field: keyof SectionDraft, value: string) => {
            setDrafts((prev) => ({
                ...prev,
                [activeSection]: { ...prev[activeSection], [field]: value },
            }))
        },
        [activeSection],
    )

    const handleSaveDraft = useCallback(() => {
        if (typeof window === "undefined") return
        const savedAt = new Date().toISOString()
        const payload: PersistedDraft = { activeSection, states, drafts, savedAt }
        try {
            window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload))
            setLastSavedAt(savedAt)
            toast.success("Draft saved to this browser.")
        } catch (err) {
            console.error("[PITCH] failed to save draft:", err)
            toast.error("Could not save the draft locally — check browser storage.")
        }
    }, [activeSection, states, drafts])

    const handleMarkSectionDone = useCallback(() => {
        setStates((prev) => ({ ...prev, [activeSection]: "done" }))
        const savedAt = new Date().toISOString()
        try {
            const nextStates = { ...states, [activeSection]: "done" as SectionState }
            const payload: PersistedDraft = {
                activeSection,
                states: nextStates,
                drafts,
                savedAt,
            }
            window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload))
            setLastSavedAt(savedAt)
            toast.success("Section marked done.")
        } catch (err) {
            console.error("[PITCH] failed to save section-done:", err)
        }
    }, [activeSection, states, drafts])

    const handleSelectTab = useCallback(
        (id: SectionId) => {
            setActiveSection(id)
            // Any previously "active" tab (that isn't done) returns to pending
            setStates((prev) => {
                const next: Record<SectionId, SectionState> = { ...prev }
                for (const tab of SECTION_TABS) {
                    if (tab.id === id) continue
                    if (next[tab.id] === "active") next[tab.id] = "pending"
                }
                if (next[id] !== "done") next[id] = "active"
                return next
            })
        },
        [],
    )

    const handleWiresUpNextRound = useCallback((label: string) => {
        toast(`${label} wires up next round.`, {
            description: "Your narrative is saved locally until then.",
        })
    }, [])

    // Active tab metadata
    const currentTab =
        SECTION_TABS.find((t) => t.id === activeSection) ?? SECTION_TABS[6]
    const currentDraft = drafts[activeSection]
    const doneCount = Object.values(states).filter((s) => s === "done").length
    const progressPct = Math.round((doneCount / SECTION_TABS.length) * 100)

    const firstSlide = slides.length > 0 ? slides[0] : null

    return (
        <div className="ptc2">
            <div className="ptc2-wrap">
                {/* 1 · Breadcrumb + context chips */}
                <div className="ptc2-page-head">
                    <nav className="ptc2-crumbs" aria-label="Breadcrumb">
                        <Link href="/money">Money</Link>
                        <span className="sep" aria-hidden="true">›</span>
                        <Link href="/money/raise">Raise</Link>
                        <span className="sep" aria-hidden="true">›</span>
                        <span className="current">Pitch prep · {currentTab.label}</span>
                    </nav>
                    <div className="ptc2-ctx-chips">
                        <button
                            type="button"
                            className="ptc2-btn sm"
                            onClick={() => handleWiresUpNextRound("Preview deck")}
                        >
                            Preview deck
                        </button>
                        <button
                            type="button"
                            className="ptc2-btn sm"
                            onClick={() => handleWiresUpNextRound("Export PDF")}
                        >
                            Export PDF
                        </button>
                        <Link href="/money/raise" className="ptc2-btn sm">
                            Back to raise
                        </Link>
                    </div>
                </div>

                {/* 2 · Preview banner — honest persistence state */}
                <div className="ptc2-preview-banner" role="status" aria-live="polite">
                    <span className="ptc2-preview-badge">Preview</span>
                    <span className="ptc2-preview-text">
                        Pitch prep is in preview. <strong>Save draft</strong> persists to this
                        browser so nothing is lost between visits. Investor-visible exports
                        and specialist drafting wire up next round.
                    </span>
                </div>

                {/* 3 · Section header */}
                <div className="ptc2-sec-head">
                    <h1 className="ptc2-title"><span className="ptc2-title-dot" aria-hidden="true" />{currentTab.label}</h1>
                    <div className="ptc2-sub">
                        Pitch section {SECTION_TABS.findIndex((t) => t.id === activeSection) + 1}
                        {" "}of {SECTION_TABS.length} · click a tab below to switch sections.
                    </div>
                    <div className="ptc2-progress-row">
                        <div className="ptc2-progress-label">
                            {doneCount} / {SECTION_TABS.length} sections
                        </div>
                        <div className="ptc2-progress-bar">
                            <div className="fill" style={{ width: `${progressPct}%` }} />
                        </div>
                        <div className="ptc2-progress-pct">{progressPct}%</div>
                    </div>
                </div>

                {/* 4 · Section tabs (all 8) */}
                <div className="ptc2-sec-tabs" role="tablist" aria-label="Pitch sections">
                    {SECTION_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={tab.id === activeSection}
                            className={`ptc2-sec-tab ${states[tab.id]}`}
                            onClick={() => handleSelectTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* 5 · Fiona specialist CTA — honest until specialist wiring lands */}
                <div className="ptc2-spec">
                    <div className="ptc2-avatar" aria-hidden="true">FI</div>
                    <div className="ptc2-msg">
                        <strong>Fundraise · section approach</strong> · the narrative is
                        yours — why, not what. Specialist drafting ships when the
                        specialist wiring lands; for now, use the prompts below as your
                        outline.
                    </div>
                    <button
                        type="button"
                        className="ptc2-btn"
                        onClick={() => handleWiresUpNextRound("Specialist outline")}
                    >
                        Open outline
                    </button>
                </div>

                {/* 6 · Two-thirds grid */}
                <div className="ptc2-grid-2-3">
                    <div>
                        {/* Data pull — honest empty state */}
                        <div className="ptc2-data-pull-card">
                            <strong>Auto-pull from Plan</strong>
                            <p>
                                Revenue, COGS, opex, headcount and cash projections wire
                                into this section once the plan-to-slide binding ships. For
                                now, keep your numbers editable in Plan and re-export when
                                you share externally.
                            </p>
                            <div className="ptc2-data-pull-link">
                                <Link href="/money/plan">Open Plan →</Link>
                            </div>
                        </div>

                        {/* Narrative form */}
                        <div className="ptc2-form-card">
                            <h3>Narrative inputs</h3>
                            <div className="ptc2-form-sub">
                                These become the voiceover investors hear alongside the slides.
                                Write in your own voice — edit freely.
                            </div>

                            <div className="ptc2-form-group">
                                <label htmlFor="ptc2-path">The path to gross profitability</label>
                                <textarea
                                    id="ptc2-path"
                                    value={currentDraft.pathToProfitability}
                                    onChange={(e) => updateDraft("pathToProfitability", e.target.value)}
                                    placeholder="When do you reach breakeven gross margin, and why?"
                                />
                                <div className="ptc2-hint">
                                    Short paragraph. Specific numbers from your plan beat adjectives.
                                </div>
                            </div>

                            <div className="ptc2-form-group">
                                <label htmlFor="ptc2-scenarios">Three scenarios investors will ask about</label>
                                <textarea
                                    id="ptc2-scenarios"
                                    value={currentDraft.threeScenarios}
                                    onChange={(e) => updateDraft("threeScenarios", e.target.value)}
                                    placeholder="(1) DEFAULT — what you expect. (2) UPSIDE — what good looks like. (3) STRESS — the bad case and what you do."
                                />
                                <div className="ptc2-hint">
                                    Three bullet story. Investors want to see you&apos;ve thought
                                    about the bad case.
                                </div>
                            </div>

                            <div className="ptc2-form-group">
                                <label htmlFor="ptc2-sens">Key sensitivities</label>
                                <textarea
                                    id="ptc2-sens"
                                    value={currentDraft.keySensitivities}
                                    onChange={(e) => updateDraft("keySensitivities", e.target.value)}
                                    placeholder="Which line items move runway most if they slip? How do you defend the concentration?"
                                />
                                <div className="ptc2-hint">
                                    Pick the one or two variables an investor will push on.
                                </div>
                            </div>

                            <div className="ptc2-form-group">
                                <label htmlFor="ptc2-assume">Supporting assumptions (for the appendix)</label>
                                <textarea
                                    id="ptc2-assume"
                                    value={currentDraft.supportingAssumptions}
                                    onChange={(e) => updateDraft("supportingAssumptions", e.target.value)}
                                    placeholder="Bullets. Things that will be invisible in the deck but visible in the data room."
                                />
                                <div className="ptc2-hint">
                                    These will be invisible in the deck but visible in the data room.
                                </div>
                            </div>
                        </div>

                        {/* Preview / slide card */}
                        <div className="ptc2-preview-card">
                            <div className="ptc2-prev-label">
                                {firstSlide ? "Preview · first slide of your deck" : "Preview · no slides yet"}
                            </div>
                            {firstSlide ? (
                                <div className="ptc2-preview-slide">
                                    <h4>{firstSlide.title || "Untitled slide"}</h4>
                                    {firstSlide.bullets.length > 0 ? (
                                        <ul>
                                            {firstSlide.bullets.map((b, i) => (
                                                <li key={i}>{b}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="ptc2-preview-empty-inline">
                                            No bullets on this slide yet.
                                        </p>
                                    )}
                                    <div className="ptc2-preview-foot">
                                        <span>
                                            {firstSlide.subtitle || "Add a subtitle in the editor."}
                                        </span>
                                        <span>Slide {firstSlide.position}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="ptc2-preview-empty">
                                    <div className="ptc2-preview-empty-title">
                                        Start your first deck
                                    </div>
                                    <div className="ptc2-preview-empty-body">
                                        A slide editor sits one click away. Add a title, a few
                                        bullets, and you&apos;ve got your first slide — you can
                                        iterate from there. Slides save to this browser until
                                        the pitch-prep migration lands.
                                    </div>
                                    <Link
                                        href="/money/raise/pitch/edit/new"
                                        className="ptc2-btn primary"
                                    >
                                        New slide
                                    </Link>
                                </div>
                            )}
                            <div className="ptc2-preview-actions">
                                <Link
                                    href={
                                        firstSlide
                                            ? `/money/raise/pitch/edit/${firstSlide.id}`
                                            : "/money/raise/pitch/edit/new"
                                    }
                                    className="ptc2-btn sm"
                                >
                                    {firstSlide ? "Edit this slide" : "New slide"}
                                </Link>
                                <button
                                    type="button"
                                    className="ptc2-btn sm"
                                    disabled={!firstSlide}
                                    onClick={() => handleWiresUpNextRound("Previous slide")}
                                >
                                    ← Prev slide
                                </button>
                                <button
                                    type="button"
                                    className="ptc2-btn sm"
                                    disabled={!firstSlide}
                                    onClick={() => handleWiresUpNextRound("Next slide")}
                                >
                                    Next slide →
                                </button>
                                <span className="ptc2-preview-spacer" />
                                <button
                                    type="button"
                                    className="ptc2-btn sm"
                                    onClick={() => handleWiresUpNextRound("Download deck")}
                                >
                                    Download deck
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT RAIL */}
                    <div>
                        <div className="ptc2-rail-card">
                            <div className="ptc2-rc-head">Sending to</div>
                            <div className="ptc2-rc-body ptc2-rail-empty">
                                Deal-room recipients populate when the round + pipeline
                                wiring is active. Add investors in Raise to see them here.
                            </div>
                        </div>

                        <div className="ptc2-rail-card">
                            <div className="ptc2-rc-head">Checklist</div>
                            <div className="ptc2-rc-body ptc2-checklist">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={currentDraft.pathToProfitability.length > 0}
                                        readOnly
                                    />
                                    <span>Path to profitability drafted</span>
                                </label>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={currentDraft.threeScenarios.length > 0}
                                        readOnly
                                    />
                                    <span>Three scenarios drafted</span>
                                </label>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={currentDraft.keySensitivities.length > 0}
                                        readOnly
                                    />
                                    <span>Sensitivities captured</span>
                                </label>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={currentDraft.supportingAssumptions.length > 0}
                                        readOnly
                                    />
                                    <span>Appendix assumptions listed</span>
                                </label>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={slides.length > 0}
                                        readOnly
                                    />
                                    <span>At least one slide drafted</span>
                                </label>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={states[activeSection] === "done"}
                                        readOnly
                                    />
                                    <span>Section marked done</span>
                                </label>
                            </div>
                        </div>

                        <div className="ptc2-rail-card">
                            <div className="ptc2-rc-head">Inspiration · past wins</div>
                            <div className="ptc2-rc-body ptc2-rail-empty">
                                A template library of anonymised winning decks plugs in here
                                when the inspiration-library action lands. For now, keep
                                your own references in Plan notes.
                            </div>
                        </div>

                        <div className="ptc2-rail-card">
                            <div className="ptc2-rc-head">Version history</div>
                            <div className="ptc2-rc-body ptc2-rail-empty">
                                {lastSavedAt ? (
                                    <>
                                        Last local save: <strong>{formatRelative(lastSavedAt)}</strong>.
                                        Multi-version history ships with the server persistence
                                        migration.
                                    </>
                                ) : (
                                    <>
                                        No saved versions yet. Multi-version history ships with
                                        the server persistence migration.
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 7 · Bottom actions bar */}
                <div className="ptc2-bottom-bar">
                    <Link href="/money/raise" className="ptc2-btn">
                        ← Back to Raise
                    </Link>
                    <div className="ptc2-bottom-actions">
                        <button
                            type="button"
                            className="ptc2-btn"
                            onClick={handleSaveDraft}
                        >
                            Save draft
                        </button>
                        <button
                            type="button"
                            className="ptc2-btn primary"
                            onClick={handleMarkSectionDone}
                        >
                            Mark section done
                        </button>
                        <button
                            type="button"
                            className="ptc2-btn"
                            onClick={() => {
                                const idx = SECTION_TABS.findIndex((t) => t.id === activeSection)
                                const next = SECTION_TABS[(idx + 1) % SECTION_TABS.length]
                                handleSelectTab(next.id)
                            }}
                        >
                            Next: {nextLabel(activeSection)} →
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function isSectionId(x: unknown): x is SectionId {
    return typeof x === "string" && SECTION_TABS.some((t) => t.id === x)
}

function nextLabel(current: SectionId): string {
    const idx = SECTION_TABS.findIndex((t) => t.id === current)
    return SECTION_TABS[(idx + 1) % SECTION_TABS.length].label
}

function formatRelative(iso: string): string {
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return "a moment ago"
    const delta = Date.now() - then
    const minutes = Math.round(delta / 60_000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.round(hours / 24)
    return `${days}d ago`
}

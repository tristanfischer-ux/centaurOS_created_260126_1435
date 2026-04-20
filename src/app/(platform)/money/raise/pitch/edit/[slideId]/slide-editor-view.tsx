/**
 * SlideEditorView — /money/raise/pitch/edit/:slideId (V2, mockup-faithful).
 *
 * Mockup-faithful DOM ported from MONEY-MOCKUP-SLIDE-EDITOR.html. Scoped
 * to `.slde2`. Three-column editor: layout + copy on the left, a live
 * slide canvas in the middle, and data-bindings / speaker notes / slide
 * meta / inspiration on the right.
 *
 * Interaction contract (V1):
 *   - Loads the slide matching `slideId` from the `ptc2:pitch:slides`
 *     localStorage list; `slideId === "new"` mints a blank slide that
 *     saves under a fresh id on the first Save.
 *   - Layout picker switches the canvas shape (title_body / bullets_chart
 *     / chart_full / two_up / three_cols / full_table). The chart placeholder
 *     renders only when the layout shows a chart area — no fake numbers.
 *   - Title / subtitle / bullets are fully editable; the canvas updates live.
 *   - Bullets support add / remove; drag-reorder lands with the comms
 *     mutation (not wired today — reorder buttons disabled with tooltip).
 *   - Speaker notes are a plain text area — no rich-text plugin.
 *   - Data-bindings sidecar lists what WILL wire once the plan-to-slide
 *     binding ships; no fabricated "Bound to plan.revenue.quarterly(12mo)"
 *     rows today.
 *   - Save slide: persists back to `ptc2:pitch:slides` and toasts. Present
 *     / Download PDF: toast "wires up next round".
 *
 * Banned mockup specifics we do NOT render:
 *   - "£25k → £73k/quarter" / "−30% → 9%" / "£486k" hardcoded bullet copy.
 *   - Three-slide deck strip with fixed "Path to profit / 3 scenarios /
 *     Appendix: model" captions. Strip renders whatever slides actually
 *     exist in localStorage.
 *   - Simon King / Wayve / Opus inspiration rows. Rail renders an honest
 *     empty state.
 *   - Pixel chart bars with hardcoded heights. The chart area, when shown,
 *     is a captioned empty-state placeholder.
 *
 * Sections (top to bottom, matching the mockup 1:1):
 *   1. Breadcrumb + context chips
 *   2. Preview banner — persistence-honest state
 *   3. Page header: slide title/sub + nav (prev / next / duplicate / delete)
 *   4. Deck thumbnail strip
 *   5. Main 3-column editor grid
 *   6. Bottom actions bar (back + save)
 */

"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import "./slide-editor-v2.css"

// ─── Storage keys (mirror the pitch-view keys) ─────────────────────────

const SLIDES_STORAGE_KEY = "ptc2:pitch:slides"

// ─── Types ─────────────────────────────────────────────────────────────

type SlideLayout =
    | "title_body"
    | "bullets_chart"
    | "chart_full"
    | "two_up"
    | "three_cols"
    | "full_table"

interface PersistedSlide {
    id: string
    position: number
    title: string
    subtitle: string
    layout: SlideLayout
    bullets: string[]
    notes: string
    updatedAt: string
}

interface LayoutOption {
    id: SlideLayout
    name: string
    desc: string
}

const LAYOUTS: ReadonlyArray<LayoutOption> = [
    { id: "title_body",   name: "Title + body",    desc: "Single column of copy." },
    { id: "bullets_chart", name: "Bullets + chart", desc: "Bullets left, chart right." },
    { id: "chart_full",   name: "Chart full",      desc: "One big chart, no bullets." },
    { id: "two_up",       name: "Two-up",          desc: "Two equal columns." },
    { id: "three_cols",   name: "3 columns",       desc: "Three bullet columns under a title." },
    { id: "full_table",   name: "Full table",      desc: "Rows and columns — for detail." },
]

function isLayout(x: unknown): x is SlideLayout {
    return typeof x === "string" && LAYOUTS.some((l) => l.id === x)
}

function emptySlide(id: string, position: number): PersistedSlide {
    return {
        id,
        position,
        title: "",
        subtitle: "",
        layout: "bullets_chart",
        bullets: [],
        notes: "",
        updatedAt: new Date().toISOString(),
    }
}

function loadSlides(): PersistedSlide[] {
    if (typeof window === "undefined") return []
    try {
        const raw = window.localStorage.getItem(SLIDES_STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as PersistedSlide[]
        if (!Array.isArray(parsed)) return []
        return parsed.filter((s): s is PersistedSlide =>
            !!s &&
            typeof s.id === "string" &&
            typeof s.position === "number" &&
            typeof s.title === "string" &&
            typeof s.subtitle === "string" &&
            isLayout(s.layout) &&
            Array.isArray(s.bullets) &&
            typeof s.notes === "string",
        )
    } catch (err) {
        console.warn("[SLIDE-EDITOR] failed to load slides:", err)
        return []
    }
}

function persistSlides(slides: PersistedSlide[]): void {
    if (typeof window === "undefined") return
    window.localStorage.setItem(SLIDES_STORAGE_KEY, JSON.stringify(slides))
}

// ─── Component ─────────────────────────────────────────────────────────

export function SlideEditorView({ slideId }: { slideId: string }): React.ReactElement {
    const [slides, setSlides] = useState<PersistedSlide[]>([])
    const [rehydrated, setRehydrated] = useState(false)

    // Current slide state
    const [slide, setSlide] = useState<PersistedSlide>(() =>
        emptySlide(slideId === "new" ? mintId() : slideId, 1),
    )
    const [isNew, setIsNew] = useState<boolean>(slideId === "new")

    // Rehydrate on mount
    useEffect(() => {
        const all = loadSlides()
        setSlides(all)
        if (slideId !== "new") {
            const match = all.find((s) => s.id === slideId)
            if (match) {
                setSlide(match)
                setIsNew(false)
                setRehydrated(true)
                return
            }
            // Slide id in URL but not in storage — treat as new-with-fixed-id
            // so copy/paste links don't crash.
            setSlide(emptySlide(slideId, all.length + 1))
            setIsNew(true)
        } else {
            setSlide(emptySlide(mintId(), all.length + 1))
            setIsNew(true)
        }
        setRehydrated(true)
    }, [slideId])

    // Derived meta
    const position = slide.position
    const totalSlides = useMemo(() => {
        if (isNew) return slides.length + 1
        return slides.length || 1
    }, [isNew, slides.length])

    const prevSlideId = useMemo(() => {
        const sorted = [...slides].sort((a, b) => a.position - b.position)
        const idx = sorted.findIndex((s) => s.id === slide.id)
        if (idx <= 0) return null
        return sorted[idx - 1].id
    }, [slides, slide.id])

    const nextSlideId = useMemo(() => {
        const sorted = [...slides].sort((a, b) => a.position - b.position)
        const idx = sorted.findIndex((s) => s.id === slide.id)
        if (idx === -1 || idx === sorted.length - 1) return null
        return sorted[idx + 1].id
    }, [slides, slide.id])

    // ─── Editor actions ────────────────────────────────────────────
    const updateField = useCallback(
        <K extends keyof PersistedSlide>(field: K, value: PersistedSlide[K]) => {
            setSlide((prev) => ({ ...prev, [field]: value }))
        },
        [],
    )

    const addBullet = useCallback(() => {
        setSlide((prev) => ({ ...prev, bullets: [...prev.bullets, ""] }))
    }, [])

    const removeBullet = useCallback((index: number) => {
        setSlide((prev) => ({
            ...prev,
            bullets: prev.bullets.filter((_, i) => i !== index),
        }))
    }, [])

    const updateBullet = useCallback((index: number, value: string) => {
        setSlide((prev) => ({
            ...prev,
            bullets: prev.bullets.map((b, i) => (i === index ? value : b)),
        }))
    }, [])

    const handleSave = useCallback(() => {
        if (typeof window === "undefined") return
        const savedSlide: PersistedSlide = {
            ...slide,
            updatedAt: new Date().toISOString(),
        }
        const existing = loadSlides()
        const next = existing.some((s) => s.id === savedSlide.id)
            ? existing.map((s) => (s.id === savedSlide.id ? savedSlide : s))
            : [...existing, savedSlide]
        try {
            persistSlides(next)
            setSlides(next)
            setSlide(savedSlide)
            setIsNew(false)
            toast.success("Slide saved to this browser.")
        } catch (err) {
            console.error("[SLIDE-EDITOR] save failed:", err)
            toast.error("Could not save the slide locally — check browser storage.")
        }
    }, [slide])

    const handleDuplicate = useCallback(() => {
        if (isNew) {
            toast("Save this slide first, then duplicate.")
            return
        }
        const existing = loadSlides()
        const copy: PersistedSlide = {
            ...slide,
            id: mintId(),
            position: existing.length + 1,
            updatedAt: new Date().toISOString(),
        }
        const next = [...existing, copy]
        persistSlides(next)
        setSlides(next)
        toast.success("Slide duplicated.")
    }, [slide, isNew])

    const handleDelete = useCallback(() => {
        if (isNew) {
            toast("Nothing to delete — this slide hasn't been saved yet.")
            return
        }
        const existing = loadSlides()
        const next = existing.filter((s) => s.id !== slide.id)
        persistSlides(next)
        setSlides(next)
        toast.success("Slide deleted.")
    }, [slide.id, isNew])

    const handleWiresUpNextRound = useCallback((label: string) => {
        toast(`${label} wires up next round.`, {
            description: "Your slide is saved locally until then.",
        })
    }, [])

    // Layout affordances
    const showChartArea = slide.layout === "bullets_chart" || slide.layout === "chart_full"
    const showSubtitle = slide.layout !== "chart_full"

    if (!rehydrated) {
        // Brief blank paint until localStorage is read — no flash of wrong state.
        return <div className="slde2" aria-busy="true" />
    }

    return (
        <div className="slde2">
            <div className="slde2-wrap">
                {/* 1 · Breadcrumb + context chips */}
                <div className="slde2-page-head">
                    <nav className="slde2-crumbs" aria-label="Breadcrumb">
                        <Link href="/money">Money</Link>
                        <span className="sep" aria-hidden="true">›</span>
                        <Link href="/money/raise">Raise</Link>
                        <span className="sep" aria-hidden="true">›</span>
                        <Link href="/money/raise/pitch">Pitch prep</Link>
                        <span className="sep" aria-hidden="true">›</span>
                        <span className="current">Slide {position}</span>
                    </nav>
                    <div className="slde2-ctx-chips">
                        <button
                            type="button"
                            className="slde2-btn sm"
                            onClick={() => handleWiresUpNextRound("Present mode")}
                        >
                            Present
                        </button>
                        <button
                            type="button"
                            className="slde2-btn sm"
                            onClick={() => handleWiresUpNextRound("PDF download")}
                        >
                            Download PDF
                        </button>
                        <button
                            type="button"
                            className="slde2-btn primary sm"
                            onClick={handleSave}
                        >
                            Save slide
                        </button>
                    </div>
                </div>

                {/* 2 · Preview banner */}
                <div className="slde2-preview-banner" role="status" aria-live="polite">
                    <span className="slde2-preview-badge">Preview</span>
                    <span className="slde2-preview-text">
                        Slides save to this browser until the pitch-prep migration lands.
                        Present mode and PDF export wire up next round.
                    </span>
                </div>

                {/* 3 · Header strip */}
                <div className="slde2-head">
                    <div>
                        <h1 className="slde2-title">
                            <span className="slde2-title-dot" aria-hidden="true" />
                            Slide {position} {totalSlides > 0 && `of ${totalSlides}`}
                            {slide.title ? <span className="slde2-title-sub">· {slide.title}</span> : null}
                        </h1>
                        <div className="slde2-sub">
                            Edit a single slide. Data-bound elements will auto-update from
                            Plan once the plan-to-slide binding ships.
                        </div>
                    </div>
                    <div className="slde2-head-actions">
                        <Link
                            href={prevSlideId ? `/money/raise/pitch/edit/${prevSlideId}` : "#"}
                            className="slde2-btn sm"
                            aria-disabled={!prevSlideId}
                            onClick={(e) => {
                                if (!prevSlideId) e.preventDefault()
                            }}
                        >
                            ← Prev slide
                        </Link>
                        <Link
                            href={nextSlideId ? `/money/raise/pitch/edit/${nextSlideId}` : "#"}
                            className="slde2-btn sm"
                            aria-disabled={!nextSlideId}
                            onClick={(e) => {
                                if (!nextSlideId) e.preventDefault()
                            }}
                        >
                            Next slide →
                        </Link>
                        <button
                            type="button"
                            className="slde2-btn sm"
                            onClick={handleDuplicate}
                        >
                            Duplicate
                        </button>
                        <button
                            type="button"
                            className="slde2-btn sm danger"
                            onClick={handleDelete}
                        >
                            Delete
                        </button>
                    </div>
                </div>

                {/* 4 · Deck thumbnail strip */}
                <div className="slde2-deck-strip">
                    {slides.length === 0 && isNew ? (
                        <div className="slde2-deck-empty">
                            This will be your first slide. Save it to start your deck.
                        </div>
                    ) : (
                        slides
                            .slice()
                            .sort((a, b) => a.position - b.position)
                            .map((s) => (
                                <Link
                                    key={s.id}
                                    href={`/money/raise/pitch/edit/${s.id}`}
                                    className={`slde2-thumb ${s.id === slide.id ? "active" : ""}`}
                                >
                                    <span className="sn">{s.position}</span>
                                    <strong>{s.title || "Untitled"}</strong>
                                    <span className="desc">
                                        {s.bullets.length > 0
                                            ? `${s.bullets.length} bullet${s.bullets.length === 1 ? "" : "s"}`
                                            : "No bullets yet"}
                                    </span>
                                </Link>
                            ))
                    )}
                    {isNew && slides.length > 0 && (
                        <div className="slde2-thumb active">
                            <span className="sn">{position}</span>
                            <strong>{slide.title || "Untitled"}</strong>
                            <span className="desc">New · unsaved</span>
                        </div>
                    )}
                    <Link href="/money/raise/pitch/edit/new" className="slde2-add-slide" aria-label="Add a slide">
                        +
                    </Link>
                </div>

                {/* 5 · Main editor grid */}
                <div className="slde2-ed-grid">
                    {/* LEFT · layout + content */}
                    <div>
                        <div className="slde2-panel">
                            <div className="slde2-ph">
                                Layout
                                <span className="slde2-ph-muted">
                                    {LAYOUTS.find((l) => l.id === slide.layout)?.name ?? "Bullets + chart"}
                                </span>
                            </div>
                            <div className="slde2-pb">
                                <div className="slde2-layout-grid">
                                    {LAYOUTS.map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            className={`slde2-layout-opt ${opt.id === slide.layout ? "active" : ""}`}
                                            onClick={() => updateField("layout", opt.id)}
                                            aria-label={`Use ${opt.name} layout`}
                                        >
                                            <span className="slde2-layout-name">{opt.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="slde2-panel">
                            <div className="slde2-ph">Title + subtitle</div>
                            <div className="slde2-pb">
                                <div className="slde2-field">
                                    <label htmlFor="slde2-title">Title</label>
                                    <input
                                        id="slde2-title"
                                        type="text"
                                        value={slide.title}
                                        onChange={(e) => updateField("title", e.target.value)}
                                        placeholder="Short, specific. The one thing this slide says."
                                    />
                                </div>
                                {showSubtitle && (
                                    <div className="slde2-field">
                                        <label htmlFor="slde2-sub">Subtitle <span className="slde2-optional">optional</span></label>
                                        <input
                                            id="slde2-sub"
                                            type="text"
                                            value={slide.subtitle}
                                            onChange={(e) => updateField("subtitle", e.target.value)}
                                            placeholder="Context line — timeframe, scenario, or scope."
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="slde2-panel">
                            <div className="slde2-ph">
                                Body · bullets
                                <span className="slde2-ph-muted">
                                    {slide.bullets.length} of 6 max
                                </span>
                            </div>
                            <div className="slde2-pb">
                                {slide.bullets.length === 0 ? (
                                    <div className="slde2-bullets-empty">
                                        No bullets yet. Add one to start — three to five tight
                                        bullets beats a wall of text.
                                    </div>
                                ) : (
                                    slide.bullets.map((b, i) => (
                                        <div key={i} className="slde2-bullet-row">
                                            <span className="slde2-bullet-grip" aria-hidden="true">≡</span>
                                            <input
                                                type="text"
                                                value={b}
                                                onChange={(e) => updateBullet(i, e.target.value)}
                                                aria-label={`Bullet ${i + 1}`}
                                                placeholder="A single, specific point"
                                            />
                                            <button
                                                type="button"
                                                className="slde2-bullet-rm"
                                                onClick={() => removeBullet(i)}
                                                aria-label={`Remove bullet ${i + 1}`}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))
                                )}
                                <button
                                    type="button"
                                    className="slde2-btn sm slde2-add-bullet"
                                    onClick={addBullet}
                                    disabled={slide.bullets.length >= 6}
                                >
                                    + Add bullet
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* MIDDLE · slide canvas */}
                    <div className="slde2-panel">
                        <div className="slde2-ph">
                            Slide preview · 16:9
                            <span className="slde2-ph-muted">updates as you edit</span>
                        </div>
                        <div className="slde2-canvas-wrap">
                            <div className={`slde2-slide layout-${slide.layout}`}>
                                <div>
                                    <h2>{slide.title || "Your slide title"}</h2>
                                    {showSubtitle && slide.subtitle && (
                                        <p className="slde2-slide-sub">{slide.subtitle}</p>
                                    )}
                                </div>
                                <div className="slde2-slide-body">
                                    <ul className="slde2-slide-bullets">
                                        {slide.bullets.length === 0 ? (
                                            <li className="empty">Bullets preview here as you type.</li>
                                        ) : (
                                            slide.bullets.map((b, i) => (
                                                <li key={i}>{b || <em>Empty bullet</em>}</li>
                                            ))
                                        )}
                                    </ul>
                                    {showChartArea && (
                                        <div className="slde2-slide-chart">
                                            <div className="slde2-chart-label">Chart area</div>
                                            <div className="slde2-chart-empty">
                                                Chart renders from Plan once the plan-to-slide
                                                binding ships.
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="slde2-slide-foot">
                                    <span>Your deck · Pitch section</span>
                                    <span>Slide {position}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT · bindings + notes + meta + inspiration */}
                    <div>
                        <div className="slde2-panel">
                            <div className="slde2-ph">Data bindings</div>
                            <div className="slde2-pb slde2-rail-empty">
                                Bindings connect slide elements to your Plan
                                (<code>plan.revenue.quarterly</code>,
                                <code>plan.gross_margin.by_quarter</code>, etc.) so exports
                                always show today&apos;s numbers. The binding layer ships
                                with the plan-to-slide migration. Until then, slides render
                                the text you type.
                            </div>
                        </div>

                        <div className="slde2-panel">
                            <div className="slde2-ph">Speaker notes</div>
                            <div className="slde2-pb">
                                <textarea
                                    className="slde2-notes"
                                    value={slide.notes}
                                    onChange={(e) => updateField("notes", e.target.value)}
                                    placeholder="What you actually say when the slide is up. Questions investors might ask. What NOT to defend."
                                />
                                <div className="slde2-notes-hint">
                                    Speaker notes appear in the PDF appendix and the present
                                    view, never on the slide itself.
                                </div>
                            </div>
                        </div>

                        <div className="slde2-panel">
                            <div className="slde2-ph">Slide meta</div>
                            <div className="slde2-pb slde2-meta">
                                <div className="slde2-meta-row">
                                    <span className="n">Position in deck</span>
                                    <span className="v">{position}{totalSlides > 0 ? ` of ${totalSlides}` : ""}</span>
                                </div>
                                <div className="slde2-meta-row">
                                    <span className="n">Layout</span>
                                    <span className="v">
                                        {LAYOUTS.find((l) => l.id === slide.layout)?.name ?? "—"}
                                    </span>
                                </div>
                                <div className="slde2-meta-row">
                                    <span className="n">Last edit</span>
                                    <span className="v">
                                        {isNew ? "not yet saved" : formatRelative(slide.updatedAt)}
                                    </span>
                                </div>
                                <div className="slde2-meta-row">
                                    <span className="n">Export formats</span>
                                    <span className="v">PDF (wires up next round)</span>
                                </div>
                            </div>
                        </div>

                        <div className="slde2-panel">
                            <div className="slde2-ph">Inspiration</div>
                            <div className="slde2-pb slde2-rail-empty">
                                A curated library of anonymised winning slides plugs in here
                                when the inspiration-library action lands. For now, keep
                                your own references in Plan notes.
                            </div>
                        </div>
                    </div>
                </div>

                {/* 6 · Bottom actions bar */}
                <div className="slde2-bottom-bar">
                    <Link href="/money/raise/pitch" className="slde2-btn">
                        ← Back to pitch prep
                    </Link>
                    <div className="slde2-bottom-actions">
                        <button
                            type="button"
                            className="slde2-btn"
                            onClick={handleDuplicate}
                        >
                            Duplicate slide
                        </button>
                        <button
                            type="button"
                            className="slde2-btn primary"
                            onClick={handleSave}
                        >
                            Save slide
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function mintId(): string {
    // Short, random-enough id for per-browser slides — not a UUID.
    // Replaced by server-issued UUID when the pitch-prep migration lands.
    return `slide_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
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

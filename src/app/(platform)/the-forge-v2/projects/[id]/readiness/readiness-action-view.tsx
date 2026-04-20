/**
 * ReadinessActionView — Readiness-gap drill-in (V2, data-wired).
 *
 * Mockup-faithful DOM ported from FORGE-MOCKUP-READINESS-ACTION.html. The
 * page answers "so what do I do about this blocking item, given my runway
 * and stage?" for a single selected readiness item. Content is parameterised
 * per item-key so the same shell renders for every gap (mass-budget breach,
 * brief not locked, unknowns open, failure-modes open, cost-over-ceiling,
 * regulatory-not-declared, name-your-cto). Every visible string is either
 * (a) derived from real project state or (b) rendered from a structured
 * item template — never synthesised free-form content outside the templates.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Gap header banner (brand-left-border + title + meta)
 *   3. Why-it-matters / Who's-asking grid (2 cards)
 *   4. 3 action paths (A/B/C) with one recommended
 *   5. Experts shortlist (3 rows, pre-vetted directory entries)
 *   6. Recommendation card (runway/stage/target stats + narrative + CTAs)
 *   7. Specialist fundraising annotation (info variant)
 *
 * Empty-state policy — if the parent page finds no unresolved readiness
 * items, the `state="empty"` branch renders a celebratory panel with a
 * single "Lock the brief" link. Never falls back to mockup HAPS content.
 */

"use client"

import Link from "next/link"
import "./readiness-action-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export type ReadinessItemKey =
    | "mass-budget-breach"
    | "cost-over-ceiling"
    | "brief-not-locked"
    | "unknowns-open"
    | "failure-modes-open"
    | "regulatory-not-declared"
    | "name-your-cto"

/**
 * A paragraph is modelled as an array of segments so we can render
 * <strong> inline without injecting raw HTML. `{ strong: string }` renders
 * a bold run; a plain string renders as text.
 */
export type ParagraphSegment = string | { strong: string }
export type RichParagraph = ParagraphSegment[]

export interface ReadinessItemTemplate {
    /** Stable key used in ?item=<key> query strings. */
    key: ReadinessItemKey
    /** Header eyebrow label — "Readiness gap · Team dimension" etc. */
    dimensionLabel: string
    /** H1 of the gap page. */
    title: string
    /** Meta sentence under the H1 (supports inline <strong>). */
    meta: RichParagraph
    /** "Why this matters right now" body paragraphs. */
    whyMattersParagraphs: RichParagraph[]
    /** "Who's asking" body paragraphs. */
    whoAskingParagraphs: RichParagraph[]
    /** The three action paths. Exactly one should have `recommended: true`. */
    paths: [ReadinessPath, ReadinessPath, ReadinessPath]
    /** Experts shortlist candidates (3 pre-vetted rows). */
    experts: ReadinessExpert[]
    /** Recommendation title — "Start conversations with X (Path C · fractional)". */
    recommendationTitle: string
    /** Recommendation narrative paragraphs. */
    recommendationParagraphs: RichParagraph[]
    /** Specialist fundraising sidebar annotation. */
    annotation: {
        body: RichParagraph
        signoff: string
    }
}

export interface ReadinessPath {
    letter: "A" | "B" | "C"
    heading: string
    tagline: string
    metaRows: Array<{ k: string; v: string }>
    pros: string[]
    cons: string[]
    ctaLabel: string
    recommended: boolean
}

export interface ReadinessExpert {
    /** Initials (2 letters). */
    initials: string
    /** Palette tint — matches mockup avatar variants. */
    tint: "brand" | "info" | "success"
    name: string
    /** One-line bio (role / stint / availability). */
    bio: string
    /** Tag chips — fit + availability. */
    tags: Array<{ label: string; kind: "fit" | "avail" }>
    rateLine: string
    rateUnit: string
}

export interface ReadinessActionViewProps {
    project: {
        id: string
        name: string
    }
    /** Context stats shown in the recommendation card. */
    runwayLabel: string
    stageLabel: string
    nextCloseLabel: string
    /** The item template resolved by the parent from ?item=<key>. */
    item: ReadinessItemTemplate | null
    /** Tracks every item the project flagged so the empty-state variant can render. */
    unresolvedCount: number
}

// ─── View ──────────────────────────────────────────────────────────────

export function ReadinessActionView(props: ReadinessActionViewProps): React.ReactElement {
    const { project, runwayLabel, stageLabel, nextCloseLabel, item, unresolvedCount } = props

    const workspaceHref = `/the-forge-v2/projects/${project.id}`
    const briefLockHref = `/the-forge-v2/projects/${project.id}/brief-lock`
    const specialistsHref = `/the-forge-v2/projects/${project.id}/specialists`

    // ── Empty state — no readiness items flagged ──
    if (item === null || unresolvedCount === 0) {
        return (
            <div className="ra2">
                <nav className="ra2-breadcrumb">
                    <Link href="/the-forge-v2">Forge</Link>
                    <span className="sep">›</span>
                    <Link href={workspaceHref}>{project.name}</Link>
                    <span className="sep">›</span>
                    <span className="current">Readiness</span>
                </nav>

                <div className="ra2-empty">
                    <div className="icon" aria-hidden="true">✓</div>
                    <h2>All ready — no blocking actions</h2>
                    <p>Every readiness dimension clears. Brief is in good shape, constraints are declared, modules are sound, and costs sit inside the ceiling. When the next gap opens you&apos;ll see it listed here.</p>
                    <Link href={briefLockHref} className="cta">Lock the brief →</Link>
                </div>
            </div>
        )
    }

    return (
        <div className="ra2">
            {/* ── Breadcrumb ────────────────────────────────────────── */}
            <nav className="ra2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={workspaceHref}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Readiness gap · {item.title}</span>
            </nav>

            {/* ── Header banner ─────────────────────────────────────── */}
            <div className="ra2-gap-head">
                <div className="lbl">⚠ {item.dimensionLabel}</div>
                <h1><span className="ra2-title-dot" aria-hidden="true" />{item.title}</h1>
                <div className="meta"><RichText segments={item.meta} /></div>
            </div>

            {/* ── Why it matters / Who's asking ─────────────────────── */}
            <div className="ra2-why-grid">
                <div className="ra2-why-card">
                    <h3>Why this matters right now</h3>
                    {item.whyMattersParagraphs.map((p, idx) => (
                        <p key={idx}><RichText segments={p} /></p>
                    ))}
                </div>
                <div className="ra2-why-card">
                    <h3>Who&apos;s asking</h3>
                    {item.whoAskingParagraphs.map((p, idx) => (
                        <p key={idx}><RichText segments={p} /></p>
                    ))}
                </div>
            </div>

            {/* ── 3 action paths ────────────────────────────────────── */}
            <div className="ra2-sec-h">3 action paths · pick one</div>
            <div className="ra2-path-grid">
                {item.paths.map((path) => (
                    <PathCard key={path.letter} path={path} />
                ))}
            </div>

            {/* ── Experts shortlist ─────────────────────────────────── */}
            <div className="ra2-sec-h">Pre-vetted candidates in the Experts directory · Path C recommended</div>
            {item.experts.map((exp, idx) => (
                <ExpertRow key={`${exp.initials}-${idx}`} expert={exp} href={specialistsHref} />
            ))}

            {/* ── Recommendation ────────────────────────────────────── */}
            <div className="ra2-sec-h">Recommendation · based on your runway + stage</div>
            <div className="ra2-rec-card">
                <h3>{item.recommendationTitle}</h3>
                <div className="stat-row">
                    <div className="s"><div className="k">Runway</div><div className="v">{runwayLabel}</div></div>
                    <div className="s"><div className="k">Stage</div><div className="v">{stageLabel}</div></div>
                    <div className="s"><div className="k">Next close target</div><div className="v">{nextCloseLabel}</div></div>
                </div>
                {item.recommendationParagraphs.map((p, idx) => (
                    <p key={idx}><RichText segments={p} /></p>
                ))}
                <div className="cta-row">
                    <Link href={specialistsHref} className="primary">Send intro to top candidate</Link>
                    <Link href={workspaceHref} className="secondary">Park decision for 7 days</Link>
                </div>
            </div>

            {/* ── Specialist fundraising annotation ─────────────────── */}
            <div className="ra2-annot info">
                <strong>Fundraising · suggestion.</strong>{" "}
                <RichText segments={item.annotation.body} />{" "}
                <em>— {item.annotation.signoff}</em>
            </div>
        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function RichText({ segments }: { segments: RichParagraph }): React.ReactElement {
    return (
        <>
            {segments.map((seg, idx) =>
                typeof seg === "string"
                    ? <span key={idx}>{seg}</span>
                    : <strong key={idx}>{seg.strong}</strong>,
            )}
        </>
    )
}

function PathCard({ path }: { path: ReadinessPath }): React.ReactElement {
    const className = path.recommended ? "ra2-path-card recommended" : "ra2-path-card"
    return (
        <div className={className}>
            {path.recommended ? <div className="rec-badge">Recommended</div> : null}
            <h3>Path {path.letter} · {path.heading}</h3>
            <div className="tagline">{path.tagline}</div>
            <div className="meta-row">
                {path.metaRows.map((row) => (
                    <div className="m" key={row.k}>
                        {row.k}<span className="v">{row.v}</span>
                    </div>
                ))}
            </div>
            <ul>
                {path.pros.map((line, idx) => (
                    <li key={`pro-${idx}`} className="pro">{line}</li>
                ))}
                {path.cons.map((line, idx) => (
                    <li key={`con-${idx}`} className="con">{line}</li>
                ))}
            </ul>
            <span className="cta">{path.ctaLabel}</span>
        </div>
    )
}

function ExpertRow({ expert, href }: { expert: ReadinessExpert; href: string }): React.ReactElement {
    const avatarClass = expert.tint === "brand"
        ? "ra2-exp-av"
        : expert.tint === "info"
            ? "ra2-exp-av info"
            : "ra2-exp-av success"
    return (
        <div className="ra2-exp-row">
            <div className={avatarClass}>{expert.initials}</div>
            <div>
                <div className="n">{expert.name}</div>
                <div className="s">{expert.bio}</div>
                <div style={{ marginTop: 6 }}>
                    {expert.tags.map((t, idx) => (
                        <span
                            key={idx}
                            className={t.kind === "fit" ? "tag ra2-tag-fit" : "tag ra2-tag-avail"}
                        >
                            {t.label}
                        </span>
                    ))}
                </div>
            </div>
            <div className="rate">
                {expert.rateLine}
                <span className="u">{expert.rateUnit}</span>
            </div>
            <Link href={href} className="go">View profile →</Link>
        </div>
    )
}

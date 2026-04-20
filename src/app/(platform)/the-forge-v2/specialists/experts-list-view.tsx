/**
 * ExpertsListView — global Specialists directory (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-EXPERTS.html. Scoped CSS under `.xp2` keeps the
 * styling isolated so the mockup's palette/typography don't leak into the
 * rest of the platform.
 *
 * Difference from the mockup: the mockup is project-scoped and mixes in
 * fractional-executive cards. The production page at this route is the
 * *global* 13-specialist directory. The visual language (breadcrumb, dotted
 * title, stat row, sec-head, 3-col card grid, sessions table) is ported
 * verbatim from the mockup — the data it displays is the 13 specialists
 * (name, title, tagline, expertise highlights, baseline voice score,
 * department).
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — dotted title "Specialists" + count chip + CTAs
 *   3. Annotation note — what the roster is for
 *   4. Stats row (4 tiles)
 *   5. Strategy & technology leadership section
 *   6. Product, growth & operations section
 *   7. Finance, people & legal section
 *
 * Each card is a Link into `/the-forge-v2/specialists/{id}` — the Expert
 * Profile drill-in is built by a concurrent sibling agent.
 */

"use client"

import Link from "next/link"
import "./experts-list-v2.css"

// ─── Types ──────────────────────────────────────────────────────────

export interface SpecialistCardData {
    /** Specialist id — used for the profile drill-in URL. */
    id: string
    /** Human name ("Sage", "Max", …). */
    name: string
    /** Functional title ("Strategy", "CTO", …). */
    title: string
    /** First-person tagline from the specialist personality config. */
    tagline: string
    /** Capability pills — up to 4 rendered from `highlights`. */
    highlights: string[]
    /** Department grouping ("Strategy", "Technology", "Finance", …). */
    department: string
    /** Baseline composite voice score from CLAUDE.md §Baseline Scores. */
    voiceScore: number
    /** Two-letter initials derived from the human name. */
    initials: string
    /** Which gradient to apply to the avatar tile (a | b | c | d | e | f). */
    gradient: "a" | "b" | "c" | "d" | "e" | "f"
}

export interface ExpertsListViewProps {
    /** Leadership cluster: strategy + core tech leadership. */
    leadership: SpecialistCardData[]
    /** Product / growth / operations cluster. */
    productGrowth: SpecialistCardData[]
    /** Finance / people / legal cluster. */
    finance: SpecialistCardData[]
    /** Fleet stats for the stats row. */
    stats: {
        total: number
        fleetAverage: number
        topScore: number
        departments: number
    }
}

// ─── View ───────────────────────────────────────────────────────────

export function ExpertsListView(props: ExpertsListViewProps): React.ReactElement {
    const { leadership, productGrowth, finance, stats } = props

    return (
        <div className="xp2">
            {/* ── Breadcrumb ──────────────────────────────────── */}
            <div className="xp2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <span className="current">Specialists</span>
            </div>

            {/* ── Page header ─────────────────────────────────── */}
            <div className="xp2-page-header">
                <div>
                    <h1>
                        <span className="xp2-title-dot" aria-hidden="true" />
                        Specialists
                        <span className="xp2-chip success solid" style={{ marginLeft: 6 }}>
                            {stats.total} on your bench
                        </span>
                    </h1>
                    <div className="sub">
                        Thirteen in-product specialists — strategy, engineering, manufacturing, supply chain,
                        product, marketing, sales, finance, fundraising, people and legal.
                        Click any specialist to see their profile, voice and how to brief them.
                    </div>
                </div>
                <div className="cta-group">
                    <Link href="/agents" className="xp2-btn">
                        Legacy directory
                    </Link>
                    <Link href="/the-forge-v2" className="xp2-btn primary">
                        Brief a specialist
                    </Link>
                </div>
            </div>

            <div className="xp2-annot">
                <strong>Note</strong>
                The Specialists bench is the first line of expertise in every project.
                Each specialist carries a real personality, signature phrases and domain rules —
                the baseline voice score below is the composite from the benchmark suite
                (CLAUDE.md §Baseline Scores, April 5 2026). Scores ≥4.0 are considered in good standing.
            </div>

            {/* ── Stats row ───────────────────────────────────── */}
            <div className="xp2-stats-row">
                <div className="xp2-stat-card">
                    <div className="label">On your bench</div>
                    <div className="value">{stats.total}</div>
                    <div className="sub">specialists · always on</div>
                </div>
                <div className="xp2-stat-card">
                    <div className="label">Fleet average</div>
                    <div className="value">{stats.fleetAverage.toFixed(2)}</div>
                    <div className="sub">composite benchmark score</div>
                </div>
                <div className="xp2-stat-card">
                    <div className="label">Top specialist</div>
                    <div className="value">{stats.topScore.toFixed(2)}</div>
                    <div className="sub">highest baseline in the roster</div>
                </div>
                <div className="xp2-stat-card">
                    <div className="label">Departments</div>
                    <div className="value">{stats.departments}</div>
                    <div className="sub">covered end-to-end</div>
                </div>
            </div>

            {/* ── Leadership ─────────────────────────────────── */}
            <div className="xp2-section">
                <div className="xp2-sec-head">
                    Strategy &amp; technology · {leadership.length} specialists
                </div>
                <div className="xp2-grid">
                    {leadership.map((s) => (
                        <Card key={s.id} data={s} />
                    ))}
                </div>
            </div>

            {/* ── Product, growth & operations ───────────────── */}
            <div className="xp2-section">
                <div className="xp2-sec-head">
                    Product, growth &amp; operations · {productGrowth.length} specialists
                </div>
                <div className="xp2-grid">
                    {productGrowth.map((s) => (
                        <Card key={s.id} data={s} />
                    ))}
                </div>
            </div>

            {/* ── Finance, people & legal ────────────────────── */}
            <div className="xp2-section">
                <div className="xp2-sec-head">
                    Finance, people &amp; legal · {finance.length} specialists
                </div>
                <div className="xp2-grid">
                    {finance.map((s) => (
                        <Card key={s.id} data={s} />
                    ))}
                </div>
            </div>
        </div>
    )
}

// ─── Card ───────────────────────────────────────────────────────────

function Card({ data }: { data: SpecialistCardData }): React.ReactElement {
    const { id, name, title, tagline, highlights, department, voiceScore, initials, gradient } = data
    const pills = highlights.slice(0, 4)

    return (
        <Link href={`/the-forge-v2/specialists/${id}`} className="xp2-card">
            <div className="card-head">
                <div className={`photo grad-${gradient}`} aria-hidden="true">
                    {initials}
                </div>
                <div className="head-text">
                    <h4>{name}</h4>
                    <div className="title">
                        <span>{title}</span>
                        <span className="xp2-score" title="Baseline voice composite (CLAUDE.md)">
                            <span className="dot" aria-hidden="true" />
                            {voiceScore.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>
            <div className="tagline">{tagline}</div>
            <div className="tags">
                {pills.map((h) => (
                    <span key={h} className="xp2-chip info">
                        {h}
                    </span>
                ))}
            </div>
            <div className="foot">
                <span className="dept">{department}</span>
                <span className="view">View profile ›</span>
            </div>
        </Link>
    )
}

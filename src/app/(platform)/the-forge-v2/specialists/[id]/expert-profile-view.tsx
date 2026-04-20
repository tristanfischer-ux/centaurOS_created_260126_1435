/**
 * ExpertProfileView — global specialist profile page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-EXPERT-PROFILE.html. Scoped CSS under `.epf2` keeps the
 * styling isolated. Structure top-to-bottom mirrors the mockup:
 *
 *   1. Breadcrumb — Forge › Specialists › {Name}
 *   2. Hero strip — avatar + name/title + tagline + facts + match score block
 *   3. Annotation band — distinguishes this from project-scoped Ask surface
 *   4. About — description paragraph + working style + philosophy quote
 *   5. Rules of engagement — numbered list (replaces mockup match breakdown)
 *   6. Expertise pills — highlights
 *   7. Engagements across projects — honest empty state (no ask-history)
 *   8. Start an engagement — three CTAs mirroring the mockup
 *   9. Recent conversations — honest empty state
 *
 * This is the global directory entry for a specialist. The ask-in-project-
 * context surface lives at /the-forge-v2/projects/[id]/specialists/[id].
 * We never fabricate specialist history or quotes — every field is sourced
 * from the specialist registry or rendered as an honest empty state.
 */

import Link from "next/link"
import "./expert-profile-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface ExpertProfileViewProps {
    specialist: {
        id: string
        name: string
        title: string
        tagline: string | null
        description: string | null
        workingStyle: string | null
        highlights: string[]
        philosophy: string | null
        rulesOfEngagement: string[]
        initials: string
        modelTier: string
        voiceScore: number | null
        department: string | null
        inspiredBy: string | null
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatModelLabel(tier: string): string {
    switch (tier) {
        case "claude": return "Claude Opus"
        case "sonnet": return "Claude Sonnet"
        case "deepseek": return "DeepSeek V4"
        case "google": return "Gemini 3.1 Pro"
        case "openai": return "GPT-5.4"
        case "qwen": return "Qwen MoE"
        case "qwen-local": return "Qwen Local"
        case "minimax": return "MiniMax"
        default: return tier
    }
}

/**
 * Turn the baseline voice score (0–5 scale) into a 0–100 match-style number
 * for the hero block. The mockup shows an integer out of 100, so 4.67 → 93.
 */
function voiceToMatchScore(voice: number | null): number | null {
    if (voice == null) return null
    return Math.round((voice / 5) * 100)
}

// ─── View ───────────────────────────────────────────────────────────────

export function ExpertProfileView(props: ExpertProfileViewProps): React.ReactElement {
    const { specialist } = props

    const modelLabel = formatModelLabel(specialist.modelTier)
    const voiceLabel = specialist.voiceScore != null ? specialist.voiceScore.toFixed(2) : "—"
    const matchScore = voiceToMatchScore(specialist.voiceScore)

    return (
        <div className="epf2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <nav className="epf2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href="/the-forge-v2/experts">Experts</Link>
                <span className="sep">›</span>
                <span className="current">{specialist.name}</span>
            </nav>

            {/* ── Hero strip ──────────────────────────── */}
            <section className="epf2-hero">
                <div className="epf2-avatar-lg" aria-hidden="true">{specialist.initials}</div>
                <div className="epf2-hero-body">
                    <h1><span className="epf2-title-dot" aria-hidden="true" />{specialist.name} · {specialist.title}</h1>
                    <div className="tagline">{specialist.tagline ?? "—"}</div>
                    <div className="epf2-hero-facts">
                        <div className="fact">
                            <span className="k">Model</span>
                            <span className="v">{modelLabel}</span>
                        </div>
                        <div className="fact">
                            <span className="k">Voice score</span>
                            <span className="v">{voiceLabel} / 5</span>
                        </div>
                        <div className="fact">
                            <span className="k">Department</span>
                            <span className="v">{specialist.department ?? "—"}</span>
                        </div>
                        <div className="fact">
                            <span className="k">Inspired by</span>
                            <span className="v">{specialist.inspiredBy ?? "—"}</span>
                        </div>
                    </div>
                </div>
                {matchScore != null ? (
                    <div className="epf2-match-block">
                        <div className="num">{matchScore}</div>
                        <div className="lbl">Voice</div>
                        <div className="for">Baseline rubric, April 2026</div>
                    </div>
                ) : null}
            </section>

            <div className="epf2-annot">
                <strong>Note</strong>
                This is the global specialist directory entry — bio, philosophy, and how {specialist.name} shows
                up across any project. The in-project Ask surface, where {specialist.name} already knows your
                brief and BOM, lives inside each project workspace.
            </div>

            {/* ── About ───────────────────────────────── */}
            <section className="epf2-section">
                <h2>About {specialist.name}</h2>
                {specialist.description ? (
                    <p>{specialist.description}</p>
                ) : (
                    <p>—</p>
                )}
                {specialist.workingStyle ? (
                    <p>
                        <strong>How {specialist.name} works: </strong>
                        {specialist.workingStyle}
                    </p>
                ) : null}
                {specialist.philosophy ? (
                    <blockquote className="epf2-philosophy">
                        {specialist.philosophy}
                    </blockquote>
                ) : null}
            </section>

            {/* ── Rules of engagement ─────────────────── */}
            <section className="epf2-section">
                <h2>
                    How {specialist.name} operates <span className="tag">Rules of engagement</span>
                </h2>
                <p>
                    These are the standing rules {specialist.name} brings to every conversation — the same
                    constraints the compiler renders into every prompt.
                </p>
                {specialist.rulesOfEngagement.length === 0 ? (
                    <div className="epf2-empty">
                        <strong>No rules of engagement declared yet.</strong>
                        <span>
                            The specialist registry doesn&rsquo;t list standing rules for {specialist.name} at the
                            moment — they will appear here once the personality config declares them.
                        </span>
                    </div>
                ) : (
                    <div className="epf2-rows">
                        {specialist.rulesOfEngagement.map((rule, idx) => (
                            <div key={idx} className="epf2-row">
                                <span className="idx">{idx + 1}</span>
                                <div className="body">{rule}</div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── Expertise ───────────────────────────── */}
            <section className="epf2-section">
                <h2>Expertise</h2>
                <p>What {specialist.name} is sharpest on — the highlights surfaced on their card.</p>
                {specialist.highlights.length === 0 ? (
                    <div className="epf2-empty">
                        <strong>Highlights not declared yet.</strong>
                        <span>
                            {specialist.name}&rsquo;s capability highlights will appear here once the registry
                            lists them.
                        </span>
                    </div>
                ) : (
                    <div className="epf2-pills">
                        {specialist.highlights.map((h) => (
                            <span key={h} className="epf2-pill">{h}</span>
                        ))}
                    </div>
                )}
            </section>

            {/* ── Engagements across projects ─────────── */}
            <section className="epf2-section">
                <h2>Engagements across projects</h2>
                <p>
                    A running history of where {specialist.name} has been asked something, which project it was
                    on, and the outcome.
                </p>
                <div className="epf2-empty">
                    <strong>This specialist hasn&rsquo;t been asked anything on your projects yet.</strong>
                    <span>
                        Engagement history ships with the conversation runtime. Once chats start persisting,
                        each project {specialist.name} has touched will list here with the decisions threaded
                        through them.
                    </span>
                </div>
            </section>

            {/* ── Start an engagement ─────────────────── */}
            <section className="epf2-section">
                <h2>Start an engagement</h2>
                <p>Three ways to take the next step with {specialist.name}.</p>
                <div className="epf2-cta-grid">
                    <Link href="/the-forge-v2" className="epf2-cta-card primary">
                        <span className="cta-icon" aria-hidden="true">→</span>
                        <div className="cta-title">Ask {specialist.name} in a project</div>
                        <div className="cta-sub">
                            Open any Forge project and use the Ask {specialist.name} button — {specialist.name}{" "}
                            arrives with the brief, modules, BOM and cost posture pre-loaded.
                        </div>
                    </Link>
                    <Link href="/the-forge-v2/new" className="epf2-cta-card">
                        <span className="cta-icon" aria-hidden="true">+</span>
                        <div className="cta-title">Start a new project</div>
                        <div className="cta-sub">
                            Spin up a fresh Forge project and bring {specialist.name} in from the beginning,
                            before the brief is locked.
                        </div>
                    </Link>
                    <Link href="/the-forge-v2/experts" className="epf2-cta-card">
                        <span className="cta-icon" aria-hidden="true">↺</span>
                        <div className="cta-title">Back to the roster</div>
                        <div className="cta-sub">
                            Compare {specialist.name} against the other twelve specialists and pick the right
                            one for the question in front of you.
                        </div>
                    </Link>
                </div>
            </section>

            {/* ── Recent conversations ────────────────── */}
            <section className="epf2-section">
                <h2>Recent conversations</h2>
                <p>
                    The last few threads {specialist.name} has been in — surfaced so you can pick up a thread
                    without hunting for it.
                </p>
                <div className="epf2-empty">
                    <strong>No recent conversations with {specialist.name} yet.</strong>
                    <span>
                        Conversation persistence ships with the chat runtime. Once it lands, the last five
                        threads {specialist.name} has been in will list here with their decisions.
                    </span>
                </div>
            </section>
        </div>
    )
}

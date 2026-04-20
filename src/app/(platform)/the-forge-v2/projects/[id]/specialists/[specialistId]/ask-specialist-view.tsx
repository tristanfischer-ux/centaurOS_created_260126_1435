/**
 * AskSpecialistView — Ask-Specialist artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-ASK-SPECIALIST.html. Scoped CSS under `.as2` keeps the
 * styling isolated. Structure top-to-bottom mirrors the mockup:
 *
 *   1. Breadcrumb — Forge › {project} › Specialists › {Name}
 *   2. Page header — avatar + title-dot + title + model/voice chip
 *   3. Subtitle — tagline
 *   4. Annotation band
 *   5. Two-column grid:
 *      Left (main card):
 *        - chat head (name · title · status)
 *        - scope bar (auto-filled from project context)
 *        - identity card (expertise pills + philosophy quote)
 *        - honest "conversation history ships next round" empty state
 *        - compose box (disabled textarea + suggestions + send)
 *      Right (side):
 *        - "What {Name} can see" — static list
 *        - "This session" — honest zeros (persistence ships later)
 *
 * Every interactive control is disabled for V1. No fabricated quotes or
 * fabricated conversation history.
 */

"use client"

import Link from "next/link"
import "./ask-specialist-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface AskSpecialistViewProps {
    project: {
        id: string
        name: string
    }
    specialist: {
        id: string
        name: string
        title: string
        tagline: string | null
        description: string | null
        highlights: string[]
        philosophy: string | null
        initials: string
        modelTier: string
        voiceScore: number | null
    }
    context: {
        moduleCount: number
        failureModeCount: number
        unknownCount: number
    }
    /** Pre-filled question suggestions tailored to the specialist. */
    suggestions: string[]
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

// ─── View ───────────────────────────────────────────────────────────────

export function AskSpecialistView(props: AskSpecialistViewProps): React.ReactElement {
    const { project, specialist, context, suggestions } = props
    const base = `/the-forge-v2/projects/${project.id}`

    const placeholder = `Ask ${specialist.name} about this project`
    const modelLabel = formatModelLabel(specialist.modelTier)
    const voiceLabel = specialist.voiceScore != null ? specialist.voiceScore.toFixed(2) : "—"

    return (
        <div className="as2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="as2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={`${base}/specialists`}>Specialists</Link>
                <span className="sep">›</span>
                <span className="current">{specialist.name}</span>
            </div>

            {/* ── Page header ─────────────────────────── */}
            <div className="as2-page-header">
                <div>
                    <h1>
                        <span className="as2-title-dot" aria-hidden="true" />
                        <span className="as2-avatar" aria-hidden="true">{specialist.initials}</span>
                        Ask {specialist.name} · {specialist.title}
                        <span className="as2-model-chip" title="Model + voice consistency score from the baseline rubric">
                            <span className="dot" aria-hidden="true" />
                            {modelLabel} · Voice {voiceLabel}
                        </span>
                    </h1>
                    <div className="sub">
                        {specialist.tagline ?? "—"}
                    </div>
                </div>
            </div>

            <div className="as2-annot">
                <strong>Note</strong>
                Every &ldquo;Ask&rdquo; button across the project opens this scoped chat. The specialist already
                knows you&rsquo;re on {project.name} — brief, modules, BOM and cost posture are pre-loaded.
                Conversation history and live replies ship next round.
            </div>

            <div className="as2-grid">

                {/* ── Main column ─────────────────────── */}
                <div className="as2-main">
                    <div className="as2-head">
                        <div className="av" aria-hidden="true">{specialist.initials}</div>
                        <div className="who">
                            <div className="name">{specialist.name} · {specialist.title}</div>
                            <div className="role">{specialist.description ?? "—"}</div>
                        </div>
                        <div className="status" title="Replies ship with the conversation runtime">
                            <span className="dot" aria-hidden="true" /> Offline — read-only
                        </div>
                    </div>

                    <div className="as2-scope">
                        Scope: <span className="chip">{project.name}</span> · context:{" "}
                        <span className="chip">{context.moduleCount} module{context.moduleCount === 1 ? "" : "s"}</span>
                        {" · "}
                        <span className="chip">{context.unknownCount} open unknown{context.unknownCount === 1 ? "" : "s"}</span>
                        {" · "}
                        <span className="chip">{context.failureModeCount} failure mode{context.failureModeCount === 1 ? "" : "s"}</span>
                    </div>

                    <div className="as2-identity">
                        <p className="lede">
                            <strong>{specialist.name}</strong> — {specialist.tagline ?? "—"}
                        </p>

                        <span className="label">Expertise</span>
                        <div className="pills">
                            {specialist.highlights.length === 0 ? (
                                <span className="pill">—</span>
                            ) : (
                                specialist.highlights.map((h) => (
                                    <span key={h} className="pill">{h}</span>
                                ))
                            )}
                        </div>

                        <span className="label">How {specialist.name} thinks</span>
                        <blockquote>
                            {specialist.philosophy ?? "—"}
                        </blockquote>
                    </div>

                    <div className="as2-stream">
                        <div className="as2-stream-empty">
                            <strong>Conversation history ships next round.</strong>
                            <span>
                                This page is the scoped entry point — specialist replies, tool calls and grounding
                                chips arrive when the chat runtime lands. The question box below is read-only for now.
                            </span>
                        </div>
                    </div>

                    <div className="as2-input">
                        <div className="as2-input-box">
                            <textarea
                                placeholder={placeholder}
                                aria-label={`Ask ${specialist.name} a question`}
                                disabled
                            />
                            <div className="as2-input-actions">
                                <div className="suggestions">
                                    {suggestions.map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            className="as2-suggestion"
                                            disabled
                                            title="Suggestions become one-tap questions when the chat runtime lands"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="as2-send"
                                    disabled
                                    aria-label="Send question"
                                    title="Send ships with the chat runtime"
                                >
                                    Send →
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Side column ─────────────────────── */}
                <div className="as2-side">
                    <div className="as2-side-card">
                        <h4>What {specialist.name} can see</h4>
                        <div className="see-list">
                            <div><span className="tick">✓</span>Current brief &amp; design revision</div>
                            <div><span className="tick">✓</span>{context.moduleCount} module{context.moduleCount === 1 ? "" : "s"} + interfaces</div>
                            <div><span className="tick">✓</span>BOM key parts &amp; cost rollup</div>
                            <div><span className="tick">✓</span>{context.failureModeCount} failure mode{context.failureModeCount === 1 ? "" : "s"} + {context.unknownCount} open question{context.unknownCount === 1 ? "" : "s"}</div>
                            <div><span className="tick">✓</span>Supplier shortlist &amp; scorecards</div>
                            <div><span className="tick">✓</span>This conversation (when it starts)</div>
                        </div>
                    </div>

                    <div className="as2-side-card">
                        <h4>This session</h4>
                        <div className="row"><div className="k">Messages</div><div className="v">0</div></div>
                        <div className="row"><div className="k">Tools called</div><div className="v">0</div></div>
                        <div className="row"><div className="k">Cost</div><div className="v">£0.00</div></div>
                    </div>

                    <div className="as2-side-card">
                        <h4>Recent with {specialist.name}</h4>
                        <div className="as2-history-empty">
                            No prior conversations with {specialist.name} on {project.name} yet. Once the chat runtime
                            lands, this panel lists the last decisions threaded through {specialist.name}.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

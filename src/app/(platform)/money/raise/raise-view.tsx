/**
 * RaiseView — Money · Raise landing page (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-RAISE.html. Scoped CSS under `.rse2` keeps styling
 * isolated to this page.
 *
 * Sections (top to bottom, following the mockup):
 *   1. Breadcrumb + "Generate investor update" CTA
 *   2. Round header (only when a round exists) — target / committed /
 *      verbal / avg cheque / weeks-to-close + progress bar
 *   3. Specialist CTA (Fiona) — disabled & honest when Pitch Prep doesn't
 *      yet exist for this foundry
 *   4. Kanban pipeline — 7 stages; empty columns get a dashed placeholder
 *   5. Next actions + Pitch readiness row — honest empty state when
 *      neither task queue nor pitch_prep_section has any rows
 *   6. Generate-investor-update card (deferred surface link)
 *   7. Add-investors directory filter — shown only when a thesis exists;
 *      no fabricated firm list rendered
 *
 * Empty-state policy (CRITICAL):
 *   - No active round → render `RoundEmptyState` only, CTA to
 *     /money/raise/rounds/new
 *   - Active round but 0 pipeline cards → render empty kanban with
 *     "Add your first investor" CTA inside the first (Target) column
 *   - No thesis → Fiona CTA + Directory block render as "Set your thesis
 *     first" links to /money/raise/thesis
 *   - NEVER fabricate investor names, firms, cheque sizes, or stages
 */

"use client"

import Link from "next/link"
import { useMemo } from "react"

import "./raise-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface RaiseActiveRound {
    id: string
    name: string
    /** pre_seed | seed | series_a | ... */
    stage: string
    /** Amount in pence. */
    targetCents: number
    /** "GBP" / "USD". */
    currency: string
    /** ISO date, YYYY-MM-DD. */
    closeDateIso: string
    /** safe_pre / safe_post / priced / convertible / asa. */
    instrument: string
    /** Cap in pence for SAFE-like instruments. Null otherwise. */
    capCents: number | null
    /** Percentage discount for SAFE-like instruments. Null otherwise. */
    discountPct: number | null
    /** draft | active | closing | closed | archived. */
    state: string
}

export interface RaisePipelineCard {
    /** investor_pipeline_state.id — stable key and drill target. */
    id: string
    /** current_stage value. One of the 8 enumerated stages. */
    stage: string
    /** Firm display name from marketplace_listings.title. Null when no listing resolves. */
    firmName: string | null
    /** "City · Country" from marketplace_listings. Null when missing. */
    firmLocation: string | null
    /** Commit amount in pence — only populated once a row reaches verbal/closed. */
    commitCents: number | null
    /** 0..100 probability. Null when unset. */
    probabilityPct: number | null
    /** lead / co_lead / follower / undecided. Null when not recorded. */
    leadRole: string | null
    /** ISO timestamp row entered current stage (for "since" text). */
    stageEnteredAtIso: string
    /** Cached thesis match score. Null when never computed for this row. */
    matchScoreCached: number | null
}

export interface RaiseThesisSummary {
    id: string
    version: number
    stageTags: string[]
    sectorTags: string[]
    geography: string[]
}

export interface RaiseViewProps {
    round: RaiseActiveRound | null
    pipeline: RaisePipelineCard[]
    thesis: RaiseThesisSummary | null
}

// ─── Static maps ────────────────────────────────────────────────────────

const STAGE_META: ReadonlyArray<{
    key: string
    label: string
    colKey: string
}> = [
    { key: "target", label: "Target", colKey: "target" },
    { key: "researching", label: "Researching", colKey: "research" },
    { key: "contacted", label: "Contacted", colKey: "contacted" },
    { key: "meeting", label: "Meeting", colKey: "meeting" },
    { key: "due_diligence", label: "Due diligence", colKey: "dd" },
    { key: "verbal", label: "Verbal", colKey: "commit" },
    { key: "closed", label: "Closed", colKey: "closed" },
]

// ─── Helpers ────────────────────────────────────────────────────────────

function formatMoney(cents: number | null, currency: string): string {
    if (cents == null) return "—"
    const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£"
    const pounds = cents / 100
    if (pounds >= 1_000_000) return `${symbol}${(pounds / 1_000_000).toFixed(pounds % 1_000_000 === 0 ? 0 : 1)}m`
    if (pounds >= 1_000) return `${symbol}${Math.round(pounds / 1_000)}k`
    return `${symbol}${Math.round(pounds)}`
}

function weeksBetween(now: Date, iso: string): number {
    const ms = new Date(iso).getTime() - now.getTime()
    return Math.round(ms / (7 * 24 * 60 * 60 * 1000))
}

function formatInstrument(r: RaiseActiveRound): string {
    switch (r.instrument) {
        case "safe_post":
        case "safe_pre":
            return r.capCents != null
                ? `SAFE · ${formatMoney(r.capCents, r.currency)} cap`
                : "SAFE"
        case "priced":
            return "Priced equity"
        case "convertible":
            return "Convertible"
        case "asa":
            return "ASA"
        default:
            return r.instrument
    }
}

// ─── View ───────────────────────────────────────────────────────────────

export function RaiseView(props: RaiseViewProps): React.ReactElement {
    const { round, pipeline, thesis } = props

    // ── Aggregations over pipeline rows ──
    const byStage = useMemo(() => {
        const buckets = new Map<string, RaisePipelineCard[]>()
        for (const card of pipeline) {
            const list = buckets.get(card.stage) ?? []
            list.push(card)
            buckets.set(card.stage, list)
        }
        return buckets
    }, [pipeline])

    const verbalCents = useMemo(
        () =>
            pipeline
                .filter((c) => c.stage === "verbal")
                .reduce((sum, c) => sum + (c.commitCents ?? 0), 0),
        [pipeline],
    )
    const closedCents = useMemo(
        () =>
            pipeline
                .filter((c) => c.stage === "closed")
                .reduce((sum, c) => sum + (c.commitCents ?? 0), 0),
        [pipeline],
    )

    const totalLive = pipeline.filter((c) => c.stage !== "passed").length

    return (
        <div className="rse2">
            {/* ── Breadcrumb ───────────────────────── */}
            <div className="rse2-page-head">
                <div className="rse2-crumbs">
                    <Link href="/money">Money</Link>
                    <span className="sep">›</span>
                    <span className="current">
                        <span className="rse2-title-dot" aria-hidden="true" />
                        Raise
                    </span>
                </div>
                <div className="rse2-ctx">
                    {round ? (
                        <span className="rse2-btn soon" title="Investor update composer lands with Pitch Prep">
                            Generate investor update
                        </span>
                    ) : null}
                </div>
            </div>

            {/* ── No active round → empty state ──────────── */}
            {!round ? (
                <RoundEmptyState />
            ) : (
                <>
                    {/* ── Round header ─────────────────────────── */}
                    <RoundHeader
                        round={round}
                        verbalCents={verbalCents}
                        closedCents={closedCents}
                        liveCount={totalLive}
                    />

                    {/* ── Fiona specialist CTA (disabled honest) ─── */}
                    <FionaCta thesis={thesis} />

                    {/* ── Kanban ───────────────────────────────── */}
                    <div className="rse2-kanban-wrap">
                        <div className="rse2-kanban-head">
                            <h3>
                                Investor pipeline · {totalLive}{" "}
                                {totalLive === 1 ? "in play" : "in play"}
                            </h3>
                            {pipeline.length > 0 && (
                                <span className="rse2-sub">
                                    Sorted by stage entered (most recent first)
                                </span>
                            )}
                        </div>

                        <div className="rse2-kanban">
                            {STAGE_META.map((stage, idx) => {
                                const cards = byStage.get(stage.key) ?? []
                                const isFirstEmpty =
                                    idx === 0 && pipeline.length === 0
                                return (
                                    <div
                                        key={stage.key}
                                        className={`rse2-kb-col rse2-kb-${stage.colKey}`}
                                    >
                                        <div className="rse2-kb-head">
                                            <h4>{stage.label}</h4>
                                            <span className="count">{cards.length}</span>
                                        </div>
                                        {cards.length === 0 ? (
                                            <div className="rse2-kb-empty">
                                                {isFirstEmpty ? (
                                                    <Link
                                                        href="/money/raise/thesis"
                                                        className="rse2-btn primary sm"
                                                    >
                                                        Add your first investor
                                                    </Link>
                                                ) : (
                                                    <span>No one here yet</span>
                                                )}
                                            </div>
                                        ) : (
                                            cards.map((card) => (
                                                <InvestorCard
                                                    key={card.id}
                                                    card={card}
                                                    currency={round.currency}
                                                />
                                            ))
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* ── Next actions + Pitch readiness row ─── */}
                    <div className="rse2-row">
                        <NextActionsCard pipelineCount={totalLive} />
                        <PitchReadinessCard />
                    </div>

                    {/* ── Board pack / Generate update card ───── */}
                    <div className="rse2-board-card">
                        <div>
                            <h3>Generate investor update</h3>
                            <p>
                                Pull runway, burn, and pipeline progress into a monthly
                                update that I can send to existing backers and warm
                                leads. <strong>Lands with Pitch Prep.</strong>
                            </p>
                        </div>
                        <span className="rse2-btn soon lg">Coming with Pitch Prep</span>
                    </div>

                    {/* ── Directory (thesis-driven) ─────────── */}
                    <DirectoryBlock thesis={thesis} />
                </>
            )}
        </div>
    )
}

// ─── Sub-components ─────────────────────────────────────────────────────

function RoundEmptyState(): React.ReactElement {
    return (
        <div className="rse2-empty-state">
            <div className="rse2-empty-icon" aria-hidden="true">
                ◎
            </div>
            <h2>No active round yet</h2>
            <p>
                A round is the container for the investors I&apos;m pitching this
                quarter — target amount, instrument, close date, kanban progress.
                Create one and the pipeline opens up.
            </p>
            <div className="rse2-empty-actions">
                <Link
                    href="/money/raise/rounds/new"
                    className="rse2-btn primary lg"
                >
                    Create a round
                </Link>
                <Link href="/money/raise/thesis" className="rse2-btn lg">
                    Set investor thesis first
                </Link>
            </div>
            <p className="rse2-empty-foot">
                Or browse <Link href="/money/raise/portfolio">portfolio</Link> if
                you&apos;ve already closed a round.
            </p>
        </div>
    )
}

function RoundHeader(props: {
    round: RaiseActiveRound
    verbalCents: number
    closedCents: number
    liveCount: number
}): React.ReactElement {
    const { round, verbalCents, closedCents } = props
    const committedPct =
        round.targetCents > 0
            ? Math.min(100, (closedCents / round.targetCents) * 100)
            : 0
    const verbalPct =
        round.targetCents > 0
            ? Math.min(100 - committedPct, (verbalCents / round.targetCents) * 100)
            : 0
    const weeks = weeksBetween(new Date(), round.closeDateIso)

    return (
        <div className="rse2-round-head">
            <div className="rse2-rh-top">
                <div>
                    <div className="rse2-rh-kicker">Active round</div>
                    <h1>
                        {round.name}{" "}
                        <small>{formatInstrument(round)}</small>
                    </h1>
                </div>
                <div className="rse2-rh-right">
                    <Link
                        href="/money/raise/rounds"
                        className="rse2-btn sm"
                    >
                        Edit round
                    </Link>
                </div>
            </div>

            <div className="rse2-round-stats">
                <div className="rs">
                    <div className="lab">Target</div>
                    <div className="val">
                        {formatMoney(round.targetCents, round.currency)}
                    </div>
                    <div className="sub">{formatInstrument(round)}</div>
                </div>
                <div className="rs">
                    <div className="lab">Committed</div>
                    <div className="val">
                        {formatMoney(closedCents, round.currency)}
                        {round.targetCents > 0 && (
                            <small>
                                {" "}
                                / {Math.round((closedCents / round.targetCents) * 100)}%
                            </small>
                        )}
                    </div>
                    <div className="sub">
                        {closedCents > 0 ? "signed" : "nothing signed yet"}
                    </div>
                </div>
                <div className="rs">
                    <div className="lab">Verbal</div>
                    <div className="val">
                        {formatMoney(verbalCents, round.currency)}
                        {round.targetCents > 0 && verbalCents > 0 && (
                            <small>
                                {" "}
                                / {Math.round((verbalCents / round.targetCents) * 100)}%
                            </small>
                        )}
                    </div>
                    <div className="sub">
                        {verbalCents > 0 ? "handshakes" : "no verbal commits yet"}
                    </div>
                </div>
                <div className="rs">
                    <div className="lab">Close date</div>
                    <div className="val">
                        {new Date(round.closeDateIso).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                        })}
                    </div>
                    <div className="sub">
                        {weeks >= 0
                            ? `${weeks} weeks away`
                            : `${Math.abs(weeks)} weeks overdue`}
                    </div>
                </div>
                <div className="rs">
                    <div className="lab">Weeks to close</div>
                    <div className="val">{Math.max(0, weeks)}</div>
                    <div className="sub">
                        Target: {new Date(round.closeDateIso).toLocaleDateString("en-GB")}
                    </div>
                </div>
            </div>

            <div className="rse2-round-prog">
                <div className="bar">
                    <div
                        className="fill"
                        style={{ width: `${committedPct}%` }}
                        aria-label={`${Math.round(committedPct)}% committed`}
                    />
                    <div
                        className="verbal"
                        style={{ left: `${committedPct}%`, width: `${verbalPct}%` }}
                        aria-label={`${Math.round(verbalPct)}% verbal`}
                    />
                </div>
                <div className="legend">
                    <span>
                        <strong>{formatMoney(closedCents, round.currency)}</strong>{" "}
                        committed ·{" "}
                        <strong>{formatMoney(verbalCents, round.currency)}</strong>{" "}
                        verbal ·{" "}
                        <strong>
                            {formatMoney(
                                Math.max(
                                    0,
                                    round.targetCents - closedCents - verbalCents,
                                ),
                                round.currency,
                            )}
                        </strong>{" "}
                        to raise
                    </span>
                    <span>
                        of {formatMoney(round.targetCents, round.currency)} target
                    </span>
                </div>
            </div>
        </div>
    )
}

function FionaCta(props: { thesis: RaiseThesisSummary | null }): React.ReactElement {
    const { thesis } = props
    if (!thesis) {
        return (
            <div className="rse2-specialist rse2-fiona">
                <div className="rse2-avatar">FI</div>
                <div className="msg">
                    <strong>Fundraise specialist · waiting for thesis</strong> ·
                    Once I set my investor thesis, Fiona can suggest matches and draft
                    first-touch emails.
                </div>
                <Link href="/money/raise/thesis" className="rse2-btn">
                    Set thesis
                </Link>
            </div>
        )
    }
    return (
        <div className="rse2-specialist rse2-fiona">
            <div className="rse2-avatar">FI</div>
            <div className="msg">
                <strong>Fundraise · ready when you are</strong> · Thesis v
                {thesis.version} is live. Drop investors into the pipeline and Fiona
                briefs them before each touch.
            </div>
            <Link href="/money/raise/thesis" className="rse2-btn">
                Review thesis
            </Link>
        </div>
    )
}

function InvestorCard(props: {
    card: RaisePipelineCard
    currency: string
}): React.ReactElement {
    const { card, currency } = props
    const displayName = card.firmName ?? "Unnamed investor"
    return (
        <Link
            href={`/money/raise/investors/${card.id}`}
            className="rse2-kb-card"
            aria-label={`Open investor ${displayName}`}
        >
            <div className="name">{displayName}</div>
            {card.firmLocation && <div className="firm">{card.firmLocation}</div>}
            <div className="meta">
                {card.commitCents != null ? (
                    <span className="cheque">
                        {formatMoney(card.commitCents, currency)}
                    </span>
                ) : (
                    <span className="cheque muted">Cheque not set</span>
                )}
                {card.matchScoreCached != null ? (
                    <span className="match">{card.matchScoreCached}%</span>
                ) : null}
            </div>
        </Link>
    )
}

function NextActionsCard(props: { pipelineCount: number }): React.ReactElement {
    if (props.pipelineCount === 0) {
        return (
            <div className="rse2-card">
                <h3>This week</h3>
                <div className="rse2-empty-inline">
                    <p>
                        No actions queued. Once I add investors and log touches, Fiona
                        will surface overdue follow-ups and open asks here.
                    </p>
                </div>
            </div>
        )
    }
    // Real task-queue wiring lands with a dedicated money-raise.ts action —
    // honest empty message until then.
    return (
        <div className="rse2-card">
            <h3>This week</h3>
            <div className="rse2-empty-inline">
                <p>
                    Touch-logging and follow-up tracking ship next round — I&apos;ll
                    surface overdue asks and commitments here once that lands.
                </p>
            </div>
        </div>
    )
}

function PitchReadinessCard(): React.ReactElement {
    return (
        <div className="rse2-card">
            <div className="rse2-pitch-head">
                <h3>Pitch readiness</h3>
                <span className="score muted">Lands with Pitch Prep</span>
            </div>
            <div className="rse2-empty-inline">
                <p>
                    Pitch Prep tracks the eight sections of the deck (company, market,
                    problem, traction, team, ask, financial model, cap table).
                    It&apos;s on the Money V2 roadmap — this card wires up then.
                </p>
            </div>
        </div>
    )
}

function DirectoryBlock(props: { thesis: RaiseThesisSummary | null }): React.ReactElement {
    if (!props.thesis) {
        return (
            <div className="rse2-directory">
                <div className="rse2-directory-head">
                    <h3>Add investors to pipeline</h3>
                    <span className="sub">
                        Set a thesis first — no investors are matched until I do.
                    </span>
                </div>
                <div className="rse2-empty-inline">
                    <p>
                        Investor matches run from a stated thesis (stage / sector /
                        cheque band / geography). Set one to see which firms in the
                        directory fit.
                    </p>
                    <Link href="/money/raise/thesis" className="rse2-btn primary">
                        Set investor thesis
                    </Link>
                </div>
            </div>
        )
    }
    return (
        <div className="rse2-directory">
            <div className="rse2-directory-head">
                <h3>Add investors to pipeline</h3>
                <span className="sub">
                    Thesis v{props.thesis.version} ·{" "}
                    <Link href="/money/raise/thesis">Edit thesis</Link>
                </span>
            </div>
            <div className="rse2-empty-inline">
                <p>
                    The directory surface (matches + filters) lands with the match
                    engine — until then, add investors manually from the thesis page
                    or via the pipeline kanban.
                </p>
                <Link href="/money/raise/thesis" className="rse2-btn">
                    Open thesis
                </Link>
            </div>
        </div>
    )
}


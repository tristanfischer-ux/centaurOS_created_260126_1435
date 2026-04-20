/**
 * InvestorDetailView — Money · Raise · Investor detail drill (V2).
 *
 * Port of MONEY-MOCKUP-INVESTOR-DETAIL.html. Scoped CSS under `.ind2`.
 *
 * Sections:
 *   1. Breadcrumb + action buttons (trigger the three action modals)
 *   2. Investor header (avatar, name, stage pill, firm location, chips)
 *   3. Stage stepper (7 stages)
 *   4. Left column — relationship history (events) + firm research
 *   5. Right rail — key facts, matching signal, linked surfaces, contacts
 *
 * Honesty policy:
 *   - Name resolves to marketplace_listings.title or "Unnamed investor"
 *   - Firm research reads only real description + website_url + city/country
 *   - No fabricated fund sizes / investment histories / decision processes
 *   - Relationship history empty → "No touches logged yet" inline state
 *   - Warm-intro, pre-brief, and per-firm recent-investments render only
 *     when captured in the DB (not today → render honest placeholders)
 */

"use client"

import Link from "next/link"
import { useState } from "react"

import "../../raise-v2.css"
import "./investor-detail-v2.css"

import {
    LogTouchModal,
    PassInvestorModal,
    PipelineMoveModal,
    type ModalInvestor,
} from "../../action-modals"

// ─── Types ──────────────────────────────────────────────────────────────

export interface InvestorDetailPipelineRow {
    id: string
    currentStage: string
    stageEnteredAtIso: string
    commitCents: number | null
    probabilityPct: number | null
    leadRole: string | null
    passReason: string | null
    marketplaceListingId: string | null
    investorFirmId: string | null
    investorPersonId: string | null
    warmIntroViaUserId: string | null
    matchScoreCached: number | null
    roundCurrency: string
    roundName: string | null
    roundId: string | null
}

export interface InvestorDetailFirm {
    id: string
    title: string
    city: string | null
    country: string | null
    countryIso: string | null
    description: string | null
    websiteUrl: string | null
    contactName: string | null
    contactTitle: string | null
    contactEmail: string | null
    contactLinkedin: string | null
}

export interface InvestorDetailEvent {
    id: string
    eventType: string
    fromStage: string | null
    toStage: string | null
    payload: unknown
    actorUserId: string | null
    backdatedToIso: string | null
    createdAtIso: string
}

export interface InvestorDetailViewProps {
    row: InvestorDetailPipelineRow
    firm: InvestorDetailFirm | null
    events: InvestorDetailEvent[]
}

// ─── Static maps ────────────────────────────────────────────────────────

const STAGES: ReadonlyArray<{ key: string; label: string; step: string }> = [
    { key: "target", label: "Target", step: "01" },
    { key: "researching", label: "Researching", step: "02" },
    { key: "contacted", label: "Contacted", step: "03" },
    { key: "meeting", label: "Meeting", step: "04" },
    { key: "due_diligence", label: "Due diligence", step: "05" },
    { key: "verbal", label: "Verbal", step: "06" },
    { key: "closed", label: "Closed", step: "07" },
]

// ─── Helpers ────────────────────────────────────────────────────────────

function initials(name: string): string {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "??"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
}

function formatMoney(cents: number | null, currency: string): string {
    if (cents == null) return "—"
    const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£"
    const pounds = cents / 100
    if (pounds >= 1_000_000)
        return `${symbol}${(pounds / 1_000_000).toFixed(pounds % 1_000_000 === 0 ? 0 : 1)}m`
    if (pounds >= 1_000) return `${symbol}${Math.round(pounds / 1_000)}k`
    return `${symbol}${Math.round(pounds)}`
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
    })
}

function humanEventLabel(e: InvestorDetailEvent): string {
    switch (e.eventType) {
        case "stage_move":
            return `Stage: ${formatStageName(e.fromStage)} → ${formatStageName(e.toStage)}`
        case "touch_logged":
            return "Touch logged"
        case "pass":
            return "Marked as passed"
        case "reopen":
            return "Reopened"
        case "note_added":
            return "Note added"
        case "doc_shared":
            return "Document shared"
        default:
            return e.eventType
    }
}

function formatStageName(stage: string | null): string {
    if (!stage) return "—"
    const found = STAGES.find((s) => s.key === stage)
    return found ? found.label : stage
}

function stageIndex(stage: string): number {
    return STAGES.findIndex((s) => s.key === stage)
}

// ─── View ───────────────────────────────────────────────────────────────

export function InvestorDetailView(
    props: InvestorDetailViewProps,
): React.ReactElement {
    const { row, firm, events } = props

    const displayName = firm?.title ?? "Unnamed investor"
    const currentIndex = stageIndex(row.currentStage)
    const isPassed = row.currentStage === "passed"

    const [openModal, setOpenModal] = useState<
        null | "move" | "pass" | "touch"
    >(null)

    const modalInvestor: ModalInvestor = {
        id: row.id,
        displayName,
        currentStage: row.currentStage,
    }

    const location = [firm?.city, firm?.country].filter(Boolean).join(" · ")

    return (
        <div className="rse2 ind2">
            {/* ── Breadcrumb + action buttons ────────── */}
            <div className="rse2-page-head">
                <div className="rse2-crumbs">
                    <Link href="/money">Money</Link>
                    <span className="sep">›</span>
                    <Link href="/money/raise">Raise</Link>
                    <span className="sep">›</span>
                    <span className="current">
                        <span className="rse2-title-dot" aria-hidden="true" />
                        {displayName}
                    </span>
                </div>
                <div className="rse2-ctx">
                    <button
                        type="button"
                        className="rse2-btn sm"
                        onClick={() => setOpenModal("move")}
                        disabled={isPassed}
                    >
                        Move stage
                    </button>
                    <button
                        type="button"
                        className="rse2-btn sm"
                        onClick={() => setOpenModal("pass")}
                        disabled={isPassed}
                    >
                        Mark passed
                    </button>
                    <button
                        type="button"
                        className="rse2-btn sm primary"
                        onClick={() => setOpenModal("touch")}
                    >
                        Log touch
                    </button>
                </div>
            </div>

            {/* ── Investor header ────────────────────── */}
            <div className="ind2-head">
                <div className="ind2-avatar">{initials(displayName)}</div>
                <div className="ind2-head-main">
                    <h1>
                        {displayName}
                        <StagePill stage={row.currentStage} />
                    </h1>
                    <div className="firm">
                        {firm
                            ? [
                                  firm.contactTitle,
                                  location || null,
                              ]
                                  .filter(Boolean)
                                  .join(" · ") || "No firm details captured yet"
                            : "Firm not yet linked to the marketplace directory"}
                    </div>
                    <div className="chips">
                        {row.commitCents != null && (
                            <span className="chip brand">
                                {formatMoney(row.commitCents, row.roundCurrency)} target
                                cheque
                            </span>
                        )}
                        {row.roundName && (
                            <span className="chip">Round · {row.roundName}</span>
                        )}
                        {row.leadRole && (
                            <span className="chip">
                                Role · {formatLeadRole(row.leadRole)}
                            </span>
                        )}
                        {row.matchScoreCached != null && (
                            <span className="chip success">
                                {row.matchScoreCached}% thesis match
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Stage stepper ──────────────────────── */}
            {!isPassed && (
                <div className="ind2-stage-strip">
                    {STAGES.map((s, idx) => {
                        const cls =
                            idx < currentIndex
                                ? "done"
                                : idx === currentIndex
                                  ? "active"
                                  : ""
                        return (
                            <div
                                key={s.key}
                                className={`ind2-stage-step ${cls}`}
                            >
                                <small>{s.step}</small>
                                {s.label}
                            </div>
                        )
                    })}
                </div>
            )}

            {isPassed && (
                <div className="ind2-passed-banner">
                    <strong>Passed.</strong>{" "}
                    {row.passReason
                        ? `Reason logged: ${row.passReason.replace(/_/g, " ")}.`
                        : "No reason captured — open the pass flow to add one."}
                </div>
            )}

            {/* ── Split: left = history + research, right = rail ── */}
            <div className="ind2-split">
                <div>
                    <HistoryCard events={events} />
                    <ResearchCard firm={firm} />
                </div>
                <div>
                    <KeyFactsCard row={row} firm={firm} />
                    <MatchSignalCard row={row} firm={firm} />
                    <LinkedCard row={row} />
                    <ContactsCard firm={firm} />
                </div>
            </div>

            {/* ── Modals ─────────────────────────────── */}
            {openModal === "move" && (
                <PipelineMoveModal
                    investor={modalInvestor}
                    onClose={() => setOpenModal(null)}
                />
            )}
            {openModal === "pass" && (
                <PassInvestorModal
                    investor={modalInvestor}
                    onClose={() => setOpenModal(null)}
                />
            )}
            {openModal === "touch" && (
                <LogTouchModal
                    investor={modalInvestor}
                    onClose={() => setOpenModal(null)}
                />
            )}
        </div>
    )
}

// ─── Sub-components ─────────────────────────────────────────────────────

function StagePill(props: { stage: string }): React.ReactElement {
    const label = formatStageName(props.stage) || props.stage
    const cls =
        props.stage === "closed"
            ? "success"
            : props.stage === "passed"
              ? "danger"
              : "brand"
    return <span className={`ind2-stage-pill ${cls}`}>{label}</span>
}

function formatLeadRole(role: string): string {
    return role.replace(/_/g, " ")
}

function HistoryCard(props: {
    events: InvestorDetailEvent[]
}): React.ReactElement {
    const { events } = props
    return (
        <div className="ind2-activity">
            <h3>Relationship history · {events.length} event{events.length === 1 ? "" : "s"}</h3>
            {events.length === 0 ? (
                <div className="ind2-empty-inline">
                    No touches logged yet. Use <strong>Log touch</strong> above to
                    capture the first email, call, or meeting — every touch lands
                    on this timeline and feeds Fiona&apos;s next pre-brief.
                </div>
            ) : (
                events.map((e) => (
                    <div key={e.id} className="ind2-act-row">
                        <div className="when">{formatDate(e.createdAtIso)}</div>
                        <div className="what">
                            <strong>{humanEventLabel(e)}</strong>
                            <EventPayload payload={e.payload} />
                        </div>
                    </div>
                ))
            )}
        </div>
    )
}

function EventPayload(props: { payload: unknown }): React.ReactNode {
    if (!props.payload || typeof props.payload !== "object") return null
    const p = props.payload as Record<string, unknown>
    const notes = typeof p.notes === "string" ? p.notes : null
    const quote = typeof p.quote === "string" ? p.quote : null
    const amount = typeof p.amount_cents === "number" ? p.amount_cents : null
    return (
        <>
            {amount != null && (
                <span className="who">
                    Amount logged: {formatMoney(amount, "GBP")}
                </span>
            )}
            {notes && <span className="who">{notes.slice(0, 180)}</span>}
            {quote && <blockquote>{quote}</blockquote>}
        </>
    )
}

function ResearchCard(props: {
    firm: InvestorDetailFirm | null
}): React.ReactElement {
    const { firm } = props
    if (!firm) {
        return (
            <div className="ind2-research">
                <h3>Firm research</h3>
                <div className="ind2-empty-inline">
                    This pipeline row isn&apos;t linked to a marketplace directory
                    entry. Firm thesis, recent investments, decision process, and
                    known friction points surface here once linked.
                </div>
            </div>
        )
    }
    return (
        <div className="ind2-research">
            <h3>
                Firm research · {firm.title}
                {firm.websiteUrl && (
                    <span className="sub">
                        <a
                            href={firm.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {cleanHost(firm.websiteUrl)} ↗
                        </a>
                    </span>
                )}
            </h3>
            {firm.description ? (
                <div className="ind2-research-section">
                    <div className="lab">Directory description</div>
                    <div>{firm.description}</div>
                </div>
            ) : (
                <div className="ind2-research-section">
                    <div className="lab">Directory description</div>
                    <div className="muted">Not yet captured.</div>
                </div>
            )}
            <div className="ind2-research-section">
                <div className="lab">Thesis</div>
                <div className="muted">
                    Not yet captured. Firm thesis tracking lands with the thesis
                    engine.
                </div>
            </div>
            <div className="ind2-research-section">
                <div className="lab">Recent investments</div>
                <div className="muted">
                    Not yet captured. Portfolio sync lands with the investor
                    directory enrichment job.
                </div>
            </div>
            <div className="ind2-research-section">
                <div className="lab">Decision process</div>
                <div className="muted">
                    Not yet captured. Add notes via the Log touch flow to record
                    process details.
                </div>
            </div>
            <div className="ind2-research-section">
                <div className="lab">Known friction points</div>
                <div className="muted">
                    Not yet captured. Fiona surfaces friction points once she has
                    3+ logged touches with this firm.
                </div>
            </div>
        </div>
    )
}

function cleanHost(url: string): string {
    try {
        return new URL(url).host.replace(/^www\./, "")
    } catch {
        return url
    }
}

function KeyFactsCard(props: {
    row: InvestorDetailPipelineRow
    firm: InvestorDetailFirm | null
}): React.ReactElement {
    const { row, firm } = props
    return (
        <div className="ind2-rail">
            <div className="ind2-rail-head">Key facts</div>
            <div className="ind2-rail-body">
                <Row
                    k="This round target"
                    v={
                        row.commitCents != null
                            ? formatMoney(row.commitCents, row.roundCurrency)
                            : "Not set"
                    }
                />
                <Row
                    k="Probability"
                    v={
                        row.probabilityPct != null
                            ? `${row.probabilityPct}%`
                            : "Not set"
                    }
                />
                <Row k="Stage" v={formatStageName(row.currentStage)} />
                <Row k="Stage since" v={formatDate(row.stageEnteredAtIso)} />
                <Row
                    k="Location"
                    v={
                        firm
                            ? [firm.city, firm.country].filter(Boolean).join(" · ") ||
                              "—"
                            : "—"
                    }
                />
                <Row
                    k="Warm intro"
                    v={row.warmIntroViaUserId ? "Captured" : "No intro logged"}
                />
            </div>
        </div>
    )
}

function MatchSignalCard(props: {
    row: InvestorDetailPipelineRow
    firm: InvestorDetailFirm | null
}): React.ReactElement {
    const { row, firm } = props
    return (
        <div className="ind2-rail">
            <div className="ind2-rail-head">Matching signal</div>
            <div className="ind2-rail-body">
                {row.matchScoreCached != null ? (
                    <Row
                        k="Thesis fit"
                        v={`${row.matchScoreCached}%`}
                        vTone="brand"
                    />
                ) : (
                    <Row k="Thesis fit" v="Not yet scored" />
                )}
                <Row
                    k="Country"
                    v={firm?.countryIso ?? firm?.country ?? "—"}
                />
                <Row
                    k="Stage"
                    v={formatStageName(row.currentStage)}
                />
            </div>
        </div>
    )
}

function LinkedCard(props: {
    row: InvestorDetailPipelineRow
}): React.ReactElement {
    const { row } = props
    return (
        <div className="ind2-rail">
            <div className="ind2-rail-head">Linked</div>
            <div className="ind2-rail-body">
                <div className="ind2-rail-row">
                    <span className="k">Round</span>
                    {row.roundId ? (
                        <Link href="/money/raise" className="v brand">
                            {row.roundName ?? "Open round"}
                        </Link>
                    ) : (
                        <span className="v muted">Not in a round</span>
                    )}
                </div>
                <div className="ind2-rail-row">
                    <span className="k">Thesis</span>
                    <Link href="/money/raise/thesis" className="v brand">
                        Open thesis
                    </Link>
                </div>
                <div className="ind2-rail-row">
                    <span className="k">Pipeline</span>
                    <Link href="/money/raise" className="v brand">
                        Back to kanban
                    </Link>
                </div>
            </div>
        </div>
    )
}

function ContactsCard(props: {
    firm: InvestorDetailFirm | null
}): React.ReactElement {
    const { firm } = props
    if (!firm || !firm.contactName) {
        return (
            <div className="ind2-rail">
                <div className="ind2-rail-head">Contacts at firm</div>
                <div className="ind2-rail-body">
                    <div className="ind2-empty-inline small">
                        No contacts captured yet. Link a marketplace directory
                        entry or add a contact via the Log touch flow.
                    </div>
                </div>
            </div>
        )
    }
    return (
        <div className="ind2-rail">
            <div className="ind2-rail-head">Contacts at firm</div>
            <div className="ind2-rail-body contacts">
                <div className="ind2-contact">
                    <div className="name">{firm.contactName}</div>
                    {firm.contactTitle && (
                        <div className="title">{firm.contactTitle}</div>
                    )}
                    {firm.contactEmail && (
                        <a
                            href={`mailto:${firm.contactEmail}`}
                            className="email"
                        >
                            {firm.contactEmail}
                        </a>
                    )}
                    {firm.contactLinkedin && (
                        <a
                            href={firm.contactLinkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="linkedin"
                        >
                            LinkedIn ↗
                        </a>
                    )}
                </div>
            </div>
        </div>
    )
}

function Row(props: {
    k: string
    v: string
    vTone?: "brand" | "muted"
}): React.ReactElement {
    return (
        <div className="ind2-rail-row">
            <span className="k">{props.k}</span>
            <span className={`v ${props.vTone ?? ""}`}>{props.v}</span>
        </div>
    )
}

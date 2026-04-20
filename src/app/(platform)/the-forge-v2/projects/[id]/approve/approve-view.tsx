/**
 * ApproveView — Approval confirmation page (V2, mockup-faithful port).
 *
 * DOM ported from FORGE-MOCKUP-APPROVE.html. Generic approval flow used as the
 * confirmation surface before locking a revision, awarding a supplier, or
 * accepting a quote. The page renders:
 *
 *   1. Breadcrumb
 *   2. Page header (h1 + subtitle)
 *   3. Pattern annotation strip (top)
 *   4. Two-column grid:
 *        Left  — ApproveMain (who · ask · summary · trade-offs · specialist
 *                 recs · decision strip)
 *        Right — Sidebar stack (what-happens · costs · approval-chain ·
 *                 similar-past-decisions)
 *   5. Pattern annotation strip (bottom)
 *
 * Empty-state policy: no approval or specialist-recommendation tables exist
 * yet, so every slot that would contain real data renders an honest empty
 * state. We never synthesise the mockup's HAPS / ±0.3mm / Jian / Astra
 * content. The "Approve" button is always aria-disabled with the copy
 * "Approval mutation ships next round" in the guidance slot.
 *
 * The page accepts a `type` query param — `revision` | `award` | `quote` —
 * which toggles the header copy + summary framing. Default is `revision`.
 */

"use client"

import Link from "next/link"
import "./approve-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export type ApprovalType = "revision" | "award" | "quote"

export interface ApproveViewProps {
    project: {
        id: string
        name: string
        designRevision: number
    }
    /** Approval kind — drives the header copy + summary framing. */
    type: ApprovalType
}

// ─── View ──────────────────────────────────────────────────────────────

export function ApproveView(props: ApproveViewProps): React.ReactElement {
    const { project, type } = props

    const workspaceHref = `/the-forge-v2/projects/${project.id}`
    const briefHref = `/the-forge-v2/projects/${project.id}/brief`
    const todayHref = "/today"

    const copy = approvalCopy(type, project)

    return (
        <div className="ap2">
            {/* ── Breadcrumb ───────────────────────────────────────── */}
            <nav className="ap2-breadcrumb" aria-label="Breadcrumb">
                <Link href={todayHref}>Today</Link>
                <span className="sep">›</span>
                <Link href={workspaceHref}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">{copy.breadcrumbLeaf}</span>
            </nav>

            {/* ── Top pattern annotation ───────────────────────────── */}
            <div className="ap2-annot">
                <strong>Note</strong>
                Every Approve / Ask / Reject on Today&rsquo;s Waiting-on-you queue opens this page.
                Context is surfaced above the buttons &mdash; who asked, why it matters, what the
                trade-off looks like, what a specialist recommends. Approval is one click; Ask opens
                a scoped chat; Reject requires a reason (reasons feed the next run of decisioning).
            </div>

            {/* ── Page header ─────────────────────────────────────── */}
            <header className="ap2-page-head">
                <h1><span className="ap2-title-dot" aria-hidden="true" />{copy.h1}</h1>
                <p className="sub">{copy.subtitle}</p>
            </header>

            {/* ── Two-column grid ─────────────────────────────────── */}
            <div className="ap2-grid">
                <ApproveMain copy={copy} workspaceHref={workspaceHref} briefHref={briefHref} />
                <ApproveSidebar type={type} project={project} />
            </div>

            {/* ── Bottom pattern annotation ────────────────────────── */}
            <div className="ap2-annot" style={{ marginTop: 16, marginBottom: 0 }}>
                <strong>Note</strong>
                &ldquo;Ask&rdquo; opens the scoped specialist chat with the full context pre-loaded &mdash;
                you don&rsquo;t have to explain what you&rsquo;re asking about. &ldquo;Reject&rdquo; requires a
                reason (free text) and those reasons feed back to the specialist&rsquo;s next
                recommendation. Approval writes to the artefact spine &mdash; BOM, RFQ, CAD all
                update in one action.
            </div>
        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

interface ApprovalCopy {
    breadcrumbLeaf: string
    h1: string
    subtitle: string
    askerInitials: string
    askerLabel: string
    askTitle: string
    askBody: string
    summaryHeading: string
    approveLabel: string
    rejectLabel: string
    askButtonLabel: string
}

function ApproveMain({
    copy,
    workspaceHref,
    briefHref,
}: {
    copy: ApprovalCopy
    workspaceHref: string
    briefHref: string
}): React.ReactElement {
    return (
        <section className="ap2-main" aria-label="Approval summary">
            <div className="ap2-head">
                <div className="who-row">
                    <div className="who-avatar" aria-hidden="true">{copy.askerInitials}</div>
                    <div className="who-meta">{copy.askerLabel}</div>
                </div>
                <h2>{copy.askTitle}</h2>
                <p className="ask">{copy.askBody}</p>
            </div>

            <div className="ap2-context">
                <h4>{copy.summaryHeading}</h4>
                <div className="card">
                    <p className="empty">
                        Summary is empty &mdash; the decision spine (what&rsquo;s changing,
                        impacted artefacts, before/after values) renders here once an approval
                        request is attached to this project.
                    </p>
                    <p style={{ fontSize: "12px", color: "var(--ap-fg-muted)", marginTop: 10 }}>
                        Open the{" "}
                        <Link href={briefHref} style={{ color: "var(--ap-brand)", fontWeight: 600 }}>
                            Brief
                        </Link>{" "}
                        or the{" "}
                        <Link href={workspaceHref} style={{ color: "var(--ap-brand)", fontWeight: 600 }}>
                            workspace
                        </Link>{" "}
                        to see the current state of this project while decisioning is being wired.
                    </p>
                </div>

                <h4>Trade-offs</h4>
                <div className="card">
                    <p className="empty">
                        Trade-offs surface here once a specialist has scored the pros, cons and
                        notes against the artefact spine. No trade-offs scored yet.
                    </p>
                </div>

                <h4>What the specialists recommend</h4>
                <div className="card">
                    <p className="empty">
                        Specialist recommendations appear here when a review run is attached to
                        this approval. No recommendations yet &mdash; ask a specialist via the
                        button below and their response will be surfaced.
                    </p>
                </div>
            </div>

            <div className="ap2-decision-strip">
                <span className="guidance">Approval mutation ships next round</span>
                <button type="button" className="ap2-btn-ask" disabled>
                    {copy.askButtonLabel}
                </button>
                <button type="button" className="ap2-btn-reject" disabled>
                    {copy.rejectLabel}
                </button>
                <button
                    type="button"
                    className="ap2-btn-approve"
                    aria-disabled="true"
                    disabled
                >
                    {copy.approveLabel}
                </button>
            </div>
        </section>
    )
}

function ApproveSidebar({
    type,
    project,
}: {
    type: ApprovalType
    project: { id: string; designRevision: number }
}): React.ReactElement {
    const forkHref = `/the-forge-v2/projects/${project.id}/fork`

    return (
        <aside className="ap2-side" aria-label="Approval sidebar">
            {/* What happens if you approve */}
            <div className="ap2-side-card">
                <h4>What happens if you approve</h4>
                <div className="prose">
                    <p className="empty" style={{ margin: 0 }}>
                        {whatHappensEmptyCopy(type)}
                    </p>
                </div>
            </div>

            {/* Costs if you approve */}
            <div className="ap2-side-card">
                <h4>Costs if you approve</h4>
                <p className="empty" style={{ margin: 0 }}>
                    Cost delta renders here once the decision spine tracks before/after values.
                    None attached yet.
                </p>
            </div>

            {/* Approval chain */}
            <div className="ap2-side-card">
                <h4>Approval chain</h4>
                <p className="empty" style={{ margin: 0 }}>
                    Approval chain populates once you assign approvers. No one assigned yet.
                </p>
                <p
                    style={{
                        marginTop: 10,
                        fontSize: "12px",
                        color: "var(--ap-fg-muted)",
                    }}
                >
                    <Link href={forkHref} style={{ color: "var(--ap-brand)", fontWeight: 600 }}>
                        Assign approvers →
                    </Link>
                </p>
            </div>

            {/* Similar past decisions */}
            <div className="ap2-side-card">
                <h4>Similar past decisions</h4>
                <p className="empty" style={{ margin: 0 }}>
                    Past-decision history surfaces here once the approval spine logs outcomes. No
                    history yet for this project.
                </p>
            </div>
        </aside>
    )
}

// ─── Copy helpers ──────────────────────────────────────────────────────

function approvalCopy(
    type: ApprovalType,
    project: { name: string; designRevision: number },
): ApprovalCopy {
    const revisionLetter = designRevisionToLetter(project.designRevision)
    switch (type) {
        case "award":
            return {
                breadcrumbLeaf: "Award supplier",
                h1: "1 decision waiting",
                subtitle: "Confirm the supplier award before the RFQ is closed and the PO is drafted.",
                askerInitials: "??",
                askerLabel: "Requester · pending · queued once approval is attached",
                askTitle: `Award a supplier for ${project.name}?`,
                askBody:
                    "No award has been staged yet. When a supplier is selected from the RFQ board, this page shows the winning quote, the runners-up, and the commercial impact before you confirm.",
                summaryHeading: "Supplier being awarded",
                approveLabel: "Award supplier",
                rejectLabel: "Reject — reopen RFQ",
                askButtonLabel: "Ask a specialist",
            }
        case "quote":
            return {
                breadcrumbLeaf: "Accept quote",
                h1: "1 decision waiting",
                subtitle: "Confirm the quote before it is countersigned and the PO is issued.",
                askerInitials: "??",
                askerLabel: "Requester · pending · queued once approval is attached",
                askTitle: `Accept a quote for ${project.name}?`,
                askBody:
                    "No quote has been staged yet. When a quote is chosen from the RFQ thread, this page shows the line-items, the lead time, and the payment terms before you accept.",
                summaryHeading: "Quote being accepted",
                approveLabel: "Accept quote",
                rejectLabel: "Reject — renegotiate",
                askButtonLabel: "Ask a specialist",
            }
        case "revision":
        default:
            return {
                breadcrumbLeaf: "Approve revision",
                h1: "1 decision waiting",
                subtitle: `Confirm Revision ${revisionLetter} before it is locked and suppliers cite it on RFQs.`,
                askerInitials: "??",
                askerLabel: "Requester · pending · queued once approval is attached",
                askTitle: `Approve Revision ${revisionLetter} of ${project.name}?`,
                askBody:
                    "No revision diff has been staged yet. When a fork is ready for approval, this page shows the before/after brief, the impacted artefacts, and the specialist recommendations before you lock.",
                summaryHeading: "Revision being approved",
                approveLabel: `Approve Revision ${revisionLetter}`,
                rejectLabel: "Reject — keep current",
                askButtonLabel: "Ask a specialist",
            }
    }
}

function whatHappensEmptyCopy(type: ApprovalType): string {
    switch (type) {
        case "award":
            return "Award side-effects (RFQ closes, PO drafted, runners-up notified) render here once a supplier is staged for award."
        case "quote":
            return "Quote side-effects (PO issued, supplier countersignature requested, budget committed) render here once a quote is staged."
        case "revision":
        default:
            return "Revision side-effects (Brief locks, downstream artefacts re-run, suppliers re-quote against the new revision) render here once a fork is staged for approval."
    }
}

// ─── Formatters ────────────────────────────────────────────────────────

/** 1 → "A", 2 → "B", ... 26 → "Z", 27+ → numeric fallback. */
function designRevisionToLetter(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "1"
    if (n > 26) return String(n)
    return String.fromCharCode(64 + n)
}

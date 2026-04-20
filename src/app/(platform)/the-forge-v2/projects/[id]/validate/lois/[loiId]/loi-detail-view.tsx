/**
 * LoiDetailView — Letter of Intent detail page (V2, preview-only).
 *
 * Mockup-faithful DOM ported from FORGE-MOCKUP-LOI-DETAIL.html. Scoped under
 * `.ld2`. Every visible value is either (a) derived from the project record
 * or (b) an honest empty-state placeholder because the LOI validation store
 * has not yet shipped — there is no `lois` table. We NEVER synthesise mockup
 * specifics (Kiambu Coffee Co-op, £7,250, £725 deposit, 50-unit pilot,
 * 6-month exclusivity, contact roster, notes log, milestone dates). Those
 * surfaces render with "—" or explicit "not yet captured" copy.
 *
 * Sections (top to bottom, matching the mockup order):
 *   1. Breadcrumb (Forge › {project} › Validate › LOIs › {loiId})
 *   2. Empty-state banner — why every field below is "—"
 *   3. Page header — logo block + title + status pill row + action CTAs
 *      (all disabled pending the LOI store)
 *   4. Snap-tile grid — commitment value / deposit / delivery window /
 *      member reach. All rendered with "—".
 *   5. Body two-column split:
 *      LEFT  · PDF preview (empty state) · commercial terms table ·
 *             delivery milestones list (all rows pending)
 *      RIGHT · Linked Forge project link-back · contact roster (empty) ·
 *             linked evidence (empty) · conversation / notes log (empty)
 *   6. Footnote — what this page unlocks once the store ships.
 */

"use client"

import Link from "next/link"

import "./loi-detail-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface LoiDetailViewProps {
    project: {
        id: string
        name: string
    }
    /**
     * Raw LOI id from the URL param. Rendered verbatim as the current
     * breadcrumb leaf and in the page header sub-line because there is no
     * `lois` table to resolve a human title from. Do NOT synthesise a
     * customer name from this value.
     */
    loiId: string
}

// ─── View ──────────────────────────────────────────────────────────────

export function LoiDetailView(props: LoiDetailViewProps): React.ReactElement {
    const { project, loiId } = props

    const validateHref = `/the-forge-v2/projects/${project.id}/validate`
    const loisHref = `/the-forge-v2/projects/${project.id}/validate/lois`

    return (
        <div className="ld2">
            {/* ── Breadcrumb ─────────────────────────────────────── */}
            <div className="ld2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={`/the-forge-v2/projects/${project.id}`}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={validateHref}>Validate</Link>
                <span className="sep">›</span>
                <Link href={loisHref}>LOIs</Link>
                <span className="sep">›</span>
                <span className="current">{loiId}</span>
            </div>

            {/* ── Empty-state banner ─────────────────────────────── */}
            <div className="ld2-empty-banner" role="note">
                <strong>LOI tracking ships with the validation store.</strong>{" "}
                Preview below shows where LOI detail will render. Parties, terms,
                payment status, milestones, contact roster, and the signed PDF
                all populate once the store ships.
            </div>

            {/* ── Page header ────────────────────────────────────── */}
            <div className="ld2-page-header">
                <div className="ld2-logo" aria-hidden="true">L</div>
                <div className="ld2-header-body">
                    <h1>
                        <span className="ld2-title-dot" aria-hidden="true" />
                        <span className="ld2-empty-dash">—</span>
                    </h1>
                    <div className="sub">
                        LOI reference <code>{loiId}</code> · parties, scope, and
                        signed dates populate once the validation store ships
                    </div>
                    <div className="pill-row">
                        <span className="ld2-pill">Status —</span>
                        <span className="ld2-pill">Role —</span>
                        <span className="ld2-pill">Exclusivity —</span>
                    </div>
                </div>
                <div className="ld2-cta-group">
                    <button
                        type="button"
                        className="ld2-btn primary"
                        disabled
                        title="Promote to Forge wires in a later round"
                    >
                        Promote to Forge
                    </button>
                    <span className="ld2-btn disabled" title="Edit wires with the LOI store">Edit</span>
                    <span className="ld2-btn disabled" title="Share with Fiona wires with the LOI store">Share with Fiona</span>
                    <span className="ld2-btn disabled" title="PDF export wires with the LOI store">Download PDF</span>
                </div>
            </div>

            {/* ── Snap-tile grid ─────────────────────────────────── */}
            <div className="ld2-snap-grid">
                <SnapTile label="Commitment value" />
                <SnapTile label="Deposit" />
                <SnapTile label="Delivery window" />
                <SnapTile label="Member reach" />
            </div>

            {/* ── Body two-column split ──────────────────────────── */}
            <div className="ld2-body-grid">
                {/* ── LEFT column ────────────────────────────────── */}
                <div>
                    <div className="ld2-sec-h first">LOI document (signed PDF)</div>
                    <div className="ld2-pdf-preview">
                        <div className="ld2-pdf-doc">
                            <h2>LETTER OF INTENT</h2>
                            <p className="empty">
                                The signed PDF renders here once the LOI validation
                                store ships. Parties, scope, pricing, deposit,
                                delivery, and exclusivity clauses will be inline.
                            </p>
                        </div>
                        <div className="ld2-pdf-ctrls">
                            <span className="link-disabled" title="Full PDF view wires with the LOI store">Open full PDF</span>
                            <span className="link-disabled" title="PDF download wires with the LOI store">Download signed copy</span>
                            <span className="link-disabled" title="Redline history wires with the LOI store">See redline history</span>
                        </div>
                    </div>

                    <div className="ld2-sec-h">Commercial terms</div>
                    <table className="ld2-terms-table">
                        <tbody>
                            <TermsRow th="Unit price" />
                            <TermsRow th="Quantity" />
                            <TermsRow th="Included service" />
                            <TermsRow th="Payment schedule" />
                            <TermsRow th="Delivery" />
                            <TermsRow th="Exclusivity" />
                            <TermsRow th="Renewal trigger" />
                            <TermsRow th="Termination" />
                        </tbody>
                    </table>

                    <div className="ld2-sec-h spaced">Delivery milestones</div>
                    <div className="ld2-ms-list">
                        <MilestoneRow title="LOI signed" />
                        <MilestoneRow title="Pro-forma invoice sent" />
                        <MilestoneRow title="Deposit received" />
                        <MilestoneRow title="Promote to Forge · BOM lock" />
                        <MilestoneRow title="Production run" />
                        <MilestoneRow title="Shipping" />
                        <MilestoneRow title="Installation + onboarding" />
                        <MilestoneRow title="Renewal trigger review" />
                    </div>
                </div>

                {/* ── RIGHT column ───────────────────────────────── */}
                <div>
                    <div className="ld2-link-card">
                        <div className="t">Linked Forge project</div>
                        This LOI will surface here once it is promoted to a Forge
                        build. The promote action wires with the validation store
                        — it will open a Brief, let Fang lock the BOM, and let
                        Chase quote manufacturers.
                    </div>

                    <div className="ld2-side-card">
                        <h4>Contact roster</h4>
                        <p className="ld2-empty-inline">
                            No contacts captured on this LOI yet. Roster populates
                            with signatory, ops lead, finance lead, and any
                            introducers once the LOI store ships.
                        </p>
                    </div>

                    <div className="ld2-side-card">
                        <h4>Linked evidence</h4>
                        <p className="ld2-empty-inline">
                            No evidence linked to this LOI yet. Interviews, farm
                            visits, and WTP signals will attach here once the
                            validation store ships.
                        </p>
                    </div>

                    <div className="ld2-side-card">
                        <h4>Conversation / notes log</h4>
                        <p className="ld2-empty-inline">
                            No notes on this LOI yet. The running log of WhatsApp
                            threads, specialist reviews, and curator notes lives
                            here once the LOI store ships.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Footnote strip ─────────────────────────────────── */}
            <div className="ld2-footnote" role="note">
                <strong>What this page unlocks.</strong> A signed LOI is one of
                the highest-weight evidence items an investor reads on the
                Validate tab. Once the LOI validation store ships, this page
                becomes the single place to audit parties, terms, payment status,
                delivery milestones, renewal trigger, and the full conversation
                log — and the source Fiona uses when writing the traction
                paragraph in a deck.
            </div>
        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

/**
 * Snap tile for the 4-up grid at the top. Always renders the label and
 * an em-dash value because there is no LOI store yet. Never inject a
 * computed value here — future wiring reads from the LOI record.
 */
function SnapTile({ label }: { label: string }): React.ReactElement {
    return (
        <div className="ld2-snap-card">
            <div className="label">{label}</div>
            <div className="val">
                <span className="val-empty">—</span>
            </div>
            <div className="meta">Populates with the LOI record</div>
        </div>
    )
}

/**
 * Commercial-terms row. `th` is the term label; `td` always renders an
 * em-dash empty state pending the store. The mockup's 8 rows are all
 * rendered so the page structure matches the signed spec.
 */
function TermsRow({ th }: { th: string }): React.ReactElement {
    return (
        <tr>
            <th>{th}</th>
            <td><span className="empty">—</span></td>
        </tr>
    )
}

/**
 * Milestone row. All 8 milestones from the mockup render as "Pending" with
 * an em-dash due date. No dot-state shortcuts — every row is the neutral
 * pending state because nothing has been captured yet.
 */
function MilestoneRow({ title }: { title: string }): React.ReactElement {
    return (
        <div className="ld2-ms-row">
            <span className="m-dot pending" aria-hidden="true">○</span>
            <div className="m-body">
                {title}
                <div className="m-sub">Populates once the LOI store ships</div>
            </div>
            <span className="m-due empty">—</span>
            <span className="m-stat pending">Pending</span>
        </div>
    )
}

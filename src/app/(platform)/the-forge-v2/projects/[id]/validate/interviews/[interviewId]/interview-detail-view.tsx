/**
 * InterviewDetailView — Interview detail page (V2, layout-only).
 *
 * Mockup-faithful DOM ported from FORGE-MOCKUP-INTERVIEW-DETAIL.html. There
 * is no interview table in the schema yet, so every field renders as an
 * honest empty state ("—" or an italic "not tracked yet" line). No mockup
 * specifics leak — no John Kimani / Kiambu / £150 / transcript timestamps.
 *
 * Sections (top to bottom, matching the mockup order):
 *   1. Breadcrumb (Forge › {project} › Validate › Interviews › {id})
 *   2. Empty-state banner (explains what this page will show once data lands)
 *   3. Page header — avatar initials placeholder + interviewee name empty
 *      + meta line (date / duration / channel) + segment/LOI/relationship
 *      pills + CTAs (Edit / Share / Export, all disabled)
 *   4. Founder's 60-second synthesis banner (empty state inside)
 *   5. Two-column grid:
 *      5a. Transcript card with "no transcript yet" empty state
 *      5b. Assumptions-this-interview-moved card (empty)
 *      5c. Right sidebar: Contact / Linked LOIs / Attachments / Follow-ups /
 *          Related interviews — each renders its card chrome with an honest
 *          "not tracked yet" inline line.
 */

"use client"

import Link from "next/link"

import "./interview-detail-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface InterviewDetailViewProps {
    project: {
        id: string
        name: string
    }
    /** Route param. Surfaced in breadcrumb as a visual anchor only — we never
     *  pretend the interview exists. */
    interviewId: string
}

// ─── View ──────────────────────────────────────────────────────────────

export function InterviewDetailView(props: InterviewDetailViewProps): React.ReactElement {
    const { project, interviewId } = props

    const validateHref = `/the-forge-v2/projects/${project.id}/validate`
    // Short form of the id — enough to identify the slot in the URL without
    // rendering a 36-char UUID in the breadcrumb.
    const interviewLabel = shortenId(interviewId)

    return (
        <div className="id2">
            {/* ── Breadcrumb ─────────────────────────────────────── */}
            <div className="id2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={`/the-forge-v2/projects/${project.id}`}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={validateHref}>Validate</Link>
                <span className="sep">›</span>
                <span className="current">Interview · {interviewLabel}</span>
            </div>

            {/* ── Empty-state banner ─────────────────────────────── */}
            <div className="id2-empty-banner">
                <strong>Interview detail layout preview — no interviews tracked yet.</strong>{" "}
                Interview data populates once the validation store ships. The
                layout below is scaffolded verbatim from the mockup so fields,
                transcript blocks, tagged quotes, assumptions moved, linked LOIs,
                attachments, and follow-up actions all have a home when the data
                starts flowing.
            </div>

            {/* ── Page header ────────────────────────────────────── */}
            <div className="id2-head">
                <div className="id2-avatar empty" aria-hidden="true">—</div>
                <div>
                    <h1><span className="empty">Interviewee — not captured</span></h1>
                    <div className="sub">
                        <span className="empty">Date · duration · channel — populates once the validation store ships.</span>
                    </div>
                    <div className="id2-pill-row">
                        <span className="id2-pill">Segment —</span>
                        <span className="id2-pill">LOI —</span>
                        <span className="id2-pill">Relationship —</span>
                    </div>
                </div>
                <div className="id2-actions">
                    <button type="button" className="btn" disabled title="Interview data populates once the validation store ships.">Edit</button>
                    <button type="button" className="btn" disabled title="Interview data populates once the validation store ships.">Share</button>
                    <button type="button" className="btn" disabled title="Interview data populates once the validation store ships.">Export</button>
                </div>
            </div>

            {/* ── Summary banner ─────────────────────────────────── */}
            <div className="id2-summary">
                <span className="lbl">Founder&rsquo;s 60-second synthesis</span>
                <span className="empty">No synthesis captured yet. This panel will hold the founder&rsquo;s written takeaway after each call — price ceilings named, UX rules confirmed, surprises surfaced.</span>
            </div>

            {/* ── Two-column grid ────────────────────────────────── */}
            <div className="id2-grid">

                {/* Left column: transcript + assumptions moved */}
                <div>
                    <div className="id2-sec-h">
                        Transcript
                        <span className="tools">No recording yet · transcript tools appear once audio is attached.</span>
                    </div>
                    <div className="id2-transcript">
                        <div className="id2-ts-empty">
                            No transcript yet. Once a recording is attached, timestamps and tagged passages will land here.
                        </div>
                    </div>

                    <div className="id2-sec-h">Assumptions this interview moved</div>
                    <div className="id2-side-card" style={{ marginBottom: 0 }}>
                        <p className="id2-empty-inline">
                            No assumptions linked to this interview yet. Validated / invalidated flags flow from the Hypothesis tab once tagged quotes are wired up.
                        </p>
                    </div>
                </div>

                {/* Right column: sidebar cards */}
                <div>
                    <div className="id2-side-card">
                        <h4>Contact</h4>
                        <div className="id2-row"><span className="k">Name</span><span className="v">—</span></div>
                        <div className="id2-row"><span className="k">Role</span><span className="v">—</span></div>
                        <div className="id2-row"><span className="k">Phone</span><span className="v">—</span></div>
                        <div className="id2-row"><span className="k">Email</span><span className="v">—</span></div>
                        <div className="id2-row"><span className="k">Introduced by</span><span className="v">—</span></div>
                        <div className="id2-row"><span className="k">Relationship</span><span className="v">—</span></div>
                    </div>

                    <div className="id2-side-card">
                        <h4>Linked LOIs</h4>
                        <p className="id2-empty-inline">No LOIs linked to this interview yet.</p>
                    </div>

                    <div className="id2-side-card">
                        <h4>Attachments</h4>
                        <p className="id2-empty-inline">No attachments yet. Recordings, transcripts, photos, and signed docs attach here.</p>
                    </div>

                    <div className="id2-side-card">
                        <h4>Follow-up actions</h4>
                        <p className="id2-empty-inline">No follow-up actions captured for this interview yet.</p>
                    </div>

                    <div className="id2-side-card">
                        <h4>Related interviews</h4>
                        <p className="id2-empty-inline">Related interviews surface once the interview store ships.</p>
                    </div>
                </div>

            </div>
        </div>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

/** Render a short label for the interview id — first 8 chars of a UUID, or
 *  the raw id if it's already short. Never fakes a name. */
function shortenId(raw: string): string {
    if (!raw) return "—"
    if (raw.length <= 10) return raw
    return `${raw.slice(0, 8)}…`
}

/**
 * BriefView — Brief artefact page (V2, data-wired).
 *
 * Mockup-faithful DOM ported from FORGE-MOCKUP-BRIEF.html. Every visible
 * string is now either (a) derived from the real project row or (b) an
 * empty-state sibling that preserves the same visual footprint. No mockup
 * content leaks as a fallback — if the schema has no source for a field,
 * the slot renders neutral "not yet declared" copy.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — Brief icon + title + lock-state chip + CTAs
 *   3. Brief dual-pane hero — concept render (or blueprint placeholder)
 *      + generic mission envelope SVG (project-agnostic, kept as-is)
 *   4. Lock-state banner (draft variant until brief_locked_at ships)
 *   5. Brief grid — narrative (mission / customers / why-now / constraints)
 *      + sidebar stack (regulatory posture / cost / mass)
 *   6. Revision history card (single-row until brief_revisions ships)
 *   7. Design grounded in — teal pills + footnote
 */

"use client"

import Image from "next/image"
import Link from "next/link"
import { Sparkles } from "lucide-react"

import {
    PipelineRunChip,
    type PipelineRunStatus,
} from "@/components/pipeline/pipeline-run-chip"
import { RunSpecialistButton } from "@/components/pipeline/run-specialist-button"

import "./brief-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface RegulatoryStandardRow {
    code: string
    name: string
    summary: string
    /** Compliance state — `not-started` until a project_compliance_packet table ships. */
    status: "met" | "in-progress" | "not-started"
}

export interface BriefRevisionRow {
    /** UUID — stable key for React. */
    id: string
    /** "A", "B"... or a free-form label like "Draft 0.3 → Revision A". */
    label: string
    /** One-line summary of what changed in this revision. */
    summary: string
    /** ISO timestamp (createdAt for drafts, lockedAt for locked revisions). */
    at: string
    /** True for the newest row — shown with the "current" (brand) dot. */
    isCurrent: boolean
    /** True once locked_at is populated. Drives the chip wording. */
    isLocked: boolean
}

export interface BriefViewProps {
    project: {
        id: string
        name: string
        subject: string
        designRevision: number
        createdAt: string
        /** Blueprint / plan view. Rendered in the right hero pane. */
        systemIllustrationUrl: string | null
        /** Photo-realistic render. Rendered in the left hero pane. */
        conceptRenderUrl: string | null
    }
    lockState: {
        isLocked: boolean
        /** ISO timestamp when Revision N was locked. Null while draft. */
        lockedAt: string | null
    }
    narrative: {
        mission: string | null
        targetCustomers: string | null
        whyNow: string | null
    }
    constraints: {
        unitCostCeiling: string | null
        firstShipDate: string | null
        maxMass: string | null
        batchSize: string | null
        markets: string | null
        productionRegion: string | null
    }
    regulatory: RegulatoryStandardRow[]
    cost: {
        totalUnitCostGbp: number | null
        unitCostCeilingGbp: number | null
    }
    mass: {
        totalMassKg: number | null
        maxMassKg: number | null
        moduleCount: number
    }
    /** Revision history rows, newest-first. Empty array → single-row fallback. */
    revisions: BriefRevisionRow[]
    /** Latest Chase research run — drives the draft CTA + "drafted by" chip. */
    chaseRun: {
        status: PipelineRunStatus
        startedAt: string | null
        finishedAt: string | null
        errorCode: string | null
        errorMessage: string | null
        reportChars: number | null
    }
    /** True when research.report is populated and long enough for Max. */
    hasResearchReport: boolean
    /** Server action bound to this project + trigger='manual'. */
    runChaseAction: () => Promise<
        { ok: true; runId: string } | { ok: false; error: string; errorCode?: string }
    >
}

// ─── View ──────────────────────────────────────────────────────────────

export function BriefView(props: BriefViewProps): React.ReactElement {
    const { project, lockState, narrative, constraints, regulatory, cost, mass, revisions, chaseRun, hasResearchReport, runChaseAction } = props

    const briefHref = `/the-forge-v2/projects/${project.id}/brief`
    const forkHref = `/the-forge-v2/projects/${project.id}/fork`
    const exportHref = `/the-forge-v2/projects/${project.id}/export`
    const workspaceHref = `/the-forge-v2/projects/${project.id}`
    const modulesHref = `/the-forge-v2/projects/${project.id}/modules`

    // Revision letter — 1 → A, 2 → B ... so users read "Revision A" not "Revision 1".
    const revisionLetter = designRevisionToLetter(project.designRevision)
    const createdDate = formatIsoDate(project.createdAt)

    // Chase chip timestamp — 'done' reads finishedAt, live states use startedAt.
    const chaseChipTimestamp =
        chaseRun.status === "done"
            ? chaseRun.finishedAt ?? chaseRun.startedAt
            : chaseRun.startedAt ?? chaseRun.finishedAt

    // Empty-state = nothing to render in the narrative yet. Show the
    // Chase draft CTA instead so the founder isn't staring at three
    // "not yet declared" links with no next action.
    const isEmptyBrief =
        !hasResearchReport &&
        !narrative.mission &&
        !narrative.targetCustomers &&
        !narrative.whyNow

    // If Chase is currently working we swap in a live-status card even
    // when isEmptyBrief is false — founders should see the run progress.
    const chaseIsLive =
        chaseRun.status === "running" || chaseRun.status === "queued"

    return (
        <div className="b2">
            {/* ── Breadcrumb ───────────────────────────────────────── */}
            <div className="b2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={workspaceHref}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Brief</span>
            </div>

            {/* ── Page header ─────────────────────────────────────── */}
            <div className="b2-page-header">
                <div>
                    <h1>
                        <span className="b2-title-dot" aria-hidden="true" />
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 12h6M9 16h4" /></svg>
                        Brief · {project.name}
                        <LockStateChip isLocked={lockState.isLocked} />
                    </h1>
                    <div className="sub">The anchor spec. Intent · target markets · regulatory envelope · constraints.</div>
                    {chaseRun.status !== "not-started" && (
                        <div style={{ marginTop: 8 }}>
                            <PipelineRunChip
                                status={chaseRun.status}
                                specialistName="Chase"
                                startedAt={chaseChipTimestamp}
                                errorCode={chaseRun.errorCode}
                                errorMessage={chaseRun.errorMessage}
                                compact
                            />
                        </div>
                    )}
                </div>
                <div className="cta-group">
                    <Link href={exportHref} className="b2-btn">Share with investor</Link>
                    <Link href={forkHref} className="b2-btn">Edit (new revision)</Link>
                    <Link href={exportHref} className="b2-btn ghost">Export PDF</Link>
                </div>
            </div>

            {/* ── Brief dual-pane hero ────────────────────────────── */}
            <div className="b2-brief-hero">
                <div className="b2-brief-hero-pane">
                    <div className="head">
                        <span className="label">
                            {project.conceptRenderUrl ? "Concept render" : "Concept render · pending"}
                        </span>
                    </div>
                    <div className="body">
                        {project.conceptRenderUrl ? (
                            <div className="img-wrap">
                                <Image
                                    src={project.conceptRenderUrl}
                                    alt={`${project.name} concept render`}
                                    fill
                                    sizes="(max-width: 900px) 100vw, 55vw"
                                    style={{ objectFit: "cover" }}
                                />
                            </div>
                        ) : (
                            <BlueprintPaperPlaceholder
                                label="Concept render"
                                sub="Generates when Brief is locked and CAD is imported."
                            />
                        )}
                    </div>
                    <div className="caveat">Conceptual illustration — not an engineering drawing</div>
                </div>
                <div className="b2-brief-hero-pane">
                    <div className="head">
                        <span className="label">Mission envelope · coming soon</span>
                    </div>
                    <div className="body">
                        <MissionEnvelopeSvg />
                    </div>
                    <div className="caveat">Mission-envelope UI is in scoping — see MISSION-ENVELOPE-SCOPING.md for the plan</div>
                </div>
            </div>

            {/* ── Chase draft CTA ───────────────────────────────────
                Shown when the research report hasn't been seeded yet
                (empty-state path) or when a run is in flight so the
                founder can watch the live chip. Populated briefs hide
                this card — the page-header chip ("Drafted by Chase · Nm
                ago") carries the status instead. */}
            {(isEmptyBrief || chaseIsLive || chaseRun.status === "failed") && (
                <ChaseDraftCta
                    status={chaseRun.status}
                    startedAt={chaseChipTimestamp}
                    errorCode={chaseRun.errorCode}
                    errorMessage={chaseRun.errorMessage}
                    action={runChaseAction}
                    briefHref={briefHref}
                />
            )}

            {/* ── Lock-state banner ───────────────────────────────── */}
            <LockStateBanner isLocked={lockState.isLocked} />

            {/* ── Brief grid ──────────────────────────────────────── */}
            <div className="b2-brief-grid">
                <div className="b2-mission-card">
                    <div className="field">
                        <div className="k">Product</div>
                        <div className="v"><strong>{formatProductLine(project.name, project.subject)}</strong></div>
                    </div>

                    <NarrativeField
                        k="Mission"
                        value={narrative.mission}
                        emptyHref={forkHref}
                        emptyLabel="Mission not yet declared — open Brief editor to add →"
                    />

                    <NarrativeField
                        k="Target customers"
                        value={narrative.targetCustomers}
                        emptyHref={forkHref}
                        emptyLabel="Target customers not yet declared →"
                    />

                    <NarrativeField
                        k="Why now"
                        value={narrative.whyNow}
                        emptyHref={forkHref}
                        emptyLabel="Why-now not yet declared →"
                    />

                    <div className="field">
                        <div className="k">Constraints declared</div>
                        <div className="b2-constraints-grid">
                            <ConstraintItem k="Unit cost ceiling" v={constraints.unitCostCeiling} />
                            <ConstraintItem k="Target first ship" v={constraints.firstShipDate} />
                            <ConstraintItem k="Max mass" v={constraints.maxMass} />
                            <ConstraintItem k="Batch 1" v={constraints.batchSize} />
                            <ConstraintItem k="Markets" v={constraints.markets} />
                            <ConstraintItem k="Production" v={constraints.productionRegion} />
                        </div>
                    </div>
                </div>

                <div className="b2-sidebar-stack">
                    <div className="b2-sb-card b2-how">
                        <h4 className="b2-how__head">How this works</h4>
                        <ul className="b2-how__list">
                            <li>The brief captures your target buyer, use case, constraints, and success criteria. Specialists ground everything else on this.</li>
                            <li>Edit freely while Rev {revisionLetter} is unlocked. Locking freezes the brief so your BOM / cost / supplier plan line up with one source of truth.</li>
                            <li>Lock is reversible via a new revision — nothing is destroyed.</li>
                        </ul>
                        <div className="b2-how__foot">
                            Questions → <Link href="/the-forge/ask">/the-forge/ask</Link> — ask a specialist
                        </div>
                    </div>
                    <RegulatoryPostureCard standards={regulatory} forkHref={forkHref} />
                    <AllInCostCard
                        totalUnitCostGbp={cost.totalUnitCostGbp}
                        unitCostCeilingGbp={cost.unitCostCeilingGbp}
                        forkHref={forkHref}
                    />
                    <MassBudgetCard
                        totalMassKg={mass.totalMassKg}
                        maxMassKg={mass.maxMassKg}
                        moduleCount={mass.moduleCount}
                        modulesHref={modulesHref}
                    />
                </div>
            </div>

            {/* ── Revision history ─────────────────────────────────── */}
            <div className="b2-revision-card">
                <h4>Revision history</h4>
                <div className="b2-revision-timeline">
                    {revisions.length > 0 ? (
                        revisions.map((row) => (
                            <div key={row.id} className="b2-rev-row">
                                <span className={`dot ${row.isCurrent ? "current" : "old"}`} />
                                <div className="content">
                                    <div className="label">{row.label}</div>
                                    <div className="time">
                                        {formatIsoDate(row.at)}
                                        {row.summary ? ` · ${row.summary}` : ""}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="b2-rev-row">
                            <span className="dot current" />
                            <div className="content">
                                <div className="label">Revision {revisionLetter} (current{lockState.isLocked ? " · locked" : " · not yet locked"})</div>
                                <div className="time">Created {createdDate}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Design grounded in ──────────────────────────────── */}
            <div className="b2-design-grounded-in">
                <div className="b2-grounded-in-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" /></svg>
                    <span>Design grounded in</span>
                </div>
                <div className="b2-grounded-pills">
                    <Link href={briefHref} className="b2-grounded-pill"><span className="diamond" />Mission-envelope calculators</Link>
                    <Link href={briefHref} className="b2-grounded-pill"><span className="diamond" />Regulatory library</Link>
                    <Link href={briefHref} className="b2-grounded-pill"><span className="diamond" />Material cost index</Link>
                </div>
                <p className="b2-grounded-footnote">Specifications informed by verified engineering data — material properties, ISO hardware dimensions, and process capability limits from the ForgeOS engineering library.</p>
            </div>
        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function ChaseDraftCta({
    status,
    startedAt,
    errorCode,
    errorMessage,
    action,
    briefHref,
}: {
    status: PipelineRunStatus
    startedAt: string | null
    errorCode: string | null
    errorMessage: string | null
    action: () => Promise<
        { ok: true; runId: string } | { ok: false; error: string; errorCode?: string }
    >
    briefHref: string
}): React.ReactElement {
    // Live states → show status card with the chip front-and-centre.
    // Idle → show the "Draft with Chase" CTA. Failed → show the error
    // chip plus a retry button.
    const isLive = status === "running" || status === "queued"
    const isFailed = status === "failed"

    const heading = isLive
        ? "Chase is drafting your brief…"
        : isFailed
            ? "Chase couldn't finish — give it another go"
            : "Start with Chase"
    const body = isLive
        ? "Pulling real-world specs, regulatory posture, and strategic constraints. Takes about a minute."
        : isFailed
            ? "The first run didn't land. Retry from here — nothing else is blocked."
            : "I'll research the subject you typed, write a multi-paragraph narrative, and pull out the strategic constraints Max needs to decompose. Takes about a minute."

    return (
        <div
            className="b2-sb-card"
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginBottom: 16,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h4 style={{ margin: 0 }}>{heading}</h4>
                {status !== "not-started" && (
                    <PipelineRunChip
                        status={status}
                        specialistName="Chase"
                        startedAt={startedAt}
                        errorCode={errorCode}
                        errorMessage={errorMessage}
                        compact
                    />
                )}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--b-fg-muted)" }}>
                {body}
            </p>
            {!isLive && (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <RunSpecialistButton
                        action={action}
                        label={isFailed ? "Retry Chase" : "Draft with Chase"}
                        subLabel="Chase · Strategist · ~60s"
                        onSuccessHref={briefHref}
                        variant="primary"
                        icon={<Sparkles aria-hidden="true" />}
                    />
                    <Link
                        href={briefHref}
                        style={{ fontSize: 12, color: "var(--b-fg-muted)" }}
                    >
                        Or edit the brief yourself →
                    </Link>
                </div>
            )}
        </div>
    )
}

function LockStateChip({ isLocked }: { isLocked: boolean }): React.ReactElement {
    if (isLocked) {
        return <span className="b2-chip success solid" style={{ marginLeft: 6 }}>Complete · locked</span>
    }
    return (
        <span className="b2-chip solid" style={{ marginLeft: 6 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            Draft — not yet locked
        </span>
    )
}

function LockStateBanner({ isLocked }: { isLocked: boolean }): React.ReactElement {
    if (isLocked) {
        return (
            <div className="b2-locked-note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <div><strong>Revision locked.</strong> Suppliers cite this revision on RFQs. Editing creates a revision proposal for review before downstream artefacts re-run.</div>
            </div>
        )
    }
    return (
        <div className="b2-locked-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            <div><strong>Draft · unlocked.</strong> Lock once the specification is stable — suppliers will cite this revision on RFQs.</div>
        </div>
    )
}

function NarrativeField({
    k,
    value,
    emptyHref,
    emptyLabel,
}: {
    k: string
    value: string | null
    emptyHref: string
    emptyLabel: string
}): React.ReactElement {
    return (
        <div className="field">
            <div className="k">{k}</div>
            <div className="v">
                {value && value.trim().length > 0 ? (
                    value
                ) : (
                    <Link href={emptyHref} style={{ color: "var(--b-fg-muted)" }}>{emptyLabel}</Link>
                )}
            </div>
        </div>
    )
}

function ConstraintItem({ k, v }: { k: string; v: string | null }): React.ReactElement {
    const hasValue = typeof v === "string" && v.trim().length > 0
    return (
        <div className="c-item">
            <span className="c-k">{k}:</span>{" "}
            {hasValue ? <strong>{v}</strong> : <span style={{ color: "var(--b-fg-subtle)" }}>—</span>}
        </div>
    )
}

function RegulatoryPostureCard({
    standards,
    forkHref,
}: {
    standards: RegulatoryStandardRow[]
    forkHref: string
}): React.ReactElement {
    if (standards.length === 0) {
        return (
            <div className="b2-sb-card">
                <h4>Regulatory posture</h4>
                <div className="b2-regulatory-grid">
                    <div className="b2-reg-item status-notstarted" style={{ gridColumn: "span 2" }}>
                        <div className="reg-icon">·</div>
                        <div className="body">
                            <div className="name">Regulatory posture not yet declared</div>
                            <div className="meta">
                                <Link href={forkHref}>Declare standards in the Brief fork →</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }
    return (
        <div className="b2-sb-card">
            <h4>Regulatory posture</h4>
            <div className="b2-regulatory-grid">
                {standards.map((s) => (
                    <RegItem key={s.code} standard={s} />
                ))}
            </div>
        </div>
    )
}

function RegItem({ standard }: { standard: RegulatoryStandardRow }): React.ReactElement {
    const statusClass =
        standard.status === "met" ? "status-met"
            : standard.status === "in-progress" ? "status-inprogress"
                : "status-notstarted"
    const icon = standard.status === "met" ? "✓" : standard.status === "in-progress" ? "⋯" : "·"
    return (
        <div className={`b2-reg-item ${statusClass}`}>
            <div className="reg-icon">{icon}</div>
            <div className="body">
                <div className="name">{standard.code}</div>
                <div className="meta">{standard.summary || standard.name}</div>
            </div>
        </div>
    )
}

function AllInCostCard({
    totalUnitCostGbp,
    unitCostCeilingGbp,
    forkHref,
}: {
    totalUnitCostGbp: number | null
    unitCostCeilingGbp: number | null
    forkHref: string
}): React.ReactElement {
    if (totalUnitCostGbp === null) {
        return (
            <div className="b2-sb-card">
                <h4>All-in cost vs ceiling</h4>
                <div className="big" style={{ color: "var(--b-fg-subtle)" }}>—</div>
                <div className="sub">
                    Cost not yet estimated ·{" "}
                    <Link href={forkHref}>run estimator →</Link>
                </div>
            </div>
        )
    }
    const costLabel = formatGbpK(totalUnitCostGbp)
    const hasCeiling = typeof unitCostCeilingGbp === "number" && unitCostCeilingGbp > 0
    if (!hasCeiling) {
        return (
            <div className="b2-sb-card">
                <h4>All-in cost vs ceiling</h4>
                <div className="big">{costLabel} <small>/ —</small></div>
                <div className="sub">
                    Ceiling not yet set ·{" "}
                    <Link href={forkHref}>declare in Brief fork →</Link>
                </div>
            </div>
        )
    }
    const ceilingLabel = formatGbpK(unitCostCeilingGbp)
    const pct = Math.round((totalUnitCostGbp / unitCostCeilingGbp) * 100)
    const delta = totalUnitCostGbp - unitCostCeilingGbp
    const overCeiling = delta > 0
    return (
        <div className="b2-sb-card">
            <h4>All-in cost vs ceiling</h4>
            <div className={overCeiling ? "big danger" : "big"}>
                {costLabel} <small>/ {ceilingLabel}</small>
            </div>
            <div className={overCeiling ? "sub danger" : "sub"}>
                {pct}% of ceiling · {overCeiling ? `${formatGbpK(delta)} OVER` : `${formatGbpK(-delta)} under`}
            </div>
            <div className="b2-cost-bar">
                <div className="fill" style={{ width: `${Math.min(100, pct)}%` }} />
                <div className="pin" style={{ left: `${Math.min(100, pct)}%` }} />
            </div>
            <div className="b2-cost-axis">
                <span>£0</span>
                <span>{ceilingLabel}</span>
                <span className={overCeiling ? "danger" : undefined}>{costLabel}</span>
            </div>
        </div>
    )
}

function MassBudgetCard({
    totalMassKg,
    maxMassKg,
    moduleCount,
    modulesHref,
}: {
    totalMassKg: number | null
    maxMassKg: number | null
    moduleCount: number
    modulesHref: string
}): React.ReactElement {
    if (totalMassKg === null) {
        if (moduleCount === 0) {
            return (
                <div className="b2-sb-card">
                    <h4>Mass budget</h4>
                    <div className="big" style={{ color: "var(--b-fg-subtle)" }}>—</div>
                    <div className="sub">
                        No modules yet —{" "}
                        <Link href={modulesHref}>run decomposition →</Link>
                    </div>
                </div>
            )
        }
        return (
            <div className="b2-sb-card">
                <h4>Mass budget</h4>
                <div className="big" style={{ color: "var(--b-fg-subtle)" }}>—</div>
                <div className="sub">Modules present but no mass estimates yet</div>
            </div>
        )
    }
    const massLabel = `${totalMassKg.toFixed(2)}`
    const hasCap = typeof maxMassKg === "number" && maxMassKg > 0
    if (!hasCap) {
        return (
            <div className="b2-sb-card">
                <h4>Mass budget</h4>
                <div className="big">{massLabel} <small>kg</small></div>
                <div className="sub">Max mass not yet set</div>
                <Link href={modulesHref} className="b2-mass-link">See module breakdown →</Link>
            </div>
        )
    }
    const overCap = totalMassKg > maxMassKg
    const delta = totalMassKg - maxMassKg
    return (
        <div className="b2-sb-card">
            <h4>Mass budget</h4>
            <div className={overCap ? "big danger" : "big"}>
                {massLabel} <small>/ {maxMassKg.toFixed(2)} kg MTOW</small>
            </div>
            <div className={overCap ? "sub danger" : "sub"}>
                {overCap
                    ? `${delta.toFixed(2)} kg over`
                    : `${(-delta).toFixed(2)} kg under`}
            </div>
            <Link href={modulesHref} className="b2-mass-link">See module breakdown →</Link>
        </div>
    )
}

// ─── Blueprint paper placeholder (mirrors workspace-view's component) ──

function BlueprintPaperPlaceholder({ label, sub }: { label: string; sub: string }): React.ReactElement {
    return (
        <svg
            viewBox="0 0 500 300"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={`${label} — not yet generated`}
            style={{ width: "100%", height: "100%", display: "block" }}
        >
            <defs>
                <pattern id="bp-brief-grid-sm" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M10 0 L 0 0 L 0 10" fill="none" stroke="#e7e5e4" strokeWidth="0.3" />
                </pattern>
                <pattern id="bp-brief-grid-lg" width="50" height="50" patternUnits="userSpaceOnUse">
                    <rect width="50" height="50" fill="url(#bp-brief-grid-sm)" />
                    <path d="M50 0 L 0 0 L 0 50" fill="none" stroke="#d6d3d1" strokeWidth="0.55" />
                </pattern>
            </defs>
            <rect x="0" y="0" width="500" height="300" fill="#fafaf9" />
            <rect x="0" y="0" width="500" height="300" fill="url(#bp-brief-grid-lg)" />
            <rect x="8" y="8" width="484" height="284" fill="none" stroke="#1c1917" strokeWidth="0.8" />
            <rect x="14" y="14" width="472" height="272" fill="none" stroke="#78716c" strokeWidth="0.4" strokeDasharray="2 3" />
            <g fontFamily="Inter, system-ui, sans-serif">
                <text x="22" y="32" fontSize="9" fontWeight="700" letterSpacing="0.08em" fill="#78716c">{label.toUpperCase()} — PENDING</text>
            </g>
            <g transform="translate(250,140)" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif">
                <circle r="24" fill="none" stroke="#a8a29e" strokeWidth="0.8" strokeDasharray="3 3" />
                <line x1="-28" x2="28" y1="0" y2="0" stroke="#a8a29e" strokeWidth="0.6" strokeDasharray="2 2" />
                <line x1="0" x2="0" y1="-28" y2="28" stroke="#a8a29e" strokeWidth="0.6" strokeDasharray="2 2" />
                <text y="52" fontSize="11" fontWeight="700" fill="#1c1917">{label}</text>
                <text y="68" fontSize="9.5" fill="#78716c">{sub}</text>
            </g>
            <g fontFamily="Inter, system-ui, sans-serif" fontSize="7.5" fill="#78716c">
                <rect x="380" y="258" width="108" height="30" fill="#ffffff" stroke="#1c1917" strokeWidth="0.5" />
                <text x="385" y="268" fontWeight="700" fill="#1c1917">{label.toUpperCase()}</text>
                <text x="385" y="278">status · pending</text>
                <text x="385" y="286">scale · TBD</text>
            </g>
        </svg>
    )
}

// ─── Mission envelope (coming-soon placeholder — real UI scoped in MISSION-ENVELOPE-SCOPING.md) ──

function MissionEnvelopeSvg(): React.ReactElement {
    // Deliberately NOT a chart. Scoping is live at the repo root
    // (MISSION-ENVELOPE-SCOPING.md). Swap this for the real component once
    // the archetype picker + axis config lands.
    return (
        <div className="b2-envelope-placeholder">
            <svg
                className="envelope b2-envelope-placeholder__silhouette"
                viewBox="0 0 500 240"
                xmlns="http://www.w3.org/2000/svg"
                role="presentation"
                aria-hidden="true"
            >
                <rect x="0" y="0" width="500" height="240" fill="#fafaf9" />
                <line x1="56" y1="40"  x2="56"  y2="200" stroke="#d6d3d1" strokeWidth="0.8" strokeDasharray="4 4" />
                <line x1="56" y1="200" x2="476" y2="200" stroke="#d6d3d1" strokeWidth="0.8" strokeDasharray="4 4" />
                <path
                    d="M80 195 Q 180 160, 300 120 Q 380 100, 450 88"
                    fill="none"
                    stroke="#d6d3d1"
                    strokeWidth="1.2"
                    strokeDasharray="5 5"
                />
            </svg>
            <div className="b2-envelope-placeholder__content">
                <div className="b2-envelope-placeholder__title">Mission envelope · coming soon</div>
                <div className="b2-envelope-placeholder__body">
                    Plot altitude vs endurance, power vs mass, and other trade-spaces against competitor markers right here. Not yet built — ping Tristan.
                </div>
                <a href="#" className="b2-envelope-placeholder__cta">Vote for this →</a>
            </div>
        </div>
    )
}

// ─── Formatters ────────────────────────────────────────────────────────

/** 1 → "A", 2 → "B", ... 26 → "Z", 27+ → numeric fallback. */
function designRevisionToLetter(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "1"
    if (n > 26) return String(n)
    return String.fromCharCode(64 + n)
}

/** ISO timestamp → "YYYY-MM-DD" for display. */
function formatIsoDate(iso: string): string {
    try {
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) return "—"
        const y = d.getUTCFullYear()
        const m = String(d.getUTCMonth() + 1).padStart(2, "0")
        const day = String(d.getUTCDate()).padStart(2, "0")
        return `${y}-${m}-${day}`
    } catch {
        return "—"
    }
}

/** £172_345 → "£172k"; £1_234 → "£1.2k". */
function formatGbpK(value: number): string {
    if (!Number.isFinite(value)) return "£—"
    const abs = Math.abs(value)
    if (abs >= 1000) {
        const rounded = abs / 1000
        const label = rounded >= 100 ? rounded.toFixed(0) : rounded.toFixed(1)
        return `${value < 0 ? "-" : ""}£${label}k`
    }
    return `${value < 0 ? "-" : ""}£${Math.round(abs)}`
}

/** "HAPS UAV" + "solar HAPS" → "HAPS UAV — solar HAPS". */
function formatProductLine(name: string, subject: string): string {
    const n = (name ?? "").trim()
    const s = (subject ?? "").trim()
    if (!s || s === n) return n || "—"
    return `${n} — ${s}`
}

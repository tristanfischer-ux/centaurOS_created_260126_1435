/**
 * ModuleDetailView — mockup-faithful port of FORGE-MOCKUP-MODULE-DETAIL.html.
 *
 * Scoped CSS under `.md2` keeps the mockup palette/typography out of the
 * wider platform. Every string is a prop and every field honours an honest
 * empty-state ("not yet declared" / "—") — we never fabricate the HAPS UAV
 * copy from the mockup.
 *
 * Sections (top to bottom, matching the mockup):
 *   1. Breadcrumb
 *   2. Page header — title + stable-revision chip + purpose line + CTAs
 *   3. Dual-illustration hero — Nano Banana render + Engineering drawing
 *   4. Description (rich body)
 *   5. Why this module matters (orange callout)
 *   6. Inputs & outputs (pill grid)
 *   7. Key components (bulleted icon list)
 *   8. Failure modes (warning icon list)
 *   9. Unknowns (info icon list)
 *   10. Lead-time pill (with provenance caption)
 *   11. Design grounded in (teal pills)
 *   12. Assembly composition table (rolled up from keyParts)
 *
 * The view is a dumb renderer — page.tsx resolves the module off the
 * project and passes a typed props bundle.
 */

"use client"

import Link from "next/link"
import { ClipboardCheck } from "lucide-react"

import {
    PipelineRunChip,
    type PipelineRunStatus,
    formatRelativeFromNow,
} from "@/components/pipeline/pipeline-run-chip"
import { RunSpecialistButton } from "@/components/pipeline/run-specialist-button"

import "./module-detail-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface ModuleDetailPartRow {
    /** Stable React key + url slug for the part-detail route. */
    slug: string
    /** Display name (the raw keyPart string, trimmed). */
    name: string
    /** Qty — always 1 until a parts_spec table ships. */
    qty: number
    /** Per-part mass in kg — null until part-level masses exist. */
    massKg: number | null
    /** Material blurb — null until captured. */
    material: string | null
    /** Supplier blurb — null until captured. */
    supplier: string | null
}

export interface ModuleDetailGroundedPill {
    /** Display label on the pill. */
    label: string
    /** Optional link target — if null, renders as a static pill. */
    href: string | null
}

export interface ModuleDetailFangIssue {
    /** Severity — maps to issue chip colour. */
    severity: "critical" | "warning" | "info"
    /** Short category label, e.g. "Tolerance", "Material compatibility". */
    category: string
    /** One-sentence description of the concern. */
    message: string
    /** Optional suggested fix. */
    suggestion: string | null
}

export interface ModuleDetailFangReview {
    /** Overall verdict — drives the chip colour. */
    verdict: "pass" | "warn" | "fail"
    /** One-sentence summary line. */
    summary: string
    /** Issues surfaced — up to 6 rendered, the rest are truncated. */
    issues: ModuleDetailFangIssue[]
    /** Actionable recommendations. */
    recommendations: string[]
    /** When the review landed (ISO string). */
    reviewedAt: string
}

export interface ModuleDetailViewProps {
    /** Parent project — used for breadcrumbs + deep links. */
    project: {
        id: string
        name: string
    }
    module: {
        /** Stable id (url slug inside the project). */
        id: string
        /** Module number label, e.g. "M1". */
        moduleNum: string
        /** Display name without the number prefix. */
        name: string
        /** One-sentence purpose — null if not authored yet. */
        purpose: string | null
        /** Longer description body — null if not authored yet. */
        description: string | null
        /** Mission-relevance paragraph — null if not authored yet. */
        whyItMatters: string | null
        /** Revision label shown in the header chip, e.g. "Stable · rev A".
         *  Null hides the chip. */
        revisionChip: string | null
        /** Input contract items. */
        inputs: string[]
        /** Output contract items. */
        outputs: string[]
        /** Bulleted key components (raw keyParts strings). */
        keyParts: string[]
        /** Failure-mode bullets. */
        failureModes: string[]
        /** Open-question bullets. */
        unknowns: string[]
        /** Lead time in weeks — null when not estimated. */
        leadWeeks: number | null
        /** Provenance caption for the lead time (e.g. "Supplier quote"). */
        leadSourceLabel: string | null
        /** Nano Banana / concept render URL for the left hero pane. */
        conceptRenderUrl: string | null
        /** Model caption for the concept render, e.g. "gemini-3.1-flash". */
        conceptRenderModel: string | null
        /** Engineering-drawing image URL for the right hero pane. */
        engineeringDrawingUrl: string | null
    }
    /** Pills under the "Design grounded in" heading. */
    groundedIn: ModuleDetailGroundedPill[]
    /** Rolled-up parts list for the Assembly composition table. */
    parts: ModuleDetailPartRow[]
    /** Aggregate mass derived from module.estimatedMassKg (kg). */
    currentMassKg: number | null
    /** Declared mass budget (kg). */
    budgetMassKg: number | null
    /** Latest Fang (VP Manufacturing) run status for this module. */
    fangRun: {
        status: PipelineRunStatus
        startedAt: string | null
        finishedAt: string | null
        errorCode: string | null
        errorMessage: string | null
    }
    /** Persisted Fang review, if any. Null when Fang hasn't reviewed yet. */
    fangReview: ModuleDetailFangReview | null
    /** Server action bound to this project + module + trigger='manual'. */
    runFangAction: () => Promise<
        { ok: true; runId: string } | { ok: false; error: string; errorCode?: string }
    >
    /** True when Fang can't run yet (e.g. no keyParts). Disables the CTA. */
    fangDisabled: boolean
    /** Reason shown as tooltip when fangDisabled is true. */
    fangDisabledReason: string | null
}

// ─── Component ──────────────────────────────────────────────────────────

export function ModuleDetailView(props: ModuleDetailViewProps): React.ReactElement {
    const {
        project,
        module: mod,
        groundedIn,
        parts,
        currentMassKg,
        budgetMassKg,
        fangRun,
        fangReview,
        runFangAction,
        fangDisabled,
        fangDisabledReason,
    } = props

    const workspaceHref = `/the-forge-v2/projects/${project.id}`
    const modulesHref = `${workspaceHref}/modules`
    const openCadHref = `/the-forge/cad-lab?project=${project.id}&module=${mod.id}`
    const forkHref = `${workspaceHref}/modules/${mod.id}` // fork action wires later

    const massDelta =
        currentMassKg != null && budgetMassKg != null
            ? currentMassKg - budgetMassKg
            : null

    return (
        <div className="md2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="md2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={workspaceHref}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={modulesHref}>Modules</Link>
                <span className="sep">›</span>
                <span className="current">
                    {mod.moduleNum} {mod.name}
                </span>
            </div>

            {/* ── Page header ─────────────────────────── */}
            <div className="md2-page-header">
                <div>
                    <h1>
                        <span className="md2-title-dot" aria-hidden="true" />
                        {mod.moduleNum} · {mod.name}
                        {mod.revisionChip && (
                            <span className="md2-chip success solid" style={{ marginLeft: 6 }}>
                                {mod.revisionChip}
                            </span>
                        )}
                    </h1>
                    {mod.purpose ? (
                        <p className="md2-purpose-line">{mod.purpose}</p>
                    ) : (
                        <p className="md2-purpose-line" style={{ color: "var(--md-fg-muted)", fontStyle: "italic" }}>
                            Purpose not yet declared.
                        </p>
                    )}
                </div>
                <div className="md2-cta-group">
                    <Link href={forkHref} className="md2-btn soon" aria-disabled="true">
                        Fork revision
                    </Link>
                    <Link href={openCadHref} className="md2-btn">
                        Open CAD →
                    </Link>
                </div>
            </div>

            {/* ── Dual-illustration hero ──────────────── */}
            <div className="md2-dual-hero">
                {/* Left: Nano Banana / concept render */}
                <div className="md2-hero-pane">
                    <div className="md2-hero-pane-head">
                        <span className="label">
                            Nano Banana render
                            {mod.conceptRenderModel ? ` · ${mod.conceptRenderModel}` : ""}
                        </span>
                    </div>
                    <div className="md2-hero-pane-body">
                        {mod.conceptRenderUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={mod.conceptRenderUrl}
                                alt={`${mod.name} concept render`}
                            />
                        ) : (
                            <div className="md2-hero-pane-empty">
                                Concept render not yet generated.
                            </div>
                        )}
                    </div>
                    <div className="md2-hero-pane-caveat">
                        <span>Conceptual illustration — not an engineering drawing</span>
                    </div>
                </div>

                {/* Right: Engineering drawing */}
                <div className="md2-hero-pane">
                    <div className="md2-hero-pane-head">
                        <span className="label">
                            Engineering drawing{mod.revisionChip ? ` · ${mod.revisionChip.replace(/^[^·]*·\s*/, "")}` : ""}
                        </span>
                    </div>
                    <div className="md2-hero-pane-body">
                        {mod.engineeringDrawingUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={mod.engineeringDrawingUrl}
                                alt={`${mod.name} engineering drawing`}
                            />
                        ) : (
                            <div className="md2-hero-pane-empty">
                                Engineering drawing not yet released.
                            </div>
                        )}
                    </div>
                    <div className="md2-hero-pane-caveat">
                        <span>
                            {mod.engineeringDrawingUrl
                                ? "Informative drawing — not released for manufacture"
                                : "Drawing ships once module interface is frozen"}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Description ─────────────────────────── */}
            <div className="md2-section-block">
                <h4 className="md2-section-head">Description</h4>
                {mod.description ? (
                    <div className="md2-rich-body">
                        {mod.description.split(/\n{2,}/).map((para, i) => (
                            <p key={i}>{para}</p>
                        ))}
                    </div>
                ) : (
                    <div className="md2-rich-body empty">
                        No description authored yet. Regenerate in CAD Lab or edit inline.
                    </div>
                )}
            </div>

            {/* ── Why this module matters ─────────────── */}
            <div className={`md2-why-matters${mod.whyItMatters ? "" : " empty"}`}>
                <h4>Why this module matters</h4>
                {mod.whyItMatters ?? "Mission-relevance not yet declared for this module."}
            </div>

            {/* ── Inputs / Outputs ────────────────────── */}
            <div className="md2-section-block">
                <h4 className="md2-section-head">Inputs &amp; outputs — interface contract</h4>
                <div className="md2-io-grid">
                    <div className="md2-io-col">
                        <h4>Inputs</h4>
                        {mod.inputs.length > 0 ? (
                            <div className="md2-io-list">
                                {mod.inputs.map((item, i) => (
                                    <span key={i} className="md2-io-pill input">
                                        {item}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div className="md2-io-empty">No inputs declared yet.</div>
                        )}
                    </div>
                    <div className="md2-io-arrow" aria-hidden="true">→</div>
                    <div className="md2-io-col">
                        <h4>Outputs</h4>
                        {mod.outputs.length > 0 ? (
                            <div className="md2-io-list">
                                {mod.outputs.map((item, i) => (
                                    <span key={i} className="md2-io-pill output">
                                        {item}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div className="md2-io-empty">No outputs declared yet.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Key components ──────────────────────── */}
            <div className="md2-section-block">
                <h4 className="md2-section-head">Key components</h4>
                {mod.keyParts.length > 0 ? (
                    <ul className="md2-icon-list">
                        {mod.keyParts.map((part, i) => (
                            <li key={i}>
                                <svg
                                    className="ico bullet"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    aria-hidden="true"
                                >
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                                <div>{part}</div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="md2-list-empty">No key components declared yet.</div>
                )}
            </div>

            {/* ── Failure modes ───────────────────────── */}
            <div className="md2-section-block">
                <h4 className="md2-section-head">Failure modes</h4>
                {mod.failureModes.length > 0 ? (
                    <ul className="md2-icon-list">
                        {mod.failureModes.map((f, i) => (
                            <li key={i}>
                                <svg
                                    className="ico warn"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    aria-hidden="true"
                                >
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                <div>{f}</div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="md2-list-empty">
                        No failure modes declared yet. Run specialist review to surface them.
                    </div>
                )}
            </div>

            {/* ── Unknowns ────────────────────────────── */}
            <div className="md2-section-block">
                <h4 className="md2-section-head">Unknowns</h4>
                {mod.unknowns.length > 0 ? (
                    <ul className="md2-icon-list">
                        {mod.unknowns.map((u, i) => (
                            <li key={i}>
                                <svg
                                    className="ico info"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    aria-hidden="true"
                                >
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <div>{u}</div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="md2-list-empty">No open questions recorded yet.</div>
                )}
            </div>

            {/* ── Fang review tile ────────────────────── */}
            <FangReviewSection
                projectId={project.id}
                moduleName={mod.name}
                fangRun={fangRun}
                fangReview={fangReview}
                runFangAction={runFangAction}
                fangDisabled={fangDisabled}
                fangDisabledReason={fangDisabledReason}
            />

            {/* ── Ask other specialists about this module ────
              *
              * Rather than spin up a parallel per-module pipeline for every
              * specialist (runJianReview, runMaxReview, etc. — each a
              * multi-day build), we deep-link into Ask-a-Specialist with
              * the specialist preselected and the topic pre-scoped to this
              * module. The Ask panel already has the project context (brief,
              * modules, BOM, risks, cost) pre-loaded, so the specialist can
              * speak about THIS module specifically without a new orchestrator.
              *
              * Covers the "I want Jian's engineering take on this module"
              * gap without paying pipeline-scale cost.
              */}
            <div className="md2-section-block">
                <h4 className="md2-section-head">Other specialist views</h4>
                <div className="md2-other-specialists">
                    {[
                        { id: "vp-engineering", name: "Jian", title: "VP Engineering", angle: "engineering risk, interfaces, verification path" },
                        { id: "cto", name: "Max", title: "CTO", angle: "architectural trade-offs, build-vs-buy, first principles" },
                        { id: "vp-supply-chain", name: "Chase", title: "VP Supply", angle: "long-lead parts, supplier qualification, single-string risk" },
                    ].map((s) => {
                        const topic = `${s.name}'s view on ${mod.name} for ${project.name}`
                        const href =
                            `/the-forge-v2/projects/${project.id}/ask` +
                            `?specialist=${s.id}` +
                            `&topic=${encodeURIComponent(topic)}`
                        return (
                            <Link
                                key={s.id}
                                href={href}
                                className="md2-other-specialist-chip"
                                title={`Ask ${s.name} about ${mod.name} — ${s.angle}`}
                            >
                                <strong>Ask {s.name}</strong>
                                <span className="title"> · {s.title}</span>
                                <span className="angle"> — {s.angle}</span>
                            </Link>
                        )
                    })}
                </div>
            </div>

            {/* ── Lead time pill ──────────────────────── */}
            {mod.leadWeeks != null ? (
                <div className="md2-lead-time-pill">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {mod.leadWeeks} weeks lead time
                    {mod.leadSourceLabel && (
                        <span className="source">· {mod.leadSourceLabel}</span>
                    )}
                </div>
            ) : (
                <div className="md2-lead-time-pill empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Lead time not yet estimated
                </div>
            )}

            {/* ── Design grounded in ──────────────────── */}
            <div className="md2-grounded-in">
                <div className="md2-grounded-in-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" />
                    </svg>
                    <span>Design grounded in</span>
                </div>
                {groundedIn.length > 0 ? (
                    <>
                        <div className="md2-grounded-pills">
                            {groundedIn.map((pill, i) =>
                                pill.href ? (
                                    <Link key={i} href={pill.href} className="md2-grounded-pill">
                                        <span className="diamond" />
                                        {pill.label}
                                    </Link>
                                ) : (
                                    <span key={i} className="md2-grounded-pill">
                                        <span className="diamond" />
                                        {pill.label}
                                    </span>
                                ),
                            )}
                        </div>
                        <p className="md2-grounded-footnote">
                            Specifications informed by verified engineering data — material
                            properties, ISO hardware dimensions, and process capability limits
                            from the ForgeOS engineering library.
                        </p>
                    </>
                ) : (
                    <div className="md2-grounded-empty">
                        No grounding references linked yet. Seed templates and material
                        properties attach here once the module is specified.
                    </div>
                )}
            </div>

            {/* ── Assembly composition ────────────────── */}
            <div className="md2-composition-card">
                <h3>
                    Assembly composition
                    {parts.length > 0 ? ` · ${parts.length} ${parts.length === 1 ? "part" : "parts"}` : ""}
                </h3>
                <div className="sub">
                    {parts.length > 0 ? (
                        <>
                            Derived from module key components
                            {currentMassKg != null
                                ? ` · current mass ${currentMassKg.toFixed(2)} kg`
                                : ""}
                            {budgetMassKg != null
                                ? ` · budget ${budgetMassKg.toFixed(2)} kg`
                                : ""}
                            {massDelta != null
                                ? ` · ${massDelta > 0 ? "+" : ""}${massDelta.toFixed(2)} kg margin`
                                : ""}
                            . Click any row to open the part.
                        </>
                    ) : (
                        "Parts breakdown ships once CAD generation writes a parts table."
                    )}
                </div>
                {parts.length > 0 ? (
                    <table className="md2-parts-table">
                        <thead>
                            <tr>
                                <th>Part</th>
                                <th className="tnum">Qty</th>
                                <th className="tnum">Mass</th>
                                <th>Material</th>
                                <th>Supplier</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parts.map((p) => (
                                <tr key={p.slug}>
                                    <td>
                                        <Link
                                            href={`/the-forge-v2/projects/${project.id}/modules/${mod.id}/parts/${encodeURIComponent(p.slug)}`}
                                            className="part-link"
                                        >
                                            {p.name}
                                        </Link>
                                    </td>
                                    <td className="tnum">{p.qty}</td>
                                    <td className="tnum">
                                        {p.massKg != null ? `${p.massKg.toFixed(2)} kg` : "—"}
                                    </td>
                                    <td>{p.material ?? "—"}</td>
                                    <td>{p.supplier ?? "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="md2-parts-empty">
                        No parts declared yet. Run CAD generation to populate this table.
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Subcomponents ──────────────────────────────────────────────────────

interface FangReviewSectionProps {
    projectId: string
    moduleName: string
    fangRun: ModuleDetailViewProps["fangRun"]
    fangReview: ModuleDetailFangReview | null
    runFangAction: ModuleDetailViewProps["runFangAction"]
    fangDisabled: boolean
    fangDisabledReason: string | null
}

/**
 * Renders the "Review with Fang" tile. Shape depends on state:
 *
 *   - No review yet, not-started  → empty card with CTA
 *   - Queued / Running            → empty card with "Fang is reviewing…" chip
 *   - Failed (no prior review)    → empty card with failure chip + Retry CTA
 *   - Populated (done or failed
 *     after a prior success)      → summary + issues + recs + "Reviewed Xm ago"
 *                                    (+ Re-run CTA on the right)
 */
function FangReviewSection({
    projectId: _projectId,
    moduleName,
    fangRun,
    fangReview,
    runFangAction,
    fangDisabled,
    fangDisabledReason,
}: FangReviewSectionProps): React.ReactElement {
    // VOID: _projectId currently unused — kept in signature so a future
    // deep-link to the full review markdown page is a one-line edit.
    void _projectId

    const isLive = fangRun.status === "queued" || fangRun.status === "running"
    const chipTimestamp =
        fangRun.status === "done"
            ? fangRun.finishedAt ?? fangRun.startedAt
            : fangRun.startedAt ?? fangRun.finishedAt
    const hasReview = fangReview != null
    const runDisabled = fangDisabled || isLive
    const runDisabledReason = fangDisabled
        ? fangDisabledReason ?? undefined
        : isLive
            ? "Fang is already reviewing this module."
            : undefined

    const ctaLabel = hasReview ? "Re-review with Fang" : "Review with Fang"

    if (!hasReview) {
        return (
            <div className="md2-section-block">
                <h4 className="md2-section-head">Manufacturing review</h4>
                <div className="md2-review-card empty">
                    <div className="md2-review-head">
                        <div>
                            <h3>
                                <ClipboardCheck size={16} aria-hidden="true" />
                                Fang · VP Manufacturing
                            </h3>
                            <div className="sub">
                                Per-module DFM check — tolerances, process fit, assembly notes.
                            </div>
                            {fangRun.status !== "not-started" && (
                                <div style={{ marginTop: 6 }}>
                                    <PipelineRunChip
                                        status={fangRun.status}
                                        specialistName="Fang"
                                        startedAt={chipTimestamp}
                                        errorCode={fangRun.errorCode}
                                        errorMessage={fangRun.errorMessage}
                                        compact
                                    />
                                </div>
                            )}
                        </div>
                        <div className="md2-review-cta">
                            <RunSpecialistButton
                                action={runFangAction}
                                label={ctaLabel}
                                subLabel="Fang · VP Manufacturing · ~45s"
                                variant="primary"
                                icon={<ClipboardCheck aria-hidden="true" />}
                                disabled={runDisabled}
                                disabledReason={runDisabledReason}
                            />
                        </div>
                    </div>
                    <p className="md2-review-summary">
                        {fangDisabled
                            ? fangDisabledReason ??
                              "Fang needs parts before she can review manufacturability."
                            : `No manufacturing review yet for ${moduleName}. Fang will look at tolerances, process fit, and assembly sequence.`}
                    </p>
                </div>
            </div>
        )
    }

    // Populated state
    const review = fangReview!
    const verdictLabel =
        review.verdict === "pass" ? "Pass" : review.verdict === "warn" ? "Watch" : "Fail"
    const reviewedRel = formatRelativeFromNow(review.reviewedAt)
    const visibleIssues = review.issues.slice(0, 6)
    const hiddenIssueCount = Math.max(0, review.issues.length - visibleIssues.length)

    return (
        <div className="md2-section-block">
            <h4 className="md2-section-head">Manufacturing review</h4>
            <div className="md2-review-card">
                <div className="md2-review-head">
                    <div>
                        <h3>
                            <ClipboardCheck size={16} aria-hidden="true" />
                            Fang · VP Manufacturing
                            <span className={`md2-review-verdict ${review.verdict}`}>
                                {verdictLabel}
                            </span>
                        </h3>
                        <div className="sub">
                            Reviewed by Fang {reviewedRel ? `· ${reviewedRel}` : ""}
                        </div>
                    </div>
                    <div className="md2-review-cta">
                        <RunSpecialistButton
                            action={runFangAction}
                            label={ctaLabel}
                            subLabel="Fang · VP Manufacturing · ~45s"
                            variant="secondary"
                            icon={<ClipboardCheck aria-hidden="true" />}
                            disabled={runDisabled}
                            disabledReason={runDisabledReason}
                        />
                    </div>
                </div>
                <p className="md2-review-summary">{review.summary}</p>
                {fangRun.status === "failed" && fangRun.errorMessage && (
                    <p className="md2-review-error">
                        Last re-run failed — {fangRun.errorMessage}
                    </p>
                )}
                {visibleIssues.length > 0 && (
                    <div className="md2-review-issues">
                        {visibleIssues.map((issue, i) => (
                            <div
                                key={i}
                                className={`md2-review-issue ${issue.severity}`}
                            >
                                <div>
                                    <span className="severity">{issue.severity}</span>
                                    <span className="category">{issue.category}:</span>{" "}
                                    {issue.message}
                                    {issue.suggestion && (
                                        <>
                                            <br />
                                            <em>Suggestion: {issue.suggestion}</em>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                        {hiddenIssueCount > 0 && (
                            <div className="md2-review-issue info">
                                <div>
                                    <span className="category">
                                        + {hiddenIssueCount} more
                                    </span>{" "}
                                    issue{hiddenIssueCount === 1 ? "" : "s"} — re-run to see
                                    the full review body.
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {review.recommendations.length > 0 && (
                    <ul className="md2-review-recs">
                        <li className="head">Recommendations</li>
                        {review.recommendations.slice(0, 5).map((rec, i) => (
                            <li key={i}>{rec}</li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}

/**
 * WorkspaceView — V2 project cockpit.
 *
 * Mockup-faithful port of FORGE-MOCKUP-WORKSPACE.html wired to real project
 * data. Class names, DOM structure, and section order all match the mockup
 * exactly — only the content inside each slot is data-driven now.
 *
 * Empty-state policy: when a data source doesn't exist yet (`risks`,
 * `suppliers`, `engagements`, `parts_spec'd`, `project-level cost ceiling`),
 * the corresponding slot renders its neutral empty-state variant with the
 * same visual footprint as the populated version. No fake numbers, no mockup
 * strings leaking through as fallbacks.
 *
 * Sections (top to bottom):
 *   1.  Breadcrumb
 *   2.  Project header (title + quick-stats + CTA stack)
 *   3.  Resumed card (amber blocker / green on-track / neutral welcome-back)
 *   4.  Health strip (4 cards — all empty-state pending real tables)
 *   5.  System illustration card (blueprint empty state — unchanged)
 *   6.  Define cluster (Brief / Modules / BOM)
 *   7.  Deliver cluster (Suppliers / Cost / Risks)
 *   8.  Support cluster (Experts / Geometry / Launch Checklist)
 *   9.  Engineering Intelligence
 *  10.  Known Challenges
 *  11.  Activity timeline
 */

"use client"

import Link from "next/link"
import "./workspace-v2.css"
import type { ProjectActivityEvent, ProjectResumeState } from "@/actions/project-workspace"
import {
    PipelineRunChip,
    type PipelineRunStatus,
} from "@/components/pipeline/pipeline-run-chip"

// ─── Props ────────────────────────────────────────────────────────────

export interface TopMaterialRow {
    materialCode: string
    materialName: string
    yieldStrengthMpa: number | null
    costPerKgUsd: number | null
}

export interface TopProcessRow {
    processName: string
    displayName: string
    toleranceTypicalMm: number | null
    minWallThicknessMm: number | null
}

export interface WorkspaceViewProps {
    project: {
        id: string
        name: string
        subject: string
        status: string
        designRevision: number
        createdAt: string
        updatedAt: string
        /** Blueprint / plan view. Rendered in the right-hand hero pane. */
        systemIllustrationUrl: string | null
        /** Photo-realistic render. Rendered in the left-hand hero pane. */
        conceptRenderUrl: string | null
    }
    header: {
        moduleCount: number
        partCount: number
        /** e.g. "50 units". Null when the brief hasn't captured a target yet. */
        quantityTarget: string | null
        /** Compliance text from the design brief, trimmed. Null when empty. */
        complianceNotes: string | null
    }
    resume: ProjectResumeState
    activity: ProjectActivityEvent[]
    cost: {
        totalUnitCostGbp: number | null
        unitCostCeilingGbp: number | null
        /** How many modules have a cost estimate. */
        moduleCount: number
    }
    challenges: {
        failureModes: Array<{ moduleName: string; text: string }>
        openQuestions: Array<{ moduleName: string; text: string }>
    }
    engineering: {
        materials: number
        hardware: number
        processes: number
        standards: number
    }
    topMaterials: TopMaterialRow[]
    topProcesses: TopProcessRow[]
    suppliers: SupplierShortlistRow[]
    /** Latest Max (CTO) decomposition run — drives the Modules tile chip. */
    maxRun: {
        status: PipelineRunStatus
        startedAt: string | null
        finishedAt: string | null
        errorCode: string | null
        errorMessage: string | null
    }
    /** Latest BOM generator run — drives the BOM tile chip. */
    bomRun: {
        status: PipelineRunStatus
        startedAt: string | null
        finishedAt: string | null
        errorCode: string | null
        errorMessage: string | null
    }
    /** Latest Chase (strategist) research run — drives the Brief tile chip. */
    chaseRun: {
        status: PipelineRunStatus
        startedAt: string | null
        finishedAt: string | null
        errorCode: string | null
        errorMessage: string | null
    }
    /** Latest Finn (finance-lead) cost estimate run — drives the Cost tile chip. */
    finnRun: {
        status: PipelineRunStatus
        startedAt: string | null
        finishedAt: string | null
        errorCode: string | null
        errorMessage: string | null
    }
    /** Brief lock status — drives the header revision badge. Non-overlapping
     *  with the Brief tile chip: that chip describes Chase's research run,
     *  this badge describes whether the brief is locked. */
    briefLock?: {
        isLocked: boolean
        /** e.g. "Rev A". Null when no revision exists yet. */
        revisionLabel: string | null
        /** ISO timestamp; null while draft. */
        lockedAt: string | null
    }
}

export interface SupplierShortlistRow {
    name: string
    type: string | null
    modulesMatched: number
    rampRole: string
}

// ─── View ─────────────────────────────────────────────────────────────

export function WorkspaceView(props: WorkspaceViewProps): React.ReactElement {
    const { project, header, resume, activity, cost, challenges, engineering, topMaterials, topProcesses, suppliers, maxRun, bomRun, chaseRun, finnRun, briefLock } = props

    // Base URL for the artefact deep-links. All routes are placeholders that
    // will resolve once the per-artefact pages ship in later rounds.
    const base = `/the-forge-v2/projects/${project.id}`

    // ── Empty-state detection ────────────────────────────────────────
    // A project is "empty" when it exists but nothing downstream has been
    // declared yet: no modules, no captured brief fields, no geometry, no
    // identified parts. In that state we render a purpose-built
    // empty-state variant (ported from FORGE-MOCKUP-EMPTY-WORKSPACE.html)
    // that leads with the Brief CTA and locks the other 8 artefact cards.
    // Populated projects take the full cockpit path below — unchanged.
    const isEmpty =
        header.moduleCount === 0 &&
        header.partCount === 0 &&
        !header.quantityTarget &&
        !header.complianceNotes &&
        !project.systemIllustrationUrl &&
        !project.conceptRenderUrl

    if (isEmpty) {
        return <EmptyWorkspaceView project={project} base={base} chaseRun={chaseRun} />
    }

    const subjectText = project.subject?.trim() || null
    const moduleSegment = header.moduleCount > 0 ? `${header.moduleCount} modules` : "— modules"
    const partSegment = header.partCount > 0 ? `${header.partCount} top-level parts` : "— parts"
    const revSegment = `revision ${project.designRevision} (${project.status || "draft"})`
    const subtitle = [subjectText, moduleSegment, partSegment, revSegment].filter(Boolean).join(" · ")

    const startedDate = formatDate(project.createdAt)
    const totalEngLibItems = engineering.materials + engineering.hardware + engineering.processes + engineering.standards

    const briefState = briefStateFor(header)
    const modulesState = modulesStateFor(header.moduleCount)
    const bomState = bomStateFor(header.partCount)
    const costState = costStateFor(cost)

    return (
        <div className="w2">
            {/* ── Breadcrumb ───────────────────────────────── */}
            <div className="w2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <span className="current">{project.name || "Untitled project"}</span>
            </div>

            {/* ── Project header ───────────────────────────── */}
            <div className="w2-project-header">
                <div className="title-block">
                    <h1>
                        <span className="dot" />
                        {project.name || "Untitled project"}
                        {briefLock && briefLock.revisionLabel ? (
                            <BriefLockBadge
                                isLocked={briefLock.isLocked}
                                revisionLabel={briefLock.revisionLabel}
                                briefLockHref={`${base}/brief-lock`}
                            />
                        ) : null}
                    </h1>
                    <div className="sub">{subtitle}</div>
                    <div className="quick-stats">
                        <div className="stat-inline"><span className="k">Target batch:</span><span className="v">{header.quantityTarget || "—"}</span></div>
                        <div className="stat-inline"><span className="k">Markets:</span><span className="v">Not declared</span></div>
                        <div className="stat-inline"><span className="k">Regulatory:</span><span className="v">{header.complianceNotes || "Not yet set"}</span></div>
                        <div className="stat-inline"><span className="k">Started:</span><span className="v">{startedDate || "—"}</span></div>
                    </div>
                </div>
                <div className="w2-cta-stack">
                    <Link href={`${base}/request`} className="w2-btn primary">Get quote</Link>
                    <Link href={`${base}/export`} className="w2-btn sm">Download report</Link>
                    <Link href={`${base}/fork`} className="w2-btn sm ghost">Fork revision →</Link>
                    <Link href="/the-forge-v2/new" className="w2-btn sm">+ New project</Link>
                </div>
            </div>

            {/* ── Resumed card ─────────────────────────────── */}
            <ResumedCard resume={resume} base={base} />

            {/* ── Health strip ─────────────────────────────── */}
            <div className="w2-health-strip">
                <div className="w2-health-card green">
                    <div className="label">What will bite you</div>
                    <div className="value">0 <small>open risks</small></div>
                    <div className="detail">Clean slate — no risks logged</div>
                </div>
                <div className={`w2-health-card ${suppliers.length > 0 ? "green" : "amber"}`}>
                    <div className="label">Who&apos;s on the hook</div>
                    <div className="value">{suppliers.length} <small>supplier{suppliers.length === 1 ? "" : "s"}</small></div>
                    <div className="detail">
                        {suppliers.length > 0
                            ? `${suppliers.filter((s) => s.rampRole === "primary").length} primary · `
                            : ""}
                        <Link href={`${base}/suppliers`}>/suppliers →</Link>
                    </div>
                </div>
                {cost.totalUnitCostGbp !== null ? (
                    <div className="w2-health-card amber">
                        <div className="label">Cost at this BOM</div>
                        <div className="value">{formatGbp(cost.totalUnitCostGbp)}<small>/unit rough</small></div>
                        <div className="detail">Module-level AI estimate · not a part-priced BOM · <Link href={`${base}/cost`}>/cost →</Link></div>
                    </div>
                ) : (
                    <div className="w2-health-card green">
                        <div className="label">Cost at this BOM</div>
                        <div className="value">—</div>
                        <div className="detail">Cost not yet estimated · <Link href={`${base}/bom`}>/bom →</Link></div>
                    </div>
                )}
                <div className="w2-health-card amber">
                    <div className="label">BOM maturity</div>
                    <div className="value">0<small>/{header.partCount} parts spec&apos;d</small></div>
                    <div className="detail">
                        {header.partCount > 0
                            ? <>{header.partCount} parts identified · none tagged with material, tolerance or supplier yet · <Link href={`${base}/bom`}>/bom →</Link></>
                            : <Link href={`${base}/bom`}>/bom →</Link>}
                    </div>
                </div>
            </div>

            {/* ── System illustration card — EMPTY state ───── */}
            <div className="w2-system-card">
                <div className="title-row">
                    <h3>System · {project.name || "Untitled project"}</h3>
                    <div className="revision">rev {project.designRevision} · {formatDate(project.updatedAt)}</div>
                </div>

                <div className="dual-panes">
                    <div className="pane">
                        <div className="pane-head">
                            <span>Nano Banana render</span>
                            <span className="style-tag-inline">{project.conceptRenderUrl ? "rev A" : "pending"}</span>
                        </div>
                        <div className="pane-body">
                            {project.conceptRenderUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={project.conceptRenderUrl}
                                    alt={`${project.name} concept render`}
                                    className="system-illustration"
                                />
                            ) : (
                                <BlueprintPaperPlaceholder label="Concept render" sub="Generates when CAD is imported or a style brief is approved" />
                            )}
                        </div>
                    </div>

                    <div className="pane">
                        <div className="pane-head">
                            <span>System blueprint · plan view</span>
                            <span className="style-tag-inline">{project.systemIllustrationUrl ? "rev A" : "pending"}</span>
                        </div>
                        <div className="pane-body">
                            {project.systemIllustrationUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={project.systemIllustrationUrl}
                                    alt={`${project.name} plan view blueprint`}
                                    className="system-illustration"
                                />
                            ) : (
                                <BlueprintPaperPlaceholder label="Plan view" sub="Renders from module geometry once modules are stable" />
                            )}
                        </div>
                    </div>
                </div>

                <div className="legend">
                    <div className="item"><div className="dot-sm" style={{ background: "rgba(255,255,255,0.85)" }} />Primary structure</div>
                    <div className="item"><div className="dot-sm" style={{ background: "#0f172a" }} />Subsystem allocations</div>
                    <div className="item"><div className="dot-sm" style={{ background: "rgba(255,255,255,0.98)" }} />Fittings &amp; hardware</div>
                </div>
            </div>

            {/* ── DEFINE cluster ───────────────────────────── */}
            <div className="w2-section-label">Define — what you&apos;re making</div>
            <div className="w2-artefact-grid">
                {/* BRIEF */}
                <Link href={`${base}/brief`} className={`w2-art-card state-${briefState.state}`}>
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                <rect x="8" y="2" width="8" height="4" rx="1" />
                                <path d="M9 12h6M9 16h4" />
                            </svg>
                        </span>
                        {/* When Chase has actually touched this project, the
                            PipelineRunChip replaces the static tile chip so
                            founders see "Chase is working…" / "Done 3m ago" /
                            "Failed" instead of a stale "Draft / Not started"
                            badge. Falls back to the static chip pre-first-run. */}
                        {chaseRun.status === "not-started" ? (
                            <span className={`w2-chip ${briefState.chipTone} solid`}>{briefState.chipText}</span>
                        ) : (
                            <PipelineRunChip
                                status={chaseRun.status}
                                specialistName="Chase"
                                startedAt={
                                    chaseRun.status === "done"
                                        ? chaseRun.finishedAt ?? chaseRun.startedAt
                                        : chaseRun.startedAt ?? chaseRun.finishedAt
                                }
                                errorCode={chaseRun.errorCode}
                                errorMessage={chaseRun.errorMessage}
                                compact
                            />
                        )}
                    </div>
                    <h3>Brief</h3>
                    <div className="subtitle">Intent · target markets · regulatory envelope</div>
                    <div className="body-line">{briefState.bodyLine}</div>
                    <div className="chips">
                        {header.complianceNotes && <span className="w2-chip info">{truncate(header.complianceNotes, 32)}</span>}
                        <span className="w2-chip">rev {project.designRevision}</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Brief →</span>
                        <span className="grounding">{briefState.grounding}</span>
                    </div>
                </Link>

                {/* MODULES */}
                <Link href={`${base}/modules`} className={`w2-art-card state-${modulesState.state}`}>
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" rx="1" />
                                <rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" />
                                <rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                        </span>
                        {/* When Max has actually touched this project, the
                            PipelineRunChip replaces the static tile chip so
                            founders see "Max is working…" / "Done 4m ago" /
                            "Failed" instead of a stale "Not yet decomposed"
                            badge. Falls back to the static chip pre-first-run. */}
                        {maxRun.status === "not-started" ? (
                            <span className={`w2-chip ${modulesState.chipTone} solid`}>{modulesState.chipText}</span>
                        ) : (
                            <PipelineRunChip
                                status={maxRun.status}
                                specialistName="Max"
                                startedAt={
                                    maxRun.status === "done"
                                        ? maxRun.finishedAt ?? maxRun.startedAt
                                        : maxRun.startedAt ?? maxRun.finishedAt
                                }
                                errorCode={maxRun.errorCode}
                                errorMessage={maxRun.errorMessage}
                                compact
                            />
                        )}
                    </div>
                    <h3>Modules</h3>
                    <div className="subtitle">Decomposition · interfaces · failure modes</div>
                    <div className="body-line">{modulesState.bodyLine}</div>
                    <div className="chips">
                        {header.moduleCount > 0 && <span className="w2-chip info">{header.moduleCount} module{header.moduleCount === 1 ? "" : "s"}</span>}
                        {challenges.failureModes.length > 0 && <span className="w2-chip warning">{challenges.failureModes.length} failure mode{challenges.failureModes.length === 1 ? "" : "s"}</span>}
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Modules →</span>
                        <span className="grounding">{modulesState.grounding}</span>
                    </div>
                </Link>

                {/* BOM */}
                <Link href={`${base}/bom`} className={`w2-art-card state-${bomState.state}`}>
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="8" y1="6" x2="21" y2="6" />
                                <line x1="8" y1="12" x2="21" y2="12" />
                                <line x1="8" y1="18" x2="21" y2="18" />
                                <line x1="3" y1="6" x2="3.01" y2="6" />
                                <line x1="3" y1="12" x2="3.01" y2="12" />
                                <line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                        </span>
                        {/* Same pattern as Modules: once the BOM orchestrator
                            has touched this project, the PipelineRunChip
                            replaces the static tile chip so founders see
                            "Max is working…" / "Done 4m ago" / "Failed"
                            instead of a stale "No parts yet" badge. */}
                        {bomRun.status === "not-started" ? (
                            <span className={`w2-chip ${bomState.chipTone} solid`}>{bomState.chipText}</span>
                        ) : (
                            <PipelineRunChip
                                status={bomRun.status}
                                specialistName="Max"
                                startedAt={
                                    bomRun.status === "done"
                                        ? bomRun.finishedAt ?? bomRun.startedAt
                                        : bomRun.startedAt ?? bomRun.finishedAt
                                }
                                errorCode={bomRun.errorCode}
                                errorMessage={bomRun.errorMessage}
                                compact
                            />
                        )}
                    </div>
                    <h3>BOM</h3>
                    <div className="subtitle">Parts · qty · material · tolerance · supplier · cost</div>
                    <div className="body-line">{bomState.bodyLine}</div>
                    <div className="chips">
                        {header.partCount > 0 && <span className="w2-chip info">{header.partCount} parts</span>}
                        <span className="w2-chip">rev {project.designRevision}</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open BOM →</span>
                        <span className="grounding">{bomState.grounding}</span>
                    </div>
                </Link>
            </div>

            {/* ── DELIVER cluster ──────────────────────────── */}
            <div className="w2-section-label">Deliver — who builds it · how much · what breaks</div>
            <div className="w2-artefact-grid">
                {/* SUPPLIERS */}
                <Link href={`${base}/suppliers`} className="w2-art-card state-grey">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 20h20" />
                                <path d="M2 20V8l5 3V8l5 3V8l5 3V8l5 3v9" />
                                <rect x="8" y="15" width="2" height="2" />
                                <rect x="14" y="15" width="2" height="2" />
                            </svg>
                        </span>
                        <span className="w2-chip solid">No suppliers yet</span>
                    </div>
                    <h3>Suppliers</h3>
                    <div className="subtitle">Lifecycle · NDA · RFQ · quotes · awards</div>
                    <div className="body-line">No suppliers engaged on this project yet. Engage one from the <Link href="/the-forge-v2/suppliers">Suppliers directory</Link>.</div>
                    <div className="chips">
                        <span className="w2-chip">0 identified</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Suppliers →</span>
                        <span className="grounding">—</span>
                    </div>
                </Link>

                {/* COST */}
                <Link href={`${base}/cost`} className={`w2-art-card state-${costState.state}`}>
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M15 9.5a3 3 0 0 0-3-2.5c-1.66 0-3 1.34-3 3 0 .83.34 1.58.88 2.12m.12 2.88h5.5M8 17h7" />
                            </svg>
                        </span>
                        {/* When Finn has actually touched this project, the
                            PipelineRunChip replaces the static tile chip so
                            founders see "Finn is working…" / "Done 4m ago" /
                            "Failed" instead of a stale "Not estimated" badge.
                            Falls back to the static chip pre-first-run. */}
                        {finnRun.status === "not-started" ? (
                            <span className={`w2-chip ${costState.chipTone} solid`}>{costState.chipText}</span>
                        ) : (
                            <PipelineRunChip
                                status={finnRun.status}
                                specialistName="Finn"
                                startedAt={
                                    finnRun.status === "done"
                                        ? finnRun.finishedAt ?? finnRun.startedAt
                                        : finnRun.startedAt ?? finnRun.finishedAt
                                }
                                errorCode={finnRun.errorCode}
                                errorMessage={finnRun.errorMessage}
                                compact
                            />
                        )}
                    </div>
                    <h3>Cost</h3>
                    <div className="subtitle">Unit · landed · tooling · labour · solar</div>
                    <div className="body-line">{costState.bodyLine}</div>
                    <div className="chips">
                        {cost.moduleCount > 0 && <span className="w2-chip info">{cost.moduleCount} module estimate{cost.moduleCount === 1 ? "" : "s"}</span>}
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Cost →</span>
                        <span className="grounding">{costState.grounding}</span>
                    </div>
                </Link>

                {/* RISKS */}
                <Link href={`${base}/risks`} className="w2-art-card state-green">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </span>
                        <span className="w2-chip success solid">0 open</span>
                    </div>
                    <h3>Risks</h3>
                    <div className="subtitle">Compliance · supply · lead · cost · mass</div>
                    <div className="body-line">No risks logged yet — clean slate. Specialists add risks during module review and supplier triage.</div>
                    <div className="chips">
                        <span className="w2-chip">0 blocking</span>
                        <span className="w2-chip">0 medium</span>
                        <span className="w2-chip">0 low</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Risks →</span>
                        <span className="grounding">—</span>
                    </div>
                </Link>
            </div>

            {/* ── SUPPORT cluster ──────────────────────────── */}
            <div className="w2-section-label">Support — help · geometry · shipping</div>
            <div className="w2-artefact-grid">
                {/* EXPERTS */}
                <Link href={`${base}/experts`} className="w2-art-card state-grey">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                                <path d="M6 12v5c3 3 9 3 12 0v-5" />
                            </svg>
                        </span>
                        <span className="w2-chip solid">None engaged</span>
                    </div>
                    <h3>Experts</h3>
                    <div className="subtitle">Fractional exec bookings for this project</div>
                    <div className="body-line">No specialist retained on this project yet.</div>
                    <div className="chips">
                        <span className="w2-chip">0 retained</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Experts →</span>
                        <span className="grounding">—</span>
                    </div>
                </Link>

                {/* GEOMETRY */}
                <Link href={`${base}/geometry`} className="w2-art-card state-grey">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                        </span>
                        <span className="w2-chip solid">No CAD yet</span>
                    </div>
                    <h3>Geometry</h3>
                    <div className="subtitle">CAD files · renders · revision history</div>
                    <div className="body-line">No STEP uploaded and no renders generated yet.</div>
                    <div className="chips">
                        <span className="w2-chip">0 STEP</span>
                        <span className="w2-chip">0 renders</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Geometry →</span>
                        <span className="grounding">—</span>
                    </div>
                </Link>

                {/* LAUNCH CHECKLIST */}
                <Link href={`${base}/launch`} className="w2-art-card state-grey">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                                <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                            </svg>
                        </span>
                        <span className="w2-chip solid">Not started</span>
                    </div>
                    <h3>Launch Checklist</h3>
                    <div className="subtitle">FAI · compliance · packaging · shipping</div>
                    <div className="body-line">Unlocks on first award.</div>
                    <div className="chips">
                        <span className="w2-chip">Awaits 1st award</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Preview Launch →</span>
                        <span className="grounding">one-shot</span>
                    </div>
                </Link>
            </div>

            {/* ── Engineering Intelligence ─────────────────── */}
            {totalEngLibItems > 0 ? (
                <div className="w2-eng-intel">
                    <div className="w2-eng-intel-head">
                        <div className="icon-wrap">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" />
                                <path d="M9 12l2 2 4-4" />
                            </svg>
                        </div>
                        <div>
                            <h2>Engineering Intelligence</h2>
                            <div className="sub">
                                <span className="num">{engineering.materials}</span> indexed materials ·{" "}
                                <span className="num">{engineering.hardware}</span> hardware items ·{" "}
                                <span className="num">{engineering.processes}</span> manufacturing processes ·{" "}
                                <span className="num">{engineering.standards}</span> design standards
                            </div>
                            <div className="sub" style={{ fontSize: 11, marginTop: 4, opacity: 0.75 }}>
                                Static library — properties seeded from manufacturer datasheets. Prices are reference values, not live-quoted.
                            </div>
                        </div>
                    </div>

                    {/* Material Properties */}
                    {engineering.materials > 0 && (
                        <div className="w2-eng-intel-section">
                            <div className="sec-head">
                                <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                    <polyline points="2 17 12 22 22 17" />
                                    <polyline points="2 12 12 17 22 12" />
                                </svg>
                                <h3>Material Properties</h3>
                                <span className="count">{engineering.materials} indexed</span>
                            </div>
                            {topMaterials.map((m) => (
                                <div className="w2-material-row" key={m.materialCode}>
                                    <span className="grade">{m.materialCode}</span>
                                    <span className="name">{m.materialName}</span>
                                    <span className="yield-val">{m.yieldStrengthMpa !== null ? `${m.yieldStrengthMpa} MPa` : "—"}</span>
                                    <span className="price">{m.costPerKgUsd !== null ? `$${m.costPerKgUsd.toFixed(2)}/kg` : "—"}</span>
                                </div>
                            ))}
                            <Link href="/the-forge-v2/library/materials" className="w2-view-all">View all {engineering.materials} →</Link>
                        </div>
                    )}

                    {/* Hardware Library */}
                    {engineering.hardware > 0 && (
                        <div className="w2-eng-intel-section">
                            <div className="sec-head">
                                <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                </svg>
                                <h3>Hardware Library</h3>
                                <span className="count">{engineering.hardware} standard components</span>
                            </div>
                            <div className="inline-desc"><strong>{engineering.hardware}</strong> standard components — bolts, nuts, washers, bearings with exact clearance holes and load ratings.</div>
                        </div>
                    )}

                    {/* Process Capabilities */}
                    {engineering.processes > 0 && (
                        <div className="w2-eng-intel-section">
                            <div className="sec-head">
                                <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                                <h3>Process Capabilities</h3>
                                <span className="count">{engineering.processes} processes</span>
                            </div>
                            <div className="w2-process-grid">
                                {topProcesses.map((p) => (
                                    <ProcessRow
                                        key={p.processName}
                                        name={p.displayName}
                                        tol={p.toleranceTypicalMm !== null ? `±${p.toleranceTypicalMm}mm` : "—"}
                                        wall={p.minWallThicknessMm !== null ? `${p.minWallThicknessMm}mm min wall` : "—"}
                                    />
                                ))}
                            </div>
                            <Link href="/the-forge-v2/library/processes" className="w2-view-all">View all {engineering.processes} processes →</Link>
                        </div>
                    )}

                    {/* Supplier Intelligence — reads from forge_supplier_shortlist */}
                    <div className="w2-eng-intel-section">
                        <div className="sec-head">
                            <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <path d="M9 21V9h6v12" />
                                <line x1="3" y1="9" x2="21" y2="9" />
                            </svg>
                            <h3>Supplier Intelligence</h3>
                            <span className="count">
                                {suppliers.length > 0
                                    ? `${suppliers.length} shortlisted`
                                    : "No suppliers yet"}
                            </span>
                        </div>
                        {suppliers.length > 0 ? (
                            <>
                                <div className="w2-role-legend">
                                    <span className="w2-role-dot role-primary" aria-hidden="true" /> Primary ramp candidate
                                    <span className="w2-role-dot role-secondary" aria-hidden="true" /> Secondary
                                    <span className="w2-role-dot role-backup" aria-hidden="true" /> Backup
                                </div>
                                {suppliers.slice(0, 5).map((s) => {
                                    const role = (s.rampRole || "secondary").toLowerCase()
                                    const roleLabel =
                                        role === "primary" ? "Primary" :
                                            role === "backup" ? "Backup" :
                                                "Secondary"
                                    return (
                                        <div className="w2-supplier-row" key={s.name}>
                                            <span className={`w2-role-dot role-${role}`} aria-hidden="true" />
                                            <span className="name">{s.name}</span>
                                            <span className="meta">{s.modulesMatched} module{s.modulesMatched === 1 ? "" : "s"} · {s.type ?? "supplier"}</span>
                                            <span className={`w2-role-chip role-${role}`}>{roleLabel}</span>
                                        </div>
                                    )
                                })}
                                <Link href={`${base}/suppliers`} className="w2-view-all">View all {suppliers.length} suppliers →</Link>
                            </>
                        ) : (
                            <div className="inline-desc">
                                No suppliers shortlisted yet. Run <Link href={`${base}/suppliers`}>Supplier match</Link> to score candidates against the BOM.
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="w2-eng-intel">
                    <div className="w2-eng-intel-head">
                        <div className="icon-wrap">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" />
                            </svg>
                        </div>
                        <div>
                            <h2>Engineering Intelligence</h2>
                            <div className="sub">Engineering library not yet seeded.</div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Known Challenges ─────────────────────────── */}
            <div className="w2-known-challenges">
                <div className="w2-kc-head">
                    <div className="icon-wrap">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    </div>
                    <div>
                        <h2>Known Challenges</h2>
                        <div className="sub">{challenges.failureModes.length + challenges.openQuestions.length} items across {header.moduleCount} module{header.moduleCount === 1 ? "" : "s"}</div>
                    </div>
                </div>

                {challenges.failureModes.length === 0 && challenges.openQuestions.length === 0 ? (
                    <div className="w2-kc-grid">
                        <div className="w2-kc-col">
                            <p style={{ fontSize: 13, color: "var(--w-fg-muted)", margin: "8px 0 0" }}>
                                No known challenges recorded yet. Specialists add these during module review.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="w2-kc-grid">
                        <div className="w2-kc-col">
                            <h3><span className="dot fail" />Failure Modes</h3>
                            {challenges.failureModes.map((f, i) => (
                                <KcRow key={`f-${i}`} mod={`${f.moduleName}:`} text={f.text} />
                            ))}
                            {challenges.failureModes.length === 0 && (
                                <p style={{ fontSize: 12, color: "var(--w-fg-muted)" }}>No failure modes logged yet.</p>
                            )}
                        </div>
                        <div className="w2-kc-col">
                            <h3><span className="dot q" />Open Questions</h3>
                            {challenges.openQuestions.map((q, i) => (
                                <KcRow key={`q-${i}`} mod={`${q.moduleName}:`} text={q.text} />
                            ))}
                            {challenges.openQuestions.length === 0 && (
                                <p style={{ fontSize: 12, color: "var(--w-fg-muted)" }}>No open questions logged yet.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Activity timeline ────────────────────────── */}
            <div className="w2-timeline">
                <h3>Recent activity on this project</h3>

                {activity.length === 0 ? (
                    <div className="item">
                        <div className="when">—</div>
                        <div className="avatar-sm avatar-user">·</div>
                        <div className="body">No activity yet on this project.</div>
                    </div>
                ) : (
                    activity.map((ev, i) => (
                        <div className="item" key={`${ev.at}-${i}`}>
                            <div className="when">{formatRelative(ev.at)}</div>
                            <div className="avatar-sm avatar-user">{ev.who.initials}</div>
                            <div className="body">
                                <strong>{ev.who.name}</strong> {ev.body}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

// ─── Empty-state variant ──────────────────────────────────────────────
// Port of FORGE-MOCKUP-EMPTY-WORKSPACE.html. Used when a project has been
// created but no brief fields, modules, parts or geometry exist yet. The
// Brief is the only unlocked artefact; the other eight are locked behind
// Brief-lock with a tooltip-style tag. Copy is first-person, British
// English, and leads with the useful next step rather than the gap.

interface EmptyProjectHeader {
    id: string
    name: string
    designRevision: number
    createdAt: string
}

function EmptyWorkspaceView({
    project,
    base,
    chaseRun,
}: {
    project: EmptyProjectHeader
    base: string
    chaseRun: WorkspaceViewProps["chaseRun"]
}): React.ReactElement {
    const createdRelative = formatRelative(project.createdAt)
    const briefFieldsDone = 0
    const briefFieldsTotal = 6
    const remaining = briefFieldsTotal - briefFieldsDone

    return (
        <div className="w2">
            {/* ── Breadcrumb ───────────────────────────────── */}
            <div className="w2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <span className="current">{project.name || "Untitled project"}</span>
            </div>

            {/* ── Project header ───────────────────────────── */}
            <div className="w2-es-header">
                <h1>
                    <span className="dot" />
                    {project.name || "Untitled project"}
                    <span className="w2-es-pill">Brief draft · {briefFieldsDone} of {briefFieldsTotal} keys done</span>
                </h1>
                <div className="w2-es-sub">
                    Created {createdRelative} · rev {project.designRevision} · no modules, no BOM, no suppliers, no risks yet
                </div>
            </div>

            {/* ── Lifecycle meta-bar ───────────────────────── */}
            <div className="w2-es-meta-bar">
                <div className="title">Lifecycle</div>
                <div className="stages">
                    <div className="stage"><div className="num">01</div><div className="name">Hypothesis</div></div>
                    <span className="arrow">▸</span>
                    <div className="stage active"><div className="num">02</div><div className="name">Brief draft</div></div>
                    <span className="arrow">▸</span>
                    <div className="stage"><div className="num">03</div><div className="name">Build</div></div>
                    <span className="arrow">▸</span>
                    <div className="stage"><div className="num">04</div><div className="name">Ship</div></div>
                    <span className="arrow">▸</span>
                    <div className="stage"><div className="num">05</div><div className="name">In market</div></div>
                </div>
            </div>

            {/* ── Brief callout ────────────────────────────── */}
            <div className="w2-es-brief-callout">
                <div className="icon" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" />
                        <path d="M9 12h6M9 16h4" />
                    </svg>
                </div>
                <div className="body">
                    <h3>Your Brief is in draft</h3>
                    {/* When Chase is running / done / failed, surface it in
                        the biggest empty-state callout so a founder who's
                        just kicked Chase off can see progress without
                        having to navigate into the Brief page. */}
                    {chaseRun.status !== "not-started" && (
                        <div style={{ marginBottom: 8 }}>
                            <PipelineRunChip
                                status={chaseRun.status}
                                specialistName="Chase"
                                startedAt={
                                    chaseRun.status === "done"
                                        ? chaseRun.finishedAt ?? chaseRun.startedAt
                                        : chaseRun.startedAt ?? chaseRun.finishedAt
                                }
                                errorCode={chaseRun.errorCode}
                                errorMessage={chaseRun.errorMessage}
                            />
                        </div>
                    )}
                    <p>
                        Finish the 6 Key Requirements to unlock Modules, BOM, Suppliers, Risks, Cost, Specialists, Geometry, and Launch. <strong>{briefFieldsDone} of {briefFieldsTotal}</strong> done — <strong>{remaining} remaining</strong>: intended use, target cost, performance envelope, regulatory surface, materials constraint, launch window.
                    </p>
                </div>
                <Link href={`${base}/brief`} className="cta">Continue drafting →</Link>
            </div>

            {/* ── 9-artefact grid ──────────────────────────── */}
            <div className="w2-es-artefact-grid">
                <Link href={`${base}/brief`} className="w2-es-art-card">
                    <div className="ic">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                            <rect x="8" y="2" width="8" height="4" rx="1" />
                            <path d="M9 12h6M9 16h4" />
                        </svg>
                    </div>
                    {/* When Chase has actually touched this project, surface
                        the PipelineRunChip on the empty-state Brief card too.
                        Without this, a founder who kicks off Chase from the
                        Brief page has no way to see "Chase is working…" from
                        the workspace — the whole project row shows the
                        empty-state variant until Chase writes the first
                        research fields. */}
                    {chaseRun.status !== "not-started" && (
                        <div style={{ marginBottom: 8 }}>
                            <PipelineRunChip
                                status={chaseRun.status}
                                specialistName="Chase"
                                startedAt={
                                    chaseRun.status === "done"
                                        ? chaseRun.finishedAt ?? chaseRun.startedAt
                                        : chaseRun.startedAt ?? chaseRun.finishedAt
                                }
                                errorCode={chaseRun.errorCode}
                                errorMessage={chaseRun.errorMessage}
                                compact
                            />
                        </div>
                    )}
                    <h4>Brief</h4>
                    <p>{briefFieldsDone} of {briefFieldsTotal} Keys complete. This is the contract that gates everything else.</p>
                    <span className="action">Continue drafting →</span>
                </Link>

                <LockedArtCard title="Modules" copy="Decomposes the system into subsystem modules, each with its own failure-mode register and interface spec.">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                </LockedArtCard>

                <LockedArtCard title="BOM" copy="The bill of materials. Parts, quantities, materials, live cost roll-up.">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                </LockedArtCard>

                <LockedArtCard title="Suppliers" copy="Shortlisted, scored, RFQ in flight. Cert validity live-checked.">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 20h20" />
                        <path d="M2 20V8l5 3V8l5 3V8l5 3V8l5 3v9" />
                        <rect x="8" y="15" width="2" height="2" />
                        <rect x="14" y="15" width="2" height="2" />
                    </svg>
                </LockedArtCard>

                <LockedArtCard title="Risks" copy="Register of open, accepted, and resolved risks. Auto-surfaced from module failure modes.">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                </LockedArtCard>

                <LockedArtCard title="Cost" copy="Unit cost envelope: BOM + NRE + overhead. Waterfall traced to every line.">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M15 9.5a3 3 0 0 0-3-2.5c-1.66 0-3 1.34-3 3 0 .83.34 1.58.88 2.12m.12 2.88h5.5M8 17h7" />
                    </svg>
                </LockedArtCard>

                <LockedArtCard title="Specialists" copy="Per-module role input — CTO, VP manufacturing, supply chain, safety, legal.">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                        <path d="M6 12v5c3 3 9 3 12 0v-5" />
                    </svg>
                </LockedArtCard>

                <LockedArtCard title="Geometry" copy="CAD sync from Onshape or Solidworks. System illustration and per-module renders.">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                </LockedArtCard>

                <LockedArtCard title="Launch" copy="Regulatory filings, DHL / Maersk logistics, customer list, comms plan.">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                    </svg>
                </LockedArtCard>
            </div>

            {/* ── Side row: Engineering Intelligence + Known Challenges ── */}
            <div className="w2-es-side-row">
                <div className="w2-es-side-panel">
                    <h3>Engineering Intelligence</h3>
                    <div className="empty-msg">
                        Library will populate once materials are referenced in your BOM. You&apos;ll see <strong>alloy datasheets, supplier cert history, past DFM flags, and in-kind substitutes</strong>. Library entries persist across projects in your foundry.
                    </div>
                </div>

                <div className="w2-es-side-panel">
                    <h3>Known Challenges</h3>
                    <div className="empty-msg">
                        Will populate from <strong>module Failure Modes</strong> and <strong>open Unknowns</strong> once the Brief is locked and modules are scaffolded. These are the things that could kill the build — surfaced early, tracked till closed.
                    </div>
                </div>
            </div>
        </div>
    )
}

function LockedArtCard({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
    return (
        <div className="w2-es-art-card locked" aria-disabled="true">
            <div className="lock-tag">Brief-lock required</div>
            <div className="ic">{children}</div>
            <h4>{title}</h4>
            <p>{copy}</p>
        </div>
    )
}

// ─── Resumed card ─────────────────────────────────────────────────────

function ResumedCard({ resume, base }: { resume: ProjectResumeState; base: string }): React.ReactElement {
    // Case A: active blocker — the amber card (mockup default).
    if (resume.blocker) {
        return (
            <div className="w2-resumed">
                <div>
                    <div className="kicker">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Where you left off{resume.lastTouched ? ` · ${formatRelative(resume.lastTouched)}` : ""}
                    </div>
                    <h2>{resume.blocker.title}</h2>
                    <p>{resume.blocker.summary}</p>
                    <div className="grounding-line">{resume.blocker.grounding}</div>
                </div>
                <div className="w2-cta-stack">
                    <Link href={resume.blocker.resumeCta.href} className="w2-btn primary">{resume.blocker.resumeCta.label}</Link>
                </div>
            </div>
        )
    }

    // Case B: user has touched this project before and we know where — green on-track card.
    if (resume.lastTouched && resume.lastSurface) {
        return (
            <div className="w2-resumed">
                <div>
                    <div className="kicker">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Where you left off · {formatRelative(resume.lastTouched)}
                    </div>
                    <h2>You&apos;re on track — no open blockers</h2>
                    <p>
                        Last worked on <strong>{resume.lastSurface.label}</strong>. Pick up where you stopped, or move to the next artefact.
                    </p>
                    <div className="grounding-line">—</div>
                </div>
                <div className="w2-cta-stack">
                    <Link href={resume.lastSurface.href} className="w2-btn primary">Resume on {resume.lastSurface.label}</Link>
                </div>
            </div>
        )
    }

    // Case C: nothing to resume — neutral welcome-back card.
    return (
        <div className="w2-resumed">
            <div>
                <div className="kicker">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Welcome back
                </div>
                <h2>Start with the Brief</h2>
                <p>
                    You haven&apos;t opened this project yet. The Brief locks intent, markets and the regulatory envelope — everything downstream plugs into it.
                </p>
                <div className="grounding-line">—</div>
            </div>
            <div className="w2-cta-stack">
                <Link href={`${base}/brief`} className="w2-btn primary">Start with Brief →</Link>
            </div>
        </div>
    )
}

// ─── Artefact-card state helpers ──────────────────────────────────────

interface CardState {
    state: "green" | "amber" | "red" | "grey"
    chipTone: "success" | "warning" | "danger" | "info" | ""
    chipText: string
    bodyLine: string
    grounding: string
}

function briefStateFor(header: WorkspaceViewProps["header"]): CardState {
    let fields = 0
    if (header.quantityTarget) fields++
    if (header.complianceNotes) fields++
    // INTENT: we only know two brief fields from today's project row; the
    // denominator is a best-effort lower bound. The Brief page will expose
    // the full count when it ships.
    const total = 2
    if (fields === 0) {
        return {
            state: "grey",
            chipTone: "",
            chipText: "Not started",
            bodyLine: "The Brief locks intent, markets and the regulatory envelope.",
            grounding: "0/— fields",
        }
    }
    if (fields < total) {
        return {
            state: "amber",
            chipTone: "warning",
            chipText: "Draft",
            bodyLine: "Brief is partially captured — finish the remaining fields to lock it.",
            grounding: `${fields}/${total} fields filled`,
        }
    }
    return {
        state: "green",
        chipTone: "success",
        chipText: "Complete",
        bodyLine: "Brief is locked. Markets, regulatory and quantity target all declared.",
        grounding: `${fields}/${total} fields`,
    }
}

function modulesStateFor(count: number): CardState {
    if (count === 0) {
        return {
            state: "grey",
            chipTone: "",
            chipText: "Not yet decomposed",
            bodyLine: "No modules yet. Decomposition lands in the Specify stage.",
            grounding: "—",
        }
    }
    return {
        state: "green",
        chipTone: "success",
        chipText: `${count} stable`,
        bodyLine: `${count} module${count === 1 ? "" : "s"} decomposed. Interface contracts live on the Modules page.`,
        grounding: "DB-backed",
    }
}

function bomStateFor(partCount: number): CardState {
    if (partCount === 0) {
        return {
            state: "grey",
            chipTone: "",
            chipText: "No parts yet",
            bodyLine: "BOM is empty. Parts show here once modules declare key parts.",
            grounding: "—",
        }
    }
    return {
        state: "amber",
        chipTone: "warning",
        chipText: `${partCount} parts`,
        bodyLine: `${partCount} top-level part${partCount === 1 ? "" : "s"} identified. None spec'd with material / tolerance / supplier yet.`,
        grounding: "DB-backed",
    }
}

function costStateFor(cost: WorkspaceViewProps["cost"]): CardState {
    if (cost.totalUnitCostGbp === null) {
        return {
            state: "grey",
            chipTone: "",
            chipText: "Not estimated",
            bodyLine: "Cost not yet estimated. The Cost page builds this from per-module estimates + quotes.",
            grounding: "—",
        }
    }
    return {
        state: "amber",
        chipTone: "warning",
        chipText: "Estimate only",
        bodyLine: `${formatGbp(cost.totalUnitCostGbp)}/unit all-in, estimated across ${cost.moduleCount} module${cost.moduleCount === 1 ? "" : "s"}.`,
        grounding: `${cost.moduleCount} module estimate${cost.moduleCount === 1 ? "" : "s"}`,
    }
}

// ─── Small helpers ────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
    if (s.length <= n) return s
    return s.slice(0, n - 1).trimEnd() + "…"
}

function formatDate(iso: string | null | undefined): string {
    if (!iso) return ""
    try {
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) return ""
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    } catch {
        return ""
    }
}

function formatRelative(iso: string | null | undefined): string {
    if (!iso) return "—"
    try {
        const then = new Date(iso).getTime()
        if (Number.isNaN(then)) return "—"
        const diffMs = Date.now() - then
        if (diffMs < 60_000) return "just now"
        const mins = Math.floor(diffMs / 60_000)
        if (mins < 60) return `${mins}m ago`
        const hrs = Math.floor(mins / 60)
        if (hrs < 24) return `${hrs}h ago`
        const days = Math.floor(hrs / 24)
        if (days === 1) return "yesterday"
        if (days < 7) return `${days}d ago`
        return formatDate(iso)
    } catch {
        return "—"
    }
}

function formatGbp(n: number): string {
    if (!Number.isFinite(n)) return "—"
    if (n >= 1000) {
        return `£${(n / 1000).toFixed(1)}k`
    }
    return `£${Math.round(n)}`
}

// ─── Reused presentational helpers (ported from v1) ───────────────────

function BlueprintPaperPlaceholder({ label, sub }: { label: string; sub: string }) {
    return (
        <svg
            className="w2-blueprint-placeholder"
            viewBox="0 0 500 300"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={`${label} — not yet generated`}
        >
            <defs>
                <pattern id="bp-grid-sm" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M10 0 L 0 0 L 0 10" fill="none" stroke="#e7e5e4" strokeWidth="0.3" />
                </pattern>
                <pattern id="bp-grid-lg" width="50" height="50" patternUnits="userSpaceOnUse">
                    <rect width="50" height="50" fill="url(#bp-grid-sm)" />
                    <path d="M50 0 L 0 0 L 0 50" fill="none" stroke="#d6d3d1" strokeWidth="0.55" />
                </pattern>
            </defs>
            <rect x="0" y="0" width="500" height="300" fill="#fafaf9" />
            <rect x="0" y="0" width="500" height="300" fill="url(#bp-grid-lg)" />
            <rect x="8" y="8" width="484" height="284" fill="none" stroke="#1c1917" strokeWidth="0.8" />
            <rect x="14" y="14" width="472" height="272" fill="none" stroke="#78716c" strokeWidth="0.4" strokeDasharray="2 3" />
            <g fontFamily="Inter, system-ui, sans-serif">
                <text x="22" y="32" fontSize="9" fontWeight="700" letterSpacing="0.08em" fill="#78716c">{label.toUpperCase()} — AWAITING GEOMETRY</text>
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

function ProcessRow({ name, tol, wall }: { name: string; tol: string; wall: string }) {
    return (
        <div className="w2-process-row">
            <span className="pname">{name}</span>
            <span className="tol">{tol}</span>
            <span className="wall">{wall}</span>
        </div>
    )
}

function KcRow({ mod, text }: { mod: string; text: string }) {
    return (
        <Link href="#" className="w2-kc-row">
            <span className="mod">{mod}</span> {text}
        </Link>
    )
}

/**
 * Header badge showing the brief-lock state.
 *
 * Rendered inline with the H1. Two presentations:
 *   - locked → green chip "Rev A locked" linking to /brief-lock
 *   - draft  → neutral chip "Rev A draft" linking to /brief-lock
 *
 * This is intentionally separate from the Brief tile chip in the artefact
 * grid — the tile chip tracks Chase's research run; this badge tracks the
 * lock gate. One is about specialist work, the other about handoff.
 */
function BriefLockBadge({
    isLocked,
    revisionLabel,
    briefLockHref,
}: {
    isLocked: boolean
    revisionLabel: string
    briefLockHref: string
}): React.ReactElement {
    return (
        <Link
            href={briefLockHref}
            className={`w2-brief-lock-badge ${isLocked ? "locked" : "draft"}`}
            aria-label={isLocked ? `${revisionLabel} locked — open brief lock page` : `${revisionLabel} draft — open brief lock page`}
        >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {revisionLabel} {isLocked ? "locked" : "draft"}
        </Link>
    )
}

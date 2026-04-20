/**
 * BriefLockView — Brief Lock confirmation surface (V2, data-wired).
 *
 * Mockup-faithful port of FORGE-MOCKUP-BRIEF-LOCK.html. This is the
 * confirm-screen before firing the lock server action: it summarises
 * what is about to be frozen, shows the revision bump (N → N+1),
 * aggregates still-open unknowns / failure modes / un-spec'd parts /
 * un-shortlisted suppliers, and renders the big lock CTA.
 *
 * Two variants:
 *   - draft  → full confirm surface, Lock CTA is disabled (server action
 *              lives in another directory; this page never mutates).
 *   - locked → "already locked" banner with lockedAt + lockedBy display,
 *              followed by read-only summary of the frozen content.
 *
 * Empty-state policy: if the brief is missing mission / targetCustomers /
 * whyNow / constraints / regulatory, each slot renders a neutral
 * "Not declared" message with a link back to the brief fork editor.
 * We NEVER synthesise the mockup's HAPS example content.
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { lockCadLabBrief, unlockCadLabBrief, type BriefLockErrorCode } from "@/actions/brief-lock"

import "./brief-lock-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface StillOpenItem {
    /** Short label rendered as the card heading. */
    label: string
    /** Count of items (modules, parts, suppliers) that still need attention. */
    count: number
    /** One-line caption beneath the count. */
    caption: string
    /** Deep-link target — route to the artefact where this gets resolved. */
    href: string
    /** Link copy for the call-to-action row. */
    linkLabel: string
}

export interface ChecklistItem {
    label: string
    detail: string
    done: boolean
}

export interface BriefLockViewProps {
    project: {
        id: string
        name: string
        subject: string
        /** Current stored revision (1 = A, 2 = B, ...). */
        designRevision: number
    }
    lockState: {
        /** True when `projects.brief_locked_at` is non-null. */
        isLocked: boolean
        /** ISO timestamp of lock event. Null while draft. */
        lockedAt: string | null
        /** Free-form identifier of the locking user (display name or uuid). Null while draft. */
        lockedBy: string | null
    }
    /** Revision we read from `brief_revisions.revision_number` (newest row). */
    currentRevisionNumber: number
    /** Narrative slots that will be frozen. Any null → empty-state rendering. */
    narrative: {
        mission: string | null
        targetCustomers: string | null
        whyNow: string | null
    }
    /** Constraints display strings (pre-formatted server-side). */
    constraints: {
        unitCostCeiling: string | null
        firstShipDate: string | null
        maxMass: string | null
        batchSize: string | null
        markets: string | null
        productionRegion: string | null
    }
    /** Regulatory codes declared on the brief — "[] = not declared". */
    regulatoryCodes: string[]
    /** Pre-lock checklist rows derived from project state. */
    checklist: ChecklistItem[]
    /** Still-open aggregates (unknowns / failure modes / parts / suppliers). */
    stillOpen: StillOpenItem[]
    /** Total count of still-open items — drives the warning banner phrasing. */
    stillOpenTotal: number
    /** Module count — used in the sidebar snapshot. */
    moduleCount: number
    /** Count of modules with at least one declared failure mode. */
    modulesWithFailureModesCount: number
    /** Count of modules with at least one open unknown. */
    modulesWithUnknownsCount: number
}

// ─── View ──────────────────────────────────────────────────────────────

export function BriefLockView(props: BriefLockViewProps): React.ReactElement {
    const {
        project,
        lockState,
        currentRevisionNumber,
        narrative,
        constraints,
        regulatoryCodes,
        checklist,
        stillOpen,
        stillOpenTotal,
        moduleCount,
        modulesWithFailureModesCount,
        modulesWithUnknownsCount,
    } = props

    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [justLockedRevisionLabel, setJustLockedRevisionLabel] = useState<string | null>(null)
    const [actionError, setActionError] = useState<{ message: string; code?: BriefLockErrorCode } | null>(null)

    const workspaceHref = `/the-forge-v2/projects/${project.id}`
    const briefHref = `${workspaceHref}/brief`
    const forkHref = `${workspaceHref}/fork`
    const modulesHref = `${workspaceHref}/modules`

    const currentLetter = designRevisionToLetter(currentRevisionNumber)
    const nextLetter = designRevisionToLetter(currentRevisionNumber + 1)

    // UI treats either a server-side `isLocked` OR a just-completed lock as
    // the locked state. This avoids a race where the server data hasn't
    // refreshed yet (router.refresh pending) but the action returned ok.
    const showLocked = lockState.isLocked || justLockedRevisionLabel !== null

    const handleLock = (): void => {
        setActionError(null)
        startTransition(async () => {
            const result = await lockCadLabBrief(project.id)
            if (!result.ok) {
                setActionError({ message: result.error, code: result.errorCode })
                return
            }
            setJustLockedRevisionLabel(
                `Rev ${designRevisionToLetter(result.revisionNumber)}`,
            )
            // Refresh server data so the page re-renders with
            // AlreadyLockedBanner + the workspace header badge flips.
            router.refresh()
        })
    }

    const handleUnlock = (): void => {
        setActionError(null)
        startTransition(async () => {
            const result = await unlockCadLabBrief(project.id)
            if (!result.ok) {
                setActionError({ message: result.error, code: result.errorCode })
                return
            }
            // Route back to the brief editor — the founder wants to edit,
            // not sit on the lock confirm page.
            router.push(briefHref)
            router.refresh()
        })
    }

    return (
        <div className="bl2">
            {/* ── Breadcrumb ──────────────────────────────────────── */}
            <div className="bl2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={workspaceHref}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={briefHref}>Brief</Link>
                <span className="sep">›</span>
                <span className="current">Lock rev {currentLetter}</span>
            </div>

            {/* ── Intro annotation ────────────────────────────────── */}
            <div className="bl2-annot">
                <strong>Note</strong>
                Locking the Brief is the handoff contract between Products (hypothesis) and Forge (build). After this event, Products history persists as read-only provenance and Forge owns every change to cost, requirements, and the artefact spine. Cannot be undone without a fork.
            </div>

            <h1 className="bl2-title"><span className="bl2-title-dot" aria-hidden="true" />Lock Brief rev {currentLetter} — hand off to Forge</h1>
            <p className="bl2-subtitle">
                Locking the Brief flips canonical ownership from Products to Forge. After this, Products history is read-only; Forge owns every change to target cost, requirements, and cost ceiling. Cannot be undone without a fork.
            </p>

            <div className="bl2-grid">
                {/* ── Main wrap ──────────────────────────────────── */}
                <div className="bl2-wrap">
                    {showLocked ? (
                        <AlreadyLockedBanner
                            lockedAt={lockState.lockedAt}
                            lockedBy={lockState.lockedBy}
                            currentLetter={currentLetter}
                            justLockedRevisionLabel={justLockedRevisionLabel}
                        />
                    ) : (
                        <TerminalCallout projectName={project.name} />
                    )}

                    {/* Canonical-ownership grid (same in both variants — it's the spec, not state) */}
                    <div className="bl2-owner-grid">
                        <div className="bl2-owner-col">
                            <div className="bl2-owner-col__label">Stays in Products</div>
                            <div className="bl2-owner-col__title">Read-only provenance</div>
                            <div className="bl2-owner-col__sub">Archive of how you validated the hypothesis.</div>
                            <ul>
                                <li>Market sizing and SAM/SOM</li>
                                <li>Customer segments and personas</li>
                                <li>Competitive landscape</li>
                                <li>Fundability readiness checklist</li>
                                <li>LOI pipeline and interview transcripts</li>
                            </ul>
                        </div>

                        <div className="bl2-owner-col middle">
                            <div className="bl2-owner-col__label">Crosses into Forge</div>
                            <div className="bl2-owner-col__title">Becomes editable</div>
                            <div className="bl2-owner-col__sub">Migrates with full history but Forge now owns it.</div>
                            <ul>
                                <li>Target cost → <strong>Cost ceiling</strong></li>
                                <li>Key requirements → <strong>Brief artefact</strong></li>
                                <li>Customer LOIs → <strong>Brief target customers</strong></li>
                                <li>Lifecycle state (Hypothesis → Prototyping)</li>
                                <li>Regulatory envelope assumption</li>
                            </ul>
                        </div>

                        <div className="bl2-owner-col right">
                            <div className="bl2-owner-col__label">Born in Forge</div>
                            <div className="bl2-owner-col__title">Did not exist before</div>
                            <div className="bl2-owner-col__sub">Initialised empty; filled in as you build.</div>
                            <ul>
                                <li>BOM (bill of materials)</li>
                                <li>Suppliers and Risks register</li>
                                <li>Revision tree (rev {currentLetter} is the first)</li>
                                <li>Geometry and CAD spine</li>
                                <li>Launch checklist and Operations surface</li>
                            </ul>
                        </div>
                    </div>

                    <div className="bl2-ownership-arrow">
                        Ownership flips: <strong>Products</strong> →→→ <strong>Forge</strong> · this is the only direction allowed without a Fork
                    </div>

                    {/* Revision bump card — always shown. */}
                    <div className="bl2-section-title">Revision bump</div>
                    <div className="bl2-bump">
                        <div className="bl2-bump__head">
                            <span>{showLocked ? "This revision is already locked" : "On lock"}</span>
                            <span><strong>{moduleCount}</strong> modules in scope</span>
                        </div>
                        <div className="bl2-bump__row">
                            <div className="bl2-bump__pill">
                                <span className="k">Current</span>
                                <span className="v">Rev {currentLetter}</span>
                                <span className="meta">
                                    {showLocked ? "locked" : "draft · editable"}
                                </span>
                            </div>
                            <div className="bl2-bump__arrow" aria-hidden="true">→</div>
                            <div className="bl2-bump__pill next">
                                <span className="k">After lock</span>
                                <span className="v">Rev {nextLetter}</span>
                                <span className="meta">
                                    {showLocked
                                        ? "next editable revision"
                                        : "next edit opens rev " + nextLetter}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* What will be frozen — narrative + constraints. */}
                    <div className="bl2-section-title">What will be frozen</div>
                    <div className="bl2-frozen">
                        <FrozenField
                            k="Product"
                            value={formatProductLine(project.name, project.subject)}
                            emptyHref={forkHref}
                            emptyLabel="No product declared — open the Brief editor first →"
                        />
                        <FrozenField
                            k="Mission"
                            value={narrative.mission}
                            emptyHref={forkHref}
                            emptyLabel="Mission not declared — locking an empty brief is allowed but not recommended. Consider drafting first →"
                        />
                        <FrozenField
                            k="Target customers"
                            value={narrative.targetCustomers}
                            emptyHref={forkHref}
                            emptyLabel="Target customers not declared — add in the Brief editor →"
                        />
                        <FrozenField
                            k="Why now"
                            value={narrative.whyNow}
                            emptyHref={forkHref}
                            emptyLabel="Why-now not declared — add in the Brief editor →"
                        />
                        <FrozenField
                            k="Constraints"
                            value={formatConstraintsLine(constraints)}
                            emptyHref={forkHref}
                            emptyLabel="No constraints declared — add cost ceiling / first-ship / mass in the Brief editor →"
                        />
                        <FrozenField
                            k="Regulatory envelope"
                            value={regulatoryCodes.length > 0 ? regulatoryCodes.join(" · ") : null}
                            emptyHref={forkHref}
                            emptyLabel="Regulatory envelope not declared — add standards in the Brief editor →"
                        />
                    </div>

                    {/* Pre-lock checklist — derived from project state. */}
                    <div className="bl2-section-title">
                        Pre-lock checklist · {checklist.filter((c) => c.done).length} of {checklist.length} closed
                    </div>
                    <div className="bl2-checklist">
                        {checklist.map((item, idx) => (
                            <div key={`${idx}-${item.label}`} className="bl2-check-row">
                                <div className={`bl2-check-row__mark ${item.done ? "done" : "todo"}`} aria-hidden="true">
                                    {item.done ? "✓" : "·"}
                                </div>
                                <div>
                                    <div className="bl2-check-row__label">{item.label}</div>
                                    <div className="bl2-check-row__sub">{item.detail}</div>
                                </div>
                                <div className="bl2-check-row__meta">
                                    {item.done ? "closed" : "open"}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Still open — things you'll lock in. */}
                    <div className="bl2-section-title">
                        Still open · {stillOpenTotal} item{stillOpenTotal === 1 ? "" : "s"} you&apos;ll lock in
                    </div>
                    <div className="bl2-open">
                        <div className="bl2-open__head">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            <span>
                                {stillOpenTotal === 0
                                    ? "Everything declared — clean lock."
                                    : "These items will carry into the locked revision as open questions."}
                            </span>
                        </div>
                        {stillOpenTotal === 0 ? (
                            <div className="bl2-open__empty">
                                No open unknowns, failure modes, un-specced parts, or un-shortlisted suppliers. You can lock cleanly.
                            </div>
                        ) : (
                            <div className="bl2-open__list">
                                {stillOpen.map((item) => (
                                    <div key={item.label} className="bl2-open__item">
                                        <strong>
                                            {item.count} {item.label}
                                        </strong>
                                        <span className="sub">{item.caption}</span>
                                        <Link href={item.href}>{item.linkLabel} →</Link>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* What happens when you lock. */}
                    <div className="bl2-section-title">What happens when you lock</div>
                    <div className="bl2-happens">
                        <h5>Five effects, executed atomically</h5>
                        <ol>
                            <li>
                                <strong>Products record becomes read-only.</strong> You can view every interview, assumption, LOI — but no edits. If a fact changes later, it goes into Forge&apos;s Brief history, not Products.
                            </li>
                            <li>
                                <strong>Forge inherits Brief rev {currentLetter}</strong> and begins version control. Every subsequent edit is a new rev ({currentLetter} → {nextLetter} → …) with full diff audit.
                            </li>
                            <li>
                                <strong>A &quot;Brief locked&quot; event is written to the audit log</strong> — timestamped, author-attributed, cryptographically anchored. Investors will see this as proof-of-discipline at fundraise.
                            </li>
                            <li>
                                <strong>Team notified</strong> (if permissions configured). Default: Founder + Engineering lead + Fractional CTO see a Comms entry; the specialist roster gets the new Brief.
                            </li>
                            <li>
                                <strong>First Forge artefact is born.</strong> Brief rev {currentLetter} becomes the canonical record; Modules, BOM, Suppliers, Risks, Cost, Experts, Geometry, and Launch initialise empty and populate as you build.
                            </li>
                        </ol>
                    </div>

                    {/* Decision strip (CTA footer) — wired to lockCadLabBrief /
                        unlockCadLabBrief. When locked, the primary CTA becomes
                        "Open new revision" (unlock → Rev N+1 draft); when
                        draft, the primary CTA is "Lock revision N". */}
                    {actionError ? (
                        <div className="bl2-action-error" role="alert">
                            <strong>Couldn&apos;t {showLocked ? "open a new revision" : "lock the brief"}.</strong>{" "}
                            {actionError.message}
                            {actionError.code ? (
                                <span className="bl2-action-error__code"> ({actionError.code})</span>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="bl2-decision">
                        <div className="bl2-decision__warn">
                            {showLocked
                                ? "A new revision keeps the locked Rev " + currentLetter + " as the historical record. Downstream artefacts (BOM, Suppliers) stay anchored to it."
                                : "This cannot be undone. To change a locked Brief later, open a new revision."}
                        </div>
                        {showLocked ? (
                            <>
                                <Link href={workspaceHref} className="bl2-btn-ghost">
                                    Back to project
                                </Link>
                                <button
                                    type="button"
                                    className="bl2-btn-lock"
                                    onClick={handleUnlock}
                                    disabled={isPending}
                                    aria-busy={isPending}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <rect x="3" y="11" width="18" height="11" rx="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    {isPending
                                        ? "Opening…"
                                        : `Open Rev ${nextLetter} to revise`}
                                </button>
                            </>
                        ) : (
                            <>
                                <Link href={briefHref} className="bl2-btn-ghost">
                                    Cancel · keep editing
                                </Link>
                                <button
                                    type="button"
                                    className="bl2-btn-lock"
                                    onClick={handleLock}
                                    disabled={isPending}
                                    aria-busy={isPending}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <rect x="3" y="11" width="18" height="11" rx="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    {isPending
                                        ? "Locking…"
                                        : `Lock Rev ${currentLetter} and hand off to Forge`}
                                </button>
                            </>
                        )}
                    </div>

                    {/* Auto-Max notice appears right after a successful lock so
                        the founder understands the background work that just
                        kicked off. Hidden when the page is loaded on an
                        already-locked brief (Max's earlier run lives on the
                        Modules tab already). */}
                    {justLockedRevisionLabel ? (
                        <div className="bl2-auto-max" role="status">
                            <strong>Max is decomposing your modules in the background.</strong>{" "}
                            Head over to <Link href={modulesHref}>Modules</Link> in a minute or two — the chip there tracks the run.
                        </div>
                    ) : null}
                </div>

                {/* ── Sidebar ─────────────────────────────────── */}
                <div>
                    <div className="bl2-side-card bl2-how">
                        <h4>How this works</h4>
                        <ul className="bl2-how__list">
                            <li>Locking creates an immutable snapshot of the brief, BOM, cost ceiling, and module list for this revision.</li>
                            <li>After lock, Forge uses the snapshot for supplier shortlists, RFQs, and manufacturing readiness — nothing shifts under them.</li>
                            <li>To change anything, create a new revision (Rev {currentLetter} → Rev {nextLetter}). The old lock stays as the record of what you approved.</li>
                        </ul>
                        <div className="bl2-how__foot">
                            Questions → <Link href="/the-forge/ask">/the-forge/ask</Link> — ask a specialist
                        </div>
                    </div>

                    <div className="bl2-side-card">
                        <h4>Why this is irreversible</h4>
                        <p>
                            The Brief becomes the root of the artefact spine. BOM, Suppliers, Risks and Cost all anchor to a locked Brief. Unlocking would detach every downstream artefact and re-open the cost ceiling — which is the opposite of discipline.
                        </p>
                        <p>
                            If you need to change direction, open a Fork: new Brief, new spine, the old one persists as provenance.
                        </p>
                    </div>

                    <div className="bl2-side-card">
                        <h4>Project snapshot</h4>
                        <SnapshotRow k="Current revision" v={`Rev ${currentLetter}`} />
                        <SnapshotRow
                            k="Lock state"
                            v={showLocked ? "Locked" : "Draft"}
                        />
                        <SnapshotRow k="Modules decomposed" v={moduleCount > 0 ? String(moduleCount) : null} />
                        <SnapshotRow
                            k="Modules with unknowns"
                            v={modulesWithUnknownsCount > 0 ? String(modulesWithUnknownsCount) : moduleCount > 0 ? "0" : null}
                        />
                        <SnapshotRow
                            k="Modules with failure modes"
                            v={modulesWithFailureModesCount > 0 ? String(modulesWithFailureModesCount) : moduleCount > 0 ? "0" : null}
                        />
                        <SnapshotRow k="Still-open items" v={String(stillOpenTotal)} />
                    </div>

                    <div className="bl2-side-card">
                        <h4>{showLocked ? "After lock · current state" : "After lock · next actions"}</h4>
                        {showLocked ? (
                            <>
                                <p>1. Every downstream artefact (BOM, Suppliers, Risks, Cost) now cites Rev {currentLetter}.</p>
                                <p>2. Any change opens a proposal for Rev {nextLetter} — not an edit to Rev {currentLetter}.</p>
                                <p>3. Fork the project if you need to change direction without losing this revision.</p>
                            </>
                        ) : (
                            <>
                                <p>1. Fill the Modules surface — propulsion, structure, avionics, ground-station (or equivalent for your product).</p>
                                <p>2. Issue first RFQs against the empty BOM — suppliers quote against Rev {currentLetter}.</p>
                                <p>3. Run the first risk-register pass with the Engineering lead.</p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function TerminalCallout({ projectName }: { projectName: string }): React.ReactElement {
    return (
        <div className="bl2-terminal">
            <div className="bl2-terminal__icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
            </div>
            <div className="bl2-terminal__body">
                <strong>This is the handoff contract. The next revision lives in Forge.</strong>
                <div className="bl2-terminal__sub">
                    {projectName} is about to flip from hypothesis to build. Locking freezes Rev A against suppliers and opens Rev B for future edits.
                </div>
            </div>
        </div>
    )
}

function AlreadyLockedBanner({
    lockedAt,
    lockedBy,
    currentLetter,
    justLockedRevisionLabel,
}: {
    lockedAt: string | null
    lockedBy: string | null
    currentLetter: string
    /** Set immediately after a successful lock; swaps copy to "just locked". */
    justLockedRevisionLabel: string | null
}): React.ReactElement {
    const justLocked = justLockedRevisionLabel !== null
    return (
        <div className="bl2-locked-banner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div>
                <strong>
                    {justLocked
                        ? `${justLockedRevisionLabel} locked — handed off to Forge.`
                        : `Revision ${currentLetter} is already locked.`}
                </strong>
                {justLocked
                    ? " Max is decomposing your modules in the background. Downstream artefacts (BOM, Suppliers, Risks, Cost) now anchor to this revision."
                    : " This project has been handed off to Forge. Suppliers cite this revision on RFQs. Editing opens a proposal for the next revision — not an edit to Rev " +
                      currentLetter +
                      "."}
                <div className="meta">
                    Locked {lockedAt ? formatIsoDateTime(lockedAt) : justLocked ? "just now" : "timestamp unavailable"}
                    {lockedBy ? ` · by ${lockedBy}` : ""}
                </div>
            </div>
        </div>
    )
}

function FrozenField({
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
    const hasValue = typeof value === "string" && value.trim().length > 0
    return (
        <div className="bl2-frozen__field">
            <div className="bl2-frozen__k">{k}</div>
            {hasValue ? (
                <div className="bl2-frozen__v">{value}</div>
            ) : (
                <div className="bl2-frozen__v empty">
                    <Link href={emptyHref}>{emptyLabel}</Link>
                </div>
            )}
        </div>
    )
}

function SnapshotRow({ k, v }: { k: string; v: string | null }): React.ReactElement {
    return (
        <div className="row">
            <div className="k">{k}</div>
            {v !== null && v.length > 0 ? (
                <div className="v">{v}</div>
            ) : (
                <div className="v empty">—</div>
            )}
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

/** ISO timestamp → "YYYY-MM-DD HH:MM UTC" for the already-locked banner. */
function formatIsoDateTime(iso: string): string {
    try {
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) return iso
        const y = d.getUTCFullYear()
        const m = String(d.getUTCMonth() + 1).padStart(2, "0")
        const day = String(d.getUTCDate()).padStart(2, "0")
        const hh = String(d.getUTCHours()).padStart(2, "0")
        const mm = String(d.getUTCMinutes()).padStart(2, "0")
        return `${y}-${m}-${day} ${hh}:${mm} UTC`
    } catch {
        return iso
    }
}

/** "HAPS UAV" + "solar HAPS" → "HAPS UAV — solar HAPS". */
function formatProductLine(name: string, subject: string): string {
    const n = (name ?? "").trim()
    const s = (subject ?? "").trim()
    if (!s || s === n) return n || ""
    return `${n} — ${s}`
}

/** Joins declared constraint slots into a single readable line; empty → null. */
function formatConstraintsLine(c: {
    unitCostCeiling: string | null
    firstShipDate: string | null
    maxMass: string | null
    batchSize: string | null
    markets: string | null
    productionRegion: string | null
}): string | null {
    const parts: string[] = []
    if (c.unitCostCeiling) parts.push(`Unit cost ≤ ${c.unitCostCeiling}`)
    if (c.maxMass) parts.push(`Max mass ${c.maxMass}`)
    if (c.firstShipDate) parts.push(`First ship ${c.firstShipDate}`)
    if (c.batchSize) parts.push(`Batch ${c.batchSize}`)
    if (c.markets) parts.push(`Markets ${c.markets}`)
    if (c.productionRegion) parts.push(`Production in ${c.productionRegion}`)
    if (parts.length === 0) return null
    return parts.join(" · ")
}

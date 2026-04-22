/**
 * ForkView — Fork artefact page (V2, data-wired).
 *
 * Mockup-faithful port of FORGE-MOCKUP-FORK.html. Adds the three density
 * elements the mockup calls for:
 *
 *   • Timeline SVG — visual of parent → forking → planned next.
 *   • "What kind of fork?" segmented control — Minor revision vs Variant.
 *     UI state is tracked locally (useState). The form's submit handler
 *     does not yet accept a `forkType` field server-side — the brief-lock
 *     action today takes only a projectId. Picker defaults to "minor"
 *     and the selection is captured ready for wiring. TODO: extend
 *     `lockCadLabBrief` (or a new `forkCadLabBrief` action) to accept a
 *     `forkType` and an optional parent revision pointer.
 *   • "What carries over / needs re-work" grid — static design policy.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — fork icon + title + orange title-dot + revision chip
 *   3. (If not locked) Info card steering the user to brief-lock first
 *   4. Revision timeline SVG
 *   5. "What kind of fork?" segmented cards
 *   6. Side-by-side grid:
 *      - Left pane: current revision summary (mission / target customers /
 *        why-now / constraints) — greyed out, read-only.
 *      - Right pane: new-revision form (title + what-changed + tags +
 *        target cost ceiling) all disabled, with honest empty-state note.
 *   7. Carry-over / rework grid — two columns of small cards.
 *   8. CTA row — Cancel → Brief + disabled Start-new-revision.
 *
 * No data is synthesised. When a narrative field is absent on the
 * current brief, the slot renders "Not yet declared" in the subtle tone,
 * not the mockup's HAPS example copy.
 */

"use client"

import Link from "next/link"
import { useState } from "react"
import "./fork-v2.css"

// ─── Fork-type picker — design policy ──────────────────────────────────

/** Union of fork types recognised by the picker UI. */
export type ForkType = "minor" | "variant"

// ─── Types ─────────────────────────────────────────────────────────────

export interface ForkCurrentRevision {
    /** Revision letter — A, B, ... derived from designRevision. */
    letter: string
    /** True once brief_locked_at is set on the project. */
    isLocked: boolean
    /** ISO timestamp of the lock (or createdAt when still draft). */
    stampedAt: string
}

export interface ForkNarrative {
    mission: string | null
    targetCustomers: string | null
    whyNow: string | null
}

export interface ForkConstraints {
    unitCostCeiling: string | null
    firstShipDate: string | null
    maxMass: string | null
    batchSize: string | null
    markets: string | null
    productionRegion: string | null
}

export interface ForkViewProps {
    project: {
        id: string
        name: string
        subject: string
        designRevision: number
    }
    currentRevision: ForkCurrentRevision
    narrative: ForkNarrative
    constraints: ForkConstraints
    /** Optional summary of the highest brief_revisions row (may be empty). */
    latestRevisionSummary: string | null
}

// ─── View ──────────────────────────────────────────────────────────────

export function ForkView(props: ForkViewProps): React.ReactElement {
    const { project, currentRevision, narrative, constraints, latestRevisionSummary } = props

    const workspaceHref = `/the-forge-v2/projects/${project.id}`
    const briefHref = `/the-forge-v2/projects/${project.id}/brief`
    const briefLockHref = `/the-forge-v2/projects/${project.id}/brief-lock`
    const revisionsHref = `/the-forge-v2/projects/${project.id}/revisions`

    const stampedLabel = formatIsoDate(currentRevision.stampedAt)

    // Fork type picker — local UI state. Defaults to "minor" per brief.
    // The selection is captured ready for wiring — the server action
    // today doesn't yet accept a forkType (TODO above in file header).
    const [forkType, setForkType] = useState<ForkType>("minor")

    const currentLetter = currentRevision.letter
    const nextLetter = nextRevisionLetter(project.designRevision)
    const futureLetter = nextRevisionLetter(project.designRevision + 1)

    return (
        <div className="fk2">
            {/* ── Breadcrumb ───────────────────────────────────────── */}
            <div className="fk2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={workspaceHref}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Fork</span>
            </div>

            {/* ── Page header ─────────────────────────────────────── */}
            <div className="fk2-page-header">
                <div>
                    <h1>
                        <span className="fk2-title-dot" aria-hidden="true" />
                        <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <circle cx="6" cy="6" r="3" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="6" r="3" />
                            <path d="M18 9v3a3 3 0 0 1-3 3H9" />
                            <path d="M6 9v6" />
                        </svg>
                        Fork brief · {project.name}
                        <RevisionChip
                            letter={currentRevision.letter}
                            isLocked={currentRevision.isLocked}
                        />
                    </h1>
                    <div className="sub">
                        Start a new revision from the current brief. The parent stays untouched — suppliers keep citing it until the new revision is locked.
                    </div>
                </div>
            </div>

            {/* ── Not-locked guard ────────────────────────────────── */}
            {!currentRevision.isLocked && (
                <div className="fk2-info-card" role="note">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    </svg>
                    <div>
                        <strong>Fork starts from a locked revision.</strong>
                        This brief is still in draft — nothing to fork yet. Lock the brief first, then come back here to start the next revision.
                        <br />
                        <Link href={briefLockHref} className="lock-cta">Open brief lock →</Link>
                    </div>
                </div>
            )}

            {/* ── Revision timeline — visual parent → forking → future ── */}
            <div className="fk2-timeline" aria-label="Revision timeline">
                <div className="fk2-timeline__head">
                    <h2>Revision timeline</h2>
                    <p>
                        Forks create a new revision branching from the current one. The parent
                        stays untouched — suppliers keep citing it until the fork is locked.
                    </p>
                </div>
                <div className="fk2-timeline__svg-wrap">
                    <ForkTimelineSvg
                        currentLetter={currentLetter}
                        currentLocked={currentRevision.isLocked}
                        nextLetter={nextLetter}
                        futureLetter={futureLetter}
                    />
                </div>
                <div className="fk2-timeline__legend">
                    <span><span className="dot shipped" aria-hidden="true" />Shipped</span>
                    <span><span className="dot active" aria-hidden="true" />Current</span>
                    <span><span className="dot forking" aria-hidden="true" />Forking now</span>
                    <span><span className="dot planned" aria-hidden="true" />Future</span>
                </div>
            </div>

            {/* ── Fork type picker — Minor revision vs Variant ─── */}
            <fieldset
                className="fk2-forktype"
                aria-label="What kind of fork?"
            >
                <legend className="fk2-forktype__legend">What kind of fork?</legend>
                <p className="fk2-forktype__hint">
                    Pick the scope of the new revision. The choice drives how much of the
                    parent carries forward and which artefacts re-run.
                </p>
                <div className="fk2-forktype__grid">
                    <label
                        className={`fk2-forktype__card ${forkType === "minor" ? "selected" : ""}`}
                        htmlFor="fk2-forktype-minor"
                    >
                        <input
                            id="fk2-forktype-minor"
                            type="radio"
                            name="fk2-forktype"
                            value="minor"
                            checked={forkType === "minor"}
                            onChange={() => setForkType("minor")}
                        />
                        <div className="fk2-forktype__label">
                            <h4>Minor revision</h4>
                            <div className="fk2-forktype__hint-sm">
                                Same product, same market — an incremental change.
                            </div>
                            <ul>
                                <li>Carries 95%+ of BOM, suppliers, risks forward</li>
                                <li>No new certification needed</li>
                                <li>Example: tolerance tightening, supplier swap, cost-down</li>
                            </ul>
                        </div>
                    </label>
                    <label
                        className={`fk2-forktype__card ${forkType === "variant" ? "selected" : ""}`}
                        htmlFor="fk2-forktype-variant"
                    >
                        <input
                            id="fk2-forktype-variant"
                            type="radio"
                            name="fk2-forktype"
                            value="variant"
                            checked={forkType === "variant"}
                            onChange={() => setForkType("variant")}
                        />
                        <div className="fk2-forktype__label">
                            <h4>Variant</h4>
                            <div className="fk2-forktype__hint-sm">
                                Same product, new market — new requirements.
                            </div>
                            <ul>
                                <li>Carries modules + geometry spine forward</li>
                                <li>Re-runs brief · BOM deltas · risks · suppliers</li>
                                <li>Example: maritime-hardened, cold-weather, export-grade</li>
                            </ul>
                        </div>
                    </label>
                </div>
            </fieldset>

            {/* ── Side-by-side grid ───────────────────────────────── */}
            <div className="fk2-grid">
                {/* Left: current revision (read-only) */}
                <div className="fk2-pane readonly">
                    <div className="fk2-pane-head">
                        <div className="eyebrow">Current revision</div>
                        <h2>
                            Revision {currentRevision.letter}
                            <span
                                className={`fk2-chip ${currentRevision.isLocked ? "brand" : "warning"}`}
                            >
                                {currentRevision.isLocked ? "Locked" : "Draft"}
                            </span>
                        </h2>
                        <p>
                            {currentRevision.isLocked
                                ? `Locked ${stampedLabel}. Read-only snapshot — this is the source of the fork.`
                                : `Created ${stampedLabel}. Draft snapshot — not yet locked.`}
                        </p>
                    </div>
                    <div className="fk2-pane-body">
                        <NarrativeField k="Mission" value={narrative.mission} />
                        <NarrativeField k="Target customers" value={narrative.targetCustomers} />
                        <NarrativeField k="Why now" value={narrative.whyNow} />

                        <div className="fk2-field">
                            <div className="k">Constraints declared</div>
                            <div className="fk2-constraints-grid">
                                <ConstraintItem k="Unit cost ceiling" v={constraints.unitCostCeiling} />
                                <ConstraintItem k="Target first ship" v={constraints.firstShipDate} />
                                <ConstraintItem k="Max mass" v={constraints.maxMass} />
                                <ConstraintItem k="Batch 1" v={constraints.batchSize} />
                                <ConstraintItem k="Markets" v={constraints.markets} />
                                <ConstraintItem k="Production" v={constraints.productionRegion} />
                            </div>
                        </div>

                        {latestRevisionSummary ? (
                            <div className="fk2-field">
                                <div className="k">Latest change note</div>
                                <div className="v">{latestRevisionSummary}</div>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Right: new-revision form (all disabled) */}
                <div className="fk2-pane">
                    <div className="fk2-pane-head">
                        <div className="eyebrow">New revision</div>
                        <h2>
                            Revision {nextRevisionLetter(project.designRevision)}
                            <span className="fk2-chip">Scaffold</span>
                        </h2>
                        <p>Describe what changes in the new revision. Downstream artefacts re-run after lock.</p>
                    </div>
                    <div className="fk2-pane-body">
                        <div className="fk2-form-empty">
                            <strong>Form editing ships next round.</strong>
                            For now, the lock / unlock flow runs through the <Link href={briefHref}>Brief page</Link>. Fields below show the shape of the new-revision form so the team can pressure-test the flow before wiring.
                        </div>

                        <div className="fk2-form-field">
                            <label htmlFor="fk2-title">Title</label>
                            <input
                                id="fk2-title"
                                type="text"
                                placeholder={`e.g. ${project.name} — Revision ${nextRevisionLetter(project.designRevision)}`}
                                disabled
                                aria-disabled="true"
                            />
                            <p className="hint">Shown on revision history and on the Brief header once locked.</p>
                        </div>

                        <div className="fk2-form-field">
                            <label htmlFor="fk2-summary">What changed</label>
                            <textarea
                                id="fk2-summary"
                                placeholder="One clear paragraph — what drove this revision? Customer ask, certification update, supplier swap, design learning."
                                disabled
                                aria-disabled="true"
                            />
                            <p className="hint">The change log — readable by specialists six months from now without extra context.</p>
                        </div>

                        <div className="fk2-form-field">
                            <label htmlFor="fk2-cost-ceiling">Target cost ceiling (GBP)</label>
                            <input
                                id="fk2-cost-ceiling"
                                type="text"
                                placeholder={
                                    constraints.unitCostCeiling
                                        ? `Inherits from parent: ${constraints.unitCostCeiling}`
                                        : "e.g. £280,000/unit"
                                }
                                disabled
                                aria-disabled="true"
                                inputMode="numeric"
                            />
                            <p className="hint">
                                Leave blank to inherit the parent&apos;s ceiling. Override when the
                                variant target market has a different price envelope.
                            </p>
                        </div>

                        <div className="fk2-form-field">
                            <label htmlFor="fk2-tags">Tags</label>
                            <div
                                id="fk2-tags"
                                className="fk2-tags"
                                role="group"
                                aria-disabled="true"
                                aria-label="Tags (disabled — editor ships next round)"
                            >
                                <span className="fk2-tag">supplier-swap</span>
                                <span className="fk2-tag">tolerance</span>
                                <span className="fk2-tag">cost-down</span>
                            </div>
                            <p className="hint">Optional — used for filtering revision history and tripping audit triggers.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Carry-over / re-work grid ────────────────────────
                 Static design-policy content — NOT data-driven. Two
                 columns: left = what carries over from the parent, right
                 = what needs re-work. Cards respond to the fork-type
                 selection above (variants carry less, re-work more). */}
            <section className="fk2-carryover" aria-label="What carries over, what needs re-work">
                <div className="fk2-carryover__head">
                    <h2>What carries over, what needs re-work</h2>
                    <p>
                        The policy below is what happens when you fork. A <strong>Minor
                        revision</strong> carries almost everything; a <strong>Variant</strong>{" "}
                        carries the geometry spine but re-runs the brief, BOM deltas, risks,
                        and supplier qualification.
                    </p>
                </div>
                <div className="fk2-carryover__grid">
                    <div className="fk2-carryover__col">
                        <div className="fk2-carryover__col-head">
                            <span className="fk2-carryover__tag carry">Carries over</span>
                        </div>
                        <CarryCard
                            variant="carry"
                            icon={iconModules()}
                            title="Modules (structure)"
                            body="Module breakdown, inter-module connections and named sub-assemblies stay as declared on the parent."
                        />
                        <CarryCard
                            variant="carry"
                            icon={iconGeometry()}
                            title="Geometry"
                            body="CAD spine carries forward. Material / finish / coating become parameters on the new revision rather than full re-draws."
                        />
                        <CarryCard
                            variant="carry"
                            icon={iconBom()}
                            title="BOM"
                            body={
                                forkType === "variant"
                                    ? "Inherits as a seed, then diffs against the new requirements. Expect 10–40% of lines to change on a variant."
                                    : "Carries forward. Only the parts you edit trigger supplier re-qualification on the new revision."
                            }
                        />
                        <CarryCard
                            variant="carry"
                            icon={iconImages()}
                            title="Module images"
                            body="Hero and per-module renders carry across. Optional re-render toggle lands next — today images are shared between revisions."
                        />
                    </div>
                    <div className="fk2-carryover__col">
                        <div className="fk2-carryover__col-head">
                            <span className="fk2-carryover__tag rework">Needs re-work</span>
                        </div>
                        <CarryCard
                            variant="rework"
                            icon={iconCost()}
                            title="Cost"
                            body={
                                forkType === "variant"
                                    ? "Re-computes against the new cost ceiling. Supplier quotes pulled for delta lines; unchanged lines inherit prior costs."
                                    : "Re-computes against the supplier changes you declare. Unchanged parts inherit prior costs."
                            }
                        />
                        <CarryCard
                            variant="rework"
                            icon={iconRisks()}
                            title="Risks"
                            body={
                                forkType === "variant"
                                    ? "New revision starts with the parent's risk register, then variant-specific risks (e.g. export control, corrosion, cold-soak) are added."
                                    : "Risks inherit, then delta lines trip new risk checks for any supplier or material change."
                            }
                        />
                        <CarryCard
                            variant="rework"
                            icon={iconSuppliers()}
                            title="Suppliers"
                            body={
                                forkType === "variant"
                                    ? "Parent shortlist filters through the new requirements (ITAR / UK-SC / region). Suppliers that don't qualify are flagged for replacement."
                                    : "Shortlist carries across. Only the parts you change re-run RFQ — others keep their binding."
                            }
                        />
                        <CarryCard
                            variant="rework"
                            icon={iconLaunch()}
                            title="Launch"
                            body={
                                forkType === "variant"
                                    ? "Launch plan is regenerated. Trial venues, certification steps and readiness gates map to the variant's target market."
                                    : "Launch plan inherits — only the steps affected by your diff (e.g. cert re-test) move dates."
                            }
                        />
                    </div>
                </div>
            </section>

            {/* ── CTA row ─────────────────────────────────────────── */}
            <div className="fk2-cta-row">
                <div className="fk2-cta-note">
                    Creating a new revision will keep the parent locked and intact. Suppliers continue quoting the parent until the new revision is locked.
                    {" "}<strong>Fork type selected:</strong> {forkType === "variant" ? "Variant" : "Minor revision"}.
                </div>
                <div className="fk2-btn-group">
                    <Link href={revisionsHref} className="fk2-btn ghost">← Back to revisions</Link>
                    <button
                        type="button"
                        className="fk2-btn primary"
                        disabled
                        aria-disabled="true"
                        data-fork-type={forkType}
                        title="Form editing ships next round — use the Brief page lock flow for now."
                    >
                        Create fork →
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Fork timeline SVG ─────────────────────────────────────────────────

/**
 * ForkTimelineSvg — horizontal timeline dot chain showing the parent
 * revision (shipped/current), the forking revision (pending), and a
 * greyed-out future revision placeholder. Mirrors the mockup's visual
 * without any HAPS-specific captions.
 */
function ForkTimelineSvg({
    currentLetter,
    currentLocked,
    nextLetter,
    futureLetter,
}: {
    currentLetter: string
    currentLocked: boolean
    nextLetter: string
    futureLetter: string
}): React.ReactElement {
    // The "parent" dot only renders when the current revision is not the
    // first (i.e. currentLetter > "A"). For a first-revision fork, we
    // show Current → Forking → Future instead.
    const hasParent = currentLetter !== "A"
    const parentLetter = hasParent ? prevRevisionLetter(currentLetter) : null

    return (
        <svg
            viewBox="0 0 720 180"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={`Timeline — revision ${currentLetter} forking to ${nextLetter}`}
        >
            {/* Optional parent dot (shipped) */}
            {hasParent && parentLetter && (
                <g>
                    <circle cx="90" cy="90" r="22" fill="#16a34a" stroke="#fff" strokeWidth="3" />
                    <text x="90" y="95" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
                        Rev {parentLetter}
                    </text>
                    <text x="90" y="132" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1c1917">
                        SHIPPED
                    </text>
                    <line x1="112" y1="90" x2="238" y2="90" stroke="#d6d3d1" strokeWidth="2" />
                </g>
            )}

            {/* Current revision dot (active source) */}
            <g>
                <circle
                    cx={hasParent ? "260" : "120"}
                    cy="90"
                    r="22"
                    fill={currentLocked ? "#ff4500" : "#fff"}
                    stroke={currentLocked ? "#fff" : "#ff4500"}
                    strokeWidth="3"
                    strokeDasharray={currentLocked ? "0" : "0"}
                />
                <text
                    x={hasParent ? "260" : "120"}
                    y="95"
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="700"
                    fill={currentLocked ? "#fff" : "#ff4500"}
                >
                    Rev {currentLetter}
                </text>
                <text
                    x={hasParent ? "260" : "120"}
                    y="132"
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="#1c1917"
                >
                    {currentLocked ? "ACTIVE" : "DRAFT"}
                </text>
                <text
                    x={hasParent ? "260" : "120"}
                    y="148"
                    textAnchor="middle"
                    fontSize="10"
                    fill="#78716c"
                >
                    fork source
                </text>
                {/* connector to forking */}
                <line
                    x1={hasParent ? "282" : "142"}
                    y1="90"
                    x2={hasParent ? "448" : "328"}
                    y2="60"
                    stroke="#ff4500"
                    strokeWidth="2.5"
                    strokeDasharray="4,3"
                />
                {/* connector to future (greyed) */}
                <line
                    x1={hasParent ? "282" : "142"}
                    y1="90"
                    x2={hasParent ? "448" : "328"}
                    y2="130"
                    stroke="#d6d3d1"
                    strokeWidth="1.2"
                    strokeDasharray="3,3"
                />
            </g>

            {/* Forking (new) dot */}
            <g>
                <circle
                    cx={hasParent ? "470" : "350"}
                    cy="50"
                    r="22"
                    fill="#fff"
                    stroke="#ff4500"
                    strokeWidth="3"
                    strokeDasharray="5,3"
                />
                <text
                    x={hasParent ? "470" : "350"}
                    y="55"
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="700"
                    fill="#ff4500"
                >
                    Rev {nextLetter}
                </text>
                <text
                    x={hasParent ? "510" : "390"}
                    y="45"
                    textAnchor="start"
                    fontSize="12"
                    fontWeight="700"
                    fill="#ff4500"
                >
                    FORKING NOW
                </text>
                <text
                    x={hasParent ? "510" : "390"}
                    y="60"
                    textAnchor="start"
                    fontSize="10.5"
                    fill="#78716c"
                >
                    parent stays intact
                </text>
            </g>

            {/* Future dot (greyed) */}
            <g>
                <circle
                    cx={hasParent ? "470" : "350"}
                    cy="135"
                    r="18"
                    fill="#fafaf9"
                    stroke="#d6d3d1"
                    strokeWidth="2"
                    strokeDasharray="3,3"
                />
                <text
                    x={hasParent ? "470" : "350"}
                    y="140"
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#a8a29e"
                >
                    {futureLetter}
                </text>
                <text
                    x={hasParent ? "510" : "390"}
                    y="130"
                    textAnchor="start"
                    fontSize="11.5"
                    fill="#78716c"
                >
                    Future · planned
                </text>
                <text
                    x={hasParent ? "510" : "390"}
                    y="145"
                    textAnchor="start"
                    fontSize="10.5"
                    fill="#a8a29e"
                >
                    not yet declared
                </text>
            </g>
        </svg>
    )
}

// ─── Carry-over card ───────────────────────────────────────────────────

function CarryCard({
    variant,
    icon,
    title,
    body,
}: {
    variant: "carry" | "rework"
    icon: React.ReactElement
    title: string
    body: string
}): React.ReactElement {
    return (
        <div className={`fk2-carrycard ${variant}`}>
            <div className="fk2-carrycard__icon" aria-hidden="true">
                {icon}
            </div>
            <div className="fk2-carrycard__body">
                <div className="fk2-carrycard__title">{title}</div>
                <div className="fk2-carrycard__text">{body}</div>
            </div>
        </div>
    )
}

// ─── Inline SVG icons (small, lucide-style strokes) ────────────────────

function iconModules(): React.ReactElement {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
        </svg>
    )
}
function iconGeometry(): React.ReactElement {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L3 7v10l9 5 9-5V7z" />
            <path d="M3 7l9 5 9-5" />
            <path d="M12 22V12" />
        </svg>
    )
}
function iconBom(): React.ReactElement {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="14" y2="17" />
        </svg>
    )
}
function iconImages(): React.ReactElement {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="M21 15l-5-5L5 21" />
        </svg>
    )
}
function iconCost(): React.ReactElement {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    )
}
function iconRisks(): React.ReactElement {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    )
}
function iconSuppliers(): React.ReactElement {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
    )
}
function iconLaunch(): React.ReactElement {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function RevisionChip({ letter, isLocked }: { letter: string; isLocked: boolean }): React.ReactElement {
    return (
        <span className={`fk2-chip ${isLocked ? "brand" : "warning"}`}>
            Revision {letter}{isLocked ? " · locked" : " · draft"}
        </span>
    )
}

function NarrativeField({ k, value }: { k: string; value: string | null }): React.ReactElement {
    const hasValue = typeof value === "string" && value.trim().length > 0
    return (
        <div className="fk2-field">
            <div className="k">{k}</div>
            <div className={`v${hasValue ? "" : " empty"}`}>
                {hasValue ? value : "Not yet declared"}
            </div>
        </div>
    )
}

function ConstraintItem({ k, v }: { k: string; v: string | null }): React.ReactElement {
    const hasValue = typeof v === "string" && v.trim().length > 0
    return (
        <div className="c-item">
            <span className="c-k">{k}:</span>{" "}
            {hasValue ? <strong>{v}</strong> : <span className="empty">—</span>}
        </div>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function nextRevisionLetter(current: number): string {
    const next = Math.max(1, current) + 1
    return designRevisionToLetter(next)
}

/**
 * Given a revision letter (e.g. "C"), returns the preceding letter ("B").
 * Two-letter fallbacks (AA, AB) aren't produced by this helper in
 * practice — the timeline only calls it when currentLetter > "A".
 */
function prevRevisionLetter(letter: string): string {
    if (!letter || letter === "A") return "A"
    // Support one-letter rollback only; >Z rolls back to "A".
    const code = letter.charCodeAt(0)
    if (code > 65 && code <= 90) {
        return String.fromCharCode(code - 1)
    }
    return "A"
}

function designRevisionToLetter(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "A"
    const idx = Math.floor(n) - 1
    if (idx < 26) return String.fromCharCode(65 + idx)
    // Two-letter fallback for >26 revisions (AA, AB, ...).
    const first = Math.floor(idx / 26) - 1
    const second = idx % 26
    return `${String.fromCharCode(65 + first)}${String.fromCharCode(65 + second)}`
}

function formatIsoDate(iso: string): string {
    if (!iso) return ""
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    })
}

/**
 * LaunchPlanView — Launch Checklist artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-LAUNCH.html. Scoped CSS under `.lp2` keeps the
 * mockup's palette / typography isolated from the rest of the platform.
 *
 * Sections (top to bottom, matching the mockup order, then extended with
 * launch-planning sections the task called out):
 *   1. Breadcrumb
 *   2. Page header — title + sub + CTAs
 *   3. Annotation note — what the Launch Checklist is
 *   4. Dormant banner — awaiting first batch award
 *   5. First Article Inspection (FAI)
 *   6. Regulatory compliance sign-off
 *   7. Packaging + shipping
 *   8. Launch date + go/no-go gate (launch-specific, empty state)
 *   9. Comms plan (launch-specific, empty state)
 *  10. Press release (launch-specific, empty state)
 *  11. Customer comms (launch-specific, empty state)
 *  12. Post-launch metrics plan (launch-specific, empty state)
 *
 * Empty-state policy (strict): the mockup shows HAPS / Astra / Nadcap /
 * Mejzlik / VectorNav / Pelican / Marsh example content. We DO NOT mirror
 * any of that. Every check item renders an honest "not declared yet" row
 * unless we can gate it off a real DB signal — only brief lock, module
 * count and CAD upload qualify today. No supplier-award feed exists, so
 * the checklist stays dormant exactly like the mockup's preview state.
 */

"use client"

import Link from "next/link"
import "./launch-plan-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface LaunchPlanViewProps {
    project: {
        id: string
        name: string
        designRevision: number
    }
    brief: {
        /** Quantity target free-text from the brief, e.g. "50 units". Null when undeclared. */
        quantityTarget: string | null
        /** Target first-ship date ISO from brief constraints. Null when undeclared. */
        firstShipDateIso: string | null
    }
    gates: {
        /** Brief revision has been locked (signed off). */
        briefLocked: boolean
        /** Project has been decomposed into modules. */
        hasModules: boolean
        /** How many modules — displayed in the FAI section count. */
        moduleCount: number
        /** Any module has CAD uploaded / assembly STL or STEP exists. */
        hasCad: boolean
        /** At least one make-category has been fully awarded (unlocks the checklist). */
        firstBatchAwarded: boolean
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatShipDate(iso: string | null): string {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

// ─── Subcomponents ──────────────────────────────────────────────────────

interface CheckItemProps {
    done?: boolean
    label: string
    sub?: string
    by?: string
}

function CheckItem({ done, label, sub, by }: CheckItemProps): React.ReactElement {
    return (
        <div className={done ? "lp2-check-item done" : "lp2-check-item"}>
            <div className="lp2-check-box" aria-hidden="true">
                {done ? "✓" : ""}
            </div>
            <div>
                <div className="lp2-check-label">{label}</div>
                {sub ? <div className="lp2-check-sub">{sub}</div> : null}
            </div>
            <div className="lp2-check-by">{by ?? "—"}</div>
        </div>
    )
}

// ─── View ───────────────────────────────────────────────────────────────

export function LaunchPlanView(props: LaunchPlanViewProps): React.ReactElement {
    const { project, brief, gates } = props
    const base = `/the-forge-v2/projects/${project.id}`

    const unlocked = gates.firstBatchAwarded
    const sectionClass = unlocked ? "lp2-section unlocked" : "lp2-section"

    return (
        <div className="lp2">
            {/* ── Breadcrumb ─────────────────────────────── */}
            <div className="lp2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Launch Checklist</span>
            </div>

            {/* ── Page header ────────────────────────────── */}
            <div className="lp2-page-header">
                <div>
                    <h1>
                        <span className="lp2-title-dot" aria-hidden="true" />
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                            <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                        </svg>
                        Launch Checklist · {project.name}
                    </h1>
                    <div className="sub">
                        One-shot pre-ship gate · unlocks once the first batch is awarded · archives
                        after first delivery. Go/No-go review, FAI, compliance, packaging, launch
                        date, comms plan, press release, customer comms and post-launch metrics.
                    </div>
                </div>
                <div className="cta-group">
                    <Link href={`${base}/export`} className="lp2-btn">
                        Print pack
                    </Link>
                </div>
            </div>

            {/* ── Annotation note ────────────────────────── */}
            <div className="lp2-annot">
                <strong>Note</strong>
                Launch Checklist is a one-shot artefact — it fires once pre-ship, then archives.
                Sections stay greyed until the first batch award lands. The preview below shows
                the structure the founder will see once it unlocks.
            </div>

            {/* ── Dormant banner ─────────────────────────── */}
            {!unlocked ? (
                <div className="lp2-dormant-banner">
                    <h2>Dormant · awaiting first batch award</h2>
                    <p>
                        Launch Checklist unlocks when at least one make-category is fully awarded.
                        No supplier awards recorded yet for this project — shortlist suppliers and
                        close an award to unlock the checklist.
                    </p>
                    <div className="lp2-dormant-actions">
                        <Link href={`${base}/suppliers`} className="lp2-btn">
                            Open Suppliers
                        </Link>
                        <Link href={`${base}/risks`} className="lp2-btn ghost">
                            See blocking risks
                        </Link>
                    </div>
                </div>
            ) : null}

            {/* ── Section 1: First Article Inspection (FAI) ── */}
            <div className={sectionClass}>
                <h3>
                    First Article Inspection (FAI)
                    <span className="lp2-section-count">
                        0 of {Math.max(1, gates.moduleCount)} · unlocks with first awarded make-category
                    </span>
                </h3>
                {gates.hasModules ? (
                    <>
                        <div className="lp2-empty-row" style={{ marginBottom: 8 }}>
                            FAI plan is generated per awarded module. No awards recorded yet — once a
                            supplier award closes, a first-article inspection item lands here for
                            each awarded make-category.
                        </div>
                        <CheckItem
                            label="FAI sign-off per awarded module"
                            sub={`${gates.moduleCount} module${gates.moduleCount === 1 ? "" : "s"} decomposed · awaiting awards`}
                        />
                        <CheckItem
                            label="Dimensional inspection report (CMM or equivalent)"
                            sub="Test house not selected yet"
                        />
                        <CheckItem
                            label="Non-destructive test report (if required)"
                            sub="Required-test list not derived yet"
                        />
                        <CheckItem
                            label="Material cert + lot traceability pack"
                            sub="Supplier cert collection not opened yet"
                        />
                        <CheckItem
                            label="Witness-mark + torque audit for flight-critical fasteners"
                            sub="Critical fastener list not declared yet"
                        />
                        <CheckItem
                            label="Inventory / out-life log for time-sensitive stock"
                            sub="Applicability flagged once BOM is populated"
                        />
                    </>
                ) : (
                    <div className="lp2-empty-row">
                        No modules decomposed yet. Decompose the concept in the CAD lab, then
                        shortlist suppliers in the{" "}
                        <Link href={`${base}/suppliers`} className="lp2-link">Suppliers artefact</Link>{" "}
                        so FAI items can be generated per awarded make-category.
                    </div>
                )}
            </div>

            {/* ── Section 2: Regulatory compliance sign-off ── */}
            <div className={sectionClass}>
                <h3>
                    Regulatory compliance sign-off
                    <span className="lp2-section-count">0 of — · not declared yet</span>
                </h3>
                <div className="lp2-empty-row" style={{ marginBottom: 8 }}>
                    No regulatory items declared for this project. Compliance requirements are
                    captured in the Brief editor and auto-promoted here once declared — the
                    checklist will then track each cert / DoC / test report with its owner and
                    due date.
                </div>
                <CheckItem
                    label="Operational authorisation pathway confirmed"
                    sub="Not declared in brief yet"
                />
                <CheckItem
                    label="Export-control classification determined"
                    sub="Not declared in brief yet"
                />
                <CheckItem
                    label="Conformity assessment / DoC package"
                    sub="Not declared in brief yet"
                />
                <CheckItem
                    label="Safety / environmental test reports"
                    sub="Test house and scope not declared yet"
                />
                <CheckItem
                    label="Software equivalence / qualification evidence"
                    sub="Not declared in brief yet"
                />
                <CheckItem
                    label="Jurisdictional notifications (if applicable)"
                    sub="Applicability not declared yet"
                />
                <CheckItem
                    label="Substance / materials attestations from suppliers"
                    sub="Supplier packet not opened yet"
                />
            </div>

            {/* ── Section 3: Packaging + shipping ─────────── */}
            <div className={sectionClass}>
                <h3>
                    Packaging + shipping
                    <span className="lp2-section-count">0 of 4 · locked until FAI passes</span>
                </h3>
                <CheckItem
                    label="Transport / crate specification"
                    sub="Packaging vendor not selected yet"
                />
                <CheckItem
                    label="Certificate of Conformity (CoC) packet per unit"
                    sub="CoC template not drafted yet"
                />
                <CheckItem
                    label="Customer acceptance test procedure (ATP)"
                    sub="ATP not drafted yet"
                />
                <CheckItem
                    label="Shipping insurance + terms"
                    sub={brief.quantityTarget ? `Quantity target: ${brief.quantityTarget} · insurer not selected yet` : "Quantity target and insurer not declared yet"}
                />
            </div>

            {/* ── Section 4: Launch date + go/no-go gate ──── */}
            <div className={sectionClass}>
                <h3>
                    Launch date &amp; go/no-go gate
                    <span className="lp2-section-count">0 of 3 · not scheduled yet</span>
                </h3>
                <CheckItem
                    label="Target launch date"
                    sub={brief.firstShipDateIso
                        ? `Target first ship from brief: ${formatShipDate(brief.firstShipDateIso)} · launch date not separately declared`
                        : "Not set"}
                />
                <CheckItem
                    label="Go/No-go review scheduled"
                    sub="No review scheduled yet — attendees, date and criteria not declared"
                />
                <CheckItem
                    label="Brief revision locked as launch baseline"
                    done={gates.briefLocked}
                    sub={gates.briefLocked
                        ? "Current brief revision is locked"
                        : "Brief not locked yet"}
                    by={gates.briefLocked ? "Brief lock" : undefined}
                />
            </div>

            {/* ── Section 5: Comms plan ──────────────────── */}
            <div className={sectionClass}>
                <h3>
                    Comms plan
                    <span className="lp2-section-count">0 of 3 · not drafted yet</span>
                </h3>
                <div className="lp2-empty-row" style={{ marginBottom: 8 }}>
                    No comms plan drafted yet. A launch comms plan captures audience list,
                    channel mix, sequencing and owner per message. Populates once the
                    cross-channel comms store lands.
                </div>
                <CheckItem
                    label="Audience list + channel mix"
                    sub="Not drafted yet"
                />
                <CheckItem
                    label="Sequencing + embargo plan"
                    sub="Not drafted yet"
                />
                <CheckItem
                    label="Owner assigned per message"
                    sub="Owners not assigned yet"
                />
            </div>

            {/* ── Section 6: Press release ───────────────── */}
            <div className={sectionClass}>
                <h3>
                    Press release
                    <span className="lp2-section-count">0 of 3 · not drafted yet</span>
                </h3>
                <CheckItem
                    label="Press release draft"
                    sub="Not drafted yet"
                />
                <CheckItem
                    label="PR distribution list"
                    sub="Not drafted yet"
                />
                <CheckItem
                    label="Embargo + on-sale date agreed"
                    sub="Not scheduled yet"
                />
            </div>

            {/* ── Section 7: Customer comms ──────────────── */}
            <div className={sectionClass}>
                <h3>
                    Customer comms
                    <span className="lp2-section-count">0 of 3 · not drafted yet</span>
                </h3>
                <CheckItem
                    label="Customer launch email draft"
                    sub="Not drafted yet"
                />
                <CheckItem
                    label="Acceptance + onboarding pack"
                    sub="Not drafted yet"
                />
                <CheckItem
                    label="Support + escalation contact list"
                    sub="Not drafted yet"
                />
            </div>

            {/* ── Section 8: Post-launch metrics plan ─────── */}
            <div className={sectionClass}>
                <h3>
                    Post-launch metrics plan
                    <span className="lp2-section-count">0 of 3 · not defined yet</span>
                </h3>
                <div className="lp2-empty-row" style={{ marginBottom: 8 }}>
                    No success metrics defined yet. Decide what signals count as launch-healthy
                    (acceptance rate, field NCRs, time-to-first-flight, MTBF, NPS) and who owns
                    each review cadence.
                </div>
                <CheckItem
                    label="Success metrics"
                    sub="Not defined yet"
                />
                <CheckItem
                    label="Review cadence + owner"
                    sub="Not assigned yet"
                />
                <CheckItem
                    label="Rollback / stop-ship trigger thresholds"
                    sub="Not defined yet"
                />
            </div>

            {/* ── Annotation footer ──────────────────────── */}
            <div className="lp2-annot" style={{ marginTop: 24 }}>
                <strong>Note</strong>
                Launch Checklist auto-populates from upstream artefacts. Locking the brief
                anchors the launch baseline. Closing the first supplier award unlocks the
                checklist. FAI, compliance and packaging items are generated from awarded
                make-categories and the brief&apos;s regulatory declarations. Launch-specific
                items (date, comms, PR, customer comms, metrics) populate once the launch
                planner store ships.
            </div>
        </div>
    )
}

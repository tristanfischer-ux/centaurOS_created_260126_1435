/**
 * PromoteView — Project "promote to product line" confirmation surface (V2, data-wired).
 *
 * Mockup-faithful port of FORGE-MOCKUP-PROMOTE.html. The mockup was drawn as a
 * supplier promotion flow (Zimmermann → preferred); the same structural shell
 * (wizard head + numbered step nav + side-by-side compare + "what this will
 * cost/create" checklist + wizard foot) is re-used here for the project → product
 * promotion that lives at /the-forge-v2/projects/:id/promote.
 *
 * Variants:
 *   - draft (not yet promoted) → 4-step wizard with the confirm step current,
 *     primary CTA disabled with "Promotion ships with the products store next
 *     round" tooltip. All compare + checklist content is populated from the
 *     real project — module count, part count, supplier count, cost roll-up.
 *   - already promoted (linked Product row exists) → success banner in place
 *     of the wizard body explaining the project is already linked, plus a
 *     link back to the Products surface.
 *
 * Empty-state policy: every slot renders an honest neutral value when the
 * underlying field is missing ("—", "Not declared", "No estimate yet"). We
 * NEVER synthesise the mockup's Zimmermann / Astra example content.
 */

"use client"

import Link from "next/link"
import "./promote-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface PromoteChecklistItem {
    /** Short card title — ~4 words. */
    title: string
    /** One-line explanation of what this row means. */
    meta: string
    /** Right-hand status chip text — e.g. "Ready", "On confirm", "No estimate". */
    status: string
    /** Green tick when the prerequisite is already satisfied. */
    done: boolean
}

export interface PromoteCompareRow {
    k: string
    /** Null → rendered as italic "—" empty state (never fabricated). */
    v: string | null
    /** Optional pill variant for values like "valid" / "expired" / "queued". */
    pill?: "green" | "red" | "amber" | "neutral"
}

export interface PromoteViewProps {
    project: {
        id: string
        name: string
        subject: string
        /** Current lifecycle stage of the CAD project ("research", "decomposed", "generated", "complete", ...). */
        stage: string
    }
    /** Linked Product row if promote has already happened. */
    linkedProduct: {
        id: string
        name: string
        lifecycle: string
    } | null
    /** Seeded Product lifecycle — "concept" when design isn't complete yet, "prototyping" when it is. */
    targetLifecycle: "concept" | "prototyping"
    /** Whether the project has hit the "design complete" gate. */
    isDesignComplete: boolean
    /** Aggregate stats sourced from loadCadLabProject. */
    stats: {
        moduleCount: number
        partCount: number
        supplierCount: number
        /** Null when no AI cost estimate exists on any module. */
        rollupCogsGbp: number | null
    }
    /** Pre-promote checklist — derived from project state on the server. */
    checklist: PromoteChecklistItem[]
}

// ─── View ──────────────────────────────────────────────────────────────

export function PromoteView(props: PromoteViewProps): React.ReactElement {
    const { project, linkedProduct, targetLifecycle, isDesignComplete, stats, checklist } = props

    const workspaceHref = `/the-forge-v2/projects/${project.id}`

    const alreadyPromoted = linkedProduct !== null

    // ── Compare card content ────────────────────────────────────────────
    // Left card = the Forge project as-is (the "winner", promoted up).
    // Right card = the Products row that will carry the commercial story
    // (the mockup's "backup" slot is re-purposed as the sibling that the
    // build artefact hands its commercial side to). Both are honest; if
    // already promoted, right card shows the live Product row state.

    const leftRows: PromoteCompareRow[] = [
        {
            k: "Lifecycle stage",
            v: project.stage || "pending",
            pill: "neutral",
        },
        {
            k: "Modules decomposed",
            v: stats.moduleCount > 0 ? String(stats.moduleCount) : null,
        },
        {
            k: "Key parts declared",
            v: stats.partCount > 0 ? String(stats.partCount) : null,
        },
        {
            k: "Supplier contacts",
            v: stats.supplierCount > 0 ? String(stats.supplierCount) : null,
        },
        {
            k: "Rolled-up COGS",
            v: stats.rollupCogsGbp != null ? `£${Math.round(stats.rollupCogsGbp).toLocaleString("en-GB")}/unit` : null,
        },
        {
            k: "Design complete",
            v: isDesignComplete ? "Yes" : "No — still iterating",
            pill: isDesignComplete ? "green" : "amber",
        },
    ]

    const rightRows: PromoteCompareRow[] = alreadyPromoted
        ? [
            { k: "Product row", v: linkedProduct.name, pill: "green" },
            { k: "Lifecycle", v: linkedProduct.lifecycle, pill: "neutral" },
            {
                k: "Link target",
                v: "This Forge project",
            },
            { k: "Commercial surface", v: "Products — pricing, LOIs, market" },
            { k: "Build surface", v: "Forge — BOM, suppliers, CAD, risks" },
            { k: "Reversible", v: "Yes — deleting the Product row leaves Forge untouched" },
        ]
        : [
            {
                k: "Product row",
                v: `${project.name} — to be created`,
                pill: "amber",
            },
            {
                k: "Seeded lifecycle",
                v: targetLifecycle,
                pill: "neutral",
            },
            {
                k: "Commercial surface",
                v: "Products — pricing, LOIs, market",
            },
            {
                k: "Build surface",
                v: "Forge — BOM, suppliers, CAD, risks",
            },
            {
                k: "Link target",
                v: "Back to this Forge project",
            },
            {
                k: "Reversible",
                v: "Yes — deleting the Product row leaves Forge untouched",
            },
        ]

    return (
        <div className="pm2">
            {/* ── Breadcrumb ──────────────────────────────────────── */}
            <nav className="pm2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={workspaceHref}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Promote to Product</span>
            </nav>

            {/* ── Intro annotation ────────────────────────────────── */}
            <div className="pm2-annot">
                <strong>Note</strong>
                Promoting creates a linked row in the <strong>Products</strong> surface for the
                commercial story (pricing, assumption tests, LOIs, market sizing). The Forge
                project keeps owning the build artefacts (BOM, suppliers, CAD, risks). Nothing
                in this workspace changes. Reversible — you can delete the Product row without
                touching the project.
            </div>

            <h1 className="pm2-title"><span className="pm2-title-dot" aria-hidden="true" />Promote {project.name} to a Product line</h1>
            <p className="pm2-subtitle">
                The Forge project stays canonical for engineering; the Product row owns the
                commercial hypothesis. This surface previews what the row will look like before
                the promote action runs.
            </p>

            {/* ── Wizard shell ────────────────────────────────────── */}
            <div className="pm2-wizard">

                {/* Head */}
                <div className="pm2-wizard-head">
                    <h2>
                        {alreadyPromoted
                            ? "Already promoted — review linked Product"
                            : "Project promotion — step 2 of 4"}
                    </h2>
                    <div className="step">{alreadyPromoted ? "Linked" : "Est. 2 minutes"}</div>
                </div>

                {/* Step nav — mirrors the mockup's 4-step flow. Steps 3 and 4
                    ship with the Products store in a follow-up round. */}
                <div className="pm2-wizard-steps" role="tablist" aria-label="Promotion steps">
                    <div className={`s ${alreadyPromoted ? "done" : "done"}`}>
                        <span className="num">{alreadyPromoted ? "✓" : "✓"}</span> Check readiness
                    </div>
                    <div className={`s ${alreadyPromoted ? "done" : "current"}`}>
                        <span className="num">{alreadyPromoted ? "✓" : "2"}</span> Compare &amp; confirm
                    </div>
                    <div className={`s ${alreadyPromoted ? "done" : ""}`}>
                        <span className="num">{alreadyPromoted ? "✓" : "3"}</span> Seed Product row
                    </div>
                    <div className={`s ${alreadyPromoted ? "done" : ""}`}>
                        <span className="num">{alreadyPromoted ? "✓" : "4"}</span> Notify team
                    </div>
                </div>

                {/* Body */}
                {alreadyPromoted ? (
                    <AlreadyPromotedBanner linkedProductId={linkedProduct.id} linkedProductName={linkedProduct.name} lifecycle={linkedProduct.lifecycle} />
                ) : (
                    <div className="pm2-wizard-body">

                        <h3>Side-by-side comparison</h3>
                        <p>
                            The Forge project keeps every build artefact it owns today; a sibling
                            Products row is created to carry pricing, assumption tests and LOIs.
                            Ownership split is permanent but the link is reversible.
                        </p>

                        <div className="pm2-compare-grid">

                            <div className="pm2-compare-card winner">
                                <h4>
                                    {project.name}
                                    <span className="role primary">Forge (build)</span>
                                </h4>
                                <div className="loc">
                                    {project.subject || "— no subject declared"}
                                </div>
                                {leftRows.map((row) => (
                                    <CompareRow key={row.k} row={row} />
                                ))}
                            </div>

                            <div className="pm2-compare-card">
                                <h4>
                                    {project.name} — Product line
                                    <span className="role backup">Products (commercial)</span>
                                </h4>
                                <div className="loc">
                                    Row to be created — seeded from the project
                                </div>
                                {rightRows.map((row) => (
                                    <CompareRow key={row.k} row={row} />
                                ))}
                            </div>

                        </div>

                        <h3>What this will create</h3>
                        <p>
                            The preview below is rolled up from this project&apos;s modules, parts,
                            suppliers and cost estimates. Empty rows stay empty — we don&apos;t
                            fabricate defaults.
                        </p>

                        <div className="pm2-checklist">
                            {checklist.map((item, idx) => (
                                <div
                                    key={`${idx}-${item.title}`}
                                    className={`pm2-checklist-item ${item.done ? "done" : "pending"}`}
                                >
                                    <div className="check" aria-hidden="true">{item.done ? "✓" : ""}</div>
                                    <div className="body">
                                        <div className="title">{item.title}</div>
                                        <div className="meta">{item.meta}</div>
                                    </div>
                                    <div className="status">{item.status}</div>
                                </div>
                            ))}
                        </div>

                    </div>
                )}

                {/* Foot — CTA strip. Primary action disabled until the promote
                    mutation wires in next round; ghost button sends the user
                    back to the project workspace. */}
                <div className="pm2-wizard-foot">
                    <Link href={workspaceHref} className="pm2-btn-ghost">
                        ← Back to project
                    </Link>
                    <div className="note">
                        {alreadyPromoted
                            ? "This project is already linked to a Product row."
                            : "Promotion ships with the products store next round."}
                    </div>
                    {alreadyPromoted ? (
                        <Link
                            href={`/products/${linkedProduct.id}`}
                            className="pm2-btn-primary"
                            style={{ cursor: "pointer", opacity: 1 }}
                        >
                            Open Product →
                        </Link>
                    ) : (
                        <button
                            type="button"
                            className="pm2-btn-primary"
                            disabled
                            aria-disabled="true"
                            title="Promotion ships with the products store next round"
                        >
                            Promote → seed Product row
                        </button>
                    )}
                </div>
            </div>

            {/* Tail annotation — matches the mockup's "Note" footer about
                what the remaining steps do. */}
            <div className="pm2-annot" style={{ marginTop: 20, marginBottom: 0 }}>
                <strong>Note</strong>
                Steps 3 and 4 ship with the Products store in the next round. Step 3 seeds the
                Product row (name, description, hero image, lifecycle, rolled-up COGS). Step 4
                notifies the team a commercial surface now exists for this build. Both are
                pauseable and resumable, and the Forge project stays the canonical record for
                engineering changes either way.
            </div>

        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function CompareRow({ row }: { row: PromoteCompareRow }): React.ReactElement {
    const hasValue = typeof row.v === "string" && row.v.trim().length > 0
    return (
        <div className="row">
            <div className="k">{row.k}</div>
            {hasValue ? (
                row.pill ? (
                    <div className="v">
                        <span className={`pm2-pill pm2-pill-${row.pill}`}>{row.v}</span>
                    </div>
                ) : (
                    <div className="v">{row.v}</div>
                )
            ) : (
                <div className="v empty">—</div>
            )}
        </div>
    )
}

function AlreadyPromotedBanner({
    linkedProductId,
    linkedProductName,
    lifecycle,
}: {
    linkedProductId: string
    linkedProductName: string
    lifecycle: string
}): React.ReactElement {
    return (
        <div className="pm2-linked-banner" role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div>
                <strong>This project is already promoted.</strong>
                A linked Product row — <strong style={{ display: "inline", fontWeight: 700 }}>{linkedProductName}</strong> — now carries the
                commercial story (lifecycle <em>{lifecycle}</em>). Edits to the Forge project
                flow through as build signals; Products owns pricing, LOIs and market sizing.
                <div className="meta">
                    Product ID · {linkedProductId}
                </div>
            </div>
        </div>
    )
}


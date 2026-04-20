/**
 * PartDetailView — Part detail artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-PART-DETAIL.html. Scoped CSS under `.pd2` keeps styling
 * isolated so the mockup's palette/typography don't leak into the rest of the
 * platform (convention mirrors `.bm2` / BomView).
 *
 * Sections (top to bottom, matching mockup order):
 *   1. Breadcrumb
 *   2. Page header — title + purpose line + CTAs
 *   3. Dual-illustration hero (render pane + engineering drawing pane)
 *   4. Spec strip — 6 key-spec tiles
 *   5. Description (rich paragraphs)
 *   6. Why this part matters (orange callout)
 *   7. Inputs & outputs (interface contract columns)
 *   8. Key components (icon list)
 *   9. Failure modes (icon list)
 *  10. Unknowns (icon list)
 *  11. Lead time pill
 *  12. Design grounded in (teal pills)
 *  13. Supplier options (ranked candidates)
 *  14. Inspection / metrology + Revision history (two-column split)
 *  15. Related parts (siblings in the same module)
 *
 * Empty-state policy (from brief):
 *   - Most per-part fields (tolerance, supplier, quote, qty/asm, spec-fit flags,
 *     FAI schedule, CMM dims, inspection plan, lifecycle state) don't exist in
 *     the data model today. Render the mockup's section layout with honest
 *     "—" / "Not yet declared" copy. Never fake Astra/T800 specifics.
 *   - Illustration: module image if present, else blueprint placeholder.
 *   - Material/process/tolerance: parsed from part name (partDescription)
 *     if material hints are encoded in the keyPart string, else "—".
 *   - Supplier: "Not yet shortlisted" link to `/projects/{id}/suppliers`.
 *   - Cost: from AI estimate .parts[] if matched by name, else "—".
 *   - Inspection / metrology / revision history / related parts: honest empty.
 */

"use client"

import Link from "next/link"
import Image from "next/image"
import "./part-detail-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface PartDetailSpec {
    /** Short label for the strip tile. */
    label: string
    /** Value — pass "—" to render as empty-dash. */
    value: string
    /** When true, renders the value muted/italic. */
    empty?: boolean
}

export interface PartDetailRelated {
    /** Slug used in the part URL (already URL-safe). */
    slug: string
    /** Short display name. */
    name: string
    /** Optional subtitle derived from partDescription(). */
    meta: string | null
}

export interface PartDetailViewProps {
    project: {
        id: string
        name: string
    }
    module: {
        id: string
        name: string
        /** One-sentence module purpose. */
        purpose: string
        /** Module-level blueprint image URL (Gemini output) if available. */
        imageUrl: string | null
        /** Which model generated the image (caption). */
        imageModelUsed: string | null
        /** Module-level lead weeks — used as an illustration caption fallback. */
        leadWeeks: number | null
    }
    part: {
        /** Canonical slug used in the URL. */
        slug: string
        /** Short display name (from shortenPartName). */
        displayName: string
        /** Remainder from the raw keyPart — used as the purpose line + description source. */
        description: string | null
        /** The full original keyPart string. */
        raw: string
    }
    /** Specs strip — always 6 cells; unknown → empty. */
    specs: PartDetailSpec[]
    /** Per-part AI cost estimate (from aiCostEstimates[module].parts[]). Null when not matched. */
    cost: {
        gbp: number
        type: "buy" | "make"
        reasoning: string | null
    } | null
    /** Sibling parts in the same module. Current part excluded. */
    related: PartDetailRelated[]
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatGbp(value: number | null): string {
    if (value == null) return "—"
    if (Math.abs(value) >= 10_000) return `£${Math.round(value / 1000).toLocaleString()}k`
    if (Math.abs(value) >= 1000) return `£${(value / 1000).toFixed(1)}k`
    return `£${Math.round(value).toLocaleString()}`
}

// ─── View ──────────────────────────────────────────────────────────────

export function PartDetailView(props: PartDetailViewProps): React.ReactElement {
    const { project, module: mod, part, specs, cost, related } = props
    const base = `/the-forge-v2/projects/${project.id}`
    const moduleHref = `${base}/modules/${mod.id}`
    const suppliersHref = `${base}/suppliers`

    const hasDescription = part.description != null && part.description.trim().length > 0

    return (
        <div className="pd2">
            {/* ── Breadcrumb ─────────────────────────── */}
            <div className="pd2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={moduleHref}>{mod.name}</Link>
                <span className="sep">›</span>
                <span className="current">{part.displayName}</span>
            </div>

            {/* ── Page header ────────────────────────── */}
            <div className="pd2-page-header">
                <div>
                    <h1>
                        {part.displayName}
                        <span className="pd2-chip info solid" style={{ marginLeft: 6 }}>Ref pending</span>
                    </h1>
                    <p className="pd2-purpose-line">
                        {hasDescription
                            ? part.description
                            : `Component of the ${mod.name} module. Per-part specification has not yet been declared.`}
                        {" "}Parent module:{" "}
                        <Link href={moduleHref}>{mod.name}</Link>.
                    </p>
                </div>
                <div className="pd2-cta-group">
                    <span className="pd2-btn soon" title="Drawing PDF generation ships with the parts-spec store">
                        Download drawing PDF
                    </span>
                    <Link href={suppliersHref} className="pd2-btn">Request quote</Link>
                    <span className="pd2-btn primary soon" title="Part award flows ship with the RFQ module">
                        Mark as awarded
                    </span>
                </div>
            </div>

            {/* ── Dual-illustration hero ──────────────── */}
            <div className="pd2-dual-hero">

                {/* Left: illustration (module image as fallback) */}
                <div className="pd2-hero-pane">
                    <div className="pd2-hero-pane-head">
                        <span className="label">
                            {mod.imageUrl ? "Module blueprint render" : "Illustration"}
                        </span>
                    </div>
                    <div className="pd2-hero-pane-body">
                        {mod.imageUrl ? (
                            <Image
                                src={mod.imageUrl}
                                alt={`${mod.name} blueprint (shown as context for ${part.displayName})`}
                                width={800}
                                height={320}
                                style={{ width: "100%", height: "100%", objectFit: "cover", maxHeight: 320 }}
                                unoptimized
                            />
                        ) : (
                            <div className="pd2-hero-placeholder">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                    <path d="M3 9h18" />
                                    <path d="M9 21V9" />
                                </svg>
                                <strong>No illustration yet</strong>
                                <span>Module blueprint is generated during CAD pipeline. Part-level renders ship with the parts-spec store.</span>
                            </div>
                        )}
                    </div>
                    <div className="pd2-hero-pane-caveat">
                        <span>
                            {mod.imageUrl
                                ? `Module-level illustration${mod.imageModelUsed ? ` · ${mod.imageModelUsed}` : ""}`
                                : "Illustration pending"}
                        </span>
                    </div>
                </div>

                {/* Right: engineering drawing pane — empty until drawings ship */}
                <div className="pd2-hero-pane">
                    <div className="pd2-hero-pane-head">
                        <span className="label">Engineering drawing</span>
                    </div>
                    <div className="pd2-hero-pane-body">
                        <div className="pd2-hero-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="8" y1="13" x2="16" y2="13" />
                                <line x1="8" y1="17" x2="16" y2="17" />
                            </svg>
                            <strong>No drawing sheet yet</strong>
                            <span>Dimensioned release sheets are generated from the parts-spec store once material, tolerance and datum scheme are declared.</span>
                        </div>
                    </div>
                    <div className="pd2-hero-pane-caveat">
                        <span>Drawing sheet not yet generated</span>
                    </div>
                </div>
            </div>

            {/* ── Spec strip ──────────────────────────── */}
            <div className="pd2-spec-strip">
                {specs.map((s, i) => (
                    <div key={`${s.label}-${i}`} className="pd2-spec-cell">
                        <div className="k">{s.label}</div>
                        <div className={`v ${s.empty ? "empty" : ""}`}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* ── Description ─────────────────────────── */}
            <div className="pd2-section-block">
                <h4 className="pd2-section-head">Description</h4>
                <div className="pd2-rich-body">
                    {hasDescription ? (
                        <p style={{ whiteSpace: "pre-wrap" }}>{part.description}</p>
                    ) : (
                        <p className="pd2-empty">
                            No part-level description authored yet. The CAD lab captures material, geometry, and
                            interfaces against the module — per-part narrative ships with the parts-spec store.
                        </p>
                    )}
                </div>
            </div>

            {/* ── Why this part matters ───────────────── */}
            <div className="pd2-why-matters">
                <h4>Why this part matters</h4>
                Part-level rationale hasn&apos;t been declared yet. For now, see the module&apos;s{" "}
                <Link href={moduleHref} style={{ color: "var(--pd-brand)", fontWeight: 600 }}>
                    &quot;Why this module matters&quot;
                </Link>{" "}
                section for the parent assembly&apos;s mission-relevance.
            </div>

            {/* ── Inputs & outputs ────────────────────── */}
            <div className="pd2-section-block">
                <h4 className="pd2-section-head">Inputs &amp; outputs — interface contract</h4>
                <div className="pd2-io-grid">
                    <div className="pd2-io-col">
                        <h4>Inputs</h4>
                        <div className="pd2-io-list">
                            <span className="pd2-io-pill input" style={{ color: "var(--pd-fg-muted)", fontStyle: "italic" }}>
                                Not yet declared — per-part interface contracts ship with the parts-spec store.
                            </span>
                        </div>
                    </div>
                    <div className="pd2-io-arrow">→</div>
                    <div className="pd2-io-col">
                        <h4>Outputs</h4>
                        <div className="pd2-io-list">
                            <span className="pd2-io-pill output" style={{ color: "var(--pd-fg-muted)", fontStyle: "italic" }}>
                                Not yet declared — see <Link href={moduleHref} style={{ color: "var(--pd-brand)", textDecoration: "none" }}>module interfaces</Link> for the surrounding context.
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Key components ──────────────────────── */}
            <div className="pd2-section-block">
                <h4 className="pd2-section-head">Key components</h4>
                <ul className="pd2-icon-list">
                    <li>
                        <svg className="ico bullet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                        <div>
                            {hasDescription ? (
                                <>
                                    <strong>{part.displayName}</strong> — {part.description}
                                </>
                            ) : (
                                <em>Sub-components for this part have not yet been decomposed. Run a part-level decomposition pass in CAD lab.</em>
                            )}
                        </div>
                    </li>
                </ul>
            </div>

            {/* ── Failure modes ───────────────────────── */}
            <div className="pd2-section-block">
                <h4 className="pd2-section-head">Failure modes</h4>
                <ul className="pd2-icon-list">
                    <li>
                        <svg className="ico warn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <div>
                            <em>
                                Part-level failure modes have not yet been declared. The module carries
                                its own failure-mode inventory — review at{" "}
                                <Link href={`${moduleHref}#failure-modes`} style={{ color: "var(--pd-brand)", textDecoration: "none", fontWeight: 600 }}>
                                    {mod.name} · failure modes
                                </Link>.
                            </em>
                        </div>
                    </li>
                </ul>
            </div>

            {/* ── Unknowns ────────────────────────────── */}
            <div className="pd2-section-block">
                <h4 className="pd2-section-head">Unknowns</h4>
                <ul className="pd2-icon-list">
                    <li>
                        <svg className="ico info" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <div>
                            <em>
                                No open questions tracked at the part level yet. Ask a specialist to do the first pass:{" "}
                                <Link href={`${base}/specialists/vp-manufacturing`} style={{ color: "var(--pd-brand)", textDecoration: "none", fontWeight: 600 }}>
                                    Ask Fang →
                                </Link>
                            </em>
                        </div>
                    </li>
                </ul>
            </div>

            {/* ── Lead time pill ──────────────────────── */}
            <div className="pd2-lead-time-pill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
                {mod.leadWeeks != null
                    ? <>Lead time: ~{mod.leadWeeks} wk <span className="sep">·</span> module-level estimate <span className="sep">·</span> part-level quote pending</>
                    : <>Lead time not yet declared <span className="sep">·</span> request a quote to establish</>}
            </div>

            {/* ── Design grounded in ──────────────────── */}
            <div className="pd2-grounded">
                <div className="head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" />
                    </svg>
                    <span>Design grounded in</span>
                </div>
                <div className="pills">
                    <Link href="/the-forge-v2/library/materials" className="pill">
                        <span className="diamond" aria-hidden="true" /> Material library
                    </Link>
                    <Link href="/the-forge-v2/library/hardware" className="pill">
                        <span className="diamond" aria-hidden="true" /> Standard hardware
                    </Link>
                    <Link href="/the-forge-v2/library/processes" className="pill">
                        <span className="diamond" aria-hidden="true" /> Process capabilities
                    </Link>
                </div>
                <p className="footnote">
                    Specifications will draw on verified engineering data — material properties, ISO hardware dimensions,
                    and process capability limits from the ForgeOS engineering library — once part-level material and
                    process are declared.
                </p>
            </div>

            {/* ── Supplier options ────────────────────── */}
            <div className="pd2-supplier-options">
                <h3>Supplier options</h3>
                <div className="pd2-supplier-empty">
                    <p style={{ margin: 0 }}>
                        <strong style={{ color: "var(--pd-fg)" }}>Not yet shortlisted.</strong>
                        {" "}Supplier matching for individual parts runs off the shortlist you build at the project level.
                    </p>
                    <p style={{ margin: "8px 0 0" }}>
                        <Link href={suppliersHref}>Open the supplier shortlist →</Link>
                    </p>
                </div>
            </div>

            {/* ── Inspection + Revision history (two-column split) ───── */}
            <div className="pd2-side">
                <div className="pd2-card">
                    <h3>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M9 11l3 3L22 4" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                        Inspection &amp; metrology
                        <span className="grounding">empty — awaiting spec</span>
                    </h3>
                    <div className="pd2-card-empty">
                        <p style={{ margin: 0 }}>
                            First-article inspection (FAI) schedule, critical dimensions, and CMM/NDT plans
                            populate once the part-level tolerance and datum scheme are declared.
                        </p>
                        <p style={{ margin: "8px 0 0" }}>
                            Draft the inspection plan with Fang: {" "}
                            <Link href={`${base}/specialists/vp-manufacturing`}>Ask Fang →</Link>
                        </p>
                    </div>
                </div>

                <div className="pd2-card">
                    <h3>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 3v5h5" />
                            <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                            <path d="M12 7v5l4 2" />
                        </svg>
                        Revision history
                        <span className="grounding">rev 1</span>
                    </h3>
                    <div className="pd2-card-empty">
                        <p style={{ margin: 0 }}>This part hasn&apos;t been revised yet.</p>
                        <p style={{ margin: "8px 0 0" }}>
                            Revisions log automatically when a brief is locked and re-locked. See the{" "}
                            <Link href={`${base}/brief-lock`}>brief lock page</Link>.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Cost panel (uses AI estimate if matched) ───── */}
            <div className="pd2-card">
                <h3>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M15 9.5a3 3 0 0 0-3-2.5c-1.66 0-3 1.34-3 3 0 .83.34 1.58.88 2.12m.12 2.88h5.5M8 17h7" />
                    </svg>
                    Cost
                    <span className="grounding">
                        {cost != null ? "AI estimate · per-part" : "no estimate yet"}
                    </span>
                </h3>
                {cost != null ? (
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--pd-border)" }}>
                            <span style={{ color: "var(--pd-fg-muted)", fontSize: 12 }}>
                                {cost.type === "buy" ? "Purchase (COTS)" : "Manufacture"}
                            </span>
                            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 14 }}>
                                {formatGbp(cost.gbp)}
                            </span>
                        </div>
                        {cost.reasoning && (
                            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--pd-fg-muted)", lineHeight: 1.55 }}>
                                {cost.reasoning}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="pd2-card-empty">
                        <p style={{ margin: 0 }}>
                            No per-part cost estimate yet.
                            {" "}
                            <Link href={`${base}/cost`}>Run a cost pass</Link>
                            {" "}to roll module-level AI estimates down to parts.
                        </p>
                    </div>
                )}
            </div>

            {/* ── Related parts (siblings in module) ──── */}
            <div className="pd2-card">
                <h3>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    Related parts in {mod.name}
                    <span className="grounding">
                        {related.length === 0 ? "no siblings" : `${related.length} sibling${related.length === 1 ? "" : "s"}`}
                    </span>
                </h3>
                {related.length === 0 ? (
                    <div className="pd2-card-empty">
                        <p style={{ margin: 0 }} className="pd2-related-empty">—</p>
                        <p style={{ margin: "8px 0 0" }}>
                            No other parts listed on this module yet.
                        </p>
                    </div>
                ) : (
                    <div className="pd2-related-list">
                        {related.map((r) => (
                            <Link
                                key={r.slug}
                                href={`${moduleHref}/parts/${r.slug}`}
                            >
                                <span>
                                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                                    {r.meta && (
                                        <span style={{ color: "var(--pd-fg-muted)", marginLeft: 8, fontSize: 11.5 }}>
                                            {r.meta}
                                        </span>
                                    )}
                                </span>
                                <span className="arrow" aria-hidden="true">›</span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

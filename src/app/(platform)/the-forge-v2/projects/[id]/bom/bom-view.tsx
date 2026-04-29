/**
 * BomView — BOM artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-BOM.html. Scoped CSS under `.bm2` keeps the styling
 * isolated so the mockup's palette/typography don't leak into the rest of
 * the platform.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — BOM icon + title + "N of M spec'd" chip + CTAs
 *   3. Annotation note — explains what the BOM is
 *   4. Summary strip — 6 stat tiles
 *   5. Controls — search + group/filter/columns + "Ask Fang"
 *   6. BOM table — grouped by module (category rows), every keyPart as a row
 *   7. Design grounded in — teal pills + footnote
 *   8. Bottom split — DFM signals card + Cost stack card
 *
 * Every row is rendered with honest empty states: material / supplier /
 * unit £ / ext £ / lead / status / spec-fit all read "—" or "Not yet
 * shortlisted" until a parts_spec table ships. No mockup strings leak.
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ListTree } from "lucide-react"

import {
    PipelineRunChip,
    formatRelativeFromNow,
    type PipelineRunStatus,
} from "@/components/pipeline/pipeline-run-chip"
import { RunSpecialistButton } from "@/components/pipeline/run-specialist-button"

import "./bom-v2.css"

import type { ComponentRef, Provenance } from "@/types/component-intelligence"

// ─── Types ──────────────────────────────────────────────────────────────

export interface BomPartRow {
    /** Stable key for React. */
    id: string
    /** Short part name (from shortenPartName). */
    name: string
    /** Raw keyPart string — used as the URL slug for the part-detail page.
     *  The part-detail route decodes and matches this against m.keyParts[]. */
    slug: string
    /** Optional subtitle with material hints stripped from the raw keyPart. */
    meta: string | null
    /** Quantity — 1 for now (not captured at keyParts level). */
    qty: number
    /** Per-part cost in GBP — null until part pricing exists. */
    unitCostGbp: number | null
    /** Extended cost = qty × unitCostGbp. */
    extCostGbp: number | null
    /** Lead-time weeks — null at part level; module-level lead is shown elsewhere. */
    leadWeeks: number | null
    /** Deep-link to Module detail (parts detail ships later). */
    moduleId: string
    /** Inherited from the owning module so the row can show "—" honestly. */
    moduleLeadWeeks: number | null
    /**
     * Reference to the component_intelligence record for this part.
     * Optional today — null means the row uses Max-invented values (existing behaviour).
     * Populated when Phase B/C component extraction has matched a real manufacturer part.
     *
     * ADDITIVE: No existing field shape is changed. Null = fallback to current behaviour.
     */
    componentRef?: ComponentRef | null
    /**
     * Provenance for this BOM row's AI-extracted fields (cost estimate, lead time, etc.).
     * Optional today — populated as Phase B/C extraction runs.
     * When present, the PDF renderer can cite the extraction source.
     */
    provenance?: Provenance | null
}

export interface BomCategoryGroup {
    /** Module id — used for the cat-row link. */
    moduleId: string
    /** Module number label — "M1" / "M2" / … */
    moduleNum: string
    /** Module display name — shown in the category row. */
    moduleName: string
    /** Per-module unit cost £ (from AI cost estimate). Null if not estimated. */
    moduleUnitCostGbp: number | null
    /** Per-module lead weeks — surfaced as a category hint. */
    moduleLeadWeeks: number | null
    /** Parts within this category/module. */
    parts: BomPartRow[]
}

export interface BomCostStackLine {
    /** Left-hand label. */
    label: string
    /** Right-hand GBP value. Null means "—" is rendered. */
    valueGbp: number | null
    /** Optional styling — "total" shows the over colour when budget breached. */
    kind?: "line" | "subtotal" | "total"
    /** True to tint the value red — used on the all-in-total when it exceeds ceiling. */
    over?: boolean
}

export interface BomViewProps {
    project: {
        id: string
        name: string
        designRevision: number
    }
    header: {
        totalParts: number
        moduleCount: number
        /** Count of parts that have been tagged with material/tolerance/supplier.
         *  Always 0 until a parts_spec table ships. */
        specdParts: number
        /** Suppliers engaged on this project (from forge_supplier_shortlist). */
        suppliersEngaged: number
        suppliersPrimary: number
    }
    /** Total roll-up across modules. Null when no cost estimates exist. */
    unitCostGbp: number | null
    /** Brief's unit-cost ceiling — drives the "over" tint on the total. Null when not set. */
    unitCostCeilingGbp: number | null
    /** All BOM categories (one per module), each containing its part rows. */
    categories: BomCategoryGroup[]
    /** Cost stack for the bottom-right card. */
    costStack: BomCostStackLine[]
    /** How many engineering-library rows back the Design Grounded In pills. */
    grounding: {
        materials: number
        hardware: number
        processes: number
    }
    /** Latest BOM generator pipeline-run status (specialist=cto, stage=bom.generate). */
    bomRun: {
        status: PipelineRunStatus
        startedAt: string | null
        finishedAt: string | null
        errorCode: string | null
        errorMessage: string | null
    }
    /** True when no modules have been decomposed yet — disables the generator CTA. */
    noModules: boolean
    /** Server action bound to this project + trigger='manual'. */
    runBomAction: () => Promise<
        { ok: true; runId: string } | { ok: false; error: string; errorCode?: string }
    >
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatGbp(value: number | null): string {
    if (value == null) return "—"
    if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}M`
    if (Math.abs(value) >= 10_000) return `£${Math.round(value / 1000).toLocaleString()}k`
    if (Math.abs(value) >= 1000) return `£${(value / 1000).toFixed(1)}k`
    return `£${Math.round(value).toLocaleString()}`
}

function formatGbpExact(value: number | null): string {
    if (value == null) return "—"
    return `£${Math.round(value).toLocaleString()}`
}

// ─── View ───────────────────────────────────────────────────────────────

export function BomView(props: BomViewProps): React.ReactElement {
    const {
        project,
        header,
        unitCostGbp,
        unitCostCeilingGbp,
        categories,
        costStack,
        grounding,
        bomRun,
        noModules,
        runBomAction,
    } = props
    const router = useRouter()

    // A single generator is "busy" when it's queued or actively running.
    // Disables the CTA so the founder can't double-fire.
    const bomBusy = bomRun.status === "queued" || bomRun.status === "running"
    // Which timestamp the "done Xm ago" chip should read — finishedAt for
    // terminal states, startedAt otherwise. Mirrors the Max chip convention.
    const bomChipTimestamp =
        bomRun.status === "done"
            ? bomRun.finishedAt ?? bomRun.startedAt
            : bomRun.startedAt ?? bomRun.finishedAt

    const base = `/the-forge-v2/projects/${project.id}`
    const allPartsEmpty = header.totalParts === 0
    // ── Empty-state branch ──────────────────────────────────────
    // Render the mockup-faithful empty state when this project has no
    // modules declared OR no parts identified in any module yet. Porting
    // FORGE-MOCKUP-EMPTY-BOM.html 1:1 — summary tiles visible at zero,
    // hero CTA group, skeleton preview rows, and the "activates once
    // you add parts" right rail.
    const isEmpty = categories.length === 0 || header.totalParts === 0

    if (isEmpty) {
        return (
            <div className="bm2 bm2-empty">
                {/* ── Breadcrumb ──────────────────────────── */}
                <div className="bm2-breadcrumb">
                    <Link href="/the-forge-v2">Forge</Link>
                    <span className="sep">›</span>
                    <Link href={base}>{project.name}</Link>
                    <span className="sep">›</span>
                    <span className="current">BOM</span>
                </div>

                {/* ── Page header ─────────────────────────── */}
                <div className="bm2-empty-h">
                    <h1>
                        <span className="bm2-title-dot" aria-hidden="true" />
                        Bill of materials
                        <span className="bm2-empty-pill">0 parts · draft</span>
                    </h1>
                    <div className="bm2-empty-sub">
                        Rev {designRevisionToLetter(project.designRevision)} · {project.name} · add your first line to start the live cost roll-up.
                    </div>
                </div>

                {/* ── Summary cards (all zero) ────────────── */}
                <div className="bm2-empty-summary">
                    <div className="bm2-empty-card">
                        <div className="k">Parts</div>
                        <div className="v">0</div>
                        <div className="detail">No lines added</div>
                    </div>
                    <div className="bm2-empty-card">
                        <div className="k">Cost at this BOM</div>
                        <div className="v">£0</div>
                        <div className="detail">
                            {unitCostCeilingGbp != null ? `Ceiling ${formatGbp(unitCostCeilingGbp)}` : "Ceiling not set"}
                        </div>
                    </div>
                    <div className="bm2-empty-card">
                        <div className="k">Suppliers</div>
                        <div className="v">0</div>
                        <div className="detail">None shortlisted</div>
                    </div>
                    <div className="bm2-empty-card">
                        <div className="k">Issues</div>
                        <div className="v">0</div>
                        <div className="detail">DFM checks pending</div>
                    </div>
                </div>

                <div className="bm2-empty-grid">
                    {/* Hero empty state */}
                    <div className="bm2-empty-hero">
                        <div className="bm2-empty-icon" aria-hidden="true">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                        </div>
                        <h2>Add your first BOM line</h2>
                        <p>
                            Every part, material, fastener, and off-the-shelf component goes here. Once lines exist, the cost
                            waterfall activates, supplier shortlists populate, and DFM checks start running.
                        </p>
                        {/* Generator CTA — fires the BOM orchestrator. Disabled
                            when modules haven't been decomposed yet (NO_MODULES
                            precondition) or when a run is already in flight. */}
                        <div className="bm2-empty-generate">
                            {bomRun.status !== "not-started" && (
                                <div style={{ marginBottom: 10 }}>
                                    <PipelineRunChip
                                        status={bomRun.status}
                                        specialistName="Max"
                                        startedAt={bomChipTimestamp}
                                        errorCode={bomRun.errorCode}
                                        errorMessage={bomRun.errorMessage}
                                        compact
                                    />
                                </div>
                            )}
                            <RunSpecialistButton
                                action={runBomAction}
                                label="Generate BOM from modules"
                                subLabel="~30s per module"
                                icon={<ListTree aria-hidden="true" />}
                                variant="primary"
                                disabled={noModules || bomBusy}
                                disabledReason={
                                    noModules
                                        ? "Run Max's module decomposition first — the BOM generator needs modules to work from."
                                        : bomBusy
                                            ? "A BOM generation run is already in flight."
                                            : undefined
                                }
                            />
                        </div>
                        <div className="bm2-empty-ctas">
                            <Link href={`${base}/geometry/upload`} className="bm2-btn">Upload your CAD</Link>
                            <span className="bm2-btn soon" title="Ships with the parts-spec table">+ Add your first line</span>
                            <span className="bm2-btn soon" title="Ships with the parts-spec table">Import from CSV</span>
                            <span className="bm2-btn soon" title="Onshape sync ships in a future round">Sync from Onshape</span>
                            <span className="bm2-btn soon" title="Solidworks sync ships in a future round">Sync from Solidworks</span>
                        </div>

                        <div className="bm2-empty-skeleton">
                            <div className="sk-label">What the table will look like</div>
                            {[0, 1, 2].map((i) => (
                                <div className="sk-row" key={`sk-${i}`}>
                                    <div className="bar short" />
                                    <div className="bar" />
                                    <div className="bar narrow" />
                                    <div className="bar narrow" />
                                    <div className="bar short" />
                                    <div className="bar short" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right rail */}
                    <div className="bm2-empty-rail">
                        <h3>Activates once you add parts</h3>

                        <div className="rail-item">
                            <span className="rk">Cost tracking</span>
                            Live unit-cost roll-up. Every line contributes to the total; changes ripple instantly.
                        </div>
                        <div className="rail-item">
                            <span className="rk">Supplier shortlists</span>
                            Suggested suppliers scored against your BOM — by material, by cert, by geography.
                        </div>
                        <div className="rail-item">
                            <span className="rk">DFM signals</span>
                            Design-for-manufacture flags. Tolerance, part-count, assembly sequence checks.
                        </div>
                        <div className="rail-item">
                            <span className="rk">Cert cross-checks</span>
                            Every supplier cert validated against registry data — catches expired certs before they bite.
                        </div>
                        <div className="rail-item">
                            <span className="rk">Risk auto-surface</span>
                            Single-source parts flagged. Long-lead items flagged. Obsolete parts flagged.
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    const specProgressLabel = `${header.specdParts} of ${header.totalParts} spec'd`
    const chipTone = header.specdParts === 0 && header.totalParts > 0
        ? "neutral"
        : header.specdParts === header.totalParts
            ? "success"
            : "warning"

    const allInOverCeiling =
        unitCostGbp != null && unitCostCeilingGbp != null && unitCostGbp > unitCostCeilingGbp

    return (
        <div className="bm2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="bm2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">BOM</span>
            </div>

            {/* ── Page header ─────────────────────────── */}
            <div className="bm2-page-header">
                <div>
                    <h1>
                        <span className="bm2-title-dot" aria-hidden="true" />
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="8" y1="6" x2="21" y2="6" />
                            <line x1="8" y1="12" x2="21" y2="12" />
                            <line x1="8" y1="18" x2="21" y2="18" />
                            <line x1="3" y1="6" x2="3.01" y2="6" />
                            <line x1="3" y1="12" x2="3.01" y2="12" />
                            <line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                        BOM · {project.name}
                        <span className={`bm2-chip ${chipTone} solid`} style={{ marginLeft: 6 }}>{specProgressLabel}</span>
                    </h1>
                    <div className="sub">
                        Top-level fabricated parts. Fasteners and standard hardware are tracked separately.
                        Every column answers a founder question: what it is · who makes it · how much · what bites.
                    </div>
                    {/* BOM generator provenance — shows once the orchestrator
                        has actually touched this project. Done state reads
                        "BOM generated by Max · Xm ago"; live / failed states
                        let PipelineRunChip render its usual shape. */}
                    {bomRun.status === "done" && bomChipTimestamp ? (
                        <div className="bm2-provenance">
                            BOM generated by Max · {formatRelativeFromNow(bomChipTimestamp)}
                        </div>
                    ) : bomRun.status !== "not-started" ? (
                        <div style={{ marginTop: 8 }}>
                            <PipelineRunChip
                                status={bomRun.status}
                                specialistName="Max"
                                startedAt={bomChipTimestamp}
                                errorCode={bomRun.errorCode}
                                errorMessage={bomRun.errorMessage}
                                compact
                            />
                        </div>
                    ) : null}
                </div>
                <div className="cta-group">
                    <RunSpecialistButton
                        action={runBomAction}
                        label="Regenerate BOM"
                        subLabel="~30s per module"
                        icon={<ListTree aria-hidden="true" />}
                        variant="secondary"
                        disabled={noModules || bomBusy}
                        disabledReason={
                            noModules
                                ? "Run Max's module decomposition first."
                                : bomBusy
                                    ? "A BOM generation run is already in flight."
                                    : undefined
                        }
                    />
                    <span className="bm2-btn soon" title="Ships with the parts-spec table">Export CSV</span>
                    <Link href={`${base}/suppliers`} className="bm2-btn">Create RFQ bundle</Link>
                    <Link href={`${base}/brief-lock`} className="bm2-btn primary">Lock revision {designRevisionToLetter(project.designRevision)}</Link>
                </div>
            </div>

            <div className="bm2-annot">
                <strong>Note</strong>
                The BOM is the spine of the project. Once parts are tagged with material, tolerance and supplier,
                each row becomes a decision you can lock or re-open.
                {allPartsEmpty
                    ? " No parts identified yet — run module decomposition in the CAD lab to populate the BOM."
                    : " Per-part material, tolerance and supplier ship with the parts-spec store (next migration)."}
            </div>

            {/* ── Summary strip ───────────────────────── */}
            <div className="bm2-summary">
                <div className="bm2-sum-card">
                    <div className="label">Parts</div>
                    <div className="value">{header.totalParts}<small>top-level</small></div>
                    <div className="delta">across {header.moduleCount} module{header.moduleCount === 1 ? "" : "s"}</div>
                </div>
                <div className="bm2-sum-card">
                    <div className="label">Make / Buy</div>
                    <div className="value">— / —</div>
                    <div className="delta">not yet tagged</div>
                </div>
                <div className="bm2-sum-card">
                    <div className="label">Fully spec&apos;d</div>
                    <div className="value">{header.specdParts}<small>of {header.totalParts}</small></div>
                    <div className={`delta ${header.totalParts > 0 && header.specdParts < header.totalParts ? "warn" : ""}`}>
                        {header.totalParts - header.specdParts} TBD
                    </div>
                </div>
                <div className="bm2-sum-card">
                    <div className="label">Unit cost (rolled up)</div>
                    <div className="value">{formatGbp(unitCostGbp)}</div>
                    <div className="delta">module-level AI estimate · not part-priced</div>
                </div>
                <div className="bm2-sum-card">
                    <div className="label">Suppliers engaged</div>
                    <div className="value">{header.suppliersEngaged}</div>
                    <div className="delta">{header.suppliersPrimary} primary · shortlist</div>
                </div>
                <div className="bm2-sum-card">
                    <div className="label">Spec-fit flags</div>
                    <div className="value">—</div>
                    <div className="delta">flags appear once parts are supplier-matched</div>
                </div>
            </div>

            {/* ── Controls ────────────────────────────── */}
            <div className="bm2-controls">
                <div className="search">
                    <input type="search" placeholder="Search parts, modules, suppliers…" disabled />
                </div>
                <div className="sep" />
                <div className="group">
                    <span className="bm2-btn soon">Group: Module</span>
                    <span className="bm2-btn soon">Filter: Status</span>
                    <span className="bm2-btn soon">Columns: All</span>
                </div>
                <div className="spacer">
                    <Link href={`${base}/specialists/vp-manufacturing`} className="bm2-btn">Ask Fang about this BOM</Link>
                </div>
            </div>

            {/* ── BOM table ───────────────────────────── */}
            <div className="bm2-table-wrap">
                <table className="bm2-table">
                    <thead>
                        <tr>
                            <th>Part</th>
                            <th>Qty</th>
                            <th>M/B</th>
                            <th>Material · Process · Tolerance</th>
                            <th>Supplier</th>
                            <th>Unit £</th>
                            <th>Ext £</th>
                            <th>Lead</th>
                            <th>Status</th>
                            <th>Spec fit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {categories.length === 0 ? (
                            <tr>
                                <td colSpan={10} style={{ textAlign: "center", padding: "40px 16px", color: "var(--bm-fg-muted)", fontSize: 12 }}>
                                    No parts identified yet. Run module decomposition in the CAD lab.
                                </td>
                            </tr>
                        ) : (
                            categories.flatMap((cat) => [
                                <tr key={`cat-${cat.moduleId}`} className="cat-row">
                                    <td colSpan={10}>
                                        <span>{cat.moduleNum} · {cat.moduleName}</span>
                                        <span className="cat-total">
                                            {cat.parts.length} part{cat.parts.length === 1 ? "" : "s"}
                                            {cat.moduleUnitCostGbp != null ? ` · ${formatGbp(cat.moduleUnitCostGbp)} module estimate` : ""}
                                            {cat.moduleLeadWeeks != null ? ` · ${cat.moduleLeadWeeks} wk lead` : ""}
                                        </span>
                                    </td>
                                </tr>,
                                ...cat.parts.map((p) => {
                                    const partHref = `${base}/modules/${cat.moduleId}/parts/${encodeURIComponent(p.slug)}`
                                    return (
                                        <tr
                                            key={p.id}
                                            className="part-row"
                                            role="link"
                                            tabIndex={0}
                                            style={{ cursor: "pointer" }}
                                            onClick={() => router.push(partHref)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault()
                                                    router.push(partHref)
                                                }
                                            }}
                                            aria-label={`Open ${p.name}`}
                                        >
                                            <td>
                                                <Link
                                                    href={partHref}
                                                    style={{ textDecoration: "none", color: "inherit" }}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="part-name">{p.name}</div>
                                                    {p.meta && <div className="part-meta">{p.meta}</div>}
                                                </Link>
                                            </td>
                                            <td>{p.qty}</td>
                                            <td><span className="bm2-mb unknown">—</span></td>
                                            <td className="empty-dash">—</td>
                                            <td><span className="bm2-sup-cell"><span className="tbd">Not yet shortlisted</span></span></td>
                                            <td className="cost-cell empty-dash">—</td>
                                            <td className="cost-cell empty-dash">—</td>
                                            <td className="empty-dash">
                                                {p.moduleLeadWeeks != null ? (
                                                    <span style={{ color: "var(--bm-fg-muted)" }} title="Module-level estimate — pending supplier quote per part">
                                                        ~{p.moduleLeadWeeks} wk
                                                    </span>
                                                ) : "—"}
                                            </td>
                                            <td><span className="bm2-status pending">Pending spec</span></td>
                                            <td><span className="bm2-fit empty">—</span></td>
                                        </tr>
                                    )
                                }),
                            ])
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Design grounded in ──────────────────── */}
            <div className="bm2-grounded">
                <div className="head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" />
                    </svg>
                    <span>Design grounded in</span>
                </div>
                <div className="pills">
                    <Link href="/the-forge-v2/library/materials" className="pill">
                        <span className="diamond" aria-hidden="true" /> Material library ({grounding.materials} rows)
                    </Link>
                    <Link href="/the-forge-v2/library/hardware" className="pill">
                        <span className="diamond" aria-hidden="true" /> Standard hardware ({grounding.hardware} rows)
                    </Link>
                    <Link href="/the-forge-v2/library/processes" className="pill">
                        <span className="diamond" aria-hidden="true" /> Process capabilities ({grounding.processes} methods)
                    </Link>
                </div>
                <p className="footnote">
                    Specifications draw on verified engineering data — material properties, ISO hardware dimensions,
                    and process capability limits from the ForgeOS engineering library.
                </p>
            </div>

            {/* ── Bottom split — DFM + Cost ───────────── */}
            <div className="bm2-side">
                <div className="bm2-card">
                    <h3>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                        </svg>
                        DFM + supply signals on this BOM
                        <span className="grounding">0 open · awaiting part-level specs</span>
                    </h3>
                    <div className="bm2-dfm-empty">
                        <p style={{ margin: 0 }}>
                            DFM signals — single-source exposure, MOQ mismatches, cert expiries, datum-scheme gaps —
                            populate automatically as parts get tagged with material, tolerance and supplier.
                        </p>
                        <p style={{ margin: "8px 0 0" }}>
                            Ask a specialist to do the first pass:
                            {" "}
                            <Link href={`${base}/specialists/vp-manufacturing`} style={{ color: "var(--bm-brand)", fontWeight: 600, textDecoration: "none" }}>
                                Ask Fang →
                            </Link>
                        </p>
                    </div>
                </div>

                <div className="bm2-card">
                    <h3>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M15 9.5a3 3 0 0 0-3-2.5c-1.66 0-3 1.34-3 3 0 .83.34 1.58.88 2.12m.12 2.88h5.5M8 17h7" />
                        </svg>
                        Cost at this BOM
                        <span className="grounding">module-level AI estimate</span>
                    </h3>

                    {costStack.length === 0 ? (
                        <div className="bm2-dfm-empty">
                            No cost rolled up yet. Run a cost pass in the
                            {" "}<Link href={`${base}/cost`} style={{ color: "var(--bm-brand)", fontWeight: 600, textDecoration: "none" }}>Cost artefact</Link>
                            {" "}once modules are stable.
                        </div>
                    ) : (
                        <>
                            {costStack.map((line, i) => (
                                <div
                                    key={`${line.label}-${i}`}
                                    className={`bm2-cost-line ${line.kind === "subtotal" ? "subtotal" : line.kind === "total" ? "total" : ""}`}
                                >
                                    <span className="l">{line.label}</span>
                                    <span className={`v ${line.kind === "total" && (line.over ?? allInOverCeiling) ? "over" : ""}`}>
                                        {formatGbpExact(line.valueGbp)}
                                    </span>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Local helpers ──────────────────────────────────────────────────────

function designRevisionToLetter(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "1"
    if (n > 26) return String(n)
    return String.fromCharCode(64 + n)
}

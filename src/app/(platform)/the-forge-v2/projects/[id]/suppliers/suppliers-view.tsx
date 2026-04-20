/**
 * SuppliersView — Suppliers artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-SUPPLIERS.html. Scoped CSS under `.sp2` keeps the
 * styling isolated so the mockup's palette/typography don't leak into the
 * rest of the platform.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — suppliers icon + title + counts chip + CTAs
 *   3. Annotation note
 *   4. Summary strip — 5 stat tiles (N shortlisted / RFQ out / Quotes / Awarded / Risks)
 *   5. Filter bar — chips for role (primary / secondary / backup) + type
 *   6. Supplier cards grid
 *   7. "Design grounded in" pills
 *
 * Data policy: only render fields that exist on forge_supplier_shortlist +
 * suppliers. Ramp role chip uses the w2-role-chip palette exactly (orange
 * primary, info-blue secondary, grey backup). Match reasons render as teal
 * diamond pills to match BOM's design-grounded-in style.
 *
 * RFQ / quote / awarded numbers are honest zeros — no RFQ lifecycle exists
 * yet on this project, so we never fabricate "3 RFQs out · £18.1k exposure".
 *
 * Trust-signal honesty (2026-04-20): fabricated signals removed from this
 * surface. `used_by_count` (seeded 12–210), `community_rating` (seeded
 * 4.3–4.8), and the `verification_status = "verified"` badge all derive from
 * hardcoded seed rows — there is no real foundry usage, ratings system, or
 * verification workflow. They are NOT rendered here; each card shows a single
 * muted "Reference data · not yet live platform usage" subtitle instead. The
 * seed data is left untouched so future real usage can populate the columns.
 */

"use client"

import Link from "next/link"
import "./suppliers-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface SuppliersSupplierRow {
    /** Global suppliers.id — supplier detail route uses this. */
    supplierId: string
    /** Shortlist row id — stable React key. */
    shortlistId: string
    /** Supplier display name (from shortlist row; stable even if global renamed). */
    name: string
    /** manufacturer / component / integrator / service / certifier — from shortlist. */
    type: string | null
    /** Country / HQ location — from company_info.hq on global supplier row. Null if unknown. */
    hq: string | null
    /** Short description from the global supplier row. Null if no global row found. */
    description: string | null
    /** Per-project ramp role: primary / secondary / backup. */
    rampRole: "primary" | "secondary" | "backup"
    /** Match score 0..1 — null if shortlist row has no score. */
    matchScore: number | null
    /** Count of project modules this supplier is matched against. */
    modulesMatched: number
    /** Up to 3 match reasons, shown as teal pills. */
    matchReasons: string[]
    /** Capabilities summary — top 3 process / product strings from capabilities JSONB. */
    capabilities: string[]
    /** Domain categories pulled from global row — used for the type sub-chip. */
    domainCategories: string[]
}

export interface SuppliersViewProps {
    project: {
        id: string
        name: string
    }
    suppliers: SuppliersSupplierRow[]
    /** Total rows on the shortlist (pre-filter) — mirrored in stat strip. */
    totalShortlisted: number
    /** Counts by ramp role — drives chip counts + primary stat label. */
    roleCounts: {
        primary: number
        secondary: number
        backup: number
    }
    /** Count of distinct supplier types in the shortlist — used for the type breakdown. */
    typeCounts: Array<{ type: string; count: number }>
    /** Active role filter. null = All. */
    activeRole: "primary" | "secondary" | "backup" | null
    /** Active type filter. null = All. */
    activeType: string | null
    /** Engineering library backing counts — drives design grounded in pills. */
    grounding: {
        materials: number
        processes: number
        standards: number
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Returns first two letters of the supplier name (e.g. "Astra Composites" → "AC"). */
function initials(name: string): string {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "??"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
}

/** Deterministic avatar background by supplier id (stable across renders). */
function avatarGradient(id: string): string {
    const palette = [
        "linear-gradient(135deg, #0284c7, #0369a1)",
        "linear-gradient(135deg, #7c3aed, #6d28d9)",
        "linear-gradient(135deg, #0d9488, #0f766e)",
        "linear-gradient(135deg, #059669, #047857)",
        "linear-gradient(135deg, #dc2626, #991b1b)",
        "linear-gradient(135deg, #ca8a04, #854d0e)",
        "linear-gradient(135deg, #374151, #1f2937)",
    ]
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
    return palette[hash % palette.length]
}

function roleLabel(role: "primary" | "secondary" | "backup"): string {
    switch (role) {
        case "primary": return "Primary"
        case "secondary": return "Secondary"
        case "backup": return "Backup"
    }
}

function formatScore(score: number | null): string {
    if (score == null) return "—"
    // shortlist stores 0..1 — display as percentage.
    if (score <= 1) return `${Math.round(score * 100)}`
    return `${Math.round(score)}`
}

// ─── View ───────────────────────────────────────────────────────────────

export function SuppliersView(props: SuppliersViewProps): React.ReactElement {
    const { project, suppliers, totalShortlisted, roleCounts, typeCounts, activeRole, activeType, grounding } = props

    const base = `/the-forge-v2/projects/${project.id}`
    const isFiltered = activeRole !== null || activeType !== null

    // Build chip hrefs — preserve the other axis when toggling.
    const roleChipHref = (role: "primary" | "secondary" | "backup" | null): string => {
        const params = new URLSearchParams()
        if (role) params.set("role", role)
        if (activeType) params.set("type", activeType)
        const qs = params.toString()
        return qs ? `${base}/suppliers?${qs}` : `${base}/suppliers`
    }
    const typeChipHref = (type: string | null): string => {
        const params = new URLSearchParams()
        if (activeRole) params.set("role", activeRole)
        if (type) params.set("type", type)
        const qs = params.toString()
        return qs ? `${base}/suppliers?${qs}` : `${base}/suppliers`
    }

    // Header counts chip — "7 shortlisted · 6 primary".
    const headerChip = totalShortlisted > 0
        ? `${totalShortlisted} shortlisted · ${roleCounts.primary} primary`
        : "No suppliers yet"

    return (
        <div className="sp2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="sp2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Suppliers</span>
            </div>

            {/* ── Page header ─────────────────────────── */}
            <div className="sp2-page-header">
                <div>
                    <h1>
                        <span className="sp2-title-dot" aria-hidden="true" />
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2 20h20" />
                            <path d="M2 20V8l5 3V8l5 3V8l5 3V8l5 3v9" />
                            <rect x="8" y="15" width="2" height="2" />
                            <rect x="14" y="15" width="2" height="2" />
                        </svg>
                        Suppliers · {project.name}
                        <span className="sp2-chip neutral solid" style={{ marginLeft: 6 }}>{headerChip}</span>
                    </h1>
                    <div className="sub">
                        Shortlisted suppliers matched against this project's modules. Each card shows ramp role,
                        match score, matched modules, and the match reasons the system found.
                    </div>
                </div>
                <div className="cta-group">
                    <span className="sp2-btn soon" title="Ships when the RFQ lifecycle lands">Broadcast RFQ</span>
                    <Link href={`/the-forge/cad-lab?project=${project.id}&action=rfq`} className="sp2-btn primary">
                        Find more suppliers
                    </Link>
                </div>
            </div>

            <div className="sp2-annot">
                <strong>Note</strong>
                Supplier shortlist is populated by module-level matching in the CAD lab. RFQ lifecycle
                (sent / quoted / awarded) ships with the dedicated RFQ store in a future migration —
                counts read honestly as zero until that arrives.
            </div>

            {/* ── Summary strip — 5 tiles ───────────── */}
            <div className="sp2-summary">
                <div className="sp2-sum-card">
                    <div className="label">Shortlisted</div>
                    <div className="value">{totalShortlisted}<small>suppliers</small></div>
                    <div className="sub">
                        {roleCounts.primary} primary · {roleCounts.secondary} secondary · {roleCounts.backup} backup
                    </div>
                </div>
                <div className="sp2-sum-card">
                    <div className="label">RFQ out</div>
                    <div className="value">0</div>
                    <div className="sub">RFQ lifecycle lands with dedicated store</div>
                </div>
                <div className="sp2-sum-card">
                    <div className="label">Quotes received</div>
                    <div className="value">0</div>
                    <div className="sub">no quotes recorded yet</div>
                </div>
                <div className="sp2-sum-card">
                    <div className="label">Awarded</div>
                    <div className="value">0</div>
                    <div className="sub">no awards yet on this project</div>
                </div>
                <div className="sp2-sum-card">
                    <div className="label">Supplier types</div>
                    <div className="value">{typeCounts.length}</div>
                    <div className="sub">
                        {typeCounts.length > 0
                            ? typeCounts.slice(0, 3).map(t => `${t.count} ${t.type}`).join(" · ")
                            : "no types yet"}
                    </div>
                </div>
            </div>

            {/* ── Filter chips ──────────────────────── */}
            {totalShortlisted > 0 && (
                <nav aria-label="Filter suppliers" className="sp2-filters">
                    <Link
                        href={roleChipHref(null)}
                        className={`sp2-filter-chip ${activeRole === null && activeType === null ? "active" : ""}`}
                        aria-pressed={activeRole === null && activeType === null}
                    >
                        All <span className="count">{totalShortlisted}</span>
                    </Link>
                    <Link
                        href={roleChipHref("primary")}
                        className={`sp2-filter-chip ${activeRole === "primary" ? "active" : ""}`}
                        aria-pressed={activeRole === "primary"}
                    >
                        <span className="sp2-role-dot role-primary" aria-hidden="true" />
                        Primary <span className="count">{roleCounts.primary}</span>
                    </Link>
                    <Link
                        href={roleChipHref("secondary")}
                        className={`sp2-filter-chip ${activeRole === "secondary" ? "active" : ""}`}
                        aria-pressed={activeRole === "secondary"}
                    >
                        <span className="sp2-role-dot role-secondary" aria-hidden="true" />
                        Secondary <span className="count">{roleCounts.secondary}</span>
                    </Link>
                    <Link
                        href={roleChipHref("backup")}
                        className={`sp2-filter-chip ${activeRole === "backup" ? "active" : ""}`}
                        aria-pressed={activeRole === "backup"}
                    >
                        <span className="sp2-role-dot role-backup" aria-hidden="true" />
                        Backup <span className="count">{roleCounts.backup}</span>
                    </Link>
                    {typeCounts.length > 1 && (
                        <>
                            <span style={{ width: 1, alignSelf: "stretch", background: "var(--sp-border)", margin: "0 4px" }} aria-hidden="true" />
                            {typeCounts.map((t) => (
                                <Link
                                    key={t.type}
                                    href={typeChipHref(activeType === t.type ? null : t.type)}
                                    className={`sp2-filter-chip ${activeType === t.type ? "active" : ""}`}
                                    aria-pressed={activeType === t.type}
                                >
                                    {t.type} <span className="count">{t.count}</span>
                                </Link>
                            ))}
                        </>
                    )}
                </nav>
            )}

            {/* ── Supplier cards grid ──────────────── */}
            {totalShortlisted === 0 ? (
                <div className="sp2-empty">
                    <strong>No suppliers shortlisted yet</strong>
                    <p>
                        Run supplier matching from the CAD lab to populate this roster.
                        Each match is scored against the project's modules and is added to the
                        shortlist with a primary / secondary / backup ramp role.
                    </p>
                </div>
            ) : suppliers.length === 0 ? (
                <div className="sp2-empty">
                    <strong>No suppliers match the current filter</strong>
                    <p>
                        Clear the filter to see all {totalShortlisted} suppliers.
                        {isFiltered && (
                            <>
                                {" "}
                                <Link href={`${base}/suppliers`} style={{ color: "var(--sp-brand)", fontWeight: 600 }}>
                                    Clear filter
                                </Link>
                            </>
                        )}
                    </p>
                </div>
            ) : (
                <div className="sp2-grid">
                    {suppliers.map((s) => {
                        const role = s.rampRole
                        const reasons = s.matchReasons.slice(0, 3)
                        return (
                            <Link
                                key={s.shortlistId}
                                href={`${base}/suppliers/${s.supplierId}`}
                                className="sp2-card"
                                aria-label={`Open supplier ${s.name}`}
                            >
                                {/* Head */}
                                <div className="sp2-card-head">
                                    <div className="sp2-avatar" style={{ background: avatarGradient(s.supplierId) }}>
                                        {initials(s.name)}
                                    </div>
                                    <div className="sp2-card-title">
                                        <div className="name">{s.name}</div>
                                        <div className="where">{s.hq ?? "Location not shared"}</div>
                                        <div className="sp2-reference-note">Reference data · not yet live platform usage</div>
                                        {s.type && <span className="type-chip">{s.type}</span>}
                                    </div>
                                    <span className={`sp2-role-chip role-${role}`}>
                                        <span className={`sp2-role-dot role-${role}`} aria-hidden="true" />
                                        {roleLabel(role)}
                                    </span>
                                </div>

                                {/* Stats */}
                                <div className="sp2-card-stats">
                                    <div className="stat">
                                        <div className="k">Match score</div>
                                        <div className={`v ${s.matchScore == null ? "muted" : ""}`}>
                                            {formatScore(s.matchScore)}
                                            {s.matchScore != null && <small>/ 100</small>}
                                        </div>
                                    </div>
                                    <div className="stat">
                                        <div className="k">Modules matched</div>
                                        <div className={`v ${s.modulesMatched === 0 ? "muted" : ""}`}>
                                            {s.modulesMatched === 0 ? "—" : s.modulesMatched}
                                            {s.modulesMatched > 0 && (
                                                <small>{s.modulesMatched === 1 ? "module" : "modules"}</small>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Match reasons — teal diamond pills */}
                                <div>
                                    <div className="sp2-reasons-label">Match reasons</div>
                                    {reasons.length === 0 ? (
                                        <div className="sp2-reasons">
                                            <span className="sp2-reason-pill empty">
                                                <span className="diamond" aria-hidden="true" />
                                                No reasons recorded yet
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="sp2-reasons">
                                            {reasons.map((r, i) => (
                                                <span key={i} className="sp2-reason-pill">
                                                    <span className="diamond" aria-hidden="true" />
                                                    {r}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Capability chips */}
                                {s.capabilities.length > 0 && (
                                    <div className="sp2-cap-row">
                                        {s.capabilities.slice(0, 4).map((c, i) => (
                                            <span key={i} className="sp2-cap">{c}</span>
                                        ))}
                                    </div>
                                )}

                                <div className="sp2-open-link">
                                    Open supplier →
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}

            {/* ── Design grounded in ──────────────────── */}
            <div className="sp2-grounded">
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
                    <Link href="/the-forge-v2/library/processes" className="pill">
                        <span className="diamond" aria-hidden="true" /> Process capabilities ({grounding.processes} methods)
                    </Link>
                    <Link href="/the-forge-v2/library/standards" className="pill">
                        <span className="diamond" aria-hidden="true" /> Design standards ({grounding.standards} rows)
                    </Link>
                </div>
                <p className="footnote">
                    Match scores factor in verified engineering data — material compatibility, process tolerances,
                    and design standards from the ForgeOS engineering library.
                </p>
            </div>
        </div>
    )
}

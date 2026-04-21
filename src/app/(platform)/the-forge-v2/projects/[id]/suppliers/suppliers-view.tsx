/**
 * SuppliersView — Suppliers artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-SUPPLIERS.html. Scoped CSS under `.sp2` keeps the
 * styling isolated so the mockup's palette/typography don't leak into the
 * rest of the platform.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — suppliers icon + title + shortlisted count + CTAs
 *   3. Honest data-model caption
 *   4. Supplier cards grid (name + HQ only)
 *
 * Data honesty policy (2026-04-20, deeper pass):
 * Every field that is hardcoded as a per-supplier literal in
 * `scripts/seed-haps-suppliers.ts` is fabricated for display purposes —
 * it isn't sourced from Supabase via a real platform workflow, it's just
 * a constant written into the seed script. We therefore render NONE of:
 *   - description                      (marketing blurb, fabricated)
 *   - supplier_type                    (classification, fabricated)
 *   - domain_categories                (tags, fabricated)
 *   - capabilities jsonb               (processes/products/certifications, fabricated)
 *   - company_info.employees/founded   (fabricated)
 *   - shortlist.ramp_role              (fabricated)
 *   - shortlist.best_match_score       (fabricated)
 *   - shortlist.all_match_reasons      (fabricated)
 *   - shortlist.module_ids count       (fabricated)
 *   - community_rating/review_count/used_by_count/verification_status
 *     (already stripped in a prior pass; seed stays, UI doesn't read it)
 *
 * What we DO render — only fields that are either (a) public legal facts
 * (name, website) or (b) user-supplied in-app:
 *   - Supplier name
 *   - HQ city/country (from company_info.hq — a public fact for these companies)
 *
 * The one-line caption near the top tells the founder honestly how this
 * directory grows ("as your RFQs flow through the platform"). No apologetic
 * framing, no "coming soon", no failure-mode copy.
 */

"use client"

import Link from "next/link"
import "./suppliers-v2.css"
import { MatchWithChaseButton } from "./match-with-chase-button"
import { DiscoverSuppliersButton } from "./discover-suppliers-button"

// ─── Types ──────────────────────────────────────────────────────────────

export interface SuppliersSupplierRow {
    /** Global suppliers.id — supplier detail route uses this. */
    supplierId: string
    /** Shortlist row id — stable React key. */
    shortlistId: string
    /** Supplier display name (from shortlist row; stable even if global renamed). */
    name: string
    /** Country / HQ location — from company_info.hq on global supplier row. Null if unknown. */
    hq: string | null
}

export interface SuppliersViewProps {
    project: {
        id: string
        name: string
    }
    suppliers: SuppliersSupplierRow[]
    /** Total rows on the shortlist — single honest count in the header. */
    totalShortlisted: number
    /** First module on the project — used as the gap key when the
     *  founder clicks "Ask Chase to research the web" from the empty
     *  state. Null if the project has no modules yet. */
    firstModule: { id: string; name: string } | null
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

// ─── View ───────────────────────────────────────────────────────────────

export function SuppliersView(props: SuppliersViewProps): React.ReactElement {
    const { project, suppliers, totalShortlisted, firstModule } = props

    const base = `/the-forge-v2/projects/${project.id}`

    const headerChip = totalShortlisted > 0
        ? `${totalShortlisted} shortlisted`
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
                </div>
                <div className="cta-group">
                    <span className="sp2-btn soon" title="Ships when the RFQ lifecycle lands">Broadcast RFQ</span>
                    <MatchWithChaseButton
                        projectId={project.id}
                        hasExisting={totalShortlisted > 0}
                    />
                </div>
            </div>

            {/* ── Data-model caption ──────────────────── */}
            <p className="sp2-caption">
                Supplier profiles populate as your RFQs flow through the platform — this directory grows with real use.
            </p>

            {/* ── Supplier cards grid ──────────────── */}
            {totalShortlisted === 0 ? (
                <div className="sp2-empty">
                    <strong>No suppliers shortlisted yet</strong>
                    <p>
                        Click <em>Match suppliers with Chase</em> above — he&rsquo;ll score every module
                        against the global directory and populate this roster with the top candidates.
                    </p>
                    {firstModule && (
                        <>
                            <p style={{ marginTop: 14 }}>
                                If the directory comes back empty, it usually means your niche isn&rsquo;t covered yet (the current 651-row directory is automotive / aerospace / electronics / medical-heavy). Chase can search the web for real UK/EU suppliers and add them directly:
                            </p>
                            <DiscoverSuppliersButton
                                projectId={project.id}
                                moduleId={firstModule.id}
                                moduleName={firstModule.name}
                            />
                        </>
                    )}
                </div>
            ) : (
                <div className="sp2-grid">
                    {suppliers.map((s) => (
                        <Link
                            key={s.shortlistId}
                            href={`${base}/suppliers/${s.supplierId}`}
                            className="sp2-card"
                            aria-label={`Open supplier ${s.name}`}
                        >
                            <div className="sp2-card-head">
                                <div className="sp2-avatar" style={{ background: avatarGradient(s.supplierId) }}>
                                    {initials(s.name)}
                                </div>
                                <div className="sp2-card-title">
                                    <div className="name">{s.name}</div>
                                    {s.hq && <div className="where">{s.hq}</div>}
                                </div>
                            </div>

                            <div className="sp2-open-link">
                                Open supplier →
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

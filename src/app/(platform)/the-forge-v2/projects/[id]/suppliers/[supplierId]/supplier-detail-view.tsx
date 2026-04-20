/**
 * SupplierDetailView — Supplier detail page (V2, data-wired).
 *
 * Mockup-faithful DOM ported from FORGE-MOCKUP-SUPPLIER-DETAIL.html, now
 * stripped back to honest fields only. Every seed-fabricated column is
 * omitted from the rendered DOM — see file header on the loader page for
 * the full list.
 *
 * Data honesty policy (2026-04-20, deeper pass): rendered fields are only
 *   - Supplier name
 *   - HQ city/country (from suppliers.company_info.hq — a public fact)
 *   - Website link (public URL)
 * Everything else in `scripts/seed-haps-suppliers.ts` is hardcoded per
 * supplier and therefore fabricated for display purposes. That includes:
 * description, supplier_type, domain_categories, capabilities (all keys
 * including certifications), employees, founded, shortlist ramp_role,
 * best_match_score, all_match_reasons, module_ids, notes. None of it
 * renders here. The seed stays untouched so future real data can back-fill.
 *
 * If the detail looks sparse, that is correct — a supplier profile grows
 * as the founder runs real workflows (RFQs, awards, NDAs) through the
 * platform. No apologetic copy, no "coming soon" filler.
 */

"use client"

import Link from "next/link"

import "./supplier-detail-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface SupplierDetailViewProps {
    project: {
        id: string
        name: string
    }
    supplier: {
        id: string
        name: string
        website: string | null
        hq: string | null
        /** 1-2 char initials derived from the supplier name for the logo block. */
        logoInitials: string
    }
}

// ─── View ──────────────────────────────────────────────────────────────

export function SupplierDetailView(props: SupplierDetailViewProps): React.ReactElement {
    const { project, supplier } = props

    const suppliersHref = `/the-forge-v2/projects/${project.id}/suppliers`

    return (
        <div className="sd2">
            {/* ── Breadcrumb ─────────────────────────────────────── */}
            <div className="sd2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={`/the-forge-v2/projects/${project.id}`}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={suppliersHref}>Suppliers</Link>
                <span className="sep">›</span>
                <span className="current">{supplier.name}</span>
            </div>

            {/* ── Page header ────────────────────────────────────── */}
            <div className="sd2-page-header">
                <div className="sd2-logo" aria-hidden="true">{supplier.logoInitials}</div>
                <div className="sd2-header-body">
                    <h1>
                        <span className="sd2-title-dot" aria-hidden="true" />
                        {supplier.name}
                    </h1>
                    {supplier.hq && (
                        <div className="sub">{supplier.hq}</div>
                    )}
                </div>
                <div className="cta-group">
                    <button type="button" className="sd2-btn primary" disabled title="RFQ lifecycle ships in a later round">Send RFQ</button>
                    {supplier.website && (
                        <a href={supplier.website} className="sd2-btn" target="_blank" rel="noreferrer">
                            Visit website
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M7 17L17 7" /><polyline points="7 7 17 7 17 17" />
                            </svg>
                        </a>
                    )}
                </div>
            </div>
        </div>
    )
}

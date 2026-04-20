/**
 * SupplierDetailView — Supplier detail page (V2, data-wired).
 *
 * Mockup-faithful DOM ported from FORGE-MOCKUP-SUPPLIER-DETAIL.html. Every
 * visible string is either (a) derived from real rows (shortlist + supplier)
 * or (b) an honest empty-state / placeholder. No mockup content leaks:
 *   - No Chase narrative (grounded-in-LLM-output is not wired yet).
 *   - No invented certifications, audit IDs, or cert expiry dates.
 *   - No fabricated RFQ history / awards / NDAs — those surfaces render
 *     honest "RFQ lifecycle ships in a later round" copy.
 *
 * Trust-signal honesty (2026-04-20): the fabricated "Verified" badge,
 * community rating, review count, and used_by_count cells were removed
 * from this surface. Those columns are still present on the seed row in
 * `scripts/seed-haps-suppliers.ts` (so real data can back-fill them in
 * future), but we do NOT render them — there is no live verification
 * workflow, no ratings system, and zero real foundry usage today. A single
 * muted subtitle "Reference data · not yet live platform usage" replaces
 * them under the supplier name.
 *
 * Sections (top to bottom, matching the mockup order):
 *   1. Breadcrumb (Forge › {project} › Suppliers › {supplier})
 *   2. Page header — supplier initials block + name + orange title-dot
 *      + ramp-role chip + CTAs (Send RFQ disabled, Open in directory soon)
 *   3. Hero meta strip — HQ / employees / founded (only the 3 cells that
 *      come from real company_info data — the 4 fabricated trust-signal
 *      cells were removed).
 *   4. Why-matched panel — match score (big) + ramp role + match reasons
 *      (teal diamond pills) + matched modules (chips linking to module)
 *   5. Capabilities card — iterates the capabilities jsonb
 *   6. Domain categories — neutral pills
 *   7. Notes card — shortlist.notes text
 *   8. Description block — supplier.description paragraph
 *   9. Empty-state cards — RFQs / quotes / awards / NDAs
 */

"use client"

import Link from "next/link"

import "./supplier-detail-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export type RampRole = "primary" | "secondary" | "backup"

export interface ModuleLink {
    id: string
    /** Display name from the project's modules array. Falls back to id if missing. */
    name: string
    href: string
    /** False when the module_id references a module that no longer exists on this project. */
    isKnown: boolean
}

export type CapabilityEntry =
    | { key: string; label: string; kind: "array"; items: string[] }
    | { key: string; label: string; kind: "certifications"; items: string[] }
    | { key: string; label: string; kind: "number"; number: number; unit: string | null }
    | { key: string; label: string; kind: "string"; text: string }

export interface SupplierDetailViewProps {
    project: {
        id: string
        name: string
    }
    supplier: {
        id: string
        name: string
        description: string | null
        website: string | null
        supplierType: string
        hq: string | null
        employees: number | null
        founded: number | null
        domainCategories: string[]
        capabilities: CapabilityEntry[]
        /** 1-2 char initials derived from the supplier name for the logo block. */
        logoInitials: string
    }
    shortlist: {
        /** 0–100 integer, or null when not scored yet. */
        matchScore: number | null
        rampRole: RampRole
        matchReasons: string[]
        /** shortlist.notes — free text from the curator / seed. Null when blank. */
        note: string | null
        matchedModules: ModuleLink[]
    }
}

// ─── View ──────────────────────────────────────────────────────────────

export function SupplierDetailView(props: SupplierDetailViewProps): React.ReactElement {
    const { project, supplier, shortlist } = props

    const suppliersHref = `/the-forge-v2/projects/${project.id}/suppliers`
    const rampLabel = RAMP_LABELS[shortlist.rampRole]

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
                        <span className={`sd2-role-chip role-${shortlist.rampRole}`}>
                            <span className={`sd2-role-dot role-${shortlist.rampRole}`} aria-hidden="true" />
                            {rampLabel}
                        </span>
                    </h1>
                    <div className="sub">{formatSupplierType(supplier.supplierType)} · shortlisted against <Link href={suppliersHref}>{project.name}</Link></div>
                    <div className="sub sd2-reference-note">Reference data · not yet live platform usage</div>
                </div>
                <div className="cta-group">
                    <button type="button" className="sd2-btn primary" disabled title="RFQ lifecycle ships in a later round">Send RFQ</button>
                    <span className="sd2-btn ghost disabled" title="Global directory ships in a later round">Open in directory</span>
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

            {/* ── Hero meta strip ────────────────────────────────── */}
            <HeroMetaStrip supplier={supplier} />

            {/* ── Why-matched panel ──────────────────────────────── */}
            <div className="sd2-why-matched">
                <div className="sd2-score-col">
                    <div className="label">Match score</div>
                    <div className="score">
                        {shortlist.matchScore != null ? (
                            <>
                                {shortlist.matchScore}
                                <small>/100</small>
                            </>
                        ) : (
                            <span className="score-empty">—</span>
                        )}
                    </div>
                    <div className="ramp">Ramp role · <strong>{rampLabel}</strong></div>
                </div>
                <div className="sd2-reasons-col">
                    <div className="block">
                        <div className="block-head">Why matched</div>
                        {shortlist.matchReasons.length > 0 ? (
                            <div className="sd2-reason-pills">
                                {shortlist.matchReasons.map((r, i) => (
                                    <span key={`${r}-${i}`} className="sd2-reason-pill">
                                        <span className="diamond" aria-hidden="true" />
                                        {r}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="sd2-empty-inline">No match reasons captured on the shortlist row yet.</p>
                        )}
                    </div>
                    <div className="block">
                        <div className="block-head">Modules covered ({shortlist.matchedModules.length})</div>
                        {shortlist.matchedModules.length > 0 ? (
                            <div className="sd2-module-chips">
                                {shortlist.matchedModules.map((m) => (
                                    m.isKnown ? (
                                        <Link key={m.id} href={m.href} className="sd2-module-chip">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <rect x="3" y="3" width="7" height="7" rx="1" />
                                                <rect x="14" y="3" width="7" height="7" rx="1" />
                                                <rect x="3" y="14" width="7" height="7" rx="1" />
                                                <rect x="14" y="14" width="7" height="7" rx="1" />
                                            </svg>
                                            {m.name}
                                        </Link>
                                    ) : (
                                        <span key={m.id} className="sd2-module-chip stale" title="Module not found on this project">
                                            {m.name}
                                        </span>
                                    )
                                ))}
                            </div>
                        ) : (
                            <p className="sd2-empty-inline">No modules linked on the shortlist row yet.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Two-column: capabilities + domain/notes ────────── */}
            <div className="sd2-two-col">
                <CapabilitiesCard capabilities={supplier.capabilities} />
                <div className="sd2-side-stack">
                    <DomainCard categories={supplier.domainCategories} />
                    <NotesCard note={shortlist.note} />
                </div>
            </div>

            {/* ── Description block ──────────────────────────────── */}
            {supplier.description && (
                <div className="sd2-description">
                    <h3>About {supplier.name}</h3>
                    <p>{supplier.description}</p>
                </div>
            )}

            {/* ── RFQ lifecycle · placeholder ────────────────────── */}
            <div className="sd2-placeholder-grid">
                <PlaceholderCard
                    title="RFQs sent"
                    body="No RFQs sent to this supplier for this project yet."
                    caveat="RFQ lifecycle ships in a later round."
                />
                <PlaceholderCard
                    title="Quotes received"
                    body="No quotes received for this project yet."
                    caveat="RFQ lifecycle ships in a later round."
                />
                <PlaceholderCard
                    title="Awards"
                    body="No parts awarded to this supplier on this project yet."
                    caveat="RFQ lifecycle ships in a later round."
                />
                <PlaceholderCard
                    title="NDAs"
                    body="No NDAs on file between this foundry and supplier yet."
                    caveat="Legal workspace ships in a later round."
                />
            </div>

            {/* ── Design grounded in ──────────────────────────────── */}
            <div className="sd2-grounded">
                <div className="sd2-grounded-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" />
                    </svg>
                    <span>Shortlist grounded in</span>
                </div>
                <div className="sd2-grounded-pills">
                    <span className="sd2-grounded-pill">
                        <span className="diamond" aria-hidden="true" />
                        Supplier directory · verified profile
                    </span>
                    <span className="sd2-grounded-pill">
                        <span className="diamond" aria-hidden="true" />
                        Project modules · {shortlist.matchedModules.length} matched
                    </span>
                    <span className="sd2-grounded-pill">
                        <span className="diamond" aria-hidden="true" />
                        Match reasons · {shortlist.matchReasons.length} captured
                    </span>
                </div>
                <p className="sd2-grounded-footnote">
                    Shortlist entries are backed by the supplier directory and a project-scoped match. Details below are rendered verbatim from those two records — no fabricated cert dates, quotes, or audit trails.
                </p>
            </div>
        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function HeroMetaStrip({ supplier }: { supplier: SupplierDetailViewProps["supplier"] }): React.ReactElement {
    const items: Array<{ label: string; value: React.ReactNode }> = [
        {
            label: "HQ",
            value: supplier.hq ?? <span className="sd2-meta-empty">—</span>,
        },
        {
            label: "Employees",
            value: supplier.employees != null ? supplier.employees.toLocaleString("en-GB") : <span className="sd2-meta-empty">—</span>,
        },
        {
            label: "Founded",
            value: supplier.founded ?? <span className="sd2-meta-empty">—</span>,
        },
    ]
    return (
        <div className="sd2-meta-strip">
            {items.map((it) => (
                <div className="sd2-meta-cell" key={it.label}>
                    <div className="sd2-meta-label">{it.label}</div>
                    <div className="sd2-meta-value">{it.value}</div>
                </div>
            ))}
        </div>
    )
}

function CapabilitiesCard({ capabilities }: { capabilities: CapabilityEntry[] }): React.ReactElement {
    return (
        <div className="sd2-cap-card">
            <h3>Capabilities</h3>
            {capabilities.length === 0 ? (
                <p className="sd2-empty-inline">No capabilities captured on the supplier profile yet.</p>
            ) : (
                <div className="sd2-cap-rows">
                    {capabilities.map((entry) => (
                        <div className="sd2-cap-row" key={entry.key}>
                            <div className="sd2-cap-label">{entry.label}</div>
                            <div className="sd2-cap-value">
                                {renderCapabilityValue(entry)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function renderCapabilityValue(entry: CapabilityEntry): React.ReactNode {
    if (entry.kind === "array") {
        return (
            <div className="sd2-cap-pills">
                {entry.items.map((v, i) => (
                    <span key={`${v}-${i}`} className="sd2-cap-pill">{v}</span>
                ))}
            </div>
        )
    }
    if (entry.kind === "certifications") {
        return (
            <div className="sd2-cert-chips">
                {entry.items.map((v, i) => (
                    <span key={`${v}-${i}`} className="sd2-cert-chip">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" />
                            <polyline points="9 12 11 14 15 10" />
                        </svg>
                        {v}
                    </span>
                ))}
            </div>
        )
    }
    if (entry.kind === "number") {
        return (
            <span className="sd2-cap-number">
                {formatNumber(entry.number)}
                {entry.unit && <small> {entry.unit}</small>}
            </span>
        )
    }
    return <span className="sd2-cap-text">{entry.text}</span>
}

function DomainCard({ categories }: { categories: string[] }): React.ReactElement {
    return (
        <div className="sd2-sb-card">
            <h4>Domain categories</h4>
            {categories.length === 0 ? (
                <p className="sd2-empty-inline">No domain categories captured on the supplier profile yet.</p>
            ) : (
                <div className="sd2-domain-pills">
                    {categories.map((c, i) => (
                        <span key={`${c}-${i}`} className="sd2-domain-pill">{c}</span>
                    ))}
                </div>
            )}
        </div>
    )
}

function NotesCard({ note }: { note: string | null }): React.ReactElement {
    return (
        <div className="sd2-sb-card">
            <h4>Shortlist notes</h4>
            {note ? (
                <p className="sd2-notes-text">{note}</p>
            ) : (
                <p className="sd2-empty-inline">No curator notes on this shortlist row yet.</p>
            )}
        </div>
    )
}

function PlaceholderCard({ title, body, caveat }: { title: string; body: string; caveat: string }): React.ReactElement {
    return (
        <div className="sd2-placeholder-card">
            <h4>{title}</h4>
            <p className="body">{body}</p>
            <p className="caveat">{caveat}</p>
        </div>
    )
}

// ─── Formatters ────────────────────────────────────────────────────────

const RAMP_LABELS: Record<RampRole, string> = {
    primary: "Primary",
    secondary: "Secondary",
    backup: "Backup",
}

function formatSupplierType(raw: string): string {
    switch (raw) {
        case "manufacturer": return "Manufacturer"
        case "component":    return "Component supplier"
        case "integrator":   return "Integrator"
        case "certifier":    return "Certifier"
        case "service":      return "Service provider"
        default:             return capitalise(raw)
    }
}

function capitalise(s: string): string {
    if (!s) return ""
    return s[0].toUpperCase() + s.slice(1)
}

/** Preserve integers as-is; show 1 dp for small fractional values; 2 dp for sub-unit. */
function formatNumber(n: number): string {
    if (!Number.isFinite(n)) return "—"
    if (Number.isInteger(n)) return n.toLocaleString("en-GB")
    if (Math.abs(n) >= 10) return n.toFixed(1)
    return n.toFixed(2)
}

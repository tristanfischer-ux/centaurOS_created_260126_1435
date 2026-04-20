/**
 * ExportView — Export artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-EXPORT.html. Scoped CSS under `.ex2` keeps the
 * styling isolated so the mockup's palette/typography don't leak into
 * the rest of the platform.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — export icon + title + title-dot + revision chip + CTAs
 *   3. Annotation note — what the export page does
 *   4. Main grid:
 *      Left column (stacked):
 *        - Format picker: PDF · CSV · JSON · Markdown
 *        - Scope picker: Brief · Modules · BOM · Cost · Risks · Suppliers · Everything
 *        - Preview card: what the export contains
 *        - Recipient card: email / link sharing (disabled)
 *      Right column:
 *        - History card: past exports (honest empty state)
 *
 * Empty-state policy: every action CTA is disabled for V1 — export
 * generation, share link, email, download all ship next round. Each
 * disabled control has a `title` tooltip explaining what unlocks it.
 * The history card renders "No exports yet" — we never fake past
 * entries.
 */

"use client"

import Link from "next/link"
import "./export-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface ExportViewProps {
    project: {
        id: string
        name: string
        designRevision: number
    }
    counts: {
        modules: number
        parts: number
    }
    cost: {
        /** Module-level AI estimate roll-up in GBP. Null when no modules are costed. */
        totalGbp: number | null
        /** Unit-cost ceiling declared on Brief. Null when not set. */
        ceilingGbp: number | null
    }
    preview: {
        /** Brief mission or subject — shown in the preview summary. Null when not declared. */
        briefMission: string | null
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatGbp(value: number | null): string {
    if (value == null) return "—"
    if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}M`
    if (Math.abs(value) >= 10_000) return `£${Math.round(value / 1000).toLocaleString()}k`
    if (Math.abs(value) >= 1000) return `£${(value / 1000).toFixed(1)}k`
    return `£${Math.round(value).toLocaleString()}`
}

function designRevisionToLetter(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "1"
    if (n > 26) return String(n)
    return String.fromCharCode(64 + n)
}

// ─── Static option data ────────────────────────────────────────────────

interface FormatOption {
    id: "pdf" | "csv" | "json" | "markdown"
    label: string
    sub: string
}

const FORMATS: FormatOption[] = [
    { id: "pdf", label: "PDF", sub: "Board-ready document, A4 portrait" },
    { id: "csv", label: "CSV", sub: "Tabular — BOM, cost, risks as rows" },
    { id: "json", label: "JSON", sub: "Full artefact tree — machine-readable" },
    { id: "markdown", label: "Markdown", sub: "Plain-text — for docs and wikis" },
]

interface ScopeOption {
    id: "brief" | "modules" | "bom" | "cost" | "risks" | "suppliers" | "everything"
    label: string
    sub: string
}

const SCOPES: ScopeOption[] = [
    { id: "brief", label: "Brief", sub: "Mission · constraints · regulatory envelope" },
    { id: "modules", label: "Modules", sub: "All modules with key parts and mass" },
    { id: "bom", label: "BOM", sub: "Flat part list with qty and lead times" },
    { id: "cost", label: "Cost", sub: "Unit-cost roll-up and ceiling check" },
    { id: "risks", label: "Risks", sub: "Active risks from the Risks artefact" },
    { id: "suppliers", label: "Suppliers", sub: "Shortlist with ramp roles" },
    { id: "everything", label: "Everything", sub: "All of the above, in one file" },
]

// The V1 defaults the mockup implies — PDF + Everything. These are
// rendered as the "active" picks but no interaction actually fires.
const DEFAULT_FORMAT: FormatOption["id"] = "pdf"
const DEFAULT_SCOPE: ScopeOption["id"] = "everything"

// ─── View ──────────────────────────────────────────────────────────────

export function ExportView(props: ExportViewProps): React.ReactElement {
    const { project, counts, cost, preview } = props

    const base = `/the-forge-v2/projects/${project.id}`
    const revisionLetter = designRevisionToLetter(project.designRevision)

    const overCeiling =
        cost.totalGbp != null && cost.ceilingGbp != null && cost.totalGbp > cost.ceilingGbp

    const costLabel = formatGbp(cost.totalGbp)
    const ceilingLabel = cost.ceilingGbp != null ? formatGbp(cost.ceilingGbp) : null

    const generateTooltip = "Export generation ships next round — the spine that stitches Brief, BOM, Cost and Risks into a single file."
    const shareTooltip = "Sharing ships next round — recipients, signed links and expiry."

    return (
        <div className="ex2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="ex2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Export</span>
            </div>

            {/* ── Page header ─────────────────────────── */}
            <div className="ex2-page-header">
                <div>
                    <h1>
                        <span className="ex2-title-dot" aria-hidden="true" />
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="12" y1="18" x2="12" y2="12" />
                            <polyline points="9 15 12 12 15 15" />
                        </svg>
                        Export · {project.name}
                        <span className="ex2-chip solid" style={{ marginLeft: 6 }}>Revision {revisionLetter}</span>
                    </h1>
                    <div className="sub">
                        Bundle the project into a single file for the board, an investor, or the data room.
                        Pick a format, pick a scope, preview, deliver.
                    </div>
                </div>
                <div className="cta-group">
                    <button type="button" className="ex2-btn soon" disabled title={shareTooltip}>
                        Share link
                    </button>
                    <button type="button" className="ex2-btn primary soon" disabled title={generateTooltip}>
                        Generate export
                    </button>
                </div>
            </div>

            <div className="ex2-annot">
                <strong>Note</strong>
                The export spine reads every artefact on the project — Brief, Modules, BOM, Cost, Risks, Suppliers —
                and stitches them into one file. Nothing on this page triggers yet; the generator ships once the
                artefact tree is locked.
            </div>

            {/* ── Main grid ───────────────────────────── */}
            <div className="ex2-grid">
                {/* ── Left column ─────────────────────── */}
                <div className="ex2-col">
                    {/* Format picker */}
                    <div className="ex2-card">
                        <div className="ex2-card-head">
                            <h3>Format</h3>
                            <span className="ex2-card-sub">Pick the file type</span>
                        </div>
                        <div className="ex2-option-grid">
                            {FORMATS.map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    className={`ex2-option ${f.id === DEFAULT_FORMAT ? "active" : ""}`}
                                    disabled
                                    title={generateTooltip}
                                >
                                    <div className="label">{f.label}</div>
                                    <div className="sub">{f.sub}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scope picker */}
                    <div className="ex2-card">
                        <div className="ex2-card-head">
                            <h3>Scope</h3>
                            <span className="ex2-card-sub">What to include in the export</span>
                        </div>
                        <div className="ex2-scope-list">
                            {SCOPES.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    className={`ex2-scope-row ${s.id === DEFAULT_SCOPE ? "active" : ""}`}
                                    disabled
                                    title={generateTooltip}
                                >
                                    <span className="check" aria-hidden="true">
                                        {s.id === DEFAULT_SCOPE ? "✓" : ""}
                                    </span>
                                    <span className="label">{s.label}</span>
                                    <span className="sub">{s.sub}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Preview card */}
                    <div className="ex2-card">
                        <div className="ex2-card-head">
                            <h3>Preview</h3>
                            <span className="ex2-card-sub">What you&apos;ll send</span>
                        </div>
                        <div className="ex2-preview">
                            <div className="ex2-preview-head">
                                <h5>{project.name} — Revision {revisionLetter} export</h5>
                                {preview.briefMission ? (
                                    <p className="mission">{preview.briefMission}</p>
                                ) : (
                                    <p className="mission empty">Mission not yet declared on Brief.</p>
                                )}
                            </div>
                            <div className="ex2-preview-stats">
                                <div className="cell">
                                    <div className="k">Modules</div>
                                    <div className="v">{counts.modules}</div>
                                </div>
                                <div className="cell">
                                    <div className="k">Parts</div>
                                    <div className="v">{counts.parts}</div>
                                </div>
                                <div className="cell">
                                    <div className="k">Unit cost</div>
                                    <div className={`v ${overCeiling ? "over" : ""}`}>{costLabel}</div>
                                </div>
                                <div className="cell">
                                    <div className="k">Ceiling</div>
                                    <div className="v">{ceilingLabel ?? "—"}</div>
                                </div>
                            </div>
                            <ul className="ex2-preview-sections">
                                <li><span className="dot" aria-hidden="true" />Brief · mission, constraints, regulatory</li>
                                <li><span className="dot" aria-hidden="true" />Modules ({counts.modules}) · with key parts and mass</li>
                                <li><span className="dot" aria-hidden="true" />BOM · {counts.parts} parts, grouped by module</li>
                                <li><span className="dot" aria-hidden="true" />Cost roll-up · module estimate, {overCeiling ? "over ceiling" : "vs ceiling"}</li>
                                <li><span className="dot" aria-hidden="true" />Risks · from the Risks artefact</li>
                                <li><span className="dot" aria-hidden="true" />Suppliers · engaged shortlist</li>
                            </ul>
                        </div>
                    </div>

                    {/* Recipient card */}
                    <div className="ex2-card">
                        <div className="ex2-card-head">
                            <h3>Deliver</h3>
                            <span className="ex2-card-sub">Email or signed link — ships next round</span>
                        </div>
                        <div className="ex2-deliver">
                            <div className="ex2-field">
                                <label htmlFor="ex2-recipients" className="label">Recipients</label>
                                <input
                                    id="ex2-recipients"
                                    type="text"
                                    placeholder="board@fractionalforge.app"
                                    disabled
                                    title={shareTooltip}
                                />
                            </div>
                            <div className="ex2-field">
                                <label htmlFor="ex2-message" className="label">Message (optional)</label>
                                <textarea
                                    id="ex2-message"
                                    rows={3}
                                    placeholder="Attaching the board pack for the 25 April review."
                                    disabled
                                    title={shareTooltip}
                                />
                            </div>
                            <div className="ex2-deliver-row">
                                <button type="button" className="ex2-btn soon" disabled title={shareTooltip}>
                                    Copy signed link
                                </button>
                                <button type="button" className="ex2-btn soon" disabled title={shareTooltip}>
                                    Email recipients
                                </button>
                                <button type="button" className="ex2-btn primary soon" disabled title={generateTooltip}>
                                    Generate + deliver
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Right column ────────────────────── */}
                <div className="ex2-col">
                    {/* History card */}
                    <div className="ex2-card">
                        <div className="ex2-card-head">
                            <h3>History</h3>
                            <span className="ex2-card-sub">Past exports from this project</span>
                        </div>
                        <div className="ex2-history-empty">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                            <div className="title">No exports yet.</div>
                            <div className="sub">Generate your first export above.</div>
                        </div>
                    </div>

                    {/* Cross-links card */}
                    <div className="ex2-card">
                        <div className="ex2-card-head">
                            <h3>Looking for something else?</h3>
                        </div>
                        <ul className="ex2-links">
                            <li>
                                <Link href={`${base}/brief`}>Open Brief →</Link>
                                <span className="sub">The mission, constraints and regulatory envelope.</span>
                            </li>
                            <li>
                                <Link href={`${base}/bom`}>Open BOM →</Link>
                                <span className="sub">Flat parts list, grouped by module.</span>
                            </li>
                            <li>
                                <Link href={`${base}/cost`}>Open Cost →</Link>
                                <span className="sub">Unit-cost waterfall and ceiling.</span>
                            </li>
                            <li>
                                <Link href={`${base}/risks`}>Open Risks →</Link>
                                <span className="sub">Active risks on this revision.</span>
                            </li>
                            <li>
                                <Link href={`${base}/suppliers`}>Open Suppliers →</Link>
                                <span className="sub">Engaged shortlist.</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* ── Design grounded in ──────────────────── */}
            <div className="ex2-grounded">
                <div className="head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" /></svg>
                    <span>Export grounded in the artefact spine</span>
                </div>
                <div className="pills">
                    <Link href={`${base}/brief`} className="pill"><span className="diamond" aria-hidden="true" />Brief</Link>
                    <Link href={`${base}/modules`} className="pill"><span className="diamond" aria-hidden="true" />Modules</Link>
                    <Link href={`${base}/bom`} className="pill"><span className="diamond" aria-hidden="true" />BOM</Link>
                    <Link href={`${base}/cost`} className="pill"><span className="diamond" aria-hidden="true" />Cost</Link>
                    <Link href={`${base}/risks`} className="pill"><span className="diamond" aria-hidden="true" />Risks</Link>
                    <Link href={`${base}/suppliers`} className="pill"><span className="diamond" aria-hidden="true" />Suppliers</Link>
                </div>
                <p className="footnote">Every export reads the same spine: one source of truth for Brief, BOM, Cost, Risks and Suppliers — so the board pack, the investor update and the data-room doc all agree.</p>
            </div>
        </div>
    )
}

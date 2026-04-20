/**
 * ModulesView — the architectural spine artefact for a project.
 *
 * Mockup-faithful port of FORGE-MOCKUP-MODULES.html. Scoped CSS under `.m2`
 * keeps the page styling isolated so the mockup's palette/typography don't
 * leak into the global platform design system.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — Modules icon + title + stable chip + CTAs
 *   3. System hero — dual-pane illustration (shared with Workspace)
 *   4. Mass budget card — per-module Budget / Current / Δ / bar + total
 *   5. Module grid — 3-column cards with ring colour driven by mass state
 *
 * The view is a dumb renderer — every string/number is a prop. The page.tsx
 * server component assembles the props from real project data and honest
 * empty-state values where fields aren't captured yet.
 */

"use client"

import Link from "next/link"
import "./modules-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface ModuleMassRow {
    /** Short key for React (module id from the project row). */
    id: string
    /** Display name, e.g. "M1 · Left Wing Assembly". */
    label: string
    /** Budget mass in kg — null means "not budgeted yet". */
    budgetKg: number | null
    /** Current estimated mass in kg — null means "not estimated yet". */
    currentKg: number | null
}

export interface ModuleCardRow {
    /** Module id — used for the detail-page link. */
    id: string
    /** Module number shown in the card chip, "M1"…"M9". */
    moduleNum: string
    /** Module display name without the number prefix. */
    name: string
    /** 1–2 sentence body copy (purpose + key description). */
    body: string
    /** Number of keyParts on this module. */
    partCount: number
    /** Current mass in kg or null. */
    massKg: number | null
    /** Lead-time in weeks or null. */
    leadWeeks: number | null
    /** Ring colour driven by mass breach — 'green' | 'amber' | 'red'. */
    tone: "green" | "amber" | "red"
    /** Issue chips shown at the bottom of the card. */
    issues: Array<{ label: string; severity: "warning" | "danger" }>
    /** Which thumbnail SVG to use for the card preview. */
    thumbKind: ThumbKind
    /** True when the card should be flagged "over" on the mass stat. */
    massOver: boolean
}

export type ThumbKind =
    | "wing"
    | "propulsion"
    | "fuselage"
    | "avionics"
    | "solar"
    | "battery"
    | "power-electronics"
    | "comms"
    | "tail"

export interface ModulesViewProps {
    project: {
        id: string
        name: string
        systemIllustrationUrl: string | null
        conceptRenderUrl: string | null
    }
    header: {
        moduleCount: number
        interfaceCount: number
        unmatchedPortCount: number
        massDeltaKg: number | null
    }
    /** Values surfaced in the hero strip — each may be null. */
    systemMeta: {
        modules: number
        span: string | null
        solarArea: string | null
        mtowKg: number | null
        interfaces: number
    }
    /** Total of all module budgets (sum). */
    budgetTotalKg: number | null
    /** Total of all module current masses. */
    currentTotalKg: number | null
    /** Pre-computed rows for the mass budget card. */
    mass: ModuleMassRow[]
    /** Pre-computed rows for the module cards grid. */
    cards: ModuleCardRow[]
}

// ─── View ───────────────────────────────────────────────────────────────

export function ModulesView(props: ModulesViewProps): React.ReactElement {
    const { project, header, systemMeta, budgetTotalKg, currentTotalKg, mass, cards } = props

    const workspaceHref = `/the-forge-v2/projects/${project.id}`
    const geometryHref = `/the-forge-v2/projects/${project.id}/geometry`

    const totalDelta =
        budgetTotalKg != null && currentTotalKg != null
            ? currentTotalKg - budgetTotalKg
            : null

    const totalTone: "over" | "under" | "even" =
        totalDelta == null ? "even" : totalDelta > 0.05 ? "over" : totalDelta < -0.05 ? "under" : "even"

    const stableCount = cards.filter((c) => c.tone === "green").length
    const stableChipLabel = `${stableCount} stable`

    const deltaLabel =
        header.massDeltaKg == null
            ? "mass budget not declared"
            : header.massDeltaKg > 0.005
                ? `mass budget ${header.massDeltaKg.toFixed(2)} kg OVER`
                : header.massDeltaKg < -0.005
                    ? `mass budget ${Math.abs(header.massDeltaKg).toFixed(2)} kg under`
                    : "mass budget on target"

    return (
        <div className="m2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="m2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={workspaceHref}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Modules</span>
            </div>

            {/* ── Page header ─────────────────────────── */}
            <div className="m2-page-header">
                <div>
                    <h1>
                        <span className="m2-title-dot" aria-hidden="true" />
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" />
                            <rect x="14" y="14" width="7" height="7" rx="1" />
                        </svg>
                        Modules · {project.name}
                        <span className="m2-chip success solid" style={{ marginLeft: 6 }}>{stableChipLabel}</span>
                    </h1>
                    <div className="sub">
                        {header.moduleCount} modules · {header.interfaceCount} interface contracts · {header.unmatchedPortCount} unmatched ports · {deltaLabel}
                    </div>
                </div>
                <div className="cta-group">
                    <span className="m2-btn soon">Re-run decomposition</span>
                    <Link href={geometryHref} className="m2-btn">View geometry →</Link>
                </div>
            </div>

            {/* ── System hero ─────────────────────────── */}
            <div className="m2-system-hero">
                <h3 className="title">System architecture</h3>
                <div className="config">
                    {systemMeta.span ?? "—"}
                    {systemMeta.solarArea ? ` · ${systemMeta.solarArea}` : ""}
                    {systemMeta.mtowKg != null ? ` · ${systemMeta.mtowKg} kg MTOW target` : ""}
                </div>
                <div className="dual-panes">
                    <div className="pane">
                        <div className="pane-head">
                            <span>Nano Banana render</span>
                            <span className="style-tag">{project.conceptRenderUrl ? "System view" : "pending"}</span>
                        </div>
                        <div className="pane-body">
                            {project.conceptRenderUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={project.conceptRenderUrl} alt={`${project.name} system render`} />
                            ) : (
                                <BlueprintFallback label="System render pending" />
                            )}
                        </div>
                    </div>
                    <div className="pane">
                        <div className="pane-head">
                            <span>System blueprint · plan view</span>
                            <span className="style-tag">{project.systemIllustrationUrl ? "rev A · dims in mm" : "pending"}</span>
                        </div>
                        <div className="pane-body">
                            {project.systemIllustrationUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={project.systemIllustrationUrl} alt={`${project.name} plan view blueprint`} />
                            ) : (
                                <BlueprintFallback label="Plan view pending" />
                            )}
                        </div>
                    </div>
                </div>
                <div className="system-meta">
                    <div className="item"><span className="v">{systemMeta.modules}</span><span>modules</span></div>
                    <div className="item"><span className="v">{systemMeta.span ?? "—"}</span><span>span</span></div>
                    <div className="item"><span className="v">{systemMeta.solarArea ?? "—"}</span><span>solar array</span></div>
                    <div className="item"><span className="v">{systemMeta.mtowKg != null ? `${systemMeta.mtowKg} kg` : "—"}</span><span>MTOW target</span></div>
                    <div className="item"><span className="v">{systemMeta.interfaces}</span><span>interfaces</span></div>
                </div>
            </div>

            {/* ── Mass budget card ─────────────────────── */}
            <div className="m2-mass-card">
                <div className="m2-mass-header">
                    <div>
                        <h3>
                            Mass budget{" "}
                            {budgetTotalKg != null ? `· locked against ${budgetTotalKg.toFixed(1)} kg MTOW` : "· not yet declared"}
                        </h3>
                        <div className="sub">Flight-critical artefact · tracked to gram · 15% growth allowance</div>
                    </div>
                    <div className={`total ${totalTone === "over" ? "over" : ""}`}>
                        {currentTotalKg != null ? `${currentTotalKg.toFixed(2)} kg` : "—"}
                        {totalDelta != null && (
                            <span className="delta">
                                ({totalDelta > 0 ? "+" : ""}{totalDelta.toFixed(2)})
                            </span>
                        )}
                    </div>
                </div>

                <div className="m2-mass-grid">
                    <div className="hdr">
                        <div>Module</div>
                        <div style={{ textAlign: "right" }}>Budget</div>
                        <div style={{ textAlign: "right" }}>Current</div>
                        <div style={{ textAlign: "right" }}>Δ</div>
                        <div>Allocation</div>
                    </div>

                    {mass.map((m) => {
                        const delta = m.budgetKg != null && m.currentKg != null ? m.currentKg - m.budgetKg : null
                        const toneClass = delta == null
                            ? ""
                            : delta > 0.05 ? "over" : delta < -0.05 ? "under" : ""
                        const fillClass = delta == null
                            ? "fine"
                            : delta > 0.15 ? "breach" : delta > 0.05 ? "warn" : "fine"
                        const pct =
                            m.budgetKg != null && m.currentKg != null
                                ? Math.min(112, Math.max(10, (m.currentKg / m.budgetKg) * 100))
                                : 0
                        return (
                            <div key={m.id} className="row">
                                <div className="name">{m.label}</div>
                                <div className="num budget">{m.budgetKg != null ? m.budgetKg.toFixed(2) : "—"}</div>
                                <div className="num">{m.currentKg != null ? m.currentKg.toFixed(2) : "—"}</div>
                                <div className={`num ${toneClass}`}>
                                    {delta == null
                                        ? "—"
                                        : Math.abs(delta) < 0.005
                                            ? "—"
                                            : (delta > 0 ? "+" : "") + delta.toFixed(2)}
                                </div>
                                <div className="bar">
                                    {m.budgetKg != null && m.currentKg != null && (
                                        <div
                                            className={`bar-fill ${fillClass}`}
                                            style={{ width: `${Math.min(pct, 100)}%` }}
                                        />
                                    )}
                                </div>
                            </div>
                        )
                    })}

                    <div className="row total">
                        <div className="name">TOTAL</div>
                        <div className="num budget">{budgetTotalKg != null ? budgetTotalKg.toFixed(2) : "—"}</div>
                        <div className="num">{currentTotalKg != null ? currentTotalKg.toFixed(2) : "—"}</div>
                        <div className={`num ${totalTone === "over" ? "over" : totalTone === "under" ? "under" : ""}`}>
                            {totalDelta == null
                                ? "—"
                                : Math.abs(totalDelta) < 0.005
                                    ? "—"
                                    : (totalDelta > 0 ? "+" : "") + totalDelta.toFixed(2)}
                        </div>
                        <div className="bar">
                            {currentTotalKg != null && budgetTotalKg != null && (
                                <div
                                    className={`bar-fill ${totalTone === "over" ? "breach" : totalTone === "under" ? "fine" : "fine"}`}
                                    style={{
                                        width: `${Math.min(100, Math.max(10, (currentTotalKg / budgetTotalKg) * 100))}%`,
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Module grid ─────────────────────────── */}
            <div className="m2-section-label">Modules · click to drill in</div>
            <div className="m2-module-grid">
                {cards.map((c) => (
                    <Link
                        key={c.id}
                        href={`/the-forge-v2/projects/${project.id}/modules/${c.id}`}
                        className={`m2-mod-card m-${c.tone}`}
                    >
                        <div className="mod-header">
                            <div>
                                <div className="module-num">{c.moduleNum}</div>
                                <h3>{c.name}</h3>
                            </div>
                            <div className="mod-thumb" style={{ background: THUMB_BG[c.thumbKind] }}>
                                <ThumbSvg kind={c.thumbKind} />
                            </div>
                        </div>
                        <div className="mod-body">{c.body}</div>
                        <div className="mod-stats">
                            <div className="s"><div className="k">Parts</div><div className="v">{c.partCount}</div></div>
                            <div className="s">
                                <div className="k">Mass</div>
                                <div className={`v ${c.massOver ? "over" : ""}`}>
                                    {c.massKg != null ? `${c.massKg.toFixed(2)} kg` : "—"}
                                </div>
                            </div>
                            <div className="s">
                                <div className="k">Lead</div>
                                <div className="v">{c.leadWeeks != null ? `${c.leadWeeks} wk` : "—"}</div>
                            </div>
                        </div>
                        {c.issues.length > 0 && (
                            <div className="mod-issues">
                                {c.issues.map((iss, i) => (
                                    <span key={i} className={`m2-chip ${iss.severity}`}>{iss.label}</span>
                                ))}
                            </div>
                        )}
                    </Link>
                ))}
            </div>
        </div>
    )
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function BlueprintFallback({ label }: { label: string }): React.ReactElement {
    return (
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
            {label}
        </div>
    )
}

const THUMB_BG: Record<ThumbKind, string> = {
    wing: "#0c4a6e",
    propulsion: "#075985",
    fuselage: "#0369a1",
    avionics: "#1e293b",
    solar: "#ca8a04",
    battery: "#16a34a",
    "power-electronics": "#2563eb",
    comms: "#6d28d9",
    tail: "#0369a1",
}

function ThumbSvg({ kind }: { kind: ThumbKind }): React.ReactElement {
    switch (kind) {
        case "wing":
            return (
                <svg viewBox="0 0 56 34" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 22 L28 14 L52 22 L50 24 L28 18 L6 24 Z" fill="rgba(255,255,255,0.9)" />
                    <line x1="28" y1="14" x2="28" y2="24" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
                </svg>
            )
        case "propulsion":
            return (
                <svg viewBox="0 0 56 34" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="17" r="8" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" />
                    <circle cx="20" cy="17" r="2.5" fill="rgba(255,255,255,0.9)" />
                    <rect x="28" y="14" width="22" height="6" fill="rgba(255,255,255,0.85)" rx="1" />
                </svg>
            )
        case "fuselage":
            return (
                <svg viewBox="0 0 56 34" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 16 Q12 10 28 10 Q44 10 50 16 Q44 22 28 22 Q12 22 6 16" fill="rgba(255,255,255,0.85)" />
                    <circle cx="14" cy="16" r="1.5" fill="#0369a1" />
                    <circle cx="28" cy="16" r="1.5" fill="#0369a1" />
                    <circle cx="42" cy="16" r="1.5" fill="#0369a1" />
                </svg>
            )
        case "avionics":
            return (
                <svg viewBox="0 0 56 34" xmlns="http://www.w3.org/2000/svg">
                    <rect x="8" y="8" width="40" height="18" rx="2" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1" />
                    <rect x="12" y="12" width="8" height="4" fill="rgba(255,255,255,0.8)" />
                    <rect x="22" y="12" width="8" height="4" fill="rgba(255,255,255,0.8)" />
                    <rect x="32" y="12" width="12" height="4" fill="rgba(255,255,255,0.5)" />
                    <rect x="12" y="18" width="32" height="4" fill="rgba(255,255,255,0.3)" />
                </svg>
            )
        case "solar":
            return (
                <svg viewBox="0 0 56 34" xmlns="http://www.w3.org/2000/svg">
                    <rect x="6" y="8" width="44" height="18" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.9)" strokeWidth="1" />
                    <line x1="17" y1="8" x2="17" y2="26" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
                    <line x1="28" y1="8" x2="28" y2="26" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
                    <line x1="39" y1="8" x2="39" y2="26" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
                    <line x1="6" y1="17" x2="50" y2="17" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
                </svg>
            )
        case "battery":
            return (
                <svg viewBox="0 0 56 34" xmlns="http://www.w3.org/2000/svg">
                    <rect x="10" y="10" width="36" height="14" rx="2" fill="rgba(255,255,255,0.85)" />
                    <rect x="46" y="13" width="3" height="8" fill="rgba(255,255,255,0.85)" />
                    <rect x="14" y="13" width="4" height="8" fill="#16a34a" />
                    <rect x="22" y="13" width="4" height="8" fill="#16a34a" />
                    <rect x="30" y="13" width="4" height="8" fill="#16a34a" />
                    <rect x="38" y="13" width="4" height="8" fill="#15803d" />
                </svg>
            )
        case "power-electronics":
            return (
                <svg viewBox="0 0 56 34" xmlns="http://www.w3.org/2000/svg">
                    <rect x="10" y="8" width="36" height="18" rx="1" fill="rgba(255,255,255,0.85)" />
                    <circle cx="16" cy="14" r="1.6" fill="#2563eb" />
                    <circle cx="22" cy="14" r="1.6" fill="#2563eb" />
                    <circle cx="28" cy="14" r="1.6" fill="#2563eb" />
                    <circle cx="34" cy="14" r="1.6" fill="#2563eb" />
                    <rect x="12" y="18" width="32" height="5" fill="rgba(37,99,235,0.85)" />
                </svg>
            )
        case "comms":
            return (
                <svg viewBox="0 0 56 34" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="28" cy="22" r="3" fill="rgba(255,255,255,0.9)" />
                    <path d="M28 22 Q20 12 14 10 M28 22 Q36 12 42 10" stroke="rgba(255,255,255,0.9)" strokeWidth="1.4" fill="none" />
                    <path d="M28 22 Q22 8 20 4 M28 22 Q34 8 36 4" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" fill="none" strokeDasharray="2 2" />
                </svg>
            )
        case "tail":
            return (
                <svg viewBox="0 0 56 34" xmlns="http://www.w3.org/2000/svg">
                    <path d="M28 6 L18 28 L24 28 L28 14 L32 28 L38 28 Z" fill="rgba(255,255,255,0.85)" />
                    <line x1="12" y1="28" x2="44" y2="28" stroke="rgba(255,255,255,0.6)" strokeWidth="0.7" strokeDasharray="2 2" />
                </svg>
            )
    }
}

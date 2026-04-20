/**
 * WorkspaceView — V2 project cockpit.
 *
 * Ported 1:1 from FORGE-MOCKUP-WORKSPACE.html. DOM structure, class names,
 * and copy match the mockup exactly. Content is stubbed with the mockup's
 * reference data (HAPS UAV) for visual parity; real data wiring lands in a
 * follow-up commit.
 *
 * Sections (top to bottom):
 *   1.  Breadcrumb
 *   2.  Project header (title + quick-stats + CTA stack)
 *   3.  Resumed amber card
 *   4.  Health strip (4 cards)
 *   5.  System illustration card (EMPTY state — blueprint generator pending)
 *   6.  Define cluster (Brief / Modules / BOM)
 *   7.  Deliver cluster (Suppliers / Cost / Risks)
 *   8.  Support cluster (Experts / Geometry / Launch Checklist)
 *   9.  Engineering Intelligence
 *  10.  Known Challenges
 *  11.  Activity timeline
 *  12.  Phase tabs (fixed bottom nav)
 */

"use client"

import Link from "next/link"
import "./workspace-v2.css"

export function WorkspaceView(): React.ReactElement {
    return (
        <div className="w2">
            {/* ── Breadcrumb ───────────────────────────────── */}
            <div className="w2-breadcrumb">
                <Link href="/today">Today</Link>
                <span className="sep">›</span>
                <span className="current">HAPS UAV</span>
            </div>

            {/* ── Project header ───────────────────────────── */}
            <div className="w2-project-header">
                <div className="title-block">
                    <h1><span className="dot" />HAPS UAV</h1>
                    <div className="sub">Solar-powered high-altitude pseudo-satellite · 9 modules · 93 top-level parts · revision A (active)</div>
                    <div className="quick-stats">
                        <div className="stat-inline"><span className="k">Target batch:</span><span className="v">50 units</span></div>
                        <div className="stat-inline"><span className="k">Markets:</span><span className="v">UK · EU</span></div>
                        <div className="stat-inline"><span className="k">Regulatory:</span><span className="v">AS9100 · EASA Part 21</span></div>
                        <div className="stat-inline"><span className="k">Started:</span><span className="v">11 Feb 2026</span></div>
                    </div>
                </div>
                <div className="w2-cta-stack">
                    <Link href="#" className="w2-btn primary">Get quote</Link>
                    <Link href="#" className="w2-btn sm">Download report</Link>
                    <Link href="#" className="w2-btn sm ghost">Fork revision →</Link>
                    <Link href="#" className="w2-btn sm">+ New project</Link>
                </div>
            </div>

            {/* ── Resumed amber card ───────────────────────── */}
            <div className="w2-resumed">
                <div>
                    <div className="kicker">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Where you left off · 2 hours ago
                    </div>
                    <h2>Astra&apos;s AS9100 cert expired — blocking wing-spar awards</h2>
                    <p>
                        Chase flagged this at 07:14. You were mid-review of the <strong>Left Wing Spar</strong> in the BOM when you stepped away. The Right Wing Spar has the same supplier dependency. Zimmermann is the next-best pivot at 65/100 with valid AS9100.
                    </p>
                    <div className="grounding-line">Chase · 6 of 8 supplier fields · cert-registry cross-check</div>
                </div>
                <div className="w2-cta-stack">
                    <Link href="#" className="w2-btn primary">Resume on Left Wing Spar</Link>
                    <Link href="#" className="w2-btn sm">See all 4 risks →</Link>
                </div>
            </div>

            {/* ── Health strip ─────────────────────────────── */}
            <div className="w2-health-strip">
                <div className="w2-health-card red">
                    <div className="label">What will bite you</div>
                    <div className="value">4 <small>open risks</small></div>
                    <div className="detail">1 blocking · 2 medium · 1 low</div>
                </div>
                <div className="w2-health-card amber">
                    <div className="label">Who&apos;s on the hook</div>
                    <div className="value">7 <small>suppliers</small></div>
                    <div className="detail">3 awarded · 1 quote in · 3 RFQ out</div>
                </div>
                <div className="w2-health-card red">
                    <div className="label">Cost at this BOM</div>
                    <div className="value">£172k<small>/unit all-in</small></div>
                    <div className="detail danger">£22k over £150k ceiling</div>
                </div>
                <div className="w2-health-card green">
                    <div className="label">BOM maturity</div>
                    <div className="value">88<small>/93 parts spec&apos;d</small></div>
                    <div className="detail">5 parts need material/tolerance</div>
                </div>
            </div>

            {/* ── System illustration card — EMPTY state ───── */}
            <div className="w2-system-card">
                <div className="title-row">
                    <h3>System · HAPS UAV — twin-boom V-tail configuration</h3>
                    <div className="revision">rev A · 2026-04-17</div>
                </div>

                <div className="dual-panes">
                    <div className="pane">
                        <div className="pane-head">
                            <span>Nano Banana render</span>
                            <span className="style-tag-inline">Photoreal</span>
                        </div>
                        <div className="pane-body">
                            <div className="pane-empty">
                                <strong>Render not yet generated</strong>
                                auto-generation launches when CAD is imported
                            </div>
                        </div>
                    </div>

                    <div className="pane">
                        <div className="pane-head">
                            <span>System blueprint · plan view</span>
                            <span className="style-tag-inline">rev A · dims in mm</span>
                        </div>
                        <div className="pane-body">
                            <div className="pane-empty">
                                <strong>Blueprint not yet generated</strong>
                                will auto-render from module geometry
                            </div>
                        </div>
                    </div>
                </div>

                <div className="legend">
                    <div className="item"><div className="dot-sm" style={{ background: "rgba(255,255,255,0.85)" }} />CFRP primary structure</div>
                    <div className="item"><div className="dot-sm" style={{ background: "#0f172a" }} />Solar cells (42 m² total)</div>
                    <div className="item"><div className="dot-sm" style={{ background: "rgba(255,255,255,0.98)" }} />Al-7075 fittings + nacelles</div>
                </div>
            </div>

            {/* ── DEFINE cluster ───────────────────────────── */}
            <div className="w2-section-label">Define — what you&apos;re making</div>
            <div className="w2-artefact-grid">
                {/* BRIEF */}
                <Link href="#" className="w2-art-card state-green">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                <rect x="8" y="2" width="8" height="4" rx="1" />
                                <path d="M9 12h6M9 16h4" />
                            </svg>
                        </span>
                        <span className="w2-chip success solid">Complete</span>
                    </div>
                    <h3>Brief</h3>
                    <div className="subtitle">Intent · target markets · regulatory envelope</div>
                    <div className="body-line">Solar HAPS, aerospace-regulated, UK+EU targets. Mission: 30-day endurance at FL650. Unit cap £150k.</div>
                    <div className="chips">
                        <span className="w2-chip info">AS9100</span>
                        <span className="w2-chip info">EASA Part 21</span>
                        <span className="w2-chip">rev A locked</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Brief →</span>
                        <span className="grounding">10/10 fields</span>
                    </div>
                </Link>

                {/* MODULES */}
                <Link href="#" className="w2-art-card state-green">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" rx="1" />
                                <rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" />
                                <rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                        </span>
                        <span className="w2-chip success solid">9 stable</span>
                    </div>
                    <h3>Modules</h3>
                    <div className="subtitle">Decomposition · interfaces · failure modes</div>
                    <div className="body-line">9 modules, 14 interface contracts, 0 unmatched ports. 2 modules carry known failure modes.</div>
                    <div className="chips">
                        <span className="w2-chip success">All classified</span>
                        <span className="w2-chip warning">Mass 0.17kg over</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Modules →</span>
                        <span className="grounding">Max reviewed</span>
                    </div>
                </Link>

                {/* BOM */}
                <Link href="#" className="w2-art-card state-amber">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="8" y1="6" x2="21" y2="6" />
                                <line x1="8" y1="12" x2="21" y2="12" />
                                <line x1="8" y1="18" x2="21" y2="18" />
                                <line x1="3" y1="6" x2="3.01" y2="6" />
                                <line x1="3" y1="12" x2="3.01" y2="12" />
                                <line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                        </span>
                        <span className="w2-chip warning solid">88 of 93 spec&apos;d</span>
                    </div>
                    <h3>BOM</h3>
                    <div className="subtitle">Parts · qty · material · tolerance · supplier · cost</div>
                    <div className="body-line"><strong>93 top-level parts</strong> (47 make · 46 buy) · 3 awarded · 5 quote-ready · 5 need spec.</div>
                    <div className="chips">
                        <span className="w2-chip warning">5 TBD</span>
                        <span className="w2-chip info">£118k/unit</span>
                        <span className="w2-chip">rev A</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open BOM →</span>
                        <span className="grounding">DB-backed</span>
                    </div>
                </Link>
            </div>

            {/* ── DELIVER cluster ──────────────────────────── */}
            <div className="w2-section-label">Deliver — who builds it · how much · what breaks</div>
            <div className="w2-artefact-grid">
                {/* SUPPLIERS */}
                <Link href="#" className="w2-art-card state-amber">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 20h20" />
                                <path d="M2 20V8l5 3V8l5 3V8l5 3V8l5 3v9" />
                                <rect x="8" y="15" width="2" height="2" />
                                <rect x="14" y="15" width="2" height="2" />
                            </svg>
                        </span>
                        <span className="w2-chip warning solid">3 of 6 cats awarded</span>
                    </div>
                    <h3>Suppliers</h3>
                    <div className="subtitle">Lifecycle · NDA · RFQ · quotes · awards</div>
                    <div className="body-line"><strong>7 active</strong> across 6 make-categories · 3 RFQ sent · 1 quote received.</div>
                    <div className="chips">
                        <span className="w2-chip info">14 identified</span>
                        <span className="w2-chip success">3 awarded</span>
                        <span className="w2-chip danger">Composites single-source</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Suppliers →</span>
                        <span className="grounding">1 lifecycle obj</span>
                    </div>
                </Link>

                {/* COST */}
                <Link href="#" className="w2-art-card state-amber">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M15 9.5a3 3 0 0 0-3-2.5c-1.66 0-3 1.34-3 3 0 .83.34 1.58.88 2.12m.12 2.88h5.5M8 17h7" />
                            </svg>
                        </span>
                        <span className="w2-chip warning solid">±20% band</span>
                    </div>
                    <h3>Cost</h3>
                    <div className="subtitle">Unit · landed · tooling · labour · solar</div>
                    <div className="body-line"><span className="danger-num"><strong>£172k/unit all-in</strong></span> · £22k over £150k Brief ceiling (see Cost page).</div>
                    <div className="chips">
                        <span className="w2-chip info">3 quotes in</span>
                        <span className="w2-chip">7 pending</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Cost →</span>
                        <span className="grounding">est + 3 quotes</span>
                    </div>
                </Link>

                {/* RISKS */}
                <Link href="#" className="w2-art-card state-red">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </span>
                        <span className="w2-chip danger solid">1 blocking</span>
                    </div>
                    <h3>Risks</h3>
                    <div className="subtitle">Compliance · supply · lead · cost · mass</div>
                    <div className="body-line">4 open — 1 blocking (Astra AS9100 expired), 2 medium (CFRP single-source, MOQ mismatch), 1 low (geographic).</div>
                    <div className="chips">
                        <span className="w2-chip danger">1 high</span>
                        <span className="w2-chip warning">2 med</span>
                        <span className="w2-chip info">1 low</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Risks →</span>
                        <span className="grounding">merged 3 sources</span>
                    </div>
                </Link>
            </div>

            {/* ── SUPPORT cluster ──────────────────────────── */}
            <div className="w2-section-label">Support — help · geometry · shipping</div>
            <div className="w2-artefact-grid">
                {/* EXPERTS */}
                <Link href="#" className="w2-art-card state-green">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                                <path d="M6 12v5c3 3 9 3 12 0v-5" />
                            </svg>
                        </span>
                        <span className="w2-chip success solid">2 engaged</span>
                    </div>
                    <h3>Experts</h3>
                    <div className="subtitle">Fractional exec bookings for this project</div>
                    <div className="body-line">M. Okoro (aerospace DfM, 4h/wk retainer) · A. Fischer (supply QA audit, one-shot on Astra).</div>
                    <div className="chips">
                        <span className="w2-chip info">5 strong matches</span>
                        <span className="w2-chip">2 calls booked</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Experts →</span>
                        <span className="grounding">3 sources</span>
                    </div>
                </Link>

                {/* GEOMETRY */}
                <Link href="#" className="w2-art-card state-amber">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                        </span>
                        <span className="w2-chip warning solid">STEP pending</span>
                    </div>
                    <h3>Geometry</h3>
                    <div className="subtitle">CAD files · Nano Banana renders · revision history</div>
                    <div className="body-line">No STEP uploaded. 6 modules have Nano Banana renders. Ready for Solidworks sync.</div>
                    <div className="chips">
                        <span className="w2-chip warning">0 STEP</span>
                        <span className="w2-chip info">6 renders</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Open Geometry →</span>
                        <span className="grounding">—</span>
                    </div>
                </Link>

                {/* LAUNCH CHECKLIST */}
                <Link href="#" className="w2-art-card state-grey">
                    <div className="top">
                        <span className="icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                                <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                            </svg>
                        </span>
                        <span className="w2-chip solid">Not started</span>
                    </div>
                    <h3>Launch Checklist</h3>
                    <div className="subtitle">FAI · compliance · packaging · shipping</div>
                    <div className="body-line">Unlocks once first batch is awarded. Currently dormant — first award pending AS9100 resolution.</div>
                    <div className="chips">
                        <span className="w2-chip">Awaits 1st award</span>
                    </div>
                    <div className="footer">
                        <span className="open-link">Preview Launch →</span>
                        <span className="grounding">one-shot</span>
                    </div>
                </Link>
            </div>

            {/* ── Engineering Intelligence ─────────────────── */}
            <div className="w2-eng-intel">
                <div className="w2-eng-intel-head">
                    <div className="icon-wrap">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" />
                            <path d="M9 12l2 2 4-4" />
                        </svg>
                    </div>
                    <div>
                        <h2>Engineering Intelligence</h2>
                        <div className="sub"><span className="num">20</span> verified materials · <span className="num">82</span> hardware items · <span className="num">20</span> manufacturing processes · <span className="num">10</span> supplier techniques</div>
                    </div>
                </div>

                {/* Material Properties */}
                <div className="w2-eng-intel-section">
                    <div className="sec-head">
                        <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 2 7 12 12 22 7 12 2" />
                            <polyline points="2 17 12 22 22 17" />
                            <polyline points="2 12 12 17 22 12" />
                        </svg>
                        <h3>Material Properties</h3>
                        <span className="count">20 verified</span>
                    </div>
                    <div className="w2-material-row">
                        <span className="grade">6061-T6</span>
                        <span className="name">Aluminum 6061-T6</span>
                        <span className="yield-val">276 MPa</span>
                        <span className="price">£3.56/kg</span>
                    </div>
                    <div className="w2-material-row">
                        <span className="grade">7075-T6</span>
                        <span className="name">Aluminum 7075-T6</span>
                        <span className="yield-val">503 MPa</span>
                        <span className="price">£5.53/kg</span>
                    </div>
                    <div className="w2-material-row">
                        <span className="grade">5083-H321</span>
                        <span className="name">Aluminum 5083-H321 (Marine Grade)</span>
                        <span className="yield-val">228 MPa</span>
                        <span className="price">£4.35/kg</span>
                    </div>
                    <Link href="#" className="w2-view-all">View all 20 →</Link>
                </div>

                {/* Hardware Library */}
                <div className="w2-eng-intel-section">
                    <div className="sec-head">
                        <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                        </svg>
                        <h3>Hardware Library</h3>
                        <span className="count">82 standard components</span>
                    </div>
                    <div className="inline-desc"><strong>82</strong> standard components — bolts, nuts, washers, bearings with exact clearance holes and load ratings.</div>
                </div>

                {/* Process Capabilities */}
                <div className="w2-eng-intel-section">
                    <div className="sec-head">
                        <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                        <h3>Process Capabilities</h3>
                        <span className="count">20 processes</span>
                    </div>
                    <div className="w2-process-grid">
                        <ProcessRow name="Wire EDM" tol="±0.01mm" wall="0.1mm min wall" />
                        <ProcessRow name="CNC Milling" tol="±0.05mm" wall="0.5mm min wall" />
                        <ProcessRow name="Laser Cutting" tol="±0.1mm" wall="0.5mm min wall" />
                        <ProcessRow name="CNC Turning" tol="±0.025mm" wall="0.5mm min wall" />
                        <ProcessRow name="SLA 3D Printing (Resin)" tol="±0.1mm" wall="0.5mm min wall" />
                        <ProcessRow name="DMLS / SLM Metal 3D Printing" tol="±0.1mm" wall="0.4mm min wall" />
                        <ProcessRow name="FDM 3D Printing" tol="±0.3mm" wall="0.8mm min wall" />
                        <ProcessRow name="Injection Molding" tol="±0.1mm" wall="0.8mm min wall" />
                        <ProcessRow name="SLS 3D Printing (Powder Bed)" tol="±0.2mm" wall="0.7mm min wall" />
                        <ProcessRow name="Sheet Metal Bending" tol="±0.5mm" wall="0.5mm min wall" />
                        <ProcessRow name="Die Casting (Aluminum/Zinc)" tol="±0.25mm" wall="1mm min wall" />
                        <ProcessRow name="Investment Casting (Lost Wax)" tol="±0.25mm" wall="1.5mm min wall" />
                        <ProcessRow name="Sand Casting" tol="±1mm" wall="3mm min wall" />
                        <ProcessRow name="TIG/GTAW Welding" tol="±0.5mm" wall="0.5mm min wall" />
                        <ProcessRow name="Waterjet Cutting" tol="±0.1mm" wall="—" />
                        <ProcessRow name="MIG/GMAW Welding" tol="±1mm" wall="1mm min wall" />
                    </div>
                    <Link href="#" className="w2-view-all">View all 20 processes →</Link>
                </div>

                {/* Supplier Intelligence */}
                <div className="w2-eng-intel-section">
                    <div className="sec-head">
                        <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M9 21V9h6v12" />
                            <line x1="3" y1="9" x2="21" y2="9" />
                        </svg>
                        <h3>Supplier Intelligence</h3>
                        <span className="count">10 techniques</span>
                    </div>
                    <SupplierRow name="Sand Casting" count="26 suppliers" range="—" />
                    <SupplierRow name="Electropolishing" count="25 suppliers" range="—" />
                    <SupplierRow name="Powder Coating" count="21 suppliers" range="—" />
                    <SupplierRow name="Wire EDM" count="20 suppliers" range="0.005–0.05mm" />
                    <SupplierRow name="Metal Forging" count="19 suppliers" range="—" />
                    <SupplierRow name="Sheet Metal Bending" count="19 suppliers" range="—" />
                    <SupplierRow name="CNC Milling 3-Axis" count="16 suppliers" range="—" />
                    <SupplierRow name="Laser Cutting" count="16 suppliers" range="—" />
                    <SupplierRow name="Die Casting" count="16 suppliers" range="—" />
                    <SupplierRow name="SLA" count="15 suppliers" range="0.2–0.3mm" />
                </div>
            </div>

            {/* ── Known Challenges ─────────────────────────── */}
            <div className="w2-known-challenges">
                <div className="w2-kc-head">
                    <div className="icon-wrap">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    </div>
                    <div>
                        <h2>Known Challenges</h2>
                        <div className="sub">58 items across 8 modules</div>
                    </div>
                    <button type="button" className="filter-affordance">Filter by module <span>▾</span></button>
                </div>

                <div className="w2-kc-grid">
                    {/* Failure Modes */}
                    <div className="w2-kc-col">
                        <h3><span className="dot fail" />Failure Modes</h3>
                        <KcRow mod="High Aspect-Ratio Wing Structure:" text="Spar buckling under gust load at altitude" />
                        <KcRow mod="High Aspect-Ratio Wing Structure:" text="Solar cell delamination from skin thermal cycling (-80°C to +50°C)" />
                        <KcRow mod="High Aspect-Ratio Wing Structure:" text="Film skin flutter at high TAS" />
                        <KcRow mod="High Aspect-Ratio Wing Structure:" text="Moisture ingress degrading CFRP at spar joints" />
                        <KcRow mod="High Aspect-Ratio Wing Structure:" text="Skin-to-IBC-cell adhesive incompatibility causing blistering or debonding after first thermal cycle" />
                        <KcRow mod="High Aspect-Ratio Wing Structure:" text="Misalignment or fatigue at wing panel reconnect joints after repeated field assembly" />
                        <KcRow mod="Port Propulsion Pod:" text="Bearing seizure from low-temperature grease solidification" />
                        <KcRow mod="Port Propulsion Pod:" text="ESC MOSFET arc-over due to low pressure (Paschen minimum)" />
                        <KcRow mod="Port Propulsion Pod:" text="Prop blade delamination from thermal cycling" />
                        <KcRow mod="Port Propulsion Pod:" text="Motor winding insulation breakdown" />
                        <KcRow mod="Starboard Propulsion Pod:" text="Bearing seizure at low temperature" />
                        <KcRow mod="Starboard Propulsion Pod:" text="ESC arc-over at low pressure" />
                        <KcRow mod="Starboard Propulsion Pod:" text="Propeller imbalance causing spar vibration" />
                        <KcRow mod="Battery Energy Storage System:" text="Cell thermal runaway propagating across pack" />
                        <KcRow mod="Battery Energy Storage System:" text="Capacity loss below night-survival threshold" />
                        <KcRow mod="Battery Energy Storage System:" text="Heater failure leading to cold-soak lithium plating" />
                        <KcRow mod="Battery Energy Storage System:" text="BMS communication loss causing unbalanced discharge" />
                    </div>

                    {/* Open Questions */}
                    <div className="w2-kc-col">
                        <h3><span className="dot q" />Open Questions</h3>
                        <KcRow mod="High Aspect-Ratio Wing Structure:" text="Final wingspan within 5–10m range" />
                        <KcRow mod="High Aspect-Ratio Wing Structure:" text="Airfoil selection for target Reynolds number" />
                        <KcRow mod="High Aspect-Ratio Wing Structure:" text="Exact solar cell layout and string topology" />
                        <KcRow mod="High Aspect-Ratio Wing Structure:" text="Number and span-station location of panel break joints" />
                        <KcRow mod="High Aspect-Ratio Wing Structure:" text="Qualified adhesive system for 25–50 μm film skin to IBC cell bonding" />
                        <KcRow mod="Port Propulsion Pod:" text="Direct-drive vs geared architecture" />
                        <KcRow mod="Port Propulsion Pod:" text="Final prop diameter vs fuselage clearance" />
                        <KcRow mod="Starboard Propulsion Pod:" text="Counter-rotating prop supplier availability" />
                        <KcRow mod="Battery Energy Storage System:" text="Final chemistry (Li-ion Si-anode vs Li-S) — pending supplier qualification and single-source risk assessment" />
                        <KcRow mod="Battery Energy Storage System:" text="Exact pack capacity vs MTOM tradeoff" />
                        <KcRow mod="Battery Energy Storage System:" text="Confirmed European/qualified cell supplier and lead time for chosen chemistry" />
                        <KcRow mod="Solar MPPT & Power Management Unit:" text="Bus voltage selection (24V vs 48V vs HV)" />
                        <KcRow mod="Solar MPPT & Power Management Unit:" text="Level of redundancy required for SAIL V" />
                        <KcRow mod="Fuselage Pod & Empennage:" text="T-tail vs inverted-V empennage choice" />
                        <KcRow mod="Fuselage Pod & Empennage:" text="Single vs twin boom configuration" />
                        <KcRow mod="Fuselage Pod & Empennage:" text="Final pod diameter pending fabricator mandrel confirmation" />
                    </div>
                </div>
            </div>

            {/* ── Activity timeline ────────────────────────── */}
            <div className="w2-timeline">
                <h3>Recent activity on this project</h3>

                <div className="item">
                    <div className="when">2h ago</div>
                    <div className="avatar-sm avatar-chase">C</div>
                    <div className="body">
                        <strong>Chase</strong> flagged <Link href="#">Astra&apos;s AS9100 cert expired</Link> — 6 of 8 supplier fields consulted
                    </div>
                </div>
                <div className="item">
                    <div className="when">5h ago</div>
                    <div className="avatar-sm avatar-user">✓</div>
                    <div className="body">
                        <strong>CMS Nordest</strong> returned quote £85/ea on <Link href="#">Wing Rib (×8)</Link> · estimate was £92 · 8% below
                    </div>
                </div>
                <div className="item">
                    <div className="when">yesterday</div>
                    <div className="avatar-sm avatar-fang">F</div>
                    <div className="body">
                        <strong>Fang</strong> approved tolerance on <Link href="#">Fuselage Bulkhead</Link> · added grain direction note for CMS
                    </div>
                </div>
                <div className="item">
                    <div className="when">yesterday</div>
                    <div className="avatar-sm avatar-user">TF</div>
                    <div className="body">
                        You promoted <strong>Reichenbacher</strong> to 1st priority on CNC · Al-7075 fittings
                    </div>
                </div>
                <div className="item">
                    <div className="when">2d ago</div>
                    <div className="avatar-sm avatar-jian">J</div>
                    <div className="body">
                        <strong>Jian</strong> raised mass-budget concern on propulsion — currently <strong>0.17kg over</strong> allocation
                    </div>
                </div>
                <div className="item">
                    <div className="when">3d ago</div>
                    <div className="avatar-sm avatar-user">M</div>
                    <div className="body">
                        <strong>M. Okoro</strong> (fractional aerospace DfM exec) started 4h/wk retainer · first call booked Tue
                    </div>
                </div>
                <div className="item">
                    <div className="when">4d ago</div>
                    <div className="avatar-sm avatar-max">M</div>
                    <div className="body">
                        <strong>Max</strong> completed module decomposition review · 9 modules approved · 14 interface contracts
                    </div>
                </div>
            </div>

            {/* ── Phase tabs (fixed bottom nav) ────────────── */}
            <nav className="w2-phase-tabs" aria-label="Project phase navigation">
                <Link href="#" className="w2-phase-tab active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    Design
                </Link>
                <Link href="#" className="w2-phase-tab">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 2h6a1 1 0 0 1 1 1v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1z" />
                        <path d="M9 12h6M9 16h6" />
                    </svg>
                    Specify
                </Link>
                <Link href="#" className="w2-phase-tab">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="21" r="1.5" />
                        <circle cx="19" cy="21" r="1.5" />
                        <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
                    </svg>
                    Source
                </Link>
                <Link href="#" className="w2-phase-tab">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 12 20 22 4 22 4 12" />
                        <rect x="2" y="7" width="20" height="5" />
                        <line x1="12" y1="22" x2="12" y2="7" />
                        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                    Assemble
                </Link>
                <div className="avatar-pill"><div className="avatar">TF</div></div>
            </nav>
        </div>
    )
}

function ProcessRow({ name, tol, wall }: { name: string; tol: string; wall: string }) {
    return (
        <div className="w2-process-row">
            <span className="pname">{name}</span>
            <span className="tol">{tol}</span>
            <span className="wall">{wall}</span>
        </div>
    )
}

function SupplierRow({ name, count, range }: { name: string; count: string; range: string }) {
    return (
        <div className="w2-supplier-row">
            <span className="sname">{name}</span>
            <span className="scount">{count}</span>
            <span className="srange">{range}</span>
        </div>
    )
}

function KcRow({ mod, text }: { mod: string; text: string }) {
    return (
        <Link href="#" className="w2-kc-row">
            <span className="mod">{mod}</span> {text}
        </Link>
    )
}

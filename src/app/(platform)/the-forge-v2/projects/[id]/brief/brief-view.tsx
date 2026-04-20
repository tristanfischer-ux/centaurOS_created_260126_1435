/**
 * BriefView — Brief artefact page (V2 mockup-faithful rebuild).
 *
 * Ported 1:1 from FORGE-MOCKUP-BRIEF.html. DOM structure, class names,
 * and copy match the mockup exactly. Content is stubbed with the mockup's
 * reference data (HAPS UAV / solar HAPS / £172k / 68.17 kg / Revision A
 * locked) for visual parity; real data wiring + brief-lock migration land
 * in a follow-up commit.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — Brief icon + title + "Complete · locked" chip + CTAs
 *   3. Brief dual-pane hero — concept render + mission envelope SVG
 *   4. Locked banner (Revision A)
 *   5. Brief grid — narrative left column + sidebar stack (reg / cost / mass)
 *   6. Revision history card
 *   7. Design grounded in — teal pills + footnote
 */

"use client"

import Image from "next/image"
import Link from "next/link"
import "./brief-v2.css"

export function BriefView() {
    return (
        <div className="b2">
            <div className="b2-breadcrumb">
                <Link href="/today">Today</Link>
                <span className="sep">›</span>
                <Link href="#">HAPS UAV</Link>
                <span className="sep">›</span>
                <span className="current">Brief</span>
            </div>

            <div className="b2-page-header">
                <div>
                    <h1>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 12h6M9 16h4" /></svg>
                        Brief
                        <span className="b2-chip success solid" style={{ marginLeft: 6 }}>Complete · locked</span>
                    </h1>
                    <div className="sub">The anchor spec. Intent · target markets · regulatory envelope · constraints.</div>
                </div>
                <div className="cta-group">
                    <Link href="#" className="b2-btn">Share with investor</Link>
                    <Link href="#" className="b2-btn">Edit (new revision)</Link>
                    <Link href="#" className="b2-btn ghost">Export PDF</Link>
                </div>
            </div>

            <div className="b2-brief-hero">
                <div className="b2-brief-hero-pane">
                    <div className="head">
                        <span className="label">Nano Banana render · Concept</span>
                    </div>
                    <div className="body">
                        <div className="img-wrap">
                            <Image
                                src="/cad-lab/hero.png"
                                alt="HAPS UAV conceptual render"
                                fill
                                sizes="(max-width: 900px) 100vw, 55vw"
                                style={{ objectFit: "cover" }}
                            />
                        </div>
                    </div>
                    <div className="caveat">Conceptual illustration — not an engineering drawing</div>
                </div>
                <div className="b2-brief-hero-pane">
                    <div className="head">
                        <span className="label">Mission envelope · altitude vs endurance</span>
                    </div>
                    <div className="body">
                        <MissionEnvelopeSvg />
                    </div>
                    <div className="caveat">Envelope informative — target 14-day / FL650 set by Brief</div>
                </div>
            </div>

            <div className="b2-locked-note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <div><strong>Revision A locked · 2026-04-02.</strong> Suppliers cite this revision on RFQs. Editing creates a revision proposal for Max to review before downstream artefacts re-run.</div>
            </div>

            <div className="b2-brief-grid">
                <div className="b2-mission-card">
                    <div className="field">
                        <div className="k">Product</div>
                        <div className="v"><strong>HAPS UAV — solar-powered high-altitude pseudo-satellite</strong></div>
                    </div>

                    <div className="field">
                        <div className="k">Mission</div>
                        <div className="v">Continuous <strong>30-day endurance at FL650</strong> (65,000 ft / ~20 km), payload 15 kg for comms relay + imaging. Twin-boom V-tail, 25 m wingspan, 42 m² solar array. Target one orbit of the globe per mission class.</div>
                    </div>

                    <div className="field">
                        <div className="k">Target customers</div>
                        <div className="v">Defence telemetry relays (UK MoD · German BAAINBw), civil earth-observation primes, EU border-monitoring agencies. <strong>First paying customer LOI:</strong> UK MoD ISR programme — 3 units for 2027 delivery.</div>
                    </div>

                    <div className="field">
                        <div className="k">Why now</div>
                        <div className="v">Space-grade IBC solar cell cost dropped below £500/m² (was £1,400 in 2022). Combined with lithium-sulphur cell energy density at 400 Wh/kg, round-the-clock FL650 operation is for the first time cost-competitive with LEO satellite alternatives on a per-orbit basis.</div>
                    </div>

                    <div className="field">
                        <div className="k">Constraints declared</div>
                        <div className="b2-constraints-grid">
                            <div className="c-item"><span className="c-k">Unit cost ceiling:</span> <strong>£150k @ batch 50</strong></div>
                            <div className="c-item"><span className="c-k">Target first ship:</span> <strong>Q3 2027</strong></div>
                            <div className="c-item"><span className="c-k">Max mass:</span> <strong>68 kg MTOW</strong></div>
                            <div className="c-item"><span className="c-k">Batch 1:</span> <strong>50 units</strong></div>
                            <div className="c-item"><span className="c-k">Markets:</span> <strong>UK · EU only (no export to US initially)</strong></div>
                            <div className="c-item"><span className="c-k">Production:</span> <strong>UK or EU manufacture only</strong></div>
                        </div>
                    </div>
                </div>

                <div className="b2-sidebar-stack">
                    <div className="b2-sb-card">
                        <h4>Regulatory posture</h4>
                        <div className="b2-regulatory-grid">
                            <div className="b2-reg-item status-met">
                                <div className="reg-icon">✓</div>
                                <div className="body">
                                    <div className="name">AS9100D</div>
                                    <div className="meta">Required on primary structure suppliers</div>
                                </div>
                            </div>
                            <div className="b2-reg-item status-met">
                                <div className="reg-icon">✓</div>
                                <div className="body">
                                    <div className="name">EASA Part 21</div>
                                    <div className="meta">Design organisation approval (scope-limited)</div>
                                </div>
                            </div>
                            <div className="b2-reg-item status-inprogress">
                                <div className="reg-icon">⋯</div>
                                <div className="body">
                                    <div className="name">UKCA (DO-160G)</div>
                                    <div className="meta">Environmental test plan drafted · test house TBC</div>
                                </div>
                            </div>
                            <div className="b2-reg-item status-inprogress">
                                <div className="reg-icon">⋯</div>
                                <div className="body">
                                    <div className="name">ITAR / EAR99</div>
                                    <div className="meta">Export-control classification under review · US excluded from markets</div>
                                </div>
                            </div>
                            <div className="b2-reg-item status-notstarted">
                                <div className="reg-icon">·</div>
                                <div className="body">
                                    <div className="name">DO-178C (S/W)</div>
                                    <div className="meta">Flight-ctrl firmware · Level C target</div>
                                </div>
                            </div>
                            <div className="b2-reg-item status-notstarted">
                                <div className="reg-icon">·</div>
                                <div className="body">
                                    <div className="name">UN38.3 (battery)</div>
                                    <div className="meta">Li-S pack test · scheduled Q2 2026</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="b2-sb-card">
                        <h4>All-in cost vs ceiling</h4>
                        <div className="big danger">£172k <small>/ £150k</small></div>
                        <div className="sub danger">115% of ceiling · £22k OVER · materials + labour + solar + NRE</div>
                        <div className="b2-cost-bar">
                            <div className="fill" />
                            <div className="pin" />
                        </div>
                        <div className="b2-cost-axis">
                            <span>£0</span>
                            <span>£150k</span>
                            <span className="danger">£172k</span>
                        </div>
                    </div>

                    <div className="b2-sb-card">
                        <h4>Mass budget</h4>
                        <div className="big">68.17 <small>/ 68.00 kg MTOW</small></div>
                        <div className="sub danger">0.17 kg over — propulsion allocation breach</div>
                        <Link href="#" className="b2-mass-link">See module breakdown →</Link>
                    </div>
                </div>
            </div>

            <div className="b2-revision-card">
                <h4>Revision history</h4>
                <div className="b2-revision-timeline">
                    <div className="b2-rev-row">
                        <span className="dot current" />
                        <div className="content">
                            <div className="label">Revision A (current · locked)</div>
                            <div className="time">2026-04-02 · locked by Max after specialist review · 14 supplier RFQs cite this rev</div>
                        </div>
                    </div>
                    <div className="b2-rev-row">
                        <span className="dot old" />
                        <div className="content">
                            <div className="label">Draft 0.3 → Revision A</div>
                            <div className="time">2026-03-28 · added EASA Part 21 DOA target · removed &ldquo;global mission&rdquo; scope to UK+EU only</div>
                        </div>
                    </div>
                    <div className="b2-rev-row">
                        <span className="dot old" />
                        <div className="content">
                            <div className="label">Draft 0.2</div>
                            <div className="time">2026-03-14 · Priya draft from customer interviews (UK MoD, Airbus DS)</div>
                        </div>
                    </div>
                    <div className="b2-rev-row">
                        <span className="dot old" />
                        <div className="content">
                            <div className="label">Draft 0.1</div>
                            <div className="time">2026-02-11 · Initial capture from founder voice memo</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="b2-design-grounded-in">
                <div className="b2-grounded-in-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" /></svg>
                    <span>Design grounded in</span>
                </div>
                <div className="b2-grounded-pills">
                    <Link href="#" className="b2-grounded-pill"><span className="diamond" />Mission-envelope calculators</Link>
                    <Link href="#" className="b2-grounded-pill"><span className="diamond" />Regulatory library (CAP 722 · SORA)</Link>
                    <Link href="#" className="b2-grounded-pill"><span className="diamond" />Material cost index</Link>
                </div>
                <p className="b2-grounded-footnote">Specifications informed by verified engineering data — material properties, ISO hardware dimensions, and process capability limits from the ForgeOS engineering library.</p>
            </div>
        </div>
    )
}

function MissionEnvelopeSvg() {
    return (
        <svg className="envelope" viewBox="0 0 500 240" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <marker id="b2-arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="#1c1917" />
                </marker>
            </defs>
            <rect x="0" y="0" width="500" height="240" fill="#fafaf9" />
            {/* Faint grid */}
            <g stroke="#e7e5e4" strokeWidth="0.4">
                <line x1="60" y1="50" x2="460" y2="50" />
                <line x1="60" y1="100" x2="460" y2="100" />
                <line x1="60" y1="150" x2="460" y2="150" />
                <line x1="140" y1="30" x2="140" y2="200" />
                <line x1="220" y1="30" x2="220" y2="200" />
                <line x1="300" y1="30" x2="300" y2="200" />
                <line x1="380" y1="30" x2="380" y2="200" />
            </g>
            {/* Axes */}
            <line x1="60" y1="30" x2="60" y2="200" stroke="#1c1917" strokeWidth="1.1" markerStart="url(#b2-arrow)" />
            <line x1="60" y1="200" x2="470" y2="200" stroke="#1c1917" strokeWidth="1.1" markerEnd="url(#b2-arrow)" />
            <text x="68" y="24" fontFamily="Inter, sans-serif" fontSize="10.5" fontWeight="700" fill="#1c1917">Altitude (ft)</text>
            <text x="430" y="218" fontFamily="Inter, sans-serif" fontSize="10.5" fontWeight="700" fill="#1c1917">Endurance (days)</text>
            {/* Axis ticks/labels */}
            <g fontFamily="Inter, sans-serif" fontSize="9.5" fill="#78716c">
                <text x="30" y="53">80k</text>
                <text x="30" y="103">65k</text>
                <text x="30" y="153">40k</text>
                <text x="30" y="203">0</text>
                <text x="136" y="215" textAnchor="middle">3</text>
                <text x="216" y="215" textAnchor="middle">7</text>
                <text x="296" y="215" textAnchor="middle">14</text>
                <text x="376" y="215" textAnchor="middle">30</text>
            </g>
            {/* Feasible envelope curve */}
            <path d="M80 190 Q 180 160, 300 130 Q 380 110, 440 100" fill="none" stroke="#0f766e" strokeWidth="1.6" strokeDasharray="5,3" />
            {/* Target point */}
            <circle cx="300" cy="100" r="6" fill="#b45309" stroke="#fff" strokeWidth="2" />
            {/* Target callout */}
            <g fontFamily="Inter, sans-serif" fontSize="10" fill="#b45309">
                <line x1="306" y1="100" x2="370" y2="62" stroke="#b45309" strokeWidth="0.7" />
                <text x="375" y="60" fontWeight="700">Target · FL650 · 14 days</text>
                <text x="375" y="72" fill="#78716c">payload 15 kg · 20 °N cell</text>
            </g>
            {/* Title block */}
            <text x="250" y="20" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700" fill="#1c1917">MISSION ENVELOPE · Solar HAPS · 7–14 day class</text>
        </svg>
    )
}

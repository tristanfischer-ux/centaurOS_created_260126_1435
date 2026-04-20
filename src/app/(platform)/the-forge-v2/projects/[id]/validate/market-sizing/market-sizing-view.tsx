/**
 * MarketSizingView — Market sizing (TAM/SAM/SOM) artefact page (V2,
 * mockup-faithful).
 *
 * Port of FORGE-MOCKUP-MARKET-SIZING.html. Scoped CSS under `.ms2` keeps
 * styling isolated so the mockup's palette/typography don't leak into the
 * rest of the platform.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page title + validation-store preview notice
 *   3. Methodology picker (top-down / bottom-up / analog) — client-side
 *      selection, calculations disabled until store ships.
 *   4. TAM/SAM/SOM pyramid — three tiered rows with honest "—" values.
 *   5. Annotation — "Show your working" drill-in explainer.
 *   6. Methodology card (per selected picker) — how the tier maths work.
 *   7. Computation table — parameters with disabled editable inputs,
 *      source chips, derived rows, and a result row.
 *   8. Drivers grid — six sensitivity-driver cards with empty-state copy.
 *   9. Confidence interval card — P5/P25/P50/P75/P95 band, empty values.
 *  10. Source cards — three empty placeholders for the data-room audit
 *      trail.
 *
 * Empty-state policy (no mockup content leaks):
 *   - No market_sizing table yet → every numeric tile renders "—".
 *   - Inputs in the computation table are interactive client-side, but
 *     calculations and persistence are disabled; placeholder text tells
 *     the founder the store ships later.
 *   - Drivers render their header with neutral "Ships with validation
 *     store" body text, so the founder sees the shape without fake
 *     sensitivities.
 *   - Sources render empty dashed cards, captioned "Source citations
 *     land once the validation store is live".
 *
 * No synthetic mockup values (£842M, 2.4M farms, FAO 2024, etc.) leak
 * into production. Everything is either a dash or a neutral placeholder.
 */

"use client"

import { useState } from "react"
import Link from "next/link"

import "./market-sizing-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export type MarketSizingMethodology = "top-down" | "bottom-up" | "analog"

export interface MarketSizingViewProps {
    project: {
        id: string
        name: string
    }
    /** Industry hint from the brief — purely informational for the sub-title. */
    industryHint: string | null
}

interface MethodologyCopy {
    key: MarketSizingMethodology
    label: string
    sub: string
    body: React.ReactNode
    headline: string
}

// ─── View ──────────────────────────────────────────────────────────────

export function MarketSizingView(props: MarketSizingViewProps): React.ReactElement {
    const { project, industryHint } = props
    const base = `/the-forge-v2/projects/${project.id}`

    const [method, setMethod] = useState<MarketSizingMethodology>("bottom-up")

    const methodCopy = METHODOLOGIES.find((m) => m.key === method) ?? METHODOLOGIES[1]

    return (
        <div className="ms2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <nav className="ms2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={`${base}/validate/hypothesis`}>Validate</Link>
                <span className="sep">›</span>
                <span className="current">Market sizing</span>
            </nav>

            <h1 className="page-title">Market sizing — TAM / SAM / SOM</h1>
            <p className="page-sub">
                Every number cites its source. Pick a methodology, edit a parameter to see live recalc.
                {industryHint ? (
                    <>
                        {" "}
                        Industry hint from Brief: <strong>{industryHint}</strong>.
                    </>
                ) : null}
                <span className="preview-flag">Preview · store ships next round</span>
            </p>

            {/* ── Preview notice ────────────────────────── */}
            <div className="ms2-preview-notice">
                <strong>Market size analysis ships with the validation store.</strong> Preview below shows
                where TAM/SAM/SOM values will render. The methodology picker and computation inputs are
                interactive, but calculations and persistence are disabled until the validation store wires
                up — no fabricated numbers appear here.
            </div>

            {/* ── Methodology picker ────────────────────── */}
            <div className="sec-h">
                Methodology
                <span className="sec-sub">Pick the lens — each recomputes against the same inputs</span>
            </div>
            <div className="ms2-method-picker" role="tablist" aria-label="Methodology">
                {METHODOLOGIES.map((m) => (
                    <button
                        key={m.key}
                        type="button"
                        role="tab"
                        aria-selected={method === m.key}
                        className={`ms2-method-pill ${method === m.key ? "active" : ""}`}
                        onClick={() => setMethod(m.key)}
                    >
                        {m.label}
                        <span className="method-sub">{m.sub}</span>
                    </button>
                ))}
            </div>

            {/* ── Pyramid ──────────────────────────────── */}
            <div className="ms2-pyramid">
                <div className="ms2-pyramid-rows">
                    <div className="ms2-pyramid-row tam">
                        <div className="p-tier">TAM</div>
                        <div>
                            <div className="p-label">Total Addressable Market</div>
                            <div className="p-desc">
                                Every buyer who could ever plausibly spend on this category — the ceiling,
                                not the forecast.
                            </div>
                        </div>
                        <div className="p-val empty">—</div>
                    </div>
                    <div className="ms2-pyramid-row sam">
                        <div className="p-tier">SAM</div>
                        <div>
                            <div className="p-label">Serviceable Addressable Market</div>
                            <div className="p-desc">
                                Slice of TAM reachable with the current product, channels, and geography.
                            </div>
                        </div>
                        <div className="p-val empty">—</div>
                    </div>
                    <div className="ms2-pyramid-row som">
                        <div className="p-tier">SOM</div>
                        <div>
                            <div className="p-label">Serviceable Obtainable Market</div>
                            <div className="p-desc">
                                Realistic 3-year capture at founder-declared win rates — what you can
                                actually book.
                            </div>
                        </div>
                        <div className="p-val empty">—</div>
                    </div>
                </div>
            </div>

            {/* ── Annotation ───────────────────────────── */}
            <div className="ms2-annot">
                <strong>Pattern — &ldquo;Show your working&rdquo; drill-in.</strong> Products V2 will show
                the TAM/SAM/SOM headline on the Market tab. The &ldquo;Show working&rdquo; link lands here
                so the founder can see the methodology, every source, edit the parameters in-line, and see
                live recalculation. Nothing is surfaced without being openly derivable — this is the audit
                trail an investor is entitled to see in the data room.
            </div>

            {/* ── Methodology card ─────────────────────── */}
            <div className="sec-h">
                How {methodCopy.headline} works
                <span className="sec-sub">{methodCopy.sub}</span>
            </div>
            <div className="ms2-method-card">{methodCopy.body}</div>

            {/* ── Computation table ────────────────────── */}
            <div className="sec-h">
                Computation
                <span className="sec-sub">Tap any value to edit · recalc wires up with the store</span>
            </div>
            {method === "bottom-up" ? (
                <BottomUpTable />
            ) : method === "top-down" ? (
                <TopDownTable />
            ) : (
                <AnalogTable />
            )}

            {/* ── Drivers ──────────────────────────────── */}
            <div className="sec-h">
                What would change this number
                <span className="sec-sub">Sensitivity drivers · ranked by impact</span>
            </div>
            <div className="ms2-two-col">
                <div>
                    <DriverRow name="ARPU realised vs. target" impact="high" />
                    <DriverRow name="Active buyers (addressable denominator)" impact="high" />
                    <DriverRow name="Channel / geography ceiling" impact="med" />
                </div>
                <div>
                    <DriverRow name="Segment mix shift" impact="med" />
                    <DriverRow name="Geographic scope creep" impact="low" />
                    <DriverRow name="FX · GBP to local currency" impact="low" />
                </div>
            </div>

            {/* ── Confidence interval ──────────────────── */}
            <div className="sec-h">Confidence interval</div>
            <div className="ms2-ci-card">
                <h4>90% CI band · bootstrap from input distributions</h4>
                {(["P5", "P25", "P50", "P75", "P95"] as const).map((label) => (
                    <div
                        key={label}
                        className="ms2-ci-row"
                        style={label === "P50" ? { background: "var(--m-brand-soft)", margin: "0 -10px", padding: "7px 10px" } : undefined}
                    >
                        <span
                            className="ci-label"
                            style={label === "P50" ? { color: "var(--m-brand)", fontWeight: 700 } : undefined}
                        >
                            {label}
                        </span>
                        <div className="ci-bar">
                            <div className="fill" style={{ left: 0, width: "0%" }} />
                        </div>
                        <span className="ci-val">—</span>
                    </div>
                ))}
                <p className="ms2-ci-footnote">
                    Band width lands once the store captures input distributions. The right tail compounds
                    ARPU upside with buyer count; the left tail is capped by the addressable-buyer filter.
                </p>
            </div>

            {/* ── Sources ──────────────────────────────── */}
            <div className="sec-h">Sources</div>
            <div className="ms2-source-card empty">
                <div>
                    <div className="s-title">Source citations land once the validation store is live.</div>
                    <div className="s-body">
                        Every parameter in the computation table will cite the primary source — industry
                        report, operator data, founder interview, regulator dataset — with a page reference
                        and a freshness flag. No number without a source.
                    </div>
                </div>
                <div className="s-meta">
                    <div>Awaiting store</div>
                </div>
            </div>
            <div className="ms2-source-card empty">
                <div>
                    <div className="s-title">Primary research slot.</div>
                    <div className="s-body">
                        Reserved for the founder&apos;s own interviews and field observations. The strongest
                        defence against investor challenge is a number you gathered yourself.
                    </div>
                </div>
                <div className="s-meta">
                    <div>Awaiting store</div>
                </div>
            </div>
            <div className="ms2-source-card empty">
                <div>
                    <div className="s-title">Triangulation slot.</div>
                    <div className="s-body">
                        Reserved for the third-source cross-check — the number has to land within tolerance
                        across at least two independent sources before the headline is promoted.
                    </div>
                </div>
                <div className="s-meta">
                    <div>Awaiting store</div>
                </div>
            </div>

            <div className="ms2-annot info">
                <strong>Founder note.</strong> This page is deliberately quiet until the validation store
                ships. When it does, every tile here will carry a live value, a citation, and a freshness
                stamp — and the whole page re-rates to derated confidence if any primary source passes 180
                days.
            </div>
        </div>
    )
}

// ─── Sub-components ────────────────────────────────────────────────────

function DriverRow({
    name,
    impact,
}: {
    name: string
    impact: "high" | "med" | "low"
}): React.ReactElement {
    const impactLabel = impact === "high" ? "High impact" : impact === "med" ? "Medium" : "Low"
    return (
        <div className="ms2-driver-row">
            <div className="d-head">
                <span className="d-name">{name}</span>
                <span className={`d-impact ${impact}`}>{impactLabel}</span>
            </div>
            <div className="d-body empty">
                Ships with validation store — sensitivity will show the £ impact of moving this driver by
                one standard deviation.
            </div>
        </div>
    )
}

function BottomUpTable(): React.ReactElement {
    return (
        <table className="ms2-comp-table">
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th style={{ textAlign: "right" }}>Value</th>
                    <th>Source</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Active buyers in addressable geography</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="—" disabled aria-label="Active buyers" />
                    </td>
                    <td className="src-text">
                        Awaiting store <span className="src-chip">source</span>
                    </td>
                </tr>
                <tr>
                    <td>× % reachable with current channels</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="—" disabled aria-label="Reachable pct" />
                    </td>
                    <td className="src-text">
                        Awaiting store <span className="src-chip">source</span>
                    </td>
                </tr>
                <tr>
                    <td>= Reachable buyers</td>
                    <td className="num">—</td>
                    <td className="src-text">derived</td>
                </tr>
                <tr>
                    <td>× % in target segment</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="—" disabled aria-label="Segment pct" />
                    </td>
                    <td className="src-text">
                        Awaiting store <span className="src-chip">source</span>
                    </td>
                </tr>
                <tr>
                    <td>= Addressable buyers</td>
                    <td className="num">—</td>
                    <td className="src-text">derived</td>
                </tr>
                <tr>
                    <td>× Annualised ARPU</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="£—" disabled aria-label="ARPU" />
                    </td>
                    <td className="src-text">Founder derivation</td>
                </tr>
                <tr>
                    <td>× 3-year horizon</td>
                    <td className="num">3</td>
                    <td className="src-text">investor convention</td>
                </tr>
                <tr className="result">
                    <td>TAM</td>
                    <td className="num">—</td>
                    <td className="src-text">live recalc — wires up with validation store</td>
                </tr>
            </tbody>
        </table>
    )
}

function TopDownTable(): React.ReactElement {
    return (
        <table className="ms2-comp-table">
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th style={{ textAlign: "right" }}>Value</th>
                    <th>Source</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Global market size (published)</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="£—" disabled aria-label="Global market size" />
                    </td>
                    <td className="src-text">
                        Awaiting store <span className="src-chip">source</span>
                    </td>
                </tr>
                <tr>
                    <td>× % in target geography</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="—" disabled aria-label="Geo pct" />
                    </td>
                    <td className="src-text">
                        Awaiting store <span className="src-chip">source</span>
                    </td>
                </tr>
                <tr>
                    <td>= Regional market</td>
                    <td className="num">—</td>
                    <td className="src-text">derived</td>
                </tr>
                <tr>
                    <td>× % in target segment</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="—" disabled aria-label="Segment share" />
                    </td>
                    <td className="src-text">
                        Awaiting store <span className="src-chip">source</span>
                    </td>
                </tr>
                <tr>
                    <td>× % digitally-served / addressable today</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="—" disabled aria-label="Digital pct" />
                    </td>
                    <td className="src-text">
                        Awaiting store <span className="src-chip">source</span>
                    </td>
                </tr>
                <tr className="result">
                    <td>TAM</td>
                    <td className="num">—</td>
                    <td className="src-text">live recalc — wires up with validation store</td>
                </tr>
            </tbody>
        </table>
    )
}

function AnalogTable(): React.ReactElement {
    return (
        <table className="ms2-comp-table">
            <thead>
                <tr>
                    <th>Analog comparison</th>
                    <th style={{ textAlign: "right" }}>Value</th>
                    <th>Source</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Named analog company / product</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="—" disabled aria-label="Analog name" style={{ width: 180 }} />
                    </td>
                    <td className="src-text">
                        Awaiting store <span className="src-chip">source</span>
                    </td>
                </tr>
                <tr>
                    <td>Reported revenue at year 3</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="£—" disabled aria-label="Analog revenue" />
                    </td>
                    <td className="src-text">
                        Awaiting store <span className="src-chip">source</span>
                    </td>
                </tr>
                <tr>
                    <td>× Scaling adjustment (geography / segment / timing)</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="×—" disabled aria-label="Scaling adjustment" />
                    </td>
                    <td className="src-text">Founder derivation</td>
                </tr>
                <tr>
                    <td>× Confidence discount (how close is the analog)</td>
                    <td className="num">
                        <input type="text" className="edit" placeholder="—" disabled aria-label="Confidence discount" />
                    </td>
                    <td className="src-text">Founder derivation</td>
                </tr>
                <tr className="result">
                    <td>TAM (analog-implied)</td>
                    <td className="num">—</td>
                    <td className="src-text">live recalc — wires up with validation store</td>
                </tr>
            </tbody>
        </table>
    )
}

// ─── Methodology copy blocks ──────────────────────────────────────────

const METHODOLOGIES: MethodologyCopy[] = [
    {
        key: "top-down",
        label: "Top-down",
        sub: "Published market × narrowing filters",
        headline: "top-down",
        body: (
            <>
                <p>
                    <strong>1. Start with a published number.</strong> Pull an industry-size figure from a
                    primary analyst or regulator source — scoped to the broadest category the product plausibly
                    competes in.
                </p>
                <p>
                    <strong>2. Narrow by geography.</strong> Apply the share of that market in the geographies
                    the product actually ships to today. Drop regions where the channel doesn&apos;t reach.
                </p>
                <p>
                    <strong>3. Narrow by segment.</strong> Apply the share in the target segment — by use-case,
                    size band, or vertical. Be honest about filters you can defend with a source.
                </p>
                <p>
                    <strong>4. Narrow by addressability today.</strong> Apply the share that is digitally-served
                    or reachable with current tooling — avoids counting buyers the product can never touch.
                </p>
            </>
        ),
    },
    {
        key: "bottom-up",
        label: "Bottom-up",
        sub: "Units × spend × horizon",
        headline: "bottom-up",
        body: (
            <>
                <p>
                    <strong>1. Define the unit.</strong> Name the unit of consumption — one farm, one vehicle,
                    one installation. Pick the narrowest unit that ties cleanly to a price point.
                </p>
                <p>
                    <strong>2. Count the units.</strong> Pull counts from a primary source, then filter by (a)
                    geography, (b) size / capacity, (c) activity — only units that actually consume the category.
                </p>
                <p>
                    <strong>3. Apply unit spend.</strong> Annualised ARPU is target price × expected attach
                    rate. Not what incumbents charge — what the product is priced to capture.
                </p>
                <p>
                    <strong>4. Collapse to 3-year unit spend.</strong> Units × ARPU × 3 years = TAM ceiling.
                    SAM / SOM below apply channel and capture filters to this ceiling.
                </p>
            </>
        ),
    },
    {
        key: "analog",
        label: "Analog",
        sub: "Reference company × scaling adjustment",
        headline: "the analog method",
        body: (
            <>
                <p>
                    <strong>1. Name the analog.</strong> Pick a company or product that hit the same buyer with
                    a comparable offer — ideally in a comparable geography at a comparable moment. The closer
                    the analog, the less scaling guesswork.
                </p>
                <p>
                    <strong>2. Pull their year-3 revenue.</strong> Annual report, filed accounts, or press
                    disclosure — primary source only, no secondary estimates.
                </p>
                <p>
                    <strong>3. Scale for geography / segment / timing.</strong> Adjust for market-size
                    differences between the analog&apos;s reach and this product&apos;s. Document the reasoning
                    — this is the step investors will challenge first.
                </p>
                <p>
                    <strong>4. Apply a confidence discount.</strong> Analogs are never perfect. A discount
                    between 0.3 and 0.8 depending on how close the analog is keeps the headline defensible.
                </p>
            </>
        ),
    },
]

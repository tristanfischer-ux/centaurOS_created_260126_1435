/**
 * CompetitorDetailView — Competitor deep-dive (V2, first render).
 *
 * Mockup-faithful DOM ported from FORGE-MOCKUP-COMPETITOR-DETAIL.html. This
 * page ships BEFORE the `competitors` table exists, so every content-bearing
 * surface is rendered as an honest empty state. No competitor specifics from
 * the mockup (SunCulture / £69M / RainMaker2 / Kiambu etc.) leak into the
 * production page.
 *
 * Sections (top to bottom, matching the mockup order):
 *   1. Breadcrumb (Forge › {project} › Validate › Competitors › (unknown))
 *   2. Banner — explains competitor profiles land here once validate-flow
 *      persistence ships.
 *   3. Company snapshot header — logo placeholder + name empty + disabled
 *      "Edit notes" / "Send to Mia" actions.
 *   4. Snapshot grid — Total funding / Team size / Units sold / Est. revenue.
 *   5. Product line-up — three empty product cards.
 *   6. Channel analysis — table with header + empty rows.
 *   7. Defensibility — four moat cards (Patents / Supply-chain / Data moat
 *      / Brand recognition) with empty bodies.
 *   8. Feature matrix — us vs. them (rows empty).
 *   9. Honest assessment — win / lose cards.
 *  10. Customer overlap map — segment × us × them rows.
 *  11. Info banner — how the page feeds Mia's deck once populated.
 */

"use client"

import Link from "next/link"

import "./competitor-detail-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface CompetitorDetailViewProps {
    project: {
        id: string
        name: string
    }
    /** Route param — displayed in the breadcrumb as an id echo since no
     *  competitor row exists yet. Kept typed so we never assume a name. */
    competitorId: string
}

// ─── View ──────────────────────────────────────────────────────────────

export function CompetitorDetailView(props: CompetitorDetailViewProps): React.ReactElement {
    const { project, competitorId } = props

    return (
        <div className="cd2">
            {/* ── Breadcrumb ─────────────────────────────────────── */}
            <div className="cd2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={`/the-forge-v2/projects/${project.id}`}>{project.name}</Link>
                <span className="sep">›</span>
                <span>Validate</span>
                <span className="sep">›</span>
                <span>Competitors</span>
                <span className="sep">›</span>
                <span className="current">{truncateId(competitorId)}</span>
            </div>

            {/* ── Placeholder banner ─────────────────────────────── */}
            <div className="cd2-annot">
                <strong>Competitor profiles populate once you log competitors in the validate flow.</strong>{" "}
                Competitor persistence ships with the validation store. Until then, this page shows the layout
                the founder will fill in — snapshot, product line, channels, moat, feature matrix, honest
                win/lose, and customer overlap — so the competitive section of a pitch deck can write itself
                straight from here.
            </div>

            {/* ── Company snapshot header ────────────────────────── */}
            <div className="cd2-company-head">
                <div className="cd2-company-logo empty" aria-hidden="true">—</div>
                <div>
                    <h1 className="empty"><span className="cd2-title-dot" aria-hidden="true" />Competitor not logged yet</h1>
                    <div className="cd2-sub">
                        HQ · founded year · one-line positioning populate once the competitor is saved from the validate flow.
                    </div>
                </div>
                <div className="cd2-actions">
                    <button type="button" disabled title="Notes editing ships with the validate store">
                        Edit notes
                    </button>
                    <button type="button" disabled title="Send to Mia ships with the compose integration">
                        Send to Mia
                    </button>
                </div>
            </div>

            {/* ── Snapshot grid ──────────────────────────────────── */}
            <div className="cd2-snap-grid">
                {SNAPSHOT_TILES.map((tile) => (
                    <div className="cd2-snap-card" key={tile.label}>
                        <div className="label">{tile.label}</div>
                        <div className="val empty">—</div>
                        <div className="meta empty">{tile.metaHint}</div>
                    </div>
                ))}
            </div>

            {/* ── Product line-up ────────────────────────────────── */}
            <div className="cd2-sec-h">Product line-up</div>
            <div className="cd2-product-line">
                {PRODUCT_SLOTS.map((slot) => (
                    <div className="cd2-product-card" key={slot.slot}>
                        <div className="p-name empty">{slot.slot}</div>
                        <div className="p-sub">Product name · positioning · target segment populate once logged.</div>
                        <div className="p-price empty">£—</div>
                        <div className="p-note empty">
                            Hero-SKU note, revenue mix, and telemetry/hardware split populate from the validate form.
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Channel analysis ───────────────────────────────── */}
            <div className="cd2-sec-h">Channel analysis · where their units actually land</div>
            <table className="cd2-channel-table">
                <thead>
                    <tr>
                        <th>Channel</th>
                        <th style={{ textAlign: "right" }}>Units (year)</th>
                        <th>Share</th>
                        <th>Notes for us</th>
                    </tr>
                </thead>
                <tbody>
                    {CHANNEL_ROWS.map((row) => (
                        <tr key={row.channel}>
                            <td>{row.channel}</td>
                            <td className="num empty-cell">—</td>
                            <td className="empty-cell">
                                <span aria-hidden="true" className="cd2-share-bar">
                                    <span className="fill" style={{ width: "0%" }} />
                                </span>
                            </td>
                            <td className="empty-cell">Tactical note populates once the channel is logged.</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ── Defensibility ──────────────────────────────────── */}
            <div className="cd2-sec-h">Defensibility (what they&apos;ve actually built a moat around)</div>
            <div className="cd2-moat-grid">
                {MOAT_CARDS.map((card) => (
                    <div className="cd2-moat-card" key={card.title}>
                        <h4 className="empty">
                            {card.title}
                            <span className="cd2-strength empty">Unrated</span>
                        </h4>
                        <div className="body empty">{card.hint}</div>
                    </div>
                ))}
            </div>

            {/* ── Feature matrix ─────────────────────────────────── */}
            <div className="cd2-sec-h">Feature matrix · us vs. them</div>
            <table className="cd2-matrix-table">
                <thead>
                    <tr>
                        <th>Feature</th>
                        <th>Our product</th>
                        <th>Competitor · flagship</th>
                        <th>Competitor · alternate</th>
                    </tr>
                </thead>
                <tbody>
                    {MATRIX_FEATURE_ROWS.map((row) => (
                        <tr key={row}>
                            <td>{row}</td>
                            <td><span className="cd2-yn empty" aria-hidden="true">—</span></td>
                            <td><span className="cd2-yn empty" aria-hidden="true">—</span></td>
                            <td><span className="cd2-yn empty" aria-hidden="true">—</span></td>
                        </tr>
                    ))}
                    <tr>
                        <td>Unit price</td>
                        <td className="empty-cell">—</td>
                        <td className="empty-cell">—</td>
                        <td className="empty-cell">—</td>
                    </tr>
                    <tr>
                        <td>Payback to customer</td>
                        <td className="empty-cell">—</td>
                        <td className="empty-cell">—</td>
                        <td className="empty-cell">—</td>
                    </tr>
                </tbody>
            </table>

            {/* ── Honest assessment ──────────────────────────────── */}
            <div className="cd2-sec-h">Honest assessment</div>
            <div className="cd2-wl-grid">
                <div className="cd2-wl-card win">
                    <h4>Why we win</h4>
                    <p className="empty-body">
                        Reasons we beat this competitor populate once the validate flow captures them — typically 3–4
                        bullets about buyer, price point, integration, or data positioning.
                    </p>
                </div>
                <div className="cd2-wl-card lose">
                    <h4>Why we lose (honest)</h4>
                    <p className="empty-body">
                        Reasons they beat us land here — the unflinching list. Usually capital advantage, channel
                        access, installed-base defence, or field-service footprint.
                    </p>
                </div>
            </div>

            {/* ── Customer overlap map ───────────────────────────── */}
            <div className="cd2-sec-h">Customer overlap map · where our footprint meets theirs</div>
            <div className="cd2-overlap-card">
                <div className="cd2-overlap-row head">
                    <div>Segment</div>
                    <div>Our footprint (LOI / interviews)</div>
                    <div>Competitor footprint (units installed)</div>
                </div>
                {OVERLAP_SEGMENT_SLOTS.map((seg) => (
                    <div className="cd2-overlap-row" key={seg}>
                        <div className="seg">{seg}</div>
                        <div className="empty-cell">—</div>
                        <div className="empty-cell">—</div>
                    </div>
                ))}
            </div>

            {/* ── Outgoing info banner ───────────────────────────── */}
            <div className="cd2-annot info" style={{ marginTop: 22 }}>
                <strong>What to do with this page next.</strong> Mia (Marketing) owns the competitive narrative in
                decks. Once this page is populated you&apos;ll be able to attach it to the next deck iteration, and
                the strongest matrix row becomes the one-line differentiator that lands in founder–investor
                conversations.
            </div>
        </div>
    )
}

// ─── Static layout data (copy only — no fabricated competitor data) ────

const SNAPSHOT_TILES: Array<{ label: string; metaHint: string }> = [
    { label: "Total funding", metaHint: "Round · date · lead investor populate once logged." },
    { label: "Team size",     metaHint: "Headcount source + split populate once logged." },
    { label: "Units sold",    metaHint: "Cumulative units + disclosure source populate once logged." },
    { label: "Est. revenue",  metaHint: "Triangulation method + year populate once logged." },
]

const PRODUCT_SLOTS: Array<{ slot: string }> = [
    { slot: "Product slot 1" },
    { slot: "Product slot 2" },
    { slot: "Product slot 3" },
]

const CHANNEL_ROWS: Array<{ channel: string }> = [
    { channel: "Direct sales team" },
    { channel: "Government / aid programmes" },
    { channel: "Co-op resellers" },
    { channel: "Retail" },
    { channel: "Online / other" },
]

const MOAT_CARDS: Array<{ title: string; hint: string }> = [
    { title: "Patents",                   hint: "Filed patents, jurisdictions, and whether they block our play populate once the competitor is logged." },
    { title: "Supply-chain contracts",    hint: "Exclusive or preferential component deals and BOM implications populate once the competitor is logged." },
    { title: "Data moat",                 hint: "Scale of their dataset, what it powers, and where we can counter-position populate once the competitor is logged." },
    { title: "Brand recognition in-market", hint: "Unprompted awareness, buyer recall, and the flank we choose populate once the competitor is logged." },
]

const MATRIX_FEATURE_ROWS: string[] = [
    "Hardware included",
    "Works with existing (non-competitor) hardware",
    "SMS-only interface (no app required)",
    "Telemetry included",
    "Multi-site / co-op dashboard",
    "Data stays with the customer",
]

const OVERLAP_SEGMENT_SLOTS: string[] = [
    "Segment slot 1",
    "Segment slot 2",
    "Segment slot 3",
    "Segment slot 4",
]

// ─── Helpers ───────────────────────────────────────────────────────────

/** Shorten a long id for breadcrumb display. UUIDs round-trip to ~8 chars. */
function truncateId(id: string): string {
    if (!id) return "(unknown)"
    if (id.length <= 12) return id
    return `${id.slice(0, 8)}…`
}

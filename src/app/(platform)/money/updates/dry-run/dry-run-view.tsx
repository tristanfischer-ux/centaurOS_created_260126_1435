/**
 * DryRunView — /money/updates/dry-run (V2, mockup-faithful PREVIEW).
 *
 * DOM ported from MONEY-MOCKUP-DRY-RUN.html. Scoped to `.dry2`.
 * Everything a founder will see once the Xero dry-run lands is rendered
 * here so the flow reads as a design sign-off surface: stats tiles,
 * category rollup, sample transactions, review queue, action bar.
 *
 * Preview contract (V1):
 *   - Whole page is the empty / preparation state. A "Preview" chip sits
 *     in the breadcrumb row; a banner below it names what wires up next
 *     round.
 *   - Stats tiles render with "—" placeholders and honest captions that
 *     say the numbers populate from the live Xero scan.
 *   - Category rollup + sample transactions + review queue each render
 *     their container frames with honest empty-state copy instead of
 *     fabricated rows. No JLCPCB / Ada Chen / NimFarm specifics.
 *   - Action bar has "Run dry-run" disabled, "Adjust mappings" linking
 *     back to /money/connect/xero, and a "Back to Cockpit" fallback.
 *   - All numeric mockup specifics (1,428 tx / 98.7% / 15 flagged / per-
 *     category totals / specific vendor names) have been STRIPPED per
 *     the only-real-supabase-data rule. Their container rows still
 *     render, captioned honestly ("populates from your Xero scan").
 *   - Copy voice: first-person, British spelling ("categorised",
 *     "organisation"), no "AI" framing. Orange title-dot.
 *
 * When Xero OAuth + dry-run scan lands:
 *   1. Server action fetches the categorised preview rows from the
 *      orphan `finance-integrations` abstraction.
 *   2. Stats tiles populate from the scan summary counts.
 *   3. Category rollup iterates real rows keyed by category.
 *   4. Sample transactions iterate the top-5-per-category selection.
 *   5. Review queue populates from the low-confidence match list.
 *   6. "Run dry-run" button becomes enabled and kicks the scan.
 *   7. "Preview" chip + banner flip off.
 */

"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import "./dry-run-v2.css"

const CATEGORIES: ReadonlyArray<{ key: string; name: string }> = [
    { key: "people", name: "People" },
    { key: "premises", name: "Premises" },
    { key: "tools", name: "Tools" },
    { key: "materials", name: "Materials" },
    { key: "growth", name: "Growth" },
    { key: "other", name: "Other" },
    { key: "revenue", name: "Revenue (cash in)" },
]

export function DryRunView(): React.ReactElement {
    const [attempted, setAttempted] = useState(false)

    const handleRunAttempt = useCallback(() => {
        console.info(
            "[money/updates/dry-run] Xero dry-run scan is not wired yet — preview state.",
        )
        setAttempted(true)
        toast("Dry-run scan wires up with the Xero connector.", {
            description:
                "Once the OAuth handshake + sync action land, this button kicks a non-destructive preview scan.",
        })
    }, [])

    return (
        <div className="dry2">
            {/* ── Breadcrumb + preview chip ─────────────────────────────── */}
            <div className="dry2-crumbs-row">
                <nav className="dry2-crumbs" aria-label="Breadcrumb">
                    <Link href="/money/cockpit">Money</Link>
                    <span className="sep" aria-hidden="true">›</span>
                    <Link href="/money/connect/xero">Connect accounting</Link>
                    <span className="sep" aria-hidden="true">›</span>
                    <span className="current">Dry-run preview</span>
                </nav>
                <div className="dry2-chips">
                    <Link href="/money/connect/xero" className="dry2-btn sm">
                        ← Back to setup
                    </Link>
                </div>
            </div>

            {/* ── Honest-state banner ───────────────────────────────────── */}
            <div className="dry2-preview-banner" role="status" aria-live="polite">
                <span className="dry2-preview-badge">Preview</span>
                <span className="dry2-preview-text">
                    Dry-run scan wires up next round. <strong>What lands on this page</strong>:
                    every transaction your Xero account holds, clustered by
                    category with a first-month Variance rollup, plus the sample
                    rows + review queue that let you fix mappings before they
                    touch your ledger. No numbers today — the scan needs the
                    connector first.
                </span>
            </div>

            {/* ── Head ──────────────────────────────────────────────────── */}
            <header className="dry2-head">
                <h1 className="dry2-title">
                    <span className="dry2-title-dot" aria-hidden="true" />
                    Dry-run · what we&rsquo;d import
                </h1>
                <p className="dry2-sub">
                    A safe preview of what the Xero sync would bring in — nothing
                    gets saved to your ledger from this screen. Scan populates
                    once the connector is live.
                </p>
                <div className="dry2-stats">
                    <div className="dry2-stats-tile">
                        <div className="lab">Total transactions</div>
                        <div className="val">—</div>
                        <div className="sub">Populates from the scan</div>
                    </div>
                    <div className="dry2-stats-tile">
                        <div className="lab">Categorised OK</div>
                        <div className="val brand">—</div>
                        <div className="sub">Auto-matched on mapping</div>
                    </div>
                    <div className="dry2-stats-tile">
                        <div className="lab">Need review</div>
                        <div className="val warn">—</div>
                        <div className="sub">Low-confidence matches</div>
                    </div>
                    <div className="dry2-stats-tile">
                        <div className="lab">Would skip</div>
                        <div className="val muted">—</div>
                        <div className="sub">Non-cash or duplicates</div>
                    </div>
                </div>
            </header>

            {/* ── Category rollup ───────────────────────────────────────── */}
            <section className="dry2-section" aria-labelledby="dry2-rollup">
                <h3 id="dry2-rollup">Category rollup · first Variance month preview</h3>
                <p className="dry2-section-sub">
                    Once the scan runs, this section shows the most recent full
                    month with Actual · Plan · Delta columns — exactly what
                    Cockpit + Variance will read after the first sync completes.
                </p>
                <div className="dry2-cat-head">
                    <div>Category</div>
                    <div>Transactions</div>
                    <div>Actual (latest)</div>
                    <div>Plan</div>
                    <div>Delta</div>
                </div>
                {CATEGORIES.map((c) => (
                    <div key={c.key} className="dry2-cat-row">
                        <div className="dry2-cat-name">{c.name}</div>
                        <div className="dry2-cat-tx">—</div>
                        <div className="dry2-cat-sum">—</div>
                        <div className="dry2-cat-tx">—</div>
                        <div className="dry2-cat-sum">—</div>
                    </div>
                ))}
                <p style={{
                    marginTop: 12,
                    fontSize: 11.5,
                    color: "var(--c-fg-muted)",
                }}>
                    Counts and amounts populate after the scan. Category names
                    match the Plan buckets you set in Money → Plan.
                </p>
            </section>

            {/* ── Sample transactions ───────────────────────────────────── */}
            <section className="dry2-section" aria-labelledby="dry2-samples">
                <h3 id="dry2-samples">Sample transactions · five per category</h3>
                <p className="dry2-section-sub">
                    A representative sample per category so you can eyeball the
                    mapping before anything lands in your ledger. Full list is
                    available on commit.
                </p>
                <div className="dry2-empty">
                    <strong>No samples to show yet</strong>
                    Samples populate once the dry-run scan runs against your
                    connected Xero organisation. The sample set is chosen to
                    cover your highest-volume and highest-value accounts first.
                </div>
            </section>

            {/* ── Review queue ──────────────────────────────────────────── */}
            <section className="dry2-section" aria-labelledby="dry2-review">
                <h3 id="dry2-review">Review queue · low-confidence matches</h3>
                <p className="dry2-section-sub">
                    Rows we&rsquo;re not sure about will land here so you can
                    pick the right category before the sync commits. Ambiguous
                    rows can also fall into an &ldquo;Uncategorised&rdquo;
                    holding bucket you can review later.
                </p>
                <div className="dry2-empty">
                    <strong>No low-confidence matches to resolve yet</strong>
                    The review queue fills in when the scan finds rows whose
                    category is ambiguous. Typical examples: automation tools
                    that could sit in Growth or Tools, shipping that could be
                    Materials or Growth.
                </div>
            </section>

            {/* ── Action bar ───────────────────────────────────────────── */}
            <div className="dry2-actions">
                <div className="dry2-actions-meta">
                    {attempted
                        ? "Scan is not wired yet — the Xero connector lands first."
                        : "Nothing is saved yet. Run the scan once the connector is live to see the full preview."}
                </div>
                <div className="dry2-actions-btns">
                    <Link href="/money/connect/xero" className="dry2-btn">
                        ← Adjust mappings
                    </Link>
                    <button
                        type="button"
                        className="dry2-btn"
                        disabled
                        aria-disabled="true"
                        title="CSV download of the preview runs once the scan lands."
                    >
                        Download preview CSV
                    </button>
                    <button
                        type="button"
                        className="dry2-btn primary"
                        onClick={handleRunAttempt}
                        aria-label="Run dry-run — scan wires up next round"
                        title="Dry-run scan wires up next round — the Xero connector lands first"
                    >
                        Run dry-run →
                    </button>
                </div>
            </div>

            {/* ── Annotation ───────────────────────────────────────────── */}
            <div className="dry2-annot">
                <strong>Note</strong> Dry-run is the confidence builder between
                &ldquo;Confirm mappings&rdquo; and &ldquo;Start sync&rdquo; — it
                reads a year of Xero data without touching your ForgeOS ledger,
                clusters into categories, and surfaces anything that looks
                miscategorised. You commit or adjust before a single row lands.
            </div>
        </div>
    )
}

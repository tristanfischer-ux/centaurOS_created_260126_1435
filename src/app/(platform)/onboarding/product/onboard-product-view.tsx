/**
 * OnboardProductView — mockup-faithful port of FORGE-MOCKUP-ONBOARD-PRODUCT.html.
 *
 * Step 3 of 7 in onboarding — the branching point. Three parallel paths:
 *   1. "I've got a hypothesis to validate" → /products
 *   2. "I'm already building something"    → /the-forge-v2/new
 *   3. "Not sure yet — show me how it works" (sandbox demo) → /products
 *
 * Plus a skip link ("skip for now — I'll come back to this") and a Back
 * link to the previous onboarding step.
 *
 * Sections match the mockup 1:1, top to bottom:
 *   1. Skip-wrap   (top-right "Skip setup →")
 *   2. ob-wrap
 *      a. eyebrow "Getting Started · Step 3 of 7"
 *      b. h1 + lead
 *      c. paths grid (two cards — hypothesis / build)
 *      d. not-sure-card (sandbox demo)
 *      e. skip-line
 *   3. foot-bar   (step meta + Back)
 *
 * All three path targets are REAL routes. The mockup's `FORGE-MOCKUP-*.html`
 * references resolve to the platform equivalents. Sibling onboarding steps
 * (/onboarding/team, /onboarding/foundry, etc.) are not built yet — the
 * Back link falls back to /today so the founder never hits a 404.
 */

"use client"

import Link from "next/link"

import "./onboard-product-v2.css"

export function OnboardProductView(): React.ReactElement {
    return (
        <div className="opd2">
            {/* ── Top-right skip link ────────────────────────────────── */}
            <div className="opd2-skip-wrap">
                <Link href="/investors">Skip setup →</Link>
            </div>

            <div className="opd2-wrap">
                {/* ── Eyebrow · Title · Lead ──────────────────────────── */}
                <div className="opd2-eyebrow">Getting Started · Step 3 of 7</div>
                <h1 className="opd2-title">
                    <span className="opd2-title-dot" aria-hidden="true" />
                    Your first product idea
                </h1>
                <p className="opd2-lead">
                    Pick the path that matches where you are. You can do both later — a
                    hypothesis can graduate into a project, and a project can feed insights
                    back to Products.
                </p>

                {/* ── Two-path grid ───────────────────────────────────── */}
                <div className="opd2-paths">
                    <Link
                        href="/products"
                        className="opd2-path-card opd2-path-hypothesis"
                        aria-label="Start with a hypothesis — validate an idea in Products"
                    >
                        <div className="opd2-path-icon">
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                aria-hidden="true"
                            >
                                <circle cx="11" cy="11" r="8" />
                                <path d="m21 21-4.3-4.3" />
                            </svg>
                        </div>
                        <h2 className="opd2-path-h">I&apos;ve got a hypothesis to validate</h2>
                        <div className="opd2-path-sub">
                            You have an idea, a rough target customer, maybe a price point —
                            but no signed orders and no CAD yet.
                        </div>
                        <ul className="opd2-path-list">
                            <li>
                                Start with a <strong>market idea</strong> — the problem, the
                                customer, the price
                            </li>
                            <li>Log interviews, LOIs, assumptions and experiments</li>
                            <li>Model unit economics before you build</li>
                            <li>Promote to a project when ready</li>
                        </ul>
                        <div className="opd2-path-route">
                            → Products · new hypothesis intake
                        </div>
                    </Link>

                    <Link
                        href="/the-forge-v2/new"
                        className="opd2-path-card opd2-path-build"
                        aria-label="Start a new project in The Forge"
                    >
                        <div className="opd2-path-icon">
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                aria-hidden="true"
                            >
                                <path d="M14 6l-4 4-4-4" />
                                <rect x="3" y="10" width="18" height="10" rx="2" />
                            </svg>
                        </div>
                        <h2 className="opd2-path-h">I&apos;m already building something</h2>
                        <div className="opd2-path-sub">
                            You have CAD, a spec, parts on order — you want the BOM,
                            suppliers, cost, and risks in one place.
                        </div>
                        <ul className="opd2-path-list">
                            <li>
                                Start with a <strong>project</strong> in The Forge
                            </li>
                            <li>Import CAD from Onshape or Solidworks</li>
                            <li>Pull your BOM into the shared table</li>
                            <li>Shortlist suppliers, log risks, track cost</li>
                        </ul>
                        <div className="opd2-path-route">
                            → The Forge · new project wizard
                        </div>
                    </Link>
                </div>

                {/* ── Not-sure / sandbox demo card ────────────────────── */}
                <div className="opd2-not-sure">
                    <div className="opd2-ns-icon" aria-hidden="true">
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <circle cx="12" cy="12" r="10" />
                            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                        </svg>
                    </div>
                    <div className="opd2-ns-body">
                        <h3>Not sure yet — show me how it works</h3>
                        <p>
                            Opens a sandbox foundry with a worked example: the Agri-Tech
                            Irrigation Monitor — from hypothesis through brief-lock, BOM,
                            suppliers, and cost. Poke around for ten minutes; when you&apos;re
                            ready, start your real thing.
                        </p>
                    </div>
                    <Link href="/products" className="opd2-ns-cta">
                        Open demo →
                    </Link>
                </div>

                {/* ── Skip-line (centered, subtle) ────────────────────── */}
                <div className="opd2-skip-line">
                    <Link href="/investors">
                        or skip for now — I&apos;ll come back to this
                    </Link>
                </div>
            </div>

            {/* ── Fixed footer bar ─────────────────────────────────────── */}
            <div className="opd2-foot-bar">
                <div className="opd2-foot-meta">
                    Step 3 of 7 · Both paths stay available from the sidebar after setup
                </div>
                <Link href="/investors" className="opd2-foot-back">
                    ← Back
                </Link>
            </div>
        </div>
    )
}

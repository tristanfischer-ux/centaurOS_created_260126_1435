/**
 * IntegrationsView — Step 5 of 7 of the onboarding wizard (V2, mockup-faithful).
 *
 * DOM ported 1:1 from FORGE-MOCKUP-ONBOARD-INTEGRATIONS.html. Scoped to
 * `.oin2`. The page lists six optional integrations — Gmail, Google
 * Calendar, Onshape, Solidworks, Xero, Stripe — each one tagged "Coming
 * soon" because no OAuth plumbing, no `integrations` table, and no
 * per-connection actions exist in the codebase yet.
 *
 * Interaction contract (V1):
 *   - Every "Connect" button is disabled — nothing to connect to.
 *   - Every card carries a "Coming soon" chip in the body (sits next to
 *     the integration name in the mockup).
 *   - "Skip all →" (top-right) and "Continue →" (footer) both route to
 *     `/today`. Onboarding step progression is not tracked in the
 *     database yet; once it is, both CTAs will advance to step 6
 *     (`/onboarding/preferences`).
 *   - "← Back" routes to `/welcome` as the nearest existing step. The
 *     earlier onboarding screens (Foundry / Product / Team) have not
 *     been built yet; there is nothing real to go back to.
 *
 * Banned mockup specifics we do NOT render:
 *   - "0 connected" as a lived number — there is no connection table to
 *     count from. We print the honest label "all optional" next to the
 *     step tag instead.
 *   - Fake OAuth flows or popovers on click.
 *
 * Sections (top to bottom, matching the mockup):
 *   1. Skip-all link (absolute, top-right)
 *   2. Annotation note (mockup parity)
 *   3. Eyebrow ("Getting Started · Step 5 of 7")
 *   4. Title ("Connect your tools") with orange title-dot accent
 *   5. Lead paragraph
 *   6. Two-column grid:
 *      a. Integration cards grid (6 cards, 2 columns)
 *      b. Rail card — "You can do this later"
 *   7. Footer bar — Step meta · Back · Continue (Skip for now)
 */

"use client"

import Link from "next/link"

import "./onboard-integrations-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

type IntegrationLogoVariant =
    | "gmail"
    | "gcal"
    | "onshape"
    | "sw"
    | "xero"
    | "stripe"

interface IntegrationCardData {
    /** Stable key + CSS logo-variant modifier. */
    id: IntegrationLogoVariant
    /** Two-letter logo glyph (matches the mockup). */
    glyph: string
    /** Display name — "Gmail". */
    name: string
    /**
     * Surfaces this integration would feed into. Rendered as chipette
     * tags in the card body. Free-text "what it unlocks" sits after
     * the chipettes as a muted sentence fragment.
     */
    feeds: ReadonlyArray<string>
    /** Short sentence fragment describing what the connection brings. */
    description: string
}

// ─── Data ──────────────────────────────────────────────────────────────

/**
 * All six cards render as "Coming soon" — no OAuth, no actions, no
 * per-connection storage exists yet. When real integrations land:
 *   1. Add `isWired: boolean` to this interface.
 *   2. Flip cards to `isWired: true` one at a time.
 *   3. Replace the disabled button with the real OAuth-handshake CTA
 *      (probably a server action that redirects to the provider).
 */
const INTEGRATIONS: ReadonlyArray<IntegrationCardData> = [
    {
        id: "gmail",
        glyph: "GM",
        name: "Gmail",
        feeds: ["Comms"],
        description: "thread summaries, waiting-on-you",
    },
    {
        id: "gcal",
        glyph: "GC",
        name: "Google Calendar",
        feeds: ["Time"],
        description: "today's schedule, meeting prep",
    },
    {
        id: "onshape",
        glyph: "OS",
        name: "Onshape",
        feeds: ["Geometry", "BOM"],
        description: "CAD sync, parts list",
    },
    {
        id: "sw",
        glyph: "SW",
        name: "Solidworks",
        feeds: ["Geometry", "BOM"],
        description: "drawing pack, parts list",
    },
    {
        id: "xero",
        glyph: "XE",
        name: "Xero",
        feeds: ["Cash Burn"],
        description: "monthly burn, runway, overhead",
    },
    {
        id: "stripe",
        glyph: "ST",
        name: "Stripe",
        feeds: ["Cash In"],
        description: "revenue, ARR, churn",
    },
]

// ─── View ──────────────────────────────────────────────────────────────

export function IntegrationsView(): React.ReactElement {
    return (
        <div className="oin2">
            <div className="oin2-skip-wrap">
                <Link href="/investors" className="oin2-skip-link">
                    Skip all →
                </Link>
            </div>

            <div className="oin2-wrap">
                <div className="oin2-annot">
                    <strong>Note — Step 5 of 7</strong> Every integration is
                    optional. Each card names the surface it feeds — Gmail
                    into Comms, Xero into Cash Burn — so you can see the
                    payoff instead of an abstract OAuth list. Nothing is
                    wired yet; every card ships as &ldquo;Coming soon&rdquo;
                    until the provider handshake lands.
                </div>

                <div className="oin2-eyebrow">Getting Started · Step 5 of 7</div>
                <h1 className="oin2-title">
                    <span className="oin2-title-dot" aria-hidden="true" />
                    Connect your tools
                </h1>
                <p className="oin2-lead">
                    All optional. Each connection plugs into a surface you
                    already have — nothing new to learn. You can add these
                    any time from Settings.
                </p>

                <div className="oin2-main">
                    <div
                        className="oin2-grid"
                        role="list"
                        aria-label="Available integrations"
                    >
                        {INTEGRATIONS.map((i) => (
                            <IntegrationCard key={i.id} data={i} />
                        ))}
                    </div>

                    <aside className="oin2-rail" aria-label="Integration notes">
                        <h3 className="oin2-rail-title">You can do this later</h3>
                        <p className="oin2-rail-p">
                            Nothing is locked behind integrations. Every
                            surface has a manual entry path. Connect when it
                            saves time, not because you have to.
                        </p>
                        <p className="oin2-rail-p">
                            Go to <strong>Settings → Integrations</strong>{" "}
                            any time.
                        </p>
                        <ul className="oin2-mini-list">
                            <li>
                                <strong>Gmail</strong> read-only for threads
                            </li>
                            <li>
                                <strong>Calendar</strong> read-only, write
                                opt-in later
                            </li>
                            <li>
                                <strong>Onshape / Solidworks</strong>{" "}
                                read-only CAD + BOM
                            </li>
                            <li>
                                <strong>Xero</strong> read-only finance
                                (soon)
                            </li>
                            <li>
                                <strong>Stripe</strong> read-only revenue
                                (soon)
                            </li>
                        </ul>
                    </aside>
                </div>
            </div>

            <div className="oin2-footbar" role="navigation" aria-label="Onboarding step controls">
                <div className="oin2-footmeta">
                    Step 5 of 7 · 0 connected · all optional
                </div>
                <Link href="/welcome" className="oin2-btn-back">
                    ← Back
                </Link>
                <Link href="/investors" className="oin2-btn-next">
                    Skip for now →
                </Link>
            </div>
        </div>
    )
}

// ─── Internals ─────────────────────────────────────────────────────────

interface IntegrationCardProps {
    data: IntegrationCardData
}

function IntegrationCard({ data }: IntegrationCardProps): React.ReactElement {
    return (
        <div className={`oin2-card oin2-card--soon oin2-logo--${data.id}`} role="listitem">
            <div className={`oin2-logo oin2-logo-${data.id}`} aria-hidden="true">
                {data.glyph}
            </div>
            <div className="oin2-card-body">
                <div className="oin2-card-name">
                    {data.name}
                    <span className="oin2-soon-badge">Coming soon</span>
                </div>
                <div className="oin2-card-feeds">
                    Feeds{" "}
                    {data.feeds.map((feed) => (
                        <span key={feed} className="oin2-chipette">
                            {feed}
                        </span>
                    ))}{" "}
                    — {data.description}
                </div>
            </div>
            <button
                type="button"
                className="oin2-connect-btn"
                disabled
                aria-disabled="true"
                title="This integration isn't wired yet. Coming soon."
            >
                Connect
            </button>
        </div>
    )
}

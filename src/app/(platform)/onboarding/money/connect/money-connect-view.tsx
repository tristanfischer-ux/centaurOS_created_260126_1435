/**
 * MoneyConnectView — /onboarding/money/connect (Money onboarding 2/5)
 *
 * @description Client component for Money onboarding step 2. Mockup-faithful
 * port of MONEY-MOCKUP-ONBOARDING-CONNECT.html. Lets the founder pick an
 * accounting provider or skip to manual entry. The OAuth integration for
 * each provider isn't wired yet — the tiles advance the step and the real
 * connection flow bolts on later.
 *
 * Voice: first-person, British spelling, no "AI" / "smart" / "intelligent".
 *
 * @related
 *   - Page:   ./page.tsx
 *   - Styles: ./money-connect.css (scoped .mob2-connect)
 *   - Action: src/actions/welcome.ts → markMoneyOnboardingStepComplete
 *   - Mockup: MONEY-MOCKUP-ONBOARDING-CONNECT.html
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { markMoneyOnboardingStepComplete } from "@/actions/welcome"

import "./money-connect.css"

type ProviderId = "xero" | "quickbooks" | "freeagent" | "plaid"

interface Provider {
    id: ProviderId
    name: string
    initials: string
    sub: string
    colour: string
    recommended?: boolean
}

const PROVIDERS: ReadonlyArray<Provider> = [
    { id: "xero",       name: "Xero",               initials: "X",  sub: "UK · NZ · AU",                   colour: "#1ea5e0", recommended: true },
    { id: "quickbooks", name: "QuickBooks",         initials: "QB", sub: "US · online or desktop",         colour: "#2ca01c" },
    { id: "freeagent",  name: "FreeAgent",          initials: "FA", sub: "UK · NatWest / RBS",             colour: "#7b2cbf" },
    { id: "plaid",      name: "Direct bank (Plaid)", initials: "B", sub: "No bookkeeper? Connect bank directly", colour: "#6b7280" },
]

export function MoneyConnectView(): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const advance = (): void => {
        startTransition(async () => {
            await markMoneyOnboardingStepComplete("connect")
            router.push("/onboarding/money/first-plan")
        })
    }

    // For V1 the provider tiles simply advance the flow — the real OAuth
    // handshake with Xero / QBO / FreeAgent / Plaid is a later migration.
    // We keep the provider id in a follow-up flag so the build terminal can
    // replay which provider the founder picked without schema churn.
    const handleProvider = (_providerId: ProviderId): void => {
        // TODO: wire the real connection flow — see MONEY-SCHEMA.md § xero_connection
        advance()
    }

    return (
        <div className="mob2-connect">
            {/* Top bar */}
            <div className="mob2-connect-topbar">
                <div className="mob2-connect-brand">
                    <span className="mob2-connect-title-dot" aria-hidden="true" />
                    <span>ForgeOS</span>
                </div>
                <div className="mob2-connect-progress">
                    <span>Step 2 of 5</span>
                    <div className="mob2-connect-pbar" aria-hidden="true">
                        <div className="mob2-connect-pf" style={{ width: "40%" }} />
                    </div>
                    <button
                        type="button"
                        onClick={advance}
                        disabled={isPending}
                        className="mob2-connect-skiplink"
                    >
                        Skip for now
                    </button>
                </div>
            </div>

            <div className="mob2-connect-shell">
                {/* Title */}
                <div className="mob2-connect-title-wrap">
                    <h1 className="mob2-connect-h1">
                        <span className="mob2-connect-title-bigdot" aria-hidden="true" />
                        Connect your accounting
                    </h1>
                    <p className="mob2-connect-lead">
                        If you&apos;re already on Xero, QuickBooks, or FreeAgent, connect now for{" "}
                        <strong>real runway</strong> and variance. If not, skip — you&apos;ll enter
                        costs manually for now.
                    </p>
                </div>

                {/* Provider grid */}
                <div className="mob2-connect-prov-grid">
                    {PROVIDERS.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            className="mob2-connect-prov-tile"
                            onClick={() => handleProvider(p.id)}
                            disabled={isPending}
                            aria-label={`Connect with ${p.name}`}
                        >
                            <div className="mob2-connect-p-logo" style={{ background: p.colour }}>
                                {p.initials}
                            </div>
                            <div className="mob2-connect-p-name">{p.name}</div>
                            <div className="mob2-connect-p-sub">{p.sub}</div>
                            {p.recommended ? (
                                <span className="mob2-connect-p-recommend">Most common</span>
                            ) : null}
                        </button>
                    ))}
                </div>

                {/* Skip band */}
                <div className="mob2-connect-skip-band">
                    <div className="mob2-connect-skip-text">
                        <strong>No accounting yet, or not ready to connect?</strong>
                        <small>
                            Skip this. You&apos;ll enter costs manually or import a CSV.
                            Connect any time later from Cockpit → Switch source.
                        </small>
                    </div>
                    <button
                        type="button"
                        onClick={advance}
                        disabled={isPending}
                        className="mob2-connect-skip-btn"
                    >
                        {isPending ? "Saving…" : "Skip for now →"}
                    </button>
                </div>

                {/* Why band */}
                <div className="mob2-connect-why-band">
                    <strong>Why connect now if you can?</strong> Once linked:
                    <ul>
                        <li>Cockpit shows actual cash balance, not forecast</li>
                        <li>Variance (plan vs actuals) populates automatically each month</li>
                        <li>The P&amp;L has a real &ldquo;Actual&rdquo; column — investors ask for this</li>
                        <li>You stop reconciling two spreadsheets</li>
                    </ul>
                    <strong>Read-only.</strong> I never write to your books. Disconnect any time.
                </div>

                {/* Nav row */}
                <div className="mob2-connect-nav">
                    <Link href="/onboarding/money/welcome" className="mob2-connect-back">
                        ← Back
                    </Link>
                    <span className="mob2-connect-nav-meta">
                        Most founders take 90 seconds on this step.
                    </span>
                </div>
            </div>
        </div>
    )
}

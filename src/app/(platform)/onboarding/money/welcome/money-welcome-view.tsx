/**
 * MoneyWelcomeView — /onboarding/money/welcome (Money onboarding 1/5)
 *
 * @description Client component for Money onboarding step 1. Mockup-faithful
 * port of MONEY-MOCKUP-ONBOARDING-WELCOME.html. Introduces the 5-step flow,
 * sets the 4-minute expectation, and routes to /onboarding/money/connect
 * once the founder hits the primary CTA.
 *
 * Voice: first-person, British spelling, no "AI" / "smart" / "intelligent".
 *
 * @related
 *   - Page:   ./page.tsx
 *   - Styles: ./money-welcome.css (scoped .mob2-welcome)
 *   - Action: src/actions/welcome.ts → markMoneyOnboardingStepComplete
 *   - Mockup: MONEY-MOCKUP-ONBOARDING-WELCOME.html
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { markMoneyOnboardingStepComplete } from "@/actions/welcome"

import "./money-welcome.css"

interface MoneyWelcomeViewProps {
    /** Foundry display name for the hero line. Null for brand-new foundries. */
    foundryName: string | null
}

export function MoneyWelcomeView({ foundryName }: MoneyWelcomeViewProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handleStart = (): void => {
        startTransition(async () => {
            await markMoneyOnboardingStepComplete("welcome")
            router.push("/onboarding/money/connect")
        })
    }

    const displayName = foundryName ?? "your foundry"

    return (
        <div className="mob2-welcome">
            {/* Top bar — brand left, progress + skip right */}
            <div className="mob2-welcome-topbar">
                <div className="mob2-welcome-brand">
                    <span className="mob2-welcome-title-dot" aria-hidden="true" />
                    <span>ForgeOS</span>
                </div>
                <div className="mob2-welcome-progress">
                    <span>Step 1 of 5</span>
                    <div className="mob2-welcome-pbar" aria-hidden="true">
                        <div className="mob2-welcome-pf" style={{ width: "20%" }} />
                    </div>
                    <Link href="/money" className="mob2-welcome-skip">
                        Skip onboarding
                    </Link>
                </div>
            </div>

            <div className="mob2-welcome-shell">
                {/* Hero */}
                <div className="mob2-welcome-hero">
                    <span className="mob2-welcome-pill">Welcome</span>
                    <h1 className="mob2-welcome-h1">
                        Let&apos;s set up <em>{displayName}</em>
                        <br />
                        in the next 4 minutes
                    </h1>
                    <p className="mob2-welcome-lead">
                        I&apos;ll link your accounting (optional), sketch your first plan,
                        and get your fundraise pipeline started.{" "}
                        <strong>Skip anything — you can come back.</strong>
                    </p>
                    <p className="mob2-welcome-lead-sub">
                        The goal isn&apos;t to fill every field. It&apos;s to see a
                        useful Cockpit by the end of this flow.
                    </p>
                </div>

                {/* Three value cards */}
                <div className="mob2-welcome-value">
                    <div className="mob2-welcome-value-card">
                        <div className="mob2-welcome-value-ic" aria-hidden="true">⎈</div>
                        <h3>Know your runway</h3>
                        <p>
                            One number, updated from your bank and invoices. No spreadsheet
                            maintenance.
                        </p>
                    </div>
                    <div className="mob2-welcome-value-card">
                        <div className="mob2-welcome-value-ic" aria-hidden="true">◰</div>
                        <h3>Plan &amp; model scenarios</h3>
                        <p>
                            Cost and revenue lines with a scenario switcher. Compare &ldquo;hire 2
                            vs delay pilot&rdquo; side-by-side.
                        </p>
                    </div>
                    <div className="mob2-welcome-value-card">
                        <div className="mob2-welcome-value-ic" aria-hidden="true">◎</div>
                        <h3>Run the raise</h3>
                        <p>
                            Investor pipeline, pitch readiness, monthly investor updates.
                            The tools that replace 4 spreadsheets.
                        </p>
                    </div>
                </div>

                {/* Primary CTA */}
                <div className="mob2-welcome-cta-row">
                    <button
                        type="button"
                        onClick={handleStart}
                        disabled={isPending}
                        className="mob2-welcome-cta-primary"
                    >
                        {isPending ? "Saving…" : "Start setup →"}
                    </button>
                </div>

                {/* Note row */}
                <div className="mob2-welcome-note">
                    Already using ForgeOS on another foundry?{" "}
                    <Link href="/workspace-picker">Switch foundry</Link>
                </div>

                {/* Steps summary card */}
                <div className="mob2-welcome-steps">
                    <h4>What&apos;s coming up</h4>
                    <div className="mob2-welcome-step-row active">
                        <div className="mob2-welcome-n">1</div>
                        <div className="mob2-welcome-step-name">
                            Welcome{" "}
                            <small>you are here</small>
                        </div>
                        <div className="mob2-welcome-time">30 sec</div>
                    </div>
                    <div className="mob2-welcome-step-row">
                        <div className="mob2-welcome-n">2</div>
                        <div className="mob2-welcome-step-name">
                            Connect accounting{" "}
                            <small>· optional · or skip</small>
                        </div>
                        <div className="mob2-welcome-time">1 min</div>
                    </div>
                    <div className="mob2-welcome-step-row">
                        <div className="mob2-welcome-n">3</div>
                        <div className="mob2-welcome-step-name">
                            First plan lines{" "}
                            <small>· pick a template</small>
                        </div>
                        <div className="mob2-welcome-time">1 min</div>
                    </div>
                    <div className="mob2-welcome-step-row">
                        <div className="mob2-welcome-n">4</div>
                        <div className="mob2-welcome-step-name">
                            Investor thesis{" "}
                            <small>· 3 quick questions</small>
                        </div>
                        <div className="mob2-welcome-time">1 min</div>
                    </div>
                    <div className="mob2-welcome-step-row">
                        <div className="mob2-welcome-n">5</div>
                        <div className="mob2-welcome-step-name">
                            Open your Cockpit{" "}
                            <small>· quick guided tour</small>
                        </div>
                        <div className="mob2-welcome-time">30 sec</div>
                    </div>
                </div>
            </div>
        </div>
    )
}

/**
 * MoneyTourView — /onboarding/money/tour (Money onboarding 5/5)
 *
 * @description Client component for the Money tour step. Mockup-faithful
 * port of MONEY-MOCKUP-ONBOARDING-TOUR.html. Renders a mini Cockpit preview
 * beneath a tour overlay card that walks through 4 tiles: runway · cash
 * out · cash in · raise pipeline. Terminal CTA marks tour complete and
 * drops into /money.
 *
 * Voice: first-person, British spelling, no "AI" / "smart" / "intelligent".
 *
 * Honest empty-state: real runway / burn / match numbers require the
 * MONEY V2 tables to land (plan_line_items, xero_transaction, investor_thesis).
 * Until then the tiles use template defaults and the copy says so.
 *
 * @related
 *   - Page:   ./page.tsx
 *   - Styles: ./money-tour.css (scoped .mob2-tour)
 *   - Action: src/actions/welcome.ts → markMoneyOnboardingStepComplete
 *   - Mockup: MONEY-MOCKUP-ONBOARDING-TOUR.html
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { markMoneyOnboardingStepComplete } from "@/actions/welcome"

import "./money-tour.css"

interface TourStep {
    label: string
    title: string
    body: string
    points: ReadonlyArray<string>
}

const TOUR_STEPS: ReadonlyArray<TourStep> = [
    {
        label: "Tour · step 1 of 4",
        title: "This is your runway",
        body: "The single most important number. I calculate it from your starting balance, your plan, and any verbal fundraise commits. Updates every time you edit.",
        points: [
            "Click the tag (Healthy · 18+ weeks) to see the math",
            "When Xero is connected, this uses your real bank balance",
            "The big number is always weeks — specific enough to make decisions urgent",
        ],
    },
    {
        label: "Tour · step 2 of 4",
        title: "Cash out this month",
        body: "The total cost your plan expects to spend this month. Edit on the Plan grid any time.",
        points: [
            "Starts from the template you picked in Step 3",
            "Sum of monthly + annualised variable lines",
            "Splits into 6 buckets: people, premises, tools, materials, growth, other",
        ],
    },
    {
        label: "Tour · step 3 of 4",
        title: "Cash in this month",
        body: "The income your plan expects. Empty until you add a revenue line or connect Stripe / bank feeds.",
        points: [
            "Add invoices from Plan → new income line",
            "Probability-weighted so grants and pilots don&apos;t overstate",
            "Once Xero is connected, actuals flow in automatically",
        ],
    },
    {
        label: "Tour · step 4 of 4",
        title: "Raise pipeline",
        body: "How many investors fit your thesis. Once the investor directory lands in this foundry, this tile shows firms that match stage, sector, and cheque range.",
        points: [
            "Edit your thesis any time in /money/raise/thesis",
            "Warm-intro count surfaces when network data is available",
            "Kanban view for pipeline moves lives on /money/raise",
        ],
    },
]

export function MoneyTourView(): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [stepIdx, setStepIdx] = useState<number>(0)

    const step = TOUR_STEPS[stepIdx]
    const isLast = stepIdx === TOUR_STEPS.length - 1

    const finish = (): void => {
        startTransition(async () => {
            await markMoneyOnboardingStepComplete("tour")
            router.push("/money")
        })
    }

    const next = (): void => {
        if (isLast) {
            finish()
            return
        }
        setStepIdx((i) => Math.min(i + 1, TOUR_STEPS.length - 1))
    }

    return (
        <div className="mob2-tour">
            {/* Top bar */}
            <div className="mob2-tour-topbar">
                <div className="mob2-tour-brand">
                    <span className="mob2-tour-title-dot" aria-hidden="true" />
                    <span>ForgeOS</span>
                </div>
                <div className="mob2-tour-progress">
                    <span>Step 5 of 5</span>
                    <div className="mob2-tour-pbar" aria-hidden="true">
                        <div className="mob2-tour-pf" style={{ width: "100%" }} />
                    </div>
                    <button
                        type="button"
                        onClick={finish}
                        disabled={isPending}
                        className="mob2-tour-skiplink"
                    >
                        Skip tour
                    </button>
                </div>
            </div>

            <div className="mob2-tour-shell">
                {/* Page title */}
                <div className="mob2-tour-title-wrap">
                    <h1 className="mob2-tour-h1">
                        <span className="mob2-tour-title-bigdot" aria-hidden="true" />
                        Your Money cockpit
                    </h1>
                    <p className="mob2-tour-lead">
                        A quick walk-through of the four tiles you&apos;ll see most often. Takes 30
                        seconds.
                    </p>
                </div>

                {/* Mini cockpit preview */}
                <section className="mob2-tour-cockpit" aria-label="Cockpit preview">
                    <div className={`mob2-tour-hero${stepIdx === 0 ? " highlight" : ""}`}>
                        <div className="mob2-tour-kicker">Runway at current burn</div>
                        <div className="mob2-tour-big">
                            26<small>weeks</small>
                        </div>
                        <div className="mob2-tour-explain">
                            Template default. Real runway lands once Plan lines save and (optionally)
                            Xero connects.
                        </div>
                    </div>

                    <div className="mob2-tour-kpis">
                        <div className={`mob2-tour-kpi${stepIdx === 1 ? " highlight" : ""}`}>
                            <div className="mob2-tour-kpi-l">Cash out · this month</div>
                            <div className="mob2-tour-kpi-v">Template default</div>
                            <div className="mob2-tour-kpi-s">
                                Edit on Plan once tables land
                            </div>
                        </div>
                        <div className={`mob2-tour-kpi${stepIdx === 2 ? " highlight" : ""}`}>
                            <div className="mob2-tour-kpi-l">Cash in · this month</div>
                            <div className="mob2-tour-kpi-v">Not set up yet</div>
                            <div className="mob2-tour-kpi-s">Add your first income line</div>
                        </div>
                        <div className={`mob2-tour-kpi${stepIdx === 3 ? " highlight" : ""}`}>
                            <div className="mob2-tour-kpi-l">Raise pipeline</div>
                            <div className="mob2-tour-kpi-v">Directory not live</div>
                            <div className="mob2-tour-kpi-s">Matches land with V2 tables</div>
                        </div>
                    </div>
                </section>

                {/* Tour overlay card — inline below the preview rather than modal so
                    it stays accessible and doesn't steal focus. */}
                <div className="mob2-tour-overlay">
                    <div className="mob2-tour-card">
                        <div className="mob2-tour-step-label">{step.label}</div>
                        <h2 className="mob2-tour-card-h2">{step.title}</h2>
                        <p className="mob2-tour-card-body">{step.body}</p>
                        <ul className="mob2-tour-points">
                            {step.points.map((p, idx) => (
                                <li key={idx}>{p}</li>
                            ))}
                        </ul>

                        <div className="mob2-tour-nav">
                            <div className="mob2-tour-dots" aria-hidden="true">
                                {TOUR_STEPS.map((_, idx) => (
                                    <div
                                        key={idx}
                                        className={`mob2-tour-dot${idx === stepIdx ? " active" : ""}`}
                                    />
                                ))}
                            </div>
                            <div className="mob2-tour-actions">
                                {stepIdx > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                                        className="mob2-tour-btn-back"
                                        disabled={isPending}
                                    >
                                        ← Back
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={finish}
                                    className="mob2-tour-btn-skip"
                                    disabled={isPending}
                                >
                                    Skip tour
                                </button>
                                <button
                                    type="button"
                                    onClick={next}
                                    disabled={isPending}
                                    className="mob2-tour-btn-next"
                                >
                                    {isPending
                                        ? "Saving…"
                                        : isLast
                                            ? "Open my Cockpit →"
                                            : "Next →"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Back link */}
                <div className="mob2-tour-back-row">
                    <Link href="/onboarding/money/thesis" className="mob2-tour-back-link">
                        ← Back
                    </Link>
                </div>
            </div>
        </div>
    )
}

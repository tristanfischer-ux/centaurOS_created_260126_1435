/**
 * CockpitTourView — /onboarding/cockpit-tour (Step 7 of 7)
 *
 * @description Client component for the final onboarding step. Renders a
 * scaled-down preview of the Today page annotated with four numbered pins,
 * then four matching callout cards explaining what each one does. Terminal
 * CTA "Start my day" marks onboarding_data.has_completed_tour = true and
 * routes to /today. Mockup-faithful port of FORGE-MOCKUP-ONBOARD-COCKPIT-TOUR.html.
 *
 * Voice: first-person, British spelling, no "AI" / "smart" / "intelligent".
 *
 * @related
 *   - Page:   ./page.tsx
 *   - Styles: ./cockpit-tour.css (scoped .oct2)
 *   - Mockup: FORGE-MOCKUP-ONBOARD-COCKPIT-TOUR.html
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { ArrowRight } from "lucide-react"

import { markCockpitTourComplete } from "@/actions/welcome"

import "./cockpit-tour.css"

interface CockpitTourViewProps {
    /** First name used to personalise the preview greeting. Optional. */
    firstName?: string
}

export function CockpitTourView({ firstName }: CockpitTourViewProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handleStart = (): void => {
        startTransition(async () => {
            await markCockpitTourComplete()
            router.push("/today")
        })
    }

    const greetingName = firstName ?? "founder"

    return (
        <div className="oct2">
            {/* Close-tour link, top-right */}
            <div className="oct2-skip">
                <Link href="/today" className="oct2-skip-link">
                    Close tour →
                </Link>
            </div>

            <div className="oct2-wrap">
                {/* ── Eyebrow + title ─────────────────────────── */}
                <div className="oct2-eyebrow-row">
                    <span className="oct2-title-dot" aria-hidden="true" />
                    <span className="oct2-eyebrow">Getting Started · Step 7 of 7</span>
                </div>
                <h1 className="oct2-title">Your Today page</h1>
                <p className="oct2-lead">
                    Today is where I open ForgeOS in the morning. Four things to know:
                </p>

                {/* ── Scaled-down Today preview with pinned callouts ── */}
                <section className="oct2-preview" aria-label="Today page preview">
                    <div className="oct2-greet">Morning, {greetingName}.</div>
                    <div className="oct2-greet-sub">
                        Friday 17 April · 9:04 am · 3 priorities · 2 waiting on you
                    </div>

                    {/* Priority slab — pin 1 */}
                    <div className="oct2-prio">
                        <span className="oct2-pin" aria-label="Callout 1">1</span>
                        <div className="oct2-prio-k">Priority</div>
                        <div className="oct2-prio-title">
                            Astra&apos;s AS9100 cert expired — blocking wing-spar awards
                        </div>
                        <div className="oct2-prio-sub">
                            Pivot to Zimmermann (next-best, 65/100, valid AS9100) · surfaced 2h ago
                        </div>
                    </div>

                    {/* Runway + Waiting row — pins 2 and 3 */}
                    <div className="oct2-row-2">
                        <div className="oct2-mini">
                            <span className="oct2-pin" aria-label="Callout 2">2</span>
                            <div className="oct2-mini-k">Runway</div>
                            <div className="oct2-mini-v">14.2 months</div>
                            <div className="oct2-mini-detail">
                                £742k cash · £52k/mo burn · next raise Q3
                            </div>
                        </div>
                        <div className="oct2-mini">
                            <span className="oct2-pin" aria-label="Callout 3">3</span>
                            <div className="oct2-mini-k">Waiting on you · 2</div>
                            <div className="oct2-mini-v oct2-mini-v--sm">
                                Kiambu Coffee — pilot pricing question
                            </div>
                            <div className="oct2-mini-detail">
                                + 1 more · last touched 2 days ago
                            </div>
                        </div>
                    </div>

                    {/* Queue + Calendar + Risk row — pin 4 on calendar */}
                    <div className="oct2-row-3">
                        <div className="oct2-mini">
                            <div className="oct2-mini-k">Today queue</div>
                            <div className="oct2-mini-v oct2-mini-v--sm">5 items</div>
                            <div className="oct2-mini-detail">2 overdue, 3 due today</div>
                        </div>
                        <div className="oct2-mini">
                            <span className="oct2-pin" aria-label="Callout 4">4</span>
                            <div className="oct2-mini-k">Calendar peek</div>
                            <div className="oct2-mini-v oct2-mini-v--sm">3 meetings today</div>
                            <div className="oct2-mini-detail">
                                Next: 10:30 supplier call · Zimmermann
                            </div>
                        </div>
                        <div className="oct2-mini">
                            <div className="oct2-mini-k">Risk horizon · 14 days</div>
                            <div className="oct2-mini-v oct2-mini-v--sm">1 blocking · 3 medium</div>
                            <div className="oct2-mini-detail">
                                Supplier cert · material lead time · EASA filing
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Four expanded callouts ──────────────────── */}
                <section className="oct2-callouts" aria-label="Callouts">
                    <article className="oct2-callout">
                        <span className="oct2-pin-inline">1</span>
                        <h3 className="oct2-callout-title">Priority slab</h3>
                        <p className="oct2-callout-body">
                            The single biggest thing to handle, with one clear next action.
                            If nothing&apos;s urgent, it nudges the next readiness gap.
                        </p>
                    </article>
                    <article className="oct2-callout">
                        <span className="oct2-pin-inline">2</span>
                        <h3 className="oct2-callout-title">Runway card</h3>
                        <p className="oct2-callout-body">
                            Cash, burn, months left. Pulls from Xero once connected; manual
                            until then. Turns amber under 9 months, red under 6.
                        </p>
                    </article>
                    <article className="oct2-callout">
                        <span className="oct2-pin-inline">3</span>
                        <h3 className="oct2-callout-title">Waiting on you</h3>
                        <p className="oct2-callout-body">
                            Threads where someone is waiting for your reply. Gmail, in-app
                            messages, and supplier questions collapsed into one queue.
                        </p>
                    </article>
                    <article className="oct2-callout">
                        <span className="oct2-pin-inline">4</span>
                        <h3 className="oct2-callout-title">Calendar peek</h3>
                        <p className="oct2-callout-body">
                            Today&apos;s meetings with a two-line prep summary per call —
                            who they are, what you promised last time, what to ask.
                        </p>
                    </article>
                </section>

                {/* ── Terminal CTA ────────────────────────────── */}
                <div className="oct2-cta-row">
                    <button
                        type="button"
                        onClick={handleStart}
                        disabled={isPending}
                        className="oct2-cta-primary"
                    >
                        Start my day
                        <ArrowRight className="oct2-cta-arrow" aria-hidden="true" />
                    </button>
                    <span className="oct2-cta-sub">
                        Takes you to Today. The onboarding panel closes.
                    </span>
                </div>
            </div>

            {/* ── Foot bar ────────────────────────────────────── */}
            <div className="oct2-foot">
                <div className="oct2-foot-meta">
                    Step 7 of 7 · Tour replay available any time from the ? menu
                </div>
                <Link href="/welcome" className="oct2-foot-back">
                    ← Back
                </Link>
            </div>
        </div>
    )
}

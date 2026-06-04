"use client"

/**
 * @file novel-archetype-card.tsx — the "new kind of system" research-status
 * dialogue shown while a NOVEL archetype run is pending/running.
 *
 * @description Faithful port of NOVEL-ARCHETYPE-DIALOGUE-MOCKUP.html (repo
 * root) — DOM structure + class names + CSS copied from the mockup, which is
 * the executable spec. Rendered instead of the generic running banner when
 * isNovelArchetype(detectedClass, detectedConfidence) is true and the run is
 * pending or running. KNOWN systems keep the generic banner (~30 min).
 *
 * Timing (corrected by Tristan, matches the mockup): a KNOWN system ≈ 30 min;
 * a NOVEL system 60–90 min (over an hour).
 *
 * Honest adaptations (no granular per-stage data exists in pdf_engine_runs):
 *   • The 5-step pipeline cannot show real per-stage completion. Step 1
 *     (Recognised) renders done; steps 2–5 render the planned sequence with a
 *     SINGLE live/pulse indicator on step 2 while the run is pending/running.
 *     We do NOT fabricate stage-by-stage completion, nor a live "N plants
 *     found" counter — the step-2 sub matches the mockup's own honest <details>
 *     phrasing rather than the mockup's placeholder running tally.
 *   • The first-of-a-kind subsystem flag is CONDITIONAL: the backend does not
 *     surface the specific novel subsystem, so we never invent one. We show the
 *     generic honest line instead.
 *
 * The brief subject + detected class are dynamic (props) rather than the
 * mockup's hard-coded "CO₂ capture & mineralisation plant".
 */

interface NovelArchetypeCardProps {
    /** Project subject / brief headline (the run's brief subject). */
    briefSubject: string
    /** Classifier productClass slug, or null. Shapes the dynamic descriptor. */
    detectedClass: string | null
    /** "pending" (queued) or "running" — drives the eyebrow/active wording. */
    status: "pending" | "running"
}

/**
 * Turn a brief subject + class slug into the human descriptor that fills the
 * mockup's "<b>CO₂ capture & mineralisation plant</b>" slot. Prefer the brief
 * subject (what the founder actually wrote); fall back to a humanised class
 * slug; final fallback is the mockup's generic "new kind of system".
 */
function describeSystem(briefSubject: string, detectedClass: string | null): string {
    const subject = briefSubject.replace(/\s+/g, " ").trim()
    if (subject.length > 0) {
        return subject.length > 90 ? `${subject.slice(0, 87)}…` : subject
    }
    if (detectedClass && detectedClass !== "unknown") {
        return detectedClass.replace(/_/g, " ")
    }
    return "new kind of system"
}

export function NovelArchetypeCard({
    briefSubject,
    detectedClass,
    status,
}: NovelArchetypeCardProps): React.ReactElement {
    const systemDescriptor = describeSystem(briefSubject, detectedClass)

    return (
        <div className="na-card">
            <div className="na-head">
                <span className="na-eyebrow">
                    <span className="na-dot" /> New kind of system
                </span>
                <h1 className="na-h1">
                    This is a new kind of system — I&rsquo;m researching it
                    properly first
                </h1>
                <p className="na-lead">
                    Your brief — a <b>{systemDescriptor}</b> — isn&rsquo;t one
                    I&rsquo;ve built a deep reference library for yet. So rather
                    than guess, I&rsquo;m researching it the way an engineer
                    would: studying real comparable systems, working the numbers
                    from first principles, and running the calculation tools.
                    That&rsquo;s why the dossier you get will be grounded, not
                    just plausible.
                </p>
            </div>

            <div className="na-body">
                <p className="na-section-label">What I&rsquo;m doing right now</p>
                <ul className="na-steps">
                    <li className="na-step na-done">
                        <span className="na-ic">✓</span>
                        <span className="na-step-main">
                            <div className="na-step-title">
                                Recognised the system
                            </div>
                            <div className="na-step-sub">
                                A bespoke system with no off-the-shelf reference —
                                so I&rsquo;m building one.
                            </div>
                        </span>
                    </li>
                    <li className="na-step na-active">
                        <span className="na-ic">
                            <span className="na-spin" />
                        </span>
                        <span className="na-step-main">
                            <div className="na-step-title">
                                Researching comparable systems
                            </div>
                            <div className="na-step-sub">
                                Searching the web and several independent
                                knowledge sources for real comparable systems
                            </div>
                        </span>
                    </li>
                    <li className="na-step na-pending">
                        <span className="na-ic">3</span>
                        <span className="na-step-main">
                            <div className="na-step-title">
                                Building the reference library
                            </div>
                            <div className="na-step-sub">
                                Real parts, suppliers and standards — each
                                verified to exist before I use it
                            </div>
                        </span>
                    </li>
                    <li className="na-step na-pending">
                        <span className="na-ic">4</span>
                        <span className="na-step-main">
                            <div className="na-step-title">
                                Grounding the numbers
                            </div>
                            <div className="na-step-sub">
                                Sizing, mass balance, duties — calculated, not
                                estimated
                            </div>
                        </span>
                    </li>
                    <li className="na-step na-pending">
                        <span className="na-ic">5</span>
                        <span className="na-step-main">
                            <div className="na-step-title">
                                Drafting your dossier
                            </div>
                            <div className="na-step-sub">
                                Only once the numbers hold together
                            </div>
                        </span>
                    </li>
                </ul>
            </div>

            <div className="na-flag">
                <div className="na-flag-h">
                    <span className="na-badge">First of a kind</span> Some parts
                    may have no precedent
                </div>
                <p>
                    Some parts of this may be first-of-a-kind — where nothing I
                    can find matches an operating system anywhere. If so,
                    I&rsquo;ll engineer them from first principles and flag them
                    clearly in the dossier, with every assumption shown, so your
                    own engineer can check the maths. I&rsquo;d rather tell you
                    something is novel than pretend it&rsquo;s routine.
                </p>
            </div>

            <div className="na-foot">
                <div className="na-eta">
                    <div className="na-num">60–90</div>
                    <div className="na-unit">minutes</div>
                </div>
                <div className="na-foot-copy">
                    A system I&rsquo;ve seen before takes{" "}
                    <b>around 30 minutes</b>. This one takes longer because
                    I&rsquo;m building its reference library from scratch — and I
                    keep that library, so the next system like yours is faster.{" "}
                    <b>
                        I&rsquo;ll show you the dossier when the numbers are
                        grounded, not a rushed draft before.
                    </b>
                    <details>
                        <summary>Why a new system takes longer</summary>
                        <p>
                            A brand-new archetype starts with nothing in my
                            database. I search the web and several independent
                            knowledge sources for real comparable systems, verify
                            every part actually exists before I use it, then save
                            it all — so the engine gets faster and more accurate
                            at this kind of system every time someone asks for
                            one. You&rsquo;re not waiting on a guess; you&rsquo;re
                            waiting on real research.
                        </p>
                    </details>
                    {status === "pending" ? (
                        <p className="na-queue-note">
                            Waiting for the worker to pick this up — it should
                            start within a minute.
                        </p>
                    ) : null}
                </div>
            </div>

            <style jsx>{`
                /* Tokens lifted verbatim from NOVEL-ARCHETYPE-DIALOGUE-MOCKUP.html
                   :root. forge-amber #c2410c ≈ the app's international-orange. */
                .na-card {
                    --na-surface: #ffffff;
                    --na-ink: #1a1d23;
                    --na-muted: #6b7280;
                    --na-faint: #9ca3af;
                    --na-line: #e7e4dc;
                    --na-line-soft: #efece5;
                    --na-accent: #c2410c;
                    --na-accent-soft: #fdf2ec;
                    --na-done: #15803d;
                    --na-active: #c2410c;
                    --na-radius: 14px;
                    --na-sans: ui-sans-serif, -apple-system, "Segoe UI", Roboto,
                        Helvetica, Arial, sans-serif;

                    background: var(--na-surface);
                    border: 1px solid var(--na-line);
                    border-radius: var(--na-radius);
                    box-shadow: 0 1px 2px rgba(20, 20, 20, 0.04),
                        0 8px 24px rgba(20, 20, 20, 0.06);
                    overflow: hidden;
                    color: var(--na-ink);
                    font-family: var(--na-sans);
                    line-height: 1.5;
                    margin-bottom: 16px;
                }

                .na-head {
                    padding: 26px 28px 20px;
                    border-bottom: 1px solid var(--na-line-soft);
                }
                .na-eyebrow {
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--na-accent);
                    background: var(--na-accent-soft);
                    border-radius: 999px;
                    padding: 5px 11px;
                    margin-bottom: 14px;
                }
                .na-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--na-accent);
                    box-shadow: 0 0 0 0 rgba(194, 65, 12, 0.5);
                    animation: na-pulse 1.8s infinite;
                }
                @keyframes na-pulse {
                    0% {
                        box-shadow: 0 0 0 0 rgba(194, 65, 12, 0.45);
                    }
                    70% {
                        box-shadow: 0 0 0 7px rgba(194, 65, 12, 0);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(194, 65, 12, 0);
                    }
                }
                .na-h1 {
                    font-size: 20px;
                    margin: 0 0 8px;
                    letter-spacing: -0.3px;
                    font-weight: 600;
                }
                .na-lead {
                    color: #3b3f46;
                    font-size: 14.5px;
                    margin: 0;
                }

                .na-body {
                    padding: 22px 28px 6px;
                }
                .na-section-label {
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.07em;
                    text-transform: uppercase;
                    color: var(--na-faint);
                    margin: 0 0 14px;
                }

                .na-steps {
                    list-style: none;
                    margin: 0 0 8px;
                    padding: 0;
                }
                .na-step {
                    display: flex;
                    gap: 14px;
                    padding: 0 0 18px;
                    position: relative;
                }
                .na-step:not(:last-child)::before {
                    content: "";
                    position: absolute;
                    left: 11px;
                    top: 24px;
                    bottom: 0;
                    width: 2px;
                    background: var(--na-line);
                }
                .na-step.na-done:not(:last-child)::before {
                    background: var(--na-done);
                }
                .na-ic {
                    flex: 0 0 auto;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: grid;
                    place-items: center;
                    font-size: 12px;
                    font-weight: 700;
                    border: 2px solid var(--na-line);
                    background: #fff;
                    color: var(--na-faint);
                    z-index: 1;
                }
                .na-step.na-done .na-ic {
                    border-color: var(--na-done);
                    background: var(--na-done);
                    color: #fff;
                }
                .na-step.na-active .na-ic {
                    border-color: var(--na-active);
                    color: var(--na-active);
                }
                .na-spin {
                    width: 9px;
                    height: 9px;
                    border-radius: 50%;
                    border: 2px solid var(--na-accent);
                    border-top-color: transparent;
                    animation: na-rot 0.8s linear infinite;
                }
                @keyframes na-rot {
                    to {
                        transform: rotate(360deg);
                    }
                }
                .na-step-main {
                    padding-top: 1px;
                }
                .na-step-title {
                    font-weight: 600;
                    font-size: 14.5px;
                }
                .na-step.na-pending .na-step-title {
                    color: var(--na-faint);
                }
                .na-step-sub {
                    font-size: 13px;
                    color: var(--na-muted);
                    margin-top: 2px;
                }
                .na-step.na-active .na-step-sub {
                    color: var(--na-accent);
                }

                .na-flag {
                    margin: 6px 28px 22px;
                    border: 1px solid #f0d8c9;
                    background: #fdf7f3;
                    border-radius: 12px;
                    padding: 16px 18px;
                }
                .na-flag-h {
                    display: flex;
                    align-items: center;
                    gap: 9px;
                    font-weight: 600;
                    font-size: 14px;
                    margin-bottom: 6px;
                }
                .na-badge {
                    font-size: 10.5px;
                    font-weight: 700;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    color: #9a3412;
                    background: #fbe6d8;
                    border-radius: 5px;
                    padding: 2px 7px;
                }
                .na-flag p {
                    margin: 0;
                    font-size: 13.5px;
                    color: #4a4641;
                }

                .na-foot {
                    display: flex;
                    align-items: flex-start;
                    gap: 16px;
                    padding: 18px 28px;
                    border-top: 1px solid var(--na-line-soft);
                    background: #fcfbf9;
                }
                .na-eta {
                    flex: 0 0 auto;
                    text-align: center;
                    min-width: 96px;
                }
                .na-num {
                    font-size: 22px;
                    font-weight: 700;
                    letter-spacing: -0.5px;
                }
                .na-unit {
                    font-size: 11px;
                    color: var(--na-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                }
                .na-foot-copy {
                    font-size: 13px;
                    color: #4a4641;
                }
                .na-foot-copy b {
                    color: var(--na-ink);
                }
                .na-queue-note {
                    font-size: 12px;
                    color: var(--na-faint);
                    margin: 10px 0 0;
                }

                .na-foot-copy details {
                    margin: 14px 0 0;
                    border-top: 1px solid var(--na-line-soft);
                    padding-top: 14px;
                }
                .na-foot-copy summary {
                    cursor: pointer;
                    font-size: 13px;
                    color: var(--na-muted);
                    font-weight: 500;
                    list-style: none;
                }
                .na-foot-copy summary::-webkit-details-marker {
                    display: none;
                }
                .na-foot-copy summary::before {
                    content: "›";
                    display: inline-block;
                    margin-right: 7px;
                    transition: transform 0.15s;
                    color: var(--na-faint);
                }
                .na-foot-copy details[open] summary::before {
                    transform: rotate(90deg);
                }
                .na-foot-copy details p {
                    font-size: 13px;
                    color: #4a4641;
                    margin: 10px 0 0;
                }
            `}</style>
        </div>
    )
}

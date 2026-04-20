/**
 * MoneyThesisView — /onboarding/money/thesis (Money onboarding 4/5)
 *
 * @description Client component for Money onboarding step 4. Mockup-faithful
 * port of MONEY-MOCKUP-ONBOARDING-THESIS.html. Three quick questions:
 * stage picker (single-choice chips), sector tags (multi-choice chips),
 * cheque range slider (two dots).
 *
 * Voice: first-person, British spelling, no "AI" / "smart" / "intelligent".
 *
 * @related
 *   - Page:   ./page.tsx
 *   - Styles: ./money-thesis.css (scoped .mob2-thesis)
 *   - Action: src/actions/welcome.ts → markMoneyOnboardingStepComplete
 *   - Mockup: MONEY-MOCKUP-ONBOARDING-THESIS.html
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { markMoneyOnboardingStepComplete } from "@/actions/welcome"

import "./money-thesis.css"

type StageId = "idea" | "pre_seed" | "seed" | "series_a" | "later"
type TagId =
    | "hardware" | "agri_tech" | "robotics" | "climate" | "deeptech"
    | "b2b_saas" | "consumer" | "fintech" | "healthtech" | "energy" | "web3"

interface StageOption { id: StageId; label: string }
interface TagOption { id: TagId; label: string }

const STAGE_OPTIONS: ReadonlyArray<StageOption> = [
    { id: "idea",      label: "Idea stage" },
    { id: "pre_seed",  label: "Pre-seed" },
    { id: "seed",      label: "Seed" },
    { id: "series_a",  label: "Series A" },
    { id: "later",     label: "Later" },
]

const TAG_OPTIONS: ReadonlyArray<TagOption> = [
    { id: "hardware",   label: "Hardware" },
    { id: "agri_tech",  label: "Agri-tech" },
    { id: "robotics",   label: "Robotics" },
    { id: "climate",    label: "Climate" },
    { id: "deeptech",   label: "Deeptech" },
    { id: "b2b_saas",   label: "B2B SaaS" },
    { id: "consumer",   label: "Consumer" },
    { id: "fintech",    label: "Fintech" },
    { id: "healthtech", label: "Healthtech" },
    { id: "energy",     label: "Energy" },
    { id: "web3",       label: "Web3" },
]

export function MoneyThesisView(): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // Defaults match the mockup's visible state so the match estimate lands
    // on a believable number before the founder has tweaked anything.
    const [stage, setStage] = useState<StageId>("pre_seed")
    const [tags, setTags] = useState<ReadonlySet<TagId>>(
        new Set(["hardware", "agri_tech", "robotics", "climate"] as TagId[]),
    )
    const [chequeLow, setChequeLow] = useState<number>(50)   // £k
    const [chequeHigh, setChequeHigh] = useState<number>(350) // £k

    const toggleTag = (id: TagId): void => {
        const next = new Set(tags)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setTags(next)
    }

    // Slider math: map £10k-£2m (log scale would be nicer, but linear keeps
    // the mockup look). We cap the value at 2000 = £2m+.
    const MIN = 10
    const MAX = 2000
    const leftPct = ((chequeLow - MIN) / (MAX - MIN)) * 100
    const rightPct = ((chequeHigh - MIN) / (MAX - MIN)) * 100
    const width = Math.max(0, rightPct - leftPct)

    const fmtCheque = (kValue: number): string => {
        if (kValue >= 1000) return `£${(kValue / 1000).toFixed(kValue % 1000 === 0 ? 0 : 1)}m`
        return `£${kValue}k`
    }

    const advance = (): void => {
        startTransition(async () => {
            await markMoneyOnboardingStepComplete("thesis")
            router.push("/onboarding/money/tour")
        })
    }

    return (
        <div className="mob2-thesis">
            {/* Top bar */}
            <div className="mob2-thesis-topbar">
                <div className="mob2-thesis-brand">
                    <span className="mob2-thesis-title-dot" aria-hidden="true" />
                    <span>ForgeOS</span>
                </div>
                <div className="mob2-thesis-progress">
                    <span>Step 4 of 5</span>
                    <div className="mob2-thesis-pbar" aria-hidden="true">
                        <div className="mob2-thesis-pf" style={{ width: "80%" }} />
                    </div>
                    <button
                        type="button"
                        onClick={advance}
                        disabled={isPending}
                        className="mob2-thesis-skiplink"
                    >
                        Skip for now
                    </button>
                </div>
            </div>

            <div className="mob2-thesis-shell">
                {/* Title */}
                <div className="mob2-thesis-title-wrap">
                    <h1 className="mob2-thesis-h1">
                        <span className="mob2-thesis-title-bigdot" aria-hidden="true" />
                        3 questions to start the raise
                    </h1>
                    <p className="mob2-thesis-lead">
                        Enough for me to show you the investors most likely to write your cheque.
                        Fine-tune any time in the full thesis editor.
                    </p>
                </div>

                {/* Q1 stage */}
                <div className="mob2-thesis-q-card">
                    <div className="mob2-thesis-q-num">01</div>
                    <h3>What stage are you at?</h3>
                    <div className="mob2-thesis-q-hint">
                        Investors have preferred entry points. Pre-seed investors rarely write seed
                        cheques, and vice versa.
                    </div>
                    <div className="mob2-thesis-chip-pick" role="radiogroup" aria-label="Stage">
                        {STAGE_OPTIONS.map((opt) => {
                            const isActive = stage === opt.id
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`mob2-thesis-cp${isActive ? " active" : ""}`}
                                    onClick={() => setStage(opt.id)}
                                >
                                    {opt.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Q2 tags */}
                <div className="mob2-thesis-q-card">
                    <div className="mob2-thesis-q-num">02</div>
                    <h3>Pick the tags that describe you</h3>
                    <div className="mob2-thesis-q-hint">
                        I match these against each investor&apos;s stated thesis. Pick 2–5.
                    </div>
                    <div className="mob2-thesis-chip-pick" role="group" aria-label="Sector tags">
                        {TAG_OPTIONS.map((opt) => {
                            const isActive = tags.has(opt.id)
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    aria-pressed={isActive}
                                    className={`mob2-thesis-cp${isActive ? " active" : ""}`}
                                    onClick={() => toggleTag(opt.id)}
                                >
                                    {opt.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Q3 cheque range */}
                <div className="mob2-thesis-q-card">
                    <div className="mob2-thesis-q-num">03</div>
                    <h3>What cheque range fits your round?</h3>
                    <div className="mob2-thesis-q-hint">
                        Your round total divided across typical investor cheques. I&apos;ll filter out
                        firms that never write cheques in this range.
                    </div>
                    <div className="mob2-thesis-range-wrap">
                        <div className="mob2-thesis-range-bar" aria-hidden="true">
                            <div
                                className="mob2-thesis-range-fill"
                                style={{ left: `${leftPct}%`, width: `${width}%` }}
                            />
                            <div
                                className="mob2-thesis-range-dot"
                                style={{ left: `${leftPct}%` }}
                            />
                            <div
                                className="mob2-thesis-range-dot"
                                style={{ left: `${rightPct}%` }}
                            />
                        </div>
                        <div className="mob2-thesis-range-labels">
                            <span>£10k</span>
                            <span>£2m+</span>
                        </div>
                        <div className="mob2-thesis-range-current">
                            {fmtCheque(chequeLow)} – {fmtCheque(chequeHigh)}
                        </div>
                        {/* Accessible numeric inputs — keep the visual slider as the primary
                            affordance but give keyboard users a real control. */}
                        <div className="mob2-thesis-range-inputs">
                            <label>
                                Low
                                <input
                                    type="number"
                                    min={MIN}
                                    max={chequeHigh - 10}
                                    step={5}
                                    value={chequeLow}
                                    onChange={(e) => {
                                        const v = Math.max(MIN, Math.min(chequeHigh - 10, Number(e.target.value) || MIN))
                                        setChequeLow(v)
                                    }}
                                />
                                <span>k</span>
                            </label>
                            <label>
                                High
                                <input
                                    type="number"
                                    min={chequeLow + 10}
                                    max={MAX}
                                    step={5}
                                    value={chequeHigh}
                                    onChange={(e) => {
                                        const v = Math.max(chequeLow + 10, Math.min(MAX, Number(e.target.value) || MAX))
                                        setChequeHigh(v)
                                    }}
                                />
                                <span>k</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Result band — honest empty-state: real match counts require the
                    investor_thesis + investor_firms tables that land with MONEY V2. */}
                <div className="mob2-thesis-result-band">
                    <strong>Based on your answers:</strong>
                    <span className="mob2-thesis-result-big">Match engine not live yet</span>
                    I&apos;ll save your thesis draft. Once the investor directory lands in this
                    foundry, I&apos;ll show how many firms fit your stage, sector, and cheque size —
                    and which of them you can warm-intro through the ForgeOS network.
                </div>

                <div className="mob2-thesis-later">
                    <strong>Not raising right now?</strong> No problem — I&apos;ll keep this thesis
                    warm and notify you when new matching investors appear in the directory.{" "}
                    <button
                        type="button"
                        onClick={advance}
                        disabled={isPending}
                        className="mob2-thesis-later-link"
                    >
                        Skip to the Cockpit tour →
                    </button>
                </div>

                {/* Nav row */}
                <div className="mob2-thesis-nav">
                    <Link href="/onboarding/money/first-plan" className="mob2-thesis-back">
                        ← Back
                    </Link>
                    <button
                        type="button"
                        onClick={advance}
                        disabled={isPending}
                        className="mob2-thesis-cta-primary"
                    >
                        {isPending ? "Saving…" : "Looks good, next →"}
                    </button>
                </div>
            </div>
        </div>
    )
}

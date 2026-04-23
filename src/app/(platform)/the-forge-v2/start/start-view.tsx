"use client"

/**
 * @file start-view.tsx — the simple brief-in autopilot-out client view.
 *
 * @description One textarea. One button. That's it. No multi-step wizard, no
 * field-by-field metadata, no starter-reference picker. Founder types a brief
 * (minimum 20 chars so Chase has something to chew on), clicks Start +
 * Autopilot, gets redirected to the workspace where autopilot walks the
 * pipeline.
 *
 * The wizard at /the-forge-v2/new remains for advanced-mode founders who
 * want to fill every field upfront. This page is the default.
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { startProjectWithAutopilot } from "@/actions/start-project-with-autopilot"

import "./start-v2.css"

const SUBJECT_MIN = 20
const SUBJECT_MAX = 2_000

export function StartView(): React.ReactElement {
    const router = useRouter()
    const [subject, setSubject] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const charCount = subject.length
    const subjectValid =
        subject.trim().length >= SUBJECT_MIN && charCount <= SUBJECT_MAX
    const canSubmit = subjectValid && !isPending

    function handleSubmit(): void {
        setError(null)
        if (!canSubmit) {
            setError(
                subject.trim().length < SUBJECT_MIN
                    ? `Add at least ${SUBJECT_MIN - subject.trim().length} more characters — Chase needs something to research.`
                    : `Trim the brief to ${SUBJECT_MAX.toLocaleString("en-GB")} characters or fewer.`,
            )
            return
        }

        startTransition(async () => {
            try {
                const result = await startProjectWithAutopilot(subject.trim())
                if (!result.ok) {
                    setError(result.error)
                    return
                }
                router.push(`/the-forge-v2/projects/${result.projectId}`)
            } catch (err) {
                const message =
                    err instanceof Error && err.message
                        ? err.message
                        : "Something broke starting the project. Try once more."
                console.error("[StartView] startProjectWithAutopilot threw:", err)
                setError(message)
            }
        })
    }

    return (
        <div className="sv2">
            <nav className="sv2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span> › </span>
                <span>Start</span>
            </nav>

            <header className="sv2-header">
                <h1>Start a new project</h1>
                <p className="sv2-sub">
                    Type a short brief. One click and the whole pipeline runs
                    itself — Chase researches, Max decomposes, Fang sizes, BOM +
                    cost lands, illustrations render, suppliers match, and the
                    PDF exports when everything's done.
                </p>
                <p className="sv2-advanced-link">
                    Need to fill in every field yourself?{" "}
                    <Link href="/the-forge-v2/new">Use the advanced wizard →</Link>
                </p>
            </header>

            <section className="sv2-brief-card">
                <label htmlFor="sv2-brief">Your brief</label>
                <textarea
                    id="sv2-brief"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="40ft ISO shipping container converted into a modular vertical farm for short leafy salad greens. Five tiers of hydroponic racks on both sides of a 1m walking aisle running down the centre. HVAC + dehumidifier, fertigation, air handling. Target canopy 40 m², yield 8 kg/week leafy greens, unit cost £45,000, first deployment 9 months out. Customers: UK supermarkets, institutional kitchens."
                    rows={12}
                    maxLength={SUBJECT_MAX + 200}
                    disabled={isPending}
                    className="sv2-textarea"
                />
                <div className="sv2-count">
                    {charCount.toLocaleString("en-GB")} / {SUBJECT_MAX.toLocaleString("en-GB")}
                    {subject.trim().length > 0 && subject.trim().length < SUBJECT_MIN ? (
                        <span className="sv2-count-hint">
                            {" · "}
                            {SUBJECT_MIN - subject.trim().length} more to unlock
                        </span>
                    ) : null}
                </div>

                {error ? (
                    <div role="alert" className="sv2-error">
                        {error}
                    </div>
                ) : null}

                <div className="sv2-actions">
                    <Link href="/the-forge-v2" className="sv2-btn sv2-btn-ghost">
                        Cancel
                    </Link>
                    <button
                        type="button"
                        className="sv2-btn sv2-btn-primary"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        aria-busy={isPending}
                    >
                        {isPending
                            ? "Starting pipeline…"
                            : "Start + Autopilot →"}
                    </button>
                </div>
                <p className="sv2-note">
                    Autopilot takes 15–25 minutes end-to-end. You can close this
                    tab — the pipeline runs server-side and the workspace page
                    shows live progress when you come back.
                </p>
            </section>

            <aside className="sv2-what">
                <h2>What autopilot does</h2>
                <ol className="sv2-what-list">
                    <li>
                        <strong>Chase</strong> — researches the industry,
                        regulatory posture, and analogues.
                    </li>
                    <li>
                        <strong>Max</strong> — decomposes the system into
                        modules with key parts + failure modes.
                    </li>
                    <li>
                        <strong>Fang</strong> — sizes every module to fit the
                        declared envelope, produces the dimension sheet, and
                        optimises across tier count / canopy / layout.
                    </li>
                    <li>
                        <strong>BOM generator</strong> — turns modules into a
                        parts list with quantities and lead times.
                    </li>
                    <li>
                        <strong>Finn</strong> — costs the BOM with sensitivity
                        bands and a unit-cost number.
                    </li>
                    <li>
                        <strong>Illustrations</strong> — hero system render
                        plus per-module images, all proportioned to the
                        dimension sheet.
                    </li>
                    <li>
                        <strong>Suppliers</strong> — matches each module to
                        real suppliers from the Forge directory.
                    </li>
                    <li>
                        <strong>Fang reviews</strong> — DFM verdict per module
                        with issues + recommendations.
                    </li>
                    <li>
                        <strong>PDF export</strong> — the full Forge project
                        pack lands on your workspace download shelf.
                    </li>
                </ol>
            </aside>
        </div>
    )
}

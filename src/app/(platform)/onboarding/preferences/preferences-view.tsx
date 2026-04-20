/**
 * PreferencesView — Step 6 of 7 of the onboarding wizard (V2, mockup-faithful).
 *
 * DOM ported 1:1 from FORGE-MOCKUP-ONBOARD-PREFERENCES.html. Scoped to
 * `.opr2`. Shows three sections — illustration style, notifications,
 * locale — with the brand title-dot accent and the fixed footer bar
 * (Back / Continue).
 *
 * Data contract (what actually persists today):
 *   - Notifications digest cadence → email_preferences.morning_digest
 *     ("daily" writes true, "off" writes false). See
 *     src/actions/onboarding-preferences.ts.
 *
 * Fields on the mockup we do NOT persist yet (no profile-level column
 * exists for any of these). Each one renders with an honest "NOT SAVED"
 * chip + inline note so the founder can see the default has been
 * applied without being misled:
 *   - Illustration style  — lives per-project on cad_lab_projects, not
 *                           as a profile default.
 *   - Timezone            — not stored on profiles.
 *   - Language            — not stored anywhere.
 *   - Weekly digest       — no weekly_digest column on email_preferences.
 *   - Critical only       — no critical_only column on email_preferences.
 *
 * Sections (top to bottom, matching the mockup):
 *   1. Skip-wrap            (absolute, top-right → /onboarding/cockpit-tour)
 *   2. Annotation note      (Step 6 of 7 explainer)
 *   3. Eyebrow              ("Getting Started · Step 6 of 7")
 *   4. Title + lead         (orange title-dot)
 *   5. Illustration style   (4-card grid, Blueprint default, read-only)
 *   6. Notifications        (4 radios, Daily default, two disabled)
 *   7. Locale               (Timezone + Language two-col, disabled)
 *   8. Foot-bar             (step meta · Back · Continue)
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import {
    saveOnboardingPreferences,
    type DigestCadence,
} from "@/actions/onboarding-preferences"

import "./onboard-preferences-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

type IllustrationStyleId =
    | "blueprint"
    | "photoreal"
    | "isometric"
    | "editorial"

type CadenceRadioId = "daily" | "weekly" | "critical" | "off"

interface StyleOptionData {
    id: IllustrationStyleId
    label: string
    /** Short caption shown inside the preview swatch. */
    previewLabel: string
    /** True for the one we mark "DEFAULT" in the corner. */
    isDefault: boolean
}

interface CadenceRadioData {
    id: CadenceRadioId
    main: string
    sub: string
    /** True when the choice maps to a real column we can write. */
    isPersistable: boolean
}

export interface PreferencesViewProps {
    /**
     * Current morning-digest flag from the database (null if no row
     * exists yet — treated as the default "daily" choice).
     */
    initialMorningDigest: boolean | null
    /**
     * True when the user has this preferences step completed — if so
     * the illustration style / timezone / language selections we can't
     * persist will still render but won't be treated as "unsaved".
     * (Reserved for when those columns land.)
     */
    hasExistingPreferences: boolean
}

// ─── Static data (from mockup) ─────────────────────────────────────────

const STYLE_OPTIONS: ReadonlyArray<StyleOptionData> = [
    { id: "blueprint", label: "Blueprint", previewLabel: "Blueprint", isDefault: true },
    { id: "photoreal", label: "Photoreal", previewLabel: "Photoreal", isDefault: false },
    { id: "isometric", label: "Isometric", previewLabel: "Isometric vector", isDefault: false },
    { id: "editorial", label: "Editorial", previewLabel: "Editorial photo", isDefault: false },
]

const CADENCE_RADIOS: ReadonlyArray<CadenceRadioData> = [
    {
        id: "daily",
        main: "Daily digest",
        sub: "One email each morning — priorities, waiting-on-you, overdue. Recommended.",
        isPersistable: true,
    },
    {
        id: "weekly",
        main: "Weekly digest",
        sub: "One email on Monday — summary of the week ahead and what shifted last week.",
        isPersistable: false,
    },
    {
        id: "critical",
        main: "Critical only",
        sub: "Only supplier pivots, blocking risks, runway crossing a threshold.",
        isPersistable: false,
    },
    {
        id: "off",
        main: "Off",
        sub: "No emails. Check in-app when you choose.",
        isPersistable: true,
    },
]

// ─── View ──────────────────────────────────────────────────────────────

export function PreferencesView({
    initialMorningDigest,
    hasExistingPreferences: _hasExistingPreferences,
}: PreferencesViewProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    // Local UI state — illustration style and locale are read-only preview
    // (no DB column yet). We still let the founder click them so the page
    // feels alive and the chosen default is visible.
    const [styleId, setStyleId] = useState<IllustrationStyleId>("blueprint")

    const initialCadence: CadenceRadioId =
        initialMorningDigest === false ? "off" : "daily"
    const [cadence, setCadence] = useState<CadenceRadioId>(initialCadence)

    const handleContinue = (): void => {
        setError(null)
        // Only "daily" and "off" map to a column. Anything else: don't
        // attempt to persist, just advance (the mockup shows the radio
        // as still selectable so we honour the parity).
        const toSave: DigestCadence | null =
            cadence === "daily" ? "daily" : cadence === "off" ? "off" : null

        startTransition(async () => {
            if (toSave) {
                const result = await saveOnboardingPreferences({ cadence: toSave })
                if ("error" in result) {
                    setError(result.error)
                    return
                }
            }
            router.push("/onboarding/cockpit-tour")
        })
    }

    return (
        <div className="opr2">
            {/* ── Top-right skip link ─────────────────────────────────── */}
            <div className="opr2-skip-wrap">
                <Link href="/onboarding/cockpit-tour">Skip →</Link>
            </div>

            <div className="opr2-wrap">
                <div className="opr2-annot">
                    <strong>Note — Step 6 of 7</strong>
                    Sensible defaults are already picked — Blueprint
                    illustration, a daily digest, British English, and a
                    timezone auto-detected by your browser. You can walk
                    through and confirm, or change anything later from
                    Settings.
                </div>

                <div className="opr2-eyebrow">Getting Started · Step 6 of 7</div>
                <h1 className="opr2-title">
                    <span className="opr2-title-dot" aria-hidden="true" />
                    Preferences
                </h1>
                <p className="opr2-lead">
                    Sensible defaults are already picked. Change anything
                    here, or later from Settings.
                </p>

                {/* ── Section 1: Illustration style ───────────────────── */}
                <section className="opr2-section" aria-labelledby="opr2-style-h">
                    <h2 id="opr2-style-h">
                        Illustration style
                        <span className="opr2-not-saved" title="No profile-level column for this preference yet — choose per project in Specify.">
                            Preview
                        </span>
                    </h2>
                    <p className="opr2-section-sub">
                        How product renders, system views, and module cards
                        look across the Forge. Each module in a project can
                        override this — the default saves per-project for now.
                    </p>

                    <div
                        className="opr2-style-grid"
                        role="radiogroup"
                        aria-label="Illustration style"
                    >
                        {STYLE_OPTIONS.map((opt) => {
                            const isSelected = styleId === opt.id
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    className={`opr2-style-option opr2-s-${opt.id} ${
                                        isSelected ? "opr2-selected" : ""
                                    }`}
                                    onClick={() => setStyleId(opt.id)}
                                >
                                    <span className="opr2-style-preview">
                                        {opt.previewLabel}
                                    </span>
                                    <span className="opr2-style-label-row">
                                        <span className="opr2-style-lbl">
                                            {opt.label}
                                        </span>
                                        {opt.isDefault ? (
                                            <span className="opr2-default-tag">
                                                Default
                                            </span>
                                        ) : null}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </section>

                {/* ── Section 2: Notifications ────────────────────────── */}
                <section className="opr2-section" aria-labelledby="opr2-notif-h">
                    <h2 id="opr2-notif-h">Notifications</h2>
                    <p className="opr2-section-sub">
                        Email digest frequency. In-app notifications are
                        always on.
                    </p>

                    <div
                        className="opr2-radio-stack"
                        role="radiogroup"
                        aria-label="Digest frequency"
                    >
                        {CADENCE_RADIOS.map((r) => {
                            const isSelected = cadence === r.id
                            const isDisabled = !r.isPersistable
                            return (
                                <button
                                    key={r.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    aria-disabled={isDisabled}
                                    disabled={isDisabled}
                                    className={`opr2-radio-row ${
                                        isSelected ? "opr2-selected" : ""
                                    }`}
                                    onClick={() => {
                                        if (isDisabled) return
                                        setCadence(r.id)
                                    }}
                                >
                                    <span className="opr2-radio-dot" aria-hidden="true" />
                                    <span className="opr2-radio-body">
                                        <span className="opr2-radio-main">
                                            {r.main}
                                            {!r.isPersistable ? (
                                                <span className="opr2-not-saved">
                                                    Not yet available
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className="opr2-radio-sub">
                                            {r.sub}
                                        </span>
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </section>

                {/* ── Section 3: Locale ───────────────────────────────── */}
                <section className="opr2-section" aria-labelledby="opr2-locale-h">
                    <h2 id="opr2-locale-h">
                        Locale
                        <span className="opr2-not-saved" title="Not stored on profiles yet — timezone is auto-detected from the browser and language defaults to British English.">
                            Preview
                        </span>
                    </h2>
                    <p className="opr2-section-sub">
                        Timezone and language. Affects how dates and numbers
                        are shown.
                    </p>

                    <div className="opr2-two-col">
                        <div className="opr2-field">
                            <label htmlFor="opr2-tz">Timezone</label>
                            <select id="opr2-tz" defaultValue="auto" disabled>
                                <option value="auto">
                                    Auto-detect from browser
                                </option>
                            </select>
                            <p className="opr2-field-note">
                                Your browser&apos;s timezone is used for
                                dates and digests. A per-profile override
                                lands with the Settings page.
                            </p>
                        </div>

                        <div className="opr2-field">
                            <label htmlFor="opr2-lang">Language</label>
                            <select id="opr2-lang" defaultValue="en-GB" disabled>
                                <option value="en-GB">
                                    British English — programme, colour,
                                    organised
                                </option>
                            </select>
                            <p className="opr2-field-note">
                                British English is the only voice today.
                                Other locales ship with the Settings page.
                            </p>
                        </div>
                    </div>
                </section>

                {error ? (
                    <div className="opr2-error" role="alert">
                        {error}
                    </div>
                ) : null}
            </div>

            <div
                className="opr2-foot-bar"
                role="navigation"
                aria-label="Onboarding step controls"
            >
                <div className="opr2-foot-meta">
                    Step 6 of 7 · Change any of this in Settings later
                </div>
                <Link
                    href="/onboarding/integrations"
                    className="opr2-btn-back"
                >
                    ← Back
                </Link>
                <button
                    type="button"
                    className="opr2-btn-next"
                    onClick={handleContinue}
                    disabled={isPending}
                >
                    {isPending ? "Saving…" : "Continue →"}
                </button>
            </div>
        </div>
    )
}

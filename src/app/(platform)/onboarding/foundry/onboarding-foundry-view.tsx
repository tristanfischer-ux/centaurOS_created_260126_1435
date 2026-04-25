/**
 * OnboardingFoundryView — Client component for /onboarding/foundry (Step 2 of 7).
 *
 * Mockup-faithful port of FORGE-MOCKUP-ONBOARD-FOUNDRY.html. The form lets
 * a newly-signed-up founder name the foundry they own, pick an industry,
 * declare team size, and optionally set a country + fiscal-year-start.
 *
 * Honest empty-state policy:
 *   - Headquarters country and fiscal-year-start have NO column on `foundries`
 *     today. They are captured on `profiles.onboarding_data` so the input
 *     still persists somewhere until a schema change catches up. The help
 *     copy below each field names that placement so nothing reads as magic.
 *   - The "change slug once" affordance from the mockup isn't wired to a
 *     DB flag yet — we surface the rule in help copy but don't enforce it.
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

import {
    createFoundryFromOnboarding,
    type FoundryOnboardingInput,
    type FoundryOnboardingRole,
    type FoundryOnboardingTier,
} from "@/actions/foundry-onboarding"

import "./onboarding-foundry-v2.css"

// ─── Types ────────────────────────────────────────────────────────────

export interface OnboardingFoundryViewProps {
    /** Existing foundry display name to pre-fill (null for brand-new foundries). */
    initialName: string | null
    /** Existing slug to pre-fill (null when none yet). */
    initialSlug: string | null
    /** Existing industry tag to pre-fill. */
    initialIndustry: string | null
    /** Existing team-size bucket to pre-fill. */
    initialTier: FoundryOnboardingTier | null
    /** Role captured on the previous onboarding pass (or "Founder" default). */
    initialRole: FoundryOnboardingRole
    /** Country captured on onboarding_data. */
    initialCountry: string | null
    /** Fiscal-year-start captured on onboarding_data. */
    initialFiscalYearStart: string | null
    /** First name for the eyebrow / meta strip. Optional. */
    firstName?: string
}

// ─── Options (match the mockup exactly) ───────────────────────────────

const ROLE_OPTIONS: ReadonlyArray<FoundryOnboardingRole> = [
    "Founder",
    "CTO",
    "Head of ops",
    "Engineering lead",
    "Other",
]

const TIER_OPTIONS: ReadonlyArray<{ value: FoundryOnboardingTier; label: string }> = [
    { value: "solo", label: "Solo" },
    { value: "2-5", label: "2–5" },
    { value: "6-15", label: "6–15" },
    { value: "16+", label: "16+" },
]

const COUNTRY_OPTIONS: ReadonlyArray<string> = [
    "United Kingdom",
    "Germany",
    "United States",
    "Kenya",
    "Other",
]

const FISCAL_OPTIONS: ReadonlyArray<string> = [
    "April (default UK)",
    "January",
    "July",
    "October",
    "Other",
]

const INDUSTRY_OPTIONS: ReadonlyArray<string> = [
    "Hardware",
    "Consumer electronics",
    "Industrial / robotics",
    "Biotech / medical",
    "Agritech / food",
    "Cleantech / energy",
    "Mobility / transport",
    "Other",
]

// ─── Helpers ──────────────────────────────────────────────────────────

function slugify(raw: string): string {
    return raw
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50)
}

// ─── View ─────────────────────────────────────────────────────────────

export function OnboardingFoundryView({
    initialName,
    initialSlug,
    initialIndustry,
    initialTier,
    initialRole,
    initialCountry,
    initialFiscalYearStart,
}: OnboardingFoundryViewProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // ── State ───────────────────────────────────────────────────────
    const [name, setName] = useState<string>(initialName ?? "")
    const [slugTouched, setSlugTouched] = useState<boolean>(Boolean(initialSlug))
    const [slugValue, setSlugValue] = useState<string>(initialSlug ?? "")
    const [industry, setIndustry] = useState<string>(initialIndustry ?? "")
    const [tier, setTier] = useState<FoundryOnboardingTier>(initialTier ?? "solo")
    const [role, setRole] = useState<FoundryOnboardingRole>(initialRole)
    const [country, setCountry] = useState<string>(initialCountry ?? "United Kingdom")
    const [fiscalYearStart, setFiscalYearStart] = useState<string>(
        initialFiscalYearStart ?? "April (default UK)",
    )
    const [serverError, setServerError] = useState<string | null>(null)

    // INTENT: Slug auto-derives from name until the user types in the slug field.
    const effectiveSlug = useMemo<string>(() => {
        if (slugTouched) return slugValue
        return slugify(name)
    }, [slugTouched, slugValue, name])

    // ── Validation (inline, non-blocking until submit) ─────────────
    const nameError = name.trim().length === 0 ? "Foundry name is required." : null
    const slugError = effectiveSlug.length === 0 ? "URL slug is required." : null
    const industryError = industry.trim().length === 0 ? "Pick an industry." : null
    const canSubmit = !nameError && !slugError && !industryError && !isPending

    // ── Submit ─────────────────────────────────────────────────────
    const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
        event.preventDefault()
        if (!canSubmit) return
        setServerError(null)

        const payload: FoundryOnboardingInput = {
            name: name.trim(),
            slug: effectiveSlug,
            industry: industry.trim(),
            tier,
            role,
            headquartersCountry: country || null,
            fiscalYearStart: fiscalYearStart || null,
        }

        startTransition(async () => {
            const result = await createFoundryFromOnboarding(payload)
            if (!result.success) {
                setServerError(result.error ?? "Something went wrong. Please try again.")
                return
            }
            // DECISION: Onboarding step 3 (first product) doesn't exist yet, so we
            // land back on /today until the next page ships. Sidebar still shows
            // the onboarding progress stamp.
            router.push("/investors")
            router.refresh()
        })
    }

    // ── Render ─────────────────────────────────────────────────────
    return (
        <div className="ofn2">
            {/* Skip link top right */}
            <div className="ofn2-skip">
                <Link href="/investors">Skip setup →</Link>
            </div>

            <div className="ofn2-wrap">
                {/* Intro annotation — lifted directly from the mockup */}
                <div className="ofn2-annot">
                    <strong>Note — Step 2 of 7</strong>
                    Your foundry is the multi-tenancy boundary. Name and URL slug are mandatory.
                    Role and team size tune defaults (which views open by default, which
                    suggestions appear). Fiscal year is skippable — we can infer it from
                    Cash Burn data later.
                </div>

                <div className="ofn2-eyebrow">Getting Started · Step 2 of 7</div>
                <h1 className="ofn2-title">
                    <span className="ofn2-title-dot" aria-hidden="true" />
                    Your foundry
                </h1>
                <p className="ofn2-lead">
                    A foundry is where your product, engineering, cost, and cash live. It&apos;s the
                    tenant boundary — your team sees inside, no one else does.
                </p>

                <form
                    className="ofn2-grid"
                    onSubmit={handleSubmit}
                    noValidate
                    aria-describedby={serverError ? "ofn2-server-error" : undefined}
                >
                    {/* ─── Main form card ──────────────────────────── */}
                    <div className="ofn2-card">
                        {/* Foundry name */}
                        <div className="ofn2-field">
                            <label className="ofn2-label" htmlFor="ofn2-name">
                                Foundry name
                            </label>
                            <input
                                id="ofn2-name"
                                className="ofn2-input"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your company or project name"
                                aria-required="true"
                                aria-invalid={nameError != null && name.length > 0 ? "true" : "false"}
                                aria-describedby="ofn2-name-help"
                                maxLength={120}
                                autoComplete="organization"
                            />
                            <div className="ofn2-help" id="ofn2-name-help">
                                The display name shown to your team and partners. Usually your
                                company name.
                            </div>
                        </div>

                        {/* URL slug */}
                        <div className="ofn2-field">
                            <label className="ofn2-label" htmlFor="ofn2-slug">
                                URL slug
                            </label>
                            <div className="ofn2-url" aria-live="polite">
                                <span className="ofn2-url__stem">fractionalforge.app/</span>
                                <input
                                    id="ofn2-slug"
                                    className="ofn2-url__slug ofn2-input"
                                    style={{ border: "none", background: "transparent", padding: 0, height: "auto" }}
                                    type="text"
                                    value={effectiveSlug}
                                    onChange={(e) => {
                                        setSlugTouched(true)
                                        setSlugValue(slugify(e.target.value))
                                    }}
                                    placeholder="your-foundry"
                                    aria-required="true"
                                    aria-describedby="ofn2-slug-help"
                                    maxLength={50}
                                    spellCheck={false}
                                />
                            </div>
                            <div className="ofn2-help" id="ofn2-slug-help">
                                Lowercase, hyphens only. You can change this once.
                            </div>
                        </div>

                        {/* Your role */}
                        <div className="ofn2-field">
                            <span className="ofn2-label" id="ofn2-role-label">Your role</span>
                            <div
                                className="ofn2-pill-group"
                                role="radiogroup"
                                aria-labelledby="ofn2-role-label"
                            >
                                {ROLE_OPTIONS.map((option) => {
                                    const isSelected = role === option
                                    return (
                                        <button
                                            key={option}
                                            type="button"
                                            role="radio"
                                            aria-checked={isSelected}
                                            className={`ofn2-pill${isSelected ? " selected" : ""}`}
                                            onClick={() => setRole(option)}
                                        >
                                            {option}
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="ofn2-help">
                                Sets which pages open by default. Founders start on Today + Cash
                                Burn; engineering leads start on Forge.
                            </div>
                        </div>

                        {/* Team size */}
                        <div className="ofn2-field">
                            <span className="ofn2-label" id="ofn2-tier-label">Team size</span>
                            <div
                                className="ofn2-pill-group"
                                role="radiogroup"
                                aria-labelledby="ofn2-tier-label"
                            >
                                {TIER_OPTIONS.map((option) => {
                                    const isSelected = tier === option.value
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={isSelected}
                                            className={`ofn2-pill${isSelected ? " selected" : ""}`}
                                            onClick={() => setTier(option.value)}
                                        >
                                            {option.label}
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="ofn2-help">
                                Tunes which suggestions we surface — a solo founder doesn&apos;t need
                                delegation nudges yet.
                            </div>
                        </div>

                        {/* Industry — not in the mockup's explicit form fields, but */}
                        {/* `foundries.industry` is a real column and required for */}
                        {/* downstream filtering, so we surface it here in the same */}
                        {/* style as the other required fields. */}
                        <div className="ofn2-field">
                            <label className="ofn2-label" htmlFor="ofn2-industry">Industry</label>
                            <select
                                id="ofn2-industry"
                                className="ofn2-select"
                                value={industry}
                                onChange={(e) => setIndustry(e.target.value)}
                                aria-required="true"
                                aria-describedby="ofn2-industry-help"
                            >
                                <option value="" disabled>
                                    Pick the closest match
                                </option>
                                {INDUSTRY_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                            <div className="ofn2-help" id="ofn2-industry-help">
                                Tunes which marketplace shortlists, CAD components, and
                                specialist briefings we surface first. You can refine it later
                                in Settings.
                            </div>
                        </div>

                        {/* Two-column: HQ country + fiscal year start */}
                        <div className="ofn2-two-col">
                            <div className="ofn2-field">
                                <label className="ofn2-label" htmlFor="ofn2-country">
                                    Headquarters country
                                </label>
                                <select
                                    id="ofn2-country"
                                    className="ofn2-select"
                                    value={country}
                                    onChange={(e) => setCountry(e.target.value)}
                                    aria-describedby="ofn2-country-help"
                                >
                                    {COUNTRY_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                                <div className="ofn2-help" id="ofn2-country-help">
                                    Used for default currency (£) and regulation defaults (UKCA,
                                    CE marking, etc.). Saved to your onboarding profile until
                                    the foundry country column lands.
                                </div>
                            </div>

                            <div className="ofn2-field">
                                <label className="ofn2-label" htmlFor="ofn2-fiscal">
                                    Fiscal year start
                                    <span className="ofn2-optional"> · optional</span>
                                </label>
                                <select
                                    id="ofn2-fiscal"
                                    className="ofn2-select"
                                    value={fiscalYearStart}
                                    onChange={(e) => setFiscalYearStart(e.target.value)}
                                    aria-describedby="ofn2-fiscal-help"
                                >
                                    {FISCAL_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                                <div className="ofn2-help" id="ofn2-fiscal-help">
                                    Skippable — we&apos;ll derive this from your Xero account once
                                    connected.
                                </div>
                            </div>
                        </div>

                        {(nameError || slugError || industryError) && (name || slugTouched || industry) && (
                            <div className="ofn2-error" role="alert">
                                {nameError || slugError || industryError}
                            </div>
                        )}
                    </div>

                    {/* ─── Side card: why we ask ──────────────────── */}
                    <aside className="ofn2-side">
                        <h3>Why we ask</h3>

                        <div className="ofn2-side__item">
                            <span className="ofn2-side__k">Foundry name &amp; slug</span>
                            The foundry is the multi-tenancy boundary — every BOM, supplier,
                            and cost table is scoped to it. Separate companies get separate
                            foundries.
                        </div>

                        <div className="ofn2-side__item">
                            <span className="ofn2-side__k">Your role</span>
                            Different roles open on different pages. Founders see cash burn
                            first. Engineering leads see the Forge first. You can change this
                            any time.
                        </div>

                        <div className="ofn2-side__item">
                            <span className="ofn2-side__k">Team size</span>
                            Tunes which suggestions we surface. A two-person team doesn&apos;t
                            need &ldquo;delegate this to engineering&rdquo; nudges. A 20-person team does.
                        </div>

                        <div className="ofn2-side__item">
                            <span className="ofn2-side__k">Country</span>
                            Sets default currency, default regulatory checks (UKCA vs CE vs
                            FCC), and the suppliers we shortlist first.
                        </div>
                    </aside>

                    {/* ─── Sticky footer action bar ────────────────── */}
                    <div className="ofn2-foot">
                        <div className="ofn2-foot__meta">
                            Step 2 of 7 · You can change any of this later in Settings
                        </div>
                        {serverError && (
                            <div
                                className="ofn2-foot__error"
                                id="ofn2-server-error"
                                role="alert"
                            >
                                {serverError}
                            </div>
                        )}
                        <Link href="/welcome" className="ofn2-btn-cancel">
                            ← Back
                        </Link>
                        <button
                            type="submit"
                            className="ofn2-btn-next"
                            disabled={!canSubmit}
                            aria-disabled={!canSubmit}
                        >
                            {isPending ? "Saving…" : "Continue →"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

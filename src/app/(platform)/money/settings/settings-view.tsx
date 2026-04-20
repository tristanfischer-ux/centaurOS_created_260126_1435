/**
 * SettingsView — /money/settings, mockup-faithful port of
 * MONEY-MOCKUP-SETTINGS.html. Scoped to `.mst2`.
 *
 * DOM ported top-to-bottom: page head, save-changes button, title with
 * brand title-dot, sticky side-nav, and six form sections — General,
 * Alerts & thresholds, Specialists, Data & privacy, Billing & plan,
 * Advanced (danger). Each row carries its label + helper copy + the
 * real control wired to `money_settings`.
 *
 * Data contract (what persists today, via saveMoneySettings):
 *   - Reporting currency      → money_settings.currency
 *   - Fiscal year start       → money_settings.fiscal_year_start_month
 *   - Number format           → money_settings.number_format
 *   - Runway danger threshold → money_settings.runway_danger_weeks
 *   - Runway healthy threshold→ money_settings.runway_healthy_weeks
 *   - Large-expense alert     → money_settings.large_expense_threshold_cents
 *   - Variance alert          → money_settings.variance_alert_pct
 *   - Email digest            → money_settings.digest_schedule
 *   - Specialist toggles      → money_settings.specialists_enabled jsonb
 *   - Model tier              → money_settings.specialist_model_tier
 *   - Data retention          → money_settings.retention_years
 *
 * Fields on the mockup we do NOT persist yet — each renders with honest
 * chrome so the founder can see which rows are live:
 *   - Display style (compact vs full) — no column today.
 *   - Specialist Tone          — no column today.
 *   - Anonymised benchmarks    — no column today.
 *   - Export / reset / delete  — surfaces exist but actions land with
 *                                the settings audit PR. Buttons disabled.
 *   - Billing & plan block     — read-only, no Stripe wiring yet.
 */

"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"

import {
    saveMoneySettings,
    type DigestSchedule,
    type FiscalYearStartMonth,
    type MoneySettingsPatch,
    type MoneySettingsRow,
    type NumberFormatLocale,
    type ReportingCurrency,
    type SpecialistModelTier,
    type SpecialistsEnabled,
} from "@/actions/money-settings"

import "./mst2.css"

// ─── Section anchors (side-nav) ────────────────────────────────────────

interface SectionLink {
    id: string
    label: string
}

const SECTION_LINKS: ReadonlyArray<SectionLink> = [
    { id: "general", label: "General" },
    { id: "alerts", label: "Alerts & thresholds" },
    { id: "specialists", label: "Specialists" },
    { id: "data", label: "Data & privacy" },
    { id: "billing", label: "Billing & plan" },
    { id: "danger", label: "Advanced" },
]

// ─── Copy (from mockup) ────────────────────────────────────────────────

interface CurrencyOption {
    value: ReportingCurrency
    label: string
}
const CURRENCY_OPTIONS: ReadonlyArray<CurrencyOption> = [
    { value: "GBP", label: "GBP · £" },
    { value: "USD", label: "USD · $" },
    { value: "EUR", label: "EUR · €" },
]

interface FiscalYearOption {
    value: FiscalYearStartMonth
    label: string
}
const FISCAL_YEAR_OPTIONS: ReadonlyArray<FiscalYearOption> = [
    { value: 4, label: "6 April (UK default)" },
    { value: 1, label: "1 January" },
    { value: 7, label: "1 July" },
    { value: 10, label: "1 October" },
]

interface NumberFormatOption {
    value: NumberFormatLocale
    label: string
}
const NUMBER_FORMAT_OPTIONS: ReadonlyArray<NumberFormatOption> = [
    { value: "en-GB", label: "1,234.56 (UK/US)" },
    { value: "de-DE", label: "1.234,56 (EU)" },
    { value: "fr-FR", label: "1 234,56 (FR)" },
]

interface DigestOption {
    value: DigestSchedule
    label: string
}
const DIGEST_OPTIONS: ReadonlyArray<DigestOption> = [
    { value: "weekly_mon_09", label: "Monday 09:00 BST" },
    { value: "daily", label: "Daily" },
    { value: "off", label: "Off" },
]

interface ModelTierOption {
    value: SpecialistModelTier
    label: string
}
const MODEL_TIER_OPTIONS: ReadonlyArray<ModelTierOption> = [
    { value: "haiku", label: "Standard (Haiku · fast)" },
    { value: "sonnet", label: "Quality (Sonnet · balanced)" },
    { value: "opus", label: "Deep (Opus · slowest)" },
]

interface RetentionOption {
    value: number
    label: string
}
const RETENTION_OPTIONS: ReadonlyArray<RetentionOption> = [
    { value: 1, label: "1 year" },
    { value: 3, label: "3 years" },
    { value: 7, label: "7 years (UK statutory)" },
    { value: 100, label: "Forever" },
]

// ─── Props ─────────────────────────────────────────────────────────────

export interface SettingsViewProps {
    /** Row loaded server-side. Never null — defaults populate missing rows. */
    initialSettings: MoneySettingsRow
}

// ─── Component ─────────────────────────────────────────────────────────

export function SettingsView({
    initialSettings,
}: SettingsViewProps): React.ReactElement {
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // Form state — mirrors the row columns 1:1 so `.save()` just
    // snapshots the current state into a patch.
    const [currency, setCurrency] = useState<ReportingCurrency>(
        (initialSettings.currency as ReportingCurrency) ?? "GBP",
    )
    const [fiscalMonth, setFiscalMonth] = useState<FiscalYearStartMonth>(
        (initialSettings.fiscal_year_start_month as FiscalYearStartMonth) ?? 4,
    )
    const [numberFormat, setNumberFormat] = useState<NumberFormatLocale>(
        (initialSettings.number_format as NumberFormatLocale) ?? "en-GB",
    )
    const [runwayDanger, setRunwayDanger] = useState<string>(
        String(initialSettings.runway_danger_weeks),
    )
    const [runwayHealthy, setRunwayHealthy] = useState<string>(
        String(initialSettings.runway_healthy_weeks),
    )
    // Stored as pence on the row; shown as whole pounds in the input.
    const [largeExpensePounds, setLargeExpensePounds] = useState<string>(
        String(
            Math.max(
                0,
                Math.round(initialSettings.large_expense_threshold_cents / 100),
            ),
        ),
    )
    const [variancePct, setVariancePct] = useState<string>(
        String(initialSettings.variance_alert_pct),
    )
    const [digest, setDigest] = useState<DigestSchedule>(
        (initialSettings.digest_schedule as DigestSchedule) ?? "weekly_mon_09",
    )
    const [specialists, setSpecialists] = useState<SpecialistsEnabled>({
        finn: initialSettings.specialists_enabled.finn,
        fiona: initialSettings.specialists_enabled.fiona,
        harper: initialSettings.specialists_enabled.harper,
        leo: initialSettings.specialists_enabled.leo,
    })
    const [modelTier, setModelTier] = useState<SpecialistModelTier>(
        (initialSettings.specialist_model_tier as SpecialistModelTier) ??
            "sonnet",
    )
    const [retention, setRetention] = useState<string>(
        String(initialSettings.retention_years),
    )

    const isDirty = useMemo<boolean>(() => {
        return (
            currency !== initialSettings.currency ||
            fiscalMonth !== initialSettings.fiscal_year_start_month ||
            numberFormat !== initialSettings.number_format ||
            parseInt(runwayDanger, 10) !==
                initialSettings.runway_danger_weeks ||
            parseInt(runwayHealthy, 10) !==
                initialSettings.runway_healthy_weeks ||
            parseInt(largeExpensePounds, 10) * 100 !==
                initialSettings.large_expense_threshold_cents ||
            parseInt(variancePct, 10) !==
                initialSettings.variance_alert_pct ||
            digest !== initialSettings.digest_schedule ||
            specialists.finn !==
                initialSettings.specialists_enabled.finn ||
            specialists.fiona !==
                initialSettings.specialists_enabled.fiona ||
            specialists.harper !==
                initialSettings.specialists_enabled.harper ||
            specialists.leo !==
                initialSettings.specialists_enabled.leo ||
            modelTier !== initialSettings.specialist_model_tier ||
            parseInt(retention, 10) !== initialSettings.retention_years
        )
    }, [
        currency,
        fiscalMonth,
        numberFormat,
        runwayDanger,
        runwayHealthy,
        largeExpensePounds,
        variancePct,
        digest,
        specialists,
        modelTier,
        retention,
        initialSettings,
    ])

    const handleToggle = (key: keyof SpecialistsEnabled): void => {
        setSpecialists((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    const handleSave = (): void => {
        setError(null)
        setSuccess(null)

        const runwayDangerN = parseInt(runwayDanger, 10)
        const runwayHealthyN = parseInt(runwayHealthy, 10)
        const largeExpenseN = parseInt(largeExpensePounds, 10)
        const varianceN = parseInt(variancePct, 10)
        const retentionN = parseInt(retention, 10)

        if (
            Number.isNaN(runwayDangerN) ||
            Number.isNaN(runwayHealthyN) ||
            Number.isNaN(largeExpenseN) ||
            Number.isNaN(varianceN) ||
            Number.isNaN(retentionN)
        ) {
            setError("Numeric thresholds must be whole numbers.")
            return
        }
        if (runwayHealthyN < runwayDangerN) {
            setError(
                "Healthy runway threshold must be at least the danger threshold.",
            )
            return
        }

        const patch: MoneySettingsPatch = {
            currency,
            fiscal_year_start_month: fiscalMonth,
            number_format: numberFormat,
            runway_danger_weeks: runwayDangerN,
            runway_healthy_weeks: runwayHealthyN,
            large_expense_threshold_cents: largeExpenseN * 100,
            variance_alert_pct: varianceN,
            digest_schedule: digest,
            specialists_enabled: specialists,
            specialist_model_tier: modelTier,
            retention_years: retentionN,
        }

        startTransition(async () => {
            const result = await saveMoneySettings(patch)
            if ("error" in result) {
                setError(result.error)
                return
            }
            setSuccess("Saved. Changes apply across Cockpit, Plan, and Raise.")
        })
    }

    return (
        <div className="mst2">
            {/* ── Breadcrumbs + primary action ─────────────────────── */}
            <div className="mst2-page-head">
                <div className="mst2-crumbs">
                    <Link href="/money/cockpit">Money</Link>
                    <span className="sep">›</span>
                    <span className="current">Settings</span>
                </div>
                <div className="mst2-ctx-chips">
                    <button
                        type="button"
                        className="mst2-btn mst2-btn-primary"
                        onClick={handleSave}
                        disabled={!isDirty || isPending}
                    >
                        {isPending ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </div>

            {/* ── Title tile ───────────────────────────────────────── */}
            <div className="mst2-head">
                <h1>
                    <span
                        className="mst2-title-dot"
                        aria-hidden="true"
                    />
                    Money settings
                </h1>
                <div className="mst2-sub">
                    Foundry-wide defaults. Changes affect every user and
                    every view in Cockpit, Plan, and Raise.
                </div>
            </div>

            {isDirty && !isPending ? (
                <div className="mst2-save-banner" role="status">
                    <strong>Unsaved changes</strong>
                    <span>
                        Save to apply new thresholds, specialist toggles, and
                        defaults.
                    </span>
                    <div className="mst2-save-banner-actions">
                        <button
                            type="button"
                            className="mst2-btn mst2-btn-primary"
                            onClick={handleSave}
                            disabled={isPending}
                        >
                            Save now
                        </button>
                    </div>
                </div>
            ) : null}

            {error ? (
                <div className="mst2-alert mst2-alert-error" role="alert">
                    {error}
                </div>
            ) : null}
            {success ? (
                <div
                    className="mst2-alert mst2-alert-success"
                    role="status"
                >
                    {success}
                </div>
            ) : null}

            {/* ── Grid: side-nav + form column ─────────────────────── */}
            <div className="mst2-grid">
                <nav className="mst2-side" aria-label="Settings sections">
                    {SECTION_LINKS.map((link, index) => (
                        <a
                            key={link.id}
                            href={`#${link.id}`}
                            className={index === 0 ? "active" : undefined}
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>

                <div>
                    {/* ── GENERAL ─────────────────────────────────── */}
                    <section className="mst2-section" id="general">
                        <h3>General</h3>
                        <div className="mst2-section-sub">
                            Currency, fiscal year, and how dates and numbers
                            display.
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Reporting currency
                                <small>
                                    Used everywhere — Cockpit, Plan, P&amp;L,
                                    investor updates. Transactions in other
                                    currencies convert at the day&apos;s rate.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <select
                                    value={currency}
                                    onChange={(e) =>
                                        setCurrency(
                                            e.target.value as ReportingCurrency,
                                        )
                                    }
                                    aria-label="Reporting currency"
                                >
                                    {CURRENCY_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Fiscal year start
                                <small>
                                    Affects annual P&amp;L and VAT quarter
                                    alignment.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <select
                                    value={fiscalMonth}
                                    onChange={(e) =>
                                        setFiscalMonth(
                                            Number(
                                                e.target.value,
                                            ) as FiscalYearStartMonth,
                                        )
                                    }
                                    aria-label="Fiscal year start"
                                >
                                    {FISCAL_YEAR_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Number format
                                <small>
                                    Thousands and decimal separators.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <select
                                    value={numberFormat}
                                    onChange={(e) =>
                                        setNumberFormat(
                                            e.target
                                                .value as NumberFormatLocale,
                                        )
                                    }
                                    aria-label="Number format"
                                >
                                    {NUMBER_FORMAT_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Display style
                                <small>
                                    How amounts render in lists and charts.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <select
                                    defaultValue="compact"
                                    disabled
                                    aria-label="Display style"
                                >
                                    <option value="compact">
                                        Compact (£34k, £2.4M)
                                    </option>
                                    <option value="full">
                                        Full (£34,220 · £2,400,000)
                                    </option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* ── ALERTS ──────────────────────────────────── */}
                    <section className="mst2-section" id="alerts">
                        <h3>Alerts &amp; thresholds</h3>
                        <div className="mst2-section-sub">
                            When ForgeOS flags something on Cockpit or sends
                            notifications.
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Runway danger threshold
                                <small>
                                    Cockpit shows a red tag if runway drops
                                    below this. Founders often set 13 weeks
                                    (1 quarter).
                                </small>
                            </div>
                            <div className="mst2-ctrl mst2-threshold">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={runwayDanger}
                                    onChange={(e) =>
                                        setRunwayDanger(e.target.value)
                                    }
                                    aria-label="Runway danger threshold in weeks"
                                />
                                <span className="mst2-unit">weeks</span>
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Runway healthy threshold
                                <small>
                                    Cockpit shows a green tag above this.
                                </small>
                            </div>
                            <div className="mst2-ctrl mst2-threshold">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={runwayHealthy}
                                    onChange={(e) =>
                                        setRunwayHealthy(e.target.value)
                                    }
                                    aria-label="Runway healthy threshold in weeks"
                                />
                                <span className="mst2-unit">weeks</span>
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Large expense alert
                                <small>
                                    Prompts co-founder awareness for one-off
                                    expenses over this amount.
                                </small>
                            </div>
                            <div className="mst2-ctrl mst2-threshold">
                                <span className="mst2-prefix">£</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={largeExpensePounds}
                                    onChange={(e) =>
                                        setLargeExpensePounds(e.target.value)
                                    }
                                    aria-label="Large expense alert in pounds"
                                />
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Variance alert threshold
                                <small>
                                    Finn flags a month if actuals overrun
                                    plan by more than this.
                                </small>
                            </div>
                            <div className="mst2-ctrl mst2-threshold">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={variancePct}
                                    onChange={(e) =>
                                        setVariancePct(e.target.value)
                                    }
                                    aria-label="Variance alert percent"
                                />
                                <span className="mst2-unit">% over</span>
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Email digest
                                <small>
                                    Weekly summary of runway, new variance,
                                    pipeline changes.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <select
                                    value={digest}
                                    onChange={(e) =>
                                        setDigest(
                                            e.target.value as DigestSchedule,
                                        )
                                    }
                                    aria-label="Email digest schedule"
                                >
                                    {DIGEST_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* ── SPECIALISTS ─────────────────────────────── */}
                    <section className="mst2-section" id="specialists">
                        <h3>Specialists</h3>
                        <div className="mst2-section-sub">
                            Control how Finn (finance), Fiona (fundraise),
                            Harper (HR), and Leo (legal) appear in Money.
                            Turning one off keeps their surface plainer and
                            reduces specialist credits used.
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Finn callouts on Cockpit &amp; Plan
                                <small>
                                    Monthly diagnoses, variance explanations,
                                    runway commentary.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <SpecialistToggle
                                    label="Finn callouts"
                                    value={specialists.finn}
                                    onChange={() => handleToggle("finn")}
                                />
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Fiona pre-briefs on Raise
                                <small>
                                    Before-meeting context and suggested
                                    next actions for each investor.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <SpecialistToggle
                                    label="Fiona pre-briefs"
                                    value={specialists.fiona}
                                    onChange={() => handleToggle("fiona")}
                                />
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Harper HR suggestions
                                <small>
                                    On cost lines affecting people (payroll,
                                    hire timing).
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <SpecialistToggle
                                    label="Harper HR suggestions"
                                    value={specialists.harper}
                                    onChange={() => handleToggle("harper")}
                                />
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Leo legal flags
                                <small>
                                    Tax dates, compliance deadlines, SAFE
                                    terms.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <SpecialistToggle
                                    label="Leo legal flags"
                                    value={specialists.leo}
                                    onChange={() => handleToggle("leo")}
                                />
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Tone
                                <small>
                                    How specialists phrase their suggestions.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <select
                                    defaultValue="direct_british"
                                    disabled
                                    aria-label="Specialist tone"
                                >
                                    <option value="direct_british">
                                        Direct · British
                                    </option>
                                </select>
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Model tier
                                <small>
                                    Higher tier gives better analysis and
                                    uses more credits. Your plan includes
                                    500 credits each month.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <select
                                    value={modelTier}
                                    onChange={(e) =>
                                        setModelTier(
                                            e.target
                                                .value as SpecialistModelTier,
                                        )
                                    }
                                    aria-label="Specialist model tier"
                                >
                                    {MODEL_TIER_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* ── DATA & PRIVACY ──────────────────────────── */}
                    <section className="mst2-section" id="data">
                        <h3>Data &amp; privacy</h3>
                        <div className="mst2-section-sub">
                            How your financial data is handled, stored, and
                            (optionally) contributed to aggregate benchmarks.
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Contribute anonymised benchmarks
                                <small>
                                    Anonymised burn and revenue figures help
                                    other UK pre-seed hardware founders
                                    benchmark. No identifying data leaves
                                    your foundry. (Preview — not yet wired.)
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <button
                                    type="button"
                                    className="mst2-toggle"
                                    aria-pressed="false"
                                    aria-label="Contribute anonymised benchmarks"
                                    disabled
                                />
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Data retention
                                <small>
                                    How long ForgeOS retains audit logs and
                                    archived touches.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <select
                                    value={retention}
                                    onChange={(e) =>
                                        setRetention(e.target.value)
                                    }
                                    aria-label="Data retention"
                                >
                                    {RETENTION_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Export &amp; delete
                                <small>
                                    Download all your Money data as JSON +
                                    CSV, or request full deletion. (Lands
                                    with the audit log surface.)
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <button
                                    type="button"
                                    className="mst2-btn"
                                    disabled
                                >
                                    Request export
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* ── BILLING ─────────────────────────────────── */}
                    <section className="mst2-section" id="billing">
                        <h3>Billing &amp; plan</h3>
                        <div className="mst2-section-sub">
                            ForgeOS subscription for this foundry. Controlled
                            at the account level, not per user.
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Plan
                                <small>
                                    Managed under Settings &rsaquo; Billing.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <Link
                                    href="/settings/billing"
                                    className="mst2-btn"
                                >
                                    Open billing
                                </Link>
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Usage this month
                                <small>
                                    Specialist credit usage is surfaced on
                                    the Money Cockpit once metering lands.
                                </small>
                            </div>
                            <div className="mst2-ctrl mst2-meta">
                                Coming with Cockpit ledger
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Next invoice
                                <small>
                                    Stripe manages renewals — the invoice
                                    date is shown on the Billing page.
                                </small>
                            </div>
                            <div className="mst2-ctrl mst2-meta">
                                See Settings &rsaquo; Billing
                            </div>
                        </div>
                    </section>

                    {/* ── DANGER ──────────────────────────────────── */}
                    <section className="mst2-danger" id="danger">
                        <h3>Advanced · irreversible</h3>
                        <div className="mst2-section-sub">
                            Actions that cannot be undone easily. Each
                            action prompts for password confirmation when
                            wired.
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Reset Money data
                                <small>
                                    Wipe all Plan, Scenarios, Investors, and
                                    Pitch data. Keep the foundry, Workshop,
                                    and Team. Requires password.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <button
                                    type="button"
                                    className="mst2-btn mst2-btn-danger-outline"
                                    disabled
                                >
                                    Reset Money…
                                </button>
                            </div>
                        </div>

                        <div className="mst2-row">
                            <div className="mst2-lab">
                                Delete foundry
                                <small>
                                    Permanent. All users lose access. A
                                    14-day grace period allows undo.
                                </small>
                            </div>
                            <div className="mst2-ctrl">
                                <button
                                    type="button"
                                    className="mst2-btn mst2-btn-danger-outline"
                                    disabled
                                >
                                    Delete foundry…
                                </button>
                            </div>
                        </div>
                    </section>

                    <div className="mst2-note">
                        <strong>How these settings behave</strong>
                        Thresholds drive conditional rendering on the Money
                        Cockpit (tag colours) and the variance alert that
                        Finn raises on Plan. Specialist toggles gate
                        server-side briefings per call — turning one off
                        hides that surface across Money without touching
                        the rest of the Forge.
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Small internal toggle component ───────────────────────────────────

interface SpecialistToggleProps {
    label: string
    value: boolean
    onChange: () => void
}

function SpecialistToggle({
    label,
    value,
    onChange,
}: SpecialistToggleProps): React.ReactElement {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={value}
            aria-label={label}
            onClick={onChange}
            className={`mst2-toggle ${value ? "mst2-on" : ""}`}
        />
    )
}

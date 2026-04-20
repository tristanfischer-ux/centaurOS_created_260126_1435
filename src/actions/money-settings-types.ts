/**
 * @file money-settings-types.ts — Type definitions for money settings.
 *
 * Split out from money-settings.ts because Next.js "use server" files
 * can ONLY export async functions. Types, interfaces, and consts live
 * here so consumers (server action + view) can both import them.
 */

/** ISO 4217 currency codes supported by the form. */
export type ReportingCurrency = "GBP" | "USD" | "EUR"

/** 1–12 (month index) — UK default is 4 (April). */
export type FiscalYearStartMonth = 1 | 4 | 7 | 10

/** BCP 47 locale codes supported by the form. */
export type NumberFormatLocale = "en-GB" | "de-DE" | "fr-FR"

/** Digest cadence — `weekly_mon_09` is the default. */
export type DigestSchedule = "weekly_mon_09" | "daily" | "off"

/** Claude model tier gating specialist quality vs cost. */
export type SpecialistModelTier = "haiku" | "sonnet" | "opus"

/**
 * Shape of the `specialists_enabled` jsonb bag — one boolean per Money
 * specialist. Matches the mockup's toggles.
 */
export interface SpecialistsEnabled {
    finn: boolean
    fiona: boolean
    harper: boolean
    leo: boolean
}

/**
 * Patch accepted by `saveMoneySettings`. Every field is optional so the
 * view can submit partial updates without first re-reading the whole row.
 */
export interface MoneySettingsPatch {
    currency?: ReportingCurrency
    fiscal_year_start_month?: FiscalYearStartMonth
    number_format?: NumberFormatLocale
    runway_danger_weeks?: number
    runway_healthy_weeks?: number
    large_expense_threshold_cents?: number
    variance_alert_pct?: number
    digest_schedule?: DigestSchedule
    specialists_enabled?: SpecialistsEnabled
    specialist_model_tier?: SpecialistModelTier
    retention_years?: number
}

/**
 * Full `money_settings` row as exposed to the client. Mirrors the
 * database columns but narrows the enum-like text columns to known
 * literal unions where possible.
 */
export interface MoneySettingsRow {
    foundry_id: string
    currency: string
    fiscal_year_start_month: number
    number_format: string
    runway_danger_weeks: number
    runway_healthy_weeks: number
    large_expense_threshold_cents: number
    variance_alert_pct: number
    digest_schedule: string
    specialists_enabled: SpecialistsEnabled
    specialist_model_tier: string
    retention_years: number
}

/**
 * Sensible defaults per MONEY-SCHEMA.md §2 `money_settings`. Used when no
 * row exists for the current foundry yet — the view never shows "empty"
 * controls, it shows the defaults.
 */
export const DEFAULT_MONEY_SETTINGS = {
    currency: "GBP",
    fiscal_year_start_month: 4,
    number_format: "en-GB",
    runway_danger_weeks: 13,
    runway_healthy_weeks: 18,
    large_expense_threshold_cents: 50_000,
    variance_alert_pct: 10,
    digest_schedule: "weekly_mon_09",
    specialists_enabled: { finn: true, fiona: true, harper: true, leo: true },
    specialist_model_tier: "sonnet",
    retention_years: 7,
} as const satisfies Omit<MoneySettingsRow, "foundry_id">

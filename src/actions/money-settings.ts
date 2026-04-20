/**
 * @file money-settings.ts — Server actions for /money/settings.
 *
 * @description Read + write for the foundry-scoped `money_settings` row.
 * One row per foundry — the row is upserted on first save so new foundries
 * can land on the page before anybody's touched settings. All numeric
 * thresholds are stored as plain integers (weeks, percent, cents).
 *
 * @security Uses `withAuth` for tenant-scoped writes. The RLS policy on
 * `money_settings` should permit founder/co_founder only, but we also
 * derive the foundry_id from the authenticated session and never trust
 * a client-supplied foundry_id.
 *
 * @related
 *   - Table:  public.money_settings (see database.types.ts line 13068)
 *   - View:   src/app/(platform)/money/settings/settings-view.tsx
 *   - Page:   src/app/(platform)/money/settings/page.tsx
 *   - Schema: MONEY-SCHEMA.md §2 `money_settings`
 */

"use server"

import { revalidatePath } from "next/cache"

import { withAuth } from "@/lib/server-action-utils"
import type {
    DigestSchedule,
    FiscalYearStartMonth,
    MoneySettingsPatch,
    MoneySettingsRow,
    NumberFormatLocale,
    ReportingCurrency,
    SpecialistModelTier,
    SpecialistsEnabled,
} from "./money-settings-types"
import { DEFAULT_MONEY_SETTINGS } from "./money-settings-types"

// ─── Validation helpers ────────────────────────────────────────────────

const VALID_CURRENCIES: ReadonlySet<string> = new Set([
    "GBP",
    "USD",
    "EUR",
])
const VALID_FY_MONTHS: ReadonlySet<number> = new Set([1, 4, 7, 10])
const VALID_NUMBER_FORMATS: ReadonlySet<string> = new Set([
    "en-GB",
    "de-DE",
    "fr-FR",
])
const VALID_DIGEST: ReadonlySet<string> = new Set([
    "weekly_mon_09",
    "daily",
    "off",
])
const VALID_MODEL_TIERS: ReadonlySet<string> = new Set([
    "haiku",
    "sonnet",
    "opus",
])
const VALID_RETENTION_YEARS: ReadonlySet<number> = new Set([1, 3, 7, 100])

function isPositiveInt(value: number, max = 520): boolean {
    return Number.isInteger(value) && value >= 0 && value <= max
}

function isPercent(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 100
}

// ─── Actions ───────────────────────────────────────────────────────────

/**
 * Load the current foundry's `money_settings` row, or the defaults if no
 * row exists yet. Returns a fully-populated object so the view never
 * needs to null-check individual fields.
 */
export async function loadMoneySettings(): Promise<
    { settings: MoneySettingsRow } | { error: string }
> {
    return withAuth(async ({ supabase, foundryId }) => {
        const { data, error } = await supabase
            .from("money_settings")
            .select(
                "foundry_id, currency, fiscal_year_start_month, number_format, runway_danger_weeks, runway_healthy_weeks, large_expense_threshold_cents, variance_alert_pct, digest_schedule, specialists_enabled, specialist_model_tier, retention_years",
            )
            .eq("foundry_id", foundryId)
            .maybeSingle()

        if (error) {
            console.error("[money-settings] load failed", {
                foundryId,
                error: error.message,
            })
            return { error: "Could not load Money settings." }
        }

        if (!data) {
            return {
                settings: {
                    foundry_id: foundryId,
                    ...DEFAULT_MONEY_SETTINGS,
                } satisfies MoneySettingsRow,
            }
        }

        // `specialists_enabled` is stored as `Json` on the row but we
        // rely on the DB default + the save path to keep the shape
        // honest. Narrow defensively so the view never crashes.
        const specialists = normaliseSpecialists(data.specialists_enabled)

        return {
            settings: {
                foundry_id: data.foundry_id,
                currency: data.currency,
                fiscal_year_start_month: data.fiscal_year_start_month,
                number_format: data.number_format,
                runway_danger_weeks: data.runway_danger_weeks,
                runway_healthy_weeks: data.runway_healthy_weeks,
                large_expense_threshold_cents:
                    data.large_expense_threshold_cents,
                variance_alert_pct: data.variance_alert_pct,
                digest_schedule: data.digest_schedule,
                specialists_enabled: specialists,
                specialist_model_tier: data.specialist_model_tier,
                retention_years: data.retention_years,
            } satisfies MoneySettingsRow,
        }
    })
}

/**
 * Save a patch against the current foundry's `money_settings` row.
 * Upserts so a brand-new foundry lands a row on first save; subsequent
 * saves merge partial patches into the existing row.
 *
 * @throws Returns `{ error }` — callers handle the string. Never throws.
 */
export async function saveMoneySettings(
    patch: MoneySettingsPatch,
): Promise<{ success: true } | { error: string }> {
    // VALIDATION: reject bad enum values up front so the row cannot
    // land in a state the view does not know how to render.
    if (patch.currency && !VALID_CURRENCIES.has(patch.currency)) {
        return { error: `Unknown currency: ${patch.currency}` }
    }
    if (
        patch.fiscal_year_start_month !== undefined &&
        !VALID_FY_MONTHS.has(patch.fiscal_year_start_month)
    ) {
        return {
            error: `Unknown fiscal year start month: ${patch.fiscal_year_start_month}`,
        }
    }
    if (
        patch.number_format &&
        !VALID_NUMBER_FORMATS.has(patch.number_format)
    ) {
        return { error: `Unknown number format: ${patch.number_format}` }
    }
    if (patch.digest_schedule && !VALID_DIGEST.has(patch.digest_schedule)) {
        return { error: `Unknown digest schedule: ${patch.digest_schedule}` }
    }
    if (
        patch.specialist_model_tier &&
        !VALID_MODEL_TIERS.has(patch.specialist_model_tier)
    ) {
        return {
            error: `Unknown model tier: ${patch.specialist_model_tier}`,
        }
    }
    if (
        patch.runway_danger_weeks !== undefined &&
        !isPositiveInt(patch.runway_danger_weeks)
    ) {
        return { error: "Runway danger threshold must be 0–520 weeks." }
    }
    if (
        patch.runway_healthy_weeks !== undefined &&
        !isPositiveInt(patch.runway_healthy_weeks)
    ) {
        return { error: "Runway healthy threshold must be 0–520 weeks." }
    }
    if (
        patch.large_expense_threshold_cents !== undefined &&
        !isPositiveInt(
            patch.large_expense_threshold_cents,
            1_000_000_000,
        )
    ) {
        return { error: "Large expense threshold must be a positive amount." }
    }
    if (
        patch.variance_alert_pct !== undefined &&
        !isPercent(patch.variance_alert_pct)
    ) {
        return { error: "Variance alert must be 0–100%." }
    }
    if (
        patch.retention_years !== undefined &&
        !VALID_RETENTION_YEARS.has(patch.retention_years)
    ) {
        return {
            error: `Unknown retention period: ${patch.retention_years}`,
        }
    }

    return withAuth(async ({ supabase, foundryId }) => {
        // NOTE: `specialists_enabled` on the generated Supabase `Json`
        // type requires an index signature we do not want to put on
        // the public `SpecialistsEnabled` interface (callers rely on
        // named keys, not string-keyed lookups). The Json cast is
        // narrow and only applied to that one field.
        const rowWithJson: Record<string, unknown> = {
            foundry_id: foundryId,
            ...patch,
        }
        if (patch.specialists_enabled) {
            rowWithJson.specialists_enabled = {
                ...patch.specialists_enabled,
            }
        }

        const { error } = await supabase
            .from("money_settings")
            .upsert(rowWithJson as never, { onConflict: "foundry_id" })

        if (error) {
            console.error("[money-settings] save failed", {
                foundryId,
                error: error.message,
            })
            return { error: "Could not save Money settings. Please try again." }
        }

        revalidatePath("/money/settings")
        return { success: true }
    })
}

// ─── Internal ──────────────────────────────────────────────────────────

/**
 * Coerce a `Json` value back into `SpecialistsEnabled`. The DB default
 * is the canonical shape; any drift is treated as "all on" so we never
 * silently disable a specialist because of a broken row.
 */
function normaliseSpecialists(value: unknown): SpecialistsEnabled {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return DEFAULT_MONEY_SETTINGS.specialists_enabled
    }
    const v = value as Record<string, unknown>
    return {
        finn: v.finn === false ? false : true,
        fiona: v.fiona === false ? false : true,
        harper: v.harper === false ? false : true,
        leo: v.leo === false ? false : true,
    }
}

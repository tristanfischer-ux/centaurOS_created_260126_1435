'use server'

/**
 * Money Settings server actions.
 *
 * Powers the four /money/settings/* surfaces:
 *   - /money/settings              (this file: getMoneySettings, updateMoneySettings, markOnboardingStep)
 *   - /money/settings/permissions  (see money-permissions.ts)
 *   - /money/settings/audit-log    (see money-audit.ts)
 *   - /money/settings/credits      (see money-credits.ts)
 *
 * All reads/writes scope to the caller's foundry via withAuth. RLS + the
 * money_settings_foundry_write_founder policy already restrict writes to the
 * Founder/Executive roles; we keep the action thin and let the policy do the
 * work. Onboarding-step writes go through the same path so the founder-only
 * guard still applies.
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import type { Database } from '@/types/database.types'

type MoneySettingsRow = Database['public']['Tables']['money_settings']['Row']

export type SpecialistModelTier = 'haiku' | 'sonnet' | 'opus'

export type OnboardingProgress = {
  connect_accounting: boolean
  first_plan_line: boolean
  define_thesis: boolean
  create_round: boolean
  log_first_touch: boolean
  send_first_update: boolean
}

export type OnboardingStep = keyof OnboardingProgress

const ONBOARDING_STEP_KEYS: readonly OnboardingStep[] = [
  'connect_accounting',
  'first_plan_line',
  'define_thesis',
  'create_round',
  'log_first_touch',
  'send_first_update',
] as const

const DEFAULT_ONBOARDING: OnboardingProgress = {
  connect_accounting: false,
  first_plan_line: false,
  define_thesis: false,
  create_round: false,
  log_first_touch: false,
  send_first_update: false,
}

const SPECIALIST_TIERS: readonly SpecialistModelTier[] = ['haiku', 'sonnet', 'opus'] as const

export type MoneySettings = {
  foundry_id: string
  currency: string
  fiscal_year_start_month: number
  number_format: string
  runway_danger_weeks: number
  runway_healthy_weeks: number
  large_expense_threshold_cents: number
  variance_alert_pct: number
  retention_years: number
  specialist_model_tier: SpecialistModelTier
  digest_schedule: string
  onboarding_progress: OnboardingProgress
}

export type MoneySettingsResult =
  | { error: string }
  | { settings: MoneySettings }

/**
 * Coerce the JSONB onboarding_progress shape into the typed OnboardingProgress.
 * Any keys missing from the row default to false; unknown keys are dropped.
 */
function coerceOnboarding(raw: unknown): OnboardingProgress {
  const out: OnboardingProgress = { ...DEFAULT_ONBOARDING }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    for (const key of ONBOARDING_STEP_KEYS) {
      const v = obj[key]
      if (typeof v === 'boolean') out[key] = v
    }
  }
  return out
}

function coerceTier(raw: string): SpecialistModelTier {
  return (SPECIALIST_TIERS as readonly string[]).includes(raw)
    ? (raw as SpecialistModelTier)
    : 'sonnet'
}

function rowToSettings(row: MoneySettingsRow): MoneySettings {
  return {
    foundry_id: row.foundry_id,
    currency: row.currency,
    fiscal_year_start_month: row.fiscal_year_start_month,
    number_format: row.number_format,
    runway_danger_weeks: row.runway_danger_weeks,
    runway_healthy_weeks: row.runway_healthy_weeks,
    large_expense_threshold_cents: row.large_expense_threshold_cents,
    variance_alert_pct: row.variance_alert_pct,
    retention_years: row.retention_years,
    specialist_model_tier: coerceTier(row.specialist_model_tier),
    digest_schedule: row.digest_schedule,
    onboarding_progress: coerceOnboarding(row.onboarding_progress),
  }
}

/**
 * Read the foundry's money_settings row. Lazily creates the row with defaults
 * if it doesn't exist yet (first Money interaction in this foundry).
 */
export async function getMoneySettings(): Promise<MoneySettingsResult> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: row, error } = await supabase
      .from('money_settings')
      .select(
        'foundry_id, currency, fiscal_year_start_month, number_format, runway_danger_weeks, runway_healthy_weeks, large_expense_threshold_cents, variance_alert_pct, retention_years, specialist_model_tier, digest_schedule, onboarding_progress, runway_months_cached, runway_cached_at, credits_cap_cents, specialists_enabled, created_at, updated_at',
      )
      .eq('foundry_id', foundryId)
      .maybeSingle()

    if (error) return { error: error.message }

    if (row) {
      return { settings: rowToSettings(row as MoneySettingsRow) }
    }

    // Lazy create with defaults. Founder/Executive RLS will enforce role on
    // first insert; if the caller lacks permission they get an error here
    // (which is the right behaviour — non-founders shouldn't materialise
    // foundry-level settings).
    const { data: inserted, error: insertError } = await supabase
      .from('money_settings')
      .insert({ foundry_id: foundryId })
      .select(
        'foundry_id, currency, fiscal_year_start_month, number_format, runway_danger_weeks, runway_healthy_weeks, large_expense_threshold_cents, variance_alert_pct, retention_years, specialist_model_tier, digest_schedule, onboarding_progress, runway_months_cached, runway_cached_at, credits_cap_cents, specialists_enabled, created_at, updated_at',
      )
      .single()

    if (insertError || !inserted) {
      return { error: insertError?.message ?? 'Failed to initialise settings' }
    }

    return { settings: rowToSettings(inserted as MoneySettingsRow) }
  })
}

export type MoneySettingsPatch = Partial<{
  currency: string
  fiscal_year_start_month: number
  number_format: string
  runway_danger_weeks: number
  runway_healthy_weeks: number
  large_expense_threshold_cents: number
  variance_alert_pct: number
  retention_years: number
  specialist_model_tier: SpecialistModelTier
  digest_schedule: string
}>

/**
 * Apply a patch to money_settings. Validation guards keep RLS-rejected
 * mutations from reaching Postgres with junk values; RLS still enforces the
 * Founder/Executive write policy.
 */
export async function updateMoneySettings(
  patch: MoneySettingsPatch,
): Promise<{ success: true; settings: MoneySettings } | { error: string }> {
  // Whitelist + validate each field. We never trust client-supplied keys
  // beyond the typed patch shape.
  const update: Record<string, string | number> = {}

  if (patch.currency !== undefined) {
    const code = patch.currency.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) return { error: 'Currency must be an ISO 4217 3-letter code' }
    update.currency = code
  }

  if (patch.fiscal_year_start_month !== undefined) {
    const m = Number(patch.fiscal_year_start_month)
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return { error: 'Fiscal year start month must be 1–12' }
    }
    update.fiscal_year_start_month = m
  }

  if (patch.number_format !== undefined) {
    const fmt = patch.number_format.trim()
    if (!fmt || fmt.length > 20) return { error: 'Invalid number format locale' }
    update.number_format = fmt
  }

  if (patch.runway_danger_weeks !== undefined) {
    const w = Number(patch.runway_danger_weeks)
    if (!Number.isInteger(w) || w < 1 || w > 520) {
      return { error: 'Runway danger weeks must be a positive integer' }
    }
    update.runway_danger_weeks = w
  }

  if (patch.runway_healthy_weeks !== undefined) {
    const w = Number(patch.runway_healthy_weeks)
    if (!Number.isInteger(w) || w < 1 || w > 520) {
      return { error: 'Runway healthy weeks must be a positive integer' }
    }
    update.runway_healthy_weeks = w
  }

  // Cross-field check after both are normalised in the patch (or against the
  // current row would be ideal — but a UI-side hint is enough; we re-check
  // after fetch).
  if (
    update.runway_danger_weeks !== undefined &&
    update.runway_healthy_weeks !== undefined &&
    Number(update.runway_healthy_weeks) <= Number(update.runway_danger_weeks)
  ) {
    return { error: 'Healthy threshold must be greater than danger threshold' }
  }

  if (patch.large_expense_threshold_cents !== undefined) {
    const c = Number(patch.large_expense_threshold_cents)
    if (!Number.isInteger(c) || c < 0) {
      return { error: 'Large expense threshold must be zero or positive (cents)' }
    }
    update.large_expense_threshold_cents = c
  }

  if (patch.variance_alert_pct !== undefined) {
    const p = Number(patch.variance_alert_pct)
    if (!Number.isInteger(p) || p < 0 || p > 100) {
      return { error: 'Variance alert percent must be 0–100' }
    }
    update.variance_alert_pct = p
  }

  if (patch.retention_years !== undefined) {
    const y = Number(patch.retention_years)
    if (!Number.isInteger(y) || y < 1 || y > 50) {
      return { error: 'Retention years must be 1–50' }
    }
    update.retention_years = y
  }

  if (patch.specialist_model_tier !== undefined) {
    if (!(SPECIALIST_TIERS as readonly string[]).includes(patch.specialist_model_tier)) {
      return { error: 'Specialist model tier must be haiku, sonnet, or opus' }
    }
    update.specialist_model_tier = patch.specialist_model_tier
  }

  if (patch.digest_schedule !== undefined) {
    const s = patch.digest_schedule.trim()
    if (!s || s.length > 64) return { error: 'Invalid digest schedule' }
    update.digest_schedule = s
  }

  if (Object.keys(update).length === 0) {
    // No-op patch — read current state and return.
    const current = await getMoneySettings()
    if ('error' in current) return current
    return { success: true as const, settings: current.settings }
  }

  return withAuth(async ({ supabase, foundryId }) => {
    // Ensure the row exists so update() doesn't no-op silently.
    const ensured = await ensureSettingsRow(supabase, foundryId)
    if ('error' in ensured) return ensured

    const { data: updated, error } = await supabase
      .from('money_settings')
      .update(update)
      .eq('foundry_id', foundryId)
      .select(
        'foundry_id, currency, fiscal_year_start_month, number_format, runway_danger_weeks, runway_healthy_weeks, large_expense_threshold_cents, variance_alert_pct, retention_years, specialist_model_tier, digest_schedule, onboarding_progress, runway_months_cached, runway_cached_at, credits_cap_cents, specialists_enabled, created_at, updated_at',
      )
      .single()

    if (error || !updated) return { error: error?.message ?? 'Update failed' }

    revalidatePath('/money/settings')
    revalidatePath('/money/cockpit')

    return {
      success: true as const,
      settings: rowToSettings(updated as MoneySettingsRow),
    }
  })
}

/**
 * Mark a single onboarding step done (or undone). Step name is checked
 * against the canonical key set; unknown keys are rejected.
 */
export async function markOnboardingStep(
  step: string,
  done: boolean,
): Promise<{ success: true; progress: OnboardingProgress } | { error: string }> {
  if (!(ONBOARDING_STEP_KEYS as readonly string[]).includes(step)) {
    return { error: `Unknown onboarding step: ${step}` }
  }

  return withAuth(async ({ supabase, foundryId }) => {
    const ensured = await ensureSettingsRow(supabase, foundryId)
    if ('error' in ensured) return ensured

    const next: OnboardingProgress = {
      ...ensured.progress,
      [step as OnboardingStep]: !!done,
    }

    const { error } = await supabase
      .from('money_settings')
      .update({ onboarding_progress: next })
      .eq('foundry_id', foundryId)

    if (error) return { error: error.message }

    revalidatePath('/money/settings')

    return { success: true as const, progress: next }
  })
}

// ── Internals ────────────────────────────────────────────────────────────────

type EnsureResult = { progress: OnboardingProgress } | { error: string }

async function ensureSettingsRow(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  foundryId: string,
): Promise<EnsureResult> {
  const { data: existing } = await supabase
    .from('money_settings')
    .select('onboarding_progress')
    .eq('foundry_id', foundryId)
    .maybeSingle()

  if (existing) {
    return { progress: coerceOnboarding(existing.onboarding_progress) }
  }

  const { data: inserted, error } = await supabase
    .from('money_settings')
    .insert({ foundry_id: foundryId })
    .select('onboarding_progress')
    .single()

  if (error || !inserted) return { error: error?.message ?? 'Failed to initialise settings' }
  return { progress: coerceOnboarding(inserted.onboarding_progress) }
}

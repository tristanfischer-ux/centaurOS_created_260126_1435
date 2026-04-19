'use server'

/**
 * Money Credits server actions.
 *
 * Powers /money/settings/credits — specialist-call cost metering for the
 * current foundry. Reads aggregate from ai_credits_ledger (denormalised
 * rollup), surfaces budgets from ai_credits_budget, and exposes a Founder-
 * only mutation to update the active budget cap.
 *
 * RLS:
 *   - ai_credits_ledger SELECT is Founder-only (cost is founder-confidential)
 *   - ai_credits_budget SELECT is Founder/Executive
 *   - ai_credits_budget WRITE is Founder/Executive
 * We also add a server-side Founder check on the read path so non-founders
 * see a clean error, not an empty list.
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import type { Database } from '@/types/database.types'

type MemberRole = Database['public']['Enums']['member_role']

export type CreditsPeriodType = 'monthly' | 'quarterly' | 'annual' | 'custom'

export type CreditsBudget = {
  id: string
  period_type: CreditsPeriodType
  period_start: string
  period_end: string
  cap_cents: number
  warning_threshold_pct: number
  breach_behaviour: 'block' | 'warn_only'
  tier_seeded: boolean
}

export type SpecialistUsageRow = {
  specialist_id: string
  invocations: number
  total_cost_cents: number
  total_billable_cents: number
  total_input_tokens: number
  total_output_tokens: number
}

export type SpecialistModelRow = {
  specialist_id: string
  model_id: string
  invocations: number
  total_input_tokens: number
  total_output_tokens: number
  total_billable_cents: number
}

export type CreditsSummary = {
  // Aggregates over the current budget period (or all-time if no budget set).
  windowStart: string
  windowEnd: string
  totalSpendCents: number
  totalBillableCents: number
  invocationCount: number
  bySpecialist: SpecialistUsageRow[]
  bySection: Array<{ section: string; total_billable_cents: number; invocations: number }>
  /** Grouped by (specialist_id, model_id) — the canonical "what cost what" view. */
  bySpecialistModel: SpecialistModelRow[]
  budget: CreditsBudget | null
  percentOfCap: number | null
  isWarning: boolean
  isBreached: boolean
}

export type CreditsResult = { error: string } | { summary: CreditsSummary }

const PERIOD_TYPES: readonly CreditsPeriodType[] = ['monthly', 'quarterly', 'annual', 'custom'] as const

async function getCallerFoundryRole(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  userId: string,
  foundryId: string,
): Promise<MemberRole | null> {
  const { data } = await supabase
    .from('foundry_memberships')
    .select('role, active')
    .eq('user_id', userId)
    .eq('foundry_id', foundryId)
    .maybeSingle()
  if (!data || !data.active) return null
  return data.role
}

function startOfMonthIso(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function endOfMonthIso(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
}

/**
 * Read the active budget for the foundry (most recent budget whose period
 * window contains today). Null if none configured.
 */
async function getActiveBudget(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  foundryId: string,
): Promise<CreditsBudget | null> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('ai_credits_budget')
    .select('id, period_type, period_start, period_end, cap_cents, warning_threshold_pct, breach_behaviour, tier_seeded')
    .eq('foundry_id', foundryId)
    .lte('period_start', today)
    .gte('period_end', today)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    period_type: PERIOD_TYPES.includes(data.period_type as CreditsPeriodType)
      ? (data.period_type as CreditsPeriodType)
      : 'monthly',
    period_start: data.period_start,
    period_end: data.period_end,
    cap_cents: data.cap_cents,
    warning_threshold_pct: data.warning_threshold_pct,
    breach_behaviour: data.breach_behaviour === 'warn_only' ? 'warn_only' : 'block',
    tier_seeded: data.tier_seeded,
  }
}

/**
 * Fetch the credits summary for the current foundry: aggregate ledger spend
 * within the active budget window (or month-to-date if no budget set), per-
 * specialist breakdown, per-section breakdown, and budget context.
 */
export async function getCreditsSummary(): Promise<CreditsResult> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    const role = await getCallerFoundryRole(supabase, user.id, foundryId)
    if (role !== 'Founder') {
      return { error: 'Only founders can view credits usage' }
    }

    const budget = await getActiveBudget(supabase, foundryId)

    const now = new Date()
    const windowStart = budget?.period_start ?? startOfMonthIso(now)
    const windowEnd = budget?.period_end ?? endOfMonthIso(now)

    // Pull ledger rows for the window. Postgres-side aggregation would be
    // nicer (a view or an RPC), but a single SELECT keeps the surface
    // additive — Chunk 6 doesn't need a new SQL object.
    const windowStartTs = new Date(`${windowStart}T00:00:00.000Z`).toISOString()
    const windowEndTs = new Date(`${windowEnd}T23:59:59.999Z`).toISOString()

    const { data: ledgerRows, error: ledgerError } = await supabase
      .from('ai_credits_ledger')
      .select('specialist_id, section, model_id, cost_cents, billable_cost_cents, input_tokens, output_tokens')
      .eq('foundry_id', foundryId)
      .gte('invoked_at', windowStartTs)
      .lte('invoked_at', windowEndTs)

    if (ledgerError) return { error: ledgerError.message }

    const specMap = new Map<string, SpecialistUsageRow>()
    const sectionMap = new Map<string, { section: string; total_billable_cents: number; invocations: number }>()
    const specModelMap = new Map<string, SpecialistModelRow>()

    let totalCost = 0
    let totalBillable = 0
    let invocations = 0

    for (const row of ledgerRows ?? []) {
      totalCost += row.cost_cents ?? 0
      totalBillable += row.billable_cost_cents ?? 0
      invocations += 1

      const specKey = row.specialist_id || 'unknown'
      const spec = specMap.get(specKey) ?? {
        specialist_id: specKey,
        invocations: 0,
        total_cost_cents: 0,
        total_billable_cents: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
      }
      spec.invocations += 1
      spec.total_cost_cents += row.cost_cents ?? 0
      spec.total_billable_cents += row.billable_cost_cents ?? 0
      spec.total_input_tokens += row.input_tokens ?? 0
      spec.total_output_tokens += row.output_tokens ?? 0
      specMap.set(specKey, spec)

      const sectionKey = row.section || 'meta'
      const sec = sectionMap.get(sectionKey) ?? {
        section: sectionKey,
        total_billable_cents: 0,
        invocations: 0,
      }
      sec.total_billable_cents += row.billable_cost_cents ?? 0
      sec.invocations += 1
      sectionMap.set(sectionKey, sec)

      // Specialist × model rollup. The canonical "what cost what" view per
      // MONEY-SCHEMA §2 ai_credits_ledger — same input the founder needs to
      // decide whether to swap a model out (e.g. Sonnet → Haiku for cheap calls).
      const modelKey = row.model_id || 'unknown'
      const smKey = `${specKey}::${modelKey}`
      const sm = specModelMap.get(smKey) ?? {
        specialist_id: specKey,
        model_id: modelKey,
        invocations: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_billable_cents: 0,
      }
      sm.invocations += 1
      sm.total_input_tokens += row.input_tokens ?? 0
      sm.total_output_tokens += row.output_tokens ?? 0
      sm.total_billable_cents += row.billable_cost_cents ?? 0
      specModelMap.set(smKey, sm)
    }

    const bySpecialist = Array.from(specMap.values()).sort(
      (a, b) => b.total_billable_cents - a.total_billable_cents,
    )
    const bySection = Array.from(sectionMap.values()).sort(
      (a, b) => b.total_billable_cents - a.total_billable_cents,
    )
    const bySpecialistModel = Array.from(specModelMap.values()).sort(
      (a, b) => b.total_billable_cents - a.total_billable_cents,
    )

    const percentOfCap =
      budget && budget.cap_cents > 0
        ? Math.min(100, Math.round((totalBillable / budget.cap_cents) * 100))
        : null
    const isWarning =
      budget !== null && percentOfCap !== null && percentOfCap >= budget.warning_threshold_pct
    const isBreached = budget !== null && totalBillable >= budget.cap_cents

    return {
      summary: {
        windowStart,
        windowEnd,
        totalSpendCents: totalCost,
        totalBillableCents: totalBillable,
        invocationCount: invocations,
        bySpecialist,
        bySection,
        bySpecialistModel,
        budget,
        percentOfCap,
        isWarning,
        isBreached,
      },
    }
  })
}

export type UpdateCreditsBudgetInput = {
  /** Required when creating; optional when updating an existing budget id. */
  period_type?: CreditsPeriodType
  /** Optional explicit window — when omitted, derived from period_type. */
  period_start?: string
  period_end?: string
  cap_cents: number
  warning_threshold_pct?: number
  breach_behaviour?: 'block' | 'warn_only'
}

/**
 * Create or update the active budget for the foundry. If a budget already
 * covers today, that row is updated in place; otherwise a new budget row is
 * inserted using the supplied (or derived) window.
 */
export async function updateCreditsBudget(
  input: UpdateCreditsBudgetInput,
): Promise<{ success: true; budget: CreditsBudget } | { error: string }> {
  // Validate cap_cents.
  const cap = Number(input.cap_cents)
  if (!Number.isInteger(cap) || cap < 0) {
    return { error: 'Cap must be a non-negative whole number of cents' }
  }

  const periodType = input.period_type ?? 'monthly'
  if (!PERIOD_TYPES.includes(periodType)) {
    return { error: 'Period type must be monthly, quarterly, annual, or custom' }
  }

  let warningPct = input.warning_threshold_pct ?? 80
  warningPct = Math.round(warningPct)
  if (!Number.isInteger(warningPct) || warningPct < 1 || warningPct > 100) {
    return { error: 'Warning threshold must be 1–100 percent' }
  }

  const breachBehaviour = input.breach_behaviour === 'warn_only' ? 'warn_only' : 'block'

  // Derive period window if not supplied.
  let periodStart = input.period_start
  let periodEnd = input.period_end
  if (!periodStart || !periodEnd) {
    const derived = derivePeriodWindow(periodType)
    periodStart = derived.start
    periodEnd = derived.end
  }
  if (Number.isNaN(new Date(periodStart).getTime()) || Number.isNaN(new Date(periodEnd).getTime())) {
    return { error: 'Period start/end must be valid dates' }
  }
  if (new Date(periodEnd).getTime() <= new Date(periodStart).getTime()) {
    return { error: 'Period end must be after period start' }
  }

  return withAuth(async ({ supabase, foundryId, user }) => {
    const role = await getCallerFoundryRole(supabase, user.id, foundryId)
    if (role !== 'Founder' && role !== 'Executive') {
      return { error: 'Only founders or executives can update the credits budget' }
    }

    // Check for an existing active budget row for this period.
    const today = new Date().toISOString().slice(0, 10)
    const { data: existing } = await supabase
      .from('ai_credits_budget')
      .select('id')
      .eq('foundry_id', foundryId)
      .lte('period_start', today)
      .gte('period_end', today)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    let savedId: string
    if (existing) {
      const { data, error } = await supabase
        .from('ai_credits_budget')
        .update({
          period_type: periodType,
          period_start: periodStart,
          period_end: periodEnd,
          cap_cents: cap,
          warning_threshold_pct: warningPct,
          breach_behaviour: breachBehaviour,
          tier_seeded: false,
        })
        .eq('id', existing.id)
        .eq('foundry_id', foundryId)
        .select('id')
        .single()
      if (error || !data) return { error: error?.message ?? 'Update failed' }
      savedId = data.id
    } else {
      const { data, error } = await supabase
        .from('ai_credits_budget')
        .insert({
          foundry_id: foundryId,
          period_type: periodType,
          period_start: periodStart,
          period_end: periodEnd,
          cap_cents: cap,
          warning_threshold_pct: warningPct,
          breach_behaviour: breachBehaviour,
          tier_seeded: false,
        })
        .select('id')
        .single()
      if (error || !data) return { error: error?.message ?? 'Insert failed' }
      savedId = data.id
    }

    revalidatePath('/money/settings/credits')
    revalidatePath('/money/cockpit')

    const budget: CreditsBudget = {
      id: savedId,
      period_type: periodType,
      period_start: periodStart,
      period_end: periodEnd,
      cap_cents: cap,
      warning_threshold_pct: warningPct,
      breach_behaviour: breachBehaviour,
      tier_seeded: false,
    }

    return { success: true as const, budget }
  })
}

// ───────────────────────────────────────────────────────────────────────────
// Sidebar Credits pill — compact projection over the active monthly budget.
// ───────────────────────────────────────────────────────────────────────────

export type CreditsUsageSummary = {
  /** Total billable cents spent in the active period (zero if no period or no rows). */
  usedCents: number
  /** Hard ceiling for the active period in cents (zero if no budget configured). */
  capCents: number
  /** Friendly month label for the period (e.g. "April 2026"). */
  periodLabel: string
  /** True when usedCents >= capCents and capCents > 0. */
  breach: boolean
  /** True when % of cap >= warning_threshold_pct (default 80%). */
  warning: boolean
  /** Display currency from money_settings; falls back to GBP. */
  currency: string
}

/**
 * Compact summary for the sidebar Credits pill. Returns zeros (not an error)
 * for non-Founder roles — the sidebar gates the pill via the route flag, so a
 * non-Founder behind a flag-on session would just see "0/0" rather than a
 * cryptic error toast. Every member of the foundry can read the pill state;
 * only Founders get the detailed ledger surface at /money/settings/credits.
 */
export async function getCreditsUsageSummary(): Promise<
  CreditsUsageSummary | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const today = new Date().toISOString().slice(0, 10)

    // Currency from money_settings (any foundry member can read).
    const { data: settingsRow } = await supabase
      .from('money_settings')
      .select('currency')
      .eq('foundry_id', foundryId)
      .maybeSingle()
    const currency = settingsRow?.currency ?? 'GBP'

    // Active monthly budget — RLS allows Founder + Executive to SELECT.
    // Non-permitted roles → no row → zero state. We don't error on that.
    const { data: budget } = await supabase
      .from('ai_credits_budget')
      .select('cap_cents, period_start, period_end, warning_threshold_pct')
      .eq('foundry_id', foundryId)
      .eq('period_type', 'monthly')
      .lte('period_start', today)
      .gte('period_end', today)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!budget) {
      return {
        usedCents: 0,
        capCents: 0,
        periodLabel: new Date(today).toLocaleDateString('en-GB', {
          month: 'long',
          year: 'numeric',
        }),
        breach: false,
        warning: false,
        currency,
      } as CreditsUsageSummary
    }

    // Sum billable cost over the budget window. Ledger SELECT is Founder-only,
    // so non-Founders return zero rows here.
    const periodStartTs = new Date(`${budget.period_start}T00:00:00.000Z`).toISOString()
    const periodEndTs = new Date(`${budget.period_end}T23:59:59.999Z`).toISOString()
    const { data: ledgerRows } = await supabase
      .from('ai_credits_ledger')
      .select('billable_cost_cents')
      .eq('foundry_id', foundryId)
      .gte('invoked_at', periodStartTs)
      .lte('invoked_at', periodEndTs)

    const usedCents = (ledgerRows ?? []).reduce(
      (sum, r) => sum + (r.billable_cost_cents ?? 0),
      0,
    )
    const warningPct = budget.warning_threshold_pct ?? 80
    const pctUsed = budget.cap_cents > 0 ? (usedCents / budget.cap_cents) * 100 : 0

    return {
      usedCents,
      capCents: budget.cap_cents,
      periodLabel: new Date(budget.period_start).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      }),
      breach: usedCents >= budget.cap_cents && budget.cap_cents > 0,
      warning: pctUsed >= warningPct,
      currency,
    } as CreditsUsageSummary
  })
}

function derivePeriodWindow(period: CreditsPeriodType): { start: string; end: string } {
  const now = new Date()
  if (period === 'monthly' || period === 'custom') {
    return { start: startOfMonthIso(now), end: endOfMonthIso(now) }
  }
  if (period === 'quarterly') {
    const q = Math.floor(now.getUTCMonth() / 3)
    const start = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), q * 3 + 3, 0))
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
  }
  // annual
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), 11, 31))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

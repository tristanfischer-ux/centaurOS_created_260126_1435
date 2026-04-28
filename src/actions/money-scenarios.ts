'use server'

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import type { Sliders, PlanLine } from '@/lib/money/scenario-projection'

export type ScenarioSummary = {
  id: string
  name: string
  question: string | null
  template_source: string | null
  is_default: boolean
  visibility: string
  override_count: number
}

export async function getScenarios(): Promise<
  { scenarios: ScenarioSummary[] } | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: scenRows } = await supabase
      .from('money_scenarios')
      .select('id, name, question, template_source, is_default, visibility')
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    if (!scenRows?.length) return { scenarios: [] }

    const ids = scenRows.map((s) => s.id)
    const { data: counts } = await supabase
      .from('money_scenario_overrides')
      .select('scenario_id')
      .in('scenario_id', ids)
      .is('archived_at', null)

    const countBy = new Map<string, number>()
    for (const row of counts ?? []) {
      countBy.set(row.scenario_id, (countBy.get(row.scenario_id) ?? 0) + 1)
    }

    return {
      scenarios: scenRows.map((s) => ({
        ...s,
        override_count: countBy.get(s.id) ?? 0,
      })) as ScenarioSummary[],
    }
  })
}

export async function createScenario(input: {
  name: string
  question?: string
  template_source?: string
}): Promise<{ id: string } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!input.name?.trim()) return { error: 'Scenario name is required' }
    const { data, error } = await supabase
      .from('money_scenarios')
      .insert({
        foundry_id: foundryId,
        name: input.name.trim(),
        question: input.question ?? null,
        template_source: input.template_source ?? 'custom',
        visibility: 'founders',
      })
      .select('id')
      .single()
    if (error || !data) return { error: error?.message ?? 'create failed' }
    revalidatePath('/money/plan')
    return { id: data.id }
  })
}

export type ScenarioOverrideDetail = {
  id: string
  line_item_id: string | null
  line_name: string | null
  override_amount_cents: number | null
  override_frequency: string | null
  override_effective_from: string | null
  override_effective_to: string | null
  override_probability_pct: number | null
  note: string | null
  archived_at: string | null
}

export type ScenarioDetail = {
  id: string
  name: string
  question: string | null
  template_source: string | null
  is_default: boolean
  visibility: string
  overrides: ScenarioOverrideDetail[]
  archivedOverrideCount: number
  /** Legacy-parity sliders — four levers applied client-side by projectBurn(). */
  sliders: Sliders
  /** Active plan_line_items rows needed to run the projection locally. */
  planLines: PlanLine[]
  /** Foundry-default opening balance (Xero actuals sum). */
  defaultOpeningBalanceCents: number
}

export async function getScenarioDetail(
  scenarioId: string,
): Promise<ScenarioDetail | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Migration 20260423010000 added the four slider columns on money_scenarios.
    // Until generated types catch up, we read them with a widened type.
    type ScenarioRow = {
      id: string
      name: string
      question: string | null
      template_source: string | null
      is_default: boolean
      visibility: string
      foundry_id: string
      revenue_delay_weeks: number | null
      cost_delay_weeks: number | null
      revenue_growth_pct: number | string | null
      opening_balance_cents: number | null
    }

    const { data: scenRaw, error } = await supabase
      .from('money_scenarios')
      .select(
        'id, name, question, template_source, is_default, visibility, foundry_id, revenue_delay_weeks, cost_delay_weeks, revenue_growth_pct, opening_balance_cents',
      )
      .eq('id', scenarioId)
      .maybeSingle()
    if (error) return { error: error.message }
    const scen = scenRaw as ScenarioRow | null
    if (!scen || scen.foundry_id !== foundryId) return { error: 'Scenario not found' }

    const { data: overrideRows } = await supabase
      .from('money_scenario_overrides')
      .select(
        'id, line_item_id, override_amount_cents, override_frequency, override_effective_from, override_effective_to, override_probability_pct, note, archived_at',
      )
      .eq('scenario_id', scenarioId)
      .order('created_at', { ascending: true })

    const lineIds = (overrideRows ?? [])
      .map((r) => r.line_item_id)
      .filter((id): id is string => !!id)

    const lineNameById = new Map<string, string>()
    if (lineIds.length > 0) {
      const { data: lineRows } = await supabase
        .from('plan_line_items')
        .select('id, name')
        .in('id', lineIds)
      for (const l of lineRows ?? []) lineNameById.set(l.id, l.name)
    }

    const overrides: ScenarioOverrideDetail[] = (overrideRows ?? []).map((r) => ({
      id: r.id,
      line_item_id: r.line_item_id,
      line_name: r.line_item_id ? lineNameById.get(r.line_item_id) ?? null : null,
      override_amount_cents: r.override_amount_cents,
      override_frequency: r.override_frequency,
      override_effective_from: r.override_effective_from,
      override_effective_to: r.override_effective_to,
      override_probability_pct: r.override_probability_pct,
      note: r.note,
      archived_at: r.archived_at,
    }))

    const archivedOverrideCount = overrides.filter((o) => o.archived_at !== null).length

    // Plan lines (active only) — needed so the scenario detail view can run
    // projectBurn() client-side as sliders move.
    const { data: lineRows } = await supabase
      .from('plan_line_items')
      .select(
        'direction, amount_cents, frequency, effective_from, effective_to, probability_pct',
      )
      .eq('foundry_id', foundryId)
      .is('archived_at', null)

    const planLines: PlanLine[] = (lineRows ?? []).map((r) => ({
      direction: r.direction as 'in' | 'out',
      amount_cents: r.amount_cents,
      frequency: r.frequency as PlanLine['frequency'],
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      probability_pct: r.probability_pct ?? null,
    }))

    // Default opening balance = sum of Xero actuals. Mirrors money-cockpit.ts.
    const { data: txAgg } = await supabase
      .from('xero_transaction')
      .select('amount_cents')
      .eq('foundry_id', foundryId)
    const defaultOpeningBalanceCents = (txAgg ?? []).reduce(
      (sum, t) => sum + (t.amount_cents ?? 0),
      0,
    )

    const sliders: Sliders = {
      revenue_delay_weeks: scen.revenue_delay_weeks ?? 0,
      cost_delay_weeks: scen.cost_delay_weeks ?? 0,
      revenue_growth_pct: Number(scen.revenue_growth_pct ?? 0),
      opening_balance_cents: scen.opening_balance_cents ?? null,
    }

    return {
      id: scen.id,
      name: scen.name,
      question: scen.question,
      template_source: scen.template_source,
      is_default: scen.is_default,
      visibility: scen.visibility,
      overrides,
      archivedOverrideCount,
      sliders,
      planLines,
      defaultOpeningBalanceCents,
    }
  })
}

/**
 * Validation-clamped slider ranges used on both the client and the server.
 * Matches the legacy Cash Burn UI: delays 0..26 weeks, growth -50..100%.
 */
const SLIDER_LIMITS = {
  revenue_delay_weeks: { min: 0, max: 26 },
  cost_delay_weeks: { min: 0, max: 26 },
  revenue_growth_pct: { min: -50, max: 100 },
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

/**
 * Persist the four legacy sliders for a scenario. Called by the detail
 * view's "Save levers" button. Values are clamped server-side so an
 * out-of-range client can't poison the row.
 */
export async function updateScenarioSliders(args: {
  scenarioId: string
  sliders: Sliders
}): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!args.scenarioId) return { error: 'scenarioId required' }

    // Confirm tenant ownership before update (defense-in-depth alongside RLS).
    const { data: scen, error: fetchErr } = await supabase
      .from('money_scenarios')
      .select('id, foundry_id')
      .eq('id', args.scenarioId)
      .maybeSingle()
    if (fetchErr) return { error: fetchErr.message }
    if (!scen || scen.foundry_id !== foundryId) {
      return { error: 'Scenario not found' }
    }

    const payload = {
      revenue_delay_weeks: Math.round(
        clamp(
          args.sliders.revenue_delay_weeks,
          SLIDER_LIMITS.revenue_delay_weeks.min,
          SLIDER_LIMITS.revenue_delay_weeks.max,
        ),
      ),
      cost_delay_weeks: Math.round(
        clamp(
          args.sliders.cost_delay_weeks,
          SLIDER_LIMITS.cost_delay_weeks.min,
          SLIDER_LIMITS.cost_delay_weeks.max,
        ),
      ),
      revenue_growth_pct: clamp(
        args.sliders.revenue_growth_pct,
        SLIDER_LIMITS.revenue_growth_pct.min,
        SLIDER_LIMITS.revenue_growth_pct.max,
      ),
      opening_balance_cents:
        args.sliders.opening_balance_cents === null ||
        !Number.isFinite(args.sliders.opening_balance_cents)
          ? null
          : Math.round(args.sliders.opening_balance_cents),
    }

    // Cast through unknown — generated types will include these columns once
    // the pending migration is applied and `supabase gen types` reruns.
    const { error } = await supabase
      .from('money_scenarios')
      .update(payload as unknown as Record<string, never>)
      .eq('id', args.scenarioId)
      .eq('foundry_id', foundryId)
    if (error) return { error: error.message }

    revalidatePath(`/money/plan/scenario/${args.scenarioId}`)
    revalidatePath('/money/plan')
    revalidatePath('/money/cockpit')
    return { success: true as const }
  })
}

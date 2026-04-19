'use server'

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'

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
}

export async function getScenarioDetail(
  scenarioId: string,
): Promise<ScenarioDetail | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: scen, error } = await supabase
      .from('money_scenarios')
      .select('id, name, question, template_source, is_default, visibility, foundry_id')
      .eq('id', scenarioId)
      .maybeSingle()
    if (error) return { error: error.message }
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

    return {
      id: scen.id,
      name: scen.name,
      question: scen.question,
      template_source: scen.template_source,
      is_default: scen.is_default,
      visibility: scen.visibility,
      overrides,
      archivedOverrideCount,
    }
  })
}

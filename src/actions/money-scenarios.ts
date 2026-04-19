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
    const { data, error } = await supabase
      .from('money_scenarios')
      .insert({
        foundry_id: foundryId,
        name: input.name,
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

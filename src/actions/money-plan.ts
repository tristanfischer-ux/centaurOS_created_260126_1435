'use server'

/**
 * Money Plan server actions.
 *
 * Reads plan_line_items for the /money/plan grid + minimal write paths for
 * archive. Full edit/create flows land in a follow-up PR (not MVP scope).
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'

export type PlanLineItem = {
  id: string
  name: string
  direction: 'out' | 'in'
  category: string
  amount_cents: number
  currency: string
  frequency: string
  effective_from: string
  effective_to: string | null
  probability_pct: number
  source: string
  notes: string | null
}

export type PlanData = {
  lines: PlanLineItem[]
  scenarios: Array<{ id: string; name: string; is_default: boolean }>
  activeScenarioId: string | null
}

export async function getPlanData(): Promise<PlanData | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: lineRows } = await supabase
      .from('plan_line_items')
      .select(
        'id, name, direction, category, amount_cents, currency, frequency, effective_from, effective_to, probability_pct, source, notes',
      )
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
      .order('direction', { ascending: true })
      .order('category', { ascending: true })
      .order('amount_cents', { ascending: false })

    const lines: PlanLineItem[] = (lineRows ?? []) as PlanLineItem[]

    const { data: scenarios } = await supabase
      .from('money_scenarios')
      .select('id, name, is_default')
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    return {
      lines,
      scenarios: scenarios ?? [],
      activeScenarioId: scenarios?.find((s) => s.is_default)?.id ?? null,
    }
  })
}

export async function archivePlanLine(lineId: string): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { error } = await supabase
      .from('plan_line_items')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', lineId)
      .eq('foundry_id', foundryId)
    if (error) return { error: error.message }
    revalidatePath('/money/plan')
    revalidatePath('/money/cockpit')
    return { success: true as const }
  })
}

export async function seedPlanFromTemplate(templateId: string): Promise<{ success: true; inserted: number } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    const { data: tmpl } = await supabase
      .from('plan_templates')
      .select('line_items_seed, active')
      .eq('id', templateId)
      .maybeSingle()
    if (!tmpl?.active || !Array.isArray(tmpl.line_items_seed)) {
      return { error: 'Template not found or inactive' }
    }
    const seed = tmpl.line_items_seed as Array<Record<string, unknown>>
    const now = new Date()
    const effectiveFrom = now.toISOString().slice(0, 10)
    const rows = seed.map((s) => ({
      foundry_id: foundryId,
      name: (s.name as string) ?? 'Untitled',
      direction: (s.direction as 'out' | 'in') ?? 'out',
      category: (s.category as string) ?? 'other',
      amount_cents: (s.amount_cents as number) ?? 0,
      currency: 'GBP',
      frequency: (s.frequency as string) ?? 'monthly',
      effective_from: effectiveFrom,
      probability_pct: (s.probability_pct as number) ?? 100,
      source: 'template' as const,
      owner_user_id: user.id,
    }))
    const { error, data } = await supabase.from('plan_line_items').insert(rows).select('id')
    if (error) return { error: error.message }
    revalidatePath('/money/plan')
    revalidatePath('/money/cockpit')
    return { success: true as const, inserted: data?.length ?? 0 }
  })
}

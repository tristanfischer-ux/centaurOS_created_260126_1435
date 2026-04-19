'use server'

/**
 * Money Thesis server actions — investor_thesis versioning + active pointer.
 *
 * Per MONEY-SCHEMA §1 ambiguity #4: thesis is versioned, never updated in
 * place. Each save inserts a new row with version = max+1; the foundry's
 * `active_thesis_id` pointer is updated to the new row. Old versions stay
 * readable for history; archived_at flag is the soft-delete.
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'

export type ThesisWeights = {
  thesis: number
  stage: number
  cheque: number
  warm: number
  geo: number
  recency: number
  speed: number
}

export type ThesisRow = {
  id: string
  version: number
  stage_tags: string[]
  sector_tags: string[]
  geography: string[]
  cheque_min_cents: number | null
  cheque_max_cents: number | null
  keywords: string[]
  preferred_instrument: string[]
  decision_speed_max_weeks: number | null
  lead_follower_pref: string
  no_go_rules: unknown
  weights: ThesisWeights
  data_sources: unknown
  created_at: string
  is_active: boolean
}

export type ThesisInput = {
  stage_tags: string[]
  sector_tags: string[]
  geography?: string[]
  cheque_min_cents?: number | null
  cheque_max_cents?: number | null
  keywords?: string[]
  preferred_instrument?: string[]
  decision_speed_max_weeks?: number | null
  lead_follower_pref?: string
  weights?: Partial<ThesisWeights>
}

const DEFAULT_WEIGHTS: ThesisWeights = {
  thesis: 35,
  stage: 20,
  cheque: 15,
  warm: 12,
  geo: 8,
  recency: 6,
  speed: 4,
}

function isWeights(v: unknown): v is ThesisWeights {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.thesis === 'number' &&
    typeof o.stage === 'number' &&
    typeof o.cheque === 'number'
  )
}

export async function getActiveThesis(): Promise<
  { thesis: ThesisRow | null; versions: Array<{ id: string; version: number; created_at: string }> } | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: foundry } = await supabase
      .from('foundries')
      .select('active_thesis_id')
      .eq('id', foundryId)
      .maybeSingle()

    const activeId = foundry?.active_thesis_id ?? null

    const { data: allRows } = await supabase
      .from('investor_thesis')
      .select(
        'id, version, stage_tags, sector_tags, geography, cheque_min_cents, cheque_max_cents, keywords, preferred_instrument, decision_speed_max_weeks, lead_follower_pref, no_go_rules, weights, data_sources, created_at',
      )
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
      .order('version', { ascending: false })

    const rows = allRows ?? []
    const versions = rows.map((r) => ({
      id: r.id,
      version: r.version,
      created_at: r.created_at,
    }))

    const active = activeId ? rows.find((r) => r.id === activeId) ?? null : rows[0] ?? null
    if (!active) return { thesis: null, versions }

    const thesis: ThesisRow = {
      id: active.id,
      version: active.version,
      stage_tags: active.stage_tags ?? [],
      sector_tags: active.sector_tags ?? [],
      geography: active.geography ?? [],
      cheque_min_cents: active.cheque_min_cents,
      cheque_max_cents: active.cheque_max_cents,
      keywords: active.keywords ?? [],
      preferred_instrument: active.preferred_instrument ?? [],
      decision_speed_max_weeks: active.decision_speed_max_weeks,
      lead_follower_pref: active.lead_follower_pref ?? 'either',
      no_go_rules: active.no_go_rules,
      weights: isWeights(active.weights) ? active.weights : DEFAULT_WEIGHTS,
      data_sources: active.data_sources,
      created_at: active.created_at,
      is_active: active.id === activeId,
    }
    return { thesis, versions }
  })
}

export async function saveThesisVersion(
  input: ThesisInput,
): Promise<{ id: string; version: number } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    if (!input.stage_tags?.length) return { error: 'At least one stage tag is required' }
    if (!input.sector_tags?.length) return { error: 'At least one sector tag is required' }

    // Determine next version number for this foundry.
    const { data: existing } = await supabase
      .from('investor_thesis')
      .select('version')
      .eq('foundry_id', foundryId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (existing?.version ?? 0) + 1

    const weights = { ...DEFAULT_WEIGHTS, ...(input.weights ?? {}) }
    const sumWeights =
      weights.thesis + weights.stage + weights.cheque + weights.warm + weights.geo + weights.recency + weights.speed
    if (sumWeights !== 100) {
      return { error: `Weights must sum to 100 (got ${sumWeights})` }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('investor_thesis')
      .insert({
        foundry_id: foundryId,
        version: nextVersion,
        stage_tags: input.stage_tags,
        sector_tags: input.sector_tags,
        geography: input.geography ?? [],
        cheque_min_cents: input.cheque_min_cents ?? null,
        cheque_max_cents: input.cheque_max_cents ?? null,
        keywords: input.keywords ?? [],
        preferred_instrument: input.preferred_instrument ?? [],
        decision_speed_max_weeks: input.decision_speed_max_weeks ?? null,
        lead_follower_pref: input.lead_follower_pref ?? 'either',
        weights: weights as unknown as Record<string, number>,
        created_by: user.id,
      })
      .select('id, version')
      .single()

    if (insertErr || !inserted) {
      return { error: insertErr?.message ?? 'Insert failed' }
    }

    // Promote to active.
    const { error: updateErr } = await supabase
      .from('foundries')
      .update({ active_thesis_id: inserted.id })
      .eq('id', foundryId)

    if (updateErr) return { error: updateErr.message }

    revalidatePath('/money/raise')
    revalidatePath('/money/raise/thesis')
    return { id: inserted.id, version: inserted.version }
  })
}

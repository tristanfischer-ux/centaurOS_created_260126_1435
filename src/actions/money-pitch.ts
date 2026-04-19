'use server'

/**
 * Money Pitch server actions — pitch_prep_section overview + per-section editing.
 *
 * Eight canonical sections per round: company, market, problem, traction,
 * team, ask, financial_model, cap_table. The overview surfaces completion %.
 * Per-section editor saves narrative_fields (free-form JSON bag).
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'

export const PITCH_SECTION_KEYS = [
  'company',
  'market',
  'problem',
  'traction',
  'team',
  'ask',
  'financial_model',
  'cap_table',
] as const

export type PitchSectionKey = (typeof PITCH_SECTION_KEYS)[number]

export type PitchSectionStatus = 'not_started' | 'in_progress' | 'done'

export type PitchSectionRow = {
  id: string
  round_id: string
  section_key: PitchSectionKey
  status: PitchSectionStatus
  narrative_fields: Record<string, unknown>
  last_edited_at: string | null
}

export type PitchOverview = {
  roundId: string | null
  sections: PitchSectionRow[]
  completionPct: number
}

function isPitchSectionKey(key: string): key is PitchSectionKey {
  return (PITCH_SECTION_KEYS as readonly string[]).includes(key)
}

function isPitchStatus(status: string): status is PitchSectionStatus {
  return status === 'not_started' || status === 'in_progress' || status === 'done'
}

function asNarrativeFields(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

/**
 * Resolve the round to use for pitch prep. If roundId provided, use that;
 * otherwise pick the active round; otherwise return null.
 */
async function resolveRoundId(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  foundryId: string,
  roundId?: string | null,
): Promise<string | null> {
  if (roundId) return roundId
  const { data } = await supabase
    .from('investor_round')
    .select('id')
    .eq('foundry_id', foundryId)
    .eq('state', 'active')
    .is('archived_at', null)
    .maybeSingle()
  return data?.id ?? null
}

export async function getPitchOverview(
  roundId?: string | null,
): Promise<PitchOverview | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const resolvedRoundId = await resolveRoundId(supabase, foundryId, roundId)
    if (!resolvedRoundId) {
      return { roundId: null, sections: [], completionPct: 0 }
    }

    const { data: existing } = await supabase
      .from('pitch_prep_section')
      .select('id, round_id, section_key, status, narrative_fields, last_edited_at')
      .eq('foundry_id', foundryId)
      .eq('round_id', resolvedRoundId)

    const byKey = new Map<string, NonNullable<typeof existing>[number]>()
    for (const row of existing ?? []) byKey.set(row.section_key, row)

    // Lazy-create any missing sections so the overview always shows 8 rows.
    const missing = PITCH_SECTION_KEYS.filter((k) => !byKey.has(k))
    if (missing.length > 0) {
      const rowsToInsert = missing.map((k) => ({
        foundry_id: foundryId,
        round_id: resolvedRoundId,
        section_key: k,
        status: 'not_started' as const,
      }))
      const { data: inserted } = await supabase
        .from('pitch_prep_section')
        .insert(rowsToInsert)
        .select('id, round_id, section_key, status, narrative_fields, last_edited_at')
      for (const row of inserted ?? []) byKey.set(row.section_key, row)
    }

    const sections: PitchSectionRow[] = PITCH_SECTION_KEYS.map((k) => {
      const row = byKey.get(k)
      const status = row?.status && isPitchStatus(row.status) ? row.status : 'not_started'
      const sectionKey = isPitchSectionKey(row?.section_key ?? k) ? (row?.section_key as PitchSectionKey) : k
      return {
        id: row?.id ?? '',
        round_id: row?.round_id ?? resolvedRoundId,
        section_key: sectionKey,
        status,
        narrative_fields: asNarrativeFields(row?.narrative_fields),
        last_edited_at: row?.last_edited_at ?? null,
      }
    })

    const doneCount = sections.filter((s) => s.status === 'done').length
    const inProgressCount = sections.filter((s) => s.status === 'in_progress').length
    // Each "done" = full credit; "in_progress" = half credit.
    const completionPct = Math.round(((doneCount + inProgressCount * 0.5) / sections.length) * 100)

    return { roundId: resolvedRoundId, sections, completionPct }
  })
}

export async function getPitchSection(
  sectionId: string,
): Promise<{ section: PitchSectionRow } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await supabase
      .from('pitch_prep_section')
      .select('id, round_id, section_key, status, narrative_fields, last_edited_at, foundry_id')
      .eq('id', sectionId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data || data.foundry_id !== foundryId) return { error: 'Section not found' }
    if (!isPitchSectionKey(data.section_key)) return { error: 'Unknown section type' }
    const status = isPitchStatus(data.status) ? data.status : 'not_started'
    return {
      section: {
        id: data.id,
        round_id: data.round_id,
        section_key: data.section_key,
        status,
        narrative_fields: asNarrativeFields(data.narrative_fields),
        last_edited_at: data.last_edited_at,
      },
    }
  })
}

export async function getPitchSectionByKey(
  sectionKey: string,
  roundId?: string | null,
): Promise<{ section: PitchSectionRow } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!isPitchSectionKey(sectionKey)) {
      return { error: `Unknown section "${sectionKey}"` }
    }
    const resolvedRoundId = await resolveRoundId(supabase, foundryId, roundId)
    if (!resolvedRoundId) return { error: 'No active round' }

    const { data } = await supabase
      .from('pitch_prep_section')
      .select('id, round_id, section_key, status, narrative_fields, last_edited_at')
      .eq('foundry_id', foundryId)
      .eq('round_id', resolvedRoundId)
      .eq('section_key', sectionKey)
      .maybeSingle()

    if (data) {
      const status = isPitchStatus(data.status) ? data.status : 'not_started'
      return {
        section: {
          id: data.id,
          round_id: data.round_id,
          section_key: sectionKey,
          status,
          narrative_fields: asNarrativeFields(data.narrative_fields),
          last_edited_at: data.last_edited_at,
        },
      }
    }

    // Lazy-create.
    const { data: inserted, error: insertErr } = await supabase
      .from('pitch_prep_section')
      .insert({
        foundry_id: foundryId,
        round_id: resolvedRoundId,
        section_key: sectionKey,
        status: 'not_started',
      })
      .select('id, round_id, section_key, status, narrative_fields, last_edited_at')
      .single()
    if (insertErr || !inserted) return { error: insertErr?.message ?? 'Section create failed' }

    return {
      section: {
        id: inserted.id,
        round_id: inserted.round_id,
        section_key: sectionKey,
        status: 'not_started',
        narrative_fields: asNarrativeFields(inserted.narrative_fields),
        last_edited_at: inserted.last_edited_at,
      },
    }
  })
}

export async function updatePitchSection(
  sectionId: string,
  input: { narrative_fields?: Record<string, unknown>; status?: PitchSectionStatus },
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    const update: Record<string, unknown> = {
      last_edited_by_user_id: user.id,
      last_edited_at: new Date().toISOString(),
    }
    if (input.narrative_fields !== undefined) {
      update.narrative_fields = input.narrative_fields
    }
    if (input.status !== undefined) {
      if (!isPitchStatus(input.status)) return { error: 'Invalid status' }
      update.status = input.status
    }

    const { error } = await supabase
      .from('pitch_prep_section')
      .update(update)
      .eq('id', sectionId)
      .eq('foundry_id', foundryId)
    if (error) return { error: error.message }
    revalidatePath('/money/raise/pitch')
    revalidatePath(`/money/raise/pitch`)
    return { success: true as const }
  })
}

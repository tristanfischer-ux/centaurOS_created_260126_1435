'use server'

/**
 * Money Raise server actions — investor pipeline, round management.
 *
 * Refactor from the legacy src/actions/investors.ts (2571 LOC, 60+ exports)
 * focused on the V2 pipeline model. investor_pipeline_state is trigger-
 * maintained from investor_pipeline_events (append-only log). Touches,
 * passes, notes, and news land as typed events rather than separate tables.
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitMoneyEvent, resolveMoneyEventsForEntity } from '@/lib/money/emit-event'
import { isPipelineEventAttentionWorthy } from '@/lib/money/attention-worthy'

export type RaiseRound = {
  id: string
  name: string
  stage: string
  target_cents: number
  currency: string
  close_date: string
  instrument: string
  state: 'draft' | 'active' | 'closing' | 'closed' | 'archived'
}

export type PipelineRow = {
  id: string
  round_id: string | null
  marketplace_listing_id: string | null
  investor_firm_id: string | null
  investor_person_id: string | null
  current_stage:
    | 'target'
    | 'researching'
    | 'contacted'
    | 'meeting'
    | 'due_diligence'
    | 'verbal'
    | 'closed'
    | 'passed'
  stage_entered_at: string
  probability_pct: number | null
  commit_amount_cents: number | null
  lead_role: string | null
  pass_reason: string | null
  match_score_cached: number | null
}

export type RaiseData = {
  activeRound: RaiseRound | null
  pipeline: PipelineRow[]
  roundCount: number
}

export async function getRaiseData(): Promise<RaiseData | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: activeRoundRow } = await supabase
      .from('investor_round')
      .select('id, name, stage, target_cents, currency, close_date, instrument, state')
      .eq('foundry_id', foundryId)
      .eq('state', 'active')
      .is('archived_at', null)
      .maybeSingle()

    const activeRound = (activeRoundRow ?? null) as RaiseRound | null

    const { count: roundCount } = await supabase
      .from('investor_round')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .is('archived_at', null)

    const pipelineQuery = supabase
      .from('investor_pipeline_state')
      .select(
        'id, round_id, marketplace_listing_id, investor_firm_id, investor_person_id, current_stage, stage_entered_at, probability_pct, commit_amount_cents, lead_role, pass_reason, match_score_cached',
      )
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
      .order('stage_entered_at', { ascending: false })

    if (activeRound) {
      pipelineQuery.eq('round_id', activeRound.id)
    }

    const { data: pipelineRows } = await pipelineQuery

    return {
      activeRound,
      pipeline: (pipelineRows ?? []) as PipelineRow[],
      roundCount: roundCount ?? 0,
    }
  })
}

export async function createRound(input: {
  name: string
  stage: string
  target_cents: number
  close_date: string
  instrument: string
  cap_cents?: number
  discount_pct?: number
}): Promise<{ id: string } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await supabase
      .from('investor_round')
      .insert({
        foundry_id: foundryId,
        name: input.name,
        stage: input.stage,
        target_cents: input.target_cents,
        close_date: input.close_date,
        instrument: input.instrument,
        cap_cents: input.cap_cents ?? null,
        discount_pct: input.discount_pct ?? null,
        state: 'draft',
      })
      .select('id')
      .single()
    if (error || !data) return { error: error?.message ?? 'create failed' }
    revalidatePath('/money/raise')
    return { id: data.id }
  })
}

/**
 * Move an investor to a new pipeline stage. The trigger on
 * investor_pipeline_events updates pipeline_state.current_stage
 * automatically. We decide attention-worthiness via the gate before
 * emitting to event_log.
 */
export async function moveInvestorStage(input: {
  pipeline_state_id: string
  to_stage: PipelineRow['current_stage']
  notes?: string
}): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    const { data: state } = await supabase
      .from('investor_pipeline_state')
      .select('current_stage, stage_entered_at, foundry_id')
      .eq('id', input.pipeline_state_id)
      .maybeSingle()
    if (!state || state.foundry_id !== foundryId) {
      return { error: 'Not found' }
    }

    const fromStage = state.current_stage
    const { error } = await supabase
      .from('investor_pipeline_events')
      .insert({
        foundry_id: foundryId,
        pipeline_state_id: input.pipeline_state_id,
        event_type: 'stage_move',
        from_stage: fromStage,
        to_stage: input.to_stage,
        payload: input.notes ? { notes: input.notes } : {},
        actor_user_id: user.id,
      })
    if (error) return { error: error.message }

    // isAttentionWorthy gate — if true, also write to SHARED event_log via admin client.
    const worthy = isPipelineEventAttentionWorthy(
      { event_type: 'stage_move', from_stage: fromStage, to_stage: input.to_stage },
      { stage_entered_at: state.stage_entered_at },
    )
    if (worthy) {
      try {
        const admin = createAdminClient()
        const urgency =
          input.to_stage === 'verbal' || input.to_stage === 'closed'
            ? 'medium'
            : 'low'
        const eventType =
          input.to_stage === 'verbal'
            ? 'verbal_commit'
            : input.to_stage === 'closed'
              ? 'round_closed'
              : 'stage_move'
        await emitMoneyEvent(admin, {
          foundry_id: foundryId,
          source_entity_type: eventType,
          source_entity_id: input.pipeline_state_id,
          urgency,
          decay_rate: input.to_stage === 'verbal' ? '7d' : '30d',
          title: `Investor moved to ${input.to_stage}`,
          body: null,
          cta_label: 'View investor',
          cta_href: `/money/raise/investor/${input.pipeline_state_id}`,
          assigned_to: user.id,
        })
      } catch (err) {
        console.error('[moveInvestorStage] emit event failed', err)
      }
    }

    revalidatePath('/money/raise')
    return { success: true as const }
  })
}

export async function logInvestorTouch(input: {
  pipeline_state_id: string
  touch_type: string
  notes?: string
  date?: string
}): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    const { data: state } = await supabase
      .from('investor_pipeline_state')
      .select('foundry_id')
      .eq('id', input.pipeline_state_id)
      .maybeSingle()
    if (!state || state.foundry_id !== foundryId) return { error: 'Not found' }

    const { error } = await supabase
      .from('investor_pipeline_events')
      .insert({
        foundry_id: foundryId,
        pipeline_state_id: input.pipeline_state_id,
        event_type: 'touch_logged',
        payload: {
          type: input.touch_type,
          date: input.date ?? new Date().toISOString(),
          notes: input.notes ?? null,
        },
        actor_user_id: user.id,
      })
    if (error) return { error: error.message }

    // Logging a touch implicitly resolves any open touch_overdue event.
    try {
      const admin = createAdminClient()
      await resolveMoneyEventsForEntity(
        admin,
        foundryId,
        'touch_overdue',
        input.pipeline_state_id,
      )
    } catch (err) {
      console.error('[logInvestorTouch] resolve overdue failed', err)
    }

    revalidatePath('/money/raise')
    return { success: true as const }
  })
}

export type PipelineEventRow = {
  id: string
  event_type: string
  from_stage: string | null
  to_stage: string | null
  payload: Record<string, unknown>
  actor_user_id: string | null
  created_at: string
}

export type InvestorFirmInfo = {
  marketplace_listing_id: string | null
  title: string | null
  description: string | null
  website_url: string | null
  country: string | null
  contact_name: string | null
  contact_email: string | null
}

export type InvestorDetail = {
  state: PipelineRow & {
    foundry_id: string
    stage_entered_at: string
  }
  events: PipelineEventRow[]
  firm: InvestorFirmInfo | null
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export async function getInvestorDetail(
  pipelineStateId: string,
): Promise<InvestorDetail | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: stateRow, error } = await supabase
      .from('investor_pipeline_state')
      .select(
        'id, foundry_id, round_id, marketplace_listing_id, investor_firm_id, investor_person_id, current_stage, stage_entered_at, probability_pct, commit_amount_cents, lead_role, pass_reason, match_score_cached',
      )
      .eq('id', pipelineStateId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!stateRow || stateRow.foundry_id !== foundryId) return { error: 'Investor not found' }

    const { data: eventRows } = await supabase
      .from('investor_pipeline_events')
      .select('id, event_type, from_stage, to_stage, payload, actor_user_id, created_at')
      .eq('pipeline_state_id', pipelineStateId)
      .eq('foundry_id', foundryId)
      .order('created_at', { ascending: false })
      .limit(50)

    const events: PipelineEventRow[] = (eventRows ?? []).map((e) => ({
      id: e.id,
      event_type: e.event_type,
      from_stage: e.from_stage,
      to_stage: e.to_stage,
      payload: asJsonObject(e.payload),
      actor_user_id: e.actor_user_id,
      created_at: e.created_at,
    }))

    let firm: InvestorFirmInfo | null = null
    if (stateRow.marketplace_listing_id) {
      const { data: listing } = await supabase
        .from('marketplace_listings')
        .select('id, title, description, website_url, country, contact_name, contact_email')
        .eq('id', stateRow.marketplace_listing_id)
        .maybeSingle()
      if (listing) {
        firm = {
          marketplace_listing_id: listing.id,
          title: listing.title,
          description: listing.description,
          website_url: listing.website_url,
          country: listing.country,
          contact_name: listing.contact_name,
          contact_email: listing.contact_email,
        }
      }
    }

    return {
      state: {
        id: stateRow.id,
        foundry_id: stateRow.foundry_id,
        round_id: stateRow.round_id,
        marketplace_listing_id: stateRow.marketplace_listing_id,
        investor_firm_id: stateRow.investor_firm_id,
        investor_person_id: stateRow.investor_person_id,
        current_stage: stateRow.current_stage as PipelineRow['current_stage'],
        stage_entered_at: stateRow.stage_entered_at,
        probability_pct: stateRow.probability_pct,
        commit_amount_cents: stateRow.commit_amount_cents,
        lead_role: stateRow.lead_role,
        pass_reason: stateRow.pass_reason,
        match_score_cached: stateRow.match_score_cached,
      },
      events,
      firm,
    }
  })
}

export type InvestorPickerOption = {
  id: string
  label: string
  current_stage: PipelineRow['current_stage']
}

export async function listInvestorsForPicker(): Promise<
  { investors: InvestorPickerOption[] } | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: stateRows } = await supabase
      .from('investor_pipeline_state')
      .select('id, current_stage, marketplace_listing_id, investor_firm_id')
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
      .neq('current_stage', 'passed')
      .order('stage_entered_at', { ascending: false })
      .limit(200)

    const listingIds = (stateRows ?? [])
      .map((r) => r.marketplace_listing_id)
      .filter((id): id is string => !!id)

    const titleById = new Map<string, string>()
    if (listingIds.length > 0) {
      const { data: listings } = await supabase
        .from('marketplace_listings')
        .select('id, title')
        .in('id', listingIds)
      for (const l of listings ?? []) titleById.set(l.id, l.title)
    }

    const investors: InvestorPickerOption[] = (stateRows ?? []).map((r) => ({
      id: r.id,
      label: r.marketplace_listing_id ? titleById.get(r.marketplace_listing_id) ?? r.marketplace_listing_id : (r.investor_firm_id ?? 'Unnamed'),
      current_stage: r.current_stage as PipelineRow['current_stage'],
    }))

    return { investors }
  })
}

export async function passInvestor(input: {
  pipeline_state_id: string
  reason: string
  narrative?: string
}): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    const { data: state } = await supabase
      .from('investor_pipeline_state')
      .select('foundry_id, current_stage')
      .eq('id', input.pipeline_state_id)
      .maybeSingle()
    if (!state || state.foundry_id !== foundryId) return { error: 'Not found' }

    const { error } = await supabase
      .from('investor_pipeline_events')
      .insert({
        foundry_id: foundryId,
        pipeline_state_id: input.pipeline_state_id,
        event_type: 'pass',
        from_stage: state.current_stage,
        to_stage: 'passed',
        payload: { reason: input.reason, narrative: input.narrative ?? null },
        actor_user_id: user.id,
      })
    if (error) return { error: error.message }
    revalidatePath('/money/raise')
    return { success: true as const }
  })
}

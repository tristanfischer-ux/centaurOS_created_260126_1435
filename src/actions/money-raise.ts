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

// Join result — pipeline row + surfacing marketplace_listings so kanban cards
// can render the real firm name + badge instead of "Unnamed investor".
export type PipelineRowWithFirm = PipelineRow & {
  firm_title: string | null
  firm_subcategory: string | null
  firm_city: string | null
  firm_country: string | null
  firm_image_url: string | null
}

export type RaiseData = {
  activeRound: RaiseRound | null
  pipeline: PipelineRowWithFirm[]
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

    // Enrich pipeline rows with marketplace_listings for firm name + badges.
    // Single round-trip join via an IN() on the collected listing IDs.
    const listingIds = Array.from(
      new Set(
        (pipelineRows ?? [])
          .map((r) => r.marketplace_listing_id)
          .filter((v): v is string => !!v),
      ),
    )
    const firmById = new Map<
      string,
      { title: string | null; subcategory: string | null; city: string | null; country: string | null; image_url: string | null }
    >()
    if (listingIds.length > 0) {
      const { data: firms } = await supabase
        .from('marketplace_listings')
        .select('id, title, subcategory, city, country, image_url')
        .in('id', listingIds)
      for (const f of firms ?? []) {
        firmById.set(f.id, {
          title: f.title,
          subcategory: f.subcategory,
          city: f.city,
          country: f.country,
          image_url: f.image_url,
        })
      }
    }

    const pipeline: PipelineRowWithFirm[] = (pipelineRows ?? []).map((r) => {
      const firm = r.marketplace_listing_id ? firmById.get(r.marketplace_listing_id) : undefined
      return {
        ...(r as PipelineRow),
        firm_title: firm?.title ?? null,
        firm_subcategory: firm?.subcategory ?? null,
        firm_city: firm?.city ?? null,
        firm_country: firm?.country ?? null,
        firm_image_url: firm?.image_url ?? null,
      }
    })

    return {
      activeRound,
      pipeline,
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
  subcategory: string | null
  description: string | null
  website_url: string | null
  image_url: string | null
  city: string | null
  country: string | null
  country_iso: string | null
  industries: unknown
  specialties: unknown
  key_people: unknown
  contact_name: string | null
  contact_email: string | null
  contact_title: string | null
  contact_linkedin: string | null
  founded_year: number | null
  company_size: string | null
  last_enriched_at: string | null
}

export type PortfolioCompanyRow = {
  id: string
  company_name: string
  sector: string | null
  stage: string | null
  amount_usd: number | null
  investment_date: string | null
  description: string | null
  why_appealing: string | null
  source_url: string | null
}

export type NewsIntelRow = {
  id: string
  intel_summary: string | null
  key_signals: unknown
  current_focus: string | null
  recent_deals: unknown
  sources: unknown
  generated_at: string
}

export type InvestorDetail = {
  state: PipelineRow & {
    foundry_id: string
    stage_entered_at: string
  }
  events: PipelineEventRow[]
  firm: InvestorFirmInfo | null
  portfolio: PortfolioCompanyRow[]
  news: NewsIntelRow | null
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
    let portfolio: PortfolioCompanyRow[] = []
    let news: NewsIntelRow | null = null

    if (stateRow.marketplace_listing_id) {
      // Parallel fetch: firm + portfolio + news intel
      const [{ data: listing }, { data: portfolioRows }, { data: newsRow }] = await Promise.all([
        supabase
          .from('marketplace_listings')
          .select(
            'id, title, subcategory, description, website_url, image_url, city, country, country_iso, industries, specialties, key_people, contact_name, contact_email, contact_title, contact_linkedin, founded_year, company_size, last_enriched_at',
          )
          .eq('id', stateRow.marketplace_listing_id)
          .maybeSingle(),
        supabase
          .from('investor_portfolio_companies')
          .select(
            'id, company_name, sector, stage, amount_usd, investment_date, description, why_appealing, source_url',
          )
          .eq('listing_id', stateRow.marketplace_listing_id)
          .order('investment_date', { ascending: false, nullsFirst: false })
          .limit(20),
        supabase
          .from('investor_news_intel')
          .select('id, intel_summary, key_signals, current_focus, recent_deals, sources, generated_at')
          .eq('listing_id', stateRow.marketplace_listing_id)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (listing) {
        firm = {
          marketplace_listing_id: listing.id,
          title: listing.title,
          subcategory: listing.subcategory,
          description: listing.description,
          website_url: listing.website_url,
          image_url: listing.image_url,
          city: listing.city,
          country: listing.country,
          country_iso: listing.country_iso,
          industries: listing.industries,
          specialties: listing.specialties,
          key_people: listing.key_people,
          contact_name: listing.contact_name,
          contact_email: listing.contact_email,
          contact_title: listing.contact_title,
          contact_linkedin: listing.contact_linkedin,
          founded_year: listing.founded_year,
          company_size: listing.company_size,
          last_enriched_at: listing.last_enriched_at,
        }
      }
      portfolio = (portfolioRows ?? []) as PortfolioCompanyRow[]
      if (newsRow) {
        news = {
          id: newsRow.id,
          intel_summary: newsRow.intel_summary,
          key_signals: newsRow.key_signals,
          current_focus: newsRow.current_focus,
          recent_deals: newsRow.recent_deals,
          sources: newsRow.sources,
          generated_at: newsRow.generated_at,
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
      portfolio,
      news,
    }
  })
}

// ============================================================================
// Investor directory ↔ Raise — browse + add-to-pipeline
// ============================================================================

export type BrowseInvestorFilters = {
  query?: string
  subcategory?: string
  country?: string
  limit?: number
  offset?: number
}

export type BrowseInvestorRow = {
  id: string
  title: string | null
  subcategory: string | null
  description: string | null
  image_url: string | null
  city: string | null
  country: string | null
  website_url: string | null
  already_in_pipeline: boolean
  pipeline_state_id: string | null
  pipeline_stage: string | null
}

export type BrowseInvestorsResult = {
  rows: BrowseInvestorRow[]
  total: number
  hasMore: boolean
}

/**
 * Browse the `marketplace_listings` Finance directory from inside Money/Raise.
 * Surfaces the ~7,500 investor rows (VC Funds / PE Firms / Accelerators /
 * Family Offices / Corporate Venture / Advisory / Other) with a client-
 * selectable subcategory + country + free-text filter. `already_in_pipeline`
 * is set when the calling foundry already has an `investor_pipeline_state`
 * row pointing at that listing, so the UI can show "In pipeline" instead of
 * "Add to pipeline".
 */
export async function browseInvestorsForMoney(
  filters: BrowseInvestorFilters = {},
): Promise<BrowseInvestorsResult | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100)
    const offset = Math.max(filters.offset ?? 0, 0)

    let query = supabase
      .from('marketplace_listings')
      .select(
        'id, title, subcategory, description, image_url, city, country, website_url',
        { count: 'exact' },
      )
      .eq('category', 'Finance')
      .not('title', 'is', null)

    if (filters.subcategory && filters.subcategory !== 'all') {
      query = query.eq('subcategory', filters.subcategory)
    }
    if (filters.country) {
      query = query.ilike('country', `%${filters.country}%`)
    }
    if (filters.query && filters.query.trim()) {
      // Sanitize the free-text filter to keep postgrest .or() safe — alpha-
      // numeric + spaces only (protects against injection in .or() filter).
      const safe = filters.query.trim().replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 60)
      if (safe) {
        query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
      }
    }

    query = query.order('title', { ascending: true }).range(offset, offset + limit - 1)

    const { data: listings, count, error } = await query
    if (error) return { error: error.message }

    const ids = (listings ?? []).map((l) => l.id)
    const stateByListing = new Map<string, { id: string; current_stage: string }>()
    if (ids.length > 0) {
      const { data: states } = await supabase
        .from('investor_pipeline_state')
        .select('id, marketplace_listing_id, current_stage')
        .eq('foundry_id', foundryId)
        .in('marketplace_listing_id', ids)
        .is('archived_at', null)
      for (const s of states ?? []) {
        if (s.marketplace_listing_id) {
          stateByListing.set(s.marketplace_listing_id, {
            id: s.id,
            current_stage: s.current_stage,
          })
        }
      }
    }

    const rows: BrowseInvestorRow[] = (listings ?? []).map((l) => {
      const state = stateByListing.get(l.id)
      return {
        id: l.id,
        title: l.title,
        subcategory: l.subcategory,
        description: l.description,
        image_url: l.image_url,
        city: l.city,
        country: l.country,
        website_url: l.website_url,
        already_in_pipeline: !!state,
        pipeline_state_id: state?.id ?? null,
        pipeline_stage: state?.current_stage ?? null,
      }
    })

    const total = count ?? rows.length
    return { rows, total, hasMore: offset + rows.length < total }
  })
}

/**
 * Add a marketplace_listings row to the caller's pipeline. Creates a new
 * investor_pipeline_state row with current_stage='target' and assigns it to
 * the currently-active round (if any). If the investor is already in the
 * pipeline, returns the existing state id.
 */
export async function addInvestorToPipeline(input: {
  marketplace_listing_id: string
  round_id?: string
}): Promise<{ pipeline_state_id: string; already_existed: boolean } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Resolve target round: explicit > active > none
    let roundId: string | null = input.round_id ?? null
    if (!roundId) {
      const { data: activeRound } = await supabase
        .from('investor_round')
        .select('id')
        .eq('foundry_id', foundryId)
        .eq('state', 'active')
        .is('archived_at', null)
        .maybeSingle()
      roundId = activeRound?.id ?? null
    }

    // Idempotency: if this foundry already has a non-archived pipeline row
    // for this listing, return it instead of creating a duplicate.
    const { data: existing } = await supabase
      .from('investor_pipeline_state')
      .select('id')
      .eq('foundry_id', foundryId)
      .eq('marketplace_listing_id', input.marketplace_listing_id)
      .is('archived_at', null)
      .maybeSingle()
    if (existing) {
      return { pipeline_state_id: existing.id, already_existed: true }
    }

    const { data, error } = await supabase
      .from('investor_pipeline_state')
      .insert({
        foundry_id: foundryId,
        round_id: roundId,
        marketplace_listing_id: input.marketplace_listing_id,
        current_stage: 'target',
        stage_entered_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error || !data) return { error: error?.message ?? 'Add to pipeline failed' }

    revalidatePath('/money/raise')
    revalidatePath('/money/raise/browse')
    return { pipeline_state_id: data.id, already_existed: false }
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

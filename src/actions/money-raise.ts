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
import { scoreListing } from '@/lib/money/match-score'
import type {
  MatchBreakdown,
  MatchThesis,
  RichInvestorFilters,
  ScoredListingRow,
} from '@/lib/money/match-types'
import { searchMarketplaceListingsSemantic } from '@/lib/search/semantic-search'
import { sanitizeFilterValue } from '@/lib/security/sanitize-filter'
import { getInvestorTierAccess } from '@/actions/investors'
import { extractThesisFromBusinessPlan } from '@/actions/money-thesis'

export async function extractThesisFromText(text: string): Promise<{ thesis: MatchThesis } | { error: string }> {
  const result = await extractThesisFromBusinessPlan({ text });
  if ('error' in result) {
    return { error: result.error };
  }
  const extracted = result.extracted;
  const thesis: MatchThesis = {
    stage_tags: extracted.stage_tags,
    sector_tags: extracted.sector_tags,
    geography: extracted.geography,
    cheque_min_cents: extracted.cheque_min_cents,
    cheque_max_cents: extracted.cheque_max_cents,
    keywords: extracted.keywords,
    instrument: extracted.instrument,
    lead_or_follower: null,
  };
  return { thesis };
}

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

// ============================================================================
// Intel: thesis-based scoring, semantic search, contacts-by-firm
// ============================================================================

/**
 * Columns needed to run `scoreListing` + build `ScoredListingRow`. Selected
 * narrowly to keep React Flight payloads small — no products/materials/equipment
 * JSONB blobs, no embedding vector, no search_vector.
 */
const SCOREABLE_LISTING_COLUMNS =
  'id, title, subcategory, description, image_url, website_url, city, country, country_iso, data_quality_score, last_enriched_at, attributes' as const

type ScoreableListingSelect =
  Pick<
    import('@/types/database.types').Database['public']['Tables']['marketplace_listings']['Row'],
    | 'id'
    | 'title'
    | 'subcategory'
    | 'description'
    | 'image_url'
    | 'website_url'
    | 'city'
    | 'country'
    | 'country_iso'
    | 'data_quality_score'
    | 'last_enriched_at'
    | 'attributes'
  >

/**
 * Trim a raw marketplace_listings row down to the UI-safe `ScoredListingRow`
 * shape (no massive JSON blobs, no embedding vectors).
 */
function toScoredListingRow(row: ScoreableListingSelect): ScoredListingRow {
  const attrs =
    row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes)
      ? (row.attributes as Record<string, unknown>)
      : {}

  const asStrArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

  const cheque = attrs.cheque_range_gbp
  const chequeRange =
    cheque && typeof cheque === 'object' && !Array.isArray(cheque)
      ? (() => {
          const c = cheque as Record<string, unknown>
          const min = typeof c.min === 'number' ? c.min : null
          const max = typeof c.max === 'number' ? c.max : null
          return min == null && max == null ? null : { min, max }
        })()
      : null

  return {
    id: row.id,
    title: row.title,
    subcategory: row.subcategory,
    description: row.description,
    image_url: row.image_url,
    website_url: row.website_url,
    city: row.city,
    country: row.country,
    country_iso: row.country_iso,
    data_quality_score: row.data_quality_score ?? null,
    last_enriched_at: row.last_enriched_at,
    highlights: {
      investment_thesis: typeof attrs.investment_thesis === 'string' ? attrs.investment_thesis : null,
      ideal_company_profile:
        typeof attrs.ideal_company_profile === 'string' ? attrs.ideal_company_profile : null,
      firm_type: typeof attrs.firm_type === 'string' ? attrs.firm_type : null,
      fund_size_gbp: typeof attrs.fund_size_gbp === 'number' ? attrs.fund_size_gbp : null,
      cheque_range_gbp: chequeRange,
      stage_focus: asStrArr(attrs.stage_focus),
      sectors: asStrArr(attrs.sectors),
      geo_focus: asStrArr(attrs.geo_focus),
      is_active_deploying:
        typeof attrs.is_active_deploying === 'boolean' ? attrs.is_active_deploying : null,
    },
  }
}

type ListingQuery = ReturnType<
  Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>['from']
> extends {
  select: (...args: unknown[]) => infer Q
}
  ? Q
  : never

/**
 * Apply rich filters to a supabase query builder. Mutates + returns the query.
 * Handles both top-level columns (subcategory, country_iso) and JSONB filters
 * (stage_focus, sectors, firm_type, fund_size_gbp) — matching the legacy
 * `searchInvestors` semantics from `src/actions/investors.ts`.
 */
function applyRichFilters<Q extends {
  in: (col: string, vals: string[]) => Q
  or: (expr: string) => Q
  filter: (col: string, op: string, val: unknown) => Q
}>(query: Q, filters: RichInvestorFilters): Q {
  let q = query

  if (filters.subcategory && filters.subcategory.length > 0) {
    q = q.in('subcategory', filters.subcategory)
  }
  if (filters.country && filters.country.length > 0) {
    // country_iso is top-level (populated by 2026-04-18 migration)
    q = q.in('country_iso', filters.country)
  }
  if (filters.firm_type && filters.firm_type.length > 0) {
    const types = filters.firm_type
      .map((t) => sanitizeFilterValue(t))
      .filter(Boolean)
    if (types.length > 0) {
      q = q.or(types.map((t) => `attributes->>firm_type.eq.${t}`).join(','))
    }
  }
  if (filters.stage && filters.stage.length > 0) {
    const stageFilters = filters.stage
      .map((s) => `attributes->stage_focus.cs.["${sanitizeFilterValue(s)}"]`)
      .filter((s) => s.length > 'attributes->stage_focus.cs.[""]'.length)
    if (stageFilters.length > 0) q = q.or(stageFilters.join(','))
  }
  if (filters.sector && filters.sector.length > 0) {
    const sectorFilters = filters.sector
      .map((s) => `attributes->sectors.cs.["${sanitizeFilterValue(s)}"]`)
      .filter((s) => s.length > 'attributes->sectors.cs.[""]'.length)
    if (sectorFilters.length > 0) q = q.or(sectorFilters.join(','))
  }
  // Cheque in cents → firm range is GBP whole units. Divide by 100 for the cmp.
  if (filters.cheque_min_cents != null) {
    q = q.filter('attributes->cheque_range_gbp->max', 'gte', Math.floor(filters.cheque_min_cents / 100))
  }
  if (filters.cheque_max_cents != null) {
    q = q.filter('attributes->cheque_range_gbp->min', 'lte', Math.ceil(filters.cheque_max_cents / 100))
  }
  if (filters.fund_size_min_cents != null) {
    q = q.filter('attributes->fund_size_gbp', 'gte', Math.floor(filters.fund_size_min_cents / 100))
  }
  if (filters.fund_size_max_cents != null) {
    q = q.filter('attributes->fund_size_gbp', 'lte', Math.ceil(filters.fund_size_max_cents / 100))
  }

  return q
}

/**
 * Resolve the foundry's active `investor_thesis` row → `MatchThesis`. Returns
 * null + version if no active thesis is set.
 */
async function loadActiveThesisForScoring(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  foundryId: string,
): Promise<{ thesis: MatchThesis; id: string; version: number } | null> {
  const { data: foundry } = await supabase
    .from('foundries')
    .select('active_thesis_id')
    .eq('id', foundryId)
    .maybeSingle()
  const activeId = foundry?.active_thesis_id ?? null
  if (!activeId) return null

  const { data: row } = await supabase
    .from('investor_thesis')
    .select(
      'id, version, stage_tags, sector_tags, geography, cheque_min_cents, cheque_max_cents, keywords, preferred_instrument, lead_follower_pref',
    )
    .eq('id', activeId)
    .eq('foundry_id', foundryId)
    .maybeSingle()
  if (!row) return null

  const leadPref = row.lead_follower_pref ?? 'either'
  const leadOrFollower: MatchThesis['lead_or_follower'] =
    leadPref === 'lead' || leadPref === 'follower' || leadPref === 'both' ? leadPref : null

  const thesis: MatchThesis = {
    stage_tags: row.stage_tags ?? [],
    sector_tags: row.sector_tags ?? [],
    geography: row.geography ?? [],
    cheque_min_cents: row.cheque_min_cents,
    cheque_max_cents: row.cheque_max_cents,
    keywords: row.keywords ?? [],
    instrument:
      Array.isArray(row.preferred_instrument) && row.preferred_instrument.length > 0
        ? row.preferred_instrument[0]
        : null,
    lead_or_follower: leadOrFollower,
  }
  return { thesis, id: row.id, version: row.version }
}

/**
 * Score up to `limit` investors against the foundry's active thesis. Scored
 * results are written back to `investor_pipeline_state` for any listing the
 * foundry is already tracking (cache refresh). Returns a trimmed payload safe
 * to ship through React Flight.
 */
export async function scoreInvestorsAgainstThesis(args: {
  limit?: number
  filters?: RichInvestorFilters
  overrideThesis?: MatchThesis
  listingIds?: string[]
}): Promise<
  | { error: string }
  | {
      success: true
      thesis_id: string
      scored: Array<{
        listing: ScoredListingRow
        breakdown: MatchBreakdown
        cached_score: number | null
      }>
    }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200)
    const filters = args.filters ?? {}

    let activeThesis: MatchThesis | null = null
    let thesisId: string = ''
    let thesisVersion: number = 0

    if (args.overrideThesis) {
      activeThesis = args.overrideThesis
      thesisId = 'override'
    } else {
      const active = await loadActiveThesisForScoring(supabase, foundryId)
      if (!active) return { error: 'no_active_thesis' }
      activeThesis = active.thesis
      thesisId = active.id
      thesisVersion = active.version
    }

    // Cap candidate set at 200 to bound scoring work per call.
    let candidatesQuery = supabase
      .from('marketplace_listings')
      .select(SCOREABLE_LISTING_COLUMNS)
      .eq('category', 'Finance')
      .not('title', 'is', null)

    if (args.listingIds && args.listingIds.length > 0) {
      candidatesQuery = candidatesQuery.in('id', args.listingIds)
    } else {
      candidatesQuery = applyRichFilters(candidatesQuery, filters)
      candidatesQuery = candidatesQuery
        .order('data_quality_score', { ascending: false })
        .limit(200)
    }

    const { data: candidates, error } = await candidatesQuery
    if (error) return { error: error.message }

    const rows = (candidates ?? []) as ScoreableListingSelect[]
    const now = new Date()
    const scored = rows.map((row) => ({
      row,
      breakdown: scoreListing(row, activeThesis!, { now }),
    }))
    scored.sort((a, b) => b.breakdown.total - a.breakdown.total)
    const top = scored.slice(0, limit)

    // Cache into investor_pipeline_state for any listing the foundry already tracks.
    const listingIds = top.map((s) => s.row.id)
    if (listingIds.length > 0 && !args.overrideThesis) {
      const { data: existing } = await supabase
        .from('investor_pipeline_state')
        .select('id, marketplace_listing_id')
        .eq('foundry_id', foundryId)
        .in('marketplace_listing_id', listingIds)
        .is('archived_at', null)
      const stateByListing = new Map<string, string>()
      for (const s of existing ?? []) {
        if (s.marketplace_listing_id) stateByListing.set(s.marketplace_listing_id, s.id)
      }

      // Fire-and-forget: write the breakdown back. Errors are logged but do
      // not fail the action — scoring is not a correctness gate.
      const scoredAt = now.toISOString()
      const cacheWrites = top
        .filter((s) => stateByListing.has(s.row.id))
        .map(async (s) => {
          const stateId = stateByListing.get(s.row.id)
          if (!stateId) return
          const { error: upErr } = await supabase
            .from('investor_pipeline_state')
            .update({
              match_score_cached: s.breakdown.total,
              match_breakdown_json: JSON.parse(JSON.stringify(s.breakdown)),
              match_scored_at: scoredAt,
              match_score_computed_at: scoredAt,
              match_score_thesis_version: thesisVersion,
            })
            .eq('id', stateId)
            .eq('foundry_id', foundryId)
          if (upErr) {
            console.warn('[scoreInvestorsAgainstThesis] cache write failed', upErr.message)
          }
        })
      await Promise.all(cacheWrites)
    }

    // Fetch existing cached scores (for listings NOT in pipeline we return null).
    const cachedById = new Map<string, number | null>()
    if (listingIds.length > 0) {
      const { data: stateRows } = await supabase
        .from('investor_pipeline_state')
        .select('marketplace_listing_id, match_score_cached')
        .eq('foundry_id', foundryId)
        .in('marketplace_listing_id', listingIds)
        .is('archived_at', null)
      for (const r of stateRows ?? []) {
        if (r.marketplace_listing_id) {
          cachedById.set(r.marketplace_listing_id, r.match_score_cached ?? null)
        }
      }
    }

    return {
      success: true as const,
      thesis_id: thesisId,
      scored: top.map(({ row, breakdown }) => ({
        listing: toScoredListingRow(row),
        breakdown,
        cached_score: cachedById.has(row.id) ? cachedById.get(row.id) ?? null : null,
      })),
    }
  })
}

/**
 * Search the Finance investor directory by semantic similarity where possible,
 * falling back to ilike on title/description/thesis text. Applies rich filters
 * in both paths.
 */
export async function searchInvestorsSemantic(args: {
  query?: string
  filters?: RichInvestorFilters
  limit?: number
  offset?: number
}): Promise<
  | { error: string }
  | {
      success: true
      results: ScoredListingRow[]
      total: number
      mode: 'semantic' | 'ilike'
    }
> {
  return withAuth(async ({ supabase }) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100)
    const offset = Math.max(args.offset ?? 0, 0)
    const filters = args.filters ?? {}
    const query = (args.query ?? '').trim()

    // Semantic path — only if we have query text. Graceful fallback on any
    // error (missing embedding / missing API key / RPC failure → ilike).
    if (query.length >= 3) {
      const hits = await searchMarketplaceListingsSemantic(query, {
        matchThreshold: 0.35,
        matchCount: Math.min(200, limit + offset + 50),
      })
      if (hits.length > 0) {
        // Hydrate the hits with the full SCOREABLE columns + apply filters.
        const ids = hits.map((h) => h.id)
        let hydrateQuery = supabase
          .from('marketplace_listings')
          .select(SCOREABLE_LISTING_COLUMNS)
          .eq('category', 'Finance')
          .in('id', ids)
        hydrateQuery = applyRichFilters(hydrateQuery, filters)
        const { data: rows, error: hydrateErr } = await hydrateQuery
        if (!hydrateErr && rows) {
          // Preserve semantic ordering.
          const order = new Map<string, number>()
          hits.forEach((h, i) => order.set(h.id, i))
          const sorted = (rows as ScoreableListingSelect[]).sort(
            (a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999),
          )
          const paged = sorted.slice(offset, offset + limit)
          return {
            success: true as const,
            results: paged.map(toScoredListingRow),
            total: sorted.length,
            mode: 'semantic' as const,
          }
        }
      }
    }

    // ilike fallback — same filter semantics, paginated via range().
    let fallback = supabase
      .from('marketplace_listings')
      .select(SCOREABLE_LISTING_COLUMNS, { count: 'exact' })
      .eq('category', 'Finance')
      .not('title', 'is', null)
    fallback = applyRichFilters(fallback, filters)
    if (query) {
      const safe = sanitizeFilterValue(query).slice(0, 60)
      if (safe) {
        fallback = fallback.or(
          [
            `title.ilike.%${safe}%`,
            `description.ilike.%${safe}%`,
            `attributes->>investment_thesis.ilike.%${safe}%`,
            `attributes->>ideal_company_profile.ilike.%${safe}%`,
          ].join(','),
        )
      }
    }
    fallback = fallback
      .order('data_quality_score', { ascending: false })
      .range(offset, offset + limit - 1)
    const { data, count, error } = await fallback
    if (error) return { error: error.message }

    const results = ((data ?? []) as ScoreableListingSelect[]).map(toScoredListingRow)
    return {
      success: true as const,
      results,
      total: count ?? results.length,
      mode: 'ilike' as const,
    }
  })
}

/**
 * List people-level contacts belonging to an investor firm (marketplace_listing).
 * Uses admin client because vc_pe_contacts is typically service-role readable
 * only (no user-level RLS for cross-firm reads). The firm id is the caller-
 * supplied listing id — we still gate the action behind `withAuth` so only
 * authenticated platform users can call it.
 */
export async function listInvestorContactsByFirm(firmId: string): Promise<
  | { error: string }
  | {
      success: true
      contacts: Array<{
        id: string
        name: string
        title: string | null
        email: string | null
        linkedin_url: string | null
        seniority?: string | null
      }>
    }
> {
  return withAuth(async () => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(firmId)) return { error: 'Invalid firm id' }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('vc_pe_contacts')
      .select('id, full_name, title, email, linkedin_url, seniority, is_decision_maker')
      .eq('listing_id', firmId)
      .order('is_decision_maker', { ascending: false })
      .order('full_name', { ascending: true })
      .limit(100)

    if (error) return { error: error.message }

    const contacts = (data ?? []).map((c) => ({
      id: c.id,
      name: c.full_name,
      title: c.title,
      email: c.email,
      linkedin_url: c.linkedin_url,
      seniority: c.seniority,
    }))
    return { success: true as const, contacts }
  })
}

// ============================================================================
// CSV Exports — browse / matched / pipeline
// ============================================================================

/**
 * RFC 4180 CSV field escape. Wraps values containing commas / quotes / newlines
 * in double quotes and doubles internal quotes. Also neutralises formula
 * injection (leading =, +, -, @, tab, CR, LF) by prefixing a single quote so
 * Excel / Sheets do not evaluate the cell.
 */
function csvField(value: unknown): string {
  let s =
    value == null
      ? ''
      : typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : String(value)
  if (/^[=+\-@\t\r\n]/.test(s)) {
    s = "'" + s
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function csvRow(fields: unknown[]): string {
  return fields.map(csvField).join(',')
}

function truncateThesis(value: string | null | undefined, max = 300): string {
  if (!value) return ''
  const flat = value.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return flat.slice(0, max - 1) + '…'
}

function exportTimestampSlug(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
}

const EXPORT_INVESTOR_HEADERS = [
  'Firm name',
  'Subcategory',
  'Country',
  'Stage focus',
  'Sectors',
  'Min cheque (GBP)',
  'Max cheque (GBP)',
  'Fund type',
  'Investment thesis',
  'Website',
  'Last enriched',
] as const

const EXPORT_PIPELINE_HEADERS = [
  'Firm name',
  'Subcategory',
  'Country',
  'Current stage',
  'Last touch type',
  'Last touch at',
  'Match score',
  'Notes summary',
] as const

const PIPELINE_STAGE_LABEL: Record<PipelineRow['current_stage'], string> = {
  target: 'Target',
  researching: 'Researching',
  contacted: 'Contacted',
  meeting: 'Meeting',
  due_diligence: 'Due diligence',
  verbal: 'Verbal',
  closed: 'Closed',
  passed: 'Passed',
}

function listingToInvestorRow(
  row: ScoredListingRow,
  matchScore: number | null,
  includeMatchScore: boolean,
): unknown[] {
  const h = row.highlights
  const cheque = h.cheque_range_gbp
  const base = [
    row.title ?? '',
    row.subcategory ?? '',
    row.country_iso ?? row.country ?? '',
    (h.stage_focus ?? []).join('; '),
    (h.sectors ?? []).join('; '),
    cheque?.min != null ? cheque.min : '',
    cheque?.max != null ? cheque.max : '',
    h.firm_type ?? '',
    truncateThesis(h.investment_thesis),
    row.website_url ?? '',
    row.last_enriched_at ?? '',
  ]
  if (includeMatchScore) base.push(matchScore != null ? matchScore : '')
  return base
}

/**
 * CSV export of a filtered browse result set. Uses the same
 * searchInvestorsSemantic path as /money/raise/browse so exports reflect
 * exactly what the user sees. Starter+ tier only.
 */
export async function exportInvestorsCsv(args: {
  query?: string
  filters?: RichInvestorFilters
  limit?: number
  includeMatchScore?: boolean
}): Promise<{ error: string } | { success: true; filename: string; csv: string }> {
  return withAuth(async () => {
    const access = await getInvestorTierAccess()
    if (!access.detailAccess) {
      return { error: 'tier_upgrade_required' }
    }

    const limit = Math.min(Math.max(args.limit ?? 500, 1), 500)
    const includeMatchScore = !!args.includeMatchScore

    const search = await searchInvestorsSemantic({
      query: args.query,
      filters: args.filters,
      limit,
      offset: 0,
    })
    if ('error' in search) return { error: search.error }

    const scoresByListingId: Record<string, number> = {}
    if (includeMatchScore) {
      const scored = await scoreInvestorsAgainstThesis({
        limit: 500,
        filters: args.filters,
      })
      if (!('error' in scored)) {
        for (const s of scored.scored) {
          scoresByListingId[s.listing.id] = s.breakdown.total
        }
      } else if (scored.error !== 'no_active_thesis') {
        // Missing thesis is expected + recoverable — just skip the column data.
        // Any other error means scoring infra is broken; surface it.
        return { error: scored.error }
      }
    }

    const headers = includeMatchScore
      ? [...EXPORT_INVESTOR_HEADERS, 'Match score']
      : [...EXPORT_INVESTOR_HEADERS]

    const lines: string[] = [csvRow(headers)]
    for (const row of search.results) {
      const score = scoresByListingId[row.id] ?? null
      lines.push(csvRow(listingToInvestorRow(row, score, includeMatchScore)))
    }

    // UTF-8 BOM so Excel detects the encoding correctly on Windows.
    const csv = '\uFEFF' + lines.join('\r\n')
    const filename = `investors-${exportTimestampSlug()}.csv`
    return { success: true as const, filename, csv }
  })
}

/**
 * CSV export of the top-N thesis-matched investors. Requires an active thesis
 * and Starter+ tier.
 */
export async function exportMatchedCsv(args: {
  limit?: number
}): Promise<{ error: string } | { success: true; filename: string; csv: string }> {
  return withAuth(async () => {
    const access = await getInvestorTierAccess()
    if (!access.detailAccess) {
      return { error: 'tier_upgrade_required' }
    }

    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500)
    const scored = await scoreInvestorsAgainstThesis({ limit })
    if ('error' in scored) return { error: scored.error }

    const headers = [...EXPORT_INVESTOR_HEADERS, 'Match score']
    const lines: string[] = [csvRow(headers)]
    for (const s of scored.scored) {
      lines.push(csvRow(listingToInvestorRow(s.listing, s.breakdown.total, true)))
    }

    const csv = '\uFEFF' + lines.join('\r\n')
    const filename = `investors-matched-${exportTimestampSlug()}.csv`
    return { success: true as const, filename, csv }
  })
}

/**
 * CSV export of the caller's own pipeline — all stages, non-archived. Free
 * tier is allowed because the pipeline is the founder's own data.
 */
export async function exportPipelineCsv(): Promise<
  { error: string } | { success: true; filename: string; csv: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Pull pipeline rows (full foundry scope — no round filter, all stages
    // including passed so founders can export the complete history).
    const { data: pipelineRows, error } = await supabase
      .from('investor_pipeline_state')
      .select(
        'id, marketplace_listing_id, current_stage, match_score_cached',
      )
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
      .order('stage_entered_at', { ascending: false })
    if (error) return { error: error.message }

    const rows = pipelineRows ?? []
    const listingIds = Array.from(
      new Set(
        rows
          .map((r) => r.marketplace_listing_id)
          .filter((v): v is string => !!v),
      ),
    )
    const stateIds = rows.map((r) => r.id)

    type FirmFacts = { title: string | null; subcategory: string | null; country: string | null; country_iso: string | null }
    const firmById = new Map<string, FirmFacts>()
    if (listingIds.length > 0) {
      const { data: firms } = await supabase
        .from('marketplace_listings')
        .select('id, title, subcategory, country, country_iso')
        .in('id', listingIds)
      for (const f of firms ?? []) {
        firmById.set(f.id, {
          title: f.title,
          subcategory: f.subcategory,
          country: f.country,
          country_iso: f.country_iso,
        })
      }
    }

    // Latest touch (touch_logged) + latest free-text note per pipeline row.
    type LastTouch = { type: string; at: string }
    const lastTouchByState = new Map<string, LastTouch>()
    const notesByState = new Map<string, string>()
    if (stateIds.length > 0) {
      const { data: events } = await supabase
        .from('investor_pipeline_events')
        .select('pipeline_state_id, event_type, payload, created_at')
        .in('pipeline_state_id', stateIds)
        .eq('foundry_id', foundryId)
        .order('created_at', { ascending: false })
      for (const e of events ?? []) {
        if (e.event_type === 'touch_logged' && !lastTouchByState.has(e.pipeline_state_id)) {
          const payload = asJsonObject(e.payload)
          const type = typeof payload.type === 'string' ? payload.type : 'touch'
          const at = typeof payload.date === 'string' ? payload.date : e.created_at
          lastTouchByState.set(e.pipeline_state_id, { type, at })
        }
        if (e.event_type === 'note' && !notesByState.has(e.pipeline_state_id)) {
          const payload = asJsonObject(e.payload)
          const body = typeof payload.notes === 'string'
            ? payload.notes
            : typeof payload.body === 'string'
              ? payload.body
              : ''
          if (body) notesByState.set(e.pipeline_state_id, truncateThesis(body))
        }
      }
    }

    const lines: string[] = [csvRow([...EXPORT_PIPELINE_HEADERS])]
    for (const r of rows) {
      const firm = r.marketplace_listing_id ? firmById.get(r.marketplace_listing_id) : undefined
      const lastTouch = lastTouchByState.get(r.id)
      const stage = r.current_stage as PipelineRow['current_stage']
      lines.push(
        csvRow([
          firm?.title ?? '',
          firm?.subcategory ?? '',
          firm?.country_iso ?? firm?.country ?? '',
          PIPELINE_STAGE_LABEL[stage] ?? stage,
          lastTouch?.type ?? '',
          lastTouch?.at ?? '',
          r.match_score_cached ?? '',
          notesByState.get(r.id) ?? '',
        ]),
      )
    }

    const csv = '\uFEFF' + lines.join('\r\n')
    const filename = `pipeline-${exportTimestampSlug()}.csv`
    return { success: true as const, filename, csv }
  })
}

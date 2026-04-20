import { getInvestorDetail, listInvestorContactsByFirm } from '@/actions/money-raise'
import { createClient } from '@/lib/supabase/server'
import type { MatchBreakdown } from '@/lib/money/match-types'
import { InvestorDetailView, type FirmAttributes } from './investor-detail-view'
import type { FirmContact } from './contact-detail-dialog'

export const dynamic = 'force-dynamic'

/**
 * Extract the rich-attribute subset we surface from `marketplace_listings.attributes`.
 * The JSONB column is loose — everything here is defensively typed.
 */
function extractFirmAttributes(attrs: unknown): FirmAttributes {
  const obj =
    attrs && typeof attrs === 'object' && !Array.isArray(attrs)
      ? (attrs as Record<string, unknown>)
      : {}

  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

  const cheque = obj.cheque_range_gbp
  const chequeRange =
    cheque && typeof cheque === 'object' && !Array.isArray(cheque)
      ? (() => {
          const c = cheque as Record<string, unknown>
          return {
            min: typeof c.min === 'number' ? c.min : null,
            max: typeof c.max === 'number' ? c.max : null,
          }
        })()
      : null

  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

  return {
    investment_thesis: str(obj.investment_thesis),
    ideal_company_profile: str(obj.ideal_company_profile),
    value_add: str(obj.value_add),
    firm_type: str(obj.firm_type),
    fund_size_gbp: num(obj.fund_size_gbp),
    cheque_range_gbp: chequeRange,
    stage_focus: strArr(obj.stage_focus),
    sectors: strArr(obj.sectors),
    geo_focus: strArr(obj.geo_focus),
    is_active_deploying:
      typeof obj.is_active_deploying === 'boolean' ? obj.is_active_deploying : null,
    hardware_fit_score: num(obj.hardware_fit_score),
    investment_pattern: str(obj.investment_pattern),
    connection_brief: str(obj.connection_brief),
    warm_intro_paths: obj.warm_intro_paths ?? null,
    fund_performance: obj.fund_performance ?? null,
    fund_history: obj.fund_history ?? null,
    exits: obj.exits ?? null,
    recent_deals: obj.recent_deals ?? null,
    recent_deals_summary: str(obj.recent_deals_summary),
    data_source: str(obj.data_source),
  }
}

/**
 * Parse the cached match_breakdown_json into the typed MatchBreakdown shape
 * (or null if the shape is unexpected). Pipeline-state writes these rows, so
 * drift is possible across schema revisions — fail soft rather than throw.
 */
function parseMatchBreakdown(raw: unknown): MatchBreakdown | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.total !== 'number') return null
  const pillars = r.pillars as Record<string, unknown> | undefined
  if (!pillars || typeof pillars !== 'object') return null
  const p = (key: string): number =>
    typeof pillars[key] === 'number' ? (pillars[key] as number) : 0
  const reasons = Array.isArray(r.reasons)
    ? (r.reasons as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  return {
    total: r.total,
    pillars: {
      thesis: p('thesis'),
      geography: p('geography'),
      stage: p('stage'),
      cheque: p('cheque'),
      activity: p('activity'),
      confidence: p('confidence'),
    },
    reasons,
  }
}

export default async function InvestorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getInvestorDetail(id)
  if ('error' in detail) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{detail.error}</p>
      </div>
    )
  }

  // Fan out in parallel:
  //   - partner list (vc_pe_contacts) via the action we already audited
  //   - rich `attributes` + data_quality_score from marketplace_listings
  //   - cached match breakdown from the foundry's pipeline row
  const listingId = detail.state.marketplace_listing_id
  const [contactsRes, richRes, matchRes] = await Promise.all([
    listingId
      ? listInvestorContactsByFirm(listingId)
      : Promise.resolve({ success: true as const, contacts: [] as FirmContact[] }),
    (async () => {
      if (!listingId) return null
      const supabase = await createClient()
      const { data } = await supabase
        .from('marketplace_listings')
        .select('attributes, data_quality_score')
        .eq('id', listingId)
        .maybeSingle()
      return data
    })(),
    (async () => {
      const supabase = await createClient()
      // `match_breakdown_json` exists in DB (migration 20260423000000) but
      // regenerated types lag — cast to unknown before reading the field.
      const { data } = await supabase
        .from('investor_pipeline_state')
        .select('match_breakdown_json' as '*')
        .eq('id', detail.state.id)
        .maybeSingle()
      return data as { match_breakdown_json: unknown } | null
    })(),
  ])

  const contacts: FirmContact[] =
    'error' in contactsRes ? [] : contactsRes.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title,
      email: c.email,
      linkedin_url: c.linkedin_url,
      seniority: c.seniority ?? null,
    }))

  const firmAttributes = extractFirmAttributes(richRes?.attributes ?? null)
  const dataQualityScore =
    typeof richRes?.data_quality_score === 'number' ? richRes.data_quality_score : null
  const matchBreakdown = parseMatchBreakdown(matchRes?.match_breakdown_json ?? null)

  return (
    <InvestorDetailView
      detail={detail}
      contacts={contacts}
      firmAttributes={firmAttributes}
      dataQualityScore={dataQualityScore}
      matchBreakdown={matchBreakdown}
    />
  )
}

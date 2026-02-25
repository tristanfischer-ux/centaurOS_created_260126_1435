/**
 * @file sales-pipeline.ts
 *
 * @description Fetches sales pipeline data for the report sales-pipeline section.
 * Aggregates across outreach_campaigns, outreach_contacts, outreach_emails,
 * rfq_broadcasts, rfq_responses, and discovery_calls.
 *
 * @related
 * - src/actions/report-generator.ts — Orchestrates this fetcher
 * - src/lib/reports/report-document-types.ts — SalesPipelineSectionData
 */

import type { createClient } from '@/lib/supabase/server'
import type { SalesPipelineSectionData } from '@/lib/reports/report-document-types'

/**
 * Fetch sales pipeline snapshot data for a reporting period.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param dateRange - Period start and end dates (ISO strings)
 * @returns Sales pipeline section data
 */
export async function fetchSalesPipelineData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string },
): Promise<SalesPipelineSectionData> {
  const [
    { data: campaigns },
    { data: contacts },
    { data: emails },
    { data: rfqBroadcasts },
    { data: rfqResponses },
    { data: calls },
  ] = await Promise.all([
    // Active outreach campaigns
    supabase
      .from('outreach_campaigns')
      .select('id, name, status')
      .eq('foundry_id', foundryId),
    // Contacts reached this period
    supabase
      .from('outreach_contacts')
      .select('id, status')
      .eq('foundry_id', foundryId)
      .gte('created_at', `${dateRange.start}T00:00:00`)
      .lte('created_at', `${dateRange.end}T23:59:59`),
    // Emails sent and replied this period
    supabase
      .from('outreach_emails')
      .select('id, status, sent_at, replied_at, campaign_id')
      .eq('foundry_id', foundryId)
      .gte('created_at', `${dateRange.start}T00:00:00`)
      .lte('created_at', `${dateRange.end}T23:59:59`),
    // RFQ broadcasts sent this period
    supabase
      .from('rfq_broadcasts')
      .select('id, rfq_id, delivered_at')
      .gte('scheduled_at', `${dateRange.start}T00:00:00`)
      .lte('scheduled_at', `${dateRange.end}T23:59:59`),
    // RFQ responses received this period
    supabase
      .from('rfq_responses')
      .select('id, response_type, quoted_price, buyer_shortlisted')
      .gte('responded_at', `${dateRange.start}T00:00:00`)
      .lte('responded_at', `${dateRange.end}T23:59:59`),
    // Discovery calls this period
    supabase
      .from('discovery_calls')
      .select('id, status, converted_to_order_id')
      .gte('scheduled_at', `${dateRange.start}T00:00:00`)
      .lte('scheduled_at', `${dateRange.end}T23:59:59`),
  ])

  // Outreach metrics
  const activeCampaigns = (campaigns ?? []).filter(c => c.status === 'active').length
  const contactsReached = contacts?.length ?? 0
  const emailsSent = (emails ?? []).filter(e => e.sent_at).length
  const repliesReceived = (emails ?? []).filter(e => e.replied_at).length
  const replyRate = emailsSent > 0 ? Math.round((repliesReceived / emailsSent) * 100) : 0

  // INTENT: Find the campaign with the most emails sent this period
  const campaignEmailCounts = new Map<string, number>()
  for (const e of emails ?? []) {
    if (e.campaign_id && e.sent_at) {
      campaignEmailCounts.set(e.campaign_id, (campaignEmailCounts.get(e.campaign_id) ?? 0) + 1)
    }
  }
  let topCampaignName: string | null = null
  if (campaignEmailCounts.size > 0) {
    const topCampaignId = [...campaignEmailCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    topCampaignName = (campaigns ?? []).find(c => c.id === topCampaignId)?.name ?? null
  }

  // RFQ metrics
  const uniqueRfqIds = new Set((rfqBroadcasts ?? []).map(b => b.rfq_id))
  const sentThisPeriod = uniqueRfqIds.size
  const responsesReceived = rfqResponses?.length ?? 0
  const awarded = (rfqResponses ?? []).filter(r => r.buyer_shortlisted === true).length
  const pipelineValue = (rfqResponses ?? []).reduce((sum, r) => sum + (r.quoted_price ?? 0), 0)

  // INTENT: Count open RFQs (those with broadcasts but no shortlisted response)
  const rfqsWithAward = new Set(
    (rfqResponses ?? []).filter(r => r.buyer_shortlisted).map(r => r.id)
  )
  const openCount = [...uniqueRfqIds].filter(id => !rfqsWithAward.has(id)).length

  // Discovery call metrics
  const callList = calls ?? []
  const scheduled = callList.length
  const completed = callList.filter(c => c.status === 'completed').length
  const conversions = callList.filter(c => c.converted_to_order_id).length
  const noShows = callList.filter(c => c.status === 'no_show' || c.status === 'cancelled').length

  return {
    outreach: {
      activeCampaigns,
      contactsReached,
      emailsSent,
      repliesReceived,
      replyRate,
      topCampaignName,
    },
    rfqs: {
      openCount,
      sentThisPeriod,
      responsesReceived,
      awarded,
      pipelineValue,
    },
    discoveryCalls: {
      scheduled,
      completed,
      conversions,
      noShows,
    },
  }
}

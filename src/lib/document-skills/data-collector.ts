/**
 * @file data-collector.ts
 *
 * @description Collects auto-data from Supabase for document skill prompts.
 * Reuses the report-section fetchers to gather company context, then formats
 * each source as labelled text blocks for prompt injection.
 *
 * @related
 * - src/actions/report-sections/ — Individual data fetchers
 * - src/actions/report-generator.ts — Similar parallel-fetch pattern
 */

import { createClient } from '@/lib/supabase/server'
import { fetchFinancialSnapshotData } from '@/actions/report-sections/financial'
import { fetchSalesPipelineData } from '@/actions/report-sections/sales-pipeline'
import { fetchEngineeringActivityData } from '@/actions/report-sections/engineering'

import type { AutoDataSource } from './types'
import type {
  FinancialSnapshotSectionData,
  SalesPipelineSectionData,
  EngineeringActivitySectionData,
} from '@/lib/reports/report-document-types'
import type { CompanyIntelligence, FoundryPurposeData, CompanyProfile } from '@/types/foundry'

/**
 * Collect auto-data from Supabase for the given sources and format as text.
 *
 * @param sources - Which data sources to collect
 * @param foundryId - Foundry to scope queries to
 * @returns Formatted text string with labelled data blocks
 */
export async function collectAutoData(
  sources: AutoDataSource[],
  foundryId: string,
): Promise<string> {
  const supabase = await createClient()

  // INTENT: Use a 90-day lookback as the default date range for context gathering
  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const dateRange = {
    start: ninetyDaysAgo.toISOString().split('T')[0],
    end: now.toISOString().split('T')[0],
  }

  const blocks: string[] = []
  const promises: Promise<void>[] = []

  if (sources.includes('company-profile')) {
    promises.push(
      fetchCompanyProfile(supabase, foundryId).then(text => {
        if (text) blocks.push(text)
      })
    )
  }

  if (sources.includes('objectives')) {
    promises.push(
      fetchObjectives(supabase, foundryId).then(text => {
        if (text) blocks.push(text)
      })
    )
  }

  if (sources.includes('financials')) {
    promises.push(
      fetchFinancialSnapshotData(supabase, foundryId, dateRange).then(data => {
        blocks.push(formatFinancials(data))
      }).catch(err => {
        console.warn('[DataCollector] Financials fetch failed:', err)
      })
    )
  }

  if (sources.includes('team')) {
    promises.push(
      fetchTeam(supabase, foundryId).then(text => {
        if (text) blocks.push(text)
      })
    )
  }

  if (sources.includes('sales-pipeline')) {
    promises.push(
      fetchSalesPipelineData(supabase, foundryId, dateRange).then(data => {
        blocks.push(formatSalesPipeline(data))
      }).catch(err => {
        console.warn('[DataCollector] Sales pipeline fetch failed:', err)
      })
    )
  }

  if (sources.includes('engineering')) {
    promises.push(
      fetchEngineeringActivityData(supabase, foundryId, dateRange).then(data => {
        blocks.push(formatEngineering(data))
      }).catch(err => {
        console.warn('[DataCollector] Engineering fetch failed:', err)
      })
    )
  }

  if (sources.includes('blockers')) {
    promises.push(
      fetchBlockers(supabase, foundryId).then(text => {
        if (text) blocks.push(text)
      })
    )
  }

  if (sources.includes('competitive-intel')) {
    promises.push(
      fetchCompetitiveIntel(supabase, foundryId).then(text => {
        if (text) blocks.push(text)
      }).catch(err => {
        console.warn('[DataCollector] Competitive intel fetch failed:', err)
      })
    )
  }

  await Promise.all(promises)
  return blocks.filter(Boolean).join('\n\n')
}

// ─── Internal fetchers ──────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function fetchCompanyProfile(supabase: SupabaseClient, foundryId: string): Promise<string> {
  const { data } = await supabase
    .from('foundries')
    .select('name, industry, sector, stage')
    .eq('id', foundryId)
    .single()

  if (!data) return ''

  const lines = ['## Company Profile']
  if (data.name) lines.push(`- **Name:** ${data.name}`)
  if (data.industry) lines.push(`- **Industry:** ${data.industry}`)
  if (data.sector) lines.push(`- **Sector:** ${data.sector}`)
  if (data.stage) lines.push(`- **Stage:** ${data.stage}`)
  return lines.join('\n')
}

async function fetchObjectives(supabase: SupabaseClient, foundryId: string): Promise<string> {
  const { data } = await supabase
    .from('objectives')
    .select('title, progress, status, end_date')
    .eq('foundry_id', foundryId)
    .in('status', ['active', 'on_track', 'at_risk'])
    .order('created_at', { ascending: false })
    .limit(20)

  if (!data || data.length === 0) return ''

  const lines = ['## Active Objectives']
  for (const obj of data) {
    lines.push(`- **${obj.title}** — ${obj.progress ?? 0}% complete, status: ${obj.status ?? 'unknown'}`)
  }
  return lines.join('\n')
}

async function fetchTeam(supabase: SupabaseClient, foundryId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('foundry_id', foundryId)
    .order('created_at', { ascending: true })
    .limit(50)

  if (!data || data.length === 0) return ''

  const lines = ['## Team']
  lines.push(`Total team size: ${data.length}`)
  for (const member of data) {
    lines.push(`- ${member.full_name ?? 'Unknown'}${member.role ? ` (${member.role})` : ''}`)
  }
  return lines.join('\n')
}

async function fetchBlockers(supabase: SupabaseClient, foundryId: string): Promise<string> {
  // FLOW: Blockers come from standups table, same as report-generator.ts
  const { data } = await supabase
    .from('standups')
    .select('blockers, blocker_severity, standup_date')
    .eq('foundry_id', foundryId)
    .not('blockers', 'is', null)
    .not('blockers', 'eq', '')
    .order('standup_date', { ascending: false })
    .limit(10)

  if (!data || data.length === 0) return ''

  const lines = ['## Current Blockers']
  for (const standup of data) {
    const severity = standup.blocker_severity ?? 'unknown'
    lines.push(`- [${severity}] ${standup.blockers}`)
  }
  return lines.join('\n')
}

async function fetchCompetitiveIntel(supabase: SupabaseClient, foundryId: string): Promise<string> {
  const { data } = await supabase
    .from('foundries')
    .select('company_intel, purpose_data, company_profile')
    .eq('id', foundryId)
    .single()

  if (!data) return ''

  const intel = data.company_intel as CompanyIntelligence | null
  const purpose = data.purpose_data as FoundryPurposeData | null
  const profile = data.company_profile as CompanyProfile | null

  const lines = ['## Competitive Intelligence & Company Context']

  // Value proposition & products
  // GOTCHA: JSONB arrays are cast via `as unknown as Json` — could be non-array or contain null fields
  if (intel?.value_proposition) lines.push(`\n### Value Proposition\n${intel.value_proposition}`)
  if (Array.isArray(intel?.products_services) && intel.products_services.length > 0) {
    const validProducts = intel.products_services.filter((p): p is { name: string; description: string } => !!p?.name)
    if (validProducts.length > 0) {
      lines.push('\n### Products & Services')
      for (const p of validProducts) {
        lines.push(`- **${p.name}${p.description ? `:** ${p.description}` : '**'}`)
      }
    }
  }
  if (intel?.target_customers) lines.push(`\n### Target Customers\n${intel.target_customers}`)

  // Competitor profiles
  if (Array.isArray(intel?.competitors) && intel.competitors.length > 0) {
    const validCompetitors = intel.competitors.filter((c): c is { name: string; website: string; description: string; differentiator: string } => !!c?.name)
    if (validCompetitors.length > 0) {
      lines.push('\n### Competitor Profiles')
      for (const c of validCompetitors) {
        const nameLabel = c.website ? `**${c.name}** (${c.website})` : `**${c.name}**`
        lines.push(`\n${nameLabel}`)
        if (c.description) lines.push(`- ${c.description}`)
        if (c.differentiator) lines.push(`- Differentiator: ${c.differentiator}`)
      }
    }
  }

  // Purpose / mission / vision
  if (purpose?.purpose || purpose?.mission || purpose?.vision) {
    lines.push('\n### Strategic Direction')
    if (purpose.purpose) lines.push(`- **Purpose:** ${purpose.purpose}`)
    if (purpose.mission) lines.push(`- **Mission:** ${purpose.mission}`)
    if (purpose.vision) lines.push(`- **Vision:** ${purpose.vision}`)
  }

  // Company overview — group under one header so bullets aren't orphaned
  {
    const overviewLines: string[] = []
    if (intel?.website_summary) overviewLines.push(intel.website_summary)
    if (profile?.business_model) overviewLines.push(`- **Business Model:** ${profile.business_model}`)
    if (intel?.pricing_model) overviewLines.push(`- **Pricing Model:** ${intel.pricing_model}`)
    if (overviewLines.length > 0) {
      lines.push(`\n### Company Overview\n${overviewLines.join('\n')}`)
    }
  }

  // Only return if we have more than just the header
  return lines.length > 1 ? lines.join('\n') : ''
}

// ─── Formatters ─────────────────────────────────────────────────────

function formatFinancials(data: FinancialSnapshotSectionData): string {
  const lines = ['## Financial Snapshot (Last 90 Days)']
  lines.push(`- **Revenue:** £${data.periodRevenue.toLocaleString()} (prev: £${data.previousPeriodRevenue.toLocaleString()})`)
  lines.push(`- **Expenses:** £${data.periodExpenses.toLocaleString()} (prev: £${data.previousPeriodExpenses.toLocaleString()})`)
  lines.push(`- **Net Position:** £${data.netPosition.toLocaleString()}`)
  lines.push(`- **Active Orders:** ${data.activeOrderCount}`)
  if (data.budgetHealth.length > 0) {
    lines.push('\nBudget Health:')
    for (const row of data.budgetHealth) {
      const status = row.variance >= 0 ? 'under' : 'over'
      lines.push(`- ${row.category}: £${row.actual.toLocaleString()} / £${row.budgeted.toLocaleString()} (${Math.abs(row.variancePercent).toFixed(0)}% ${status})`)
    }
  }
  return lines.join('\n')
}

function formatSalesPipeline(data: SalesPipelineSectionData): string {
  const lines = ['## Sales Pipeline (Last 90 Days)']
  lines.push(`- **Active Campaigns:** ${data.outreach.activeCampaigns}`)
  lines.push(`- **Contacts Reached:** ${data.outreach.contactsReached}`)
  lines.push(`- **Reply Rate:** ${(data.outreach.replyRate * 100).toFixed(1)}%`)
  lines.push(`- **Open RFQs:** ${data.rfqs.openCount}`)
  lines.push(`- **Pipeline Value:** £${data.rfqs.pipelineValue.toLocaleString()}`)
  lines.push(`- **Discovery Calls Completed:** ${data.discoveryCalls.completed}`)
  lines.push(`- **Conversions:** ${data.discoveryCalls.conversions}`)
  return lines.join('\n')
}

function formatEngineering(data: EngineeringActivitySectionData): string {
  const lines = ['## Engineering Activity (Last 90 Days)']
  lines.push(`- **Active Projects:** ${data.totalActive}`)
  lines.push(`- **Created This Period:** ${data.createdThisPeriod}`)
  lines.push(`- **Completed This Period:** ${data.completedThisPeriod}`)
  lines.push(`- **Modules Generated:** ${data.totalModulesGenerated}`)
  if (data.recentProjects.length > 0) {
    lines.push('\nRecent Projects:')
    for (const p of data.recentProjects.slice(0, 5)) {
      lines.push(`- ${p.name} (${p.stage}, ${p.status})`)
    }
  }
  return lines.join('\n')
}

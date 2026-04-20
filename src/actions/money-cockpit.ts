'use server'

/**
 * Money Cockpit server actions.
 *
 * Provides the runway computation + upcoming-commitments data for the
 * /money/cockpit surface. Pure read paths; writes happen via other
 * actions (money-plan.ts for line edits, money-scenarios.ts for scenario
 * edits, money-xero.ts for reconnect).
 *
 * All reads scope to the caller's foundry via withAuth. The Supabase
 * client carries the user's session and hits the RLS policies defined in
 * the Chunk 1 migrations. No admin/service-role here.
 */

import { withAuth } from '@/lib/server-action-utils'
import {
  projectRunway,
  type PlanLineItemRow,
} from '@/lib/money/runway'

export type CockpitData = {
  error?: string
  runwayWeeks: number | null
  runwayMonths: number | null
  monthlyBurnCents: number
  openingBalanceCents: number
  cashZeroDate: string | null
  weeks: Array<{
    weekStart: string
    weekLabel: string
    totalInCents: number
    totalOutCents: number
    netCents: number
    cumulativeBalanceCents: number
  }>
  settings: {
    currency: string
    runway_danger_weeks: number
    runway_healthy_weeks: number
  }
  xeroSyncState: 'healthy' | 'syncing' | 'error' | 'paused' | 'disconnected'
  lastSyncAt: string | null
  planLineCount: number
  hasActiveRound: boolean
}

export async function getCockpitData(): Promise<CockpitData | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Money settings (thresholds + currency). Lazy-insert if missing.
    const { data: settingsRow } = await supabase
      .from('money_settings')
      .select('currency, runway_danger_weeks, runway_healthy_weeks, runway_months_cached')
      .eq('foundry_id', foundryId)
      .maybeSingle()

    const settings = {
      currency: settingsRow?.currency ?? 'GBP',
      runway_danger_weeks: settingsRow?.runway_danger_weeks ?? 13,
      runway_healthy_weeks: settingsRow?.runway_healthy_weeks ?? 18,
    }

    // Plan lines — active only (not archived).
    const { data: lineRows } = await supabase
      .from('plan_line_items')
      .select(
        'id, direction, category, amount_cents, frequency, effective_from, effective_to, probability_pct, annual_uplift_pct',
      )
      .eq('foundry_id', foundryId)
      .is('archived_at', null)

    const lines: PlanLineItemRow[] = (lineRows ?? []).map((r) => ({
      id: r.id,
      direction: r.direction as 'out' | 'in',
      category: r.category,
      amount_cents: r.amount_cents,
      frequency: r.frequency as PlanLineItemRow['frequency'],
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      probability_pct: r.probability_pct,
      annual_uplift_pct: r.annual_uplift_pct ?? 0,
    }))

    // Opening balance: for V1, derive from sum of xero_transaction (actuals)
    // where available; otherwise zero. Founder can override via settings UI
    // (future wizard in Chunk 6).
    const { data: txAgg } = await supabase
      .from('xero_transaction')
      .select('amount_cents')
      .eq('foundry_id', foundryId)

    const openingBalanceCents = (txAgg ?? []).reduce(
      (sum, t) => sum + (t.amount_cents ?? 0),
      0,
    )

    // Xero connection state.
    const { data: xero } = await supabase
      .from('xero_connection')
      .select('sync_state, last_sync_at')
      .eq('foundry_id', foundryId)
      .maybeSingle()

    // Round presence (feeds first-run empty-state branching).
    const { data: round } = await supabase
      .from('investor_round')
      .select('id')
      .eq('foundry_id', foundryId)
      .eq('state', 'active')
      .is('archived_at', null)
      .maybeSingle()

    // Project runway 26 weeks out.
    const projection = projectRunway({
      asOfDate: new Date(),
      openingBalanceCents,
      weeks: 26,
      lines,
    })

    return {
      runwayWeeks: projection.runwayWeeks,
      runwayMonths: projection.monthlyBurnMonths,
      monthlyBurnCents: projection.monthlyBurnCents,
      openingBalanceCents,
      cashZeroDate: projection.cashZeroDate,
      weeks: projection.weeks,
      settings,
      xeroSyncState: (xero?.sync_state as CockpitData['xeroSyncState']) ?? 'disconnected',
      lastSyncAt: xero?.last_sync_at ?? null,
      planLineCount: lines.length,
      hasActiveRound: !!round,
    }
  })
}

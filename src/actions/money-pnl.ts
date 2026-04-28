'use server'

/**
 * Money Plan · P&L server actions.
 *
 * Restores legacy /cash-burn/pnl richness (Loss #6 parity audit): Income
 * Statement + projected Balance Sheet + waterfall + horizontal bars over
 * plan_line_items + scenario overrides + Xero-derived opening balance.
 *
 * Tier gate: Starter+ via getInvestorTierAccess (same gate used across
 * /money/raise). Free tier gets `{ error: 'tier_upgrade_required' }` —
 * the route renders an upgrade prompt, not a half-rendered report.
 */

import { withAuth } from '@/lib/server-action-utils'
import { getInvestorTierAccess } from '@/actions/investors'
import { buildPnl, type PnlReportResult } from '@/lib/money/pnl-engine'
import type {
  PlanLineItemRow,
  ScenarioOverrideRow,
} from '@/lib/money/runway'
import type { SubscriptionTier } from '@/lib/billing/plans'

export type PnlReportResponse =
  | { error: string }
  | ({
      success: true
      scenarioId: string | null
      scenarioName: string | null
      currency: string
      lineCount: number
      openingBalanceCents: number
      tier: SubscriptionTier
    } & PnlReportResult)

/**
 * Fetch and compute the P&L report for the caller's foundry.
 *
 * @param args.scenarioId   Optional scenario id — if omitted, uses default.
 * @param args.months       Horizon in months (default 12, clamped 1..36).
 */
export async function getPnlReport(
  args: { scenarioId?: string; months?: number } = {},
): Promise<PnlReportResponse> {
  return withAuth(async ({ supabase, foundryId }) => {
    // 1. Tier gate — paid plans only. Free tier has investorDetailAccess=true
    // (they can see investor basics), but intelligenceAccess=false gates them
    // out of P&L reports / deep intel. Matches /money/raise sidebar gating.
    const access = await getInvestorTierAccess()
    if (!access.intelligenceAccess) {
      return { error: 'tier_upgrade_required' as const }
    }

    const months = Math.max(1, Math.min(36, args.months ?? 12))

    // 2. Resolve scenario — explicit id (validated against foundry) or
    // default scenario for this foundry.
    let scenarioId: string | null = null
    let scenarioName: string | null = null

    if (args.scenarioId) {
      const { data: scen } = await supabase
        .from('money_scenarios')
        .select('id, name, foundry_id')
        .eq('id', args.scenarioId)
        .maybeSingle()
      if (!scen || scen.foundry_id !== foundryId) {
        return { error: 'Scenario not found' }
      }
      scenarioId = scen.id
      scenarioName = scen.name
    } else {
      const { data: defaultScen } = await supabase
        .from('money_scenarios')
        .select('id, name')
        .eq('foundry_id', foundryId)
        .eq('is_default', true)
        .is('archived_at', null)
        .maybeSingle()
      if (defaultScen) {
        scenarioId = defaultScen.id
        scenarioName = defaultScen.name
      }
    }

    // 3. Load plan line items (active only).
    const { data: lineRows, error: linesErr } = await supabase
      .from('plan_line_items')
      .select(
        'id, direction, category, amount_cents, frequency, effective_from, effective_to, probability_pct, annual_uplift_pct',
      )
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
    if (linesErr) return { error: linesErr.message }

    const lines: PlanLineItemRow[] = (lineRows ?? []).map((r) => ({
      id: r.id,
      direction: r.direction === 'in' ? 'in' : 'out',
      category: r.category,
      amount_cents: r.amount_cents,
      frequency: r.frequency as PlanLineItemRow['frequency'],
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      probability_pct: r.probability_pct ?? 100,
      annual_uplift_pct: r.annual_uplift_pct ?? 0,
    }))

    // 4. Load scenario overrides if a scenario is selected.
    let overrides: ScenarioOverrideRow[] | undefined
    if (scenarioId) {
      const { data: overrideRows } = await supabase
        .from('money_scenario_overrides')
        .select(
          'line_item_id, override_amount_cents, override_frequency, override_effective_from, override_effective_to, override_probability_pct',
        )
        .eq('scenario_id', scenarioId)
        .is('archived_at', null)
      overrides = (overrideRows ?? []).map((o) => ({
        line_item_id: o.line_item_id,
        override_amount_cents: o.override_amount_cents,
        override_frequency: o.override_frequency as ScenarioOverrideRow['override_frequency'],
        override_effective_from: o.override_effective_from,
        override_effective_to: o.override_effective_to,
        override_probability_pct: o.override_probability_pct,
      }))
    }

    // 5. Currency from money_settings (falls back to GBP).
    const { data: settings } = await supabase
      .from('money_settings')
      .select('currency')
      .eq('foundry_id', foundryId)
      .maybeSingle()
    const currency = settings?.currency ?? 'GBP'

    // 6. Opening balance: prefer the scenario's explicit opening_balance
    // override (wizard feature in Chunk 3/6) else sum of xero_transaction
    // (actuals). Mirrors the Cockpit derivation.
    let openingBalanceCents = 0
    if (scenarioId) {
      const { data: scenBalance } = await supabase
        .from('money_scenarios')
        .select('opening_balance_cents')
        .eq('id', scenarioId)
        .maybeSingle()
      if (
        scenBalance &&
        typeof (scenBalance as { opening_balance_cents?: number | null })
          .opening_balance_cents === 'number'
      ) {
        openingBalanceCents =
          (scenBalance as { opening_balance_cents?: number | null })
            .opening_balance_cents ?? 0
      }
    }
    if (openingBalanceCents === 0) {
      const { data: txAgg } = await supabase
        .from('xero_transaction')
        .select('amount_cents')
        .eq('foundry_id', foundryId)
      openingBalanceCents = (txAgg ?? []).reduce(
        (sum, t) => sum + (t.amount_cents ?? 0),
        0,
      )
    }

    // 7. Compute.
    const report = buildPnl(lines, new Date(), openingBalanceCents, {
      months,
      overrides,
    })

    return {
      success: true as const,
      scenarioId,
      scenarioName,
      currency,
      lineCount: lines.length,
      openingBalanceCents,
      tier: access.tier,
      ...report,
    }
  })
}

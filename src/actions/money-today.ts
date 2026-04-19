'use server'

/**
 * Today V3 — live Money tile data.
 *
 * Two compact, fast-resolving server actions for the Today V3 page (right-hand
 * runway tile + minigrid pipeline tile + V9 signal card). Each returns either
 * a tiny populated object OR `{ connected: false }` — the caller decides which
 * empty/CTA state to render.
 *
 * Why separate from `getCockpitData` / `getRaiseData`:
 * - Today fires on every page load. The cockpit/raise actions fetch full plan
 *   line lists, full pipeline rows, full Xero state — too much for a tile.
 * - Today's tiles MUST tolerate "no Money configured yet" without erroring.
 *   These actions degrade gracefully to `{ connected: false }`.
 * - Lets the runway tile cache differently from the cockpit page.
 *
 * Foundry scope is enforced via `withAuth` → RLS handles cross-tenant isolation.
 */

import { withAuth } from '@/lib/server-action-utils'
import { projectRunway, type PlanLineItemRow } from '@/lib/money/runway'

export type TodayMoneyRunwayTile =
  | {
      connected: true
      runwayMonths: number | null
      runwayStatus: 'healthy' | 'caution' | 'critical' | 'sustainable'
      monthlyBurnCents: number
      currency: string
    }
  | { connected: false }

export type TodayMoneyPipelineTile =
  | {
      hasRound: true
      roundName: string
      target_cents: number
      committed_cents: number
      pipeline_count: number
      currency: string
    }
  | { hasRound: false }

/**
 * Compact runway summary for the Today V3 V3b "Cash runway" tile.
 *
 * Returns `{ connected: false }` when the foundry has no plan_line_items yet
 * (cold-start state). The Today view renders the existing "Connect Cash/Burn"
 * CTA in that case.
 *
 * "Sustainable" is the explicit positive state when monthly net is non-negative
 * (income covers burn) — runway is effectively infinite. We surface that as a
 * fourth status rather than collapsing it into "healthy" so the UI can show a
 * different label.
 */
export async function getTodayMoneyRunwayTile(): Promise<
  TodayMoneyRunwayTile | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: settingsRow } = await supabase
      .from('money_settings')
      .select('currency, runway_danger_weeks, runway_healthy_weeks')
      .eq('foundry_id', foundryId)
      .maybeSingle()

    const currency = settingsRow?.currency ?? 'GBP'
    const dangerWeeks = settingsRow?.runway_danger_weeks ?? 13
    const healthyWeeks = settingsRow?.runway_healthy_weeks ?? 18

    const { data: lineRows } = await supabase
      .from('plan_line_items')
      .select(
        'id, direction, category, amount_cents, frequency, effective_from, effective_to, probability_pct, annual_uplift_pct',
      )
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
      .limit(500)

    const lines = (lineRows ?? []) as PlanLineItemRow[]
    if (lines.length === 0) {
      return { connected: false } as const
    }

    // Opening balance — sum xero actuals; if no Xero, treat as zero. The tile
    // copy is a runway preview, not a definitive figure — Cockpit owns the
    // reconciled view.
    const { data: txAgg } = await supabase
      .from('xero_transaction')
      .select('amount_cents')
      .eq('foundry_id', foundryId)
      .limit(5000)

    const openingBalanceCents = (txAgg ?? []).reduce(
      (sum, t) => sum + (t.amount_cents ?? 0),
      0,
    )

    const projection = projectRunway({
      asOfDate: new Date(),
      openingBalanceCents,
      weeks: 26,
      lines,
    })

    let status: 'healthy' | 'caution' | 'critical' | 'sustainable' = 'healthy'
    if (projection.monthlyBurnCents <= 0) {
      // Net positive monthly cash → income covers burn. Runway is unlimited.
      status = 'sustainable'
    } else if (
      projection.runwayWeeks !== null &&
      projection.runwayWeeks < dangerWeeks
    ) {
      status = 'critical'
    } else if (
      projection.runwayWeeks !== null &&
      projection.runwayWeeks < healthyWeeks
    ) {
      status = 'caution'
    }

    return {
      connected: true as const,
      runwayMonths: projection.monthlyBurnMonths,
      runwayStatus: status,
      monthlyBurnCents: projection.monthlyBurnCents,
      currency,
    }
  })
}

/**
 * Compact pipeline summary for the Today V3 V4 minigrid "Money pipeline" tile.
 *
 * Returns `{ hasRound: false }` when no active investor_round exists. The
 * Today view renders the existing "Coming in Phase 2" placeholder in that case.
 *
 * `committed_cents` rolls up only the verbal + closed pipeline rows for the
 * active round. Anything earlier (target / researching / contacted / meeting /
 * due_diligence) is counted as "in pipeline" but not committed.
 */
export async function getTodayMoneyPipelineTile(): Promise<
  TodayMoneyPipelineTile | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: round } = await supabase
      .from('investor_round')
      .select('id, name, target_cents, currency')
      .eq('foundry_id', foundryId)
      .eq('state', 'active')
      .is('archived_at', null)
      .maybeSingle()

    if (!round) {
      return { hasRound: false } as const
    }

    const { data: pipelineRows } = await supabase
      .from('investor_pipeline_state')
      .select('current_stage, commit_amount_cents')
      .eq('foundry_id', foundryId)
      .eq('round_id', round.id)
      .is('archived_at', null)
      .limit(500)

    const rows = pipelineRows ?? []
    const committed_cents = rows.reduce((sum, r) => {
      if (r.current_stage === 'verbal' || r.current_stage === 'closed') {
        return sum + (r.commit_amount_cents ?? 0)
      }
      return sum
    }, 0)
    // "In pipeline" excludes terminal passed rows from the headline count.
    const pipeline_count = rows.filter((r) => r.current_stage !== 'passed').length

    return {
      hasRound: true as const,
      roundName: round.name,
      target_cents: round.target_cents,
      committed_cents,
      pipeline_count,
      currency: round.currency,
    }
  })
}

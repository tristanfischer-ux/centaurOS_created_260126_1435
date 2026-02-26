'use server'

/**
 * @file cash-burn-pnl.ts — Server actions for P&L page data
 *
 * @description Composite fetcher for the P&L page — cash out/in items
 * plus the opening balance from the default scenario.
 *
 * @security All queries filter by foundry_id via getFoundryIdCached().
 */

import type { ActionResult, CashOutItem, CashInItem } from '@/types/cash-burn'
import { getCashOutItems } from './cash-burn-out'
import { getCashInItems } from './cash-burn-in'
import { ensureDefaultScenarios } from './cash-burn-scenarios'

export async function getPnlPageData(): Promise<ActionResult<{
  cashOut: CashOutItem[]
  cashIn: CashInItem[]
  openingBalance: number
}>> {
  try {
    const [cashOutResult, cashInResult, scenariosResult] = await Promise.all([
      getCashOutItems(),
      getCashInItems(),
      ensureDefaultScenarios(),
    ])

    if (cashOutResult.error) return { data: null, error: cashOutResult.error }
    if (cashInResult.error) return { data: null, error: cashInResult.error }

    // Use the default scenario's opening balance, or 0
    const defaultScenario = (scenariosResult.data ?? []).find(s => s.isDefault)
    const openingBalance = defaultScenario?.openingBalance ?? 0

    return {
      data: {
        cashOut: cashOutResult.data ?? [],
        cashIn: cashInResult.data ?? [],
        openingBalance,
      },
      error: null,
    }
  } catch (err) {
    console.error('[CashBurn] Failed to fetch P&L page data:', err)
    return { data: null, error: 'Failed to load P&L data' }
  }
}

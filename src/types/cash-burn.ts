/**
 * @file cash-burn.ts — Types for the Cash Burn planning section
 *
 * @description Fully self-contained types for cash out/in items, burn scenarios,
 * weekly projections, and P&L. No imports from @/types/finance.
 */

// ============================================================
// Action result (standalone, matches existing pattern)
// ============================================================

export interface ActionResult<T = null> {
  data: T | null
  error: string | null
}

// ============================================================
// Enums
// ============================================================

export type Frequency = 'weekly' | 'monthly' | 'annual' | 'one_time'
export type CostType = 'fixed' | 'variable'
export type PnlCategory = 'cogs' | 'opex' | 'rnd' | 'capex' | 'excluded'
export type CashInSourceType = 'revenue' | 'loan' | 'equity' | 'government_grant' | 'other'

// ============================================================
// Domain objects (DB rows + computed fields)
// ============================================================

export interface CashOutItem {
  id: string
  name: string
  category: string
  costType: CostType
  pnlCategory: PnlCategory
  amount: number
  currency: string
  frequency: Frequency
  effectiveFrom: string
  effectiveTo: string | null
  notes: string | null
  sortOrder: number
  isActive: boolean
  weeklyAmount: number // computed
}

export interface CashInItem {
  id: string
  name: string
  sourceType: CashInSourceType
  amount: number
  currency: string
  frequency: Frequency
  probabilityPct: number
  effectiveFrom: string
  effectiveTo: string | null
  notes: string | null
  sortOrder: number
  isActive: boolean
  weeklyAmount: number // computed
}

export interface BurnScenario {
  id: string
  name: string
  openingBalance: number
  revenueDelayWeeks: number
  costDelayWeeks: number
  revenueGrowthPct: number
  isDefault: boolean
  sortOrder: number
}

// ============================================================
// Weekly grid rows
// ============================================================

export interface WeeklyOutRow {
  weekStart: string
  weekLabel: string
  fixedCosts: number
  variableCosts: number
  totalOut: number
}

export interface WeeklyInRow {
  weekStart: string
  weekLabel: string
  revenue: number
  loans: number
  equity: number
  grants: number
  other: number
  totalIn: number
}

export interface BurnWeekRow {
  weekStart: string
  weekLabel: string
  totalIn: number
  totalOut: number
  net: number
  cumulativeBalance: number
}

export interface BurnProjection {
  weeks: BurnWeekRow[]
  runwayWeeks: number | null // null = sustainable
  monthlyBurnRate: number
}

// ============================================================
// P&L
// ============================================================

export interface IncomeStatementRow {
  period: string
  revenue: number
  cogs: number
  grossProfit: number
  opex: number
  rnd: number
  ebitda: number
}

export interface BalanceSheet {
  cash: number
  equipment: number
  totalAssets: number
  loans: number
  totalLiabilities: number
  equityInvested: number
  retainedEarnings: number
  totalEquity: number
}

// ============================================================
// Input types (for server actions)
// ============================================================

export interface CreateCashOutInput {
  name: string
  category: string
  cost_type: CostType
  pnl_category?: PnlCategory
  amount: number
  frequency: Frequency
  effective_from: string
  effective_to?: string
  notes?: string
}

export interface CreateCashInInput {
  name: string
  source_type: CashInSourceType
  amount: number
  frequency: Frequency
  probability_pct?: number
  effective_from: string
  effective_to?: string
  notes?: string
}

export interface CreateScenarioInput {
  name: string
  opening_balance: number
  revenue_delay_weeks?: number
  cost_delay_weeks?: number
  revenue_growth_pct?: number
}

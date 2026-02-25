/**
 * @file reports.ts — Pure report builder functions
 *
 * @description Builds structured P&L, VAT, and Cash Flow Statement
 * data from raw query results. All functions are pure (no DB).
 */

// ============================================================
// Types
// ============================================================

export interface PnLLineItem {
  label: string
  amount: number // in pence
  category?: string
}

export interface PnLReport {
  period: string
  revenue: PnLLineItem[]
  totalRevenue: number
  costOfSales: PnLLineItem[]
  totalCostOfSales: number
  grossProfit: number
  operatingExpenses: PnLLineItem[]
  totalOperatingExpenses: number
  operatingProfit: number
  otherIncome: PnLLineItem[]
  totalOtherIncome: number
  netProfit: number
  currency: string
}

export interface VATReport {
  period: string
  vatCollected: number   // VAT on sales
  vatPaid: number        // VAT on purchases
  netVATLiability: number
  salesBreakdown: Array<{ description: string; net: number; vat: number; gross: number }>
  purchaseBreakdown: Array<{ description: string; net: number; vat: number; gross: number }>
  currency: string
}

export interface CashFlowStatementSection {
  label: string
  items: Array<{ description: string; amount: number }>
  total: number
}

export interface CashFlowStatement {
  period: string
  operating: CashFlowStatementSection
  investing: CashFlowStatementSection
  financing: CashFlowStatementSection
  netChange: number
  openingBalance: number
  closingBalance: number
  currency: string
}

// ============================================================
// Builders
// ============================================================

interface RawReportData {
  orders: Array<{ total_amount: number; vat_amount: number | null; status: string; created_at: string }>
  retainerEntries: Array<{ amount: number; created_at: string }>
  costItems: Array<{ name: string; amount: number; period: string; category: string }>
  expenses: Array<{ description: string; amount: number; category: string }> // approved/paid, amounts in pence
  payouts: Array<{ amount: number; status: string; requested_at: string }>
  topUps: Array<{ amount: number; created_at: string }>
  openingBalance: number
  closingBalance: number
}

const DEFAULT_VAT_RATE = 0.20

/**
 * Build a P&L report from raw data.
 */
export function buildPnLReport(
  data: RawReportData,
  period: string,
  currency: string = 'GBP'
): PnLReport {
  // Revenue from orders
  const orderRevenue = data.orders
    .filter(o => ['completed', 'in_progress', 'accepted'].includes(o.status))
    .reduce((sum, o) => sum + Math.round(o.total_amount * 100), 0)

  // Retainer revenue
  const retainerRevenue = data.retainerEntries
    .reduce((sum, e) => sum + Math.round(e.amount * 100), 0)

  const revenue: PnLLineItem[] = []
  if (orderRevenue > 0) revenue.push({ label: 'Order revenue', amount: orderRevenue })
  if (retainerRevenue > 0) revenue.push({ label: 'Retainer revenue', amount: retainerRevenue })

  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0)

  // Cost of sales (direct costs — materials and production from money map)
  const directCosts = data.costItems
    .filter(c => c.category === 'materials' || c.category === 'production')
    .map(c => ({
      label: c.name,
      amount: normaliseToMonthlyPence(c.amount, c.period),
      category: c.category,
    }))
  const totalCostOfSales = directCosts.reduce((s, c) => s + c.amount, 0)
  const grossProfit = totalRevenue - totalCostOfSales

  // Operating expenses: recurring cost items (indirect) + approved/paid expenses
  const recurringOpex = data.costItems
    .filter(c => c.category !== 'materials' && c.category !== 'production')
    .map(c => ({
      label: c.name,
      amount: normaliseToMonthlyPence(c.amount, c.period),
      category: c.category,
    }))

  // INTENT: Group claimed expenses by category so the P&L shows consolidated lines,
  // not one row per receipt. Prefix with "Expenses: " to distinguish from cost items.
  const expensesByCategory: Record<string, number> = {}
  for (const e of (data.expenses ?? [])) {
    const cat = e.category ?? 'other'
    expensesByCategory[cat] = (expensesByCategory[cat] ?? 0) + e.amount
  }
  const claimedExpenses: PnLLineItem[] = Object.entries(expensesByCategory).map(([cat, amount]) => ({
    label: `Expenses: ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
    amount,
    category: cat,
  }))

  const opex = [...recurringOpex, ...claimedExpenses]
  const totalOperatingExpenses = opex.reduce((s, c) => s + c.amount, 0)
  const operatingProfit = grossProfit - totalOperatingExpenses

  return {
    period,
    revenue,
    totalRevenue,
    costOfSales: directCosts,
    totalCostOfSales,
    grossProfit,
    operatingExpenses: opex,
    totalOperatingExpenses,
    operatingProfit,
    otherIncome: [],
    totalOtherIncome: 0,
    netProfit: operatingProfit,
    currency,
  }
}

/**
 * Build a VAT report from raw data.
 */
export function buildVATReport(
  data: RawReportData,
  period: string,
  currency: string = 'GBP'
): VATReport {
  // VAT collected on orders
  const salesBreakdown = data.orders
    .filter(o => ['completed', 'in_progress', 'accepted'].includes(o.status))
    .map(o => {
      const gross = Math.round(o.total_amount * 100)
      const vat = o.vat_amount !== null ? Math.round(o.vat_amount * 100) : Math.round(gross * DEFAULT_VAT_RATE / (1 + DEFAULT_VAT_RATE))
      const net = gross - vat
      return {
        description: `Order (${new Date(o.created_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })})`,
        net,
        vat,
        gross,
      }
    })

  const vatCollected = salesBreakdown.reduce((s, r) => s + r.vat, 0)

  // VAT on costs (assumed 20% on all cost items)
  const purchaseBreakdown = data.costItems.map(c => {
    const monthlyPence = normaliseToMonthlyPence(c.amount, c.period)
    const vat = Math.round(monthlyPence * DEFAULT_VAT_RATE)
    return {
      description: c.name,
      net: monthlyPence,
      vat,
      gross: monthlyPence + vat,
    }
  })

  const vatPaid = purchaseBreakdown.reduce((s, p) => s + p.vat, 0)

  return {
    period,
    vatCollected,
    vatPaid,
    netVATLiability: vatCollected - vatPaid,
    salesBreakdown,
    purchaseBreakdown,
    currency,
  }
}

/**
 * Build a Cash Flow Statement from raw data.
 */
export function buildCashFlowStatement(
  data: RawReportData,
  period: string,
  currency: string = 'GBP'
): CashFlowStatement {
  // Operating: order payments received, retainer income
  const orderCashIn = data.orders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + Math.round(o.total_amount * 100), 0)

  const retainerCashIn = data.retainerEntries
    .reduce((sum, e) => sum + Math.round(e.amount * 100), 0)

  const operatingCostOut = data.costItems
    .reduce((sum, c) => sum + normaliseToMonthlyPence(c.amount, c.period), 0)

  const expenseCashOut = (data.expenses ?? [])
    .reduce((sum, e) => sum + e.amount, 0)

  const operating: CashFlowStatementSection = {
    label: 'Operating Activities',
    items: [
      { description: 'Order payments received', amount: orderCashIn },
      { description: 'Retainer payments received', amount: retainerCashIn },
      { description: 'Operating costs paid', amount: -operatingCostOut },
      { description: 'Expenses paid', amount: -expenseCashOut },
    ].filter(i => i.amount !== 0),
    total: orderCashIn + retainerCashIn - operatingCostOut - expenseCashOut,
  }

  // Investing: currently minimal
  const investing: CashFlowStatementSection = {
    label: 'Investing Activities',
    items: [],
    total: 0,
  }

  // Financing: payouts, top-ups
  const payoutsOut = data.payouts
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0)

  const topUpsIn = data.topUps.reduce((sum, t) => sum + t.amount, 0)

  const financing: CashFlowStatementSection = {
    label: 'Financing Activities',
    items: [
      { description: 'Wallet top-ups', amount: topUpsIn },
      { description: 'Payouts to bank', amount: -payoutsOut },
    ].filter(i => i.amount !== 0),
    total: topUpsIn - payoutsOut,
  }

  const netChange = operating.total + investing.total + financing.total

  return {
    period,
    operating,
    investing,
    financing,
    netChange,
    openingBalance: data.openingBalance,
    closingBalance: data.closingBalance,
    currency,
  }
}

// ============================================================
// Helpers
// ============================================================

function normaliseToMonthlyPence(amount: number, period: string): number {
  const amountPence = Math.round(amount * 100)
  switch (period) {
    case 'annual': return Math.round(amountPence / 12)
    case 'quarterly': return Math.round(amountPence / 3)
    default: return amountPence
  }
}

/**
 * @file finance.ts — Types for the Finance Hub
 *
 * @description All finance-specific types used across the Finance section.
 * Covers dashboard KPIs, revenue trends, transactions, invoices,
 * and chart data structures.
 */

// ============================================================
// Dashboard KPIs
// ============================================================

/**
 * Aggregated financial health data for the dashboard overview.
 * All monetary values are in the smallest currency unit (pence).
 */
export interface FinanceDashboardData {
  /** Current cash position (wallet balance + pending payouts) */
  cashPosition: number
  /** Total revenue this month (orders + retainers + subscriptions) */
  monthlyRevenue: number
  /** Total expenses this month (cost items from Money Map) */
  monthlyExpenses: number
  /** Net margin = monthlyRevenue - monthlyExpenses */
  netMargin: number
  /** Net margin as percentage of revenue */
  netMarginPct: number
  /** Number of outstanding (unpaid) invoices */
  outstandingInvoicesCount: number
  /** Total value of outstanding invoices */
  outstandingInvoicesAmount: number
  /** Total value of overdue invoices (past due date) */
  overdueAmount: number
  /** ISO 4217 currency code */
  currency: string
}

/**
 * Previous period data for computing trends on KPI cards.
 */
export interface FinanceDashboardComparison {
  cashPosition: number | null
  monthlyRevenue: number | null
  monthlyExpenses: number | null
  outstandingInvoicesAmount: number | null
}

// ============================================================
// Revenue Trend
// ============================================================

/**
 * A single data point for the revenue trend chart.
 * Breaks down revenue by source for stacked area chart.
 */
export interface RevenueTrendPoint {
  /** ISO month string e.g. "2026-01" */
  month: string
  /** Human-readable label e.g. "Jan 2026" */
  label: string
  /** Total revenue for the month */
  revenue: number
  /** Revenue from orders */
  orders: number
  /** Revenue from retainer payments */
  retainers: number
  /** Revenue from subscription payments */
  subscriptions: number
}

// ============================================================
// Transactions
// ============================================================

export type TransactionType =
  | 'order_payment'
  | 'escrow_release'
  | 'payout'
  | 'top_up'
  | 'refund'
  | 'retainer_payment'

export type TransactionStatus =
  | 'completed'
  | 'pending'
  | 'failed'

/**
 * A unified transaction record combining data from
 * escrow_transactions, balance_transactions, and payout_requests.
 */
export interface RecentTransaction {
  id: string
  type: TransactionType
  amount: number
  currency: string
  description: string
  counterparty: string | null
  createdAt: string
  status: TransactionStatus
}

// ============================================================
// Outstanding Invoices
// ============================================================

export type AgingBucket = 'current' | '30d' | '60d' | '90d+'

/**
 * An unpaid invoice/order with aging information.
 */
export interface OutstandingInvoice {
  id: string
  orderId: string
  orderNumber: string | null
  counterparty: string
  amount: number
  currency: string
  dueDate: string | null
  daysPastDue: number
  agingBucket: AgingBucket
}

// ============================================================
// Expense Breakdown (for pie/donut chart)
// ============================================================

/**
 * Expense category data for the donut chart.
 */
export interface ExpenseCategory {
  category: string
  amount: number
  color: string
  percentage: number
}

// ============================================================
// Quick Actions
// ============================================================

export type QuickActionType =
  | 'send_invoice'
  | 'request_payout'
  | 'top_up'
  | 'add_expense'

// ============================================================
// Payment Links
// ============================================================

export type PaymentLinkStatus = 'active' | 'paid' | 'expired' | 'cancelled'

export interface PaymentLink {
  id: string
  foundryId: string
  createdBy: string
  shortCode: string
  amount: number
  currency: string
  description: string
  status: PaymentLinkStatus
  expiresAt: string | null
  paidAt: string | null
  stripePaymentIntentId: string | null
  invoiceId: string | null
  createdAt: string
  updatedAt: string
}

// ============================================================
// Standalone Invoices
// ============================================================

export type StandaloneInvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

export type RecurrenceInterval = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annual'

export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number // in pence
  amount: number    // in pence
}

export interface StandaloneInvoice {
  id: string
  foundryId: string
  createdBy: string
  invoiceNumber: string
  recipientName: string
  recipientEmail: string
  lineItems: InvoiceLineItem[]
  subtotal: number
  vatAmount: number
  total: number
  currency: string
  status: StandaloneInvoiceStatus
  dueDate: string
  paymentLinkId: string | null
  isRecurring: boolean
  recurrenceInterval: RecurrenceInterval | null
  nextRecurrenceDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateInvoiceInput {
  recipientName: string
  recipientEmail: string
  lineItems: InvoiceLineItem[]
  dueDate: string
  currency?: string
  notes?: string
  isRecurring?: boolean
  recurrenceInterval?: RecurrenceInterval
  generatePaymentLink?: boolean
}

export interface CreatePaymentLinkInput {
  amount: number
  currency?: string
  description: string
  expiresAt?: string
  invoiceId?: string
}

// ============================================================
// Action Result (local to finance actions)
// ============================================================

export interface FinanceActionResult<T = null> {
  data: T | null
  error: string | null
}

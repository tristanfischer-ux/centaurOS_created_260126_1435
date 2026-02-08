/**
 * @file sample-data.ts
 *
 * @description Pre-computed sample Money Map data for demo mode.
 * Shown to first-time users so they can see the full dashboard
 * (summary cards, Sankey, profitability table, cost breakdown)
 * before committing to entering their own numbers.
 *
 * Models a typical small consultancy with three revenue streams.
 */

import type {
  MoneyMapData,
  MoneyMapSummary,
  StreamProfitability,
  RevenueStream,
  CostItem,
  CostLink,
} from '@/types/money-map'

// ============================================================
// Sample Revenue Streams
// ============================================================

const now = new Date().toISOString()

const SAMPLE_REVENUE_STREAMS: RevenueStream[] = [
  {
    id: 'sample-rs-1',
    foundry_id: 'sample',
    name: 'Consulting',
    category: 'service',
    amount: 45000,
    currency: 'GBP',
    period: 'monthly',
    source: 'manual',
    auto_source_type: null,
    description: 'Strategy and implementation consulting',
    sort_order: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'sample-rs-2',
    foundry_id: 'sample',
    name: 'Retainers',
    category: 'service',
    amount: 30000,
    currency: 'GBP',
    period: 'monthly',
    source: 'manual',
    auto_source_type: null,
    description: 'Ongoing advisory retainer clients',
    sort_order: 1,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'sample-rs-3',
    foundry_id: 'sample',
    name: 'Product Sales',
    category: 'product',
    amount: 15000,
    currency: 'GBP',
    period: 'monthly',
    source: 'manual',
    auto_source_type: null,
    description: 'Courses, templates, and digital products',
    sort_order: 2,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
]

// ============================================================
// Sample Cost Items
// ============================================================

const SAMPLE_COST_ITEMS: CostItem[] = [
  // Direct costs
  {
    id: 'sample-ci-1',
    foundry_id: 'sample',
    name: 'Consultant Salaries',
    category: 'personnel',
    amount: 28000,
    currency: 'GBP',
    period: 'monthly',
    cost_type: 'direct',
    source: 'manual',
    description: 'Delivery team salaries',
    sort_order: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'sample-ci-2',
    foundry_id: 'sample',
    name: 'Subcontractors',
    category: 'personnel',
    amount: 8000,
    currency: 'GBP',
    period: 'monthly',
    cost_type: 'direct',
    source: 'manual',
    description: 'Freelance specialists for project delivery',
    sort_order: 1,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  // Shared / Indirect costs
  {
    id: 'sample-ci-3',
    foundry_id: 'sample',
    name: 'Marketing',
    category: 'marketing',
    amount: 5000,
    currency: 'GBP',
    period: 'monthly',
    cost_type: 'indirect',
    source: 'manual',
    description: 'Content, ads, and events',
    sort_order: 2,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'sample-ci-4',
    foundry_id: 'sample',
    name: 'Software & Tools',
    category: 'infrastructure',
    amount: 3000,
    currency: 'GBP',
    period: 'monthly',
    cost_type: 'indirect',
    source: 'manual',
    description: 'SaaS subscriptions, CRM, project management',
    sort_order: 3,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  // Overhead
  {
    id: 'sample-ci-5',
    foundry_id: 'sample',
    name: 'Office & Rent',
    category: 'operations',
    amount: 4000,
    currency: 'GBP',
    period: 'monthly',
    cost_type: 'overhead',
    source: 'manual',
    description: 'Office space and utilities',
    sort_order: 4,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'sample-ci-6',
    foundry_id: 'sample',
    name: 'Admin & Insurance',
    category: 'operations',
    amount: 2000,
    currency: 'GBP',
    period: 'monthly',
    cost_type: 'overhead',
    source: 'manual',
    description: 'Accounting, legal, insurance',
    sort_order: 5,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
]

// ============================================================
// Sample Cost Links (allocation)
// ============================================================

const SAMPLE_COST_LINKS: CostLink[] = [
  // Consultant Salaries: 50% Consulting, 33% Retainers, 17% Products
  { id: 'sample-cl-1', cost_item_id: 'sample-ci-1', revenue_stream_id: 'sample-rs-1', allocation_pct: 50, allocation_method: 'custom', created_at: now, updated_at: now },
  { id: 'sample-cl-2', cost_item_id: 'sample-ci-1', revenue_stream_id: 'sample-rs-2', allocation_pct: 33, allocation_method: 'custom', created_at: now, updated_at: now },
  { id: 'sample-cl-3', cost_item_id: 'sample-ci-1', revenue_stream_id: 'sample-rs-3', allocation_pct: 17, allocation_method: 'custom', created_at: now, updated_at: now },
  // Subcontractors: 70% Consulting, 30% Retainers
  { id: 'sample-cl-4', cost_item_id: 'sample-ci-2', revenue_stream_id: 'sample-rs-1', allocation_pct: 70, allocation_method: 'custom', created_at: now, updated_at: now },
  { id: 'sample-cl-5', cost_item_id: 'sample-ci-2', revenue_stream_id: 'sample-rs-2', allocation_pct: 30, allocation_method: 'custom', created_at: now, updated_at: now },
]

// ============================================================
// Pre-computed Summary
// ============================================================

const totalRevenue = SAMPLE_REVENUE_STREAMS.reduce((sum, rs) => sum + rs.amount, 0) // 90,000
const totalDirect = 28000 + 8000 // 36,000
const totalIndirect = 5000 + 3000 // 8,000
const totalOverhead = 4000 + 2000 // 6,000
const totalCosts = totalDirect + totalIndirect + totalOverhead // 50,000
const netMargin = totalRevenue - totalCosts // 40,000

const SAMPLE_SUMMARY: MoneyMapSummary = {
  total_revenue: totalRevenue,
  total_direct_costs: totalDirect,
  total_indirect_costs: totalIndirect,
  total_overhead_costs: totalOverhead,
  total_costs: totalCosts,
  net_margin: netMargin,
  net_margin_pct: (netMargin / totalRevenue) * 100, // 44.4%
  stream_count: 3,
  cost_count: 6,
}

// ============================================================
// Pre-computed Profitability per Stream
// ============================================================

const SAMPLE_PROFITABILITY: StreamProfitability[] = [
  {
    revenue_stream: SAMPLE_REVENUE_STREAMS[0], // Consulting: £45k
    direct_costs: 14000 + 5600, // 50% of salaries + 70% of subs = 19,600
    indirect_costs: 2500 + 1500, // proportional share of marketing + tools = 4,000
    overhead_costs: 2000 + 1000, // proportional share = 3,000
    total_costs: 19600 + 4000 + 3000, // 26,600
    net: 45000 - 26600, // 18,400
    margin_pct: ((45000 - 26600) / 45000) * 100, // 40.9%
  },
  {
    revenue_stream: SAMPLE_REVENUE_STREAMS[1], // Retainers: £30k
    direct_costs: 9240 + 2400, // 33% of salaries + 30% of subs = 11,640
    indirect_costs: 1667 + 1000, // proportional = 2,667
    overhead_costs: 1333 + 667, // proportional = 2,000
    total_costs: 11640 + 2667 + 2000, // 16,307
    net: 30000 - 16307, // 13,693
    margin_pct: ((30000 - 16307) / 30000) * 100, // 45.6%
  },
  {
    revenue_stream: SAMPLE_REVENUE_STREAMS[2], // Product Sales: £15k
    direct_costs: 4760, // 17% of salaries = 4,760
    indirect_costs: 833 + 500, // proportional = 1,333
    overhead_costs: 667 + 333, // proportional = 1,000
    total_costs: 4760 + 1333 + 1000, // 7,093
    net: 15000 - 7093, // 7,907
    margin_pct: ((15000 - 7093) / 15000) * 100, // 52.7%
  },
]

// ============================================================
// Exported Sample Data
// ============================================================

/**
 * Complete sample Money Map dataset for demo mode.
 * Models a small UK consultancy with £90k monthly revenue.
 */
export const SAMPLE_MONEY_MAP_DATA: MoneyMapData = {
  revenue_streams: SAMPLE_REVENUE_STREAMS,
  cost_items: SAMPLE_COST_ITEMS,
  cost_links: SAMPLE_COST_LINKS,
  summary: SAMPLE_SUMMARY,
  profitability: SAMPLE_PROFITABILITY,
}

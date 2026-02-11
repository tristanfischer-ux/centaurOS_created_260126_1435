/**
 * @file money-map.ts
 *
 * @description Type definitions for the Money Map feature — revenue streams,
 * cost items, cost allocation links, snapshots, and computed summaries.
 */

import type { Json } from '@/types/database.types'

// ============================================================
// Enums / Literal Unions
// ============================================================

export type RevenueCategory = 'product' | 'service' | 'marketplace' | 'subscription' | 'other'
export type CostCategory = 'personnel' | 'infrastructure' | 'marketing' | 'operations' | 'other'
export type CostType = 'direct' | 'indirect' | 'overhead'
export type Period = 'monthly' | 'quarterly' | 'annual'
export type DataSource = 'manual' | 'auto'
export type AutoSourceType = 'marketplace_orders' | 'retainers' | 'bookings' | 'platform_fees'
export type AllocationMethod = 'revenue_proportional' | 'equal' | 'headcount' | 'custom'

// ============================================================
// Database Row Types
// ============================================================

export interface RevenueStream {
  id: string
  foundry_id: string
  name: string
  category: RevenueCategory
  amount: number
  currency: string
  period: Period
  source: DataSource
  auto_source_type: AutoSourceType | null
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CostItem {
  id: string
  foundry_id: string
  name: string
  category: CostCategory
  amount: number
  currency: string
  period: Period
  cost_type: CostType
  source: DataSource
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CostLink {
  id: string
  cost_item_id: string
  revenue_stream_id: string
  allocation_pct: number
  allocation_method: AllocationMethod
  created_at: string
  updated_at: string
}

/**
 * Matches the money_map_snapshots DB row. `snapshot_data` is stored as JSONB
 * and typed as `Json` to match the Supabase-generated schema. Use
 * {@link parseSnapshotData} to safely narrow it to `MoneyMapSnapshotData`.
 */
export interface MoneyMapSnapshot {
  id: string
  foundry_id: string
  name: string
  period_label: string
  snapshot_data: Json
  total_revenue: number
  total_costs: number
  net_margin_pct: number
  created_at: string
}

/**
 * Type guard that narrows a `Json` value to `MoneyMapSnapshotData`.
 *
 * @description Validates that the JSON payload has the expected top-level
 * keys before narrowing. This avoids unsafe `as` casts when reading
 * snapshot_data from the database.
 *
 * @param value - Raw JSON from the snapshot_data column
 * @returns True if value has the expected MoneyMapSnapshotData shape
 */
export function isMoneyMapSnapshotData(
  value: Json,
): value is Json & MoneyMapSnapshotData {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'revenue_streams' in value &&
    'cost_items' in value &&
    'cost_links' in value &&
    'summary' in value
  )
}

/**
 * Safely parse snapshot_data from its DB representation (`Json`) to
 * the typed `MoneyMapSnapshotData` form. Returns `null` if the stored
 * value doesn't match the expected shape.
 */
export function parseSnapshotData(value: Json): MoneyMapSnapshotData | null {
  return isMoneyMapSnapshotData(value) ? value : null
}

// ============================================================
// Form / Input Types
// ============================================================

export interface RevenueStreamInput {
  name: string
  category: RevenueCategory
  amount: number
  currency?: string
  period?: Period
  source?: DataSource
  auto_source_type?: AutoSourceType | null
  description?: string
}

export interface CostItemInput {
  name: string
  category: CostCategory
  amount: number
  currency?: string
  period?: Period
  cost_type: CostType
  source?: DataSource
  description?: string
}

export interface CostLinkInput {
  cost_item_id: string
  revenue_stream_id: string
  allocation_pct: number
  allocation_method: AllocationMethod
}

// ============================================================
// Computed / Derived Types
// ============================================================

/** Allocation result for a single cost → revenue stream link */
export interface AllocatedCost {
  cost_item_id: string
  cost_name: string
  cost_type: CostType
  revenue_stream_id: string
  allocated_amount: number
  allocation_pct: number
  allocation_method: AllocationMethod
}

/** Profitability row — one per revenue stream with fully-loaded costs */
export interface StreamProfitability {
  revenue_stream: RevenueStream
  direct_costs: number
  indirect_costs: number
  overhead_costs: number
  total_costs: number
  net: number
  margin_pct: number
}

/** Summary KPIs for the whole money map */
export interface MoneyMapSummary {
  total_revenue: number
  total_direct_costs: number
  total_indirect_costs: number
  total_overhead_costs: number
  total_costs: number
  net_margin: number
  net_margin_pct: number
  stream_count: number
  cost_count: number
}

/** Full money map state — used for snapshots and initial load */
export interface MoneyMapData {
  revenue_streams: RevenueStream[]
  cost_items: CostItem[]
  cost_links: CostLink[]
  summary: MoneyMapSummary
  profitability: StreamProfitability[]
}

/** Snapshot payload stored as JSONB */
export interface MoneyMapSnapshotData {
  revenue_streams: RevenueStream[]
  cost_items: CostItem[]
  cost_links: CostLink[]
  profitability: StreamProfitability[]
  summary: MoneyMapSummary
}

// ============================================================
// Sankey Chart Types
// ============================================================

export interface SankeyNode {
  name: string
  value?: number
  category?: string
}

export interface SankeyLink {
  source: number
  target: number
  value: number
}

export interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
}

// ============================================================
// Constants
// ============================================================

export const REVENUE_CATEGORY_LABELS = {
  product: 'Products',
  service: 'Services',
  marketplace: 'Marketplace',
  subscription: 'Subscriptions',
  other: 'Other',
} satisfies Record<RevenueCategory, string>

export const COST_CATEGORY_LABELS = {
  personnel: 'Personnel',
  infrastructure: 'Infrastructure',
  marketing: 'Marketing',
  operations: 'Operations',
  other: 'Other',
} satisfies Record<CostCategory, string>

export const COST_TYPE_LABELS = {
  direct: 'Direct',
  indirect: 'Shared / Indirect',
  overhead: 'Overhead',
} satisfies Record<CostType, string>

export const PERIOD_LABELS = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
} satisfies Record<Period, string>

export const ALLOCATION_METHOD_LABELS = {
  revenue_proportional: 'Revenue Proportional',
  equal: 'Equal Split',
  headcount: 'Headcount Based',
  custom: 'Custom',
} satisfies Record<AllocationMethod, string>

/** Multipliers to normalise all amounts to monthly */
export const PERIOD_TO_MONTHLY = {
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
} satisfies Record<Period, number>

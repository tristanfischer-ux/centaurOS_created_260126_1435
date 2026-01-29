/**
 * Analytics Types
 * Types for supplier, buyer, and platform analytics dashboards
 */

// ==========================================
// PERIOD TYPES
// ==========================================

export type AnalyticsPeriod = 'week' | 'month' | 'quarter' | 'year' | 'all'

export interface DateRange {
  start: Date
  end: Date
}

// ==========================================
// CHART DATA TYPES
// ==========================================

export interface ChartDataPoint {
  date: string
  label: string
  value: number
  previousValue?: number
}

export interface TimeSeriesDataPoint {
  date: string
  value: number
  label?: string
}

export interface CategoryDataPoint {
  category: string
  value: number
  percentage?: number
  color?: string
}

export interface ComparisonDataPoint {
  name: string
  current: number
  previous: number
  change: number
  changePercent: number
}

// ==========================================
// SUPPLIER/PROVIDER ANALYTICS
// ==========================================

export interface SupplierAnalytics {
  // Overview
  totalOrders: number
  completedOrders: number
  cancelledOrders: number
  activeOrders: number
  
  // Financial
  lifetimeGmv: number
  earningsThisMonth: number
  earningsPreviousMonth: number
  pendingPayout: number
  averageOrderValue: number
  currency: string
  
  // Performance metrics
  completionRate: number
  responseRate: number
  averageResponseTimeHours: number
  averageRating: number
  totalReviews: number
  repeatClientRate: number
  
  // Trends
  earningsTrend: TimeSeriesDataPoint[]
  ordersTrend: TimeSeriesDataPoint[]
  ratingTrend: TimeSeriesDataPoint[]
  
  // Breakdowns
  ordersByStatus: CategoryDataPoint[]
  ordersByType: CategoryDataPoint[]
  revenueByCategory: CategoryDataPoint[]
  
  // Top items
  topClients: TopClient[]
  trendingSkills: TrendingSkill[]
  
  // Period comparison
  periodComparison: {
    orders: ComparisonDataPoint
    revenue: ComparisonDataPoint
    rating: ComparisonDataPoint
    responseTime: ComparisonDataPoint
  }
}

export interface TopClient {
  id: string
  name: string
  avatarUrl?: string
  totalOrders: number
  totalSpend: number
  lastOrderAt: string
}

export interface TrendingSkill {
  skill: string
  demandScore: number
  trend: 'up' | 'down' | 'stable'
  matchCount: number
}

// ==========================================
// BUYER ANALYTICS
// ==========================================

export interface BuyerAnalytics {
  // Overview
  totalOrders: number
  completedOrders: number
  activeOrders: number
  disputedOrders: number
  
  // Financial
  totalSpend: number
  spendThisMonth: number
  spendPreviousMonth: number
  averageOrderValue: number
  totalSavings: number
  currency: string
  
  // Budget tracking
  budgetAmount?: number
  budgetUsed?: number
  budgetRemaining?: number
  
  // Trends
  spendTrend: TimeSeriesDataPoint[]
  ordersTrend: TimeSeriesDataPoint[]
  
  // Breakdowns
  spendByCategory: CategoryDataPoint[]
  spendByProvider: CategoryDataPoint[]
  ordersByStatus: CategoryDataPoint[]
  
  // Top items
  topProviders: TopProvider[]
  frequentCategories: CategoryDataPoint[]
  
  // Period comparison
  periodComparison: {
    orders: ComparisonDataPoint
    spend: ComparisonDataPoint
    savings: ComparisonDataPoint
  }
}

export interface TopProvider {
  id: string
  name: string
  avatarUrl?: string
  totalOrders: number
  totalSpend: number
  averageRating: number
  lastOrderAt: string
}

// ==========================================
// PLATFORM/ADMIN ANALYTICS
// ==========================================

export interface PlatformAnalytics {
  // GMV and Fees
  totalGmv: number
  gmvThisMonth: number
  gmvPreviousMonth: number
  totalFees: number
  feesThisMonth: number
  takeRate: number
  
  // Users
  totalUsers: number
  totalProviders: number
  totalBuyers: number
  activeProvidersThisMonth: number
  activeBuyersThisMonth: number
  newUsersThisMonth: number
  userGrowthRate: number
  
  // Transactions
  totalOrders: number
  ordersThisMonth: number
  completedOrdersRate: number
  averageOrderValue: number
  disputeRate: number
  
  // Trends
  gmvTrend: TimeSeriesDataPoint[]
  usersTrend: TimeSeriesDataPoint[]
  ordersTrend: TimeSeriesDataPoint[]
  
  // Breakdowns
  gmvByCategory: CategoryDataPoint[]
  usersByRole: CategoryDataPoint[]
  ordersByType: CategoryDataPoint[]
  
  // Top performers
  topProviders: PlatformTopProvider[]
  topBuyers: PlatformTopBuyer[]
  
  // Category distribution
  categoryDistribution: CategoryDataPoint[]
}

export interface PlatformTopProvider {
  id: string
  name: string
  avatarUrl?: string
  totalGmv: number
  totalOrders: number
  averageRating: number
  tier: string
}

export interface PlatformTopBuyer {
  id: string
  name: string
  avatarUrl?: string
  totalSpend: number
  totalOrders: number
  foundryName?: string
}

// ==========================================
// MATERIALIZED VIEW TYPES
// ==========================================

export interface ProviderStatsRow {
  provider_id: string
  total_orders: number
  completed_orders: number
  cancelled_orders: number
  lifetime_gmv: number
  average_order_value: number
  average_rating: number
  total_reviews: number
  response_rate: number
  avg_response_time_hours: number
  completion_rate: number
  repeat_client_rate: number
  last_order_at: string
  updated_at: string
}

export interface BuyerStatsRow {
  buyer_id: string
  total_orders: number
  completed_orders: number
  total_spend: number
  average_order_value: number
  total_savings: number
  unique_providers: number
  last_order_at: string
  updated_at: string
}

export interface PlatformStatsRow {
  stat_date: string
  total_gmv: number
  total_fees: number
  total_orders: number
  completed_orders: number
  total_users: number
  total_providers: number
  total_buyers: number
  active_providers: number
  active_buyers: number
  new_users: number
  average_order_value: number
  dispute_rate: number
  completion_rate: number
}

// ==========================================
// EXPORT TYPES
// ==========================================

export type ExportFormat = 'csv' | 'json'

export interface ExportOptions {
  format: ExportFormat
  period: AnalyticsPeriod
  includeCharts?: boolean
}

// ==========================================
// METRIC CARD TYPES
// ==========================================

export interface MetricCardData {
  label: string
  value: string | number
  trend?: {
    direction: 'up' | 'down' | 'neutral'
    value: string
    isPositive?: boolean
  }
  icon?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

// ==========================================
// DASHBOARD STATE
// ==========================================

export interface AnalyticsDashboardState {
  period: AnalyticsPeriod
  isLoading: boolean
  error?: string
  lastUpdated?: string
}

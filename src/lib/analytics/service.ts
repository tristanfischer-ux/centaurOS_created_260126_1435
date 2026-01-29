/**
 * Analytics Service
 * Core analytics computation for suppliers, buyers, and platform
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/types/database.types"
import {
  SupplierAnalytics,
  BuyerAnalytics,
  PlatformAnalytics,
  AnalyticsPeriod,
  DateRange,
  TimeSeriesDataPoint,
  CategoryDataPoint,
  TopClient,
  TopProvider,
  TrendingSkill,
  ComparisonDataPoint,
  PlatformTopProvider,
  PlatformTopBuyer,
} from "@/types/analytics"
import { 
  subDays, 
  subWeeks, 
  subMonths, 
  subQuarters, 
  subYears, 
  startOfWeek, 
  startOfMonth, 
  startOfQuarter, 
  startOfYear,
  format,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval
} from "date-fns"

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Calculate percentage growth between two values
 */
export function calculateGrowth(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

/**
 * Get date range for a given period
 */
export function getDateRangeForPeriod(period: AnalyticsPeriod): DateRange {
  const now = new Date()
  
  switch (period) {
    case 'week':
      return {
        start: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
        end: now
      }
    case 'month':
      return {
        start: startOfMonth(subMonths(now, 1)),
        end: now
      }
    case 'quarter':
      return {
        start: startOfQuarter(subQuarters(now, 1)),
        end: now
      }
    case 'year':
      return {
        start: startOfYear(subYears(now, 1)),
        end: now
      }
    case 'all':
      return {
        start: new Date('2020-01-01'),
        end: now
      }
    default:
      return {
        start: startOfMonth(now),
        end: now
      }
  }
}

/**
 * Get the previous period's date range for comparison
 */
export function getPreviousPeriodRange(period: AnalyticsPeriod): DateRange {
  const current = getDateRangeForPeriod(period)
  const duration = current.end.getTime() - current.start.getTime()
  
  return {
    start: new Date(current.start.getTime() - duration),
    end: new Date(current.start.getTime() - 1)
  }
}

/**
 * Format currency
 */
function formatCurrency(amount: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// ==========================================
// SUPPLIER ANALYTICS
// ==========================================

/**
 * Get full supplier analytics for a provider
 */
export async function getSupplierAnalytics(
  supabase: SupabaseClient<Database>,
  providerId: string,
  period: AnalyticsPeriod
): Promise<{ data: SupplierAnalytics | null; error: string | null }> {
  try {
    const { start, end } = getDateRangeForPeriod(period)
    const previous = getPreviousPeriodRange(period)
    
    // Get provider profile with stats
    const { data: provider, error: providerError } = await supabase
      .from('provider_profiles')
      .select(`
        id,
        currency,
        response_rate,
        avg_response_time_hours,
        completion_rate
      `)
      .eq('id', providerId)
      .single()
    
    if (providerError || !provider) {
      return { data: null, error: 'Provider not found' }
    }
    
    // Get all orders for this provider
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, status, total_amount, platform_fee, buyer_id, created_at, order_type')
      .eq('seller_id', providerId)
    
    if (ordersError) {
      return { data: null, error: 'Failed to fetch orders' }
    }
    
    // Get reviews
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewsResult = await (supabase as any)
      .from('provider_reviews')
      .select('rating, created_at')
      .eq('reviewee_id', providerId)
    const reviews = reviewsResult.data as { rating: number; created_at: string }[] | null
    
    // Calculate metrics
    const allOrders = orders || []
    const periodOrders = allOrders.filter(o => 
      new Date(o.created_at) >= start && new Date(o.created_at) <= end
    )
    const previousPeriodOrders = allOrders.filter(o => 
      new Date(o.created_at) >= previous.start && new Date(o.created_at) <= previous.end
    )
    
    const completedOrders = allOrders.filter(o => o.status === 'completed')
    const cancelledOrders = allOrders.filter(o => o.status === 'cancelled')
    const activeOrders = allOrders.filter(o => 
      ['pending', 'accepted', 'in_progress'].includes(o.status)
    )
    
    const lifetimeGmv = completedOrders.reduce((sum, o) => sum + o.total_amount, 0)
    const lifetimeEarnings = completedOrders.reduce((sum, o) => sum + (o.total_amount - o.platform_fee), 0)
    
    const periodCompletedOrders = periodOrders.filter(o => o.status === 'completed')
    const previousCompletedOrders = previousPeriodOrders.filter(o => o.status === 'completed')
    
    const earningsThisMonth = periodCompletedOrders.reduce((sum, o) => sum + (o.total_amount - o.platform_fee), 0)
    const earningsPreviousMonth = previousCompletedOrders.reduce((sum, o) => sum + (o.total_amount - o.platform_fee), 0)
    
    // Average order value
    const avgOrderValue = completedOrders.length > 0 
      ? lifetimeGmv / completedOrders.length 
      : 0
    
    // Rating metrics
    const allReviews = reviews || []
    const averageRating = allReviews.length > 0
      ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
      : 0
    
    // Repeat client rate
    const buyerCounts: Record<string, number> = {}
    allOrders.forEach(o => {
      buyerCounts[o.buyer_id] = (buyerCounts[o.buyer_id] || 0) + 1
    })
    const repeatBuyers = Object.values(buyerCounts).filter(count => count > 1).length
    const totalBuyers = Object.keys(buyerCounts).length
    const repeatClientRate = totalBuyers > 0 ? (repeatBuyers / totalBuyers) * 100 : 0
    
    // Earnings trend
    const earningsTrend = generateTimeSeries(
      periodOrders.filter(o => o.status === 'completed'),
      'created_at',
      (o) => o.total_amount - o.platform_fee,
      period
    )
    
    // Orders trend
    const ordersTrend = generateTimeSeries(
      periodOrders,
      'created_at',
      () => 1,
      period
    )
    
    // Rating trend
    const periodReviews: { rating: number; created_at: string }[] = (reviews || []).filter(r => 
      new Date(r.created_at) >= start && new Date(r.created_at) <= end
    )
    const ratingTrend = generateTimeSeries(
      periodReviews,
      'created_at',
      (r: { rating: number; created_at: string }) => r.rating,
      period,
      'average'
    )
    
    // Orders by status breakdown
    const ordersByStatus = getStatusBreakdown(allOrders)
    
    // Orders by type breakdown
    const ordersByType = getTypeBreakdown(allOrders)
    
    // Top clients
    const topClients = await getTopClients(supabase, providerId, 5)
    
    // Period comparison
    const periodComparison = {
      orders: createComparison('Orders', periodOrders.length, previousPeriodOrders.length),
      revenue: createComparison('Revenue', earningsThisMonth, earningsPreviousMonth),
      rating: createComparison('Rating', 
        periodReviews.length > 0 ? periodReviews.reduce((s, r) => s + r.rating, 0) / periodReviews.length : averageRating,
        averageRating
      ),
      responseTime: createComparison('Response Time', 
        provider.avg_response_time_hours || 0, 
        provider.avg_response_time_hours || 0
      )
    }
    
    return {
      data: {
        totalOrders: allOrders.length,
        completedOrders: completedOrders.length,
        cancelledOrders: cancelledOrders.length,
        activeOrders: activeOrders.length,
        lifetimeGmv,
        earningsThisMonth,
        earningsPreviousMonth,
        pendingPayout: 0, // Would need escrow data
        averageOrderValue: avgOrderValue,
        currency: provider.currency || 'GBP',
        completionRate: provider.completion_rate || 
          (allOrders.length > 0 ? (completedOrders.length / allOrders.length) * 100 : 0),
        responseRate: provider.response_rate || 0,
        averageResponseTimeHours: provider.avg_response_time_hours || 0,
        averageRating,
        totalReviews: allReviews.length,
        repeatClientRate,
        earningsTrend,
        ordersTrend,
        ratingTrend,
        ordersByStatus,
        ordersByType,
        revenueByCategory: [], // Would need category data
        topClients,
        trendingSkills: [], // Would need marketplace demand data
        periodComparison
      },
      error: null
    }
  } catch (err) {
    console.error('Error fetching supplier analytics:', err)
    return { data: null, error: 'Failed to fetch analytics' }
  }
}

// ==========================================
// BUYER ANALYTICS
// ==========================================

/**
 * Get full buyer analytics for a user
 */
export async function getBuyerAnalytics(
  supabase: SupabaseClient<Database>,
  userId: string,
  period: AnalyticsPeriod
): Promise<{ data: BuyerAnalytics | null; error: string | null }> {
  try {
    const { start, end } = getDateRangeForPeriod(period)
    const previous = getPreviousPeriodRange(period)
    
    // Get all orders for this buyer
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id, 
        status, 
        total_amount, 
        seller_id, 
        created_at,
        order_type,
        listing:marketplace_listings(category)
      `)
      .eq('buyer_id', userId)
    
    if (ordersError) {
      return { data: null, error: 'Failed to fetch orders' }
    }
    
    const allOrders = orders || []
    const periodOrders = allOrders.filter(o => 
      new Date(o.created_at) >= start && new Date(o.created_at) <= end
    )
    const previousPeriodOrders = allOrders.filter(o => 
      new Date(o.created_at) >= previous.start && new Date(o.created_at) <= previous.end
    )
    
    const completedOrders = allOrders.filter(o => o.status === 'completed')
    const activeOrders = allOrders.filter(o => 
      ['pending', 'accepted', 'in_progress'].includes(o.status)
    )
    const disputedOrders = allOrders.filter(o => o.status === 'disputed')
    
    // Financial metrics
    const totalSpend = allOrders.reduce((sum, o) => sum + o.total_amount, 0)
    const spendThisMonth = periodOrders.reduce((sum, o) => sum + o.total_amount, 0)
    const spendPreviousMonth = previousPeriodOrders.reduce((sum, o) => sum + o.total_amount, 0)
    const avgOrderValue = allOrders.length > 0 ? totalSpend / allOrders.length : 0
    
    // Spend trend
    const spendTrend = generateTimeSeries(
      periodOrders,
      'created_at',
      (o) => o.total_amount,
      period
    )
    
    // Orders trend
    const ordersTrend = generateTimeSeries(
      periodOrders,
      'created_at',
      () => 1,
      period
    )
    
    // Spend by category
    const categorySpend: Record<string, number> = {}
    allOrders.forEach(o => {
      const category = (o.listing as { category?: string } | null)?.category || 'Other'
      categorySpend[category] = (categorySpend[category] || 0) + o.total_amount
    })
    const spendByCategory: CategoryDataPoint[] = Object.entries(categorySpend)
      .map(([category, value]) => ({
        category,
        value,
        percentage: totalSpend > 0 ? Math.round((value / totalSpend) * 100) : 0
      }))
      .sort((a, b) => b.value - a.value)
    
    // Top providers
    const topProviders = await getTopProviders(supabase, userId, 5)
    
    // Orders by status
    const ordersByStatus = getStatusBreakdown(allOrders)
    
    // Period comparison
    const periodComparison = {
      orders: createComparison('Orders', periodOrders.length, previousPeriodOrders.length),
      spend: createComparison('Spend', spendThisMonth, spendPreviousMonth),
      savings: createComparison('Savings', 0, 0) // Would need discount data
    }
    
    return {
      data: {
        totalOrders: allOrders.length,
        completedOrders: completedOrders.length,
        activeOrders: activeOrders.length,
        disputedOrders: disputedOrders.length,
        totalSpend,
        spendThisMonth,
        spendPreviousMonth,
        averageOrderValue: avgOrderValue,
        totalSavings: 0, // Would need discount tracking
        currency: 'GBP', // Would come from user profile
        spendTrend,
        ordersTrend,
        spendByCategory,
        spendByProvider: [], // Simplified for now
        ordersByStatus,
        topProviders,
        frequentCategories: spendByCategory.slice(0, 5),
        periodComparison
      },
      error: null
    }
  } catch (err) {
    console.error('Error fetching buyer analytics:', err)
    return { data: null, error: 'Failed to fetch analytics' }
  }
}

// ==========================================
// PLATFORM ANALYTICS
// ==========================================

/**
 * Get platform-wide analytics for admin
 */
export async function getPlatformAnalytics(
  supabase: SupabaseClient<Database>,
  period: AnalyticsPeriod
): Promise<{ data: PlatformAnalytics | null; error: string | null }> {
  try {
    const { start, end } = getDateRangeForPeriod(period)
    const previous = getPreviousPeriodRange(period)
    
    // Get all orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id, 
        status, 
        total_amount, 
        platform_fee,
        buyer_id,
        seller_id,
        created_at,
        order_type
      `)
    
    if (ordersError) {
      return { data: null, error: 'Failed to fetch orders' }
    }
    
    // Get user counts
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
    
    const { count: totalProviders } = await supabase
      .from('provider_profiles')
      .select('*', { count: 'exact', head: true })
    
    const { data: newUsersData } = await supabase
      .from('profiles')
      .select('id')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
    
    const allOrders = orders || []
    const periodOrders = allOrders.filter(o => 
      new Date(o.created_at) >= start && new Date(o.created_at) <= end
    )
    const previousPeriodOrders = allOrders.filter(o => 
      new Date(o.created_at) >= previous.start && new Date(o.created_at) <= previous.end
    )
    
    const completedOrders = allOrders.filter(o => o.status === 'completed')
    const periodCompleted = periodOrders.filter(o => o.status === 'completed')
    const previousCompleted = previousPeriodOrders.filter(o => o.status === 'completed')
    
    // GMV calculations
    const totalGmv = completedOrders.reduce((sum, o) => sum + o.total_amount, 0)
    const gmvThisMonth = periodCompleted.reduce((sum, o) => sum + o.total_amount, 0)
    const gmvPreviousMonth = previousCompleted.reduce((sum, o) => sum + o.total_amount, 0)
    
    // Fee calculations
    const totalFees = completedOrders.reduce((sum, o) => sum + o.platform_fee, 0)
    const feesThisMonth = periodCompleted.reduce((sum, o) => sum + o.platform_fee, 0)
    const takeRate = totalGmv > 0 ? (totalFees / totalGmv) * 100 : 0
    
    // Active users
    const activeProvidersThisMonth = new Set(periodOrders.map(o => o.seller_id)).size
    const activeBuyersThisMonth = new Set(periodOrders.map(o => o.buyer_id)).size
    
    // Unique buyers total
    const totalBuyers = new Set(allOrders.map(o => o.buyer_id)).size
    
    // User growth
    const newUsersThisMonth = newUsersData?.length || 0
    const userGrowthRate = totalUsers && totalUsers > 0 
      ? (newUsersThisMonth / totalUsers) * 100 
      : 0
    
    // Order metrics
    const avgOrderValue = completedOrders.length > 0 
      ? totalGmv / completedOrders.length 
      : 0
    const disputedOrders = allOrders.filter(o => o.status === 'disputed')
    const disputeRate = allOrders.length > 0 
      ? (disputedOrders.length / allOrders.length) * 100 
      : 0
    const completedOrdersRate = allOrders.length > 0
      ? (completedOrders.length / allOrders.length) * 100
      : 0
    
    // GMV trend
    const gmvTrend = generateTimeSeries(
      periodCompleted,
      'created_at',
      (o) => o.total_amount,
      period
    )
    
    // Orders trend
    const ordersTrend = generateTimeSeries(
      periodOrders,
      'created_at',
      () => 1,
      period
    )
    
    // GMV by category (simplified - would need category join)
    const gmvByCategory: CategoryDataPoint[] = []
    
    // Top providers by GMV
    const topProviders = await getPlatformTopProviders(supabase, 10)
    
    // Top buyers by spend
    const topBuyers = await getPlatformTopBuyers(supabase, 10)
    
    return {
      data: {
        totalGmv,
        gmvThisMonth,
        gmvPreviousMonth,
        totalFees,
        feesThisMonth,
        takeRate,
        totalUsers: totalUsers || 0,
        totalProviders: totalProviders || 0,
        totalBuyers,
        activeProvidersThisMonth,
        activeBuyersThisMonth,
        newUsersThisMonth,
        userGrowthRate,
        totalOrders: allOrders.length,
        ordersThisMonth: periodOrders.length,
        completedOrdersRate,
        averageOrderValue: avgOrderValue,
        disputeRate,
        gmvTrend,
        usersTrend: [], // Would need historical user data
        ordersTrend,
        gmvByCategory,
        usersByRole: [
          { category: 'Providers', value: totalProviders || 0, percentage: 0 },
          { category: 'Buyers', value: totalBuyers, percentage: 0 }
        ],
        ordersByType: getTypeBreakdown(allOrders),
        topProviders,
        topBuyers,
        categoryDistribution: gmvByCategory
      },
      error: null
    }
  } catch (err) {
    console.error('Error fetching platform analytics:', err)
    return { data: null, error: 'Failed to fetch analytics' }
  }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function generateTimeSeries<T>(
  items: T[],
  dateField: keyof T,
  valueExtractor: (item: T) => number,
  period: AnalyticsPeriod,
  aggregation: 'sum' | 'average' | 'count' = 'sum'
): TimeSeriesDataPoint[] {
  const { start, end } = getDateRangeForPeriod(period)
  
  // Generate date buckets based on period
  let intervals: Date[]
  let formatStr: string
  
  if (period === 'week') {
    intervals = eachDayOfInterval({ start, end })
    formatStr = 'EEE'
  } else if (period === 'month') {
    intervals = eachDayOfInterval({ start, end })
    formatStr = 'MMM d'
  } else if (period === 'quarter') {
    intervals = eachWeekOfInterval({ start, end })
    formatStr = 'MMM d'
  } else {
    intervals = eachMonthOfInterval({ start, end })
    formatStr = 'MMM yyyy'
  }
  
  // Group items by date
  const grouped: Record<string, number[]> = {}
  intervals.forEach(date => {
    const key = format(date, 'yyyy-MM-dd')
    grouped[key] = []
  })
  
  items.forEach(item => {
    const itemDate = new Date(item[dateField] as string)
    const key = format(itemDate, 'yyyy-MM-dd')
    if (grouped[key]) {
      grouped[key].push(valueExtractor(item))
    }
  })
  
  // Aggregate values
  return intervals.map(date => {
    const key = format(date, 'yyyy-MM-dd')
    const values = grouped[key] || []
    
    let value: number
    if (aggregation === 'sum') {
      value = values.reduce((a, b) => a + b, 0)
    } else if (aggregation === 'average') {
      value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
    } else {
      value = values.length
    }
    
    return {
      date: format(date, formatStr),
      value: Math.round(value * 100) / 100,
      label: format(date, 'PP')
    }
  })
}

function getStatusBreakdown(orders: { status: string }[]): CategoryDataPoint[] {
  const statusCounts: Record<string, number> = {}
  orders.forEach(o => {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
  })
  
  const total = orders.length
  return Object.entries(statusCounts).map(([category, value]) => ({
    category: category.replace('_', ' '),
    value,
    percentage: total > 0 ? Math.round((value / total) * 100) : 0
  }))
}

function getTypeBreakdown(orders: { order_type?: string }[]): CategoryDataPoint[] {
  const typeCounts: Record<string, number> = {}
  orders.forEach(o => {
    const type = o.order_type || 'unknown'
    typeCounts[type] = (typeCounts[type] || 0) + 1
  })
  
  const total = orders.length
  return Object.entries(typeCounts).map(([category, value]) => ({
    category: category.replace('_', ' '),
    value,
    percentage: total > 0 ? Math.round((value / total) * 100) : 0
  }))
}

function createComparison(name: string, current: number, previous: number): ComparisonDataPoint {
  const change = current - previous
  const changePercent = calculateGrowth(current, previous)
  
  return {
    name,
    current,
    previous,
    change,
    changePercent
  }
}

async function getTopClients(
  supabase: SupabaseClient<Database>,
  providerId: string,
  limit: number
): Promise<TopClient[]> {
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      buyer_id,
      total_amount,
      created_at,
      buyer:profiles!orders_buyer_id_fkey(id, full_name, avatar_url)
    `)
    .eq('seller_id', providerId)
    .eq('status', 'completed')
  
  if (!orders) return []
  
  // Group by buyer
  const buyerStats: Record<string, {
    id: string
    name: string
    avatarUrl?: string
    totalOrders: number
    totalSpend: number
    lastOrderAt: string
  }> = {}
  
  orders.forEach(o => {
    const buyerId = o.buyer_id
    const buyer = o.buyer as { id: string; full_name: string | null; avatar_url: string | null } | null
    
    if (!buyerStats[buyerId]) {
      buyerStats[buyerId] = {
        id: buyerId,
        name: buyer?.full_name || 'Unknown',
        avatarUrl: buyer?.avatar_url || undefined,
        totalOrders: 0,
        totalSpend: 0,
        lastOrderAt: o.created_at
      }
    }
    
    buyerStats[buyerId].totalOrders++
    buyerStats[buyerId].totalSpend += o.total_amount
    if (o.created_at > buyerStats[buyerId].lastOrderAt) {
      buyerStats[buyerId].lastOrderAt = o.created_at
    }
  })
  
  return Object.values(buyerStats)
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, limit)
}

async function getTopProviders(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit: number
): Promise<TopProvider[]> {
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      seller_id,
      total_amount,
      created_at,
      seller:provider_profiles!orders_seller_id_fkey(
        id, 
        headline,
        user:profiles(full_name, avatar_url)
      )
    `)
    .eq('buyer_id', userId)
  
  if (!orders) return []
  
  // Group by provider
  const providerStats: Record<string, {
    id: string
    name: string
    avatarUrl?: string
    totalOrders: number
    totalSpend: number
    averageRating: number
    lastOrderAt: string
  }> = {}
  
  orders.forEach(o => {
    const sellerId = o.seller_id
    const seller = o.seller as {
      id: string
      headline: string | null
      user: { full_name: string | null; avatar_url: string | null } | null
    } | null
    
    if (!providerStats[sellerId]) {
      providerStats[sellerId] = {
        id: sellerId,
        name: seller?.user?.full_name || seller?.headline || 'Unknown',
        avatarUrl: seller?.user?.avatar_url || undefined,
        totalOrders: 0,
        totalSpend: 0,
        averageRating: 0,
        lastOrderAt: o.created_at
      }
    }
    
    providerStats[sellerId].totalOrders++
    providerStats[sellerId].totalSpend += o.total_amount
    if (o.created_at > providerStats[sellerId].lastOrderAt) {
      providerStats[sellerId].lastOrderAt = o.created_at
    }
  })
  
  return Object.values(providerStats)
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, limit)
}

async function getPlatformTopProviders(
  supabase: SupabaseClient<Database>,
  limit: number
): Promise<PlatformTopProvider[]> {
  const { data: providers } = await supabase
    .from('provider_profiles')
    .select(`
      id,
      headline,
      tier,
      user:profiles(full_name, avatar_url)
    `)
    .limit(limit)
  
  if (!providers) return []
  
  // Get order stats for each provider
  const results: PlatformTopProvider[] = []
  
  for (const p of providers) {
    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, status')
      .eq('seller_id', p.id)
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewsResult = await (supabase as any)
      .from('provider_reviews')
      .select('rating')
      .eq('reviewee_id', p.id)
    const reviews = reviewsResult.data as { rating: number }[] | null
    
    const completedOrders = (orders || []).filter(o => o.status === 'completed')
    const totalGmv = completedOrders.reduce((sum, o) => sum + o.total_amount, 0)
    const avgRating = (reviews || []).length > 0
      ? (reviews || []).reduce((sum, r) => sum + r.rating, 0) / (reviews || []).length
      : 0
    
    const user = p.user as { full_name: string | null; avatar_url: string | null } | null
    
    results.push({
      id: p.id,
      name: user?.full_name || p.headline || 'Unknown',
      avatarUrl: user?.avatar_url || undefined,
      totalGmv,
      totalOrders: completedOrders.length,
      averageRating: avgRating,
      tier: p.tier || 'standard'
    })
  }
  
  return results.sort((a, b) => b.totalGmv - a.totalGmv).slice(0, limit)
}

async function getPlatformTopBuyers(
  supabase: SupabaseClient<Database>,
  limit: number
): Promise<PlatformTopBuyer[]> {
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      buyer_id,
      total_amount,
      buyer:profiles!orders_buyer_id_fkey(id, full_name, avatar_url, foundry_id)
    `)
  
  if (!orders) return []
  
  // Group by buyer
  const buyerStats: Record<string, {
    id: string
    name: string
    avatarUrl?: string
    totalSpend: number
    totalOrders: number
    foundryName?: string
  }> = {}
  
  orders.forEach(o => {
    const buyerId = o.buyer_id
    const buyer = o.buyer as {
      id: string
      full_name: string | null
      avatar_url: string | null
      foundry_id: string
    } | null
    
    if (!buyerStats[buyerId]) {
      buyerStats[buyerId] = {
        id: buyerId,
        name: buyer?.full_name || 'Unknown',
        avatarUrl: buyer?.avatar_url || undefined,
        totalSpend: 0,
        totalOrders: 0
      }
    }
    
    buyerStats[buyerId].totalSpend += o.total_amount
    buyerStats[buyerId].totalOrders++
  })
  
  return Object.values(buyerStats)
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, limit)
}

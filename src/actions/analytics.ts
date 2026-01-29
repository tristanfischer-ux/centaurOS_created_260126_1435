"use server"

/**
 * Analytics Server Actions
 * Server-side actions for fetching analytics data
 */

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  SupplierAnalytics,
  BuyerAnalytics,
  PlatformAnalytics,
  AnalyticsPeriod,
  ExportFormat,
} from "@/types/analytics"
import {
  getSupplierAnalytics as getSupplierAnalyticsService,
  getBuyerAnalytics as getBuyerAnalyticsService,
  getPlatformAnalytics as getPlatformAnalyticsService,
  calculateGrowth,
} from "@/lib/analytics/service"
import {
  refreshProviderStats,
  refreshBuyerStats,
  refreshAllAnalytics,
} from "@/lib/analytics/materialized-views"

// ==========================================
// SUPPLIER ANALYTICS
// ==========================================

/**
 * Get analytics for the current provider
 */
export async function getSupplierDashboardAnalytics(
  period: AnalyticsPeriod = 'month'
): Promise<{
  data: SupplierAnalytics | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }
  
  // Get provider profile for this user
  // Using type assertion as provider_profiles is not in generated types
  const { data: providerProfile, error: profileError } = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          single: () => Promise<{ data: { id: string } | null; error: unknown }>
        }
      }
    }
  }).from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()
  
  if (profileError || !providerProfile) {
    return { data: null, error: "Provider profile not found" }
  }
  
  return getSupplierAnalyticsService(supabase, providerProfile.id, period)
}

/**
 * Get analytics for a specific provider (admin use)
 */
export async function getSupplierAnalyticsById(
  providerId: string,
  period: AnalyticsPeriod = 'month'
): Promise<{
  data: SupplierAnalytics | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }
  
  // Verify admin access
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  const isAdmin = profile?.role === 'Founder' || profile?.role === 'Executive'
  
  // If not admin, verify user owns this provider profile
  if (!isAdmin) {
    // Using type assertion as provider_profiles is not in generated types
    const { data: providerProfile } = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            single: () => Promise<{ data: { user_id: string } | null; error: unknown }>
          }
        }
      }
    }).from('provider_profiles')
      .select('user_id')
      .eq('id', providerId)
      .single()
    
    if (providerProfile?.user_id !== user.id) {
      return { data: null, error: "Not authorized" }
    }
  }
  
  return getSupplierAnalyticsService(supabase, providerId, period)
}

// ==========================================
// BUYER ANALYTICS
// ==========================================

/**
 * Get analytics for the current buyer
 */
export async function getBuyerDashboardAnalytics(
  period: AnalyticsPeriod = 'month'
): Promise<{
  data: BuyerAnalytics | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }
  
  return getBuyerAnalyticsService(supabase, user.id, period)
}

/**
 * Get analytics for a specific buyer (admin use)
 */
export async function getBuyerAnalyticsById(
  buyerId: string,
  period: AnalyticsPeriod = 'month'
): Promise<{
  data: BuyerAnalytics | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }
  
  // Verify admin access
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  const isAdmin = profile?.role === 'Founder' || profile?.role === 'Executive'
  
  if (!isAdmin && buyerId !== user.id) {
    return { data: null, error: "Not authorized" }
  }
  
  return getBuyerAnalyticsService(supabase, buyerId, period)
}

// ==========================================
// PLATFORM ANALYTICS (ADMIN)
// ==========================================

/**
 * Get platform-wide analytics (admin only)
 */
export async function getAdminAnalytics(
  period: AnalyticsPeriod = 'month'
): Promise<{
  data: PlatformAnalytics | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }
  
  // Verify admin access
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  const isAdmin = profile?.role === 'Founder' || profile?.role === 'Executive'
  
  if (!isAdmin) {
    return { data: null, error: "Not authorized" }
  }
  
  return getPlatformAnalyticsService(supabase, period)
}

// ==========================================
// PERIOD SELECTION
// ==========================================

/**
 * Get analytics by period (generic wrapper)
 */
export async function getAnalyticsByPeriod(
  type: 'supplier' | 'buyer' | 'platform',
  period: AnalyticsPeriod
): Promise<{
  data: SupplierAnalytics | BuyerAnalytics | PlatformAnalytics | null
  error: string | null
}> {
  switch (type) {
    case 'supplier':
      return getSupplierDashboardAnalytics(period)
    case 'buyer':
      return getBuyerDashboardAnalytics(period)
    case 'platform':
      return getAdminAnalytics(period)
    default:
      return { data: null, error: 'Invalid analytics type' }
  }
}

// ==========================================
// EXPORT ANALYTICS
// ==========================================

/**
 * Export analytics data to CSV or JSON
 */
export async function exportAnalytics(
  type: 'supplier' | 'buyer' | 'platform',
  period: AnalyticsPeriod,
  format: ExportFormat = 'csv'
): Promise<{
  data: string | null
  filename: string | null
  error: string | null
}> {
  // Get the analytics data first
  const result = await getAnalyticsByPeriod(type, period)
  
  if (result.error || !result.data) {
    return { data: null, filename: null, error: result.error || 'No data available' }
  }
  
  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `${type}-analytics-${period}-${timestamp}.${format}`
  
  if (format === 'json') {
    return {
      data: JSON.stringify(result.data, null, 2),
      filename,
      error: null
    }
  }
  
  // Convert to CSV
  const csvData = convertAnalyticsToCSV(type, result.data)
  
  return {
    data: csvData,
    filename,
    error: null
  }
}

/**
 * Convert analytics data to CSV format
 */
function convertAnalyticsToCSV(
  type: 'supplier' | 'buyer' | 'platform',
  data: SupplierAnalytics | BuyerAnalytics | PlatformAnalytics
): string {
  const lines: string[] = []
  
  // Add header
  lines.push('Metric,Value')
  
  if (type === 'supplier') {
    const supplierData = data as SupplierAnalytics
    lines.push(`Total Orders,${supplierData.totalOrders}`)
    lines.push(`Completed Orders,${supplierData.completedOrders}`)
    lines.push(`Cancelled Orders,${supplierData.cancelledOrders}`)
    lines.push(`Active Orders,${supplierData.activeOrders}`)
    lines.push(`Lifetime GMV,${supplierData.lifetimeGmv}`)
    lines.push(`Earnings This Month,${supplierData.earningsThisMonth}`)
    lines.push(`Pending Payout,${supplierData.pendingPayout}`)
    lines.push(`Average Order Value,${supplierData.averageOrderValue}`)
    lines.push(`Completion Rate,${supplierData.completionRate}%`)
    lines.push(`Response Rate,${supplierData.responseRate}%`)
    lines.push(`Average Response Time (hours),${supplierData.averageResponseTimeHours}`)
    lines.push(`Average Rating,${supplierData.averageRating}`)
    lines.push(`Total Reviews,${supplierData.totalReviews}`)
    lines.push(`Repeat Client Rate,${supplierData.repeatClientRate}%`)
  } else if (type === 'buyer') {
    const buyerData = data as BuyerAnalytics
    lines.push(`Total Orders,${buyerData.totalOrders}`)
    lines.push(`Completed Orders,${buyerData.completedOrders}`)
    lines.push(`Active Orders,${buyerData.activeOrders}`)
    lines.push(`Disputed Orders,${buyerData.disputedOrders}`)
    lines.push(`Total Spend,${buyerData.totalSpend}`)
    lines.push(`Spend This Month,${buyerData.spendThisMonth}`)
    lines.push(`Average Order Value,${buyerData.averageOrderValue}`)
    lines.push(`Total Savings,${buyerData.totalSavings}`)
  } else {
    const platformData = data as PlatformAnalytics
    lines.push(`Total GMV,${platformData.totalGmv}`)
    lines.push(`GMV This Month,${platformData.gmvThisMonth}`)
    lines.push(`Total Fees,${platformData.totalFees}`)
    lines.push(`Take Rate,${platformData.takeRate}%`)
    lines.push(`Total Users,${platformData.totalUsers}`)
    lines.push(`Total Providers,${platformData.totalProviders}`)
    lines.push(`Total Buyers,${platformData.totalBuyers}`)
    lines.push(`Active Providers This Month,${platformData.activeProvidersThisMonth}`)
    lines.push(`Active Buyers This Month,${platformData.activeBuyersThisMonth}`)
    lines.push(`New Users This Month,${platformData.newUsersThisMonth}`)
    lines.push(`User Growth Rate,${platformData.userGrowthRate}%`)
    lines.push(`Total Orders,${platformData.totalOrders}`)
    lines.push(`Orders This Month,${platformData.ordersThisMonth}`)
    lines.push(`Completed Orders Rate,${platformData.completedOrdersRate}%`)
    lines.push(`Average Order Value,${platformData.averageOrderValue}`)
    lines.push(`Dispute Rate,${platformData.disputeRate}%`)
  }
  
  return lines.join('\n')
}

// ==========================================
// REFRESH ACTIONS
// ==========================================

/**
 * Refresh provider analytics cache
 */
export async function refreshProviderAnalytics(): Promise<{
  success: boolean
  error: string | null
}> {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  const result = await refreshProviderStats()
  
  if (result.success) {
    revalidatePath('/provider-portal')
  }
  
  return result
}

/**
 * Refresh buyer analytics cache
 */
export async function refreshBuyerAnalytics(): Promise<{
  success: boolean
  error: string | null
}> {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  const result = await refreshBuyerStats()
  
  if (result.success) {
    revalidatePath('/buyer')
  }
  
  return result
}

/**
 * Refresh all platform analytics (admin only)
 */
export async function refreshPlatformAnalytics(): Promise<{
  success: boolean
  error: string | null
}> {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  // Verify admin access
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  const isAdmin = profile?.role === 'Founder' || profile?.role === 'Executive'
  
  if (!isAdmin) {
    return { success: false, error: "Not authorized" }
  }
  
  const result = await refreshAllAnalytics()
  
  if (result.success) {
    revalidatePath('/admin/analytics')
  }
  
  return result
}

// ==========================================
// UTILITY EXPORTS
// ==========================================

export { calculateGrowth }

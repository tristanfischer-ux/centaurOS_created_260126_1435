"use server"

/**
 * Fraud Prevention Server Actions
 * Server-side actions for fraud detection and limit management
 */

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  detectFraudSignals,
  flagSuspiciousActivity,
  calculateRiskScore,
  checkVelocityLimits,
  updateVelocityUsage,
  FraudSignalType,
  FraudSeverity,
  FraudContext,
  RiskScore,
} from "@/lib/fraud/detection"
import {
  getTransactionLimits,
  checkLimitAvailability,
  consumeLimit,
  resetLimits,
  increaseLimits,
  getLimitsSummary,
  AccountTier,
  UserLimits,
} from "@/lib/fraud/velocity"

// Re-export types
export type { FraudSignalType, FraudSeverity, FraudContext, RiskScore, AccountTier, UserLimits }

// ==========================================
// PUBLIC ACTIONS
// ==========================================

/**
 * Report suspicious activity (any authenticated user can report)
 */
export async function reportSuspiciousActivity(
  userId: string,
  reason: string,
  details?: Record<string, unknown>
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Create fraud signal
  const { error } = await flagSuspiciousActivity(supabase, userId, "manual_report", {
    reported_by: user.id,
    reason,
    ...details,
  })

  if (error) {
    return { success: false, error }
  }

  return { success: true, error: null }
}

/**
 * Get user's current transaction limits
 */
export async function getMyTransactionLimits(): Promise<{
  data: {
    tier: AccountTier
    tierName: string
    nextTier: AccountTier | null
    daysUntilNextTier: number | null
    limits: UserLimits
  } | null
  error: string | null
}> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  return getLimitsSummary(supabase, user.id)
}

/**
 * Check if a transaction amount is allowed
 */
export async function checkTransactionAllowed(amount: number): Promise<{
  allowed: boolean
  reason: string | null
  limits: UserLimits | null
}> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { allowed: false, reason: "Not authenticated", limits: null }
  }

  const { allowed, reason, availableLimits } = await checkLimitAvailability(
    supabase,
    user.id,
    amount
  )

  return { allowed, reason, limits: availableLimits }
}

/**
 * Get current user's risk score
 */
export async function getMyRiskScore(): Promise<{
  data: RiskScore | null
  error: string | null
}> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  return calculateRiskScore(supabase, user.id)
}

// ==========================================
// ADMIN ACTIONS
// ==========================================

/**
 * Get fraud signals for a user (admin only)
 */
export async function getFraudSignals(
  userId: string,
  options?: {
    limit?: number
    offset?: number
    severity?: FraudSeverity[]
    types?: FraudSignalType[]
  }
): Promise<{
  data: Array<{
    id: string
    signal_type: string
    severity: string
    details: Record<string, unknown>
    action_taken: string | null
    reviewed_by: string | null
    created_at: string
  }>
  error: string | null
  total: number
}> {
  const supabase = await createClient()

  // Verify admin access
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Not authenticated", total: 0 }
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { data: [], error: "Admin access required", total: 0 }
  }

  // Build query
  const { limit = 20, offset = 0, severity, types } = options || {}

  let query = supabase
    .from("fraud_signals")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (severity && severity.length > 0) {
    query = query.in("severity", severity)
  }

  if (types && types.length > 0) {
    query = query.in("signal_type", types)
  }

  const { data, error, count } = await query

  if (error) {
    return { data: [], error: error.message, total: 0 }
  }

  return {
    data: (data || []).map((s) => ({
      id: s.id,
      signal_type: s.signal_type,
      severity: s.severity,
      details: (s.details as Record<string, unknown>) || {},
      action_taken: s.action_taken,
      reviewed_by: s.reviewed_by,
      created_at: s.created_at,
    })),
    error: null,
    total: count || 0,
  }
}

/**
 * Clear a fraud flag (admin only)
 */
export async function clearFraudFlag(
  signalId: string,
  reason: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Verify admin access
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { success: false, error: "Admin access required" }
  }

  // Update fraud signal
  const { error } = await supabase
    .from("fraud_signals")
    .update({
      action_taken: `Cleared: ${reason}`,
      reviewed_by: adminUser.id,
    })
    .eq("id", signalId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath("/admin")
  return { success: true, error: null }
}

/**
 * Update transaction limits for a user (admin only)
 */
export async function updateTransactionLimits(
  userId: string,
  limits: {
    single?: number
    daily?: number
    weekly?: number
    monthly?: number
  }
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Verify admin access
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { success: false, error: "Admin access required" }
  }

  // Update each provided limit
  const limitTypes: Array<{ type: string; value: number | undefined }> = [
    { type: "per_transaction", value: limits.single },
    { type: "daily", value: limits.daily },
    { type: "weekly", value: limits.weekly },
    { type: "monthly", value: limits.monthly },
  ]

  for (const { type, value } of limitTypes) {
    if (value === undefined) continue

    // Upsert limit
    const { error } = await supabase
      .from("transaction_limits")
      .upsert(
        {
          user_id: userId,
          limit_type: type,
          limit_amount: value,
        },
        {
          onConflict: "user_id,limit_type",
        }
      )

    if (error) {
      return { success: false, error: error.message }
    }
  }

  revalidatePath("/admin")
  return { success: true, error: null }
}

/**
 * Upgrade user to a specific tier (admin only)
 */
export async function upgradeUserTier(
  userId: string,
  tier: AccountTier
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Verify admin access
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { success: false, error: "Admin access required" }
  }

  const { success, error } = await increaseLimits(supabase, userId, tier)

  if (!success) {
    return { success: false, error }
  }

  revalidatePath("/admin")
  return { success: true, error: null }
}

/**
 * Get user risk score (admin only)
 */
export async function getUserRiskScore(userId: string): Promise<{
  data: RiskScore | null
  error: string | null
}> {
  const supabase = await createClient()

  // Verify admin access
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { data: null, error: "Admin access required" }
  }

  return calculateRiskScore(supabase, userId)
}

/**
 * Get all high-risk users (admin only)
 */
export async function getHighRiskUsers(
  options?: { limit?: number; minScore?: number }
): Promise<{
  data: Array<{
    userId: string
    fullName: string | null
    email: string
    signalCount: number
    latestSignalDate: string | null
  }>
  error: string | null
}> {
  const supabase = await createClient()

  // Verify admin access
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Not authenticated" }
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { data: [], error: "Admin access required" }
  }

  const { limit = 20 } = options || {}

  // Get users with most fraud signals
  const { data: signals, error } = await supabase
    .from("fraud_signals")
    .select("user_id, created_at")
    .is("action_taken", null) // Only unresolved signals
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  // Group by user
  const userSignals: Map<
    string,
    { count: number; latestDate: string | null }
  > = new Map()

  for (const signal of signals || []) {
    const existing = userSignals.get(signal.user_id)
    if (existing) {
      existing.count++
    } else {
      userSignals.set(signal.user_id, {
        count: 1,
        latestDate: signal.created_at,
      })
    }
  }

  // Sort by count and take top N
  const topUsers = Array.from(userSignals.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([userId, data]) => ({ userId, ...data }))

  // Get user details
  const userIds = topUsers.map((u) => u.userId)
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds)

  const profileMap = new Map(profiles?.map((p) => [p.id, p]))

  return {
    data: topUsers.map((u) => ({
      userId: u.userId,
      fullName: profileMap.get(u.userId)?.full_name || null,
      email: profileMap.get(u.userId)?.email || "Unknown",
      signalCount: u.count,
      latestSignalDate: u.latestDate,
    })),
    error: null,
  }
}

/**
 * Reset user limits (admin only)
 */
export async function resetUserLimits(
  userId: string,
  limitType?: "daily" | "weekly" | "monthly"
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Verify admin access
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { success: false, error: "Admin access required" }
  }

  const { success, error } = await resetLimits(supabase, userId, limitType)

  if (!success) {
    return { success: false, error }
  }

  revalidatePath("/admin")
  return { success: true, error: null }
}

// ==========================================
// INTERNAL ACTIONS (called by other services)
// ==========================================

/**
 * Check fraud signals before processing a transaction
 * Used internally by order/payment services
 */
export async function checkTransactionFraud(
  userId: string,
  action: string,
  context: FraudContext
): Promise<{
  allowed: boolean
  reason: string | null
  riskScore: number
}> {
  const supabase = await createClient()

  // Check for fraud signals
  const { signals, shouldBlock, riskScore } = await detectFraudSignals(
    supabase,
    userId,
    action,
    context
  )

  // Auto-flag detected signals
  for (const signal of signals) {
    await flagSuspiciousActivity(supabase, userId, signal.type, signal.details, signal.severity)
  }

  if (shouldBlock) {
    return {
      allowed: false,
      reason: "Transaction blocked due to suspicious activity. Please contact support.",
      riskScore,
    }
  }

  // Check velocity limits if amount provided
  if (context.amount && context.amount > 0) {
    const { allowed, reason } = await checkVelocityLimits(supabase, userId, context.amount)

    if (!allowed) {
      // Flag velocity violation
      await flagSuspiciousActivity(supabase, userId, "velocity_violation", {
        amount: context.amount,
        reason,
      })

      return {
        allowed: false,
        reason,
        riskScore,
      }
    }
  }

  return {
    allowed: true,
    reason: null,
    riskScore,
  }
}

/**
 * Record completed transaction for velocity tracking
 * Called after successful payment
 */
export async function recordTransactionForVelocity(
  userId: string,
  amount: number
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()
  return updateVelocityUsage(supabase, userId, amount)
}

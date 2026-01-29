/**
 * Velocity Limits Service
 * Manages transaction limits based on account age and trust level
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/types/database.types"

// Types
export type LimitType = "daily" | "weekly" | "monthly" | "per_transaction"

export type AccountTier = "new" | "starter" | "established" | "trusted"

export interface TransactionLimit {
  id: string
  user_id: string
  limit_type: LimitType
  limit_amount: number
  current_amount: number
  reset_at: string | null
  created_at: string
}

export interface UserLimits {
  tier: AccountTier
  accountAgeDays: number
  single: { limit: number; used: number; remaining: number }
  daily: { limit: number; used: number; remaining: number; resetsAt: Date | null }
  weekly: { limit: number; used: number; remaining: number; resetsAt: Date | null }
  monthly: { limit: number; used: number; remaining: number; resetsAt: Date | null }
}

// Tier-based limits in GBP
const TIER_LIMITS: Record<
  AccountTier,
  { single: number; daily: number; weekly: number; monthly: number }
> = {
  new: { single: 1000, daily: 2000, weekly: 3500, monthly: 5000 },
  starter: { single: 5000, daily: 10000, weekly: 17500, monthly: 25000 },
  established: { single: 10000, daily: 25000, weekly: 50000, monthly: 75000 },
  trusted: { single: 50000, daily: 100000, weekly: 250000, monthly: 0 }, // 0 = unlimited
}

// Account age thresholds in days
const TIER_THRESHOLDS = {
  new: 0,
  starter: 7,
  established: 30,
  trusted: 90,
}

/**
 * Get a user's current transaction limits
 */
export async function getTransactionLimits(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ data: UserLimits | null; error: string | null }> {
  try {
    // Get user profile for account age
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("created_at")
      .eq("id", userId)
      .single()

    if (profileError || !profile) {
      return { data: null, error: "User not found" }
    }

    const accountAgeDays = Math.floor(
      (Date.now() - new Date(profile.created_at!).getTime()) / (1000 * 60 * 60 * 24)
    )

    // Determine tier
    const tier = getTierFromAccountAge(accountAgeDays)
    const tierLimits = TIER_LIMITS[tier]

    // Get existing limits from database
    const { data: dbLimits, error: limitsError } = await supabase
      .from("transaction_limits")
      .select("*")
      .eq("user_id", userId)

    if (limitsError) {
      return { data: null, error: limitsError.message }
    }

    // Build response
    const now = new Date()
    const typedDbLimits = dbLimits as TransactionLimit[] | null
    const limits: UserLimits = {
      tier,
      accountAgeDays,
      single: {
        limit: tierLimits.single,
        used: 0,
        remaining: tierLimits.single,
      },
      daily: buildLimitInfo("daily", tierLimits.daily, typedDbLimits, now),
      weekly: buildLimitInfo("weekly", tierLimits.weekly, typedDbLimits, now),
      monthly: buildLimitInfo("monthly", tierLimits.monthly, typedDbLimits, now),
    }

    return { data: limits, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to get limits",
    }
  }
}

/**
 * Check if a transaction amount is allowed
 */
export async function checkLimitAvailability(
  supabase: SupabaseClient<Database>,
  userId: string,
  amount: number
): Promise<{
  allowed: boolean
  reason: string | null
  availableLimits: UserLimits | null
}> {
  const { data: limits, error } = await getTransactionLimits(supabase, userId)

  if (error || !limits) {
    return {
      allowed: false,
      reason: error || "Could not retrieve limits",
      availableLimits: null,
    }
  }

  // Check single transaction limit
  if (amount > limits.single.limit) {
    return {
      allowed: false,
      reason: `Amount £${amount.toLocaleString()} exceeds single transaction limit of £${limits.single.limit.toLocaleString()}`,
      availableLimits: limits,
    }
  }

  // Check daily limit
  if (amount > limits.daily.remaining) {
    return {
      allowed: false,
      reason: `Amount £${amount.toLocaleString()} exceeds daily remaining limit of £${limits.daily.remaining.toLocaleString()}`,
      availableLimits: limits,
    }
  }

  // Check weekly limit
  if (amount > limits.weekly.remaining) {
    return {
      allowed: false,
      reason: `Amount £${amount.toLocaleString()} exceeds weekly remaining limit of £${limits.weekly.remaining.toLocaleString()}`,
      availableLimits: limits,
    }
  }

  // Check monthly limit (if not unlimited)
  if (limits.monthly.limit > 0 && amount > limits.monthly.remaining) {
    return {
      allowed: false,
      reason: `Amount £${amount.toLocaleString()} exceeds monthly remaining limit of £${limits.monthly.remaining.toLocaleString()}`,
      availableLimits: limits,
    }
  }

  return {
    allowed: true,
    reason: null,
    availableLimits: limits,
  }
}

/**
 * Consume limit after a successful transaction
 */
export async function consumeLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  amount: number
): Promise<{ success: boolean; error: string | null }> {
  const limitTypes: Array<"daily" | "weekly" | "monthly"> = ["daily", "weekly", "monthly"]

  // Get user's tier for default limits
  const { data: profile } = await supabase
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .single()

  const accountAgeDays = profile
    ? Math.floor(
        (Date.now() - new Date(profile.created_at!).getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0

  const tier = getTierFromAccountAge(accountAgeDays)
  const tierLimits = TIER_LIMITS[tier]

  for (const limitType of limitTypes) {
    // Get existing limit record
    const { data: existing } = await supabase
      .from("transaction_limits")
      .select("*")
      .eq("user_id", userId)
      .eq("limit_type", limitType)
      .single()

    if (existing) {
      // Check if reset is needed
      if (existing.reset_at && new Date(existing.reset_at) <= new Date()) {
        // Reset and add new amount
        const newResetAt = calculateResetTime(limitType)
        const { error } = await supabase
          .from("transaction_limits")
          .update({
            current_amount: amount,
            reset_at: newResetAt.toISOString(),
          })
          .eq("id", existing.id)

        if (error) {
          return { success: false, error: error.message }
        }
      } else {
        // Just add to current amount
        const { error } = await supabase
          .from("transaction_limits")
          .update({
            current_amount: Number(existing.current_amount) + amount,
          })
          .eq("id", existing.id)

        if (error) {
          return { success: false, error: error.message }
        }
      }
    } else {
      // Create new limit record
      const resetAt = calculateResetTime(limitType)
      const defaultLimit =
        limitType === "daily"
          ? tierLimits.daily
          : limitType === "weekly"
            ? tierLimits.weekly
            : tierLimits.monthly

      const { error } = await supabase.from("transaction_limits").insert({
        user_id: userId,
        limit_type: limitType,
        limit_amount: defaultLimit,
        current_amount: amount,
        reset_at: resetAt.toISOString(),
      })

      if (error) {
        return { success: false, error: error.message }
      }
    }
  }

  return { success: true, error: null }
}

/**
 * Reset limits for a user (admin or scheduled)
 */
export async function resetLimits(
  supabase: SupabaseClient<Database>,
  userId: string,
  limitType?: LimitType
): Promise<{ success: boolean; error: string | null }> {
  let query = supabase
    .from("transaction_limits")
    .update({ current_amount: 0, reset_at: null })
    .eq("user_id", userId)

  if (limitType) {
    query = query.eq("limit_type", limitType)
  }

  const { error } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

/**
 * Increase limits for a user (manual upgrade)
 */
export async function increaseLimits(
  supabase: SupabaseClient<Database>,
  userId: string,
  tier: AccountTier
): Promise<{ success: boolean; error: string | null }> {
  const tierLimits = TIER_LIMITS[tier]
  const limitTypes: Array<{ type: LimitType; limit: number }> = [
    { type: "per_transaction", limit: tierLimits.single },
    { type: "daily", limit: tierLimits.daily },
    { type: "weekly", limit: tierLimits.weekly },
    { type: "monthly", limit: tierLimits.monthly },
  ]

  for (const { type, limit } of limitTypes) {
    const { data: existing } = await supabase
      .from("transaction_limits")
      .select("*")
      .eq("user_id", userId)
      .eq("limit_type", type)
      .single()

    if (existing) {
      const { error } = await supabase
        .from("transaction_limits")
        .update({ limit_amount: limit })
        .eq("id", existing.id)

      if (error) {
        return { success: false, error: error.message }
      }
    } else {
      const resetAt = type !== "per_transaction" ? calculateResetTime(type as "daily" | "weekly" | "monthly") : null

      const { error } = await supabase.from("transaction_limits").insert({
        user_id: userId,
        limit_type: type,
        limit_amount: limit,
        current_amount: 0,
        reset_at: resetAt?.toISOString() ?? null,
      })

      if (error) {
        return { success: false, error: error.message }
      }
    }
  }

  return { success: true, error: null }
}

/**
 * Get limits summary for display
 */
export async function getLimitsSummary(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{
  data: {
    tier: AccountTier
    tierName: string
    nextTier: AccountTier | null
    daysUntilNextTier: number | null
    limits: UserLimits
  } | null
  error: string | null
}> {
  const { data: limits, error } = await getTransactionLimits(supabase, userId)

  if (error || !limits) {
    return { data: null, error: error || "Failed to get limits" }
  }

  // Determine next tier
  let nextTier: AccountTier | null = null
  let daysUntilNextTier: number | null = null

  if (limits.tier === "new") {
    nextTier = "starter"
    daysUntilNextTier = TIER_THRESHOLDS.starter - limits.accountAgeDays
  } else if (limits.tier === "starter") {
    nextTier = "established"
    daysUntilNextTier = TIER_THRESHOLDS.established - limits.accountAgeDays
  } else if (limits.tier === "established") {
    nextTier = "trusted"
    daysUntilNextTier = TIER_THRESHOLDS.trusted - limits.accountAgeDays
  }

  return {
    data: {
      tier: limits.tier,
      tierName: formatTierName(limits.tier),
      nextTier,
      daysUntilNextTier,
      limits,
    },
    error: null,
  }
}

// Helper functions

function getTierFromAccountAge(days: number): AccountTier {
  if (days >= TIER_THRESHOLDS.trusted) return "trusted"
  if (days >= TIER_THRESHOLDS.established) return "established"
  if (days >= TIER_THRESHOLDS.starter) return "starter"
  return "new"
}

function buildLimitInfo(
  type: "daily" | "weekly" | "monthly",
  defaultLimit: number,
  dbLimits: TransactionLimit[] | null,
  now: Date
): { limit: number; used: number; remaining: number; resetsAt: Date | null } {
  const dbLimit = dbLimits?.find((l) => l.limit_type === type)

  if (!dbLimit) {
    return {
      limit: defaultLimit,
      used: 0,
      remaining: defaultLimit > 0 ? defaultLimit : Infinity,
      resetsAt: null,
    }
  }

  // Check if limit should be reset
  const resetAt = dbLimit.reset_at ? new Date(dbLimit.reset_at) : null
  const shouldReset = resetAt && resetAt <= now

  const limit = Number(dbLimit.limit_amount) || defaultLimit
  const used = shouldReset ? 0 : Number(dbLimit.current_amount) || 0
  const remaining = limit > 0 ? Math.max(0, limit - used) : Infinity

  return {
    limit,
    used,
    remaining,
    resetsAt: shouldReset ? calculateResetTime(type) : resetAt,
  }
}

function calculateResetTime(type: "daily" | "weekly" | "monthly"): Date {
  const now = new Date()

  switch (type) {
    case "daily": {
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      return tomorrow
    }
    case "weekly": {
      const nextMonday = new Date(now)
      const daysUntilMonday = (8 - nextMonday.getDay()) % 7 || 7
      nextMonday.setDate(nextMonday.getDate() + daysUntilMonday)
      nextMonday.setHours(0, 0, 0, 0)
      return nextMonday
    }
    case "monthly": {
      const firstOfNextMonth = new Date(now)
      firstOfNextMonth.setMonth(firstOfNextMonth.getMonth() + 1)
      firstOfNextMonth.setDate(1)
      firstOfNextMonth.setHours(0, 0, 0, 0)
      return firstOfNextMonth
    }
  }
}

function formatTierName(tier: AccountTier): string {
  switch (tier) {
    case "new":
      return "New Account"
    case "starter":
      return "Starter"
    case "established":
      return "Established"
    case "trusted":
      return "Trusted"
  }
}

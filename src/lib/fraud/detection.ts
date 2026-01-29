/**
 * Fraud Detection Service
 * Detects and flags suspicious activity patterns
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/types/database.types"

// Types
export type FraudSignalType =
  | "velocity_violation"
  | "payment_failure"
  | "dispute_frequency"
  | "account_age_mismatch"
  | "ip_pattern"
  | "device_pattern"
  | "suspicious_activity"
  | "manual_report"

export type FraudSeverity = "low" | "medium" | "high" | "critical"

export interface FraudSignal {
  id: string
  user_id: string
  signal_type: FraudSignalType
  severity: FraudSeverity
  details: Record<string, unknown>
  action_taken: string | null
  reviewed_by: string | null
  created_at: string
}

export interface FraudContext {
  ip_address?: string
  device_fingerprint?: string
  user_agent?: string
  amount?: number
  order_id?: string
  metadata?: Record<string, unknown>
}

export interface RiskScore {
  score: number // 0-100
  level: "low" | "medium" | "high" | "critical"
  factors: Array<{
    type: string
    weight: number
    description: string
  }>
}

// Risk weights for different signals
const SIGNAL_WEIGHTS: Record<FraudSignalType, number> = {
  velocity_violation: 25,
  payment_failure: 20,
  dispute_frequency: 30,
  account_age_mismatch: 15,
  ip_pattern: 20,
  device_pattern: 20,
  suspicious_activity: 15,
  manual_report: 35,
}

const SEVERITY_MULTIPLIERS: Record<FraudSeverity, number> = {
  low: 0.5,
  medium: 1,
  high: 1.5,
  critical: 2,
}

/**
 * Detect potential fraud signals for a user action
 */
export async function detectFraudSignals(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: string,
  context: FraudContext
): Promise<{
  signals: Array<{ type: FraudSignalType; severity: FraudSeverity; details: Record<string, unknown> }>
  shouldBlock: boolean
  riskScore: number
}> {
  const signals: Array<{ type: FraudSignalType; severity: FraudSeverity; details: Record<string, unknown> }> = []

  // Get user profile for account age check
  const { data: profile } = await supabase
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .single()

  const accountAgeDays = profile
    ? Math.floor((Date.now() - new Date(profile.created_at!).getTime()) / (1000 * 60 * 60 * 24))
    : 0

  // Check 1: Account age vs transaction size
  if (context.amount && context.amount > 0) {
    const accountAgeMismatch = checkAccountAgeMismatch(accountAgeDays, context.amount)
    if (accountAgeMismatch) {
      signals.push(accountAgeMismatch)
    }
  }

  // Check 2: Payment failure rate
  const paymentSignal = await checkPaymentFailureRate(supabase, userId)
  if (paymentSignal) {
    signals.push(paymentSignal)
  }

  // Check 3: Dispute frequency
  const disputeSignal = await checkDisputeFrequency(supabase, userId)
  if (disputeSignal) {
    signals.push(disputeSignal)
  }

  // Check 4: Velocity violations
  const velocitySignal = await checkVelocityViolations(supabase, userId)
  if (velocitySignal) {
    signals.push(velocitySignal)
  }

  // Check 5: IP pattern (if provided)
  if (context.ip_address) {
    const ipSignal = await checkIpPattern(supabase, userId, context.ip_address)
    if (ipSignal) {
      signals.push(ipSignal)
    }
  }

  // Check 6: Device pattern (if provided)
  if (context.device_fingerprint) {
    const deviceSignal = await checkDevicePattern(supabase, userId, context.device_fingerprint)
    if (deviceSignal) {
      signals.push(deviceSignal)
    }
  }

  // Calculate overall risk score
  const riskScore = calculateRiskFromSignals(signals)

  // Determine if action should be blocked
  const shouldBlock = riskScore >= 80 || signals.some((s) => s.severity === "critical")

  return { signals, shouldBlock, riskScore }
}

/**
 * Flag suspicious activity and create a fraud signal record
 */
export async function flagSuspiciousActivity(
  supabase: SupabaseClient<Database>,
  userId: string,
  signalType: FraudSignalType,
  details: Record<string, unknown>,
  severity?: FraudSeverity
): Promise<{ data: FraudSignal | null; error: string | null }> {
  // Auto-determine severity if not provided
  const calculatedSeverity = severity || determineSeverity(signalType, details)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("fraud_signals")
    .insert({
      user_id: userId,
      signal_type: signalType,
      severity: calculatedSeverity,
      details: details,
    })
    .select()
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as FraudSignal, error: null }
}

/**
 * Calculate overall risk score for a user
 */
export async function calculateRiskScore(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ data: RiskScore | null; error: string | null }> {
  // Get all fraud signals for user from last 90 days
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: signals, error } = await supabase
    .from("fraud_signals")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", ninetyDaysAgo.toISOString())
    .order("created_at", { ascending: false })

  if (error) {
    return { data: null, error: error.message }
  }

  if (!signals || signals.length === 0) {
    return {
      data: {
        score: 0,
        level: "low",
        factors: [],
      },
      error: null,
    }
  }

  // Calculate weighted score
  const factors: RiskScore["factors"] = []
  let totalScore = 0

  // Group signals by type
  const signalsByType = signals.reduce(
    (acc, signal) => {
      const type = signal.signal_type as FraudSignalType
      if (!acc[type]) {
        acc[type] = []
      }
      acc[type].push(signal)
      return acc
    },
    {} as Record<FraudSignalType, typeof signals>
  )

  for (const [type, typeSignals] of Object.entries(signalsByType)) {
    const signalType = type as FraudSignalType
    const baseWeight = SIGNAL_WEIGHTS[signalType] || 10

    // Calculate contribution from this signal type
    // More recent signals have higher weight, and multiple signals compound
    let typeScore = 0
    for (const signal of typeSignals) {
      const severity = signal.severity as FraudSeverity
      const multiplier = SEVERITY_MULTIPLIERS[severity]
      const recencyFactor = getRecencyFactor(signal.created_at)
      typeScore += baseWeight * multiplier * recencyFactor
    }

    // Cap at 40 per signal type to prevent one type dominating
    typeScore = Math.min(typeScore, 40)
    totalScore += typeScore

    if (typeScore > 0) {
      factors.push({
        type: signalType,
        weight: Math.round(typeScore),
        description: `${typeSignals.length} ${formatSignalType(signalType)} signal(s)`,
      })
    }
  }

  // Cap total score at 100
  const finalScore = Math.min(Math.round(totalScore), 100)

  // Determine level
  let level: RiskScore["level"] = "low"
  if (finalScore >= 80) {
    level = "critical"
  } else if (finalScore >= 60) {
    level = "high"
  } else if (finalScore >= 30) {
    level = "medium"
  }

  return {
    data: {
      score: finalScore,
      level,
      factors: factors.sort((a, b) => b.weight - a.weight),
    },
    error: null,
  }
}

/**
 * Check velocity limits before a transaction
 */
export async function checkVelocityLimits(
  supabase: SupabaseClient<Database>,
  userId: string,
  amount: number
): Promise<{
  allowed: boolean
  reason: string | null
  limits: {
    daily: { limit: number; used: number; remaining: number }
    weekly: { limit: number; used: number; remaining: number }
    monthly: { limit: number; used: number; remaining: number }
    perTransaction: { limit: number }
  } | null
}> {
  // Get user's limits
  const { data: limits, error } = await supabase
    .from("transaction_limits")
    .select("*")
    .eq("user_id", userId)

  if (error) {
    return { allowed: false, reason: "Failed to check limits", limits: null }
  }

  // If no limits exist, use defaults based on account age
  const { data: profile } = await supabase
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .single()

  const accountAgeDays = profile
    ? Math.floor((Date.now() - new Date(profile.created_at!).getTime()) / (1000 * 60 * 60 * 24))
    : 0

  const defaultLimits = getDefaultLimits(accountAgeDays)

  // Build limits map
  const limitsMap = {
    daily: limits?.find((l) => l.limit_type === "daily") || {
      limit_amount: defaultLimits.daily,
      current_amount: 0,
    },
    weekly: limits?.find((l) => l.limit_type === "weekly") || {
      limit_amount: defaultLimits.weekly,
      current_amount: 0,
    },
    monthly: limits?.find((l) => l.limit_type === "monthly") || {
      limit_amount: defaultLimits.monthly,
      current_amount: 0,
    },
    perTransaction: limits?.find((l) => l.limit_type === "per_transaction") || {
      limit_amount: defaultLimits.single,
      current_amount: 0,
    },
  }

  // Check per-transaction limit
  if (amount > Number(limitsMap.perTransaction.limit_amount)) {
    return {
      allowed: false,
      reason: `Transaction amount £${amount.toFixed(2)} exceeds single transaction limit of £${Number(limitsMap.perTransaction.limit_amount).toFixed(2)}`,
      limits: null,
    }
  }

  // Check daily limit
  const dailyRemaining = Number(limitsMap.daily.limit_amount) - Number(limitsMap.daily.current_amount)
  if (amount > dailyRemaining) {
    return {
      allowed: false,
      reason: `Transaction would exceed daily limit. Remaining: £${dailyRemaining.toFixed(2)}`,
      limits: null,
    }
  }

  // Check monthly limit (if not unlimited)
  if (Number(limitsMap.monthly.limit_amount) > 0) {
    const monthlyRemaining =
      Number(limitsMap.monthly.limit_amount) - Number(limitsMap.monthly.current_amount)
    if (amount > monthlyRemaining) {
      return {
        allowed: false,
        reason: `Transaction would exceed monthly limit. Remaining: £${monthlyRemaining.toFixed(2)}`,
        limits: null,
      }
    }
  }

  return {
    allowed: true,
    reason: null,
    limits: {
      daily: {
        limit: Number(limitsMap.daily.limit_amount),
        used: Number(limitsMap.daily.current_amount),
        remaining: dailyRemaining,
      },
      weekly: {
        limit: Number(limitsMap.weekly.limit_amount),
        used: Number(limitsMap.weekly.current_amount),
        remaining: Number(limitsMap.weekly.limit_amount) - Number(limitsMap.weekly.current_amount),
      },
      monthly: {
        limit: Number(limitsMap.monthly.limit_amount),
        used: Number(limitsMap.monthly.current_amount),
        remaining:
          Number(limitsMap.monthly.limit_amount) > 0
            ? Number(limitsMap.monthly.limit_amount) - Number(limitsMap.monthly.current_amount)
            : Infinity,
      },
      perTransaction: {
        limit: Number(limitsMap.perTransaction.limit_amount),
      },
    },
  }
}

/**
 * Update velocity usage after a successful transaction
 */
export async function updateVelocityUsage(
  supabase: SupabaseClient<Database>,
  userId: string,
  amount: number
): Promise<{ success: boolean; error: string | null }> {
  const limitTypes = ["daily", "weekly", "monthly"] as const

  for (const limitType of limitTypes) {
    // Try to update existing record
    const { data: existing, error: selectError } = await supabase
      .from("transaction_limits")
      .select("*")
      .eq("user_id", userId)
      .eq("limit_type", limitType)
      .single()

    if (selectError && selectError.code !== "PGRST116") {
      // Error other than "not found"
      return { success: false, error: selectError.message }
    }

    if (existing) {
      // Update existing
      const { error: updateError } = await supabase
        .from("transaction_limits")
        .update({
          current_amount: Number(existing.current_amount) + amount,
        })
        .eq("id", existing.id)

      if (updateError) {
        return { success: false, error: updateError.message }
      }
    } else {
      // Create new with defaults
      const { data: profile } = await supabase
        .from("profiles")
        .select("created_at")
        .eq("id", userId)
        .single()

      const accountAgeDays = profile
        ? Math.floor((Date.now() - new Date(profile.created_at!).getTime()) / (1000 * 60 * 60 * 24))
        : 0

      const defaults = getDefaultLimits(accountAgeDays)
      const resetAt = getResetTime(limitType)

      const { error: insertError } = await supabase.from("transaction_limits").insert({
        user_id: userId,
        limit_type: limitType,
        limit_amount: defaults[limitType === "daily" ? "daily" : limitType === "weekly" ? "weekly" : "monthly"],
        current_amount: amount,
        reset_at: resetAt.toISOString(),
      })

      if (insertError) {
        return { success: false, error: insertError.message }
      }
    }
  }

  return { success: true, error: null }
}

// Helper functions

function checkAccountAgeMismatch(
  accountAgeDays: number,
  amount: number
): { type: FraudSignalType; severity: FraudSeverity; details: Record<string, unknown> } | null {
  const limits = getDefaultLimits(accountAgeDays)

  // Check if amount is significantly above normal for account age
  if (amount > limits.single * 0.8) {
    return {
      type: "account_age_mismatch",
      severity: amount > limits.single ? "high" : "medium",
      details: {
        account_age_days: accountAgeDays,
        attempted_amount: amount,
        tier_single_limit: limits.single,
        message: `Account is ${accountAgeDays} days old, attempting £${amount.toFixed(2)} transaction (limit: £${limits.single.toFixed(2)})`,
      },
    }
  }

  return null
}

async function checkPaymentFailureRate(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ type: FraudSignalType; severity: FraudSeverity; details: Record<string, unknown> } | null> {
  // Check for failed payments in last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { count: totalOrders } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("buyer_id", userId)
    .gte("created_at", thirtyDaysAgo.toISOString())

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: failedOrders } = await (supabase as any)
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("buyer_id", userId)
    .eq("escrow_status", "failed")
    .gte("created_at", thirtyDaysAgo.toISOString())

  const failureRate = totalOrders && totalOrders > 0 ? (failedOrders || 0) / totalOrders : 0

  if (failureRate > 0.3 && (totalOrders || 0) >= 3) {
    return {
      type: "payment_failure",
      severity: failureRate > 0.5 ? "high" : "medium",
      details: {
        total_orders: totalOrders,
        failed_orders: failedOrders,
        failure_rate: Math.round(failureRate * 100),
        period_days: 30,
        message: `${Math.round(failureRate * 100)}% payment failure rate (${failedOrders}/${totalOrders} orders)`,
      },
    }
  }

  return null
}

async function checkDisputeFrequency(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ type: FraudSignalType; severity: FraudSeverity; details: Record<string, unknown> } | null> {
  // Check for disputes raised in last 90 days
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { count: disputeCount } = await supabase
    .from("disputes")
    .select("*", { count: "exact", head: true })
    .eq("raised_by", userId)
    .gte("created_at", ninetyDaysAgo.toISOString())

  // Also check orders for context
  const { count: orderCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("buyer_id", userId)
    .gte("created_at", ninetyDaysAgo.toISOString())

  const disputeRate = orderCount && orderCount > 0 ? (disputeCount || 0) / orderCount : 0

  if ((disputeCount || 0) >= 3 || (disputeRate > 0.2 && (orderCount || 0) >= 5)) {
    return {
      type: "dispute_frequency",
      severity: (disputeCount || 0) >= 5 || disputeRate > 0.4 ? "high" : "medium",
      details: {
        dispute_count: disputeCount,
        order_count: orderCount,
        dispute_rate: Math.round(disputeRate * 100),
        period_days: 90,
        message: `${disputeCount} disputes in 90 days (${Math.round(disputeRate * 100)}% of orders)`,
      },
    }
  }

  return null
}

async function checkVelocityViolations(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ type: FraudSignalType; severity: FraudSeverity; details: Record<string, unknown> } | null> {
  // Check for recent velocity violations
  const oneDayAgo = new Date()
  oneDayAgo.setDate(oneDayAgo.getDate() - 1)

  const { count: recentViolations } = await supabase
    .from("fraud_signals")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("signal_type", "velocity_violation")
    .gte("created_at", oneDayAgo.toISOString())

  if ((recentViolations || 0) >= 2) {
    return {
      type: "velocity_violation",
      severity: (recentViolations || 0) >= 5 ? "critical" : "high",
      details: {
        recent_violations: recentViolations,
        period_hours: 24,
        message: `${recentViolations} velocity limit violations in last 24 hours`,
      },
    }
  }

  return null
}

async function checkIpPattern(
  supabase: SupabaseClient<Database>,
  userId: string,
  ipAddress: string
): Promise<{ type: FraudSignalType; severity: FraudSeverity; details: Record<string, unknown> } | null> {
  // Check if this IP is associated with multiple users
  // This would require an IP tracking table - stub for now
  // In production, you'd track IPs in a separate table or use a fraud detection service

  // For now, check if there are existing IP pattern fraud signals
  const { count: existingSignals } = await supabase
    .from("fraud_signals")
    .select("*", { count: "exact", head: true })
    .eq("signal_type", "ip_pattern")
    .contains("details", { ip_address: ipAddress })

  if ((existingSignals || 0) > 0) {
    return {
      type: "ip_pattern",
      severity: (existingSignals || 0) >= 3 ? "high" : "medium",
      details: {
        ip_address: ipAddress,
        existing_signals: existingSignals,
        message: `IP address has ${existingSignals} existing fraud signals`,
      },
    }
  }

  return null
}

async function checkDevicePattern(
  supabase: SupabaseClient<Database>,
  userId: string,
  deviceFingerprint: string
): Promise<{ type: FraudSignalType; severity: FraudSeverity; details: Record<string, unknown> } | null> {
  // Similar to IP pattern - check for device associated with multiple accounts
  // Stub implementation

  const { count: existingSignals } = await supabase
    .from("fraud_signals")
    .select("*", { count: "exact", head: true })
    .eq("signal_type", "device_pattern")
    .contains("details", { device_fingerprint: deviceFingerprint })

  if ((existingSignals || 0) > 0) {
    return {
      type: "device_pattern",
      severity: (existingSignals || 0) >= 3 ? "high" : "medium",
      details: {
        device_fingerprint: deviceFingerprint,
        existing_signals: existingSignals,
        message: `Device has ${existingSignals} existing fraud signals`,
      },
    }
  }

  return null
}

function calculateRiskFromSignals(
  signals: Array<{ type: FraudSignalType; severity: FraudSeverity }>
): number {
  if (signals.length === 0) return 0

  let score = 0
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.type] || 10
    const multiplier = SEVERITY_MULTIPLIERS[signal.severity]
    score += weight * multiplier
  }

  return Math.min(Math.round(score), 100)
}

function determineSeverity(
  type: FraudSignalType,
  details: Record<string, unknown>
): FraudSeverity {
  // Auto-determine severity based on signal type and details
  switch (type) {
    case "velocity_violation":
      return (details.violations_count as number) >= 5 ? "critical" : "high"
    case "payment_failure":
      return (details.failure_rate as number) > 50 ? "high" : "medium"
    case "dispute_frequency":
      return (details.dispute_count as number) >= 5 ? "high" : "medium"
    case "manual_report":
      return "high"
    default:
      return "medium"
  }
}

function getRecencyFactor(createdAt: string): number {
  const daysSince = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  )

  if (daysSince <= 7) return 1
  if (daysSince <= 30) return 0.7
  if (daysSince <= 60) return 0.4
  return 0.2
}

function formatSignalType(type: FraudSignalType): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function getDefaultLimits(accountAgeDays: number): {
  single: number
  daily: number
  weekly: number
  monthly: number
} {
  if (accountAgeDays < 7) {
    return { single: 1000, daily: 2000, weekly: 3500, monthly: 5000 }
  } else if (accountAgeDays < 30) {
    return { single: 5000, daily: 10000, weekly: 17500, monthly: 25000 }
  } else if (accountAgeDays < 90) {
    return { single: 10000, daily: 25000, weekly: 50000, monthly: 75000 }
  } else {
    return { single: 50000, daily: 100000, weekly: 250000, monthly: 0 } // 0 = no monthly limit
  }
}

function getResetTime(limitType: "daily" | "weekly" | "monthly"): Date {
  const now = new Date()
  switch (limitType) {
    case "daily":
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      return tomorrow
    case "weekly":
      const nextWeek = new Date(now)
      nextWeek.setDate(nextWeek.getDate() + (7 - nextWeek.getDay()))
      nextWeek.setHours(0, 0, 0, 0)
      return nextWeek
    case "monthly":
      const nextMonth = new Date(now)
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      nextMonth.setDate(1)
      nextMonth.setHours(0, 0, 0, 0)
      return nextMonth
  }
}

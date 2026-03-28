/**
 * @file trial.ts — Free tier trial gating utilities
 *
 * @description Every new account starts with a 14-day full-access trial.
 * After the trial expires, free-tier users lose access to:
 * - Supplier matching (Centaur Matcher)
 * - RFQ pack generation
 * - Marketplace ordering (beyond browsing)
 * - Ghost Agent automation
 * - AI comparison assistant
 *
 * They retain: basic AI assists (50/mo), task management, browsing,
 * investor directory (browse-only), and standard support.
 *
 * INTENT: Create activation pressure. The trial gives enough time to
 * experience full value, but the feature gate creates a clear reason to
 * upgrade when it expires.
 *
 * @related
 * - supabase/migrations/20260328200000_free_trial_gating.sql
 * - src/lib/billing/plans.ts — Plan feature definitions
 */

import { createClient } from '@/lib/supabase/server'
import type { SubscriptionTier } from '@/lib/billing/plans'

export interface TrialStatus {
  /** Whether the user is currently in their free trial period */
  isInTrial: boolean
  /** Whether the trial has expired (only relevant for free tier) */
  trialExpired: boolean
  /** Days remaining in the trial (0 if expired or not applicable) */
  daysRemaining: number
  /** The trial end date, or null if not set */
  trialEndsAt: Date | null
  /** Whether the user has full feature access (paid OR in-trial) */
  hasFullAccess: boolean
}

/**
 * Check the trial status for the current authenticated user.
 *
 * @returns Trial status with feature access determination
 */
export async function getTrialStatus(): Promise<TrialStatus> {
  const defaultExpired: TrialStatus = {
    isInTrial: false,
    trialExpired: true,
    daysRemaining: 0,
    trialEndsAt: null,
    hasFullAccess: false,
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return defaultExpired

    // Get profile with trial info
    const { data: profile } = await supabase
      .from('profiles')
      .select('trial_ends_at')
      .eq('id', user.id)
      .single()

    // Check if user has an active paid subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('tier, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    const tier = (subscription?.tier as SubscriptionTier) || 'free'
    const isPaid = tier !== 'free' && subscription?.status === 'active'

    // Paid users always have full access
    if (isPaid) {
      return {
        isInTrial: false,
        trialExpired: false,
        daysRemaining: 0,
        trialEndsAt: null,
        hasFullAccess: true,
      }
    }

    // Free tier — check trial
    const trialEndsAt = profile?.trial_ends_at
      ? new Date(profile.trial_ends_at)
      : null

    if (!trialEndsAt) {
      // No trial date set — shouldn't happen with the trigger, but handle gracefully
      return defaultExpired
    }

    const now = new Date()
    const isInTrial = now < trialEndsAt
    const daysRemaining = isInTrial
      ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0

    return {
      isInTrial,
      trialExpired: !isInTrial,
      daysRemaining,
      trialEndsAt,
      hasFullAccess: isInTrial,
    }
  } catch (error) {
    console.error('[Trial] Error checking trial status:', error)
    // DECISION: Fail-open during trial check errors to avoid blocking users.
    // Better to give temporary free access than to block a paying customer
    // due to a transient DB error.
    return {
      isInTrial: true,
      trialExpired: false,
      daysRemaining: 14,
      trialEndsAt: null,
      hasFullAccess: true,
    }
  }
}

/**
 * Features that are gated behind the trial / paid subscription.
 * Use this to check if a specific feature should be accessible.
 */
export const TRIAL_GATED_FEATURES = [
  'supplier_matching',
  'rfq_generation',
  'marketplace_ordering',
  'ghost_agent',
  'ai_comparison',
  'centaur_matcher',
  'investor_detail_pages',
  'investor_contacts',
] as const

export type TrialGatedFeature = typeof TRIAL_GATED_FEATURES[number]

/**
 * Check if a specific feature is accessible to the current user.
 *
 * @param feature - The feature to check
 * @param trialStatus - Pre-fetched trial status (avoids duplicate DB queries)
 * @returns Whether the feature is accessible
 */
export function isFeatureAccessible(
  feature: TrialGatedFeature,
  trialStatus: TrialStatus
): boolean {
  // If user has full access (paid or in-trial), all features are available
  if (trialStatus.hasFullAccess) return true

  // After trial, these features are gated
  return !TRIAL_GATED_FEATURES.includes(feature)
}

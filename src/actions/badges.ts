"use server"

/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: Using 'any' type assertions because provider_badges table is not in generated database types

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { evaluateAllBadges as evaluateBadges } from "@/lib/badges/badge-rules"

export { getProviderBadges as getBadges, type BadgeType, type ProviderBadge } from './trust-signals'

/**
 * Check and award any eligible badges for a provider
 * This should be called after actions that might affect badge eligibility
 * (e.g., completing an order, receiving a review, etc.)
 */
export async function checkAndAwardBadges(providerId: string): Promise<{
    awarded: string[]
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Evaluate all badges
        const eligibilityResults = await evaluateBadges(providerId)
        
        const awarded: string[] = []
        
        for (const result of eligibilityResults) {
            if (result.eligible && !result.alreadyHas) {
                // Award the badge - using type assertion since table not in generated types
                const { error } = await (supabase as any)
                    .from('provider_badges')
                    .insert({
                        provider_id: providerId,
                        badge_type: result.badgeType,
                        earned_at: new Date().toISOString(),
                    })

                if (!error) {
                    awarded.push(result.badgeType)
                }
            }
        }

        if (awarded.length > 0) {
            revalidatePath('/provider-portal')
            revalidatePath('/marketplace')
        }

        return { awarded, error: null }
    } catch (err) {
        console.error('Failed to check and award badges:', err)
        return { awarded: [], error: 'Failed to check and award badges' }
    }
}

/**
 * Award a specific badge to a provider (admin action)
 */
export async function awardBadge(
    providerId: string, 
    badgeType: string
): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Check if badge already exists - using type assertion since table not in generated types
        const { data: existing } = await (supabase as any)
            .from('provider_badges')
            .select('id')
            .eq('provider_id', providerId)
            .eq('badge_type', badgeType)
            .single()

        if (existing) {
            return { success: false, error: 'Provider already has this badge' }
        }

        const { error } = await (supabase as any)
            .from('provider_badges')
            .insert({
                provider_id: providerId,
                badge_type: badgeType,
                earned_at: new Date().toISOString(),
            })

        if (error) {
            console.error('Error awarding badge:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/provider-portal')
        revalidatePath('/marketplace')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to award badge:', err)
        return { success: false, error: 'Failed to award badge' }
    }
}

/**
 * Revoke a badge from a provider (admin action)
 */
export async function revokeBadge(
    providerId: string, 
    badgeType: string
): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()

        // Using type assertion since table not in generated types
        const { error } = await (supabase as any)
            .from('provider_badges')
            .delete()
            .eq('provider_id', providerId)
            .eq('badge_type', badgeType)

        if (error) {
            console.error('Error revoking badge:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/provider-portal')
        revalidatePath('/marketplace')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to revoke badge:', err)
        return { success: false, error: 'Failed to revoke badge' }
    }
}

/**
 * Get badge eligibility status for a provider
 * Returns which badges the provider has and which they're close to earning
 */
export async function getBadgeEligibilityStatus(providerId: string): Promise<{
    data: Array<{
        badgeType: string
        eligible: boolean
        alreadyHas: boolean
        progress?: number
        progressDescription?: string
    }>
    error: string | null
}> {
    try {
        const results = await evaluateBadges(providerId)
        return { data: results, error: null }
    } catch (err) {
        console.error('Failed to get badge eligibility:', err)
        return { data: [], error: 'Failed to get badge eligibility' }
    }
}

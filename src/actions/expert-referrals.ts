"use server"

import { createClient } from "@/lib/supabase/server"
import { withUser } from '@/lib/server-action-utils'
import { revalidatePath } from "next/cache"
import { randomInt } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Helper to query tables not yet in the generated Supabase types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function untypedFrom(supabase: SupabaseClient, table: string): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (supabase as any).from(table)
}

/**
 * @file expert-referrals.ts
 *
 * @description Server actions for the expert referral system. Users can invite
 * experts to join the ForgeOS network, track referral status, and build the
 * supply side virally.
 *
 * @security All actions require authenticated user.
 *   Users can only manage their own referrals. RLS enforced.
 */

export interface ExpertReferral {
    id: string
    referrer_id: string
    referred_email: string | null
    referral_code: string
    status: 'pending' | 'signed_up' | 'profile_created' | 'expired'
    referred_user_id: string | null
    note: string | null
    created_at: string
    completed_at: string | null
    expires_at: string
}

export interface ReferralStats {
    total: number
    pending: number
    signedUp: number
    profileCreated: number
}

/**
 * Generate a unique referral code for the current user.
 */
function generateCode(): string {
    // SECURITY: Use crypto.randomInt for unpredictable referral codes
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
        code += chars[randomInt(chars.length)]
    }
    return code
}

/**
 * Create a new expert referral invitation.
 *
 * @param email - Optional email of the expert to invite
 * @param note - Optional note to include with the invitation
 * @returns The referral with its unique code and shareable link
 *
 * @security Requires authenticated user. Max 20 pending referrals per user.
 */
export async function createExpertReferral(email?: string, note?: string) {
    return withUser(async ({ supabase, user }) => {
        // VALIDATION: Rate limit pending referrals
        const { count } = await untypedFrom(supabase, 'expert_referrals')
            .select('id', { count: 'exact', head: true })
            .eq('referrer_id', user.id)
            .eq('status', 'pending')

        if (count && count >= 20) {
            return { success: false, error: 'Maximum 20 pending referrals allowed', data: null }
        }

        // VALIDATION: Email format
        if (email && !email.includes('@')) {
            return { success: false, error: 'Invalid email address', data: null }
        }

        // Check for duplicate email referral
        if (email) {
            const { data: existing } = await untypedFrom(supabase, 'expert_referrals')
                .select('id')
                .eq('referrer_id', user.id)
                .eq('referred_email', email.toLowerCase())
                .eq('status', 'pending')
                .single()

            if (existing) {
                return { success: false, error: 'You already have a pending referral for this email', data: null }
            }
        }

        const referralCode = generateCode()

        const { data, error } = await untypedFrom(supabase, 'expert_referrals')
            .insert({
                referrer_id: user.id,
                referred_email: email?.toLowerCase() || null,
                referral_code: referralCode,
                note: note?.trim() || null,
            })
            .select()
            .single()

        if (error) {
            // Unique constraint - retry with new code
            if (error.code === '23505') {
                const retryCode = generateCode()
                const { data: retryData, error: retryError } = await untypedFrom(supabase, 'expert_referrals')
                    .insert({
                        referrer_id: user.id,
                        referred_email: email?.toLowerCase() || null,
                        referral_code: retryCode,
                        note: note?.trim() || null,
                    })
                    .select()
                    .single()

                if (retryError) {
                    console.error('[ExpertReferrals] Retry insert error:', retryError)
                    return { success: false, error: 'Failed to create referral', data: null }
                }

                revalidatePath('/recruits')
                return { success: true, error: null, data: retryData as ExpertReferral }
            }

            console.error('[ExpertReferrals] Insert error:', error)
            return { success: false, error: 'Failed to create referral', data: null }
        }

        revalidatePath('/recruits')
        return { success: true, error: null, data: data as ExpertReferral }
    })
}

/**
 * Get all referrals for the current user.
 *
 * @returns Array of referrals with status information
 */
export async function getMyReferrals(): Promise<ExpertReferral[]> {
    return withUser(async ({ supabase, user }) => {
        const { data, error } = await untypedFrom(supabase, 'expert_referrals')
            .select('*')
            .eq('referrer_id', user.id)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[ExpertReferrals] Fetch error:', error)
            return []
        }

        return (data || []) as ExpertReferral[]
    }) as Promise<ExpertReferral[]>
}

/**
 * Get referral statistics for the current user.
 *
 * @returns Counts by status
 */
export async function getReferralStats(): Promise<ReferralStats> {
    return withUser(async ({ supabase, user }) => {
        const { data, error } = await untypedFrom(supabase, 'expert_referrals')
            .select('status')
            .eq('referrer_id', user.id)

        if (error || !data) {
            return { total: 0, pending: 0, signedUp: 0, profileCreated: 0 }
        }

        return {
            total: data.length,
            pending: data.filter((r: { status: string }) => r.status === 'pending').length,
            signedUp: data.filter((r: { status: string }) => r.status === 'signed_up').length,
            profileCreated: data.filter((r: { status: string }) => r.status === 'profile_created').length,
        }
    }) as Promise<ReferralStats>
}

/**
 * Delete a pending referral.
 *
 * @param referralId - The referral to delete
 * @returns Success status
 *
 * @security Only own pending referrals can be deleted. Enforced by RLS.
 */
export async function deleteReferral(referralId: string) {
    return withUser(async ({ supabase, user }) => {
        const { error } = await untypedFrom(supabase, 'expert_referrals')
            .delete()
            .eq('id', referralId)
            .eq('referrer_id', user.id) // Defense in depth
            .eq('status', 'pending')

        if (error) {
            console.error('[ExpertReferrals] Delete error:', error)
            return { success: false, error: 'Failed to delete referral' }
        }

        revalidatePath('/recruits')
        return { success: true, error: null }
    })
}

/**
 * Look up a referral by code (for the signup page).
 *
 * @param code - The referral code
 * @returns Referral info (limited fields for public consumption)
 */
export async function lookupReferralCode(code: string) {
    const supabase = await createClient()

    const { data, error } = await untypedFrom(supabase, 'expert_referrals')
        .select('id, referral_code, status, referrer_id, note, expires_at')
        .eq('referral_code', code.toUpperCase())
        .eq('status', 'pending')
        .single()

    if (error || !data) {
        return { valid: false, referral: null }
    }

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
        return { valid: false, referral: null }
    }

    // Get referrer name for display
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.referrer_id)
        .single()

    return {
        valid: true,
        referral: {
            id: data.id,
            code: data.referral_code,
            referrerName: profile?.full_name || 'A ForgeOS member',
            note: data.note,
        },
    }
}

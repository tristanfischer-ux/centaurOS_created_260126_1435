"use server"

import { createClient } from "@/lib/supabase/server"
import { withUser } from '@/lib/server-action-utils'
import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Helper to query tables not yet in the generated Supabase types.
 * Safe cast via unknown - these tables exist after migration is applied.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function untypedFrom(supabase: SupabaseClient, table: string): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (supabase as any).from(table)
}

/**
 * @file endorsements.ts
 *
 * @description Server actions for the endorsement system. Founders and Executives
 * can endorse people they've worked with through general testimonials and
 * skill-specific endorsements.
 *
 * @security All actions require authenticated user. Users cannot endorse themselves.
 * RLS enforces that users can only create endorsements from their own account.
 */

// ==========================================
// TYPES
// ==========================================

export interface Endorsement {
    id: string
    endorser_id: string
    endorsed_user_id: string
    testimonial: string
    relationship: string | null
    is_public: boolean
    created_at: string
    endorser_name?: string
    endorser_role?: string
    endorser_avatar?: string
}

export interface SkillEndorsement {
    skill_name: string
    count: number
    endorsed_by_current_user: boolean
}

export interface EndorsementSummary {
    generalCount: number
    skillCount: number
    topSkills: { skill_name: string; count: number }[]
    recentEndorsements: Endorsement[]
}

// ==========================================
// CREATE ENDORSEMENTS
// ==========================================

/**
 * Create a general endorsement (testimonial) for a user.
 *
 * @param endorsedUserId - The user being endorsed
 * @param testimonial - Written endorsement text
 * @param relationship - How the endorser knows this person
 * @returns Success status or error
 *
 * @security Requires authenticated user. Cannot endorse self. One per pair.
 * @audit Creates endorsement record with endorser_id from auth.
 */
export async function createEndorsement(
    endorsedUserId: string,
    testimonial: string,
    relationship?: string
) {
    return withUser(async ({ supabase, user }) => {
        // VALIDATION: Can't endorse yourself
        if (user.id === endorsedUserId) {
            return { success: false, error: 'You cannot endorse yourself' }
        }

        // VALIDATION: Testimonial length
        if (!testimonial.trim() || testimonial.trim().length < 10) {
            return { success: false, error: 'Endorsement must be at least 10 characters' }
        }

        if (testimonial.length > 1000) {
            return { success: false, error: 'Endorsement must be under 1000 characters' }
        }

        const { error } = await untypedFrom(supabase, 'endorsements')
            .insert({
                endorser_id: user.id,
                endorsed_user_id: endorsedUserId,
                testimonial: testimonial.trim(),
                relationship: relationship?.trim() || null,
                is_public: true,
            })

        if (error) {
            if (error.code === '23505') {
                return { success: false, error: 'You have already endorsed this person' }
            }
            console.error('[Endorsements] Create error:', error)
            return { success: false, error: 'Failed to create endorsement' }
        }

        revalidatePath('/recruits')
        revalidatePath('/profile')
        return { success: true, error: null }
    })
}

/**
 * Toggle a skill endorsement for a user.
 *
 * @param endorsedUserId - The user being endorsed
 * @param skillName - The skill to endorse
 * @returns Success status with current state
 *
 * @security Requires authenticated user. Cannot endorse own skills.
 */
export async function toggleSkillEndorsement(
    endorsedUserId: string,
    skillName: string
) {
    return withUser(async ({ supabase, user }) => {
        // VALIDATION: Can't endorse yourself
        if (user.id === endorsedUserId) {
            return { success: false, endorsed: false, error: 'You cannot endorse your own skills' }
        }

        // VALIDATION: Skill name
        if (!skillName.trim()) {
            return { success: false, endorsed: false, error: 'Skill name is required' }
        }

        // Check if already endorsed
        const { data: existing } = await untypedFrom(supabase, 'skill_endorsements')
            .select('id')
            .eq('endorser_id', user.id)
            .eq('endorsed_user_id', endorsedUserId)
            .eq('skill_name', skillName.trim())
            .single()

        if (existing) {
            // Remove endorsement
            const { error } = await untypedFrom(supabase, 'skill_endorsements')
                .delete()
                .eq('id', existing.id)

            if (error) {
                console.error('[Endorsements] Remove skill endorsement error:', error)
                return { success: false, endorsed: true, error: 'Failed to remove endorsement' }
            }

            revalidatePath('/recruits')
            return { success: true, endorsed: false, error: null }
        } else {
            // Add endorsement
            const { error } = await untypedFrom(supabase, 'skill_endorsements')
                .insert({
                    endorser_id: user.id,
                    endorsed_user_id: endorsedUserId,
                    skill_name: skillName.trim(),
                })

            if (error) {
                console.error('[Endorsements] Add skill endorsement error:', error)
                return { success: false, endorsed: false, error: 'Failed to add endorsement' }
            }

            revalidatePath('/recruits')
            return { success: true, endorsed: true, error: null }
        }
    })
}

// ==========================================
// READ ENDORSEMENTS
// ==========================================

/**
 * Get endorsement summary for a user (counts + recent endorsements).
 *
 * @param endorsedUserId - The user to get endorsements for
 * @returns Endorsement summary with counts and recent testimonials
 */
export async function getEndorsementSummary(
    endorsedUserId: string
): Promise<EndorsementSummary> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { generalCount: 0, skillCount: 0, topSkills: [], recentEndorsements: [] }

    // Fetch endorsements + endorser profiles in parallel
    const [endorsementsResult, skillsResult] = await Promise.allSettled([
        untypedFrom(supabase, 'endorsements')
            .select('*, profiles:endorser_id(full_name, role, avatar_url)')
            .eq('endorsed_user_id', endorsedUserId)
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(10),
        untypedFrom(supabase, 'skill_endorsements')
            .select('skill_name')
            .eq('endorsed_user_id', endorsedUserId),
    ])

    const endorsements: Endorsement[] = []
    if (endorsementsResult.status === 'fulfilled' && endorsementsResult.value.data) {
        for (const e of endorsementsResult.value.data) {
            const profile = e.profiles as unknown as {
                full_name: string | null
                role: string | null
                avatar_url: string | null
            } | null
            endorsements.push({
                id: e.id,
                endorser_id: e.endorser_id,
                endorsed_user_id: e.endorsed_user_id,
                testimonial: e.testimonial,
                relationship: e.relationship,
                is_public: e.is_public,
                created_at: e.created_at,
                endorser_name: profile?.full_name || 'Anonymous',
                endorser_role: profile?.role || undefined,
                endorser_avatar: profile?.avatar_url || undefined,
            })
        }
    }

    // Aggregate skill endorsements
    const skillCounts = new Map<string, number>()
    if (skillsResult.status === 'fulfilled' && skillsResult.value.data) {
        for (const s of skillsResult.value.data) {
            skillCounts.set(s.skill_name, (skillCounts.get(s.skill_name) || 0) + 1)
        }
    }

    const topSkills = Array.from(skillCounts.entries())
        .map(([skill_name, count]) => ({ skill_name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

    const uniqueSkillEndorsers = new Set(
        skillsResult.status === 'fulfilled' && skillsResult.value.data
            ? skillsResult.value.data.map((s: { skill_name: string }) => s.skill_name)
            : []
    )

    return {
        generalCount: endorsements.length,
        skillCount: uniqueSkillEndorsers.size,
        topSkills,
        recentEndorsements: endorsements,
    }
}

/**
 * Get skill endorsements for a user with current user's endorsement status.
 *
 * @param endorsedUserId - The user to get skill endorsements for
 * @returns Array of skills with endorsement counts and current user's status
 */
export async function getSkillEndorsements(
    endorsedUserId: string
): Promise<SkillEndorsement[]> {
    return withUser(async ({ supabase, user }) => {
        // Get all skill endorsements for this user
        const { data, error } = await untypedFrom(supabase, 'skill_endorsements')
            .select('skill_name, endorser_id')
            .eq('endorsed_user_id', endorsedUserId)

        if (error || !data) {
            console.error('[Endorsements] Get skill endorsements error:', error)
            return []
        }

        // Aggregate by skill
        const skillMap = new Map<string, { count: number; endorsedByMe: boolean }>()
        for (const item of data) {
            const existing = skillMap.get(item.skill_name) || { count: 0, endorsedByMe: false }
            existing.count++
            if (item.endorser_id === user.id) existing.endorsedByMe = true
            skillMap.set(item.skill_name, existing)
        }

        return Array.from(skillMap.entries()).map(([skill_name, { count, endorsedByMe }]) => ({
            skill_name,
            count,
            endorsed_by_current_user: endorsedByMe,
        }))
    }) as Promise<SkillEndorsement[]>
}

// ==========================================
// DELETE ENDORSEMENTS
// ==========================================

/**
 * Delete a general endorsement.
 *
 * @param endorsementId - The endorsement ID to delete
 * @returns Success status or error
 *
 * @security Only the endorser can delete their own endorsement. Enforced by RLS.
 */
export async function deleteEndorsement(endorsementId: string) {
    return withUser(async ({ supabase, user }) => {
        const { error } = await untypedFrom(supabase, 'endorsements')
            .delete()
            .eq('id', endorsementId)
            .eq('endorser_id', user.id) // Defense in depth

        if (error) {
            console.error('[Endorsements] Delete error:', error)
            return { success: false, error: 'Failed to delete endorsement' }
        }

        revalidatePath('/recruits')
        revalidatePath('/profile')
        return { success: true, error: null }
    })
}

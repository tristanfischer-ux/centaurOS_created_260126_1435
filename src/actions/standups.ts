'use server'
// @ts-nocheck - Database types out of sync

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

export interface Standup {
    id: string
    user_id: string
    foundry_id: string
    standup_date: string
    completed: string | null
    planned: string | null
    blockers: string | null
    blocker_tags: string[]
    blocker_severity: string | null
    needs_help: boolean
    mood: string | null
    submitted_at: string
    user?: {
        id: string
        full_name: string | null
        role: string | null
    }
}

export interface StandupSummary {
    id: string
    foundry_id: string
    summary_date: string
    summary_text: string
    key_highlights: string[]
    blockers_summary: string | null
    team_mood: string | null
    total_standups: number
    members_with_blockers: number
    generated_at: string
}

// Get today's standup for the current user
export async function getMyTodayStandup(): Promise<{ data: Standup | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: null, error: 'Not authenticated' }

        const today = new Date().toISOString().split('T')[0]

        const { data, error } = await supabase
            .from('standups')
            .select('*')
            .eq('user_id', user.id)
            .eq('standup_date', today)
            .single()

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching today standup:', error)
            return { data: null, error: error.message }
        }

        return { 
            data: data ? {
                ...data,
                blocker_tags: data.blocker_tags ?? [],
                needs_help: data.needs_help ?? false
            } as Standup : null, 
            error: null 
        }
    } catch (err) {
        console.error('Failed to fetch today standup:', err)
        return { data: null, error: 'Failed to fetch standup' }
    }
}

// Submit or update today's standup
export async function submitStandup(formData: {
    completed?: string
    planned?: string
    blockers?: string
    blockerTags?: string[]
    blockerSeverity?: 'low' | 'medium' | 'high' | 'critical'
    needsHelp?: boolean
    mood?: 'great' | 'good' | 'okay' | 'struggling'
}): Promise<{ data: Standup | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: null, error: 'Not authenticated' }

        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: null, error: 'No foundry context' }

        const today = new Date().toISOString().split('T')[0]

        const { data, error } = await supabase
            .from('standups')
            .upsert({
                user_id: user.id,
                foundry_id: foundryId,
                standup_date: today,
                completed: formData.completed || null,
                planned: formData.planned || null,
                blockers: formData.blockers || null,
                blocker_tags: formData.blockerTags || [],
                blocker_severity: formData.blockerSeverity || null,
                needs_help: formData.needsHelp || false,
                mood: formData.mood || null,
                submitted_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,standup_date'
            })
            .select()
            .single()

        if (error) {
            console.error('Error submitting standup:', error)
            return { data: null, error: error.message }
        }

        revalidatePath('/tasks')
        return { 
            data: {
                ...data,
                blocker_tags: data.blocker_tags ?? [],
                needs_help: data.needs_help ?? false
            } as Standup, 
            error: null 
        }
    } catch (err) {
        console.error('Failed to submit standup:', err)
        return { data: null, error: 'Failed to submit standup' }
    }
}

// Get all standups for today (for executives/founders)
export async function getTodayTeamStandups(): Promise<{ data: Standup[]; error: string | null }> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: [], error: 'No foundry context' }

        const today = new Date().toISOString().split('T')[0]

        const { data, error } = await supabase
            .from('standups')
            .select(`
                *,
                user:profiles!standups_user_id_fkey(id, full_name, role)
            `)
            .eq('foundry_id', foundryId)
            .eq('standup_date', today)
            .order('submitted_at', { ascending: false })

        if (error) {
            console.error('Error fetching team standups:', error)
            return { data: [], error: error.message }
        }

        return { 
            data: (data || []).map(s => ({
                ...s,
                blocker_tags: s.blocker_tags ?? [],
                needs_help: s.needs_help ?? false
            })) as Standup[], 
            error: null 
        }
    } catch (err) {
        console.error('Failed to fetch team standups:', err)
        return { data: [], error: 'Failed to fetch standups' }
    }
}

// Get standups with blockers (for executives to address)
export async function getStandupsWithBlockers(): Promise<{ data: Standup[]; error: string | null }> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: [], error: 'No foundry context' }

        const today = new Date().toISOString().split('T')[0]

        const { data, error } = await supabase
            .from('standups')
            .select(`
                *,
                user:profiles!standups_user_id_fkey(id, full_name, role)
            `)
            .eq('foundry_id', foundryId)
            .eq('standup_date', today)
            .not('blockers', 'is', null)
            .order('blocker_severity', { ascending: false })

        if (error) {
            console.error('Error fetching standups with blockers:', error)
            return { data: [], error: error.message }
        }

        return { 
            data: (data || []).map(s => ({
                ...s,
                blocker_tags: s.blocker_tags ?? [],
                needs_help: s.needs_help ?? false
            })) as Standup[], 
            error: null 
        }
    } catch (err) {
        console.error('Failed to fetch standups with blockers:', err)
        return { data: [], error: 'Failed to fetch standups' }
    }
}

// Get standup participation stats
export async function getStandupStats(): Promise<{
    data: {
        totalMembers: number
        submittedToday: number
        pendingToday: number
        participationRate: number
        membersWithBlockers: number
    } | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: null, error: 'No foundry context' }

        const today = new Date().toISOString().split('T')[0]

        // Get total members in foundry
        const { count: totalMembers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('foundry_id', foundryId)

        // Get standups submitted today
        const { data: todayStandups, error } = await supabase
            .from('standups')
            .select('id, blockers')
            .eq('foundry_id', foundryId)
            .eq('standup_date', today)

        if (error) {
            console.error('Error fetching standup stats:', error)
            return { data: null, error: error.message }
        }

        const submittedToday = todayStandups?.length || 0
        const membersWithBlockers = todayStandups?.filter(s => s.blockers).length || 0
        const total = totalMembers || 0

        return {
            data: {
                totalMembers: total,
                submittedToday,
                pendingToday: total - submittedToday,
                participationRate: total > 0 ? Math.round((submittedToday / total) * 100) : 0,
                membersWithBlockers
            },
            error: null
        }
    } catch (err) {
        console.error('Failed to fetch standup stats:', err)
        return { data: null, error: 'Failed to fetch stats' }
    }
}

// Generate AI summary (placeholder - would integrate with AI service)
export async function generateStandupSummary(): Promise<{ data: StandupSummary | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: null, error: 'No foundry context' }

        const today = new Date().toISOString().split('T')[0]

        // Get today's standups
        const { data: standups } = await supabase
            .from('standups')
            .select('*')
            .eq('foundry_id', foundryId)
            .eq('standup_date', today)

        if (!standups || standups.length === 0) {
            return { data: null, error: 'No standups to summarize' }
        }

        // Simple summary generation (would use AI in production)
        const blockers = standups.filter(s => s.blockers).map(s => s.blockers)
        const moods = standups.map(s => s.mood).filter(Boolean)
        
        const summaryText = `Team submitted ${standups.length} standups today. ${blockers.length} members reported blockers.`
        
        const { data, error } = await supabase
            .from('standup_summaries')
            .upsert({
                foundry_id: foundryId,
                summary_date: today,
                summary_text: summaryText,
                key_highlights: [],
                blockers_summary: blockers.length > 0 ? blockers.join('\n') : null,
                team_mood: moods.length > 0 ? moods[0] : null,
                total_standups: standups.length,
                members_with_blockers: blockers.length,
                generated_at: new Date().toISOString()
            }, {
                onConflict: 'foundry_id,summary_date'
            })
            .select()
            .single()

        if (error) {
            console.error('Error generating summary:', error)
            return { data: null, error: error.message }
        }

        return { 
            data: {
                ...data,
                key_highlights: data.key_highlights ?? []
            } as StandupSummary, 
            error: null 
        }
    } catch (err) {
        console.error('Failed to generate summary:', err)
        return { data: null, error: 'Failed to generate summary' }
    }
}

// Get latest summary
export async function getLatestSummary(): Promise<{ data: StandupSummary | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: null, error: 'No foundry context' }

        const { data, error } = await supabase
            .from('standup_summaries')
            .select('*')
            .eq('foundry_id', foundryId)
            .order('summary_date', { ascending: false })
            .limit(1)
            .single()

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching latest summary:', error)
            return { data: null, error: error.message }
        }

        return { 
            data: data ? {
                ...data,
                key_highlights: data.key_highlights ?? []
            } as StandupSummary : null, 
            error: null 
        }
    } catch (err) {
        console.error('Failed to fetch latest summary:', err)
        return { data: null, error: 'Failed to fetch summary' }
    }
}

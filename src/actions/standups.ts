'use server'

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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Unauthorized' }

    const today = new Date().toISOString().split('T')[0]
    
    const { data, error } = await supabase
        .from('standups')
        .select('*')
        .eq('user_id', user.id)
        .eq('standup_date', today)
        .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        return { data: null, error: error.message }
    }

    return { data: data as Standup | null, error: null }
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Unauthorized' }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { data: null, error: 'No foundry assigned' }

    const today = new Date().toISOString().split('T')[0]

    // Upsert standup
    const { data, error } = await supabase
        .from('standups')
        .upsert({
            user_id: user.id,
            foundry_id,
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

    if (error) return { data: null, error: error.message }

    revalidatePath('/dashboard')
    return { data: data as Standup, error: null }
}

// Get all standups for today (for executives/founders)
export async function getTodayTeamStandups(): Promise<{ data: Standup[]; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Unauthorized' }

    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
        .from('standups')
        .select(`
            *,
            user:profiles!user_id(id, full_name, role)
        `)
        .eq('standup_date', today)
        .order('submitted_at', { ascending: false })

    if (error) return { data: [], error: error.message }

    return { data: (data || []) as Standup[], error: null }
}

// Get standups with blockers (for executives to address)
export async function getStandupsWithBlockers(): Promise<{ data: Standup[]; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Unauthorized' }

    // Get last 7 days of standups with blockers
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data, error } = await supabase
        .from('standups')
        .select(`
            *,
            user:profiles!user_id(id, full_name, role)
        `)
        .or('needs_help.eq.true,blocker_severity.neq.null')
        .gte('standup_date', sevenDaysAgo.toISOString().split('T')[0])
        .order('blocker_severity', { ascending: false, nullsFirst: false })
        .order('submitted_at', { ascending: false })

    if (error) return { data: [], error: error.message }

    return { data: (data || []) as Standup[], error: null }
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Unauthorized' }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { data: null, error: 'No foundry assigned' }

    const today = new Date().toISOString().split('T')[0]

    // Get total active members
    const { count: totalMembers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('foundry_id', foundry_id)
        .neq('role', 'AI_Agent')

    // Get today's standups
    const { data: todayStandups } = await supabase
        .from('standups')
        .select('id, needs_help, blocker_severity')
        .eq('standup_date', today)

    const submittedToday = todayStandups?.length || 0
    const membersWithBlockers = todayStandups?.filter(
        s => s.needs_help || s.blocker_severity
    ).length || 0

    const total = totalMembers || 1
    const participationRate = Math.round((submittedToday / total) * 100)

    return {
        data: {
            totalMembers: total,
            submittedToday,
            pendingToday: total - submittedToday,
            participationRate,
            membersWithBlockers
        },
        error: null
    }
}

// Generate AI summary (simplified - would call edge function in production)
export async function generateStandupSummary(): Promise<{ data: StandupSummary | null; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Unauthorized' }

    // Check if user is Executive or Founder
    const { data: profile } = await supabase.from('profiles').select('role, foundry_id').eq('id', user.id).single()
    if (!profile || (profile.role !== 'Executive' && profile.role !== 'Founder')) {
        return { data: null, error: 'Only Executives and Founders can generate summaries' }
    }

    const today = new Date().toISOString().split('T')[0]

    // Get today's standups
    const { data: standups } = await supabase
        .from('standups')
        .select(`
            *,
            user:profiles!user_id(id, full_name, role)
        `)
        .eq('standup_date', today)

    if (!standups || standups.length === 0) {
        return { data: null, error: 'No standups submitted today' }
    }

    // Generate simple summary (in production, this would call OpenAI)
    const completedItems = standups
        .filter(s => s.completed)
        .map(s => `${(s.user as { full_name: string | null })?.full_name || 'Someone'}: ${s.completed}`)

    const plannedItems = standups
        .filter(s => s.planned)
        .map(s => `${(s.user as { full_name: string | null })?.full_name || 'Someone'}: ${s.planned}`)

    const blockerItems = standups
        .filter(s => s.blockers || s.needs_help)
        .map(s => `${(s.user as { full_name: string | null })?.full_name || 'Someone'}: ${s.blockers || 'Needs help'}`)

    // Calculate team mood
    const moods = standups.map(s => s.mood).filter(Boolean)
    const moodScore = moods.reduce((acc, m) => {
        if (m === 'great') return acc + 4
        if (m === 'good') return acc + 3
        if (m === 'okay') return acc + 2
        if (m === 'struggling') return acc + 1
        return acc
    }, 0)
    const avgMood = moods.length > 0 ? moodScore / moods.length : 0
    const teamMood = avgMood >= 3.5 ? 'great' : avgMood >= 2.5 ? 'good' : avgMood >= 1.5 ? 'okay' : 'struggling'

    const summaryText = `
**Team Standup Summary - ${new Date().toLocaleDateString()}**

${standups.length} team members submitted standups today.

**Completed Yesterday:**
${completedItems.length > 0 ? completedItems.map(i => `- ${i}`).join('\n') : '- No updates'}

**Planned for Today:**
${plannedItems.length > 0 ? plannedItems.map(i => `- ${i}`).join('\n') : '- No plans shared'}

**Blockers & Needs:**
${blockerItems.length > 0 ? blockerItems.map(i => `- ${i}`).join('\n') : '- No blockers reported'}

**Team Mood:** ${teamMood.charAt(0).toUpperCase() + teamMood.slice(1)}
    `.trim()

    // Upsert summary
    const { data: summary, error } = await supabase
        .from('standup_summaries')
        .upsert({
            foundry_id: profile.foundry_id,
            summary_date: today,
            summary_text: summaryText,
            key_highlights: completedItems.slice(0, 5),
            blockers_summary: blockerItems.length > 0 ? blockerItems.join('; ') : null,
            team_mood: teamMood,
            total_standups: standups.length,
            members_with_blockers: blockerItems.length,
            generated_at: new Date().toISOString()
        }, {
            onConflict: 'foundry_id,summary_date'
        })
        .select()
        .single()

    if (error) return { data: null, error: error.message }

    return { data: summary as StandupSummary, error: null }
}

// Get latest summary
export async function getLatestSummary(): Promise<{ data: StandupSummary | null; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Unauthorized' }

    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
        .from('standup_summaries')
        .select('*')
        .eq('summary_date', today)
        .single()

    if (error && error.code !== 'PGRST116') {
        return { data: null, error: error.message }
    }

    return { data: data as StandupSummary | null, error: null }
}

'use server'

// TODO: Enable when standups and standup_summaries tables are added to database types

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
    return { data: null, error: null }
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
    return { data: null, error: 'Standups feature not yet available' }
}

// Get all standups for today (for executives/founders)
export async function getTodayTeamStandups(): Promise<{ data: Standup[]; error: string | null }> {
    return { data: [], error: null }
}

// Get standups with blockers (for executives to address)
export async function getStandupsWithBlockers(): Promise<{ data: Standup[]; error: string | null }> {
    return { data: [], error: null }
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
    return {
        data: {
            totalMembers: 0,
            submittedToday: 0,
            pendingToday: 0,
            participationRate: 0,
            membersWithBlockers: 0
        },
        error: null
    }
}

// Generate AI summary
export async function generateStandupSummary(): Promise<{ data: StandupSummary | null; error: string | null }> {
    return { data: null, error: 'Standups feature not yet available' }
}

// Get latest summary
export async function getLatestSummary(): Promise<{ data: StandupSummary | null; error: string | null }> {
    return { data: null, error: null }
}

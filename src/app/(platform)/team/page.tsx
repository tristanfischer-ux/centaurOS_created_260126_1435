import { createClient } from '@/lib/supabase/server'
import { TeamComparisonView } from './team-comparison-view'

export default async function TeamPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return <div className="p-8 text-red-500">Unauthenticated. Please login.</div>
    }

    const foundry_id = user.app_metadata.foundry_id

    // Fetch profiles
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*, paired_ai:profiles!paired_ai_id(id, full_name, avatar_url, role)')
        .order('created_at', { ascending: false })

    if (error) {
        return <div className="text-red-500">Error loading team</div>
    }

    // Fetch all tasks for task metrics
    const { data: tasks } = await supabase
        .from('tasks')
        .select('assignee_id, status')

    // Fetch teams with members
    const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select(`
            *,
            members:team_members(
                profile:profiles(id, full_name, role, email, paired_ai_id)
            )
        `)
        .order('created_at', { ascending: false })

    if (teamsError) {
        console.error("Error fetching teams:", teamsError)
    }

    // Transform teams data
    const teams = teamsData?.map(team => ({
        id: team.id,
        name: team.name,
        is_auto_generated: team.is_auto_generated,
        created_at: team.created_at,
        members: (team.members as unknown as Array<{ profile: { id: string; full_name: string | null; role: string | null; email: string | null; paired_ai_id: string | null } }>)
            .map(m => ({
                id: m.profile.id,
                full_name: m.profile.full_name,
                role: m.profile.role,
                email: m.profile.email,
                paired_ai_id: m.profile.paired_ai_id
            }))
    })) || []

    interface MemberMetrics {
        id: string
        full_name: string
        email: string
        role: "Founder" | "Executive" | "Apprentice" | "AI_Agent"
        paired_ai_id: string | null
        pairedAI: any
        activeTasks: number
        completedTasks: number
        pendingTasks: number
        rejectedTasks: number
    }

    // Calculate metrics per member
    const membersWithMetrics: MemberMetrics[] = (profiles as any)?.map((profile: any) => {
        const memberTasks = tasks?.filter(t => t.assignee_id === profile.id) || []
        return {
            id: profile.id,
            full_name: profile.full_name || 'Unknown',
            email: profile.email || '',
            role: profile.role || 'Apprentice',
            paired_ai_id: profile.paired_ai_id,
            pairedAI: profile.paired_ai, // Joined data
            activeTasks: memberTasks.filter(t => t.status === 'Accepted').length,
            completedTasks: memberTasks.filter(t => t.status === 'Completed').length,
            pendingTasks: memberTasks.filter(t => t.status === 'Pending').length,
            rejectedTasks: memberTasks.filter(t => t.status === 'Rejected').length,
        }
    }) || []

    const founders = membersWithMetrics.filter(p => p.role === 'Founder')
    const executives = membersWithMetrics.filter(p => p.role === 'Executive')
    const apprentices = membersWithMetrics.filter(p => p.role === 'Apprentice')
    const aiAgents = membersWithMetrics.filter(p => p.role === 'AI_Agent')

    return (
        <div className="relative">
            {/* Add Member button in top right - utilizing InviteMemberDialog in the view instead */}
            <TeamComparisonView
                founders={founders}
                executives={executives}
                apprentices={apprentices}
                aiAgents={aiAgents}
                teams={teams}
            />
        </div>
    )
}

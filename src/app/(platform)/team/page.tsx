import { createClient } from '@/lib/supabase/server'
import { TeamComparisonView } from './team-comparison-view'

export default async function TeamPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return <div className="p-8 text-red-500">Unauthenticated. Please login.</div>
    }

    // Get current user profile to get foundry_id
    const { data: currentUserProfile } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', user.id)
        .single()

    const foundry_id = currentUserProfile?.foundry_id || user.app_metadata?.foundry_id

    if (!foundry_id) {
        return <div className="p-8 text-red-500">Error: No Foundry associated with your account.</div>
    }

    // Fetch all tasks for task metrics
    const { data: tasks } = await supabase
        .from('tasks')
        .select('assignee_id, status')
        .eq('foundry_id', foundry_id)

    // Fetch profiles
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
            *,
            paired_ai:profiles!paired_ai_id(id, full_name, role, email, avatar_url)
        `)
        .eq('foundry_id', foundry_id)
        .order('created_at', { ascending: false })

    if (profilesError) {
        console.error("Error fetching profiles:", profilesError)
        return <div className="text-red-500">Error loading team members</div>
    }

    // Fetch teams with members
    const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select(`
            *,
            members:team_members(
                profile:profiles(id, full_name, role, email, paired_ai_id, bio, phone_number)
            )
        `)
        .eq('foundry_id', foundry_id)
        .order('created_at', { ascending: false })

    if (teamsError) {
        console.error("Error fetching teams:", teamsError)
    }

    // Transform teams data with defensive mapping
    const teams = teamsData?.map(team => ({
        id: team.id,
        name: team.name,
        is_auto_generated: team.is_auto_generated,
        created_at: team.created_at,
        members: (team.members)
            ?.filter((m) => m.profile)
            .map((m) => ({
                id: m.profile!.id,
                full_name: m.profile!.full_name,
                role: m.profile!.role,
                email: m.profile!.email,
                paired_ai_id: m.profile!.paired_ai_id,
                bio: m.profile!.bio,
                phone_number: m.profile!.phone_number
            })) || []
    })) || []

    interface MemberMetrics {
        id: string
        full_name: string
        email: string
        role: "Founder" | "Executive" | "Apprentice" | "AI_Agent"
        paired_ai_id: string | null
        bio: string | null
        phone_number: string | null
        pairedAI: { id: string, full_name: string | null, role: string, email: string, avatar_url: string | null }[]
        activeTasks: number
        completedTasks: number
        pendingTasks: number
        rejectedTasks: number
    }

    // Calculate metrics per member with defensive checks
    const membersWithMetrics: MemberMetrics[] = (profiles || [])?.map((profile) => {
        const memberTasks = (tasks || []).filter(t => t.assignee_id === profile.id)
        return {
            id: profile.id,
            full_name: profile.full_name || 'Unknown',
            email: profile.email || '',
            role: profile.role || 'Apprentice',
            paired_ai_id: profile.paired_ai_id,
            bio: profile.bio,
            phone_number: profile.phone_number,
            pairedAI: profile.paired_ai ? [{
                id: profile.paired_ai.id,
                full_name: profile.paired_ai.full_name,
                role: profile.paired_ai.role,
                email: profile.paired_ai.email || '',
                avatar_url: profile.paired_ai.avatar_url
            }] : [],
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

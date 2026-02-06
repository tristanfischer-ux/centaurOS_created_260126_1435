import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamComparisonView } from './team-comparison-view'
import { isPast } from 'date-fns'

export default async function TeamPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get current user profile to get foundry_id
    const { data: currentUserProfile } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', user.id)
        .single()

    const foundry_id = currentUserProfile?.foundry_id || user.app_metadata?.foundry_id

    if (!foundry_id) {
        return <div className="p-8 text-destructive">Error: No Foundry associated with your account.</div>
    }

    // Fetch all tasks with extended fields for workload board
    const { data: tasks } = await supabase
        .from('tasks')
        .select('id, assignee_id, status, title, end_date, start_date, created_at, objective_id, progress, risk_level')
        .eq('foundry_id', foundry_id)

    // Fetch objectives for name labels on workload board
    const { data: objectives } = await supabase
        .from('objectives')
        .select('id, title')
        .eq('foundry_id', foundry_id)

    const objectiveMap: Record<string, string> = {}
    for (const obj of objectives || []) {
        objectiveMap[obj.id] = obj.title
    }

    // Fetch all profiles for the current foundry
    const { data: profiles } = await supabase
        .from('profiles')
        .select(`
            id,
            full_name,
            role,
            avatar_url,
            paired_ai_id,
            bio,
            paired_ai:profiles!paired_ai_id(id, full_name, role, avatar_url)
        `)
        .eq('foundry_id', foundry_id)
        .order('role', { ascending: true })

    // Fetch teams with members
    interface TeamMemberJoin {
        profile: {
            id: string
            full_name: string | null
            role: string | null
        } | null
    }

    const { data: rawTeams } = await supabase
        .from('teams')
        .select(`
            id,
            name,
            foundry_id,
            is_auto_generated,
            created_at,
            team_members(
                profile:profiles(id, full_name, role)
            )
        `)
        .eq('foundry_id', foundry_id)
        .order('created_at', { ascending: false })

    const teams = rawTeams?.map(team => ({
        ...team,
        members: (team.team_members as TeamMemberJoin[] | null)?.map(tm => tm.profile).filter((profile): profile is NonNullable<typeof profile> => profile !== null) || []
    })) || []

    // ─── Extended Task Interface ─────────────────

    interface ExtendedTask {
        id: string
        title: string
        status: string
        assignee_id: string | null
        end_date: string | null
        start_date: string | null
        created_at: string
        objective_id: string | null
        objective_title: string | null
        progress: number | null
        risk_level: string | null
    }

    // Build extended tasks with objective names
    const extendedTasks: ExtendedTask[] = (tasks || []).map(t => ({
        ...t,
        objective_title: t.objective_id ? (objectiveMap[t.objective_id] || null) : null,
    }))

    // ─── Unassigned Tasks ────────────────────────

    const unassignedTasks = extendedTasks.filter(t =>
        !t.assignee_id &&
        t.status !== 'Completed' &&
        t.status !== 'Rejected'
    )

    // ─── Member Metrics ──────────────────────────

    interface TaskDetail {
        id: string
        title: string
        end_date: string | null
        start_date: string | null
        created_at: string
        objective_id: string | null
        objective_title: string | null
        progress: number | null
        risk_level: string | null
        status: string
    }

    interface MemberMetrics {
        id: string
        full_name: string
        role: "Founder" | "Executive" | "Apprentice" | "AI_Agent"
        avatar_url: string | null
        paired_ai_id: string | null
        bio: string | null
        pairedAI: { id: string, full_name: string | null, role: string, avatar_url: string | null }[]
        activeTasks: number
        completedTasks: number
        pendingTasks: number
        rejectedTasks: number
        taskTitles: {
            active: string[]
            completed: string[]
            pending: string[]
            rejected: string[]
        }
        taskDetails: {
            active: TaskDetail[]
            pending: TaskDetail[]
        }
    }

    const membersWithMetrics: MemberMetrics[] = (profiles || [])?.map((profile) => {
        const memberTasks = extendedTasks.filter(t => t.assignee_id === profile.id)
        const activeTasks = memberTasks.filter(t => t.status === 'Accepted')
        const pendingTasks = memberTasks.filter(t => t.status === 'Pending')

        return {
            id: profile.id,
            full_name: profile.full_name || 'Unknown',
            role: profile.role || 'Apprentice',
            avatar_url: profile.avatar_url || null,
            paired_ai_id: profile.paired_ai_id,
            bio: profile.bio,
            pairedAI: profile.paired_ai ? [{
                id: profile.paired_ai.id,
                full_name: profile.paired_ai.full_name,
                role: profile.paired_ai.role,
                avatar_url: profile.paired_ai.avatar_url
            }] : [],
            activeTasks: activeTasks.length,
            completedTasks: memberTasks.filter(t => t.status === 'Completed').length,
            pendingTasks: pendingTasks.length,
            rejectedTasks: memberTasks.filter(t => t.status === 'Rejected').length,
            taskTitles: {
                active: activeTasks.map(t => t.title),
                completed: memberTasks.filter(t => t.status === 'Completed').map(t => t.title),
                pending: pendingTasks.map(t => t.title),
                rejected: memberTasks.filter(t => t.status === 'Rejected').map(t => t.title),
            },
            taskDetails: {
                active: activeTasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    end_date: t.end_date,
                    start_date: t.start_date,
                    created_at: t.created_at,
                    objective_id: t.objective_id,
                    objective_title: t.objective_title,
                    progress: t.progress,
                    risk_level: t.risk_level,
                    status: t.status,
                })),
                pending: pendingTasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    end_date: t.end_date,
                    start_date: t.start_date,
                    created_at: t.created_at,
                    objective_id: t.objective_id,
                    objective_title: t.objective_title,
                    progress: t.progress,
                    risk_level: t.risk_level,
                    status: t.status,
                }))
            }
        }
    }) || []

    // ─── Compute Insights ────────────────────────

    const allHumanMembers = membersWithMetrics.filter(m => m.role !== 'AI_Agent')

    const overloadedMembers = allHumanMembers.filter(m => {
        const score = Math.min(100, (m.activeTasks * 20) + (m.pendingTasks * 10))
        return score > 70
    })

    const idleMembers = allHumanMembers.filter(m => m.activeTasks === 0 && m.pendingTasks === 0)

    const overdueTasks = extendedTasks.filter(t => {
        if (!t.end_date) return false
        if (t.status === 'Completed' || t.status === 'Rejected') return false
        return isPast(new Date(t.end_date))
    })

    const insights = {
        overloadedMembers: overloadedMembers.map(m => ({ id: m.id, name: m.full_name })),
        idleMembers: idleMembers.map(m => ({ id: m.id, name: m.full_name })),
        overdueTaskCount: overdueTasks.length,
        unassignedTaskCount: unassignedTasks.length,
        totalActiveTasks: extendedTasks.filter(t => t.status === 'Accepted').length,
        totalPendingTasks: extendedTasks.filter(t => t.status === 'Pending').length,
    }

    // ─── Render ──────────────────────────────────

    const founders = membersWithMetrics.filter(p => p.role === 'Founder')
    const executives = membersWithMetrics.filter(p => p.role === 'Executive')
    const apprentices = membersWithMetrics.filter(p => p.role === 'Apprentice')
    const aiAgents = membersWithMetrics.filter(p => p.role === 'AI_Agent')

    return (
        <TeamComparisonView
            founders={founders}
            executives={executives}
            apprentices={apprentices}
            aiAgents={aiAgents}
            teams={teams || []}
            currentUserId={user.id}
            insights={insights}
            unassignedTasks={unassignedTasks}
            allTasks={extendedTasks}
        />
    )
}

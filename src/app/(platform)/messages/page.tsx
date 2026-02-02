import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { MessagesPageClient } from "./messages-page-client"
import { getActivityFeed } from "@/actions/activity"
import type { ActivityItem } from "@/types/activity"

export default async function MessagesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Get user's profile with foundry_id and role
    const { data: profile } = await supabase
        .from('profiles')
        .select('foundry_id, role')
        .eq('id', user.id)
        .single()

    const foundryId = profile?.foundry_id
    const userRole = profile?.role || undefined

    // Get team members for @mentions (from same foundry)
    let members: { id: string; full_name: string; email: string; role: string }[] = []
    if (foundryId) {
        const { data: teamMembers } = await supabase
            .from('profiles')
            .select('id, full_name, email, role')
            .eq('foundry_id', foundryId)
            .neq('id', user.id)
            .limit(100)
        
        members = teamMembers?.map(m => ({
            id: m.id,
            full_name: m.full_name || '',
            email: m.email || '',
            role: m.role || 'Team Member'
        })) || []
    }

    // Fetch activity feed data
    let activityItems: ActivityItem[] = []
    let activityCounts = { all: 0, tasks: 0, objectives: 0, messages: 0, unread: 0 }
    
    const activityResult = await getActivityFeed({ limit: 30 })
    if (activityResult.success && activityResult.data) {
        activityItems = activityResult.data
        activityCounts = {
            all: activityItems.length,
            tasks: activityItems.filter(i => i.type === 'task_comment').length,
            objectives: activityItems.filter(i => i.type === 'objective_comment').length,
            messages: activityItems.filter(i => i.type === 'message').length,
            unread: activityItems.filter(i => i.is_unread).length
        }
    }

    // Fetch "needs attention" counts
    let overdueCount = 0
    let approvalsCount = 0
    let blockersCount = 0

    if (foundryId) {
        // Get overdue tasks count (tasks assigned to user that are past due)
        const now = new Date().toISOString()
        const { count: overdue } = await supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('foundry_id', foundryId)
            .eq('assignee_id', user.id)
            .lt('due_date', now)
            .not('status', 'in', '("done","cancelled")')

        overdueCount = overdue || 0

        // Get pending approvals count (tasks awaiting approval that user created or can approve)
        const isLeader = userRole === 'Executive' || userRole === 'Founder'
        if (isLeader) {
            const { count: approvals } = await supabase
                .from('tasks')
                .select('id', { count: 'exact', head: true })
                .eq('foundry_id', foundryId)
                .in('status', ['Pending_Executive_Approval', 'Pending_Peer_Review'])

            approvalsCount = approvals || 0
        } else {
            // For non-leaders, show tasks they created that are pending approval
            const { count: approvals } = await supabase
                .from('tasks')
                .select('id', { count: 'exact', head: true })
                .eq('foundry_id', foundryId)
                .eq('creator_id', user.id)
                .in('status', ['Pending_Executive_Approval', 'Pending_Peer_Review'])

            approvalsCount = approvals || 0
        }

        // Get blockers count from today's standups (only for leaders)
        if (isLeader) {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const { count: blockers } = await supabase
                .from('standups')
                .select('id', { count: 'exact', head: true })
                .eq('foundry_id', foundryId)
                .gte('created_at', today.toISOString())
                .not('blockers', 'is', null)
                .neq('blockers', '')

            blockersCount = blockers || 0
        }
    }

    return (
        <MessagesPageClient 
            userId={user.id} 
            foundryId={foundryId || undefined}
            userRole={userRole}
            members={members}
            initialActivityItems={activityItems}
            initialActivityCounts={activityCounts}
            overdueCount={overdueCount}
            approvalsCount={approvalsCount}
            blockersCount={blockersCount}
        />
    )
}

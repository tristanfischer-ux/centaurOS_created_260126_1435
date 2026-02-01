import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { CreateTaskDialog } from "../tasks/create-task-dialog"
import { CreateObjectiveDialog } from "../objectives/create-objective-dialog"
import { DailyPrioritizer } from "@/components/DailyPrioritizer"
import { StandupWidget } from "@/components/StandupWidget"
import { ActivityStream } from "@/components/today/activity-stream"
import { NeedsAttentionSummary } from "@/components/today/needs-attention-summary"
import { getActivityFeed } from "@/actions/activity"
import Link from "next/link"
import {
    Sun,
    CheckCircle2,
    Target,
    Plus,
    HelpCircle,
    MessageSquare,
    Sparkles
} from "lucide-react"

interface TodayTask {
    id: string
    title: string
    status: "Pending" | "Accepted" | "Rejected" | "Amended" | "Amended_Pending_Approval" | "Completed" | "Pending_Peer_Review" | "Pending_Executive_Approval"
    end_date: string | null
    created_at: string
    updated_at: string
    risk_level: string | null
    assignee?: {
        id: string
        full_name: string | null
        role: string | null
    }
    creator?: {
        id: string
        full_name: string | null
    }
    objective?: {
        id: string
        title: string
    }
}

export default async function TodayPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Get user profile
    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, foundry_id")
        .eq("id", user.id)
        .single()

    const userName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'there'
    const foundryId = profile?.foundry_id || ''
    const isExecutiveOrFounder = profile?.role === 'Executive' || profile?.role === 'Founder'

    // Get current time for greeting
    const hour = new Date().getHours()
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
    const briefingTime = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

    // --- PARALLEL DATA FETCHING ---

    // Get task IDs from task_assignees table first
    const { data: assignedTaskIds } = await supabase
        .from('task_assignees')
        .select('task_id')
        .eq('profile_id', user.id)

    const assignedIds = assignedTaskIds?.map(ta => ta.task_id) || []

    // 1. Overdue Tasks (for needs attention count)
    const now = new Date()
    const overduePromise = supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .not('end_date', 'is', null)
        .lt('end_date', now.toISOString())
        .neq('status', 'Completed')

    // 2. Pending Approvals count (for executives)
    const approvalsPromise = supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .in('status', ['Pending_Executive_Approval', 'Amended_Pending_Approval'])

    // 3. Blockers count (from today's standups)
    const today = new Date().toISOString().split('T')[0]
    const blockersPromise = supabase
        .from('standups')
        .select('id', { count: 'exact', head: true })
        .eq('standup_date', today)
        .not('blockers', 'is', null)

    // 4. Active tasks for prioritization (user's tasks)
    let myTasksQuery = supabase
        .from('tasks')
        .select(`
            id,
            title,
            status,
            end_date,
            created_at,
            updated_at,
            risk_level,
            assignee:profiles!assignee_id(id, full_name, role),
            objective:objectives!objective_id(id, title)
        `)
        .in('status', ['Pending', 'Accepted'])

    if (assignedIds.length > 0) {
        myTasksQuery = myTasksQuery.or(`assignee_id.eq.${user.id},id.in.(${assignedIds.join(',')})`)
    } else {
        myTasksQuery = myTasksQuery.eq('assignee_id', user.id)
    }

    const myTasksPromise = myTasksQuery
        .order('created_at', { ascending: false })
        .limit(50)

    // 5. Dialog data for create dialogs
    const objectivesPromise = supabase.from('objectives').select('id, title')
    const membersPromise = supabase.from('profiles').select('id, full_name, role, email')
    const teamsPromise = supabase.from('teams').select('id, name')
    
    // 6. Activity feed
    const activityFeedPromise = getActivityFeed({ limit: 30, filter: 'all' })

    // Execute all queries in parallel
    const [
        { count: overdueCount },
        { count: approvalsCount },
        { count: blockersCount },
        { data: myTasksData },
        { data: objectivesForDialog },
        { data: membersData },
        { data: teamsData },
        activityResult
    ] = await Promise.all([
        overduePromise,
        approvalsPromise,
        blockersPromise,
        myTasksPromise,
        objectivesPromise,
        membersPromise,
        teamsPromise,
        activityFeedPromise
    ])

    const myTasks = (myTasksData || []) as unknown as TodayTask[]
    const members = (membersData || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        role: p.role,
        email: p.email
    }))
    const teams = teamsData || []
    const activityItems = activityResult.success ? (activityResult.data || []) : []

    // Calculate unread counts for activity stream
    const activityCounts = {
        all: activityItems.length,
        tasks: activityItems.filter(i => i.type === 'task_comment').length,
        objectives: activityItems.filter(i => i.type === 'objective_comment').length,
        messages: activityItems.filter(i => i.type === 'message').length,
        unread: activityItems.filter(i => i.is_unread).length
    }

    // Check if everything is clear
    const hasNoActivity = activityItems.length === 0
    const hasNoTasks = myTasks.length === 0
    const hasNoUrgentItems = (overdueCount || 0) === 0 && 
                            (!isExecutiveOrFounder || (approvalsCount || 0) === 0) &&
                            (!isExecutiveOrFounder || (blockersCount || 0) === 0)
    const isAllClear = hasNoActivity && hasNoTasks && hasNoUrgentItems

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-gradient-to-br from-international-orange/10 to-electric-blue/10 rounded-xl">
                            <Sun className="h-6 w-6 text-international-orange" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                                {greeting}, {userName}
                            </h1>
                            <p className="text-muted-foreground text-sm font-medium mt-0.5">
                                Here's your {briefingTime} briefing
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap shrink-0">
                    <CreateTaskDialog
                        objectives={objectivesForDialog || []}
                        members={members}
                        teams={teams}
                        currentUserId={user.id}
                    >
                        <Button size="sm" className="font-medium shadow-md bg-international-orange hover:bg-international-orange-hover">
                            <Plus className="h-4 w-4 mr-2" /> New Task
                        </Button>
                    </CreateTaskDialog>
                    <Link href="/messages">
                        <Button size="sm" variant="secondary" className="font-medium">
                            <MessageSquare className="h-4 w-4 mr-2" /> Messages
                        </Button>
                    </Link>
                </div>
            </div>

            {/* All Clear State */}
            {isAllClear ? (
                <Card className="bg-gradient-to-br from-status-success-light to-status-success-light/50 border-status-success-light">
                    <CardContent className="py-12 text-center">
                        <div className="inline-flex p-4 bg-muted rounded-full mb-4">
                            <Sparkles className="h-8 w-8 text-status-success" />
                        </div>
                        <h3 className="text-xl font-display font-semibold text-status-success-dark mb-2">
                            All clear!
                        </h3>
                        <p className="text-status-success max-w-md mx-auto mb-6">
                            No messages, urgent items, or tasks to focus on. You're in great shape!
                        </p>
                        <div className="flex justify-center gap-3">
                            <CreateTaskDialog
                                objectives={objectivesForDialog || []}
                                members={members}
                                teams={teams}
                                currentUserId={user.id}
                            >
                                <Button variant="secondary" className="border border-status-success-light text-status-success hover:bg-status-success-light">
                                    <Plus className="h-4 w-4 mr-2" /> Create a Task
                                </Button>
                            </CreateTaskDialog>
                            <CreateObjectiveDialog>
                                <Button variant="secondary" className="border border-status-success-light text-status-success hover:bg-status-success-light">
                                    <Target className="h-4 w-4 mr-2" /> Set an Objective
                                </Button>
                            </CreateObjectiveDialog>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                /* Main Content Grid - Activity Stream (2/3) | Focus (1/3) */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Activity Stream (2/3) */}
                    <div className="lg:col-span-2">
                        <ActivityStream 
                            initialItems={activityItems} 
                            initialCounts={activityCounts}
                        />
                    </div>

                    {/* Right Column - Focus & Widgets (1/3) */}
                    <div className="space-y-6">
                        {/* Today's Focus - Prioritized Tasks */}
                        <Card className="bg-background border border-t-2 border-t-international-orange">
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-international-orange/10 rounded-md">
                                        <Target className="h-5 w-5 text-international-orange" />
                                    </div>
                                    <CardTitle className="flex items-center gap-2 font-display text-base text-foreground">
                                        Today's Focus
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-xs">
                                                Tasks prioritized by deadline urgency, approval requirements, and activity level
                                            </TooltipContent>
                                        </Tooltip>
                                    </CardTitle>
                                </div>
                                <CardDescription className="text-xs text-muted-foreground">
                                    Your most important tasks right now
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-0">
                                {myTasks.length === 0 ? (
                                    <EmptyState
                                        icon={<CheckCircle2 className="h-8 w-8 text-muted-foreground" />}
                                        title="No active tasks"
                                        description="Create your first task to get started."
                                        className="py-6"
                                        action={
                                            <CreateTaskDialog
                                                objectives={objectivesForDialog || []}
                                                members={members}
                                                teams={teams}
                                                currentUserId={user.id}
                                            >
                                                <Button size="sm" className="mt-2 bg-international-orange hover:bg-international-orange-hover">
                                                    <Plus className="h-4 w-4 mr-1" /> Create Task
                                                </Button>
                                            </CreateTaskDialog>
                                        }
                                    />
                                ) : (
                                    <DailyPrioritizer tasks={myTasks} maxTasks={5} compact />
                                )}
                            </CardContent>
                        </Card>

                        {/* Daily Standup Widget */}
                        <StandupWidget userRole={profile?.role || undefined} compact />

                        {/* Needs Attention Summary */}
                        <NeedsAttentionSummary
                            overdueCount={overdueCount || 0}
                            approvalsCount={isExecutiveOrFounder ? (approvalsCount || 0) : 0}
                            blockersCount={isExecutiveOrFounder ? (blockersCount || 0) : 0}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

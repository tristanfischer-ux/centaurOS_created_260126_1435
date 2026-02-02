import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { CreateTaskDialog } from "../tasks/create-task-dialog"
import { CreateObjectiveDialog } from "../objectives/create-objective-dialog"
import { DailyPrioritizer } from "@/components/DailyPrioritizer"
import { DailyPulseWidget } from "@/components/reports/DailyPulseWidget"
import Link from "next/link"
import {
    Sun,
    CheckCircle2,
    AlertTriangle,
    Clock,
    Target,
    ArrowRight,
    Plus,
    HelpCircle,
    Inbox,
    AlertCircle,
    Users,
    Sparkles
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getInitials, cn, formatStatus } from "@/lib/utils"
import { typography } from "@/lib/design-system"

interface TodayTask {
    id: string
    title: string
    description: string | null
    status: "Pending" | "Accepted" | "Rejected" | "Amended" | "Amended_Pending_Approval" | "Completed" | "Pending_Peer_Review" | "Pending_Executive_Approval"
    start_date: string | null
    end_date: string | null
    created_at: string
    updated_at: string
    risk_level: string | null
    task_number?: number
    assignee?: {
        id: string
        full_name: string | null
        role: string | null
        email: string
        avatar_url?: string | null
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

interface BlockerStandup {
    id: string
    blockers: string
    blocker_severity: string | null
    needs_help: boolean
    user: {
        id: string
        full_name: string | null
        role: string | null
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
    const isExecutiveOrFounder = profile?.role === 'Executive' || profile?.role === 'Founder'
    const foundryId = profile?.foundry_id

    // Get current time for greeting
    const hour = new Date().getHours()
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

    // --- PARALLEL DATA FETCHING ---

    // 1. Decisions Pending (tasks needing executive approval)
    const pendingDecisionsPromise = supabase
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
            creator:profiles!creator_id(id, full_name),
            objective:objectives!objective_id(id, title)
        `)
        .in('status', ['Pending_Executive_Approval', 'Amended_Pending_Approval'])
        .order('created_at', { ascending: false })
        .limit(10)

    // 2. Blockers Reported (from today's standups)
    const today = new Date().toISOString().split('T')[0]
    const blockersPromise = supabase
        .from('standups')
        .select(`
            id,
            blockers,
            blocker_severity,
            needs_help,
            user:profiles!standups_user_id_fkey(id, full_name, role)
        `)
        .eq('standup_date', today)
        .not('blockers', 'is', null)
        .order('blocker_severity', { ascending: false })

    // 3. Overdue Tasks
    const now = new Date()
    const overduePromise = supabase
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
        .not('end_date', 'is', null)
        .lt('end_date', now.toISOString())
        .neq('status', 'Completed')
        .order('end_date', { ascending: true })
        .limit(10)

    // 4. All active tasks for prioritization (user's tasks)
    // Get task IDs from task_assignees table first
    const { data: assignedTaskIds } = await supabase
        .from('task_assignees')
        .select('task_id')
        .eq('profile_id', user.id)

    const assignedIds = assignedTaskIds?.map(ta => ta.task_id) || []

    let myTasksQuery = supabase
        .from('tasks')
        .select(`
            id,
            title,
            description,
            status,
            start_date,
            end_date,
            created_at,
            updated_at,
            risk_level,
            task_number,
            assignee:profiles!assignee_id(id, full_name, role, email, avatar_url),
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
    const membersPromise = supabase
        .from('profiles')
        .select('id, full_name, role, email')
        .not('email', 'is', null)
        .not('full_name', 'is', null)
    const teamsPromise = supabase.from('teams').select('id, name')

    // Execute all queries in parallel
    const [
        { data: pendingDecisionsData },
        { data: blockersData },
        { data: overdueData },
        { data: myTasksData },
        { data: objectivesForDialog },
        { data: membersData },
        { data: teamsData }
    ] = await Promise.all([
        pendingDecisionsPromise,
        blockersPromise,
        overduePromise,
        myTasksPromise,
        objectivesPromise,
        membersPromise,
        teamsPromise
    ])

    const pendingDecisions = (pendingDecisionsData || []) as unknown as TodayTask[]
    const blockers = (blockersData || []) as unknown as BlockerStandup[]
    const overdueTasks = (overdueData || []) as unknown as TodayTask[]
    const myTasks = (myTasksData || []) as unknown as TodayTask[]
    const members = (membersData || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        role: p.role,
        email: p.email
    }))
    const teams = teamsData || []

    // Calculate summary stats
    const totalActionItems = pendingDecisions.length + blockers.length + overdueTasks.length
    const hasNoItems = totalActionItems === 0 && myTasks.length === 0

    return (
        <div className="space-y-8">
            {/* Header - Morning Briefing */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className={typography.pageHeader}>
                        <div className={typography.pageHeaderAccent} />
                        <h1 className={typography.h1}>
                            {greeting}, {userName}
                        </h1>
                    </div>
                    <p className={typography.pageSubtitle}>
                        Here's your morning briefing
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap shrink-0">
                    <CreateTaskDialog
                        objectives={objectivesForDialog || []}
                        members={members}
                        teams={teams}
                        currentUserId={user.id}
                    >
                        <Button className="bg-international-orange hover:bg-international-orange-hover">
                            <Plus className="h-4 w-4 mr-2" /> New Task
                        </Button>
                    </CreateTaskDialog>
                    <CreateObjectiveDialog />
                </div>
            </div>

            {/* Quick Stats Bar */}
            {totalActionItems > 0 && (
                <div className="flex flex-wrap gap-3">
                    {pendingDecisions.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-status-warning-light border border-status-warning rounded-full">
                            <Inbox className="h-4 w-4 text-status-warning" />
                            <span className="text-sm font-medium text-status-warning-dark">
                                {pendingDecisions.length} decision{pendingDecisions.length !== 1 ? 's' : ''} pending
                            </span>
                        </div>
                    )}
                    {blockers.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-status-error-light border border-status-error rounded-full">
                            <AlertTriangle className="h-4 w-4 text-status-error" />
                            <span className="text-sm font-medium text-status-error-dark">
                                {blockers.length} blocker{blockers.length !== 1 ? 's' : ''} reported
                            </span>
                        </div>
                    )}
                    {overdueTasks.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-status-error-light border border-status-error rounded-full">
                            <Clock className="h-4 w-4 text-status-error" />
                            <span className="text-sm font-medium text-status-error-dark">
                                {overdueTasks.length} task{overdueTasks.length !== 1 ? 's' : ''} overdue
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* No Action Items - Completely Empty State */}
            {hasNoItems && (
                <Card className="bg-gradient-to-br from-status-success-light to-status-info-light border">
                    <CardContent className="py-12 text-center">
                        <div className="inline-flex p-4 bg-background rounded-full mb-4">
                            <CheckCircle2 className="h-8 w-8 text-status-success" />
                        </div>
                        <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                            All clear!
                        </h3>
                        <p className="text-muted-foreground max-w-md mx-auto mb-6">
                            You don't have any tasks yet. Create your first task or objective to get started.
                        </p>
                        <div className="flex flex-wrap justify-center gap-3">
                            <CreateTaskDialog
                                objectives={objectivesForDialog || []}
                                members={members}
                                teams={teams}
                                currentUserId={user.id}
                            >
                                <Button className="bg-international-orange hover:bg-international-orange-hover">
                                    <Plus className="h-4 w-4 mr-2" /> Create Task
                                </Button>
                            </CreateTaskDialog>
                            <CreateObjectiveDialog />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Main Content - Two Column Layout */}
            {!hasNoItems && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Action Items (2/3) */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Decisions Pending */}
                        {isExecutiveOrFounder && pendingDecisions.length > 0 && (
                            <Card className="bg-background border-t-2 border-t-status-warning">
                                <CardHeader>
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-status-warning-light rounded-md">
                                            <Inbox className="h-5 w-5 text-status-warning" />
                                        </div>
                                        <CardTitle className="font-display text-foreground">Decisions Pending</CardTitle>
                                    </div>
                                    <CardDescription className="text-muted-foreground">
                                        Tasks waiting for your approval
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {pendingDecisions.slice(0, 5).map((task) => (
                                        <Link key={task.id} href="/tasks" className="block">
                                            <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted transition-colors group">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate group-hover:text-status-warning-dark">
                                                        {task.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1 text-xs">
                                                        {task.assignee?.full_name && (
                                                            <span className="text-muted-foreground">
                                                                {task.assignee.full_name}
                                                            </span>
                                                        )}
                                                        {task.creator?.full_name && (
                                                            <span className="text-muted-foreground">
                                                                • Requested by {task.creator.full_name}
                                                            </span>
                                                        )}
                                                        <span className="text-muted-foreground">
                                                            • {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                </div>
                                                <Badge className="bg-status-warning-light text-status-warning-dark border-status-warning capitalize text-xs">
                                                    {formatStatus(task.status)}
                                                </Badge>
                                            </div>
                                        </Link>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {/* Blockers Reported */}
                        {isExecutiveOrFounder && blockers.length > 0 && (
                            <Card className="bg-background border-t-2 border-t-status-error">
                                <CardHeader>
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-status-error-light rounded-md">
                                            <AlertTriangle className="h-5 w-5 text-status-error" />
                                        </div>
                                        <CardTitle className="font-display text-foreground">Blockers Reported</CardTitle>
                                    </div>
                                    <CardDescription className="text-muted-foreground">
                                        Team members who need help
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {blockers.map((standup) => (
                                        <div key={standup.id} className="p-3 rounded-lg border border-status-error-light bg-status-error-light/30">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarFallback className="text-xs bg-muted">
                                                            {getInitials(standup.user.full_name || 'U')}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-sm font-medium text-foreground">
                                                        {standup.user.full_name}
                                                    </span>
                                                </div>
                                                {standup.blocker_severity && (
                                                    <Badge className="bg-status-error text-status-error-foreground text-xs capitalize">
                                                        {standup.blocker_severity}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-foreground">
                                                {standup.blockers}
                                            </p>
                                            {standup.needs_help && (
                                                <div className="flex items-center gap-1 mt-2 text-xs text-status-error">
                                                    <AlertCircle className="h-3 w-3" />
                                                    <span>Requesting help</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {/* Overdue Tasks */}
                        {overdueTasks.length > 0 && (
                            <Card className="bg-background border-t-2 border-t-status-error">
                                <CardHeader>
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-status-error-light rounded-md">
                                            <Clock className="h-5 w-5 text-status-error" />
                                        </div>
                                        <CardTitle className="font-display text-foreground">Overdue Tasks</CardTitle>
                                    </div>
                                    <CardDescription className="text-muted-foreground">
                                        Tasks that need immediate attention
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {overdueTasks.slice(0, 5).map((task) => (
                                        <Link key={task.id} href="/tasks" className="block">
                                            <div className="flex items-center justify-between p-3 rounded-lg border border-status-error bg-status-error-light/30 hover:bg-status-error-light transition-colors group">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate group-hover:text-status-error-dark">
                                                        {task.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1 text-xs">
                                                        <span className="text-status-error font-medium">
                                                            Due {formatDistanceToNow(new Date(task.end_date!), { addSuffix: true })}
                                                        </span>
                                                        {task.assignee?.full_name && (
                                                            <span className="text-muted-foreground">
                                                                • {task.assignee.full_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Badge className="bg-status-error-light text-status-error-dark border-status-error capitalize text-xs">
                                                    {formatStatus(task.status)}
                                                </Badge>
                                            </div>
                                        </Link>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {/* No Action Items State - Show when left column would be empty */}
                        {!(isExecutiveOrFounder && pendingDecisions.length > 0) && 
                         !(isExecutiveOrFounder && blockers.length > 0) && 
                         overdueTasks.length === 0 && (
                            <Card className="bg-gradient-to-br from-status-info-light to-status-success-light border">
                                <CardContent className="py-12 text-center">
                                    <div className="inline-flex p-4 bg-background rounded-full mb-4">
                                        <CheckCircle2 className="h-8 w-8 text-status-success" />
                                    </div>
                                    <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                                        All on track
                                    </h3>
                                    <p className="text-muted-foreground max-w-md mx-auto mb-6">
                                        No urgent items need your attention right now. Check your focus tasks on the right, or explore these quick actions.
                                    </p>
                                    <div className="flex flex-wrap justify-center gap-3">
                                        <Link href="/objectives">
                                            <Button variant="secondary">
                                                <Target className="h-4 w-4 mr-2" /> View Objectives
                                            </Button>
                                        </Link>
                                        <Link href="/tasks">
                                            <Button variant="secondary">
                                                <CheckCircle2 className="h-4 w-4 mr-2" /> All Tasks
                                            </Button>
                                        </Link>
                                        <Link href="/team">
                                            <Button variant="secondary">
                                                <Users className="h-4 w-4 mr-2" /> Team
                                            </Button>
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Right Column - Today's Focus (1/3) */}
                    <div className="space-y-6">
                        {/* Daily Pulse Widget */}
                        {foundryId && (
                            <DailyPulseWidget 
                                userId={user.id}
                                userRole={profile?.role}
                                foundryId={foundryId}
                            />
                        )}

                        {/* Today's Focus - Prioritized Tasks */}
                        <Card className="bg-background border-t-2 border-t-international-orange">
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-international-orange/10 rounded-md">
                                        <Target className="h-5 w-5 text-international-orange" />
                                    </div>
                                    <CardTitle className="flex items-center gap-2 font-display text-foreground">
                                        Today's Focus
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-xs">
                                                Tasks prioritized by deadline urgency, approval requirements, and activity level
                                            </TooltipContent>
                                        </Tooltip>
                                    </CardTitle>
                                </div>
                                <CardDescription className="text-muted-foreground">
                                    Your most important tasks right now
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {myTasks.length === 0 ? (
                                    <EmptyState
                                        icon={<CheckCircle2 className="h-10 w-10 text-muted-foreground" />}
                                        title="No active tasks"
                                        description="Create your first task to get started."
                                        action={
                                            <CreateTaskDialog
                                                objectives={objectivesForDialog || []}
                                                members={members}
                                                teams={teams}
                                                currentUserId={user.id}
                                            >
                                                <Button className="mt-4 bg-international-orange hover:bg-international-orange-hover">
                                                    <Plus className="h-4 w-4 mr-2" /> Create Task
                                                </Button>
                                            </CreateTaskDialog>
                                        }
                                    />
                                ) : (
                                    <DailyPrioritizer 
                                        tasks={myTasks} 
                                        maxTasks={5}
                                        members={members}
                                        currentUserId={user.id}
                                    />
                                )}
                            </CardContent>
                        </Card>

                        {/* Quick Links */}
                        <Card className="bg-background border">
                            <CardHeader className="pb-3">
                                <CardTitle className="font-display text-foreground">Quick Links</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Link href="/tasks" className="block">
                                    <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted">
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        All Tasks
                                    </Button>
                                </Link>
                                <Link href="/objectives" className="block">
                                    <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted">
                                        <Target className="h-4 w-4 mr-2" />
                                        Objectives
                                    </Button>
                                </Link>
                                <Link href="/team" className="block">
                                    <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted">
                                        <Users className="h-4 w-4 mr-2" />
                                        Team
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    )
}

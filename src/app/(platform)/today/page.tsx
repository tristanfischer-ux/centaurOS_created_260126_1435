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
import { ActionItemsLegend } from "@/components/today/action-items-legend"
import { getMentionsForUser } from "@/actions/tasks"
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
    Sparkles,
    AtSign,
    MessageSquare
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { UserAvatar } from "@/components/ui/user-avatar"
import { cn, formatStatus } from "@/lib/utils"

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

interface Mention {
    id: string
    content: string
    created_at: string
    task_id: string
    user_id: string
    task: {
        id: string
        title: string
        task_number: number
        status: string
    } | null
    author: {
        id: string
        full_name: string | null
        avatar_url: string | null
    } | null
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

    // Get current time for greeting
    const hour = new Date().getHours()
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
    const briefingTime = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

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
    
    // 6. Mentions - where someone @mentioned this user in a note
    const mentionsPromise = getMentionsForUser(10)

    // Execute all queries in parallel
    const [
        { data: pendingDecisionsData },
        { data: blockersData },
        { data: overdueData },
        { data: myTasksData },
        { data: objectivesForDialog },
        { data: membersData },
        { data: teamsData },
        mentionsResult
    ] = await Promise.all([
        pendingDecisionsPromise,
        blockersPromise,
        overduePromise,
        myTasksPromise,
        objectivesPromise,
        membersPromise,
        teamsPromise,
        mentionsPromise
    ])

    const pendingDecisions = (pendingDecisionsData || []) as unknown as TodayTask[]
    const blockers = (blockersData || []) as unknown as BlockerStandup[]
    const overdueTasks = (overdueData || []) as unknown as TodayTask[]
    const myTasks = (myTasksData || []) as unknown as TodayTask[]
    const mentions = (mentionsResult?.data || []) as unknown as Mention[]
    const members = (membersData || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        role: p.role,
        email: p.email
    }))
    const teams = teamsData || []

    // Calculate summary stats
    const totalActionItems = pendingDecisions.length + blockers.length + overdueTasks.length + mentions.length
    const hasNoItems = totalActionItems === 0 && myTasks.length === 0

    return (
        <div className="space-y-8">
            {/* Header - Morning Briefing */}
            <div className="flex flex-col fold:flex-row fold:items-center fold:justify-between gap-3 xs:gap-4 pb-6 border-b border">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-gradient-to-br from-international-orange/10 to-electric-blue/10 rounded-xl">
                            <Sun className="h-6 w-6 text-international-orange" />
                        </div>
                        <div>
                            <h1 className="text-2xl xs:text-3xl sm:text-4xl font-display font-semibold text-foreground tracking-tight">
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
                    <CreateObjectiveDialog />
                </div>
            </div>

            {/* Quick Stats Bar */}
            {totalActionItems > 0 && (
                <div className="flex flex-wrap gap-3">
                    {pendingDecisions.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
                            <Inbox className="h-4 w-4 text-amber-600" />
                            <span className="text-sm font-medium text-amber-700">
                                {pendingDecisions.length} decision{pendingDecisions.length !== 1 ? 's' : ''} pending
                            </span>
                        </div>
                    )}
                    {blockers.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            <span className="text-sm font-medium text-red-700">
                                {blockers.length} blocker{blockers.length !== 1 ? 's' : ''} reported
                            </span>
                        </div>
                    )}
                    {overdueTasks.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full">
                            <Clock className="h-4 w-4 text-red-600" />
                            <span className="text-sm font-medium text-red-700">
                                {overdueTasks.length} overdue item{overdueTasks.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                    {mentions.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border rounded-full">
                            <AtSign className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-700">
                                {mentions.length} mention{mentions.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Action Items Legend */}
            {totalActionItems > 0 && (
                <ActionItemsLegend className="pt-2 pb-4" />
            )}

            {/* All Clear State */}
            {hasNoItems && (
                <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
                    <CardContent className="py-12 text-center">
                        <div className="inline-flex p-4 bg-white/80 rounded-full mb-4">
                            <Sparkles className="h-8 w-8 text-emerald-500" />
                        </div>
                        <h3 className="text-xl font-display font-semibold text-emerald-900 mb-2">
                            All clear!
                        </h3>
                        <p className="text-emerald-700 max-w-md mx-auto mb-6">
                            No pending decisions, blockers, or overdue items. You're in great shape!
                        </p>
                        <div className="flex justify-center gap-3">
                            <CreateTaskDialog
                                objectives={objectivesForDialog || []}
                                members={members}
                                teams={teams}
                                currentUserId={user.id}
                            >
                                <Button variant="secondary" className="border border-emerald-300 text-emerald-700 hover:bg-emerald-100 bg-transparent">
                                    <Plus className="h-4 w-4 mr-2" /> Create a Task
                                </Button>
                            </CreateTaskDialog>
                            <CreateObjectiveDialog>
                                <Button variant="secondary" className="border border-emerald-300 text-emerald-700 hover:bg-emerald-100 bg-transparent">
                                    <Target className="h-4 w-4 mr-2" /> Set an Objective
                                </Button>
                            </CreateObjectiveDialog>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Main Content Grid */}
            {!hasNoItems && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Action Items (2/3) */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Decisions Pending */}
                        {isExecutiveOrFounder && pendingDecisions.length > 0 && (
                            <Card className="bg-background border border-l-4 border-l-amber-500">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-amber-50 rounded-md">
                                                <Inbox className="h-5 w-5 text-amber-600" />
                                            </div>
                                            <CardTitle className="font-display text-lg text-foreground">
                                                Decisions Pending
                                            </CardTitle>
                                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                                                {pendingDecisions.length}
                                            </Badge>
                                        </div>
                                        <Link href="/tasks?status=Pending_Executive_Approval">
                                            <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 font-medium group">
                                                Review All <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                                            </Button>
                                        </Link>
                                    </div>
                                    <CardDescription className="text-muted-foreground">
                                        Tasks awaiting your approval
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {pendingDecisions.slice(0, 5).map((task) => (
                                        <Link key={task.id} href="/tasks" className="block">
                                            <div className="flex items-center justify-between p-3 rounded-lg border border-amber-100 bg-amber-50/30 hover:bg-amber-50 transition-colors group">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate group-hover:text-amber-900">
                                                        {task.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                                        {task.objective?.title && (
                                                            <span className="flex items-center text-amber-700">
                                                                <Target className="h-3 w-3 mr-1" />
                                                                {task.objective.title}
                                                            </span>
                                                        )}
                                                        <span>from {task.creator?.full_name || 'Unknown'}</span>
                                                    </div>
                                                </div>
                                                <Badge className={cn(
                                                    "ml-2 capitalize text-xs",
                                                    task.risk_level === 'High' ? "bg-red-100 text-red-700 border-red-200" :
                                                    task.risk_level === 'Medium' ? "bg-amber-100 text-amber-700 border-amber-200" :
                                                    "bg-foundry-100 text-foundry-600 border"
                                                )}>
                                                    {task.risk_level || 'Low'} Risk
                                                </Badge>
                                            </div>
                                        </Link>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {/* Blockers Reported */}
                        {isExecutiveOrFounder && blockers.length > 0 && (
                            <Card className="bg-background border border-l-4 border-l-red-500">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-red-50 rounded-md">
                                                <AlertTriangle className="h-5 w-5 text-red-600" />
                                            </div>
                                            <CardTitle className="font-display text-lg text-foreground">
                                                Blockers Reported
                                            </CardTitle>
                                            <Badge variant="secondary" className="bg-red-100 text-red-700 border-red-200">
                                                {blockers.length}
                                            </Badge>
                                        </div>
                                    </div>
                                    <CardDescription className="text-muted-foreground">
                                        Team members who need help today
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {blockers.slice(0, 5).map((standup) => (
                                        <div key={standup.id} className="p-3 rounded-lg border border-red-100 bg-red-50/30">
                                            <div className="flex items-start gap-3">
                                                <UserAvatar 
                                                    name={standup.user?.full_name} 
                                                    role={standup.user?.role} 
                                                    size="md" 
                                                    className="border border-red-200"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-foreground">
                                                            {standup.user?.full_name || 'Team Member'}
                                                        </span>
                                                        {standup.needs_help && (
                                                            <Badge className="bg-red-500 text-white text-[10px] px-1.5">
                                                                Needs Help
                                                            </Badge>
                                                        )}
                                                        {standup.blocker_severity && (
                                                            <Badge variant="outline" className={cn(
                                                                "text-[10px] capitalize",
                                                                standup.blocker_severity === 'critical' ? "border-red-400 text-red-600" :
                                                                standup.blocker_severity === 'high' ? "border-orange-400 text-orange-600" :
                                                                "border-foundry-300 text-muted-foreground"
                                                            )}>
                                                                {standup.blocker_severity}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-foundry-600 mt-1 line-clamp-2">
                                                        {standup.blockers}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {/* Overdue Items */}
                        {overdueTasks.length > 0 && (
                            <Card className="bg-background border border-l-4 border-l-red-500">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-red-50 rounded-md">
                                                <AlertCircle className="h-5 w-5 text-red-600" />
                                            </div>
                                            <CardTitle className="font-display text-lg text-foreground">
                                                Overdue Items
                                            </CardTitle>
                                            <Badge variant="secondary" className="bg-red-100 text-red-700 border-red-200">
                                                {overdueTasks.length}
                                            </Badge>
                                        </div>
                                        <Link href="/tasks">
                                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 font-medium group">
                                                View All <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                                            </Button>
                                        </Link>
                                    </div>
                                    <CardDescription className="text-muted-foreground">
                                        Tasks past their deadline
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {overdueTasks.slice(0, 5).map((task) => (
                                        <Link key={task.id} href="/tasks" className="block">
                                            <div className="flex items-center justify-between p-3 rounded-lg border border-red-100 bg-red-50/30 hover:bg-red-50 transition-colors group">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate group-hover:text-red-900">
                                                        {task.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1 text-xs">
                                                        <span className="text-red-600 font-medium">
                                                            Due {formatDistanceToNow(new Date(task.end_date!), { addSuffix: true })}
                                                        </span>
                                                        {task.assignee?.full_name && (
                                                            <span className="text-muted-foreground">
                                                                • {task.assignee.full_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Badge className="bg-red-100 text-red-700 border-red-200 capitalize text-xs">
                                                    {formatStatus(task.status)}
                                                </Badge>
                                            </div>
                                        </Link>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {/* Mentions - Someone @mentioned you */}
                        {mentions.length > 0 && (
                            <Card className="bg-background border border-l-4 border-l-blue-500">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-blue-50 rounded-md">
                                                <AtSign className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <CardTitle className="font-display text-lg text-foreground">
                                                Mentions
                                            </CardTitle>
                                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 border">
                                                {mentions.length}
                                            </Badge>
                                        </div>
                                        <Link href="/tasks">
                                            <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium group">
                                                View Tasks <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                                            </Button>
                                        </Link>
                                    </div>
                                    <CardDescription className="text-muted-foreground">
                                        Someone mentioned you in a note
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {mentions.slice(0, 5).map((mention) => (
                                        <Link key={mention.id} href="/tasks" className="block">
                                            <div className="flex items-start gap-3 p-3 rounded-lg border border-blue-100 bg-blue-50/30 hover:bg-blue-50 transition-colors group">
                                                <UserAvatar 
                                                    name={mention.author?.full_name} 
                                                    role={null}
                                                    size="md" 
                                                    className="border border shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-medium text-foreground">
                                                            {mention.author?.full_name || 'Someone'}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatDistanceToNow(new Date(mention.created_at), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    {mention.task && (
                                                        <div className="flex items-center gap-1 text-xs text-blue-700 mb-1">
                                                            <MessageSquare className="h-3 w-3" />
                                                            <span className="font-medium">#{mention.task.task_number}</span>
                                                            <span className="truncate">{mention.task.title}</span>
                                                        </div>
                                                    )}
                                                    <p className="text-sm text-foundry-600 line-clamp-2">
                                                        {mention.content.replace(/@\[[^\]]+\]/g, (match) => {
                                                            // Replace mention placeholders with readable text
                                                            return '@someone'
                                                        })}
                                                    </p>
                                                </div>
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
                            <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border">
                                <CardContent className="py-12 text-center">
                                    <div className="inline-flex p-4 bg-white/80 rounded-full mb-4">
                                        <CheckCircle2 className="h-8 w-8 text-blue-500" />
                                    </div>
                                    <h3 className="text-xl font-display font-semibold text-blue-900 mb-2">
                                        All on track
                                    </h3>
                                    <p className="text-blue-700 max-w-md mx-auto mb-6">
                                        No urgent items need your attention right now. Check your focus tasks on the right, or explore these quick actions.
                                    </p>
                                    <div className="flex flex-wrap justify-center gap-3">
                                        <Link href="/objectives">
                                            <Button variant="secondary" className="border border-blue-300 text-blue-700 hover:bg-blue-100 bg-white/50">
                                                <Target className="h-4 w-4 mr-2" /> View Objectives
                                            </Button>
                                        </Link>
                                        <Link href="/tasks">
                                            <Button variant="secondary" className="border border-blue-300 text-blue-700 hover:bg-blue-100 bg-white/50">
                                                <CheckCircle2 className="h-4 w-4 mr-2" /> All Tasks
                                            </Button>
                                        </Link>
                                        <Link href="/team">
                                            <Button variant="secondary" className="border border-blue-300 text-blue-700 hover:bg-blue-100 bg-white/50">
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
                        {/* Today's Focus - Prioritized Tasks */}
                        <Card className="bg-background border border-t-2 border-t-international-orange">
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-international-orange/10 rounded-md">
                                        <Target className="h-5 w-5 text-international-orange" />
                                    </div>
                                    <CardTitle className="flex items-center gap-2 font-display text-lg text-foreground">
                                        Today's Focus
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <HelpCircle className="h-4 w-4 text-foundry-400" />
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
                                        icon={<CheckCircle2 className="h-10 w-10 text-foundry-300" />}
                                        title="No active tasks"
                                        description="Create your first task to get started."
                                        action={
                                            <CreateTaskDialog
                                                objectives={objectivesForDialog || []}
                                                members={members}
                                                teams={teams}
                                                currentUserId={user.id}
                                            >
                                                <Button size="sm" className="mt-4 bg-international-orange hover:bg-international-orange-hover">
                                                    <Plus className="h-4 w-4 mr-2" /> Create Task
                                                </Button>
                                            </CreateTaskDialog>
                                        }
                                    />
                                ) : (
                                    <DailyPrioritizer tasks={myTasks} maxTasks={5} />
                                )}
                            </CardContent>
                        </Card>

                        {/* Quick Links */}
                        <Card className="bg-background border">
                            <CardHeader className="pb-3">
                                <CardTitle className="font-display text-lg text-foreground">Quick Links</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Link href="/tasks" className="block">
                                    <Button variant="ghost" className="w-full justify-start text-foundry-700 hover:text-foreground hover:bg-foundry-50">
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        All Tasks
                                    </Button>
                                </Link>
                                <Link href="/objectives" className="block">
                                    <Button variant="ghost" className="w-full justify-start text-foundry-700 hover:text-foreground hover:bg-foundry-50">
                                        <Target className="h-4 w-4 mr-2" />
                                        Objectives
                                    </Button>
                                </Link>
                                <Link href="/team" className="block">
                                    <Button variant="ghost" className="w-full justify-start text-foundry-700 hover:text-foreground hover:bg-foundry-50">
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

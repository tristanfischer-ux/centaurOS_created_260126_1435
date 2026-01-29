import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { EmptyState } from "@/components/ui/empty-state"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { CreateTaskDialog } from "../tasks/create-task-dialog"
import { CreateObjectiveDialog } from "../objectives/create-objective-dialog"
import { TeamPulseWidget } from "@/components/dashboard/TeamPulseWidget"
import { PendingApprovalsWidget } from "@/components/dashboard/PendingApprovalsWidget"
import { BlockersWidget } from "@/components/dashboard/BlockersWidget"
import { StandupWidget } from "@/components/StandupWidget"
import Link from "next/link"
import {
    CheckSquare,
    Calendar,
    Clock,
    Target,
    ArrowRight,
    Plus,
    Users,
    ShoppingBag,
    AlertCircle,
    MessageSquare,
    HelpCircle
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getInitials, cn, formatStatus } from "@/lib/utils"

export default async function DashboardPage() {
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

    const userName = profile?.full_name || user.user_metadata?.full_name || user.email || 'User'

    interface DashboardTask {
        id: string
        title: string
        status: "Pending" | "Accepted" | "Rejected" | "Amended" | "Amended_Pending_Approval" | "Completed" | "Pending_Peer_Review" | "Pending_Executive_Approval"
        end_date: string | null
        created_at?: string
        updated_at?: string
        assignee?: {
            id: string
            full_name: string | null
            role: string | null
            email?: string
        }
        objective?: {
            id: string
            title: string
        }
    }

    interface DashboardObjective {
        id: string
        title: string
        progress: number
        status: "on_track" | "at_risk" | "off_track" | "completed" | "cancelled" | "not_started"
        created_at: string
    }

    // Fetch My Tasks (Pending + Accepted, assigned to current user)
    // Get task IDs from task_assignees table first
    const { data: assignedTaskIds } = await supabase
        .from('task_assignees')
        .select('task_id')
        .eq('profile_id', user.id)

    const assignedIds = assignedTaskIds?.map(ta => ta.task_id) || []

    // Fetch tasks where user is assignee (via assignee_id or task_assignees)
    // Build query safely to avoid SQL injection
    let myTasksQuery = supabase
        .from('tasks')
        .select(`
            id,
            title,
            status,
            end_date,
            created_at,
            assignee:profiles!assignee_id(id, full_name, role, email),
            objective:objectives!objective_id(id, title)
        `)
        .in('status', ['Pending', 'Accepted'])

    // Apply filter based on whether user has task_assignees entries
    if (assignedIds.length > 0) {
        // User could be direct assignee OR in task_assignees - use .in() for both
        const allRelevantTaskIds = [...new Set(assignedIds)]
        myTasksQuery = myTasksQuery.or(`assignee_id.eq.${user.id},id.in.(${allRelevantTaskIds.join(',')})`)
    } else {
        // No task_assignees entries, just filter by direct assignment
        myTasksQuery = myTasksQuery.eq('assignee_id', user.id)
    }

    const { data: myTasksData, error: myTasksError } = await myTasksQuery
        .order('created_at', { ascending: false })
        .limit(10)

    if (myTasksError) {
        console.error('Error fetching my tasks:', JSON.stringify(myTasksError, null, 2), 'Message:', myTasksError.message, 'Code:', myTasksError.code)
    }

    const myTasks = (myTasksData || []) as unknown as DashboardTask[]

    // Fetch Upcoming Deadlines (next 7 days)
    const sevenDaysFromNow = new Date()
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
    const now = new Date()

    const { data: upcomingTasksData, error: _upcomingTasksError } = await supabase
        .from('tasks')
        .select(`
            id,
            title,
            status,
            end_date,
            assignee:profiles!assignee_id(id, full_name, role)
        `)
        .not('end_date', 'is', null)
        .lte('end_date', sevenDaysFromNow.toISOString())
        .gte('end_date', now.toISOString())
        .neq('status', 'Completed')
        .order('end_date', { ascending: true })
        .limit(10)

    if (_upcomingTasksError) {
        console.error('Error fetching upcoming tasks:', _upcomingTasksError)
    }

    const upcomingTasks = (upcomingTasksData || []) as unknown as DashboardTask[]

    // Fetch overdue tasks
    const { data: overdueTasksData } = await supabase
        .from('tasks')
        .select(`
            id,
            title,
            status,
            end_date,
            assignee:profiles!assignee_id(id, full_name, role)
        `)
        .not('end_date', 'is', null)
        .lt('end_date', now.toISOString())
        .neq('status', 'Completed')
        .order('end_date', { ascending: true })
        .limit(5)

    const overdueTasks = (overdueTasksData || []) as unknown as DashboardTask[]

    // Fetch Recent Activity (task comments + task updates via updated_at)
    const { data: recentComments } = await supabase
        .from('task_comments')
        .select(`
            id,
            content,
            created_at,
            is_system_log,
            task_id,
            user:profiles!task_comments_user_id_fkey(id, full_name, role),
            task:tasks!task_comments_task_id_fkey(id, title)
        `)
        .eq('is_system_log', false)
        .order('created_at', { ascending: false })
        .limit(10)

    // Fetch recently updated tasks (for activity feed)
    const { data: recentTasksData } = await supabase
        .from('tasks')
        .select(`
            id,
            title,
            status,
            updated_at,
            assignee:profiles!assignee_id(id, full_name, role)
        `)
        .not('updated_at', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(10)

    const recentTasks = (recentTasksData || []) as unknown as DashboardTask[]

    // Fetch Active Objectives with progress
    // Note: objective status uses lowercase values: on_track, at_risk, off_track, completed, cancelled, not_started
    const { data: objectivesData, error: objectivesError } = await supabase
        .from('objectives')
        .select(`
            id,
            title,
            progress,
            status,
            created_at
        `)
        .not('status', 'in', '("completed","cancelled")')
        .order('created_at', { ascending: false })
        .limit(5)

    if (objectivesError) {
        console.error('Error fetching objectives:', JSON.stringify(objectivesError, null, 2), 'Message:', objectivesError.message, 'Code:', objectivesError.code)
    }

    const objectives = (objectivesData || []) as unknown as DashboardObjective[]

    // Fetch data for dialogs
    const objectivesForDialog = await supabase.from('objectives').select('id, title').then(r => r.data || [])
    const membersData = await supabase.from('profiles').select('id, full_name, role, email')
    const members = (membersData.data || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        role: p.role,
        email: p.email
    }))
    const { data: teamsData } = await supabase.from('teams').select('id, name')
    const teams = teamsData || []

    // Combine and sort recent activity
    const recentActivity = [
        ...(recentComments?.map(c => ({
            type: 'comment' as const,
            id: c.id,
            timestamp: c.created_at,
            user: c.user as { id: string, full_name: string | null, role: string } | null,
            content: c.content,
            taskTitle: (c.task as { title: string } | null)?.title || 'Unknown Task',
            taskId: c.task_id
        })) || []),
        ...(recentTasks?.map(t => ({
            type: 'task_update' as const,
            id: t.id,
            timestamp: t.updated_at,
            user: t.assignee as { id: string, full_name: string | null, role: string } | null,
            content: `Task "${t.title}" was updated`,
            taskTitle: t.title,
            taskId: t.id,
            status: t.status
        })) || [])
    ]
        .sort((a, b) => new Date(b.timestamp || '').getTime() - new Date(a.timestamp || '').getTime())
        .slice(0, 10)

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col fold:flex-row fold:items-center fold:justify-between gap-3 xs:gap-4 pb-6 border-b border-blue-200">
                <div className="min-w-0 flex-1">
                    {/* Responsive heading: smaller on Galaxy Fold outer, scales up */}
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl xs:text-3xl sm:text-4xl font-display font-semibold text-foreground tracking-tight truncate">
                            Welcome back, {userName}
                        </h1>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs xs:text-sm sm:text-base font-medium pl-4">
                        Foundry Status: <span className="text-orange-600 font-bold uppercase tracking-wider">Operational</span>
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap shrink-0">
                    <CreateTaskDialog
                        objectives={objectivesForDialog}
                        members={members}
                        teams={teams}
                        currentUserId={user.id}
                    >
                        <Button size="sm" className="font-medium shadow-md">
                            <Plus className="h-4 w-4 mr-2" /> New Task
                        </Button>
                    </CreateTaskDialog>
                    <CreateObjectiveDialog />
                </div>
            </div>

            {/* Remote Team Widgets - Executive/Founder View */}
            {(profile?.role === 'Executive' || profile?.role === 'Founder') && (
                <div className="grid grid-cols-1 xs:grid-cols-2 fold:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                    <TeamPulseWidget members={members} />
                    <PendingApprovalsWidget userRole={profile?.role || ''} />
                    <BlockersWidget userRole={profile?.role || ''} />
                    <StandupWidget userRole={profile?.role} compact />
                </div>
            )}

            {/* Standup for non-executives */}
            {profile?.role !== 'Executive' && profile?.role !== 'Founder' && (
                <StandupWidget userRole={profile?.role} compact />
            )}

            {/* Dashboard Grid - Split Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Main Content - Left Column (2/3) */}
                <div className="lg:col-span-2 space-y-8">

                    {/* My Tasks Section */}
                    <Card className="bg-white border-blue-200 border-t-2 border-t-orange-500">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-orange-50 rounded-md">
                                        <CheckSquare className="h-5 w-5 text-orange-600" />
                                    </div>
                                    <CardTitle className="flex items-center gap-2 font-display text-lg text-slate-900">
                                        My Tasks
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <HelpCircle className="h-4 w-4 text-slate-400" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                Tasks assigned to you that need action
                                            </TooltipContent>
                                        </Tooltip>
                                    </CardTitle>
                                </div>
                                <Link href="/tasks">
                                    <Button variant="ghost" size="sm" className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 font-medium group">
                                        View All <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                                    </Button>
                                </Link>
                            </div>
                            <CardDescription className="text-slate-500">Tasks assigned to you (Pending & Accepted)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!myTasks || myTasks.length === 0 ? (
                                <EmptyState
                                    icon={<CheckSquare className="h-12 w-12 text-slate-300" />}
                                    title="No tasks assigned"
                                    description="You don't have any pending or accepted tasks at the moment."
                                    action={
                                        <CreateTaskDialog
                                            objectives={objectivesForDialog}
                                            members={members}
                                            teams={teams}
                                            currentUserId={user.id}
                                        >
                                            <Button size="sm" className="mt-4">
                                                <Plus className="h-4 w-4 mr-2" /> Create Task
                                            </Button>
                                        </CreateTaskDialog>
                                    }
                                />
                            ) : (
                                <div className="space-y-3">
                                    {myTasks.slice(0, 5).map((task) => (
                                        <div key={task.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-blue-200 bg-slate-50/50 hover:bg-white hover:border-orange-200 hover:shadow-sm transition-all duration-200 group">
                                            <div className="flex items-start gap-3 mb-2 sm:mb-0">
                                                <Badge variant={
                                                    task.status === "Accepted" ? "default" :
                                                        task.status === "Completed" ? "secondary" :
                                                            "secondary"
                                                } className={cn(
                                                    "mt-0.5 capitalize",
                                                    task.status === "Accepted" ? "bg-orange-600 hover:bg-orange-700" :
                                                        task.status === "Completed" ? "bg-slate-200 text-slate-700 hover:bg-slate-300" :
                                                            "border-slate-300 text-slate-500"
                                                )}>
                                                    {formatStatus(task.status)}
                                                </Badge>
                                                <div>
                                                    <h4 className="text-sm font-medium text-slate-900 group-hover:text-orange-900 transition-colors line-clamp-1">{task.title}</h4>
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-slate-500">
                                                        {task.objective?.title && (
                                                            <span className="flex items-center text-orange-700 font-medium">
                                                                <Target className="h-3 w-3 mr-1" />
                                                                {task.objective.title}
                                                            </span>
                                                        )}
                                                        {task.end_date && (
                                                            <span className={cn(
                                                                "flex items-center",
                                                                new Date(task.end_date) < new Date() ? "text-red-500 font-medium" : ""
                                                            )}>
                                                                <Calendar className="h-3 w-3 mr-1" />
                                                                {new Date(task.end_date).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Active Objectives */}
                    <Card className="bg-white border-blue-200">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-orange-50 rounded-md">
                                        <Target className="h-5 w-5 text-orange-600" />
                                    </div>
                                    <CardTitle className="flex items-center gap-2 font-display text-lg text-slate-900">
                                        Active Objectives
                                    </CardTitle>
                                </div>
                                <Link href="/objectives">
                                    <Button variant="ghost" size="sm" className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 font-medium group">
                                        View Strategy <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                                    </Button>
                                </Link>
                            </div>
                            <CardDescription className="text-slate-500">High-level goals for your foundry</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!objectives || objectives.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-blue-200 rounded-lg bg-slate-50/50">
                                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                                        <Target className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <h3 className="text-sm font-medium text-slate-900">No active objectives</h3>
                                    <p className="text-xs text-slate-500 mt-1 max-w-[250px] mb-4">
                                        Set high-level goals for your company to align your team.
                                    </p>
                                    <CreateObjectiveDialog>
                                        <Button variant="secondary" size="sm" className="border-slate-200 hover:border-orange-500 hover:text-orange-700">
                                            Define Objective
                                        </Button>
                                    </CreateObjectiveDialog>
                                </div>
                            ) : (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {objectives.slice(0, 4).map((objective) => (
                                        <div key={objective.id} className="p-5 rounded-lg border border-blue-200 bg-white hover:border-orange-200 hover:shadow-sm transition-all duration-200 group">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-medium text-sm text-slate-900 group-hover:text-orange-900 transition-colors line-clamp-1" title={objective.title}>
                                                    {objective.title}
                                                </h4>
                                                <Badge variant={
                                                    objective.status === "on_track" ? "default" :
                                                        objective.status === "at_risk" ? "destructive" :
                                                            "secondary"
                                                } className={cn(
                                                    "text-[10px] uppercase tracking-wider",
                                                    objective.status === "on_track" ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" :
                                                        objective.status === "at_risk" ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" :
                                                            "bg-slate-100 text-slate-600 border-slate-200"
                                                )}>
                                                    {objective.status.replace('_', ' ')}
                                                </Badge>
                                            </div>

                                            <div className="space-y-1.5 mt-3">
                                                <div className="flex justify-between text-xs text-slate-500">
                                                    <span>Progress</span>
                                                    <span className="font-mono">{objective.progress || 0}%</span>
                                                </div>
                                                <Progress value={objective.progress || 0} className={cn(
                                                    "h-1.5 bg-slate-100",
                                                    objective.status === "at_risk" ? "[&>div]:bg-amber-500" : "[&>div]:bg-orange-500"
                                                )} />
                                            </div>

                                            <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                                                <span className="flex items-center">
                                                    <Clock className="h-3 w-3 mr-1" />
                                                    {new Date(objective.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                </div>

                {/* Sidebar Content - Right Column (1/3) */}
                <div className="space-y-8">

                    {/* Quick Actions */}
                    <Card className="bg-white border-blue-200">
                        <CardHeader>
                            <CardTitle className="font-display text-lg text-slate-900">Quick Actions</CardTitle>
                            <CardDescription className="text-slate-500">Foundry operations</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <CreateTaskDialog
                                objectives={objectivesForDialog}
                                members={members}
                                teams={teams}
                                currentUserId={user.id}
                            >
                                <Button variant="secondary" className="w-full justify-start h-10 border-slate-200 hover:border-orange-500/50 hover:bg-orange-50/50 hover:text-orange-700 transition-all duration-300 group">
                                    <Plus className="h-4 w-4 mr-2 group-hover:text-orange-600" />
                                    Create Task
                                </Button>
                            </CreateTaskDialog>
                            <CreateObjectiveDialog>
                                <Button variant="secondary" className="w-full justify-start h-10 border-slate-200 hover:border-orange-500/50 hover:bg-orange-50/50 hover:text-orange-700 transition-all duration-300 group">
                                    <Target className="h-4 w-4 mr-2 group-hover:text-orange-600" />
                                    Create Objective
                                </Button>
                            </CreateObjectiveDialog>
                            <Link href="/team" className="block">
                                <Button variant="secondary" className="w-full justify-start h-10 border-slate-200 hover:border-orange-500/50 hover:bg-orange-50/50 hover:text-orange-700 transition-all duration-300 group">
                                    <Users className="h-4 w-4 mr-2 group-hover:text-orange-600" />
                                    Invite Team Member
                                </Button>
                            </Link>
                            <Link href="/marketplace" className="block">
                                <Button variant="secondary" className="w-full justify-start h-10 border-slate-200 hover:border-orange-500/50 hover:bg-orange-50/50 hover:text-orange-700 transition-all duration-300 group">
                                    <ShoppingBag className="h-4 w-4 mr-2 group-hover:text-orange-600" />
                                    View Marketplace
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>

                    {/* Upcoming Deadlines */}
                    <Card className="bg-white border-blue-200">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-slate-400" />
                                <CardTitle className="font-display text-lg text-slate-900">
                                    Deadlines
                                </CardTitle>
                            </div>
                            <CardDescription className="text-slate-500">Overdue and upcoming</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {(!overdueTasks?.length && !upcomingTasks?.length) && (
                                <div className="text-center py-4">
                                    <div className="h-10 w-10 mx-auto rounded-full bg-slate-50 flex items-center justify-center mb-2">
                                        <Calendar className="h-5 w-5 text-slate-300" />
                                    </div>
                                    <p className="text-sm text-slate-500">No upcoming deadlines.</p>
                                </div>
                            )}

                            {/* Overdue */}
                            {overdueTasks && overdueTasks.length > 0 && (
                                <div className="space-y-2">
                                    <h5 className="text-xs font-semibold text-red-600 uppercase tracking-wider flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" /> Overdue
                                    </h5>
                                    {overdueTasks.map(task => (
                                        <Link key={task.id} href="/tasks" className="block group">
                                            <div className="p-2.5 rounded border border-red-100 bg-red-50/30 hover:bg-red-50/70 transition-colors">
                                                <p className="text-sm font-medium text-slate-900 truncate group-hover:underline decoration-red-200 underline-offset-2">{task.title}</p>
                                                <p className="text-xs text-red-500 mt-1 font-medium">
                                                    Due {formatDistanceToNow(new Date(task.end_date!), { addSuffix: true })}
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}

                            {/* Upcoming */}
                            {upcomingTasks && upcomingTasks.length > 0 && (
                                <div className="space-y-2">
                                    <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Coming Up</h5>
                                    {upcomingTasks.map(task => (
                                        <Link key={task.id} href="/tasks" className="block group">
                                                <div className="flex items-center justify-between p-2.5 rounded border border-blue-200 bg-white hover:border-orange-200 transition-all">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-slate-700 truncate group-hover:text-orange-800 transition-colors">{task.title}</p>
                                                    <p className="text-xs text-slate-400 mt-0.5">
                                                        {new Date(task.end_date!).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div className="h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_4px_rgba(249,115,22,0.5)]"></div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Recent Activity */}
                    <Card className="bg-white border-blue-200">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-slate-400" />
                                <CardTitle className="font-display text-lg text-slate-900">
                                    Activity
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {recentActivity.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center py-4">No recent activity.</p>
                            ) : (
                                <div className="space-y-4">
                                    {recentActivity.map((activity) => {
                                        const user = activity.user as { full_name: string | null, role: string } | null
                                        return (
                                            <div key={`${activity.type}-${activity.id}`} className="flex gap-3 text-sm">
                                                <Avatar className="h-8 w-8 shrink-0 border border-slate-100">
                                                    <AvatarFallback className="text-xs bg-slate-50 text-slate-500 font-medium">
                                                        {getInitials(user?.full_name || 'U')}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0 space-y-0.5">
                                                    <div className="flex items-baseline justify-between gap-2">
                                                        <span className="font-medium text-slate-900">{user?.full_name || 'User'}</span>
                                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                                            {formatDistanceToNow(new Date(activity.timestamp || ''), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    <p className="text-slate-600 leading-snug line-clamp-2">
                                                        {activity.content}
                                                    </p>
                                                    <p className="text-xs text-orange-600 font-medium truncate">
                                                        {activity.taskTitle}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                </div>
            </div>
        </div>
    )
}

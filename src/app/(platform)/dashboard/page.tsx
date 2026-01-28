import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
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
    CheckCircle2,
    HelpCircle
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getInitials, cn } from "@/lib/utils"

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

    // Fetch My Tasks (Pending + Accepted, assigned to current user)
    // Get task IDs from task_assignees table first
    const { data: assignedTaskIds } = await supabase
        .from('task_assignees')
        .select('task_id')
        .eq('profile_id', user.id)

    const assignedIds = assignedTaskIds?.map(ta => ta.task_id) || []
    
    // Fetch tasks where user is assignee (via assignee_id or task_assignees)
    // Build query safely to avoid SQL injection - use conditional chaining instead of string interpolation
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
        myTasksQuery = myTasksQuery.or(`assignee_id.eq.${user.id},id.in.(${allRelevantTaskIds.map(id => `"${id}"`).join(',')})`)
    } else {
        // No task_assignees entries, just filter by direct assignment
        myTasksQuery = myTasksQuery.eq('assignee_id', user.id)
    }
    
    const { data: myTasks } = await myTasksQuery
        .order('created_at', { ascending: false })
        .limit(10)

    // Fetch Upcoming Deadlines (next 7 days)
    const sevenDaysFromNow = new Date()
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
    const now = new Date()

    const { data: upcomingTasks } = await supabase
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
        .order('end_date', { ascending: true })
        .limit(10)

    // Fetch overdue tasks
    const { data: overdueTasks } = await supabase
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
    const { data: recentTasks } = await supabase
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

    // Fetch Active Objectives with progress
    const { data: objectives } = await supabase
        .from('objectives')
        .select(`
            id,
            title,
            progress,
            status,
            created_at
        `)
        .neq('status', 'Completed')
        .order('created_at', { ascending: false })
        .limit(5)

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
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Welcome back, {userName}</h1>
                    <p className="text-muted-foreground mt-1">Here's what's happening with your work</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <CreateTaskDialog 
                        objectives={objectivesForDialog}
                        members={members}
                        teams={teams}
                        currentUserId={user.id}
                    >
                        <Button size="sm" variant="primary">
                            <Plus className="h-4 w-4" /> New Task
                        </Button>
                    </CreateTaskDialog>
                    <CreateObjectiveDialog />
                </div>
            </div>

            {/* Remote Team Widgets - Executive/Founder View */}
            {(profile?.role === 'Executive' || profile?.role === 'Founder') && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* My Tasks Section */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CheckSquare className="h-5 w-5 text-muted-foreground" />
                                <CardTitle className="flex items-center gap-2">
                                    My Tasks
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            Tasks assigned to you that need action
                                        </TooltipContent>
                                    </Tooltip>
                                </CardTitle>
                            </div>
                            <Link href="/tasks">
                                <Button variant="ghost" size="sm">
                                    View All <ArrowRight className="h-4 w-4 ml-1" />
                                </Button>
                            </Link>
                        </div>
                        <CardDescription>Tasks assigned to you (Pending & Accepted)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!myTasks || myTasks.length === 0 ? (
                            <EmptyState
                                icon={<CheckSquare className="h-12 w-12" />}
                                title="No tasks assigned"
                                description="You don't have any pending or accepted tasks at the moment."
                                action={
                                    <CreateTaskDialog 
                                        objectives={objectivesForDialog}
                                        members={members}
                                        teams={teams}
                                        currentUserId={user.id}
                                    >
                                        <Button size="sm" variant="primary">
                                            <Plus className="h-4 w-4" /> Create Task
                                        </Button>
                                    </CreateTaskDialog>
                                }
                            />
                        ) : (
                            <div className="space-y-3">
                                {myTasks.slice(0, 5).map((task) => {
                                    const assignee = task.assignee as { full_name: string | null, role: string } | null
                                    const objective = task.objective as { title: string } | null
                                    const isOverdue = task.end_date ? new Date(task.end_date) < new Date() : false
                                    const isDueSoon = task.end_date && !isOverdue ? (() => {
                                        const endDate = new Date(task.end_date)
                                        const hoursUntilDue = (endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60)
                                        return hoursUntilDue <= 24 && hoursUntilDue > 0
                                    })() : false

                                    return (
                                        <Link 
                                            key={task.id} 
                                            href={`/tasks`}
                                            className="block p-3 rounded-lg bg-muted/30 hover:bg-accent/50 active:bg-accent transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h4 className="font-medium text-foreground truncate">{task.title}</h4>
                                                        <Badge 
                                                            variant={task.status === 'Accepted' ? 'default' : 'secondary'}
                                                            className="text-xs shrink-0"
                                                        >
                                                            {task.status}
                                                        </Badge>
                                                    </div>
                                                    {objective && (
                                                        <p className="text-xs text-muted-foreground mb-1">
                                                            Objective: {objective.title}
                                                        </p>
                                                    )}
                                                    {task.end_date && (
                                                        <div className="flex items-center gap-1 text-xs">
                                                            <Clock className="h-3 w-3 text-muted-foreground" />
                                                            <span className={cn(
                                                                "text-muted-foreground",
                                                                isOverdue && "text-red-600 font-medium",
                                                                isDueSoon && !isOverdue && "text-amber-600 font-medium"
                                                            )}>
                                                                {isOverdue 
                                                                    ? `Overdue: ${formatDistanceToNow(new Date(task.end_date), { addSuffix: true })}`
                                                                    : `Due ${formatDistanceToNow(new Date(task.end_date), { addSuffix: true })}`
                                                                }
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                        <CardDescription>Common tasks and shortcuts</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <CreateTaskDialog 
                            objectives={objectivesForDialog}
                            members={members}
                            teams={teams}
                            currentUserId={user.id}
                        >
                            <Button variant="outline" className="w-full justify-start">
                                <Plus className="h-4 w-4 mr-2" />
                                Create Task
                            </Button>
                        </CreateTaskDialog>
                        <CreateObjectiveDialog>
                            <Button variant="outline" className="w-full justify-start">
                                <Target className="h-4 w-4 mr-2" />
                                Create Objective
                            </Button>
                        </CreateObjectiveDialog>
                        <Link href="/team">
                            <Button variant="outline" className="w-full justify-start">
                                <Users className="h-4 w-4 mr-2" />
                                Invite Team Member
                            </Button>
                        </Link>
                        <Link href="/marketplace">
                            <Button variant="outline" className="w-full justify-start">
                                <ShoppingBag className="h-4 w-4 mr-2" />
                                View Marketplace
                            </Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* Upcoming Deadlines */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-muted-foreground" />
                                <CardTitle className="flex items-center gap-2">
                                    Upcoming Deadlines
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            Tasks due in the next 7 days, including overdue items
                                        </TooltipContent>
                                    </Tooltip>
                                </CardTitle>
                            </div>
                            <Link href="/tasks">
                                <Button variant="ghost" size="sm">
                                    View All <ArrowRight className="h-4 w-4 ml-1" />
                                </Button>
                            </Link>
                        </div>
                        <CardDescription>Tasks due in the next 7 days</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {(!upcomingTasks || upcomingTasks.length === 0) && (!overdueTasks || overdueTasks.length === 0) ? (
                            <EmptyState
                                icon={<Calendar className="h-8 w-8" />}
                                title="No upcoming deadlines"
                                description="You don't have any tasks due in the next 7 days."
                            />
                        ) : (
                            <div className="space-y-3">
                                {/* Overdue Tasks */}
                                {overdueTasks && overdueTasks.length > 0 && (
                                    <div className="mb-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertCircle className="h-4 w-4 text-red-600" />
                                            <h4 className="text-sm font-semibold text-red-600">Overdue</h4>
                                        </div>
                                        <div className="space-y-2">
                                            {overdueTasks.map((task) => {
                                                const assignee = task.assignee as { full_name: string | null, role: string } | null
                                                return (
                                                <Link 
                                                    key={task.id} 
                                                    href={`/tasks`}
                                                    className="block p-3 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="font-medium text-foreground truncate mb-1">{task.title}</h4>
                                                                <div className="flex items-center gap-1 text-xs text-red-600">
                                                                    <Clock className="h-3 w-3" />
                                                                    <span>Overdue: {formatDistanceToNow(new Date(task.end_date!), { addSuffix: true })}</span>
                                                                </div>
                                                            </div>
                                                            <Badge variant="destructive" className="shrink-0">Overdue</Badge>
                                                        </div>
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                                
                                {/* Upcoming Tasks */}
                                {upcomingTasks && upcomingTasks.length > 0 && (
                                    <div className="space-y-2">
                                        {upcomingTasks.map((task) => {
                                            const assignee = task.assignee as { full_name: string | null, role: string } | null
                                            const isDueSoon = task.end_date ? (() => {
                                                const endDate = new Date(task.end_date)
                                                const hoursUntilDue = (endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60)
                                                return hoursUntilDue <= 24 && hoursUntilDue > 0
                                            })() : false

                                            return (
                                                <Link 
                                                    key={task.id} 
                                                    href={`/tasks`}
                                                    className="block p-3 rounded-lg bg-muted/30 hover:bg-accent/50 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="font-medium text-foreground truncate mb-1">{task.title}</h4>
                                                            <div className="flex items-center gap-1 text-xs">
                                                                <Clock className="h-3 w-3 text-muted-foreground" />
                                                                <span className={isDueSoon ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}>
                                                                    Due {formatDistanceToNow(new Date(task.end_date!), { addSuffix: true })}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {isDueSoon && (
                                                            <Badge variant="warning" className="shrink-0">Due Soon</Badge>
                                                        )}
                                                    </div>
                                                </Link>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Objectives Progress */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Target className="h-5 w-5 text-muted-foreground" />
                                <CardTitle className="flex items-center gap-2">
                                    Objectives
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            Active objectives and their completion progress
                                        </TooltipContent>
                                    </Tooltip>
                                </CardTitle>
                            </div>
                            <Link href="/objectives">
                                <Button variant="ghost" size="sm">
                                    View All <ArrowRight className="h-4 w-4 ml-1" />
                                </Button>
                            </Link>
                        </div>
                        <CardDescription>Active objectives progress</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!objectives || objectives.length === 0 ? (
                            <EmptyState
                                icon={<Target className="h-12 w-12" />}
                                title="No active objectives"
                                description="Create an objective to track your progress."
                                action={
                                    <CreateObjectiveDialog>
                                        <Button size="sm" variant="primary">
                                            <Plus className="h-4 w-4" /> Create Objective
                                        </Button>
                                    </CreateObjectiveDialog>
                                }
                            />
                        ) : (
                            <div className="space-y-4">
                                {objectives.map((objective) => (
                                    <Link 
                                        key={objective.id} 
                                        href={`/objectives/${objective.id}`}
                                        className="block"
                                    >
                                        <div className="space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <h4 className="font-medium text-foreground text-sm line-clamp-2">{objective.title}</h4>
                                                <Badge variant="secondary" className="text-xs shrink-0">
                                                    {objective.progress || 0}%
                                                </Badge>
                                            </div>
                                            <Progress value={objective.progress || 0} className="h-2" />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                                <CardTitle className="flex items-center gap-2">
                                    Recent Activity
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            Latest task updates and comments from your team
                                        </TooltipContent>
                                    </Tooltip>
                                </CardTitle>
                            </div>
                            <Link href="/tasks">
                                <Button variant="ghost" size="sm">
                                    View All <ArrowRight className="h-4 w-4 ml-1" />
                                </Button>
                            </Link>
                        </div>
                        <CardDescription>Latest updates and comments</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {recentActivity.length === 0 ? (
                            <EmptyState
                                icon={<MessageSquare className="h-12 w-12" />}
                                title="No recent activity"
                                description="Activity will appear here as tasks are updated and commented on."
                            />
                        ) : (
                            <div className="space-y-3">
                                {recentActivity.map((activity) => {
                                    const user = activity.user as { full_name: string | null, role: string } | null
                                    return (
                                        <Link 
                                            key={`${activity.type}-${activity.id}`} 
                                            href={`/tasks`}
                                            className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-accent/50 transition-colors"
                                        >
                                            <Avatar className="h-8 w-8 shrink-0">
                                                <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                                                    {getInitials(user?.full_name || 'U')}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-medium text-foreground">
                                                        {user?.full_name || 'Unknown User'}
                                                    </span>
                                                    {activity.type === 'comment' && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            <MessageSquare className="h-3 w-3 mr-1" />
                                                            Comment
                                                        </Badge>
                                                    )}
                                                    {activity.type === 'task_update' && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                                            Update
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground mb-1">
                                                    {activity.type === 'comment' 
                                                        ? activity.content 
                                                        : activity.content
                                                    }
                                                </p>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <span className="truncate">{activity.taskTitle}</span>
                                                    <span>•</span>
                                                    <span>{formatDistanceToNow(new Date(activity.timestamp || ''), { addSuffix: true })}</span>
                                                </div>
                                            </div>
                                        </Link>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

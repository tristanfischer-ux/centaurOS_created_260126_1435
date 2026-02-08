import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { redirect } from 'next/navigation'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, subDays, format } from 'date-fns'
import { DashboardClient } from './dashboard-client'
import type { Database } from '@/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Task = Database['public']['Tables']['tasks']['Row']
type Objective = Database['public']['Tables']['objectives']['Row']

/**
 * Dashboard Home Page - The new command center experience
 * 
 * A beautiful, personalized dashboard that provides:
 * - Welcome hero with daily focus
 * - Smart priority queue
 * - Objective progress cards
 * - Team pulse with live presence
 * - Real-time activity feed
 * - Quick actions panel
 * - Productivity visualizations
 */
export default async function DashboardPage() {
  const supabase = await createClient()
  
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    redirect('/login')
  }
  
  // Get foundry context
  const foundryId = await getFoundryIdCached()
  
  if (!foundryId) {
    redirect('/onboarding')
  }
  
  // Get user profile for personalization
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, foundry_id, avatar_url')
    .eq('id', user.id)
    .single()
  
  const isExecutiveOrFounder = profile?.role === 'Executive' || profile?.role === 'Founder'
  
  // Calculate date ranges
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }) // Monday
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const last7Days = subDays(now, 7)
  const todayStr = now.toISOString().split('T')[0]
  
  // Fetch all dashboard data in parallel
  const [
    myTasksResult,
    myMultiAssignedTaskIdsResult,
    objectivesResult,
    teamPresenceResult,
    recentActivityResult,
    taskCompletionStatsResult,
    overdueTasksResult,
    tasksDueTodayResult,
    tasksDueThisWeekResult,
    blockersResult,
    pendingDecisionsResult,
    unreadCountsResult,
    featuredListingsResult,
  ] = await Promise.all([
    // My current tasks (primary assignee)
    supabase
      .from('tasks')
      .select(`
        id, title, status, start_date, end_date, task_number, created_at,
        objective:objectives!objective_id(id, title, status),
        creator:profiles!creator_id(id, full_name)
      `)
      .eq('foundry_id', foundryId)
      .eq('assignee_id', user.id)
      .not('status', 'in', '("Completed","Rejected")')
      .order('end_date', { ascending: true, nullsFirst: false }),
    
    // My tasks via multi-assignee table (matches get_daily_pulse logic)
    supabase
      .from('task_assignees')
      .select('task_id')
      .eq('profile_id', user.id),
    
    // Active objectives with progress
    supabase
      .from('objectives')
      .select(`
        id, title, description, status, progress, start_date, end_date, created_at, is_strategic_goal,
        creator:profiles!creator_id(id, full_name, avatar_url)
      `)
      .eq('foundry_id', foundryId)
      .in('status', ['Active', 'In_Progress'])
      .order('created_at', { ascending: false })
      .limit(6),
    
    // Team presence and activity
    fetchTeamPresence(supabase, foundryId, user.id),
    
    // Recent activity feed
    fetchRecentActivity(supabase, foundryId, user.id),
    
    // Task completion statistics (last 7 days)
    fetchTaskCompletionStats(supabase, foundryId, user.id, last7Days),
    
    // Overdue tasks (exclude Completed/Rejected to match daily pulse)
    supabase
      .from('tasks')
      .select(`
        id, title, status, end_date, task_number,
        assignee:profiles!assignee_id(id, full_name)
      `)
      .eq('foundry_id', foundryId)
      .not('end_date', 'is', null)
      .lt('end_date', todayStart.toISOString())
      .not('status', 'in', '("Completed","Rejected")')
      .order('end_date', { ascending: true })
      .limit(10),
    
    // Tasks due today (exclude Completed/Rejected to match daily pulse)
    supabase
      .from('tasks')
      .select(`
        id, title, status, end_date, task_number,
        assignee:profiles!assignee_id(id, full_name, avatar_url)
      `)
      .eq('foundry_id', foundryId)
      .gte('end_date', todayStart.toISOString())
      .lte('end_date', todayEnd.toISOString())
      .not('status', 'in', '("Completed","Rejected")')
      .order('end_date', { ascending: true }),
    
    // Tasks due this week (exclude Completed/Rejected to match daily pulse)
    supabase
      .from('tasks')
      .select(`
        id, title, status, end_date, task_number,
        assignee:profiles!assignee_id(id, full_name, avatar_url)
      `)
      .eq('foundry_id', foundryId)
      .gt('end_date', todayEnd.toISOString())
      .lte('end_date', weekEnd.toISOString())
      .not('status', 'in', '("Completed","Rejected")')
      .order('end_date', { ascending: true }),
    
    // Blockers from standups (executives only)
    isExecutiveOrFounder ? supabase
      .from('standups')
      .select(`
        id, blockers, blocker_severity, needs_help,
        user:profiles!standups_user_id_fkey(id, full_name, avatar_url)
      `)
      .eq('standup_date', todayStr)
      .not('blockers', 'is', null)
      .order('blocker_severity', { ascending: false })
    : Promise.resolve({ data: [] }),
    
    // Pending decisions (executives only)
    isExecutiveOrFounder ? supabase
      .from('tasks')
      .select(`
        id, title, status, created_at, task_number,
        creator:profiles!creator_id(id, full_name)
      `)
      .eq('foundry_id', foundryId)
      .in('status', ['Pending_Executive_Approval', 'Amended_Pending_Approval'])
      .order('created_at', { ascending: false })
      .limit(10)
    : Promise.resolve({ data: [] }),
    
    // Unread message counts
    fetchUnreadCounts(supabase, foundryId, user.id),

    // Featured marketplace listings (for Marketplace Spotlight)
    supabase
      .from('marketplace_listings')
      .select('id, title, description, category, subcategory, is_verified, image_url, attributes')
      .eq('is_verified', true)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  // Build workflow template previews from the static templates
  const workflowTemplates = getWorkflowTemplatePreviews()

  // Merge primary-assigned tasks with multi-assigned tasks to get complete "my tasks" list.
  // This matches the logic in get_daily_pulse() which checks both assignee_id AND task_assignees.
  const primaryTasks = myTasksResult.data || []
  const multiAssignedTaskIds = new Set(
    (myMultiAssignedTaskIdsResult.data || []).map(r => r.task_id)
  )
  const primaryTaskIds = new Set(primaryTasks.map(t => t.id))
  const additionalTaskIds = [...multiAssignedTaskIds].filter(id => !primaryTaskIds.has(id))
  
  let myTasks = primaryTasks
  if (additionalTaskIds.length > 0) {
    const { data: additionalTasks } = await supabase
      .from('tasks')
      .select(`
        id, title, status, start_date, end_date, task_number, created_at,
        objective:objectives!objective_id(id, title, status),
        creator:profiles!creator_id(id, full_name)
      `)
      .eq('foundry_id', foundryId)
      .in('id', additionalTaskIds)
      .not('status', 'in', '("Completed","Rejected")')
      .order('end_date', { ascending: true, nullsFirst: false })
    
    myTasks = [...primaryTasks, ...(additionalTasks || [])]
  }

  const objectives = objectivesResult.data || []
  const overdueTasks = overdueTasksResult.data || []
  const tasksDueToday = tasksDueTodayResult.data || []

  // Build a Set of all "my task" IDs for filtering foundry-wide lists
  const allMyTaskIds = new Set(myTasks.map(t => t.id))

  // Filter due-today and overdue to only MY tasks, so the greeting and stat card agree
  const myTasksDueToday = tasksDueToday.filter(t => allMyTaskIds.has(t.id))
  const myOverdueTasks = overdueTasks.filter(t => allMyTaskIds.has(t.id))

  // Generate daily focus using user-specific counts (not foundry-wide)
  const dailyFocus = generateDailyFocus({
    myTaskCount: myTasks.length,
    todayTaskCount: myTasksDueToday.length,
    overdueCount: myOverdueTasks.length,
    objectiveCount: objectives.length,
    unreadCount: unreadCountsResult.total,
  })
  
  return (
    <DashboardClient
      user={{
        id: user.id,
        fullName: profile?.full_name || '',
        role: profile?.role || '',
        avatarUrl: profile?.avatar_url || null
      }}
      foundryId={foundryId}
      myTasks={myTasks}
      objectives={objectives}
      teamPresence={teamPresenceResult}
      recentActivity={recentActivityResult}
      taskCompletionStats={taskCompletionStatsResult}
      overdueTasks={overdueTasks}
      tasksDueToday={tasksDueToday}
      tasksDueThisWeek={tasksDueThisWeekResult.data || []}
      blockers={blockersResult.data || []}
      pendingDecisions={pendingDecisionsResult.data || []}
      unreadCounts={unreadCountsResult}
      isExecutiveOrFounder={isExecutiveOrFounder}
      featuredListings={featuredListingsResult.data || []}
      workflowTemplates={workflowTemplates}
      dailyFocus={dailyFocus}
    />
  )
}

/**
 * Get a curated selection of workflow template previews.
 * These come from the static WORKFLOW_TEMPLATES list.
 */
function getWorkflowTemplatePreviews() {
  // Import the templates inline to avoid circular deps
  // We just need a few representative ones for the preview
  const featured = [
    {
      id: 'seed-round-fundraise',
      name: 'Seed Round Fundraise',
      description: 'The full raise pipeline: from vision to post-raise comms.',
      category: 'startup',
      nodeCount: 8,
      icon: 'TrendingUp',
    },
    {
      id: 'go-to-market-launch',
      name: 'Go-to-Market Launch',
      description: 'Plan and execute a product launch from positioning to post-launch analysis.',
      category: 'marketing',
      nodeCount: 6,
      icon: 'Rocket',
    },
    {
      id: 'hiring-pipeline',
      name: 'Hiring Pipeline',
      description: 'End-to-end hiring from role definition through offer letter.',
      category: 'hiring',
      nodeCount: 5,
      icon: 'Users',
    },
  ]
  return featured
}

/**
 * Generate a contextual daily focus message based on the user's current state.
 * This replaces the generic "Here's what's happening in your foundry today".
 */
function generateDailyFocus({
  myTaskCount,
  todayTaskCount,
  overdueCount,
  objectiveCount,
  unreadCount,
}: {
  myTaskCount: number
  todayTaskCount: number
  overdueCount: number
  objectiveCount: number
  unreadCount: number
}): string {
  // Priority: overdue > due today > general
  if (overdueCount > 0) {
    return `You have ${overdueCount} overdue ${overdueCount === 1 ? 'task' : 'tasks'}. Let's clear those first.`
  }

  if (todayTaskCount > 0 && objectiveCount > 0) {
    return `${todayTaskCount} ${todayTaskCount === 1 ? 'task' : 'tasks'} due today across ${objectiveCount} active ${objectiveCount === 1 ? 'objective' : 'objectives'}.`
  }

  if (todayTaskCount > 0) {
    return `${todayTaskCount} ${todayTaskCount === 1 ? 'task is' : 'tasks are'} due today. Here's your plan.`
  }

  if (myTaskCount > 0 && objectiveCount > 0) {
    return `${myTaskCount} active ${myTaskCount === 1 ? 'task' : 'tasks'} and ${objectiveCount} ${objectiveCount === 1 ? 'objective' : 'objectives'} in progress.`
  }

  if (myTaskCount === 0 && objectiveCount === 0) {
    return 'Your slate is clean. Time to set some objectives and get moving.'
  }

  return `Here's what's happening in your foundry today.`
}

/**
 * Fetch team presence with current tasks
 */
async function fetchTeamPresence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  currentUserId: string
) {
  // Get all team members
  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .eq('foundry_id', foundryId)
    .neq('id', currentUserId)
    .order('full_name')
  
  if (!members || members.length === 0) return []
  
  // Get presence data
  const { data: presenceData } = await supabase
    .from('presence')
    .select('user_id, status, current_task_id, last_seen')
    .in('user_id', members.map(m => m.id))
  
  const presenceMap = new Map(presenceData?.map(p => [p.user_id, p]) || [])
  
  // Get current task details
  const taskIds = presenceData?.filter(p => p.current_task_id).map(p => p.current_task_id!) || []
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, task_number')
    .in('id', taskIds)
  
  const tasksMap = new Map(tasks?.map(t => [t.id, t]) || [])
  
  return members.map(member => {
    const presence = presenceMap.get(member.id)
    const currentTask = presence?.current_task_id ? tasksMap.get(presence.current_task_id) : null
    
    return {
      id: member.id,
      full_name: member.full_name,
      avatar_url: member.avatar_url,
      role: member.role,
      status: presence?.status as 'online' | 'away' | 'focus' | 'offline' || 'offline',
      last_seen: presence?.last_seen || null,
      current_task: currentTask ? {
        id: currentTask.id,
        title: currentTask.title,
        task_number: currentTask.task_number
      } : null
    }
  })
}

/**
 * Fetch recent activity across the foundry
 */
async function fetchRecentActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  currentUserId: string
) {
  const activities: any[] = []
  const cutoffTime = subDays(new Date(), 3).toISOString() // Last 3 days
  
  // Recent tasks created
  const { data: newTasks } = await supabase
    .from('tasks')
    .select(`
      id, title, created_at, task_number,
      creator:profiles!creator_id(id, full_name, avatar_url)
    `)
    .eq('foundry_id', foundryId)
    .gte('created_at', cutoffTime)
    .order('created_at', { ascending: false })
    .limit(10)
  
  newTasks?.forEach(task => {
    activities.push({
      type: 'task_created',
      timestamp: task.created_at,
      task_id: task.id,
      task_title: task.title,
      task_number: task.task_number,
      user: task.creator
    })
  })
  
  // Recent tasks completed
  const { data: completedTasks } = await supabase
    .from('tasks')
    .select(`
      id, title, updated_at, task_number,
      assignee:profiles!assignee_id(id, full_name, avatar_url)
    `)
    .eq('foundry_id', foundryId)
    .eq('status', 'Completed')
    .gte('updated_at', cutoffTime)
    .order('updated_at', { ascending: false })
    .limit(10)
  
  completedTasks?.forEach(task => {
    activities.push({
      type: 'task_completed',
      timestamp: task.updated_at,
      task_id: task.id,
      task_title: task.title,
      task_number: task.task_number,
      user: task.assignee
    })
  })
  
  // Recent objectives created
  const { data: newObjectives } = await supabase
    .from('objectives')
    .select(`
      id, title, created_at,
      creator:profiles!creator_id(id, full_name, avatar_url)
    `)
    .eq('foundry_id', foundryId)
    .gte('created_at', cutoffTime)
    .order('created_at', { ascending: false })
    .limit(5)
  
  newObjectives?.forEach(obj => {
    activities.push({
      type: 'objective_created',
      timestamp: obj.created_at,
      objective_id: obj.id,
      objective_title: obj.title,
      user: obj.creator
    })
  })
  
  // Sort all activities by timestamp
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  
  return activities.slice(0, 15) // Return top 15 most recent
}

/**
 * Fetch task completion statistics for charts
 */
async function fetchTaskCompletionStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  currentUserId: string,
  since: Date
) {
  // Get tasks completed in the last 7 days
  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('updated_at, assignee_id')
    .eq('foundry_id', foundryId)
    .eq('status', 'Completed')
    .gte('updated_at', since.toISOString())
    .order('updated_at', { ascending: true })
  
  // Group by day
  const byDay: Record<string, { my: number; team: number }> = {}
  
  for (let i = 0; i < 7; i++) {
    const date = subDays(new Date(), 6 - i)
    const dateStr = format(date, 'yyyy-MM-dd')
    byDay[dateStr] = { my: 0, team: 0 }
  }
  
  completedTasks?.forEach(task => {
    const dateStr = format(new Date(task.updated_at), 'yyyy-MM-dd')
    if (byDay[dateStr]) {
      if (task.assignee_id === currentUserId) {
        byDay[dateStr].my++
      } else {
        byDay[dateStr].team++
      }
    }
  })
  
  return Object.entries(byDay).map(([date, counts]) => ({
    date,
    label: format(new Date(date), 'EEE'),
    myTasks: counts.my,
    teamTasks: counts.team
  }))
}

/**
 * Fetch unread message counts
 */
async function fetchUnreadCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  currentUserId: string
) {
  // Get all conversations for the user
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, conversation_type')
    .or(`buyer_id.eq.${currentUserId},seller_id.eq.${currentUserId}`)
  
  if (!conversations || conversations.length === 0) {
    return { direct: 0, task: 0, total: 0 }
  }
  
  let directUnread = 0
  let taskUnread = 0
  
  await Promise.all(
    conversations.map(async (conv) => {
      // Get participant's last_read_at
      const { data: participant } = await supabase
        .from('conversation_participants')
        .select('last_read_at')
        .eq('conversation_id', conv.id)
        .eq('profile_id', currentUserId)
        .maybeSingle()
      
      // Count unread messages
      let query = supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .neq('sender_id', currentUserId)
      
      if (participant?.last_read_at) {
        query = query.gt('created_at', participant.last_read_at)
      }
      
      const { count } = await query
      const unreadCount = count || 0
      
      if (conv.conversation_type === 'direct') {
        directUnread += unreadCount
      } else if (conv.conversation_type === 'task') {
        taskUnread += unreadCount
      }
    })
  )
  
  return {
    direct: directUnread,
    task: taskUnread,
    total: directUnread + taskUnread
  }
}

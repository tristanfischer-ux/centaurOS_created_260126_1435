import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getOrCreateUserPreferences } from '@/lib/preferences/service'
import { HomeLayoutClient } from './home-layout-client'
import { HomeHeader } from './home-header'
import { StandupStatusBanner } from '@/components/today/StandupStatusBanner'
import { redirect } from 'next/navigation'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, isToday } from 'date-fns'
import type { MemberWithStatus, TaskWithContext } from './home-layout-client'
import type { Database } from '@/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Task = Database['public']['Tables']['tasks']['Row']
type Objective = Database['public']['Tables']['objectives']['Row']

/**
 * Home Page - Main server component for the unified messaging and overview interface
 * 
 * Fetches all required data:
 * - Foundry members with conversation metadata (last message, unread counts, online status)
 * - Tasks with unread message counts and objectives
 * - Tasks due today and this week
 * - Overdue tasks
 * - Pending decisions (for executives)
 * - Blockers from standups
 * - Team members with their current tasks
 * - User preferences for view state
 */
export default async function HomePage() {
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
  
  // Get user profile for role-based content
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, foundry_id')
    .eq('id', user.id)
    .single()
  
  const isExecutiveOrFounder = profile?.role === 'Executive' || profile?.role === 'Founder'
  
  // Calculate date ranges
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }) // Monday
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const todayStr = now.toISOString().split('T')[0]
  
  // Fetch all required data in parallel
  const [
    membersResult,
    tasksResult,
    objectivesResult,
    preferences,
    tasksDueTodayResult,
    tasksDueThisWeekResult,
    overdueTasksResult,
    pendingDecisionsResult,
    blockersResult,
    teamWithPresenceResult
  ] = await Promise.all([
    // Existing inbox data
    fetchMembersWithConversationData(supabase, user.id, foundryId),
    fetchTasksWithMessageCounts(supabase, foundryId),
    fetchObjectives(supabase, foundryId),
    getOrCreateUserPreferences(supabase, user.id, foundryId),
    
    // Tasks due today
    supabase
      .from('tasks')
      .select(`
        id, title, status, end_date, task_number,
        assignee:profiles!assignee_id(id, full_name, avatar_url),
        objective:objectives!objective_id(id, title)
      `)
      .eq('foundry_id', foundryId)
      .gte('end_date', todayStart.toISOString())
      .lte('end_date', todayEnd.toISOString())
      .neq('status', 'Completed')
      .order('end_date', { ascending: true }),
    
    // Tasks due this week (excluding today)
    supabase
      .from('tasks')
      .select(`
        id, title, status, end_date, task_number,
        assignee:profiles!assignee_id(id, full_name, avatar_url),
        objective:objectives!objective_id(id, title)
      `)
      .eq('foundry_id', foundryId)
      .gt('end_date', todayEnd.toISOString())
      .lte('end_date', weekEnd.toISOString())
      .neq('status', 'Completed')
      .order('end_date', { ascending: true }),
    
    // Overdue tasks
    supabase
      .from('tasks')
      .select(`
        id, title, status, end_date, created_at,
        assignee:profiles!assignee_id(id, full_name, role),
        creator:profiles!creator_id(id, full_name)
      `)
      .eq('foundry_id', foundryId)
      .not('end_date', 'is', null)
      .lt('end_date', todayStart.toISOString())
      .neq('status', 'Completed')
      .order('end_date', { ascending: true })
      .limit(10),
    
    // Pending decisions (for executives)
    isExecutiveOrFounder ? supabase
      .from('tasks')
      .select(`
        id, title, status, end_date, created_at,
        assignee:profiles!assignee_id(id, full_name, role),
        creator:profiles!creator_id(id, full_name)
      `)
      .eq('foundry_id', foundryId)
      .in('status', ['Pending_Executive_Approval', 'Amended_Pending_Approval'])
      .order('created_at', { ascending: false })
      .limit(10)
    : Promise.resolve({ data: [] }),
    
    // Blockers from today's standups
    isExecutiveOrFounder ? supabase
      .from('standups')
      .select(`
        id, blockers, blocker_severity, needs_help,
        user:profiles!standups_user_id_fkey(id, full_name, role)
      `)
      .eq('standup_date', todayStr)
      .not('blockers', 'is', null)
      .order('blocker_severity', { ascending: false })
    : Promise.resolve({ data: [] }),
    
    // Team members with presence and assigned tasks this week
    fetchTeamWithActivity(supabase, foundryId, user.id, weekEnd)
  ])
  
  // Calculate total unread counts for the header
  const totalUnreadPeople = membersResult.reduce((sum, m) => sum + (m.unread_count || 0), 0)
  const totalUnreadTasks = tasksResult.reduce((sum, t) => sum + (t.unread_message_count || 0), 0)
  const totalUnread = totalUnreadPeople + totalUnreadTasks
  
  // Find the most recent conversation to pre-select (first member with conversation history)
  const lastConversationPersonId = membersResult.find(m => m.last_message_at)?.id ?? null
  
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-3rem)] -m-4 sm:-m-6 lg:-m-8">
      {/* Page Header */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4 border-b border-slate-100 flex-shrink-0 space-y-4">
        <HomeHeader totalUnread={totalUnread} userName={profile?.full_name || undefined} />
        <StandupStatusBanner />
      </div>
      
      {/* Main Content */}
      <div className="flex-1 min-h-0">
        <HomeLayoutClient
          members={membersResult}
          tasks={tasksResult}
          objectives={objectivesResult}
          currentUserId={user.id}
          foundryId={foundryId}
          initialPreferences={preferences}
          initialSelectedPersonId={lastConversationPersonId}
          // Summary panel data
          overdueTasks={overdueTasksResult.data || []}
          pendingDecisions={pendingDecisionsResult.data || []}
          blockers={blockersResult.data || []}
          tasksDueToday={tasksDueTodayResult.data || []}
          tasksDueThisWeek={tasksDueThisWeekResult.data || []}
          teamMembers={teamWithPresenceResult}
          userRole={profile?.role}
          isExecutiveOrFounder={isExecutiveOrFounder}
        />
      </div>
    </div>
  )
}

/**
 * Fetch all foundry members with conversation metadata
 */
async function fetchMembersWithConversationData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  currentUserId: string,
  foundryId: string
): Promise<MemberWithStatus[]> {
  // Fetch all foundry members
  const { data: members, error: membersError } = await supabase
    .from('profiles')
    .select('*')
    .eq('foundry_id', foundryId)
    .neq('id', currentUserId)
    .order('full_name')
  
  if (membersError) {
    console.error('Error fetching members:', membersError)
    return []
  }
  
  if (!members || members.length === 0) {
    return []
  }
  
  // Fetch conversations for this user
  const { data: conversations, error: conversationsError } = await supabase
    .from('conversations')
    .select(`
      id,
      buyer_id,
      seller_id,
      updated_at,
      conversation_type
    `)
    .eq('conversation_type', 'direct')
    .or(`buyer_id.eq.${currentUserId},seller_id.eq.${currentUserId}`)
    .order('updated_at', { ascending: false })
  
  if (conversationsError) {
    console.error('Error fetching conversations:', conversationsError)
  }
  
  // Create a map of member ID to conversation metadata
  const conversationMap = new Map<string, {
    conversationId: string
    lastMessage?: string
    lastMessageAt?: string
    unreadCount: number
  }>()
  
  if (conversations) {
    // For each conversation, fetch the last message and unread count
    await Promise.all(
      conversations.map(async (conv) => {
        const otherUserId = conv.buyer_id === currentUserId ? conv.seller_id : conv.buyer_id
        if (!otherUserId) return
        
        // Fetch last message
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('content, created_at')
          .eq('conversation_id', conv.id)
          .is('parent_message_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        
        // Get participant record to find last_read_at
        const { data: participant } = await supabase
          .from('conversation_participants')
          .select('last_read_at')
          .eq('conversation_id', conv.id)
          .eq('profile_id', currentUserId)
          .maybeSingle()
        
        // Count unread messages
        let unreadCount = 0
        if (participant?.last_read_at) {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .neq('sender_id', currentUserId)
            .gt('created_at', participant.last_read_at)
        
          unreadCount = count || 0
        } else {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .neq('sender_id', currentUserId)
        
          unreadCount = count || 0
        }
        
        conversationMap.set(otherUserId, {
          conversationId: conv.id,
          lastMessage: lastMessage?.content || undefined,
          lastMessageAt: lastMessage?.created_at || conv.updated_at,
          unreadCount
        })
      })
    )
  }
  
  // Fetch online status for all members
  const { data: presenceData } = await supabase
    .from('presence')
    .select('user_id, status')
    .in('user_id', members.map(m => m.id))
    .gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString())
  
  const presenceMap = new Map<string, string>()
  presenceData?.forEach(p => {
    presenceMap.set(p.user_id, p.status)
  })
  
  // Combine all data
  const membersWithStatus: MemberWithStatus[] = members.map(member => {
    const conversationData = conversationMap.get(member.id)
    const onlineStatus = presenceMap.get(member.id)
    
    return {
      ...member,
      online_status: onlineStatus,
      last_message: conversationData?.lastMessage,
      last_message_at: conversationData?.lastMessageAt,
      unread_count: conversationData?.unreadCount || 0
    }
  })
  
  // Sort by: unread first, then by last message time, then by name
  membersWithStatus.sort((a, b) => {
    if (a.unread_count && !b.unread_count) return -1
    if (!a.unread_count && b.unread_count) return 1
    
    if (a.last_message_at && b.last_message_at) {
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    }
    if (a.last_message_at && !b.last_message_at) return -1
    if (!a.last_message_at && b.last_message_at) return 1
    
    return (a.full_name || a.email).localeCompare(b.full_name || b.email)
  })
  
  return membersWithStatus
}

/**
 * Fetch all tasks with unread message counts
 */
async function fetchTasksWithMessageCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string
): Promise<TaskWithContext[]> {
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select(`
      *,
      objective:objectives(id, title),
      assignee:profiles!tasks_assignee_id_fkey(
        id,
        full_name,
        role,
        email,
        avatar_url
      )
    `)
    .eq('foundry_id', foundryId)
    .neq('status', 'Completed')
    .order('created_at', { ascending: false })
  
  if (tasksError) {
    console.error('Error fetching tasks:', tasksError)
    return []
  }
  
  if (!tasks || tasks.length === 0) {
    return []
  }
  
  // For each task, count unread messages
  const tasksWithCounts = await Promise.all(
    tasks.map(async (task) => {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', task.id)
      
      return {
        ...task,
        unread_message_count: count || 0
      }
    })
  )
  
  return tasksWithCounts
}

/**
 * Fetch all objectives for the foundry
 */
async function fetchObjectives(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string
): Promise<Pick<Objective, 'id' | 'title'>[]> {
  const { data: objectives, error: objectivesError } = await supabase
    .from('objectives')
    .select('id, title')
    .eq('foundry_id', foundryId)
    .order('created_at', { ascending: false })
  
  if (objectivesError) {
    console.error('Error fetching objectives:', objectivesError)
    return []
  }
  
  return objectives || []
}

/**
 * Fetch team members with presence status and their tasks this week
 */
async function fetchTeamWithActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  currentUserId: string,
  weekEnd: Date
) {
  // Fetch all team members (excluding current user)
  const { data: members, error: membersError } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .eq('foundry_id', foundryId)
    .neq('id', currentUserId)
    .order('full_name')
  
  if (membersError || !members) {
    console.error('Error fetching team members:', membersError)
    return []
  }
  
  // Fetch presence for all members
  const { data: presenceData } = await supabase
    .from('presence')
    .select('user_id, status, current_task_id')
    .in('user_id', members.map(m => m.id))
    .gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString())
  
  const presenceMap = new Map<string, { status: string; currentTaskId?: string }>()
  presenceData?.forEach(p => {
    presenceMap.set(p.user_id, {
      status: p.status,
      currentTaskId: p.current_task_id || undefined
    })
  })
  
  // Get current task details for those who have one
  const currentTaskIds = presenceData?.filter(p => p.current_task_id).map(p => p.current_task_id) || []
  const currentTasksMap = new Map<string, { id: string; title: string }>()
  
  if (currentTaskIds.length > 0) {
    const { data: currentTasks } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('foundry_id', foundryId)
      .in('id', currentTaskIds)
    
    currentTasks?.forEach(t => {
      currentTasksMap.set(t.id, t)
    })
  }
  
  // Fetch tasks due this week for each member
  const memberIds = members.map(m => m.id)
  const { data: weekTasks } = await supabase
    .from('tasks')
    .select('id, title, end_date, assignee_id')
    .eq('foundry_id', foundryId)
    .in('assignee_id', memberIds)
    .lte('end_date', weekEnd.toISOString())
    .neq('status', 'Completed')
    .order('end_date', { ascending: true })
  
  // Group tasks by member
  const tasksByMember = new Map<string, { id: string; title: string; end_date: string | null }[]>()
  weekTasks?.forEach(task => {
    if (task.assignee_id) {
      const existing = tasksByMember.get(task.assignee_id) || []
      existing.push({
        id: task.id,
        title: task.title,
        end_date: task.end_date
      })
      tasksByMember.set(task.assignee_id, existing)
    }
  })
  
  // Combine all data
  return members.map(member => {
    const presence = presenceMap.get(member.id)
    const currentTaskId = presence?.currentTaskId
    const currentTask = currentTaskId ? currentTasksMap.get(currentTaskId) : undefined
    
    return {
      id: member.id,
      full_name: member.full_name,
      avatar_url: member.avatar_url,
      role: member.role,
      presence_status: presence?.status as 'online' | 'away' | 'focus' | 'offline' | undefined,
      current_task: currentTask || null,
      tasks_this_week: tasksByMember.get(member.id) || []
    }
  })
}

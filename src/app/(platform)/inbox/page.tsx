import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getOrCreateUserPreferences } from '@/lib/preferences/service'
import { InboxLayoutClient } from './inbox-layout-client'
import { InboxHeader } from './inbox-header'
import { redirect } from 'next/navigation'
import type { MemberWithStatus, TaskWithContext } from './inbox-layout-client'
import type { Database } from '@/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Task = Database['public']['Tables']['tasks']['Row']
type Objective = Database['public']['Tables']['objectives']['Row']

/**
 * Inbox Page - Main server component for the unified messaging interface
 * 
 * Fetches all required data:
 * - Foundry members with conversation metadata (last message, unread counts, online status)
 * - Tasks with unread message counts and objectives
 * - User preferences for view state
 * 
 * Then passes data to InboxLayoutClient for rendering
 */
export default async function InboxPage() {
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
  
  // Fetch all required data in parallel
  const [
    membersResult,
    tasksResult,
    objectivesResult,
    preferences
  ] = await Promise.all([
    fetchMembersWithConversationData(supabase, user.id, foundryId),
    fetchTasksWithMessageCounts(supabase, foundryId),
    fetchObjectives(supabase, foundryId),
    getOrCreateUserPreferences(supabase, user.id, foundryId)
  ])
  
  // Calculate total unread counts for the header
  const totalUnreadPeople = membersResult.reduce((sum, m) => sum + (m.unread_count || 0), 0)
  const totalUnreadTasks = tasksResult.reduce((sum, t) => sum + (t.unread_message_count || 0), 0)
  const totalUnread = totalUnreadPeople + totalUnreadTasks
  
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-3rem)] -m-4 sm:-m-6 lg:-m-8">
      {/* Page Header */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4 border-b border-slate-100 flex-shrink-0">
        <InboxHeader totalUnread={totalUnread} />
      </div>
      
      {/* Messaging Panels */}
      <div className="flex-1 min-h-0">
        <InboxLayoutClient
          members={membersResult}
          tasks={tasksResult}
          objectives={objectivesResult}
          currentUserId={user.id}
          foundryId={foundryId}
          initialPreferences={preferences}
        />
      </div>
    </div>
  )
}

/**
 * Fetch all foundry members with conversation metadata
 * 
 * Returns members with:
 * - Online status from presence system
 * - Last message preview and timestamp from direct conversations
 * - Unread message count per conversation
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
        // Determine the other participant
        const otherUserId = conv.buyer_id === currentUserId ? conv.seller_id : conv.buyer_id
        if (!otherUserId) return
        
        // Fetch last message
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('content, created_at')
          .eq('conversation_id', conv.id)
          .is('parent_message_id', null) // Only main messages, not thread replies
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
          // If no last_read_at, count all messages from other user
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
    .select('profile_id, status')
    .in('profile_id', members.map(m => m.id))
    .gte('last_seen_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Active in last 5 mins
  
  const presenceMap = new Map<string, string>()
  presenceData?.forEach(p => {
    presenceMap.set(p.profile_id, p.status)
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
    // Unread messages first
    if (a.unread_count && !b.unread_count) return -1
    if (!a.unread_count && b.unread_count) return 1
    
    // Then by last message time
    if (a.last_message_at && b.last_message_at) {
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    }
    if (a.last_message_at && !b.last_message_at) return -1
    if (!a.last_message_at && b.last_message_at) return 1
    
    // Finally by name
    return (a.full_name || a.email).localeCompare(b.full_name || b.email)
  })
  
  return membersWithStatus
}

/**
 * Fetch all tasks with unread message counts
 * 
 * Returns tasks with:
 * - Objective details
 * - Assignee information
 * - Unread message count from task conversations
 */
async function fetchTasksWithMessageCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string
): Promise<TaskWithContext[]> {
  // Fetch all tasks with objectives and assignees
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
      // Count messages with this task_id
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', task.id)
      
      // TODO: In the future, calculate actual unread count based on user's last_read_at
      // For now, just show the total message count as a simple implementation
      const unreadCount = count || 0
      
      return {
        ...task,
        unread_message_count: unreadCount
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
): Promise<Objective[]> {
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

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Users, CheckSquare, MessageSquare } from 'lucide-react'
import { updateUserPreferences } from '@/lib/preferences/service'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Database } from '@/types/database.types'
import type { UserPreferences } from '@/types/preferences'
import { PeopleList } from '@/components/inbox/people-list'
import { TasksList } from '@/components/inbox/tasks-list'
import { ConversationThread } from '@/components/messaging/ConversationThread'

// Type aliases for cleaner code
type Profile = Database['public']['Tables']['profiles']['Row']
type Task = Database['public']['Tables']['tasks']['Row']
type Objective = Database['public']['Tables']['objectives']['Row']

/**
 * Extended profile with messaging metadata
 */
export interface MemberWithStatus extends Profile {
  online_status?: string
  last_message?: string
  last_message_at?: string
  unread_count?: number
}

/**
 * Extended task with objective and messaging metadata
 */
export interface TaskWithContext extends Task {
  objective?: Objective | null
  assignee?: {
    id: string
    full_name: string | null
    role: string
    email: string
    avatar_url?: string | null
  } | null
  unread_message_count?: number
}

/**
 * Context for the current conversation
 */
interface ConversationContext {
  taskId?: string
  objectiveId?: string
}

export interface InboxLayoutClientProps {
  members: MemberWithStatus[]
  tasks: TaskWithContext[]
  objectives: Objective[]
  currentUserId: string
  foundryId: string
  initialPreferences: UserPreferences
}

/**
 * Main inbox layout component with WhatsApp-style two-panel layout
 * 
 * Features:
 * - Toggle between "People" and "Tasks" views
 * - Mobile responsive with slide-over panels
 * - State management for selected conversation/task
 * - Syncs view preferences to database
 */
export function InboxLayoutClient({
  members,
  tasks,
  objectives,
  currentUserId,
  foundryId,
  initialPreferences
}: InboxLayoutClientProps) {
  // View mode state
  const [viewMode, setViewMode] = useState<'people' | 'tasks'>(initialPreferences.inbox_view)
  const [taskFilter, setTaskFilter] = useState<'my_tasks' | 'all_tasks'>(initialPreferences.inbox_task_filter)
  
  // Selection state
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [currentContext, setCurrentContext] = useState<ConversationContext | null>(null)
  
  // Mobile responsive state
  const [isMobile, setIsMobile] = useState(false)
  const [showRightPanel, setShowRightPanel] = useState(false)
  
  // Preference update debouncing
  const preferenceUpdateTimeout = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()
  
  // Detect mobile on mount and window resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768) // md breakpoint
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  // Debounced preference update
  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    // Clear existing timeout
    if (preferenceUpdateTimeout.current) {
      clearTimeout(preferenceUpdateTimeout.current)
    }
    
    // Schedule update after 1 second of inactivity
    preferenceUpdateTimeout.current = setTimeout(async () => {
      try {
        await updateUserPreferences(supabase, currentUserId, foundryId, updates)
      } catch (error) {
        console.error('Failed to update preferences:', error)
        // Don't show toast for preference updates - it's not critical
      }
    }, 1000)
  }, [supabase, currentUserId, foundryId])
  
  // Handle view mode change
  const handleViewModeChange = useCallback((newMode: 'people' | 'tasks') => {
    setViewMode(newMode)
    
    // Clear selection when switching views
    setSelectedPersonId(null)
    setSelectedTaskId(null)
    setCurrentContext(null)
    setShowRightPanel(false)
    
    // Update preferences
    updatePreferences({ inbox_view: newMode })
  }, [updatePreferences])
  
  // Handle task filter change
  const handleTaskFilterChange = useCallback((newFilter: 'my_tasks' | 'all_tasks') => {
    setTaskFilter(newFilter)
    updatePreferences({ inbox_task_filter: newFilter })
  }, [updatePreferences])
  
  // Handle person selection
  const handleSelectPerson = useCallback((personId: string) => {
    setSelectedPersonId(personId)
    setSelectedTaskId(null)
    setCurrentContext(null)
    
    if (isMobile) {
      setShowRightPanel(true)
    }
  }, [isMobile])
  
  // Handle task selection
  const handleSelectTask = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    
    setSelectedTaskId(taskId)
    setSelectedPersonId(null)
    setCurrentContext({
      taskId,
      objectiveId: task?.objective_id || undefined
    })
    
    if (isMobile) {
      setShowRightPanel(true)
    }
  }, [tasks, isMobile])
  
  // Handle back button (mobile)
  const handleBack = useCallback(() => {
    setShowRightPanel(false)
    setSelectedPersonId(null)
    setSelectedTaskId(null)
    setCurrentContext(null)
  }, [])
  
  // Calculate unread counts
  const totalUnreadPeople = members.reduce((sum, m) => sum + (m.unread_count || 0), 0)
  const totalUnreadTasks = tasks.reduce((sum, t) => sum + (t.unread_message_count || 0), 0)
  
  // Filter tasks based on filter setting
  const filteredTasks = taskFilter === 'my_tasks'
    ? tasks.filter(t => t.assignee_id === currentUserId)
    : tasks
  
  // Check if anything is selected
  const hasSelection = selectedPersonId !== null || selectedTaskId !== null
  
  return (
    <div className="flex h-full">
      {/* Left Panel - List View */}
      <div 
        className={cn(
          "w-full md:w-[320px] lg:w-[360px] border-r border-slate-200 flex flex-col",
          // Hide on mobile when right panel is shown
          isMobile && showRightPanel && "hidden"
        )}
      >
        {/* View Toggle */}
        <div className="p-4 border-b border-slate-200">
          <Tabs value={viewMode} onValueChange={(v) => handleViewModeChange(v as 'people' | 'tasks')}>
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="people" className="gap-2">
                <Users className="h-4 w-4" />
                People
                {totalUnreadPeople > 0 && (
                  <Badge 
                    variant="secondary" 
                    className="ml-1 h-5 px-1.5 text-xs bg-international-orange text-white"
                  >
                    {totalUnreadPeople}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-2">
                <CheckSquare className="h-4 w-4" />
                Tasks
                {totalUnreadTasks > 0 && (
                  <Badge 
                    variant="secondary" 
                    className="ml-1 h-5 px-1.5 text-xs bg-electric-blue text-white"
                  >
                    {totalUnreadTasks}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        {/* List Content */}
        <div className="flex-1 overflow-y-auto">
          {viewMode === 'people' ? (
            <PeopleList
              members={members.map(m => ({
                id: m.id,
                full_name: m.full_name || m.email,
                avatar_url: m.avatar_url,
                role: m.role,
                online_status: m.online_status as 'online' | 'away' | 'offline' | undefined,
                last_message: m.last_message,
                last_message_at: m.last_message_at,
                unread_count: m.unread_count
              }))}
              selectedPersonId={selectedPersonId || undefined}
              onSelectPerson={handleSelectPerson}
            />
          ) : (
            <TasksList
              tasks={tasks}
              objectives={objectives}
              currentUserId={currentUserId}
              taskFilter={taskFilter}
              onTaskFilterChange={handleTaskFilterChange}
              selectedTaskId={selectedTaskId || undefined}
              onSelectTask={handleSelectTask}
            />
          )}
        </div>
      </div>
      
      {/* Right Panel - Conversation/Detail View */}
      <div 
        className={cn(
          "flex-1 flex flex-col",
          // Full screen on mobile when shown
          isMobile && !showRightPanel && "hidden"
        )}
      >
        {/* Mobile back button */}
        {isMobile && hasSelection && (
          <div className="p-2 border-b border-slate-200">
            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
        )}
        
        {/* Content Area */}
        {selectedPersonId ? (
          <DirectConversationView
            personId={selectedPersonId}
            currentUserId={currentUserId}
            foundryId={foundryId}
            members={members}
          />
        ) : selectedTaskId ? (
          <TaskConversationView
            taskId={selectedTaskId}
            context={currentContext}
            currentUserId={currentUserId}
            foundryId={foundryId}
            members={members}
          />
        ) : (
          <EmptyState viewMode={viewMode} />
        )}
      </div>
    </div>
  )
}

/**
 * Direct conversation view - fetches or creates a conversation with the selected person
 */
function DirectConversationView({
  personId,
  currentUserId,
  foundryId,
  members
}: {
  personId: string
  currentUserId: string
  foundryId: string
  members: MemberWithStatus[]
}) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()
  
  useEffect(() => {
    async function fetchOrCreateConversation() {
      setIsLoading(true)
      
      try {
        // Try to find existing direct conversation
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .eq('conversation_type', 'direct')
          .or(`and(buyer_id.eq.${currentUserId},seller_id.eq.${personId}),and(buyer_id.eq.${personId},seller_id.eq.${currentUserId})`)
          .maybeSingle()
        
        if (existing) {
          setConversationId(existing.id)
        } else {
          // Create new conversation
          const { data: newConv, error } = await supabase
            .from('conversations')
            .insert({
              buyer_id: currentUserId,
              seller_id: personId,
              conversation_type: 'direct',
              status: 'active'
            })
            .select('id')
            .single()
          
          if (error) {
            console.error('Error creating conversation:', error)
            toast.error('Failed to create conversation')
            return
          }
          
          if (newConv) {
            // Create participant records
            await supabase
              .from('conversation_participants')
              .insert([
                {
                  conversation_id: newConv.id,
                  profile_id: currentUserId
                },
                {
                  conversation_id: newConv.id,
                  profile_id: personId
                }
              ])
            
            setConversationId(newConv.id)
          }
        }
      } catch (error) {
        console.error('Error fetching/creating conversation:', error)
        toast.error('Failed to load conversation')
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchOrCreateConversation()
  }, [personId, currentUserId, supabase])
  
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground animate-pulse mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading conversation...</p>
        </div>
      </div>
    )
  }
  
  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Failed to load conversation</p>
        </div>
      </div>
    )
  }
  
  // Find the person details
  const person = members.find(m => m.id === personId)
  
  return (
    <div className="flex flex-col h-full">
      {/* Person header */}
      {person && (
        <div className="border-b border-border px-4 py-3 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              {(person.full_name || person.email).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm">{person.full_name || person.email}</h3>
              <p className="text-xs text-muted-foreground">{person.role}</p>
            </div>
            {person.online_status === 'online' && (
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-status-success" />
                <span className="text-xs text-muted-foreground">Online</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Conversation */}
      <div className="flex-1">
        <ConversationThread
          conversationId={conversationId}
          currentUserId={currentUserId}
          foundryId={foundryId}
          members={members.map(m => ({
            id: m.id,
            full_name: m.full_name || m.email,
            email: m.email
          }))}
          enableCommands={true}
          showHeader={false}
        />
      </div>
    </div>
  )
}

/**
 * Task conversation view - shows messages related to a specific task
 */
function TaskConversationView({
  taskId,
  context,
  currentUserId,
  foundryId,
  members
}: {
  taskId: string
  context: ConversationContext | null
  currentUserId: string
  foundryId: string
  members: MemberWithStatus[]
}) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [taskDetails, setTaskDetails] = useState<{ title: string; task_number?: number } | null>(null)
  const supabase = createClient()
  
  useEffect(() => {
    async function fetchOrCreateTaskConversation() {
      setIsLoading(true)
      
      try {
        // Fetch task details
        const { data: task } = await supabase
          .from('tasks')
          .select('title, task_number')
          .eq('id', taskId)
          .single()
        
        if (task) {
          setTaskDetails(task)
        }
        
        // Try to find existing task conversation
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .eq('conversation_type', 'task')
          .eq('task_id', taskId)
          .maybeSingle()
        
        if (existing) {
          setConversationId(existing.id)
        } else {
          // Create new task conversation
          const { data: newConv, error } = await supabase
            .from('conversations')
            .insert({
              conversation_type: 'task',
              task_id: taskId,
              objective_id: context?.objectiveId || null,
              is_group: true,
              creator_id: currentUserId,
              buyer_id: currentUserId, // Required legacy field
              seller_id: currentUserId, // Required legacy field
              status: 'active',
              title: task?.title ? `Task: ${task.title}` : 'Task Discussion'
            })
            .select('id')
            .single()
          
          if (error) {
            console.error('Error creating task conversation:', error)
            toast.error('Failed to create task conversation')
            return
          }
          
          if (newConv) {
            // Add current user as participant
            await supabase
              .from('conversation_participants')
              .insert({
                conversation_id: newConv.id,
                profile_id: currentUserId
              })
            
            setConversationId(newConv.id)
          }
        }
      } catch (error) {
        console.error('Error fetching/creating task conversation:', error)
        toast.error('Failed to load task conversation')
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchOrCreateTaskConversation()
  }, [taskId, context, currentUserId, supabase])
  
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <CheckSquare className="h-8 w-8 text-muted-foreground animate-pulse mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading task conversation...</p>
        </div>
      </div>
    )
  }
  
  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <CheckSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Failed to load task conversation</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Task header */}
      {taskDetails && (
        <div className="border-b border-border px-4 py-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="font-medium text-sm">{taskDetails.title}</h3>
              {taskDetails.task_number && (
                <p className="text-xs text-muted-foreground">Task #{taskDetails.task_number}</p>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Conversation */}
      <div className="flex-1">
        <ConversationThread
          conversationId={conversationId}
          currentUserId={currentUserId}
          foundryId={foundryId}
          members={members.map(m => ({
            id: m.id,
            full_name: m.full_name || m.email,
            email: m.email
          }))}
          enableCommands={true}
          showHeader={false}
        />
      </div>
    </div>
  )
}

/**
 * Empty state when no conversation is selected
 */
function EmptyState({ viewMode }: { viewMode: 'people' | 'tasks' }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {viewMode === 'people' ? (
          <>
            <Users className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a conversation</h3>
            <p className="text-sm text-muted-foreground">
              Choose a team member from the list to start messaging
            </p>
          </>
        ) : (
          <>
            <CheckSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a task</h3>
            <p className="text-sm text-muted-foreground">
              Choose a task from the list to view its conversation and details
            </p>
          </>
        )}
      </div>
    </div>
  )
}

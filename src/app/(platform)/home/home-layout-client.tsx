'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ArrowLeft, Users, CheckSquare, MessageSquare, PanelLeftOpen, LayoutDashboard } from 'lucide-react'
import { updateUserPreferences } from '@/lib/preferences/service'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Database } from '@/types/database.types'
import type { UserPreferences } from '@/types/preferences'
import { PeopleList } from '@/components/inbox/people-list'
import { TasksList } from '@/components/inbox/tasks-list'
import { ConversationThread } from '@/components/messaging/ConversationThread'
import { ConversationThreadEnhanced } from '@/components/inbox/conversation-thread-enhanced'
import { HomeSummaryPanel } from '@/components/home'
import { FullTaskView } from '@/components/tasks/full-task-view'

// Type aliases
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
  objective?: { id: string; title: string } | null
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

// Summary panel types
interface ActionTask {
  id: string
  title: string
  status: string
  end_date: string | null
  created_at: string
  assignee?: { id: string; full_name: string | null; role: string | null } | null
  creator?: { id: string; full_name: string | null } | null
}

interface BlockerStandup {
  id: string
  blockers: string
  blocker_severity: string | null
  needs_help: boolean
  user: { id: string; full_name: string | null; role: string | null }
}

interface TaskDue {
  id: string
  title: string
  status: string
  end_date: string
  task_number?: number
  assignee?: { id: string; full_name: string | null; avatar_url?: string | null } | null
  objective?: { id: string; title: string } | null
}

interface TeamMemberActivity {
  id: string
  full_name: string | null
  avatar_url?: string | null
  role: string | null
  presence_status?: 'online' | 'away' | 'focus' | 'offline'
  current_task?: { id: string; title: string } | null
  tasks_this_week: { id: string; title: string; end_date: string | null }[]
}

export interface HomeLayoutClientProps {
  members: MemberWithStatus[]
  tasks: TaskWithContext[]
  objectives: { id: string; title: string }[]
  currentUserId: string
  foundryId: string
  initialPreferences: UserPreferences
  /** Optional: Pre-select the last conversation on load */
  initialSelectedPersonId?: string | null
  // Summary panel props
  overdueTasks: ActionTask[]
  pendingDecisions: ActionTask[]
  blockers: BlockerStandup[]
  tasksDueToday: TaskDue[]
  tasksDueThisWeek: TaskDue[]
  teamMembers: TeamMemberActivity[]
  userRole?: string
  isExecutiveOrFounder: boolean
}

// Breakpoints
const LARGE_BREAKPOINT = 1280
const MEDIUM_BREAKPOINT = 768

/**
 * Main home layout component with responsive 3-column/2-column layout
 */
export function HomeLayoutClient({
  members,
  tasks,
  objectives,
  currentUserId,
  foundryId,
  initialPreferences,
  initialSelectedPersonId,
  overdueTasks,
  pendingDecisions,
  blockers,
  tasksDueToday,
  tasksDueThisWeek,
  teamMembers,
  userRole,
  isExecutiveOrFounder
}: HomeLayoutClientProps) {
  // View mode state
  const [viewMode, setViewMode] = useState<'people' | 'tasks'>(initialPreferences.inbox_view)
  const [taskFilter, setTaskFilter] = useState<'my_tasks' | 'all_tasks'>(initialPreferences.inbox_task_filter)
  const [mobileView, setMobileView] = useState<'messages' | 'summary'>('messages')
  
  // Selection state - default to last conversation if available
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(initialSelectedPersonId ?? null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [currentContext, setCurrentContext] = useState<ConversationContext | null>(null)
  
  // Layout state
  const [screenSize, setScreenSize] = useState<'large' | 'medium' | 'small'>('large')
  const [listPanelOpen, setListPanelOpen] = useState(false)
  const [showConversation, setShowConversation] = useState(!!initialSelectedPersonId)
  
  // Task modal state
  const [selectedTaskForModal, setSelectedTaskForModal] = useState<string | null>(null)
  const [fullTaskData, setFullTaskData] = useState<any>(null)
  const [isLoadingTask, setIsLoadingTask] = useState(false)
  
  // Preference update debouncing
  const preferenceUpdateTimeout = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()
  
  // Detect screen size on mount and resize
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth
      if (width >= LARGE_BREAKPOINT) {
        setScreenSize('large')
      } else if (width >= MEDIUM_BREAKPOINT) {
        setScreenSize('medium')
      } else {
        setScreenSize('small')
      }
    }
    
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])
  
  // Debounced preference update
  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    if (preferenceUpdateTimeout.current) {
      clearTimeout(preferenceUpdateTimeout.current)
    }
    
    preferenceUpdateTimeout.current = setTimeout(async () => {
      try {
        await updateUserPreferences(supabase, currentUserId, foundryId, updates)
      } catch (error) {
        console.error('Failed to update preferences:', error)
      }
    }, 1000)
  }, [supabase, currentUserId, foundryId])
  
  // Handle view mode change
  const handleViewModeChange = useCallback((newMode: 'people' | 'tasks') => {
    setViewMode(newMode)
    setSelectedPersonId(null)
    setSelectedTaskId(null)
    setCurrentContext(null)
    setShowConversation(false)
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
    setShowConversation(true)
    setListPanelOpen(false)
  }, [])
  
  // Handle task selection
  const handleSelectTask = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    setSelectedTaskId(taskId)
    setSelectedPersonId(null)
    setCurrentContext({
      taskId,
      objectiveId: task?.objective_id || undefined
    })
    setShowConversation(true)
    setListPanelOpen(false)
  }, [tasks])
  
  // Handle back button
  const handleBack = useCallback(() => {
    setShowConversation(false)
    setSelectedPersonId(null)
    setSelectedTaskId(null)
    setCurrentContext(null)
  }, [])
  
  // Handle task modal open
  const handleOpenTaskModal = useCallback(async (taskId: string) => {
    setIsLoadingTask(true)
    setSelectedTaskForModal(taskId)
    
    try {
      // Fetch full task details (TaskDue only has partial data)
      const { data: task, error } = await supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assignee_id_fkey(id, full_name, role, email, avatar_url),
          objective:objectives(id, title)
        `)
        .eq('id', taskId)
        .single()
      
      if (error) {
        console.error('Error fetching task:', error)
        toast.error('Failed to load task details')
        setSelectedTaskForModal(null)
        return
      }
      
      setFullTaskData(task)
    } catch (error) {
      console.error('Error loading task:', error)
      toast.error('Failed to load task details')
      setSelectedTaskForModal(null)
    } finally {
      setIsLoadingTask(false)
    }
  }, [supabase])
  
  // Calculate unread counts
  const totalUnreadPeople = members.reduce((sum, m) => sum + (m.unread_count || 0), 0)
  const totalUnreadTasks = tasks.reduce((sum, t) => sum + (t.unread_message_count || 0), 0)
  
  // Check if anything is selected
  const hasSelection = selectedPersonId !== null || selectedTaskId !== null
  
  // Prepare members list for FullTaskView
  const membersList = members.map(m => ({
    id: m.id,
    full_name: m.full_name || m.email,
    role: m.role,
    email: m.email
  }))
  
  // List panel content (reused in both inline and sheet)
  const listContent = (
    <>
      {/* View Toggle */}
      <div className="p-4 border-b border-slate-200">
        <Tabs value={viewMode} onValueChange={(v) => handleViewModeChange(v as 'people' | 'tasks')}>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="people" className="gap-2">
              <Users className="h-4 w-4" />
              People
              {totalUnreadPeople > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-international-orange text-white">
                  {totalUnreadPeople}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <CheckSquare className="h-4 w-4" />
              Tasks
              {totalUnreadTasks > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-electric-blue text-white">
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
    </>
  )
  
  // LARGE SCREEN: 3 columns
  if (screenSize === 'large') {
    return (
      <>
        <div className="flex h-full">
          {/* Left Panel - List */}
          <div className="w-[320px] lg:w-[360px] border-r border-slate-200 flex flex-col">
            {listContent}
          </div>
          
          {/* Middle Panel - Conversation */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedPersonId ? (
              <DirectConversationView
                personId={selectedPersonId}
                currentUserId={currentUserId}
                foundryId={foundryId}
                members={members}
                tasks={tasks}
                objectives={objectives}
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
          
          {/* Right Panel - Summary */}
          <div className="w-[350px] border-l border-slate-200 bg-muted/30">
            <HomeSummaryPanel
              overdueTasks={overdueTasks}
              pendingDecisions={pendingDecisions}
              blockers={blockers}
              tasksDueToday={tasksDueToday}
              tasksDueThisWeek={tasksDueThisWeek}
              teamMembers={teamMembers}
              userId={currentUserId}
              userRole={userRole}
              foundryId={foundryId}
              isExecutiveOrFounder={isExecutiveOrFounder}
              onTaskClick={handleOpenTaskModal}
            />
          </div>
        </div>
        
        {/* Task Detail Modal */}
        {selectedTaskForModal && fullTaskData && (
          <FullTaskView
            open={!!selectedTaskForModal}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedTaskForModal(null)
                setFullTaskData(null)
              }
            }}
            task={fullTaskData}
            members={membersList}
            currentUserId={currentUserId}
          />
        )}
      </>
    )
  }
  
  // MEDIUM SCREEN: 2 columns with slide-out list
  if (screenSize === 'medium') {
    return (
      <>
        <div className="flex h-full">
          {/* Main Content - Messages with slide-out list */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header with list toggle */}
            <div className="flex items-center gap-2 p-2 border-b border-slate-200">
              <Sheet open={listPanelOpen} onOpenChange={setListPanelOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <PanelLeftOpen className="h-4 w-4" />
                    {viewMode === 'people' ? 'People' : 'Tasks'}
                    {(totalUnreadPeople + totalUnreadTasks) > 0 && (
                      <Badge className="bg-international-orange text-white text-xs">
                        {totalUnreadPeople + totalUnreadTasks}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[320px] p-0">
                  <div className="flex flex-col h-full">
                    {listContent}
                  </div>
                </SheetContent>
              </Sheet>
              
              {hasSelection && (
                <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
            </div>
            
            {/* Conversation content */}
            <div className="flex-1 min-h-0">
              {selectedPersonId ? (
                <DirectConversationView
                  personId={selectedPersonId}
                  currentUserId={currentUserId}
                  foundryId={foundryId}
                  members={members}
                  tasks={tasks}
                  objectives={objectives}
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
          
          {/* Right Panel - Summary */}
          <div className="w-[320px] border-l border-slate-200 bg-muted/30">
            <HomeSummaryPanel
              overdueTasks={overdueTasks}
              pendingDecisions={pendingDecisions}
              blockers={blockers}
              tasksDueToday={tasksDueToday}
              tasksDueThisWeek={tasksDueThisWeek}
              teamMembers={teamMembers}
              userId={currentUserId}
              userRole={userRole}
              foundryId={foundryId}
              isExecutiveOrFounder={isExecutiveOrFounder}
              onTaskClick={handleOpenTaskModal}
            />
          </div>
        </div>
        
        {/* Task Detail Modal */}
        {selectedTaskForModal && fullTaskData && (
          <FullTaskView
            open={!!selectedTaskForModal}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedTaskForModal(null)
                setFullTaskData(null)
              }
            }}
            task={fullTaskData}
            members={membersList}
            currentUserId={currentUserId}
          />
        )}
      </>
    )
  }
  
  // SMALL SCREEN (Mobile): Tabbed view
  return (
    <>
      <div className="flex flex-col h-full">
        {/* Mobile Tab Bar */}
        <div className="flex border-b border-slate-200 bg-background">
          <button
            onClick={() => setMobileView('messages')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
              mobileView === 'messages' 
                ? "text-international-orange border-b-2 border-international-orange" 
                : "text-muted-foreground"
            )}
          >
            <MessageSquare className="h-4 w-4" />
            Messages
            {(totalUnreadPeople + totalUnreadTasks) > 0 && (
              <Badge className="bg-international-orange text-white text-xs">
                {totalUnreadPeople + totalUnreadTasks}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setMobileView('summary')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
              mobileView === 'summary' 
                ? "text-international-orange border-b-2 border-international-orange" 
                : "text-muted-foreground"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            Overview
          </button>
        </div>
        
        {/* Mobile Content */}
        <div className="flex-1 min-h-0">
          {mobileView === 'messages' ? (
            // Messages view
            showConversation && hasSelection ? (
              // Show conversation
              <div className="flex flex-col h-full">
                <div className="p-2 border-b border-slate-200">
                  <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                </div>
                <div className="flex-1 min-h-0">
                  {selectedPersonId ? (
                    <DirectConversationView
                      personId={selectedPersonId}
                      currentUserId={currentUserId}
                      foundryId={foundryId}
                      members={members}
                      tasks={tasks}
                      objectives={objectives}
                    />
                  ) : selectedTaskId ? (
                    <TaskConversationView
                      taskId={selectedTaskId}
                      context={currentContext}
                      currentUserId={currentUserId}
                      foundryId={foundryId}
                      members={members}
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              // Show list
              <div className="flex flex-col h-full">
                {listContent}
              </div>
            )
          ) : (
            // Summary view
            <HomeSummaryPanel
              overdueTasks={overdueTasks}
              pendingDecisions={pendingDecisions}
              blockers={blockers}
              tasksDueToday={tasksDueToday}
              tasksDueThisWeek={tasksDueThisWeek}
              teamMembers={teamMembers}
              userId={currentUserId}
              userRole={userRole}
              foundryId={foundryId}
              isExecutiveOrFounder={isExecutiveOrFounder}
              onTaskClick={handleOpenTaskModal}
            />
          )}
        </div>
      </div>
      
      {/* Task Detail Modal */}
      {selectedTaskForModal && fullTaskData && (
        <FullTaskView
          open={!!selectedTaskForModal}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedTaskForModal(null)
              setFullTaskData(null)
            }
          }}
          task={fullTaskData}
          members={membersList}
          currentUserId={currentUserId}
        />
      )}
    </>
  )
}

/**
 * Direct conversation view
 */
function DirectConversationView({
  personId,
  currentUserId,
  foundryId,
  members,
  tasks,
  objectives
}: {
  personId: string
  currentUserId: string
  foundryId: string
  members: MemberWithStatus[]
  tasks: Task[]
  objectives: { id: string; title: string }[]
}) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()
  
  useEffect(() => {
    async function fetchOrCreateConversation() {
      setIsLoading(true)
      
      try {
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .eq('conversation_type', 'direct')
          .or(`and(buyer_id.eq.${currentUserId},seller_id.eq.${personId}),and(buyer_id.eq.${personId},seller_id.eq.${currentUserId})`)
          .maybeSingle()
        
        if (existing) {
          setConversationId(existing.id)
        } else {
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
            await supabase
              .from('conversation_participants')
              .insert([
                { conversation_id: newConv.id, profile_id: currentUserId },
                { conversation_id: newConv.id, profile_id: personId }
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
  
  const person = members.find(m => m.id === personId)
  
  if (!person) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Person not found</p>
        </div>
      </div>
    )
  }
  
  // Convert members to the format expected by CommandInput
  const membersList = members.map(m => ({
    id: m.id,
    full_name: m.full_name || m.email,
    email: m.email
  }))
  
  return (
    <ConversationThreadEnhanced
      conversationId={conversationId}
      otherPersonId={personId}
      otherPersonName={person.full_name || person.email}
      otherPersonAvatar={person.avatar_url || undefined}
      tasks={tasks}
      objectives={objectives}
      currentUserId={currentUserId}
      foundryId={foundryId}
      members={membersList}
      showHeader={true}
    />
  )
}

/**
 * Task conversation view
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
        const { data: task } = await supabase
          .from('tasks')
          .select('title, task_number')
          .eq('id', taskId)
          .single()
        
        if (task) {
          setTaskDetails(task)
        }
        
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .eq('conversation_type', 'task')
          .eq('task_id', taskId)
          .maybeSingle()
        
        if (existing) {
          setConversationId(existing.id)
        } else {
          const { data: newConv, error } = await supabase
            .from('conversations')
            .insert({
              conversation_type: 'task',
              task_id: taskId,
              objective_id: context?.objectiveId || null,
              is_group: true,
              creator_id: currentUserId,
              buyer_id: currentUserId,
              seller_id: currentUserId,
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
            await supabase
              .from('conversation_participants')
              .insert({ conversation_id: newConv.id, profile_id: currentUserId })
            
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
      {taskDetails && (
        <div className="border-b border-border px-4 py-3 bg-muted/30 flex-shrink-0">
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
      
      <div className="flex-1 min-h-0">
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

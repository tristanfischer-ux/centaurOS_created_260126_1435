'use client'

import { useState, useCallback, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ConversationThread } from '@/components/messaging/ConversationThread'
import { QuickComposeDialog } from '@/components/messaging/QuickComposeDialog'
import { NeedsAttentionSummary } from '@/components/today/needs-attention-summary'
import { ActivityStream } from '@/components/today/activity-stream'
import { FullTaskView } from '@/components/tasks/full-task-view'
import { useConversationList } from '@/hooks/useConversation'
import { typography } from '@/lib/design-system'
import { getTaskById } from '@/actions/tasks'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { toast } from 'sonner'
import type { ConversationWithParticipants, ConversationType } from '@/lib/messaging/service'
import type { ActivityItem } from '@/types/activity'
import {
  MessageSquare,
  Search,
  Plus,
  ArrowLeft,
  Hash,
  User,
  Briefcase,
  Target,
  CheckSquare,
  Activity
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface TeamMember {
  id: string
  full_name: string
  email: string
  role: string
}

interface Task {
  id: string
  title: string
  status: string | null
  task_number?: number
  objective_id?: string | null
}

interface Objective {
  id: string
  title: string
}

interface MessagesPageClientProps {
  userId: string
  foundryId?: string
  userRole?: string
  members?: TeamMember[]
  // Context linking data
  tasks?: Task[]
  objectives?: Objective[]
  // Activity stream data
  initialActivityItems?: ActivityItem[]
  initialActivityCounts?: {
    all: number
    tasks: number
    objectives: number
    messages: number
    unread: number
    history: number
  }
  // Needs attention counts
  overdueCount?: number
  approvalsCount?: number
  blockersCount?: number
}

function getConversationDisplayName(
  conv: ConversationWithParticipants,
  currentUserId: string
): string {
  // For task conversations, show task title/number
  if (conv.conversation_type === 'task' && conv.task) {
    return `#${conv.task.task_number}: ${conv.task.title}`
  }
  
  // For objective conversations, show objective title
  if (conv.conversation_type === 'objective' && conv.objective) {
    return conv.objective.title
  }
  
  // Fall back to title if set
  if (conv.title) {
    return conv.title
  }
  
  // For DMs, show other participant's name
  const otherParticipant = conv.buyer?.id === currentUserId ? conv.seller : conv.buyer
  return otherParticipant?.full_name || otherParticipant?.email || 'Unknown'
}

function getConversationIcon(type: ConversationType | undefined) {
  switch (type) {
    case 'task':
      return CheckSquare
    case 'objective':
      return Target
    case 'expert':
    case 'marketplace':
      return Briefcase
    case 'direct':
    default:
      return User
  }
}

// Task type for FullTaskView dialog
interface TaskForDialog {
  id: string
  title: string
  description: string | null
  status: string | null
  risk_level: string | null
  start_date: string | null
  end_date: string | null
  task_number?: number
  assignee?: { id: string; full_name: string | null; role: string; email: string; avatar_url?: string | null } | null
  assignees?: { id: string; full_name: string | null; role: string; email: string; avatar_url?: string | null }[]
  task_files?: { id: string }[]
  objective?: { id: string; title: string } | null
}

export function MessagesPageClient({ 
  userId, 
  foundryId, 
  userRole,
  members = [],
  tasks = [],
  objectives = [],
  initialActivityItems = [],
  initialActivityCounts,
  overdueCount = 0,
  approvalsCount = 0,
  blockersCount = 0
}: MessagesPageClientProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCompose, setShowCompose] = useState(false)
  const [activeTab, setActiveTab] = useState<'conversations' | 'activity'>('conversations')
  const isMobile = useMediaQuery('(max-width: 767px)')
  
  // Task dialog state
  const [selectedTask, setSelectedTask] = useState<TaskForDialog | null>(null)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [_isLoadingTask, startTaskTransition] = useTransition()

  const { conversations, isLoading, refresh } = useConversationList(userId)
  
  // Handler for task click from activity stream
  const handleTaskClick = useCallback((taskId: string) => {
    startTaskTransition(async () => {
      const result = await getTaskById(taskId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.data) {
        setSelectedTask(result.data as TaskForDialog)
        setTaskDialogOpen(true)
      }
    })
  }, [])

  // Filter by search
  const filteredConversations = searchQuery
    ? conversations.filter(c => {
        const displayName = getConversationDisplayName(c, userId).toLowerCase()
        return displayName.includes(searchQuery.toLowerCase())
      })
    : conversations

  // Group conversations
  const channels = filteredConversations.filter(c => 
    c.conversation_type === 'task' || c.conversation_type === 'objective'
  )
  const dms = filteredConversations.filter(c => c.conversation_type === 'direct')
  const experts = filteredConversations.filter(c => 
    c.conversation_type === 'expert' || c.conversation_type === 'marketplace'
  )

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id)
  }, [])

  const handleBack = useCallback(() => {
    setSelectedConversationId(null)
    refresh()
  }, [refresh])

  // Show conversation thread if selected
  if (selectedConversationId) {
    return (
      <div className={cn(
        'flex flex-col pb-safe',
        isMobile ? 'h-[calc(100dvh-9.5rem)]' : 'h-[calc(100dvh-8rem)]'
      )}>
        <div className="p-2 border-b">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {isMobile ? 'Back' : 'Back to messages'}
          </Button>
        </div>
        <ConversationThread
          conversationId={selectedConversationId}
          currentUserId={userId}
          showHeader={true}
          className="flex-1"
          foundryId={foundryId}
          members={members}
          enableCommands={true}
          tasks={tasks}
          objectives={objectives}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Inbox</h1>
            {totalUnread > 0 && (
              <Badge className="ml-2 bg-international-orange">{totalUnread} unread</Badge>
            )}
          </div>
          <p className={typography.pageSubtitle}>
            Messages, activity, and conversations with your team and experts
          </p>
        </div>
        {/* Hide button when dialog is open to prevent visual clutter/bleed-through */}
        <Button
          onClick={() => setShowCompose(true)}
          className={cn(
            "bg-international-orange hover:bg-international-orange-hover w-full sm:w-auto",
            showCompose && "invisible"
          )}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Message
        </Button>
      </div>

      {/* Needs Attention Banner */}
      <NeedsAttentionSummary
        overdueCount={overdueCount}
        approvalsCount={approvalsCount}
        blockersCount={blockersCount}
      />

      {/* Main Content with Tabs */}
      <div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="w-full grid grid-cols-2 mb-4">
              <TabsTrigger value="conversations" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                {isMobile ? 'Chats' : 'Conversations'}
                {totalUnread > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-international-orange text-white">
                    {totalUnread}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-2">
                <Activity className="h-4 w-4" />
                Activity
                {(initialActivityCounts?.unread || 0) > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-electric-blue text-white">
                    {initialActivityCounts?.unread}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="conversations" className="mt-0">
              {/* Search */}
              <div className="relative max-w-full sm:max-w-md mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Conversation List */}
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-3 p-4 border rounded-lg">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-60" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-16">
                  <MessageSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No conversations yet</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Start messaging team members, discuss tasks, or contact experts from the marketplace.
                  </p>
                  {/* Hide button when dialog is open to prevent visual clutter/bleed-through */}
                  <Button
                    onClick={() => setShowCompose(true)}
                    className={cn(
                      "bg-international-orange hover:bg-international-orange-hover",
                      showCompose && "invisible"
                    )}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Start a Conversation
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Channels */}
                  {channels.length > 0 && (
                    <div>
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        Channels
                      </h2>
                      <div className="space-y-2">
                        {channels.map((conv) => (
                          <ConversationListItem
                            key={conv.id}
                            conversation={conv}
                            currentUserId={userId}
                            onClick={() => handleSelectConversation(conv.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Direct Messages */}
                  {dms.length > 0 && (
                    <div>
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Direct Messages
                      </h2>
                      <div className="space-y-2">
                        {dms.map((conv) => (
                          <ConversationListItem
                            key={conv.id}
                            conversation={conv}
                            currentUserId={userId}
                            onClick={() => handleSelectConversation(conv.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Experts */}
                  {experts.length > 0 && (
                    <div>
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Experts
                      </h2>
                      <div className="space-y-2">
                        {experts.map((conv) => (
                          <ConversationListItem
                            key={conv.id}
                            conversation={conv}
                            currentUserId={userId}
                            onClick={() => handleSelectConversation(conv.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {searchQuery && filteredConversations.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">
                        No conversations match "{searchQuery}"
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-0">
              <ActivityStream 
                initialItems={initialActivityItems} 
                initialCounts={initialActivityCounts}
                onTaskClick={handleTaskClick}
                members={members}
                currentUserId={userId}
                userRole={userRole}
              />
            </TabsContent>
          </Tabs>
      </div>

      {/* Quick compose dialog */}
      <QuickComposeDialog
        open={showCompose}
        onOpenChange={setShowCompose}
        onConversationCreated={(convId) => {
          setShowCompose(false)
          setSelectedConversationId(convId)
          refresh()
        }}
      />

      {/* Task detail dialog from activity stream */}
      {selectedTask && (
        <FullTaskView
          open={taskDialogOpen}
          onOpenChange={(open) => {
            setTaskDialogOpen(open)
            if (!open) {
              setSelectedTask(null)
            }
          }}
          task={selectedTask}
          members={members}
          currentUserId={userId}
        />
      )}
    </div>
  )
}

function getConversationTypeLabel(type: ConversationType | undefined): string {
  switch (type) {
    case 'task':
      return 'Task'
    case 'objective':
      return 'Objective'
    case 'expert':
    case 'marketplace':
      return 'Expert'
    case 'direct':
    default:
      return ''
  }
}

function ConversationListItem({
  conversation,
  currentUserId,
  onClick
}: {
  conversation: ConversationWithParticipants
  currentUserId: string
  onClick: () => void
}) {
  const displayName = getConversationDisplayName(conversation, currentUserId)
  const Icon = getConversationIcon(conversation.conversation_type)
  const isChannel = conversation.conversation_type === 'task' || conversation.conversation_type === 'objective'
  const otherParticipant = conversation.buyer?.id === currentUserId ? conversation.seller : conversation.buyer
  const typeLabel = getConversationTypeLabel(conversation.conversation_type)

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted transition-colors text-left"
    >
      {isChannel ? (
        <div className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
          conversation.conversation_type === 'task' 
            ? "bg-status-info-light" 
            : "bg-status-success-light"
        )}>
          <Icon className={cn(
            "h-5 w-5",
            conversation.conversation_type === 'task' 
              ? "text-status-info" 
              : "text-status-success"
          )} />
        </div>
      ) : (
        <UserAvatar
          name={otherParticipant?.full_name}
          avatarUrl={otherParticipant?.avatar_url}
          size="md"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isChannel && typeLabel && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {typeLabel}
              </Badge>
            )}
            <span className={cn(
              'text-sm truncate',
              conversation.unread_count && conversation.unread_count > 0 
                ? 'font-semibold text-foreground' 
                : 'font-medium text-foreground'
            )}>
              {!isChannel && '@'} {displayName}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {conversation.last_message && (
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(conversation.last_message.created_at), { addSuffix: true })}
              </span>
            )}
            {conversation.unread_count && conversation.unread_count > 0 && (
              <Badge variant="default" className="h-5 min-w-[20px] px-1.5 text-xs bg-international-orange">
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </Badge>
            )}
          </div>
        </div>
        {conversation.last_message && (
          <p className="text-sm text-muted-foreground truncate mt-1">
            {conversation.last_message.content || 'File attachment'}
          </p>
        )}
      </div>
    </button>
  )
}

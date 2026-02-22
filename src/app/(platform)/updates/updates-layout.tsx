'use client'

/**
 * UpdatesLayout - Main client layout for the Comms page.
 *
 * INTENT: Combines activity feed and conversations into a single "Comms" hub.
 * Users previously had to navigate between /updates (activity) and /messages
 * (conversations) — this merge puts everything in one place.
 *
 * @description Two-tab responsive layout:
 * - "Activity" tab: Feed left, thread right (original Updates behavior)
 * - "Conversations" tab: Conversation list left, chat thread right
 *
 * Responsive breakpoints:
 * - Large (1280px+): Two panels side by side
 * - Medium (768-1279px): Narrower left panel + right panel
 * - Small (below 768px): Single column with tap-to-navigate
 *
 * @component
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Activity, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { getActivityFeed, markMultipleActivityRead } from '@/actions/activity'
import { UpdatesHeader } from '@/components/updates/updates-header'
import { UpdatesFeed } from '@/components/updates/updates-feed'
import { UpdatesThreadPanel } from '@/components/updates/updates-thread-panel'
import { ThreadEmptyState } from '@/components/updates/updates-empty-state'
import { ConversationsPanel } from '@/components/updates/conversations-panel'
import { ConversationThread } from '@/components/messaging/ConversationThread'
import { QuickComposeDialog } from '@/components/messaging/QuickComposeDialog'
import { useConversationList } from '@/hooks/useConversation'
import type { ActivityItem, ActivityFilter } from '@/types/activity'

const LARGE_BREAKPOINT = 1280
const MEDIUM_BREAKPOINT = 768

interface TeamMember {
  id: string
  full_name: string
  email: string
  role: string
}

interface UpdatesLayoutProps {
  initialItems: ActivityItem[]
  userId: string
  foundryId: string
  bannerSlot?: React.ReactNode
  members?: TeamMember[]
}

type CommsView = 'activity' | 'conversations'

export function UpdatesLayout({
  initialItems,
  userId,
  foundryId,
  bannerSlot,
  members = [],
}: UpdatesLayoutProps) {
  // ── View state ──────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<CommsView>('activity')

  // ── Activity state ──────────────────────────────────────────────────────
  const [items, setItems] = useState<ActivityItem[]>(initialItems)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedSource, setSelectedSource] = useState<{
    type: 'task' | 'objective' | 'conversation'
    id: string
  } | null>(() => {
    if (initialItems.length === 0) return null
    const firstItem = initialItems[0]
    return {
      type: firstItem.source.type as 'task' | 'objective' | 'conversation',
      id: firstItem.source.id
    }
  })

  // ── Conversation state ──────────────────────────────────────────────────
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const { conversations, isLoading: conversationsLoading, refresh: refreshConversations } = useConversationList(userId)
  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [conversations]
  )

  // ── Layout state ────────────────────────────────────────────────────────
  const [screenSize, setScreenSize] = useState<'large' | 'medium' | 'small'>('large')
  const [showThread, setShowThread] = useState(false)

  useEffect(() => {
    const checkScreenSize = (): void => {
      const width = window.innerWidth
      if (width >= LARGE_BREAKPOINT) setScreenSize('large')
      else if (width >= MEDIUM_BREAKPOINT) setScreenSize('medium')
      else setScreenSize('small')
    }
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  // ── Activity handlers ───────────────────────────────────────────────────
  const fetchItems = useCallback(async (newFilter: ActivityFilter) => {
    setIsLoading(true)
    try {
      const result = await getActivityFeed({
        limit: 50,
        filter: newFilter,
        showAllFoundryActivity: true,
        includeSystemLogs: false
      })
      if (result.success && result.data) {
        setItems(result.data)
      } else if (!result.success) {
        console.error('[CommsLayout] Activity feed returned error:', result.error)
        toast.error(result.error || 'Failed to load updates')
      }
    } catch (error) {
      console.error('[CommsLayout] Failed to fetch activity:', error instanceof Error ? error.message : 'Unknown error')
      toast.error('Failed to load updates')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleFilterChange = useCallback((newFilter: ActivityFilter) => {
    setFilter(newFilter)
    fetchItems(newFilter)
  }, [fetchItems])

  const handleSelectItem = useCallback((item: ActivityItem) => {
    setSelectedSource({
      type: item.source.type as 'task' | 'objective' | 'conversation',
      id: item.source.id
    })
    setShowThread(true)
  }, [])

  const handleBack = useCallback(() => {
    setShowThread(false)
    if (activeView === 'activity') {
      setSelectedSource(null)
    } else {
      setSelectedConversationId(null)
    }
  }, [activeView])

  const [isMarkingRead, setIsMarkingRead] = useState(false)

  const handleMarkAllRead = useCallback(async () => {
    const unreadItems = items
      .filter(i => i.is_unread && (i.type === 'task_comment' || i.type === 'objective_comment'))
      .map(i => ({
        type: i.type as 'task_comment' | 'objective_comment',
        commentId: i.id
      }))
    if (unreadItems.length === 0) return
    setIsMarkingRead(true)
    try {
      const result = await markMultipleActivityRead(unreadItems)
      if (result.success) {
        setItems(prev => prev.map(item => ({ ...item, is_unread: false })))
        toast.success(`Marked ${unreadItems.length} items as read`)
      } else {
        console.error('[CommsLayout] Mark all read returned error:', result.error)
        toast.error(result.error || 'Failed to mark items as read')
      }
    } catch (error) {
      console.error('[CommsLayout] Failed to mark all read:', error instanceof Error ? error.message : 'Unknown error')
      toast.error('Failed to mark items as read')
    } finally {
      setIsMarkingRead(false)
    }
  }, [items])

  const handleItemsRead = useCallback(() => {
    if (selectedSource) {
      setItems(prev => prev.map(item => {
        if (item.source.type === selectedSource.type && item.source.id === selectedSource.id) {
          return { ...item, is_unread: false }
        }
        return item
      }))
    }
  }, [selectedSource])

  // ── Conversation handlers ───────────────────────────────────────────────
  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id)
    setShowThread(true)
  }, [])

  const handleConversationCreated = useCallback((convId: string) => {
    setShowCompose(false)
    setSelectedConversationId(convId)
    setShowThread(true)
    refreshConversations()
  }, [refreshConversations])

  // ── Computed values ─────────────────────────────────────────────────────
  const unreadCount = useMemo(() => items.filter(i => i.is_unread).length, [items])
  const tasksWithUpdates = useMemo(() => {
    const taskIds = new Set<string>()
    items.filter(i => i.is_unread && i.source.type === 'task').forEach(i => taskIds.add(i.source.id))
    return taskIds.size
  }, [items])
  const objectivesWithUpdates = useMemo(() => {
    const objIds = new Set<string>()
    items.filter(i => i.is_unread && i.source.type === 'objective').forEach(i => objIds.add(i.source.id))
    return objIds.size
  }, [items])
  const selectedItemKey = selectedSource
    ? `${selectedSource.type}:${selectedSource.id}`
    : null

  // ── Tab bar ─────────────────────────────────────────────────────────────
  const TabBar = (
    <div className="flex items-center gap-1 px-4 sm:px-6 lg:px-8 py-2 border-b border-muted bg-background">
      <button
        onClick={() => setActiveView('activity')}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          activeView === 'activity'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        <Activity className="h-3.5 w-3.5" />
        Activity
        {unreadCount > 0 && (
          <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-semibold rounded-full bg-international-orange text-white">
            {unreadCount}
          </span>
        )}
      </button>
      <button
        onClick={() => setActiveView('conversations')}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          activeView === 'conversations'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Conversations
        {totalUnread > 0 && (
          <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-semibold rounded-full bg-electric-blue text-white">
            {totalUnread}
          </span>
        )}
      </button>
    </div>
  )

  // ── Left panel content ──────────────────────────────────────────────────
  const LeftPanel = activeView === 'activity' ? (
    <UpdatesFeed
      items={items}
      selectedItemId={selectedItemKey}
      filter={filter}
      isLoading={isLoading}
      onSelectItem={handleSelectItem}
      onFilterChange={handleFilterChange}
    />
  ) : (
    <ConversationsPanel
      conversations={conversations}
      isLoading={conversationsLoading}
      currentUserId={userId}
      selectedConversationId={selectedConversationId}
      onSelectConversation={handleSelectConversation}
      onNewMessage={() => setShowCompose(true)}
    />
  )

  // ── Right panel content ─────────────────────────────────────────────────
  const RightPanel = activeView === 'activity' ? (
    selectedSource ? (
      <UpdatesThreadPanel
        sourceType={selectedSource.type}
        sourceId={selectedSource.id}
        currentUserId={userId}
        onItemsRead={handleItemsRead}
      />
    ) : (
      <ThreadEmptyState />
    )
  ) : (
    selectedConversationId ? (
      <ConversationThread
        conversationId={selectedConversationId}
        currentUserId={userId}
        showHeader={true}
        className="h-full"
        foundryId={foundryId}
        members={members}
        enableCommands={true}
      />
    ) : (
      <ConversationEmptyState />
    )
  )

  // ── LARGE SCREEN ────────────────────────────────────────────────────────
  if (screenSize === 'large') {
    return (
      <div className="flex flex-col h-[calc(100dvh-2rem)] -m-4 sm:-m-6 lg:-m-8">
        <div className="p-4 sm:p-6 lg:p-8 pb-4 border-b border-slate-100">
          <UpdatesHeader
            unreadCount={unreadCount}
            tasksWithUpdates={tasksWithUpdates}
            objectivesWithUpdates={objectivesWithUpdates}
            onMarkAllRead={handleMarkAllRead}
            isMarkingRead={isMarkingRead}
          />
        </div>

        {TabBar}

        {bannerSlot && activeView === 'activity' && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4 shrink-0">
            {bannerSlot}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="w-[380px] xl:w-[420px] border-r border-muted flex flex-col overflow-hidden">
            {LeftPanel}
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            {RightPanel}
          </div>
        </div>

        {showCompose && (
          <QuickComposeDialog
            open={showCompose}
            onOpenChange={setShowCompose}
            onConversationCreated={handleConversationCreated}
          />
        )}
      </div>
    )
  }

  // ── MEDIUM SCREEN ───────────────────────────────────────────────────────
  if (screenSize === 'medium') {
    return (
      <div className="flex flex-col h-[calc(100dvh-2rem)] -m-4 sm:-m-6 lg:-m-8">
        <div className="p-4 sm:p-6 pb-4 border-b border-slate-100">
          <UpdatesHeader
            unreadCount={unreadCount}
            tasksWithUpdates={tasksWithUpdates}
            objectivesWithUpdates={objectivesWithUpdates}
            onMarkAllRead={handleMarkAllRead}
            isMarkingRead={isMarkingRead}
          />
        </div>

        {TabBar}

        {bannerSlot && activeView === 'activity' && (
          <div className="px-4 sm:px-6 pt-4 shrink-0">
            {bannerSlot}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="w-[320px] border-r border-muted flex flex-col overflow-hidden">
            {LeftPanel}
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            {RightPanel}
          </div>
        </div>

        {showCompose && (
          <QuickComposeDialog
            open={showCompose}
            onOpenChange={setShowCompose}
            onConversationCreated={handleConversationCreated}
          />
        )}
      </div>
    )
  }

  // ── SMALL SCREEN (Mobile) ──────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100dvh-2rem)] -m-4 pb-20 sm:pb-0">
      {showThread && (activeView === 'activity' ? selectedSource : selectedConversationId) ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 p-3 border-b border-muted">
            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            {activeView === 'activity' && selectedSource ? (
              <UpdatesThreadPanel
                sourceType={selectedSource.type}
                sourceId={selectedSource.id}
                currentUserId={userId}
                onItemsRead={handleItemsRead}
              />
            ) : selectedConversationId ? (
              <ConversationThread
                conversationId={selectedConversationId}
                currentUserId={userId}
                showHeader={true}
                className="h-full"
                foundryId={foundryId}
                members={members}
                enableCommands={true}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full">
          <div className="p-4 pb-3 border-b border-slate-100">
            <UpdatesHeader
              unreadCount={unreadCount}
              tasksWithUpdates={tasksWithUpdates}
              objectivesWithUpdates={objectivesWithUpdates}
              onMarkAllRead={handleMarkAllRead}
              isMarkingRead={isMarkingRead}
            />
          </div>

          {TabBar}

          {bannerSlot && activeView === 'activity' && (
            <div className="px-4 pt-3 shrink-0">
              {bannerSlot}
            </div>
          )}

          <div className="flex-1 min-h-0">
            {LeftPanel}
          </div>
        </div>
      )}

      {showCompose && (
        <QuickComposeDialog
          open={showCompose}
          onOpenChange={setShowCompose}
          onConversationCreated={handleConversationCreated}
        />
      )}
    </div>
  )
}

function ConversationEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-1">Select a conversation</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Pick a conversation from the list to view messages, or start a new one.
      </p>
    </div>
  )
}

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

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { usePageBriefing } from '@/hooks/use-page-briefing'
import { generatePageBriefing } from '@/actions/specialist-page-insights'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import { cn } from '@/lib/utils'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { ArrowLeft, Activity, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
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
  // ── Briefing ────────────────────────────────────────────────────────────
  const briefingContext = useMemo(() =>
    `Activity items: ${initialItems.length}, Team members: ${members.length}`,
    [initialItems.length, members.length]
  )

  const briefing = usePageBriefing(
    () => generatePageBriefing('chief-of-staff', briefingContext, 'success'),
    'success',
    true,
    'briefing-updates',
  )

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

  // ── Deep linking ─────────────────────────────────────────────────────────
  const searchParams = useSearchParams()
  const router = useRouter()
  const initializedRef = useRef(false)

  // Read URL params on mount
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const view = searchParams.get('view') as CommsView | null
    const thread = searchParams.get('thread')
    const id = searchParams.get('id')

    // VALIDATION: Only accept UUID-shaped IDs in deep links
    const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

    if (view === 'conversations') {
      setActiveView('conversations')
      if (id && isUUID(id)) {
        setSelectedConversationId(id)
        setShowThread(true)
      }
    } else if (view === 'activity' || !view) {
      setActiveView('activity')
      if (thread) {
        const [type, sourceId] = thread.split(':') as [string, string]
        if ((type === 'task' || type === 'objective' || type === 'conversation') && sourceId && isUUID(sourceId)) {
          setSelectedSource({ type, id: sourceId })
          setShowThread(true)
        }
      }
    }
  }, [searchParams])

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('view', activeView)

    if (activeView === 'activity' && selectedSource) {
      params.set('thread', `${selectedSource.type}:${selectedSource.id}`)
    } else if (activeView === 'conversations' && selectedConversationId) {
      params.set('id', selectedConversationId)
    }

    const newUrl = `/updates?${params.toString()}`
    router.replace(newUrl, { scroll: false })
  }, [activeView, selectedSource, selectedConversationId, router])

  // ── Activity feed realtime ────────────────────────────────────────────────
  const supabaseClient = useMemo(() => {
    return createClient()
  }, [])

  useEffect(() => {
    if (activeView !== 'activity') return

    const channel = supabaseClient
      .channel(`activity-feed-${foundryId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_comments'
        },
        async (payload: { new: { id: string; user_id: string; content: string; created_at: string; task_id: string; is_system_log: boolean } }) => {
          const row = payload.new
          // Skip own comments and system logs
          if (row.user_id === userId || row.is_system_log) return

          // Fetch author + task info
          const [{ data: author }, { data: task }] = await Promise.all([
            supabaseClient.from('profiles').select('id, full_name, avatar_url, role').eq('id', row.user_id).single(),
            supabaseClient.from('tasks').select('id, title, task_number').eq('id', row.task_id).single()
          ])

          if (!author || !task) return

          const newItem: ActivityItem = {
            id: row.id,
            type: 'task_comment',
            content: row.content,
            created_at: row.created_at,
            author: { id: author.id, full_name: author.full_name, avatar_url: author.avatar_url, role: author.role },
            source: { type: 'task', id: task.id, title: task.title, task_number: task.task_number },
            is_unread: true,
            is_system_log: false
          }

          setItems(prev => {
            if (prev.some(i => i.id === newItem.id)) return prev
            return [newItem, ...prev]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'objective_comments'
        },
        async (payload: { new: { id: string; user_id: string; content: string; created_at: string; objective_id: string; is_system_log: boolean } }) => {
          const row = payload.new
          if (row.user_id === userId || row.is_system_log) return

          const [{ data: author }, { data: objective }] = await Promise.all([
            supabaseClient.from('profiles').select('id, full_name, avatar_url, role').eq('id', row.user_id).single(),
            supabaseClient.from('objectives').select('id, title').eq('id', row.objective_id).single()
          ])

          if (!author || !objective) return

          const newItem: ActivityItem = {
            id: row.id,
            type: 'objective_comment',
            content: row.content,
            created_at: row.created_at,
            author: { id: author.id, full_name: author.full_name, avatar_url: author.avatar_url, role: author.role },
            source: { type: 'objective', id: objective.id, title: objective.title },
            is_unread: true,
            is_system_log: false
          }

          setItems(prev => {
            if (prev.some(i => i.id === newItem.id)) return prev
            return [newItem, ...prev]
          })
        }
      )
      .subscribe()

    return () => {
      supabaseClient.removeChannel(channel)
    }
  }, [activeView, foundryId, userId, supabaseClient])

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

  // ── Activity feed pagination ──────────────────────────────────────────────
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Update hasMore when initial items load
  useEffect(() => {
    setHasMore(initialItems.length >= 50)
  }, [initialItems])

  const loadMoreActivity = useCallback(async () => {
    if (isLoadingMore || !hasMore || items.length === 0) return
    setIsLoadingMore(true)
    try {
      const oldestItem = items[items.length - 1]
      const result = await getActivityFeed({
        limit: 50,
        filter,
        showAllFoundryActivity: true,
        includeSystemLogs: false,
        before: oldestItem.created_at
      })
      if (result.success && result.data) {
        setItems(prev => {
          const existingIds = new Set(prev.map(i => i.id))
          const newItems = result.data!.filter(i => !existingIds.has(i.id))
          return [...prev, ...newItems]
        })
        setHasMore(result.hasMore ?? false)
      }
    } catch (error) {
      console.error('[CommsLayout] Failed to load more activity:', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, hasMore, items, filter])

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
    <Tabs value={activeView} onValueChange={(v) => setActiveView(v as CommsView)}>
      <TabsList className="mx-4 sm:mx-6 lg:mx-8 my-2">
        <TabsTrigger value="activity" className="gap-2 text-sm">
          <Activity className="h-3.5 w-3.5" />
          Activity
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-semibold rounded-full bg-international-orange text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="conversations" className="gap-2 text-sm">
          <MessageSquare className="h-3.5 w-3.5" />
          Conversations
          {totalUnread > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-semibold rounded-full bg-electric-blue text-primary-foreground">
              {totalUnread}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
    </Tabs>
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
      onLoadMore={loadMoreActivity}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
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
        <div className="p-4 sm:p-6 lg:p-8 pb-4 border-b border-border">
          <UpdatesHeader
            unreadCount={unreadCount}
            tasksWithUpdates={tasksWithUpdates}
            objectivesWithUpdates={objectivesWithUpdates}
            onMarkAllRead={handleMarkAllRead}
            isMarkingRead={isMarkingRead}
          />
        </div>

        <div className="px-4 sm:px-6 lg:px-8 pt-4 shrink-0">
          <SpecialistBriefingHero
            specialistId="chief-of-staff"
            specialistName="Cal"
            specialistTitle="Chief of Staff"
            narrative={briefing.narrative}
            fallbackMessage="Everything that happened while you weren't looking — task completions, comments, conversations, decisions. I surface what matters and bury the noise. Scan the feed, then star anything that needs your input today."
            isLoading={briefing.isLoading}
            severity={briefing.severity}
            context={{ type: 'general', title: 'Comms', description: 'Cal on comms.', metadata: {} }}
            storageKey="comms"
          />
        </div>

        {TabBar}

        {bannerSlot && activeView === 'activity' && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4 shrink-0">
            {bannerSlot}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="w-[380px] xl:w-[420px] border-r border-border flex flex-col overflow-hidden">
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
        <div className="p-4 sm:p-6 pb-4 border-b border-border">
          <UpdatesHeader
            unreadCount={unreadCount}
            tasksWithUpdates={tasksWithUpdates}
            objectivesWithUpdates={objectivesWithUpdates}
            onMarkAllRead={handleMarkAllRead}
            isMarkingRead={isMarkingRead}
          />
        </div>

        <div className="px-4 sm:px-6 pt-4 shrink-0">
          <SpecialistBriefingHero
            specialistId="chief-of-staff"
            specialistName="Cal"
            specialistTitle="Chief of Staff"
            narrative={briefing.narrative}
            fallbackMessage="Everything that happened while you weren't looking — task completions, comments, conversations, decisions. I surface what matters and bury the noise. Scan the feed, then star anything that needs your input today."
            isLoading={briefing.isLoading}
            severity={briefing.severity}
            context={{ type: 'general', title: 'Comms', description: 'Cal on comms.', metadata: {} }}
            storageKey="comms"
          />
        </div>

        {TabBar}

        {bannerSlot && activeView === 'activity' && (
          <div className="px-4 sm:px-6 pt-4 shrink-0">
            {bannerSlot}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="w-[320px] border-r border-border flex flex-col overflow-hidden">
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
          <div className="flex items-center gap-2 p-3 border-b border-border">
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
          <div className="p-4 pb-3 border-b border-border">
            <UpdatesHeader
              unreadCount={unreadCount}
              tasksWithUpdates={tasksWithUpdates}
              objectivesWithUpdates={objectivesWithUpdates}
              onMarkAllRead={handleMarkAllRead}
              isMarkingRead={isMarkingRead}
            />
          </div>

          <div className="px-4 pt-3 shrink-0">
            <SpecialistBriefingHero
              specialistId="chief-of-staff"
              specialistName="Cal"
              specialistTitle="Chief of Staff"
              narrative={null}
              fallbackMessage="Everything that happened while you weren't looking — task completions, comments, conversations, decisions. I surface what matters and bury the noise. Scan the feed, then star anything that needs your input today."
              isLoading={false}
              severity="success"
              context={{ type: 'general', title: 'Comms', description: 'Cal on comms.', metadata: {} }}
              storageKey="comms"
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
    <EmptyState
      icon={<MessageSquare className="h-10 w-10" />}
      title="Select a conversation"
      description="Pick a conversation from the list to view messages, or start a new one."
      className="h-full"
    />
  )
}

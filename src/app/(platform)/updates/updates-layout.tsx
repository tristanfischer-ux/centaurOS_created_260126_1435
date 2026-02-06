'use client'

/**
 * UpdatesLayout - Main client layout for the Updates page.
 *
 * @description Two-panel responsive layout:
 * - Large (1280px+): Feed left, thread right, side by side
 * - Medium (768-1279px): Feed left (narrower), thread right
 * - Small (below 768px): Single column, tap to navigate to thread
 *
 * @component
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { getActivityFeed, markMultipleActivityRead } from '@/actions/activity'
import { UpdatesHeader } from '@/components/updates/updates-header'
import { UpdatesFeed } from '@/components/updates/updates-feed'
import { UpdatesThreadPanel } from '@/components/updates/updates-thread-panel'
import { ThreadEmptyState } from '@/components/updates/updates-empty-state'
import type { ActivityItem, ActivityFilter } from '@/types/activity'

// Breakpoints matching the Home page pattern
const LARGE_BREAKPOINT = 1280
const MEDIUM_BREAKPOINT = 768

interface UpdatesLayoutProps {
  /** Initial activity items from server */
  initialItems: ActivityItem[]
  /** Current user ID */
  userId: string
  /** Current foundry ID */
  foundryId: string
}

/**
 * Main layout component for the Updates page with responsive two-panel design.
 */
export function UpdatesLayout({
  initialItems,
  userId,
  foundryId
}: UpdatesLayoutProps) {
  // Data state
  const [items, setItems] = useState<ActivityItem[]>(initialItems)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [isLoading, setIsLoading] = useState(false)

  // Selection state — preload the most recent update so the right panel isn't empty
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

  // Layout state
  const [screenSize, setScreenSize] = useState<'large' | 'medium' | 'small'>('large')
  const [showThread, setShowThread] = useState(false)

  // Detect screen size
  useEffect(() => {
    const checkScreenSize = (): void => {
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

  // Fetch items when filter changes
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
      }
    } catch (error) {
      console.error('[UpdatesLayout] Failed to fetch activity:', error)
      toast.error('Failed to load updates')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Handle filter change
  const handleFilterChange = useCallback((newFilter: ActivityFilter) => {
    setFilter(newFilter)
    fetchItems(newFilter)
  }, [fetchItems])

  // Handle item selection
  const handleSelectItem = useCallback((item: ActivityItem) => {
    setSelectedSource({
      type: item.source.type as 'task' | 'objective' | 'conversation',
      id: item.source.id
    })
    setShowThread(true)
  }, [])

  // Handle back (mobile)
  const handleBack = useCallback(() => {
    setShowThread(false)
    setSelectedSource(null)
  }, [])

  // Handle mark all read
  const handleMarkAllRead = useCallback(async () => {
    const unreadItems = items
      .filter(i => i.is_unread && (i.type === 'task_comment' || i.type === 'objective_comment'))
      .map(i => ({
        type: i.type as 'task_comment' | 'objective_comment',
        commentId: i.id
      }))

    if (unreadItems.length === 0) return

    try {
      await markMultipleActivityRead(unreadItems)
      // Update local state
      setItems(prev => prev.map(item => ({ ...item, is_unread: false })))
      toast.success(`Marked ${unreadItems.length} items as read`)
    } catch (error) {
      console.error('[UpdatesLayout] Failed to mark all read:', error)
      toast.error('Failed to mark items as read')
    }
  }, [items])

  // Refresh feed after items are read in thread panel
  const handleItemsRead = useCallback(() => {
    // Update local state to clear unread badges for the selected source
    if (selectedSource) {
      setItems(prev => prev.map(item => {
        if (item.source.type === selectedSource.type && item.source.id === selectedSource.id) {
          return { ...item, is_unread: false }
        }
        return item
      }))
    }
  }, [selectedSource])

  // Compute metrics
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

  // Selected item key for the feed
  const selectedItemKey = selectedSource
    ? `${selectedSource.type}:${selectedSource.id}`
    : null

  // ----- LARGE SCREEN: Two panels side by side -----
  if (screenSize === 'large') {
    return (
      <div className="flex flex-col h-[calc(100vh-2rem)] -m-4 sm:-m-6 lg:-m-8">
        {/* Header */}
        <div className="p-4 sm:p-6 lg:p-8 pb-4 border-b border-slate-100">
          <UpdatesHeader
            unreadCount={unreadCount}
            tasksWithUpdates={tasksWithUpdates}
            objectivesWithUpdates={objectivesWithUpdates}
            onMarkAllRead={handleMarkAllRead}
          />
        </div>

        {/* Two-panel layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Feed */}
          <div className="w-[380px] xl:w-[420px] border-r border-muted flex flex-col">
            <UpdatesFeed
              items={items}
              selectedItemId={selectedItemKey}
              filter={filter}
              isLoading={isLoading}
              onSelectItem={handleSelectItem}
              onFilterChange={handleFilterChange}
            />
          </div>

          {/* Right: Thread panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedSource ? (
              <UpdatesThreadPanel
                sourceType={selectedSource.type}
                sourceId={selectedSource.id}
                currentUserId={userId}
                onItemsRead={handleItemsRead}
              />
            ) : (
              <ThreadEmptyState />
            )}
          </div>
        </div>
      </div>
    )
  }

  // ----- MEDIUM SCREEN: Narrower feed + thread -----
  if (screenSize === 'medium') {
    return (
      <div className="flex flex-col h-[calc(100vh-2rem)] -m-4 sm:-m-6 lg:-m-8">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-4 border-b border-slate-100">
          <UpdatesHeader
            unreadCount={unreadCount}
            tasksWithUpdates={tasksWithUpdates}
            objectivesWithUpdates={objectivesWithUpdates}
            onMarkAllRead={handleMarkAllRead}
          />
        </div>

        {/* Two-panel layout (narrower feed) */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Feed */}
          <div className="w-[320px] border-r border-muted flex flex-col">
            <UpdatesFeed
              items={items}
              selectedItemId={selectedItemKey}
              filter={filter}
              isLoading={isLoading}
              onSelectItem={handleSelectItem}
              onFilterChange={handleFilterChange}
            />
          </div>

          {/* Right: Thread panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedSource ? (
              <UpdatesThreadPanel
                sourceType={selectedSource.type}
                sourceId={selectedSource.id}
                currentUserId={userId}
                onItemsRead={handleItemsRead}
              />
            ) : (
              <ThreadEmptyState />
            )}
          </div>
        </div>
      </div>
    )
  }

  // ----- SMALL SCREEN (Mobile): Single column, tap to navigate -----
  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] -m-4">
      {showThread && selectedSource ? (
        // Thread view (full screen)
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 p-3 border-b border-muted">
            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            <UpdatesThreadPanel
              sourceType={selectedSource.type}
              sourceId={selectedSource.id}
              currentUserId={userId}
              onItemsRead={handleItemsRead}
            />
          </div>
        </div>
      ) : (
        // Feed view (full screen)
        <div className="flex flex-col h-full">
          {/* Compact header for mobile */}
          <div className="p-4 pb-3 border-b border-slate-100">
            <UpdatesHeader
              unreadCount={unreadCount}
              tasksWithUpdates={tasksWithUpdates}
              objectivesWithUpdates={objectivesWithUpdates}
              onMarkAllRead={handleMarkAllRead}
            />
          </div>
          <div className="flex-1 min-h-0">
            <UpdatesFeed
              items={items}
              selectedItemId={selectedItemKey}
              filter={filter}
              isLoading={isLoading}
              onSelectItem={handleSelectItem}
              onFilterChange={handleFilterChange}
            />
          </div>
        </div>
      )}
    </div>
  )
}

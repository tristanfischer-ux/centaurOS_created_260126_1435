'use client'

/**
 * UpdatesFeed Component
 *
 * @description The left panel of the Updates page. Displays a filterable,
 * searchable, time-grouped list of activity items across all tasks and
 * objectives. Groups items by Today, Yesterday, This Week, and Earlier.
 *
 * @component
 */

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Search,
  MessageSquare,
  Target,
  Filter,
  Loader2
} from 'lucide-react'
import { isToday, isYesterday, isThisWeek } from 'date-fns'
import { UpdatesFeedItem } from './updates-feed-item'
import { FeedEmptyState } from './updates-empty-state'
import type { ActivityItem, ActivityFilter } from '@/types/activity'

interface UpdatesFeedProps {
  /** All activity items to display */
  items: ActivityItem[]
  /** Currently selected item ID */
  selectedItemId: string | null
  /** Active filter */
  filter: ActivityFilter
  /** Whether data is loading */
  isLoading: boolean
  /** Callback when an item is clicked */
  onSelectItem: (item: ActivityItem) => void
  /** Callback when filter changes */
  onFilterChange: (filter: ActivityFilter) => void
  onLoadMore?: () => void
  hasMore?: boolean
  isLoadingMore?: boolean
}

/** An activity item enriched with counts from grouping by source. */
interface GroupedActivityItem {
  /** The most recent activity item for this source (used for display). */
  item: ActivityItem
  /** Total number of activity events for this source. */
  totalUpdates: number
  /** Number of unread events for this source. */
  unreadCount: number
}

interface TimeGroup {
  label: string
  items: GroupedActivityItem[]
}

/**
 * Groups raw activity items by their source (task/objective/conversation).
 *
 * @description Each source appears only once, represented by its most recent
 * event. Items are sorted newest-first so the most recent source floats to top.
 *
 * @returns Deduplicated items with totalUpdates and unreadCount per source.
 */
function groupBySource(items: ActivityItem[]): GroupedActivityItem[] {
  const sourceMap = new Map<string, { items: ActivityItem[]; unreadCount: number }>()

  for (const item of items) {
    const key = `${item.source.type}:${item.source.id}`
    const existing = sourceMap.get(key)
    if (existing) {
      existing.items.push(item)
      if (item.is_unread) existing.unreadCount++
    } else {
      sourceMap.set(key, {
        items: [item],
        unreadCount: item.is_unread ? 1 : 0
      })
    }
  }

  // For each source, pick the most recent item as the representative
  const grouped: GroupedActivityItem[] = []
  for (const entry of sourceMap.values()) {
    // Items come sorted newest-first from the server, so [0] is most recent
    const newest = entry.items[0]
    grouped.push({
      item: newest,
      totalUpdates: entry.items.length,
      unreadCount: entry.unreadCount
    })
  }

  // Sort by most recent activity (newest first)
  grouped.sort((a, b) =>
    new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime()
  )

  return grouped
}

/**
 * Groups already-consolidated items by time period: Today, Yesterday, This Week, Earlier.
 */
function groupByTimePeriod(items: GroupedActivityItem[]): TimeGroup[] {
  const groups: Record<string, GroupedActivityItem[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: []
  }

  for (const grouped of items) {
    const date = new Date(grouped.item.created_at)
    if (isToday(date)) {
      groups.today.push(grouped)
    } else if (isYesterday(date)) {
      groups.yesterday.push(grouped)
    } else if (isThisWeek(date, { weekStartsOn: 1 })) {
      groups.thisWeek.push(grouped)
    } else {
      groups.earlier.push(grouped)
    }
  }

  const result: TimeGroup[] = []
  if (groups.today.length > 0) result.push({ label: 'Today', items: groups.today })
  if (groups.yesterday.length > 0) result.push({ label: 'Yesterday', items: groups.yesterday })
  if (groups.thisWeek.length > 0) result.push({ label: 'This Week', items: groups.thisWeek })
  if (groups.earlier.length > 0) result.push({ label: 'Earlier', items: groups.earlier })

  return result
}

/**
 * Main feed list with filters, search, and time-grouped activity items.
 */
export function UpdatesFeed({
  items,
  selectedItemId,
  filter,
  isLoading,
  onSelectItem,
  onFilterChange,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false
}: UpdatesFeedProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Step 1: Group items by source (deduplicate tasks/objectives)
  const groupedItems = useMemo(() => groupBySource(items), [items])

  // Step 2: Apply search filter to grouped items
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return groupedItems

    const query = searchQuery.toLowerCase()
    return groupedItems.filter(({ item }) =>
      item.source.title.toLowerCase().includes(query) ||
      item.content.toLowerCase().includes(query) ||
      item.author.full_name?.toLowerCase().includes(query)
    )
  }, [groupedItems, searchQuery])

  // Step 3: Group by time period
  const timeGroups = useMemo(() => groupByTimePeriod(filteredItems), [filteredItems])

  // Counts based on grouped (deduplicated) sources
  const unreadCount = groupedItems.filter(g => g.unreadCount > 0).length
  const taskCount = groupedItems.filter(g => g.item.source.type === 'task').length
  const objectiveCount = groupedItems.filter(g => g.item.source.type === 'objective').length

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="p-3 border-b border-border space-y-3">
        <Tabs
          value={filter}
          onValueChange={(v) => onFilterChange(v as ActivityFilter)}
        >
          <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="all" className="text-xs gap-1">
              <Filter className="h-3 w-3" />
              All
            </TabsTrigger>
            <TabsTrigger value="unread" className="text-xs gap-1">
              Unread
              {unreadCount > 0 && (
                <Badge className="ml-0.5 h-4 px-1 text-[10px] bg-international-orange text-primary-foreground">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs gap-1">
              <MessageSquare className="h-3 w-3" />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="objectives" className="text-xs gap-1">
              <Target className="h-3 w-3" />
              Objectives
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search updates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Feed content */}
      <ScrollArea className="flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block">
        {isLoading ? (
          <FeedSkeleton />
        ) : timeGroups.length === 0 ? (
          <FeedEmptyState filter={filter} />
        ) : (
          <div className="overflow-x-hidden">
            {timeGroups.map((group) => (
              <div key={group.label}>
                {/* Time group header */}
                <div className="sticky top-0 z-10 px-4 py-2 bg-muted border-b border-border">
                  <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    {group.label}
                  </span>
                </div>

                {/* Items in this group */}
                {group.items.map((grouped) => (
                  <UpdatesFeedItem
                    key={`${grouped.item.source.type}:${grouped.item.source.id}`}
                    item={grouped.item}
                    isSelected={selectedItemId === `${grouped.item.source.type}:${grouped.item.source.id}`}
                    unreadCount={grouped.unreadCount}
                    totalUpdates={grouped.totalUpdates}
                    onClick={() => onSelectItem(grouped.item)}
                  />
                ))}
              </div>
            ))}
            {hasMore && onLoadMore && (
              <div className="flex justify-center py-4">
                <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={isLoadingMore} className="text-xs gap-2">
                  {isLoadingMore ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading...</>) : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/**
 * Loading skeleton for the feed.
 */
function FeedSkeleton() {
  return (
    <div className="p-4 space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="h-2 w-2 rounded-full mt-2" />
          <Skeleton className="h-4 w-4 rounded mt-0.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

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
import {
  Search,
  MessageSquare,
  Target,
  Filter
} from 'lucide-react'
import { isToday, isYesterday, isThisWeek, startOfDay } from 'date-fns'
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
}

interface TimeGroup {
  label: string
  items: ActivityItem[]
}

/**
 * Groups activity items by time period: Today, Yesterday, This Week, Earlier.
 */
function groupByTimePeriod(items: ActivityItem[]): TimeGroup[] {
  const groups: Record<string, ActivityItem[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: []
  }

  for (const item of items) {
    const date = new Date(item.created_at)
    if (isToday(date)) {
      groups.today.push(item)
    } else if (isYesterday(date)) {
      groups.yesterday.push(item)
    } else if (isThisWeek(date, { weekStartsOn: 1 })) {
      groups.thisWeek.push(item)
    } else {
      groups.earlier.push(item)
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
  onFilterChange
}: UpdatesFeedProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter and search items
  const filteredItems = useMemo(() => {
    let result = items

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(item =>
        item.source.title.toLowerCase().includes(query) ||
        item.content.toLowerCase().includes(query) ||
        item.author.full_name?.toLowerCase().includes(query)
      )
    }

    return result
  }, [items, searchQuery])

  // Group by time period
  const timeGroups = useMemo(() => groupByTimePeriod(filteredItems), [filteredItems])

  // Count unread items
  const unreadCount = items.filter(i => i.is_unread).length
  const taskCount = items.filter(i => i.source.type === 'task').length
  const objectiveCount = items.filter(i => i.source.type === 'objective').length

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="p-3 border-b border-muted space-y-3">
        <Tabs
          value={filter}
          onValueChange={(v) => onFilterChange(v as ActivityFilter)}
        >
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="all" className="text-xs gap-1">
              <Filter className="h-3 w-3" />
              All
            </TabsTrigger>
            <TabsTrigger value="unread" className="text-xs gap-1">
              Unread
              {unreadCount > 0 && (
                <Badge className="ml-0.5 h-4 px-1 text-[10px] bg-international-orange text-white">
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
      <ScrollArea className="flex-1">
        {isLoading ? (
          <FeedSkeleton />
        ) : timeGroups.length === 0 ? (
          <FeedEmptyState filter={filter} />
        ) : (
          <div>
            {timeGroups.map((group) => (
              <div key={group.label}>
                {/* Time group header */}
                <div className="sticky top-0 z-10 px-4 py-2 bg-muted/50 backdrop-blur-sm border-b border-muted">
                  <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    {group.label}
                  </span>
                </div>

                {/* Items in this group */}
                {group.items.map((item) => (
                  <UpdatesFeedItem
                    key={item.id}
                    item={item}
                    isSelected={selectedItemId === `${item.source.type}:${item.source.id}`}
                    onClick={() => onSelectItem(item)}
                  />
                ))}
              </div>
            ))}
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

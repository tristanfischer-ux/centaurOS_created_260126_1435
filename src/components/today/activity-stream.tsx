'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActivityItem } from './activity-item'
import { getActivityFeed } from '@/actions/activity'
import { 
  Inbox, 
  CheckSquare, 
  Target, 
  MessageSquare, 
  Bell,
  RefreshCw,
  Loader2,
  History,
  Bot,
  Users
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { ActivityItem as ActivityItemType, ActivityFilter } from '@/types/activity'

interface Member {
  id: string
  full_name: string
  role: string
  email: string
}

// Roles that can see all foundry activity
const ADMIN_ROLES = ['Founder', 'Executive', 'Admin']

interface ActivityStreamProps {
  initialItems: ActivityItemType[]
  initialCounts?: {
    all: number
    tasks: number
    objectives: number
    messages: number
    unread: number
    history: number
  }
  onTaskClick?: (taskId: string) => void
  members?: Member[]
  currentUserId?: string
  userRole?: string
}

export function ActivityStream({ initialItems, initialCounts, onTaskClick, members: _members = [], currentUserId: _currentUserId, userRole }: ActivityStreamProps) {
  const router = useRouter()
  const [items, setItems] = useState<ActivityItemType[]>(initialItems)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [isPending, startTransition] = useTransition()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showSystemLogs, setShowSystemLogs] = useState(false)
  const [showAllFoundryActivity, setShowAllFoundryActivity] = useState(false)
  
  // Check if user has admin privileges
  const isAdmin = userRole && ADMIN_ROLES.includes(userRole)

  // Calculate counts from items
  const counts = initialCounts || {
    all: items.length,
    tasks: items.filter(i => i.type === 'task_comment').length,
    objectives: items.filter(i => i.type === 'objective_comment').length,
    messages: items.filter(i => i.type === 'message').length,
    unread: items.filter(i => i.is_unread).length,
    history: items.filter(i => i.type === 'task_history').length
  }

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter as ActivityFilter)
    
    startTransition(async () => {
      const result = await getActivityFeed({ 
        filter: newFilter as ActivityFilter,
        limit: 30,
        includeSystemLogs: showSystemLogs,
        showAllFoundryActivity
      })
      
      if (result.success && result.data) {
        setItems(result.data)
      }
    })
  }

  const handleSystemLogsToggle = (checked: boolean) => {
    setShowSystemLogs(checked)
    
    startTransition(async () => {
      const result = await getActivityFeed({ 
        filter,
        limit: 30,
        includeSystemLogs: checked,
        showAllFoundryActivity
      })
      
      if (result.success && result.data) {
        setItems(result.data)
      }
    })
  }

  const handleAllFoundryActivityToggle = (checked: boolean) => {
    setShowAllFoundryActivity(checked)
    
    startTransition(async () => {
      const result = await getActivityFeed({ 
        filter,
        limit: 30,
        includeSystemLogs: showSystemLogs,
        showAllFoundryActivity: checked
      })
      
      if (result.success && result.data) {
        setItems(result.data)
      }
    })
  }

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    
    startTransition(async () => {
      const result = await getActivityFeed({ 
        filter,
        limit: 30,
        includeSystemLogs: showSystemLogs,
        showAllFoundryActivity
      })
      
      if (result.success && result.data) {
        setItems(result.data)
      }
      
      setIsRefreshing(false)
    })
  }, [filter, router, showSystemLogs, showAllFoundryActivity])

  const handleReply = useCallback(() => {
    // Refresh the feed after a reply
    handleRefresh()
  }, [handleRefresh])

  const filteredItems = items

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-international-orange" />
            <CardTitle className="text-lg">Activity</CardTitle>
            {counts.unread > 0 && (
              <Badge variant="default" className="bg-international-orange text-white">
                {counts.unread} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="show-system-logs"
                checked={showSystemLogs}
                onCheckedChange={handleSystemLogsToggle}
                disabled={isPending}
              />
              <Label 
                htmlFor="show-system-logs" 
                className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1"
              >
                <Bot className="h-3 w-3" />
                System
              </Label>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing || isPending}
            >
              <RefreshCw className={cn(
                "h-4 w-4",
                (isRefreshing || isPending) && "animate-spin"
              )} />
            </Button>
          </div>
        </div>

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={handleFilterChange}>
          <TabsList className="w-full grid grid-cols-6">
            <TabsTrigger value="all" className="text-xs">
              All
              {counts.all > 0 && (
                <span className="ml-1 text-muted-foreground">({counts.all})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs">
              <CheckSquare className="h-3 w-3 mr-1" />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="objectives" className="text-xs">
              <Target className="h-3 w-3 mr-1" />
              Goals
            </TabsTrigger>
            <TabsTrigger value="messages" className="text-xs">
              <MessageSquare className="h-3 w-3 mr-1" />
              DMs
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              <History className="h-3 w-3 mr-1" />
              Changes
            </TabsTrigger>
            <TabsTrigger value="unread" className="text-xs">
              <Bell className="h-3 w-3 mr-1" />
              Unread
              {counts.unread > 0 && (
                <span className="ml-1 text-international-orange font-semibold">
                  ({counts.unread})
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Admin toggle - only show for Founder/Executive/Admin roles */}
        {isAdmin && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Label 
                htmlFor="all-foundry-activity" 
                className="text-sm font-medium cursor-pointer"
              >
                See all team activity
              </Label>
            </div>
            <Switch
              id="all-foundry-activity"
              checked={showAllFoundryActivity}
              onCheckedChange={handleAllFoundryActivityToggle}
              disabled={isPending}
            />
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-auto space-y-3 pt-0">
        {isPending && !isRefreshing ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            title={filter === 'unread' ? "All caught up!" : "No activity yet"}
            description={
              filter === 'unread' 
                ? "You've read all your messages and comments."
                : "Comments on your tasks and objectives, plus direct messages, will appear here."
            }
            className="py-8"
          />
        ) : (
          <>
            {filteredItems.map((item) => (
              <ActivityItem 
                key={`${item.type}-${item.id}`} 
                item={item} 
                onReply={handleReply}
                onTaskClick={onTaskClick}
              />
            ))}

            {filteredItems.length >= 30 && (
              <div className="text-center py-4">
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

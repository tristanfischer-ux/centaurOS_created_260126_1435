'use client'

import { useEffect, useState } from 'react'
import { Bell, CheckCheck, ExternalLink } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { sanitizeHref } from '@/lib/security/url-validation'

interface Notification {
  id: string
  type: string
  title: string
  message: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    
    // Fetch initial notifications and set up subscription
    const setupNotifications = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        
        // Fetch initial notifications
        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20)
        
        if (data) {
          setNotifications(data)
          setUnreadCount(data.filter(n => !n.is_read).length)
        }
        
        // Subscribe to new notifications for this user
        channel = supabase
          .channel(`notifications:${user.id}`)
          .on(
            'postgres_changes',
            { 
              event: 'INSERT', 
              schema: 'public', 
              table: 'notifications',
              filter: `user_id=eq.${user.id}`
            },
            (payload) => {
              setNotifications(prev => [payload.new as Notification, ...prev])
              setUnreadCount(prev => prev + 1)
            }
          )
          .subscribe()
      } catch (error) {
        // Silently fail if notifications table doesn't exist yet
        console.debug('Notifications not yet available:', error)
      }
    }
    
    setupNotifications()
    
    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [])

  const markAsRead = async (id: string) => {
    try {
      const supabase = createClient()
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
      
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.debug('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false)
      
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.debug('Error marking all notifications as read:', error)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'task_assigned': return '📋'
      case 'task_completed': return '✅'
      case 'comment': return '💬'
      case 'mention': return '@'
      default: return '🔔'
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-foundry-100 transition-colors">
          <Bell className="h-5 w-5 text-foundry-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-international-orange text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-sm">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0 bg-white border-foundry-200" align="end">
        <div className="flex items-center justify-between px-6 py-4 border-b border-foundry-200 bg-foundry-50">
          <h3 className="text-lg font-semibold text-foundry-900">Notifications</h3>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={markAllAsRead}
              className="text-electric-blue hover:text-electric-blue/80 hover:bg-electric-blue/10"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-96">
          {notifications.length === 0 ? (
            <div className="p-12 text-center">
              <Bell className="h-12 w-12 mx-auto mb-4 text-foundry-300" />
              <p className="text-foundry-600 font-medium mb-2">No notifications yet</p>
              <p className="text-sm text-foundry-500">We'll let you know when something important happens</p>
            </div>
          ) : (
            <div className="divide-y divide-foundry-200">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={cn(
                    'p-6 hover:bg-foundry-50 cursor-pointer transition-colors space-y-3',
                    !notification.is_read && 'bg-electric-blue/5 border-l-4 border-l-electric-blue'
                  )}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex gap-4">
                    <span className="text-2xl flex-shrink-0">{getIcon(notification.type)}</span>
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className={cn(
                        'text-base leading-relaxed text-foundry-900',
                        !notification.is_read && 'font-semibold'
                      )}>
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="text-sm text-foundry-600 leading-relaxed">
                          {notification.message}
                        </p>
                      )}
                      <p className="text-xs text-foundry-500">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {/* SECURITY: Sanitize notification link URL */}
                    {notification.link && sanitizeHref(notification.link) !== '#' && (
                      <Link 
                        href={sanitizeHref(notification.link)} 
                        onClick={(e) => e.stopPropagation()}
                        className="flex-shrink-0"
                      >
                        <ExternalLink className="h-4 w-4 text-electric-blue hover:text-electric-blue/80 transition-colors" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

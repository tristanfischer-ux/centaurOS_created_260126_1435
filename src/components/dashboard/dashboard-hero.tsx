'use client'

import Link from 'next/link'
import { Clock, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardHeroProps {
  userName: string
  userRole: string
  totalTasks: number
  todayTasks: number
  overdueCount: number
  unreadCount: number
  activeObjectives: number
  dailyFocus: string
  selectedView: 'overview' | 'tasks' | 'team'
  onViewChange: (view: 'overview' | 'tasks' | 'team') => void
}

/**
 * Hero section with personalized greeting, daily focus, and clickable metrics.
 * The daily focus line gives users an immediate sense of what matters today.
 */
export function DashboardHero({
  userName,
  userRole,
  totalTasks,
  todayTasks,
  overdueCount,
  unreadCount,
  activeObjectives,
  dailyFocus,
  selectedView,
  onViewChange
}: DashboardHeroProps) {
  const greeting = getGreeting()
  const firstName = userName.split(' ')[0] || userName
  
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-international-orange/10 via-orange-100/50 to-amber-50/30 border-b border-orange-200/50">
      {/* Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-international-orange/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-international-orange/3 rounded-full animate-pulse" style={{ animationDuration: '4s' }} />
      </div>
      
      <div className="relative px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Greeting */}
        <div className="space-y-2 mb-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-foreground">
            {greeting}, <span className="text-international-orange">{firstName}</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            {dailyFocus}
          </p>
        </div>
        
        {/* Quick Metrics - Now clickable */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={CheckCircle2}
            label="Active Tasks"
            value={totalTasks}
            color="blue"
            href="/new-tasks"
          />
          <MetricCard
            icon={Clock}
            label="Due Today"
            value={todayTasks}
            color="orange"
            highlight={todayTasks > 0}
            href="/new-tasks"
          />
          <MetricCard
            icon={AlertCircle}
            label="Overdue"
            value={overdueCount}
            color="red"
            highlight={overdueCount > 0}
            href="/new-tasks"
          />
          <MetricCard
            icon={MessageSquare}
            label="Unread"
            value={unreadCount}
            color="purple"
            badge={unreadCount > 0}
            href="/updates"
          />
        </div>
        
        {/* View Tabs */}
        <div className="flex gap-2 flex-wrap">
          <ViewTab
            label="Overview"
            isActive={selectedView === 'overview'}
            onClick={() => onViewChange('overview')}
          />
          <ViewTab
            label="My Tasks"
            isActive={selectedView === 'tasks'}
            onClick={() => onViewChange('tasks')}
          />
          <ViewTab
            label="Team Activity"
            isActive={selectedView === 'team'}
            onClick={() => onViewChange('team')}
          />
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
  highlight = false,
  badge = false,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  color: 'blue' | 'orange' | 'red' | 'purple'
  highlight?: boolean
  badge?: boolean
  href: string
}) {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50 border-blue-200',
    orange: 'text-international-orange bg-orange-50 border-orange-200',
    red: 'text-red-600 bg-red-50 border-red-200',
    purple: 'text-purple-600 bg-purple-50 border-purple-200'
  }
  
  return (
    <Link
      href={href}
      className={cn(
        "relative bg-white/80 backdrop-blur-sm rounded-xl p-4 border transition-all duration-300 block",
        highlight ? "ring-2 ring-international-orange shadow-lg scale-105" : "border-slate-200 hover:shadow-md",
        "group cursor-pointer"
      )}
    >
      {badge && value > 0 && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-international-orange text-white text-xs font-bold rounded-full flex items-center justify-center animate-bounce">
          {value > 9 ? '9+' : value}
        </div>
      )}
      <div className={cn(
        "inline-flex p-2 rounded-lg mb-2",
        colorClasses[color]
      )}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold text-foreground group-hover:text-international-orange transition-colors">
        {value}
      </div>
      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        {label}
      </div>
    </Link>
  )
}

function ViewTab({
  label,
  isActive,
  onClick
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200",
        isActive
          ? "bg-international-orange text-white shadow-md"
          : "bg-white/80 text-muted-foreground hover:bg-white hover:text-foreground border border-slate-200"
      )}
    >
      {label}
    </button>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

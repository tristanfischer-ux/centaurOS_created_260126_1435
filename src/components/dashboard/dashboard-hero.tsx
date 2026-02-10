'use client'

import Link from 'next/link'
import { Clock, CheckCircle2, AlertCircle, MessageSquare, Target, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardHeroProps {
  userName: string
  userRole: string
  totalTasks: number
  todayTasks: number
  overdueCount: number
  unreadCount: number
  activeObjectives: number
  teamOnline: number
  teamTotal: number
  dailyFocus: string
  selectedView: 'overview' | 'tasks' | 'team'
  onViewChange: (view: 'overview' | 'tasks' | 'team') => void
}

/**
 * Hero section with greeting, daily focus, consolidated metrics, and view tabs.
 *
 * @description Combines the original hero metrics (Active Tasks, Due Today,
 * Overdue, Unread) with formerly separate StatsCards metrics (Active Objectives,
 * Team Online) into a single glanceable row. Removed backdrop-blur from
 * metric cards per design rules.
 */
export function DashboardHero({
  userName,
  totalTasks,
  todayTasks,
  overdueCount,
  unreadCount,
  activeObjectives,
  teamOnline,
  teamTotal,
  dailyFocus,
  selectedView,
  onViewChange,
}: DashboardHeroProps) {
  const greeting = getGreeting()
  const firstName = userName.split(' ')[0] || userName

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-international-orange/10 via-orange-100/50 to-amber-50/30 border-b border-orange-200/50">
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-international-orange/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Greeting */}
        <div className="space-y-2 mb-8">
          <h1 className="text-4xl sm:text-5xl font-display font-bold text-foreground">
            {greeting},{' '}
            <span className="text-international-orange">{firstName}</span>
          </h1>
          <p className="text-lg text-muted-foreground">{dailyFocus}</p>
        </div>

        {/* Consolidated metrics — 6 cards in one row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
            icon={Target}
            label="Objectives"
            value={activeObjectives}
            color="purple"
            href="/new-objectives"
          />
          <MetricCard
            icon={Users}
            label="Team Online"
            value={teamOnline}
            subValue={`/ ${teamTotal}`}
            color="green"
            href="/team"
          />
          <MetricCard
            icon={MessageSquare}
            label="Unread"
            value={unreadCount}
            color="orange"
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
  subValue,
  color,
  highlight = false,
  badge = false,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  subValue?: string
  color: 'blue' | 'orange' | 'red' | 'purple' | 'green'
  highlight?: boolean
  badge?: boolean
  href: string
}) {
  const colorClasses = {
    blue: 'text-status-info bg-status-info-light border-status-info/20',
    orange: 'text-international-orange bg-international-orange/10 border-international-orange/20',
    red: 'text-destructive bg-status-error-light border-destructive/20',
    purple: 'text-chart-5 bg-chart-5/10 border-chart-5/20',
    green: 'text-status-success bg-status-success-light border-status-success/20',
  }

  return (
    <Link
      href={href}
      className={cn(
        'relative bg-card rounded-xl p-4 border transition-all duration-200 block',
        highlight
          ? 'ring-2 ring-international-orange shadow-md'
          : 'hover:shadow-md',
        'group cursor-pointer'
      )}
    >
      {badge && value > 0 && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-international-orange text-white text-xs font-bold rounded-full flex items-center justify-center animate-bounce">
          {value > 9 ? '9+' : value}
        </div>
      )}
      <div
        className={cn(
          'inline-flex p-2 rounded-lg mb-2',
          colorClasses[color]
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold text-foreground group-hover:text-international-orange transition-colors">
        {value}
        {subValue && (
          <span className="text-sm font-normal text-muted-foreground">
            {subValue}
          </span>
        )}
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
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200',
        isActive
          ? 'bg-international-orange text-white shadow-md'
          : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground border'
      )}
    >
      {label}
    </button>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

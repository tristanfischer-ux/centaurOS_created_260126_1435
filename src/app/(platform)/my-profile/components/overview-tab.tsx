'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CheckSquare, Target, Users, Mail, Shield, Building2,
  ArrowRight, Settings
} from 'lucide-react'
import Link from 'next/link'

/**
 * OverviewTab - Personal info and platform activity stats.
 *
 * @description Shows personal details (email, role, company) and
 * platform engagement stats (tasks, objectives, team size).
 * Available to all users, not just providers.
 *
 * @component
 */

interface OverviewTabProps {
  /** User's email */
  email: string
  /** User's role */
  role: string
  /** Foundry name */
  foundryName: string | null
  /** Platform stats */
  stats: {
    totalTasks: number
    completedTasks: number
    objectives: number
    teamSize: number
  }
}

export function OverviewTab({ email, role, foundryName, stats }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Activity Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={CheckSquare}
          label="Tasks Assigned"
          value={stats.totalTasks}
          detail={`${stats.completedTasks} completed`}
        />
        <StatCard
          icon={Target}
          label="Objectives"
          value={stats.objectives}
        />
        <StatCard
          icon={Users}
          label="Team Size"
          value={stats.teamSize}
        />
        <StatCard
          icon={CheckSquare}
          label="Completion Rate"
          value={stats.totalTasks > 0
            ? `${Math.round((stats.completedTasks / stats.totalTasks) * 100)}%`
            : '—'
          }
          detail={stats.totalTasks > 0 ? 'of assigned tasks' : 'No tasks yet'}
        />
      </div>

      {/* Personal Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailRow icon={Mail} label="Email" value={email} />
            <DetailRow icon={Shield} label="Role" value={role} />
            <DetailRow
              icon={Building2}
              label="Company"
              value={foundryName || 'No company'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickLink
              href="/settings"
              icon={Settings}
              title="Account Settings"
              description="Update preferences and integrations"
            />
            <QuickLink
              href="/team"
              icon={Users}
              title="Your Team"
              description="View and manage team members"
            />
            <QuickLink
              href="/tasks"
              icon={CheckSquare}
              title="My Tasks"
              description="View your assigned tasks"
            />
            <QuickLink
              href="/objectives"
              icon={Target}
              title="Objectives"
              description="Track goals and progress"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** Stat card used in the stats grid. */
function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  detail?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4 text-international-orange" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {detail && (
          <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
        )}
      </CardContent>
    </Card>
  )
}

/** Detail row in the personal details card. */
function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <p className="text-sm font-medium text-foreground px-3 py-2 bg-muted rounded-lg">
        {value}
      </p>
    </div>
  )
}

/** Quick link card for navigating to other sections. */
function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 p-3 rounded-lg border hover:border-international-orange/50 hover:bg-muted/50 transition-colors"
    >
      <div className="p-1.5 bg-muted rounded-md group-hover:bg-international-orange/10 transition-colors">
        <Icon className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground group-hover:text-international-orange transition-colors">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
    </Link>
  )
}

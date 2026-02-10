'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CheckSquare, Target, Users, Mail, Shield, Building2,
  Pencil, Phone, Linkedin,
} from 'lucide-react'

/**
 * OverviewTab - Personal info and platform activity stats.
 *
 * @description Shows editable personal details (name, email, role, company, bio,
 * phone, LinkedIn) and platform engagement stats (tasks, objectives, team size).
 * Available to all users, not just providers.
 *
 * @component
 */

interface OverviewTabProps {
  /** User's full name */
  fullName: string | null
  /** User's email */
  email: string
  /** User's role */
  role: string
  /** Foundry name */
  foundryName: string | null
  /** User's bio */
  bio: string | null
  /** User's phone number */
  phoneNumber: string | null
  /** User's LinkedIn URL */
  linkedinUrl: string | null
  /** Platform stats */
  stats: {
    totalTasks: number
    completedTasks: number
    objectives: number
    teamSize: number
  }
  /** Callback to open the edit profile dialog */
  onEditClick: () => void
}

export function OverviewTab({
  fullName,
  email,
  role,
  foundryName,
  bio,
  phoneNumber,
  linkedinUrl,
  stats,
  onEditClick,
}: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* About You */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">About You</CardTitle>
            <Button size="sm" variant="outline" onClick={onEditClick}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailRow icon={Mail} label="Email" value={email} />
            <DetailRow icon={Shield} label="Role" value={role} />
            <DetailRow icon={Building2} label="Company" value={foundryName || 'No company'} />
            {phoneNumber && (
              <DetailRow icon={Phone} label="Phone" value={phoneNumber} />
            )}
            {linkedinUrl && (
              <DetailRow icon={Linkedin} label="LinkedIn" value={formatUrl(linkedinUrl)} />
            )}
          </div>

          {/* Bio section */}
          {bio ? (
            <div className="pt-2 border-t border-muted">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Bio
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {bio}
              </p>
            </div>
          ) : (
            <div className="pt-2 border-t border-muted">
              <p className="text-sm text-muted-foreground italic">
                No bio yet — click Edit Profile to tell people about yourself.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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

/** Detail row in the about card. */
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

/** Format a URL for display by removing protocol and trailing slash. */
function formatUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

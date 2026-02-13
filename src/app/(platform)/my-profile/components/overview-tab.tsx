'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CheckSquare, Target, Users, Mail, Shield, Building2,
  Pencil, Phone, Linkedin, TrendingUp, TrendingDown, Minus,
  Award, Zap, Star, Trophy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

import type { ProfileEnrichment } from '../profile-hub-view'

/**
 * OverviewTab - Personal info, enriched activity stats, sparkline, and milestones.
 *
 * @description Shows editable personal details (name, email, role, company, bio,
 * phone, LinkedIn), enhanced platform stats with trend indicators, a 30-day
 * activity sparkline, and computed achievement milestones.
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
  /** Optional enrichment data (sparkline + trends) */
  enrichment?: ProfileEnrichment
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
  enrichment,
  onEditClick,
}: OverviewTabProps) {
  // Compute milestones from stats
  const milestones = computeMilestones(stats)

  // Compute trend text
  const trendText = enrichment
    ? getTrendText(enrichment.completedThisWeek, enrichment.completedLastWeek)
    : null

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

      {/* Activity Sparkline (30-day task completions) */}
      {enrichment && enrichment.sparklineData.some(d => d.count > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Task Completions</CardTitle>
              {trendText && (
                <div className={cn(
                  'flex items-center gap-1 text-xs font-medium',
                  trendText.color,
                )}>
                  <trendText.icon className="h-3.5 w-3.5" />
                  {trendText.text}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Sparkline data={enrichment.sparklineData} />
            <p className="text-xs text-muted-foreground mt-2">
              Last 30 days
            </p>
          </CardContent>
        </Card>
      )}

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

      {/* Milestones */}
      {milestones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {milestones.map((m) => {
                const Icon = m.icon
                return (
                  <div
                    key={m.label}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium',
                      m.achieved
                        ? 'bg-status-success-light text-status-success-dark'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Sparkline ──────────────────────────────────────────────────────────────

/**
 * Sparkline — Lightweight SVG bar chart for 30-day activity visualization.
 *
 * @param {{ data: Array<{ date: string; count: number }> }} props
 */
function Sparkline({ data }: { data: Array<{ date: string; count: number }> }): React.ReactElement {
  const maxCount = Math.max(...data.map(d => d.count), 1)
  const barWidth = 100 / data.length

  return (
    <svg
      viewBox="0 0 100 24"
      className="w-full h-10"
      role="img"
      aria-label="Task completion sparkline over the last 30 days"
    >
      {data.map((d, i) => {
        const height = d.count > 0 ? Math.max((d.count / maxCount) * 20, 2) : 1
        return (
          <rect
            key={d.date}
            x={i * barWidth + 0.3}
            y={24 - height}
            width={Math.max(barWidth - 0.6, 0.8)}
            height={height}
            rx={0.5}
            className={d.count > 0 ? 'fill-international-orange' : 'fill-muted'}
          />
        )
      })}
    </svg>
  )
}

// ─── Trend Text ─────────────────────────────────────────────────────────────

/**
 * Computes trend text and styling for weekly comparison.
 *
 * @param {number} thisWeek - Completions this week
 * @param {number} lastWeek - Completions last week
 * @returns {{ text: string; color: string; icon: React.ElementType } | null}
 */
function getTrendText(
  thisWeek: number,
  lastWeek: number,
): { text: string; color: string; icon: LucideIcon } | null {
  if (thisWeek === 0 && lastWeek === 0) return null

  const diff = thisWeek - lastWeek
  if (diff > 0) {
    return {
      text: `+${diff} vs last week`,
      color: 'text-status-success',
      icon: TrendingUp,
    }
  }
  if (diff < 0) {
    return {
      text: `${diff} vs last week`,
      color: 'text-muted-foreground',
      icon: TrendingDown,
    }
  }
  return {
    text: 'Same as last week',
    color: 'text-muted-foreground',
    icon: Minus,
  }
}

// ─── Milestones ─────────────────────────────────────────────────────────────

interface Milestone {
  label: string
  achieved: boolean
  icon: LucideIcon
}

/**
 * Computes which milestones the user has achieved based on their stats.
 *
 * @param {object} stats - User's platform stats
 * @returns {Milestone[]} Achieved and upcoming milestones
 */
function computeMilestones(stats: {
  totalTasks: number
  completedTasks: number
  objectives: number
  teamSize: number
}): Milestone[] {
  return [
    {
      label: 'First Task',
      achieved: stats.completedTasks >= 1,
      icon: Zap,
    },
    {
      label: '10 Tasks Done',
      achieved: stats.completedTasks >= 10,
      icon: Star,
    },
    {
      label: '50 Tasks Done',
      achieved: stats.completedTasks >= 50,
      icon: Trophy,
    },
    {
      label: 'First Objective',
      achieved: stats.objectives >= 1,
      icon: Target,
    },
    {
      label: '5 Objectives',
      achieved: stats.objectives >= 5,
      icon: Award,
    },
  ]
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Stat card used in the stats grid. */
function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon
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
  icon: LucideIcon
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

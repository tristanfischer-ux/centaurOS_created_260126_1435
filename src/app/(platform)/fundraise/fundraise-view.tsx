/**
 * @file fundraise-view.tsx
 *
 * @description Client component for the Fundraise Dashboard.
 * Shows pipeline stats, funnel chart, coverage analysis, and recent activity.
 */

'use client'

import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from 'recharts'
import {
  Heart, Users, Phone, MessageSquare, CheckCircle2, XCircle,
  AlertTriangle, StickyNote, Calendar, Mail,
} from 'lucide-react'
import Link from 'next/link'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { InsightCardSkeleton } from '@/components/specialists/insight-card-skeleton'
import { usePageInsights } from '@/hooks/use-page-insights'
import { useAdvisorPanel } from '@/contexts/advisor-panel-context'
import { generateFundraiseInsights } from '@/actions/specialist-page-insights'
import type { FundraiseDashboardStats, ShortlistStage } from '@/actions/investors'
import type { AgentInsight } from '@/actions/agent-insights'

const EMPTY_STATE_INSIGHT: AgentInsight = {
  id: 'fiona-fundraise-empty',
  foundry_id: '',
  specialist_id: 'fundraising-advisor',
  insight_type: 'recommendation',
  urgency: 'informational',
  title: 'Start building your fundraise pipeline',
  body: "Head to the Investor Directory and shortlist your first targets. I'll track your pipeline here and help you prioritise outreach.",
  domain_data: {},
  suggested_actions: [],
  is_read: false,
  is_dismissed: false,
  acted_on: false,
  acted_on_at: null,
  created_at: new Date().toISOString(),
  expires_at: null,
}

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

interface FundraiseViewProps {
  initialStats: FundraiseDashboardStats | null
}

const STAGE_CONFIG: Record<ShortlistStage, { label: string; color: string; icon: typeof Heart }> = {
  researching: { label: 'Researching', color: 'hsl(var(--muted-foreground))', icon: Heart },
  contacted: { label: 'Contacted', color: 'hsl(var(--status-info))', icon: Mail },
  meeting: { label: 'Meeting', color: 'hsl(var(--status-warning))', icon: Calendar },
  in_discussion: { label: 'In Discussion', color: 'var(--color-international-orange)', icon: MessageSquare },
  closed_won: { label: 'Closed Won', color: 'hsl(var(--status-success))', icon: CheckCircle2 },
  closed_lost: { label: 'Closed Lost', color: 'hsl(var(--status-destructive))', icon: XCircle },
}

const NOTE_TYPE_ICONS: Record<string, typeof StickyNote> = {
  note: StickyNote,
  meeting: Calendar,
  email: Mail,
  call: Phone,
  milestone: CheckCircle2,
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  if (diff < 0) return 'just now'
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FundraiseView({ initialStats }: FundraiseViewProps) {
  const stats = initialStats

  const { openPanel } = useAdvisorPanel()
  const handleDiscuss = (specialistId: string, context: string) => {
    openPanel(specialistId, { handoffContext: context, contextLabel: 'Fundraise' })
  }

  const { insights, dismissInsight, isLoading: insightsLoading } = usePageInsights(
    () => {
      if (!stats) return Promise.resolve([])
      const firmTypes = Array.from(
        new Set(stats.shortlistedFirms.map(f => f.attributes?.firm_type).filter((t): t is string => typeof t === 'string'))
      )
      return generateFundraiseInsights({
        totalTracked: stats.totalTracked,
        pipelineCounts: stats.pipelineCounts,
        coverageGaps: stats.coverageGaps,
        firmTypes,
        recentActivityCount: stats.recentNotes.length,
      })
    },
    !!stats && stats.totalTracked > 0,
    { cacheKey: 'fiona-fundraise', emptyInsight: EMPTY_STATE_INSIGHT },
  )

  if (!stats || stats.totalTracked === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
        <div className="rounded-full bg-muted p-4">
          <Heart className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">No investors tracked yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Start building your pipeline by shortlisting investors from the directory.
          </p>
        </div>
        <Link
          href="/investors"
          className="text-sm text-international-orange font-medium hover:underline"
        >
          Browse investors →
        </Link>
      </div>
    )
  }

  // Funnel chart data
  const funnelData = (Object.entries(STAGE_CONFIG) as [ShortlistStage, typeof STAGE_CONFIG[ShortlistStage]][])
    .filter(([stage]) => stage !== 'closed_lost')
    .map(([stage, config]) => ({
      name: config.label,
      count: stats.pipelineCounts[stage],
      color: config.color,
    }))

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {(Object.entries(STAGE_CONFIG) as [ShortlistStage, typeof STAGE_CONFIG[ShortlistStage]][]).map(([stage, config]) => {
          const Icon = config.icon
          return (
            <Card key={stage}>
              <CardContent className="p-4 text-center">
                <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold text-foreground">{stats.pipelineCounts[stage]}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{config.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Fiona's proactive insights */}
      {insightsLoading && <InsightCardSkeleton />}
      {insights.length > 0 && (
        <div className="space-y-3">
          {insights.map((insight) => (
            <SpecialistInsightCard
              key={insight.id}
              insight={insight}
              onDismiss={() => dismissInsight(insight.id)}
              onDiscuss={handleDiscuss}
              compact
            />
          ))}
        </div>
      )}

      {/* Two-column: Funnel + Coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Funnel */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-foreground">Pipeline Funnel</h2>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={funnelData}
                  margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
                >
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {funnelData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Coverage Analysis */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-foreground">Coverage Analysis</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stage coverage */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Investor Types</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(new Set(stats.shortlistedFirms.map(f => f.attributes?.firm_type).filter((t): t is string => typeof t === 'string'))).map(type => (
                  <Badge key={type} variant="secondary" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1 text-success" />
                    {type}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Stage focus coverage */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Stage Coverage</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(new Set(stats.shortlistedFirms.flatMap(f => f.attributes?.stage_focus ?? []))).slice(0, 8).map(stage => (
                  <Badge key={stage} variant="outline" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1 text-success" />
                    {stage}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Gaps */}
            {stats.coverageGaps.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Gaps</p>
                <div className="space-y-1.5">
                  {stats.coverageGaps.map((gap, i) => (
                    <p key={i} className="text-xs text-warning flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {gap}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {stats.coverageGaps.length === 0 && (
              <p className="text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3" />
                Good coverage across types and stages
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Recent Activity</h2>
          <Link
            href="/investors?view=board"
            className="text-xs text-international-orange hover:underline"
          >
            View all →
          </Link>
        </CardHeader>
        <CardContent>
          {stats.recentNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No activity yet. Add notes on investor detail pages.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.recentNotes.map((note) => {
                const Icon = NOTE_TYPE_ICONS[note.note_type] ?? StickyNote
                return (
                  <div key={note.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{relativeTime(note.created_at)}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium text-foreground capitalize">{note.note_type}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-foreground font-medium truncate">{note.firmName}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{note.content}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

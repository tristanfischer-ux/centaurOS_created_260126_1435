'use client'

/**
 * @file SalesPipelineSection.tsx
 *
 * @description Sales pipeline activity: outreach campaigns, RFQ flow, and
 * discovery call metrics. Three sub-panels show the full buyer journey.
 */

import { useId } from 'react'
import { Megaphone, Mail, FileText, Phone } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  formatPence,
} from '@/components/reports/report-visuals'

import type { SalesPipelineSectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

// DECISION: Recharts doesn't support CSS variables for fill/stroke, so HSL
// values are hardcoded here. Must stay in sync with design tokens.
const INTERNATIONAL_ORANGE = 'hsl(14, 100%, 50%)'
const ELECTRIC_BLUE = 'hsl(217, 91%, 60%)'
const EMERALD = 'hsl(160, 84%, 39%)'
const AMBER = 'hsl(38, 92%, 50%)'
const PURPLE = 'hsl(271, 91%, 65%)'
const AXIS_TICK_COLOR = 'hsl(215, 16%, 47%)'
const GRID_COLOR = '#e2e8f0'
const TOOLTIP_BORDER = 'hsl(214, 32%, 91%)'

const FUNNEL_COLORS = [
  INTERNATIONAL_ORANGE,
  ELECTRIC_BLUE,
  EMERALD,
  AMBER,
  PURPLE,
]

interface SalesPipelineSectionProps extends SalesPipelineSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

function StatRow({ label, value, suffix }: { label: string; value: number | string; suffix?: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">
        {value}{suffix}
      </span>
    </div>
  )
}

export function SalesPipelineSection({
  outreach,
  rfqs,
  discoveryCalls,
  sectionNarrative,
  funnelStages,
  chartImageUrl,
  templateId,
  sectionNumber,
}: SalesPipelineSectionProps): React.JSX.Element {
  const uid = useId()
  const hasOutreach = outreach.activeCampaigns > 0 || outreach.emailsSent > 0
  const hasRFQs = rfqs.sentThisPeriod > 0 || rfqs.openCount > 0
  const hasCalls = discoveryCalls.scheduled > 0

  const isEmpty = !hasOutreach && !hasRFQs && !hasCalls

  // INTENT: Build funnel data from props or derive from outreach/rfqs data
  const funnelData = funnelStages ?? [
    { name: 'Contacts Reached', value: outreach.contactsReached },
    { name: 'Emails Sent', value: outreach.emailsSent },
    { name: 'Replies', value: outreach.repliesReceived },
    { name: 'RFQs Sent', value: rfqs.sentThisPeriod },
    { name: 'Awarded', value: rfqs.awarded },
  ]

  return (
    <div className="space-y-8">
      <ReportSectionHeader
        title="Sales Pipeline"
        icon={Megaphone}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      <SectionNarrativeIntro narrative={sectionNarrative} />

      {chartImageUrl && (
        <div className="rounded-xl overflow-hidden border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={chartImageUrl} alt="" className="w-full h-auto" aria-hidden="true" />
        </div>
      )}

      {isEmpty ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No pipeline activity this period.</p>
        </div>
      ) : (
        <>
          {/* Pipeline funnel chart */}
          <Card>
            <CardContent className="p-6">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                    <defs>
                      {FUNNEL_COLORS.map((color, i) => (
                        <linearGradient key={i} id={`${uid}-funnelGrad${i}`} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={color} stopOpacity={1} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                      axisLine={false}
                      tickLine={false}
                      width={120}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: `1px solid ${TOOLTIP_BORDER}`,
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                        fontSize: '13px',
                      }}
                    />
                    <Bar
                      dataKey="value"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={28}
                    >
                      {funnelData.map((_, i) => (
                        <Cell key={i} fill={`url(#${uid}-funnelGrad${i % FUNNEL_COLORS.length})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Funnel legend */}
              <div className="flex flex-wrap gap-3 mt-3">
                {funnelData.map((stage, i) => (
                  <div key={stage.name} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }}
                    />
                    <span className="text-xs text-muted-foreground">{stage.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
          {/* Outreach */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-international-orange/10">
                  <Mail className="h-4 w-4 text-international-orange" />
                </div>
                <h3 className="text-sm font-semibold">Outreach</h3>
              </div>
              <div className="divide-y divide-border">
                <StatRow label="Active campaigns" value={outreach.activeCampaigns} />
                <StatRow label="Contacts reached" value={outreach.contactsReached} />
                <StatRow label="Emails sent" value={outreach.emailsSent} />
                <StatRow label="Replies" value={outreach.repliesReceived} />
                <StatRow label="Reply rate" value={outreach.replyRate} suffix="%" />
              </div>
              {outreach.topCampaignName && (
                <p className="text-xs text-muted-foreground">
                  Top campaign: <span className="font-medium text-foreground">{outreach.topCampaignName}</span>
                </p>
              )}
            </CardContent>
          </Card>

          {/* RFQs */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-electric-blue/10">
                  <FileText className="h-4 w-4 text-electric-blue" />
                </div>
                <h3 className="text-sm font-semibold">RFQs</h3>
              </div>
              <div className="divide-y divide-border">
                <StatRow label="Open" value={rfqs.openCount} />
                <StatRow label="Sent this period" value={rfqs.sentThisPeriod} />
                <StatRow label="Responses" value={rfqs.responsesReceived} />
                <StatRow label="Awarded" value={rfqs.awarded} />
                {rfqs.pipelineValue > 0 && (
                  <StatRow label="Pipeline value" value={formatPence(rfqs.pipelineValue)} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Discovery Calls */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-status-success/10">
                  <Phone className="h-4 w-4 text-status-success" />
                </div>
                <h3 className="text-sm font-semibold">Discovery Calls</h3>
              </div>
              <div className="divide-y divide-border">
                <StatRow label="Scheduled" value={discoveryCalls.scheduled} />
                <StatRow label="Completed" value={discoveryCalls.completed} />
                <StatRow label="Conversions" value={discoveryCalls.conversions} />
                <StatRow label="No-shows" value={discoveryCalls.noShows} />
              </div>
              {discoveryCalls.completed > 0 && (
                <p className="text-xs text-muted-foreground">
                  Conversion rate:{' '}
                  <span className="font-medium text-foreground">
                    {Math.round((discoveryCalls.conversions / discoveryCalls.completed) * 100)}%
                  </span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        </>
      )}
    </div>
  )
}

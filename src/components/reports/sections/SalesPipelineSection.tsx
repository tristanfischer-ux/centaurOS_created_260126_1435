'use client'

/**
 * @file SalesPipelineSection.tsx
 *
 * @description Sales pipeline activity: outreach campaigns, RFQ flow, and
 * discovery call metrics. Three sub-panels show the full buyer journey.
 */

import { Megaphone, Mail, FileText, Phone } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  formatPence,
} from '@/components/reports/report-visuals'

import type { SalesPipelineSectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

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
  templateId,
  sectionNumber,
}: SalesPipelineSectionProps): React.JSX.Element {
  const hasOutreach = outreach.activeCampaigns > 0 || outreach.emailsSent > 0
  const hasRFQs = rfqs.sentThisPeriod > 0 || rfqs.openCount > 0
  const hasCalls = discoveryCalls.scheduled > 0

  const isEmpty = !hasOutreach && !hasRFQs && !hasCalls

  return (
    <div className="space-y-8">
      <ReportSectionHeader
        title="Sales Pipeline"
        icon={Megaphone}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      <SectionNarrativeIntro narrative={sectionNarrative} />

      {isEmpty ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No pipeline activity this period.</p>
        </div>
      ) : (
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
      )}
    </div>
  )
}

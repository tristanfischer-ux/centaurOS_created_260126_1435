'use client'

/**
 * @file WorkshopSourceSection.tsx
 *
 * @description Source phase report section — RFQ pipeline, response stats,
 * manufacturing orders by status.
 */

import { ShoppingCart, FileText, Factory } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  StatCallout,
  formatPence,
} from '@/components/reports/report-visuals'

import type { WorkshopSourceSectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

interface WorkshopSourceSectionProps extends WorkshopSourceSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  delivered: 'success',
  confirmed: 'success',
  in_production: 'warning',
  assembling: 'warning',
  shipping: 'warning',
  draft: 'secondary',
  quoting: 'secondary',
  cancelled: 'destructive',
}

export function WorkshopSourceSection({
  rfqPipeline,
  rfqResponseStats,
  orderSummary,
  sectionNarrative,
  templateId,
  sectionNumber,
}: WorkshopSourceSectionProps): React.JSX.Element {
  const isEmpty = rfqPipeline.total === 0 && orderSummary.total === 0

  return (
    <div className="space-y-8">
      <ReportSectionHeader
        title="Workshop: Source"
        icon={ShoppingCart}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      <SectionNarrativeIntro narrative={sectionNarrative} />

      {isEmpty ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No sourcing activity recorded.</p>
        </div>
      ) : (
        <>
          {/* RFQ pipeline */}
          {rfqPipeline.total > 0 && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-electric-blue/10">
                    <FileText className="h-4 w-4 text-electric-blue" />
                  </div>
                  <h3 className="text-sm font-semibold">RFQ Pipeline</h3>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold font-display">{rfqPipeline.total}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display text-electric-blue">{rfqPipeline.open}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display text-international-orange">{rfqPipeline.bidding}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bidding</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display text-status-success">{rfqPipeline.awarded}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Awarded</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display text-muted-foreground">{rfqPipeline.closed}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Closed</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
                  <span>Responses: <strong className="text-foreground">{rfqResponseStats.totalResponses}</strong></span>
                  <span>Avg per RFQ: <strong className="text-foreground">{rfqResponseStats.averagePerRFQ}</strong></span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Manufacturing orders */}
          {orderSummary.total > 0 && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-international-orange/10">
                    <Factory className="h-4 w-4 text-international-orange" />
                  </div>
                  <h3 className="text-sm font-semibold">Manufacturing Orders</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <StatCallout value={String(orderSummary.total)} label="Total Orders" size="md" />
                  </div>
                  <div className="text-center">
                    <StatCallout
                      value={formatPence(orderSummary.totalEstimatedValue * 100)}
                      label="Estimated Value"
                      size="md"
                    />
                  </div>
                </div>

                {orderSummary.byStatus.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {orderSummary.byStatus.map(({ status, count }) => (
                      <Badge
                        key={status}
                        variant={STATUS_VARIANT[status] ?? 'secondary'}
                        className="text-[10px] capitalize"
                      >
                        {status.replace(/_/g, ' ')}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

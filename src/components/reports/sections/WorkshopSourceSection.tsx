'use client'

/**
 * @file WorkshopSourceSection.tsx
 *
 * @description Source phase report section — RFQ pipeline, response stats,
 * manufacturing orders, quote analytics, supplier metrics, and deltas.
 */

import { ShoppingCart, FileText, Factory, Users, Clock, PoundSterling } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  StatCallout,
  TrendArrow,
  formatPence,
} from '@/components/reports/report-visuals'
import { calculatePercentChange, getTrendDirection } from '@/lib/reports/trends'

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
  previousRfqTotal,
  previousOrderTotal,
  previousOrderValue,
  quoteStats,
  avgLeadTimeWeeks,
  shortlistRate,
  budgetCompliance,
  avgResponseDays,
  uniqueSupplierCount,
}: WorkshopSourceSectionProps): React.JSX.Element {
  const isEmpty = rfqPipeline.total === 0 && orderSummary.total === 0

  // Deltas
  const rfqDelta = previousRfqTotal != null
    ? calculatePercentChange(rfqPipeline.total, previousRfqTotal)
    : undefined
  const orderDelta = previousOrderTotal != null
    ? calculatePercentChange(orderSummary.total, previousOrderTotal)
    : undefined
  const valueDelta = previousOrderValue != null
    ? calculatePercentChange(orderSummary.totalEstimatedValue, previousOrderValue)
    : undefined

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
                    <p className="text-lg font-bold font-display">
                      {rfqPipeline.total}
                      {rfqDelta != null && (
                        <TrendArrow
                          trend={getTrendDirection(rfqDelta)}
                          changePercent={Math.round(rfqDelta)}
                          className="ml-1 text-xs align-middle"
                        />
                      )}
                    </p>
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

          {/* Quote analytics */}
          {quoteStats != null && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-international-orange/10">
                    <PoundSterling className="h-4 w-4 text-international-orange" />
                  </div>
                  <h3 className="text-sm font-semibold">Quote Analytics</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold font-display">{formatPence(quoteStats.avg * 100)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Quote</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display">{formatPence(quoteStats.min * 100)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Min</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display">{formatPence(quoteStats.max * 100)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Max</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display">{quoteStats.count}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Quotes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Supplier metrics row */}
          {(uniqueSupplierCount != null || shortlistRate != null || avgLeadTimeWeeks != null) && (
            <div className="grid gap-4 md:grid-cols-3">
              {uniqueSupplierCount != null && (
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Users className="h-3.5 w-3.5 text-electric-blue" />
                    </div>
                    <StatCallout value={String(uniqueSupplierCount)} label="Unique Suppliers" size="sm" />
                  </CardContent>
                </Card>
              )}
              {shortlistRate != null && (
                <Card>
                  <CardContent className="p-4 text-center">
                    <StatCallout value={`${shortlistRate}%`} label="Shortlist Rate" size="sm" />
                  </CardContent>
                </Card>
              )}
              {avgLeadTimeWeeks != null && (
                <Card>
                  <CardContent className="p-4 text-center">
                    <StatCallout value={`${avgLeadTimeWeeks}w`} label="Avg Lead Time" size="sm" />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Response velocity + budget compliance */}
          {(avgResponseDays != null || budgetCompliance != null) && (
            <div className="grid gap-4 md:grid-cols-2">
              {avgResponseDays != null && (
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Clock className="h-3.5 w-3.5 text-international-orange" />
                    </div>
                    <StatCallout
                      value={`${avgResponseDays}d`}
                      label="Avg Response Time"
                      size="sm"
                    />
                  </CardContent>
                </Card>
              )}
              {budgetCompliance != null && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 text-center">
                      Budget Compliance
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Badge variant="success" className="text-[10px]">
                        Within: {budgetCompliance.withinBudget}
                      </Badge>
                      <Badge variant="destructive" className="text-[10px]">
                        Over: {budgetCompliance.overBudget}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        Under: {budgetCompliance.underBudget}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
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
                    <StatCallout
                      value={String(orderSummary.total)}
                      label="Total Orders"
                      size="md"
                      trend={orderDelta != null ? getTrendDirection(orderDelta) : undefined}
                      changePercent={orderDelta != null ? Math.round(orderDelta) : undefined}
                    />
                  </div>
                  <div className="text-center">
                    <StatCallout
                      value={formatPence(orderSummary.totalEstimatedValue * 100)}
                      label="Estimated Value"
                      size="md"
                      trend={valueDelta != null ? getTrendDirection(valueDelta) : undefined}
                      changePercent={valueDelta != null ? Math.round(valueDelta) : undefined}
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

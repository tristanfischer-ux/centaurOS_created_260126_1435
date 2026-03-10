'use client'

/**
 * @file WorkshopAssembleSection.tsx
 *
 * @description Assemble phase report section — order list with status badges,
 * at-risk/on-track/delivered stats.
 */

import { Package, AlertTriangle, CheckCircle2, Truck } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  StatCallout,
  formatPence,
} from '@/components/reports/report-visuals'

import type { WorkshopAssembleSectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

interface WorkshopAssembleSectionProps extends WorkshopAssembleSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

const ORDER_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  delivered: 'success',
  shipping: 'warning',
  assembling: 'warning',
  in_production: 'warning',
  confirmed: 'secondary',
  quoting: 'secondary',
  draft: 'secondary',
  cancelled: 'destructive',
}

export function WorkshopAssembleSection({
  orders,
  statusCounts,
  totalOrders,
  sectionNarrative,
  templateId,
  sectionNumber,
}: WorkshopAssembleSectionProps): React.JSX.Element {
  const isEmpty = totalOrders === 0

  return (
    <div className="space-y-8">
      <ReportSectionHeader
        title="Workshop: Assemble"
        icon={Package}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      <SectionNarrativeIntro narrative={sectionNarrative} />

      {isEmpty ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No assembly orders recorded.</p>
        </div>
      ) : (
        <>
          {/* Status summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <StatCallout value={String(statusCounts.inProduction)} label="In Production" size="sm" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <StatCallout value={String(statusCounts.assembling)} label="Assembling" size="sm" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Truck className="h-3.5 w-3.5 text-international-orange" />
                </div>
                <StatCallout value={String(statusCounts.shipping)} label="Shipping" size="sm" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                </div>
                <StatCallout value={String(statusCounts.delivered)} label="Delivered" size="sm" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                {statusCounts.atRisk > 0 && (
                  <div className="flex items-center justify-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  </div>
                )}
                <StatCallout value={String(statusCounts.atRisk)} label="At Risk" size="sm" />
              </CardContent>
            </Card>
          </div>

          {/* Orders list */}
          <div className="space-y-2">
            {orders.slice(0, 15).map(order => {
              const isOverdue = order.requiredBy != null
                && new Date(order.requiredBy) < new Date()
                && order.status !== 'delivered' && order.status !== 'cancelled'

              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3 bg-card"
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{order.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{order.orderNumber}</span>
                      {order.projectName && (
                        <>
                          <span className="text-border">|</span>
                          <span className="truncate">{order.projectName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    {order.estimatedCost != null && (
                      <span className="text-xs text-muted-foreground">
                        {formatPence(order.estimatedCost * 100)}
                      </span>
                    )}
                    {order.requiredBy && (
                      <span className={`text-[10px] ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                        Due {new Date(order.requiredBy).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    <Badge
                      variant={ORDER_STATUS_VARIANT[order.status] ?? 'secondary'}
                      className="text-[10px] capitalize"
                    >
                      {order.status.replace(/_/g, ' ')}
                    </Badge>
                    {isOverdue && (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    )}
                  </div>
                </div>
              )
            })}
            {orders.length > 15 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                + {orders.length - 15} more orders
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

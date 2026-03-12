'use client'

/**
 * @file WorkshopSpecifySection.tsx
 *
 * @description Specify phase report section — review health bar, cost overview,
 * process/material badges, and diagnostic breakdown table.
 */

import { ClipboardCheck, ShieldCheck, PoundSterling } from 'lucide-react'

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

import type { WorkshopSpecifySectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

interface WorkshopSpecifySectionProps extends WorkshopSpecifySectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

const VERDICT_COLORS: Record<string, string> = {
  pass: 'hsl(142, 71%, 45%)',
  warn: 'hsl(38, 92%, 50%)',
  fail: 'hsl(0, 72%, 51%)',
  pending: 'hsl(215, 16%, 75%)',
  skipped: 'hsl(215, 16%, 87%)',
}

export function WorkshopSpecifySection({
  reviewHealth,
  costOverview,
  processBreakdown,
  materialBreakdown,
  diagnosticTable,
  sectionNarrative,
  templateId,
  sectionNumber,
  previousReviewHealth,
  previousAveragePerUnitCost,
}: WorkshopSpecifySectionProps): React.JSX.Element {
  const totalReviews = reviewHealth.pass + reviewHealth.warn + reviewHealth.fail + reviewHealth.pending + reviewHealth.skipped
  const isEmpty = totalReviews === 0 && !costOverview && processBreakdown.length === 0

  // Review health delta (compare pass counts)
  const prevPassCount = previousReviewHealth
    ? previousReviewHealth.pass
    : undefined
  const passCountDelta = prevPassCount != null
    ? calculatePercentChange(reviewHealth.pass, prevPassCount)
    : undefined

  // Cost delta
  const costDelta = previousAveragePerUnitCost != null && costOverview
    ? calculatePercentChange(costOverview.totalEstimatedCost, previousAveragePerUnitCost)
    : undefined

  return (
    <div className="space-y-8">
      <ReportSectionHeader
        title="Workshop: Specify"
        icon={ClipboardCheck}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      <SectionNarrativeIntro narrative={sectionNarrative} />

      {isEmpty ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No specification data recorded yet.</p>
        </div>
      ) : (
        <>
          {/* Review health bar */}
          {totalReviews > 0 && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-status-success/10">
                    <ShieldCheck className="h-4 w-4 text-status-success" />
                  </div>
                  <h3 className="text-sm font-semibold">Review Health</h3>
                </div>

                {/* Stacked bar */}
                <div className="h-4 rounded-full overflow-hidden flex bg-muted">
                  {(['pass', 'warn', 'fail', 'pending', 'skipped'] as const).map(verdict => {
                    const count = reviewHealth[verdict]
                    if (count === 0) return null
                    const pct = (count / totalReviews) * 100
                    return (
                      <div
                        key={verdict}
                        style={{
                          width: `${pct}%`,
                          backgroundColor: VERDICT_COLORS[verdict],
                        }}
                        title={`${verdict}: ${count}`}
                      />
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-3">
                  {(['pass', 'warn', 'fail', 'pending', 'skipped'] as const).map(verdict => {
                    const count = reviewHealth[verdict]
                    if (count === 0) return null
                    return (
                      <div key={verdict} className="flex items-center gap-1.5 text-xs">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: VERDICT_COLORS[verdict] }}
                        />
                        <span className="capitalize">{verdict}</span>
                        <span className="font-semibold">{count}</span>
                      </div>
                    )
                  })}
                  {passCountDelta != null && (
                    <TrendArrow
                      trend={getTrendDirection(passCountDelta)}
                      changePercent={Math.round(passCountDelta)}
                      className="ml-2"
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cost overview */}
          {costOverview != null && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-international-orange/10">
                    <PoundSterling className="h-4 w-4 text-international-orange" />
                  </div>
                  <h3 className="text-sm font-semibold">Cost Estimates</h3>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <StatCallout
                      value={formatPence(costOverview.totalEstimatedCost * 100)}
                      label="Total Estimated"
                      size="sm"
                      trend={costDelta != null ? getTrendDirection(costDelta) : undefined}
                      changePercent={costDelta != null ? Math.round(costDelta) : undefined}
                    />
                  </div>
                  <div className="text-center">
                    <StatCallout
                      value={String(costOverview.projectsCosted)}
                      label="Projects Costed"
                      size="sm"
                    />
                  </div>
                  <div className="text-center">
                    <StatCallout
                      value={`${Math.round(costOverview.averageConfidence * 100)}%`}
                      label="Avg Confidence"
                      size="sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Process & material badges */}
          {(processBreakdown.length > 0 || materialBreakdown.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              {processBreakdown.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Processes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {processBreakdown.map(({ process, count }) => (
                      <Badge key={process} variant="secondary" className="text-[10px]">
                        {process}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {materialBreakdown.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Materials
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {materialBreakdown.map(({ material, count }) => (
                      <Badge key={material} variant="secondary" className="text-[10px]">
                        {material}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Diagnostic table */}
          {diagnosticTable.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Diagnostic Breakdown
              </p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2.5 text-xs font-medium text-muted-foreground">Question</th>
                      <th className="text-left p-2.5 text-xs font-medium text-muted-foreground">Top Answers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticTable.map(row => (
                      <tr key={row.question} className="border-t border-border">
                        <td className="p-2.5 font-medium">{row.question}</td>
                        <td className="p-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {row.topAnswers.map(({ answer, count }) => (
                              <Badge key={answer} variant="secondary" className="text-[10px]">
                                {answer} ({count})
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

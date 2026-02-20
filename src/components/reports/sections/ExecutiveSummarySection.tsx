'use client'

/**
 * @file ExecutiveSummarySection.tsx
 *
 * @description Rich visual executive summary with narrative in a styled card,
 * and highlights rendered as visual callout cards instead of plain bullets.
 */

import { AlignLeft, Lightbulb } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { ReportSectionHeader } from '@/components/reports/report-visuals'

import type { ExecutiveSummarySectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

interface ExecutiveSummarySectionProps extends ExecutiveSummarySectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

export function ExecutiveSummarySection({
  narrative,
  highlights,
  templateId,
  sectionNumber,
}: ExecutiveSummarySectionProps): React.JSX.Element {
  return (
    <section className="space-y-8">
      <ReportSectionHeader
        title="Executive Summary"
        icon={AlignLeft}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      {/* Narrative in a styled card */}
      <Card className="border-none bg-muted/30">
        <CardContent className="p-6 sm:p-8">
          <p className="text-base leading-[1.8] text-foreground">{narrative}</p>
        </CardContent>
      </Card>

      {/* Visual highlight cards */}
      {highlights.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="h-4 w-4 text-international-orange" />
            <span className="text-sm font-medium text-foreground">Key Highlights</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {highlights.map((highlight, index) => (
              <div
                key={index}
                className="flex items-start gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-international-orange/10">
                  <span className="text-xs font-bold text-international-orange">
                    {index + 1}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-foreground pt-0.5">
                  {highlight}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

'use client'

import type { ExecutiveSummarySectionData } from '@/lib/reports/report-document-types'

type ExecutiveSummarySectionProps = ExecutiveSummarySectionData

export function ExecutiveSummarySection({
  narrative,
  highlights,
}: ExecutiveSummarySectionProps) {
  return (
    <section className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-international-orange" />
        <h2 className="text-2xl font-display font-bold text-foreground">
          Executive Summary
        </h2>
      </div>

      <p className="text-base leading-relaxed text-foreground">{narrative}</p>

      {highlights.length > 0 && (
        <div className="rounded-r-lg border-l-4 border-l-international-orange bg-muted/50 p-5">
          <ul className="space-y-2">
            {highlights.map((highlight, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-international-orange" />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

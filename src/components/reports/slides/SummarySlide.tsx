'use client'

/**
 * @file SummarySlide.tsx
 *
 * @description Closing slide with numbered key takeaways and an optional
 * final sentence. Designed to leave the audience with clear action items.
 */

import type { SummarySlideContent } from '@/lib/reports/slide-deck-types'

interface SummarySlideProps {
  slide: SummarySlideContent
}

export function SummarySlide({ slide }: SummarySlideProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col justify-center px-12 py-10">
      <h2 className="text-2xl sm:text-3xl font-display font-bold leading-tight text-foreground mb-8">
        {slide.headline}
      </h2>

      <div className="space-y-5">
        {slide.takeaways.map((takeaway, index) => (
          <div key={index} className="flex items-start gap-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-international-orange text-white">
              <span className="text-sm font-bold">{index + 1}</span>
            </div>
            <p className="text-base sm:text-lg leading-relaxed text-foreground pt-1">
              {takeaway}
            </p>
          </div>
        ))}
      </div>

      {slide.closingLine && (
        <div className="mt-10 border-t border-muted pt-6">
          <p className="text-base leading-relaxed text-muted-foreground italic">
            {slide.closingLine}
          </p>
        </div>
      )}
    </div>
  )
}

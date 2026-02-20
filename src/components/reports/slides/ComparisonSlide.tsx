'use client'

/**
 * @file ComparisonSlide.tsx
 *
 * @description Two-column comparison layout. Contrasts before/after,
 * problem/solution, old/new, or any two opposing perspectives.
 */

import { cn } from '@/lib/utils'

import type { ComparisonSlideContent } from '@/lib/reports/slide-deck-types'

interface ComparisonSlideProps {
  slide: ComparisonSlideContent
}

export function ComparisonSlide({ slide }: ComparisonSlideProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col justify-center px-12 py-10">
      <h2 className="text-2xl sm:text-3xl font-display font-bold leading-tight text-foreground mb-8">
        {slide.headline}
      </h2>

      {/* Column headers */}
      <div className="grid grid-cols-2 gap-6 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
          <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {slide.leftLabel}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-international-orange" />
          <span className="text-sm font-semibold uppercase tracking-wider text-international-orange">
            {slide.rightLabel}
          </span>
        </div>
      </div>

      {/* Comparison rows */}
      <div className="space-y-3">
        {slide.comparisonPairs.map((pair, index) => (
          <div
            key={index}
            className={cn(
              'grid grid-cols-2 gap-6 rounded-xl p-4',
              index % 2 === 0 ? 'bg-muted/40' : 'bg-transparent'
            )}
          >
            <p className="text-base leading-relaxed text-muted-foreground">
              {pair.left}
            </p>
            <p className="text-base leading-relaxed text-foreground font-medium">
              {pair.right}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

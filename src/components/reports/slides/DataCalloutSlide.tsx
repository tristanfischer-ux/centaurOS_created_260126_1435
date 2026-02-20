'use client'

/**
 * @file DataCalloutSlide.tsx
 *
 * @description Slide dominated by a single impressive metric or data point.
 * The value is displayed at hero scale with a label and contextual explanation.
 */

import type { DataCalloutSlideContent } from '@/lib/reports/slide-deck-types'

interface DataCalloutSlideProps {
  slide: DataCalloutSlideContent
}

export function DataCalloutSlide({ slide }: DataCalloutSlideProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center px-12 py-10 text-center">
      <p className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground mb-4">
        {slide.label}
      </p>

      <span className="text-6xl sm:text-7xl lg:text-8xl font-display font-bold text-international-orange leading-none">
        {slide.value}
      </span>

      <h2 className="mt-6 text-xl sm:text-2xl font-display font-semibold leading-tight text-foreground max-w-lg">
        {slide.headline}
      </h2>

      <p className="mt-4 text-base sm:text-lg leading-relaxed text-muted-foreground max-w-md">
        {slide.context}
      </p>

      {/* Decorative bottom accent */}
      <div className="mt-8 h-1 w-16 rounded-full bg-international-orange/30" />
    </div>
  )
}

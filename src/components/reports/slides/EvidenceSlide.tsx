'use client'

/**
 * @file EvidenceSlide.tsx
 *
 * @description Slide presenting a quote, data point, or proof point with
 * attribution and analytical interpretation.
 */

import { Quote } from 'lucide-react'

import type { EvidenceSlideContent } from '@/lib/reports/slide-deck-types'

interface EvidenceSlideProps {
  slide: EvidenceSlideContent
}

export function EvidenceSlide({ slide }: EvidenceSlideProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col justify-center px-12 py-10">
      <h2 className="text-xl sm:text-2xl font-display font-bold leading-tight text-foreground mb-8">
        {slide.headline}
      </h2>

      {/* Quote block */}
      <div className="relative rounded-2xl bg-muted/40 p-8 pl-12">
        <Quote className="absolute left-4 top-4 h-6 w-6 text-international-orange/40" />

        <blockquote className="text-lg sm:text-xl leading-relaxed text-foreground italic">
          &ldquo;{slide.quote}&rdquo;
        </blockquote>

        {slide.attribution && (
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            &mdash; {slide.attribution}
          </p>
        )}
      </div>

      {/* Analysis */}
      <p className="mt-6 text-base leading-relaxed text-muted-foreground max-w-[85%]">
        {slide.analysis}
      </p>
    </div>
  )
}

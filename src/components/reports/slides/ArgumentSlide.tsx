'use client'

/**
 * @file ArgumentSlide.tsx
 *
 * @description Slide presenting a claim supported by evidence points.
 * Headline states the assertion, supporting points provide the proof.
 */

import { CheckCircle2 } from 'lucide-react'

import type { ArgumentSlideContent } from '@/lib/reports/slide-deck-types'

interface ArgumentSlideProps {
  slide: ArgumentSlideContent
}

export function ArgumentSlide({ slide }: ArgumentSlideProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col justify-center px-12 py-10">
      <h2 className="text-2xl sm:text-3xl font-display font-bold leading-tight text-foreground max-w-[85%]">
        {slide.headline}
      </h2>

      {slide.body && (
        <p className="mt-4 text-base sm:text-lg leading-relaxed text-muted-foreground max-w-[80%]">
          {slide.body}
        </p>
      )}

      {slide.supportingPoints.length > 0 && (
        <div className="mt-8 space-y-4">
          {slide.supportingPoints.map((point, index) => (
            <div
              key={index}
              className="flex items-start gap-4"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-international-orange/10 mt-0.5">
                <CheckCircle2 className="h-4 w-4 text-international-orange" />
              </div>
              <p className="text-base leading-relaxed text-foreground">
                {point}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

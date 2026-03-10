/* eslint-disable @next/next/no-img-element */
'use client'

/**
 * @file HeroInsightSlide.tsx
 *
 * @description Bold, single-insight slide with a large headline and
 * supporting body text. The most visually impactful slide type -- used
 * for core theses, key findings, or strategic conclusions.
 * When imageUrl is present, the layout switches to a 2-column grid:
 * text on the left, image on the right.
 */

import type { HeroInsightSlideContent } from '@/lib/reports/slide-deck-types'

interface HeroInsightSlideProps {
  slide: HeroInsightSlideContent
}

export function HeroInsightSlide({ slide }: HeroInsightSlideProps): React.JSX.Element {
  if (slide.imageUrl) {
    return (
      <div className="grid h-full grid-cols-2 gap-8">
        {/* Left column: text content */}
        <div className="flex flex-col justify-center px-12 py-10">
          {slide.accent && (
            <div className="mb-6">
              <span className="inline-flex items-center rounded-full bg-international-orange/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-international-orange">
                {slide.accent}
              </span>
            </div>
          )}

          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-display font-bold leading-[1.15] text-foreground">
            {slide.headline}
          </h2>

          {slide.body && (
            <p className="mt-6 text-lg sm:text-xl leading-relaxed text-muted-foreground">
              {slide.body}
            </p>
          )}

          {/* Decorative accent bar */}
          <div className="mt-8 h-1 w-20 rounded-full bg-international-orange" />
        </div>

        {/* Right column: image */}
        <div className="relative overflow-hidden">
          <img
            src={slide.imageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col justify-center px-12 py-10">
      {slide.accent && (
        <div className="mb-6">
          <span className="inline-flex items-center rounded-full bg-international-orange/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-international-orange">
            {slide.accent}
          </span>
        </div>
      )}

      <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-display font-bold leading-[1.15] text-foreground max-w-[90%]">
        {slide.headline}
      </h2>

      {slide.body && (
        <p className="mt-6 text-lg sm:text-xl leading-relaxed text-muted-foreground max-w-[80%]">
          {slide.body}
        </p>
      )}

      {/* Decorative accent bar */}
      <div className="mt-8 h-1 w-20 rounded-full bg-international-orange" />
    </div>
  )
}

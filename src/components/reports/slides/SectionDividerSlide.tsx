'use client'

/**
 * @file SectionDividerSlide.tsx
 *
 * @description Full-bleed transition slide between major presentation sections.
 * Dark background with large section title and optional subtitle teaser.
 */

import type { SectionDividerSlideContent } from '@/lib/reports/slide-deck-types'

interface SectionDividerSlideProps {
  slide: SectionDividerSlideContent
}

export function SectionDividerSlide({ slide }: SectionDividerSlideProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-foreground px-12 py-10 text-center">
      {/* Accent line */}
      <div className="mb-8 h-1 w-16 rounded-full bg-international-orange" />

      <h2 className="text-3xl sm:text-4xl font-display font-bold leading-tight text-background max-w-lg">
        {slide.headline}
      </h2>

      {slide.subtitle && (
        <p className="mt-4 text-lg leading-relaxed text-background/60 max-w-md">
          {slide.subtitle}
        </p>
      )}
    </div>
  )
}

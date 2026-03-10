/* eslint-disable @next/next/no-img-element */
'use client'

/**
 * @file SectionDividerSlide.tsx
 *
 * @description Full-bleed transition slide between major presentation sections.
 * Dark background with large section title and optional subtitle teaser.
 * When imageUrl is present, the image renders as a full-bleed background behind
 * the dark overlay so text remains readable.
 */

import type { SectionDividerSlideContent } from '@/lib/reports/slide-deck-types'

interface SectionDividerSlideProps {
  slide: SectionDividerSlideContent
}

export function SectionDividerSlide({ slide }: SectionDividerSlideProps): React.JSX.Element {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-12 py-10 text-center">
      {/* Background image */}
      {slide.imageUrl && (
        <img
          src={slide.imageUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Dark overlay — solid when no image, semi-transparent when image present */}
      <div
        className={
          slide.imageUrl
            ? 'absolute inset-0 bg-foreground/80'
            : 'absolute inset-0 bg-foreground'
        }
      />

      {/* Content — above the overlay */}
      <div className="relative z-10 flex flex-col items-center">
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
    </div>
  )
}

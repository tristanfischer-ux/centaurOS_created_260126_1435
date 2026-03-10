/* eslint-disable @next/next/no-img-element */
'use client'

/**
 * @file TitleSlide.tsx
 *
 * @description Opening slide for a strategic briefing deck. Full-bleed brand
 * color header with company name, presentation title, subtitle, and date.
 * When imageUrl is present, the image is rendered as a background behind the
 * orange band with a semi-transparent overlay to maintain readability.
 */

import type { TitleSlideContent } from '@/lib/reports/slide-deck-types'

interface TitleSlideProps {
  slide: TitleSlideContent
}

export function TitleSlide({ slide }: TitleSlideProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      {/* Brand-colored header band */}
      <div className="relative flex flex-1 flex-col justify-center overflow-hidden px-12 py-10 text-white">
        {/* Background image */}
        {slide.imageUrl && (
          <img
            src={slide.imageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* Orange overlay — solid when no image, semi-transparent when image present */}
        <div
          className={
            slide.imageUrl
              ? 'absolute inset-0 bg-international-orange/80'
              : 'absolute inset-0 bg-international-orange'
          }
        />

        {/* Content — above the overlay */}
        <div className="relative z-10">
          <p className="text-xs font-mono uppercase tracking-[0.3em] opacity-70 mb-6">
            {slide.companyName}
          </p>

          <h1 className="text-4xl sm:text-5xl font-display font-bold leading-[1.1] max-w-[85%]">
            {slide.headline}
          </h1>

          {slide.subtitle && (
            <p className="mt-4 text-lg sm:text-xl leading-relaxed opacity-90 max-w-[75%]">
              {slide.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between bg-foreground px-12 py-4 text-background">
        <p className="text-xs font-medium opacity-80">
          {slide.date}
        </p>
        <p className="text-xs font-display font-bold tracking-wide opacity-60">
          ForgeOS
        </p>
      </div>
    </div>
  )
}

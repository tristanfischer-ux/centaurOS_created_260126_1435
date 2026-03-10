'use client'

/**
 * @file SlideDeckRenderer.tsx
 *
 * @description Paginated slide deck viewer that renders one slide at a time
 * within a 16:9 aspect-ratio container. Supports keyboard navigation,
 * progress tracking, and a print/export mode that renders all slides.
 *
 * INTENT: Replicates the presentation-style viewing experience of NotebookLM
 * briefing documents. Each slide fills the viewport area with its own layout,
 * and the user navigates between slides rather than scrolling.
 *
 * @related
 * - src/lib/reports/slide-deck-types.ts — Slide content types
 * - src/components/reports/slides/ — Individual slide renderers
 * - src/components/reports/ReportDocument.tsx — Scrolling document renderer (counterpart)
 */

import { useState, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Grid3X3 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  TitleSlide,
  HeroInsightSlide,
  ArgumentSlide,
  ComparisonSlide,
  DataCalloutSlide,
  EvidenceSlide,
  SummarySlide,
  SectionDividerSlide,
} from '@/components/reports/slides'

import type { StrategicBriefing, SlideContent } from '@/lib/reports/slide-deck-types'

// ─── Slide Renderer ──────────────────────────────────────────────

function renderSlide(slide: SlideContent): React.ReactNode {
  switch (slide.slideType) {
    case 'title':
      return <TitleSlide slide={slide} />
    case 'hero-insight':
      return <HeroInsightSlide slide={slide} />
    case 'argument':
      return <ArgumentSlide slide={slide} />
    case 'comparison':
      return <ComparisonSlide slide={slide} />
    case 'data-callout':
      return <DataCalloutSlide slide={slide} />
    case 'evidence':
      return <EvidenceSlide slide={slide} />
    case 'summary':
      return <SummarySlide slide={slide} />
    case 'section-divider':
      return <SectionDividerSlide slide={slide} />
    default:
      return null
  }
}

// ─── Component ───────────────────────────────────────────────────

interface SlideDeckRendererProps {
  briefing: StrategicBriefing
  forPrint?: boolean
}

export function SlideDeckRenderer({
  briefing,
  forPrint = false,
}: SlideDeckRendererProps): React.JSX.Element {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isOverview, setIsOverview] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const totalSlides = briefing.slides.length

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(Math.max(0, Math.min(totalSlides - 1, index)))
    setIsOverview(false)
  }, [totalSlides])

  const goNext = useCallback(() => {
    goToSlide(currentSlide + 1)
  }, [currentSlide, goToSlide])

  const goPrev = useCallback(() => {
    goToSlide(currentSlide - 1)
  }, [currentSlide, goToSlide])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'Escape') {
        if (isOverview) {
          setIsOverview(false)
        } else if (isFullscreen) {
          setIsFullscreen(false)
        }
      } else if (e.key === 'g') {
        setIsOverview(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goNext, goPrev, isOverview, isFullscreen])

  // ─── Print Mode: Render All Slides ───────────────────────────

  if (forPrint) {
    return (
      <div className="space-y-0">
        {briefing.slides.map((slide, index) => (
          <div
            key={index}
            className="aspect-video w-full overflow-hidden bg-background print-page-break"
            style={{ pageBreakAfter: index < totalSlides - 1 ? 'always' : 'auto' }}
          >
            {renderSlide(slide)}
          </div>
        ))}
      </div>
    )
  }

  // ─── Overview Grid Mode ──────────────────────────────────────

  if (isOverview) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">
            {totalSlides} slides &middot; Click to navigate
          </p>
          <Button variant="ghost" size="sm" onClick={() => setIsOverview(false)}>
            <Minimize2 className="mr-1.5 h-3.5 w-3.5" />
            Close Overview
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {briefing.slides.map((slide, index) => (
            <button
              key={index}
              type="button"
              onClick={() => goToSlide(index)}
              className={cn(
                'relative aspect-video w-full overflow-hidden rounded-lg border-2 bg-background transition-all hover:shadow-lg hover:-translate-y-0.5',
                index === currentSlide
                  ? 'border-international-orange ring-2 ring-international-orange/20'
                  : 'border-muted hover:border-foreground/20'
              )}
            >
              <div className="h-full w-full transform scale-[0.25] origin-top-left" style={{ width: '400%', height: '400%' }}>
                {renderSlide(slide)}
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                <span className="text-[10px] font-medium text-white">
                  {index + 1}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ─── Single Slide Mode ───────────────────────────────────────

  return (
    <div className={cn(
      'flex flex-col gap-4',
      isFullscreen && 'fixed inset-0 z-50 bg-background p-6'
    )}>
      {/* Slide container */}
      <div
        className="relative aspect-video w-full overflow-hidden rounded-xl border bg-background shadow-lg"
        role="region"
        aria-label={`Slide ${currentSlide + 1} of ${totalSlides}`}
        aria-roledescription="slide"
      >
        <div key={currentSlide} className="animate-fade-in h-full" style={{ animationDuration: '0.3s' }}>
          {renderSlide(briefing.slides[currentSlide])}
        </div>

        {/* Click zones for navigation */}
        <button
          type="button"
          className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize opacity-0 focus:outline-none"
          onClick={goPrev}
          disabled={currentSlide === 0}
          aria-label="Previous slide"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize opacity-0 focus:outline-none"
          onClick={goNext}
          disabled={currentSlide === totalSlides - 1}
          aria-label="Next slide"
        />
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={goPrev}
            disabled={currentSlide === 0}
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="min-w-[80px] text-center text-sm font-medium text-muted-foreground tabular-nums">
            {currentSlide + 1} / {totalSlides}
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={goNext}
            disabled={currentSlide === totalSlides - 1}
            aria-label="Next slide"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="flex-1 mx-4">
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-international-orange transition-all duration-300"
              style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOverview(true)}
            aria-label="Slide overview"
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

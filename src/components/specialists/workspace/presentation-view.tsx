"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export interface SlideData {
  title: string
  subtitle?: string
  bullets?: string[]
  notes?: string
  layout?: "title" | "content" | "two-column" | "closing"
}

export interface PresentationData {
  title: string
  slides: SlideData[]
  theme?: { primaryColor?: string; secondaryColor?: string }
}

interface PresentationViewProps {
  data: PresentationData | null
  className?: string
}

export function PresentationView({ data, className }: PresentationViewProps): React.ReactElement {
  const [currentIndex, setCurrentIndex] = useState(0)

  if (!data || !data.slides || data.slides.length === 0) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-8", className)}>
        <p className="text-sm text-muted-foreground">
          Ask your specialist to create a presentation. Slides will appear here.
        </p>
      </div>
    )
  }

  const slide = data.slides[currentIndex]
  const isFirst = currentIndex === 0
  const isLast = currentIndex === data.slides.length - 1

  return (
    <div className={cn("flex flex-1 flex-col min-h-0", className)}>
      <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-muted/20">
        <div className="w-full max-w-2xl rounded-lg border bg-card shadow-sm p-8 min-h-[320px] flex flex-col justify-center">
          <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
            {slide.title}
          </h2>
          {slide.subtitle && (
            <p className="text-muted-foreground text-lg mb-4">{slide.subtitle}</p>
          )}
          {slide.bullets && slide.bullets.length > 0 && (
            <ul className="list-disc list-inside space-y-2 text-foreground">
              {slide.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 p-2 border-t bg-background">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          {currentIndex + 1} / {data.slides.length}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentIndex((i) => Math.min(data.slides.length - 1, i + 1))}
          disabled={isLast}
          className="gap-1"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {data.slides.length > 1 && (
        <ScrollArea className="h-20 border-t">
          <div className="flex gap-2 p-2">
            {data.slides.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  "shrink-0 w-24 h-14 rounded border text-left p-2 text-xs truncate transition-colors",
                  i === currentIndex
                    ? "border-international-orange bg-international-orange/10"
                    : "border-muted bg-muted/30 hover:bg-muted/50",
                )}
              >
                {s.title || `Slide ${i + 1}`}
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

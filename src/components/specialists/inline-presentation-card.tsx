"use client"

/**
 * @file inline-presentation-card.tsx
 *
 * @description Renders a parsed slide deck as an interactive carousel
 * inline within the Sage chat. Each slide shows a Gemini-generated
 * hero image (loaded progressively) with title, subtitle, and bullets.
 * Includes navigation and per-deck export actions.
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
    ChevronLeft,
    ChevronRight,
    Download,
    Copy,
    Presentation,
} from "lucide-react"
import { toast } from "sonner"
import { createArtifact } from "@/actions/agent-artifacts"
import { exportAsPDF } from "@/lib/export-utils"

import type { SlideDeckContent, SlideContent } from "@/lib/ai-providers/types"

// ─── Types ──────────────────────────────────────────────────────────────────

interface InlinePresentationCardProps {
    deck: SlideDeckContent
}

interface SlideImageState {
    [slideIndex: number]: {
        status: "idle" | "loading" | "loaded" | "error"
        imageUrl?: string
    }
}

// ─── Image Generation Hook ──────────────────────────────────────────────────

function useSlideImages(slides: SlideContent[]): SlideImageState {
    const [images, setImages] = useState<SlideImageState>({})
    const startedRef = useRef(false)

    useEffect(() => {
        if (startedRef.current) return
        startedRef.current = true

        slides.forEach((slide, index) => {
            if (!slide.imagePrompt) return

            setImages((prev) => ({
                ...prev,
                [index]: { status: "loading" },
            }))

            fetch("/api/agents/slide-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imagePrompt: slide.imagePrompt }),
            })
                .then(async (res) => {
                    if (!res.ok) throw new Error("Failed")
                    const data = await res.json() as { imageUrl: string }
                    setImages((prev) => ({
                        ...prev,
                        [index]: { status: "loaded", imageUrl: data.imageUrl },
                    }))
                })
                .catch(() => {
                    setImages((prev) => ({
                        ...prev,
                        [index]: { status: "error" },
                    }))
                })
        })
    }, [slides])

    return images
}

// ─── Slide Renderer ─────────────────────────────────────────────────────────

function SlideView({
    slide,
    imageState,
}: {
    slide: SlideContent
    imageState?: { status: string; imageUrl?: string }
}): React.ReactElement {
    const hasImage = imageState?.status === "loaded" && imageState.imageUrl
    const isLoading = imageState?.status === "loading"

    return (
        <div className="flex flex-col gap-0 rounded-lg overflow-hidden border bg-card">
            {/* Hero image area */}
            <div className="relative w-full aspect-video bg-foreground/5 overflow-hidden">
                {isLoading && (
                    <Skeleton className="absolute inset-0 rounded-none" />
                )}
                {hasImage && (
                    <img
                        src={imageState.imageUrl}
                        alt={slide.title}
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                )}
                {!hasImage && !isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-international-orange/10 to-electric-blue/10">
                        <Presentation className="h-10 w-10 text-muted-foreground/30" />
                    </div>
                )}
                {/* Title overlay at bottom of image */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
                    <h3 className="text-white font-semibold text-sm leading-tight">
                        {slide.title}
                    </h3>
                    {slide.subtitle && (
                        <p className="text-white/80 text-xs mt-0.5">
                            {slide.subtitle}
                        </p>
                    )}
                </div>
            </div>

            {/* Bullets */}
            {slide.bullets && slide.bullets.length > 0 && (
                <div className="px-3 py-2.5">
                    <ul className="space-y-1">
                        {slide.bullets.map((bullet, i) => (
                            <li
                                key={i}
                                className="text-xs text-foreground flex items-start gap-1.5"
                            >
                                <span className="mt-1.5 h-1 w-1 rounded-full bg-international-orange flex-shrink-0" />
                                <span>{bullet}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function InlinePresentationCard({
    deck,
}: InlinePresentationCardProps): React.ReactElement {
    const [currentSlide, setCurrentSlide] = useState(0)
    const images = useSlideImages(deck.slides)
    const totalSlides = deck.slides.length

    const goNext = useCallback(() => {
        setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1))
    }, [totalSlides])

    const goPrev = useCallback(() => {
        setCurrentSlide((prev) => Math.max(prev - 1, 0))
    }, [])

    const handleCopy = useCallback(async () => {
        const text = deck.slides
            .map((s, i) => {
                let content = `## Slide ${i + 1}: ${s.title}`
                if (s.subtitle) content += `\n${s.subtitle}`
                if (s.bullets?.length) content += `\n${s.bullets.map((b) => `- ${b}`).join("\n")}`
                return content
            })
            .join("\n\n")
        await navigator.clipboard.writeText(`# ${deck.title}\n\n${text}`)
        toast.success("Copied deck to clipboard")
    }, [deck])

    const handleExportPdf = useCallback(async () => {
        const markdown = deck.slides
            .map((s) => {
                let content = `## ${s.title}`
                if (s.subtitle) content += `\n*${s.subtitle}*`
                if (s.bullets?.length) content += `\n${s.bullets.map((b) => `- ${b}`).join("\n")}`
                return content
            })
            .join("\n\n---\n\n")
        await exportAsPDF(`# ${deck.title}\n\n${markdown}`, `${deck.title}.pdf`)
        toast.success("PDF downloaded")
    }, [deck])

    const handleSaveArtifact = useCallback(async () => {
        const markdown = deck.slides
            .map((s) => {
                let content = `## ${s.title}`
                if (s.subtitle) content += `\n*${s.subtitle}*`
                if (s.bullets?.length) content += `\n${s.bullets.map((b) => `- ${b}`).join("\n")}`
                return content
            })
            .join("\n\n---\n\n")
        const { error } = await createArtifact({
            title: deck.title,
            content: `# ${deck.title}\n\n${markdown}`,
            contentType: "document",
            metadata: { source: "inline-presentation" },
        })
        if (error) {
            toast.error(error)
            return
        }
        toast.success("Saved to Deliverables")
    }, [deck])

    const slide = deck.slides[currentSlide]
    if (!slide) return <div />

    return (
        <div className="w-full space-y-2">
            {/* Deck title */}
            <div className="flex items-center gap-2">
                <Presentation className="h-3.5 w-3.5 text-international-orange" />
                <span className="text-xs font-semibold text-foreground">{deck.title}</span>
                <span className="text-xs text-muted-foreground">
                    {currentSlide + 1}/{totalSlides}
                </span>
            </div>

            {/* Current slide */}
            <SlideView slide={slide} imageState={images[currentSlide]} />

            {/* Navigation */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={goPrev}
                        disabled={currentSlide === 0}
                        aria-label="Previous slide"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>

                    {/* Dot indicators */}
                    <div className="flex items-center gap-1 px-1">
                        {deck.slides.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentSlide(i)}
                                className={cn(
                                    "h-1.5 rounded-full transition-all",
                                    i === currentSlide
                                        ? "w-4 bg-international-orange"
                                        : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                                )}
                                aria-label={`Go to slide ${i + 1}`}
                            />
                        ))}
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={goNext}
                        disabled={currentSlide === totalSlides - 1}
                        aria-label="Next slide"
                    >
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>

                {/* Export actions */}
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleCopy}
                        aria-label="Copy deck"
                    >
                        <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleExportPdf}
                        aria-label="Download PDF"
                    >
                        <Download className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleSaveArtifact}
                        aria-label="Save to Deliverables"
                    >
                        <Presentation className="h-3 w-3" />
                    </Button>
                </div>
            </div>
        </div>
    )
}

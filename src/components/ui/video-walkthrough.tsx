"use client"

import { useState, useCallback, useRef } from "react"
import Image from "next/image"
import { Play } from "lucide-react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// ─── URL Helpers ────────────────────────────────────────────────────

/**
 * Checks if a URL points to a direct video file (mp4/webm/mov) or Supabase Storage.
 *
 * @description Direct video URLs are played with native <video> tag instead of iframe.
 * This avoids third-party dependencies and is faster for self-hosted content.
 *
 * @param url - The video URL to check
 * @returns True if the URL should use native <video> playback
 */
function isDirectVideoUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase()
  // Match common video file extensions
  if (/\.(mp4|webm|mov|ogg)(\?|#|$)/.test(trimmed)) return true
  // Match Supabase Storage URLs (always direct files)
  if (trimmed.includes("supabase.co/storage/")) return true
  return false
}

/**
 * Parses a video URL and returns the appropriate embed URL for YouTube, Vimeo, or Loom.
 *
 * @description Converts watch/share URLs to embed format for iframe display.
 * Only used for third-party video hosts — direct URLs use native <video> instead.
 *
 * @param url - The video URL (watch, share, or embed format)
 * @returns The embed URL or null if the URL cannot be parsed
 */
function getEmbedUrl(url: string): string | null {
  try {
    const trimmed = url.trim()
    if (!trimmed) return null

    // YouTube: watch or short URLs
    const youtubeWatch = trimmed.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
    )
    if (youtubeWatch) {
      return `https://www.youtube.com/embed/${youtubeWatch[1]}?autoplay=1`
    }

    // YouTube: already embed
    if (trimmed.includes("youtube.com/embed/")) {
      const sep = trimmed.includes("?") ? "&" : "?"
      return trimmed + (trimmed.includes("autoplay") ? "" : `${sep}autoplay=1`)
    }

    // Vimeo
    const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/)
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`
    }

    // Loom: share URL
    const loomShare = trimmed.match(/loom\.com\/share\/([a-zA-Z0-9]+)/)
    if (loomShare) {
      return `https://www.loom.com/embed/${loomShare[1]}?autoplay=true`
    }

    // Loom: already embed
    if (trimmed.includes("loom.com/embed/")) {
      const sep = trimmed.includes("?") ? "&" : "?"
      return (
        trimmed + (trimmed.includes("autoplay") ? "" : `${sep}autoplay=true`)
      )
    }

    return null
  } catch {
    return null
  }
}

// ─── Types ──────────────────────────────────────────────────────────

export interface VideoWalkthroughProps {
  /** Video URL — supports direct files (mp4/webm), Supabase Storage, YouTube, Vimeo, Loom */
  videoUrl?: string
  /** Thumbnail image URL (shown before play) */
  thumbnailUrl?: string
  /** Video title */
  title: string
  /** Short description */
  description?: string
  /** Duration label (e.g. "60s", "2 min") */
  duration?: string
  /** Playback mode - inline embed or modal */
  mode?: "inline" | "modal"
  /** Callback when video starts playing */
  onPlay?: () => void
  /** Additional CSS classes */
  className?: string
  /** Show a "Coming Soon" state when no videoUrl */
  comingSoon?: boolean
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * VideoWalkthrough - Premium video embed for tutorials and walkthroughs.
 *
 * @description Displays a video card with thumbnail, play button, and metadata.
 * Supports two playback modes:
 *
 * 1. **Native <video>** — for direct URLs (.mp4, .webm, Supabase Storage).
 *    Faster load, no third-party scripts, controls built into the browser.
 *
 * 2. **iframe embed** — for YouTube, Vimeo, and Loom URLs.
 *    Parses share/watch URLs into embed format automatically.
 *
 * Both modes support inline (replaces thumbnail) or modal playback.
 * Shows "Coming Soon" state when video is not yet available.
 *
 * @example
 * // Direct video (Supabase Storage)
 * <VideoWalkthrough
 *   videoUrl="https://xxx.supabase.co/storage/v1/object/public/videos/walkthroughs/overview.mp4"
 *   thumbnailUrl="https://xxx.supabase.co/storage/v1/object/public/videos/thumbnails/overview.jpg"
 *   title="Platform Overview"
 *   duration="60s"
 * />
 *
 * @example
 * // YouTube embed
 * <VideoWalkthrough
 *   videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
 *   title="Getting Started"
 *   duration="2 min"
 * />
 */
export function VideoWalkthrough({
  videoUrl,
  thumbnailUrl,
  title,
  description,
  duration,
  mode = "inline",
  onPlay,
  className,
  comingSoon = false,
}: VideoWalkthroughProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Determine playback strategy
  const isDirect = videoUrl ? isDirectVideoUrl(videoUrl) : false
  const embedUrl = videoUrl && !isDirect ? getEmbedUrl(videoUrl) : null
  const hasVideo = !!((isDirect || embedUrl) && !comingSoon)
  const isDisabled = !hasVideo
  const showComingSoon = comingSoon || (!videoUrl && !!thumbnailUrl)

  const handlePlayClick = useCallback(() => {
    if (isDisabled) return

    onPlay?.()

    if (mode === "inline") {
      setIsPlaying(true)
      // Auto-play native video after state update
      if (isDirect) {
        requestAnimationFrame(() => {
          videoRef.current?.play()
        })
      }
    } else {
      setIsModalOpen(true)
    }
  }, [isDisabled, mode, onPlay, isDirect])

  const handleModalOpenChange = useCallback(
    (open: boolean) => {
      setIsModalOpen(open)
      if (!open) {
        setIframeLoaded(false)
      }
    },
    []
  )

  // Shared render for native <video> element
  const renderNativeVideo = (autoPlay: boolean) => (
    <video
      ref={autoPlay ? undefined : videoRef}
      src={videoUrl}
      poster={thumbnailUrl || undefined}
      controls
      playsInline
      autoPlay={autoPlay}
      className="absolute inset-0 h-full w-full object-contain bg-foreground/5"
      aria-label={title}
    >
      <track kind="captions" />
    </video>
  )

  // Shared render for iframe embed
  const renderIframeEmbed = () => (
    <>
      {!iframeLoaded && (
        <Skeleton className="absolute inset-0 rounded-none" />
      )}
      <iframe
        src={embedUrl!}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className={cn(
          "absolute inset-0 h-full w-full border-0",
          !iframeLoaded && "invisible"
        )}
        onLoad={() => setIframeLoaded(true)}
      />
    </>
  )

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md",
          className
        )}
      >
        {/* Thumbnail / Video area */}
        <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-muted to-muted/50">
          {mode === "inline" && isPlaying && hasVideo ? (
            // Playing state: show video/iframe
            isDirect ? renderNativeVideo(true) : renderIframeEmbed()
          ) : (
            // Idle state: show thumbnail + play button
            <>
              {thumbnailUrl ? (
                <Image
                  src={thumbnailUrl}
                  alt={title}
                  fill
                  unoptimized
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 600px"
                />
              ) : null}

              {/* Coming Soon overlay — shows when video isn't uploaded yet */}
              {showComingSoon && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-foreground/10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground/20 backdrop-blur-sm">
                    <Play className="h-6 w-6 text-white/80" aria-hidden />
                  </div>
                  <span className="rounded-full bg-foreground/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    Video coming soon
                  </span>
                </div>
              )}

              {/* Play button overlay — only when video is available */}
              {!showComingSoon && (
                <button
                  type="button"
                  onClick={handlePlayClick}
                  disabled={isDisabled}
                  aria-label={hasVideo ? `Play ${title}` : "Video coming soon"}
                  className={cn(
                    "absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-all",
                    hasVideo
                      ? "bg-international-orange/90 hover:bg-international-orange hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-international-orange focus-visible:ring-offset-2"
                      : "cursor-not-allowed bg-international-orange/40"
                  )}
                >
                  <Play
                    className="h-6 w-6 fill-white text-white"
                    aria-hidden
                  />
                </button>
              )}

              {/* Duration badge */}
              {duration && hasVideo && (
                <span className="absolute bottom-2 right-2 rounded-full bg-foreground/70 px-2 py-0.5 text-xs font-medium text-white">
                  {duration}
                </span>
              )}
            </>
          )}
        </div>

        {/* Title and description */}
        <div className="p-4">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>

      {/* Modal for video playback */}
      <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
        <DialogContent
          size="lg"
          className="gap-0 p-0 overflow-hidden"
          aria-describedby={undefined}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="relative aspect-video w-full">
            {isDirect
              ? renderNativeVideo(true)
              : embedUrl
                ? renderIframeEmbed()
                : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

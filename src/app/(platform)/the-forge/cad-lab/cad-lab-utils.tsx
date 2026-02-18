"use client"

/**
 * @file cad-lab-utils.tsx — Shared sub-components for The Forge pages.
 *
 * @description Utility components used across multiple The Forge sub-routes:
 * Metric, InlineSvg, SvgView, FullscreenOverlay, and formatRelativeTime.
 */

import { useRef, useEffect, useCallback, useState } from "react"
import dynamic from "next/dynamic"
import type { CadLabResult } from "@/lib/cad-lab-types"
import { Skeleton } from "@/components/ui/skeleton"

const STLViewer = dynamic(
  () => import("@/components/cad/stl-viewer").then((m) => ({ default: m.STLViewer })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full rounded-lg" /> },
)

// ─── Metric ──────────────────────────────────────────────────────────

/**
 * Metric — displays a labeled value in a metrics grid.
 */
export function Metric({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}): React.ReactNode {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground font-mono">{value}</p>
    </div>
  )
}

// ─── InlineSvg ───────────────────────────────────────────────────────

/**
 * InlineSvg — decodes a base64 SVG data URI, renders it inline,
 * and refits the viewBox using the browser's native bounding-box computation.
 *
 * @description Fixes CadQuery's SVG exporter which often produces SVGs with
 * incorrect viewBoxes. Uses getBBox() on individual drawing elements for
 * pixel-perfect content detection, skipping background rects.
 */
export function InlineSvg({
  src,
  alt,
  className,
  onClick,
}: {
  src: string
  alt: string
  className?: string
  onClick?: (e: React.MouseEvent) => void
}): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [fallbackToImg, setFallbackToImg] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    setRenderError(null)
    setFallbackToImg(false)

    if (!src || src.length < 50) {
      console.warn("[InlineSvg] SVG source too short or empty:", src?.slice(0, 80))
      setRenderError("No SVG data available")
      container.innerHTML = ""
      return
    }

    const base64Match = src.match(/^data:image\/svg\+xml;base64,([\s\S]+)$/)
    if (!base64Match) {
      console.warn("[InlineSvg] Source does not match data URI pattern:", src.slice(0, 80))
      setRenderError("Invalid SVG format")
      container.innerHTML = ""
      return
    }

    let decoded: string
    try {
      const cleanBase64 = base64Match[1].replace(/\s/g, "")
      decoded = atob(cleanBase64)
    } catch (err) {
      console.warn("[InlineSvg] Base64 decode failed:", err)
      setRenderError("Failed to decode SVG")
      container.innerHTML = ""
      return
    }

    const parser = new DOMParser()
    const doc = parser.parseFromString(decoded, "image/svg+xml")
    const parsedSvg = doc.documentElement

    if (parsedSvg.querySelector("parsererror") || parsedSvg.localName !== "svg") {
      const parserMsg = parsedSvg.querySelector("parsererror")?.textContent ?? null
      console.warn("[InlineSvg] Parse failed:", {
        parsererror: parserMsg,
        rootLocalName: parsedSvg.localName,
        decodedLength: decoded.length,
        decodedPreview: decoded.slice(0, 300),
      })
      setRenderError("Invalid SVG content")
      setFallbackToImg(true)
      container.innerHTML = ""
      return
    }

    // SECURITY: Remove any script elements
    parsedSvg.querySelectorAll("script").forEach((s) => s.remove())

    container.innerHTML = ""
    const svgNode = document.importNode(parsedSvg, true) as unknown as SVGSVGElement
    svgNode.style.width = "100%"
    svgNode.style.height = "100%"
    svgNode.style.opacity = "0"
    svgNode.setAttribute("preserveAspectRatio", "xMidYMid meet")
    container.appendChild(svgNode)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          const drawingEls = svgNode.querySelectorAll("path, line, circle, polyline, polygon, ellipse")
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
          let hasContent = false

          drawingEls.forEach((el) => {
            try {
              const bbox = (el as SVGGraphicsElement).getBBox()
              if (bbox.width > 0 || bbox.height > 0) {
                minX = Math.min(minX, bbox.x)
                minY = Math.min(minY, bbox.y)
                maxX = Math.max(maxX, bbox.x + bbox.width)
                maxY = Math.max(maxY, bbox.y + bbox.height)
                hasContent = true
              }
            } catch { /* Element not rendered */ }
          })

          if (hasContent) {
            const contentW = maxX - minX
            const contentH = maxY - minY
            if (contentW > 0.01 && contentH > 0.01) {
              const padX = contentW * 0.1
              const padY = contentH * 0.1
              svgNode.setAttribute("viewBox", `${minX - padX} ${minY - padY} ${contentW + 2 * padX} ${contentH + 2 * padY}`)
            }
          }
        } catch { /* Leave viewBox as-is */ }

        svgNode.style.opacity = "1"
        svgNode.style.transition = "opacity 150ms ease-in"
      })
    })

    return () => { container.innerHTML = "" }
  }, [src])

  const showImgFallback =
    fallbackToImg && src && src.length >= 50 && /^data:image\/svg\+xml;base64,/.test(src)

  return (
    <div className={`relative ${className ?? ""}`} onClick={onClick} role="img" aria-label={alt}>
      <div ref={containerRef} className="w-full h-full" />
      {showImgFallback && (
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}
      {renderError && !fallbackToImg && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs text-muted-foreground font-mono">{renderError}</p>
        </div>
      )}
    </div>
  )
}

// ─── SvgView ─────────────────────────────────────────────────────────

/**
 * SvgView — renders an SVG engineering drawing in a clickable container.
 */
export function SvgView({
  src,
  alt,
  onClick,
}: {
  src: string
  alt: string
  onClick: () => void
}): React.ReactNode {
  return (
    <InlineSvg
      src={src}
      alt={alt}
      className="bg-muted/30 rounded-lg p-4 h-[500px] cursor-pointer hover:opacity-90 transition-opacity"
      onClick={onClick}
    />
  )
}

// ─── FullscreenOverlay ───────────────────────────────────────────────

/**
 * FullscreenOverlay — full-viewport overlay for any view (3D STL or SVG).
 */
export function FullscreenOverlay({
  view,
  result,
  onClose,
}: {
  view: string
  result: CadLabResult
  onClose: () => void
}): React.ReactNode {
  // Listen for Escape key to close the overlay
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const svgMap: Record<string, string | undefined> = {
    iso: result.svgIso,
    exploded: result.svgExploded,
    front: result.svgFront,
    back: result.svgBack,
    left: result.svgLeft,
    right: result.svgRight,
    top: result.svgTop,
  }

  const svgSrc = svgMap[view]

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex items-center justify-center p-8" onClick={onClose}>
      <button
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors text-sm font-mono"
        onClick={onClose}
      >
        ESC to close
      </button>
      {view === "3d" && result.stlData ? (
        <div className="w-full h-full" onClick={(e) => e.stopPropagation()}>
          <STLViewer stlData={result.stlData} />
        </div>
      ) : svgSrc ? (
        <InlineSvg src={svgSrc} alt={`${view} view`} className="w-full h-full" />
      ) : null}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Extracts a concise product summary from the research report.
 *
 * @description Pulls the first meaningful paragraph(s) from the research
 * report, skipping markdown headers and short lines. Returns up to
 * `maxLength` characters of prose that describes the overall product.
 *
 * @param report - The full research report text
 * @param maxLength - Maximum character length (default 500)
 * @returns A trimmed summary string, or empty string if no content
 */
export function extractProductSummary(report: string, maxLength: number = 500): string {
  if (!report.trim()) return ""

  const lines = report.split("\n")
  const paragraphs: string[] = []
  let currentParagraph = ""

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip markdown headers and empty lines
    if (trimmed.startsWith("#") || trimmed.startsWith("---")) {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim())
        currentParagraph = ""
      }
      continue
    }

    if (trimmed === "") {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim())
        currentParagraph = ""
      }
      continue
    }

    // Skip bullet points and short metadata lines
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("|")) {
      continue
    }

    currentParagraph += (currentParagraph ? " " : "") + trimmed
  }

  if (currentParagraph.trim()) {
    paragraphs.push(currentParagraph.trim())
  }

  // Take paragraphs that are actual prose (30+ chars), not short labels
  const proseParagraphs = paragraphs.filter((p) => p.length >= 30)

  let summary = ""
  for (const para of proseParagraphs) {
    if (summary.length + para.length > maxLength) {
      if (summary.length === 0) {
        // First paragraph is already over limit — truncate it
        summary = para.slice(0, maxLength).replace(/\s+\S*$/, "") + "..."
      }
      break
    }
    summary += (summary ? "\n\n" : "") + para
  }

  return summary
}

/**
 * Formats an ISO timestamp into a human-readable relative time string.
 */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

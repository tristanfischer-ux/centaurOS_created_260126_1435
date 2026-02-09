'use client'

/**
 * PanZoomCanvas — drag-to-pan, scroll-to-zoom wrapper for the orbital SVG.
 *
 * @description Provides pan/zoom controls via mouse drag and scroll wheel.
 * Bottom-left has +/−/FIT zoom controls. Bottom-right shows usage hint.
 *
 * @param props.children - The content to render inside the pannable area
 * @param props.onBackgroundClick - Called when clicking the background (deselect)
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface PanZoomCanvasProps {
  children: React.ReactNode
  onBackgroundClick?: () => void
}

const MIN_ZOOM = 0.4
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.08
const ZOOM_BTN_STEP = 0.2

export function PanZoomCanvas({ children, onBackgroundClick }: PanZoomCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })

  // ── Scroll-to-zoom ───────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP))))
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Drag-to-pan ──────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    },
    [pan]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      setPan({
        x: dragStart.current.px + e.clientX - dragStart.current.x,
        y: dragStart.current.py + e.clientY - dragStart.current.y,
      })
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => setIsDragging(false), [])

  // ── Background click (deselect) ──────────────────────────
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'DIV') {
        onBackgroundClick?.()
      }
    },
    [onBackgroundClick]
  )

  // ── Zoom controls ────────────────────────────────────────
  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_BTN_STEP))
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_BTN_STEP))
  const fitView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      className={cn(
        'relative flex-1 overflow-hidden',
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
      style={{ background: 'radial-gradient(ellipse at center, #F8FAFC 0%, #FFFFFF 65%)' }}
    >
      {/* Pannable + zoomable inner container */}
      <div
        className="w-full h-full flex items-center justify-center pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.15s ease-out',
        }}
      >
        <div className="w-[720px] h-[720px] shrink-0 pointer-events-auto">
          {children}
        </div>
      </div>

      {/* ── Zoom controls (bottom-left) ───────────────────── */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-1 z-10">
        <ZoomButton label="+" onClick={zoomIn} />
        <ZoomButton
          label={`${Math.round(zoom * 100)}%`}
          isInfo
        />
        <ZoomButton label="−" onClick={zoomOut} />
        <ZoomButton
          label="FIT"
          onClick={fitView}
          className="text-[9px] font-bold text-muted-foreground"
        />
      </div>

      {/* ── Hint (bottom-right) ───────────────────────────── */}
      <div className="absolute bottom-4 right-4 text-[9px] text-muted-foreground bg-background px-2.5 py-1.5 rounded-md border border-border">
        Drag to pan · Scroll to zoom
      </div>
    </div>
  )
}

// ─── Zoom Button ─────────────────────────────────────────────────────────────

function ZoomButton({
  label,
  onClick,
  isInfo,
  className,
}: {
  label: string
  onClick?: () => void
  isInfo?: boolean
  className?: string
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        'w-[34px] h-[34px] rounded-lg border-[1.5px] border-border bg-background',
        'text-muted-foreground text-base flex items-center justify-center',
        'shadow-[0_1px_3px_rgba(0,0,0,0.06)]',
        onClick ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
        isInfo && 'text-[9px] font-bold',
        className
      )}
    >
      {label}
    </button>
  )
}

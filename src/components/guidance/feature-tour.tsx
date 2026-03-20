'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type TourStep = {
  target: string
  title: string
  body: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

interface FeatureTourProps {
  tourId: string
  steps: TourStep[]
}

const STORAGE_PREFIX = 'forgeos-tour-seen-'

/** Selector for the platform's scrollable content container (ZoomableContent) */
const SCROLL_CONTAINER_SELECTOR = '.overflow-y-auto'

export function hasSeenTour(tourId: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${tourId}`) === 'true'
  } catch {
    return true
  }
}

export function resetTour(tourId: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${tourId}`)
  } catch {
    // localStorage not available
  }
}

function markSeen(tourId: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${tourId}`, 'true')
  } catch {
    // localStorage not available
  }
}

/** Find the platform's main scroll container (ZoomableContent div) */
function getScrollContainer(): HTMLElement | null {
  return document.querySelector(SCROLL_CONTAINER_SELECTOR)
}

export function FeatureTour({ tourId, steps }: FeatureTourProps) {
  const [active, setActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const rafRef = useRef<number>(0)
  const prevOverflowRef = useRef<string>('')

  const step = steps[currentStep]

  const close = useCallback(() => {
    setActive(false)
    setCurrentStep(0)
    setRect(null)
    markSeen(tourId)
  }, [tourId])

  // Auto-start on mount if not seen
  useEffect(() => {
    if (hasSeenTour(tourId)) return
    const timer = setTimeout(() => setActive(true), 800)
    return () => clearTimeout(timer)
  }, [tourId])

  // Listen for replay event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.tourId === tourId) {
        setCurrentStep(0)
        setActive(true)
      }
    }
    window.addEventListener('forgeos-start-tour', handler)
    return () => window.removeEventListener('forgeos-start-tour', handler)
  }, [tourId])

  // Lock scroll on the real scroll container (ZoomableContent), not body
  useEffect(() => {
    const container = getScrollContainer()
    if (!container) return

    if (active) {
      prevOverflowRef.current = container.style.overflow
      container.style.overflow = 'hidden'
    } else {
      container.style.overflow = prevOverflowRef.current
    }
    return () => {
      container.style.overflow = prevOverflowRef.current
    }
  }, [active])

  // Calculate rect from DOM
  const updateRect = useCallback(() => {
    if (!active || !step) return
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    if (el) {
      setRect(el.getBoundingClientRect())
    } else {
      setRect(null)
    }
  }, [active, step])

  // Scroll target into view when step changes; auto-skip if target missing
  useEffect(() => {
    if (!active || !step) return
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    if (el) {
      // Temporarily unlock scroll so scrollIntoView works
      const container = getScrollContainer()
      const prevOv = container?.style.overflow ?? ''
      if (container) container.style.overflow = prevOverflowRef.current
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Re-lock after scroll animation settles + recalc rect
      const timer = setTimeout(() => {
        if (container) container.style.overflow = 'hidden'
        updateRect()
      }, 400)
      return () => {
        clearTimeout(timer)
        if (container) container.style.overflow = prevOv
      }
    } else {
      // Target not in DOM — auto-advance or close if last step
      if (currentStep < steps.length - 1) {
        setCurrentStep((s) => s + 1)
      } else {
        close()
      }
    }
  }, [active, step, currentStep, steps.length, updateRect, close])

  useEffect(() => {
    if (!active) return
    updateRect()
    const onUpdate = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(updateRect)
    }
    window.addEventListener('resize', onUpdate)
    return () => {
      window.removeEventListener('resize', onUpdate)
      cancelAnimationFrame(rafRef.current)
    }
  }, [active, updateRect])

  // Escape key
  useEffect(() => {
    if (!active) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [active, close])

  if (!active || !step) return null

  const isLast = currentStep === steps.length - 1
  const pad = 8
  const tooltipHeight = 180 // approx tooltip height for vertical clamping

  // Resolve tooltip position with automatic fallback when overflowing viewport
  const resolvePosition = (): 'top' | 'bottom' | 'left' | 'right' => {
    if (!rect) return 'bottom'
    const preferred = step.position ?? 'bottom'
    const maxWidth = 320

    // Check if preferred position overflows, fall back to opposite
    switch (preferred) {
      case 'bottom':
        if (rect.bottom + pad + 12 + tooltipHeight > window.innerHeight) return 'top'
        return 'bottom'
      case 'top':
        if (rect.top - pad - 12 - tooltipHeight < 0) return 'bottom'
        return 'top'
      case 'left':
        if (rect.left - pad - 12 - maxWidth < 0) return 'right'
        return 'left'
      case 'right':
        if (rect.right + pad + 12 + maxWidth > window.innerWidth) return 'left'
        return 'right'
      default:
        return 'bottom'
    }
  }

  // Tooltip position — all coordinates are viewport-relative (inside fixed container)
  const getTooltipStyle = (): React.CSSProperties => {
    if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

    const pos = resolvePosition()
    const maxWidth = 320

    switch (pos) {
      case 'top':
        return {
          left: Math.min(Math.max(pad, rect.left + rect.width / 2 - maxWidth / 2), window.innerWidth - maxWidth - pad),
          top: Math.max(pad, rect.top - pad - 12),
          transform: 'translateY(-100%)',
        }
      case 'left':
        return {
          left: Math.max(pad, rect.left - pad - 12),
          top: Math.min(Math.max(pad, rect.top + rect.height / 2), window.innerHeight - tooltipHeight - pad),
          transform: 'translate(-100%, -50%)',
        }
      case 'right':
        return {
          left: Math.min(rect.right + pad + 12, window.innerWidth - maxWidth - pad),
          top: Math.min(Math.max(pad, rect.top + rect.height / 2), window.innerHeight - tooltipHeight - pad),
          transform: 'translateY(-50%)',
        }
      case 'bottom':
      default:
        return {
          left: Math.min(Math.max(pad, rect.left + rect.width / 2 - maxWidth / 2), window.innerWidth - maxWidth - pad),
          top: Math.min(rect.bottom + pad + 12, window.innerHeight - tooltipHeight - pad),
        }
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999]" onClick={close}>
      {/* SVG overlay with mask cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id={`tour-mask-${tourId}`}>
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - pad}
                y={rect.top - pad}
                width={rect.width + pad * 2}
                height={rect.height + pad * 2}
                rx={8}
                ry={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.45)"
          mask={`url(#tour-mask-${tourId})`}
          style={{ pointerEvents: 'auto' }}
        />
        {/* Orange ring around cutout */}
        {rect && (
          <rect
            x={rect.left - pad - 1}
            y={rect.top - pad - 1}
            width={rect.width + pad * 2 + 2}
            height={rect.height + pad * 2 + 2}
            rx={9}
            ry={9}
            fill="none"
            className="stroke-international-orange"
            strokeWidth={2}
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>

      {/* Tooltip card — key forces remount per step so entrance animation replays */}
      <div
        key={currentStep}
        className="fixed bg-card border rounded-xl shadow-xl p-5 z-[10000] animate-in fade-in-50 slide-in-from-bottom-2 duration-200"
        style={{ ...getTooltipStyle(), maxWidth: 320, width: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-foreground mb-1.5">{step.title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.body}</p>

        {/* Dot pagination */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  i === currentStep ? 'bg-international-orange' : 'bg-muted'
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2"
              onClick={close}
            >
              Skip
            </Button>
            <Button
              size="sm"
              className="text-xs h-7 px-3 bg-international-orange hover:bg-international-orange/90 text-white"
              onClick={() => {
                if (isLast) {
                  close()
                } else {
                  setCurrentStep((s) => s + 1)
                }
              }}
            >
              {isLast ? 'Got it' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

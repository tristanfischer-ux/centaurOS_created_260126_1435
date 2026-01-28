"use client"

import { useState, useEffect } from "react"
import { Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

const ZOOM_LEVELS = [80, 90, 100, 110, 120, 130, 140, 150]
const DEFAULT_ZOOM = 100
const STORAGE_KEY = "centaur-zoom-level"

interface ZoomControlProps {
    className?: string
    onZoomChange?: (zoom: number) => void
}

export function ZoomControl({ className, onZoomChange }: ZoomControlProps) {
    const [zoom, setZoom] = useState(DEFAULT_ZOOM)
    const [mounted, setMounted] = useState(false)

    // Load zoom from localStorage on mount
    useEffect(() => {
        setMounted(true)
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
            const parsed = parseInt(stored, 10)
            if (ZOOM_LEVELS.includes(parsed)) {
                setZoom(parsed)
                onZoomChange?.(parsed)
            }
        }
    }, [onZoomChange])

    const handleZoomChange = (newZoom: number) => {
        setZoom(newZoom)
        localStorage.setItem(STORAGE_KEY, String(newZoom))
        onZoomChange?.(newZoom)
    }

    const zoomIn = () => {
        const currentIndex = ZOOM_LEVELS.indexOf(zoom)
        if (currentIndex < ZOOM_LEVELS.length - 1) {
            handleZoomChange(ZOOM_LEVELS[currentIndex + 1])
        }
    }

    const zoomOut = () => {
        const currentIndex = ZOOM_LEVELS.indexOf(zoom)
        if (currentIndex > 0) {
            handleZoomChange(ZOOM_LEVELS[currentIndex - 1])
        }
    }

    // Don't render until mounted to avoid hydration mismatch
    if (!mounted) {
        return null
    }

    const canZoomOut = zoom > ZOOM_LEVELS[0]
    const canZoomIn = zoom < ZOOM_LEVELS[ZOOM_LEVELS.length - 1]

    return (
        <div
            className={cn(
                "inline-flex items-center gap-0.5 bg-muted/80 backdrop-blur-sm shadow-sm rounded px-1 py-0.5",
                className
            )}
        >
            <button
                onClick={zoomOut}
                disabled={!canZoomOut}
                className={cn(
                    "p-1.5 transition-colors",
                    canZoomOut
                        ? "text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80"
                        : "text-muted-foreground/30 cursor-not-allowed"
                )}
                aria-label="Zoom out"
            >
                <Minus className="h-3.5 w-3.5" />
            </button>
            
            <span className="min-w-[3rem] text-center text-[11px] font-mono text-muted-foreground tabular-nums">
                {zoom}%
            </span>
            
            <button
                onClick={zoomIn}
                disabled={!canZoomIn}
                className={cn(
                    "p-1.5 transition-colors",
                    canZoomIn
                        ? "text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80"
                        : "text-muted-foreground/30 cursor-not-allowed"
                )}
                aria-label="Zoom in"
            >
                <Plus className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}

// Hook to get and apply zoom level
export function useZoom() {
    const [zoom, setZoom] = useState(DEFAULT_ZOOM)

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
            const parsed = parseInt(stored, 10)
            if (ZOOM_LEVELS.includes(parsed)) {
                setZoom(parsed)
            }
        }

        // Listen for storage changes (if user changes in another tab)
        const handleStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY && e.newValue) {
                const parsed = parseInt(e.newValue, 10)
                if (ZOOM_LEVELS.includes(parsed)) {
                    setZoom(parsed)
                }
            }
        }

        window.addEventListener("storage", handleStorage)
        return () => window.removeEventListener("storage", handleStorage)
    }, [])

    return { zoom, setZoom }
}

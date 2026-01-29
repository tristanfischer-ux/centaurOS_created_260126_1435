"use client"

import { createContext, useContext, useState, useEffect, ReactNode, CSSProperties } from "react"
import { ZoomControl } from "./ZoomControl"

const ZOOM_LEVELS = [80, 90, 100, 110, 120, 130, 140, 150]
const DEFAULT_ZOOM = 100
const STORAGE_KEY = "centaur-zoom-level"

interface ZoomContextType {
    zoom: number
    setZoom: (zoom: number) => void
}

const ZoomContext = createContext<ZoomContextType>({
    zoom: DEFAULT_ZOOM,
    setZoom: () => {},
})

export function useZoomContext() {
    return useContext(ZoomContext)
}

interface ZoomProviderProps {
    children: ReactNode
}

export function ZoomProvider({ children }: ZoomProviderProps) {
    const [zoom, setZoom] = useState(DEFAULT_ZOOM)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
            const parsed = parseInt(stored, 10)
            if (ZOOM_LEVELS.includes(parsed)) {
                setZoom(parsed)
            }
        }
    }, [])

    const handleZoomChange = (newZoom: number) => {
        setZoom(newZoom)
        localStorage.setItem(STORAGE_KEY, String(newZoom))
    }

    // Calculate inverse zoom for the control so it stays same size
    const inverseZoom = mounted ? 100 / zoom : 1

    return (
        <ZoomContext.Provider value={{ zoom, setZoom: handleZoomChange }}>
            {children}
        </ZoomContext.Provider>
    )
}

// Separate component for the mobile zoom control that floats above content
export function MobileZoomControl() {
    const { zoom, setZoom } = useZoomContext()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    // Inverse scale so control stays readable at any zoom level
    const inverseScale = 100 / zoom
    const style: CSSProperties = {
        transform: `scale(${inverseScale})`,
        transformOrigin: 'top left',
    }

    return (
        <div className="fixed top-3 left-3 z-[60] md:hidden pt-safe pl-safe" style={style}>
            <ZoomControl onZoomChange={setZoom} />
        </div>
    )
}

// Wrapper for zoomable content
interface ZoomableContentProps {
    children: ReactNode
    className?: string
}

export function ZoomableContent({ children, className }: ZoomableContentProps) {
    const { zoom } = useZoomContext()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const style: CSSProperties = mounted ? {
        zoom: zoom / 100,
        WebkitTextSizeAdjust: "100%" as const,
    } : {}

    return (
        <div style={style} className={className}>
            {children}
        </div>
    )
}

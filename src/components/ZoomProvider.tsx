"use client"

import { createContext, useContext, useState, useEffect, type ReactNode, type CSSProperties, type HTMLAttributes } from "react"
// NOTE: MobileZoomControl intentionally has no mounted guard — zoom defaults
// to 100 on both server and client, so SSR output matches first client render.
import { ZoomControl } from "./ZoomControl"

const ZOOM_LEVELS = [80, 90, 100, 110, 120, 130, 140, 150]
const DEFAULT_ZOOM = 100
const STORAGE_KEY = "forge-zoom-level"

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

    // Inverse scale so control stays readable at any zoom level
    const inverseScale = 100 / zoom
    const style: CSSProperties = {
        transform: `scale(${inverseScale})`,
        transformOrigin: 'top left',
    }

    return (
        <div className="fixed top-3 left-3 z-[60] sm:hidden pt-safe pl-safe" style={style}>
            <ZoomControl onZoomChange={setZoom} />
        </div>
    )
}

// Wrapper for zoomable content
interface ZoomableContentProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode
}

export function ZoomableContent({ children, className, style: styleProp, ...rest }: ZoomableContentProps) {
    const { zoom } = useZoomContext()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // DECISION: Use transform: scale() instead of CSS zoom property (RT).
    // CSS `zoom` blocks native pinch-to-zoom on iOS/Android, making the
    // page unzoomable. transform: scale() doesn't interfere with native
    // pinch gestures. transformOrigin: "top left" prevents content from
    // shifting during zoom.
    // Apply zoom style only when mounted and zoom differs from default
    // to ensure SSR output matches client hydration.
    const zoomStyle: CSSProperties = mounted && zoom !== DEFAULT_ZOOM ? {
        transform: `scale(${zoom / 100})`,
        transformOrigin: "top left",
        width: `${10000 / zoom}%`,
        WebkitTextSizeAdjust: "100%" as const,
    } : {}

    return (
        <div style={{ ...zoomStyle, ...styleProp }} className={className} {...rest}>
            {children}
        </div>
    )
}

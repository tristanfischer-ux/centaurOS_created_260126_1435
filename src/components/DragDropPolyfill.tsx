"use client"

import { useEffect } from "react"
import { polyfill } from "mobile-drag-drop"
import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour"
import "mobile-drag-drop/default.css"

export function DragDropPolyfill() {
    useEffect(() => {
        // Initialize the polyfill
        polyfill({
            dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride
        })

        // Clean up is not strictly necessary as the polyfill modifies the window/document 
        // global state, but standard useEffect cleanup is good practice if the library supports it.
        // However, mobile-drag-drop is a global patch. 
        // We just run it once on mount.
    }, [])

    return null
}

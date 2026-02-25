"use client"

/**
 * @file use-rendered-views.ts — React hook for offscreen CAD view rendering.
 *
 * @description Dynamically imports and calls renderOrthographicViews when STL data
 * is available. Tracks loading and error state. Re-renders only when stlData changes.
 */

import { useState, useEffect } from "react"
import type { RenderedViews } from "@/lib/render-orthographic-views"

/**
 * Renders orthographic views from STL data and tracks loading state.
 *
 * DECISION: Uses dynamic import so the heavy Three.js renderer is excluded from
 * the initial bundle and only loaded when a module with STL data is displayed.
 *
 * @param stlData - Base64-encoded STL data, or undefined if not yet available
 * @returns views, loading state, and any error message
 */
export function useRenderedViews(stlData: string | undefined): {
  views: RenderedViews | null
  loading: boolean
  error: string | null
} {
  const [views, setViews] = useState<RenderedViews | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!stlData) {
      setViews(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    setLoading(true)
    setError(null)
    setViews(null)

    import("@/lib/render-orthographic-views")
      .then(({ renderOrthographicViews }) => renderOrthographicViews(stlData))
      .then((renderedViews) => {
        if (!cancelled) {
          setViews(renderedViews)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error("[useRenderedViews] Failed to render views:", err)
          setError(err instanceof Error ? err.message : "Failed to render views")
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [stlData])

  return { views, loading, error }
}

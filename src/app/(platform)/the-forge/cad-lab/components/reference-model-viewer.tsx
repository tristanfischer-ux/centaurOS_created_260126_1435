"use client"

/**
 * @file reference-model-viewer.tsx
 *
 * @description Fetches STL from a URL and renders it in STLViewer, or shows
 * a placeholder when no URL is available. Used for instant reference preview
 * in the System Overview.
 */

import { useState, useEffect } from "react"
import { Box } from "lucide-react"
import { STLViewer } from "@/components/cad/stl-viewer"

interface ReferenceModelViewerProps {
  /** URL to STL file (e.g. Supabase storage). When null, placeholder is shown. */
  stlUrl: string | null
  /** Optional class name for the container */
  className?: string
  /** Minimum height for the viewer area */
  minHeight?: number
}

/**
 * Fetches STL from URL, converts to base64, and passes to STLViewer.
 * Shows placeholder when stlUrl is null or fetch fails.
 */
export function ReferenceModelViewer({
  stlUrl,
  className = "",
  minHeight = 320,
}: ReferenceModelViewerProps): React.ReactNode {
  const [stlData, setStlData] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!stlUrl?.trim()) {
      setStlData(null)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    fetch(stlUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.arrayBuffer()
      })
      .then((buf) => {
        const bytes = new Uint8Array(buf)
        let binary = ""
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        setStlData(btoa(binary))
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load")
        setStlData(null)
      })
      .finally(() => setLoading(false))
  }, [stlUrl])

  if (!stlUrl) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 ${className}`}
        style={{ minHeight }}
      >
        <Box className="h-12 w-12 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Reference 3D preview</p>
        <p className="text-xs text-muted-foreground mt-0.5">Add STL to reference model to see preview</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 ${className}`}
        style={{ minHeight }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        <p className="text-sm text-muted-foreground mt-2">Loading model...</p>
      </div>
    )
  }

  if (error || !stlData) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 ${className}`}
        style={{ minHeight }}
      >
        <Box className="h-12 w-12 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Preview unavailable</p>
        {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
      </div>
    )
  }

  return (
    <div className={`rounded-lg overflow-hidden border border-border ${className}`} style={{ minHeight }}>
      <STLViewer stlData={stlData} />
    </div>
  )
}

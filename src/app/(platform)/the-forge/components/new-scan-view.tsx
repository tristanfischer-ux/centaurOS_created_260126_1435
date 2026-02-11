/**
 * @file new-scan-view.tsx — Client component for the new scan flow
 *
 * @description Renders the ScanHero input and scanning animation.
 * On scan completion, redirects to the project's concept page.
 * Reuses the existing ScanHero component in "new scan" mode.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/new/page.tsx
 * - ScanHero: src/app/(platform)/the-forge/components/scan-hero.tsx
 * - Actions: src/actions/xray.ts
 */

"use client"

import React, { useState, useCallback } from "react"
import { useRouter } from "next/navigation"

import { toast } from "sonner"

import { scanIdeaAction, generateImagesAction, updateProjectMetadataAction } from "@/actions/xray"
import { ScanHero } from "./scan-hero"

/**
 * NewScanView — Client-side new scan flow.
 *
 * @description Wraps ScanHero with scan logic. On successful scan,
 * triggers image generation in background and redirects to concept page.
 */
export function NewScanView(): React.ReactNode {
  const router = useRouter()
  const [isScanning, setIsScanning] = useState(false)
  const [idea, setIdea] = useState("")

  const handleScan = useCallback(async (inputIdea: string): Promise<void> => {
    const trimmed = (inputIdea || "").trim() || "New machine concept"
    setIsScanning(true)
    try {
      const result = await scanIdeaAction(trimmed)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Scan complete: ${result.spec.modules.length} modules identified`)

      // Trigger image generation in background (don't await)
      generateImagesAction(result.scanId)
        .then((imgResult) => {
          if ("spec" in imgResult && imgResult.spec.systemImageUrl) {
            updateProjectMetadataAction(result.scanId, { thumbnailUrl: imgResult.spec.systemImageUrl })
          }
        })
        .catch((err) => {
          console.error("[Forge] Background image generation failed:", err)
        })

      // Redirect to concept page
      router.push(`/the-forge/${result.scanId}/concept`)
    } catch (error) {
      toast.error("Scan failed. Please try again.")
      console.error("[Forge] Scan error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsScanning(false)
    }
  }, [router])

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <ScanHero
        idea={idea}
        functionStatement=""
        isScanning={isScanning}
        hasExistingSpec={false}
        onScan={handleScan}
        onRefine={handleScan}
        onIdeaChange={setIdea}
      />

      {isScanning && <ScanningPlaceholder />}
    </div>
  )
}

// ─── Scanning Animation ──────────────────────────────────────────────

function ScanningPlaceholder(): React.ReactNode {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-[300px] rounded-xl bg-muted/40 flex items-center justify-center">
        <p className="text-sm text-muted-foreground font-medium">
          Scanning your idea into modules...
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted/30" />
        ))}
      </div>
    </div>
  )
}

/**
 * @file new-scan-view.tsx — Client component for the create concept flow
 *
 * @description Renders the ScanHero input and progress animation.
 * On concept creation, redirects to the project's concept page.
 * Reuses the existing ScanHero component in "new" mode.
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
 * NewScanView — Client-side create concept flow.
 *
 * @description Wraps ScanHero with creation logic. On successful concept creation,
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
      toast.success(`Concept created: ${result.spec.modules.length} modules identified`)

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
      toast.error("Concept creation failed. Please try again.")
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

/**
 * ScanningPlaceholder — Skeleton preview of what the output will look like.
 *
 * @description Shows a ghost preview of the system blueprint and module
 * cards that will appear once the scan completes, so the user knows
 * what to expect.
 */
function ScanningPlaceholder(): React.ReactNode {
  return (
    <div className="space-y-6">
      {/* Ghost system blueprint */}
      <div className="rounded-xl border border-dashed border-muted-foreground/20 bg-muted/20 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 rounded bg-muted animate-pulse" />
          <div className="h-4 w-48 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-[200px] rounded-lg bg-muted/30 flex items-center justify-center animate-pulse">
          <p className="text-sm text-muted-foreground font-medium">
            System diagram will appear here
          </p>
        </div>
      </div>
      {/* Ghost module cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-dashed border-muted-foreground/15 bg-muted/15 flex items-center justify-center animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <span className="text-xs text-muted-foreground/50">Module {i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

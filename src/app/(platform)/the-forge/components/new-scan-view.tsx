/**
 * @file new-scan-view.tsx — Client component for the create concept flow
 *
 * @description Renders the ScanHero input and progress animation.
 * On concept creation, runs product research FIRST (Gemini + Claude) then
 * passes the research report to the GPT-4o scan for grounded module
 * decomposition. Shows two visible progress phases to the user.
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

import {
  scanIdeaAction,
  generateImagesAction,
  updateProjectMetadataAction,
  runConceptResearchAction,
  saveConceptResearchAction,
} from "@/actions/xray"
import { ScanHero } from "./scan-hero"

import type { ConceptResearchResult } from "@/actions/xray"

/** Visible phase of concept creation — drives progress UI */
export type CreatePhase = "idle" | "researching" | "creating"

/**
 * NewScanView — Client-side create concept flow.
 *
 * @description Wraps ScanHero with a research-first creation flow:
 * 1. Research phase: Gemini searches the web, Claude synthesizes a report
 * 2. Creation phase: GPT-4o decomposes the idea into modules WITH research context
 * 3. Redirect to concept page with both research and modules ready
 */
export function NewScanView(): React.ReactNode {
  const router = useRouter()
  const [phase, setPhase] = useState<CreatePhase>("idle")
  const [idea, setIdea] = useState("")

  const isScanning = phase !== "idle"

  const handleScan = useCallback(async (inputIdea: string): Promise<void> => {
    const trimmed = (inputIdea || "").trim() || "New machine concept"

    // ── Phase 1: Product research (Gemini + Claude) ──
    setPhase("researching")
    let researchReport: string | undefined
    let researchSources: Array<{ uri: string; title: string }> = []

    try {
      toast.info("Researching your product — searching the web for specs, competitors, and standards...", { duration: 8000 })
      const researchResult = await runConceptResearchAction(trimmed)

      if ("error" in researchResult && !("success" in researchResult)) {
        // Research failed — continue without it (non-blocking)
        console.warn("[Forge] Research failed, proceeding without:", researchResult.error)
        toast.warning("Research unavailable — creating concept from idea alone")
      } else {
        const result = researchResult as ConceptResearchResult
        if (result.success && result.report) {
          researchReport = result.report
          researchSources = result.sources
          toast.success(`Research complete — ${result.sources.length} sources found`, { duration: 3000 })
        }
      }
    } catch (err) {
      // Research is non-blocking — log and continue
      console.warn("[Forge] Research error, proceeding without:", err instanceof Error ? err.message : "Unknown")
      toast.warning("Research unavailable — creating concept from idea alone")
    }

    // ── Phase 2: Create modules with research context (GPT-4o) ──
    setPhase("creating")
    try {
      toast.info("Creating your modules — building the engineering breakdown...", { duration: 8000 })
      const result = await scanIdeaAction(trimmed, researchReport)

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      // Save research report to DB if we got one
      if (researchReport && result.scanId) {
        saveConceptResearchAction(result.scanId, researchReport, researchSources).catch((err) => {
          console.error("[Forge] Failed to save research report:", err)
        })
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
      setPhase("idle")
    }
  }, [router])

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <ScanHero
        idea={idea}
        functionStatement=""
        isScanning={isScanning}
        createPhase={phase}
        hasExistingSpec={false}
        onScan={handleScan}
        onRefine={handleScan}
        onIdeaChange={setIdea}
      />
    </div>
  )
}


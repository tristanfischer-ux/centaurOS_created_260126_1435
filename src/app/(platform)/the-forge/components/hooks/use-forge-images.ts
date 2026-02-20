"use client"

/**
 * @file use-forge-images.ts — Image generation logic for Forge projects.
 *
 * @description Manages system blueprint and module blueprint image generation.
 * Phase 1: system image (fast ~15s), Phase 2: module images (parallel).
 */

import { useState, useCallback, useRef } from "react"
import { toast } from "sonner"

import {
  generateImagesAction,
  generateModuleImagesAction,
  updateProjectMetadataAction,
} from "@/actions/xray"

import type { XRaySpec } from "../../services/xray-schema"

interface UseForgeImagesOptions {
  scanId: string
  specRef: React.MutableRefObject<XRaySpec>
  setSpecDirect: (next: XRaySpec) => void
  isMountedRef: React.MutableRefObject<boolean>
}

export interface UseForgeImagesReturn {
  handleGenerateImages: () => Promise<void>
  isGeneratingImages: boolean
}

/**
 * useForgeImages — Two-phase image generation (system → module blueprints).
 */
export function useForgeImages({
  scanId,
  setSpecDirect,
  isMountedRef,
}: UseForgeImagesOptions): UseForgeImagesReturn {
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const generationVersionRef = useRef(0)

  const handleGenerateImages = useCallback(async (): Promise<void> => {
    const version = ++generationVersionRef.current
    setIsGeneratingImages(true)
    toast.info("Generating system blueprint...")

    try {
      // Phase 1: System image
      const imgResult = await generateImagesAction(scanId)
      if (!isMountedRef.current || version !== generationVersionRef.current) return

      if ("error" in imgResult) {
        toast.error(imgResult.error || "System image generation failed")
        return
      }

      setSpecDirect(imgResult.spec)
      if ("persistError" in imgResult) {
        toast.warning("Results computed but failed to save. Please refresh and retry.")
      } else {
        toast.success("System blueprint ready")
      }
      if (imgResult.spec.systemImageUrl) {
        updateProjectMetadataAction(scanId, { thumbnailUrl: imgResult.spec.systemImageUrl })
      }

      // Phase 2: Module blueprint images
      toast.info("Generating module blueprints...")
      try {
        const modResult = await generateModuleImagesAction(scanId)
        if (!isMountedRef.current || version !== generationVersionRef.current) return

        if ("spec" in modResult) {
          setSpecDirect(modResult.spec)
          const count = modResult.spec.modules.filter(m => m.imageStatus === "complete").length
          if ("persistError" in modResult) {
            toast.warning("Module results computed but failed to save. Please refresh and retry.")
          } else if (count > 0) {
            toast.success(`${count} module blueprints ready`)
          }
        }
      } catch (modErr) {
        console.error("[Forge] Module image generation error:", modErr instanceof Error ? modErr.message : "Unknown")
        if (isMountedRef.current && version === generationVersionRef.current) {
          toast.error("Module blueprint generation failed — system blueprint was saved")
        }
      }
    } catch (error) {
      console.error("[Forge] Image generation error:", error instanceof Error ? error.message : "Unknown")
      if (isMountedRef.current && version === generationVersionRef.current) {
        toast.error("Image generation failed")
      }
    } finally {
      if (isMountedRef.current && version === generationVersionRef.current) {
        setIsGeneratingImages(false)
      }
    }
  }, [scanId, setSpecDirect, isMountedRef])

  return {
    handleGenerateImages,
    isGeneratingImages,
  }
}

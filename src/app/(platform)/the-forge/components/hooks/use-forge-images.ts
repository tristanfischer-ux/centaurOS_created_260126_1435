"use client"

/**
 * @file use-forge-images.ts — Image generation logic for Forge projects.
 *
 * @description Manages system blueprint and module blueprint image generation.
 * Phase 1: system image (fast ~15s), Phase 2: module images (parallel).
 */

import { useState, useCallback } from "react"
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
  handleGenerateImages: () => void
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

  const handleGenerateImages = useCallback((): void => {
    setIsGeneratingImages(true)
    toast.info("Generating system blueprint...")

    // Phase 1: System image first
    generateImagesAction(scanId)
      .then((imgResult) => {
        if (!isMountedRef.current) return
        if ("spec" in imgResult) {
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
          return generateModuleImagesAction(scanId)
        } else {
          toast.error(imgResult.error || "System image generation failed")
          return null
        }
      })
      .then((modResult) => {
        if (!modResult || !isMountedRef.current) return
        if ("spec" in modResult) {
          setSpecDirect(modResult.spec)
          const count = modResult.spec.modules.filter(m => m.imageStatus === "complete").length
          if ("persistError" in modResult) {
            toast.warning("Results computed but failed to save. Please refresh and retry.")
          } else if (count > 0) {
            toast.success(`${count} module blueprints ready`)
          }
        }
      })
      .catch(() => {
        toast.error("Image generation failed")
        console.error("[Forge] Image generation error")
      })
      .finally(() => {
        if (isMountedRef.current) setIsGeneratingImages(false)
      })
  }, [scanId, setSpecDirect, isMountedRef])

  return {
    handleGenerateImages,
    isGeneratingImages,
  }
}

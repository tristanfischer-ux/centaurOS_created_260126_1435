"use server"

/**
 * @file cad-lab-images.ts — Server actions for Gemini image generation in CAD Lab
 *
 * @description Generates engineering blueprint illustrations for CAD Lab modules
 * using the proven image-generator.ts service. Processes modules in batches of 3
 * for resilience (same pattern as the legacy generateModuleImagesAction in xray.ts).
 *
 * @security Auth-checked via withAuth. Images stored in xray-images Supabase bucket.
 *
 * @related
 * - Image generator: src/app/(platform)/the-forge/services/image-generator.ts
 * - Adapter: src/lib/cad-lab/module-to-module-spec-adapter.ts
 * - Legacy pattern: src/actions/xray.ts (generateModuleImagesAction)
 * - Context consumer: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx
 */

import type { CadLabModule } from "@/lib/cad-lab-types"
import { cadLabModuleToModuleSpec } from "@/lib/cad-lab/module-to-module-spec-adapter"
import { generateModuleImage, generateResearchIllustration } from "@/app/(platform)/the-forge/services/image-generator"
import { withAuth } from "@/lib/server-action-utils"
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

/** Concurrency limit — matches xray.ts batch size */
const BATCH_SIZE = 3

interface GenerateImagesResult {
  /** Updated modules with imageUrl/imageStatus filled in */
  modules: CadLabModule[]
  /** Count of successfully generated images */
  successCount: number
  /** Count of failed images */
  failedCount: number
}

/**
 * Generates Gemini blueprint images for a single CAD Lab module.
 *
 * @param projectId - The CAD Lab project ID (used as storage namespace)
 * @param module - The module to generate an image for
 * @returns Updated module with imageUrl/imageStatus set
 */
export async function generateCadLabSingleImageAction(
  projectId: string,
  module: CadLabModule,
): Promise<{ module: CadLabModule } | { error: string }> {
  return withAuth(async () => {
    try {
      const adapted = cadLabModuleToModuleSpec(module)
      const url = await generateModuleImage(projectId, adapted)

      return {
        module: {
          ...module,
          imageUrl: url,
          imageStatus: "complete" as const,
        },
      }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.error(`[CAD-LAB-IMAGES] Failed to generate image for ${module.name}:`, errorMsg)
      return {
        module: {
          ...module,
          imageStatus: "failed" as const,
          imageError: errorMsg,
        },
      }
    }
  })
}

/**
 * Generates Gemini blueprint images for all provided CAD Lab modules.
 * Processes in batches of 3 using Promise.allSettled for resilience —
 * individual module failures don't block the batch.
 *
 * @param projectId - The CAD Lab project ID (used as storage namespace)
 * @param modules - The modules to generate images for
 * @returns Updated modules with imageUrl/imageStatus filled in
 */
export async function generateCadLabModuleImagesAction(
  projectId: string,
  modules: CadLabModule[],
): Promise<GenerateImagesResult | { error: string }> {
  return withAuth(async () => {
    const updatedModules = [...modules]
    let successCount = 0
    let failedCount = 0

    // Process in batches of BATCH_SIZE for controlled concurrency
    for (let i = 0; i < updatedModules.length; i += BATCH_SIZE) {
      const batch = updatedModules.slice(i, i + BATCH_SIZE)

      const results = await Promise.allSettled(
        batch.map(async (module, batchIdx) => {
          const globalIdx = i + batchIdx
          const adapted = cadLabModuleToModuleSpec(module)

          try {
            const url = await generateModuleImage(projectId, adapted)
            updatedModules[globalIdx] = {
              ...module,
              imageUrl: url,
              imageStatus: "complete" as const,
            }
            successCount++
          } catch (err) {
            console.error(
              `[CAD-LAB-IMAGES] Failed to generate image for ${module.name}:`,
              err instanceof Error ? err.message : err,
            )
            updatedModules[globalIdx] = {
              ...module,
              imageStatus: "failed" as const,
            }
            failedCount++
          }
        }),
      )

      // Log batch summary
      const fulfilled = results.filter((r) => r.status === "fulfilled").length
      console.log(
        `[CAD-LAB-IMAGES] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${fulfilled}/${batch.length} succeeded`,
      )
    }

    return {
      modules: updatedModules,
      successCount,
      failedCount,
    }
  })
}

/**
 * Generates a 16:9 illustration banner for the research report.
 *
 * @param projectId - The CAD Lab project ID (used as storage namespace)
 * @param subject - The product/system being researched
 * @param moduleNames - Names of decomposed modules
 * @param modulePurposes - One-line purpose per module
 * @returns The public URL of the generated illustration, or an error
 */
export async function generateCadLabSystemIllustrationAction(
  projectId: string,
  subject: string,
  moduleNames: string[],
  modulePurposes: string[],
): Promise<{ url: string } | { error: string }> {
  return withAuth(async () => {
    try {
      const url = await generateResearchIllustration(projectId, subject, moduleNames, modulePurposes)
      return { url }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.error("[CAD-LAB-IMAGES] Failed to generate system illustration:", errorMsg)
      return { error: errorMsg }
    }
  })
}

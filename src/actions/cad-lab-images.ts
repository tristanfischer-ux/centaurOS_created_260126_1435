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

import type { CadLabModule, VisualStyleSpec } from "@/lib/cad-lab-types"
import { cadLabModuleToModuleSpec } from "@/lib/cad-lab/module-to-module-spec-adapter"
import { generateModuleImage, generateResearchIllustration, cropReferenceFor3x2 } from "@/app/(platform)/the-forge/services/image-generator"
import { getVisualStyleSystemPrompt } from "@/lib/cad-lab/domain-prompts"
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
 * When referenceBase64 is provided, passes it to generateModuleImage() which
 * uses the Gemini multimodal path (hero as inlineData) for style-matched
 * module images. Falls back through text-only Gemini → OpenAI automatically.
 *
 * @param projectId - The CAD Lab project ID (used as storage namespace)
 * @param module - The module to generate an image for
 * @param visualStyle - Optional shared visual style for cross-module cohesion
 * @param referenceBase64 - Optional base64 PNG of the hero image (cropped to 3:2)
 * @returns Updated module with imageUrl/imageStatus set
 */
export async function generateCadLabSingleImageAction(
  projectId: string,
  module: CadLabModule,
  visualStyle?: VisualStyleSpec,
  referenceBase64?: string,
): Promise<{ module: CadLabModule } | { error: string }> {
  return withAuth(async () => {
    try {
      const adapted = cadLabModuleToModuleSpec(module)
      const url = await generateModuleImage(projectId, adapted, undefined, visualStyle, referenceBase64)

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
 * @param visualStyle - Optional shared visual style for cross-module cohesion
 * @param referenceBase64 - Optional base64 PNG of the hero image (cropped to 3:2)
 * @returns Updated modules with imageUrl/imageStatus filled in
 */
export async function generateCadLabModuleImagesAction(
  projectId: string,
  modules: CadLabModule[],
  visualStyle?: VisualStyleSpec,
  referenceBase64?: string,
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
            const url = await generateModuleImage(projectId, adapted, undefined, visualStyle, referenceBase64)
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
 * @param visualStyle - Optional shared visual style for cross-module cohesion
 * @returns The public URL of the generated illustration, or an error
 */
export async function generateCadLabSystemIllustrationAction(
  projectId: string,
  subject: string,
  moduleNames: string[],
  modulePurposes: string[],
  visualStyle?: VisualStyleSpec,
  researchExcerpt?: string,
): Promise<{ url: string } | { error: string }> {
  return withAuth(async () => {
    try {
      const url = await generateResearchIllustration(projectId, subject, moduleNames, modulePurposes, visualStyle, researchExcerpt)
      return { url }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.error("[CAD-LAB-IMAGES] Failed to generate system illustration:", errorMsg)
      return { error: errorMsg }
    }
  })
}

/**
 * Fetches a system illustration from its public URL and crops it to 3:2
 * at 1536×1024 for use as a Gemini multimodal reference image.
 *
 * Called ONCE by the context after hero generation, so all module images
 * share the same pre-cropped base64 without redundant network round-trips.
 *
 * @param url - Supabase public URL of the system illustration (16:9 PNG)
 * @returns Base64 PNG string cropped to 3:2, or error
 */
export async function fetchAndCropReferenceAction(
  url: string,
): Promise<{ base64: string } | { error: string }> {
  return withAuth(async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) {
        return { error: `Failed to fetch reference image (${response.status})` }
      }
      const arrayBuf = await response.arrayBuffer()
      const base64 = Buffer.from(arrayBuf).toString("base64")
      const cropped = await cropReferenceFor3x2(base64)
      return { base64: cropped }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.warn("[CAD-LAB-IMAGES] Failed to fetch/crop reference image:", errorMsg)
      return { error: errorMsg }
    }
  })
}

/**
 * Generates a VisualStyleSpec for cohesive module illustrations.
 *
 * @description Calls Claude (Sonnet, fast) to produce a shared color palette,
 * material rendering, and unifying context that gets injected into every module
 * image prompt. Typically adds ~1-2s to the pipeline — negligible vs 15-30s image gen.
 *
 * @param subject - The product/system name
 * @param modules - The decomposed modules (names + purposes used as context)
 * @returns The generated VisualStyleSpec, or an error
 */
export async function generateVisualStyleAction(
  subject: string,
  modules: Array<{ name: string; purpose: string }>,
  researchExcerpt?: string,
): Promise<{ visualStyle: VisualStyleSpec } | { error: string }> {
  return withAuth(async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.warn("[CAD-LAB-IMAGES] No ANTHROPIC_API_KEY — skipping visual style generation")
      return { error: "ANTHROPIC_API_KEY not configured" }
    }

    const moduleList = modules.map((m) => `- ${m.name}: ${m.purpose}`).join("\n")
    const researchContext = researchExcerpt ? `\n\nResearch excerpt:\n${researchExcerpt}` : ""
    const userMessage = `Product: ${subject}\n\nModules:\n${moduleList}${researchContext}`

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system: getVisualStyleSystemPrompt(),
          messages: [{ role: "user", content: userMessage }],
        }),
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error("[CAD-LAB-IMAGES] Visual style API error:", { status: response.status, body: errText.slice(0, 200) })
        return { error: `API error (${response.status})` }
      }

      const data = await response.json()
      const text = data.content?.[0]?.text ?? ""

      // Parse JSON — strip any markdown fences the model might add
      const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
      const parsed = JSON.parse(jsonStr) as VisualStyleSpec

      if (!parsed.colorPalette || !parsed.materialRendering || !parsed.unifyingContext) {
        console.error("[CAD-LAB-IMAGES] Visual style missing required fields:", parsed)
        return { error: "Incomplete visual style response" }
      }

      console.log("[CAD-LAB-IMAGES] Generated visual style:", {
        colorPalette: parsed.colorPalette.slice(0, 60),
        unifyingContext: parsed.unifyingContext.slice(0, 60),
        hasProductForm: !!parsed.productFormDescription,
      })

      return { visualStyle: parsed }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.error("[CAD-LAB-IMAGES] Failed to generate visual style:", errorMsg)
      return { error: errorMsg }
    }
  })
}

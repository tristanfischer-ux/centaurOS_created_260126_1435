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
import type { ImageGenModuleInput } from "@/lib/cad-lab/module-to-module-spec-adapter"
import { generateModuleImage, generateResearchIllustration, prepareReferenceImage, cropReferenceFor3x2, analyseHeroBoundingBoxes, cropModuleRegion } from "@/app/(platform)/the-forge/services/image-generator"
import type { ModuleBoundingBox } from "@/app/(platform)/the-forge/services/image-generator"
import { getDesignSynthesisPrompt, getProductIdentityPrompt, getDesignReconciliationPrompt } from "@/lib/cad-lab/domain-prompts"
import type { ModuleConnection } from "@/lib/cad-lab-types"
import { withAIGate } from '@/lib/ai/with-ai-gate'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"
import { createAdminClient } from "@/lib/supabase/admin"

/** Lean return type for single-image generation — avoids React Flight serialization limits */
interface ImageGenResult {
  imageUrl?: string
  imageStatus: "complete" | "failed"
  imageError?: string
  imageModelUsed?: string
}

/** Concurrency limit — matches xray.ts batch size */
const BATCH_SIZE = 3

const STORAGE_BUCKET = "xray-images"

/**
 * Uploads shared image generation assets (reference PNG, visual style JSON) to
 * Supabase Storage so they can be fetched server-side by each module image call.
 * Eliminates ~500-800KB of redundant base64 per React Flight request.
 *
 * @param projectId - Storage namespace
 * @param referenceBase64 - Base64-encoded reference PNG
 * @param visualStyle - Shared visual style spec
 * @returns Public URLs for both assets
 */
export async function uploadSharedImageAssetsAction(
  projectId: string,
  referenceBase64?: string,
  visualStyle?: VisualStyleSpec,
): Promise<{ referenceUrl?: string; visualStyleUrl?: string } | { error: string }> {
  return withAIGate('cad_lab_images', async () => {
    try {
      const admin = createAdminClient()
      const timestamp = Date.now()
      let referenceUrl: string | undefined
      let visualStyleUrl: string | undefined

      if (referenceBase64) {
        const refPath = `${projectId}/temp-ref-${timestamp}.png`
        const { error: refErr } = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(refPath, Buffer.from(referenceBase64, "base64"), {
            contentType: "image/png",
            upsert: true,
          })
        if (refErr) {
          console.error("[CAD-LAB-IMAGES] Failed to upload reference:", refErr.message)
        } else {
          const { data } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(refPath)
          referenceUrl = data.publicUrl
        }
      }

      if (visualStyle) {
        const stylePath = `${projectId}/temp-style-${timestamp}.json`
        const { error: styleErr } = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(stylePath, Buffer.from(JSON.stringify(visualStyle), "utf-8"), {
            contentType: "application/json",
            upsert: true,
          })
        if (styleErr) {
          console.error("[CAD-LAB-IMAGES] Failed to upload visual style:", styleErr.message)
        } else {
          const { data } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(stylePath)
          visualStyleUrl = data.publicUrl
        }
      }

      return { referenceUrl, visualStyleUrl }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.error("[CAD-LAB-IMAGES] Failed to upload shared assets:", errorMsg)
      return { error: errorMsg }
    }
  })
}

/**
 * Cleans up temporary shared assets (temp-ref-*, temp-style-*) from Storage.
 * Called after image generation completes (success or failure).
 *
 * @param projectId - Storage namespace to clean
 */
export async function cleanupSharedImageAssetsAction(
  projectId: string,
): Promise<{ success: boolean } | { error: string }> {
  return withAIGate('cad_lab_images', async () => {
    try {
      const admin = createAdminClient()
      const { data: files } = await admin.storage
        .from(STORAGE_BUCKET)
        .list(projectId, { search: "temp-" })

      if (files && files.length > 0) {
        const tempFiles = files
          .filter(f => f.name.startsWith("temp-ref-") || f.name.startsWith("temp-style-"))
          .map(f => `${projectId}/${f.name}`)

        if (tempFiles.length > 0) {
          await admin.storage.from(STORAGE_BUCKET).remove(tempFiles)
        }
      }
      return { success: true }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.warn("[CAD-LAB-IMAGES] Cleanup failed (non-critical):", errorMsg)
      return { error: errorMsg }
    }
  })
}

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
 * Accepts either raw base64 data OR Supabase Storage URLs for shared assets.
 * When URLs are provided, fetches them server-side (same-region, ~10ms) to
 * avoid sending ~800KB of redundant base64 through React Flight per call.
 *
 * @param projectId - The CAD Lab project ID (used as storage namespace)
 * @param module - The module to generate an image for
 * @param visualStyleOrUrl - VisualStyleSpec object OR Supabase Storage URL to fetch it from
 * @param referenceBase64OrUrl - Base64 PNG string OR Supabase Storage URL to fetch it from
 * @param moduleCropBase64 - Optional base64 PNG of this module's cropped region (unique per module)
 * @returns Updated module with imageUrl/imageStatus set
 */
export async function generateCadLabSingleImageAction(
  projectId: string,
  module: ImageGenModuleInput,
  visualStyleOrUrl?: VisualStyleSpec | string,
  referenceBase64OrUrl?: string,
  moduleCropBase64?: string,
): Promise<ImageGenResult | { error: string }> {
  return withAIGate('cad_lab_images', async () => {
    try {
      // INTENT: Resolve shared assets from URLs if strings were passed (Supabase Storage).
      // Same-region fetch is ~10ms vs ~800KB saved per React Flight request.
      let visualStyle: VisualStyleSpec | undefined
      let referenceBase64: string | undefined

      if (typeof visualStyleOrUrl === "string") {
        const res = await fetchWithTimeout(visualStyleOrUrl, {}, 5_000)
        if (res.ok) visualStyle = await res.json() as VisualStyleSpec
      } else {
        visualStyle = visualStyleOrUrl
      }

      if (referenceBase64OrUrl) {
        // DECISION: If it starts with http, it's a URL to fetch. Otherwise it's raw base64.
        if (referenceBase64OrUrl.startsWith("http")) {
          const res = await fetchWithTimeout(referenceBase64OrUrl, {}, 10_000)
          if (res.ok) {
            const buf = await res.arrayBuffer()
            referenceBase64 = Buffer.from(buf).toString("base64")
          }
        } else {
          referenceBase64 = referenceBase64OrUrl
        }
      }

      const adapted = cadLabModuleToModuleSpec(module)
      const { url, modelUsed } = await generateModuleImage(projectId, adapted, undefined, visualStyle, referenceBase64, moduleCropBase64)

      return {
        imageUrl: url,
        imageStatus: "complete" as const,
        imageModelUsed: modelUsed,
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err)
      // INTENT: Pass raw error to client for debugging — image gen errors are
      // API responses (Gemini/OpenAI status codes), not sensitive internal state.
      console.error(`[CAD-LAB-IMAGES] Failed to generate image for ${module.name}:`, rawMsg)
      return {
        imageStatus: "failed" as const,
        imageError: rawMsg,
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
  return withAIGate('cad_lab_images', async () => {
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
            const { url, modelUsed } = await generateModuleImage(projectId, adapted, undefined, visualStyle, referenceBase64)
            updatedModules[globalIdx] = {
              ...module,
              imageUrl: url,
              imageStatus: "complete" as const,
              imageModelUsed: modelUsed,
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
  heroPrompt?: string,
  referenceImageUrls?: string[],
): Promise<{ url: string } | { error: string }> {
  return withAIGate('cad_lab_images', async () => {
    try {
      const url = await generateResearchIllustration(projectId, subject, moduleNames, modulePurposes, visualStyle, researchExcerpt, heroPrompt, referenceImageUrls)
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
  return withAIGate('cad_lab_images', async () => {
    try {
      const response = await fetchWithTimeout(url, {}, 10_000)
      if (!response.ok) {
        return { error: `Failed to fetch reference image (${response.status})` }
      }
      const arrayBuf = await response.arrayBuffer()
      const base64 = Buffer.from(arrayBuf).toString("base64")
      const prepared = await prepareReferenceImage(base64)
      return { base64: prepared }
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
  referenceImageUrls?: string[],
  documentContext?: string,
): Promise<{ visualStyle: VisualStyleSpec } | { error: string }> {
  return withAIGate('cad_lab_images', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
      console.warn("[CAD-LAB-IMAGES] No ANTHROPIC_API_KEY — skipping visual style generation")
      return { error: "ANTHROPIC_API_KEY not configured" }
    }

    const moduleList = modules.map((m) => `- ${m.name}: ${m.purpose}`).join("\n")
    const researchContext = researchExcerpt ? `\n\nResearch excerpt:\n${researchExcerpt}` : ""
    const docContext = documentContext
      ? `\n\n=== USER-UPLOADED REFERENCE DOCUMENTS ===\n${documentContext.slice(0, 3_000)}\nPrioritize these specs for material and aesthetic cues.`
      : ""
    const userMessage = `Product: ${subject}\n\nModules:\n${moduleList}${researchContext}${docContext}`

    // INTENT: When user-uploaded reference images are available, build multimodal
    // content so Claude can SEE the sketches while crafting visual style prompts.
    // Cap at 3 images for token budget.
    let messageContent: unknown
    if (referenceImageUrls && referenceImageUrls.length > 0) {
      const imageBlocks: Array<{ type: "image"; source: { type: "base64"; media_type: string; data: string } }> = []
      for (const url of referenceImageUrls.slice(0, 3)) {
        try {
          const res = await fetch(url)
          if (!res.ok) continue
          const buf = Buffer.from(await res.arrayBuffer())
          const contentType = res.headers.get("content-type") || "image/png"
          imageBlocks.push({
            type: "image",
            source: { type: "base64", media_type: contentType, data: buf.toString("base64") },
          })
        } catch { /* Skip failed fetches */ }
      }
      if (imageBlocks.length > 0) {
        messageContent = [...imageBlocks, { type: "text", text: userMessage }]
      } else {
        messageContent = userMessage
      }
    } else {
      messageContent = userMessage
    }

    try {
      const response = await fetchWithTimeout(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: getDesignSynthesisPrompt(),
            messages: [{ role: "user", content: messageContent }],
          }),
        },
        60_000,
      )

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

      console.log("[CAD-LAB-IMAGES] Generated visual style (design synthesis):", {
        colorPalette: parsed.colorPalette?.slice(0, 60),
        unifyingContext: parsed.unifyingContext?.slice(0, 60),
        hasHeroImagePrompt: !!parsed.heroImagePrompt,
        hasCadGeometryPrompt: !!parsed.cadGeometryPrompt,
      })

      return { visualStyle: parsed }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.error("[CAD-LAB-IMAGES] Failed to generate visual style:", errorMsg)
      return { error: errorMsg }
    }
  })
}

/**
 * Analyses the hero image to detect bounding box regions for each module.
 * Called once after hero generation. Returns normalised (0-1) bounding boxes.
 *
 * @param heroBase64 - Base64-encoded PNG of the hero/system illustration
 * @param moduleNames - Names of modules to locate
 * @returns Map of module name → bounding box, or empty on failure
 */
export async function analyseHeroForModulesAction(
  heroBase64: string,
  moduleNames: string[],
): Promise<{ boxes: Record<string, ModuleBoundingBox> } | { error: string }> {
  return withAIGate('cad_lab_images', async () => {
    try {
      const boxes = await analyseHeroBoundingBoxes(heroBase64, moduleNames)
      return { boxes }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.warn("[CAD-LAB-IMAGES] Bounding box analysis failed:", errorMsg)
      return { error: errorMsg }
    }
  })
}

/**
 * Crops a specific module's region from the hero image using a bounding box.
 * Returns a 1024×1024 PNG suitable as a second reference image.
 *
 * @param heroBase64 - Base64-encoded PNG of the hero image
 * @param box - Normalised bounding box from analyseHeroForModulesAction
 * @returns Base64-encoded 1024×1024 PNG crop, or error
 */
export async function cropModuleRegionAction(
  heroBase64: string,
  box: ModuleBoundingBox,
): Promise<{ base64: string } | { error: string }> {
  return withAIGate('cad_lab_images', async () => {
    try {
      const base64 = await cropModuleRegion(heroBase64, box)
      return { base64 }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.warn("[CAD-LAB-IMAGES] Module region crop failed:", errorMsg)
      return { error: errorMsg }
    }
  })
}

/**
 * Calls Opus 4.6 to establish product design identity from research data.
 *
 * @description Phase 1b of convergent refinement — runs parallel with skeleton.
 * Produces product-level design constraints (materials, finishes, spatial rules)
 * that are injected into every subsequent module expansion for consistency.
 *
 * @param subject - Product name
 * @param researchReport - Full research report (Opus handles long context)
 * @returns Partial VisualStyleSpec with identity fields, or error
 */
export async function generateProductIdentityAction(
  subject: string,
  researchReport: string,
): Promise<{ visualStyle: Partial<VisualStyleSpec> } | { error: string }> {
  return withAIGate('cad_lab_images', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
      console.warn("[CAD-LAB-IMAGES] No ANTHROPIC_API_KEY — skipping product identity")
      return { error: "ANTHROPIC_API_KEY not configured" }
    }

    const userMessage = `Product: ${subject}\n\nResearch Report:\n${researchReport}`

    try {
      const response = await fetchWithTimeout(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-6",
            max_tokens: 4096,
            system: getProductIdentityPrompt(),
            messages: [{ role: "user", content: userMessage }],
          }),
        },
        60_000,
      )

      if (!response.ok) {
        const errText = await response.text()
        console.error("[CAD-LAB-IMAGES] Product identity API error:", { status: response.status, body: errText.slice(0, 200) })
        return { error: `API error (${response.status})` }
      }

      const data = await response.json()
      const text = data.content?.[0]?.text ?? ""

      const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
      const parsed = JSON.parse(jsonStr) as Partial<VisualStyleSpec>

      if (!parsed.consistencyBrief || !parsed.designLanguage) {
        console.error("[CAD-LAB-IMAGES] Product identity missing required fields:", parsed)
        return { error: "Incomplete product identity response" }
      }

      console.log("[CAD-LAB-IMAGES] Product identity established:", {
        designLanguage: parsed.designLanguage,
        consistencyBrief: parsed.consistencyBrief?.slice(0, 80),
        spatialPrinciples: parsed.spatialPrinciples?.length ?? 0,
      })

      return { visualStyle: parsed }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.error("[CAD-LAB-IMAGES] Product identity failed:", errorMsg)
      return { error: errorMsg }
    }
  })
}

/**
 * Calls Opus 4.6 to synthesise a holistic design brief from fully expanded modules.
 *
 * @description Reviews ALL expanded modules, connections, and research to produce
 * a cohesive visual style AND hero image prompt. This replaces the Sonnet visual
 * style call in the skeleton-succeeded pipeline path. The hero prompt is crafted
 * with full product knowledge (~300-500 words vs ~100 words from skeleton data).
 *
 * @param subject - Product name
 * @param modules - Fully expanded modules with descriptions, keyParts, etc.
 * @param connections - Inter-module connections from decomposition
 * @param researchExcerpt - Executive summary or research excerpt
 * @returns VisualStyleSpec with heroImagePrompt populated, or error
 */
export async function generateDesignSynthesisAction(
  subject: string,
  modules: Array<{ name: string; purpose: string; description: string; keyParts: string[]; inputs: string[]; outputs: string[] }>,
  connections?: ModuleConnection[],
  researchExcerpt?: string,
  referenceImageUrls?: string[],
): Promise<{ visualStyle: VisualStyleSpec } | { error: string }> {
  return withAIGate('cad_lab_images', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
      console.warn("[CAD-LAB-IMAGES] No ANTHROPIC_API_KEY — skipping design synthesis")
      return { error: "ANTHROPIC_API_KEY not configured" }
    }

    const moduleList = modules.map((m) =>
      `### ${m.name}\n- Purpose: ${m.purpose}\n- Description: ${m.description}\n- Key Parts: ${m.keyParts.join(", ")}\n- Inputs: ${m.inputs.join(", ")}\n- Outputs: ${m.outputs.join(", ")}`
    ).join("\n\n")

    const connectionList = connections && connections.length > 0
      ? `\n\nInter-module connections:\n${connections.map(c => `- ${c.from} (${c.output}) → ${c.to} (${c.input})`).join("\n")}`
      : ""

    const researchContext = researchExcerpt ? `\n\nResearch excerpt:\n${researchExcerpt}` : ""

    const userMessage = `Product: ${subject}\n\n## Expanded Modules\n\n${moduleList}${connectionList}${researchContext}`

    // INTENT: Multimodal content with reference images for better visual style generation
    let messageContent: unknown
    if (referenceImageUrls && referenceImageUrls.length > 0) {
      const imageBlocks: Array<{ type: "image"; source: { type: "base64"; media_type: string; data: string } }> = []
      for (const url of referenceImageUrls.slice(0, 3)) {
        try {
          const res = await fetch(url)
          if (!res.ok) continue
          const buf = Buffer.from(await res.arrayBuffer())
          const contentType = res.headers.get("content-type") || "image/png"
          imageBlocks.push({
            type: "image",
            source: { type: "base64", media_type: contentType, data: buf.toString("base64") },
          })
        } catch { /* Skip failed fetches */ }
      }
      messageContent = imageBlocks.length > 0
        ? [...imageBlocks, { type: "text", text: userMessage }]
        : userMessage
    } else {
      messageContent = userMessage
    }

    try {
      const response = await fetchWithTimeout(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-6",
            max_tokens: 4096,
            system: getDesignSynthesisPrompt(),
            messages: [{ role: "user", content: messageContent }],
          }),
        },
        60_000,
      )

      if (!response.ok) {
        const errText = await response.text()
        console.error("[CAD-LAB-IMAGES] Design synthesis API error:", { status: response.status, body: errText.slice(0, 200) })
        return { error: `API error (${response.status})` }
      }

      const data = await response.json()
      const text = data.content?.[0]?.text ?? ""

      // Parse JSON — strip any markdown fences
      const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
      const parsed = JSON.parse(jsonStr) as VisualStyleSpec & { heroImagePrompt?: string }

      if (!parsed.colorPalette || !parsed.materialRendering || !parsed.unifyingContext) {
        console.error("[CAD-LAB-IMAGES] Design synthesis missing required fields:", parsed)
        return { error: "Incomplete design synthesis response" }
      }

      console.log("[CAD-LAB-IMAGES] Design synthesis complete:", {
        colorPalette: parsed.colorPalette.slice(0, 60),
        unifyingContext: parsed.unifyingContext.slice(0, 60),
        hasProductForm: !!parsed.productFormDescription,
        hasHeroPrompt: !!parsed.heroImagePrompt,
        heroPromptLength: parsed.heroImagePrompt?.length ?? 0,
      })

      return { visualStyle: parsed }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.error("[CAD-LAB-IMAGES] Design synthesis failed:", errorMsg)
      return { error: errorMsg }
    }
  })
}

// ─── Reconciliation return type ─────────────────────────────────────────

interface ReconciliationResult {
  visualStyle: VisualStyleSpec
  perModuleImagePrompts: Record<string, string>
  modulePatch: Record<string, { description?: string; materialNotes?: string; dimensionNotes?: string }>
}

/**
 * Calls Opus 4.6 to reconcile cross-module design inconsistencies and craft
 * unified image prompts for the entire product.
 *
 * @description Phase 3 of convergent refinement — replaces design synthesis.
 * Reviews all expanded modules + product identity holistically and produces:
 * (1) module patches for inconsistencies, (2) complete VisualStyleSpec with heroImagePrompt,
 * (3) per-module image prompts crafted TOGETHER for visual consistency.
 *
 * @param subject - Product name
 * @param modules - Fully expanded modules
 * @param connections - Inter-module connections
 * @param researchExcerpt - Executive summary or research excerpt
 * @param productIdentity - Product identity from Phase 1b (optional — graceful degradation)
 * @returns ReconciliationResult with visualStyle, perModuleImagePrompts, modulePatch, or error
 */
export async function reconcileDesignAction(
  subject: string,
  modules: Array<{ id: string; name: string; purpose: string; description: string; keyParts: string[]; inputs: string[]; outputs: string[] }>,
  connections?: ModuleConnection[],
  researchExcerpt?: string,
  productIdentity?: Partial<VisualStyleSpec>,
): Promise<ReconciliationResult | { error: string }> {
  return withAIGate('cad_lab_images', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
      console.warn("[CAD-LAB-IMAGES] No ANTHROPIC_API_KEY — skipping reconciliation")
      return { error: "ANTHROPIC_API_KEY not configured" }
    }

    const moduleList = modules.map((m) =>
      `### ${m.name} (id: ${m.id})\n- Purpose: ${m.purpose}\n- Description: ${m.description}\n- Key Parts: ${m.keyParts.join(", ")}\n- Inputs: ${m.inputs.join(", ")}\n- Outputs: ${m.outputs.join(", ")}`
    ).join("\n\n")

    const connectionList = connections && connections.length > 0
      ? `\n\nInter-module connections:\n${connections.map(c => `- ${c.from} (${c.output}) → ${c.to} (${c.input})`).join("\n")}`
      : ""

    const researchContext = researchExcerpt ? `\n\nResearch excerpt:\n${researchExcerpt}` : ""

    const identityContext = productIdentity
      ? `\n\nProduct Design Identity:\n- Design Language: ${productIdentity.designLanguage ?? "not established"}\n- Consistency Brief: ${productIdentity.consistencyBrief ?? "not established"}\n- Spatial Principles: ${productIdentity.spatialPrinciples?.join(", ") ?? "not established"}\n- Color Palette: ${productIdentity.colorPalette ?? "not established"}\n- Material Rendering: ${productIdentity.materialRendering ?? "not established"}`
      : ""

    const userMessage = `Product: ${subject}${identityContext}\n\n## Expanded Modules\n\n${moduleList}${connectionList}${researchContext}`

    try {
      const response = await fetchWithTimeout(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-6",
            max_tokens: 16384,
            system: getDesignReconciliationPrompt(),
            messages: [{ role: "user", content: userMessage }],
          }),
        },
        // GOTCHA: 90s and 120s both timed out for 8 modules with per-module prompts
        // (16384 tokens structured JSON output). 240s needed. Still fits Vercel 300s cap.
        240_000,
      )

      if (!response.ok) {
        const errText = await response.text()
        console.error("[CAD-LAB-IMAGES] Reconciliation API error:", { status: response.status, body: errText.slice(0, 200) })
        return { error: `API error (${response.status})` }
      }

      const data = await response.json()
      const text = data.content?.[0]?.text ?? ""

      const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
      const parsed = JSON.parse(jsonStr) as {
        modulePatch?: Record<string, { description?: string; materialNotes?: string; dimensionNotes?: string }>
        visualStyle?: VisualStyleSpec
        perModuleImagePrompts?: Record<string, string>
      }

      if (!parsed.visualStyle?.colorPalette || !parsed.visualStyle?.materialRendering || !parsed.visualStyle?.unifyingContext) {
        console.error("[CAD-LAB-IMAGES] Reconciliation missing required visual style fields:", parsed.visualStyle)
        return { error: "Incomplete reconciliation response" }
      }

      const patchCount = Object.keys(parsed.modulePatch ?? {}).length
      const promptCount = Object.keys(parsed.perModuleImagePrompts ?? {}).length

      console.log("[CAD-LAB-IMAGES] Reconciliation complete:", {
        colorPalette: parsed.visualStyle.colorPalette.slice(0, 60),
        hasHeroPrompt: !!parsed.visualStyle.heroImagePrompt,
        heroPromptLength: parsed.visualStyle.heroImagePrompt?.length ?? 0,
        modulePatchCount: patchCount,
        perModulePromptCount: promptCount,
      })

      return {
        visualStyle: parsed.visualStyle,
        perModuleImagePrompts: parsed.perModuleImagePrompts ?? {},
        modulePatch: parsed.modulePatch ?? {},
      }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.error("[CAD-LAB-IMAGES] Reconciliation failed:", errorMsg)
      return { error: errorMsg }
    }
  })
}

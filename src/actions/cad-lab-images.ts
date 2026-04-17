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
import { withAuth } from '@/lib/server-action-utils'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureCadLabProjectOwnership, isSafeStorageUrl } from "@/lib/cad-lab/project-ownership"
import { scoreRenderVision } from "@/lib/cad-lab/vision-scorer"

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
  return withAIGate('cad_lab_images', async ({ supabase, foundryId }) => {
    // SECURITY: Verify the caller's foundry owns this project before touching
    // its storage namespace via the admin client (which bypasses RLS).
    const ownershipErr = await ensureCadLabProjectOwnership(supabase, projectId, foundryId)
    if (ownershipErr) return { error: ownershipErr }

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
          // SECURITY: Use signed URL — user-uploaded reference images are confidential
          const { data } = await admin.storage.from(STORAGE_BUCKET).createSignedUrl(refPath, 3600)
          referenceUrl = data?.signedUrl ?? ''
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
          // SECURITY: Use signed URL — visual style specs are project-confidential
          const { data } = await admin.storage.from(STORAGE_BUCKET).createSignedUrl(stylePath, 3600)
          visualStyleUrl = data?.signedUrl ?? ''
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
  return withAIGate('cad_lab_images', async ({ supabase, foundryId }) => {
    // SECURITY: Verify ownership before listing/deleting in the storage namespace.
    const ownershipErr = await ensureCadLabProjectOwnership(supabase, projectId, foundryId)
    if (ownershipErr) return { error: ownershipErr }

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
  return withAIGate('cad_lab_images', async ({ supabase, foundryId }) => {
    // SECURITY: Block cross-foundry projectId — generateModuleImage writes to
    // xray-images/<projectId>/module-<id>.png via the admin client.
    const ownershipErr = await ensureCadLabProjectOwnership(supabase, projectId, foundryId)
    if (ownershipErr) return { error: ownershipErr }

    try {
      // INTENT: Resolve shared assets from URLs if strings were passed (Supabase Storage).
      // Same-region fetch is ~10ms vs ~800KB saved per React Flight request.
      let visualStyle: VisualStyleSpec | undefined
      let referenceBase64: string | undefined

      if (typeof visualStyleOrUrl === "string") {
        // SECURITY: SSRF guard — server-side fetch is only allowed against
        // our own Supabase storage hostname. Without this, a client could
        // pass any URL (e.g. 169.254.169.254 metadata endpoints) and cause
        // the server to issue an outbound fetch to that target.
        if (!isSafeStorageUrl(visualStyleOrUrl)) {
          console.warn("[CAD-LAB-IMAGES] Blocked visualStyle URL outside storage allowlist")
          return { error: "Invalid visualStyle URL" }
        }
        const res = await fetchWithTimeout(visualStyleOrUrl, {}, 5_000)
        if (res.ok) visualStyle = await res.json() as VisualStyleSpec
      } else {
        visualStyle = visualStyleOrUrl
      }

      if (referenceBase64OrUrl) {
        // DECISION: If it starts with http, it's a URL to fetch. Otherwise it's raw base64.
        if (referenceBase64OrUrl.startsWith("http")) {
          // SECURITY: SSRF guard on reference-image URL (see above).
          if (!isSafeStorageUrl(referenceBase64OrUrl)) {
            console.warn("[CAD-LAB-IMAGES] Blocked reference URL outside storage allowlist")
            return { error: "Invalid reference URL" }
          }
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
  return withAIGate('cad_lab_images', async ({ supabase, foundryId }) => {
    // SECURITY: Batch variant of generateCadLabSingleImageAction — same gate.
    const ownershipErr = await ensureCadLabProjectOwnership(supabase, projectId, foundryId)
    if (ownershipErr) return { error: ownershipErr }

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
/** Threshold below which the hero is considered low-confidence and returned
 *  with a `"low"` flag so the UI can surface a warning banner. 7 is the same
 *  threshold the module-level pipeline uses (see cad-lab.ts:1311). */
const HERO_QUALITY_THRESHOLD = 7
/** Max attempts to regenerate a low-scoring hero before we accept the best
 *  one. Keeps cost bounded (each retry costs one image gen + one vision call
 *  ≈ $0.08) while still catching egregious failures. */
const HERO_MAX_ATTEMPTS = 2

export async function generateCadLabSystemIllustrationAction(
  projectId: string,
  subject: string,
  moduleNames: string[],
  modulePurposes: string[],
  visualStyle?: VisualStyleSpec,
  researchExcerpt?: string,
  heroPrompt?: string,
  referenceImageUrls?: string[],
): Promise<{ url: string; confidence?: "high" | "low"; score?: number; issues?: string[] } | { error: string }> {
  return withAIGate('cad_lab_images', async ({ supabase, foundryId }) => {
    // SECURITY: hero illustration also writes to xray-images/<projectId>/.
    const ownershipErr = await ensureCadLabProjectOwnership(supabase, projectId, foundryId)
    if (ownershipErr) return { error: ownershipErr }

    // INTENT: Build a domain-aware rubric so low-scoring heroes get caught.
    // The rubric describes what the hero SHOULD show; the vision scorer then
    // decides whether the rendered PNG matches. Without this, the system would
    // happily persist physically implausible output (asymmetric wings, sideways
    // propellers, floating sub-assemblies) with no quality signal.
    const rubric = buildHeroQualityRubric(subject, moduleNames, modulePurposes)

    let bestUrl: string | null = null
    let bestScore = -1
    let bestIssues: string[] = []

    try {
      for (let attempt = 1; attempt <= HERO_MAX_ATTEMPTS; attempt++) {
        const url = await generateResearchIllustration(
          projectId,
          subject,
          moduleNames,
          modulePurposes,
          visualStyle,
          researchExcerpt,
          heroPrompt,
          referenceImageUrls,
        )
        // Fetch the rendered hero bytes and base64-encode for the scorer.
        // If the fetch fails (CDN hiccup, signed-URL oddity), skip scoring
        // rather than blocking the action — a working but unscored hero is
        // still more useful than no hero.
        let score: number | null = null
        let issues: string[] = []
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer())
            const base64 = buf.toString("base64")
            const result = await scoreRenderVision(
              base64,
              rubric,
              "System Illustration",
              undefined,
              undefined,
              "image/png",
            )
            if (result) {
              score = result.score
              issues = result.issues
              console.log(`[CAD-LAB-IMAGES] Hero attempt ${attempt} scored ${result.score}/10 — ${result.summary}`)
              if (result.issues.length > 0) {
                console.log(`[CAD-LAB-IMAGES] Hero issues: ${result.issues.join(" | ")}`)
              }
            }
          }
        } catch (scoreErr) {
          console.warn("[CAD-LAB-IMAGES] Hero vision scoring failed (non-fatal):", sanitizeErrorMessage(scoreErr))
        }

        // Always keep the best-scoring attempt (unknown score counts as 0).
        const effectiveScore = score ?? 0
        if (effectiveScore > bestScore) {
          bestUrl = url
          bestScore = effectiveScore
          bestIssues = issues
        }

        // Early-exit once we clear the threshold — don't pay for more attempts.
        if (score !== null && score >= HERO_QUALITY_THRESHOLD) break
      }

      if (!bestUrl) {
        return { error: "Hero generation failed after all attempts" }
      }

      const confidence: "high" | "low" = bestScore >= HERO_QUALITY_THRESHOLD ? "high" : "low"
      return { url: bestUrl, confidence, score: bestScore, issues: bestIssues }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.error("[CAD-LAB-IMAGES] Failed to generate system illustration:", errorMsg)
      return { error: errorMsg }
    }
  })
}

/** Build the hero quality rubric used by the vision scorer. Generic by default;
 *  when the subject line matches aircraft-adjacent keywords we layer in hard
 *  geometric constraints (symmetric wings, forward-facing propellers, tail
 *  attached to fuselage) because those are the failure modes we've seen. */
function buildHeroQualityRubric(
  subject: string,
  moduleNames: string[],
  modulePurposes: string[],
): string {
  const subjectLc = subject.toLowerCase()
  const aircraftTerms = ["uav", "drone", "aircraft", "airplane", "plane", "glider", "haps", "wingspan", "rotorcraft", "helicopter", "quadcopter", "airship", "vtol", "aeroplane"]
  const isAircraft = aircraftTerms.some((t) => subjectLc.includes(t))

  const moduleSummary = moduleNames.length > 0
    ? `The product decomposes into these modules: ${moduleNames.slice(0, 12).map((n, i) => `${n}${modulePurposes[i] ? ` (${modulePurposes[i].slice(0, 80)})` : ""}`).join("; ")}.`
    : ""

  const aircraftRules = isAircraft
    ? `\n\nAIRCRAFT-SPECIFIC CONSTRAINTS (MANDATORY for a good score):
- Wings must be SYMMETRIC: identical shape, identical colour/material, identical surface detail (including solar-cell layout) on left and right.
- Propellers must face FORWARD along the flight axis. Side-mounted props facing outboard are WRONG.
- Propeller count must be plausible for the configuration (typically 2 or 4 for a fixed-wing UAV). An odd fifth propeller on a detached pod is WRONG.
- The empennage (tail) must be CONNECTED to the fuselage (directly or via a visible boom). A floating detached tail is WRONG.
- Wings must attach to the fuselage at a wing root. Wings floating in space beside the fuselage are WRONG.
- A single part should not appear twice (e.g. a battery pack drawn both inside the fuselage and outside).`
    : ""

  return `Product: ${subject}

The rendered image should be a physically plausible, coherent single-product illustration — an assembled or cleanly exploded view of ONE product, NOT a collage of disconnected parts. All mirror-pair components (e.g. left and right wings, port and starboard thrusters) MUST render as visually identical mirror copies of each other: same colour, same material, same surface detail.

${moduleSummary}${aircraftRules}

Score the render against these expectations. A score of ≥ 7 means the render is usable as a system illustration in a founder-facing design tool. A score of < 7 means the render has at least one serious consistency or plausibility issue the user should be warned about.`
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
    // SECURITY: SSRF guard — the hero URL comes from the DB, but any action
    // callable from the client can be invoked with arbitrary arguments, so
    // treat the input as untrusted.
    if (!isSafeStorageUrl(url)) {
      console.warn("[CAD-LAB-IMAGES] Blocked reference fetch URL outside storage allowlist")
      return { error: "Invalid reference URL" }
    }
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
  modules: Array<{ id: string; name: string; purpose: string; description: string; keyParts: string[]; inputs: string[]; outputs: string[]; mirrorOf?: string | null }>,
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

    // INTENT: Expose mirror-pair relationships to Opus so the MIRROR PAIR SYMMETRY
    // rule in getDesignReconciliationPrompt() can actually fire. Previously the
    // reconciliation prompt asked Opus to "assign the IDENTICAL prompt text to
    // BOTH module IDs in perModuleImagePrompts" for mirror pairs, but the
    // user-message never told Opus which modules were mirrors — so it treated
    // Left Wing and Right Wing as independent modules and produced different
    // colour/cell-layout directives for each, leaking into the hero as an
    // asymmetric two-tone aircraft.
    const modulesById = new Map(modules.map((m) => [m.id, m]))
    const mirrorLines = modules
      .filter((m) => m.mirrorOf && modulesById.has(m.mirrorOf))
      .map((m) => `- ${m.name} (id: ${m.id}) is the mirror of ${modulesById.get(m.mirrorOf!)?.name} (id: ${m.mirrorOf})`)
    const mirrorContext = mirrorLines.length > 0
      ? `\n\n## Mirror Pair Relationships (CRITICAL for symmetry)\nThe following modules are mirror pairs. Per the MIRROR PAIR SYMMETRY rule, assign IDENTICAL perModuleImagePrompts entries to each mirror pair, and ensure colourPalette decisions treat them as a single logical part (same colour, same material, same cell layout):\n${mirrorLines.join("\n")}`
      : ""

    const userMessage = `Product: ${subject}${identityContext}\n\n## Expanded Modules\n\n${moduleList}${connectionList}${researchContext}${mirrorContext}`

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

/**
 * Re-signs a CAD Lab storage URL so stored signed URLs don't expire out from
 * under persistent UI state (most notably the 3D viewer's `tripoPreviewUrl`).
 *
 * @description The generate-provider and generate-gencad routes write signed
 * URLs into the `cad_lab_projects` row (`provider_results`, `integrated_-
 * assembly_stl_url`, etc). Signed URLs have a finite lifetime — the viewer
 * breaks silently once they expire. This action takes the stored URL, verifies
 * it belongs to the caller's foundry, extracts the storage path, and returns a
 * freshly-signed URL with a 7-day expiry.
 *
 * @security Uses withAuth + ensureCadLabProjectOwnership. The URL must point
 * to the project's storage namespace (cad-lab/<projectId>/...) or the action
 * refuses to re-sign.
 *
 * @param projectId - Project UUID for ownership check
 * @param expiredUrl - The stored (possibly-expired) signed URL
 * @returns { url } with a fresh 7-day signed URL, or { error }
 */
export async function refreshCadLabAssetUrlAction(
  projectId: string,
  expiredUrl: string,
): Promise<{ url: string } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const ownErr = await ensureCadLabProjectOwnership(supabase, projectId, foundryId)
    if (ownErr) return { error: ownErr }

    if (!expiredUrl || !isSafeStorageUrl(expiredUrl)) {
      return { error: "Invalid storage URL" }
    }

    // Storage signed URLs look like:
    //   https://<host>/storage/v1/object/sign/<bucket>/<path>?token=...
    // Extract <bucket> + <path> so we can re-sign the same object.
    let bucket: string
    let objectPath: string
    try {
      const parsed = new URL(expiredUrl)
      const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/(.+)$/)
      if (!match) return { error: "Unrecognised storage URL shape" }
      bucket = decodeURIComponent(match[1])
      objectPath = decodeURIComponent(match[2])
    } catch {
      return { error: "Failed to parse storage URL" }
    }

    // SECURITY: Refuse to re-sign URLs that don't live under this project's
    // storage namespace — stops a caller from re-signing cross-project assets
    // that happen to still live in the same bucket.
    const expectedPrefix = `cad-lab/${projectId}/`
    if (!objectPath.startsWith(expectedPrefix)) {
      return { error: "Asset does not belong to this project" }
    }

    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(objectPath, 60 * 60 * 24 * 7)

    if (error || !data?.signedUrl) {
      console.error("[CAD-LAB-IMAGES] Failed to re-sign asset URL:", error?.message)
      return { error: "Failed to refresh URL" }
    }
    return { url: data.signedUrl }
  })
}

/** Axis of symmetry for a mirror pair. */
export type MirrorAxis = 'horizontal' | 'vertical'

/**
 * Generates the mirror-image variant of a primary module's illustration by
 * flipping it along the requested axis and uploading it as the mirror
 * module's own asset in the xray-images bucket.
 *
 * @description Paired modules like "Left Wing" / "Right Wing" (horizontal),
 * or "Upper Deck" / "Lower Deck" (vertical), should render as mirror images
 * of each other. Previously the pipeline reused the primary image URL
 * verbatim, which made paired cards visually identical. This action produces
 * a true axis-correct mirror and persists it so downstream consumers (PDF
 * export, public share links, caching) get the correct image without any
 * render-time transform.
 *
 * Axis mapping:
 * - horizontal (default) → sharp.flop() — swaps left↔right about the vertical
 *   axis. Use for Left/Right and Port/Starboard pairs.
 * - vertical             → sharp.flip() — swaps top↔bottom about the
 *   horizontal axis. Use for Upper/Lower and Top/Bottom pairs.
 *
 * @param projectId - Owning CAD Lab project (storage namespace)
 * @param mirrorModuleId - ID of the module whose asset we're writing to
 * @param primaryImageUrl - Supabase storage URL of the already-generated
 *   primary image to be mirrored
 * @param axis - Axis of symmetry (defaults to 'horizontal' for back-compat)
 * @returns New public URL for the mirrored asset, or an error string
 */
export async function flipCadLabImageForMirrorAction(
  projectId: string,
  mirrorModuleId: string,
  primaryImageUrl: string,
  axis: MirrorAxis = 'horizontal',
  mirrorModuleName?: string,
): Promise<{ imageUrl: string } | { error: string }> {
  return withAIGate('cad_lab_images', async ({ supabase, foundryId }) => {
    const ownershipErr = await ensureCadLabProjectOwnership(supabase, projectId, foundryId)
    if (ownershipErr) return { error: ownershipErr }

    // SECURITY: Only allow fetching from our own Supabase storage. Without
    // this the caller could pass any URL and trigger a server-side outbound
    // fetch (SSRF) to an internal metadata endpoint or control-plane host.
    if (!isSafeStorageUrl(primaryImageUrl)) {
      return { error: "Unsafe primary image URL" }
    }

    // SECURITY: The mirror module ID is used as a filename — reject anything
    // that isn't a plain UUID-like token so it can't escape the project path.
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(mirrorModuleId)) {
      return { error: "Invalid mirror module id" }
    }

    if (axis !== 'horizontal' && axis !== 'vertical') {
      return { error: `Invalid mirror axis: ${axis}` }
    }

    // Server-side defence-in-depth: if the mirror module's NAME starts
    // with a vertical-axis directional prefix (Upper/Lower/Top/Bottom)
    // but the caller sent axis='horizontal', override to vertical.
    // Client-side axis resolution has historically been lossy — stale
    // bundles, React batching quirks, and server-action arg transmission
    // all produced the wrong axis. Deriving from the explicit name
    // parameter makes the server's decision independent of how the
    // client packaged the axis argument.
    let effectiveAxis: MirrorAxis = axis
    if (mirrorModuleName) {
      const nameLc = mirrorModuleName.trim().toLowerCase()
      if (/^(lower|bottom|upper|top)\s/.test(nameLc)) {
        if (effectiveAxis !== 'vertical') {
          console.warn(`[CAD-LAB-IMAGES] Overriding axis to vertical for name="${mirrorModuleName}" (caller sent ${axis})`)
          effectiveAxis = 'vertical'
        }
      } else if (/^(left|right|port|starboard)\s/.test(nameLc)) {
        if (effectiveAxis !== 'horizontal') {
          console.warn(`[CAD-LAB-IMAGES] Overriding axis to horizontal for name="${mirrorModuleName}" (caller sent ${axis})`)
          effectiveAxis = 'horizontal'
        }
      }
    }

    try {
      const resp = await fetchWithTimeout(primaryImageUrl, {}, 15000)
      if (!resp.ok) {
        return { error: `Primary image fetch failed: ${resp.status}` }
      }
      const inputBuf = Buffer.from(await resp.arrayBuffer())

      // INTENT: Lazy-load sharp — it's a heavy native module and the rest of
      // this file doesn't need it. Top-level import would bloat cold starts
      // even when the caller is only hitting generateCadLabSingleImageAction.
      const sharpModule = await import("sharp")
      const sharp = sharpModule.default
      const pipeline = sharp(inputBuf)
      const flippedBuf = await (
        effectiveAxis === 'vertical' ? pipeline.flip() : pipeline.flop()
      ).png().toBuffer()

      const admin = createAdminClient()
      const destPath = `${projectId}/module-${mirrorModuleId}.png`
      const { error: uploadErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(destPath, flippedBuf, {
          contentType: "image/png",
          upsert: true,
        })
      if (uploadErr) {
        return { error: `Flip upload failed: ${uploadErr.message}` }
      }

      const { data } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(destPath)
      if (!data?.publicUrl) {
        return { error: "Flipped image uploaded but public URL unavailable" }
      }
      // INTENT: Cache-bust so the card swaps from any stale copied URL to the
      // freshly flipped file without needing a hard reload.
      return { imageUrl: `${data.publicUrl}?v=${Date.now()}` }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err)
      console.error("[CAD-LAB-IMAGES] Flip failed:", errorMsg)
      return { error: errorMsg }
    }
  })
}

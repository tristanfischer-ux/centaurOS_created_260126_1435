/**
 * @file xray.ts — Server actions for The Forge (formerly Product X-Ray)
 *
 * @description Provides server-side operations for The Forge feature:
 * - scanIdea: AI-powered product decomposition + DB persistence
 * - deriveProcessClass: AI derivation from diagnostic answers
 * - generateModuleImages: Gemini blueprint image generation
 * - updateScanSpec: Persist spec changes (interviews, diagnostics)
 * - loadScan: Load a scan from DB
 * - listScans: List all scans for current foundry
 * - matchPeople: Find experts from marketplace + providers
 * - matchSuppliers: Find suppliers (gated on diagnostic completion)
 *
 * @security All actions use withAuth for authentication + foundry isolation
 * @audit Scan creation logged via console.info
 *
 * @related
 * - Schema: src/app/(platform)/the-forge/services/xray-schema.ts
 * - Scan service: src/app/(platform)/the-forge/services/scan.ts
 * - Image generator: src/app/(platform)/the-forge/services/image-generator.ts
 * - People service: src/app/(platform)/the-forge/services/people.ts
 * - Suppliers service: src/app/(platform)/the-forge/services/suppliers.ts
 */

"use server"

import { withAuth } from "@/lib/server-action-utils"
import { checkRateLimit } from "@/lib/security/rate-limit"
import { scanIdea as scanIdeaService, deriveProcessClassAI, refineScanAI, refineModuleAI } from "@/app/(platform)/the-forge/services/scan"
import { matchPeopleForModules } from "@/app/(platform)/the-forge/services/people"
import { matchSuppliersForModule } from "@/app/(platform)/the-forge/services/suppliers"
import { generateModuleImage, generateSystemImage } from "@/app/(platform)/the-forge/services/image-generator"
import { generateModuleCadModel, CadGenerationError } from "@/app/(platform)/the-forge/services/cad-generator"
import { generateModuleStructuralBrief } from "@/app/(platform)/the-forge/services/structural-brief"
import { runStructuralAnalysis } from "@/app/(platform)/the-forge/services/fea-generator"
import { runCfdAnalysis } from "@/app/(platform)/the-forge/services/cfd-generator"
import { runTopologyOptimization } from "@/app/(platform)/the-forge/services/topo-generator"
import { runThermalAnalysis } from "@/app/(platform)/the-forge/services/thermal-generator"
import { runEmiAnalysis, runFatigueAnalysis, runImpactAnalysis } from "@/app/(platform)/the-forge/services/premium-analysis-generator"
import { runConvergenceStep } from "@/app/(platform)/the-forge/services/convergence-controller"
import { enrichModules } from "@/app/(platform)/the-forge/services/inspiration-bridge"
import { generateReviewTasks } from "@/app/(platform)/the-forge/services/xray-to-objectives"

import { safeParseSpec, specToJson } from "@/app/(platform)/the-forge/services/xray-schema"
import type { XRaySpec, ModuleSpec, SystemAnalysis, ModuleAnalysis } from "@/app/(platform)/the-forge/services/xray-schema"
import type { PersonMatch } from "@/app/(platform)/the-forge/services/people"
import type { SupplierMatch } from "@/app/(platform)/the-forge/services/suppliers"
import type { ModuleEnrichment } from "@/app/(platform)/the-forge/services/inspiration-bridge"
import type { ConvergenceEvaluation, ProposedChange } from "@/app/(platform)/the-forge/services/convergence-controller"
import type { EngineeringReviewResult } from "@/app/(platform)/the-forge/services/xray-to-objectives"
import type { Json } from "@/types/database.types"
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

// ─── Helpers ─────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>

/**
 * SECURITY: Server-side field length validation for module spec edits (F5).
 * Prevents unbounded strings from being persisted via updateScanSpecAction.
 *
 * @param mod - The module spec to validate
 * @returns Error message if invalid, null if OK
 */
function validateModuleFieldLengths(mod: ModuleSpec): string | null {
  if (mod.name.length > 200) return "Module name too long (max 200)"
  if (mod.purpose.length > 500) return "Module purpose too long (max 500)"
  if ((mod.detail.whatItIs?.length ?? 0) > 5000) return "whatItIs too long (max 5000)"
  if (mod.keyParts.length > 20) return "Too many keyParts (max 20)"
  if (mod.keyParts.some(p => p.length > 500)) return "keyPart too long (max 500)"
  if (mod.tests.length > 20) return "Too many tests (max 20)"
  return null
}

/**
 * Loads a scan by ID with foundry isolation.
 * SECURITY: Always use this instead of raw .eq("id", scanId) to enforce foundry boundaries.
 *
 * @returns { scan } on success, or { error } if not found or wrong foundry
 */
async function loadScanForFoundry<T = { id: string; spec: Json }>(
  supabase: SupabaseClient,
  scanId: string,
  foundryId: string,
  select = "id, spec",
): Promise<{ scan: T } | { error: string }> {
  const { data: scan, error } = await supabase
    .from("xray_scans")
    .select(select)
    .eq("id", scanId)
    .eq("foundry_id", foundryId)
    .single()

  if (error || !scan) {
    return { error: "Scan not found" }
  }

  // Validate spec on read when present (graceful degradation on parse failure)
  const row = scan as unknown as Record<string, unknown>
  if (select.includes("spec") && row.spec != null) {
    row.spec = safeParseSpec(row.spec)
  }

  return { scan: scan as T }
}

// ─── Scan Actions ────────────────────────────────────────────────────

/**
 * Scans a product idea using AI and persists the result.
 *
 * @param idea - The raw product/machine idea text
 * @returns The scan ID and generated XRaySpec
 *
 * @security Requires authenticated user with foundry context
 * @audit Logs scan creation with scanId, foundryId, userId
 */
export async function scanIdeaAction(idea: string, researchReport?: string): Promise<
  { scanId: string; spec: XRaySpec } | { error: string }
> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit AI-powered scan
    const rl = await checkRateLimit("aiAnalysis", `xray:${user.id}`)
    if (rl) return { error: rl }

    // VALIDATION: Ensure idea is non-empty
    if (!idea?.trim()) {
      return { error: "Please enter a product idea to scan" }
    }
    if (idea.length > 5000) {
      return { error: "Idea text is too long (max 5000 characters)" }
    }

    // SECURITY: Cap research report length to prevent unbounded AI prompt (F2)
    const cappedReport = researchReport?.slice(0, 50_000)

    // Create placeholder row first with scan_status = 'scanning'
    // so Realtime subscribers see the scan-in-progress state
    const projectName = idea.trim().slice(0, 60)
    const { data: scan, error: insertError } = await supabase
      .from("xray_scans")
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        idea: idea.trim(),
        name: projectName,
        spec: specToJson({ idea: idea.trim(), function: "", assumptions: [], materials: [], processes: [], validation: [], modules: [] } as XRaySpec),
        status: "draft",
        stage: "concept",
        scan_status: "scanning",
      })
      .select("id")
      .single()

    if (insertError) {
      console.error("[XRay] Failed to create scan placeholder:", {
        error: insertError.message,
        foundryId,
        userId: user.id,
      })
      return { error: `Failed to save scan: ${sanitizeErrorMessage(insertError)}` }
    }

    let spec: XRaySpec
    try {
      // AI scan — pass capped research report for grounded module decomposition
      spec = await scanIdeaService(idea.trim(), cappedReport)
    } catch (aiError) {
      // Cleanup: delete orphaned placeholder so it does not remain stuck as "scanning"
      await supabase
        .from("xray_scans")
        .delete()
        .eq("id", scan.id)
        .eq("foundry_id", foundryId)
      const message = sanitizeErrorMessage(aiError)
      console.error("[XRay] AI scan failed, deleted placeholder:", {
        scanId: scan.id,
        foundryId,
        error: message,
      })
      return { error: `Scan failed: ${message}` }
    }

    // Update the row with the completed spec and mark as complete
    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({
        spec: specToJson(spec),
        status: "scanned",
        scan_status: "complete",
      })
      .eq("id", scan.id)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist scan result:", {
        error: updateError.message,
        scanId: scan.id,
        foundryId,
      })
      return { error: `Failed to save scan: ${sanitizeErrorMessage(updateError)}` }
    }

    // AUDIT: Log scan creation
    console.info("[XRay] Scan created:", {
      scanId: scan.id,
      foundryId,
      userId: user.id,
      moduleCount: spec.modules.length,
    })

    return { scanId: scan.id, spec }
  })
}

/**
 * Refines an existing scan by sending the current spec + updated idea to AI.
 *
 * @description The AI reviews the existing decomposition and produces an
 * improved version that incorporates the updated idea while preserving
 * modules with stable IDs (so images, CAD, interviews are kept).
 *
 * @param scanId - The existing scan ID to update
 * @param updatedIdea - The user's revised product idea text
 * @param currentSpec - The existing XRaySpec to refine
 * @returns Updated spec with refined modules
 *
 * @security Requires authenticated user with foundry context
 * @audit Logs scan refinement with scanId, foundryId
 */
export async function refineScanAction(
  scanId: string,
  updatedIdea: string,
  currentSpec: XRaySpec,
  researchReport?: string,
): Promise<{ scanId: string; spec: XRaySpec } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit AI-powered refinement
    const rl = await checkRateLimit("aiAnalysis", `xray:${user.id}`)
    if (rl) return { error: rl }

    // VALIDATION: Ensure idea is non-empty
    if (!updatedIdea?.trim()) {
      return { error: "Please enter a product idea to refine" }
    }
    if (updatedIdea.length > 5000) {
      return { error: "Idea text is too long (max 5000 characters)" }
    }

    // SECURITY: Cap research report length to prevent unbounded AI prompt (F2)
    const cappedReport = researchReport?.slice(0, 50_000)

    // Mark scan as in-progress so Realtime subscribers see the state change
    await supabase
      .from("xray_scans")
      .update({ scan_status: "scanning" })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    // AI refine scan — pass capped research report for grounded refinement
    const refinedSpec = await refineScanAI(updatedIdea.trim(), currentSpec, cappedReport)

    // Persist refined spec and mark scan as complete
    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({
        idea: updatedIdea.trim(),
        spec: specToJson(refinedSpec),
        status: "refined",
        scan_status: "complete",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist refined scan:", {
        error: updateError.message,
        scanId,
        foundryId,
      })
      return { error: `Failed to save refined scan: ${sanitizeErrorMessage(updateError)}` }
    }

    // AUDIT: Log scan refinement
    console.info("[XRay] Scan refined:", {
      scanId,
      foundryId,
      userId: user.id,
      moduleCount: refinedSpec.modules.length,
    })

    return { scanId, spec: refinedSpec }
  })
}

/**
 * Refines a single module using AI, preserving user edits and improving quality.
 *
 * @description Sends the user-edited module + system context to AI for
 * improvement. Does NOT auto-persist — returns the refined module for
 * user review in the edit dialog.
 *
 * @param scanId - The scan ID (for context)
 * @param editedModule - The module with user's manual edits
 * @param fullSpec - The full XRaySpec for system context
 * @returns The AI-refined module
 *
 * @security Requires authenticated user with foundry context
 */
export async function refineModuleAction(
  scanId: string,
  editedModule: ModuleSpec,
  fullSpec: XRaySpec,
): Promise<{ module: ModuleSpec } | { error: string }> {
  return withAuth(async () => {
    try {
      const refined = await refineModuleAI(editedModule, fullSpec)
      return { module: refined }
    } catch (error) {
      console.error("[XRay] Failed to refine module:", {
        moduleId: editedModule.id,
        error: error instanceof Error ? error.message : "Unknown",
      })
      return { error: "Failed to refine module with AI. Please try again." }
    }
  })
}

/**
 * Derives the process class from diagnostic answers using AI.
 *
 * @param scanId - The scan ID to update
 * @param moduleId - The gating module ID
 * @param answers - Map of questionId -> answer
 * @returns Updated spec with derived process class and risks
 *
 * @security Requires authenticated user with foundry context
 */
export async function deriveProcessClassAction(
  scanId: string,
  moduleId: string,
  answers: Record<string, string>,
): Promise<{ spec: XRaySpec } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit AI-powered diagnostic derivation
    const rl = await checkRateLimit("aiAnalysis", `xray:${user.id}`)
    if (rl) return { error: rl }

    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec
    const gatingModule = spec.modules.find((m) => m.id === moduleId)

    if (!gatingModule?.diagnostic) {
      return { error: "Module does not have a diagnostic" }
    }

    // Build answered questions for AI
    const answeredQuestions = gatingModule.diagnostic.questions
      .filter((q) => answers[q.id])
      .map((q) => ({
        question: q.question,
        answer: answers[q.id],
      }))

    if (answeredQuestions.length === 0) {
      return { error: "No answers provided" }
    }

    // AI derives process class
    const result = await deriveProcessClassAI(
      spec.idea,
      gatingModule.name,
      gatingModule.purpose,
      answeredQuestions,
    )

    // Update the spec
    const updatedSpec: XRaySpec = {
      ...spec,
      modules: spec.modules.map((m) => {
        if (m.id !== moduleId) return m
        return {
          ...m,
          diagnostic: {
            ...m.diagnostic!,
            questions: m.diagnostic!.questions.map((q) => ({
              ...q,
              answer: answers[q.id] ?? q.answer,
            })),
            freeform: m.diagnostic!.freeform,
            derivedProcessClass: result.derivedProcessClass,
            derivedRisks: result.derivedRisks,
          },
          detail: {
            ...m.detail,
            whatItIs: `Transformation core. Derived class: ${result.derivedProcessClass}.`,
            unknownsToResolve: [
              ...new Set([
                ...m.detail.unknownsToResolve,
                ...result.derivedRisks,
              ]),
            ],
          },
        }
      }),
    }

    // Persist updated spec
    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({
        spec: specToJson(updatedSpec),
        status: "diagnostic_complete",
      })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to update scan after diagnostic:", updateError.message)
      return { error: `Failed to save diagnostic: ${sanitizeErrorMessage(updateError)}` }
    }

    return { spec: updatedSpec }
  })
}

// ─── Image Generation Actions ────────────────────────────────────────

/**
 * Generates the system diagram image FIRST and returns immediately.
 *
 * @description This is the "fast visual" — generates only the system-level
 * process flow diagram (~15s) and persists it, so the concept page can
 * show something visually impactful as fast as possible. Module images
 * are generated separately via generateModuleImagesAction.
 *
 * @param scanId - The scan ID to generate the system image for
 * @returns Updated spec with system image URL, or error
 *
 * @security Requires authenticated user with foundry context
 */
export async function generateImagesAction(scanId: string): Promise<
  { spec: XRaySpec } | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec

    // PRIORITY: Generate system diagram first (fastest visual impact)
    let systemImageUrl = spec.systemImageUrl
    let systemImageStatus = spec.systemImageStatus
    try {
      systemImageUrl = await generateSystemImage(scanId, spec)
      systemImageStatus = "complete"
    } catch (error) {
      console.error("[XRay] Failed to generate system image:", {
        error: error instanceof Error ? error.message : "Unknown error",
      })
      systemImageStatus = "failed"
    }

    // Progressive save — system image available to UI immediately
    const updatedSpec: XRaySpec = {
      ...spec,
      systemImageUrl,
      systemImageStatus,
    }

    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: specToJson(updatedSpec) })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist system image:", updateError.message)
      return { spec: updatedSpec, persistError: updateError.message }
    }

    return { spec: updatedSpec }
  })
}

/**
 * Generates blueprint images for all modules in a scan (background task).
 *
 * @description Called after the system image is already visible on the
 * concept page. Generates per-module blueprint images in batches and
 * saves progressively so the module status grid updates in real-time
 * via the Supabase Realtime subscription.
 *
 * @param scanId - The scan ID to generate module images for
 * @returns Updated spec with all module image URLs, or error
 *
 * @security Requires authenticated user with foundry context
 */
export async function generateModuleImagesAction(scanId: string): Promise<
  { spec: XRaySpec } | { error: string }
> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit image generation
    const rl = await checkRateLimit("aiCadLab", `xray:${user.id}`)
    if (rl) return { error: rl }

    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec
    const BATCH_SIZE = 3
    const updatedModules = [...spec.modules]

    for (let i = 0; i < updatedModules.length; i += BATCH_SIZE) {
      const batch = updatedModules.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (module) => {
          if (module.imageUrl && module.imageStatus === "complete") {
            return module // Already has an image
          }
          try {
            const url = await generateModuleImage(scanId, module)
            return { ...module, imageUrl: url, imageStatus: "complete" as const }
          } catch (error) {
            console.error(`[XRay] Failed to generate image for module ${module.id}:`, {
              error: error instanceof Error ? error.message : "Unknown error",
            })
            return { ...module, imageStatus: "failed" as const }
          }
        }),
      )

      // Apply results back to updatedModules
      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        const moduleIndex = i + j
        if (result.status === "fulfilled") {
          updatedModules[moduleIndex] = result.value
        }
      }

      // Re-fetch spec before save to avoid overwriting concurrent updates
      // (e.g. system image from generateImagesAction)
      const refetch = await loadScanForFoundry(supabase, scanId, foundryId)
      const currentSpec = "error" in refetch ? spec : (refetch.scan.spec as unknown as XRaySpec)
      const batchSpec: XRaySpec = { ...currentSpec, modules: updatedModules }
      await supabase
        .from("xray_scans")
        .update({ spec: specToJson(batchSpec) })
        .eq("id", scanId)
        .eq("foundry_id", foundryId)
    }

    // Final persist — re-fetch once more to merge any concurrent updates
    const refetch = await loadScanForFoundry(supabase, scanId, foundryId)
    const currentSpec = "error" in refetch ? spec : (refetch.scan.spec as unknown as XRaySpec)
    const finalSpec: XRaySpec = { ...currentSpec, modules: updatedModules }
    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: specToJson(finalSpec) })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist module images:", updateError.message)
      return { spec: finalSpec, persistError: updateError.message }
    }

    return { spec: finalSpec }
  })
}

// ─── CAD Model Generation Actions ────────────────────────────────────

/**
 * Generates 3D CAD models for all modules in a scan.
 * Uses AI to write CadQuery code, then executes on Modal.com.
 * Heavier than image generation — runs in batches of 2.
 *
 * @param scanId - The scan ID to generate CAD models for
 * @param moduleIds - Optional: specific module IDs to generate for. If omitted, generates for all.
 * @returns Updated spec with CAD model URLs, or error
 *
 * @security Requires authenticated user with foundry context
 */
export async function generateCadModelsAction(
  scanId: string,
  moduleIds?: string[],
): Promise<{ spec: XRaySpec } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit CAD model generation
    const rl = await checkRateLimit("aiCadLab", `xray:${user.id}`)
    if (rl) return { error: rl }

    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec

    // CAD generation is heavier — batch size of 2
    const BATCH_SIZE = 2
    const updatedModules = [...spec.modules]

    // Filter to requested modules, or all
    const targetIndices = updatedModules
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => {
        if (moduleIds && moduleIds.length > 0) {
          return moduleIds.includes(m.id)
        }
        // Skip modules that already have a complete CAD model
        return m.cadModel?.status !== "complete"
      })
      .map(({ i }) => i)

    for (let batch = 0; batch < targetIndices.length; batch += BATCH_SIZE) {
      const batchIndices = targetIndices.slice(batch, batch + BATCH_SIZE)

      const results = await Promise.allSettled(
        batchIndices.map(async (moduleIndex) => {
          const xrayModule = updatedModules[moduleIndex]
          try {
            // Generate structural brief first (Opus orchestrator)
            const brief = await generateModuleStructuralBrief(xrayModule)
            const cadResult = await generateModuleCadModel(scanId, xrayModule, brief)
            return {
              moduleIndex,
              cadModel: {
                status: "complete" as const,
                stepUrl: cadResult.stepUrl,
                stlUrl: cadResult.stlUrl,
                svgIsoUrl: cadResult.svgIsoUrl,
                svgTopUrl: cadResult.svgTopUrl,
                svgFrontUrl: cadResult.svgFrontUrl,
                svgRightUrl: cadResult.svgRightUrl,
                cadQueryCode: cadResult.cadQueryCode,
                generatedAt: new Date().toISOString(),
                analysis: cadResult.analysis,
              },
            }
          } catch (error) {
            const errorMsg = sanitizeErrorMessage(error)
            // Persist the failed CadQuery code for debugging if available
            const failedCode = error instanceof CadGenerationError ? error.cadQueryCode : undefined
            console.error(`[XRay] Failed to generate CAD model for module ${xrayModule.id}:`, {
              error: errorMsg,
              hasFailedCode: !!failedCode,
            })
            return {
              moduleIndex,
              cadModel: {
                status: "failed" as const,
                generatedAt: new Date().toISOString(),
                errorMessage: errorMsg,
                ...(failedCode ? { cadQueryCode: failedCode } : {}),
              },
            }
          }
        }),
      )

      // Apply results back to updatedModules
      for (const result of results) {
        if (result.status === "fulfilled") {
          const { moduleIndex, cadModel } = result.value
          updatedModules[moduleIndex] = {
            ...updatedModules[moduleIndex],
            cadModel,
          }
        }
      }
    }

    // Compute system-level analysis from newly generated CAD models
    const systemAnalysis = computeSystemAnalysis(updatedModules)

    // Build updated spec
    const updatedSpec: XRaySpec = {
      ...spec,
      modules: updatedModules,
      systemAnalysis,
    }

    // Persist
    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: specToJson(updatedSpec) })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist CAD models:", updateError.message)
      return { spec: updatedSpec, persistError: updateError.message }
    }

    // AUDIT: Log CAD generation results
    const completedCount = updatedModules.filter((m) => m.cadModel?.status === "complete").length
    const failedCount = updatedModules.filter((m) => m.cadModel?.status === "failed").length
    console.info("[XRay] CAD model generation complete:", {
      scanId,
      completed: completedCount,
      failed: failedCount,
      total: targetIndices.length,
      totalMass_g: systemAnalysis.totalMass_kg
        ? Math.round(systemAnalysis.totalMass_kg * 1000)
        : undefined,
    })

    return { spec: updatedSpec }
  })
}

/**
 * Generates a system-level 3D CAD model representing the overall product.
 *
 * @description Uses AI to write CadQuery code for the full product form
 * factor (not individual modules), executes on Modal.com, and uploads
 * the resulting STL for the interactive 3D viewer on the concept page.
 *
 * @param scanId - The scan ID to generate the system CAD for
 * @returns Updated spec with systemCadUrl, or error
 *
 * @security Requires authenticated user with foundry context
 */
export async function generateSystemCadAction(scanId: string): Promise<
  { spec: XRaySpec } | { error: string }
> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit system CAD generation
    const rl = await checkRateLimit("aiCadLab", `xray:${user.id}`)
    if (rl) return { error: rl }

    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec

    try {
      const { generateSystemCadModel } = await import(
        "@/app/(platform)/the-forge/services/cad-generator"
      )
      const result = await generateSystemCadModel(scanId, spec)

      const updatedSpec: XRaySpec = {
        ...spec,
        systemCadUrl: result.stlUrl,
        systemCadStatus: "complete",
        systemCadSvgUrl: result.svgIsoUrl,
        systemCadExplodedSvgUrl: result.svgExplodedUrl,
      }

      const { error: updateError } = await supabase
        .from("xray_scans")
        .update({ spec: specToJson(updatedSpec) })
        .eq("id", scanId)
        .eq("foundry_id", foundryId)

      if (updateError) {
        console.error("[XRay] Failed to persist system CAD:", updateError.message)
        return { spec: updatedSpec, persistError: updateError.message }
      }

      console.info("[XRay] System CAD model generated:", { scanId, hasStl: !!result.stlUrl })
      return { spec: updatedSpec }
    } catch (error) {
      const errorMsg = sanitizeErrorMessage(error)
      const failedCode = error instanceof CadGenerationError ? error.cadQueryCode : undefined
      console.error("[XRay] System CAD generation failed:", {
        error: errorMsg,
        ...(failedCode ? { cadQueryCodeLength: failedCode.length } : {}),
      })

      // Mark as failed in spec, persist failed code for debugging
      const failedSpec: XRaySpec = {
        ...spec,
        systemCadStatus: "failed",
        ...(failedCode ? { systemCadQueryCode: failedCode } : {}),
      }
      await supabase
        .from("xray_scans")
        .update({ spec: specToJson(failedSpec) })
        .eq("id", scanId)
        .eq("foundry_id", foundryId)

      return { error: `System CAD generation failed: ${errorMsg.slice(0, 200)}` }
    }
  })
}

// ─── CRUD Actions ────────────────────────────────────────────────────

/**
 * Updates the spec JSONB for a scan (e.g., after interviews, manual edits).
 *
 * @param scanId - The scan ID
 * @param spec - The updated spec
 * @returns Success or error
 */
export async function updateScanSpecAction(
  scanId: string,
  spec: XRaySpec,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // SECURITY: Validate module field lengths before persisting (F5)
    for (const mod of spec.modules) {
      const fieldError = validateModuleFieldLengths(mod)
      if (fieldError) return { error: fieldError }
    }

    const { error } = await supabase
      .from("xray_scans")
      .update({
        spec: specToJson(spec),
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (error) {
      return { error: `Failed to update scan: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

/**
 * Loads a forge project (scan) by ID with full metadata.
 *
 * @param scanId - The scan/project ID
 * @returns The project data including spec, stage, name, or error
 *
 * @security RLS ensures foundry isolation
 */
export async function loadScanAction(scanId: string): Promise<
  {
    scanId: string
    foundryId: string
    spec: XRaySpec
    status: string
    scanStatus: string
    name: string | null
    stage: string
    idea: string
    thumbnailUrl: string | null
    researchReport: { report: string; sources: Array<{ uri: string; title: string }>; savedAt: string } | null
    createdAt: string
    updatedAt: string
  } | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    type ScanRow = { id: string; foundry_id: string; spec: Json; status: string; scan_status: string; name: string | null; stage: string; idea: string; thumbnail_url: string | null; research_report: Json; created_at: string; updated_at: string }
    const loadResult = await loadScanForFoundry<ScanRow>(
      supabase,
      scanId,
      foundryId,
      "id, foundry_id, spec, status, scan_status, name, stage, idea, thumbnail_url, research_report, created_at, updated_at",
    )
    if ("error" in loadResult) return { error: loadResult.error }
    const scan = loadResult.scan

    return {
      scanId: scan.id,
      foundryId: scan.foundry_id,
      spec: scan.spec as unknown as XRaySpec,
      status: scan.status,
      scanStatus: scan.scan_status,
      name: scan.name,
      stage: scan.stage,
      idea: scan.idea,
      thumbnailUrl: scan.thumbnail_url,
      researchReport: scan.research_report as unknown as { report: string; sources: Array<{ uri: string; title: string }>; savedAt: string } | null,
      createdAt: scan.created_at,
      updatedAt: scan.updated_at,
    }
  })
}

/**
 * Lists all forge projects for the current foundry.
 *
 * @returns Array of project summaries with metadata
 *
 * @security RLS ensures foundry isolation
 */
export async function listScansAction(): Promise<
  {
    scans: Array<{
      id: string
      idea: string
      name: string | null
      status: string
      stage: string
      thumbnailUrl: string | null
      moduleCount: number
      createdAt: string
      updatedAt: string
    }>
  } | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: scans, error } = await supabase
      .from("xray_scans")
      .select("id, idea, name, status, stage, thumbnail_url, module_count, created_at, updated_at")
      .eq("foundry_id", foundryId)
      .order("updated_at", { ascending: false })
      .limit(50)

    if (error) {
      return { error: `Failed to list scans: ${sanitizeErrorMessage(error)}` }
    }

    return {
      scans: (scans || []).map((s) => ({
        id: s.id,
        idea: s.idea,
        name: s.name,
        status: s.status,
        stage: s.stage,
        thumbnailUrl: s.thumbnail_url,
        moduleCount: s.module_count ?? 0,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
    }
  })
}

/**
 * Updates project metadata (name, stage) for a forge project.
 *
 * @param scanId - The project ID
 * @param updates - Partial update with name and/or stage
 * @returns Success or error
 *
 * @security Requires authenticated user, RLS ensures foundry isolation
 */
export async function updateProjectMetadataAction(
  scanId: string,
  updates: { name?: string; stage?: string; thumbnailUrl?: string },
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // VALIDATION: Stage must be valid if provided
    const validStages = ["concept", "dossier", "people", "supply_chain", "contracting"]
    if (updates.stage && !validStages.includes(updates.stage)) {
      return { error: `Invalid stage: ${updates.stage}` }
    }

    // VALIDATION: Name length
    if (updates.name !== undefined && updates.name.length > 200) {
      return { error: "Project name must be 200 characters or less" }
    }

    const updatePayload: Record<string, unknown> = {}
    if (updates.name !== undefined) updatePayload.name = updates.name
    if (updates.stage !== undefined) updatePayload.stage = updates.stage
    if (updates.thumbnailUrl !== undefined) updatePayload.thumbnail_url = updates.thumbnailUrl

    if (Object.keys(updatePayload).length === 0) {
      return { success: true as const }
    }

    const { error } = await supabase
      .from("xray_scans")
      .update(updatePayload)
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (error) {
      return { error: `Failed to update project: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Matching Actions ────────────────────────────────────────────────

/**
 * Matches experts to X-Ray modules based on discipline needs.
 * Results are persisted to the scan's people_matches column.
 *
 * @param scanId - The scan ID to persist results against
 * @param modules - The modules to match experts for
 * @param forceRefresh - If true, re-query even if cached data exists
 * @returns Ranked list of person matches
 *
 * @security Requires authenticated user with foundry context
 */
export async function matchPeopleAction(
  scanId: string | null,
  modules: ModuleSpec[],
  forceRefresh = false,
): Promise<{ people: PersonMatch[] } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit AI matching
    const rl = await checkRateLimit("aiMatch", `xray:${user.id}`)
    if (rl) return { error: rl }

    // Check for cached data first
    if (scanId && !forceRefresh) {
      const loadResult = await loadScanForFoundry<{ people_matches: unknown }>(supabase, scanId, foundryId, "id, people_matches")
      if ("scan" in loadResult && loadResult.scan.people_matches) {
        return { people: loadResult.scan.people_matches as unknown as PersonMatch[] }
      }
    }

    // Fresh query
    const people = await matchPeopleForModules(modules)

    // Persist to scan if we have a scanId
    if (scanId) {
      const { error: updateError } = await supabase
        .from("xray_scans")
        .update({ people_matches: people as unknown as Json })
        .eq("id", scanId)
        .eq("foundry_id", foundryId)

      if (updateError) {
        console.warn("[XRay] Failed to cache people matches:", updateError.message)
      }
    }

    return { people }
  })
}

/**
 * Matches suppliers to all modules (gated on diagnostic completion).
 * Results are persisted to the scan's supplier_matches column.
 *
 * @param scanId - The scan ID to persist results against
 * @param modules - The modules to match suppliers for
 * @param isGatingDiagComplete - Whether the gating diagnostic is complete
 * @param forceRefresh - If true, re-query even if cached data exists
 * @returns Map of moduleId -> SupplierMatch[]
 *
 * @security Requires authenticated user with foundry context
 */
export async function matchSuppliersAction(
  scanId: string | null,
  modules: ModuleSpec[],
  isGatingDiagComplete: boolean,
  forceRefresh = false,
): Promise<{ suppliersByModule: Record<string, SupplierMatch[]> } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit AI matching
    const rl = await checkRateLimit("aiMatch", `xray:${user.id}`)
    if (rl) return { error: rl }

    // Check for cached data first
    if (scanId && !forceRefresh) {
      const loadResult = await loadScanForFoundry<{ supplier_matches: unknown }>(supabase, scanId, foundryId, "id, supplier_matches")
      if ("scan" in loadResult && loadResult.scan.supplier_matches) {
        return { suppliersByModule: loadResult.scan.supplier_matches as unknown as Record<string, SupplierMatch[]> }
      }
    }

    // Fresh query for each module
    const suppliersByModule: Record<string, SupplierMatch[]> = {}
    await Promise.all(
      modules.map(async (module) => {
        const suppliers = await matchSuppliersForModule(module, isGatingDiagComplete)
        suppliersByModule[module.id] = suppliers
      }),
    )

    // Persist to scan
    if (scanId) {
      const { error: updateError } = await supabase
        .from("xray_scans")
        .update({ supplier_matches: suppliersByModule as unknown as Json })
        .eq("id", scanId)
        .eq("foundry_id", foundryId)

      if (updateError) {
        console.warn("[XRay] Failed to cache supplier matches:", updateError.message)
      }
    }

    return { suppliersByModule }
  })
}

// ─── Engineering Analysis Actions ────────────────────────────────────

/**
 * Re-runs analysis on modules that already have CadQuery code.
 * Useful for re-analyzing with different material parameters or
 * when analysis was missing from initial CAD generation.
 *
 * @param scanId - The scan ID
 * @param moduleIds - Optional: specific module IDs to analyze. If omitted, analyzes all with CAD code.
 * @returns Updated spec with analysis results
 *
 * @security Requires authenticated user with foundry context
 */
export async function analyzeModulesAction(
  scanId: string,
  moduleIds?: string[],
): Promise<{ spec: XRaySpec } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec
    const updatedModules = [...spec.modules]

    // Find modules with CAD code that need analysis
    const targetIndices = updatedModules
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => {
        if (!m.cadModel?.cadQueryCode) return false
        if (moduleIds && moduleIds.length > 0) return moduleIds.includes(m.id)
        return true
      })
      .map(({ i }) => i)

    if (targetIndices.length === 0) {
      return { error: "No modules with CAD code found to analyze" }
    }

    const baseUrl = process.env.MODAL_CAD_ENDPOINT_URL?.replace(/\/$/, "")
    if (!baseUrl) {
      return { error: "MODAL_CAD_ENDPOINT_URL not configured" }
    }
    const analysisEndpoint = `${baseUrl}/analyze`

    const BATCH_SIZE = 3
    for (let batch = 0; batch < targetIndices.length; batch += BATCH_SIZE) {
      const batchIndices = targetIndices.slice(batch, batch + BATCH_SIZE)

      const results = await Promise.allSettled(
        batchIndices.map(async (moduleIndex) => {
          const xrayModule = updatedModules[moduleIndex]
          const code = xrayModule.cadModel!.cadQueryCode!

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 90_000)

          try {
            const response = await fetch(analysisEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code,
                module_id: xrayModule.id,
                material_density: 1240, // Default PLA
              }),
              signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
              throw new Error(`Analysis API error: ${response.status}`)
            }

            const data = await response.json()
            return { moduleIndex, analysis: data.analysis as ModuleAnalysis | null }
          } catch (error) {
            clearTimeout(timeoutId)
            console.error(`[XRay] Analysis failed for module ${xrayModule.id}:`, {
              error: error instanceof Error ? error.message : "Unknown",
            })
            return { moduleIndex, analysis: null }
          }
        }),
      )

      for (const result of results) {
        if (result.status === "fulfilled" && result.value.analysis) {
          const { moduleIndex, analysis } = result.value
          const existing = updatedModules[moduleIndex].cadModel
          if (existing) {
            updatedModules[moduleIndex] = {
              ...updatedModules[moduleIndex],
              cadModel: { ...existing, analysis: analysis ?? undefined },
            }
          }
        }
      }
    }

    // Compute system-level analysis (aggregate CG, total mass, etc.)
    const systemAnalysis = computeSystemAnalysis(updatedModules)

    const updatedSpec: XRaySpec = {
      ...spec,
      modules: updatedModules,
      systemAnalysis,
    }

    // Persist
    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: specToJson(updatedSpec) })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist analysis results:", updateError.message)
      return { spec: updatedSpec, persistError: updateError.message }
    }

    console.info("[XRay] Module analysis complete:", {
      scanId,
      analyzedCount: targetIndices.length,
      totalMass_g: systemAnalysis.totalMass_kg
        ? Math.round(systemAnalysis.totalMass_kg * 1000)
        : undefined,
    })

    return { spec: updatedSpec }
  })
}

/**
 * Computes system-level analysis by aggregating per-module results.
 *
 * @description Calculates total mass, weighted center of gravity, and
 * manufacturability grade from individual module analysis data.
 *
 * @param modules - Array of modules with analysis data
 * @returns Aggregated system analysis
 */
function computeSystemAnalysis(modules: ModuleSpec[]): SystemAnalysis {
  const analyzed = modules.filter((m) => m.cadModel?.analysis?.massProperties)
  if (analyzed.length === 0) {
    return { computedAt: new Date().toISOString() }
  }

  // Total mass
  let totalMass = 0
  let weightedCgX = 0
  let weightedCgY = 0
  let weightedCgZ = 0

  // Total MOI (simplified — assumes modules at origin, not proper parallel axis theorem)
  let totalIxx = 0
  let totalIyy = 0
  let totalIzz = 0

  for (const mod of analyzed) {
    const mp = mod.cadModel!.analysis!.massProperties!
    const mass = mp.mass_kg
    totalMass += mass
    weightedCgX += mp.centerOfGravity[0] * mass
    weightedCgY += mp.centerOfGravity[1] * mass
    weightedCgZ += mp.centerOfGravity[2] * mass
    totalIxx += mp.momentOfInertia.Ixx
    totalIyy += mp.momentOfInertia.Iyy
    totalIzz += mp.momentOfInertia.Izz
  }

  const systemCg: [number, number, number] = totalMass > 0
    ? [
        Math.round((weightedCgX / totalMass) * 1000) / 1000,
        Math.round((weightedCgY / totalMass) * 1000) / 1000,
        Math.round((weightedCgZ / totalMass) * 1000) / 1000,
      ]
    : [0, 0, 0]

  // Manufacturability grade: all printable = pass, some issues = marginal, critical = fail
  const dfmResults = modules
    .filter((m) => m.cadModel?.analysis?.dfm)
    .map((m) => m.cadModel!.analysis!.dfm!)

  let manufacturabilityGrade: "pass" | "marginal" | "fail" | "not_analyzed" = "not_analyzed"
  if (dfmResults.length > 0) {
    const hasCritical = dfmResults.some((d) => d.issues.some((i) => i.severity === "critical"))
    const hasWarning = dfmResults.some((d) => d.issues.some((i) => i.severity === "warning"))
    if (hasCritical) manufacturabilityGrade = "fail"
    else if (hasWarning) manufacturabilityGrade = "marginal"
    else manufacturabilityGrade = "pass"
  }

  return {
    totalMass_kg: Math.round(totalMass * 1000000) / 1000000,
    systemCenterOfGravity: systemCg,
    systemMomentOfInertia: {
      Ixx: totalIxx, Iyy: totalIyy, Izz: totalIzz,
      Ixy: 0, Ixz: 0, Iyz: 0,
    },
    convergenceStatus: "not_started",
    manufacturabilityGrade,
    structuralGrade: "not_analyzed",
    thermalGrade: "not_analyzed",
    computedAt: new Date().toISOString(),
  }
}

// ─── Structural Analysis Actions ─────────────────────────────────────

/**
 * Runs structural FEA on modules that have complete CAD models.
 * AI generates load cases, then the FEA worker meshes and solves.
 *
 * @param scanId - The scan ID
 * @param moduleIds - Optional: specific module IDs. If omitted, all with CAD.
 * @returns Updated spec with structural analysis results
 *
 * @security Requires authenticated user with foundry context
 */
export async function runStructuralAnalysisAction(
  scanId: string,
  moduleIds?: string[],
): Promise<{ spec: XRaySpec } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit structural analysis
    const rl = await checkRateLimit("aiAnalysis", `xray:${user.id}`)
    if (rl) return { error: rl }

    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec
    const updatedModules = [...spec.modules]

    // Find modules with complete CAD models
    const targetIndices = updatedModules
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => {
        if (m.cadModel?.status !== "complete" || !m.cadModel.stepUrl) return false
        if (moduleIds && moduleIds.length > 0) return moduleIds.includes(m.id)
        return true
      })
      .map(({ i }) => i)

    if (targetIndices.length === 0) {
      return { error: "No modules with complete CAD models found" }
    }

    // Run FEA sequentially (each takes significant compute time)
    for (const idx of targetIndices) {
      const xrayModule = updatedModules[idx]
      try {
        // Mark as running
        if (xrayModule.cadModel?.analysis) {
          updatedModules[idx] = {
            ...xrayModule,
            cadModel: {
              ...xrayModule.cadModel!,
              analysis: {
                ...xrayModule.cadModel!.analysis,
                structural: { status: "running", computedAt: new Date().toISOString() },
              },
            },
          }
        }

        const structural = await runStructuralAnalysis(scanId, xrayModule)
        const existing = updatedModules[idx].cadModel?.analysis ?? {}
        updatedModules[idx] = {
          ...updatedModules[idx],
          cadModel: {
            ...updatedModules[idx].cadModel!,
            analysis: { ...existing, structural },
          },
        }
      } catch (error) {
        console.error(`[XRay] Structural analysis failed for ${xrayModule.id}:`, {
          error: error instanceof Error ? error.message : "Unknown",
        })
        const existing = updatedModules[idx].cadModel?.analysis ?? {}
        updatedModules[idx] = {
          ...updatedModules[idx],
          cadModel: {
            ...updatedModules[idx].cadModel!,
            analysis: {
              ...existing,
              structural: { status: "failed", computedAt: new Date().toISOString() },
            },
          },
        }
      }
    }

    // Update system analysis with structural grades
    const systemAnalysis = computeSystemAnalysis(updatedModules)

    // Compute structural grade from results
    const structuralResults = updatedModules
      .filter((m) => m.cadModel?.analysis?.structural?.status === "complete")
      .map((m) => m.cadModel!.analysis!.structural!)

    if (structuralResults.length > 0) {
      const minSf = Math.min(...structuralResults.map((s) => s.safetyFactor ?? 999))
      systemAnalysis.structuralGrade =
        minSf >= 2.0 ? "pass" : minSf >= 1.5 ? "marginal" : "fail"
    }

    const updatedSpec: XRaySpec = {
      ...spec,
      modules: updatedModules,
      systemAnalysis,
    }

    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: specToJson(updatedSpec) })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist structural results:", updateError.message)
      return { spec: updatedSpec, persistError: updateError.message }
    }

    console.info("[XRay] Structural analysis complete:", {
      scanId,
      analyzed: targetIndices.length,
      passed: structuralResults.filter((s) => (s.safetyFactor ?? 0) >= 1.5).length,
    })

    return { spec: updatedSpec }
  })
}

/**
 * Runs CFD analysis on modules with complete CAD models.
 * AI generates flow conditions, then the CFD worker runs OpenFOAM.
 *
 * @param scanId - The scan ID
 * @param moduleIds - Optional: specific module IDs. If omitted, all with CAD.
 * @returns Updated spec with CFD results
 *
 * @security Requires authenticated user with foundry context
 */
export async function runCfdAnalysisAction(
  scanId: string,
  moduleIds?: string[],
): Promise<{ spec: XRaySpec } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit CFD analysis
    const rl = await checkRateLimit("aiAnalysis", `xray:${user.id}`)
    if (rl) return { error: rl }

    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec
    const updatedModules = [...spec.modules]

    // Find modules with complete CAD models
    const targetIndices = updatedModules
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => {
        if (m.cadModel?.status !== "complete" || !m.cadModel.stepUrl) return false
        if (moduleIds && moduleIds.length > 0) return moduleIds.includes(m.id)
        return true
      })
      .map(({ i }) => i)

    if (targetIndices.length === 0) {
      return { error: "No modules with complete CAD models found" }
    }

    // Run CFD sequentially (each takes significant compute time)
    for (const idx of targetIndices) {
      const xrayModule = updatedModules[idx]
      try {
        const cfd = await runCfdAnalysis(scanId, xrayModule)
        const existing = updatedModules[idx].cadModel?.analysis ?? {}
        updatedModules[idx] = {
          ...updatedModules[idx],
          cadModel: {
            ...updatedModules[idx].cadModel!,
            analysis: { ...existing, cfd },
          },
        }
      } catch (error) {
        console.error(`[XRay] CFD analysis failed for ${xrayModule.id}:`, {
          error: error instanceof Error ? error.message : "Unknown",
        })
        const existing = updatedModules[idx].cadModel?.analysis ?? {}
        updatedModules[idx] = {
          ...updatedModules[idx],
          cadModel: {
            ...updatedModules[idx].cadModel!,
            analysis: {
              ...existing,
              cfd: { status: "failed", computedAt: new Date().toISOString() },
            },
          },
        }
      }
    }

    const systemAnalysis = computeSystemAnalysis(updatedModules)
    const updatedSpec: XRaySpec = {
      ...spec,
      modules: updatedModules,
      systemAnalysis,
    }

    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: specToJson(updatedSpec) })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist CFD results:", updateError.message)
      return { spec: updatedSpec, persistError: updateError.message }
    }

    console.info("[XRay] CFD analysis complete:", {
      scanId,
      analyzed: targetIndices.length,
    })

    return { spec: updatedSpec }
  })
}

/**
 * Runs topology optimization on modules with complete CAD models.
 * Identifies material removal regions for weight reduction.
 *
 * @param scanId - The scan ID
 * @param moduleIds - Optional: specific module IDs. If omitted, all with CAD.
 * @param volumeFraction - Target volume fraction (default 0.5)
 * @returns Updated spec with topology optimization results
 *
 * @security Requires authenticated user with foundry context
 */
export async function runTopologyOptimizationAction(
  scanId: string,
  moduleIds?: string[],
  volumeFraction: number = 0.5,
): Promise<{ spec: XRaySpec } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec
    const updatedModules = [...spec.modules]

    const targetIndices = updatedModules
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => {
        if (m.cadModel?.status !== "complete" || !m.cadModel.stepUrl) return false
        if (moduleIds && moduleIds.length > 0) return moduleIds.includes(m.id)
        return true
      })
      .map(({ i }) => i)

    if (targetIndices.length === 0) {
      return { error: "No modules with complete CAD models found" }
    }

    for (const idx of targetIndices) {
      const xrayModule = updatedModules[idx]
      try {
        const topo = await runTopologyOptimization(scanId, xrayModule, volumeFraction)
        const existing = updatedModules[idx].cadModel?.analysis ?? {}
        updatedModules[idx] = {
          ...updatedModules[idx],
          cadModel: {
            ...updatedModules[idx].cadModel!,
            analysis: { ...existing, topology: topo },
          },
        }
      } catch (error) {
        console.error(`[XRay] Topology optimization failed for ${xrayModule.id}:`, {
          error: error instanceof Error ? error.message : "Unknown",
        })
        const existing = updatedModules[idx].cadModel?.analysis ?? {}
        updatedModules[idx] = {
          ...updatedModules[idx],
          cadModel: {
            ...updatedModules[idx].cadModel!,
            analysis: {
              ...existing,
              topology: { status: "failed", computedAt: new Date().toISOString() },
            },
          },
        }
      }
    }

    const systemAnalysis = computeSystemAnalysis(updatedModules)
    const updatedSpec: XRaySpec = {
      ...spec,
      modules: updatedModules,
      systemAnalysis,
    }

    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: specToJson(updatedSpec) })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist topology results:", updateError.message)
      return { spec: updatedSpec, persistError: updateError.message }
    }

    return { spec: updatedSpec }
  })
}

/**
 * Runs thermal analysis on modules with complete CAD models.
 * AI infers heat sources, then CalculiX solves for temperature distribution.
 *
 * @param scanId - The scan ID
 * @param moduleIds - Optional: specific module IDs
 * @returns Updated spec with thermal analysis results
 *
 * @security Requires authenticated user with foundry context
 */
export async function runThermalAnalysisAction(
  scanId: string,
  moduleIds?: string[],
): Promise<{ spec: XRaySpec } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit thermal analysis
    const rl = await checkRateLimit("aiAnalysis", `xray:${user.id}`)
    if (rl) return { error: rl }

    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec
    const updatedModules = [...spec.modules]

    const targetIndices = updatedModules
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => {
        if (m.cadModel?.status !== "complete" || !m.cadModel.stepUrl) return false
        if (moduleIds && moduleIds.length > 0) return moduleIds.includes(m.id)
        return true
      })
      .map(({ i }) => i)

    if (targetIndices.length === 0) {
      return { error: "No modules with complete CAD models found" }
    }

    for (const idx of targetIndices) {
      const xrayModule = updatedModules[idx]
      try {
        const thermal = await runThermalAnalysis(scanId, xrayModule)
        const existing = updatedModules[idx].cadModel?.analysis ?? {}
        updatedModules[idx] = {
          ...updatedModules[idx],
          cadModel: {
            ...updatedModules[idx].cadModel!,
            analysis: { ...existing, thermal },
          },
        }
      } catch (error) {
        console.error(`[XRay] Thermal analysis failed for ${xrayModule.id}:`, {
          error: error instanceof Error ? error.message : "Unknown",
        })
        const existing = updatedModules[idx].cadModel?.analysis ?? {}
        updatedModules[idx] = {
          ...updatedModules[idx],
          cadModel: {
            ...updatedModules[idx].cadModel!,
            analysis: {
              ...existing,
              thermal: { status: "failed", computedAt: new Date().toISOString() },
            },
          },
        }
      }
    }

    // Update system analysis with thermal grades
    const systemAnalysis = computeSystemAnalysis(updatedModules)

    const thermalResults = updatedModules
      .filter((m) => m.cadModel?.analysis?.thermal?.status === "complete")
      .map((m) => m.cadModel!.analysis!.thermal!)

    if (thermalResults.length > 0) {
      const allWithinLimits = thermalResults.every((t) => t.withinLimits !== false)
      const minMargin = Math.min(...thermalResults.map((t) => t.thermalMargin_pct ?? 100))
      systemAnalysis.thermalGrade = allWithinLimits
        ? (minMargin > 20 ? "pass" : "marginal")
        : "fail"
    }

    const updatedSpec: XRaySpec = {
      ...spec,
      modules: updatedModules,
      systemAnalysis,
    }

    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: specToJson(updatedSpec) })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist thermal results:", updateError.message)
      return { spec: updatedSpec, persistError: updateError.message }
    }

    return { spec: updatedSpec }
  })
}

/**
 * Runs premium analyses (EMI, fatigue, impact) on modules.
 * Requires modules to have existing analysis data (mass properties, structural).
 *
 * @param scanId - The scan ID
 * @param analysisTypes - Which premium analyses to run
 * @param moduleIds - Optional: specific module IDs
 * @returns Updated spec with premium analysis results
 *
 * @security Requires authenticated user with foundry context
 */
export async function runPremiumAnalysisAction(
  scanId: string,
  analysisTypes: ("emi" | "fatigue" | "impact")[],
  moduleIds?: string[],
): Promise<{ spec: XRaySpec } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec
    const updatedModules = [...spec.modules]

    const targetIndices = updatedModules
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => {
        if (m.cadModel?.status !== "complete") return false
        if (moduleIds && moduleIds.length > 0) return moduleIds.includes(m.id)
        return true
      })
      .map(({ i }) => i)

    if (targetIndices.length === 0) {
      return { error: "No modules with complete CAD models found" }
    }

    for (const idx of targetIndices) {
      const xrayModule = updatedModules[idx]
      const existing = updatedModules[idx].cadModel?.analysis ?? {}

      // Run each requested analysis type
      for (const type of analysisTypes) {
        try {
          if (type === "emi") {
            const emi = await runEmiAnalysis(scanId, xrayModule)
            updatedModules[idx] = {
              ...updatedModules[idx],
              cadModel: {
                ...updatedModules[idx].cadModel!,
                analysis: { ...updatedModules[idx].cadModel?.analysis, emiShielding: emi },
              },
            }
          } else if (type === "fatigue") {
            const fatigue = await runFatigueAnalysis(xrayModule)
            updatedModules[idx] = {
              ...updatedModules[idx],
              cadModel: {
                ...updatedModules[idx].cadModel!,
                analysis: { ...updatedModules[idx].cadModel?.analysis, fatigue },
              },
            }
          } else if (type === "impact") {
            const impact = await runImpactAnalysis(xrayModule)
            updatedModules[idx] = {
              ...updatedModules[idx],
              cadModel: {
                ...updatedModules[idx].cadModel!,
                analysis: { ...updatedModules[idx].cadModel?.analysis, impact },
              },
            }
          }
        } catch (error) {
          console.error(`[XRay] Premium ${type} analysis failed for ${xrayModule.id}:`, {
            error: error instanceof Error ? error.message : "Unknown",
          })
        }
      }
    }

    const systemAnalysis = computeSystemAnalysis(updatedModules)
    const updatedSpec: XRaySpec = {
      ...spec,
      modules: updatedModules,
      systemAnalysis,
    }

    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: specToJson(updatedSpec) })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist premium analysis results:", updateError.message)
      return { spec: updatedSpec, persistError: updateError.message }
    }

    return { spec: updatedSpec }
  })
}

/**
 * Runs one step of the convergence loop: evaluate criteria and propose changes.
 *
 * @param scanId - The scan ID
 * @returns Evaluation result with proposed changes for user review
 *
 * @security Requires authenticated user with foundry context
 */
export async function runConvergenceStepAction(
  scanId: string,
): Promise<{
  evaluation: ConvergenceEvaluation
  proposedChanges: ProposedChange[]
  shouldContinue: boolean
  spec: XRaySpec
} | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit convergence step (calls AI)
    const rl = await checkRateLimit("aiAnalysis", `xray:${user.id}`)
    if (rl) return { error: rl }

    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec

    const { evaluation, updatedSystemAnalysis, shouldContinue } =
      await runConvergenceStep(spec)

    // Merge updated convergence state into system analysis
    const updatedSpec: XRaySpec = {
      ...spec,
      systemAnalysis: {
        ...(spec.systemAnalysis ?? {}),
        ...updatedSystemAnalysis,
        computedAt: new Date().toISOString(),
      } as SystemAnalysis,
    }

    // Persist
    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: specToJson(updatedSpec) })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist convergence state:", updateError.message)
      return {
        evaluation,
        proposedChanges: evaluation.proposedChanges,
        shouldContinue,
        spec: updatedSpec,
        persistError: updateError.message,
      }
    }

    return {
      evaluation,
      proposedChanges: evaluation.proposedChanges,
      shouldContinue,
      spec: updatedSpec,
    }
  })
}

// ─── Design Change Feedback Loop ─────────────────────────────────────

/**
 * Applies approved design changes back into the CAD model parameters.
 *
 * @description Takes a list of approved parameter modifications from the
 * Design Changes Review Dialog, applies them to the CadQuery code stored
 * in each module's cadModel.cadQueryCode, and persists the updated spec.
 * The caller can then trigger a re-analysis to validate the changes.
 *
 * @param scanId - The scan ID
 * @param changes - Array of approved changes with parameter names and new values
 * @returns Updated spec after applying parameter changes
 *
 * @security Requires authenticated user with foundry context
 * @audit Logs parameter_changes_applied event
 */
export async function applyDesignChangesAction(
  scanId: string,
  changes: Array<{
    moduleId: string
    parameter: string
    newValue: string
  }>,
): Promise<{ spec: XRaySpec; appliedCount: number } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId)
    if ("error" in loadResult) return { error: loadResult.error }
    const { scan } = loadResult
    const spec = scan.spec as unknown as XRaySpec
    let appliedCount = 0

    // Group changes by module
    const changesByModule = new Map<string, Array<{ parameter: string; newValue: string }>>()
    for (const change of changes) {
      const existing = changesByModule.get(change.moduleId) || []
      existing.push({ parameter: change.parameter, newValue: change.newValue })
      changesByModule.set(change.moduleId, existing)
    }

    // Apply changes to each module's CadQuery code
    const updatedModules = spec.modules.map((mod) => {
      const moduleChanges = changesByModule.get(mod.id)
      if (!moduleChanges || !mod.cadModel?.cadQueryCode) return mod

      // Import parameter utilities dynamically
      const code = mod.cadModel.cadQueryCode
      const modifications: Array<{ name: string; newValue: number }> = []

      for (const change of moduleChanges) {
        // Extract numeric value from the new value string
        const numMatch = change.newValue.match(/([0-9]+(?:\.[0-9]+)?)/)
        if (numMatch) {
          modifications.push({
            name: change.parameter,
            newValue: parseFloat(numMatch[1]),
          })
        }
      }

      if (modifications.length === 0) return mod

      // Apply modifications to the code using inline regex replacement
      // (we can't import the cad-parameters module in a server action
      //  that runs server-side, so we do a simpler regex-based replacement)
      let updatedCode = code
      for (const modification of modifications) {
        const paramRegex = new RegExp(
          `^(${modification.name}\\s*=\\s*)[0-9]+(?:\\.[0-9]+)?(\\s*#.*)$`,
          "m",
        )
        const formattedValue = Number.isInteger(modification.newValue)
          ? `${modification.newValue}.0`
          : modification.newValue.toString()
        updatedCode = updatedCode.replace(paramRegex, `$1${formattedValue}$2`)
        appliedCount++
      }

      return {
        ...mod,
        cadModel: {
          ...mod.cadModel,
          cadQueryCode: updatedCode,
          // Mark that the code has been modified — needs re-generation
          status: "complete" as const, // Keep complete since code is valid
        },
      }
    })

    const updatedSpec: XRaySpec = { ...spec, modules: updatedModules }

    // Persist
    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: specToJson(updatedSpec) })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[XRay] Failed to persist design changes:", updateError.message)
      return { error: `Failed to save changes: ${sanitizeErrorMessage(updateError)}` }
    }

    // AUDIT: Log the parameter changes
    console.info("[XRay] Design changes applied:", {
      scanId,
      appliedCount,
      moduleCount: changesByModule.size,
    })

    return { spec: updatedSpec, appliedCount }
  })
}

// ─── Engineering Review Bridge ───────────────────────────────────────

/**
 * Creates an Objective with review Tasks from X-Ray analysis results.
 *
 * @description After the full analysis pipeline completes, this action
 * creates a structured review objective with tasks for each analysis
 * area that needs human validation. Tasks are auto-generated based on
 * analysis results — failed FEA gets safety review, DFM issues get
 * manufacturing review, etc.
 *
 * @param scanId - The scan ID to load analysis results from
 * @param evaluation - Optional convergence evaluation for proposed changes
 * @returns The created objective ID and task IDs
 *
 * @security Requires authenticated user with foundry context
 * @audit Logs engineering_review_created event
 */
export async function createEngineeringReviewAction(
  scanId: string,
  evaluation?: ConvergenceEvaluation,
): Promise<EngineeringReviewResult | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    const loadResult = await loadScanForFoundry(supabase, scanId, foundryId, "id, spec, name")
    if ("error" in loadResult) return { error: loadResult.error }
    const scan = loadResult.scan
    const spec = scan.spec as unknown as XRaySpec
    const projectName = (scan as Record<string, unknown>).name as string | null
    const displayName = projectName || "Forge Project"

    // Generate review task definitions from analysis results
    const taskDefs = generateReviewTasks(spec, evaluation)

    if (taskDefs.length === 0) {
      return { error: "No review tasks needed — all analyses passed" }
    }

    // 1. Create the parent objective
    const { data: objective, error: objError } = await supabase
      .from("objectives")
      .insert({
        title: `Engineering Review: ${displayName}`,
        description: `Review and validate engineering analysis results for "${displayName}". ` +
          `${taskDefs.length} items need human review before design can be approved.`,
        creator_id: user.id,
        foundry_id: foundryId,
      })
      .select("id")
      .single()

    if (objError || !objective) {
      console.error("[XRay] Failed to create review objective:", objError?.message)
      return { error: objError?.message ?? "Failed to create objective" }
    }

    // AUDIT: Log objective creation
    console.info("[XRay] Engineering review objective created:", {
      objectiveId: objective.id,
      scanId,
      taskCount: taskDefs.length,
    })

    // 2. Create tasks under the objective
    const taskInserts = taskDefs.map((def) => ({
      title: def.title,
      description: def.description,
      objective_id: objective.id,
      creator_id: user.id,
      foundry_id: foundryId,
      status: "Pending" as const,
      risk_level: def.riskLevel,
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // +14 days
    }))

    const { data: tasks, error: taskError } = await supabase
      .from("tasks")
      .insert(taskInserts)
      .select("id")

    if (taskError) {
      console.error("[XRay] Failed to create review tasks:", taskError.message)
      return { error: `Tasks creation failed: ${sanitizeErrorMessage(taskError)}` }
    }

    const taskIds = (tasks ?? []).map((t) => t.id)

    // 3. Create review gates for tasks that need them
    const reviewGateIds: string[] = []
    const gateInserts: Array<{
      foundry_id: string
      task_id: string
      gate_type: string
      title: string
      description: string
      required_skills: string[]
      created_by: string
    }> = []

    for (let i = 0; i < taskDefs.length; i++) {
      const def = taskDefs[i]
      const taskId = taskIds[i]
      if (!def.gateType || !taskId) continue

      gateInserts.push({
        foundry_id: foundryId,
        task_id: taskId,
        gate_type: def.gateType,
        title: `Gate: ${def.title}`,
        description: `Review gate for: ${def.title}`,
        required_skills: def.requiredSkills ?? [],
        created_by: user.id,
      })
    }

    if (gateInserts.length > 0) {
      const { data: gates, error: gateError } = await supabase
        .from("review_gates")
        .insert(gateInserts)
        .select("id")

      if (gateError) {
        console.warn("[XRay] Failed to create some review gates:", gateError.message)
      } else {
        reviewGateIds.push(...(gates ?? []).map((g) => g.id))
      }
    }

    // Count analysis vs change tasks
    const changeTaskCount = taskDefs.filter((d) => d.title.startsWith("Implement:")).length

    return {
      objectiveId: objective.id,
      taskIds,
      reviewGateIds,
      analysisTaskCount: taskDefs.length - changeTaskCount,
      changeTaskCount,
    }
  })
}

// ─── Delete & Copy Actions ───────────────────────────────────────────

/**
 * Deletes a forge project (scan) and all associated data.
 *
 * @description Permanently removes a scan from the database.
 * Associated forge_contracts are cascade-deleted. Storage objects
 * (images, CAD files) are NOT cleaned up here — they will be
 * garbage-collected by a future storage cleanup job.
 *
 * @param scanId - The scan/project ID to delete
 * @returns Success or error
 *
 * @security Requires authenticated user; RLS enforces foundry isolation
 * @audit Logs scan deletion with scanId, foundryId, userId
 */
export async function deleteScanAction(
  scanId: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: Ensure scanId is provided
    if (!scanId?.trim()) {
      return { error: "Missing scan ID" }
    }

    // AUTH: Verify the scan belongs to the user's foundry before deleting
    const { data: scan, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, foundry_id")
      .eq("id", scanId)
      .single()

    if (loadError || !scan) {
      return { error: "Project not found" }
    }

    if (scan.foundry_id !== foundryId) {
      return { error: "You don't have permission to delete this project" }
    }

    // Delete the scan (forge_contracts cascade automatically)
    const { error: deleteError } = await supabase
      .from("xray_scans")
      .delete()
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (deleteError) {
      console.error("[XRay] Failed to delete scan:", {
        error: deleteError.message,
        scanId,
        foundryId,
      })
      return { error: `Failed to delete project: ${sanitizeErrorMessage(deleteError)}` }
    }

    // AUDIT: Log scan deletion
    console.info("[XRay] Scan deleted:", {
      scanId,
      foundryId,
      userId: user.id,
    })

    return { success: true as const }
  })
}

/**
 * Duplicates a forge project (scan) with a fresh ID and reset state.
 *
 * @description Creates a copy of the scan with the same idea and spec,
 * but strips generated assets (images, CAD models, analysis results,
 * people/supplier matches) since those are tied to the original scan.
 * The copy starts fresh at the concept stage.
 *
 * @param scanId - The scan/project ID to copy
 * @returns The new scan ID, or error
 *
 * @security Requires authenticated user; RLS enforces foundry isolation
 * @audit Logs scan duplication with original and new scanId
 */
export async function copyScanAction(
  scanId: string,
): Promise<{ newScanId: string } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: Ensure scanId is provided
    if (!scanId?.trim()) {
      return { error: "Missing scan ID" }
    }

    // Load the source scan
    const { data: source, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, idea, name, spec, foundry_id")
      .eq("id", scanId)
      .single()

    if (loadError || !source) {
      return { error: "Project not found" }
    }

    // AUTH: Verify the scan belongs to the user's foundry
    if (source.foundry_id !== foundryId) {
      return { error: "You don't have permission to copy this project" }
    }

    // Strip generated assets from the spec so the copy starts clean
    const sourceSpec = source.spec as unknown as XRaySpec
    const cleanSpec: XRaySpec = {
      ...sourceSpec,
      systemImageUrl: undefined,
      systemImageStatus: undefined,
      systemCadUrl: undefined,
      systemCadStatus: undefined,
      systemCadSvgUrl: undefined,
      systemCadExplodedSvgUrl: undefined,
      systemAnalysis: undefined,
      modules: sourceSpec.modules.map((m) => ({
        ...m,
        imageUrl: undefined,
        imageStatus: undefined,
        cadModel: undefined,
      })),
    }

    // Create the copy with a new name
    const copyName = source.name
      ? `Copy of ${source.name}`.slice(0, 200)
      : `Copy of ${source.idea.slice(0, 50)}`

    const { data: newScan, error: insertError } = await supabase
      .from("xray_scans")
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        idea: source.idea,
        name: copyName,
        spec: specToJson(cleanSpec),
        status: "scanned",
        stage: "concept",
        scan_status: "complete",
      })
      .select("id")
      .single()

    if (insertError || !newScan) {
      console.error("[XRay] Failed to copy scan:", {
        error: insertError?.message,
        sourceScanId: scanId,
        foundryId,
      })
      return { error: `Failed to copy project: ${insertError?.message ?? "Unknown error"}` }
    }

    // AUDIT: Log scan duplication
    console.info("[XRay] Scan copied:", {
      sourceScanId: scanId,
      newScanId: newScan.id,
      foundryId,
      userId: user.id,
    })

    return { newScanId: newScan.id }
  })
}

// ─── Demo Concept Seeding ────────────────────────────────────────────

/**
 * Seeds a demo forge concept for the current user's foundry so users can see
 * what The Forge produces before scanning their own ideas.
 *
 * @description Calls the Supabase RPC function that inserts a
 * pre-built "Solar Weather Station" demo project with 5 modules.
 * Safe to call multiple times — but should only be called once
 * during signup or when user explicitly requests a demo.
 *
 * @returns The demo scan ID, or error
 *
 * @security Uses auth context — seeds only into caller's foundry
 */
export async function seedDemoConceptAction(): Promise<
  { demoScanId: string } | { error: string }
> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    const { data, error } = await supabase.rpc("seed_demo_forge_concept", {
      p_foundry_id: foundryId,
      p_user_id: user.id,
    })

    if (error) {
      console.error("[XRay] Failed to seed demo concept:", {
        error: error.message,
        foundryId,
        userId: user.id,
      })
      return { error: `Failed to seed demo: ${sanitizeErrorMessage(error)}` }
    }

    console.info("[XRay] Demo concept seeded:", {
      demoScanId: data,
      foundryId,
      userId: user.id,
    })

    return { demoScanId: data as string }
  })
}

// ─── Concept Research (Gemini Search + Claude Opus Synthesis) ────────

/** Result type for concept research */
export interface ConceptResearchResult {
  success: boolean
  error?: string
  report: string
  sources: Array<{ uri: string; title: string }>
  researchTime: number
}

/**
 * System prompt for Claude Opus to synthesize a concept research report.
 *
 * @description Unlike The Forge's engineering-focused report, this covers
 * the full product concept: market context, technical feasibility, key components,
 * manufacturing considerations, competitive landscape, and risk factors.
 */
const CONCEPT_RESEARCH_PROMPT = `You are a senior manufacturing engineer preparing a research brief that will be used to actually build a new product. Your job is to synthesize raw web research into an engineering-first report focused on HOW THIS THING IS MADE.

This report will be read on screen by engineers deciding what to build, what to buy, what materials to use, and how to manufacture it. Market context is secondary — construction details are primary. Every sentence should help someone build this product.

Output format (follow exactly):

# Product Research Report: {Product Name}

## Executive Summary

**Bottom line:** One bold sentence stating what this product is and the single hardest engineering problem to solve when building it.

Then 1-2 sentences on the primary use case and why it matters.

---

## Overview

| Aspect | Detail |
|--------|--------|
| **Category** | ... |
| **Typical Price Range** | ... |
| **Key Players** | 2-3 names |
| **Dimensions** | L × W × H in mm |
| **Weight** | in g or kg |
| **Form Factor** | brief description |

---

## Bill of Materials — Key Components

This is the most important section. List every major component/subsystem needed to build this product.

| Component | Function | Typical Spec / Size | Material | Make vs Buy | Supplier / Standard |
|-----------|----------|-------------------|----------|-------------|-------------------|
| ... | ... | ... | ... | Buy / Make / Either | ... |

Add 6-12 rows. Include structural parts, electronics, actuators, sensors, enclosures, seals, fastener groups, and interfaces. Omit only truly trivial items (labels, packaging).

For each component, be as specific as possible about:
- Exact dimensions or dimensional range (mm)
- Material grade (e.g., "304 stainless steel", not just "steel")
- Relevant standards (IP rating, ISO, DIN, etc.)

---

## Materials & Manufacturing

### Material Selection

| Part / Zone | Recommended Material | Key Properties | Why This Material | Alternatives |
|-------------|---------------------|---------------|-------------------|-------------|
| ... | ... | Tensile strength, temp range, etc. | ... | ... |

Cover 4-8 material decisions. Focus on the non-obvious choices — where material selection actually matters for performance, cost, or manufacturability.

### Manufacturing Process Map

For each major part or assembly, specify the manufacturing method:

| Part / Assembly | Process | Typical Tolerance | Batch Size Consideration | Notes |
|----------------|---------|------------------|------------------------|-------|
| ... | Injection moulding / CNC / Sheet metal / 3D print / Die cast / PCB fab / etc. | ±0.Xmm | Prototype vs production difference | ... |

### Assembly Sequence
Describe the logical assembly order in 5-10 numbered steps. For each step, note:
1. **Step name** — what gets joined, method (press-fit, fastener, adhesive, soldering, etc.), and any critical alignment or tolerance requirement

### Surface Treatments & Finishing
- **Exterior surfaces:** coating, anodising, painting, texture, etc.
- **Functional surfaces:** plating, hardening, polishing, sealing
- **Corrosion protection:** if applicable

---

## Design Constraints & Requirements

### Critical Tolerances
- List the 3-5 dimensions or interfaces where tolerance actually matters and WHY (e.g., "bearing bore ±0.01mm — press-fit retention")

### Regulatory & Certification
- **Safety:** CE, UL, etc. — what specifically must be tested
- **EMC:** if applicable
- **Environmental:** RoHS, REACH, WEEE
- **Industry-specific:** FDA, ATEX, IP rating, etc.

### Environmental / Durability
- **Operating temperature range**
- **IP rating requirement**
- **Expected service life**
- **Key failure modes** to design against

---

## Risk Assessment

| Risk | Type | Severity | Mitigation |
|------|------|----------|------------|
| ... | Technical / Supply / Regulatory / Manufacturing | High/Med/Low | ... |

Focus on manufacturing and supply chain risks — what could go wrong when you actually try to build this.

---

## Recommended Next Steps

1. **Action 1** — brief rationale
2. **Action 2** — brief rationale
3. **Action 3** — brief rationale

Focus on engineering actions (prototyping, sourcing, testing), not business actions.

RULES:
- Use metric units (mm, g, kg, °C, MPa)
- Use markdown tables for all structured data — never bullet-list tables
- Use **bold lead-ins** on bullet points for scanability
- Use horizontal rules (---) between major sections
- Specify material GRADES, not just material families ("6061-T6 aluminium", not "aluminium")
- Specify manufacturing PROCESSES, not just "machined" — say "3-axis CNC milling" or "progressive die stamping"
- Every factual claim must be traceable to the source data provided
- If sources disagree, state both values and note the discrepancy
- Never invent specifications — mark unknown data as "Not found in research"
- Be specific and actionable — if you can't find a spec, say what spec is NEEDED and why
- Keep the report concise (~1000-1500 words) but never sacrifice engineering detail for brevity
- The Bill of Materials and Materials & Manufacturing sections should be ~60% of the report`

/**
 * Runs concept-level research: Gemini web search + Claude Opus synthesis.
 *
 * @description This is the user-facing research step in the Forge concept flow.
 * It searches the web for real product specifications, competitive intelligence,
 * and manufacturing context, then synthesizes everything into a comprehensive
 * product research report using Claude Opus.
 *
 * @param idea - The product concept description
 * @returns Research report, sources, and timing
 *
 * @security Requires authenticated user with foundry context
 * @audit Logs research initiation and completion
 */
export async function runConceptResearchAction(
  idea: string,
): Promise<ConceptResearchResult | { error: string }> {
  return withAuth(async () => {
    const start = Date.now()

    // VALIDATION: Ensure idea is non-empty
    if (!idea?.trim()) {
      return { error: "Please enter a product idea to research" }
    }

    try {
      console.info("[Forge] Concept research: Starting web search...")

      // 1. Run Gemini + Google Search for real-world product intelligence
      const apiKey = process.env.GOOGLE_AI_API_KEY
      if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured")

      const searchPrompt = `Research this product concept thoroughly: ${idea.trim()}

I need comprehensive product intelligence for an engineering team. Search for:

1. EXISTING PRODUCTS — Find 2-4 comparable products with exact specifications (dimensions, weight, price, key specs)
2. KEY COMPONENTS — What subsystems/components does this type of product typically use? What are standard sizes and specs?
3. MATERIALS — What materials are commonly used? What manufacturing methods?
4. MARKET — Who makes these? What do they cost? What's the market like?
5. TECHNICAL CHALLENGES — What are the known engineering challenges for this type of product?
6. STANDARDS & REGULATIONS — Any relevant safety, performance, or compliance standards?
7. DIMENSIONS — Overall size, weight, and critical dimensions in millimetres

Be thorough and precise. Include specific numbers, model names, and manufacturer details where available. If you find conflicting information from different sources, include both.`

      const searchUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`

      const searchResponse = await fetch(searchUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: searchPrompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.2,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      })

      let webText = ""
      let sources: Array<{ uri: string; title: string }> = []

      if (searchResponse.ok) {
        const searchData = await searchResponse.json()
        webText = searchData.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

        // Extract grounding sources
        const groundingMeta = searchData.candidates?.[0]?.groundingMetadata
        const chunks: Array<{ web?: { uri?: string; title?: string } }> =
          groundingMeta?.groundingChunks ?? []
        sources = chunks
          .filter((c): c is { web: { uri: string; title: string } } =>
            Boolean(c.web?.uri && c.web?.title),
          )
          .map((c) => ({ uri: c.web.uri, title: c.web.title }))
      } else {
        console.warn("[Forge] Web search failed, continuing with Claude synthesis only")
      }

      // 2. Send raw data to Claude Opus for synthesis
      console.info("[Forge] Concept research: Synthesizing report with Claude Opus...")
      const anthropicKey = process.env.ANTHROPIC_API_KEY
      if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured")

      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-opus-4-20250514",
          max_tokens: 8192,
          system: CONCEPT_RESEARCH_PROMPT,
          messages: [{
            role: "user",
            content: `Product concept to research: ${idea.trim()}\n\n=== RAW WEB RESEARCH DATA ===\n${webText || "(No web data available — synthesize from your knowledge)"}`,
          }],
        }),
        signal: AbortSignal.timeout(120_000),
      })

      if (!claudeResponse.ok) {
        const errText = await claudeResponse.text()
        throw new Error(`Claude API error (${claudeResponse.status}): ${errText.slice(0, 300)}`)
      }

      const claudeData = await claudeResponse.json()
      const report: string = claudeData.content?.[0]?.text ?? ""

      const researchTime = Date.now() - start

      // AUDIT: Log research completion
      console.info("[Forge] Concept research complete:", {
        idea: idea.trim().slice(0, 50),
        sourceCount: sources.length,
        reportLength: report.length,
        timeMs: researchTime,
      })

      return {
        success: true,
        report,
        sources,
        researchTime,
      } satisfies ConceptResearchResult

    } catch (error) {
      console.error(
        "[Forge] Concept research failed:",
        error instanceof Error ? error.message : error,
      )
      return {
        success: false,
        error: sanitizeErrorMessage(error),
        report: "",
        sources: [],
        researchTime: Date.now() - start,
      } satisfies ConceptResearchResult
    }
  })
}

// ─── Persist Research Report ─────────────────────────────────────────

/**
 * Saves a research report to the xray_scans table.
 *
 * @param scanId - The scan to attach the research to
 * @param report - The research report text
 * @param sources - Web sources used in the research
 * @returns Success or error
 *
 * @security Requires authenticated user with foundry context
 */
export async function saveConceptResearchAction(
  scanId: string,
  report: string,
  sources: Array<{ uri: string; title: string }>,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({
        research_report: { report, sources, savedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId)
      .eq("foundry_id", foundryId)

    if (updateError) {
      console.error("[Forge] Failed to save research report:", updateError.message)
      return { error: `Failed to save research: ${sanitizeErrorMessage(updateError)}` }
    }

    return { success: true as const }
  })
}

// ─── Inspiration Bridge Actions ──────────────────────────────────────

/**
 * Enriches modules with Inspiration data (techniques, domains, packs).
 * Results are persisted to the scan's enrichments column.
 *
 * @param scanId - The scan ID to persist results against
 * @param spec - The X-Ray spec to enrich
 * @param forceRefresh - If true, re-query even if cached data exists
 * @returns Array of enrichment data per module
 *
 * @security Requires authenticated user with foundry context
 */
export async function enrichModulesAction(
  scanId: string | null,
  spec: XRaySpec,
  forceRefresh = false,
): Promise<{ enrichments: ModuleEnrichment[] } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Check for cached data first
    if (scanId && !forceRefresh) {
      const loadResult = await loadScanForFoundry<{ enrichments: Json | null }>(
        supabase,
        scanId,
        foundryId,
        "enrichments",
      )
      if ("scan" in loadResult && loadResult.scan.enrichments) {
        return { enrichments: loadResult.scan.enrichments as unknown as ModuleEnrichment[] }
      }
    }

    // Fresh query
    const enrichments = await enrichModules(spec)

    // Persist to scan
    if (scanId) {
      const { error: updateError } = await supabase
        .from("xray_scans")
        .update({ enrichments: enrichments as unknown as Json })
        .eq("id", scanId)
        .eq("foundry_id", foundryId)

      if (updateError) {
        console.warn("[XRay] Failed to cache enrichments:", updateError.message)
      }
    }

    return { enrichments }
  })
}

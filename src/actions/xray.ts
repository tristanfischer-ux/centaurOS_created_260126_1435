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
import { scanIdea as scanIdeaService, deriveProcessClassAI, refineScanAI, refineModuleAI } from "@/app/(platform)/the-forge/services/scan"
import { matchPeopleForModules } from "@/app/(platform)/the-forge/services/people"
import { matchSuppliersForModule } from "@/app/(platform)/the-forge/services/suppliers"
import { generateModuleImage, generateSystemImage } from "@/app/(platform)/the-forge/services/image-generator"
import { generateModuleCadModel } from "@/app/(platform)/the-forge/services/cad-generator"
import { runStructuralAnalysis } from "@/app/(platform)/the-forge/services/fea-generator"
import { runCfdAnalysis } from "@/app/(platform)/the-forge/services/cfd-generator"
import { runTopologyOptimization } from "@/app/(platform)/the-forge/services/topo-generator"
import { runThermalAnalysis } from "@/app/(platform)/the-forge/services/thermal-generator"
import { runEmiAnalysis, runFatigueAnalysis, runImpactAnalysis } from "@/app/(platform)/the-forge/services/premium-analysis-generator"
import { runConvergenceStep } from "@/app/(platform)/the-forge/services/convergence-controller"
import { enrichModules } from "@/app/(platform)/the-forge/services/inspiration-bridge"

import type { XRaySpec, ModuleSpec, SystemAnalysis, ModuleAnalysis } from "@/app/(platform)/the-forge/services/xray-schema"
import type { PersonMatch } from "@/app/(platform)/the-forge/services/people"
import type { SupplierMatch } from "@/app/(platform)/the-forge/services/suppliers"
import type { ModuleEnrichment } from "@/app/(platform)/the-forge/services/inspiration-bridge"
import type { ConvergenceEvaluation, ProposedChange } from "@/app/(platform)/the-forge/services/convergence-controller"
import type { Json } from "@/types/database.types"

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
export async function scanIdeaAction(idea: string): Promise<
  { scanId: string; spec: XRaySpec } | { error: string }
> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: Ensure idea is non-empty
    if (!idea?.trim()) {
      return { error: "Please enter a product idea to scan" }
    }
    if (idea.length > 5000) {
      return { error: "Idea text is too long (max 5000 characters)" }
    }

    // AI scan
    const spec = await scanIdeaService(idea.trim())

    // Persist to database
    const { data: scan, error: insertError } = await supabase
      .from("xray_scans")
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        idea: idea.trim(),
        spec: spec as unknown as Json,
        status: "scanned",
      })
      .select("id")
      .single()

    if (insertError) {
      console.error("[XRay] Failed to persist scan:", {
        error: insertError.message,
        foundryId,
        userId: user.id,
      })
      return { error: `Failed to save scan: ${insertError.message}` }
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
): Promise<{ scanId: string; spec: XRaySpec } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: Ensure idea is non-empty
    if (!updatedIdea?.trim()) {
      return { error: "Please enter a product idea to refine" }
    }
    if (updatedIdea.length > 5000) {
      return { error: "Idea text is too long (max 5000 characters)" }
    }

    // AI refine scan
    const refinedSpec = await refineScanAI(updatedIdea.trim(), currentSpec)

    // Persist refined spec to same scan row
    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({
        idea: updatedIdea.trim(),
        spec: refinedSpec as unknown as Json,
        status: "refined",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId)

    if (updateError) {
      console.error("[XRay] Failed to persist refined scan:", {
        error: updateError.message,
        scanId,
        foundryId,
      })
      return { error: `Failed to save refined scan: ${updateError.message}` }
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
  return withAuth(async ({ supabase }) => {
    // Load current scan
    const { data: scan, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, spec")
      .eq("id", scanId)
      .single()

    if (loadError || !scan) {
      return { error: "Scan not found" }
    }

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
        spec: updatedSpec as unknown as Json,
        status: "diagnostic_complete",
      })
      .eq("id", scanId)

    if (updateError) {
      console.error("[XRay] Failed to update scan after diagnostic:", updateError.message)
      return { error: `Failed to save diagnostic: ${updateError.message}` }
    }

    return { spec: updatedSpec }
  })
}

// ─── Image Generation Actions ────────────────────────────────────────

/**
 * Generates blueprint images for all modules in a scan.
 * Runs in background after text scan completes.
 *
 * @param scanId - The scan ID to generate images for
 * @returns Updated spec with image URLs, or error
 *
 * @security Requires authenticated user with foundry context
 */
export async function generateImagesAction(scanId: string): Promise<
  { spec: XRaySpec } | { error: string }
> {
  return withAuth(async ({ supabase }) => {
    // Load scan
    const { data: scan, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, spec")
      .eq("id", scanId)
      .single()

    if (loadError || !scan) {
      return { error: "Scan not found" }
    }

    const spec = scan.spec as unknown as XRaySpec

    // Generate module images in parallel batches
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
    }

    // Generate system diagram
    let systemImageUrl = spec.systemImageUrl
    let systemImageStatus = spec.systemImageStatus
    try {
      systemImageUrl = await generateSystemImage(scanId, { ...spec, modules: updatedModules })
      systemImageStatus = "complete"
    } catch (error) {
      console.error("[XRay] Failed to generate system image:", {
        error: error instanceof Error ? error.message : "Unknown error",
      })
      systemImageStatus = "failed"
    }

    // Build updated spec
    const updatedSpec: XRaySpec = {
      ...spec,
      modules: updatedModules,
      systemImageUrl,
      systemImageStatus,
    }

    // Persist
    const { error: updateError } = await supabase
      .from("xray_scans")
      .update({ spec: updatedSpec as unknown as Json })
      .eq("id", scanId)

    if (updateError) {
      console.error("[XRay] Failed to persist images:", updateError.message)
    }

    return { spec: updatedSpec }
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
  return withAuth(async ({ supabase }) => {
    // Load scan
    const { data: scan, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, spec")
      .eq("id", scanId)
      .single()

    if (loadError || !scan) {
      return { error: "Scan not found" }
    }

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
            const cadResult = await generateModuleCadModel(scanId, xrayModule)
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
            console.error(`[XRay] Failed to generate CAD model for module ${xrayModule.id}:`, {
              error: error instanceof Error ? error.message : "Unknown error",
            })
            return {
              moduleIndex,
              cadModel: {
                status: "failed" as const,
                generatedAt: new Date().toISOString(),
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
      .update({ spec: updatedSpec as unknown as Json })
      .eq("id", scanId)

    if (updateError) {
      console.error("[XRay] Failed to persist CAD models:", updateError.message)
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
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from("xray_scans")
      .update({
        spec: spec as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId)

    if (error) {
      return { error: `Failed to update scan: ${error.message}` }
    }

    return { success: true as const }
  })
}

/**
 * Loads a scan by ID.
 *
 * @param scanId - The scan ID
 * @returns The scan data or error
 *
 * @security RLS ensures foundry isolation
 */
export async function loadScanAction(scanId: string): Promise<
  { scanId: string; spec: XRaySpec; status: string } | { error: string }
> {
  return withAuth(async ({ supabase }) => {
    const { data: scan, error } = await supabase
      .from("xray_scans")
      .select("id, spec, status")
      .eq("id", scanId)
      .single()

    if (error || !scan) {
      return { error: "Scan not found" }
    }

    return {
      scanId: scan.id,
      spec: scan.spec as unknown as XRaySpec,
      status: scan.status,
    }
  })
}

/**
 * Lists all scans for the current foundry.
 *
 * @returns Array of scan summaries
 *
 * @security RLS ensures foundry isolation
 */
export async function listScansAction(): Promise<
  { scans: Array<{ id: string; idea: string; status: string; createdAt: string }> } | { error: string }
> {
  return withAuth(async ({ supabase }) => {
    const { data: scans, error } = await supabase
      .from("xray_scans")
      .select("id, idea, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      return { error: `Failed to list scans: ${error.message}` }
    }

    return {
      scans: (scans || []).map((s) => ({
        id: s.id,
        idea: s.idea,
        status: s.status,
        createdAt: s.created_at,
      })),
    }
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
  return withAuth(async ({ supabase }) => {
    // Check for cached data first
    if (scanId && !forceRefresh) {
      const { data: scan } = await supabase
        .from("xray_scans")
        .select("people_matches")
        .eq("id", scanId)
        .single()

      if (scan?.people_matches) {
        return { people: scan.people_matches as unknown as PersonMatch[] }
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
  return withAuth(async ({ supabase }) => {
    // Check for cached data first
    if (scanId && !forceRefresh) {
      const { data: scan } = await supabase
        .from("xray_scans")
        .select("supplier_matches")
        .eq("id", scanId)
        .single()

      if (scan?.supplier_matches) {
        return { suppliersByModule: scan.supplier_matches as unknown as Record<string, SupplierMatch[]> }
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
  return withAuth(async ({ supabase }) => {
    // Load scan
    const { data: scan, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, spec")
      .eq("id", scanId)
      .single()

    if (loadError || !scan) {
      return { error: "Scan not found" }
    }

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

    // Re-run analysis via the Modal analysis endpoint
    const analysisEndpoint = process.env.MODAL_CAD_ANALYSIS_ENDPOINT_URL
      || process.env.MODAL_CAD_ENDPOINT_URL

    if (!analysisEndpoint) {
      return { error: "Analysis endpoint not configured" }
    }

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
      .update({ spec: updatedSpec as unknown as Json })
      .eq("id", scanId)

    if (updateError) {
      console.error("[XRay] Failed to persist analysis results:", updateError.message)
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
  return withAuth(async ({ supabase }) => {
    const { data: scan, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, spec")
      .eq("id", scanId)
      .single()

    if (loadError || !scan) {
      return { error: "Scan not found" }
    }

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
      .update({ spec: updatedSpec as unknown as Json })
      .eq("id", scanId)

    if (updateError) {
      console.error("[XRay] Failed to persist structural results:", updateError.message)
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
  return withAuth(async ({ supabase }) => {
    const { data: scan, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, spec")
      .eq("id", scanId)
      .single()

    if (loadError || !scan) {
      return { error: "Scan not found" }
    }

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
      .update({ spec: updatedSpec as unknown as Json })
      .eq("id", scanId)

    if (updateError) {
      console.error("[XRay] Failed to persist CFD results:", updateError.message)
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
  return withAuth(async ({ supabase }) => {
    const { data: scan, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, spec")
      .eq("id", scanId)
      .single()

    if (loadError || !scan) {
      return { error: "Scan not found" }
    }

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
      .update({ spec: updatedSpec as unknown as Json })
      .eq("id", scanId)

    if (updateError) {
      console.error("[XRay] Failed to persist topology results:", updateError.message)
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
  return withAuth(async ({ supabase }) => {
    const { data: scan, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, spec")
      .eq("id", scanId)
      .single()

    if (loadError || !scan) {
      return { error: "Scan not found" }
    }

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
      .update({ spec: updatedSpec as unknown as Json })
      .eq("id", scanId)

    if (updateError) {
      console.error("[XRay] Failed to persist thermal results:", updateError.message)
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
  return withAuth(async ({ supabase }) => {
    const { data: scan, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, spec")
      .eq("id", scanId)
      .single()

    if (loadError || !scan) {
      return { error: "Scan not found" }
    }

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
      .update({ spec: updatedSpec as unknown as Json })
      .eq("id", scanId)

    if (updateError) {
      console.error("[XRay] Failed to persist premium analysis results:", updateError.message)
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
  return withAuth(async ({ supabase }) => {
    const { data: scan, error: loadError } = await supabase
      .from("xray_scans")
      .select("id, spec")
      .eq("id", scanId)
      .single()

    if (loadError || !scan) {
      return { error: "Scan not found" }
    }

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
      .update({ spec: updatedSpec as unknown as Json })
      .eq("id", scanId)

    if (updateError) {
      console.error("[XRay] Failed to persist convergence state:", updateError.message)
    }

    return {
      evaluation,
      proposedChanges: evaluation.proposedChanges,
      shouldContinue,
      spec: updatedSpec,
    }
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
  return withAuth(async ({ supabase }) => {
    // Check for cached data first
    if (scanId && !forceRefresh) {
      const { data: scan } = await supabase
        .from("xray_scans")
        .select("enrichments")
        .eq("id", scanId)
        .single()

      if (scan?.enrichments) {
        return { enrichments: scan.enrichments as unknown as ModuleEnrichment[] }
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

      if (updateError) {
        console.warn("[XRay] Failed to cache enrichments:", updateError.message)
      }
    }

    return { enrichments }
  })
}

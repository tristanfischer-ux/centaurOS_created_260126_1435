/**
 * @file xray.ts — Server actions for Product X-Ray
 *
 * @description Provides server-side operations for the X-Ray feature:
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
 * - Schema: src/app/(platform)/product-xray/services/xray-schema.ts
 * - Scan service: src/app/(platform)/product-xray/services/scan.ts
 * - Image generator: src/app/(platform)/product-xray/services/image-generator.ts
 * - People service: src/app/(platform)/product-xray/services/people.ts
 * - Suppliers service: src/app/(platform)/product-xray/services/suppliers.ts
 */

"use server"

import { withAuth } from "@/lib/server-action-utils"
import { scanIdea as scanIdeaService, deriveProcessClassAI } from "@/app/(platform)/product-xray/services/scan"
import { matchPeopleForModules } from "@/app/(platform)/product-xray/services/people"
import { matchSuppliersForModule } from "@/app/(platform)/product-xray/services/suppliers"
import { generateModuleImage, generateSystemImage } from "@/app/(platform)/product-xray/services/image-generator"
import { enrichModules } from "@/app/(platform)/product-xray/services/inspiration-bridge"

import type { XRaySpec, ModuleSpec } from "@/app/(platform)/product-xray/services/xray-schema"
import type { PersonMatch } from "@/app/(platform)/product-xray/services/people"
import type { SupplierMatch } from "@/app/(platform)/product-xray/services/suppliers"
import type { ModuleEnrichment } from "@/app/(platform)/product-xray/services/inspiration-bridge"
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

"use server"

/**
 * @file cad-lab-projects.ts — Server actions for persisting The Forge projects.
 *
 * @description Provides CRUD operations for The Forge projects so users can
 * save, load, and resume their 3-step pipeline work (research → interface
 * definition → generation). Projects are isolated by foundry via RLS.
 *
 * @security All actions require authentication and foundry membership.
 * RLS policies ensure foundry-level data isolation.
 *
 * @audit Project mutations are tracked via updated_at timestamps.
 */

import { withAuth } from "@/lib/server-action-utils"
import { sanitizeErrorMessage } from "@/lib/security/sanitize"
import type { Json } from "@/types/database.types"
import type {
  CadLabResult,
  CadLabResearchResult,
  CadLabModule,
  ClaudeModelId,
  CadLabDesignBrief,
  VisualStyleSpec,
  DecompositionCheckpoint,
  InterfaceContractResult,
} from "@/lib/cad-lab-types"

// ─── Types ───────────────────────────────────────────────────────────

/** Summary returned in project list (excludes large data) */
export interface CadLabProjectSummary {
  id: string
  name: string
  subject: string
  status: string
  stage: string
  thumbnailSvg: string | null
  systemIllustrationUrl: string | null
  createdAt: string
  updatedAt: string
}

/** Full project data for loading into the editor */
export interface CadLabProjectData {
  id: string
  name: string
  subject: string
  modelId: ClaudeModelId
  status: string
  stage: string

  /** Step 1 research results */
  research: {
    report: string
    sources: Array<{ uri: string; title: string }>
    referenceModels: Array<{ name: string; url: string }>
    researchTime: number
    designBrief?: CadLabDesignBrief
    assumptionNotes?: string
  } | null

  /** Step 2 interface definition text */
  interfaceDefinition: string | null

  /** Step 3 generation results (without large binary data) */
  result: Omit<CadLabResult, "stlData" | "stepData"> | null

  /** Generated CadQuery code */
  generatedCode: string | null

  /** Decomposed modules */
  modules: CadLabModule[] | null
  /** Linked RFQ created from this project (if any) */
  linkedRfqId: string | null

  /** AI-generated visual style spec for cohesive module illustrations */
  visualStyle: VisualStyleSpec | null

  /** System overview illustration URL */
  systemIllustrationUrl: string | null

  /** Integrated system assembly (after all modules generated) */
  integratedAssemblyStlUrl: string | null
  integratedAssemblyStepUrl: string | null

  /** Decomposition checkpoints from specialists (keyed by specialist ID) */
  checkpoints: Record<string, DecompositionCheckpoint> | null

  /** User-editable product overview (seeded from executive summary) */
  productOverview: string | null

  /** P1: Extracted interface contracts between modules */
  interfaceContracts: InterfaceContractResult | null

  /** Per-module diagnostic answers from Specify stage */
  diagnosticAnswers: Record<string, Record<string, string>> | null

  createdAt: string
  updatedAt: string
}

// ─── List Projects ───────────────────────────────────────────────────

/**
 * Lists all The Forge projects for the current user's foundry.
 *
 * @description Returns a summary list sorted by most recently updated.
 * Excludes large data (research reports, code, results) for performance.
 *
 * @returns Array of project summaries or error
 */
export async function listCadLabProjects(): Promise<
  { projects: CadLabProjectSummary[] } | { error: string }
> {
  return withAuth(async ({ supabase }) => {
    const { data: projects, error } = await supabase
      .from("cad_lab_projects")
      .select("id, name, subject, status, stage, thumbnail_svg, system_illustration_url, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to list projects:", error.message)
      return { error: `Failed to list projects: ${sanitizeErrorMessage(error)}` }
    }

    return {
      projects: (projects || []).map((p) => ({
        id: p.id,
        name: p.name,
        subject: p.subject,
        status: p.status,
        stage: p.stage,
        thumbnailSvg: p.thumbnail_svg,
        systemIllustrationUrl: p.system_illustration_url,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    }
  })
}

// ─── Load Project ────────────────────────────────────────────────────

/**
 * Loads a full The Forge project by ID.
 *
 * @description Returns all project data needed to restore the editor state.
 * Excludes large binary data (STL/STEP) which can be regenerated from code.
 *
 * @param projectId - UUID of the project to load
 * @returns Full project data or error
 *
 * @security RLS ensures users can only load projects in their foundry
 */
export async function loadCadLabProject(
  projectId: string,
): Promise<{ project: CadLabProjectData } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    // VALIDATION: Check UUID format
    if (!projectId || !/^[0-9a-f-]{36}$/.test(projectId)) {
      return { error: "Invalid project ID" }
    }

    const { data: project, error } = await supabase
      .from("cad_lab_projects")
      .select("*")
      .eq("id", projectId)
      .single()

    if (error || !project) {
      console.error("[THE-FORGE-PROJECTS] Failed to load project:", error?.message)
      return { error: "Project not found" }
    }

    // Parse JSONB fields
    const research = project.research as CadLabProjectData["research"]
    const result = project.result as CadLabProjectData["result"]
    const modules = (project.modules as CadLabModule[] | null) ?? null
    const linkedRfqIdRaw = (project.result as Record<string, unknown> | null)?.procurement as { rfqId?: unknown } | undefined
    const linkedRfqId = typeof linkedRfqIdRaw?.rfqId === "string" ? linkedRfqIdRaw.rfqId : null

    return {
      project: {
        id: project.id,
        name: project.name,
        subject: project.subject,
        modelId: (project.model_id || "claude-sonnet-4-6") as ClaudeModelId,
        status: project.status,
        stage: project.stage,
        research,
        interfaceDefinition: project.interface_definition,
        result,
        generatedCode: project.generated_code,
        modules,
        linkedRfqId,
        visualStyle: (project.visual_style as VisualStyleSpec | null) ?? null,
        systemIllustrationUrl: project.system_illustration_url ?? null,
        integratedAssemblyStlUrl: project.integrated_assembly_stl_url ?? null,
        integratedAssemblyStepUrl: project.integrated_assembly_step_url ?? null,
        checkpoints: (project.checkpoints as Record<string, DecompositionCheckpoint> | null) ?? null,
        productOverview: project.product_overview ?? null,
        interfaceContracts: (project.interface_contracts as InterfaceContractResult | null) ?? null,
        diagnosticAnswers: (project.diagnostic_answers as Record<string, Record<string, string>> | null) ?? null,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      },
    }
  })
}

// ─── Create Project ──────────────────────────────────────────────────

/**
 * Creates a new The Forge project.
 *
 * @description Called when the user starts a new design. Creates a minimal
 * project record that gets updated as pipeline steps complete.
 *
 * @param subject - Product description (what to model)
 * @param modelId - Claude model to use
 * @returns Created project ID or error
 *
 * @audit Logs project creation with foundry and user context
 */
export async function createCadLabProject(
  subject: string,
  modelId: ClaudeModelId = "claude-sonnet-4-6",
): Promise<{ projectId: string } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    // VALIDATION: Subject is required
    if (!subject.trim()) {
      return { error: "Subject is required" }
    }

    // Generate a name from the subject (first ~50 chars)
    const name = subject.length > 50 ? `${subject.slice(0, 47)}...` : subject

    const { data, error } = await supabase
      .from("cad_lab_projects")
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        name,
        subject: subject.trim(),
        model_id: modelId,
        status: "draft",
        stage: "design",
      })
      .select("id")
      .single()

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to create project:", error.message)
      return { error: `Failed to create project: ${sanitizeErrorMessage(error)}` }
    }

    // AUDIT: Log project creation
    console.info("[THE-FORGE-PROJECTS] Project created:", {
      projectId: data.id,
      foundryId,
      userId: user.id,
      subject: subject.slice(0, 50),
    })

    return { projectId: data.id }
  })
}

// ─── Save Research (Step 1) ──────────────────────────────────────────

/**
 * Saves Step 1 research results to an existing project.
 *
 * @param projectId - Project to update
 * @param research - Research results from Step 1
 * @returns Success or error
 */
export async function saveCadLabResearch(
  projectId: string,
  research: CadLabResearchResult,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    const researchData = {
      report: research.report,
      sources: research.sources,
      referenceModels: research.referenceModels,
      researchTime: research.researchTime,
      designBrief: research.designBrief,
      assumptionNotes: research.assumptionNotes,
    }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({
        research: researchData as unknown as Json,
        status: "researched",
      })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save research:", error.message)
      return { error: `Failed to save research: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Save Interface Definition (Step 2) ──────────────────────────────

/**
 * Saves Step 2 interface definition to an existing project.
 *
 * @param projectId - Project to update
 * @param interfaceDefinition - The text-only engineering plan
 * @returns Success or error
 */
export async function saveCadLabInterface(
  projectId: string,
  interfaceDefinition: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({
        interface_definition: interfaceDefinition,
        status: "interface_ready",
      })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save interface:", error.message)
      return { error: `Failed to save interface: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Save Generation Result (Step 3) ─────────────────────────────────

/**
 * Saves Step 3 generation results to an existing project.
 *
 * @description Saves the CAD generation result excluding large binary data
 * (STL/STEP). The generated code is saved separately for easy access.
 * The isometric SVG is saved as a thumbnail for the project list.
 *
 * @param projectId - Project to update
 * @param result - Generation result from Step 3
 * @returns Success or error
 */
export async function saveCadLabResult(
  projectId: string,
  result: CadLabResult,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    // Strip large binary data before persisting to JSONB
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stlData, stepData, ...resultWithoutBinary } = result

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({
        result: resultWithoutBinary as unknown as Json,
        generated_code: result.code || null,
        thumbnail_svg: result.svgIso || null,
        status: result.success ? "generated" : "interface_ready",
      })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save result:", error.message)
      return { error: `Failed to save result: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Save Modules ────────────────────────────────────────────────────

/**
 * Saves module decomposition results to an existing project.
 *
 * @param projectId - Project to update
 * @param modules - Array of decomposed modules
 * @returns Success or error
 */
export async function saveCadLabModules(
  projectId: string,
  modules: CadLabModule[],
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({
        modules: modules as unknown as Json,
      })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save modules:", error.message)
      return { error: `Failed to save modules: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Save Product Overview ────────────────────────────────────────────

/**
 * Persists the user-editable product overview text.
 *
 * @param projectId - Project to update
 * @param overview - Product overview text (user-edited executive summary)
 * @returns Success or error
 */
export async function saveCadLabProductOverview(
  projectId: string,
  overview: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ product_overview: overview })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save product overview:", error.message)
      return { error: `Failed to save product overview: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Save Diagnostic Answers ──────────────────────────────────────────

/**
 * Persists per-module diagnostic answers from the Specify stage.
 *
 * @param projectId - Project to update
 * @param answers - Diagnostic answers keyed by module ID
 * @returns Success or error
 */
export async function saveCadLabDiagnosticAnswers(
  projectId: string,
  answers: Record<string, Record<string, string>>,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ diagnostic_answers: answers as unknown as Json })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save diagnostic answers:", error.message)
      return { error: `Failed to save diagnostic answers: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Save System Illustration URL ─────────────────────────────────────

/**
 * Persists the system overview illustration URL to the project record.
 *
 * @param projectId - Project to update
 * @param url - Public URL of the generated illustration
 * @returns Success or error
 */
export async function saveCadLabSystemIllustration(
  projectId: string,
  url: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ system_illustration_url: url })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save system illustration URL:", error.message)
      return { error: `Failed to save system illustration: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Save Visual Style ────────────────────────────────────────────────

/**
 * Persists the AI-generated visual style spec to the project record.
 *
 * @param projectId - Project to update
 * @param style - Visual style spec for cohesive module illustrations
 * @returns Success or error
 */
export async function saveCadLabVisualStyle(
  projectId: string,
  style: VisualStyleSpec,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ visual_style: style as unknown as Json })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save visual style:", error.message)
      return { error: `Failed to save visual style: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Save Integrated Assembly URLs ────────────────────────────────────

/**
 * Persists integrated system assembly file URLs after the integration step.
 *
 * @param projectId - Project to update
 * @param stlUrl - URL to combined assembly STL
 * @param stepUrl - URL to combined assembly STEP
 * @param assemblyCode - Optional CadQuery Python code used for the assembly (for debugging)
 * @returns Success or error
 */
export async function saveCadLabIntegratedAssembly(
  projectId: string,
  stlUrl: string,
  stepUrl: string,
  assemblyCode?: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({
        integrated_assembly_stl_url: stlUrl,
        integrated_assembly_step_url: stepUrl,
        integrated_assembly_code: assemblyCode ?? null,
      })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save integrated assembly:", error.message)
      return { error: `Failed to save: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── P1: Save Interface Contracts ────────────────────────────────────

/**
 * Persists extracted interface contracts for a Cad Lab project.
 *
 * @param projectId - Project to update
 * @param contracts - Interface contract extraction result
 * @returns Success or error
 */
export async function saveCadLabInterfaceContracts(
  projectId: string,
  contracts: InterfaceContractResult,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ interface_contracts: contracts as unknown as Json })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save interface contracts:", error.message)
      return { error: `Failed to save: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Link Project to RFQ ─────────────────────────────────────────────

/**
 * Persists RFQ linkage metadata for a Cad Lab project.
 *
 * @param projectId - Project to update
 * @param rfqId - Marketplace RFQ ID linked to this project
 * @returns Success or error
 */
export async function saveCadLabProjectRfq(
  projectId: string,
  rfqId: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }
    if (!rfqId.trim()) return { error: "RFQ ID required" }

    const { data: current, error: loadError } = await supabase
      .from("cad_lab_projects")
      .select("result")
      .eq("id", projectId)
      .single()

    if (loadError) {
      return { error: `Failed to load project state: ${sanitizeErrorMessage(loadError)}` }
    }

    const existingResult = (current?.result as Record<string, unknown> | null) ?? {}
    const existingProcurement = (existingResult.procurement as Record<string, unknown> | undefined) ?? {}

    const nextResult = {
      ...existingResult,
      procurement: {
        ...existingProcurement,
        rfqId: rfqId.trim(),
        linkedAt: new Date().toISOString(),
        stage: "rfq_created",
      },
    }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({
        result: nextResult as unknown as Json,
      })
      .eq("id", projectId)

    if (error) {
      return { error: `Failed to save RFQ linkage: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Update Batch Status ─────────────────────────────────────────────

/**
 * Updates the batch generation status for a project.
 *
 * @description Used by the client to set batch_status when initiating
 * background generation or when resetting after an error.
 *
 * @param projectId - Project to update
 * @param batchStatus - New batch status
 * @returns Success or error
 */
export async function updateCadLabBatchStatus(
  projectId: string,
  batchStatus: "idle" | "running" | "done" | "error",
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    const updateData: Record<string, unknown> = { batch_status: batchStatus }
    if (batchStatus === "running") {
      updateData.batch_started_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update(updateData)
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to update batch status:", error.message)
      return { error: `Failed to update batch status: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Load Batch Status ───────────────────────────────────────────────

/**
 * Loads the batch status and module states for a project.
 *
 * @description Used by the client to detect an in-progress batch when
 * returning to the page. Returns just the batch metadata and module
 * statuses, not the full project data.
 *
 * @param projectId - Project to check
 * @returns Batch status, module statuses, and counts
 */
export async function loadCadLabBatchStatus(
  projectId: string,
): Promise<
  | {
      batchStatus: string
      batchStartedAt: string | null
      moduleStatuses: Record<string, string>
      generatedCount: number
      totalCount: number
    }
  | { error: string }
> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }

    const { data: project, error } = await supabase
      .from("cad_lab_projects")
      .select("batch_status, batch_started_at, modules")
      .eq("id", projectId)
      .single()

    if (error || !project) {
      return { error: "Project not found" }
    }

    const modules = (project.modules as CadLabModule[] | null) ?? []
    const moduleStatuses: Record<string, string> = {}
    for (const mod of modules) {
      moduleStatuses[mod.id] = mod.status
    }

    return {
      batchStatus: project.batch_status,
      batchStartedAt: project.batch_started_at,
      moduleStatuses,
      generatedCount: modules.filter((m) => m.status === "generated").length,
      totalCount: modules.length,
    }
  })
}

// ─── Rename Project ──────────────────────────────────────────────────

/**
 * Renames a The Forge project.
 *
 * @param projectId - Project to rename
 * @param name - New name (max 200 chars)
 * @returns Success or error
 */
export async function renameCadLabProject(
  projectId: string,
  name: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }
    if (!name.trim()) return { error: "Name is required" }
    if (name.length > 200) return { error: "Name must be 200 characters or less" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ name: name.trim() })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to rename project:", error.message)
      return { error: `Failed to rename: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Delete Project ──────────────────────────────────────────────────

/**
 * Deletes a The Forge project.
 *
 * @param projectId - Project to delete
 * @returns Success or error
 *
 * @security RLS ensures only foundry members can delete
 * @audit Logs deletion for audit trail
 */
export async function deleteCadLabProject(
  projectId: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, user }) => {
    if (!projectId) return { error: "Project ID required" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .delete()
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to delete project:", error.message)
      return { error: `Failed to delete: ${sanitizeErrorMessage(error)}` }
    }

    // AUDIT: Log deletion
    console.info("[THE-FORGE-PROJECTS] Project deleted:", { projectId, userId: user.id })

    return { success: true as const }
  })
}

// ─── Quality Rating ──────────────────────────────────────────────────

/**
 * Rates a generated module's quality with thumbs up/down.
 *
 * @description P4: Captures user signal on generation quality. Stored as JSONB
 * on cad_lab_projects.quality_ratings for per-module tracking.
 *
 * @param projectId - Project UUID
 * @param moduleId - Module ID string
 * @param rating - "good" or "bad"
 * @param notes - Optional free-text notes
 * @returns Success or error
 *
 * @security Requires authenticated user. RLS enforces foundry isolation.
 */
export async function rateModuleQuality(
  projectId: string,
  moduleId: string,
  rating: "good" | "bad",
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  return withAuth(async ({ supabase, user }) => {
    // VALIDATION: UUID check
    if (!/^[0-9a-f-]{36}$/.test(projectId)) {
      return { success: false, error: "Invalid projectId" }
    }
    if (!moduleId || typeof moduleId !== "string") {
      return { success: false, error: "Invalid moduleId" }
    }

    // Load current ratings
    const { data: project, error: loadError } = await supabase
      .from("cad_lab_projects")
      .select("quality_ratings")
      .eq("id", projectId)
      .single()

    if (loadError || !project) {
      return { success: false, error: "Project not found" }
    }

    const currentRatings = (project.quality_ratings as Record<string, unknown>) ?? {}
    const updatedRatings = {
      ...currentRatings,
      [moduleId]: {
        rating,
        timestamp: new Date().toISOString(),
        ...(notes ? { notes } : {}),
      },
    }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ quality_ratings: updatedRatings as unknown as Json })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save quality rating:", error.message)
      return { success: false, error: sanitizeErrorMessage(error) }
    }

    console.info("[THE-FORGE-PROJECTS] Quality rating saved:", {
      projectId,
      moduleId,
      rating,
      userId: user.id,
    })

    return { success: true }
  })
}

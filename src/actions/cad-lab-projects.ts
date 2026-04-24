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

import { after } from "next/server"

import { withAuth } from "@/lib/server-action-utils"
import { sanitizeErrorMessage } from "@/lib/security/sanitize"
import { ensureCadLabProjectOwnership } from "@/lib/cad-lab/project-ownership"
import { isIllustrationStyle, type IllustrationStyle } from "@/lib/cad-lab/illustration-styles"
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
  ModuleConnection,
  SpecialistReview,
  AiCostEstimate,
  PartCategoryOverride,
  ProviderResult,
} from "@/lib/cad-lab-types"
import type { DiagnosticEnrichment } from "@/lib/cad-lab/diagnostic-enrichment"
import type { StoredReferenceImage } from "@/lib/cad-lab/reference-image-types"
import type { StoredReferenceDocument } from "@/lib/cad-lab/reference-document-types"

// SECURITY: Shared UUID regex — enforces 8-4-4-4-12 group structure (not just 36 hex+hyphen chars)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Short-name derivation ───────────────────────────────────────────
// INTENT: Derive a readable project name from an idea brief so the
// workspace H1 + breadcrumb don't render as a 160-char truncated sentence.
// Takes the first clause before a sentence break (full stop, comma, dash,
// newline), collapses whitespace, and caps length on a word boundary.
//
// Examples:
//   "A European-sovereign HAPS — 22m wing, 14 days"
//     → "A European-sovereign HAPS"
//   "Solar UAV for maritime ISR. 14-day persistence…"
//     → "Solar UAV for maritime ISR"
//   "Lightweight drone" (already short)
//     → "Lightweight drone"
//   Single-clause brief longer than the cap
//     → word-boundary cut at `MAX_NAME_LEN`, ellipsis only if we still had to cut
//
// Pure, no awaits — kept as a non-exported const so "use server" semantics
// are preserved (only async functions may be exported).
// Keep comfortably wide enough to fit most natural product names
// without an ugly ellipsis. 60 was too tight — it truncated the BESS
// container brief at "…a 40ft…" mid-phrase (see bug 2026-04-22,
// project 878359d2-7fb5-49c0-8341-3032797daa05). 120 holds full
// sentence-style names end-to-end while still preventing absurd
// 400+ char briefs from flowing into sidebar chrome / PDF cover.
const MAX_NAME_LEN = 120
function deriveShortName(subject: string): string {
  const collapsed = subject.trim().replace(/\s+/g, " ")
  if (!collapsed) return "Untitled project"

  // Split on the first sentence-break character. Em-dash (—) and en-dash (–)
  // are included since founder briefs often use them as clause separators.
  const clauseMatch = collapsed.split(/[.,;—–\n]/)[0]?.trim() ?? collapsed
  const candidate = clauseMatch.length >= 10 ? clauseMatch : collapsed

  if (candidate.length <= MAX_NAME_LEN) return candidate

  // Word-boundary cut: take `MAX_NAME_LEN` chars, then rewind to the last
  // space so we don't slice mid-word. Append an ellipsis only when we
  // actually trimmed something.
  const hardCut = candidate.slice(0, MAX_NAME_LEN)
  const lastSpace = hardCut.lastIndexOf(" ")
  const softCut = lastSpace > MAX_NAME_LEN * 0.5 ? hardCut.slice(0, lastSpace) : hardCut
  return `${softCut.trimEnd()}…`
}

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

  /** Project-level illustration style preference. Applied on the next
   *  hero/module regeneration. Silent — does not auto-regenerate on change. */
  illustrationStyle: IllustrationStyle

  /** System overview illustration URL — blueprint / plan view (schematic). */
  systemIllustrationUrl: string | null
  /** Photo-realistic concept render URL — shown in the left hero pane. */
  conceptRenderUrl: string | null

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

  /** AI-generated reasoning for diagnostic answers (why + ranked alternatives) */
  diagnosticEnrichment: DiagnosticEnrichment | null

  /** AI-declared inter-module connections from decomposition */
  decompositionConnections: ModuleConnection[] | null

  /** Unified CAD model result (without binary data) */
  unifiedResult: Omit<CadLabResult, "stlData" | "stepData"> | null

  /** Unified CadQuery code */
  unifiedCode: string | null

  /** Specialist reviews per module (keyed by moduleId → array of reviews) */
  reviews: Record<string, SpecialistReview[]> | null

  /** AI-powered cost estimates per module (keyed by moduleId) */
  aiCostEstimates: Record<string, AiCostEstimate> | null

  /** User overrides for part classification (keyed by "${moduleId}::${partName}") */
  partCategoryOverrides: Record<string, PartCategoryOverride> | null

  /** Project-level design version (v1 = initial, v2+ = post-review revision) */
  designRevision: number

  /** Which design revision the images were last generated at */
  imagesGeneratedAtRevision: number

  /** Whether the user explicitly skipped specialist reviews before finalization */
  reviewSkipped: boolean

  /** Provider A/B comparison results (keyed by provider name) */
  providerResults: Record<string, ProviderResult> | null

  /** User-uploaded reference images (sketches, photos, drawings) */
  referenceImages: StoredReferenceImage[] | null

  /** User-uploaded reference documents (spec sheets, datasheets, CAD files) */
  referenceDocuments: StoredReferenceDocument[] | null

  /** Brief lock state — ISO timestamp when the current brief revision was locked. */
  briefLockedAt: string | null
  /** UUID of the user who locked the brief (null while draft). */
  briefLockedBy: string | null

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
    if (!projectId || !UUID_RE.test(projectId)) {
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
        modelId: (project.model_id || "claude-opus-4-7") as ClaudeModelId,
        status: project.status,
        stage: project.stage,
        research,
        interfaceDefinition: project.interface_definition,
        result,
        generatedCode: project.generated_code,
        modules,
        linkedRfqId,
        visualStyle: (project.visual_style as VisualStyleSpec | null) ?? null,
        illustrationStyle: isIllustrationStyle(project.illustration_style)
          ? project.illustration_style
          : "blueprint",
        systemIllustrationUrl: project.system_illustration_url ?? null,
        conceptRenderUrl: (project.concept_render_url as string | null) ?? null,
        integratedAssemblyStlUrl: project.integrated_assembly_stl_url ?? null,
        integratedAssemblyStepUrl: project.integrated_assembly_step_url ?? null,
        checkpoints: (project.checkpoints as Record<string, DecompositionCheckpoint> | null) ?? null,
        productOverview: project.product_overview ?? null,
        interfaceContracts: (project.interface_contracts as InterfaceContractResult | null) ?? null,
        diagnosticAnswers: (project.diagnostic_answers as Record<string, Record<string, string>> | null) ?? null,
        diagnosticEnrichment: (project.diagnostic_enrichment as DiagnosticEnrichment | null) ?? null,
        decompositionConnections: (project.decomposition_connections as ModuleConnection[] | null) ?? null,
        unifiedResult: (project.unified_result as CadLabProjectData["unifiedResult"]) ?? null,
        unifiedCode: project.unified_code ?? null,
        reviews: (project.reviews as Record<string, SpecialistReview[]> | null) ?? null,
        aiCostEstimates: (project.ai_cost_estimates as Record<string, AiCostEstimate> | null) ?? null,
        partCategoryOverrides: (project.part_category_overrides as Record<string, PartCategoryOverride> | null) ?? null,
        designRevision: (project.design_revision as number) ?? 1,
        imagesGeneratedAtRevision: (project.images_generated_at_revision as number) ?? 1,
        reviewSkipped: (project.review_skipped as boolean) ?? false,
        providerResults: (project.provider_results as Record<string, ProviderResult> | null) ?? null,
        referenceImages: (project.reference_images as StoredReferenceImage[] | null) ?? null,
        // INTENT: Exclude rawText from client payload to keep React Flight small
        referenceDocuments: project.reference_documents
          ? ((project.reference_documents as unknown as StoredReferenceDocument[]).map(d => ({ ...d, rawText: null })))
          : null,
        briefLockedAt: (project.brief_locked_at as string | null) ?? null,
        briefLockedBy: (project.brief_locked_by as string | null) ?? null,
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
  modelId: ClaudeModelId = "claude-opus-4-7",
): Promise<{ projectId: string } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    // VALIDATION: Subject is required
    if (!subject.trim()) {
      return { error: "Subject is required" }
    }

    // INTENT: The workspace H1 + breadcrumb read `name`, so a hard
    // character-cut like `slice(47) + "..."` produced an ugly truncated
    // sentence as the page title. Instead, pull the first clause (before a
    // sentence break) so "A European-sovereign HAPS — 22m wing, 14 days"
    // becomes "A European-sovereign HAPS" in the header. Keeps the full
    // brief intact on `subject`; just derives a shorter, readable label.
    const name = deriveShortName(subject)

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

    // INTENT: auto-fire Chase research on project creation so Brief rev 0.1
    // starts drafting the instant the project row lands. Uses Next.js
    // `after()` so the work is properly tracked by the serverless lifecycle
    // and does NOT run inside the response-critical path — the client gets
    // `{ projectId }` immediately and redirects, Chase begins in parallel.
    //
    // TRIED: plain `import("...").then(...)` fire-and-forget. Problem:
    // unawaited dynamic imports in a server action have raced the serverless
    // container's termination — the project row lands, but the Chase
    // orchestrator never starts (the import resolves AFTER the function
    // returns and the container tears down). Evidence: project 8c3e08f0
    // (2026-04-20 21:38:31) created successfully but pipeline_runs was
    // empty. `after()` is the supported mechanism for post-response work.
    //
    // FLOW: dynamic import is still required — `run-chase-research.ts`
    // imports `saveCadLabResearch` from this file, so a top-level import
    // here would create a circular "use server" module-init cycle.
    //
    // GOTCHA (P0.2): use the Background variant because this runs in an
    // after() post-response context where cookies are unavailable — the
    // withAuth-wrapped variant would return "Unauthorized" and every first
    // Chase auto-fire would fail silently. foundryId + user.id are still
    // in closure from the outer withAuth, so we plumb them explicitly.
    const capturedFoundryId = foundryId
    const capturedUserId = user.id
    const capturedProjectId = data.id
    after(async () => {
      try {
        const { runChaseResearchBackground } = await import(
          "@/actions/specialists/run-chase-research"
        )
        await runChaseResearchBackground(
          capturedProjectId,
          capturedFoundryId,
          capturedUserId,
          "auto.project-create",
        )
      } catch (err) {
        console.error("[createCadLabProject] Chase auto-trigger failed:", {
          projectId: capturedProjectId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
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
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

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
        system_illustration_url: null,
        modules: null,
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
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }
    if (interfaceDefinition.length > 50_000) return { error: "Interface definition too long (max 50,000 characters)" }

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
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

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

    // INTENT: Auto-promote completed designs to Products page (fire-and-forget).
    // If promotion fails, the save still succeeds — Products is non-critical.
    if (result.success) {
      import("@/actions/products").then(({ autoPromoteIfComplete }) =>
        autoPromoteIfComplete(projectId).catch((err) =>
          console.error("[THE-FORGE] Auto-promote failed:", err),
        ),
      )

      // INTENT: Feed completed design into Knowledge Vault so specialists
      // can reference it in future conversations. Fire-and-forget.
      import("@/actions/knowledge").then(({ extractKnowledgeFromText }) => {
        const designText = `Completed CAD Design (project ${projectId}). Design generated successfully with code output.`
        extractKnowledgeFromText(designText, "CAD Lab Design").catch(() => {})
      }).catch(() => {})
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
  modulesJson: string,
): Promise<{ success: true } | { error: string }> {
  // INTENT: Accept pre-serialized JSON string to avoid React Flight depth
  // limit ("Maximum array nesting exceeded") when passing deeply nested
  // CadLabModule[] through server action argument serialization.
  return withAuth(async ({ supabase }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

    // SECURITY: Validate JSON from client — saveCadLabModules accepts a raw string
    let modules: unknown
    try {
      modules = JSON.parse(modulesJson)
    } catch {
      return { error: "Invalid modules JSON" }
    }
    if (!Array.isArray(modules)) return { error: "Modules must be an array" }
    if (modules.length === 0) return { error: "At least one module required" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({
        modules: modules as Json,
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
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }
    if (overview.length > 10_000) return { error: "Product overview too long (max 10,000 characters)" }

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
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

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

// ─── Save Diagnostic Enrichment ───────────────────────────────────────

/**
 * Persists AI-generated diagnostic reasoning (why + ranked alternatives).
 *
 * @param projectId - Project to update
 * @param enrichment - Enrichment data keyed by module ID
 * @returns Success or error
 */
export async function saveCadLabDiagnosticEnrichment(
  projectId: string,
  enrichment: DiagnosticEnrichment,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ diagnostic_enrichment: enrichment as unknown as Json })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save diagnostic enrichment:", error.message)
      return { error: `Failed to save diagnostic enrichment: ${sanitizeErrorMessage(error)}` }
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
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

    // SECURITY: Only accept URLs pointing at our own Supabase storage hostname.
    // Without this, a client could persist `javascript:…` or `https://evil/`
    // as the illustration URL. `system_illustration_url` is fetched server-side
    // by fetchAndCropReferenceAction (SSRF vector) and rendered as an <img src>
    // in the report/UI (phishing vector).
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "https:") return { error: "Illustration URL must be https" }
      const expectedHost = process.env.NEXT_PUBLIC_SUPABASE_URL
        ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
        : null
      if (!expectedHost || parsed.hostname !== expectedHost) {
        return { error: "Illustration URL must be on the project's storage hostname" }
      }
    } catch {
      return { error: "Invalid illustration URL" }
    }

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

// ─── Save Illustration Style (project-level preference) ──────────────

/**
 * Persists the user-chosen illustration style for a project. Silent
 * preference update — does NOT auto-regenerate. The next hero + module
 * regeneration picks it up and injects the matching prompt preamble.
 *
 * @param projectId - Project to update
 * @param style - One of `blueprint` | `photoreal` | `isometric_vector`
 * @returns Success or error
 */
export async function saveCadLabIllustrationStyle(
  projectId: string,
  style: IllustrationStyle,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }
    // SECURITY: Validate against the enum — a DB CHECK also exists, but
    // failing early here keeps the 400 response clean and avoids a round-trip.
    if (!isIllustrationStyle(style)) return { error: "Invalid illustration style" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ illustration_style: style })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save illustration style:", error.message)
      return { error: `Failed to save illustration style: ${sanitizeErrorMessage(error)}` }
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
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

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
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

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

// ─── Save Unified CAD Result ─────────────────────────────────────────

/**
 * Persists the unified CAD generation result + code for a project.
 *
 * @param projectId - Project to update
 * @param result - CadLabResult without binary blobs (stlData/stepData stripped by caller)
 * @param code - CadQuery Python source
 * @returns Success or error
 */
export async function saveCadLabUnifiedResult(
  projectId: string,
  result: Omit<CadLabResult, "stlData" | "stepData">,
  code: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({
        unified_result: result as unknown as Json,
        unified_code: code,
      })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save unified result:", error.message)
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
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

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

// ─── Save Decomposition Connections ─────────────────────────────────

/**
 * Persists AI-declared inter-module connections from decomposition.
 *
 * @param projectId - Project to update
 * @param connections - Validated ModuleConnection[] from decomposition
 * @returns Success or error
 */
export async function saveCadLabDecompositionConnections(
  projectId: string,
  connections: ModuleConnection[],
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ decomposition_connections: connections as unknown as Json })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save decomposition connections:", error.message)
      return { error: `Failed to save: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Save Design Revision ─────────────────────────────────────────────

/**
 * Persists the project-level design revision + image freshness counters.
 *
 * @param projectId - Project to update
 * @param designRevision - Current design version (v1 = initial, v2+ = post-review)
 * @param imagesGeneratedAtRevision - Which revision the images were last generated at
 * @returns Success or error
 */
export async function saveCadLabDesignRevision(
  projectId: string,
  designRevision: number,
  imagesGeneratedAtRevision: number,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({
        design_revision: designRevision,
        images_generated_at_revision: imagesGeneratedAtRevision,
      })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save design revision:", error.message)
      return { error: `Failed to save design revision: ${sanitizeErrorMessage(error)}` }
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
  return withAuth(async ({ supabase, user, foundryId }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }
    if (!rfqId || !UUID_RE.test(rfqId.trim())) return { error: "Invalid RFQ ID" }
    const trimmedRfqId = rfqId.trim()

    // SECURITY: verify the caller's foundry owns the project. Defence in depth
    // alongside RLS — without it, a compromised or buggy client could write the
    // linkage against any project the user hasn't been authorised to touch.
    const projectOwnershipErr = await ensureCadLabProjectOwnership(supabase, projectId, foundryId)
    if (projectOwnershipErr) return { error: projectOwnershipErr }

    // SECURITY: verify the caller owns (or belongs to the foundry of) the RFQ
    // they're linking. Before this check, any authed user could pass any
    // valid RFQ UUID and persist the linkage — tainting the procurement
    // invariant that getLinkedRFQQuotes relies on.
    const { data: rfqRow, error: rfqErr } = await supabase
      .from("rfqs")
      .select("buyer_id, foundry_id")
      .eq("id", trimmedRfqId)
      .maybeSingle()
    if (rfqErr) {
      console.error("[CAD-LAB-PROJECTS] RFQ ownership lookup failed:", rfqErr.message)
      return { error: "Failed to validate RFQ" }
    }
    if (!rfqRow) return { error: "RFQ not found" }
    const isBuyer = (rfqRow.buyer_id as string | null) === user.id
    const isSameFoundry = (rfqRow.foundry_id as string | null) === foundryId
    if (!isBuyer && !isSameFoundry) {
      console.warn("[CAD-LAB-PROJECTS] Cross-foundry RFQ link blocked", { userId: user.id, rfqId: trimmedRfqId })
      return { error: "RFQ not found" }
    }

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
      // SECURITY: Belt-and-braces — every other write in this file chains
      // .eq("foundry_id", foundryId). If RLS regresses (e.g. USING(true))
      // this extra filter still prevents cross-foundry writes.
      .eq("foundry_id", foundryId)

    if (error) {
      return { error: `Failed to save RFQ linkage: ${sanitizeErrorMessage(error)}` }
    }

    // INTENT: Auto-promote to Products when RFQ is created (fire-and-forget)
    import("@/actions/products").then(({ autoPromoteIfComplete }) =>
      autoPromoteIfComplete(projectId).catch((err) =>
        console.error("[THE-FORGE] Auto-promote on RFQ failed:", err),
      ),
    )

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
  return withAuth(async ({ supabase, foundryId }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

    // SECURITY: defence in depth — RLS should already block cross-foundry
    // writes, but an explicit ownership SELECT precheck catches the case
    // where a policy regression (e.g. USING (true)) silently opens this up.
    const ownershipErr = await ensureCadLabProjectOwnership(supabase, projectId, foundryId)
    if (ownershipErr) return { error: ownershipErr }

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
  return withAuth(async ({ supabase, foundryId }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

    // SECURITY: explicit ownership precheck (see updateCadLabBatchStatus).
    const ownershipErr = await ensureCadLabProjectOwnership(supabase, projectId, foundryId)
    if (ownershipErr) return { error: ownershipErr }

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
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }
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
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

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

// ─── Unarchive Project ───────────────────────────────────────────────

/**
 * Unarchives a The Forge project — the inverse of archive.
 *
 * @description Sets `cad_lab_projects.archived_at` back to NULL, restoring
 * the project to the active workspace list at its previous lifecycle stage.
 * Evidence, modules, specialist reviews, checkpoints, and readiness items
 * were never deleted — just hidden behind the archive filter. Idempotent:
 * unarchiving an already-active project is a no-op from the caller's side.
 *
 * @param projectId - Project UUID to unarchive
 * @returns Success or error
 *
 * @security `withAuth` enforces authentication + foundry membership; RLS
 * ensures the UPDATE can only touch rows inside the caller's foundry.
 * @audit Logs unarchive event (projectId + userId) to server console.
 */
export async function unarchiveCadLabProject(
  projectId: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, user }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ archived_at: null })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to unarchive project:", error.message)
      return { error: `Failed to unarchive: ${sanitizeErrorMessage(error)}` }
    }

    // AUDIT: Log unarchive event
    console.info("[THE-FORGE-PROJECTS] Project unarchived:", { projectId, userId: user.id })

    return { success: true as const }
  })
}

// ─── Poll Unified Result ──────────────────────────────────────────────

/**
 * Lightweight poll for unified CAD generation result.
 *
 * @description Used by the client-side polling loop when SSE stream breaks
 * (e.g. user navigates away). Only fetches unified_result + unified_code
 * to minimise payload. The server-side route continues generating and persists
 * to DB independently, so polling will eventually pick up the result.
 *
 * @param projectId - Project to check
 * @returns { result, code } if generation is complete, { pending: true } otherwise
 *
 * @security RLS ensures foundry-level isolation
 */
export async function pollUnifiedResultAction(
  projectId: string,
): Promise<
  | { pending: true }
  | { result: Omit<CadLabResult, "stlData" | "stepData">; code: string | null }
  | { error: string }
> {
  return withAuth(async ({ supabase }) => {
    if (!projectId || !UUID_RE.test(projectId)) {
      return { error: "Invalid project ID" }
    }

    const { data, error } = await supabase
      .from("cad_lab_projects")
      .select("unified_result, unified_code")
      .eq("id", projectId)
      .single()

    if (error || !data) {
      return { error: "Project not found" }
    }

    const unifiedResult = data.unified_result as Omit<CadLabResult, "stlData" | "stepData"> | null
    if (!unifiedResult) {
      return { pending: true as const }
    }

    return {
      result: unifiedResult,
      code: (data.unified_code as string | null) ?? null,
    }
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
    // VALIDATION: UUID check on both IDs
    if (!projectId || !UUID_RE.test(projectId)) {
      return { success: false, error: "Invalid projectId" }
    }
    if (!moduleId || !UUID_RE.test(moduleId)) {
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

// ─── Save AI Cost Estimates ──────────────────────────────────────────

/**
 * Persists AI-generated cost estimates for a Cad Lab project.
 *
 * @param projectId - Project to update
 * @param estimates - AI cost estimates keyed by module ID
 * @returns Success or error
 */
export async function saveCadLabAiCostEstimates(
  projectId: string,
  estimates: Record<string, AiCostEstimate>,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ ai_cost_estimates: estimates as unknown as Json })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save AI cost estimates:", error.message)
      return { error: `Failed to save AI cost estimates: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Save Part Category Overrides ────────────────────────────────────

/**
 * Persists user overrides for part classification (type/process/material).
 *
 * @param projectId - The project to update
 * @param overrides - Overrides keyed by "${moduleId}::${partName}"
 * @returns Success or error
 */
export async function saveCadLabPartCategoryOverrides(
  projectId: string,
  overrides: Record<string, PartCategoryOverride>,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId || !UUID_RE.test(projectId)) return { error: "Invalid project ID" }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ part_category_overrides: overrides as unknown as Json })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save part category overrides:", error.message)
      return { error: `Failed to save part category overrides: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

// ─── Save Review Skipped ────────────────────────────────────────────

/**
 * Persists whether the user explicitly skipped specialist reviews.
 *
 * @description Called when the user clicks "Skip Reviews & Finalize"
 * to proceed to Source without specialist reviews.
 */
export async function saveCadLabReviewSkipped(
  projectId: string,
  skipped: boolean,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId || !UUID_RE.test(projectId)) {
      return { error: "Invalid project ID" }
    }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ review_skipped: skipped })
      .eq("id", projectId)

    if (error) {
      console.error("[THE-FORGE-PROJECTS] Failed to save review skipped:", error.message)
      return { error: `Failed to save review skipped: ${sanitizeErrorMessage(error)}` }
    }

    return { success: true as const }
  })
}

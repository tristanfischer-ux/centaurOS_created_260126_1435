"use server"

/**
 * @file cad-lab-source.ts — Server actions for the Source stage of The Forge pipeline.
 *
 * @description Creates spec-based RFQs for individual modules or grouped projects,
 * and fetches RFQ status for the Source dashboard. Works with both "specified" and
 * "generated" modules — CAD artifacts are optional bonuses.
 *
 * @security All actions require authentication via withAuth.
 */

import { withAuth } from "@/lib/server-action-utils"
import { createCadLabRfqAction } from "@/actions/cad-lab-rfq"
import type { CadLabModule, CadLabDesignBrief } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

/**
 * Creates a spec-based RFQ for a single module.
 *
 * @param projectId - The project ID
 * @param moduleId - The module to create an RFQ for
 * @param projectName - Display name for the project
 * @param modules - All project modules (for context)
 * @param diagnosticAnswers - Diagnostic answers for all modules
 * @param designBrief - Optional design brief
 * @param assumptionNotes - Optional assumption notes
 */
export async function createModuleRfq(
  projectId: string,
  moduleId: string,
  projectName: string,
  modules: CadLabModule[],
  diagnosticAnswers: DiagnosticAnswers,
  designBrief?: CadLabDesignBrief,
  assumptionNotes?: string,
): Promise<{ rfqId: string } | { error: string }> {
  const targetModule = modules.find((m) => m.id === moduleId)
  if (!targetModule) {
    return { error: `Module ${moduleId} not found.` }
  }

  return createCadLabRfqAction({
    projectName: `${projectName} — ${targetModule.name}`,
    modules: [targetModule],
    diagnosticAnswers,
    designBrief,
    assumptionNotes,
  })
}

/**
 * Creates a grouped spec-based RFQ for multiple modules.
 *
 * @param projectId - The project ID
 * @param moduleIds - Module IDs to include in the RFQ
 * @param projectName - Display name for the project
 * @param modules - All project modules
 * @param diagnosticAnswers - Diagnostic answers
 * @param designBrief - Optional design brief
 * @param assumptionNotes - Optional assumption notes
 */
export async function createProjectRfq(
  projectId: string,
  moduleIds: string[],
  projectName: string,
  modules: CadLabModule[],
  diagnosticAnswers: DiagnosticAnswers,
  designBrief?: CadLabDesignBrief,
  assumptionNotes?: string,
): Promise<{ rfqId: string } | { error: string }> {
  const selectedModules = modules.filter((m) => moduleIds.includes(m.id))
  if (selectedModules.length === 0) {
    return { error: "No eligible modules selected for RFQ." }
  }

  return createCadLabRfqAction({
    projectName,
    modules: selectedModules,
    diagnosticAnswers,
    designBrief,
    assumptionNotes,
  })
}

/**
 * Fetches all RFQs linked to a project via the marketplace.
 *
 * @param projectId - The project to fetch RFQs for
 * @returns Array of RFQ summaries with status
 */
export async function getProjectRfqStatus(
  _projectId: string,
): Promise<{ rfqs: Array<{ id: string; title: string; status: string; createdAt: string; responseCount: number }> } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    // INTENT: Fetch RFQs that reference this project via custom_fields.source
    const { data, error } = await supabase
      .from("rfqs")
      .select("id, title, status, created_at, rfq_responses(id)")
      .or(`specifications->>custom_fields->source.eq.the-forge-cad-lab`)
      .order("created_at", { ascending: false })

    if (error) {
      return { rfqs: [] }
    }

    const rfqs = (data ?? []).map((rfq) => ({
      id: rfq.id,
      title: rfq.title ?? "Untitled RFQ",
      status: rfq.status ?? "draft",
      createdAt: rfq.created_at ?? "",
      responseCount: Array.isArray(rfq.rfq_responses) ? rfq.rfq_responses.length : 0,
    }))

    return { rfqs }
  })
}

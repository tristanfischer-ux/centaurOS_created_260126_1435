/**
 * @file generate-batch/route.ts — DEPRECATED: Legacy batch generation endpoint.
 *
 * @description This endpoint has been replaced by /api/cad-lab/generate-module
 * which processes one module per serverless invocation. The monolithic batch
 * approach exceeded Vercel's 5-minute timeout for products with 5+ modules.
 *
 * POST: Returns 410 Gone with migration instructions
 * GET:  Still functional — polls batch status for reconnection support
 *
 * @security Requires authenticated user with foundry access (RLS enforced).
 * @deprecated Use /api/cad-lab/generate-module instead
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { CadLabModule } from "@/lib/cad-lab-types"

export const runtime = "nodejs"

// ─── POST Handler (DEPRECATED) ──────────────────────────────────────

/**
 * Legacy batch generation endpoint — no longer functional.
 *
 * @deprecated Replaced by /api/cad-lab/generate-module (per-module generation)
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: "Batch endpoint deprecated. Use /api/cad-lab/generate-module for per-module generation.",
      migration: "Fire one POST per module to /api/cad-lab/generate-module with { projectId, moduleId }",
    },
    { status: 410 },
  )
}

// ─── GET Handler (still functional for reconnection) ────────────────

/**
 * Returns the current batch status and per-module progress for a project.
 * Used when a user reloads the page while modules are generating.
 *
 * @param request - Query param: ?projectId=uuid
 * @returns { batchStatus, batchStartedAt, moduleStatuses, generatedCount, totalCount }
 */
export async function GET(request: Request): Promise<NextResponse> {
  // AUTH: Verify user session
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const projectId = url.searchParams.get("projectId")

  if (!projectId || !/^[0-9a-f-]{36}$/.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 })
  }

  // RLS ensures foundry isolation
  const { data: project, error } = await supabase
    .from("cad_lab_projects")
    .select("batch_status, batch_started_at, modules")
    .eq("id", projectId)
    .single()

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const modules = (project.modules as CadLabModule[] | null) ?? []
  const moduleStatuses: Record<string, string> = {}
  for (const mod of modules) {
    moduleStatuses[mod.id] = mod.status
  }

  return NextResponse.json({
    batchStatus: project.batch_status,
    batchStartedAt: project.batch_started_at,
    moduleStatuses,
    generatedCount: modules.filter((m) => m.status === "generated").length,
    totalCount: modules.length,
  })
}

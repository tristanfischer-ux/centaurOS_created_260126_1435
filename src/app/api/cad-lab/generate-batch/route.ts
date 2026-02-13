/**
 * @file generate-batch/route.ts — Background batch generation for CAD Lab modules.
 *
 * @description Runs the full module generation pipeline server-side with
 * controlled concurrency. The client fires this POST and immediately starts
 * polling GET for progress. Even if the user navigates away, the server
 * continues processing until completion or maxDuration.
 *
 * POST: Starts batch generation (runs synchronously, client doesn't await)
 * GET:  Polls current batch status and per-module progress
 *
 * @security Requires authenticated user with foundry access (RLS enforced).
 * @audit Logs batch start/complete with timing.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateCadLabInterface, generateCadLabModel } from "@/actions/cad-lab"
import type { CadLabModule, ClaudeModelId } from "@/lib/cad-lab-types"
import type { Json } from "@/types/database.types"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min — enough for ~7 modules at concurrency 2

// ─── POST Handler ────────────────────────────────────────────────────

/**
 * Runs batch generation for all pending modules in a project.
 *
 * The client fires this request without awaiting and polls GET instead.
 * The response is sent only when the batch completes (or errors).
 *
 * @param request - JSON body: { projectId: string }
 * @returns { done: true, generatedCount, errorCount } or { error: string }
 */
export async function POST(request: Request): Promise<NextResponse> {
  // AUTH: Verify user session
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // VALIDATION: Parse request body
  let projectId: string
  try {
    const body = (await request.json()) as { projectId?: string }
    if (!body.projectId || !/^[0-9a-f-]{36}$/.test(body.projectId)) {
      return NextResponse.json({ error: "Invalid projectId" }, { status: 400 })
    }
    projectId = body.projectId
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Load project (RLS ensures foundry isolation)
  const { data: project, error: loadError } = await supabase
    .from("cad_lab_projects")
    .select("id, foundry_id, created_by, subject, model_id, modules, batch_status, research")
    .eq("id", projectId)
    .single()

  if (loadError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  // SECURITY: Prevent starting a second batch while one is running
  if (project.batch_status === "running") {
    return NextResponse.json({ error: "Batch already running" }, { status: 409 })
  }

  const allModules = (project.modules as CadLabModule[] | null) ?? []
  const pending = allModules.filter((m) => m.status !== "generated")

  if (pending.length === 0) {
    return NextResponse.json({ error: "No pending modules" }, { status: 400 })
  }

  const modelId = (project.model_id || "claude-opus-4-6") as ClaudeModelId
  const researchReport = (project.research as { report?: string } | null)?.report ?? ""

  // Set batch_status = running
  await supabase
    .from("cad_lab_projects")
    .update({
      batch_status: "running",
      batch_started_at: new Date().toISOString(),
    })
    .eq("id", projectId)

  // AUDIT: Log batch start
  const batchStart = Date.now()
  console.info("[CAD-LAB-BATCH] Batch started:", {
    projectId,
    userId: user.id,
    pendingCount: pending.length,
    totalModules: allModules.length,
  })

  // ── Process modules with concurrency limit ──
  let currentModules = [...allModules]
  let errorCount = 0
  const CONCURRENCY = 2

  const generateOneModule = async (mod: CadLabModule): Promise<void> => {
    let localMod = { ...mod }

    const moduleResearchText =
      localMod.moduleResearch ||
      `Module: ${localMod.name}\nPurpose: ${localMod.purpose}\nKey Parts: ${localMod.keyParts.join(", ")}\nDescription: ${localMod.description}\n\nFrom parent research:\n${researchReport}`

    // Interface step (if needed)
    if (localMod.status === "pending") {
      try {
        const res = await generateCadLabInterface(
          `${localMod.name} — ${localMod.purpose}`,
          moduleResearchText,
          modelId,
        )
        if (res.success) {
          localMod = {
            ...localMod,
            interfaceDefinition: res.interfaceDefinition,
            status: "interface_ready" as const,
          }
        } else {
          console.error("[CAD-LAB-BATCH] Interface failed:", localMod.name)
          errorCount++
          return
        }
      } catch (err) {
        console.error("[CAD-LAB-BATCH] Interface error:", localMod.name, err instanceof Error ? err.message : err)
        errorCount++
        return
      }
    }

    // CAD generation step
    try {
      const cadResearch =
        localMod.moduleResearch ||
        `Module: ${localMod.name}\nPurpose: ${localMod.purpose}\nKey Parts: ${localMod.keyParts.join(", ")}\nDescription: ${localMod.description}\n\nFrom parent research:\n${researchReport}`

      const res = await generateCadLabModel(
        `${localMod.name} — ${localMod.purpose}`,
        cadResearch,
        localMod.interfaceDefinition || "",
        modelId,
      )
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { stlData, stepData, ...resultWithoutBinary } = res
      localMod = {
        ...localMod,
        result: resultWithoutBinary,
        code: res.code,
        status: "generated" as const,
      }
    } catch (err) {
      console.error("[CAD-LAB-BATCH] CAD error:", localMod.name, err instanceof Error ? err.message : err)
      errorCount++
      return
    }

    // Incremental save — persist this module's result immediately
    currentModules = currentModules.map((m) => (m.id === mod.id ? localMod : m))
    await supabase
      .from("cad_lab_projects")
      .update({ modules: currentModules as unknown as Json })
      .eq("id", projectId)
  }

  // ── Semaphore-based concurrency pool ──
  let activeCount = 0
  let resolveSlot: (() => void) | null = null

  const waitForSlot = (): Promise<void> => {
    if (activeCount < CONCURRENCY) return Promise.resolve()
    return new Promise<void>((resolve) => {
      resolveSlot = resolve
    })
  }

  const releaseSlot = (): void => {
    activeCount--
    if (resolveSlot) {
      const r = resolveSlot
      resolveSlot = null
      r()
    }
  }

  const tasks: Promise<void>[] = []

  for (const mod of pending) {
    await waitForSlot()
    activeCount++
    tasks.push(generateOneModule(mod).finally(releaseSlot))
  }

  await Promise.allSettled(tasks)

  // ── Finalize batch status ──
  const finalStatus = errorCount === pending.length ? "error" : "done"
  await supabase
    .from("cad_lab_projects")
    .update({ batch_status: finalStatus })
    .eq("id", projectId)

  // ── Send completion notification ──
  const doneCount = currentModules.filter((m) => m.status === "generated").length
  try {
    const admin = createAdminClient()
    await admin.from("notifications").insert({
      user_id: user.id,
      foundry_id: project.foundry_id,
      type: "cad_batch_complete",
      title: `CAD generation complete — ${doneCount}/${allModules.length} modules ready`,
      message:
        errorCount > 0
          ? `${doneCount} modules generated successfully, ${errorCount} had errors.`
          : `All ${doneCount} modules generated successfully.`,
      link: "/the-forge/cad-lab/build",
      metadata: { projectId, doneCount, errorCount, totalModules: allModules.length },
    })
  } catch (notifErr) {
    // Non-critical — batch still succeeded even if notification fails
    console.warn("[CAD-LAB-BATCH] Notification failed:", notifErr)
  }

  // AUDIT: Log batch completion
  console.info("[CAD-LAB-BATCH] Batch complete:", {
    projectId,
    doneCount,
    errorCount,
    elapsedMs: Date.now() - batchStart,
  })

  return NextResponse.json({
    done: true,
    generatedCount: doneCount,
    errorCount,
    totalModules: allModules.length,
    elapsedMs: Date.now() - batchStart,
  })
}

// ─── GET Handler (poll batch status) ─────────────────────────────────

/**
 * Returns the current batch status and per-module progress for a project.
 * The client polls this endpoint every few seconds while a batch is running.
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

/**
 * @file generate-module/route.ts — Per-module CAD generation endpoint.
 *
 * @description Generates a single module's interface + CAD in its own serverless
 * function invocation. The client fires one request per pending module in parallel,
 * each with its own 5-minute budget. This replaces the monolithic batch endpoint
 * that exceeded Vercel's timeout for products with 5+ modules.
 *
 * The response is returned only when the module completes (or errors), so the
 * client gets instant feedback per module — no polling required.
 *
 * @security Requires authenticated user with foundry access (RLS enforced).
 * @audit Logs module generation start/complete with timing.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateCadLabInterface, generateCadLabModelSmart } from "@/actions/cad-lab"
import { buildCheckpointPromptSection } from "@/lib/cad-lab/checkpoint-prompt"
import { rateLimit } from "@/lib/security/rate-limit"
import { estimateEarlyCost } from "@/lib/cad-lab/early-cost-estimator"
import type { CadLabModule, CadLabResult, ClaudeModelId, DecompositionCheckpoint, GenerationEvent } from "@/lib/cad-lab-types"
import type { Json } from "@/types/database.types"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min — ample for a single module (interface + CAD + Modal)

/** Request body shape */
interface GenerateModuleBody {
  projectId?: string
  moduleId?: string
}

/** Response on success */
interface GenerateModuleSuccess {
  done: true
  moduleId: string
  module: CadLabModule
  elapsedMs: number
}

/** Response on error */
interface GenerateModuleError {
  error: string
  moduleId?: string
}

const CAD_LAB_STORAGE_BUCKET = "xray-images"

interface UploadedCadAsset {
  name: string
  url: string
  mimeType: string
  sizeKb?: number
}

async function uploadCadAsset(
  projectId: string,
  moduleId: string,
  filename: string,
  mimeType: string,
  base64Data: string,
): Promise<{ url: string; sizeKb: number }> {
  const admin = createAdminClient()
  const buffer = Buffer.from(base64Data, "base64")
  const path = `cad-lab/${projectId}/${moduleId}/${filename}`

  const { error } = await admin.storage
    .from(CAD_LAB_STORAGE_BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: true })

  if (error) throw new Error(`Failed to upload ${filename}: ${error.message}`)

  const { data: publicUrl } = admin.storage
    .from(CAD_LAB_STORAGE_BUCKET)
    .getPublicUrl(path)

  return {
    url: publicUrl.publicUrl,
    sizeKb: Math.round(buffer.length / 1024),
  }
}

async function uploadDrawingManifest(
  projectId: string,
  moduleId: string,
  manifest: Record<string, unknown>,
): Promise<string | undefined> {
  const admin = createAdminClient()
  const path = `cad-lab/${projectId}/${moduleId}/drawing-manifest.json`
  const content = Buffer.from(JSON.stringify(manifest, null, 2), "utf-8")

  const { error } = await admin.storage
    .from(CAD_LAB_STORAGE_BUCKET)
    .upload(path, content, {
      contentType: "application/json",
      upsert: true,
    })

  if (error) {
    console.warn("[CAD-LAB-MODULE] Failed to upload drawing manifest:", error.message)
    return undefined
  }

  const { data: publicUrl } = admin.storage
    .from(CAD_LAB_STORAGE_BUCKET)
    .getPublicUrl(path)

  return publicUrl.publicUrl
}

/**
 * Generates a single The Forge module (interface + CAD generation).
 *
 * @description Each module gets its own serverless invocation with a full
 * 5-minute timeout. The client fires N of these in parallel (with a
 * client-side concurrency limit) and updates the UI as each resolves.
 *
 * @param request - JSON body: { projectId: string, moduleId: string }
 * @returns The completed module data or an error
 */
export async function POST(request: Request): Promise<Response> {
  // AUTH: Verify user session
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // SECURITY: Rate limit expensive AI/CAD module generation to control abuse and cost.
  const rateLimitResult = await rateLimit('api', `cad-lab-module:${user.id}`, {
    limit: 30,
    window: 60 * 60 * 1000,
  })
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before generating more modules." },
      { status: 429 },
    )
  }

  // VALIDATION: Parse request body
  let projectId: string
  let moduleId: string
  try {
    const body = (await request.json()) as GenerateModuleBody
    if (!body.projectId || !/^[0-9a-f-]{36}$/.test(body.projectId)) {
      return NextResponse.json({ error: "Invalid projectId" }, { status: 400 })
    }
    if (!body.moduleId || typeof body.moduleId !== "string") {
      return NextResponse.json({ error: "Invalid moduleId" }, { status: 400 })
    }
    projectId = body.projectId
    moduleId = body.moduleId
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Load project (RLS ensures foundry isolation)
  const { data: project, error: loadError } = await supabase
    .from("cad_lab_projects")
    .select("id, foundry_id, created_by, subject, model_id, modules, research, checkpoints")
    .eq("id", projectId)
    .single()

  if (loadError || !project) {
    return NextResponse.json({ error: "Project not found", moduleId }, { status: 404 })
  }

  const allModules = (project.modules as CadLabModule[] | null) ?? []
  const targetModule = allModules.find((m) => m.id === moduleId)

  if (!targetModule) {
    return NextResponse.json({ error: "Module not found", moduleId }, { status: 404 })
  }

  if (targetModule.status === "generated") {
    return NextResponse.json({ error: "Module already generated", moduleId }, { status: 400 })
  }

  const modelIdVal = (project.model_id || "claude-sonnet-4-6") as ClaudeModelId
  const researchReport = (project.research as { report?: string } | null)?.report ?? ""

  // P5: Check if client wants SSE (Accept: text/event-stream) or classic JSON
  const acceptsSSE = request.headers.get("accept")?.includes("text/event-stream")

  // ── SSE helper ──
  const encoder = new TextEncoder()
  function formatSSE(event: GenerationEvent): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  }

  // AUDIT: Log module generation start
  const startTime = Date.now()
  console.info("[CAD-LAB-MODULE] Generation started:", {
    projectId,
    moduleId,
    moduleName: targetModule.name,
    userId: user.id,
    sse: acceptsSSE,
  })

  // P5: Wrap pipeline in a ReadableStream for SSE delivery
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: GenerationEvent) => {
        try { controller.enqueue(formatSSE(event)) } catch { /* stream closed */ }
      }

      let localMod = { ...targetModule }

      // Build checkpoint context for prompt injection
      const checkpointContext = buildCheckpointPromptSection(
        project.checkpoints as Record<string, DecompositionCheckpoint> | null,
        moduleId,
      )

      const moduleResearchText =
        localMod.moduleResearch ||
        `Module: ${localMod.name}\nPurpose: ${localMod.purpose}\nKey Parts: ${localMod.keyParts.join(", ")}\nDescription: ${localMod.description}\n\nFrom parent research:\n${researchReport}`

      // ── Interface step (if needed) ──
      if (localMod.status === "pending") {
        emit({ type: "status", step: "interface" })
        try {
          // QW3: Pass cached template match if available on module
          const res = await generateCadLabInterface(
            `${localMod.name} — ${localMod.purpose}`,
            moduleResearchText,
            modelIdVal,
            checkpointContext || undefined,
            localMod.templateMatchResult || undefined,
          )
          if (res.success) {
            localMod = {
              ...localMod,
              interfaceDefinition: res.interfaceDefinition,
              status: "interface_ready" as const,
              // QW3: Cache template match result for reuse in CAD generation step
              templateMatchResult: res.templateMatchResult ?? localMod.templateMatchResult,
            }
            // Save intermediate state so polling clients can see progress
            await saveModuleToProject(supabase, projectId, allModules, localMod)
            emit({ type: "progress", message: "Interface definition complete" })

            // P9: Early cost estimation from interface definition
            if (localMod.interfaceDefinition) {
              const costEstimate = estimateEarlyCost(
                localMod.id,
                localMod.name,
                localMod.interfaceDefinition,
              )
              if (costEstimate) {
                emit({ type: "cost_estimate", estimate: costEstimate })
              }
            }
          } else {
            console.error("[CAD-LAB-MODULE] Interface failed:", localMod.name)
            emit({ type: "error", message: `Interface generation failed for ${localMod.name}` })
            controller.close()
            return
          }
        } catch (err) {
          console.error("[CAD-LAB-MODULE] Interface error:", localMod.name, err instanceof Error ? err.message : err)
          emit({ type: "error", message: `Interface error: ${err instanceof Error ? err.message : "Unknown error"}` })
          controller.close()
          return
        }
      }

      // ── CAD generation step ──
      emit({ type: "status", step: "codegen", attempt: 1 })
      let cadResult: CadLabResult | undefined
      try {
        const cadResearch =
          localMod.moduleResearch ||
          `Module: ${localMod.name}\nPurpose: ${localMod.purpose}\nKey Parts: ${localMod.keyParts.join(", ")}\nDescription: ${localMod.description}\n\nFrom parent research:\n${researchReport}`

        const moduleContext = [
          `## ${localMod.name}`,
          `**Purpose:** ${localMod.purpose}`,
          localMod.description ? `**Technical Description:** ${localMod.description}` : "",
          localMod.whyItMatters ? `**Why It Matters:** ${localMod.whyItMatters}` : "",
          localMod.failureModes?.length ? `**Failure Modes:**\n${localMod.failureModes.map(f => `- ${f}`).join("\n")}` : "",
          localMod.unknowns?.length ? `**Unknowns:**\n${localMod.unknowns.map(u => `- ${u}`).join("\n")}` : "",
        ].filter(Boolean).join("\n\n")

        const enrichedDescription = `${localMod.name} — ${localMod.purpose}\n\n${moduleContext}`

        emit({ type: "status", step: "modal" })

        // QW3: Pass cached template match to avoid redundant DB + semantic scoring
        const res = await generateCadLabModelSmart(
          enrichedDescription,
          cadResearch,
          localMod.interfaceDefinition || "",
          modelIdVal,
          checkpointContext || undefined,
          localMod.templateMatchResult || undefined,
        )
        cadResult = res

        if (!res.success) {
          console.error("[CAD-LAB-MODULE] CAD generation returned failure:", localMod.name, res.error)
          localMod = { ...localMod, status: "failed" as const, code: res.code }
          await saveModuleToProject(supabase, projectId, allModules, localMod)
          // R3: Fire-and-forget metrics for failed generation
          recordGenerationMetrics(projectId, moduleId, false, res).catch(() => {})
          emit({ type: "error", message: res.error || "CAD generation failed" })
          controller.close()
          return
        }

        // Emit pre-exec validation findings if any
        if (res.preExecValidation && res.preExecValidation.length > 0) {
          emit({ type: "validation", findings: res.preExecValidation })
        }

        emit({ type: "status", step: "upload" })

        const { stlData, stepData, ...resultWithoutBinary } = res

        const packageFiles: UploadedCadAsset[] = []
        let stepUrl: string | undefined
        let stlUrl: string | undefined

        if (stepData) {
          try {
            const uploaded = await uploadCadAsset(
              projectId,
              localMod.id,
              `${localMod.id}.step`,
              "application/step",
              stepData,
            )
            stepUrl = uploaded.url
            packageFiles.push({
              name: `${localMod.id}.step`,
              url: uploaded.url,
              mimeType: "application/step",
              sizeKb: uploaded.sizeKb,
            })
          } catch (uploadErr) {
            console.warn("[CAD-LAB-MODULE] STEP upload failed:", uploadErr instanceof Error ? uploadErr.message : uploadErr)
          }
        }

        if (stlData) {
          try {
            const uploaded = await uploadCadAsset(
              projectId,
              localMod.id,
              `${localMod.id}.stl`,
              "model/stl",
              stlData,
            )
            stlUrl = uploaded.url
            packageFiles.push({
              name: `${localMod.id}.stl`,
              url: uploaded.url,
              mimeType: "model/stl",
              sizeKb: uploaded.sizeKb,
            })
          } catch (uploadErr) {
            console.warn("[CAD-LAB-MODULE] STL upload failed:", uploadErr instanceof Error ? uploadErr.message : uploadErr)
          }
        }

        // P3: Persist SVG views to Supabase storage — survives page navigation
        const svgViewMap: Record<string, string | undefined> = {
          iso: res.svgIso,
          top: res.svgTop,
          front: res.svgFront,
          back: res.svgBack,
          right: res.svgRight,
          left: res.svgLeft,
          exploded: res.svgExploded,
        }
        const svgUrls: Record<string, string> = {}
        await Promise.all(
          Object.entries(svgViewMap).map(async ([viewName, dataUri]) => {
            if (!dataUri) return
            try {
              const base64Data = dataUri.replace(/^data:image\/svg\+xml;base64,/, "")
              const uploaded = await uploadCadAsset(
                projectId,
                localMod.id,
                `${localMod.id}-${viewName}.svg`,
                "image/svg+xml",
                base64Data,
              )
              svgUrls[viewName] = uploaded.url
            } catch (svgErr) {
              console.warn(`[CAD-LAB-MODULE] SVG ${viewName} upload failed:`, svgErr instanceof Error ? svgErr.message : svgErr)
            }
          }),
        )

        const manifestPayload = {
          projectId,
          moduleId: localMod.id,
          moduleName: localMod.name,
          generatedAt: new Date().toISOString(),
          revision: "A",
          envelopeMm: res.bbox,
          massGrams: res.massGrams,
          processHints: {
            printable: res.dfm?.printable ?? null,
            compatiblePrinters: res.dfm?.compatiblePrinters ?? [],
          },
          files: packageFiles,
        }
        const manifestUrl = await uploadDrawingManifest(projectId, localMod.id, manifestPayload)

        localMod = {
          ...localMod,
          svgUrls: Object.keys(svgUrls).length > 0 ? svgUrls : undefined,
          result: {
            ...resultWithoutBinary,
            stepUrl,
            stlUrl,
            drawingPackage: {
              revision: "A",
              generatedAt: manifestPayload.generatedAt,
              title: `${localMod.name} Drawing Package`,
              manifestUrl,
              files: packageFiles,
            },
          },
          code: res.code,
          status: "generated" as const,
        }
      } catch (err) {
        console.error("[CAD-LAB-MODULE] CAD error:", localMod.name, err instanceof Error ? err.message : err)
        emit({ type: "error", message: `CAD generation error: ${err instanceof Error ? err.message : "Unknown error"}` })
        controller.close()
        return
      }

      // ── Persist completed module ──
      await saveModuleToProject(supabase, projectId, allModules, localMod)

      // R3: Fire-and-forget metrics for successful generation
      if (cadResult) recordGenerationMetrics(projectId, moduleId, true, cadResult).catch(() => {})

      const elapsedMs = Date.now() - startTime

      // AUDIT: Log module generation complete
      console.info("[CAD-LAB-MODULE] Generation complete:", {
        projectId,
        moduleId,
        moduleName: localMod.name,
        elapsedMs,
      })

      // P5: Final complete event contains the full module data — backward compat
      emit({ type: "complete", module: localMod })
      controller.close()
    },
  })

  // P5: Return SSE stream if client accepts it, otherwise collect and return JSON
  if (acceptsSSE) {
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  }

  // Backward compat: Consume the stream and return the final event as JSON
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let lastComplete: GenerationEvent | null = null
  let lastError: string | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value)
    // Parse SSE data lines
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as GenerationEvent
          if (event.type === "complete") lastComplete = event
          if (event.type === "error") lastError = event.message
        } catch { /* ignore parse errors */ }
      }
    }
  }

  if (lastComplete && lastComplete.type === "complete") {
    return NextResponse.json({
      done: true,
      moduleId,
      module: lastComplete.module,
      elapsedMs: Date.now() - startTime,
    } satisfies GenerateModuleSuccess)
  }

  return NextResponse.json(
    { error: lastError || "Generation failed", moduleId } satisfies GenerateModuleError,
    { status: 500 },
  )
}

// ─── R3: Quality Metrics Persistence ──────────────────────────────────

/**
 * Fire-and-forget insert of generation quality metrics.
 *
 * @description Non-blocking — never delays module delivery to the client.
 * Records both success and failure outcomes for trend analysis.
 *
 * @param projectId - CAD Lab project ID
 * @param moduleId - Module ID within the project
 * @param success - Whether generation succeeded
 * @param res - The CadLabResult with generation metadata
 */
async function recordGenerationMetrics(
  projectId: string,
  moduleId: string,
  success: boolean,
  res: CadLabResult,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("cad_lab_generation_metrics")
    .insert({
      project_id: projectId,
      module_id: moduleId,
      success,
      model_used: res.modelUsed ?? null,
      seed_template_slug: res.seedTemplateSlug ?? null,
      first_attempt_success: res.firstAttemptSuccess ?? null,
      repair_attempts: res.repairAttempts ?? null,
      vision_score: res.visionScore ?? null,
      generation_time_ms: res.generationTime ?? null,
      tokens_in: res.tokensIn ?? null,
      tokens_out: res.tokensOut ?? null,
    })
  if (error) {
    console.warn("[CAD-LAB-MODULE] Metrics insert failed:", error.message)
  }
}

// ─── Helper: Atomic module save ──────────────────────────────────────

/**
 * Saves a single module back into the project's modules JSONB array atomically.
 *
 * @description Uses the `update_cad_lab_module` RPC function which locks the row,
 * finds the module by ID, and replaces it in the JSONB array. This prevents race
 * conditions when multiple serverless functions complete modules simultaneously.
 *
 * @param supabase - Supabase client with user session
 * @param projectId - Project to update
 * @param updatedModule - The module with updated data to save
 */
async function saveModuleToProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  _allModules: CadLabModule[],
  updatedModule: CadLabModule,
): Promise<void> {
  const { error } = await supabase.rpc("update_cad_lab_module", {
    p_project_id: projectId,
    p_module_id: updatedModule.id,
    p_module_data: updatedModule as unknown as Json,
  })

  if (error) {
    // Fallback to read-then-write if RPC fails (e.g., function not deployed yet)
    console.warn("[CAD-LAB-MODULE] RPC fallback — update_cad_lab_module failed:", error.message)
    const { data: current } = await supabase
      .from("cad_lab_projects")
      .select("modules")
      .eq("id", projectId)
      .single()

    const currentModules = (current?.modules as CadLabModule[] | null) ?? _allModules
    const updatedModules = currentModules.map((m) =>
      m.id === updatedModule.id ? updatedModule : m,
    )

    await supabase
      .from("cad_lab_projects")
      .update({ modules: updatedModules as unknown as Json })
      .eq("id", projectId)
  }
}

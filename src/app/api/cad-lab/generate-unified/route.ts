/**
 * @file generate-unified/route.ts — Unified CAD model generation endpoint.
 *
 * @description Generates a parametric CAD model via Zoo.dev's text-to-CAD API.
 * Builds an enriched prompt from the product description and hero image prompt,
 * uploads STEP/STL/GLB assets to Supabase Storage, persists unified_result to
 * the project row, and records generation metrics.
 *
 * Streams SSE events for real-time progress feedback.
 *
 * @security Requires authenticated user with project access (RLS enforced).
 * @audit Logs generation start/complete with timing.
 */

import { NextResponse } from "next/server"
import { aiGuard } from "@/lib/ai/guard"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/security/rate-limit"
import { detectDomainFromResearchReport } from "@/lib/cad-lab/domain-prompts"
import { imageToMesh } from "@/lib/cad-lab/image-to-3d"
import { glbToStl } from "@/lib/cad-lab/mesh-convert"
import type {
  CadLabModule,
  CadLabResult,
  CadLabDesignBrief,
  GenerationEvent,
} from "@/lib/cad-lab-types"
import type { Json } from "@/types/database.types"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min — Zoo text-to-CAD + upload

/** Request body shape */
interface GenerateUnifiedBody {
  projectId?: string
  /** Cached domain from client-side detection — avoids redundant Claude call */
  domainHint?: string
}

const CAD_LAB_STORAGE_BUCKET = "xray-images"
const UNIFIED_MODULE_ID = "__unified__"

// ─── Storage helpers (same pattern as generate-module) ───────────────

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

// ─── POST handler ────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // AUTH + AI GATE: Verify user session and check AI usage limits
  const supabase = await createClient()
  const guard = await aiGuard(supabase, 'cad_lab_generate')
  if (guard.denied) return guard.response
  const user = { id: guard.userId }

  // SECURITY: Rate limit — shared budget with per-module generation
  const rateLimitResult = await rateLimit("api", `cad-lab-module:${user.id}`, {
    limit: 30,
    window: 60 * 60 * 1000,
  })
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before generating more models." },
      { status: 429 },
    )
  }

  // VALIDATION: Parse request body
  let projectId: string
  let clientDomainHint: string | undefined
  try {
    const body = (await request.json()) as GenerateUnifiedBody
    if (!body.projectId || !/^[0-9a-f-]{36}$/.test(body.projectId)) {
      return NextResponse.json({ error: "Invalid projectId" }, { status: 400 })
    }
    projectId = body.projectId
    if (body.domainHint && typeof body.domainHint === "string" &&
        ["electronics", "mechanical", "electromechanical", "fluid"].includes(body.domainHint)) {
      clientDomainHint = body.domainHint
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Load project (RLS ensures foundry isolation)
  const { data: project, error: loadError } = await supabase
    .from("cad_lab_projects")
    .select("id, foundry_id, created_by, subject, modules, research, visual_style, system_illustration_url")
    .eq("id", projectId)
    .single()

  if (loadError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const allModules = (project.modules as CadLabModule[] | null) ?? []
  if (allModules.length === 0) {
    return NextResponse.json({ error: "No modules to generate — decompose first" }, { status: 400 })
  }

  const researchData = project.research as { report?: string; designBrief?: CadLabDesignBrief } | null
  const researchReport = researchData?.report ?? ""
  const designBrief = researchData?.designBrief
  const visualStyleData = project.visual_style as { heroImagePrompt?: string; cadGeometryPrompt?: string } | null
  const heroImagePrompt = visualStyleData?.heroImagePrompt ?? null
  const cadGeometryPrompt = visualStyleData?.cadGeometryPrompt ?? null
  const systemIllustrationUrl = (project.system_illustration_url as string | null) ?? null

  // GUARD: Zoo-only — require a design prompt and API token
  if (!heroImagePrompt && !cadGeometryPrompt) {
    return NextResponse.json(
      { error: "No design prompt found. Re-run the Design stage." },
      { status: 400 },
    )
  }
  if (!process.env.ZOO_API_TOKEN) {
    return NextResponse.json(
      { error: "Zoo API not configured." },
      { status: 500 },
    )
  }

  // SSE setup
  const acceptsSSE = request.headers.get("accept")?.includes("text/event-stream")
  const encoder = new TextEncoder()
  function formatSSE(event: GenerationEvent): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  }

  // AUDIT: Log unified generation start
  const startTime = Date.now()
  console.info("[CAD-LAB-UNIFIED] Generation started:", {
    projectId,
    userId: user.id,
    moduleCount: allModules.length,
    sse: acceptsSSE,
  })

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: GenerationEvent) => {
        try { controller.enqueue(formatSSE(event)) } catch { /* stream closed */ }
      }

      // ── Domain detection (cached or fresh) ──
      let detectedDomain: string | undefined
      const researchDomain = (researchData as Record<string, unknown> | null)?.detected_domain as string | undefined
      if (clientDomainHint) {
        detectedDomain = clientDomainHint
      } else if (researchDomain && ["electronics", "mechanical", "electromechanical", "fluid"].includes(researchDomain)) {
        detectedDomain = researchDomain
      } else {
        try {
          detectedDomain = await detectDomainFromResearchReport(researchReport)
        } catch { /* domain is enrichment only */ }
      }

      emit({ type: "progress", message: "Preparing Zoo text-to-CAD generation..." })

      // ── IMAGE-TO-3D PATH ──────────────────────────────────────────────
      // DECISION: When a hero image exists, use purpose-built image-to-3D AI
      // models instead of CadQuery code generation. LLMs cannot reliably convert
      // 2D images into accurate 3D geometry code — purpose-built models can.
      // The existing STLViewer + orthographic renderer handle everything downstream.
      if (systemIllustrationUrl) {
        emit({ type: "progress", message: "Generating parametric CAD model via Zoo.dev..." })

        try {
          // 1. Fetch hero image as base64
          const imageRes = await fetch(systemIllustrationUrl)
          if (!imageRes.ok) throw new Error(`Failed to fetch hero image: ${imageRes.status}`)
          const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
          const imageBase64 = imageBuffer.toString("base64")

          // 2. Call Zoo text-to-CAD API
          // DECISION: Zoo outputs native parametric STEP files (B-Rep surfaces, editable in any CAD program).
          emit({ type: "status", step: "zoo" })

          // DECISION: Prefer cadGeometryPrompt (optimized for parametric CAD) over
          // heroImagePrompt (optimized for image generation with rendering noise).
          const textPrompt = cadGeometryPrompt ?? heroImagePrompt ?? undefined
          const promptSource = cadGeometryPrompt ? "cadGeometryPrompt" : heroImagePrompt ? "heroImagePrompt (fallback)" : "none"
          console.info(`[CAD-LAB-UNIFIED] Zoo prompt source: ${promptSource}, length: ${textPrompt?.length ?? 0}`)
          emit({ type: "progress", message: cadGeometryPrompt
            ? "Generating parametric CAD model from CAD geometry prompt (Zoo.dev)..."
            : "Generating parametric CAD model from design prompt (Zoo.dev)..." })

          const mesh = await imageToMesh(imageBase64, {
            textPrompt,
          })
          emit({ type: "progress", message: `3D model generated via ${mesh.provider} (${Math.round(mesh.generationTimeMs / 1000)}s)` })

          // 3. Convert GLB → STL if provider didn't return STL directly
          const stlBuffer = mesh.stlBuffer ?? await glbToStl(mesh.glbBuffer)
          const stlBase64 = stlBuffer.toString("base64")
          const glbBase64 = mesh.glbBuffer.length > 0 ? mesh.glbBuffer.toString("base64") : undefined

          // 4. Upload assets to Supabase Storage
          emit({ type: "status", step: "upload" })
          emit({ type: "progress", message: "Uploading 3D model files..." })

          let stlUrl: string | undefined
          let stlSize: number | undefined
          let glbUrl: string | undefined
          let stepUrl: string | undefined

          try {
            const uploaded = await uploadCadAsset(projectId, UNIFIED_MODULE_ID, "unified.stl", "model/stl", stlBase64)
            stlUrl = uploaded.url
            stlSize = uploaded.sizeKb
          } catch (err) {
            console.warn("[CAD-LAB-UNIFIED] STL upload failed:", err instanceof Error ? err.message : err)
          }

          if (glbBase64) {
            try {
              const uploaded = await uploadCadAsset(projectId, UNIFIED_MODULE_ID, "unified.glb", "model/gltf-binary", glbBase64)
              glbUrl = uploaded.url
            } catch (err) {
              console.warn("[CAD-LAB-UNIFIED] GLB upload failed:", err instanceof Error ? err.message : err)
            }
          }

          // 5. STEP handling — Zoo returns native parametric STEP
          if (mesh.stepBuffer) {
            try {
              const stepBase64 = mesh.stepBuffer.toString("base64")
              const uploaded = await uploadCadAsset(projectId, UNIFIED_MODULE_ID, "unified.step", "application/step", stepBase64)
              stepUrl = uploaded.url
              console.info(`[CAD-LAB-UNIFIED] Native STEP uploaded: ${Math.round(mesh.stepBuffer.length / 1024)}kb`)
            } catch (err) {
              console.warn("[CAD-LAB-UNIFIED] STEP upload failed:", err instanceof Error ? err.message : err)
            }
          }

          // 6. Build CadLabResult (no code, no SVGs — client renders from STL)
          const finalResult: Omit<CadLabResult, "stlData" | "stepData"> = {
            success: true,
            stlUrl,
            stlSize,
            glbUrl,
            stepUrl,
            modelUsed: mesh.provider === "zoo" ? `text-to-3d:zoo` : `image-to-3d:${mesh.provider}`,
            generationTime: mesh.generationTimeMs,
          }

          console.info("[CAD-LAB-UNIFIED] Image-to-3D complete:", {
            projectId,
            provider: mesh.provider,
            timeMs: mesh.generationTimeMs,
            stlSizeKb: stlSize,
          })

          // 7. Persist to database
          emit({ type: "progress", message: "Saving to database..." })
          try {
            const { error: saveError } = await supabase
              .from("cad_lab_projects")
              .update({
                unified_result: finalResult as unknown as Json,
                unified_code: null, // No CadQuery code for image-to-3D path
              })
              .eq("id", projectId)
            if (saveError) {
              console.warn("[CAD-LAB-UNIFIED] DB save failed:", saveError.message)
            }
          } catch (err) {
            console.warn("[CAD-LAB-UNIFIED] DB save error:", err instanceof Error ? err.message : err)
          }

          // 8. Record metrics
          const imageCadResult: CadLabResult = { success: true, modelUsed: `image-to-3d:${mesh.provider}`, generationTime: mesh.generationTimeMs }
          recordGenerationMetrics(projectId, UNIFIED_MODULE_ID, true, imageCadResult, {
            hasDesignBrief: !!designBrief,
            domain: detectedDomain,
          }).catch(() => {})

          guard.trackUsage({ model: 'zoo-text-to-cad' }).catch(() => {})

          const elapsedMs = Date.now() - startTime
          console.info("[CAD-LAB-UNIFIED] Generation complete:", { projectId, elapsedMs })

          // 9. Emit final event with STL data for immediate 3D viewer display
          emit({
            type: "unified_complete",
            result: { ...finalResult, stlData: stlBase64 } as Omit<CadLabResult, "stepData">,
            code: "",
          })
          controller.close()
          return
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Unknown error"
          console.error("[CAD-LAB-UNIFIED] Zoo text-to-CAD failed:", errMsg)
          emit({ type: "error", message: `CAD generation failed: ${errMsg}` })
          controller.close()
          return
        }
      }

      // GUARD: No hero image — should not happen after early guards, but be explicit
      emit({ type: "error", message: "No product illustration available. Re-run the Design stage." })
      controller.close()
    },
  })

  if (acceptsSSE) {
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  }

  // Backward compat: consume stream, return final JSON
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let lastResult: { result: Omit<CadLabResult, "stlData" | "stepData">; code: string } | null = null
  let lastError: string | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value)
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as Record<string, unknown>
          if (event.type === "unified_complete") {
            lastResult = {
              result: event.result as Omit<CadLabResult, "stlData" | "stepData">,
              code: event.code as string,
            }
          }
          if (event.type === "error") lastError = event.message as string
        } catch { /* ignore parse errors */ }
      }
    }
  }

  if (lastResult) {
    return NextResponse.json({
      done: true,
      ...lastResult,
      elapsedMs: Date.now() - startTime,
    })
  }

  return NextResponse.json(
    { error: lastError || "Generation failed" },
    { status: 500 },
  )
}

// ─── Metrics (fire-and-forget) ───────────────────────────────────────

async function recordGenerationMetrics(
  projectId: string,
  moduleId: string,
  success: boolean,
  res: CadLabResult,
  enrichment?: { hasDesignBrief?: boolean; domain?: string },
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
      error_category: null,
      modal_error_snippet: !success && res.error ? res.error.slice(0, 500) : null,
      pre_exec_critical_count: null,
      pre_exec_warning_count: null,
      has_design_brief: enrichment?.hasDesignBrief ?? null,
      domain: enrichment?.domain ?? null,
      quality_failure: res.visionScore != null && res.visionScore < 5 ? true : null,
    })
  if (error) {
    console.warn("[CAD-LAB-UNIFIED] Metrics insert failed:", error.message)
  }
}

/**
 * @file generate-gencad/route.ts — GenCAD image-to-CAD generation endpoint.
 *
 * @description Generates a parametric CAD model (STL) from the project's hero
 * image via GenCAD on Modal. Uploads the STL to Supabase Storage and persists
 * the URL to the project's unified_result JSONB column.
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
import { imageToCADViaGenCAD } from "@/lib/cad-lab/gencad"
import type { GenerationEvent } from "@/lib/cad-lab-types"
import type { Json } from "@/types/database.types"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min — GenCAD inference + upload

const CAD_LAB_STORAGE_BUCKET = "xray-images"
const UNIFIED_MODULE_ID = "__unified__"

// ─── POST handler ────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // AUTH + AI GATE
  const supabase = await createClient()
  const guard = await aiGuard(supabase, "cad_lab_generate")
  if (guard.denied) return guard.response
  const user = { id: guard.userId }

  // SECURITY: Rate limit
  const rateLimitResult = await rateLimit("api", `cad-lab-gencad:${user.id}`, {
    limit: 10,
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
  try {
    const body = (await request.json()) as { projectId?: string }
    // SECURITY: Proper UUID v4 format validation
    if (!body.projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.projectId)) {
      return NextResponse.json({ error: "Invalid projectId" }, { status: 400 })
    }
    projectId = body.projectId
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Load project (RLS ensures foundry isolation)
  const { data: project, error: loadError } = await supabase
    .from("cad_lab_projects")
    .select("id, foundry_id, system_illustration_url, unified_result")
    .eq("id", projectId)
    .single()

  if (loadError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const systemIllustrationUrl = (project.system_illustration_url as string | null) ?? null
  if (!systemIllustrationUrl) {
    return NextResponse.json(
      { error: "No hero image found. Run the Design stage first." },
      { status: 400 },
    )
  }

  // GUARD: GenCAD env vars
  if (!process.env.GENCAD_MODAL_URL || !process.env.GENCAD_AUTH_TOKEN) {
    return NextResponse.json(
      { error: "GenCAD endpoint not configured." },
      { status: 500 },
    )
  }

  // SSE setup
  const acceptsSSE = request.headers.get("accept")?.includes("text/event-stream")
  const encoder = new TextEncoder()
  function formatSSE(event: GenerationEvent): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  }

  // AUDIT: Log generation start
  const startTime = Date.now()
  console.info("[CAD-LAB-GENCAD] Generation started:", {
    projectId,
    userId: user.id,
    sse: acceptsSSE,
  })

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: GenerationEvent) => {
        try {
          controller.enqueue(formatSSE(event))
        } catch {
          /* stream closed */
        }
      }

      try {
        // 1. Fetch hero image as base64
        emit({ type: "progress", message: "Fetching hero image..." })
        const imageRes = await fetch(systemIllustrationUrl)
        if (!imageRes.ok) {
          throw new Error(`Failed to fetch hero image: ${imageRes.status}`)
        }
        // SECURITY: Cap image size at 10 MB to prevent OOM
        const contentLength = Number(imageRes.headers.get("content-length") ?? 0)
        if (contentLength > 10 * 1024 * 1024) {
          throw new Error("Hero image exceeds 10 MB size limit")
        }
        const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
        if (imageBuffer.length > 10 * 1024 * 1024) {
          throw new Error("Hero image exceeds 10 MB size limit")
        }
        const imageBase64 = imageBuffer.toString("base64")

        // 2. Call GenCAD Modal endpoint
        emit({ type: "progress", message: "Generating parametric CAD model via GenCAD..." })
        const result = await imageToCADViaGenCAD(imageBase64)

        console.info("[CAD-LAB-GENCAD] GenCAD returned STL:", {
          sizeKb: Math.round(result.stlSizeBytes / 1024),
          timeMs: result.generationTimeMs,
        })

        // 3. Upload STL to Supabase Storage
        emit({ type: "progress", message: "Uploading STL to storage..." })
        const admin = createAdminClient()
        const stlPath = `cad-lab/${projectId}/${UNIFIED_MODULE_ID}/gencad.stl`

        const { error: uploadError } = await admin.storage
          .from(CAD_LAB_STORAGE_BUCKET)
          .upload(stlPath, result.stlBuffer, {
            contentType: "model/stl",
            upsert: true,
          })

        if (uploadError) {
          throw new Error(`STL upload failed: ${uploadError.message}`)
        }

        const { data: publicUrl } = admin.storage
          .from(CAD_LAB_STORAGE_BUCKET)
          .getPublicUrl(stlPath)

        const stlUrl = publicUrl.publicUrl
        const stlSizeKb = Math.round(result.stlBuffer.length / 1024)

        // 4. Update unified_result JSONB with STL URL
        emit({ type: "progress", message: "Saving to project..." })
        const existingResult =
          (project.unified_result as Record<string, unknown> | null) ?? {}

        const updatedResult = {
          ...existingResult,
          stlUrl,
          stlSizeKb,
          stlProvider: "gencad",
          gencadGenerationTimeMs: result.generationTimeMs,
        }

        const { error: saveError } = await supabase
          .from("cad_lab_projects")
          .update({ unified_result: updatedResult as unknown as Json })
          .eq("id", projectId)

        if (saveError) {
          console.warn("[CAD-LAB-GENCAD] DB save failed:", saveError.message)
        }

        // 5. Track AI usage
        await guard.trackUsage({
          model: "gencad-modal",
          promptTokens: 0,
          completionTokens: 0,
          estimatedCostUsd: 0.01, // approximate GPU cost per generation
        }).catch((e) => {
          console.warn("[CAD-LAB-GENCAD] trackUsage failed:", e instanceof Error ? e.message : e)
        })

        const elapsed = Date.now() - startTime
        console.info("[CAD-LAB-GENCAD] Generation complete:", {
          projectId,
          elapsed,
          stlSizeKb,
        })

        // 6. Emit completion
        emit({
          type: "unified_complete",
          result: {
            success: true,
            stlUrl,
            stlSize: stlSizeKb,
            generationTime: result.generationTimeMs,
          },
          code: "", // GenCAD produces STL directly, no CadQuery code
        })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error("[CAD-LAB-GENCAD] Generation failed:", errMsg)
        emit({
          type: "error",
          message: `GenCAD generation failed: ${errMsg}`,
        })
      } finally {
        controller.close()
      }
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

  // Fallback: consume stream and return final JSON
  const reader = stream.getReader()
  let lastEvent: GenerationEvent | null = null
  const decoder = new TextDecoder()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value)
    const lines = text.split("\n").filter((l) => l.startsWith("data: "))
    for (const line of lines) {
      try {
        lastEvent = JSON.parse(line.slice(6)) as GenerationEvent
      } catch {
        /* skip malformed */
      }
    }
  }

  if (lastEvent?.type === "error") {
    return NextResponse.json({ error: lastEvent.message }, { status: 500 })
  }

  return NextResponse.json(lastEvent ?? { error: "No result" })
}

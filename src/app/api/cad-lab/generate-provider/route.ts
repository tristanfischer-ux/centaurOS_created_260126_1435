/**
 * @file generate-provider/route.ts — Single-provider 3D generation endpoint.
 *
 * @description Generates a 3D model from a single provider for A/B comparison.
 * The browser fires N parallel requests (one per provider), each getting its
 * own Vercel 300s budget. Results stream via SSE and populate the comparison
 * grid incrementally.
 *
 * Storage path: cad-lab/{projectId}/__comparison__/{provider}/model.glb
 *
 * @security Requires authenticated user with project access (RLS enforced).
 * @audit Logs generation start/complete with timing per provider.
 */

import { NextResponse } from "next/server"
import { aiGuard } from "@/lib/ai/guard"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/security/rate-limit"
import { imageToMesh } from "@/lib/cad-lab/image-to-3d"
import { imageToMeshViaMeshy } from "@/lib/cad-lab/meshy-client"
import { imageToMeshViaTripo } from "@/lib/cad-lab/tripo-client"
import { imageToMeshViaTrellis } from "@/lib/cad-lab/trellis-client"
import { imageToMeshViaSF3D } from "@/lib/cad-lab/sf3d-client"
import { imageToCADViaGenCAD } from "@/lib/cad-lab/gencad"
import { glbToStl } from "@/lib/cad-lab/mesh-convert"
import type {
  ABProvider,
  ProviderResult,
  GenerationEvent,
  VisualStyleSpec,
} from "@/lib/cad-lab-types"
import type { Json } from "@/types/database.types"

export const runtime = "nodejs"
export const maxDuration = 300 // Each provider gets its own 300s budget

interface GenerateProviderBody {
  projectId?: string
  provider?: ABProvider
}

const CAD_LAB_STORAGE_BUCKET = "xray-images"
const VALID_PROVIDERS: ABProvider[] = ["meshy", "tripo", "trellis", "sf3d", "zoo", "gencad"]
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

// SECURITY: SSRF protection — only allow image fetches from Supabase Storage
const ALLOWED_IMAGE_HOSTS = [
  "jyarhvinengfyrwgtskq.supabase.co",
]

function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return false
    return ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)
  } catch {
    return false
  }
}

// SECURITY: Sanitize error messages — never leak internal details to client
function sanitizeErrorForClient(err: unknown): string {
  if (err instanceof Error) {
    // Strip stack traces, internal URLs, API keys
    const msg = err.message
    if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) return "Provider endpoint unreachable"
    if (msg.includes("401") || msg.includes("403")) return "Provider authentication failed"
    if (msg.includes("429")) return "Provider rate limit exceeded"
    if (msg.includes("timed out") || msg.includes("timeout")) return "Provider timed out"
    if (msg.includes("not configured")) return "Provider is not currently available"
    // Generic — don't leak raw error
    return "Generation failed"
  }
  return "Generation failed"
}

// ─── Storage helper (same pattern as generate-unified) ───────────────

async function uploadComparisonAsset(
  projectId: string,
  provider: ABProvider,
  filename: string,
  mimeType: string,
  buffer: Buffer,
): Promise<{ url: string; sizeKb: number }> {
  const admin = createAdminClient()
  const path = `cad-lab/${projectId}/__comparison__/${provider}/${filename}`

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

// ─── Estimated costs per provider ────────────────────────────────────

const ESTIMATED_COSTS: Record<ABProvider, number> = {
  meshy: 0.30,
  tripo: 0.20,
  trellis: 0.03,
  sf3d: 0.01,
  zoo: 0.10,
  gencad: 0.01,
}

// ─── POST handler ────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // AUTH + AI GATE
  const supabase = await createClient()
  const guard = await aiGuard(supabase, "cad_lab_generate")
  if (guard.denied) return guard.response
  const user = { id: guard.userId }

  // SECURITY: Rate limit — shared budget
  // SECURITY: Tightened rate limit — 20 provider requests/hr = ~3 full comparisons
  const rateLimitResult = await rateLimit("api", `cad-lab-provider:${user.id}`, {
    limit: 20,
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
  let provider: ABProvider
  try {
    const body = (await request.json()) as GenerateProviderBody
    if (!body.projectId || !/^[0-9a-f-]{36}$/.test(body.projectId)) {
      return NextResponse.json({ error: "Invalid projectId" }, { status: 400 })
    }
    if (!body.provider || !VALID_PROVIDERS.includes(body.provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
    }
    projectId = body.projectId
    provider = body.provider
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Load project (RLS ensures foundry isolation)
  const { data: project, error: loadError } = await supabase
    .from("cad_lab_projects")
    .select("id, foundry_id, subject, visual_style, system_illustration_url, provider_results")
    .eq("id", projectId)
    .single()

  if (loadError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const visualStyle = project.visual_style as VisualStyleSpec | null
  const systemIllustrationUrl = project.system_illustration_url as string | null

  // GUARD: Need a hero image for image-to-3D providers
  if (!systemIllustrationUrl && provider !== "zoo") {
    return NextResponse.json(
      { error: "No product illustration available. Re-run the Design stage." },
      { status: 400 },
    )
  }

  // For Zoo, need a text prompt
  if (provider === "zoo" && !visualStyle?.cadGeometryPrompt && !visualStyle?.heroImagePrompt) {
    return NextResponse.json(
      { error: "No design prompt found for Zoo. Re-run the Design stage." },
      { status: 400 },
    )
  }

  // SSE setup
  const encoder = new TextEncoder()
  function formatSSE(event: GenerationEvent): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  }

  const startTime = Date.now()
  console.info(`[PROVIDER-${provider.toUpperCase()}] Generation started:`, {
    projectId,
    userId: user.id,
    provider,
  })

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: GenerationEvent) => {
        try { controller.enqueue(formatSSE(event)) } catch { /* stream closed */ }
      }

      emit({ type: "provider_progress", provider, message: `Starting ${provider} generation...` })

      // GUARD: Check provider is configured before wasting time fetching the image
      const configCheck: Record<ABProvider, () => boolean> = {
        meshy: () => !!process.env.MESHY_API_KEY?.trim(),
        tripo: () => !!process.env.TRIPO_API_KEY?.trim(),
        trellis: () => !!(process.env.TRELLIS_MODAL_URL?.trim() && process.env.TRELLIS_AUTH_TOKEN?.trim()),
        sf3d: () => !!(process.env.SF3D_MODAL_URL?.trim() && process.env.SF3D_AUTH_TOKEN?.trim()),
        zoo: () => !!process.env.ZOO_API_TOKEN?.trim(),
        gencad: () => !!(process.env.GENCAD_MODAL_URL?.trim() && process.env.GENCAD_AUTH_TOKEN?.trim()),
      }
      if (!configCheck[provider]()) {
        emit({ type: "provider_error", provider, error: `${provider} not configured — missing API key or endpoint URL` })
        controller.close()
        return
      }

      try {
        // ── Fetch hero image as base64 (needed by most providers) ──
        let imageBase64 = ""
        if (systemIllustrationUrl) {
          // SECURITY: SSRF protection — only fetch from allowed domains
          if (!isAllowedImageUrl(systemIllustrationUrl)) {
            throw new Error("Image URL not from allowed domain")
          }

          const imageRes = await fetch(systemIllustrationUrl)
          if (!imageRes.ok) throw new Error(`Failed to fetch hero image: ${imageRes.status}`)

          // SECURITY: Reject oversized images to prevent OOM
          const contentLength = parseInt(imageRes.headers.get("content-length") ?? "0", 10)
          if (contentLength > MAX_IMAGE_BYTES) {
            throw new Error(`Image too large (${Math.round(contentLength / 1024 / 1024)}MB)`)
          }

          // SECURITY: Validate Content-Type is actually an image
          const contentType = imageRes.headers.get("content-type") ?? ""
          if (!contentType.startsWith("image/")) {
            throw new Error("URL did not return an image")
          }

          const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
          if (imageBuffer.length > MAX_IMAGE_BYTES) {
            throw new Error(`Image too large (${Math.round(imageBuffer.length / 1024 / 1024)}MB)`)
          }
          imageBase64 = imageBuffer.toString("base64")
        }

        // ── Dispatch to provider ──
        let glbBuffer: Buffer | undefined
        let stlBuffer: Buffer | undefined
        let stepBuffer: Buffer | undefined
        let generationTimeMs: number

        emit({ type: "provider_progress", provider, message: `Generating 3D model via ${provider}...` })

        switch (provider) {
          case "meshy": {
            // INTENT: Meshy needs a public URL, not base64
            const result = await imageToMeshViaMeshy(systemIllustrationUrl!)
            glbBuffer = result.glbBuffer
            generationTimeMs = result.generationTimeMs
            break
          }
          case "tripo": {
            const result = await imageToMeshViaTripo(imageBase64)
            glbBuffer = result.glbBuffer
            generationTimeMs = result.generationTimeMs
            break
          }
          case "trellis": {
            const result = await imageToMeshViaTrellis(imageBase64)
            glbBuffer = result.glbBuffer
            generationTimeMs = result.generationTimeMs
            break
          }
          case "sf3d": {
            const result = await imageToMeshViaSF3D(imageBase64)
            glbBuffer = result.glbBuffer
            generationTimeMs = result.generationTimeMs
            break
          }
          case "zoo": {
            const textPrompt = visualStyle?.cadGeometryPrompt ?? visualStyle?.heroImagePrompt ?? ""
            const result = await imageToMesh(imageBase64, { textPrompt })
            glbBuffer = result.glbBuffer.length > 0 ? result.glbBuffer : undefined
            stlBuffer = result.stlBuffer
            stepBuffer = result.stepBuffer
            generationTimeMs = result.generationTimeMs
            break
          }
          case "gencad": {
            const result = await imageToCADViaGenCAD(imageBase64)
            stlBuffer = result.stlBuffer
            generationTimeMs = result.generationTimeMs
            break
          }
        }

        // ── Convert GLB → STL if needed ──
        if (glbBuffer && !stlBuffer) {
          try {
            emit({ type: "provider_progress", provider, message: "Converting GLB to STL..." })
            stlBuffer = await glbToStl(glbBuffer)
          } catch (err) {
            console.warn(`[PROVIDER-${provider.toUpperCase()}] GLB→STL conversion failed:`, err instanceof Error ? err.message : err)
          }
        }

        // ── Upload assets to Supabase Storage ──
        emit({ type: "provider_progress", provider, message: "Uploading 3D model files..." })

        let glbUrl: string | undefined
        let stlUrl: string | undefined
        let stepUrl: string | undefined
        let glbSizeKb: number | undefined
        let stlSizeKb: number | undefined

        if (glbBuffer) {
          try {
            const uploaded = await uploadComparisonAsset(projectId, provider, "model.glb", "model/gltf-binary", glbBuffer)
            glbUrl = uploaded.url
            glbSizeKb = uploaded.sizeKb
          } catch (err) {
            console.warn(`[PROVIDER-${provider.toUpperCase()}] GLB upload failed:`, err instanceof Error ? err.message : err)
          }
        }

        if (stlBuffer) {
          try {
            const uploaded = await uploadComparisonAsset(projectId, provider, "model.stl", "model/stl", stlBuffer)
            stlUrl = uploaded.url
            stlSizeKb = uploaded.sizeKb
          } catch (err) {
            console.warn(`[PROVIDER-${provider.toUpperCase()}] STL upload failed:`, err instanceof Error ? err.message : err)
          }
        }

        if (stepBuffer) {
          try {
            const uploaded = await uploadComparisonAsset(projectId, provider, "model.step", "application/step", stepBuffer)
            stepUrl = uploaded.url
          } catch (err) {
            console.warn(`[PROVIDER-${provider.toUpperCase()}] STEP upload failed:`, err instanceof Error ? err.message : err)
          }
        }

        // ── Build result ──
        const providerResult: ProviderResult = {
          provider,
          status: "completed",
          glbUrl,
          stlUrl,
          stepUrl,
          generationTimeMs,
          glbSizeKb,
          stlSizeKb,
          estimatedCostUsd: ESTIMATED_COSTS[provider],
          completedAt: new Date().toISOString(),
        }

        // ── Save to provider_results JSONB (atomic merge via RPC — no TOCTOU race) ──
        emit({ type: "provider_progress", provider, message: "Saving result..." })
        try {
          const { error: saveError } = await supabase.rpc("merge_provider_result", {
            p_project_id: projectId,
            p_provider: provider,
            p_result: providerResult as unknown as Json,
          })

          if (saveError) {
            console.warn(`[PROVIDER-${provider.toUpperCase()}] DB save failed:`, saveError.message)
          }
        } catch (err) {
          console.warn(`[PROVIDER-${provider.toUpperCase()}] DB save error:`, err instanceof Error ? err.message : err)
        }

        guard.trackUsage({ model: `provider-${provider}` }).catch(() => {})

        const elapsed = Date.now() - startTime
        console.info(`[PROVIDER-${provider.toUpperCase()}] Complete:`, { projectId, elapsed, glbSizeKb, stlSizeKb })

        emit({ type: "provider_complete", provider, result: providerResult })
        controller.close()
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : "Unknown error"
        const clientMsg = sanitizeErrorForClient(err)
        console.error(`[PROVIDER-${provider.toUpperCase()}] Failed:`, rawMsg)

        // Save failure to provider_results (atomic merge via RPC)
        try {
          const failedResult: ProviderResult = {
            provider,
            status: "failed",
            error: clientMsg, // SECURITY: sanitized for storage/client
            generationTimeMs: Date.now() - startTime,
            estimatedCostUsd: 0,
            completedAt: new Date().toISOString(),
          }

          await supabase.rpc("merge_provider_result", {
            p_project_id: projectId,
            p_provider: provider,
            p_result: failedResult as unknown as Json,
          })
        } catch { /* best-effort */ }

        emit({ type: "provider_error", provider, error: clientMsg })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

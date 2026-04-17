/**
 * @file mashup-generate/route.ts — Mashup CAD generation endpoint.
 *
 * @description Accepts source STEP files (by URL or base64), mashup CadQuery code,
 * calls Modal mashup endpoint, uploads result STEP/STL to Supabase Storage.
 *
 * @security Requires authenticated user. Rate limited. Source URLs must be
 * from allowed origins or already base64-provided.
 * @audit Logs mashup generation start/complete with timing.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/security/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min — match module generation

const CAD_LAB_STORAGE_BUCKET = "xray-images"
const MASHUP_MAX_SOURCES = 5
const MASHUP_MAX_BYTES_PER_SOURCE = 20 * 1024 * 1024 // 20 MB

/** Request body: sources with step_url (fetched) or step_b64 */
interface MashupSource {
  name: string
  step_url?: string
  step_b64?: string
}

interface MashupGenerateBody {
  sources: MashupSource[]
  mashup_code: string
  mashup_project_id?: string
  material_density?: number
}

interface MashupSuccess {
  done: true
  step_url: string
  stl_url: string
  step_b64?: string
  stl_b64?: string
  svg_iso?: string
  analysis?: unknown
  elapsedMs: number
}

interface MashupError {
  error: string
}

async function uploadCadAsset(
  pathPrefix: string,
  filename: string,
  mimeType: string,
  base64Data: string,
): Promise<{ url: string; sizeKb: number }> {
  const admin = createAdminClient()
  const buffer = Buffer.from(base64Data, "base64")
  const path = `${pathPrefix}/${filename}`

  const { error } = await admin.storage
    .from(CAD_LAB_STORAGE_BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: true })

  if (error) throw new Error(`Failed to upload ${filename}: ${error.message}`)

  // SECURITY: confidential mashup output — signed URL (see generate-module/route.ts).
  const { data: signed, error: signErr } = await admin.storage
    .from(CAD_LAB_STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7)
  if (signErr || !signed?.signedUrl) {
    throw new Error(`Failed to sign URL for ${filename}: ${signErr?.message ?? "unknown"}`)
  }

  return {
    url: signed.signedUrl,
    sizeKb: Math.round(buffer.length / 1024),
  }
}

/**
 * Fetches STEP file from a URL and returns base64.
 * Only allows Supabase storage and same-origin URLs for security.
 */
async function fetchStepAsBase64(url: string): Promise<string> {
  const parsed = new URL(url)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
  const storageHost = "supabase.co"
  const hostAllowed =
    parsed.hostname === supabaseHost ||
    parsed.hostname.endsWith(".supabase.co") ||
    parsed.hostname === storageHost
  if (!hostAllowed) {
    throw new Error(`Source URL host not allowed: ${parsed.hostname}`)
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Failed to fetch source: ${res.status}`)

  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MASHUP_MAX_BYTES_PER_SOURCE) {
    throw new Error(
      `Source exceeds ${MASHUP_MAX_BYTES_PER_SOURCE / (1024 * 1024)} MB limit`,
    )
  }
  return buf.toString("base64")
}

/**
 * POST /api/cad-lab/mashup-generate
 * Body: { sources: [{ name, step_url? | step_b64? }], mashup_code, mashup_project_id?, material_density? }
 */
export async function POST(
  request: Request,
): Promise<NextResponse<MashupSuccess | MashupError>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rateLimitResult = await rateLimit("api", `cad-lab-mashup:${user.id}`, {
    limit: 20,
    window: 60 * 60 * 1000,
  })
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before generating more mashups." },
      { status: 429 },
    )
  }

  let body: MashupGenerateBody
  try {
    body = (await request.json()) as MashupGenerateBody
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { sources = [], mashup_code = "", mashup_project_id, material_density = 1240 } = body

  if (!mashup_code.trim()) {
    return NextResponse.json({ error: "mashup_code is required" }, { status: 400 })
  }
  if (!Array.isArray(sources) || sources.length === 0) {
    return NextResponse.json({ error: "At least one source is required" }, { status: 400 })
  }
  if (sources.length > MASHUP_MAX_SOURCES) {
    return NextResponse.json(
      { error: `Maximum ${MASHUP_MAX_SOURCES} sources allowed` },
      { status: 400 },
    )
  }

  const startTime = Date.now()

  // Build payload for Modal: each source must have name + step_b64
  const modalSources: { name: string; step_b64: string }[] = []
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]
    const name = (s?.name ?? `source_${i}`).trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || `source_${i}`
    let step_b64: string
    if (s?.step_b64) {
      step_b64 = s.step_b64
    } else if (s?.step_url) {
      try {
        step_b64 = await fetchStepAsBase64(s.step_url)
      } catch (err) {
        return NextResponse.json(
          {
            error: `Failed to fetch source "${name}": ${err instanceof Error ? err.message : "Unknown error"}`,
          },
          { status: 400 },
        )
      }
    } else {
      return NextResponse.json(
        { error: `Source "${name}" must have step_url or step_b64` },
        { status: 400 },
      )
    }
    const decodedLen = Math.ceil((step_b64.length * 3) / 4)
    if (decodedLen > MASHUP_MAX_BYTES_PER_SOURCE) {
      return NextResponse.json(
        { error: `Source "${name}" exceeds 20 MB limit` },
        { status: 400 },
      )
    }
    modalSources.push({ name, step_b64 })
  }

  const baseUrl = process.env.MODAL_CAD_ENDPOINT_URL?.replace(/\/$/, "")
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Mashup generation not configured (MODAL_CAD_ENDPOINT_URL)" },
      { status: 503 },
    )
  }

  console.info("[CAD-LAB-MASHUP] Generation started:", {
    userId: user.id,
    sourceCount: modalSources.length,
  })

  let modalResponse: {
    error?: string | null
    step?: string | null
    stl?: string | null
    svg_iso?: string | null
    analysis?: unknown
  }

  try {
    const response = await fetch(`${baseUrl}/mashup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources: modalSources,
        mashup_code,
        module_id: mashup_project_id ?? "mashup",
        material_density,
      }),
      signal: AbortSignal.timeout(600_000),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Modal mashup error (${response.status}): ${errText.slice(0, 300)}`)
    }

    modalResponse = (await response.json()) as typeof modalResponse
  } catch (err) {
    console.error("[CAD-LAB-MASHUP] Modal request failed:", err instanceof Error ? err.message : err)
    return NextResponse.json(
      {
        error: `Mashup generation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 502 },
    )
  }

  if (modalResponse.error) {
    return NextResponse.json(
      { error: modalResponse.error },
      { status: 500 },
    )
  }

  const pathPrefix = mashup_project_id
    ? `cad-lab/mashup/${mashup_project_id}`
    : `cad-lab/mashup/${user.id}/${startTime}`

  let stepUrl = ""
  let stlUrl = ""

  if (modalResponse.step) {
    try {
      const up = await uploadCadAsset(
        pathPrefix,
        "mashup.step",
        "application/step",
        modalResponse.step,
      )
      stepUrl = up.url
    } catch (e) {
      console.warn("[CAD-LAB-MASHUP] STEP upload failed:", e)
    }
  }
  if (modalResponse.stl) {
    try {
      const up = await uploadCadAsset(
        pathPrefix,
        "mashup.stl",
        "model/stl",
        modalResponse.stl,
      )
      stlUrl = up.url
    } catch (e) {
      console.warn("[CAD-LAB-MASHUP] STL upload failed:", e)
    }
  }

  const elapsedMs = Date.now() - startTime
  console.info("[CAD-LAB-MASHUP] Generation complete:", { elapsedMs })

  return NextResponse.json({
    done: true,
    step_url: stepUrl,
    stl_url: stlUrl,
    step_b64: modalResponse.step ?? undefined,
    stl_b64: modalResponse.stl ?? undefined,
    svg_iso: modalResponse.svg_iso ?? undefined,
    analysis: modalResponse.analysis ?? undefined,
    elapsedMs,
  })
}

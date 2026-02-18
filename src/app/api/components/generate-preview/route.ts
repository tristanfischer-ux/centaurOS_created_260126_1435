/**
 * @file generate-preview/route.ts — Generate 3D preview (STL + SVG thumbnail) for a catalogue component.
 *
 * @description Loads the component's geometry type and params, runs CadQuery via Modal,
 * uploads the SVG thumbnail to storage, updates component_catalogue.thumbnail_url,
 * and returns STL data for the client to display in the STL viewer.
 *
 * @security Requires authenticated user. Rate limited. Uses admin client for storage + DB update.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/security/rate-limit"

const CAD_STORAGE_BUCKET = "xray-images"
const MODAL_TIMEOUT_MS = 120_000

interface GeneratePreviewBody {
  componentId?: string
}

interface GeneratePreviewSuccess {
  stlData: string
  svgUrl: string
}

/** Build executable CadQuery code from geometry type code and params. */
function buildComponentCode(
  cadqueryCode: string,
  geometryParams: Record<string, unknown>,
  slug: string,
): string {
  const paramsJson = JSON.stringify(geometryParams)
  const funcName = slug.replace(/-/g, "_")
  const preamble = "import cadquery as cq\nimport math\n"
  return `${preamble}${cadqueryCode}\nparams = ${paramsJson}\nresult = ${funcName}(params)\n`
}

export async function POST(
  request: Request,
): Promise<NextResponse<GeneratePreviewSuccess | { error: string }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rateLimitResult = await rateLimit("api", `component-preview:${user.id}`, {
    limit: 20,
    window: 60 * 60 * 1000,
  })
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 },
    )
  }

  let componentId: string
  try {
    const body = (await request.json()) as GeneratePreviewBody
    if (!body.componentId || !/^[0-9a-f-]{36}$/i.test(body.componentId)) {
      return NextResponse.json({ error: "Invalid componentId" }, { status: 400 })
    }
    componentId = body.componentId
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { data: component, error: compError } = await supabase
    .from("component_catalogue")
    .select("id, geometry_type_slug, geometry_params")
    .eq("id", componentId)
    .single()

  if (compError || !component) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 })
  }

  const slug = component.geometry_type_slug as string
  const geometryParams = (component.geometry_params as Record<string, unknown>) ?? {}

  const { data: geometryType, error: geomError } = await supabase
    .from("component_geometry_types")
    .select("cadquery_code")
    .eq("slug", slug)
    .single()

  if (geomError || !geometryType?.cadquery_code) {
    return NextResponse.json(
      { error: "Geometry type not found or has no code" },
      { status: 404 },
    )
  }

  const code = buildComponentCode(
    geometryType.cadquery_code as string,
    geometryParams,
    slug,
  )

  const endpointUrl = process.env.MODAL_CAD_ENDPOINT_URL
  if (!endpointUrl) {
    console.error("[component-preview] MODAL_CAD_ENDPOINT_URL not set")
    return NextResponse.json(
      { error: "Preview service not configured" },
      { status: 503 },
    )
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MODAL_TIMEOUT_MS)

  let modalResult: {
    error?: string | null
    stl?: string | null
    svg_iso?: string | null
  }
  try {
    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        module_id: `component-preview-${componentId}`,
        material_density: 1240,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!res.ok) {
      const errText = await res.text()
      console.error("[component-preview] Modal error:", res.status, errText.slice(0, 300))
      return NextResponse.json(
        { error: "Preview generation failed" },
        { status: 502 },
      )
    }
    modalResult = (await res.json()) as typeof modalResult
  } catch (e) {
    clearTimeout(timeoutId)
    const message = e instanceof Error ? e.message : "Unknown error"
    console.error("[component-preview] Modal request failed:", message)
    return NextResponse.json(
      { error: "Preview generation failed" },
      { status: 502 },
    )
  }

  if (modalResult.error || !modalResult.stl) {
    return NextResponse.json(
      { error: modalResult.error ?? "No STL produced" },
      { status: 422 },
    )
  }

  const admin = createAdminClient()
  let svgUrl: string

  if (modalResult.svg_iso) {
    const path = `components/${componentId}/thumbnail.svg`
    const svgBuffer = Buffer.from(modalResult.svg_iso, "base64")
    const { error: uploadError } = await admin.storage
      .from(CAD_STORAGE_BUCKET)
      .upload(path, svgBuffer, {
        contentType: "image/svg+xml",
        upsert: true,
      })
    if (uploadError) {
      console.error("[component-preview] Upload SVG failed:", uploadError.message)
    }
    const { data: urlData } = admin.storage
      .from(CAD_STORAGE_BUCKET)
      .getPublicUrl(path)
    svgUrl = urlData.publicUrl

    const { error: updateError } = await admin
      .from("component_catalogue")
      .update({ thumbnail_url: svgUrl, updated_at: new Date().toISOString() })
      .eq("id", componentId)
    if (updateError) {
      console.error("[component-preview] Update thumbnail_url failed:", updateError.message)
    }
  } else {
    const { data: existing } = await supabase
      .from("component_catalogue")
      .select("thumbnail_url")
      .eq("id", componentId)
      .single()
    svgUrl = (existing?.thumbnail_url as string) ?? ""
  }

  return NextResponse.json({
    stlData: modalResult.stl,
    svgUrl,
  })
}

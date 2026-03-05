/**
 * @file generate-unified/route.ts — Unified CAD model generation endpoint.
 *
 * @description Generates a single CadQuery model for the entire product assembly.
 * Builds an enriched prompt from all module data, diagnostic answers, interface
 * contracts, and connection maps. Uploads assets to Supabase Storage, persists
 * unified_result + unified_code to the project row, and records generation metrics.
 *
 * Streams SSE events for real-time progress feedback.
 *
 * @security Requires authenticated user with project access (RLS enforced).
 * @audit Logs generation start/complete with timing.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateCadLabInterface, generateCadLabModelSmart } from "@/actions/cad-lab"
import { rateLimit } from "@/lib/security/rate-limit"
import { categorizeModalError } from "@/lib/cad-lab/code-validators"
import { detectDomainFromResearchReport } from "@/lib/cad-lab/domain-prompts"
import { imageToMesh } from "@/lib/cad-lab/image-to-3d"
import { glbToStl } from "@/lib/cad-lab/mesh-convert"
import { refitSvgViewBox } from "@/lib/cad-lab/svg-refit"
import type {
  CadLabModule,
  CadLabResult,
  ClaudeModelId,
  CadLabDesignBrief,
  GenerationEvent,
  InterfaceContract,
  InterfaceContractResult,
  ModuleConnection,
} from "@/lib/cad-lab-types"
import type { Json } from "@/types/database.types"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min — interface + codegen + Modal + upload

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

// ─── Enriched prompt builder ─────────────────────────────────────────

// DECISION: Hero-image-first prompt — the heroImagePrompt (300-500 word Opus
// geometric description) is THE primary input for generating a single cohesive
// product model. Modules are omitted from the prompt; only aggregate
// manufacturing context (unique processes + materials) is included.
function buildEnrichedDescription(
  subject: string,
  productOverview: string,
  _designBrief: CadLabDesignBrief | undefined,
  _modules: CadLabModule[],
  _diagnosticAnswers: Record<string, Record<string, string>>,
  _connections: ModuleConnection[],
  _contracts: InterfaceContract[],
  heroImagePrompt: string | null,
): string {
  const lines: string[] = []

  // ── 1. Product identity ──
  lines.push(`# PRODUCT: ${subject}`, "")
  if (productOverview) lines.push(productOverview, "")

  // ── 2. Visual geometry reference (PRIMARY — Opus-crafted description) ──
  if (heroImagePrompt) {
    lines.push("## Shape to Model (PRIMARY)")
    lines.push("This is THE shape you must replicate in CadQuery. Match every proportion, feature, and spatial relationship:")
    lines.push(heroImagePrompt, "")
  }

  return lines.join("\n")
}

// ─── Synthesize interface definition from module data ─────────────────

function synthesizeInterface(
  modules: CadLabModule[],
  connections: ModuleConnection[],
  contracts: InterfaceContract[],
  diagnosticAnswers: Record<string, Record<string, string>>,
): string | null {
  // INTENT: If ≥50% of modules already have interfaceDefinition from prior step,
  // we can synthesize a unified interface deterministically without another Claude call.
  const withInterface = modules.filter(m => m.interfaceDefinition)
  if (withInterface.length < Math.ceil(modules.length / 2)) return null

  const lines: string[] = []
  lines.push("# UNIFIED INTERFACE DEFINITION", "")

  // Per-module Component Placement Tables
  for (const mod of modules) {
    if (!mod.interfaceDefinition) continue
    lines.push(`## ${mod.name}`)
    lines.push(mod.interfaceDefinition)
    lines.push("")
  }

  // Diagnostic spec table
  lines.push("## Manufacturing Specifications")
  lines.push("| Module | Process | Material | Tolerance | Finish |")
  lines.push("|--------|---------|----------|-----------|--------|")
  for (const mod of modules) {
    const diag = diagnosticAnswers[mod.id] ?? {}
    lines.push(`| ${mod.name} | ${diag.mfg_process ?? "—"} | ${diag.material ?? "—"} | ${diag.tolerance ?? "—"} | ${diag.finish ?? "—"} |`)
  }
  lines.push("")

  // Connection map
  if (connections.length > 0) {
    const nameMap = new Map(modules.map(m => [m.id, m.name]))
    lines.push("## Connection Map")
    for (const conn of connections) {
      const fromName = nameMap.get(conn.from) ?? conn.from
      const toName = nameMap.get(conn.to) ?? conn.to
      lines.push(`- ${fromName}.${conn.output} → ${toName}.${conn.input}`)
    }
    lines.push("")
  }

  // Interface contracts
  if (contracts.length > 0) {
    const nameMap = new Map(modules.map(m => [m.id, m.name]))
    lines.push("## Interface Contracts")
    lines.push("| Source | Port | Target | Port | Type | Spec |")
    lines.push("|--------|------|--------|------|------|------|")
    for (const c of contracts) {
      const srcName = nameMap.get(c.sourceModuleId) ?? c.sourceModuleId
      const tgtName = nameMap.get(c.targetModuleId) ?? c.targetModuleId
      lines.push(`| ${srcName} | ${c.sourcePort} | ${tgtName} | ${c.targetPort} | ${c.portType} | ${c.sourceSpec ?? ""} |`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

// ─── POST handler ────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // AUTH: Verify user session
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
    .select("id, foundry_id, created_by, subject, model_id, modules, research, product_overview, diagnostic_answers, decomposition_connections, interface_contracts, visual_style, system_illustration_url")
    .eq("id", projectId)
    .single()

  if (loadError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const allModules = (project.modules as CadLabModule[] | null) ?? []
  if (allModules.length === 0) {
    return NextResponse.json({ error: "No modules to generate — decompose first" }, { status: 400 })
  }

  const modelIdVal = (project.model_id || "claude-opus-4-6") as ClaudeModelId
  const researchData = project.research as { report?: string; designBrief?: CadLabDesignBrief } | null
  const researchReport = researchData?.report ?? ""
  const designBrief = researchData?.designBrief
  const productOverview = (project.product_overview as string | null) ?? ""
  const diagnosticAnswers = (project.diagnostic_answers as Record<string, Record<string, string>> | null) ?? {}
  const connections = (project.decomposition_connections as ModuleConnection[] | null) ?? []
  const contractResult = (project.interface_contracts as InterfaceContractResult | null)
  const contracts = contractResult?.contracts ?? []
  const visualStyleData = project.visual_style as { heroImagePrompt?: string; cadGeometryPrompt?: string } | null
  const heroImagePrompt = visualStyleData?.heroImagePrompt ?? null
  const cadGeometryPrompt = visualStyleData?.cadGeometryPrompt ?? null
  const systemIllustrationUrl = (project.system_illustration_url as string | null) ?? null

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

      // ── Step 1: Build enriched description ──
      emit({ type: "progress", message: "Building enriched product description..." })

      const enrichedDescription = buildEnrichedDescription(
        project.subject,
        productOverview,
        designBrief,
        allModules,
        diagnosticAnswers,
        connections,
        contracts,
        heroImagePrompt,
      )

      // ── Step 2: Interface / geometry specification ──
      // DECISION: When heroImagePrompt exists, it IS the geometry spec — skip the
      // expensive interface synthesis/generation step entirely. The hero prompt is
      // a better spatial specification than a component placement table for a
      // single-product model. Fallback: older projects without heroImagePrompt
      // still use the module-based interface path.
      emit({ type: "status", step: "interface" })

      let interfaceDefinition: string | null = null
      let templateMatchResult: import("@/actions/step-template-matching").TemplateMatchResult | undefined

      if (heroImagePrompt) {
        // DECISION: heroImagePrompt already appears in enrichedDescription (via buildEnrichedDescription).
        // Passing it again as interfaceDefinition duplicates 300-500 words, drowning the image signal.
        // Instead, use a short cross-reference so the model knows geometry is in the product section.
        interfaceDefinition = "Match the product image. Key geometric features are described in the product section above."
        emit({ type: "progress", message: "Using product description as geometry specification" })
      } else {
        // Fallback: synthesize or generate interface from modules
        emit({ type: "progress", message: "Synthesizing interface definitions..." })
        interfaceDefinition = synthesizeInterface(allModules, connections, contracts, diagnosticAnswers)

        if (!interfaceDefinition) {
          emit({ type: "progress", message: "Generating interface definition with Claude..." })
          try {
            const res = await generateCadLabInterface(
              enrichedDescription,
              researchReport,
              modelIdVal,
            )
            if (res.success) {
              interfaceDefinition = res.interfaceDefinition
              templateMatchResult = res.templateMatchResult
              emit({ type: "progress", message: "Interface definition complete" })
            } else {
              emit({ type: "error", message: res.error || "Interface generation failed" })
              controller.close()
              return
            }
          } catch (err) {
            emit({ type: "error", message: `Interface error: ${err instanceof Error ? err.message : "Unknown error"}` })
            controller.close()
            return
          }
        } else {
          emit({ type: "progress", message: "Interface synthesized from existing module definitions" })
        }
      }

      // ── IMAGE-TO-3D PATH ──────────────────────────────────────────────
      // DECISION: When a hero image exists, use purpose-built image-to-3D AI
      // models instead of CadQuery code generation. LLMs cannot reliably convert
      // 2D images into accurate 3D geometry code — purpose-built models can.
      // The existing STLViewer + orthographic renderer handle everything downstream.
      if (systemIllustrationUrl) {
        const useZoo = !!heroImagePrompt && !!process.env.ZOO_API_TOKEN
        emit({ type: "progress", message: useZoo
          ? "Generating parametric CAD model from description (Zoo.dev)..."
          : "Converting product image to 3D model..." })

        try {
          // 1. Fetch hero image as base64
          const imageRes = await fetch(systemIllustrationUrl)
          if (!imageRes.ok) throw new Error(`Failed to fetch hero image: ${imageRes.status}`)
          const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
          const imageBase64 = imageBuffer.toString("base64")

          // 2. Call image-to-3D API
          // DECISION: Zoo text-to-CAD is primary when heroImagePrompt exists.
          // It outputs native parametric STEP files (B-Rep surfaces, editable in any CAD program).
          // Tripo/Meshy remain as fallbacks for mesh-only GLB.
          emit({ type: "status", step: "modal" })

          // INTENT: Provide a temp image upload helper for Meshy (which requires a URL).
          // Uploads to Supabase temp path so Meshy can fetch it.
          const uploadTempImage = async (b64: string): Promise<string> => {
            const uploaded = await uploadCadAsset(
              projectId,
              UNIFIED_MODULE_ID,
              "temp-hero.png",
              "image/png",
              b64,
            )
            return uploaded.url
          }

          // DECISION: Prefer cadGeometryPrompt (optimized for parametric CAD) over
          // heroImagePrompt (optimized for image generation with rendering noise).
          const textPrompt = cadGeometryPrompt ?? heroImagePrompt ?? undefined
          const mesh = await imageToMesh(imageBase64, {
            uploadTempImage,
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

          // 5. STEP handling — Zoo returns native STEP; others need Modal conversion
          if (mesh.stepBuffer) {
            // DECISION: Zoo's native STEP is parametric B-Rep — upload directly, no conversion needed.
            try {
              const stepBase64 = mesh.stepBuffer.toString("base64")
              const uploaded = await uploadCadAsset(projectId, UNIFIED_MODULE_ID, "unified.step", "application/step", stepBase64)
              stepUrl = uploaded.url
              console.info(`[CAD-LAB-UNIFIED] Native STEP uploaded: ${Math.round(mesh.stepBuffer.length / 1024)}kb`)
            } catch (err) {
              console.warn("[CAD-LAB-UNIFIED] STEP upload failed:", err instanceof Error ? err.message : err)
            }
          } else {
            // Fallback: mesh → STEP conversion via Modal (lossy)
            const modalUrl = process.env.MODAL_CAD_ENDPOINT_URL
            if (modalUrl) {
              try {
                const stepRes = await fetch(`${modalUrl}/convert-step`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ stl_base64: stlBase64 }),
                })
                if (stepRes.ok) {
                  const stepData = (await stepRes.json()) as { step_base64?: string }
                  if (stepData.step_base64) {
                    const uploaded = await uploadCadAsset(projectId, UNIFIED_MODULE_ID, "unified.step", "application/step", stepData.step_base64)
                    stepUrl = uploaded.url
                  }
                }
              } catch {
                // STEP conversion is best-effort — mesh-to-STEP is inherently lossy
              }
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
          // INTENT: If image-to-3D fails, fall through to CadQuery path as last resort
          console.warn("[CAD-LAB-UNIFIED] Image-to-3D failed, falling back to CadQuery:", err instanceof Error ? err.message : err)
          emit({ type: "progress", message: "Image-to-3D failed, falling back to CadQuery code generation..." })
        }
      }

      // ── CADQUERY PATH (original — for non-image projects or image-to-3D fallback) ──

      // ── Step 3: CAD code generation + Modal execution ──
      emit({ type: "status", step: "codegen" })
      emit({ type: "progress", message: "Generating CadQuery code..." })

      let cadResult: CadLabResult | undefined
      try {
        emit({ type: "status", step: "modal" })
        emit({ type: "progress", message: "Executing CAD model on Modal..." })

        const res = await generateCadLabModelSmart(
          enrichedDescription,
          researchReport,
          interfaceDefinition,
          modelIdVal,
          undefined, // checkpointContext
          templateMatchResult,
          designBrief,
          detectedDomain as import("@/lib/cad-lab/domain-prompts").CadLabDomain | undefined,
          systemIllustrationUrl ?? undefined, // blueprintImageUrl — hero image for visual reference
        )
        cadResult = res

        if (!res.success) {
          // Record failed metrics
          recordGenerationMetrics(projectId, UNIFIED_MODULE_ID, false, res, {
            hasDesignBrief: !!designBrief,
            domain: detectedDomain,
          }).catch(() => {})
          emit({ type: "error", message: res.error || "CAD generation failed" })
          controller.close()
          return
        }

        if (!res.code) {
          emit({ type: "error", message: "Generation succeeded but produced no code" })
          controller.close()
          return
        }

        emit({ type: "progress", message: "CAD model generated successfully" })
      } catch (err) {
        emit({ type: "error", message: `CAD generation error: ${err instanceof Error ? err.message : "Unknown error"}` })
        controller.close()
        return
      }

      // ── Step 4: Upload assets to Supabase Storage ──
      emit({ type: "status", step: "upload" })
      emit({ type: "progress", message: "Uploading STEP + STL files..." })

      const { stlData, stepData, ...resultWithoutBinary } = cadResult

      let stepUrl: string | undefined
      let stlUrl: string | undefined

      if (stepData) {
        try {
          const uploaded = await uploadCadAsset(projectId, UNIFIED_MODULE_ID, "unified.step", "application/step", stepData)
          stepUrl = uploaded.url
        } catch (err) {
          console.warn("[CAD-LAB-UNIFIED] STEP upload failed:", err instanceof Error ? err.message : err)
        }
      }

      if (stlData) {
        try {
          const uploaded = await uploadCadAsset(projectId, UNIFIED_MODULE_ID, "unified.stl", "model/stl", stlData)
          stlUrl = uploaded.url
        } catch (err) {
          console.warn("[CAD-LAB-UNIFIED] STL upload failed:", err instanceof Error ? err.message : err)
        }
      }

      // Upload SVG views
      emit({ type: "progress", message: "Uploading SVG views..." })
      const svgViewMap: Record<string, string | undefined> = {
        iso: cadResult.svgIso,
        top: cadResult.svgTop,
        front: cadResult.svgFront,
        back: cadResult.svgBack,
        right: cadResult.svgRight,
        left: cadResult.svgLeft,
        exploded: cadResult.svgExploded,
      }
      const svgUrls: Record<string, string> = {}
      await Promise.all(
        Object.entries(svgViewMap).map(async ([viewName, dataUri]) => {
          if (!dataUri) return
          try {
            const rawBase64 = dataUri.replace(/^data:image\/svg\+xml;base64,/, "")
            const base64Data = refitSvgViewBox(rawBase64)
            const uploaded = await uploadCadAsset(
              projectId,
              UNIFIED_MODULE_ID,
              `unified-${viewName}.svg`,
              "image/svg+xml",
              base64Data,
            )
            svgUrls[viewName] = uploaded.url
          } catch (svgErr) {
            console.warn(`[CAD-LAB-UNIFIED] SVG ${viewName} upload failed:`, svgErr instanceof Error ? svgErr.message : svgErr)
          }
        }),
      )

      // Build final result with persistent URLs
      const finalResult: Omit<CadLabResult, "stlData" | "stepData"> = {
        ...resultWithoutBinary,
        stepUrl: stepUrl ?? resultWithoutBinary.stepUrl,
        stlUrl: stlUrl ?? resultWithoutBinary.stlUrl,
      }

      // ── Step 5: Persist to database ──
      emit({ type: "progress", message: "Saving to database..." })

      try {
        const { error: saveError } = await supabase
          .from("cad_lab_projects")
          .update({
            unified_result: finalResult as unknown as Json,
            unified_code: cadResult.code ?? null,
          })
          .eq("id", projectId)

        if (saveError) {
          console.warn("[CAD-LAB-UNIFIED] DB save failed:", saveError.message)
        }
      } catch (err) {
        console.warn("[CAD-LAB-UNIFIED] DB save error:", err instanceof Error ? err.message : err)
      }

      // ── Step 6: Record metrics (fire-and-forget) ──
      recordGenerationMetrics(projectId, UNIFIED_MODULE_ID, true, cadResult, {
        hasDesignBrief: !!designBrief,
        domain: detectedDomain,
      }).catch(() => {})

      const elapsedMs = Date.now() - startTime
      console.info("[CAD-LAB-UNIFIED] Generation complete:", { projectId, elapsedMs })

      // ── Final event ──
      // INTENT: Include stlData in SSE so client can render the 3D viewer immediately
      // (stlData is stripped from the DB-persisted finalResult to avoid storing huge blobs in JSON)
      emit({
        type: "unified_complete",
        result: stlData
          ? { ...finalResult, stlData } as Omit<CadLabResult, "stepData">
          : finalResult,
        code: cadResult.code ?? "",
      })
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
  const errorCat = !success && res.error
    ? categorizeModalError(res.error)
    : null

  const preExec = res.preExecValidation ?? []
  const criticalCount = preExec.filter((r) => r.severity === "critical").length
  const warningCount = preExec.filter((r) => r.severity === "warning").length

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
      error_category: errorCat?.category ?? null,
      modal_error_snippet: !success && res.error ? res.error.slice(0, 500) : null,
      pre_exec_critical_count: criticalCount || null,
      pre_exec_warning_count: warningCount || null,
      has_design_brief: enrichment?.hasDesignBrief ?? null,
      domain: enrichment?.domain ?? null,
      quality_failure: res.visionScore != null && res.visionScore < 5 ? true : null,
    })
  if (error) {
    console.warn("[CAD-LAB-UNIFIED] Metrics insert failed:", error.message)
  }
}

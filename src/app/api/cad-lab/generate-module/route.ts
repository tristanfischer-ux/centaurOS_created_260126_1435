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
import { generateCadLabInterface, generateCadLabModel } from "@/actions/cad-lab"
import type { CadLabModule, ClaudeModelId } from "@/lib/cad-lab-types"
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
export async function POST(request: Request): Promise<NextResponse<GenerateModuleSuccess | GenerateModuleError>> {
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
    .select("id, foundry_id, created_by, subject, model_id, modules, research")
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

  const modelIdVal = (project.model_id || "claude-opus-4-6") as ClaudeModelId
  const researchReport = (project.research as { report?: string } | null)?.report ?? ""

  // AUDIT: Log module generation start
  const startTime = Date.now()
  console.info("[CAD-LAB-MODULE] Generation started:", {
    projectId,
    moduleId,
    moduleName: targetModule.name,
    userId: user.id,
  })

  let localMod = { ...targetModule }

  const moduleResearchText =
    localMod.moduleResearch ||
    `Module: ${localMod.name}\nPurpose: ${localMod.purpose}\nKey Parts: ${localMod.keyParts.join(", ")}\nDescription: ${localMod.description}\n\nFrom parent research:\n${researchReport}`

  // ── Interface step (if needed) ──
  if (localMod.status === "pending") {
    try {
      const res = await generateCadLabInterface(
        `${localMod.name} — ${localMod.purpose}`,
        moduleResearchText,
        modelIdVal,
      )
      if (res.success) {
        localMod = {
          ...localMod,
          interfaceDefinition: res.interfaceDefinition,
          status: "interface_ready" as const,
        }
        // Save intermediate state so polling clients can see progress
        await saveModuleToProject(supabase, projectId, allModules, localMod)
      } else {
        console.error("[CAD-LAB-MODULE] Interface failed:", localMod.name)
        return NextResponse.json(
          { error: `Interface generation failed for ${localMod.name}`, moduleId },
          { status: 500 },
        )
      }
    } catch (err) {
      console.error("[CAD-LAB-MODULE] Interface error:", localMod.name, err instanceof Error ? err.message : err)
      return NextResponse.json(
        { error: `Interface error: ${err instanceof Error ? err.message : "Unknown error"}`, moduleId },
        { status: 500 },
      )
    }
  }

  // ── CAD generation step ──
  try {
    const cadResearch =
      localMod.moduleResearch ||
      `Module: ${localMod.name}\nPurpose: ${localMod.purpose}\nKey Parts: ${localMod.keyParts.join(", ")}\nDescription: ${localMod.description}\n\nFrom parent research:\n${researchReport}`

    const res = await generateCadLabModel(
      `${localMod.name} — ${localMod.purpose}`,
      cadResearch,
      localMod.interfaceDefinition || "",
      modelIdVal,
    )
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
    return NextResponse.json(
      { error: `CAD generation error: ${err instanceof Error ? err.message : "Unknown error"}`, moduleId },
      { status: 500 },
    )
  }

  // ── Persist completed module ──
  await saveModuleToProject(supabase, projectId, allModules, localMod)

  const elapsedMs = Date.now() - startTime

  // AUDIT: Log module generation complete
  console.info("[CAD-LAB-MODULE] Generation complete:", {
    projectId,
    moduleId,
    moduleName: localMod.name,
    elapsedMs,
  })

  return NextResponse.json({
    done: true,
    moduleId,
    module: localMod,
    elapsedMs,
  })
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

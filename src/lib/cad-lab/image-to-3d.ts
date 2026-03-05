/**
 * @file image-to-3d.ts — Image-to-3D mesh generation via external APIs.
 *
 * @description Converts a 2D product image (hero illustration) into a 3D GLB mesh
 * using purpose-built image-to-3D AI models. Three providers are supported with
 * automatic fallback: Tripo3D → Meshy.ai → self-hosted TripoSR (Phase 2).
 *
 * This replaces the CadQuery code-generation path for image-based projects,
 * producing significantly more accurate geometry from product images.
 *
 * @security API keys read from environment variables only.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type ImageTo3DProvider = "zoo" | "tripo" | "meshy" | "self-hosted"

export interface ImageTo3DResult {
  /** GLB binary as a Buffer */
  glbBuffer: Buffer
  /** STL binary if the provider returns it directly (e.g. self-hosted TripoSR) */
  stlBuffer?: Buffer
  /** STEP binary if the provider returns native parametric CAD (e.g. Zoo text-to-CAD) */
  stepBuffer?: Buffer
  /** Which provider produced this mesh */
  provider: ImageTo3DProvider
  /** Total generation time in ms (including polling) */
  generationTimeMs: number
}

export interface ImageTo3DOptions {
  /** Force a specific provider instead of the fallback chain */
  preferredProvider?: ImageTo3DProvider
  /** Supabase upload helper for Meshy (which requires a URL, not base64) */
  uploadTempImage?: (base64: string) => Promise<string>
  /** Text prompt for text-to-CAD providers (Zoo). When provided, Zoo is tried first. */
  textPrompt?: string
}

// ─── Main entry point ────────────────────────────────────────────────

/**
 * Convert a product image to a 3D mesh via the fallback chain.
 *
 * @param imageBase64 - Base64-encoded PNG/JPEG image (no data URI prefix)
 * @param options - Optional provider preference and helpers
 * @returns GLB buffer + metadata
 * @throws Error if all providers fail or no API keys are configured
 */
export async function imageToMesh(
  imageBase64: string,
  options?: ImageTo3DOptions,
): Promise<ImageTo3DResult> {
  // Strip data URI prefix if present
  const cleanBase64 = imageBase64.replace(/^data:image\/[^;]+;base64,/, "")

  // DECISION: If a specific provider is requested, try only that one.
  if (options?.preferredProvider) {
    return callProvider(options.preferredProvider, cleanBase64, options)
  }

  // DECISION: Zoo text-to-CAD is primary when a text prompt is available.
  // It produces native STEP files (parametric B-Rep), which is what manufacturing needs.
  // Image-based providers (Tripo/Meshy) produce mesh-only GLB as fallback.
  const providers: ImageTo3DProvider[] = options?.textPrompt
    ? ["zoo", "tripo", "meshy", "self-hosted"]
    : ["tripo", "meshy", "self-hosted"]
  const errors: string[] = []

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, cleanBase64, options)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[IMAGE-TO-3D] ${provider} failed: ${msg}`)
      errors.push(`${provider}: ${msg}`)
    }
  }

  throw new Error(`All image-to-3D providers failed:\n${errors.join("\n")}`)
}

// ─── Provider dispatcher ─────────────────────────────────────────────

async function callProvider(
  provider: ImageTo3DProvider,
  imageBase64: string,
  options?: ImageTo3DOptions,
): Promise<ImageTo3DResult> {
  switch (provider) {
    case "zoo":
      if (!options?.textPrompt) throw new Error("Zoo requires a textPrompt")
      return zooTextToCad(options.textPrompt)
    case "tripo":
      return tripo3DGenerate(imageBase64)
    case "meshy":
      return meshyGenerate(imageBase64, options?.uploadTempImage)
    case "self-hosted":
      return selfHostedGenerate(imageBase64)
  }
}

// ─── Zoo.dev Text-to-CAD Provider ───────────────────────────────────

const ZOO_API_BASE = "https://api.zoo.dev"
const ZOO_TIMEOUT_MS = 120_000
const ZOO_POLL_INTERVAL_MS = 3_000

/**
 * Generate a native parametric STEP file via Zoo.dev's Text-to-CAD API.
 *
 * DECISION: Zoo is the primary provider because it outputs native B-Rep STEP
 * files — editable in any CAD program, unlike mesh-only GLB from Tripo/Meshy.
 * The `outputs` map includes both STEP and GLTF regardless of requested format.
 *
 * @param prompt - Opus-crafted 300-500 word geometric description (heroImagePrompt)
 * @returns STEP buffer + GLB buffer for STL conversion
 * @see https://zoo.dev/docs/api/ai/create-a-text-to-cad-model
 */
async function zooTextToCad(prompt: string): Promise<ImageTo3DResult> {
  const apiToken = process.env.ZOO_API_TOKEN
  if (!apiToken) throw new Error("ZOO_API_TOKEN not configured")

  const start = Date.now()

  // Step 1: Create text-to-CAD async operation
  const createRes = await fetch(`${ZOO_API_BASE}/ai/text-to-cad/step`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  })

  if (!createRes.ok) {
    const text = await createRes.text()
    throw new Error(`Zoo text-to-CAD creation failed (${createRes.status}): ${text}`)
  }

  const createData = (await createRes.json()) as {
    id: string
    status: string
    outputs?: Record<string, string>
  }

  // INTENT: Zoo may return completed immediately for cached/simple prompts,
  // or return a pending operation that needs polling.
  if (createData.status === "completed" && createData.outputs) {
    return extractZooOutputs(createData.outputs, start)
  }

  const operationId = createData.id
  console.info(`[IMAGE-TO-3D] Zoo text-to-CAD operation created: ${operationId}`)

  // Step 2: Poll async operation until complete
  const deadline = Date.now() + ZOO_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(ZOO_POLL_INTERVAL_MS)

    const pollRes = await fetch(`${ZOO_API_BASE}/async/operations/${operationId}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    })

    if (!pollRes.ok) continue

    const pollData = (await pollRes.json()) as {
      status: string
      outputs?: Record<string, string>
      error?: string
    }

    if (pollData.status === "completed") {
      if (!pollData.outputs) throw new Error("Zoo completed but no outputs returned")
      return extractZooOutputs(pollData.outputs, start)
    }

    if (pollData.status === "failed") {
      throw new Error(`Zoo text-to-CAD failed: ${pollData.error ?? "unknown error"}`)
    }
  }

  throw new Error(`Zoo text-to-CAD timed out after ${ZOO_TIMEOUT_MS}ms`)
}

/**
 * Extract STEP and GLTF buffers from Zoo's outputs map.
 * Keys are filenames like "output.step", "output.gltf", etc.
 * Values are base64-encoded file contents.
 */
function extractZooOutputs(
  outputs: Record<string, string>,
  startTime: number,
): ImageTo3DResult {
  // Find STEP output
  const stepEntry = Object.entries(outputs).find(([key]) =>
    key.toLowerCase().endsWith(".step") || key.toLowerCase().endsWith(".stp"),
  )
  if (!stepEntry) throw new Error("Zoo outputs missing STEP file")
  const stepBuffer = Buffer.from(stepEntry[1], "base64")

  // Find GLTF/GLB output (Zoo returns both formats by default)
  const glbEntry = Object.entries(outputs).find(([key]) => {
    const lower = key.toLowerCase()
    return lower.endsWith(".glb") || lower.endsWith(".gltf")
  })
  const glbBuffer = glbEntry ? Buffer.from(glbEntry[1], "base64") : Buffer.alloc(0)

  const elapsed = Date.now() - startTime
  console.info(
    `[IMAGE-TO-3D] Zoo text-to-CAD complete: ${elapsed}ms, step=${Math.round(stepBuffer.length / 1024)}kb, glb=${Math.round(glbBuffer.length / 1024)}kb`,
  )

  return {
    glbBuffer,
    stepBuffer,
    provider: "zoo",
    generationTimeMs: elapsed,
  }
}

// ─── Tripo3D Provider ────────────────────────────────────────────────

const TRIPO_API_BASE = "https://api.tripo3d.ai/v2/openapi"
const TRIPO_TIMEOUT_MS = 120_000
const TRIPO_POLL_INTERVAL_MS = 2_000

/**
 * Generate a 3D model via Tripo3D's image-to-model API.
 *
 * @see https://platform.tripo3d.ai/docs/api
 */
async function tripo3DGenerate(imageBase64: string): Promise<ImageTo3DResult> {
  const apiKey = process.env.TRIPO_API_KEY
  if (!apiKey) throw new Error("TRIPO_API_KEY not configured")

  const start = Date.now()

  // Step 1: Upload image and create task
  const createRes = await fetch(`${TRIPO_API_BASE}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: (() => {
      const formData = new FormData()
      const buffer = Buffer.from(imageBase64, "base64")
      formData.append("file", new Blob([buffer], { type: "image/png" }), "product.png")
      return formData
    })(),
  })

  if (!createRes.ok) {
    const text = await createRes.text()
    throw new Error(`Tripo upload failed (${createRes.status}): ${text}`)
  }

  const uploadData = (await createRes.json()) as { code: number; data: { image_token: string } }
  if (uploadData.code !== 0) {
    throw new Error(`Tripo upload error: code ${uploadData.code}`)
  }

  const imageToken = uploadData.data.image_token

  // Step 2: Create generation task
  const taskRes = await fetch(`${TRIPO_API_BASE}/task`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "image_to_model",
      file: {
        type: "png",
        file_token: imageToken,
      },
    }),
  })

  if (!taskRes.ok) {
    const text = await taskRes.text()
    throw new Error(`Tripo task creation failed (${taskRes.status}): ${text}`)
  }

  const taskData = (await taskRes.json()) as { code: number; data: { task_id: string } }
  if (taskData.code !== 0) {
    throw new Error(`Tripo task error: code ${taskData.code}`)
  }

  const taskId = taskData.data.task_id
  console.info(`[IMAGE-TO-3D] Tripo task created: ${taskId}`)

  // Step 3: Poll until complete
  const deadline = Date.now() + TRIPO_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(TRIPO_POLL_INTERVAL_MS)

    const pollRes = await fetch(`${TRIPO_API_BASE}/task/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!pollRes.ok) continue

    const pollData = (await pollRes.json()) as {
      code: number
      data: {
        status: string
        output?: { model?: string }
        progress?: number
      }
    }

    const status = pollData.data.status

    if (status === "success") {
      const modelUrl = pollData.data.output?.model
      if (!modelUrl) throw new Error("Tripo succeeded but no model URL in output")

      // Download GLB
      const glbRes = await fetch(modelUrl)
      if (!glbRes.ok) throw new Error(`Failed to download Tripo GLB: ${glbRes.status}`)

      const glbBuffer = Buffer.from(await glbRes.arrayBuffer())
      const elapsed = Date.now() - start

      console.info(`[IMAGE-TO-3D] Tripo complete: ${elapsed}ms, glb=${Math.round(glbBuffer.length / 1024)}kb`)

      return {
        glbBuffer,
        provider: "tripo",
        generationTimeMs: elapsed,
      }
    }

    if (status === "failed" || status === "cancelled") {
      throw new Error(`Tripo task ${status}`)
    }

    // Still running — continue polling
  }

  throw new Error(`Tripo timed out after ${TRIPO_TIMEOUT_MS}ms`)
}

// ─── Meshy.ai Provider ───────────────────────────────────────────────

const MESHY_API_BASE = "https://api.meshy.ai/openapi/v2"
const MESHY_TIMEOUT_MS = 180_000
const MESHY_POLL_INTERVAL_MS = 3_000

/**
 * Generate a 3D model via Meshy.ai's image-to-3D API.
 *
 * GOTCHA: Meshy requires a publicly accessible URL, not base64.
 * If uploadTempImage is not provided, we encode as a data URI and
 * pass it directly (Meshy v2 supports data URIs as image_url).
 *
 * @see https://docs.meshy.ai/api-image-to-3d
 */
async function meshyGenerate(
  imageBase64: string,
  uploadTempImage?: (base64: string) => Promise<string>,
): Promise<ImageTo3DResult> {
  const apiKey = process.env.MESHY_API_KEY
  if (!apiKey) throw new Error("MESHY_API_KEY not configured")

  const start = Date.now()

  // Resolve image URL — prefer Supabase upload, fall back to data URI
  let imageUrl: string
  if (uploadTempImage) {
    imageUrl = await uploadTempImage(imageBase64)
  } else {
    imageUrl = `data:image/png;base64,${imageBase64}`
  }

  // Step 1: Create task
  const createRes = await fetch(`${MESHY_API_BASE}/image-to-3d`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      enable_pbr: true,
    }),
  })

  if (!createRes.ok) {
    const text = await createRes.text()
    throw new Error(`Meshy task creation failed (${createRes.status}): ${text}`)
  }

  const createData = (await createRes.json()) as { result: string }
  const taskId = createData.result
  console.info(`[IMAGE-TO-3D] Meshy task created: ${taskId}`)

  // Step 2: Poll until complete
  const deadline = Date.now() + MESHY_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(MESHY_POLL_INTERVAL_MS)

    const pollRes = await fetch(`${MESHY_API_BASE}/image-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!pollRes.ok) continue

    const pollData = (await pollRes.json()) as {
      status: string
      model_urls?: { glb?: string; obj?: string }
      progress?: number
    }

    if (pollData.status === "SUCCEEDED") {
      const glbUrl = pollData.model_urls?.glb
      if (!glbUrl) throw new Error("Meshy succeeded but no GLB URL in model_urls")

      // Download GLB
      const glbRes = await fetch(glbUrl)
      if (!glbRes.ok) throw new Error(`Failed to download Meshy GLB: ${glbRes.status}`)

      const glbBuffer = Buffer.from(await glbRes.arrayBuffer())
      const elapsed = Date.now() - start

      console.info(`[IMAGE-TO-3D] Meshy complete: ${elapsed}ms, glb=${Math.round(glbBuffer.length / 1024)}kb`)

      return {
        glbBuffer,
        provider: "meshy",
        generationTimeMs: elapsed,
      }
    }

    if (pollData.status === "FAILED" || pollData.status === "EXPIRED") {
      throw new Error(`Meshy task ${pollData.status}`)
    }
  }

  throw new Error(`Meshy timed out after ${MESHY_TIMEOUT_MS}ms`)
}

// ─── Self-hosted TripoSR (Phase 2) ──────────────────────────────────

/**
 * Generate a 3D model via self-hosted TripoSR on Modal.
 *
 * INTENT: Phase 2 — requires deploying a new Modal function with TripoSR (MIT).
 * For now, this checks if the endpoint exists and calls it.
 *
 * @see https://github.com/VAST-AI-Research/TripoSR
 */
async function selfHostedGenerate(imageBase64: string): Promise<ImageTo3DResult> {
  const modalUrl = process.env.MODAL_CAD_ENDPOINT_URL
  if (!modalUrl) throw new Error("MODAL_CAD_ENDPOINT_URL not configured")

  const start = Date.now()
  const TIMEOUT_MS = 60_000

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${modalUrl}/image-to-mesh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: imageBase64 }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Self-hosted image-to-mesh failed (${res.status}): ${text}`)
    }

    const data = (await res.json()) as {
      stl_base64?: string
      glb_base64?: string
      obj_base64?: string
    }

    // Self-hosted may return STL directly or GLB
    const glbBuffer = data.glb_base64
      ? Buffer.from(data.glb_base64, "base64")
      : undefined
    const stlBuffer = data.stl_base64
      ? Buffer.from(data.stl_base64, "base64")
      : undefined

    if (!glbBuffer && !stlBuffer) {
      throw new Error("Self-hosted returned neither GLB nor STL")
    }

    const elapsed = Date.now() - start
    console.info(`[IMAGE-TO-3D] Self-hosted complete: ${elapsed}ms`)

    return {
      // INTENT: If only STL returned, we'll still need a GLB for storage.
      // The route handler will handle this case.
      glbBuffer: glbBuffer ?? Buffer.alloc(0),
      stlBuffer,
      provider: "self-hosted",
      generationTimeMs: elapsed,
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

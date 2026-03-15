/**
 * @file image-to-3d.ts — Zoo.dev text-to-CAD generation.
 *
 * @description Generates native parametric STEP files via Zoo.dev's text-to-CAD
 * API. This is the sole CAD generation path — no fallback providers.
 *
 * @security API keys read from environment variables only.
 */

import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

// ─── Types ───────────────────────────────────────────────────────────

export type ImageTo3DProvider = "zoo"

export interface ImageTo3DResult {
  /** GLB binary as a Buffer */
  glbBuffer: Buffer
  /** STL binary if the provider returns it directly */
  stlBuffer?: Buffer
  /** STEP binary — Zoo always returns native parametric CAD */
  stepBuffer?: Buffer
  /** Which provider produced this mesh */
  provider: ImageTo3DProvider
  /** Total generation time in ms (including polling) */
  generationTimeMs: number
}

export interface ImageTo3DOptions {
  /** Text prompt for Zoo text-to-CAD (required) */
  textPrompt?: string
}

// ─── Main entry point ────────────────────────────────────────────────

/**
 * Generate a parametric CAD model via Zoo.dev's text-to-CAD API.
 *
 * @param _imageBase64 - Unused (Zoo uses text prompt, not image)
 * @param options - Must include textPrompt
 * @returns STEP + GLB buffers + metadata
 * @throws Error if Zoo API fails or no prompt provided
 */
export async function imageToMesh(
  _imageBase64: string,
  options?: ImageTo3DOptions,
): Promise<ImageTo3DResult> {
  if (!options?.textPrompt) {
    throw new Error("Zoo requires a textPrompt — no design prompt available")
  }
  return zooTextToCad(options.textPrompt)
}

// ─── Zoo.dev Text-to-CAD Provider ───────────────────────────────────

const ZOO_API_BASE = "https://api.zoo.dev"
// DECISION: 280s polling budget — Zoo complex models can take 290s,
// but Vercel maxDuration is 300s. Leave 20s for image fetch + upload.
const ZOO_TIMEOUT_MS = 280_000
const ZOO_POLL_INTERVAL_MS = 3_000

/**
 * Generate a native parametric STEP file via Zoo.dev's Text-to-CAD API.
 *
 * DECISION: Zoo is the only provider because it outputs native B-Rep STEP
 * files — editable in any CAD program, unlike mesh-only GLB from image-to-3D services.
 *
 * @param prompt - Opus-crafted geometric description (cadGeometryPrompt or heroImagePrompt)
 * @returns STEP buffer + GLB buffer
 * @see https://zoo.dev/docs/api/ai/create-a-text-to-cad-model
 */
async function zooTextToCad(prompt: string): Promise<ImageTo3DResult> {
  const apiToken = process.env.ZOO_API_TOKEN
  if (!apiToken) throw new Error("ZOO_API_TOKEN not configured")

  const start = Date.now()

  // Step 1: Create text-to-CAD async operation
  const createRes = await fetchWithTimeout(
    `${ZOO_API_BASE}/ai/text-to-cad/step`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    },
    30_000,
  )

  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "Unknown error")
    throw new Error(`Zoo text-to-CAD creation failed (${createRes.status}): ${text.slice(0, 500)}`)
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

    const pollRes = await fetchWithTimeout(
      `${ZOO_API_BASE}/async/operations/${operationId}`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
      15_000,
    )

    if (!pollRes.ok) {
      if (pollRes.status === 401 || pollRes.status === 403) {
        throw new Error(`Zoo auth failed (${pollRes.status})`)
      }
      if (pollRes.status === 404) {
        throw new Error(`Zoo operation not found: ${operationId}`)
      }
      continue
    }

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
  if (stepBuffer.length > 100 * 1024 * 1024) throw new Error("Zoo STEP output too large (>100MB)")

  // Find GLTF/GLB output (Zoo returns both formats by default)
  const glbEntry = Object.entries(outputs).find(([key]) => {
    const lower = key.toLowerCase()
    return lower.endsWith(".glb") || lower.endsWith(".gltf")
  })
  const glbBuffer = glbEntry ? Buffer.from(glbEntry[1], "base64") : Buffer.alloc(0)
  if (glbBuffer.length > 100 * 1024 * 1024) throw new Error("Zoo GLB output too large (>100MB)")

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

// ─── Helpers ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

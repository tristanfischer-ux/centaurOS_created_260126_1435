/**
 * @file tripo-client.ts — Tripo3D image-to-3D provider client.
 *
 * @description Calls Tripo's commercial API to convert an image into a
 * high-quality GLB mesh (up to 2M polys, PBR textures). Uses POST to create
 * a task then polls until completion.
 *
 * @see https://platform.tripo3d.ai/docs/api
 * @security API key from environment variable only.
 */

import { fetchWithTimeout } from "@/lib/fetch-with-timeout"
import { isSafeExternalUrl } from "@/lib/security/url-validation"

const TRIPO_API_BASE = "https://api.tripo3d.ai/v2/openapi"
const TRIPO_POLL_INTERVAL_MS = 5_000
const TRIPO_TIMEOUT_MS = 150_000

export interface TripoResult {
  glbBuffer: Buffer
  provider: "tripo"
  generationTimeMs: number
  glbSizeBytes: number
}

interface TripoCreateResponse {
  code: number
  data: {
    task_id: string
  }
}

interface TripoTaskResponse {
  code: number
  data: {
    task_id: string
    type: string
    status: "queued" | "running" | "success" | "failed" | "cancelled"
    output?: {
      // GOTCHA: Tripo v2.5+ returns pbr_model (not model). The model field
      // is no longer present in task responses. Both output.pbr_model and
      // result.pbr_model.url contain the GLB URL.
      pbr_model?: string
      model?: string // Legacy fallback
    }
    result?: {
      pbr_model?: { type: string; url: string }
    }
    message?: string
  }
}

/**
 * Convert an image to a 3D GLB mesh via Tripo's image-to-model API.
 *
 * @param imageBase64 - Base64-encoded image data (PNG/JPG)
 * @returns GLB buffer and generation metadata
 * @throws Error if API key missing, task fails, or timeout exceeded
 */
export async function imageToMeshViaTripo(imageBase64: string): Promise<TripoResult> {
  const apiKey = process.env.TRIPO_API_KEY?.trim()
  if (!apiKey) throw new Error("TRIPO_API_KEY not configured")

  const start = Date.now()

  // Step 1: Upload image and create task
  // INTENT: Tripo accepts base64 image in the file field via multipart or
  // a data URI in the image_url field. Using the token-based upload approach.
  const createRes = await fetchWithTimeout(
    `${TRIPO_API_BASE}/task`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "image_to_model",
        file: {
          type: "png",
          data: imageBase64,
        },
      }),
    },
    30_000,
  )

  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "Unknown error")
    throw new Error(`Tripo task creation failed (${createRes.status}): ${detail.slice(0, 500)}`)
  }

  const createData = (await createRes.json()) as TripoCreateResponse
  const taskId = createData.data?.task_id
  if (!taskId) throw new Error("Tripo returned no task ID")

  console.info(`[TRIPO] Task created: ${taskId}`)

  // Step 2: Poll until success or failed
  const deadline = Date.now() + TRIPO_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(TRIPO_POLL_INTERVAL_MS)

    const pollRes = await fetchWithTimeout(
      `${TRIPO_API_BASE}/task/${taskId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      15_000,
    )

    if (!pollRes.ok) {
      if (pollRes.status === 401 || pollRes.status === 403) {
        throw new Error(`Tripo auth failed (${pollRes.status})`)
      }
      if (pollRes.status === 404) {
        throw new Error(`Tripo task not found: ${taskId}`)
      }
      console.warn(`[TRIPO] Poll returned ${pollRes.status}, retrying...`)
      continue
    }

    const task = (await pollRes.json()) as TripoTaskResponse

    if (task.data.status === "success") {
      // GOTCHA: Tripo v2.5+ puts the GLB URL at output.pbr_model (not output.model).
      // Also available at result.pbr_model.url. Check all locations.
      const modelUrl = task.data.output?.pbr_model
        ?? task.data.output?.model
        ?? task.data.result?.pbr_model?.url
      if (!modelUrl) throw new Error("Tripo succeeded but no model URL in response")

      // SECURITY: Validate download URL to prevent SSRF via compromised API response
      if (!isSafeExternalUrl(modelUrl)) {
        throw new Error("Tripo returned suspicious download URL")
      }

      // Download GLB binary
      const glbRes = await fetchWithTimeout(modelUrl, { method: "GET" }, 30_000)
      if (!glbRes.ok) throw new Error(`Failed to download Tripo model: ${glbRes.status}`)

      // SECURITY: Reject oversized downloads to prevent OOM
      const dlContentLength = parseInt(glbRes.headers.get("content-length") ?? "0", 10)
      if (dlContentLength > 100 * 1024 * 1024) throw new Error("Tripo model too large (>100MB)")

      const glbBuffer = Buffer.from(await glbRes.arrayBuffer())
      if (glbBuffer.length === 0) throw new Error("Tripo returned empty model")
      if (glbBuffer.length > 100 * 1024 * 1024) throw new Error("Tripo model too large (>100MB)")

      return {
        glbBuffer,
        provider: "tripo",
        generationTimeMs: Date.now() - start,
        glbSizeBytes: glbBuffer.length,
      }
    }

    if (task.data.status === "failed" || task.data.status === "cancelled") {
      throw new Error(`Tripo task ${task.data.status}: ${task.data.message ?? "unknown error"}`)
    }
  }

  throw new Error(`Tripo timed out after ${TRIPO_TIMEOUT_MS}ms`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

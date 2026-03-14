/**
 * @file meshy-client.ts — Meshy image-to-3D provider client.
 *
 * @description Calls Meshy's commercial API to convert an image URL into a
 * high-quality GLB mesh (300K+ polys, PBR textures). Uses POST to create a
 * task then polls until completion.
 *
 * @see https://docs.meshy.ai/api-image-to-3d
 * @security API key from environment variable only.
 */

import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

const MESHY_API_BASE = "https://api.meshy.ai/openapi/v2"
const MESHY_POLL_INTERVAL_MS = 5_000
const MESHY_TIMEOUT_MS = 120_000

export interface MeshyResult {
  glbBuffer: Buffer
  provider: "meshy"
  generationTimeMs: number
  glbSizeBytes: number
}

interface MeshyCreateResponse {
  result: string // task ID
}

interface MeshyTaskResponse {
  id: string
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "EXPIRED"
  model_urls?: {
    glb?: string
    fbx?: string
    obj?: string
  }
  task_error?: { message: string }
}

/**
 * Convert an image to a 3D GLB mesh via Meshy's image-to-3D API.
 *
 * @param imageUrl - Public URL of the image (Supabase Storage public URL)
 * @returns GLB buffer and generation metadata
 * @throws Error if API key missing, task fails, or timeout exceeded
 */
export async function imageToMeshViaMeshy(imageUrl: string): Promise<MeshyResult> {
  const apiKey = process.env.MESHY_API_KEY?.trim()
  if (!apiKey) throw new Error("MESHY_API_KEY not configured")

  const start = Date.now()

  // Step 1: Create image-to-3D task
  const createRes = await fetchWithTimeout(
    `${MESHY_API_BASE}/image-to-3d`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        enable_pbr: true,
      }),
    },
    30_000,
  )

  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "Unknown error")
    throw new Error(`Meshy task creation failed (${createRes.status}): ${detail.slice(0, 500)}`)
  }

  const createData = (await createRes.json()) as MeshyCreateResponse
  const taskId = createData.result
  if (!taskId) throw new Error("Meshy returned no task ID")

  console.info(`[MESHY] Task created: ${taskId}`)

  // Step 2: Poll until SUCCEEDED or FAILED
  const deadline = Date.now() + MESHY_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(MESHY_POLL_INTERVAL_MS)

    const pollRes = await fetchWithTimeout(
      `${MESHY_API_BASE}/image-to-3d/${taskId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      15_000,
    )

    if (!pollRes.ok) {
      // INTENT: Fail fast on fatal HTTP errors instead of wasting poll budget
      if (pollRes.status === 401 || pollRes.status === 403) {
        throw new Error(`Meshy auth failed (${pollRes.status})`)
      }
      if (pollRes.status === 404) {
        throw new Error(`Meshy task not found: ${taskId}`)
      }
      console.warn(`[MESHY] Poll returned ${pollRes.status}, retrying...`)
      continue
    }

    const task = (await pollRes.json()) as MeshyTaskResponse

    if (task.status === "SUCCEEDED") {
      const glbUrl = task.model_urls?.glb
      if (!glbUrl) throw new Error("Meshy SUCCEEDED but no GLB URL in response")

      // SECURITY: Validate download URL to prevent SSRF via compromised API response
      try {
        const parsed = new URL(glbUrl)
        if (parsed.protocol !== "https:" || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(parsed.hostname)) {
          throw new Error("Meshy returned suspicious download URL")
        }
      } catch (urlErr) {
        if (urlErr instanceof Error && urlErr.message.includes("suspicious")) throw urlErr
        throw new Error("Meshy returned invalid download URL")
      }

      // Download GLB binary
      const glbRes = await fetchWithTimeout(glbUrl, { method: "GET" }, 30_000)
      if (!glbRes.ok) throw new Error(`Failed to download Meshy GLB: ${glbRes.status}`)

      // SECURITY: Reject oversized downloads to prevent OOM
      const dlContentLength = parseInt(glbRes.headers.get("content-length") ?? "0", 10)
      if (dlContentLength > 100 * 1024 * 1024) throw new Error("Meshy GLB too large (>100MB)")

      const glbBuffer = Buffer.from(await glbRes.arrayBuffer())
      if (glbBuffer.length === 0) throw new Error("Meshy returned empty GLB")
      if (glbBuffer.length > 100 * 1024 * 1024) throw new Error("Meshy GLB too large (>100MB)")

      return {
        glbBuffer,
        provider: "meshy",
        generationTimeMs: Date.now() - start,
        glbSizeBytes: glbBuffer.length,
      }
    }

    if (task.status === "FAILED" || task.status === "EXPIRED") {
      throw new Error(`Meshy task ${task.status}: ${task.task_error?.message ?? "unknown error"}`)
    }
  }

  throw new Error(`Meshy timed out after ${MESHY_TIMEOUT_MS}ms`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @file sf3d-client.ts — Stable Fast 3D (SF3D) image-to-3D provider client.
 *
 * @description Calls a self-hosted SF3D Modal endpoint to convert an image
 * into a GLB mesh. Ultra-fast (~0.5s inference). Same auth pattern as GenCAD.
 *
 * @security Auth token from environment variable only.
 */

import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

export interface SF3DResult {
  glbBuffer: Buffer
  provider: "sf3d"
  generationTimeMs: number
  glbSizeBytes: number
}

interface SF3DResponse {
  glb_base64: string
  success: boolean
  generation_time_ms: number
  glb_size_bytes: number
}

/**
 * Convert an image to a 3D GLB mesh via Stable Fast 3D on Modal.
 *
 * @param imageBase64 - Base64-encoded PNG image (no data URI prefix)
 * @returns GLB buffer and generation metadata
 * @throws Error if endpoint unreachable, auth fails, or generation fails
 */
export async function imageToMeshViaSF3D(imageBase64: string): Promise<SF3DResult> {
  const url = process.env.SF3D_MODAL_URL?.trim()
  if (!url) throw new Error("SF3D_MODAL_URL not configured")

  const authToken = process.env.SF3D_AUTH_TOKEN?.trim()
  if (!authToken) throw new Error("SF3D_AUTH_TOKEN not configured")

  const start = Date.now()

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: imageBase64,
        auth_token: authToken,
      }),
    },
    60_000, // SF3D is ultra-fast (~0.5s) but cold start can be 30s+
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => "Unknown error")
    throw new Error(`SF3D endpoint returned ${response.status}: ${detail.slice(0, 500)}`)
  }

  // SECURITY: Reject oversized responses to prevent OOM
  const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10)
  if (contentLength > 100 * 1024 * 1024) {
    throw new Error("SF3D response too large (>100MB)")
  }

  const data = (await response.json()) as SF3DResponse

  if (
    !data.success ||
    typeof data.glb_base64 !== "string" ||
    !data.glb_base64
  ) {
    throw new Error("SF3D returned invalid response shape")
  }

  const glbBuffer = Buffer.from(data.glb_base64, "base64")
  if (glbBuffer.length === 0) throw new Error("SF3D returned empty GLB data")

  const elapsed = Date.now() - start
  console.info(`[SF3D] Generation complete: ${elapsed}ms, glb=${Math.round(glbBuffer.length / 1024)}kb`)

  return {
    glbBuffer,
    provider: "sf3d",
    generationTimeMs: elapsed,
    glbSizeBytes: glbBuffer.length,
  }
}

/**
 * @file trellis-client.ts — TRELLIS.2 image-to-3D provider client.
 *
 * @description Calls a self-hosted TRELLIS.2 (4B params) Modal endpoint to
 * convert an image into a GLB mesh. Same auth pattern as GenCAD (HMAC token).
 *
 * @security Auth token from environment variable only.
 */

import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

export interface TrellisResult {
  glbBuffer: Buffer
  provider: "trellis"
  generationTimeMs: number
  glbSizeBytes: number
}

interface TrellisResponse {
  glb_base64: string
  success: boolean
  generation_time_ms: number
  glb_size_bytes: number
  triangle_count?: number
}

/**
 * Convert an image to a 3D GLB mesh via TRELLIS.2 on Modal.
 *
 * @param imageBase64 - Base64-encoded PNG image (no data URI prefix)
 * @returns GLB buffer and generation metadata
 * @throws Error if endpoint unreachable, auth fails, or generation fails
 */
export async function imageToMeshViaTrellis(imageBase64: string): Promise<TrellisResult> {
  const url = process.env.TRELLIS_MODAL_URL?.trim()
  if (!url) throw new Error("TRELLIS_MODAL_URL not configured")

  const authToken = process.env.TRELLIS_AUTH_TOKEN?.trim()
  if (!authToken) throw new Error("TRELLIS_AUTH_TOKEN not configured")

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
    240_000, // TRELLIS cold start ~100s + inference ~50s + decimation ~20s = ~170s
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => "Unknown error")
    throw new Error(`TRELLIS endpoint returned ${response.status}: ${detail.slice(0, 500)}`)
  }

  // SECURITY: Read as text first to enforce size limit (Content-Length may be absent with chunked encoding)
  const responseText = await response.text()
  if (responseText.length > 100 * 1024 * 1024) {
    throw new Error("TRELLIS response too large (>100MB)")
  }

  const data = JSON.parse(responseText) as TrellisResponse

  if (
    !data.success ||
    typeof data.glb_base64 !== "string" ||
    !data.glb_base64
  ) {
    throw new Error("TRELLIS returned invalid response shape")
  }

  const glbBuffer = Buffer.from(data.glb_base64, "base64")
  if (glbBuffer.length === 0) throw new Error("TRELLIS returned empty GLB data")
  if (glbBuffer.length > 100 * 1024 * 1024) throw new Error("TRELLIS GLB too large (>100MB)")

  const elapsed = Date.now() - start
  console.info(`[TRELLIS] Generation complete: ${elapsed}ms, glb=${Math.round(glbBuffer.length / 1024)}kb`)

  return {
    glbBuffer,
    provider: "trellis",
    generationTimeMs: elapsed,
    glbSizeBytes: glbBuffer.length,
  }
}

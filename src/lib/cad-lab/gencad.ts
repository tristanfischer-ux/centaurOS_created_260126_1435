/**
 * @file gencad.ts — GenCAD (image-to-parametric-CAD) client.
 *
 * @description Calls the GenCAD Modal serverless endpoint to convert a hero
 * image (PNG base64) into an STL binary via learned CAD command sequences.
 *
 * @see https://github.com/ferdous-alam/GenCAD
 */

import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

export interface GenCADResult {
  stlBuffer: Buffer
  provider: "gencad"
  generationTimeMs: number
  stlSizeBytes: number
}

interface GenCADResponse {
  stl_base64: string
  success: boolean
  generation_time_ms: number
  stl_size_bytes: number
}

/**
 * Convert a hero image to a parametric CAD STL via GenCAD on Modal.
 *
 * @param imageBase64 - Base64-encoded PNG image (no data URI prefix)
 * @returns STL buffer and generation metadata
 * @throws Error if endpoint unreachable, auth fails, or generation fails
 */
export async function imageToCADViaGenCAD(
  imageBase64: string,
): Promise<GenCADResult> {
  const url = process.env.GENCAD_MODAL_URL
  if (!url) throw new Error("GENCAD_MODAL_URL not configured")

  const authToken = process.env.GENCAD_AUTH_TOKEN
  if (!authToken) throw new Error("GENCAD_AUTH_TOKEN not configured")

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        auth_token: authToken,
      }),
    },
    120_000,
  )

  if (!response.ok) {
    // SECURITY: Truncate error body to prevent log injection / memory pressure
    const detail = await response.text().catch(() => "Unknown error")
    throw new Error(`GenCAD endpoint returned ${response.status}: ${detail.slice(0, 500)}`)
  }

  const data = (await response.json()) as GenCADResponse

  // SECURITY: Validate response shape before trusting
  if (
    !data.success ||
    typeof data.stl_base64 !== "string" ||
    !data.stl_base64 ||
    typeof data.generation_time_ms !== "number" ||
    typeof data.stl_size_bytes !== "number"
  ) {
    throw new Error("GenCAD returned invalid response shape")
  }

  const stlBuffer = Buffer.from(data.stl_base64, "base64")
  if (stlBuffer.length === 0) {
    throw new Error("GenCAD returned empty STL data")
  }

  return {
    stlBuffer,
    provider: "gencad",
    generationTimeMs: data.generation_time_ms,
    stlSizeBytes: data.stl_size_bytes,
  }
}

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
  // GOTCHA: Vercel env vars can have trailing whitespace/newlines — always trim
  const url = process.env.GENCAD_MODAL_URL?.trim()
  if (!url) throw new Error("GENCAD_MODAL_URL not configured")

  const authToken = process.env.GENCAD_AUTH_TOKEN?.trim()
  if (!authToken) throw new Error("GENCAD_AUTH_TOKEN not configured")

  // DECISION: Retry once on failure — Modal serverless GPU functions cold-start
  // and can timeout on first request after scale-to-zero. A single retry typically
  // succeeds because the container is warm from the first attempt.
  let response: Response
  let attempts = 0
  const maxAttempts = 2

  while (true) {
    attempts++
    try {
      response = await fetchWithTimeout(
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

      if (response.ok) break

      const detail = await response.text().catch(() => "Unknown error")
      const errMsg = `GenCAD endpoint returned ${response.status}: ${detail.slice(0, 500)}`

      if (attempts >= maxAttempts) throw new Error(errMsg)

      // Retry on 5xx (cold start) or timeout
      if (response.status >= 500 || response.status === 408) {
        console.warn(`[GenCAD] Attempt ${attempts} failed (${response.status}), retrying...`)
        await new Promise(resolve => setTimeout(resolve, 3000))
        continue
      }

      throw new Error(errMsg)
    } catch (err) {
      if (attempts >= maxAttempts) throw err
      console.warn(`[GenCAD] Attempt ${attempts} failed:`, (err as Error).message?.slice(0, 100))
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  }

  // SECURITY: Reject oversized responses to prevent OOM
  const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10)
  if (contentLength > 100 * 1024 * 1024) {
    throw new Error("GenCAD response too large (>100MB)")
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
  if (stlBuffer.length > 100 * 1024 * 1024) {
    throw new Error("GenCAD STL too large (>100MB)")
  }

  return {
    stlBuffer,
    provider: "gencad",
    generationTimeMs: data.generation_time_ms,
    stlSizeBytes: data.stl_size_bytes,
  }
}

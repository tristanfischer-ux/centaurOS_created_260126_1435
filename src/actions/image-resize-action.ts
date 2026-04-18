/**
 * @file image-resize-action.ts — Server action wrapper around image-resize.ts.
 *
 * @description Why this wrapper: client-bundled modules (e.g. the PDF export
 * dialog) need resized images but cannot import the sharp-based resizer
 * directly — sharp pulls detect-libc → fs which blows up the client bundle.
 * Server actions cross the network boundary, so the client ends up with a
 * plain async function that returns a string | null.
 *
 * Keep this file lean: only async re-exports of the resizer entry points.
 *
 * @related
 * - src/lib/cad-lab/image-resize.ts (server-only, has the sharp calls)
 */

"use server"

import { fetchImageDataUriResized, fetchImageBufferResized } from "@/lib/cad-lab/image-resize"
import type { ResizeOptions } from "@/lib/cad-lab/image-resize-types"

export async function resizeImageToDataUri(url: string, options?: ResizeOptions): Promise<string | null> {
  return fetchImageDataUriResized(url, options)
}

export async function resizeImageToBufferBase64(url: string, options?: ResizeOptions): Promise<string | null> {
  // ArrayBuffer can't cross the RSC boundary cleanly in all Next versions;
  // return base64 so docx/pptx callers that want bytes can Buffer.from it.
  const buf = await fetchImageBufferResized(url, options)
  if (!buf) return null
  return Buffer.from(buf).toString("base64")
}

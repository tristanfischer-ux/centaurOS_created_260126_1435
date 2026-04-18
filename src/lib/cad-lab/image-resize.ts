/**
 * @file image-resize.ts — Shared image fetch + resize for report exporters.
 *
 * @description Every report exporter fetches remote images (hero, module
 * blueprints, per-section illustrations). Without resizing, docx exports
 * were embedding raw ~3000×3000 PNGs at ~3-5MB each and producing 45MB
 * files. This helper fetches once, resizes with Sharp to a sensible
 * ceiling, and returns both ArrayBuffer (docx) and base64 (pptx/pdf)
 * representations so each exporter can consume its preferred form.
 *
 * Default ceiling: 1600px on the longest edge, JPEG quality 85. That's
 * plenty for print at 150dpi A4 landscape and keeps the final docx
 * under ~5MB for typical projects.
 *
 * @related
 * - src/lib/cad-lab/export-design-report-docx.ts
 * - src/lib/cad-lab/export-design-report-pptx.ts
 * - src/lib/cad-lab/export-design-report-pdf.tsx
 */

import sharp from 'sharp'

export interface ResizedImage {
  /** For `docx` ImageRun — raw JPEG bytes. */
  buffer: ArrayBuffer
  /** For `pptxgenjs` / `@react-pdf/renderer` — `data:image/jpeg;base64,...`. */
  dataUri: string
  width: number
  height: number
  byteLength: number
}

export interface ResizeOptions {
  /** Max edge length in pixels. Default 1600. */
  maxEdge?: number
  /** JPEG quality 1–100. Default 85. */
  quality?: number
  /** Abort the fetch after this many ms. Default 10,000. */
  timeoutMs?: number
}

/** Fetch + resize + re-encode to JPEG. Returns null on any failure (callers
 *  already degrade gracefully when images are missing). */
export async function fetchAndResizeImage(
  url: string,
  options: ResizeOptions = {},
): Promise<ResizedImage | null> {
  const { maxEdge = 1600, quality = 85, timeoutMs = 10_000 } = options

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return null

    const sourceBytes = Buffer.from(await response.arrayBuffer())

    const pipeline = sharp(sourceBytes, { failOn: 'none' })
    const metadata = await pipeline.metadata()
    const sourceW = metadata.width ?? maxEdge
    const sourceH = metadata.height ?? maxEdge

    const longestEdge = Math.max(sourceW, sourceH)
    const needsResize = longestEdge > maxEdge

    const resized = needsResize
      ? pipeline.resize({
          width: sourceW >= sourceH ? maxEdge : undefined,
          height: sourceH > sourceW ? maxEdge : undefined,
          fit: 'inside',
          withoutEnlargement: true,
        })
      : pipeline

    const outBuffer = await resized
      .jpeg({ quality, mozjpeg: true, progressive: true })
      .toBuffer({ resolveWithObject: true })

    const buffer = outBuffer.data.buffer.slice(
      outBuffer.data.byteOffset,
      outBuffer.data.byteOffset + outBuffer.data.byteLength,
    ) as ArrayBuffer

    return {
      buffer,
      dataUri: `data:image/jpeg;base64,${outBuffer.data.toString('base64')}`,
      width: outBuffer.info.width,
      height: outBuffer.info.height,
      byteLength: outBuffer.info.size,
    }
  } catch {
    return null
  }
}

/** Convenience wrapper returning only the ArrayBuffer — docx consumers. */
export async function fetchImageBufferResized(url: string, options?: ResizeOptions): Promise<ArrayBuffer | null> {
  const resized = await fetchAndResizeImage(url, options)
  return resized?.buffer ?? null
}

/** Convenience wrapper returning only the data URI — pptx/pdf consumers. */
export async function fetchImageDataUriResized(url: string, options?: ResizeOptions): Promise<string | null> {
  const resized = await fetchAndResizeImage(url, options)
  return resized?.dataUri ?? null
}

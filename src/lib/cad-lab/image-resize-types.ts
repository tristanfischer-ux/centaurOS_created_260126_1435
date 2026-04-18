/**
 * @file image-resize-types.ts — Types-only export so browser-bundled PDF code
 * can reference the shape without pulling in sharp (server-only).
 *
 * @description image-resize.ts imports sharp (native Node binding via
 * detect-libc → fs). When design-report-pdf.tsx (a client module) imported
 * types from image-resize.ts, webpack pulled the whole module including
 * sharp, producing "Can't resolve 'fs'" at build time. Splitting types here
 * keeps the browser bundle clean.
 */

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

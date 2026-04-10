"use server"

/**
 * @file extract-document-text.ts
 *
 * @description Server action that extracts text from uploaded documents.
 * Supports PDF, DOCX, PPTX, XLSX, TXT, MD, and CSV files.
 * Uses the same libraries as cad-lab-reference-documents.ts.
 *
 * @security 30-second extraction timeout prevents DoS from malformed files.
 * File size capped at 10MB. Text output capped at 50,000 characters.
 * Requires authenticated user via withUser wrapper.
 */

import { withUser } from '@/lib/server-action-utils'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_TEXT_CHARS = 50_000
const EXTRACTION_TIMEOUT_MS = 30_000

const SUPPORTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/markdown": "txt",
  "text/csv": "txt",
}

function getFileTypeFromName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase()
  if (!ext) return null
  const map: Record<string, string> = { pdf: "pdf", docx: "docx", pptx: "pptx", xlsx: "xlsx", txt: "txt", md: "txt", csv: "txt" }
  return map[ext] ?? null
}

/**
 * Extracts text content from an uploaded document file.
 *
 * @param formData - FormData containing a single "file" entry
 * @returns Extracted text content, or error message
 */
export async function extractDocumentText(
  formData: FormData,
): Promise<{ success: true; text: string; fileName: string } | { success: false; error: string }> {
  return withUser(async () => {
    const file = formData.get("file") as File | null
    if (!file) return { success: false, error: "No file provided" }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: "File too large — maximum 10MB" }
    }

    const fileType = SUPPORTED_TYPES[file.type] ?? getFileTypeFromName(file.name)
    if (!fileType) {
      return { success: false, error: `Unsupported file type. Supported: PDF, DOCX, PPTX, XLSX, TXT, MD, CSV` }
    }

    // Plain text files — read directly
    if (fileType === "txt") {
      const text = await file.text()
      return { success: true, text: text.slice(0, MAX_TEXT_CHARS), fileName: file.name }
    }

    // Binary files — extract with timeout
    const buffer = Buffer.from(await file.arrayBuffer())

    const extractWithTimeout = <T,>(promise: Promise<T>): Promise<T> => {
      let timer: ReturnType<typeof setTimeout>
      return Promise.race([
        promise.then((v) => { clearTimeout(timer); return v }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Extraction timed out — file may be too complex")), EXTRACTION_TIMEOUT_MS)
        }),
      ])
    }

    try {
      let rawText = ""

      if (fileType === "pdf") {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse")
        const data = await extractWithTimeout(pdfParse(buffer) as Promise<{ text: string }>)
        rawText = data.text || ""
      } else if (fileType === "docx") {
        const mammoth = await import("mammoth")
        const result = await extractWithTimeout(mammoth.extractRawText({ buffer }))
        rawText = result.value || ""
      } else if (fileType === "pptx" || fileType === "xlsx") {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const officeparser = require("officeparser") as { parseOffice: (buffer: Buffer) => Promise<string> }
        rawText = await extractWithTimeout(officeparser.parseOffice(buffer))
      }

      if (!rawText || rawText.trim().length < 10) {
        return { success: false, error: "Could not extract text from this file — it may be image-based or empty" }
      }

      return { success: true, text: rawText.slice(0, MAX_TEXT_CHARS), fileName: file.name }
    } catch (err) {
      console.error("[extractDocumentText] Extraction failed:", err)
      const message = err instanceof Error ? err.message : "Extraction failed"
      return { success: false, error: message }
    }
  })
}

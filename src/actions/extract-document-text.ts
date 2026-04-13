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
/**
 * Structured profile parsed from pitch deck text.
 * Ported from Forge-Capital-Dashboard.html:2054-2069 (setProfileFromText).
 */
export interface ExtractedProfile {
  description: string
  stage: string | null
  geo: string | null
  raiseAmount: string | null
  sectors: string[]
}

// Regex-based extractor — deterministic, fast, no LLM call. Covers the
// common-case for most pitch decks. Run after text extraction so the
// InvestorSearchHero can render editable chips instead of a raw text blob.
function parseProfile(text: string): ExtractedProfile {
  const MAX = 20_000
  const t = text.slice(0, MAX)
  const low = t.toLowerCase()

  // Description: first meaningful sentence ≥ 30 chars (prefer "We are/We build/... is a")
  let description = ''
  const sentenceMatch = t.match(/(?:we are|we build|we('|')?re|our (?:company|mission)|[A-Z][\w\s&.,'-]{3,80}\s+is a)[^.!?]{20,250}[.!?]/i)
  if (sentenceMatch) {
    description = sentenceMatch[0].trim()
  } else {
    const firstPara = t.split(/\n\s*\n/).find(p => p.trim().length >= 40) ?? ''
    description = firstPara.replace(/\s+/g, ' ').trim().slice(0, 250)
  }

  // Stage
  let stage: string | null = null
  const stagePatterns: Array<[RegExp, string]> = [
    [/\bpre[- ]?seed\b/i, 'Pre-Seed'],
    [/\bseries\s*a\b/i, 'Series A'],
    [/\bseries\s*b\b/i, 'Series B'],
    [/\bseries\s*c\b/i, 'Series C'],
    [/\b(growth|late[- ]stage)\b/i, 'Growth'],
    [/\bseed\s*(?:round|stage|capital)?\b/i, 'Seed'],
  ]
  for (const [pattern, label] of stagePatterns) {
    if (pattern.test(low)) { stage = label; break }
  }

  // Geography
  let geo: string | null = null
  const geoPatterns: Array<[RegExp, string]> = [
    [/\b(london|manchester|cambridge|oxford|edinburgh|bristol|birmingham|uk-based|united kingdom|\buk\b|britain)\b/i, 'UK'],
    [/\b(berlin|paris|amsterdam|munich|stockholm|copenhagen|europe|european|emea|eu-based)\b/i, 'Europe'],
    [/\b(san francisco|new york|boston|silicon valley|\bus\b|usa|united states|america)\b/i, 'US'],
    [/\b(global|worldwide|international)\b/i, 'Global'],
  ]
  for (const [pattern, label] of geoPatterns) {
    if (pattern.test(low)) { geo = label; break }
  }

  // Raise amount — first currency figure that looks like a raise
  let raiseAmount: string | null = null
  const raiseMatch = t.match(/(?:raising|raise|seeking|looking for|target(?:ing)?)\s*(?:a|up to)?\s*([£$€]\s?\d[\d,.]*\s?[kKmMbB]?)/i)
    ?? t.match(/([£$€]\s?\d[\d,.]*\s?[kKmMbB])\s+(?:round|raise|seed|series)/i)
  if (raiseMatch) raiseAmount = raiseMatch[1].replace(/\s+/g, '')

  // Sectors — scan a vocabulary of common hardware/tech sectors
  const SECTOR_VOCAB = [
    'climate tech', 'clean energy', 'renewable energy', 'battery', 'solar', 'wind',
    'robotics', 'drones', 'aerospace', 'space', 'satellite',
    'ai', 'machine learning', 'computer vision', 'nlp',
    'biotech', 'medtech', 'healthtech', 'diagnostics', 'life sciences',
    'fintech', 'insurtech', 'payments',
    'hardware', 'deep tech', 'advanced manufacturing', 'industrial', 'iot', 'sensors',
    'materials', 'nanotechnology', 'quantum',
    'mobility', 'automotive', 'ev', 'logistics',
    'agritech', 'foodtech', 'supply chain',
    'cybersecurity', 'saas', 'b2b software',
    'semiconductors', 'photonics',
  ]
  const foundSectors: string[] = []
  for (const s of SECTOR_VOCAB) {
    if (low.includes(s) && !foundSectors.includes(s)) foundSectors.push(s)
    if (foundSectors.length >= 6) break
  }

  return { description, stage, geo, raiseAmount, sectors: foundSectors }
}

export async function extractDocumentText(
  formData: FormData,
): Promise<
  | { success: true; text: string; fileName: string; profile: ExtractedProfile }
  | { success: false; error: string }
> {
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
      const clipped = text.slice(0, MAX_TEXT_CHARS)
      return { success: true, text: clipped, fileName: file.name, profile: parseProfile(clipped) }
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
        // GOTCHA: pdf-parse pulls in pdfjs-dist which references browser-only
        // DOMMatrix at module load and crashes in Node server actions. unpdf is
        // a Node-safe wrapper around pdfjs that ships its own polyfill.
        const { extractText, getDocumentProxy } = await import("unpdf")
        const pdf = await extractWithTimeout(getDocumentProxy(new Uint8Array(buffer)))
        const { text } = await extractWithTimeout(extractText(pdf, { mergePages: true }))
        rawText = Array.isArray(text) ? text.join("\n\n") : (text || "")
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

      const clipped = rawText.slice(0, MAX_TEXT_CHARS)
      return { success: true, text: clipped, fileName: file.name, profile: parseProfile(clipped) }
    } catch (err) {
      console.error("[extractDocumentText] Extraction failed:", err)
      const message = err instanceof Error ? err.message : "Extraction failed"
      return { success: false, error: message }
    }
  })
}

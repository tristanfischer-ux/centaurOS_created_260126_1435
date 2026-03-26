"use server"

/**
 * @file cad-lab-reference-documents.ts — Server actions for reference document upload,
 * text extraction, and LLM summarization.
 *
 * @description Uploads spec sheets, datasheets, and CAD files to Supabase Storage,
 * extracts text from document types (PDF, DOCX, PPTX, XLSX), and summarizes into
 * design-relevant specs via Claude Haiku.
 *
 * @security All actions require authentication via withAuth. Project ownership is
 * verified before any operation.
 */

import { withAuth } from "@/lib/server-action-utils"
import { sanitizeErrorMessage } from "@/lib/security/sanitize"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/types/database.types"
import type { StoredReferenceDocument, DocumentFileType } from "@/lib/cad-lab/reference-document-types"
import { EXTRACTABLE_TYPES, MAX_DOCUMENTS_PER_PROJECT } from "@/lib/cad-lab/reference-document-types"

const STORAGE_BUCKET = "xray-images"
const MAX_DOCS_PER_REQUEST = 10
/** Server-side base64 size limit: ~27MB base64 ≈ ~20MB raw */
const MAX_BASE64_LENGTH = 27_000_000
const MAX_RAW_TEXT_CHARS = 50_000
const MAX_NAME_LENGTH = 255
/** Timeout for text extraction libraries (pdf-parse, mammoth, officeparser) — prevents DoS via malformed files */
const EXTRACTION_TIMEOUT_MS = 30_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/step",
  "model/stl",
  "application/octet-stream",
] as const

const FILE_TYPE_TO_EXT: Record<DocumentFileType, string> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  step: "step",
  stl: "stl",
  dxf: "dxf",
}

/**
 * Uploads reference documents to Supabase Storage.
 *
 * @param projectId - The project to attach documents to
 * @param documents - Array of {id, name, mimeType, base64Data, originalSize, fileType} to upload
 * @returns Array of stored document metadata with public URLs, plus any failures
 *
 * @security Verifies project belongs to caller's foundry before uploading.
 */
export async function uploadReferenceDocuments(
  projectId: string,
  documents: Array<{
    id: string
    name: string
    mimeType: string
    base64Data: string
    originalSize: number
    fileType: DocumentFileType
  }>,
): Promise<{ stored: Array<{ id: string; name: string; mimeType: string; storageUrl: string; originalSize: number; fileType: DocumentFileType }>; failed: string[] } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }
    if (!UUID_RE.test(projectId)) return { error: "Invalid project ID format" }
    if (!documents.length) return { error: "No documents to upload" }
    if (documents.length > MAX_DOCS_PER_REQUEST) return { error: `Maximum ${MAX_DOCS_PER_REQUEST} documents per upload` }

    // SECURITY: Verify project belongs to caller's foundry (RLS enforces this via SELECT)
    const { data: project, error: projectErr } = await supabase
      .from("cad_lab_projects")
      .select("id, reference_documents")
      .eq("id", projectId)
      .single()

    if (projectErr || !project) {
      return { error: "Project not found or access denied" }
    }

    // VALIDATION: Check total document count (existing + new)
    const existingCount = Array.isArray(project.reference_documents) ? (project.reference_documents as unknown[]).length : 0
    if (existingCount + documents.length > MAX_DOCUMENTS_PER_PROJECT) {
      return { error: `Maximum ${MAX_DOCUMENTS_PER_PROJECT} reference documents per project (${existingCount} existing)` }
    }

    try {
      const admin = createAdminClient()
      const stored: Array<{ id: string; name: string; mimeType: string; storageUrl: string; originalSize: number; fileType: DocumentFileType }> = []
      const failed: string[] = []

      for (const doc of documents) {
        // SECURITY: Validate doc.id is a UUID to prevent path traversal
        if (!UUID_RE.test(doc.id)) {
          failed.push(`${doc.name}: invalid document ID`)
          continue
        }

        // SECURITY: Validate MIME type server-side
        if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(doc.mimeType)) {
          failed.push(`${doc.name}: invalid file type (${doc.mimeType})`)
          continue
        }

        // SECURITY: Validate fileType is a known type (don't trust client)
        if (!FILE_TYPE_TO_EXT[doc.fileType]) {
          failed.push(`${doc.name}: invalid document type`)
          continue
        }

        // SECURITY: Reject empty payloads (fileData was null/cleared)
        if (!doc.base64Data || doc.base64Data.length === 0) {
          failed.push(`${doc.name}: empty file data`)
          continue
        }

        // SECURITY: Validate base64 size
        if (doc.base64Data.length > MAX_BASE64_LENGTH) {
          failed.push(`${doc.name}: file too large`)
          continue
        }

        // SECURITY: Validate base64 content (prevents garbage binary uploads)
        if (!BASE64_RE.test(doc.base64Data)) {
          failed.push(`${doc.name}: invalid file data`)
          continue
        }

        const ext = FILE_TYPE_TO_EXT[doc.fileType]
        const storagePath = `cad-lab/${projectId}/documents/${doc.id}.${ext}`

        const { error: uploadErr } = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, Buffer.from(doc.base64Data, "base64"), {
            contentType: doc.mimeType,
            upsert: true,
          })

        if (uploadErr) {
          console.error(`[REF-DOCS] Upload failed for ${doc.name}:`, uploadErr.message)
          failed.push(`${doc.name}: upload failed`)
          continue
        }

        const { data: urlData } = admin.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(storagePath)

        stored.push({
          id: doc.id,
          name: doc.name.slice(0, MAX_NAME_LENGTH),
          mimeType: doc.mimeType,
          storageUrl: urlData.publicUrl,
          originalSize: doc.originalSize,
          fileType: doc.fileType,
        })
      }

      if (stored.length === 0 && failed.length > 0) {
        return { error: `All uploads failed: ${failed.join("; ")}` }
      }

      return { stored, failed }
    } catch (err) {
      return { error: sanitizeErrorMessage(err) }
    }
  })
}

/**
 * Extracts text from a document and summarizes it into design-relevant specs via Claude Haiku.
 *
 * @param projectId - Project ID (for ownership verification)
 * @param documentId - Document ID (storage path constructed from projectId + documentId)
 * @param fileType - Document type for extraction method selection
 * @returns Extracted raw text and LLM-summarized specs, or not_applicable for CAD files
 *
 * @security Verifies project ownership. Constructs storage path from validated UUIDs
 * to prevent path traversal. Uses admin client to fetch from Storage.
 */
export async function extractDocumentText(
  projectId: string,
  documentId: string,
  fileType: DocumentFileType,
): Promise<{ rawText: string | null; extractedSpecs: string | null; status: "complete" | "failed" | "not_applicable" } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId || !documentId) return { error: "Missing required parameters" }

    // SECURITY: Validate IDs are UUIDs to prevent path traversal
    if (!UUID_RE.test(projectId) || !UUID_RE.test(documentId)) {
      return { error: "Invalid ID format" }
    }

    // SECURITY: Verify project ownership
    const { data: project, error: projectErr } = await supabase
      .from("cad_lab_projects")
      .select("id")
      .eq("id", projectId)
      .single()

    if (projectErr || !project) {
      return { error: "Project not found or access denied" }
    }

    // CAD files cannot be text-extracted
    if (!EXTRACTABLE_TYPES.includes(fileType)) {
      return { rawText: null, extractedSpecs: null, status: "not_applicable" }
    }

    try {
      const admin = createAdminClient()

      // SECURITY: Construct storage path from validated IDs instead of parsing client-supplied URL.
      // This prevents path traversal via crafted storageUrl (e.g., "../../other-project/secrets").
      const ext = FILE_TYPE_TO_EXT[fileType]
      if (!ext) {
        return { error: "Invalid file type" }
      }
      const urlPath = `cad-lab/${projectId}/documents/${documentId}.${ext}`

      const { data: fileData, error: downloadErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .download(urlPath)

      if (downloadErr || !fileData) {
        console.error(`[REF-DOCS] Download failed for ${documentId}:`, downloadErr?.message)
        return { rawText: null, extractedSpecs: null, status: "failed" }
      }

      const buffer = Buffer.from(await fileData.arrayBuffer())
      let rawText = ""

      // SECURITY: Wrap extraction in timeout to prevent DoS via malformed files
      // (e.g., PDFs with circular references that cause pdf-parse to hang).
      // GOTCHA: Must clear timer on success — otherwise the rejection fires into a
      // settled Promise, producing an unhandled rejection that can crash Node.js.
      const extractWithTimeout = <T,>(promise: Promise<T>): Promise<T> => {
        let timer: ReturnType<typeof setTimeout>
        return Promise.race([
          promise.then((v) => { clearTimeout(timer); return v }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Extraction timed out")), EXTRACTION_TIMEOUT_MS)
          }),
        ])
      }

      // FLOW: Extract text based on file type — same libraries used in analyze.ts
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

      if (!rawText || rawText.trim().length < 20) {
        console.warn(`[REF-DOCS] Insufficient text extracted from ${documentId} (${rawText.length} chars)`)
        return { rawText: rawText || null, extractedSpecs: null, status: "failed" }
      }

      // Cap raw text
      const truncatedText = rawText.slice(0, MAX_RAW_TEXT_CHARS)

      // INTENT: Summarize into design-relevant specs via Claude Haiku
      const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
      if (!apiKey) {
        console.warn("[REF-DOCS] No ANTHROPIC_API_KEY — returning raw text without summarization")
        return { rawText: truncatedText, extractedSpecs: null, status: "complete" }
      }

      const Anthropic = (await import("@anthropic-ai/sdk")).default
      const client = new Anthropic({ apiKey })

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: `You are an engineering document analyzer. Extract design-relevant specifications from the provided document text. Focus on:

1. **Dimensions & Tolerances** — exact measurements, clearances, fit specs
2. **Materials & Properties** — material grades, mechanical properties, surface finishes
3. **Manufacturing Constraints** — process requirements, tooling needs, batch sizes
4. **Performance Requirements** — load ratings, thermal limits, electrical specs
5. **Standards & Compliance** — referenced standards (ISO, ASTM, MIL-SPEC, etc.)
6. **Interface Specifications** — mounting patterns, connector types, mating surfaces
7. **Cost & Lead Time Targets** — budget constraints, delivery timelines

Output a concise, structured summary (under 3000 characters) that a CAD engineer can reference while designing. Use bullet points. Include exact numbers where available. Skip sections with no relevant data.`,
        messages: [{
          role: "user",
          content: `Extract the design-relevant specifications from this document:\n\n${truncatedText}`,
        }],
      })

      const extractedSpecs = response.content[0]?.type === "text" ? response.content[0].text : null

      return {
        rawText: truncatedText,
        extractedSpecs,
        status: "complete",
      }
    } catch (err) {
      console.error(`[REF-DOCS] Extraction failed for ${documentId}:`, err instanceof Error ? err.message : err)
      return { rawText: null, extractedSpecs: null, status: "failed" }
    }
  })
}

/**
 * Saves reference document metadata to the cad_lab_projects JSONB column.
 *
 * @param projectId - The project to update
 * @param documents - Array of stored document metadata
 *
 * @security Verifies project belongs to caller's foundry via RLS-filtered SELECT
 * before updating. Validates document count and URL format.
 */
export async function saveReferenceDocumentUrls(
  projectId: string,
  documents: StoredReferenceDocument[],
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }
    if (!UUID_RE.test(projectId)) return { error: "Invalid project ID format" }
    if (documents.length > MAX_DOCUMENTS_PER_PROJECT) return { error: `Maximum ${MAX_DOCUMENTS_PER_PROJECT} documents` }

    // SECURITY: Verify project exists AND belongs to caller's foundry
    const { data: project, error: checkErr } = await supabase
      .from("cad_lab_projects")
      .select("id")
      .eq("id", projectId)
      .single()

    if (checkErr || !project) {
      return { error: "Project not found or access denied" }
    }

    // SECURITY: Fail-closed URL validation — reject if env var is missing
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseHost) {
      console.error("[REF-DOCS] NEXT_PUBLIC_SUPABASE_URL not configured — rejecting save")
      return { error: "Server configuration error" }
    }
    // SECURITY: Parse hostname to prevent subdomain collision bypass
    // (e.g., "https://project.supabase.co.attacker.com" passes .startsWith() but not hostname check)
    let expectedHostname: string
    try { expectedHostname = new URL(supabaseHost).hostname } catch { return { error: "Server configuration error" } }
    for (const doc of documents) {
      try {
        if (new URL(doc.storageUrl).hostname !== expectedHostname) {
          return { error: "Invalid storage URL detected" }
        }
      } catch { return { error: "Malformed storage URL" } }
      // SECURITY: Validate doc.id is a UUID (prevents crafted JSONB payloads)
      if (!UUID_RE.test(doc.id)) {
        return { error: "Invalid document ID in payload" }
      }
      // SECURITY: Cap name length to prevent JSONB bloat / log poisoning
      if (doc.name.length > MAX_NAME_LENGTH) {
        return { error: "Document name too long" }
      }
    }

    // SECURITY: Strip rawText before JSONB write — large text bodies bloat the DB
    // and rawText is only needed transiently during extraction, not for persistence.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const sanitizedDocs = documents.map(({ rawText, ...rest }) => ({ ...rest, rawText: null }))

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ reference_documents: sanitizedDocs as unknown as Json })
      .eq("id", projectId)

    if (error) {
      console.error("[REF-DOCS] Save failed:", error.message)
      return { error: sanitizeErrorMessage(error) }
    }

    return { success: true }
  })
}

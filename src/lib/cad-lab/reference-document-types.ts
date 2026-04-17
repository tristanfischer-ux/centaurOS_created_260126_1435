export type DocumentFileType = "pdf" | "docx" | "pptx" | "xlsx" | "step" | "stl" | "dxf"
export type DocumentExtractionStatus = "pending" | "extracting" | "complete" | "failed" | "not_applicable"

export const EXTRACTABLE_TYPES: DocumentFileType[] = ["pdf", "docx", "pptx", "xlsx"]

export const MAX_DOCUMENTS_PER_PROJECT = 10
export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024 // 20MB

/** MIME type to file type mapping */
export const MIME_TO_FILE_TYPE: Record<string, DocumentFileType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/step": "step",
  "model/stl": "stl",
}

/** Extension to file type fallback (for CAD files where MIME is octet-stream) */
export const EXT_TO_FILE_TYPE: Record<string, DocumentFileType> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".pptx": "pptx",
  ".xlsx": "xlsx",
  ".step": "step",
  ".stp": "step",
  ".stl": "stl",
  ".dxf": "dxf",
}

export const ACCEPTED_DOCUMENT_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/step",
  "model/stl",
  "application/octet-stream", // CAD files often report this
]

export const ACCEPTED_DOCUMENT_EXTENSIONS = ".pdf,.docx,.pptx,.xlsx,.step,.stp,.stl,.dxf"

/** Client-side document (before/after upload) */
export interface ReferenceDocumentFile {
  id: string
  name: string
  mimeType: string
  fileType: DocumentFileType
  fileData: ArrayBuffer | null // cleared after upload
  originalSize: number
  uploaded: boolean
  storageUrl?: string
  extractionStatus: DocumentExtractionStatus
  extractedSpecs?: string | null
}

/** DB-persisted document metadata */
export interface StoredReferenceDocument {
  id: string
  name: string
  mimeType: string
  /** Signed URL — expires; see storagePath for the stable handle */
  storageUrl: string
  /**
   * Supabase storage path inside xray-images (e.g.
   * `cad-lab/${projectId}/reference-docs/${id}.pdf`). Stable handle for
   * re-signing on project load. Present on NEW uploads (2026-04-17+);
   * legacy rows have undefined and fall back to the stored URL.
   */
  storagePath?: string
  originalSize: number
  fileType: DocumentFileType
  rawText: string | null // full extracted text (stays in DB, not sent to client)
  extractedSpecs: string | null // LLM-summarized design specs
  extractionStatus: DocumentExtractionStatus
  uploadedAt: string
}

/**
 * Detect file type from MIME type with extension fallback.
 * Browsers report application/octet-stream for .step/.stp/.dxf files.
 */
export function detectFileType(fileName: string, mimeType: string): DocumentFileType | null {
  // Try MIME first
  if (MIME_TO_FILE_TYPE[mimeType]) {
    return MIME_TO_FILE_TYPE[mimeType]
  }
  // Fallback to extension
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0]
  if (ext && EXT_TO_FILE_TYPE[ext]) {
    return EXT_TO_FILE_TYPE[ext]
  }
  return null
}

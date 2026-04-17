"use client"

/**
 * @file reference-document-upload.tsx — Drag-and-drop reference document uploader.
 *
 * @description Reusable component for uploading spec sheets, datasheets, CAD files,
 * and other reference documents. Two variants:
 * - "compact" — subtle inline strip for the hero section
 * - "grid" — larger layout with file list for the design intake form
 */

import { useCallback, useRef, useState } from "react"
import { FileText, Presentation, Table, Box, X, Upload, Loader2, Check, AlertTriangle, Info } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { ReferenceDocumentFile, DocumentFileType } from "@/lib/cad-lab/reference-document-types"
import {
  detectFileType,
  ACCEPTED_DOCUMENT_EXTENSIONS,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_DOCUMENTS_PER_PROJECT,
} from "@/lib/cad-lab/reference-document-types"

// ─── Helpers ──────────────────────────────────────────────────────────

function getFileTypeIcon(fileType: DocumentFileType) {
  switch (fileType) {
    case "pdf":
    case "docx":
      return FileText
    case "pptx":
      return Presentation
    case "xlsx":
      return Table
    case "step":
    case "stl":
    case "dxf":
      return Box
    default:
      return FileText
  }
}

function getFileTypeLabel(fileType: DocumentFileType): string {
  switch (fileType) {
    case "pdf": return "PDF"
    case "docx": return "Word"
    case "pptx": return "PowerPoint"
    case "xlsx": return "Excel"
    case "step": return "STEP"
    case "stl": return "STL"
    case "dxf": return "DXF"
    default: return "File"
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Convert ArrayBuffer to base64 using chunked approach to avoid O(n²) string concat */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const CHUNK_SIZE = 8192
  const chunks: string[] = []
  for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.byteLength))
    chunks.push(String.fromCharCode(...chunk))
  }
  return btoa(chunks.join(""))
}

// ── Extraction status badge (stable ref — defined outside component) ──

function StatusBadge({ doc }: { doc: ReferenceDocumentFile }) {
  switch (doc.extractionStatus) {
    case "extracting":
      return <Loader2 className="h-3 w-3 animate-spin text-international-orange" />
    case "complete":
      return <Check className="h-3 w-3 text-success" />
    case "failed":
      return <AlertTriangle className="h-3 w-3 text-warning" />
    case "not_applicable":
      return <Info className="h-3 w-3 text-muted-foreground" />
    default:
      return null
  }
}

// ─── Component ────────────────────────────────────────────────────────

interface ReferenceDocumentUploadProps {
  documents: ReferenceDocumentFile[]
  onDocumentsChange: (documents: ReferenceDocumentFile[]) => void
  maxDocuments?: number
  disabled?: boolean
  variant: "compact" | "grid"
}

export function ReferenceDocumentUpload({
  documents,
  onDocumentsChange,
  maxDocuments = MAX_DOCUMENTS_PER_PROJECT,
  disabled = false,
  variant,
}: ReferenceDocumentUploadProps): React.ReactNode {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const remaining = maxDocuments - documents.length
    if (remaining <= 0) {
      toast.error(`Maximum ${maxDocuments} reference documents allowed`)
      return
    }

    const toProcess = fileArray.slice(0, remaining)
    const newDocs: ReferenceDocumentFile[] = []

    for (const file of toProcess) {
      const fileType = detectFileType(file.name, file.type)
      if (!fileType) {
        toast.error(`${file.name}: Unsupported file type. Accepted: PDF, DOCX, PPTX, XLSX, STEP, STL, DXF`)
        continue
      }
      if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
        toast.error(`${file.name}: File too large (max 20MB)`)
        continue
      }

      try {
        const fileData = await file.arrayBuffer()
        newDocs.push({
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          fileType,
          fileData,
          originalSize: file.size,
          uploaded: false,
          extractionStatus: "pending",
        })
      } catch {
        toast.error(`${file.name}: Failed to read file`)
      }
    }

    if (newDocs.length > 0) {
      onDocumentsChange([...documents, ...newDocs])
    }
  }, [documents, maxDocuments, onDocumentsChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled) return
    processFiles(e.dataTransfer.files)
  }, [disabled, processFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragOver(true)
  }, [disabled])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files)
    e.target.value = ""
  }, [processFiles])

  const handleRemove = useCallback((id: string) => {
    onDocumentsChange(documents.filter((d) => d.id !== id))
  }, [documents, onDocumentsChange])

  const hasDocuments = documents.length > 0
  const canAddMore = documents.length < maxDocuments

  // ── Compact variant (hero section) ──
  if (variant === "compact") {
    return (
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_DOCUMENT_EXTENSIONS}
          multiple
          className="hidden"
          aria-label="Upload reference documents"
          onChange={handleFileSelect}
          disabled={disabled}
        />

        {/* File pills */}
        {hasDocuments && (
          <div className="flex items-center gap-2 flex-wrap">
            {documents.map((doc) => {
              const Icon = getFileTypeIcon(doc.fileType)
              return (
                <div key={doc.id} className="relative group flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-muted/30 text-xs">
                  <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate max-w-[120px]">{doc.name}</span>
                  <StatusBadge doc={doc} />
                  <button
                    type="button"
                    onClick={() => handleRemove(doc.id)}
                    disabled={disabled}
                    className="ml-0.5 h-3.5 w-3.5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-2 w-2" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Drop zone */}
        {canAddMore && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            disabled={disabled}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed text-sm transition-colors",
              isDragOver
                ? "border-international-orange bg-international-orange/5 text-international-orange"
                : "border-border bg-muted/30 text-muted-foreground hover:border-international-orange/40 hover:bg-muted/50 hover:text-foreground",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span>{hasDocuments ? "Add more documents" : "Have specs or datasheets? Drop them here"}</span>
          </button>
        )}
      </div>
    )
  }

  // ── Grid variant (design intake form) ──
  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_EXTENSIONS}
        multiple
        className="hidden"
        onChange={handleFileSelect}
        disabled={disabled}
      />

      {/* Drop zone */}
      {canAddMore && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          disabled={disabled}
          className={cn(
            "w-full flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-lg border-2 border-dashed transition-colors",
            isDragOver
              ? "border-international-orange bg-international-orange/5"
              : "border-border hover:border-international-orange/40",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <Upload className={cn(
            "h-6 w-6",
            isDragOver ? "text-international-orange" : "text-muted-foreground",
          )} />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Drop reference documents here
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              PDF, Word, PowerPoint, Excel, STEP, STL, DXF — up to 20MB each
            </p>
          </div>
        </button>
      )}

      {/* File list */}
      {hasDocuments && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {documents.length} of {maxDocuments} documents
          </p>
          <div className="space-y-1.5">
            {documents.map((doc) => {
              const Icon = getFileTypeIcon(doc.fileType)
              return (
                <div key={doc.id} className="group flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{doc.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {getFileTypeLabel(doc.fileType)} · {formatFileSize(doc.originalSize)}
                      {doc.extractionStatus === "complete" && " · Specs extracted"}
                      {doc.extractionStatus === "not_applicable" && " · CAD file (no text extraction)"}
                      {doc.extractionStatus === "failed" && " · Extraction failed"}
                    </p>
                  </div>
                  <StatusBadge doc={doc} />
                  <button
                    type="button"
                    onClick={() => handleRemove(doc.id)}
                    disabled={disabled}
                    className="h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Re-export helper for context to use when preparing upload payloads
export { arrayBufferToBase64 }

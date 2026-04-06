'use client'

/**
 * DocumentUploadZone — Drag-and-drop zone for extracting knowledge from documents.
 *
 * @description Accepts PDF, DOCX, PPTX, XLSX, TXT, MD, and CSV files. Parses the document server-side,
 * runs the knowledge extraction pipeline, and saves notes to the Knowledge Vault.
 * All specialists can then reference the extracted knowledge.
 *
 * @component
 *
 * @example
 * <DocumentUploadZone onExtractionComplete={() => refreshNotes()} />
 */

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { extractKnowledgeFromUpload } from '@/actions/knowledge'
import { toast } from 'sonner'

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.md', '.csv'] as const

type UploadState = 'idle' | 'extracting' | 'done' | 'error'

interface DocumentUploadZoneProps {
  /** Called after extraction completes so the parent can refresh the notes list */
  onExtractionComplete: () => void
  /** Optional: render as a compact inline variant (for header area) */
  compact?: boolean
}

function validateFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
    return `Unsupported file type "${ext}". Use PDF, DOCX, PPTX, XLSX, TXT, MD, or CSV.`
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
    return `File is too large (${sizeMB} MB). Maximum size is 20 MB.`
  }
  return null
}

export function DocumentUploadZone({ onExtractionComplete, compact }: DocumentUploadZoneProps) {
  const [state, setState] = useState<UploadState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setState('error')
      setErrorMessage(validationError)
      return
    }

    setErrorMessage(null)
    setSavedCount(0)
    setState('extracting')

    const formData = new FormData()
    formData.append('file', file)

    const { data, error } = await extractKnowledgeFromUpload(formData)

    if (error || !data) {
      setState('error')
      setErrorMessage(error ?? 'Extraction failed')
      return
    }

    setSavedCount(data.saved)
    setState('done')

    if (data.saved > 0) {
      toast.success(
        `${data.saved} knowledge note${data.saved === 1 ? '' : 's'} extracted from "${file.name}"`
      )
      onExtractionComplete()
    } else {
      toast.info('No new knowledge found in this document')
    }

    // Reset to idle after a few seconds so the user can upload another
    setTimeout(() => setState('idle'), 4000)
  }, [onExtractionComplete])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const isLoading = state === 'extracting'

  // Compact variant: just a button that opens the file picker
  if (compact) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.csv"
          onChange={handleInputChange}
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="gap-0 sm:gap-2"
          aria-label="Upload Document"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {isLoading ? 'Extracting...' : 'Upload Document'}
          </span>
        </Button>
      </>
    )
  }

  // Full variant: drag-and-drop zone
  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => !isLoading && state !== 'done' && fileInputRef.current?.click()}
      className={cn(
        'relative flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all duration-200 cursor-pointer',
        isDragging
          ? 'border-accent bg-accent/5 scale-[1.005]'
          : 'border-muted-foreground/20 hover:border-accent/40 hover:bg-muted/20',
        isLoading && 'cursor-default pointer-events-none',
        state === 'done' && 'cursor-default'
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.csv"
        onChange={handleInputChange}
      />

      {isLoading ? (
        <>
          <Loader2 className="h-8 w-8 text-accent animate-spin" />
          <p className="text-sm font-medium text-foreground">
            Extracting knowledge from your document...
          </p>
          <p className="text-xs text-muted-foreground">
            This usually takes 30-90 seconds depending on document length
          </p>
        </>
      ) : state === 'done' ? (
        <>
          <CheckCircle2 className="h-8 w-8 text-status-success" />
          <p className="text-sm font-medium text-foreground">
            {savedCount > 0
              ? `${savedCount} knowledge note${savedCount === 1 ? '' : 's'} extracted`
              : 'No new knowledge found in this document'}
          </p>
        </>
      ) : state === 'error' ? (
        <>
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium text-destructive">
            {errorMessage ?? 'Extraction failed'}
          </p>
          <p className="text-xs text-muted-foreground">Click to try again</p>
        </>
      ) : (
        <>
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Drop a document to extract knowledge
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, DOCX, PPTX, XLSX, TXT — extracts facts, insights, and decisions into your vault
            </p>
          </div>
          <Button variant="outline" size="sm" className="mt-1 pointer-events-none">
            Choose file
          </Button>
        </>
      )}
    </div>
  )
}

'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { analyzeBusinessPlan } from '@/actions/analyze'
import { saveBusinessPlanAnalysis, buildSmartMerge } from '@/actions/business-plan'
import { extractKnowledgeFromUpload } from '@/actions/knowledge'
import { toast } from 'sonner'
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
} from '@/lib/business-plan-types'
import type { MergeReviewState } from '@/lib/business-plan-types'

interface BusinessPlanUploadProps {
  lastAnalyzedAt?: string | null
  onMergeReady: (mergeState: MergeReviewState) => void
}

type UploadState = 'idle' | 'reading' | 'analyzing' | 'saving' | 'done' | 'error'

const STEP_LABELS = {
  idle: '',
  reading: 'Reading your document...',
  analyzing: 'Claude is analyzing your business plan...',
  saving: 'Saving results and preparing review...',
  done: 'Analysis complete',
  error: 'Analysis failed',
} satisfies Record<UploadState, string>

// INTENT: Validate file before sending to server to give instant feedback.
// The accept attribute only works on the file picker, not drag-and-drop.
function validateFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
    return `Unsupported file type "${ext}". Please use PDF, DOCX, PPTX, XLSX, TXT, MD, or CSV.`
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
    return `File is too large (${sizeMB} MB). Maximum size is 20 MB.`
  }
  return null
}

/**
 * @description Drag-and-drop zone for business plan upload. Handles the full
 * flow: file → validate → AI analysis → save to DB → smart merge → review dialog.
 */
export function BusinessPlanUpload({ lastAnalyzedAt, onMergeReady }: BusinessPlanUploadProps) {
  const [state, setState] = useState<UploadState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // FLOW: File selected → validate → analyze → save → smart merge → callback
  const handleFile = useCallback(async (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setState('error')
      setErrorMessage(validationError)
      return
    }

    setErrorMessage(null)

    setState('reading')
    const formData = new FormData()
    formData.append('file', file)

    setState('analyzing')

    // DECISION: Run Sonnet sections (server action, <60s) and Opus objectives
    // (API route, up to 300s) in parallel from the client. Server actions are
    // capped at 60s on Vercel — Opus needs 60-150s so it MUST use an API route.
    const [result, objectivesResult] = await Promise.all([
      analyzeBusinessPlan(formData),
      // Call the dedicated API route for Opus objectives extraction
      (async () => {
        try {
          // Extract text from the file first (same as the server action does)
          const extractForm = new FormData()
          extractForm.append('file', file)
          const { extractDocumentText } = await import('@/actions/extract-document-text')
          const extracted = await extractDocumentText(extractForm)
          if (!extracted.success || !extracted.text) return null

          const res = await fetch('/api/analyze-objectives', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: extracted.text.slice(0, 100000) }),
          })
          if (!res.ok) return null
          const data = await res.json()
          return data.raw as string | null
        } catch {
          return null
        }
      })(),
    ])

    // Merge Opus objectives into the analysis result if the server action
    // returned empty objectives but the API route succeeded
    console.log('[BP Import] Sonnet objectives:', result.analysis?.objectives?.length ?? 'no analysis')
    console.log('[BP Import] Opus raw result:', objectivesResult ? `${objectivesResult.length} chars` : 'null')

    if (result.analysis && objectivesResult) {
      try {
        const parsed = JSON.parse(objectivesResult)
        console.log('[BP Import] Opus parsed objectives:', Array.isArray(parsed) ? parsed.length : 'not array')
        if (Array.isArray(parsed) && parsed.length > 0 && result.analysis.objectives.length === 0) {
          result.analysis.objectives = parsed
          console.log('[BP Import] Merged Opus objectives into analysis')
        }
      } catch (e) {
        console.error('[BP Import] Opus parse failed:', e)
      }
    }

    console.log('[BP Import] Final objectives count:', result.analysis?.objectives?.length ?? 0)

    if (result.error || !result.analysis) {
      setState('error')
      setErrorMessage(result.error ?? 'Unknown error during analysis')
      return
    }

    setState('saving')
    const { analysisId, error: saveError } = await saveBusinessPlanAnalysis(
      result.analysis,
      file.name
    )

    if (saveError || !analysisId) {
      setState('error')
      setErrorMessage(saveError ?? 'Failed to save analysis')
      return
    }

    const { mergeState, error: mergeError } = await buildSmartMerge(result.analysis, analysisId)

    if (mergeError || !mergeState) {
      setState('error')
      setErrorMessage(mergeError ?? 'Failed to build merge review')
      return
    }

    // FLOW: Fire-and-forget knowledge extraction from the document.
    // The same file is re-parsed server-side — negligible cost vs the LLM calls.
    // Extracted notes appear in the Knowledge Vault for all specialists.
    const extractionForm = new FormData()
    extractionForm.append('file', file)
    extractKnowledgeFromUpload(extractionForm)
      .then(({ data }) => {
        if (data && data.saved > 0) {
          toast.success(`${data.saved} knowledge note${data.saved === 1 ? '' : 's'} extracted from your document`)
        }
      })
      .catch(() => { /* best-effort — don't disrupt the main flow */ })

    setState('done')
    onMergeReady(mergeState)
  }, [onMergeReady])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    // INTENT: Support dragged text (e.g. from a browser or editor) in addition
    // to file drops. We check for text first, then fall back to file handling.
    const textData = e.dataTransfer.getData('text/plain')
    if (textData && textData.trim().length > 10) {
      const textFile = new File([textData], 'pasted-content.md', { type: 'text/markdown' })
      handleFile(textFile)
      return
    }

    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleReAnalyze = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setState('idle')
    fileInputRef.current?.click()
  }

  const isLoading = state === 'reading' || state === 'analyzing' || state === 'saving'

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => !isLoading && state !== 'done' && fileInputRef.current?.click()}
      className={cn(
        'relative flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 transition-all duration-200 cursor-pointer',
        isDragging
          ? 'border-accent bg-accent/5 scale-[1.01]'
          : 'border-muted-foreground/25 hover:border-accent/50 hover:bg-muted/30',
        isLoading && 'cursor-default pointer-events-none'
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
          <p className="text-sm font-medium text-foreground">{STEP_LABELS[state]}</p>
          <p className="text-xs text-muted-foreground">This usually takes 30-60 seconds</p>
        </>
      ) : state === 'done' ? (
        <>
          <CheckCircle2 className="h-8 w-8 text-status-success" />
          <p className="text-sm font-medium text-foreground">Analysis complete — review suggestions below</p>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5"
            onClick={handleReAnalyze}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-analyse with updated plan
          </Button>
        </>
      ) : state === 'error' ? (
        <>
          <FileText className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium text-destructive">{errorMessage ?? 'Analysis failed'}</p>
          <p className="text-xs text-muted-foreground">Click to try again with a different file</p>
        </>
      ) : (
        <>
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Drop your business plan here
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, DOCX, PPTX, XLSX, TXT — generates your strategy, team plan, and funding needs
            </p>
          </div>
          {lastAnalyzedAt && (
            <p className="text-xs text-muted-foreground">
              Last analysed: {new Date(lastAnalyzedAt).toLocaleDateString()}
            </p>
          )}
          <Button variant="outline" size="sm" className="mt-1 pointer-events-none">
            Choose file
          </Button>
        </>
      )}
    </div>
  )
}

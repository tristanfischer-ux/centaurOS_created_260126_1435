'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { analyzeBusinessPlan } from '@/actions/analyze'
import { saveBusinessPlanAnalysis, buildSmartMerge } from '@/actions/business-plan'
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
    return `Unsupported file type "${ext}". Please use PDF, DOCX, or TXT.`
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
    const result = await analyzeBusinessPlan(formData)

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

    setState('done')
    onMergeReady(mergeState)
  }, [onMergeReady])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
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
        accept=".pdf,.txt,.docx"
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
              PDF, DOCX, or TXT — generates your strategy, team plan, and funding needs
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

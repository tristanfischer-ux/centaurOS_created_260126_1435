'use client'

import { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Upload,
  X,
  FileIcon,
  FileText,
  Image,
  Loader2,
  AlertCircle,
} from 'lucide-react'

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  path: string
  uploading?: boolean
  error?: string
}

interface RFQFileUploadProps {
  files: UploadedFile[]
  onFilesChange: (files: UploadedFile[]) => void
  maxFiles?: number
  maxSizeMB?: number
  disabled?: boolean
  className?: string
}

const ALLOWED_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv', '.zip',
  '.stl', '.step', '.stp', '.iges', '.igs', '.dxf', '.dwg',
]

export function RFQFileUpload({
  files,
  onFilesChange,
  maxFiles = 10,
  maxSizeMB = 25,
  disabled = false,
  className,
}: RFQFileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Use ref to track current files for async updates
  const filesRef = useRef(files)
  filesRef.current = files

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getFileIcon = (type: string, name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      return <Image className="w-5 h-5 text-blue-500" />
    }
    if (type === 'application/pdf' || ext === 'pdf') {
      return <FileText className="w-5 h-5 text-red-500" />
    }
    return <FileIcon className="w-5 h-5 text-muted-foreground" />
  }

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File exceeds ${maxSizeMB}MB limit`
    }

    // Check file type by extension (more reliable for CAD files)
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return 'File type not supported'
    }

    return null
  }

  // Helper to update a specific file in the list
  const updateFile = useCallback((fileId: string, updates: Partial<UploadedFile>) => {
    const updatedFiles = filesRef.current.map(f =>
      f.id === fileId ? { ...f, ...updates } : f
    )
    onFilesChange(updatedFiles)
  }, [onFilesChange])

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || disabled) return

    const currentFiles = filesRef.current
    const remainingSlots = maxFiles - currentFiles.length
    if (remainingSlots <= 0) return

    const newFiles: UploadedFile[] = []
    const filesToProcess = Array.from(fileList).slice(0, remainingSlots)

    for (const file of filesToProcess) {
      const error = validateFile(file)
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
      
      newFiles.push({
        id: tempId,
        name: file.name,
        size: file.size,
        type: file.type,
        path: '', // Will be set after upload
        uploading: !error,
        error: error || undefined,
      })
    }

    // Add files immediately (showing upload state)
    onFilesChange([...currentFiles, ...newFiles])

    // Upload each file
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i]
      const tempFile = newFiles[i]

      if (tempFile.error) continue

      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/rfq/upload', {
          method: 'POST',
          body: formData,
        })

        const result = await response.json()

        if (!response.ok || result.error) {
          updateFile(tempFile.id, {
            uploading: false,
            error: result.error || 'Upload failed',
          })
        } else {
          updateFile(tempFile.id, {
            id: result.id || tempFile.id,
            path: result.path,
            uploading: false,
          })
        }
      } catch (err) {
        console.error('Upload error:', err)
        updateFile(tempFile.id, {
          uploading: false,
          error: 'Network error',
        })
      }
    }
  }, [maxFiles, disabled, onFilesChange, updateFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const removeFile = (fileId: string) => {
    onFilesChange(files.filter(f => f.id !== fileId))
  }

  const canAddMore = files.length < maxFiles

  return (
    <div className={cn('space-y-3', className)}>
      {/* Drop zone */}
      {canAddMore && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={cn(
            'relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/50',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_EXTENSIONS.join(',')}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            disabled={disabled}
          />
          
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="p-3 rounded-full bg-muted">
              <Upload className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Drop files here or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, images, CAD files, documents up to {maxSizeMB}MB each
              </p>
            </div>
          </div>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border',
                file.error
                  ? 'border-destructive/50 bg-destructive/5'
                  : 'border-border bg-muted/30'
              )}
            >
              <div className="flex-shrink-0">
                {file.uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : file.error ? (
                  <AlertCircle className="w-5 h-5 text-destructive" />
                ) : (
                  getFileIcon(file.type, file.name)
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {file.error ? (
                    <span className="text-destructive">{file.error}</span>
                  ) : file.uploading ? (
                    'Uploading...'
                  ) : (
                    formatFileSize(file.size)
                  )}
                </p>
              </div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFile(file.id)}
                      disabled={disabled}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove file</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ))}
        </div>
      )}

      {/* File count */}
      {files.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {files.length}/{maxFiles} files
        </p>
      )}
    </div>
  )
}

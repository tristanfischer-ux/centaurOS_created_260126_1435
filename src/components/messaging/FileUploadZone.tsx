'use client'

/**
 * Enhanced File Upload Zone
 * 
 * Features:
 * - Drag and drop support
 * - Image previews before sending
 * - Upload progress indicator
 * - File type validation
 * - Image lightbox for viewing
 */

import { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Paperclip, X, Image as ImageIcon, FileIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { validateFile } from '@/lib/file-upload'
import Image from 'next/image'

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void
  disabled?: boolean
  className?: string
}

export function FileUploadZone({
  onFileSelect,
  disabled = false,
  className
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled) return

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      const file = files[0]
      const validation = validateFile(file)
      
      if (validation.valid) {
        onFileSelect(file)
      } else {
        toast.error(validation.error || 'Invalid file')
      }
    }
  }, [disabled, onFileSelect])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      const validation = validateFile(file)
      
      if (validation.valid) {
        onFileSelect(file)
      } else {
        toast.error(validation.error || 'Invalid file')
      }
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [onFileSelect])

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        disabled={disabled}
      />
      
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          'relative',
          isDragging && 'ring-2 ring-international-orange',
          className
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        title="Attach file"
        aria-label="Attach file"
      >
        <Paperclip className="h-4 w-4" />
      </Button>
    </>
  )
}

/**
 * File Preview with Progress
 */
interface FilePreviewProps {
  file: File
  progress?: number
  onRemove?: () => void
  onView?: () => void
  className?: string
}

export function FilePreview({
  file,
  progress = 0,
  onRemove,
  onView,
  className
}: FilePreviewProps) {
  const isImage = file.type.startsWith('image/')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Generate preview for images
  useState(() => {
    if (isImage) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  })

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/50',
        className
      )}
    >
      {/* File icon or image preview */}
      <div className="flex-shrink-0">
        {isImage && previewUrl ? (
          <button
            onClick={onView}
            className="relative h-12 w-12 rounded overflow-hidden hover:opacity-80 transition-opacity"
          >
            <Image
              src={previewUrl}
              alt={file.name}
              fill
              className="object-cover"
            />
          </button>
        ) : (
          <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
            <FileIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {(file.size / 1024).toFixed(1)} KB
        </p>
        
        {/* Progress bar */}
        {progress > 0 && progress < 100 && (
          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-international-orange transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Remove button */}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-6 w-6 flex-shrink-0"
          aria-label="Remove file"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
      
      {/* Loading indicator */}
      {progress > 0 && progress < 100 && (
        <Loader2 className="h-4 w-4 text-international-orange animate-spin flex-shrink-0" />
      )}
    </div>
  )
}

/**
 * Image Lightbox
 */
interface ImageLightboxProps {
  src: string
  alt: string
  open: boolean
  onClose: () => void
}

export function ImageLightbox({
  src,
  alt,
  open,
  onClose
}: ImageLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent size="lg" className="p-0 bg-background">
        <div className="relative w-full min-h-[400px] max-h-[80vh] flex items-center justify-center p-4">
          <div className="relative w-full h-full">
            <Image
              src={src}
              alt={alt}
              fill
              className="object-contain"
              sizes="(max-width: 1024px) 100vw, 896px"
            />
          </div>
          
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute top-4 right-4 bg-background/80 hover:bg-background"
            aria-label="Close image preview"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Drag and Drop Overlay
 */
interface DragDropOverlayProps {
  show: boolean
  onDrop: (files: FileList) => void
  onDragLeave: () => void
}

export function DragDropOverlay({
  show,
  onDrop,
  onDragLeave
}: DragDropOverlayProps) {
  if (!show) return null

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDrop(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-international-orange/10 backdrop-blur-sm flex items-center justify-center"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
    >
      <div className="bg-background border-2 border-dashed border-international-orange rounded-2xl p-12 text-center">
        <Paperclip className="h-16 w-16 text-international-orange mx-auto mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">
          Drop file to upload
        </p>
        <p className="text-sm text-muted-foreground">
          Images, PDFs, and documents supported
        </p>
      </div>
    </div>
  )
}

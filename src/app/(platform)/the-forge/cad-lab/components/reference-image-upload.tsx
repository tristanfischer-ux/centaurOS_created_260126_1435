"use client"

/**
 * @file reference-image-upload.tsx — Drag-and-drop reference image uploader.
 *
 * @description Reusable component for uploading sketches, photos, or technical
 * drawings as reference images. Two variants:
 * - "compact" — subtle inline strip for the hero section
 * - "grid" — larger grid layout for the design intake form
 */

import { useCallback, useRef, useEffect, useState } from "react"
import { ImagePlus, X, Upload } from "lucide-react"
import { toast } from "sonner"
import type { ReferenceImageFile } from "@/lib/cad-lab/reference-image-types"
import { cn } from "@/lib/utils"

// ─── Constants ────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_RESIZE_EDGE = 2048
const MAX_IMAGES_DEFAULT = 10 // matches server MAX_IMAGES_PER_PROJECT
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"]

// ─── Helpers ──────────────────────────────────────────────────────────

/** Resize image to max edge length, preserving original format. Returns base64. */
function resizeImage(file: File, maxEdge: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxEdge || height > maxEdge) {
        const scale = maxEdge / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas not supported")); return }
      ctx.drawImage(img, 0, 0, width, height)
      // DECISION: Preserve original format when possible. JPEG stays JPEG (smaller).
      // WebP stays WebP. PNG stays PNG. Fallback to PNG for unknown types.
      const outputType = ACCEPTED_TYPES.includes(file.type) ? file.type : "image/png"
      const quality = outputType === "image/jpeg" ? 0.9 : undefined
      const dataUrl = canvas.toDataURL(outputType, quality)
      const base64 = dataUrl.split(",")[1]
      resolve(base64)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")) }
    img.src = url
  })
}

// ─── Component ────────────────────────────────────────────────────────

interface ReferenceImageUploadProps {
  images: ReferenceImageFile[]
  onImagesChange: (images: ReferenceImageFile[]) => void
  maxImages?: number
  disabled?: boolean
  variant: "compact" | "grid"
}

export function ReferenceImageUpload({
  images,
  onImagesChange,
  maxImages = MAX_IMAGES_DEFAULT,
  disabled = false,
  variant,
}: ReferenceImageUploadProps): React.ReactNode {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // INTENT: Revoke object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      images.forEach((img) => {
        if (img.previewUrl && img.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(img.previewUrl)
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const remaining = maxImages - images.length
    if (remaining <= 0) {
      toast.error(`Maximum ${maxImages} reference images allowed`)
      return
    }

    const toProcess = fileArray.slice(0, remaining)
    const newImages: ReferenceImageFile[] = []

    for (const file of toProcess) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: Only PNG, JPEG, and WebP images are accepted`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: File too large (max 10MB)`)
        continue
      }

      try {
        const base64 = await resizeImage(file, MAX_RESIZE_EDGE)
        const previewUrl = URL.createObjectURL(file)
        newImages.push({
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type,
          base64,
          previewUrl,
          originalSize: file.size,
          uploaded: false,
        })
      } catch {
        toast.error(`${file.name}: Failed to process image`)
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages])
    }
  }, [images, maxImages, onImagesChange])

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
    // Reset so the same file can be re-selected
    e.target.value = ""
  }, [processFiles])

  const handleRemove = useCallback((id: string) => {
    const img = images.find((i) => i.id === id)
    if (img?.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(img.previewUrl)
    }
    onImagesChange(images.filter((i) => i.id !== id))
  }, [images, onImagesChange])

  const hasImages = images.length > 0
  const canAddMore = images.length < maxImages

  // ── Compact variant (hero section) ──
  if (variant === "compact") {
    return (
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={handleFileSelect}
          disabled={disabled}
        />

        {/* Thumbnails strip */}
        {hasImages && (
          <div className="flex items-center gap-2 flex-wrap">
            {images.map((img) => (
              <div key={img.id} className="relative group">
                <img
                  src={img.previewUrl}
                  alt={img.name}
                  className="h-12 w-12 rounded-md object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={() => handleRemove(img.id)}
                  disabled={disabled}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
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
            <ImagePlus className="h-4 w-4 shrink-0" />
            <span>{hasImages ? "Add more references" : "Have a sketch or photo? Drop it here"}</span>
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
        accept={ACCEPTED_TYPES.join(",")}
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
              Drop reference images here
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sketches, photos, or technical drawings — PNG, JPEG, WebP up to 10MB
            </p>
          </div>
        </button>
      )}

      {/* Thumbnail grid */}
      {hasImages && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {images.length} of {maxImages} images
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
            {images.map((img) => (
              <div key={img.id} className="relative group">
                <img
                  src={img.previewUrl}
                  alt={img.name}
                  className="h-20 w-full rounded-lg object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={() => handleRemove(img.id)}
                  disabled={disabled}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
                <p className="text-[10px] text-muted-foreground mt-1 truncate">
                  {(img.originalSize / 1024).toFixed(0)} KB
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

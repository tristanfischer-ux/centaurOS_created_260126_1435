/** Client-side reference image (before/after upload) */
export interface ReferenceImageFile {
  id: string // crypto.randomUUID()
  name: string // original filename
  mimeType: string // image/png, image/jpeg, image/webp
  base64: string // resized to max 2048px
  previewUrl: string // URL.createObjectURL() for thumbnail
  originalSize: number // bytes
  uploaded: boolean // whether persisted to storage
  storageUrl?: string // supabase public URL (set after upload)
}

/** DB-persisted reference image metadata */
export interface StoredReferenceImage {
  id: string
  name: string
  mimeType: string
  storageUrl: string
  originalSize: number
}

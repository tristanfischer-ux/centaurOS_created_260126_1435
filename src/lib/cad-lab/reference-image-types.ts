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
  /**
   * Signed Supabase storage URL for immediate rendering.
   * Expires — see `storagePath` below for the long-lived handle.
   */
  storageUrl: string
  /**
   * Supabase storage path inside the xray-images bucket (e.g.
   * `cad-lab/${projectId}/reference/${id}.png`). This is the long-lived
   * handle — signed URLs expire (currently 30 days), but the path is stable
   * so we can call createSignedUrl() again on project load to produce a
   * fresh URL. Present on NEW uploads (2026-04-17+). Legacy rows have
   * undefined; UI falls back to the stored URL and prompts re-upload if
   * it 403s.
   */
  storagePath?: string
  originalSize: number
}

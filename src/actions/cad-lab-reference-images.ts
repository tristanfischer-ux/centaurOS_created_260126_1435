"use server"

/**
 * @file cad-lab-reference-images.ts — Server actions for reference image upload.
 *
 * @description Uploads user-provided reference images (sketches, photos, drawings)
 * to Supabase Storage and persists metadata to the cad_lab_projects table.
 *
 * @security All actions require authentication via withAuth. Both actions verify
 * the projectId belongs to the caller's foundry before proceeding.
 */

import { withAuth } from "@/lib/server-action-utils"
import { sanitizeErrorMessage } from "@/lib/security/sanitize"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkStorageQuota } from "@/lib/billing/storage-quota"
import { ensureCadLabProjectOwnership } from "@/lib/cad-lab/project-ownership"
import type { Json } from "@/types/database.types"
import type { StoredReferenceImage } from "@/lib/cad-lab/reference-image-types"

const STORAGE_BUCKET = "xray-images"
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
const MAX_IMAGES_PER_REQUEST = 5
const MAX_IMAGES_PER_PROJECT = 10
const MAX_NAME_LENGTH = 255
/** Server-side base64 size limit: ~15MB base64 ≈ ~11MB raw (after client resize, images are usually <2MB) */
const MAX_BASE64_LENGTH = 20_000_000
// SECURITY: Prevent path traversal via crafted image IDs
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Uploads reference images to Supabase Storage.
 *
 * @param projectId - The project to attach images to
 * @param images - Array of {id, name, mimeType, base64} to upload
 * @returns Array of stored image metadata with public URLs, plus any failures
 *
 * @security Verifies project belongs to caller's foundry before uploading.
 */
export async function uploadReferenceImages(
  projectId: string,
  images: Array<{ id: string; name: string; mimeType: string; base64: string; originalSize: number }>,
): Promise<{ stored: StoredReferenceImage[]; failed: string[] } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // VALIDATION: Input checks
    if (!projectId) return { error: "Project ID required" }
    if (!UUID_RE.test(projectId)) return { error: "Invalid project ID format" }
    if (!images.length) return { error: "No images to upload" }
    if (images.length > MAX_IMAGES_PER_REQUEST) return { error: `Maximum ${MAX_IMAGES_PER_REQUEST} images per upload` }

    // SECURITY: Enforce per-foundry storage quota before upload
    const quota = await checkStorageQuota(foundryId)
    if (!quota.allowed) {
      return { error: `Storage limit reached (${quota.currentMB}MB / ${quota.limitMB}MB). Upgrade your plan for more storage.` }
    }

    // SECURITY: Verify project belongs to caller's foundry (RLS enforces this via SELECT)
    const { data: project, error: projectErr } = await supabase
      .from("cad_lab_projects")
      .select("id, reference_images")
      .eq("id", projectId)
      .single()

    if (projectErr || !project) {
      return { error: "Project not found or access denied" }
    }

    // VALIDATION: Check total image count (existing + new) doesn't exceed limit
    const existingCount = Array.isArray(project.reference_images) ? (project.reference_images as unknown[]).length : 0
    if (existingCount + images.length > MAX_IMAGES_PER_PROJECT) {
      return { error: `Maximum ${MAX_IMAGES_PER_PROJECT} reference images per project (${existingCount} existing)` }
    }

    try {
      const admin = createAdminClient()
      const stored: StoredReferenceImage[] = []
      const failed: string[] = []

      for (const img of images) {
        // SECURITY: Validate img.id is a UUID to prevent path traversal
        if (!UUID_RE.test(img.id)) {
          failed.push(`${img.name}: invalid image ID`)
          continue
        }

        // SECURITY: Validate MIME type server-side
        if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(img.mimeType)) {
          failed.push(`${img.name}: invalid file type (${img.mimeType})`)
          continue
        }

        // SECURITY: Reject empty payloads
        if (!img.base64 || img.base64.length === 0) {
          failed.push(`${img.name}: empty image data`)
          continue
        }

        // SECURITY: Validate base64 size server-side (prevents bypass of client 10MB limit)
        if (img.base64.length > MAX_BASE64_LENGTH) {
          failed.push(`${img.name}: file too large`)
          continue
        }

        // VALIDATION: Verify base64 is valid before decoding
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(img.base64)) {
          failed.push(`${img.name}: invalid image data`)
          continue
        }

        const ext = img.mimeType === "image/jpeg" ? "jpg" : img.mimeType === "image/webp" ? "webp" : "png"
        const storagePath = `cad-lab/${projectId}/reference/${img.id}.${ext}`

        const { error: uploadErr } = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, Buffer.from(img.base64, "base64"), {
            contentType: img.mimeType,
            upsert: true,
          })

        if (uploadErr) {
          console.error(`[REF-IMAGES] Upload failed for ${img.name}:`, uploadErr.message)
          failed.push(`${img.name}: upload failed`)
          continue
        }

        // SECURITY: Signed URL for immediate rendering. Persist `storagePath`
        // alongside so handleLoadProject can re-sign on load (URLs expire; the
        // path is stable). 30d TTL is a sanity bound — refreshReferenceUrls
        // will re-sign fresh on every load.
        const { data: urlData } = await admin.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(storagePath, 60 * 60 * 24 * 30)

        stored.push({
          id: img.id,
          name: img.name.slice(0, MAX_NAME_LENGTH),
          mimeType: img.mimeType,
          storageUrl: urlData?.signedUrl ?? '',
          storagePath,
          originalSize: img.originalSize,
        })
      }

      // INTENT: Return both successes and failures so the client can show feedback
      if (stored.length === 0 && failed.length > 0) {
        return { error: `All uploads failed: ${failed.join("; ")}` }
      }

      return { stored, failed }
    } catch (err) {
      return { error: sanitizeErrorMessage(err) }
    }
  })
}

/**
 * Saves reference image metadata to the cad_lab_projects JSONB column.
 *
 * @param projectId - The project to update
 * @param images - Array of stored image metadata
 *
 * @security Verifies project belongs to caller's foundry via RLS-filtered SELECT
 * before updating. Validates image count and URL format.
 */
export async function saveReferenceImageUrls(
  projectId: string,
  images: StoredReferenceImage[],
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId) return { error: "Project ID required" }
    if (!UUID_RE.test(projectId)) return { error: "Invalid project ID format" }
    if (images.length > MAX_IMAGES_PER_PROJECT) return { error: `Maximum ${MAX_IMAGES_PER_PROJECT} images` }

    // SECURITY: Verify project exists AND belongs to caller's foundry
    // RLS SELECT policy enforces foundry_id match — if this returns null,
    // the project either doesn't exist or belongs to a different foundry.
    const { data: project, error: checkErr } = await supabase
      .from("cad_lab_projects")
      .select("id")
      .eq("id", projectId)
      .single()

    if (checkErr || !project) {
      return { error: "Project not found or access denied" }
    }

    // SECURITY: Fail-closed URL validation — reject if env var is missing
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseHost) {
      console.error("[REF-IMAGES] NEXT_PUBLIC_SUPABASE_URL not configured — rejecting save")
      return { error: "Server configuration error" }
    }
    // SECURITY: Parse hostname to prevent subdomain collision bypass
    let expectedHostname: string
    try { expectedHostname = new URL(supabaseHost).hostname } catch { return { error: "Server configuration error" } }
    const expectedPathPrefix = `cad-lab/${projectId}/reference/`
    for (const img of images) {
      try {
        if (new URL(img.storageUrl).hostname !== expectedHostname) {
          return { error: "Invalid storage URL detected" }
        }
      } catch { return { error: "Malformed storage URL" } }
      // SECURITY: Validate img.id is a UUID (prevents crafted JSONB payloads)
      if (!UUID_RE.test(img.id)) {
        return { error: "Invalid image ID in payload" }
      }
      // SECURITY: Cap name length to prevent JSONB bloat / log poisoning
      if (img.name.length > MAX_NAME_LENGTH) {
        return { error: "Image name too long" }
      }
      // SECURITY: If storagePath is present, it must live under this project's
      // reference prefix. Blocks a crafted payload from writing a path that
      // belongs to another project/foundry (which would leak on resign).
      if (img.storagePath !== undefined) {
        if (typeof img.storagePath !== "string" || !img.storagePath.startsWith(expectedPathPrefix)) {
          return { error: "Invalid storage path" }
        }
      }
    }

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ reference_images: images as unknown as Json })
      .eq("id", projectId)

    if (error) {
      console.error("[REF-IMAGES] Save failed:", error.message)
      return { error: sanitizeErrorMessage(error) }
    }

    return { success: true }
  })
}

// ─── Refresh signed URLs on project load ────────────────────────────

/**
 * Re-signs a batch of reference image storage paths.
 *
 * @description Reference image signed URLs expire (30 day TTL is a sanity
 * bound). On every project load we call this to guarantee fresh URLs —
 * avoids the class of bug where a <img src> 403s silently because the URL
 * has expired since last save.
 *
 * Only processes paths — legacy rows without `storagePath` are skipped
 * (caller falls back to their stored URL).
 *
 * @param projectId - Project that owns these paths (for ownership + rate limit scope)
 * @param paths - storagePath values from StoredReferenceImage rows
 * @returns Map from path → fresh signed URL (or null if re-sign failed)
 *
 * @security Caller's foundry must own the project — enforced via
 * ensureCadLabProjectOwnership. Paths are validated to live under
 * `cad-lab/${projectId}/reference/` so an authed user can't resign paths
 * from another project.
 */
export async function refreshReferenceImageUrls(
  projectId: string,
  paths: string[],
): Promise<{ urls: Record<string, string> } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const ownershipErr = await ensureCadLabProjectOwnership(supabase, projectId, foundryId)
    if (ownershipErr) return { error: ownershipErr }

    if (!Array.isArray(paths) || paths.length === 0) return { urls: {} }
    // Cap to the per-project limit so a crafted payload can't enumerate storage
    const capped = paths.slice(0, MAX_IMAGES_PER_PROJECT)

    const admin = createAdminClient()
    const urls: Record<string, string> = {}
    const expectedPrefix = `cad-lab/${projectId}/reference/`
    for (const p of capped) {
      // SECURITY: Only re-sign paths under the caller's project prefix
      if (typeof p !== "string" || !p.startsWith(expectedPrefix)) continue
      const { data, error } = await admin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(p, 60 * 60 * 24 * 30)
      if (!error && data?.signedUrl) urls[p] = data.signedUrl
    }
    return { urls }
  })
}

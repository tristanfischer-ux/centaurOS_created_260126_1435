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
import type { Json } from "@/types/database.types"
import type { StoredReferenceImage } from "@/lib/cad-lab/reference-image-types"

const STORAGE_BUCKET = "xray-images"
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
const MAX_IMAGES_PER_REQUEST = 5
const MAX_IMAGES_PER_PROJECT = 10
/** Server-side base64 size limit: ~15MB base64 ≈ ~11MB raw (after client resize, images are usually <2MB) */
const MAX_BASE64_LENGTH = 20_000_000

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
  return withAuth(async ({ supabase }) => {
    // VALIDATION: Input checks
    if (!projectId) return { error: "Project ID required" }
    if (!images.length) return { error: "No images to upload" }
    if (images.length > MAX_IMAGES_PER_REQUEST) return { error: `Maximum ${MAX_IMAGES_PER_REQUEST} images per upload` }

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
        // SECURITY: Validate MIME type server-side
        if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(img.mimeType)) {
          failed.push(`${img.name}: invalid file type (${img.mimeType})`)
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

        const { data: urlData } = admin.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(storagePath)

        stored.push({
          id: img.id,
          name: img.name,
          mimeType: img.mimeType,
          storageUrl: urlData.publicUrl,
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

    // SECURITY: Validate each storageUrl points to our Supabase domain
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    for (const img of images) {
      if (supabaseHost && !img.storageUrl.startsWith(supabaseHost)) {
        return { error: "Invalid storage URL detected" }
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

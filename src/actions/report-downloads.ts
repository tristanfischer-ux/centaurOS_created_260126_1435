'use server'

/**
 * @file report-downloads.ts
 *
 * @description Server actions for the report_downloads table — persistent
 * tracking of all exported reports (CAD Lab, general reports, presentations)
 * for re-download from a central Downloads tab.
 *
 * @security Requires authenticated user with foundry context. RLS ensures
 * foundry isolation. Admin client used for Storage operations (signed URLs,
 * file deletion) that require elevated access. Signed URLs (not public URLs)
 * are generated on-demand to prevent unauthenticated access to report files.
 *
 * @related
 * - src/components/reports/ReportDownloads.tsx — UI consumer
 * - src/app/(platform)/the-forge/cad-lab/components/design-report-dialog.tsx — CAD Lab caller
 * - src/app/(platform)/reports/page.tsx — General reports caller
 */

import { withAuth, type ActionError } from '@/lib/server-action-utils'
import { createAdminClient } from '@/lib/supabase/admin'

export type ReportSource = 'cad-lab' | 'reports' | 'investors' | 'finance' | 'agents'
export type FileFormat = 'docx' | 'pptx' | 'pdf' | 'csv' | 'png'

export interface ReportDownloadRow {
  id: string
  reportName: string
  reportSource: ReportSource
  fileFormat: FileFormat
  fileUrl: string | null
  fileSizeBytes: number | null
  storagePath: string | null
  expiresAt: string
  createdAt: string
}

// ─── Save ────────────────────────────────────────────────────────────────

interface SaveInput {
  reportName: string
  reportSource: ReportSource
  fileFormat: FileFormat
  fileSizeBytes?: number | null
  storagePath?: string | null
}

export async function saveReportDownload(
  input: SaveInput,
): Promise<{ success: true; id: string } | ActionError> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: file_url is NOT stored — signed URLs are generated on-demand
    // in getReportDownloads() to prevent unauthenticated access via public URLs.
    const { data, error } = await supabase
      .from('report_downloads')
      .insert({
        foundry_id: foundryId,
        profile_id: user.id,
        report_name: input.reportName.slice(0, 500),
        report_source: input.reportSource,
        file_format: input.fileFormat,
        file_url: null,
        file_size_bytes: input.fileSizeBytes ?? null,
        storage_path: input.storagePath ?? null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[ReportDownloads] Save failed:', error.message)
      return { error: error.message }
    }

    return { success: true as const, id: data.id }
  })
}

// ─── List ────────────────────────────────────────────────────────────────

const MAX_DOWNLOADS = 50
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour

// INTENT: Bucket migration — new uploads go to 'report-exports' (private),
// but existing rows may reference files in 'xray-images' (public, legacy).
// We try report-exports first, then fall back to xray-images for legacy files.
// Once all legacy entries expire (30 days from creation), the fallback can be removed.
const CURRENT_BUCKET = 'report-exports'
const LEGACY_BUCKET = 'xray-images'

export async function getReportDownloads(): Promise<
  { success: true; downloads: ReportDownloadRow[] } | ActionError
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await supabase
      .from('report_downloads')
      .select('id, report_name, report_source, file_format, file_size_bytes, storage_path, expires_at, created_at')
      .eq('foundry_id', foundryId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(MAX_DOWNLOADS)

    if (error) {
      console.error('[ReportDownloads] List failed:', error.message)
      return { error: error.message }
    }

    // SECURITY: Generate signed URLs on-demand instead of storing public URLs.
    // This ensures files are only accessible to authenticated foundry members.
    const admin = createAdminClient()
    const storagePaths = (data ?? [])
      .map((row) => row.storage_path)
      .filter((p): p is string => !!p)

    const signedUrlMap: Record<string, string> = {}
    if (storagePaths.length > 0) {
      // Try current bucket first
      const { data: signedData } = await admin.storage
        .from(CURRENT_BUCKET)
        .createSignedUrls(storagePaths, SIGNED_URL_EXPIRY_SECONDS)

      if (signedData) {
        for (const entry of signedData) {
          if (entry.signedUrl && entry.path) {
            signedUrlMap[entry.path] = entry.signedUrl
          }
        }
      }

      // Fall back to legacy bucket for paths that didn't resolve
      const missingPaths = storagePaths.filter((p) => !signedUrlMap[p])
      if (missingPaths.length > 0) {
        const { data: legacyData } = await admin.storage
          .from(LEGACY_BUCKET)
          .createSignedUrls(missingPaths, SIGNED_URL_EXPIRY_SECONDS)

        if (legacyData) {
          for (const entry of legacyData) {
            if (entry.signedUrl && entry.path) {
              signedUrlMap[entry.path] = entry.signedUrl
            }
          }
        }
      }
    }

    const downloads: ReportDownloadRow[] = (data ?? []).map((row) => ({
      id: row.id,
      reportName: row.report_name,
      reportSource: row.report_source as ReportSource,
      fileFormat: row.file_format as FileFormat,
      fileUrl: row.storage_path ? (signedUrlMap[row.storage_path] ?? null) : null,
      fileSizeBytes: row.file_size_bytes,
      storagePath: row.storage_path,
      expiresAt: row.expires_at ?? '',
      createdAt: row.created_at ?? '',
    }))

    return { success: true as const, downloads }
  })
}

// ─── Clean expired ───────────────────────────────────────────────────────

export async function cleanExpiredReportDownloads(): Promise<
  { success: true; deleted: number } | ActionError
> {
  return withAuth(async ({ foundryId }) => {
    const admin = createAdminClient()

    // 1. Fetch expired rows for this foundry
    const { data: expired, error: fetchErr } = await admin
      .from('report_downloads')
      .select('id, storage_path')
      .eq('foundry_id', foundryId)
      .lt('expires_at', new Date().toISOString())

    if (fetchErr || !expired?.length) {
      return { success: true as const, deleted: 0 }
    }

    // 2. Delete DB rows FIRST (M-3: safer order — broken links worse than orphaned files)
    const ids = expired.map((r) => r.id)
    const { error: delErr } = await admin
      .from('report_downloads')
      .delete()
      .in('id', ids)

    if (delErr) {
      console.error('[ReportDownloads] Cleanup delete failed:', delErr.message)
      return { error: delErr.message }
    }

    // 3. Delete Storage files from both buckets (best-effort, after DB rows are gone)
    const storagePaths = expired
      .map((r) => r.storage_path)
      .filter((p): p is string => !!p)

    if (storagePaths.length > 0) {
      await Promise.all([
        admin.storage.from(CURRENT_BUCKET).remove(storagePaths),
        admin.storage.from(LEGACY_BUCKET).remove(storagePaths),
      ])
    }

    return { success: true as const, deleted: ids.length }
  })
}

// ─── Delete one ──────────────────────────────────────────────────────────

export async function deleteReportDownload(
  id: string,
): Promise<{ success: true } | ActionError> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Fetch the row first to get storage_path
    const { data: row, error: fetchErr } = await supabase
      .from('report_downloads')
      .select('storage_path')
      .eq('id', id)
      .eq('foundry_id', foundryId)
      .single()

    if (fetchErr) {
      return { error: 'Download not found' }
    }

    // Delete DB row FIRST (M-3: safer order — broken links worse than orphaned files)
    const { error: delErr } = await supabase
      .from('report_downloads')
      .delete()
      .eq('id', id)
      .eq('foundry_id', foundryId)

    if (delErr) {
      console.error('[ReportDownloads] Delete failed:', delErr.message)
      return { error: delErr.message }
    }

    // Delete Storage file from both buckets (best-effort, after DB row is gone)
    if (row.storage_path) {
      const admin = createAdminClient()
      await Promise.all([
        admin.storage.from(CURRENT_BUCKET).remove([row.storage_path]),
        admin.storage.from(LEGACY_BUCKET).remove([row.storage_path]),
      ])
    }

    return { success: true as const }
  })
}

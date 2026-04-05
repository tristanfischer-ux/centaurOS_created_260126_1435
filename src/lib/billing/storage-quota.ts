/**
 * @file storage-quota.ts — Per-foundry storage quota enforcement.
 *
 * @description Calculates total storage used by a foundry across all upload
 * sources (task files, report downloads, CAD lab references) and compares
 * against the tier-based limit. Called before every file upload server action.
 *
 * @security Prevents free/lower-tier foundries from consuming unlimited storage.
 * Uses admin client for cross-table aggregation where RLS would block joins.
 */

import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'
import type { SubscriptionTier } from '@/lib/billing/plans'
import { getFoundryTier } from '@/lib/ai/limit-check'
import { createAdminClient } from '@/lib/supabase/admin'

/** Result of a storage quota check */
export interface StorageQuotaResult {
  allowed: boolean
  currentMB: number
  limitMB: number | undefined
  tier: SubscriptionTier
}

/**
 * Check whether a foundry has remaining storage quota for uploads.
 *
 * @description Sums file sizes from:
 * 1. task_files (via tasks.foundry_id join)
 * 2. report_downloads (has foundry_id directly)
 * 3. cad_lab_projects reference_images and reference_documents JSONB (originalSize fields)
 *
 * @param foundryId - The foundry to check storage for
 * @returns Quota check result with allowed/denied status and current usage
 *
 * @security This is the storage cost control gate. Must be called before every upload.
 */
export async function checkStorageQuota(
  foundryId: string
): Promise<StorageQuotaResult> {
  try {
    const tier = await getFoundryTier(foundryId)
    const plan = SUBSCRIPTION_PLANS[tier]
    const limitMB = plan.limits.maxStorageMB

    // INTENT: undefined limit means unlimited storage (Enterprise tier)
    if (limitMB === undefined) {
      return { allowed: true, currentMB: 0, limitMB: undefined, tier }
    }

    // SECURITY: Use admin client for cross-table aggregation
    // (RLS on task_files doesn't support foundry-level aggregation via join)
    const admin = createAdminClient()

    // FLOW: Sum storage from all sources in parallel
    const [taskFilesTotal, reportDownloadsTotal, cadLabTotal] = await Promise.all([
      // 1. task_files: join through tasks to get foundry_id
      sumTaskFilesStorage(admin, foundryId),
      // 2. report_downloads: has foundry_id directly
      sumReportDownloadsStorage(admin, foundryId),
      // 3. cad_lab_projects: reference_images + reference_documents JSONB
      sumCadLabStorage(admin, foundryId),
    ])

    const totalBytes = taskFilesTotal + reportDownloadsTotal + cadLabTotal
    const currentMB = Math.round(totalBytes / (1024 * 1024))

    return {
      allowed: currentMB < limitMB,
      currentMB,
      limitMB,
      tier,
    }
  } catch (error) {
    // SECURITY: Fail-open on error to avoid blocking uploads due to quota check failures.
    // Log the error so it can be investigated.
    console.error('[StorageQuota] Error checking quota, allowing upload:', {
      foundryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { allowed: true, currentMB: 0, limitMB: undefined, tier: 'free' }
  }
}

/**
 * Sum file sizes from task_files for a given foundry.
 * Joins through tasks table to filter by foundry_id.
 */
async function sumTaskFilesStorage(
  admin: ReturnType<typeof createAdminClient>,
  foundryId: string,
): Promise<number> {
  try {
    const { data, error } = await admin
      .from('task_files')
      .select('file_size, tasks!inner(foundry_id)')
      .eq('tasks.foundry_id', foundryId)

    if (error) {
      console.error('[StorageQuota] task_files query error:', error.message)
      return 0
    }

    return (data ?? []).reduce((sum, row) => sum + (row.file_size ?? 0), 0)
  } catch {
    return 0
  }
}

/**
 * Sum file sizes from report_downloads for a given foundry.
 */
async function sumReportDownloadsStorage(
  admin: ReturnType<typeof createAdminClient>,
  foundryId: string,
): Promise<number> {
  try {
    const { data, error } = await admin
      .from('report_downloads')
      .select('file_size_bytes')
      .eq('foundry_id', foundryId)

    if (error) {
      console.error('[StorageQuota] report_downloads query error:', error.message)
      return 0
    }

    return (data ?? []).reduce((sum, row) => sum + (row.file_size_bytes ?? 0), 0)
  } catch {
    return 0
  }
}

/**
 * Sum reference file sizes from cad_lab_projects JSONB columns for a given foundry.
 * Extracts originalSize from reference_images and reference_documents arrays.
 */
async function sumCadLabStorage(
  admin: ReturnType<typeof createAdminClient>,
  foundryId: string,
): Promise<number> {
  try {
    const { data, error } = await admin
      .from('cad_lab_projects')
      .select('reference_images, reference_documents')
      .eq('foundry_id', foundryId)

    if (error) {
      console.error('[StorageQuota] cad_lab_projects query error:', error.message)
      return 0
    }

    let total = 0
    for (const project of data ?? []) {
      // reference_images is a JSONB array with originalSize field
      if (Array.isArray(project.reference_images)) {
        for (const img of project.reference_images as Array<{ originalSize?: number }>) {
          total += img.originalSize ?? 0
        }
      }
      // reference_documents is a JSONB array with originalSize field
      if (Array.isArray(project.reference_documents)) {
        for (const doc of project.reference_documents as Array<{ originalSize?: number }>) {
          total += doc.originalSize ?? 0
        }
      }
    }
    return total
  } catch {
    return 0
  }
}

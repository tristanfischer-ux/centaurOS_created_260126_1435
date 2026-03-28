/**
 * @file route.ts — Cron cleanup for expired report downloads
 *
 * @description Vercel cron endpoint that deletes expired report download
 * records and their corresponding Storage files. Runs daily at 03:00 UTC.
 *
 * INTENT: Without a cron, orphaned Storage files accumulate if nobody visits
 * the Downloads tab (which triggers lazy cleanup). This ensures expired files
 * are cleaned up regardless of user activity.
 *
 * @security Requires CRON_SECRET Bearer token. Uses service-role admin client
 *           to bypass RLS (no user auth context in cron jobs).
 *
 * @related
 * - src/actions/report-downloads.ts — cleanExpiredReportDownloads() (lazy, per-foundry)
 * - src/app/api/cron/reports/route.ts — Sister cron (scheduled report delivery)
 */

import { NextRequest, NextResponse } from 'next/server'

import { verifyCronSecret } from '@/lib/security/cron-auth'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/report-downloads-cleanup
 *
 * @description Deletes all report_downloads rows where expires_at < now(),
 * along with their Storage files. No foundry filter — cleans all expired rows.
 *
 * @param req - Incoming cron request with Bearer CRON_SECRET
 * @returns JSON with count of deleted records
 *
 * @security Requires CRON_SECRET bearer authentication
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(req.headers)
  const ipLimit = await rateLimit('webhook', `cron-report-cleanup:${ip}`)
  if (!ipLimit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const authFailure = verifyCronSecret(req)
  if (authFailure) return authFailure

  const admin = createAdminClient()

  try {
    console.info('[Cron] Starting report downloads cleanup…')

    // 1. Fetch all expired rows (no foundry filter — clean everything)
    const { data: expired, error: fetchErr } = await admin
      .from('report_downloads')
      .select('id, storage_path')
      .lt('expires_at', new Date().toISOString())

    if (fetchErr) {
      console.error('[Cron] Failed to query expired downloads:', fetchErr.message)
      return NextResponse.json(
        { error: 'Failed to query expired downloads' },
        { status: 500 },
      )
    }

    if (!expired?.length) {
      console.info('[Cron] No expired report downloads to clean up')
      return NextResponse.json({ success: true, deleted: 0 })
    }

    // 2. Delete DB rows FIRST (M-3: broken links safer than orphaned files)
    const ids = expired.map((r) => r.id)
    const { error: delErr } = await admin
      .from('report_downloads')
      .delete()
      .in('id', ids)

    if (delErr) {
      console.error('[Cron] DB deletion failed:', delErr.message)
      return NextResponse.json(
        { error: 'Failed to delete expired records' },
        { status: 500 },
      )
    }

    // 3. Delete Storage files from both buckets (best-effort, after DB rows are gone)
    // INTENT: Legacy files may exist in 'xray-images' from before the bucket migration.
    // Try both buckets — Supabase .remove() silently skips non-existent paths.
    const storagePaths = expired
      .map((r) => r.storage_path)
      .filter((p): p is string => !!p)

    if (storagePaths.length > 0) {
      const results = await Promise.allSettled([
        admin.storage.from('report-exports').remove(storagePaths),
        admin.storage.from('xray-images').remove(storagePaths),
      ])

      for (const result of results) {
        if (result.status === 'rejected') {
          console.warn('[Cron] Storage cleanup partial failure (non-fatal):', result.reason)
        }
      }
    }

    console.info('[Cron] Report downloads cleanup complete:', {
      deleted: ids.length,
      storageFiles: storagePaths.length,
    })

    return NextResponse.json({
      success: true,
      deleted: ids.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Fatal error in report downloads cleanup:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: 'Report downloads cleanup failed' },
      { status: 500 },
    )
  }
}

// Allow POST for manual triggers
export async function POST(req: NextRequest): Promise<NextResponse> {
  return GET(req)
}

'use server'

/**
 * @file report-share.ts
 *
 * @description Server actions for creating, reading, and revoking share links
 * for report snapshots. Public reads use the admin client to bypass RLS so
 * unauthenticated viewers can access shared reports via token.
 *
 * FLOW: User clicks "Share" on a generated report
 * -> createReportShareLink() creates a row in shared_reports with a unique token
 * -> Share URL /share/report/{token} is returned to the user
 * -> Recipient opens the link (no auth)
 * -> getSharedReport() uses admin client to look up token, check expiry, return data
 *
 * @related
 * - src/app/share/report/[token]/page.tsx — Public share page
 * - supabase/migrations/20260220100000_shared_reports.sql — Table definition
 * - src/actions/report-generator.ts — Report generation and snapshots
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { checkRateLimit } from '@/lib/security/rate-limit'

import type { ReportDocument as ReportDocumentType } from '@/lib/reports/report-document-types'

interface CreateShareLinkResult {
  success: boolean
  shareUrl?: string
  token?: string
  error?: string
}

interface GetSharedReportResult {
  success: boolean
  document?: ReportDocumentType
  companyName?: string
  expiresAt?: string
  error?: string
}

interface RevokeShareLinkResult {
  success: boolean
  error?: string
}

/**
 * Create a shareable link for a report snapshot.
 *
 * @security AUTH: Requires authenticated user with foundry membership.
 * @param reportSnapshotId - The UUID of the report snapshot to share.
 * @returns The share URL and token, or an error.
 */
export async function createReportShareLink(
  reportSnapshotId: string
): Promise<CreateShareLinkResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { success: false, error: 'No foundry context' }
    }

    // INTENT: Verify the snapshot exists and belongs to the user's foundry
    // before creating a share link. Prevents sharing reports from other foundries.
    const { data: snapshot, error: snapshotError } = await supabase
      .from('report_snapshots')
      .select('id, foundry_id')
      .eq('id', reportSnapshotId)
      .single()

    if (snapshotError || !snapshot) {
      return { success: false, error: 'Report snapshot not found' }
    }

    if (snapshot.foundry_id !== foundryId) {
      return { success: false, error: 'Report does not belong to your foundry' }
    }

    // SECURITY: Cap share-link generation at 10 links per user per report per
    // 1-hour window. Each regenerate creates a new DB row; without this cap a
    // malicious client could flood `shared_reports` with tokens.
    const rateLimitError = await checkRateLimit(
      'reportShareLink',
      `${user.id}:${reportSnapshotId}`,
      { limit: 10, window: 60 * 60 * 1000 },
    )
    if (rateLimitError) {
      return { success: false, error: rateLimitError }
    }

    const token = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const { error: insertError } = await supabase
      .from('shared_reports')
      .insert({
        report_snapshot_id: reportSnapshotId,
        share_token: token,
        created_by: user.id,
        foundry_id: foundryId,
        expires_at: expiresAt.toISOString(),
      })

    if (insertError) {
      console.error('[ReportShare] Failed to create share link:', {
        reportSnapshotId,
        error: insertError.message,
        code: insertError.code,
      })
      return { success: false, error: sanitizeErrorMessage(insertError) }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const shareUrl = `${appUrl}/share/report/${token}`

    return { success: true, shareUrl, token }
  } catch (error) {
    console.error('[ReportShare] Unexpected error creating share link:', error)
    return { success: false, error: sanitizeErrorMessage(error) }
  }
}

/**
 * Fetch a shared report by its public token. No authentication required.
 *
 * SECURITY: Uses the admin client (service role) to bypass RLS. The share
 * token itself acts as the authorization credential — anyone with the token
 * can view the report until it expires.
 *
 * @param token - The unique share token from the URL.
 * @returns The report document and metadata, or an error.
 */
export async function getSharedReport(
  token: string
): Promise<GetSharedReportResult> {
  try {
    if (!token || typeof token !== 'string') {
      return { success: false, error: 'Invalid share token' }
    }

    // SECURITY: admin client — shared report lookup by token (intentionally cross-foundry for public share links), foundry_id not needed
    const supabaseAdmin = createAdminClient()

    // DECISION: Single query joining shared_reports → report_snapshots avoids
    // a round-trip. Admin client bypasses RLS so the unauthenticated viewer
    // can read both tables.
    const { data: shareRecord, error: lookupError } = await supabaseAdmin
      .from('shared_reports')
      .select(`
        id,
        share_token,
        expires_at,
        view_count,
        report_snapshots (
          id,
          report_data,
          foundry_id,
          generated_at
        )
      `)
      .eq('share_token', token)
      .single()

    if (lookupError || !shareRecord) {
      return { success: false, error: 'Shared report not found' }
    }

    if (shareRecord.expires_at && new Date(shareRecord.expires_at) < new Date()) {
      return { success: false, error: 'This shared report has expired' }
    }

    const snapshot = shareRecord.report_snapshots as unknown as {
      id: string
      report_data: unknown
      foundry_id: string
      generated_at: string
    } | null

    if (!snapshot?.report_data) {
      return { success: false, error: 'Report data not found' }
    }

    // INTENT: Increment view_count asynchronously — don't block the response
    // on a counter update. Fire-and-forget is acceptable here.
    supabaseAdmin
      .from('shared_reports')
      .update({ view_count: (shareRecord.view_count ?? 0) + 1 })
      .eq('id', shareRecord.id)
      .then(({ error }) => {
        if (error) {
          console.warn('[ReportShare] Failed to increment view count:', error.message)
        }
      })

    const document = snapshot.report_data as ReportDocumentType
    const companyName = document.foundryName ?? 'Unknown Company'

    return {
      success: true,
      document,
      companyName,
      expiresAt: shareRecord.expires_at ?? undefined,
    }
  } catch (error) {
    console.error('[ReportShare] Unexpected error fetching shared report:', error)
    return { success: false, error: sanitizeErrorMessage(error) }
  }
}

/**
 * Revoke (delete) a share link so it can no longer be accessed.
 *
 * @security AUTH: Requires authenticated user with foundry membership.
 * @param shareId - The UUID of the shared_reports row to delete.
 * @returns Success flag or an error.
 */
export async function revokeReportShareLink(
  shareId: string
): Promise<RevokeShareLinkResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { error } = await supabase
      .from('shared_reports')
      .delete()
      .eq('id', shareId)

    if (error) {
      console.error('[ReportShare] Failed to revoke share link:', {
        shareId,
        error: error.message,
        code: error.code,
      })
      return { success: false, error: sanitizeErrorMessage(error) }
    }

    return { success: true }
  } catch (error) {
    console.error('[ReportShare] Unexpected error revoking share link:', error)
    return { success: false, error: sanitizeErrorMessage(error) }
  }
}

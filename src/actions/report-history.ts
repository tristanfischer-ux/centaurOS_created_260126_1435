'use server'

/**
 * @file report-history.ts
 *
 * @description Server action to fetch past report snapshots for the
 * authenticated user's foundry. Returns the most recent 10 reports
 * with their metadata and full document data for re-loading.
 *
 * @security Requires authenticated user. Foundry isolation via RLS +
 * explicit foundry_id filter.
 *
 * @related
 * - src/actions/report-generator.ts — saveReportSnapshot writes to this table
 * - src/components/reports/ReportHistory.tsx — UI consumer
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

import type { ReportDocument } from '@/lib/reports/report-document-types'

export interface ReportHistoryItem {
  id: string
  reportType: string
  reportDate: string
  generatedAt: string
  summaryText: string | null
  reportData: ReportDocument
}

interface GetReportHistoryResult {
  success: boolean
  reports?: ReportHistoryItem[]
  error?: string
}

const MAX_HISTORY_ITEMS = 10

/**
 * Fetch the most recent report snapshots for the current foundry.
 *
 * @returns Up to 10 reports, newest first, with full ReportDocument data
 */
export async function getReportHistory(): Promise<GetReportHistoryResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { success: false, error: 'No foundry context' }
    }

    // INTENT: Fetch recent snapshots with RLS providing additional isolation.
    // We filter by foundry_id explicitly as a defense-in-depth measure.
    const { data, error } = await supabase
      .from('report_snapshots')
      .select('id, report_type, report_date, generated_at, summary_text, report_data')
      .eq('foundry_id', foundryId)
      .order('generated_at', { ascending: false })
      .limit(MAX_HISTORY_ITEMS)

    if (error) {
      console.error('[ReportHistory] Failed to fetch history:', {
        foundryId,
        error: error.message,
        code: error.code,
      })
      return { success: false, error: sanitizeErrorMessage(error) }
    }

    const reports: ReportHistoryItem[] = (data ?? []).map((row) => ({
      id: row.id,
      reportType: row.report_type,
      reportDate: row.report_date,
      generatedAt: row.generated_at ?? new Date().toISOString(),
      summaryText: row.summary_text,
      reportData: row.report_data as unknown as ReportDocument,
    }))

    return { success: true, reports }
  } catch (error) {
    console.error('[ReportHistory] Unexpected error:', error)
    return { success: false, error: sanitizeErrorMessage(error) }
  }
}

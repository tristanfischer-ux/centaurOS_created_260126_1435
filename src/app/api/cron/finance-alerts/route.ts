/**
 * @file route.ts — Cron job for evaluating and sending financial alerts
 *
 * @description Runs periodically to check for:
 * - Overdue invoices (orders past 30-day threshold)
 * - Low cash balance (below user-configured threshold)
 * - Failed payouts
 *
 * Sends notifications via the notification service to users who have
 * the relevant alert types enabled.
 *
 * @security Authenticated via CRON_SECRET Bearer token. Uses admin client
 * (service role) to bypass RLS for cross-user queries.
 */

import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNotification } from '@/lib/notifications/service'

export const dynamic = 'force-dynamic'

interface AlertSummary {
  sent: number
  failed: number
  skipped: number
}

export async function GET(req: Request) {
  // SECURITY: Verify cron secret
  const authFailure = verifyCronSecret(req)
  if (authFailure) return authFailure

  const summary: AlertSummary = { sent: 0, failed: 0, skipped: 0 }

  try {
    const supabase = createAdminClient()

    // Fetch all users with finance alert preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('finance_alert_preferences')
      .select('*')

    if (prefsError) {
      console.error('[Finance Alerts] Failed to fetch preferences:', prefsError)
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
    }

    if (!prefs || prefs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No alert preferences configured',
        ...summary,
        timestamp: new Date().toISOString(),
      })
    }

    // Process each user's alerts
    for (const pref of prefs) {
      try {
        await processUserAlerts(supabase, pref, summary)
      } catch (err) {
        console.error(`[Finance Alerts] Failed to process alerts for user ${pref.user_id}:`, err)
        summary.failed++
      }
    }

    return NextResponse.json({
      success: true,
      ...summary,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Finance Alerts] Cron job failed:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Also support POST for manual admin triggers
export { GET as POST }

// ============================================================
// Alert Processing
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processUserAlerts(supabase: any, pref: any, summary: AlertSummary) {
  const alertTypes = pref.alert_types as Record<string, boolean>
  const userId = pref.user_id as string

  // 1. Check overdue invoices
  if (alertTypes.invoice_overdue) {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: overdueOrders } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, created_at')
      .or(`buyer_id.eq.${userId}`)
      .in('status', ['pending', 'accepted'])
      .lt('created_at', thirtyDaysAgo.toISOString())

    if (overdueOrders && overdueOrders.length > 0) {
      const totalOverdue = overdueOrders.reduce(
        (sum: number, o: { total_amount: number }) => sum + (o.total_amount ?? 0),
        0
      )

      try {
        await sendNotification({
          userId,
          priority: 'high',
          title: `${overdueOrders.length} overdue invoice${overdueOrders.length > 1 ? 's' : ''}`,
          body: `You have ${overdueOrders.length} overdue invoice${overdueOrders.length > 1 ? 's' : ''} totalling £${(totalOverdue / 100).toFixed(2)}. Review and follow up to maintain healthy cash flow.`,
          actionUrl: '/finance/invoices',
          metadata: { alertType: 'invoice_overdue', count: overdueOrders.length },
        })
        summary.sent++
      } catch {
        summary.failed++
      }
    }
  }

  // 2. Check low cash balance
  if (alertTypes.cash_low && pref.cash_low_threshold) {
    const { data: balance } = await supabase
      .from('account_balances')
      .select('balance_amount')
      .eq('user_id', userId)
      .single()

    const currentBalance = balance?.balance_amount ?? 0
    if (currentBalance < pref.cash_low_threshold) {
      try {
        await sendNotification({
          userId,
          priority: 'high',
          title: 'Low cash balance',
          body: `Your wallet balance (£${(currentBalance / 100).toFixed(2)}) is below your threshold of £${(pref.cash_low_threshold / 100).toFixed(2)}. Consider topping up.`,
          actionUrl: '/my-profile?tab=billing',
          metadata: { alertType: 'cash_low', balance: currentBalance, threshold: pref.cash_low_threshold },
        })
        summary.sent++
      } catch {
        summary.failed++
      }
    }
  }

  // 3. Check failed payouts
  if (alertTypes.payout_failed) {
    // Get provider profile for this user
    const { data: provider } = await supabase
      .from('provider_profiles')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (provider) {
      const { data: failedPayouts } = await supabase
        .from('payout_requests')
        .select('id, amount, failure_reason')
        .eq('provider_id', provider.id)
        .eq('status', 'failed')
        .gte('requested_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24h

      if (failedPayouts && failedPayouts.length > 0) {
        try {
          await sendNotification({
            userId,
            priority: 'critical',
            title: 'Payout failed',
            body: `${failedPayouts.length} payout${failedPayouts.length > 1 ? 's' : ''} failed. Check your payout settings and try again.`,
            actionUrl: '/marketplace-orders',
            metadata: { alertType: 'payout_failed', count: failedPayouts.length },
          })
          summary.sent++
        } catch {
          summary.failed++
        }
      }
    }
  }
}

/**
 * API Route: Data-Driven Sweep Trigger
 *
 * @description Receives webhook events from Supabase database triggers or
 * internal ForgeOS events, and dispatches targeted specialist sweeps.
 * Unlike the cron-based sweep (which runs all specialists), this endpoint
 * triggers specific specialists based on the data change type.
 *
 * Event → Specialist Mapping:
 * - objective_created/updated → Sage (strategy) + Priya (product)
 * - task_overdue → Cal (chief of staff) + Priya (product)
 * - financial_data_updated → Finn (finance) + Fiona (fundraising)
 * - team_member_added → Harper (HR)
 * - contract_expiring → Leo (legal)
 *
 * @security Requires webhook secret for authentication.
 * @audit All triggered sweeps logged to agent_sweep_log
 */

import { NextRequest, NextResponse } from 'next/server'
import { executeSingleSweep } from '@/lib/agents/sweep-orchestrator'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'

// ─── Types ──────────────────────────────────────────────────────────

interface WebhookPayload {
  /** Event type that triggered the webhook */
  event_type: string
  /** The foundry this event belongs to */
  foundry_id: string
  /** Optional: specific entity that changed */
  entity_id?: string
  /** Optional: additional context about the change */
  metadata?: Record<string, unknown>
}

// ─── Event → Specialist Mapping ─────────────────────────────────────

/**
 * Maps data change events to the specialists that should analyze them.
 * Each event can trigger multiple specialists for cross-domain analysis.
 */
const EVENT_SPECIALIST_MAP: Record<string, string[]> = {
  // Objectives
  'objective_created': ['strategist', 'product-lead'],
  'objective_updated': ['strategist', 'chief-of-staff'],
  'objective_completed': ['chief-of-staff', 'strategist'],
  'objective_at_risk': ['chief-of-staff', 'strategist', 'product-lead'],

  // Tasks
  'task_overdue': ['chief-of-staff', 'product-lead'],
  'task_blocked': ['chief-of-staff', 'product-lead'],
  'tasks_bulk_completed': ['chief-of-staff', 'strategist'],

  // Financial
  'financial_data_updated': ['finance-lead', 'fundraising-advisor'],
  'budget_threshold_reached': ['finance-lead', 'chief-of-staff'],
  'invoice_overdue': ['finance-lead'],

  // Team
  'team_member_added': ['hiring-team', 'chief-of-staff'],
  'team_member_removed': ['hiring-team', 'chief-of-staff'],

  // Sales / Marketing
  'deal_at_risk': ['sales-lead', 'strategist'],
  'campaign_launched': ['growth-marketer'],
  'pipeline_stalled': ['sales-lead', 'chief-of-staff'],

  // Legal / Compliance
  'contract_expiring': ['legal-counsel'],
  'compliance_deadline': ['legal-counsel', 'chief-of-staff'],

  // Operations
  'production_bottleneck': ['vp-manufacturing'],
  'capacity_threshold': ['vp-manufacturing', 'chief-of-staff'],

  // General
  'weekly_review': ['chief-of-staff', 'finance-lead', 'strategist'],
  'manual_trigger': [], // Will use all specialists
}

// ─── Auth ───────────────────────────────────────────────────────────

/**
 * Verifies the webhook secret to prevent unauthorized triggers.
 *
 * @security Accepts either CRON_SECRET or a dedicated WEBHOOK_SECRET
 */
function verifyWebhookAuth(req: NextRequest): NextResponse | null {
  const webhookSecret = process.env.WEBHOOK_SECRET ?? process.env.CRON_SECRET

  // SECURITY: Fail closed when no secret is configured.
  if (!webhookSecret) {
    console.error('[SECURITY] No webhook secret configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${webhookSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

// ─── Route Handler ──────────────────────────────────────────────────

/**
 * POST /api/agents/sweep-trigger
 *
 * @description Accepts a webhook payload with event_type and foundry_id,
 * determines which specialists should run, and dispatches targeted sweeps.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(req.headers)
  const ipLimit = await rateLimit('webhook', `sweep-trigger:${ip}`)
  if (!ipLimit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // AUTH: Verify webhook authorization
  const authFailure = verifyWebhookAuth(req)
  if (authFailure) {
    return authFailure
  }

  try {
    const payload = await req.json() as WebhookPayload

    // VALIDATION: Require event_type and foundry_id
    if (!payload.event_type || !payload.foundry_id) {
      return NextResponse.json(
        { error: 'Missing required fields: event_type, foundry_id' },
        { status: 400 }
      )
    }

    const { event_type, foundry_id } = payload

    // Determine which specialists to trigger
    const specialistIds = EVENT_SPECIALIST_MAP[event_type]
    if (!specialistIds) {
      console.warn(`[SweepTrigger] Unknown event type: ${event_type}`)
      return NextResponse.json({
        success: false,
        error: `Unknown event type: ${event_type}`,
        known_events: Object.keys(EVENT_SPECIALIST_MAP),
      }, { status: 400 })
    }

    if (specialistIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No specialists configured for this event type',
        event_type,
      })
    }

    console.info(
      `[SweepTrigger] Event '${event_type}' for foundry ${foundry_id} → ` +
      `triggering ${specialistIds.length} specialists: ${specialistIds.join(', ')}`
    )

    // Execute targeted sweeps in parallel
    const results = await Promise.allSettled(
      specialistIds.map(specialistId =>
        executeSingleSweep({
          foundryId: foundry_id,
          specialistId,
          sweepIntervalMinutes: 0, // Triggered sweep, no interval check
        })
      )
    )

    const completed = results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<unknown>).value)
    const failed = results.filter(r => r.status === 'rejected')

    return NextResponse.json({
      success: true,
      event_type,
      foundry_id,
      specialists_triggered: specialistIds.length,
      completed: completed.length,
      failed: failed.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[SweepTrigger] Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json({
      success: false,
      error: 'Sweep trigger failed',
    }, { status: 500 })
  }
}

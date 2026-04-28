/**
 * @file src/lib/plan/seed-test-events.ts
 *
 * Dev-only helper for verifying the Today V3 Plan panel against real data
 * during agent-browser passes. Inserts 3 canned `event_log` rows scoped to
 * the caller's foundry, then returns how many landed.
 *
 * Hard-guarded by NODE_ENV !== 'production' so it can NEVER seed the live
 * DB. Call from a dev-only route or via an ad-hoc server action.
 */
'use server'

import { withAuth } from '@/lib/server-action-utils'
import { emitPlanEvent } from './emit-event'

type SeedResult =
  | { success: true; inserted: number }
  | { error: string }

export async function seedTestPlanEvents(): Promise<SeedResult> {
  if (process.env.NODE_ENV === 'production') {
    return { error: 'seed-test-events disabled in production' }
  }

  return withAuth<SeedResult>(async ({ foundryId }) => {
    const syntheticGoalId = `seed-goal-${Date.now().toString(36)}`
    const syntheticTaskId = `seed-task-${Date.now().toString(36)}`
    const syntheticRecId = `seed-rec-${Date.now().toString(36)}`

    await emitPlanEvent({
      foundryId,
      sourceEntityType: 'strategic_goal',
      sourceEntityId: syntheticGoalId,
      urgency: 'high',
      decayRate: '3d',
      title: 'Goal at risk: Activation funnel',
      body: 'Week-over-week activation flat vs. 15% plan; review disprove test.',
      ctaLabel: 'Review goal',
      ctaHref: `plan:goal:${syntheticGoalId}`,
      assignedTo: null,
    })

    await emitPlanEvent({
      foundryId,
      sourceEntityType: 'task',
      sourceEntityId: syntheticTaskId,
      urgency: 'medium',
      decayRate: '1d',
      title: 'Task overdue: Wire pricing experiment',
      body: '4 days past due; blocker on Stripe webhook.',
      ctaLabel: 'Update task',
      ctaHref: `plan:task:${syntheticTaskId}`,
      assignedTo: null,
    })

    await emitPlanEvent({
      foundryId,
      sourceEntityType: 'specialist_recommendation',
      sourceEntityId: syntheticRecId,
      urgency: 'medium',
      decayRate: '3d',
      title: 'Specialist recommendation: Cal',
      body: 'Suggest running a 3-day pressure-test on Q2 pivot hypothesis.',
      ctaLabel: 'See recommendation',
      ctaHref: `plan:rec:${syntheticRecId}`,
      assignedTo: null,
    })

    return { success: true, inserted: 3 } as SeedResult
  })
}

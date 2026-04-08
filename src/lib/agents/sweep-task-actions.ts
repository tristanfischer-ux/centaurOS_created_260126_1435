/**
 * @file sweep-task-actions.ts — Admin-level task actions for autonomous sweep execution.
 *
 * @description Functions called by the sweep orchestrator when a specialist
 * produces a deliverable for an assigned task. These use createAdminClient()
 * because sweeps run in a cron context without user authentication.
 *
 * @security All functions require foundryId for isolation. Task ownership
 * is verified before completion (owner_agent_id must match specialistId).
 *
 * @related
 * - src/lib/agents/sweep-orchestrator.ts - Calls these functions
 * - src/actions/content-publishing.ts - Similar publish logic (auth-gated version)
 * - src/actions/tasks.ts - User-facing task completion (withAuth version)
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ──────────────────────────────────────────────────────────

export interface SweepDeliverable {
    title: string
    content: string
    content_type: string
    meta_description?: string
    tags?: string[]
    slug?: string
}

// ─── Save Deliverable Artifact ──────────────────────────────────────

/**
 * Save a specialist's deliverable as an artifact pending review.
 *
 * @description Creates an agent_artifact with publish_status='review'
 * so it appears in the founder's review queue. Links to the source task
 * and specialist via publish_metadata.
 *
 * @returns The artifact ID or an error
 */
export async function saveDeliverableArtifact(
    foundryId: string,
    specialistId: string,
    taskId: string,
    deliverable: SweepDeliverable,
    planId?: string | null,
): Promise<{ artifactId: string | null; error: string | null }> {
    try {
        const supabase = createAdminClient()

        // Generate slug from title if not provided
        const slug = deliverable.slug || deliverable.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 120)

        if (!slug) {
            return { artifactId: null, error: 'Could not generate slug from deliverable title' }
        }

        // VALIDATION: Content must be substantive (not a stub)
        if (!deliverable.content || deliverable.content.length < 200) {
            return { artifactId: null, error: 'Deliverable content is too short (minimum 200 characters)' }
        }

        const { data, error } = await supabase
            .from('agent_artifacts')
            .insert({
                foundry_id: foundryId,
                created_by: null, // Agent-generated, no user
                title: deliverable.title,
                content: deliverable.content,
                content_type: deliverable.content_type || 'document',
                publish_status: 'review',
                publish_metadata: {
                    slug,
                    meta_title: deliverable.title,
                    meta_description: deliverable.meta_description || deliverable.content.slice(0, 155).replace(/\n/g, ' '),
                    tags: deliverable.tags || [],
                    view_count: 0,
                    source_task_id: taskId,
                    source_specialist_id: specialistId,
                    source_plan_id: planId || null,
                    generated_by: 'autonomous_sweep',
                    generated_at: new Date().toISOString(),
                },
                metadata: {
                    source_task_id: taskId,
                    source_specialist_id: specialistId,
                },
            })
            .select('id')
            .single()

        if (error) {
            console.error('[SweepTaskActions] Failed to save deliverable:', error.message)
            return { artifactId: null, error: error.message }
        }

        return { artifactId: data?.id ?? null, error: null }
    } catch (err) {
        console.error('[SweepTaskActions] Unexpected error saving deliverable:', err)
        return { artifactId: null, error: String(err) }
    }
}

// ─── Complete Task From Sweep ───────────────────────────────────────

/**
 * Mark a task as completed after a specialist produces its deliverable.
 *
 * @description Uses optimistic concurrency — only completes tasks that
 * are still in Pending/Accepted status. If another sweep already completed
 * the task, this is a no-op (returns success with updated=false).
 *
 * @security Verifies owner_agent_id matches specialistId before completing.
 */
export async function completeTaskFromSweep(
    foundryId: string,
    taskId: string,
    specialistId: string,
    artifactId?: string | null,
): Promise<{ updated: boolean; error: string | null }> {
    try {
        const supabase = createAdminClient()

        const now = new Date().toISOString()

        // Optimistic update — only complete if still Pending/Accepted AND owned by this specialist
        const { data, error } = await supabase
            .from('tasks')
            .update({
                status: 'Completed' as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                progress: 100,
                end_date: now,
                updated_at: now,
                metadata: artifactId ? { deliverable_artifact_id: artifactId } : undefined,
            })
            .eq('id', taskId)
            .eq('foundry_id', foundryId)
            .eq('owner_agent_id', specialistId)
            .in('status', ['Pending', 'Accepted'] as any[]) // eslint-disable-line @typescript-eslint/no-explicit-any
            .select('id')

        if (error) {
            console.error('[SweepTaskActions] Failed to complete task:', error.message)
            return { updated: false, error: error.message }
        }

        const updated = (data?.length ?? 0) > 0
        if (!updated) {
            console.warn(`[SweepTaskActions] Task ${taskId} was not updated — may already be completed or ownership changed`)
        }

        return { updated, error: null }
    } catch (err) {
        console.error('[SweepTaskActions] Unexpected error completing task:', err)
        return { updated: false, error: String(err) }
    }
}

// ─── Advance Execution Plan ─────────────────────────────────────────

/**
 * Check if all tasks in a plan are complete and advance plan status.
 *
 * @description Called after each task completion. If all tasks linked to
 * the plan are Completed, transitions the plan to 'completed' status.
 */
export async function checkAndAdvancePlan(
    foundryId: string,
    planId: string,
): Promise<void> {
    try {
        const supabase = createAdminClient()

        // Count incomplete tasks
        const { count } = await supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('plan_id', planId)
            .eq('foundry_id', foundryId)
            .is('deleted_at', null)
            .not('status', 'eq', 'Completed')

        if (count === 0) {
            await supabase
                .from('execution_plans')
                .update({ status: 'completed', updated_at: new Date().toISOString() })
                .eq('id', planId)
                .eq('foundry_id', foundryId)

            console.log(`[SweepTaskActions] Plan ${planId} completed — all tasks done`)
        }
    } catch (err) {
        console.error('[SweepTaskActions] Error advancing plan:', err)
    }
}

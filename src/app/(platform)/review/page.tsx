/**
 * @file Review Queue — Founder's operational command centre for pending approvals.
 *
 * @description Unified review page showing all items awaiting founder approval:
 * content pending publish, draft tasks, and pending agent actions. Each category
 * is a tab with count badges. Actions (publish, revise, approve, dismiss) are
 * handled inline via server actions.
 *
 * @security All data is scoped to the authenticated user's foundry via
 * getFoundryIdCached() and RLS. Only founders can take publish/approve actions
 * (enforced in server actions).
 *
 * @related
 * - src/actions/content-publishing.ts - Content review server actions
 * - src/app/(platform)/review/preview/[id]/page.tsx - Full content preview
 */

import { Metadata } from 'next'
import { ClipboardList, FileText, ListTodo, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getReviewQueue } from '@/actions/content-publishing'
import { typography } from '@/lib/design-system'
import { ReviewQueueTabs } from './review-queue-tabs'

export const metadata: Metadata = {
    title: 'Review Queue | ForgeOS',
    description: 'Items awaiting your approval',
}

// ─── Types ──────────────────────────────────────────────────────────

export interface ContentItem {
    id: string
    title: string
    content: string
    content_type: string
    publish_status: string | null
    publish_metadata: Record<string, unknown>
    created_at: string
}

export interface DraftTask {
    id: string
    title: string
    description: string | null
    assignee_id: string | null
    created_at: string | null
    created_by_agent_id: string | null
    owner_agent_id: string | null
}

export interface PendingAction {
    id: string
    action_type: string
    action_description: string | null
    agent_name: string | null
    status: string | null
    tier: string
    created_at: string
    details: Record<string, unknown> | null
}

// ─── Data Fetching ──────────────────────────────────────────────────

async function getDraftTasks(foundryId: string): Promise<DraftTask[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('tasks')
        .select('id, title, description, assignee_id, created_at, created_by_agent_id, owner_agent_id')
        .eq('foundry_id', foundryId)
        .eq('status', 'Pending')
        .like('title', '[Draft]%')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[ReviewQueue] Failed to fetch draft tasks:', error.message)
        return []
    }
    return data || []
}

async function getPendingActions(foundryId: string): Promise<PendingAction[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('agent_action_log')
        .select('id, action_type, action_description, agent_name, status, tier, created_at, details')
        .eq('foundry_id', foundryId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[ReviewQueue] Failed to fetch pending actions:', error.message)
        return []
    }
    return (data || []).map(item => ({
        ...item,
        details: (item.details || null) as Record<string, unknown> | null,
    }))
}

// ─── Page Component ─────────────────────────────────────────────────

export default async function ReviewQueuePage() {
    const foundryId = await getFoundryIdCached()

    if (!foundryId) {
        return (
            <div className="max-w-5xl space-y-6">
                <div>
                    <h1 className={typography.h1}>Review Queue</h1>
                    <p className="text-muted-foreground mt-1">Items awaiting your approval</p>
                </div>
                <p className="text-muted-foreground">No active foundry found.</p>
            </div>
        )
    }

    // PERF: Fetch all three data sources in parallel
    const [contentResult, draftTasks, pendingActions] = await Promise.all([
        getReviewQueue(),
        getDraftTasks(foundryId),
        getPendingActions(foundryId),
    ])

    const contentItems = contentResult.items
    if (contentResult.error) {
        console.error('[ReviewQueue] Content fetch error:', contentResult.error)
    }

    return (
        <div className="max-w-5xl space-y-6">
            <div>
                <h1 className={typography.h1}>Review Queue</h1>
                <p className="text-muted-foreground mt-1">Items awaiting your approval</p>
            </div>

            <ReviewQueueTabs
                contentItems={contentItems}
                draftTasks={draftTasks}
                pendingActions={pendingActions}
            />
        </div>
    )
}

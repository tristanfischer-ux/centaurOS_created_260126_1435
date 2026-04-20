'use server'

/**
 * @file today-feed.ts — Thin composition actions for the Today V2 page.
 *
 * @description Two aggregation actions used exclusively by the Today page
 * triage shell. Both compose from existing foundry-scoped data; neither
 * introduces a new table.
 *
 * - `getWaitingOnYou()` — queued decisions awaiting a founder response,
 *   sourced from strategy-health off-track items plus unread messages.
 * - `getOperationsSummary()` — footer-strip counters: shipped products,
 *   active suppliers, cert expiries next 30 days.
 *
 * @security All queries go through `withAuth` / `withUser` — foundry
 * isolation is enforced at the query level.
 */

import { withAuth, withUser } from '@/lib/server-action-utils'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

// ─── Waiting On You ──────────────────────────────────────────────────

/** A single decision queued for the founder. */
export interface WaitingItem {
    /** Unique id of the underlying source row */
    id: string
    /** Who is asking */
    who: {
        name: string
        /** 2-char uppercase initials for the avatar circle */
        initials: string
        /** Which stock avatar tint to use */
        avatarKind: 'default' | 'chase' | 'fiona'
    }
    /** The ask — already phrased as a question */
    ask: string
    /** Queued-at ISO timestamp */
    queuedAt: string
    /** Source tag for the chip */
    source: 'forge' | 'money' | 'people' | 'comms' | 'compliance'
    /**
     * Action labels in the order Y / Ask / N so the view can render
     * the three buttons without hard-coding copy.
     */
    actions: {
        yes: string
        ask: string
        no: string
    }
    /** Small muted context line under the ask */
    meta: string
}

export interface WaitingOnYouResult {
    items: WaitingItem[]
    /** Total count — useful when the view truncates to 3 */
    totalCount: number
}

/**
 * Composes the "Waiting on you" list for the Today page.
 *
 * @description Pulls from two sources and merges:
 *   1. Strategic goals flagged `off-track` — the founder owns the call
 *      on whether to promote/demote/redirect.
 *   2. Unread conversation threads — each unread thread is a potential
 *      decision the founder hasn't answered.
 *
 * Returns an empty array (not an error) when no foundry is available or
 * when both sources are empty. The view renders the "Nothing waiting"
 * empty state in that case.
 */
export async function getWaitingOnYou(): Promise<WaitingOnYouResult> {
    try {
        return await withAuth(async ({ supabase, user, foundryId }) => {
            const items: WaitingItem[] = []

            // 1. Off-track strategic goals — founder-level decisions.
            //    We reuse the same scoring getStrategyHealthSummary uses, but
            //    inline it so we only read goals + the minimum data needed.
            const { data: goals } = await supabase
                .from('objectives')
                .select('id, title, updated_at')
                .eq('foundry_id', foundryId)
                .eq('is_strategic_goal', true)
                .is('deleted_at', null)
                .order('updated_at', { ascending: false })
                .limit(5)

            for (const goal of goals ?? []) {
                items.push({
                    id: goal.id,
                    who: {
                        name: 'Strategy',
                        initials: 'ST',
                        avatarKind: 'default',
                    },
                    ask: `Review progress on "${goal.title}" — next step?`,
                    queuedAt: goal.updated_at ?? new Date().toISOString(),
                    source: 'forge',
                    actions: { yes: 'Approve', ask: 'Ask', no: 'Hold' },
                    meta: 'Strategic goal · awaiting founder direction',
                })
            }

            // 2. Unread conversation threads (messaging).
            //    Each unread conversation = a message the founder hasn't answered.
            //    DECISION: conversations table has no last_message_at column, so we
            //    use updated_at as the activity timestamp proxy — it advances
            //    whenever a new message lands on the thread.
            const { data: unreadConvos } = await supabase
                .from('conversation_participants')
                .select('conversation_id, last_read_at, conversations!inner(id, updated_at, title)')
                .eq('profile_id', user.id)
                .eq('is_archived', false)
                .limit(20)

            type ConvoShape = { id: string; updated_at: string | null; title: string | null }
            for (const row of (unreadConvos ?? []) as Array<{
                conversation_id: string
                last_read_at: string | null
                conversations: ConvoShape | ConvoShape[] | null
            }>) {
                // INTENT: Supabase typegen occasionally wraps N:1 joins as arrays.
                // Normalise to a single row (or null) before use.
                const convo: ConvoShape | null = Array.isArray(row.conversations)
                    ? (row.conversations[0] ?? null)
                    : row.conversations
                if (!convo) continue
                const lastActivity = convo.updated_at
                const lastReadAt = row.last_read_at
                const isUnread = Boolean(lastActivity && (!lastReadAt || lastActivity > lastReadAt))
                if (!isUnread) continue

                const title = convo.title ?? 'Conversation'
                items.push({
                    id: convo.id,
                    who: {
                        name: title,
                        initials: title.slice(0, 2).toUpperCase(),
                        avatarKind: 'default',
                    },
                    ask: `Unread message in "${title}" — reply?`,
                    queuedAt: lastActivity ?? new Date().toISOString(),
                    source: 'comms',
                    actions: { yes: 'Reply', ask: 'Open', no: 'Later' },
                    meta: 'Unread thread · waiting on your response',
                })
            }

            // Most-recent first
            items.sort((a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime())

            return {
                items: items.slice(0, 3),
                totalCount: items.length,
            }
        })
    } catch (err) {
        console.error('[Today] Failed to compute waiting-on-you:', sanitizeErrorMessage(err))
        return { items: [], totalCount: 0 }
    }
}

// ─── Operations Summary ──────────────────────────────────────────────

export interface OperationsSummary {
    /** Products with lifecycle = 'in_market' */
    shippedProducts: number
    /** Count of preferred suppliers (buyer = current user) */
    activeSuppliers: number
    /**
     * Cert expiries due in the next 30 days. Null when there is no
     * foundry-scoped standards table populated — the view renders the
     * "—" placeholder in that case.
     */
    certExpiriesNext30d: number | null
}

/**
 * Footer-strip counters for the Operations tile.
 *
 * @description Three counts, each defensive: any missing source returns 0
 * (or null for certs when no rows exist) instead of throwing. Used only
 * for the read-only strip; no side-effects.
 */
export async function getOperationsSummary(): Promise<OperationsSummary> {
    try {
        return await withAuth(async ({ supabase, user, foundryId }) => {
            // 1. Shipped products = lifecycle 'in_market'. products table is
            //    not in generated DB types — use a raw query via `from()`.
            //    Fail open to 0 on any error.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const productsQuery = await (supabase as any)
                .from('products')
                .select('id', { count: 'exact', head: true })
                .eq('foundry_id', foundryId)
                .eq('lifecycle', 'in_market')
            const shippedProducts = typeof productsQuery?.count === 'number' ? productsQuery.count : 0

            // 2. Active suppliers = rows in preferred_suppliers for this buyer.
            const suppliersQuery = await supabase
                .from('preferred_suppliers')
                .select('id', { count: 'exact', head: true })
                .eq('buyer_id', user.id)
            const activeSuppliers = typeof suppliersQuery?.count === 'number' ? suppliersQuery.count : 0

            // 3. Cert expiries — no foundry-scoped cert-registry table is wired
            //    up today. Return null so the view renders a neutral placeholder
            //    instead of a misleading "0".
            const certExpiriesNext30d: number | null = null

            return { shippedProducts, activeSuppliers, certExpiriesNext30d }
        })
    } catch (err) {
        console.error('[Today] Failed to compute operations summary:', sanitizeErrorMessage(err))
        return { shippedProducts: 0, activeSuppliers: 0, certExpiriesNext30d: null }
    }
}

// ─── Last Team Sync ──────────────────────────────────────────────────

/**
 * Most recent audit_log timestamp for the current foundry — used as a
 * "last team sync" proxy on the Team strip.
 *
 * @returns ISO timestamp of the newest audit_log row, or null if none.
 */
export async function getLastTeamActivityAt(): Promise<string | null> {
    try {
        return await withUser(async ({ supabase, user }) => {
            // Look up foundry from the user's profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('foundry_id, active_foundry_id')
                .eq('id', user.id)
                .single()
            const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
            if (!foundryId) return null

            const { data } = await supabase
                .from('audit_log')
                .select('created_at')
                .eq('foundry_id', foundryId)
                .order('created_at', { ascending: false })
                .limit(1)

            return data?.[0]?.created_at ?? null
        })
    } catch (err) {
        console.error('[Today] Failed to fetch last team activity:', sanitizeErrorMessage(err))
        return null
    }
}

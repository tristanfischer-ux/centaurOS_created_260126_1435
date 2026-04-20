/**
 * @file src/components/plan/MigratedPill.tsx
 *
 * PLAN-SCHEMA §A.4 · "Migrated from Strategy" provenance pill.
 *
 * Rendered next to a Strategic Goal title whenever `goal.source_objective_id`
 * is non-null — meaning the goal was backfilled from a legacy `objectives`
 * row that had `is_strategic_goal=true`. The pill links back to the legacy
 * `/strategy` path for 30 days post-cutover so the founder can see the
 * original row; after that the link still works (legacy route keeps
 * rendering) but we hide the pill to reduce surface-area noise.
 *
 * Minimally invasive: tiny inline badge, no layout shift on the parent.
 */

import Link from 'next/link'

import { Badge } from '@/components/ui/badge'

/** 30 days post-cutover window — beyond this we stop rendering the pill. */
const PROVENANCE_WINDOW_DAYS = 30

/** Chunk E ships 2026-04-22; Phase 3 is rolled out in the weeks after. */
const PHASE3_CUTOVER_ISO = '2026-04-22T00:00:00Z'

export interface MigratedPillProps {
    sourceObjectiveId: string | null
    /** ISODateTime of the backfill — use `strategic_goals.created_at`. */
    createdAt: string | null
}

function formatShortDate(iso: string): string {
    try {
        const d = new Date(iso)
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    } catch {
        return ''
    }
}

/**
 * Renders a "Migrated from Strategy" pill linking to the legacy /strategy
 * view for 30 days after the Phase 3 cutover date. Returns `null` when:
 *   - `sourceObjectiveId` is null (not a migrated goal), OR
 *   - the 30-day window has elapsed.
 */
export function MigratedPill({ sourceObjectiveId, createdAt }: MigratedPillProps) {
    if (!sourceObjectiveId) return null

    const cutover = new Date(PHASE3_CUTOVER_ISO).getTime()
    const now = Date.now()
    const windowMs = PROVENANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    if (now - cutover > windowMs) return null

    const dateLabel = createdAt ? formatShortDate(createdAt) : null

    return (
        <Link
            href="/strategy"
            className="inline-flex"
            aria-label={`Migrated from the previous Strategy view${dateLabel ? ` on ${dateLabel}` : ''}. Opens legacy Strategy page.`}
            title="Open the legacy Strategy view this goal was migrated from"
        >
            <Badge
                variant="outline"
                size="sm"
                className="rounded-full border-dashed text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground hover:border-solid"
            >
                Migrated from Strategy{dateLabel ? ` · ${dateLabel}` : ''}
            </Badge>
        </Link>
    )
}

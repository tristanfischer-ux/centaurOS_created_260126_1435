'use client'

/**
 * @file src/components/today/PlanPanel.tsx
 *
 * Today V3 Plan panel (Chunk D). Subscribes to Supabase Realtime on
 * `event_log` scoped to `section='plan'` + `resolved_at IS NULL`, renders
 * each event as a card with urgency pill, title, body and a CTA button
 * whose href is resolved from the stored canonical token via
 * `resolvePlanCtaToken` (PLAN-SCHEMA §14.6, rollback-safe).
 *
 * Groups events by `decay_rate` so critical / 1-day rows surface above
 * the weekly/30-day queue. New critical events chime via a CSS animation
 * on the card (no sound).
 *
 * Flag-aware CTA: evaluated at render time against the reader's
 * `new_plan_experience` flag state, so the same row works for a flag-ON
 * founder and a flag-OFF co-founder without a DB write.
 */
import Link from 'next/link'
import { useMemo } from 'react'
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react'

import { useTodayPlanFeed } from '@/hooks/useTodayPlanFeed'
import { useFeatureFlag } from '@/lib/features/use-feature-flag'
import { FLAG_NEW_PLAN_EXPERIENCE } from '@/lib/features/keys'
import { resolvePlanCtaToken } from '@/lib/plan/route-resolver'
import { cn } from '@/lib/utils'
import type { TodaySignal, TodaySignalDecayRate, TodaySignalUrgency } from '@/types/today'

interface PlanPanelProps {
  foundryId: string | null
  initialSignals?: TodaySignal[]
}

// Urgency pill palette — tokens only, no hex literals.
const URGENCY_CLASS: Record<TodaySignalUrgency, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-international-orange/10 text-international-orange border-international-orange/30',
  medium: 'bg-status-warning/10 text-status-warning border-status-warning/30',
  low: 'bg-muted text-muted-foreground border-border',
}

const URGENCY_LABEL: Record<TodaySignalUrgency, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

// Decay-rate grouping — lower index renders first.
const DECAY_GROUPS: Array<{ keys: Array<TodaySignalDecayRate | null>; label: string }> = [
  { keys: ['immediate', '1d'], label: 'Act today' },
  { keys: ['3d'], label: 'This week' },
  { keys: ['7d', '30d', null], label: 'Ongoing' },
]

export function PlanPanel({ foundryId, initialSignals }: PlanPanelProps): React.ReactElement {
  const { signals, isLoading } = useTodayPlanFeed({ foundryId, initialSignals })
  const { enabled: newPlanExperience } = useFeatureFlag(FLAG_NEW_PLAN_EXPERIENCE)

  const grouped = useMemo(() => {
    return DECAY_GROUPS.map((g) => ({
      label: g.label,
      items: signals.filter((s) => g.keys.includes(s.decayRate)),
    })).filter((g) => g.items.length > 0)
  }, [signals])

  if (!foundryId) {
    return (
      <section
        aria-label="Plan signals"
        className="rounded-xl border border-border bg-background p-4 shadow-sm"
      >
        <PanelHeader />
        <p className="mt-3 text-sm text-muted-foreground">
          No active foundry — pick one from the workspace switcher.
        </p>
      </section>
    )
  }

  if (isLoading && signals.length === 0) {
    return (
      <section
        aria-label="Plan signals"
        className="rounded-xl border border-border bg-background p-4 shadow-sm"
      >
        <PanelHeader />
        <p className="mt-3 text-sm text-muted-foreground">Loading Plan signals…</p>
      </section>
    )
  }

  if (signals.length === 0) {
    return (
      <section
        aria-label="Plan signals"
        className="rounded-xl border border-border bg-background p-4 shadow-sm"
      >
        <PanelHeader />
        <p className="mt-3 text-sm text-muted-foreground">
          No Plan signals right now.
        </p>
      </section>
    )
  }

  return (
    <section
      aria-label="Plan signals"
      className="rounded-xl border border-border bg-background p-4 shadow-sm"
    >
      <PanelHeader count={signals.length} />
      <div className="mt-3 space-y-4">
        {grouped.map((group) => (
          <div key={group.label}>
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              {group.label}
            </h4>
            <ul className="space-y-2">
              {group.items.map((sig) => (
                <PlanSignalRow
                  key={sig.id}
                  signal={sig}
                  newPlanExperience={newPlanExperience}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function PanelHeader({ count }: { count?: number } = {}): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] uppercase tracking-widest font-bold text-muted-foreground">
          Plan
        </span>
        {typeof count === 'number' && count > 0 && (
          <span className="text-[11px] tabular-nums text-foreground font-semibold">
            {count}
          </span>
        )}
      </div>
      <Link
        href="/plan"
        className="text-[11px] font-medium text-international-orange hover:underline inline-flex items-center gap-1"
      >
        Open Plan
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  )
}

function PlanSignalRow({
  signal,
  newPlanExperience,
}: {
  signal: TodaySignal
  newPlanExperience: boolean
}): React.ReactElement {
  const href = signal.ctaHref
    ? resolvePlanCtaToken(signal.ctaHref, { newPlanExperience })
    : '/plan'
  const isCritical = signal.urgency === 'critical'
  return (
    <li
      className={cn(
        'rounded-lg border border-border bg-muted/40 p-3 transition-shadow',
        isCritical && 'plan-panel-chime border-destructive/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                URGENCY_CLASS[signal.urgency],
              )}
            >
              {isCritical && <AlertTriangle className="h-3 w-3" />}
              {URGENCY_LABEL[signal.urgency]}
            </span>
            {signal.decayRate && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {signal.decayRate}
              </span>
            )}
          </div>
          <h5 className="text-sm font-semibold text-foreground truncate">
            {signal.title}
          </h5>
          {signal.body && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {signal.body}
            </p>
          )}
        </div>
      </div>
      {signal.ctaLabel && (
        <div className="mt-2">
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-medium text-international-orange hover:underline"
          >
            {signal.ctaLabel}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
      <style jsx>{`
        .plan-panel-chime {
          animation: plan-panel-chime-flash 800ms ease-out;
        }
        @keyframes plan-panel-chime-flash {
          0% { box-shadow: 0 0 0 0 var(--destructive, #ef4444); }
          60% { box-shadow: 0 0 0 6px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
      `}</style>
    </li>
  )
}

/**
 * @file what-changed-banner.tsx
 *
 * @description Dismissable summary banner at the top of /plan.
 * Shows month-to-date counts: decisions logged, tasks closed, objectives revised.
 * Links to the history feed (lever #1) and the decision log (lever #4).
 *
 * Lever #4 "What changed" sub-feature of /plan stickiness.
 *
 * @related
 *   - src/actions/plan/fetch-plan-summary.ts — server action computing the counts
 *   - src/app/(platform)/plan/plan-view.tsx — renders this above the pillar list
 */

"use client"

import * as React from "react"
import Link from "next/link"

export interface PlanMonthlySummary {
  decisions_this_month: number
  tasks_closed_this_month: number
  objectives_revised_this_month: number
}

interface WhatChangedBannerProps {
  summary: PlanMonthlySummary
}

export function WhatChangedBanner({ summary }: WhatChangedBannerProps): React.ReactElement | null {
  const [dismissed, setDismissed] = React.useState(false)

  const { decisions_this_month, tasks_closed_this_month, objectives_revised_this_month } = summary
  const hasActivity = decisions_this_month > 0 || tasks_closed_this_month > 0 || objectives_revised_this_month > 0

  // Don't render the banner if nothing has happened yet or it's been dismissed
  if (!hasActivity || dismissed) return null

  const parts: string[] = []
  if (decisions_this_month > 0) {
    parts.push(
      `${decisions_this_month} ${decisions_this_month === 1 ? "decision" : "decisions"} logged this month`
    )
  }
  if (tasks_closed_this_month > 0) {
    parts.push(
      `${tasks_closed_this_month} ${tasks_closed_this_month === 1 ? "task" : "tasks"} closed`
    )
  }
  if (objectives_revised_this_month > 0) {
    parts.push(
      `${objectives_revised_this_month} ${objectives_revised_this_month === 1 ? "objective" : "objectives"} revised`
    )
  }

  return (
    <div className="what-changed-banner" role="status" aria-live="polite">
      <div className="what-changed-banner__content">
        <span className="what-changed-banner__dot" aria-hidden="true">●</span>
        <p className="what-changed-banner__text">
          {parts.join(", ")}.{" "}
          <Link href="#decisions" className="what-changed-banner__link">
            View decisions
          </Link>
          {" "}or{" "}
          <Link href="/plan/history" className="what-changed-banner__link">
            see full history
          </Link>
          .
        </p>
      </div>
      <button
        type="button"
        className="what-changed-banner__dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss this banner"
      >
        ×
      </button>
    </div>
  )
}

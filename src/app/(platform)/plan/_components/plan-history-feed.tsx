/**
 * @file plan-history-feed.tsx
 *
 * @description Reverse-chronological feed of plan activity for a foundry.
 * Renders the last 30 rows from plan_history with actor, action sentence,
 * relative timestamp, and a link to the affected entity.
 *
 * Lever #1 of /plan stickiness: makes the plan feel alive, not a static doc.
 *
 * @related
 *   - src/actions/plan/fetch-plan-history.ts — server action that queries plan_history
 *   - src/app/(platform)/plan/page.tsx — embeds this in the right rail
 */

"use client"

import * as React from "react"
import Link from "next/link"

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlanHistoryEntry {
  id: string
  entity_type: "objective" | "task" | "decision"
  entity_id: string
  action: string
  actor_name: string | null
  entity_title: string | null
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "yesterday"
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

function actionSentence(entry: PlanHistoryEntry): string {
  const who = entry.actor_name ?? "Someone"
  const what = entry.entity_title
    ? `"${entry.entity_title}"`
    : entry.entity_type

  switch (entry.action) {
    case "created":
      return `${who} added ${what}`
    case "completed":
      return `${who} completed ${what}`
    case "status_changed":
      return `${who} updated the status of ${what}`
    case "progress_updated":
      return `${who} moved progress on ${what}`
    case "updated":
      return `${who} edited ${what}`
    case "deleted":
      return `${who} removed ${what}`
    case "decision_logged":
      return `${who} logged a decision: ${what}`
    default:
      return `${who} changed ${what}`
  }
}

function entityLink(entry: PlanHistoryEntry): string | null {
  if (entry.entity_type === "objective") return `/objectives/${entry.entity_id}`
  if (entry.entity_type === "task") return `/tasks/${entry.entity_id}`
  if (entry.entity_type === "decision") return `/plan#decisions`
  return null
}

function entityTypeLabel(type: string): string {
  if (type === "objective") return "Objective"
  if (type === "task") return "Task"
  if (type === "decision") return "Decision"
  return type
}

function avatarInitials(name: string | null): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join("")
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PlanHistoryFeedProps {
  entries: PlanHistoryEntry[]
  /** Show link to full /plan/history sub-route at the foot */
  showViewAll?: boolean
}

export function PlanHistoryFeed({
  entries,
  showViewAll = true,
}: PlanHistoryFeedProps): React.ReactElement {
  if (entries.length === 0) {
    return (
      <div className="plan-history-feed plan-history-empty">
        <div className="plan-history-empty-icon">H</div>
        <p className="plan-history-empty-text">
          No activity recorded yet. Contact events will populate once objectives
          and tasks start moving.
        </p>
      </div>
    )
  }

  return (
    <div className="plan-history-feed">
      <div className="plan-history-header">
        <span className="plan-history-label">Activity</span>
        {showViewAll ? (
          <Link href="/plan/history" className="plan-history-view-all">
            View all
          </Link>
        ) : null}
      </div>

      <ol className="plan-history-list" aria-label="Recent plan activity">
        {entries.map((entry) => {
          const link = entityLink(entry)
          return (
            <li key={entry.id} className="plan-history-entry">
              <div className="plan-history-avatar" aria-hidden="true">
                {avatarInitials(entry.actor_name)}
              </div>
              <div className="plan-history-body">
                <p className="plan-history-sentence">
                  {actionSentence(entry)}
                </p>
                <div className="plan-history-meta">
                  <span className="plan-history-type">
                    {entityTypeLabel(entry.entity_type)}
                  </span>
                  <span className="plan-history-dot" aria-hidden="true">·</span>
                  <time
                    className="plan-history-time"
                    dateTime={entry.created_at}
                    title={new Date(entry.created_at).toLocaleString("en-GB")}
                  >
                    {relativeTime(entry.created_at)}
                  </time>
                  {link ? (
                    <>
                      <span className="plan-history-dot" aria-hidden="true">·</span>
                      <Link href={link} className="plan-history-open">
                        Open
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

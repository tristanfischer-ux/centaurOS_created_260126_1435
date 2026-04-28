/**
 * @file timeline-types.ts — Shared types for the /plan/history timeline.
 *
 * The timeline UNIONs history_entries with legacy knowledge_notes at read
 * time — PLAN-SCHEMA §A.2 data-preservation. Both feed into this single
 * shape.
 */

import type { HistoryEntryType, OutcomeState } from "@/types/plan"

export type TimelineItemSource = "history" | "knowledge"

export interface TimelineItem {
    id: string
    source: TimelineItemSource
    /** For history entries: HistoryEntryType. For knowledge notes: unused, UI uses `source`. */
    entry_type: HistoryEntryType
    title: string
    body_preview: string | null
    actor_label: string | null
    goal_id: string | null
    goal_title: string | null
    outcome: OutcomeState | null
    created_at: string
}

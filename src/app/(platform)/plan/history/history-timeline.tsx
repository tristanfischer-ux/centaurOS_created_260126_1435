/**
 * @file history-timeline.tsx — Day-grouped unified timeline for /plan/history.
 *
 * @description Pure presentation server component. Receives already-merged
 * timeline items (history_entries UNIONed with legacy knowledge_notes — see
 * PLAN-SCHEMA §A.2) and renders them grouped by day.
 *
 * Colour coding maps to entry_type per the gap audit. Legacy knowledge notes
 * use a neutral slate chip.
 */

import Link from "next/link"
import { FileText, StickyNote } from "lucide-react"

import type { HistoryEntryType } from "@/types/plan"
import { Card, CardContent } from "@/components/ui/card"

import type { TimelineItem } from "./timeline-types"

const ENTRY_TYPE_CHIP: Record<
    HistoryEntryType,
    { label: string; classes: string }
> = {
    decision: { label: "Decision", classes: "bg-international-orange/10 text-international-orange" },
    pressure_test: { label: "Pressure-test", classes: "bg-rose-100 text-rose-800" },
    update_sent: { label: "Update sent", classes: "bg-sky-100 text-sky-800" },
    goal_pinned: { label: "Goal pinned", classes: "bg-emerald-100 text-emerald-800" },
    goal_state_changed: { label: "Goal change", classes: "bg-amber-100 text-amber-800" },
    specialist_rec_accepted: { label: "Rec accepted", classes: "bg-emerald-100 text-emerald-800" },
    specialist_rec_rejected: { label: "Rec rejected", classes: "bg-rose-100 text-rose-800" },
    gutcheck_outcome: { label: "Gut-check", classes: "bg-violet-100 text-violet-800" },
    manual: { label: "Note", classes: "bg-muted text-foreground" },
}

const KNOWLEDGE_CHIP = { label: "Knowledge", classes: "bg-slate-100 text-slate-800" }

function formatDayHeading(iso: string): string {
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()
    if (isToday) return "Today"
    if (isYesterday) return "Yesterday"
    return d.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
    })
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    })
}

function groupByDay(items: TimelineItem[]): Array<{ day: string; items: TimelineItem[] }> {
    const buckets = new Map<string, TimelineItem[]>()
    for (const it of items) {
        const day = it.created_at.slice(0, 10)
        if (!buckets.has(day)) buckets.set(day, [])
        buckets.get(day)!.push(it)
    }
    return Array.from(buckets.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([day, items]) => ({ day, items }))
}

interface Props {
    items: TimelineItem[]
}

export function HistoryTimeline({ items }: Props): React.ReactNode {
    if (items.length === 0) return null
    const groups = groupByDay(items)

    return (
        <div className="space-y-6">
            {groups.map(({ day, items }) => (
                <section key={day} aria-label={formatDayHeading(day)}>
                    <h2 className="sticky top-0 z-10 mb-2 bg-background/90 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground backdrop-blur">
                        {formatDayHeading(day)}
                    </h2>
                    <Card>
                        <CardContent className="divide-y divide-border p-0">
                            {items.map((item) => (
                                <TimelineRow key={`${item.source}:${item.id}`} item={item} />
                            ))}
                        </CardContent>
                    </Card>
                </section>
            ))}
        </div>
    )
}

function TimelineRow({ item }: { item: TimelineItem }): React.ReactNode {
    const chip =
        item.source === "history"
            ? ENTRY_TYPE_CHIP[item.entry_type]
            : KNOWLEDGE_CHIP

    const href =
        item.source === "history"
            ? `/plan/history/${item.id}`
            : `/plan/history/knowledge/${item.id}`

    const preview = item.body_preview?.trim()
    const Icon = item.source === "history" ? FileText : StickyNote

    return (
        <Link
            href={href}
            className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none sm:px-5"
        >
            <div className="mt-0.5 shrink-0">
                <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.classes}`}
                >
                    <Icon aria-hidden="true" className="mr-1 h-3 w-3" />
                    {chip.label}
                </span>
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-international-orange sm:text-base">
                        {item.title}
                    </h3>
                    <time
                        className="shrink-0 text-xs text-muted-foreground"
                        dateTime={item.created_at}
                    >
                        {formatTime(item.created_at)}
                    </time>
                </div>
                {preview ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{preview}</p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {item.actor_label ? <span>{item.actor_label}</span> : null}
                    {item.goal_title ? (
                        <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">Goal: {item.goal_title}</span>
                        </>
                    ) : null}
                    {item.outcome ? (
                        <>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">Outcome: {item.outcome}</span>
                        </>
                    ) : null}
                </div>
            </div>
        </Link>
    )
}

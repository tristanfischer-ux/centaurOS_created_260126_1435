/**
 * @file page.tsx — Single history entry drill-in (Phase 3 Plan redesign).
 *
 * @description Server component. Flag-gated. Loads a single history_entries
 * row, hydrates the actor (profile / fractional / specialist), resolves any
 * linked objective / task / pressure-test references from `related_ids_json`
 * best-effort, and renders the detail layout.
 *
 * Reference: PLAN-SCHEMA §9 (shape) + §17.5 (5-min edit-lock, server-side).
 * Mockup inferred from PLAN-MOCKUP-HISTORY-ENTRY.html sketch +
 * HistoryEmptyState for empty-state copy.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Quote } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"
import { getCurrentUserFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_PLAN_EXPERIENCE } from "@/lib/features/keys"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { HistoryEntryRow, HistoryEntryType } from "@/types/plan"

import { HistoryEntryView } from "./history-entry-view"

export const metadata: Metadata = {
    title: "Decision · History",
    description: "A single entry from your auto-populated decision log.",
}

type PageProps = { params: Promise<{ id: string }> }

const UUID_REGEX = /^[0-9a-f-]{36}$/i

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
    manual: { label: "Manual note", classes: "bg-muted text-foreground" },
}

export default async function HistoryEntryPage({
    params,
}: PageProps): Promise<React.ReactNode> {
    const { id } = await params
    const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_PLAN_EXPERIENCE)
    if (!enabled) {
        if (UUID_REGEX.test(id)) redirect(`/knowledge/${id}`)
        redirect("/knowledge")
    }

    if (!UUID_REGEX.test(id)) {
        return <NotFound />
    }

    const foundryId = await getFoundryIdCached().catch(() => null)
    if (!foundryId) return <NotFound />

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySb = supabase as any

    const { data: entry } = await anySb
        .from("history_entries")
        .select("*")
        .eq("id", id)
        .eq("foundry_id", foundryId)
        .maybeSingle<HistoryEntryRow>()

    if (!entry) return <NotFound />

    // ── resolve actor label ────────────────────────────────────────────────
    const actor = await resolveActor(supabase, entry)

    // ── resolve goal title ─────────────────────────────────────────────────
    let goalTitle: string | null = null
    if (entry.goal_id) {
        const { data: goal } = await anySb
            .from("strategic_goals")
            .select("title")
            .eq("id", entry.goal_id)
            .maybeSingle()
        goalTitle = (goal as { title?: string } | null)?.title ?? null
    }

    // ── resolve related refs (best-effort) ─────────────────────────────────
    const related = entry.related_ids_json ?? null
    const [objectives, tasks, pressureTest] = await Promise.all([
        related?.objective_ids?.length
            ? supabase
                  .from("objectives")
                  .select("id, title")
                  .in("id", related.objective_ids)
            : Promise.resolve({ data: null as Array<{ id: string; title: string }> | null }),
        related?.task_ids?.length
            ? supabase
                  .from("tasks")
                  .select("id, title")
                  .in("id", related.task_ids)
            : Promise.resolve({ data: null as Array<{ id: string; title: string }> | null }),
        related?.pressure_test_id
            ? anySb
                  .from("pressure_test_sessions")
                  .select("id, verdict")
                  .eq("id", related.pressure_test_id)
                  .maybeSingle()
            : Promise.resolve({ data: null }),
    ])

    const chip = ENTRY_TYPE_CHIP[entry.entry_type]

    return (
        <div className="mx-auto max-w-3xl p-6 sm:p-8">
            <div className="mb-4">
                <Button asChild variant="ghost" size="sm">
                    <Link href="/plan/history">
                        <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to History
                    </Link>
                </Button>
            </div>

            {/* Header */}
            <header className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip.classes}`}
                    >
                        {chip.label}
                    </span>
                    {goalTitle && entry.goal_id ? (
                        <Link
                            href={`/plan/goal/${entry.goal_id}`}
                            className="text-xs text-muted-foreground hover:text-international-orange hover:underline"
                        >
                            Goal: {goalTitle}
                        </Link>
                    ) : null}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {entry.title}
                </h1>
                <p className="text-xs text-muted-foreground">
                    <time dateTime={entry.created_at}>
                        {new Date(entry.created_at).toLocaleString(undefined, {
                            dateStyle: "full",
                            timeStyle: "short",
                        })}
                    </time>
                    {actor ? ` · ${actor}` : null}
                </p>
            </header>

            {/* Interactive body / outcome / edit log — client component */}
            <div className="mt-6">
                <HistoryEntryView entry={entry} />
            </div>

            {/* Participants (static cards) */}
            {actor ? (
                <section className="mt-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        Participants
                    </h2>
                    <Card className="mt-2">
                        <CardContent className="p-4 text-sm">{actor}</CardContent>
                    </Card>
                </section>
            ) : null}

            {/* Alternatives considered */}
            {entry.alternatives_json && entry.alternatives_json.length > 0 ? (
                <section className="mt-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        Alternatives considered
                    </h2>
                    <Card className="mt-2">
                        <CardContent className="divide-y divide-border p-0">
                            {entry.alternatives_json.map((alt, i) => (
                                <div key={i} className="p-4">
                                    <p className="text-sm font-medium text-foreground">
                                        {alt.name}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Why rejected: {alt.why_rejected}
                                    </p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </section>
            ) : null}

            {/* Grounding */}
            {entry.grounding_text ? (
                <section className="mt-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        Grounding
                    </h2>
                    <Card className="mt-2 border-l-4 border-l-international-orange">
                        <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
                            <Quote aria-hidden="true" className="h-4 w-4 shrink-0" />
                            <p>{entry.grounding_text}</p>
                        </CardContent>
                    </Card>
                </section>
            ) : null}

            {/* Linked objectives / tasks / pressure-test */}
            {(objectives.data?.length ?? 0) > 0 ||
            (tasks.data?.length ?? 0) > 0 ||
            pressureTest.data ? (
                <section className="mt-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        Linked
                    </h2>
                    <Card className="mt-2">
                        <CardContent className="space-y-2 p-4 text-sm">
                            {(objectives.data ?? []).map((o) => (
                                <div key={o.id}>
                                    <span className="text-xs uppercase text-muted-foreground">
                                        Objective
                                    </span>{" "}
                                    <span className="text-foreground">{o.title}</span>
                                </div>
                            ))}
                            {(tasks.data ?? []).map((t) => (
                                <div key={t.id}>
                                    <Link
                                        href={`/plan/task/${t.id}`}
                                        className="text-foreground hover:text-international-orange hover:underline"
                                    >
                                        <span className="text-xs uppercase text-muted-foreground">
                                            Task
                                        </span>{" "}
                                        {t.title}
                                    </Link>
                                </div>
                            ))}
                            {pressureTest.data ? (
                                <div>
                                    <span className="text-xs uppercase text-muted-foreground">
                                        Pressure-test
                                    </span>{" "}
                                    <span className="text-foreground capitalize">
                                        Verdict:{" "}
                                        {(pressureTest.data as { verdict?: string }).verdict ??
                                            "inconclusive"}
                                    </span>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </section>
            ) : null}
        </div>
    )
}

function NotFound() {
    return (
        <div className="mx-auto max-w-2xl p-8">
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Entry not found
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    This history entry was removed, or you don&rsquo;t have access to it.
                </p>
                <div className="mt-4">
                    <Button asChild variant="outline">
                        <Link href="/plan/history">
                            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to History
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}

async function resolveActor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    entry: HistoryEntryRow,
): Promise<string | null> {
    if (entry.actor_type === "system") return "System"
    if (!entry.actor_id) return null
    if (entry.actor_type === "specialist") {
        const { data } = await supabase
            .from("specialist_profiles")
            .select("display_name, title")
            .eq("specialist_key", entry.actor_id)
            .maybeSingle()
        const d = data as { display_name?: string; title?: string } | null
        if (!d) return entry.actor_id
        return d.title ? `${d.display_name} · ${d.title}` : d.display_name ?? entry.actor_id
    }
    if (entry.actor_type === "fractional") {
        const { data } = await supabase
            .from("fractional_executives")
            .select("display_name, specialisation")
            .eq("id", entry.actor_id)
            .maybeSingle()
        const d = data as { display_name?: string; specialisation?: string } | null
        if (!d) return null
        return d.specialisation
            ? `${d.display_name} · ${d.specialisation}`
            : d.display_name ?? null
    }
    // founder → profile lookup
    if (UUID_REGEX.test(entry.actor_id)) {
        const { data } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", entry.actor_id)
            .maybeSingle()
        return (data as { full_name?: string } | null)?.full_name ?? null
    }
    return null
}
